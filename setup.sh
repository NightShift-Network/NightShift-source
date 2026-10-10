#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
readonly ENV_FILE="$SCRIPT_DIR/.nightshift.env"
readonly NGINX_SITE="/etc/nginx/sites-available/nightshift-app"
readonly NGINX_LINK="/etc/nginx/sites-enabled/nightshift-app"
readonly SETUP_STATE="/etc/nightshift-setup"
readonly BACKUP_DIR="/var/backups/nightshift-setup"
readonly RELOAD_HOOK="/etc/letsencrypt/renewal-hooks/deploy/50-nightshift-nginx-reload"
readonly RENEW_CRON="/etc/cron.d/nightshift-certbot-renew"

MODE="setup"
DOMAIN=""
EMAIL=""
PORT_ARG=""
YES="no"

usage() {
  cat <<'HELP'
NightShift VPS setup

Usage:
  sudo ./setup.sh --domain HOSTNAME --email EMAIL [--port PORT] [--yes]
  sudo ./setup.sh --update
  sudo ./setup.sh --start|--stop|--restart|--logs
  sudo ./setup.sh --remove

Setup installs Docker/Compose, Nginx, and Certbot when needed; builds the
NightShift image; binds it to 127.0.0.1 on the selected host port (default
3005); configures Nginx and HTTPS; and enables certificate renewal.

Options:
  --domain HOSTNAME  Public DNS name pointing to this VPS
  --email EMAIL      Contact email for a new Let's Encrypt certificate
  --port PORT        Loopback host port for NightShift (default 3005)
  --yes              Accept safe replacement of this NightShift container or
                     the default Nginx site when it owns the requested host
  --update           Rebuild the image and recreate the running container
  --start            Start the container
  --stop             Stop the container
  --restart          Restart the container
  --logs             Follow container logs
  --remove           Remove the container and NightShift Nginx site; keep cert
  --help             Show this help

Run setup from a clone of this repository. The hostname must resolve to the
VPS and public TCP ports 80 and 443 must be reachable for certificate setup.
HELP
}

while (($#)); do
  case "$1" in
    --domain) [[ $# -ge 2 ]] || { echo "--domain needs a value" >&2; exit 2; }; DOMAIN="$2"; shift 2 ;;
    --email) [[ $# -ge 2 ]] || { echo "--email needs a value" >&2; exit 2; }; EMAIL="$2"; shift 2 ;;
    --port) [[ $# -ge 2 ]] || { echo "--port needs a value" >&2; exit 2; }; PORT_ARG="$2"; shift 2 ;;
    --yes) YES="yes"; shift ;;
    --update) MODE="update"; shift ;;
    --start) MODE="start"; shift ;;
    --stop) MODE="stop"; shift ;;
    --restart) MODE="restart"; shift ;;
    --logs) MODE="logs"; shift ;;
    --remove) MODE="remove"; shift ;;
    --help|-h) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [[ $EUID -ne 0 ]]; then
  echo "Run this script with sudo/root so it can configure Docker, Nginx, and Certbot." >&2
  exit 1
fi

if [[ ! -f "$SCRIPT_DIR/compose.yaml" || ! -f "$SCRIPT_DIR/Dockerfile" ]]; then
  echo "Run setup.sh from the NightShift repository; Dockerfile or compose.yaml is missing." >&2
  exit 1
fi

cd "$SCRIPT_DIR"

read_saved_port() {
  if [[ -f $ENV_FILE ]]; then
    sed -n 's/^NIGHTSHIFT_PORT=//p' "$ENV_FILE" | tail -n 1
  fi
}

PORT="${PORT_ARG:-$(read_saved_port)}"
PORT="${PORT:-3005}"

if [[ ! $PORT =~ ^[0-9]+$ ]] || ((10#$PORT < 1024 || 10#$PORT > 65535)); then
  echo "Port must be a number from 1024 through 65535." >&2
  exit 2
fi
PORT=$((10#$PORT))

COMPOSE=(docker compose --project-name nightshift --env-file "$ENV_FILE" -f "$SCRIPT_DIR/compose.yaml")

case "$MODE" in
  update)
    command -v docker >/dev/null || { echo "Docker is not installed; run setup first." >&2; exit 1; }
    [[ -f $ENV_FILE ]] || { printf 'NIGHTSHIFT_PORT=%s\n' "$PORT" > "$ENV_FILE"; chmod 600 "$ENV_FILE"; }
    "${COMPOSE[@]}" up -d --build
    exit 0
    ;;
  start)
    command -v docker >/dev/null || { echo "Docker is not installed; run setup first." >&2; exit 1; }
    "${COMPOSE[@]}" start nightshift
    exit 0
    ;;
  stop)
    command -v docker >/dev/null || { echo "Docker is not installed; run setup first." >&2; exit 1; }
    "${COMPOSE[@]}" stop nightshift
    exit 0
    ;;
  restart)
    command -v docker >/dev/null || { echo "Docker is not installed; run setup first." >&2; exit 1; }
    "${COMPOSE[@]}" restart nightshift
    exit 0
    ;;
  logs)
    command -v docker >/dev/null || { echo "Docker is not installed; run setup first." >&2; exit 1; }
    "${COMPOSE[@]}" logs --tail=100 -f nightshift
    exit 0
    ;;
  remove)
    command -v docker >/dev/null && "${COMPOSE[@]}" down || true
    rm -f "$NGINX_LINK" "$NGINX_SITE"
    rm -f "$RELOAD_HOOK"
    rm -f "$RENEW_CRON"
    if [[ -f "$SETUP_STATE/default-link-target" && ! -e /etc/nginx/sites-enabled/default ]]; then
      mkdir -p /etc/nginx/sites-enabled
      ln -s "$(cat "$SETUP_STATE/default-link-target")" /etc/nginx/sites-enabled/default
      rm -f "$SETUP_STATE/default-link-target"
    fi
    if command -v nginx >/dev/null; then
      nginx -t
      systemctl reload nginx
    fi
    echo "NightShift container and Nginx site removed. The certificate, repository, and Docker image were kept."
    exit 0
    ;;
esac

if [[ ! $DOMAIN =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ || $DOMAIN != *.* || $DOMAIN == *..* ]]; then
  echo "Supply a valid DNS hostname with --domain (no scheme, path, or port)." >&2
  exit 2
fi
if [[ ! $EMAIL =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]; then
  echo "Supply a valid contact email with --email." >&2
  exit 2
fi

confirm() {
  local prompt="$1" answer=""
  if [[ $YES == yes ]]; then return 0; fi
  if [[ ! -r /dev/tty ]]; then
    echo "$prompt (rerun with --yes to accept)" >&2
    return 1
  fi
  read -r -p "$prompt [y/N] " answer </dev/tty
  [[ $answer == y || $answer == Y || $answer == yes || $answer == YES ]]
}

if ! command -v apt-get >/dev/null || ! grep -qE '^ID=(ubuntu|debian)$' /etc/os-release; then
  echo "Automatic package installation currently supports Debian and Ubuntu." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl nginx certbot python3-certbot-nginx openssl
if ! command -v docker >/dev/null 2>&1; then
  apt-get install -y docker.io docker-compose-v2
elif ! docker compose version >/dev/null 2>&1; then
  apt-get install -y docker-compose-v2
fi

systemctl enable --now docker nginx
docker compose version >/dev/null

mkdir -p "$SETUP_STATE" "$BACKUP_DIR"

tmp_env="$(mktemp)"
if [[ -f $ENV_FILE ]]; then
  awk '!/^NIGHTSHIFT_PORT=/' "$ENV_FILE" > "$tmp_env"
fi
printf 'NIGHTSHIFT_PORT=%s\n' "$PORT" >> "$tmp_env"
install -m 600 "$tmp_env" "$ENV_FILE"
rm -f "$tmp_env"

# A previous manual setup may have put this hostname in Ubuntu's default site.
# Preserve a backup and disable only that file when it contains no other named
# virtual hosts. Other conflicting site files are left untouched and reported.
for active_site in /etc/nginx/sites-enabled/*; do
  [[ -e $active_site ]] || continue
  [[ $active_site == "$NGINX_LINK" ]] && continue
  if ! awk -v host="$DOMAIN" '
    /^[[:space:]]*#/ { next }
    /^[[:space:]]*server_name[[:space:]]/ {
      sub(/;.*/, "")
      for (i = 2; i <= NF; i++) if ($i == host) found = 1
    }
    END { exit !found }
  ' "$active_site"; then
    continue
  fi

  if [[ $active_site == /etc/nginx/sites-enabled/default ]]; then
    if [[ ! -L $active_site ]]; then
      echo "The default Nginx site is not a symlink; refusing to disable it automatically." >&2
      exit 1
    fi
    if ! awk -v host="$DOMAIN" '
      /^[[:space:]]*#/ { next }
      /^[[:space:]]*server_name[[:space:]]/ {
        sub(/;.*/, "")
        for (i = 2; i <= NF; i++) if ($i != host && $i != "_") other = 1
      }
      END { exit other }
    ' "$active_site"; then
      echo "The default site also contains named hosts besides $DOMAIN; refusing to disable it." >&2
      exit 1
    fi
    if ! confirm "The default Nginx site owns $DOMAIN. Back it up and disable its symlink?"; then
      echo "Resolve the conflicting virtual host, then rerun setup." >&2
      exit 1
    fi
    default_target="$(readlink "$active_site" || printf '%s' "$active_site")"
    if [[ ! -f "$SETUP_STATE/default-link-target" ]]; then
      printf '%s\n' "$default_target" > "$SETUP_STATE/default-link-target"
      cp -L "$active_site" "$BACKUP_DIR/default-$(date -u +%Y%m%dT%H%M%SZ).conf"
    fi
    rm -f "$active_site"
  else
    echo "Another enabled Nginx site ($active_site) already names $DOMAIN. Disable or edit it, then rerun setup." >&2
    exit 1
  fi
done

if docker container inspect nightshift >/dev/null 2>&1; then
  existing_project="$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' nightshift 2>/dev/null || true)"
  existing_source="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/app"}}{{.Source}}{{end}}{{end}}' nightshift 2>/dev/null || true)"
  if [[ $existing_project != nightshift ]]; then
    if [[ $existing_source == "$SCRIPT_DIR" ]]; then
      echo "Replacing the existing manually started NightShift container for this checkout."
    elif ! confirm "Replace the existing container named nightshift from $existing_source?"; then
      echo "Stopped before changing the existing container." >&2
      exit 1
    fi
    docker rm -f nightshift
  fi
fi

if ss -ltnH "sport = :$PORT" 2>/dev/null | grep -q .; then
  if ! docker container inspect nightshift >/dev/null 2>&1; then
    echo "Port $PORT is already in use. Choose another with --port." >&2
    exit 1
  fi
fi

"${COMPOSE[@]}" up -d --build
curl --fail --silent --show-error --retry 12 --retry-connrefused --retry-delay 2 \
  "http://127.0.0.1:$PORT/" -o /dev/null

write_http_site() {
  local target="$1"
  cat > "$target" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location /wisp/ {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
    }

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
}

write_https_site() {
  local target="$1"
  cat > "$target" <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $DOMAIN;

    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location /wisp/ {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 3600s;
    }

    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
}

write_http_site "$NGINX_SITE"
ln -sfn "$NGINX_SITE" "$NGINX_LINK"
nginx -t
systemctl reload nginx

if ! getent ahostsv4 "$DOMAIN" >/dev/null; then
  echo "$DOMAIN does not currently resolve. Point its A record to this VPS, wait for DNS, and rerun setup." >&2
  exit 1
fi
if [[ ! -s "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" || ! -s "/etc/letsencrypt/live/$DOMAIN/privkey.pem" ]]; then
  certbot --nginx --non-interactive --agree-tos --email "$EMAIL" --redirect -d "$DOMAIN"
fi

openssl x509 -in "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" -noout -checkhost "$DOMAIN" >/dev/null
write_https_site "$NGINX_SITE"

install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
cat > "$RELOAD_HOOK" <<'HOOK'
#!/bin/sh
systemctl reload nginx
HOOK
chmod 755 "$RELOAD_HOOK"

nginx -t
systemctl reload nginx
certbot renew --cert-name "$DOMAIN" --quiet
if systemctl list-unit-files certbot.timer --no-legend 2>/dev/null | grep -q 'certbot.timer'; then
  systemctl enable --now certbot.timer
else
  apt-get install -y cron
  if ! grep -RqsE 'certbot.*renew' /etc/cron.d /etc/crontab 2>/dev/null; then
    cat > "$RENEW_CRON" <<'CRON'
17 3 * * * root certbot renew --quiet
CRON
    chmod 644 "$RENEW_CRON"
  fi
  systemctl enable --now cron
fi

echo "NightShift is installed at https://$DOMAIN"
echo "Container port: 127.0.0.1:$PORT (Nginx only)"
echo "Manage it with: sudo ./setup.sh --stop|--start|--restart|--logs|--update"
echo "Certificate renewal scheduler: certbot.timer (or the system cron fallback)"
