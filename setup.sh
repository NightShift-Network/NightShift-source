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
PLUGIN_URLS=()
DOMAINS=()
EMAIL=""
PORT_ARG=""
YES="no"
INTERACTIVE="no"
DELETE_CERTIFICATE="no"

add_domains() {
  local input="$1"
  input="${input//,/ }"
  local d
  for d in $input; do
    d="$(printf '%s' "$d" | tr -d '[:space:]')"
    [[ -z "$d" ]] && continue
    d="$(printf '%s' "$d" | tr '[:upper:]' '[:lower:]')"
    local exists=false
    local existing
    for existing in "${DOMAINS[@]}"; do
      if [[ "$existing" == "$d" ]]; then
        exists=true
        break
      fi
    done
    if [[ $exists == false ]]; then
      DOMAINS+=("$d")
    fi
  done
}

validate_domain() {
  local d="$1"
  if [[ -z "$d" ]]; then return 1; fi
  if [[ ! $d =~ ^[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?$ || $d != *.* || $d == *..* ]]; then
    return 1
  fi
  local IFS='.'
  local labels=($d)
  local label
  for label in "${labels[@]}"; do
    if [[ -z "$label" || ${#label} -gt 63 ]]; then return 1; fi
    if [[ $label =~ ^- || $label =~ -$ ]]; then return 1; fi
  done
  return 0
}

validate_email() {
  local e="$1"
  [[ $e =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]]
}

validate_port() {
  local p="$1"
  [[ $p =~ ^[0-9]+$ ]] && (( 10#$p >= 1024 && 10#$p <= 65535 ))
}

usage() {
  cat <<'HELP'
NightShift VPS setup

Usage:
  sudo ./setup.sh [--interactive|-i]
  sudo ./setup.sh --domain HOSTNAME [HOSTNAME...] --email EMAIL [--port PORT] [--yes]
  sudo ./setup.sh --update
  sudo ./setup.sh --plugins
  sudo ./setup.sh --plugin-url https://github.com/example/nightshift-plugin-store.git
  sudo ./setup.sh --remove-plugin [STORE_NAME]
  sudo ./setup.sh --start|--stop|--restart|--logs
  sudo ./setup.sh --remove [--delete-certificate]
  sudo ./setup.sh --remove-nginx [--delete-certificate]
  sudo ./setup.sh --delete-certificate [--domain HOSTNAME]

Setup installs Docker/Compose, Nginx, and Certbot when needed; builds the
NightShift image; binds it to 127.0.0.1 on the selected host port (default
3005); configures Nginx and HTTPS; and enables certificate renewal.

Options:
  -i, --interactive       Run interactive setup wizard
  --domain HOSTNAME...    Public DNS name(s) pointing to this VPS (space-, comma-, or repeat-separated)
  --domains HOSTNAMES     Alias for --domain
  --email EMAIL           Contact email for a new Let's Encrypt certificate
  --port PORT             Loopback host port for NightShift (default 3005)
  --yes                   Accept safe replacements and skip confirmation prompts
  --update                Fast-forward pull the checkout, then rebuild and recreate the container
  --plugins               Prompt for plugin store URLs, then update installed stores
  --plugin-url URL        Add a plugin store Git URL and install it (repeatable)
  --remove-plugin [NAME]  Remove one installed plugin store (prompts when NAME is omitted)
  --start                 Start the container
  --stop                  Stop the container
  --restart               Restart the container
  --logs                  Follow container logs
  --remove                Remove the container and NightShift Nginx site
  --delete-certificate    Delete the Let's Encrypt SSL certificate for the domain
  --remove-cert           Alias for --delete-certificate
  --remove-ssl            Alias for --delete-certificate
  --remove-nginx          Remove only the NightShift Nginx site configuration
  --help, -h              Show this help

Run setup from a clone of this repository. The hostname(s) must resolve to the
VPS and public TCP ports 80 and 443 must be reachable for certificate setup.
HELP
}

while (($#)); do
  case "$1" in
    -i|--interactive) INTERACTIVE="yes"; shift ;;
    --domain|--domains)
      domain_flag="$1"
      shift
      domain_count=0
      while (($#)) && [[ $1 != --* ]]; do
        add_domains "$1"
        domain_count=$((domain_count + 1))
        shift
      done
      ((domain_count > 0)) || { echo "$domain_flag needs at least one hostname" >&2; exit 2; }
      ;;
    --email) [[ $# -ge 2 ]] || { echo "--email needs a value" >&2; exit 2; }; EMAIL="$2"; shift 2 ;;
    --port) [[ $# -ge 2 ]] || { echo "--port needs a value" >&2; exit 2; }; PORT_ARG="$2"; shift 2 ;;
    --yes) YES="yes"; shift ;;
    --update) MODE="update"; shift ;;
    --plugins) MODE="plugins"; shift ;;
    --plugin-url|--pluin-url)
      [[ $# -ge 2 && -n $2 ]] || { echo "--plugin-url needs a Git URL" >&2; exit 2; }
      PLUGIN_URLS+=("$2")
      MODE="plugins"
      shift 2
      ;;
    --remove-plugin)
      MODE="remove_plugin"
      shift
      if (($#)) && [[ $1 != --* ]]; then
        REMOVE_PLUGIN_NAME="$1"
        shift
      fi
      ;;
    --start) MODE="start"; shift ;;
    --stop) MODE="stop"; shift ;;
    --restart) MODE="restart"; shift ;;
    --logs) MODE="logs"; shift ;;
    --remove) MODE="remove"; shift ;;
    --remove-nginx)
      if [[ $MODE != remove ]]; then
        MODE="remove_nginx"
      fi
      shift
      ;;
    --delete-certificate|--delete-cert|--remove-cert|--remove-ssl)
      DELETE_CERTIFICATE="yes"
      if [[ $MODE != remove && $MODE != remove_nginx ]]; then
        MODE="delete_cert"
      fi
      shift
      ;;
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

confirm_disable_unresolved_site() {
  local site="$1" upstream="$2" answer=""
  echo "Nginx cannot resolve upstream '$upstream' in $site." >&2
  echo "Disabling this site's enabled symlink will stop that virtual host from serving." >&2
  if [[ ! -r /dev/tty ]]; then
    echo "No interactive terminal is available. Fix the upstream DNS/configuration or rerun interactively to choose whether to disable it." >&2
    return 1
  fi
  read -r -p "Disable this Nginx site so setup can continue? [y/N] " answer </dev/tty
  [[ $answer == y || $answer == Y || $answer == yes || $answer == YES ]]
}

nginx_test_with_upstream_prompt() {
  local output pattern failed_site upstream line link_target
  pattern='host not found in upstream "([^"]+)" in ([^:]+):([0-9]+)'

  while true; do
    if output="$(nginx -t 2>&1)"; then
      printf '%s\n' "$output"
      return 0
    fi

    printf '%s\n' "$output" >&2
    if [[ ! $output =~ $pattern ]]; then
      return 1
    fi
    upstream="${BASH_REMATCH[1]}"
    failed_site="${BASH_REMATCH[2]}"
    line="${BASH_REMATCH[3]}"

    if [[ $failed_site != /etc/nginx/sites-enabled/* || ! -L $failed_site || $failed_site == "$NGINX_LINK" ]]; then
      echo "Cannot safely disable the reported Nginx config automatically. Fix the upstream or config at $failed_site:$line, then rerun setup." >&2
      return 1
    fi
    if ! confirm_disable_unresolved_site "$failed_site:$line" "$upstream"; then
      echo "Kept $failed_site enabled. Fix its upstream DNS/configuration, then rerun setup." >&2
      return 1
    fi

    link_target="$(readlink -f -- "$failed_site" || readlink -- "$failed_site")"
    unlink -- "$failed_site"
    echo "Disabled $failed_site; its configuration remains at $link_target." >&2
    echo "Restore it with: sudo ln -s '$link_target' '$failed_site'" >&2
  done
}

read_saved_port() {
  if [[ -f $ENV_FILE ]]; then
    sed -n 's/^NIGHTSHIFT_PORT=//p' "$ENV_FILE" | tail -n 1
  fi
}

read_saved_email() {
  if [[ -n "${EMAIL:-}" ]]; then
    printf '%s\n' "$EMAIL"
    return 0
  fi
  if [[ -f $ENV_FILE ]]; then
    local e
    e="$(sed -n 's/^NIGHTSHIFT_EMAIL=//p' "$ENV_FILE" | tail -n 1)"
    if [[ -n $e ]]; then
      printf '%s\n' "$e"
      return 0
    fi
  fi
  if [[ -f "$SETUP_STATE/email" ]]; then
    local e
    e="$(cat "$SETUP_STATE/email" 2>/dev/null || true)"
    if [[ -n $e ]]; then
      printf '%s\n' "$e"
      return 0
    fi
  fi
  local renewal_conf
  for renewal_conf in /etc/letsencrypt/renewal/*.conf; do
    if [[ -f "$renewal_conf" ]]; then
      local e
      e="$(sed -n 's/^[[:space:]]*email[[:space:]]*=[[:space:]]*//p' "$renewal_conf" | head -n 1)"
      if [[ -n $e ]]; then
        printf '%s\n' "$e"
        return 0
      fi
    fi
  done
  return 1
}

read_saved_domains() {
  local found=()
  add_unique() {
    local item="$1"
    item="$(printf '%s' "$item" | tr '[:upper:]' '[:lower:]')"
    local ex
    for ex in "${found[@]}"; do
      if [[ "$ex" == "$item" ]]; then return 0; fi
    done
    found+=("$item")
  }

  if [[ -f $ENV_FILE ]]; then
    local raw_domains
    raw_domains="$(sed -n 's/^NIGHTSHIFT_DOMAINS=//p' "$ENV_FILE" | tail -n 1 | tr -d '"'"'" || true)"
    if [[ -z $raw_domains ]]; then
      raw_domains="$(sed -n 's/^NIGHTSHIFT_DOMAIN=//p' "$ENV_FILE" | tail -n 1 || true)"
    fi
    if [[ -n $raw_domains ]]; then
      raw_domains="${raw_domains//,/ }"
      local d
      for d in $raw_domains; do
        d="$(printf '%s' "$d" | tr -d '[:space:]')"
        [[ -n $d ]] && add_unique "$d"
      done
    fi
  fi

  if [[ ${#found[@]} -eq 0 && -f "$SETUP_STATE/domains" ]]; then
    local line
    while IFS= read -r line || [[ -n "$line" ]]; do
      line="${line//,/ }"
      local d
      for d in $line; do
        d="$(printf '%s' "$d" | tr -d '[:space:]')"
        [[ -n $d ]] && add_unique "$d"
      done
    done < "$SETUP_STATE/domains"
  fi

  if [[ ${#found[@]} -eq 0 && -f "$SETUP_STATE/domain" ]]; then
    local d
    d="$(cat "$SETUP_STATE/domain" 2>/dev/null || true)"
    d="$(printf '%s' "$d" | tr -d '[:space:]')"
    [[ -n $d ]] && add_unique "$d"
  fi

  if [[ ${#found[@]} -eq 0 && -f "$NGINX_SITE" ]]; then
    local d
    while read -r d; do
      [[ -n $d ]] && add_unique "$d"
    done < <(awk '/^[[:space:]]*server_name[[:space:]]/ {
      sub(/;.*/, "")
      for (i=2; i<=NF; i++) {
        if ($i != "_" && $i ~ /\./) print $i
      }
    }' "$NGINX_SITE")
  fi

  if [[ ${#found[@]} -gt 0 ]]; then
    printf '%s\n' "${found[@]}"
    return 0
  fi
  return 1
}

read_saved_domain() {
  if [[ ${#DOMAINS[@]} -gt 0 ]]; then
    printf '%s\n' "${DOMAINS[0]}"
    return 0
  fi
  if [[ -f "$NGINX_SITE" ]]; then
    local d
    d="$(sed -n 's|.*ssl_certificate /etc/letsencrypt/live/\([^/]*\)/fullchain\.pem;.*|\1|p' "$NGINX_SITE" | head -n 1)"
    if [[ -n $d ]]; then
      printf '%s\n' "$d"
      return 0
    fi
  fi
  local first_d
  first_d="$(read_saved_domains 2>/dev/null | head -n 1 || true)"
  if [[ -n "$first_d" ]]; then
    printf '%s\n' "$first_d"
    return 0
  fi
  return 1
}

read_saved_cert_name() {
  if [[ -f "$NGINX_SITE" ]]; then
    local d
    d="$(sed -n 's|.*ssl_certificate /etc/letsencrypt/live/\([^/]*\)/fullchain\.pem;.*|\1|p' "$NGINX_SITE" | head -n 1)"
    if [[ -n $d ]]; then
      printf '%s\n' "$d"
      return 0
    fi
  fi
  read_saved_domain
}

remove_nginx_config() {
  echo "Removing NightShift Nginx site and renewal hooks..."
  rm -f "$NGINX_LINK" "$NGINX_SITE"
  rm -f "$RELOAD_HOOK"
  rm -f "$RENEW_CRON"
  if [[ -f "$SETUP_STATE/default-link-target" && ! -e /etc/nginx/sites-enabled/default ]]; then
    mkdir -p /etc/nginx/sites-enabled
    ln -s "$(cat "$SETUP_STATE/default-link-target")" /etc/nginx/sites-enabled/default
    rm -f "$SETUP_STATE/default-link-target"
    echo "Restored previous default Nginx site."
  fi
  if command -v nginx >/dev/null 2>&1; then
    if nginx_test_with_upstream_prompt >/dev/null; then
      systemctl reload nginx
      echo "Nginx reloaded successfully."
    else
      echo "Warning: nginx -t failed after removing site configuration; check /etc/nginx." >&2
    fi
  fi
}

remove_ssl_certificate() {
  local target_domain="$1"
  if [[ -z "$target_domain" ]]; then
    echo "No domain specified for certificate removal." >&2
    return 1
  fi

  if ! command -v certbot >/dev/null 2>&1; then
    echo "Certbot is not installed; cannot remove certificate." >&2
    return 1
  fi

  echo "Removing Let's Encrypt certificate for $target_domain..."
  if certbot delete --cert-name "$target_domain" --non-interactive 2>/dev/null; then
    echo "Certificate for $target_domain removed successfully."
  elif [[ -d "/etc/letsencrypt/live/$target_domain" ]]; then
    rm -rf "/etc/letsencrypt/live/$target_domain" \
           "/etc/letsencrypt/archive/$target_domain" \
           "/etc/letsencrypt/renewal/$target_domain.conf"
    echo "Removed certificate files for $target_domain from /etc/letsencrypt."
  else
    echo "No active Let's Encrypt certificate found for $target_domain."
  fi
}

interactive_setup() {
  if [[ $INTERACTIVE != yes && ${#DOMAINS[@]} -eq 0 && -z $EMAIL && $YES != yes ]]; then
    if docker container inspect nightshift >/dev/null 2>&1 || [[ -f "$NGINX_SITE" || -f "$ENV_FILE" ]]; then
      echo "=================================================="
      echo "        NightShift VPS Setup & Management"
      echo "=================================================="
      local saved_str
      saved_str="$(read_saved_domains 2>/dev/null | paste -sd, - | sed 's/,/, /g' || true)"
      if [[ -n $saved_str ]]; then
        echo "Configured domain(s): $saved_str"
      fi
      echo ""
      echo "NightShift is already installed. Select an action:"
      echo "  1) Reconfigure / update domain(s) and SSL"
      echo "  2) Update NightShift container (git pull & rebuild)"
      echo "  3) Start container"
      echo "  4) Stop container"
      echo "  5) Restart container"
      echo "  6) Follow container logs"
      echo "  7) Remove NightShift site & container"
      echo "  8) Exit"
      echo ""
      local choice=""
      read -r -p "Select an option [1]: " choice </dev/tty || exit 0
      choice="${choice:-1}"
      case "$choice" in
        1) ;;
        2) MODE="update"; return 0 ;;
        3) MODE="start"; return 0 ;;
        4) MODE="stop"; return 0 ;;
        5) MODE="restart"; return 0 ;;
        6) MODE="logs"; return 0 ;;
        7) MODE="remove"; return 0 ;;
        8|q|Q) echo "Exiting."; exit 0 ;;
        *) echo "Invalid selection." >&2; exit 1 ;;
      esac
    fi
  fi

  echo "=================================================="
  echo "          NightShift Interactive Setup"
  echo "=================================================="
  echo ""

  if [[ ${#DOMAINS[@]} -eq 0 || $INTERACTIVE == yes ]]; then
    local default_domains=""
    if [[ ${#DOMAINS[@]} -gt 0 ]]; then
      default_domains="${DOMAINS[*]}"
    else
      local saved_list=()
      mapfile -t saved_list < <(read_saved_domains 2>/dev/null || true)
      if [[ ${#saved_list[@]} -gt 0 ]]; then
        default_domains="${saved_list[*]}"
      fi
    fi

    while true; do
      echo "Enter public domain name(s) pointing to this VPS."
      echo "Multiple domains can be separated by spaces or commas."
      echo "(e.g. nightshift.example.com, www.example.com)"
      local input_domains=""
      if [[ -n $default_domains ]]; then
        read -r -p "Domain name(s) [$default_domains]: " input_domains </dev/tty || exit 1
        input_domains="${input_domains:-$default_domains}"
      else
        read -r -p "Domain name(s): " input_domains </dev/tty || exit 1
      fi

      local parsed_domains=()
      local temp_input="${input_domains//,/ }"
      local d
      for d in $temp_input; do
        d="$(printf '%s' "$d" | tr -d '[:space:]')"
        [[ -z "$d" ]] && continue
        d="$(printf '%s' "$d" | tr '[:upper:]' '[:lower:]')"
        parsed_domains+=("$d")
      done

      if [[ ${#parsed_domains[@]} -eq 0 ]]; then
        echo "Please enter at least one domain name." >&2
        echo ""
        continue
      fi

      local all_valid=true
      for d in "${parsed_domains[@]}"; do
        if ! validate_domain "$d"; then
          echo "Invalid hostname '$d'. Supply a valid DNS hostname (no scheme, path, or port)." >&2
          all_valid=false
          break
        fi
      done

      if [[ $all_valid == true ]]; then
        DOMAINS=()
        for d in "${parsed_domains[@]}"; do
          local exists=false
          local existing
          for existing in "${DOMAINS[@]}"; do
            if [[ "$existing" == "$d" ]]; then exists=true; break; fi
          done
          if [[ $exists == false ]]; then DOMAINS+=("$d"); fi
        done
        break
      fi
      echo ""
    done
    echo ""
  fi

  if [[ -z $EMAIL || $INTERACTIVE == yes ]]; then
    local default_email="${EMAIL:-$(read_saved_email 2>/dev/null || true)}"
    while true; do
      echo "Enter a contact email address for Let's Encrypt renewal notices."
      local input_email=""
      if [[ -n $default_email ]]; then
        read -r -p "Contact email [$default_email]: " input_email </dev/tty || exit 1
        input_email="${input_email:-$default_email}"
      else
        read -r -p "Contact email: " input_email </dev/tty || exit 1
      fi

      input_email="$(printf '%s' "$input_email" | tr -d '[:space:]')"
      if validate_email "$input_email"; then
        EMAIL="$input_email"
        break
      else
        echo "Please enter a valid email address (e.g. user@example.com)." >&2
        echo ""
      fi
    done
    echo ""
  fi

  if [[ -z $PORT_ARG && $INTERACTIVE == yes ]]; then
    local default_port="${PORT_ARG:-$(read_saved_port || true)}"
    default_port="${default_port:-3005}"
    while true; do
      echo "Enter loopback port for the NightShift container."
      local input_port=""
      read -r -p "Container port [$default_port]: " input_port </dev/tty || exit 1
      input_port="${input_port:-$default_port}"
      input_port="$(printf '%s' "$input_port" | tr -d '[:space:]')"
      if validate_port "$input_port"; then
        PORT_ARG="$input_port"
        break
      else
        echo "Port must be an integer between 1024 and 65535." >&2
        echo ""
      fi
    done
    echo ""
  fi

  echo "--------------------------------------------------"
  echo "NightShift Setup Summary:"
  if [[ ${#DOMAINS[@]} -eq 1 ]]; then
    echo "  Domain/HTTPS:  ${DOMAINS[0]}"
  else
    echo "  Domains/HTTPS: ${DOMAINS[*]}"
    echo "  Certificate:   one certificate covering every domain above"
  fi
  echo "  Contact Email: $EMAIL"
  echo "  Host Port:     ${PORT_ARG:-${PORT:-3005}} (127.0.0.1:${PORT_ARG:-${PORT:-3005}})"
  echo "--------------------------------------------------"
  if ! confirm "Proceed with setup?"; then
    echo "Setup cancelled."
    exit 0
  fi
  echo ""
}

if [[ $MODE == setup ]]; then
  if [[ $INTERACTIVE == yes ]]; then
    if [[ ! -r /dev/tty ]]; then
      echo "Interactive mode requires an interactive terminal (/dev/tty)." >&2
      exit 1
    fi
    interactive_setup
  elif [[ ${#DOMAINS[@]} -eq 0 || -z $EMAIL ]] && [[ $YES != yes && -r /dev/tty ]]; then
    interactive_setup
  fi
fi

PORT="${PORT_ARG:-$(read_saved_port)}"
PORT="${PORT:-3005}"

if ! validate_port "$PORT"; then
  echo "Port must be a number from 1024 through 65535." >&2
  exit 2
fi
PORT=$((10#$PORT))

COMPOSE=(docker compose --project-name nightshift --env-file "$ENV_FILE" -f "$SCRIPT_DIR/compose.yaml")

plugin_directory="$SCRIPT_DIR/../plugins"
plugin_store_name() {
  local url="${1%/}"
  if [[ $url == *:* && $url != *://* ]]; then url="${url##*:}"; fi
  url="${url##*/}"
  printf '%s' "${url%.git}" | tr -cd '[:alnum:]_.-'
}
normalize_plugin_url() {
  local url="${1%/}"
  printf '%s' "${url%.git}"
}
install_plugin_store() {
  local url="$1" name target current_url
  if [[ ! $url =~ ^(https://|ssh://|git@)[^[:space:]]+$ ]]; then
    echo "Plugin store URL must use HTTPS, SSH, or git@host syntax: $url" >&2
    return 1
  fi
  name="$(plugin_store_name "$url")"
  [[ -n $name && $name != . && $name != .. ]] || { echo "Could not derive a plugin store name from $url" >&2; return 1; }
  target="$plugin_directory/$name"
  if [[ -d "$target/.git" || -f "$target/.git" ]]; then
    current_url="$(git -C "$target" remote get-url origin 2>/dev/null || true)"
    if [[ $(normalize_plugin_url "$current_url") != "$(normalize_plugin_url "$url")" ]]; then
      echo "A different plugin store already uses $target (origin: ${current_url:-missing})." >&2
      return 1
    fi
  elif [[ -e $target ]]; then
    echo "Plugin store path exists but is not a Git checkout: $target" >&2
    return 1
  else
    git clone -- "$url" "$target"
  fi
}
update_plugin_stores() {
  command -v git >/dev/null || { echo "Git is not installed; cannot update plugin stores." >&2; return 1; }
  mkdir -p "$plugin_directory"
  local target
  for target in "$plugin_directory"/*; do
    [[ -d $target ]] || continue
    [[ -d "$target/.git" || -f "$target/.git" ]] || continue
    if [[ -n $(git -C "$target" status --porcelain) ]]; then
      echo "Plugin store has local changes; refusing to update: $target" >&2
      return 1
    fi
    git -C "$target" pull --ff-only
  done
}

case "$MODE" in
  update)
    command -v docker >/dev/null || { echo "Docker is not installed; run setup first." >&2; exit 1; }
    command -v git >/dev/null || { echo "Git is not installed; cannot update the checkout." >&2; exit 1; }
    git_cmd=(git -c "safe.directory=$SCRIPT_DIR" -C "$SCRIPT_DIR")
    if [[ -n ${SUDO_USER:-} && $SUDO_USER != root && $(stat -c '%U' "$SCRIPT_DIR") == "$SUDO_USER" ]] && command -v runuser >/dev/null 2>&1; then
      git_cmd=(runuser -u "$SUDO_USER" -- git -C "$SCRIPT_DIR")
    fi
    if ! "${git_cmd[@]}" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
      echo "The NightShift checkout has no Git metadata. Clone the repository before using --update." >&2
      exit 1
    fi
    if [[ -n $("${git_cmd[@]}" status --porcelain) ]]; then
      echo "The NightShift checkout has local changes. Commit or remove them before using --update." >&2
      exit 1
    fi
    if ! "${git_cmd[@]}" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' >/dev/null 2>&1; then
      echo "The current Git branch has no upstream configured. Set its upstream before using --update." >&2
      exit 1
    fi
    echo "Pulling the latest fast-forward update for $("${git_cmd[@]}" branch --show-current)..."
    "${git_cmd[@]}" pull --ff-only
    update_plugin_stores
    [[ -f $ENV_FILE ]] || { printf 'NIGHTSHIFT_PORT=%s\n' "$PORT" > "$ENV_FILE"; chmod 600 "$ENV_FILE"; }
    "${COMPOSE[@]}" up -d --build
    exit 0
    ;;
  plugins)
    command -v git >/dev/null || { echo "Git is not installed; cannot install plugin stores." >&2; exit 1; }
    if ((${#PLUGIN_URLS[@]} == 0)) && [[ -r /dev/tty ]]; then
      echo "Enter trusted plugin store Git URLs. Submit an empty line when finished."
      while true; do
        read -r -p "Plugin store URL: " plugin_url </dev/tty || break
        [[ -n $plugin_url ]] || break
        PLUGIN_URLS+=("$plugin_url")
      done
    fi
    mkdir -p "$plugin_directory"
    for plugin_url in "${PLUGIN_URLS[@]}"; do install_plugin_store "$plugin_url"; done
    update_plugin_stores
    echo "Plugin stores are available in $plugin_directory. Reload NightShift in your browser to discover updated plugins."
    exit 0
    ;;
  remove_plugin)
    plugin_stores=()
    if [[ -d $plugin_directory ]]; then
      for target in "$plugin_directory"/*; do
        [[ -d $target && ( -d "$target/.git" || -f "$target/.git" ) ]] || continue
        plugin_stores+=("${target##*/}")
      done
    fi
    if [[ -z ${REMOVE_PLUGIN_NAME:-} ]]; then
      if [[ ! -r /dev/tty ]]; then
        echo "Specify a store name, or run interactively: sudo ./setup.sh --remove-plugin" >&2
        if ((${#plugin_stores[@]})); then
          printf 'Installed stores: %s\n' "${plugin_stores[*]}" >&2
        else
          echo "No installed plugin stores were found." >&2
        fi
        exit 2
      fi
      ((${#plugin_stores[@]} > 0)) || { echo "No installed plugin stores were found in $plugin_directory."; exit 0; }
      echo "Installed plugin stores:"
      for index in "${!plugin_stores[@]}"; do
        printf '  %d) %s\n' "$((index + 1))" "${plugin_stores[$index]}"
      done
      read -r -p "Store number or name to remove: " selection </dev/tty || exit 1
      if [[ $selection =~ ^[0-9]+$ ]]; then
        selection=$((10#$selection))
        ((selection >= 1 && selection <= ${#plugin_stores[@]})) || { echo "Invalid plugin store selection." >&2; exit 2; }
        REMOVE_PLUGIN_NAME="${plugin_stores[$((selection - 1))]}"
      else
        REMOVE_PLUGIN_NAME="$selection"
      fi
    fi
    if [[ ! $REMOVE_PLUGIN_NAME =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]]; then
      echo "Invalid plugin store name: $REMOVE_PLUGIN_NAME" >&2
      exit 2
    fi
    target="$plugin_directory/$REMOVE_PLUGIN_NAME"
    if [[ ! -d $target || ( ! -d "$target/.git" && ! -f "$target/.git" ) ]]; then
      echo "Plugin store '$REMOVE_PLUGIN_NAME' was not found in $plugin_directory." >&2
      exit 1
    fi
    if ! confirm "Permanently remove plugin store '$REMOVE_PLUGIN_NAME' and its local checkout?"; then
      echo "Plugin store removal cancelled."
      exit 1
    fi
    rm -rf -- "$target"
    echo "Removed plugin store '$REMOVE_PLUGIN_NAME'. Reload NightShift in your browser to apply the change."
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
    remove_nginx_config
    target_domain="$(read_saved_cert_name || true)"
    if [[ $DELETE_CERTIFICATE != yes && -n "$target_domain" && $YES != yes && -r /dev/tty ]]; then
      if confirm "Also delete the Let's Encrypt SSL certificate for $target_domain?"; then
        DELETE_CERTIFICATE="yes"
      fi
    fi
    if [[ $DELETE_CERTIFICATE == yes ]]; then
      if [[ -n "$target_domain" ]]; then
        remove_ssl_certificate "$target_domain"
        rm -f "$SETUP_STATE/domain" "$SETUP_STATE/domains" "$SETUP_STATE/email"
      else
        echo "Could not identify domain; SSL certificate was kept. Specify with --domain HOSTNAME." >&2
      fi
      echo "NightShift container, Nginx site, and SSL certificate were removed. Repository and Docker image were kept."
    else
      echo "NightShift container and Nginx site removed. The SSL certificate, repository, and Docker image were kept."
    fi
    exit 0
    ;;
  remove_nginx)
    remove_nginx_config
    target_domain="$(read_saved_cert_name || true)"
    if [[ $DELETE_CERTIFICATE != yes && -n "$target_domain" && $YES != yes && -r /dev/tty ]]; then
      if confirm "Also delete the Let's Encrypt SSL certificate for $target_domain?"; then
        DELETE_CERTIFICATE="yes"
      fi
    fi
    if [[ $DELETE_CERTIFICATE == yes ]]; then
      if [[ -n "$target_domain" ]]; then
        remove_ssl_certificate "$target_domain"
        rm -f "$SETUP_STATE/domain" "$SETUP_STATE/domains" "$SETUP_STATE/email"
      else
        echo "Could not identify domain; SSL certificate was kept. Specify with --domain HOSTNAME." >&2
      fi
      echo "NightShift Nginx site and SSL certificate were removed. The container was kept."
    else
      echo "NightShift Nginx site removed. The Docker container and SSL certificate were kept."
    fi
    exit 0
    ;;
  delete_cert)
    target_domain="$(read_saved_cert_name || true)"
    if [[ -z "$target_domain" ]]; then
      if [[ -r /dev/tty && $YES != yes ]]; then
        read -r -p "Enter domain or certificate name to delete: " target_domain </dev/tty || true
      fi
    fi
    if [[ -z "$target_domain" ]]; then
      echo "Could not identify domain. Specify with --domain HOSTNAME." >&2
      exit 1
    fi
    if [[ -e "$NGINX_LINK" || -e "$NGINX_SITE" ]]; then
      echo "NightShift's Nginx configuration ($NGINX_SITE) currently references this certificate."
      if confirm "Also remove the NightShift Nginx site configuration so Nginx doesn't fail?"; then
        remove_nginx_config
      else
        echo "Keeping Nginx site. Note that Nginx will fail to reload without a valid certificate." >&2
      fi
    fi
    remove_ssl_certificate "$target_domain"
    rm -f "$SETUP_STATE/domain" "$SETUP_STATE/domains" "$SETUP_STATE/email"
    exit 0
    ;;
esac

if [[ ${#DOMAINS[@]} -eq 0 ]]; then
  echo "Supply valid DNS hostname(s) with --domain (no scheme, path, or port)." >&2
  exit 2
fi
for d in "${DOMAINS[@]}"; do
  if ! validate_domain "$d"; then
    echo "Invalid domain hostname: '$d'. Supply valid DNS hostname(s) (no scheme, path, or port)." >&2
    exit 2
  fi
done
if ! validate_email "$EMAIL"; then
  echo "Supply a valid contact email with --email." >&2
  exit 2
fi

PRIMARY_DOMAIN="${DOMAINS[0]}"
CERT_NAME=""
if [[ -f "$NGINX_SITE" ]]; then
  existing_cert="$(sed -n 's|.*ssl_certificate /etc/letsencrypt/live/\([^/]*\)/fullchain\.pem;.*|\1|p' "$NGINX_SITE" | head -n 1)"
  if [[ -n "$existing_cert" ]]; then
    for d in "${DOMAINS[@]}"; do
      if [[ "${d,,}" == "${existing_cert,,}" ]]; then
        CERT_NAME="$existing_cert"
        break
      fi
    done
  fi
fi
if [[ -z "$CERT_NAME" ]]; then
  CERT_NAME="$PRIMARY_DOMAIN"
fi

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
printf '%s\n' "$PRIMARY_DOMAIN" > "$SETUP_STATE/domain"
printf '%s\n' "${DOMAINS[@]}" > "$SETUP_STATE/domains"
printf '%s\n' "$EMAIL" > "$SETUP_STATE/email"

tmp_env="$(mktemp)"
if [[ -f $ENV_FILE ]]; then
  awk '!/^(NIGHTSHIFT_PORT|NIGHTSHIFT_DOMAIN|NIGHTSHIFT_DOMAINS|NIGHTSHIFT_EMAIL)=/' "$ENV_FILE" > "$tmp_env"
fi
printf 'NIGHTSHIFT_PORT=%s\nNIGHTSHIFT_DOMAIN=%s\nNIGHTSHIFT_DOMAINS="%s"\nNIGHTSHIFT_EMAIL=%s\n' \
  "$PORT" "$PRIMARY_DOMAIN" "${DOMAINS[*]}" "$EMAIL" >> "$tmp_env"
install -m 600 "$tmp_env" "$ENV_FILE"
rm -f "$tmp_env"

# A previous manual setup may have put this hostname in Ubuntu's default site.
# Preserve a backup and disable only that file when it contains no other named
# virtual hosts. Other conflicting site files are left untouched and reported.
for active_site in /etc/nginx/sites-enabled/*; do
  [[ -e $active_site ]] || continue
  [[ $active_site == "$NGINX_LINK" ]] && continue

  conflicting_domains=()
  for d in "${DOMAINS[@]}"; do
    if awk -v host="$d" '
      /^[[:space:]]*#/ { next }
      /^[[:space:]]*server_name[[:space:]]/ {
        sub(/;.*/, "")
        for (i = 2; i <= NF; i++) if ($i == host) found = 1
      }
      END { exit !found }
    ' "$active_site"; then
      conflicting_domains+=("$d")
    fi
  done

  [[ ${#conflicting_domains[@]} -eq 0 ]] && continue

  if [[ $active_site == /etc/nginx/sites-enabled/default ]]; then
    if [[ ! -L $active_site ]]; then
      echo "The default Nginx site is not a symlink; refusing to disable it automatically." >&2
      exit 1
    fi
    if ! awk -v hosts="${DOMAINS[*]}" '
      BEGIN {
        split(hosts, arr, " ")
        for (k in arr) valid[arr[k]] = 1
      }
      /^[[:space:]]*#/ { next }
      /^[[:space:]]*server_name[[:space:]]/ {
        sub(/;.*/, "")
        for (i = 2; i <= NF; i++) {
          if ($i != "_" && !($i in valid)) other = 1
        }
      }
      END { exit other }
    ' "$active_site"; then
      echo "The default site also contains named hosts besides ${conflicting_domains[*]}; refusing to disable it." >&2
      exit 1
    fi
    if ! confirm "The default Nginx site owns ${conflicting_domains[*]}. Back it up and disable its symlink?"; then
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
    echo "Another enabled Nginx site ($active_site) already names ${conflicting_domains[*]}. Disable or edit it, then rerun setup." >&2
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
    server_name ${DOMAINS[*]};

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
    server_name ${DOMAINS[*]};

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name ${DOMAINS[*]};

    ssl_certificate /etc/letsencrypt/live/$CERT_NAME/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$CERT_NAME/privkey.pem;
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
nginx_test_with_upstream_prompt
systemctl reload nginx

for d in "${DOMAINS[@]}"; do
  if ! getent ahostsv4 "$d" >/dev/null; then
    echo "$d does not currently resolve. Point its A record to this VPS, wait for DNS, and rerun setup." >&2
    exit 1
  fi
done

needs_cert=false
if [[ ! -s "/etc/letsencrypt/live/$CERT_NAME/fullchain.pem" || ! -s "/etc/letsencrypt/live/$CERT_NAME/privkey.pem" ]]; then
  needs_cert=true
else
  for d in "${DOMAINS[@]}"; do
    if ! openssl x509 -in "/etc/letsencrypt/live/$CERT_NAME/fullchain.pem" -noout -checkhost "$d" >/dev/null 2>&1; then
      needs_cert=true
      break
    fi
  done
fi

if [[ $needs_cert == true ]]; then
  echo "Requesting one HTTPS certificate for all domains: ${DOMAINS[*]}"
  certbot_cmd=(certbot --nginx --non-interactive --agree-tos --email "$EMAIL" --redirect --cert-name "$CERT_NAME" --expand)
  for d in "${DOMAINS[@]}"; do
    certbot_cmd+=(-d "$d")
  done
  "${certbot_cmd[@]}"
fi

for d in "${DOMAINS[@]}"; do
  openssl x509 -in "/etc/letsencrypt/live/$CERT_NAME/fullchain.pem" -noout -checkhost "$d" >/dev/null
done
write_https_site "$NGINX_SITE"

install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
cat > "$RELOAD_HOOK" <<'HOOK'
#!/bin/sh
systemctl reload nginx
HOOK
chmod 755 "$RELOAD_HOOK"

nginx_test_with_upstream_prompt
systemctl reload nginx

# Verify the public HTTPS endpoint for every configured hostname. Checking the
# certificate file above is not enough if DNS or another TLS virtual host sends
# clients to a different certificate.
for d in "${DOMAINS[@]}"; do
  if ! curl --fail --silent --show-error --max-time 20 "https://$d/" -o /dev/null; then
    echo "Public HTTPS verification failed for $d. Check that its DNS points to this VPS and that Nginx serves its certificate for this hostname." >&2
    exit 1
  fi
done

certbot renew --cert-name "$CERT_NAME" --quiet
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

if [[ ${#DOMAINS[@]} -eq 1 ]]; then
  echo "NightShift is installed at https://${DOMAINS[0]}"
else
  echo "NightShift is installed at:"
  for d in "${DOMAINS[@]}"; do
    echo "  https://$d"
  done
fi
echo "Container port: 127.0.0.1:$PORT (Nginx only)"
echo "Manage it with: sudo ./setup.sh --stop|--start|--restart|--logs|--update"
echo "Certificate renewal scheduler: certbot.timer (or the system cron fallback)"
