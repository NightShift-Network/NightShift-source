#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly REPO_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd)"
readonly LOCAL_ENV="$REPO_DIR/.env"
readonly SYSTEM_ENV="/etc/nightshift-vps.env"
readonly INSTALLED_SCRIPT="/usr/local/sbin/nightshift-vps-proxy"
readonly CRON_FILE="/etc/cron.d/nightshift-vps-proxy"

MODE="setup"
CRON_CHOICE="ask"
DELETE_CERTIFICATE="no"
for arg in "$@"; do
  case "$arg" in
    --refresh) MODE="refresh" ;;
    --remove) MODE="remove" ;;
    --delete-certificate) DELETE_CERTIFICATE="yes" ;;
    --cron) CRON_CHOICE="yes" ;;
    --no-cron) CRON_CHOICE="no" ;;
    --help)
      cat <<'HELP'
Usage: sudo ./scripts/setup-vps-proxy.sh [--cron|--no-cron]
       sudo /usr/local/sbin/nightshift-vps-proxy --refresh
       sudo /usr/local/sbin/nightshift-vps-proxy --remove [--delete-certificate]

Initial setup fetches FreeDNS dynamic A-record hosts from its API, lets you
select one, points it at this VPS, configures Nginx as an HTTPS reverse proxy,
and obtains a Let's Encrypt certificate. New FreeDNS hosts must be registered
in the FreeDNS web interface before running this script.

--cron      install a daily FreeDNS refresh and Certbot renewal job
--no-cron   use the Certbot systemd timer instead of cron
--refresh  refresh the selected FreeDNS A record and renew due certificates
--remove   remove this proxy's Nginx site, cron job, and saved credentials
--delete-certificate  with --remove, also delete its Let's Encrypt certificate
HELP
      exit 0
      ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

if [[ $DELETE_CERTIFICATE == yes && $MODE != remove ]]; then
  echo "--delete-certificate can only be used together with --remove." >&2
  exit 2
fi

if [[ $MODE == refresh ]]; then
  ENV_FILE="$SYSTEM_ENV"
elif [[ $MODE == remove && -r $SYSTEM_ENV ]]; then
  ENV_FILE="$SYSTEM_ENV"
else
  ENV_FILE="$LOCAL_ENV"
fi

if [[ ! -r $ENV_FILE ]]; then
  echo "Cannot read $ENV_FILE. Copy .env.example to .env and fill in the required values." >&2
  exit 1
fi

# The env file is an administrator-managed shell-style KEY=value file.
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

FREEDNS_API_SHA="${FREEDNS_API_SHA:-}"
FREEDNS_HOST="${FREEDNS_HOST:-}"
NIGHTSHIFT_UPSTREAM="${NIGHTSHIFT_UPSTREAM:-}"
ACME_EMAIL="${ACME_EMAIL:-}"
CRON_SCHEDULE="${CRON_SCHEDULE:-17 3 * * *}"

if [[ $EUID -ne 0 ]]; then
  echo "Run this script with sudo/root so it can configure Nginx and Certbot." >&2
  exit 1
fi

if [[ $MODE == remove ]]; then
  if [[ ! $FREEDNS_HOST =~ ^[A-Za-z0-9.-]+$ || $FREEDNS_HOST != *.* ]]; then
    echo "FREEDNS_HOST is missing or invalid in $ENV_FILE; cannot identify the certificate." >&2
    exit 1
  fi
  echo "This removes NightShift's Nginx site, cron job, installed refresh script, and saved credentials."
  if [[ $DELETE_CERTIFICATE == yes ]]; then
    echo "It will also delete the Let's Encrypt certificate for $FREEDNS_HOST."
  else
    echo "The Let's Encrypt certificate will be kept."
  fi
  read -r -p "Continue? [y/N] " remove_answer
  case "$remove_answer" in y|Y|yes|YES) ;; *) echo "Removal cancelled."; exit 0 ;; esac

  rm -f /etc/nginx/sites-enabled/nightshift-vps-proxy
  rm -f /etc/nginx/sites-available/nightshift-vps-proxy
  rm -f "$CRON_FILE" "$INSTALLED_SCRIPT" "$SYSTEM_ENV"
  if command -v nginx >/dev/null 2>&1; then
    nginx -t
    systemctl reload nginx
  fi
  if [[ $DELETE_CERTIFICATE == yes ]] && command -v certbot >/dev/null 2>&1; then
    certbot delete --cert-name "$FREEDNS_HOST"
  fi
  echo "NightShift VPS proxy configuration removed. The shared Nginx WebSocket map, DNS record, and (unless requested) TLS certificate were kept."
  exit 0
fi

if [[ -z $FREEDNS_API_SHA || -z $NIGHTSHIFT_UPSTREAM || -z $ACME_EMAIL ]]; then
  echo "Set FREEDNS_API_SHA, NIGHTSHIFT_UPSTREAM, and ACME_EMAIL in .env." >&2
  exit 1
fi

if [[ ! $NIGHTSHIFT_UPSTREAM =~ ^[A-Za-z0-9.-]+$ || $NIGHTSHIFT_UPSTREAM != *.* ]]; then
  echo "NIGHTSHIFT_UPSTREAM must be a hostname only, without scheme or path." >&2
  exit 1
fi

if [[ ! $CRON_SCHEDULE =~ ^[0-9*/,-]+[[:space:]]+[0-9*/,-]+[[:space:]]+[0-9*/,-]+[[:space:]]+[0-9*/,-]+[[:space:]]+[0-9*/,-]+$ ]]; then
  echo "CRON_SCHEDULE must contain five standard cron fields." >&2
  exit 1
fi

if [[ $MODE == refresh ]]; then
  if [[ ! $FREEDNS_HOST =~ ^[A-Za-z0-9.-]+$ || $FREEDNS_HOST != *.* ]]; then
    echo "FREEDNS_HOST is missing or invalid in $SYSTEM_ENV." >&2
    exit 1
  fi
else
  if ! command -v apt-get >/dev/null 2>&1; then
    echo "This installer currently supports Debian and Ubuntu VPS systems." >&2
    exit 1
  fi
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y curl nginx certbot python3-certbot-nginx dnsutils cron ca-certificates
fi

fetch_freedns_records() {
  curl --fail --silent --show-error --get \
    --data-urlencode "action=getdyndns" \
    --data-urlencode "v=2" \
    --data-urlencode "sha=$FREEDNS_API_SHA" \
    "https://freedns.afraid.org/api/"
}

RECORDS="$(fetch_freedns_records)" || {
  echo "Could not fetch FreeDNS records. Check FREEDNS_API_SHA." >&2
  exit 1
}

if [[ -z $FREEDNS_HOST ]]; then
  mapfile -t HOSTS < <(printf '%s\n' "$RECORDS" | awk -F '|' 'NF >= 3 && $1 ~ /^[A-Za-z0-9.-]+$/ {print $1}' | sort -u)
  if [[ ${#HOSTS[@]} -eq 0 ]]; then
    echo "The FreeDNS API returned no dynamic A-record hosts. Create an A record in FreeDNS first." >&2
    exit 1
  fi
  echo "Select an existing FreeDNS A-record hostname:"
  for index in "${!HOSTS[@]}"; do
    printf '  %d) %s\n' "$((index + 1))" "${HOSTS[$index]}"
  done
  read -r -p "Hostname number: " selection
  if [[ ! $selection =~ ^[0-9]+$ ]] || (( selection < 1 || selection > ${#HOSTS[@]} )); then
    echo "Invalid selection." >&2
    exit 1
  fi
  FREEDNS_HOST="${HOSTS[$((selection - 1))]}"
fi

if [[ ! $FREEDNS_HOST =~ ^[A-Za-z0-9.-]+$ || $FREEDNS_HOST != *.* ]]; then
  echo "FREEDNS_HOST must be a valid hostname." >&2
  exit 1
fi

UPDATE_URL="$(printf '%s\n' "$RECORDS" | awk -F '|' -v host="$FREEDNS_HOST" '$1 == host && NF >= 3 {print $3; exit}')"
if [[ -z $UPDATE_URL ]]; then
  echo "$FREEDNS_HOST was not found among the account's FreeDNS dynamic A records." >&2
  echo "Only an existing A record can be selected; masked URL-forward records are not supported." >&2
  exit 1
fi

VPS_IPV4="$(curl --fail --silent --show-error --proto '=https' https://api.ipify.org)"
if [[ ! $VPS_IPV4 =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
  echo "Could not detect the VPS public IPv4 address." >&2
  exit 1
fi

# FreeDNS returns an update URL for the selected record. Accept only its known
# update endpoint and force HTTPS before sending the account's record token.
case "$UPDATE_URL" in
  http://freedns.afraid.org/*) UPDATE_URL="https://${UPDATE_URL#http://}" ;;
  https://freedns.afraid.org/*) ;;
  *)
    echo "FreeDNS returned an unexpected update URL; refusing to send its token." >&2
    exit 1
    ;;
esac
if [[ $UPDATE_URL == *\?* ]]; then
  UPDATE_URL+="&address=$VPS_IPV4"
else
  UPDATE_URL+="?address=$VPS_IPV4"
fi
UPDATE_RESULT="$(curl --fail --silent --show-error --proto '=https' --max-time 30 "$UPDATE_URL")" || {
  echo "FreeDNS rejected the A-record update. Check the selected record and API access." >&2
  exit 1
}
printf 'FreeDNS update: %s\n' "$UPDATE_RESULT"

if [[ $MODE == refresh ]]; then
  certbot renew --quiet --deploy-hook "systemctl reload nginx"
  exit 0
fi

echo "Waiting for $FREEDNS_HOST to resolve to $VPS_IPV4..."
resolved=false
for _ in {1..30}; do
  if dig +short A "$FREEDNS_HOST" | grep -Fxq "$VPS_IPV4"; then
    resolved=true
    break
  fi
  sleep 10
done
if [[ $resolved != true ]]; then
  echo "DNS has not updated to the VPS IP yet. Wait for propagation and rerun." >&2
  exit 1
fi

if [[ ! -f /etc/nginx/conf.d/nightshift-websocket-map.conf ]]; then
  cat > /etc/nginx/conf.d/nightshift-websocket-map.conf <<'NGINX_MAP'
map $http_upgrade $nightshift_connection_upgrade {
    default upgrade;
    ''      close;
}
NGINX_MAP
fi

cat > /etc/nginx/sites-available/nightshift-vps-proxy <<NGINX_SITE
server {
    listen 80;
    listen [::]:80;
    server_name $FREEDNS_HOST;

    location /wisp/ {
        proxy_pass https://$NIGHTSHIFT_UPSTREAM;
        proxy_hide_header Cross-Origin-Embedder-Policy;
        proxy_http_version 1.1;
        proxy_set_header Host $NIGHTSHIFT_UPSTREAM;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$nightshift_connection_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_ssl_server_name on;
        proxy_ssl_name $NIGHTSHIFT_UPSTREAM;
        proxy_ssl_verify on;
        proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
        proxy_read_timeout 3600s;
    }

    location / {
        proxy_pass https://$NIGHTSHIFT_UPSTREAM;
        proxy_hide_header Cross-Origin-Embedder-Policy;
        proxy_set_header Host $NIGHTSHIFT_UPSTREAM;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_ssl_server_name on;
        proxy_ssl_name $NIGHTSHIFT_UPSTREAM;
        proxy_ssl_verify on;
        proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
    }
}
NGINX_SITE

ln -sfn /etc/nginx/sites-available/nightshift-vps-proxy /etc/nginx/sites-enabled/nightshift-vps-proxy
nginx -t
systemctl enable --now nginx
systemctl reload nginx

certbot --nginx --non-interactive --agree-tos --email "$ACME_EMAIL" --redirect -d "$FREEDNS_HOST"

if [[ $CRON_CHOICE == ask ]]; then
  read -r -p "Install a daily cron job to refresh FreeDNS and renew due certificates? [y/N] " cron_answer
  case "$cron_answer" in y|Y|yes|YES) CRON_CHOICE="yes" ;; *) CRON_CHOICE="no" ;; esac
fi

install -o root -g root -m 755 "$SCRIPT_DIR/setup-vps-proxy.sh" "$INSTALLED_SCRIPT"
tmp_env="$(mktemp)"
grep -v '^FREEDNS_HOST=' "$LOCAL_ENV" > "$tmp_env" || true
printf '\nFREEDNS_HOST=%s\n' "$FREEDNS_HOST" >> "$tmp_env"
install -o root -g root -m 600 "$tmp_env" "$SYSTEM_ENV"
rm -f "$tmp_env"

if [[ $CRON_CHOICE == yes ]]; then
  systemctl disable --now certbot.timer >/dev/null 2>&1 || true
  cat > "$CRON_FILE" <<CRON
$CRON_SCHEDULE root $INSTALLED_SCRIPT --refresh >> /var/log/nightshift-vps-proxy.log 2>&1
CRON
  chmod 644 "$CRON_FILE"
  systemctl enable --now cron
  echo "Installed cron schedule: $CRON_SCHEDULE"
else
  rm -f "$CRON_FILE"
  systemctl enable --now certbot.timer >/dev/null 2>&1 || true
  echo "Using Certbot's systemd renewal timer."
fi

echo "Setup complete: https://$FREEDNS_HOST"
echo "Nginx upstream: https://$NIGHTSHIFT_UPSTREAM"
