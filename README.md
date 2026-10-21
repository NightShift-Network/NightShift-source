<div align="center">
  <img src="public/images/nightshift.png" alt="NightShift logo" width="112" height="112">
  <h1>NightShift</h1>
  <p><strong>Your window to the web, after dark.</strong></p>
  <p>The readable source code repository for NightShift Proxy, a self-hosted web proxy with a sleek, tabbed dark-mode interface.</p>
</div>

<br>

This is the readable source code repository for [NightShift Proxy](https://github.com/NightShift-Network/NightShift-proxy). This contains instructions for install with README links pointing at the [obfuscated](https://github.com/NightShift-Network/NightShift-proxy) project for installation, this repository contains the readable source code so this project can remain open source while still bypassing filters.

NightShift uses [Scramjet](https://github.com/MercuryWorkshop/scramjet) to proxy browser traffic and [Wisp](https://github.com/MercuryWorkshop/wisp-js) for its WebSocket transport.

## Easy Install

The fastest way to deploy NightShift on a Debian or Ubuntu VPS with Docker, Nginx reverse proxy, and Let's Encrypt SSL:

### Prerequisites

- A Debian or Ubuntu VPS
- A public domain name with an **A record** pointing to the VPS IP address
- Inbound TCP ports `80` and `443` allowed in firewall

### 1. Clone and Run Setup

```sh
git clone https://github.com/NightShift-Network/NightShift-proxy.git
cd NightShift-proxy

# Run interactively:
sudo ./setup.sh

# Or supply domain(s) and email directly:
sudo ./setup.sh --domain your.domain.example --email you@example.com
```
### NOTE: If the setup script fails you can simply run it again and it will likely fix the issue.

The script will:
- Install Docker, Docker Compose, Nginx, and Certbot (if not already installed)
- Build the NightShift Docker image and start the container bound to `127.0.0.1:3005`
- Configure Nginx with WebSocket support for `/wisp/` and HTTP-to-HTTPS redirect
- Obtain and configure a Let's Encrypt SSL certificate and set up automatic renewal

Enter all hostnames in one command. The installer requests one Let's Encrypt certificate covering every hostname and configures each hostname in Nginx:

```sh
sudo ./setup.sh --domain example.com www.example.com --email you@example.com
sudo ./setup.sh --domain example.com --domain www.example.com --email you@example.com
sudo ./setup.sh --domain "example.com, www.example.com" --email you@example.com
```

Each hostname must resolve to this VPS, and inbound ports `80` and `443` must be open. Setup checks the HTTPS certificate served for every hostname before it reports success.

To specify a custom loopback port (default `3005`):

```sh
sudo ./setup.sh --domain your.domain.example --email you@example.com --port 3010
```

### Management Commands

```sh
sudo ./setup.sh --update      # Pull latest changes and rebuild/restart container
sudo ./setup.sh --plugins     # Prompt for stores and update installed stores
sudo ./setup.sh --plugins list # List installed stores and Git origins (--plugins ls also works)
sudo ./setup.sh --plugin-url https://github.com/example/plugin-store.git
sudo ./setup.sh --start       # Start the container
sudo ./setup.sh --stop        # Stop the container
sudo ./setup.sh --restart     # Restart the container
sudo ./setup.sh --logs        # View live container logs
```

### Plugins

Plugin stores are trusted Git repositories installed under `NightShift-data/plugins/` next to the NightShift checkout, so they survive source checkout updates. Run `setup.sh --plugins` to enter one or more Git URLs interactively, or pass `--plugin-url URL` (repeatable) for non-interactive setup. The spelling `--pluin-url` is also accepted. Run `setup.sh --plugins list` or `setup.sh --plugins ls` to list installed store names and Git origins. `--plugins` and `--update` fast-forward every installed store; locally changed stores are left untouched and cause the command to stop with an error. The container mounts that directory read-only. Existing stores in the old sibling `plugins/` directory are moved into `NightShift-data/plugins/` the next time a plugin command or update runs.

The loader finds a plugin manifest at the store root or one directory below it. A store can therefore provide multiple plugins, each with its own `plugin.json` and assets. Example manifest:

```json
{
  "id": "example-plugin",
  "name": "Example plugin",
  "description": "A short description",
  "version": "1.0.0",
  "script": "plugin.js",
  "styles": ["plugin.css"]
}
```

The script and styles are optional. Plugins are enabled by default and can be disabled at `nightshift://plugins`; the selection is stored in the visitor's local browser storage. Plugin scripts run in the NightShift page with its browser permissions, so only use stores you trust. No plugin stores are configured by default yet.

Remove a complete plugin store checkout by name. Omit the name to choose from an interactive list:

```sh
sudo ./setup.sh --remove-plugin plugins
sudo ./setup.sh --remove-plugin
```

The command asks for confirmation before deleting the selected store directory. Reload NightShift afterward to update the Plugins page.

### Removal and Cleanup

```sh
# Remove the container and Nginx site configuration (prompts whether to delete SSL certificate)
sudo ./setup.sh --remove

# Remove container, Nginx site configuration, and delete the SSL certificate
sudo ./setup.sh --remove --delete-certificate

# Remove only the Nginx site configuration (leaves container running)
sudo ./setup.sh --remove-nginx

# Delete only the Let's Encrypt SSL certificate
sudo ./setup.sh --delete-certificate
```

## Features

- Full-screen sidebar navigation for Browser, Play, and quick cloaking access
- Multi-tab browsing with `nightshift://` pages for New Tab, Settings, History, Bookmarks, Plugins, Shortcuts, Diagnostics, About, Privacy, and Help
- Quick switcher (`Ctrl+K` / `⌘K`) for open tabs, bookmarks, browsing history, and internal pages
- Keyboard shortcuts including `Ctrl+Shift+T` to open a tab and `Ctrl+W` or `Ctrl+Alt+W` to close one
- Full-screen browsing with a compact address bar and Escape exit
- Address/search bar, editable homepage, and configurable quick-access shortcuts
- A bookmarks bar that appears only when bookmarks are saved; bookmarks persist in browser storage
- Search choices for DuckDuckGo, Brave, Startpage, Palmtree Search, and custom URL templates
- Epoxy and libcurl transport choices
- Optional `about:blank` and blob-tab cloaking, with a favorite method and configurable tab title and icon
- Configurable page shown behind a cloaked tab
- A separate Interactive Entertainment page with a custom dark-themed catalog and player powered by LuminSDK
- Creator credit linking to [palmtree890's GitHub profile](https://github.com/palmtree890)
- Browser-local settings, bookmarks, and import/export for search, transport, quick access, cloaking, and bookmarks

Compatibility varies; sites may limit proxy traffic or rely on browser features that are difficult to proxy. Duck.ai may rate-limit proxy or VPN addresses.

## How It Is Built

Nightshift is built with Node.js and ES modules. The server uses Express to serve the static browser app and the Scramjet, controller, Epoxy, and libcurl assets; Wisp handles the `/wisp/` WebSocket transport. The frontend is plain HTML, CSS, and browser JavaScript in `public/`, with no frontend build step. Scramjet runs proxied pages in the browser. The separate `public/entertainment.html` page uses LuminSDK's headless methods to render its interactive entertainment catalog and player. Bookmarks and preferences are stored in browser `localStorage`. The server port is selected with `PORT` (default `3000`).

## Source and Proxy Repositories

This repository, [NightShift-source](https://github.com/NightShift-Network/NightShift-source), contains the readable source code for [NightShift Proxy](https://github.com/NightShift-Network/NightShift-proxy). The proxy repository receives a generated distribution with frontend JavaScript obfuscated and HTML and CSS minified. Each generated release includes `SOURCE_COMMIT.txt` so it can be matched to the source revision.

Publishing is run locally so the proxy token stays in your uncommitted `.env` file. `.env` is ignored by Git. Set `PROXY_REPO_TOKEN` in `.env` to a fine-grained token with Contents read and write access to `NightShift-proxy`, commit your source changes on `main`, then run:

```sh
./publish.sh
```

The script checks for Node.js, npm, the source repository remote, the `main` branch, an ignored `.env` with the token, and a clean source checkout. It installs dependencies, pushes committed source changes to `NightShift-source`, then builds the distribution and commits and pushes generated changes to `NightShift-proxy`. Source pushes use your normal GitHub Git credentials; `PROXY_REPO_TOKEN` is used only for the proxy repository and is passed through Git's temporary askpass helper. It is not saved in Git configuration or the remote URL. If either push fails, the script stops. To build without publishing, run `npm run build:proxy -- /path/to/output-directory`.

## Self-hosting

### Requirements

- Node.js with npm
- Network access for package installation and outbound Wisp connections

### Run locally

```sh
git clone https://github.com/NightShift-Network/NightShift-proxy.git
cd NightShift-proxy
npm install
npm start
```

Open `http://localhost:3000`. The server reads its listening port from the `PORT` environment variable (default `3000`):

```sh
PORT=8080 npm start
```

For remote access, use an HTTPS reverse proxy and forward WebSocket upgrades for `/wisp/`. Service workers require HTTPS remotely. Restrict access or add authentication before public exposure; otherwise anyone who can reach the instance can use it.

## Keep It Running with PM2 and Cloudflare Tunnel

PM2 runs Nightshift in the background and can restore it after reboots:

```sh
npm install -g pm2
PORT=3000 pm2 start server.js --name nightshift
pm2 save
pm2 startup
```

Run the platform-specific command printed by `pm2 startup` (it may require `sudo`), then save the process list so Nightshift is restored after reboot:

```sh
pm2 save
```

Useful process commands:

```sh
pm2 status                 # Show managed processes
pm2 logs nightshift        # Follow Nightshift logs
pm2 stop nightshift        # Stop it now
pm2 restart nightshift     # Start it again
pm2 delete nightshift      # Stop and remove it from PM2
```

If you want it stopped after reboot too, run `pm2 stop nightshift` and then `pm2 save` to update the saved process list. To disable PM2's boot startup entirely, run `pm2 unstartup` and execute the platform-specific command it prints. This disables PM2 startup for the current user; it does not uninstall PM2. See the [PM2 startup guide](https://pm2.keymetrics.io/docs/usage/startup/).

Install `cloudflared` on the host, create a named tunnel, and route your hostname to `http://localhost:3000` (or your selected port). Cloudflare Tunnel supports the WebSocket connection Nightshift uses at `/wisp/`; see [routing docs](https://developers.cloudflare.com/tunnel/concepts/routing/) and the [WebSocket FAQ](https://developers.cloudflare.com/cloudflare-one/faq/cloudflare-tunnels-faq/).

## VPS Deployment with Nginx and HTTPS

This guide is for anyone hosting NightShift behind a VPS. The VPS provides the public HTTPS endpoint, and Nginx forwards page and Wisp WebSocket traffic to the NightShift server. Replace example hostnames and email addresses with your own values. The DNS provider must point an A record at the VPS; open TCP ports 80 and 443 in both the VPS firewall and provider firewall.

The included automation currently supports FreeDNS dynamic A records. It fetches existing records through the FreeDNS API, selects one, updates it to the VPS address, configures Nginx, and requests a Let's Encrypt certificate. Other DNS providers can be used with the manual Nginx and Certbot steps below after creating an A record that points to the VPS. The script does not register new domains or create masked/frame redirects. With FreeDNS, create the hostname in its website first and use a real A record.

Choose the deployment that matches where NightShift runs. The FreeDNS installer below is for a public hostname that proxies to a NightShift server at a **different, already reachable upstream hostname**. If NightShift runs on this same VPS, use the same-VPS setup below and proxy Nginx to `127.0.0.1:3005`. Do not set the upstream to the public hostname that resolves back to this VPS; that creates a proxy loop. Do not leave example hostnames such as `proxy.example.com` or `nightshift.example.net` in the configuration.

### Automated VPS Setup

For the automated FreeDNS setup, use a Debian or Ubuntu VPS with ports 80 and 443 allowed. Clone the repository on the VPS, or copy the `scripts/` directory and `.env.example` there. Configure the installer:

```sh
cp .env.example .env
chmod 600 .env
nano .env
```

Fill in `FREEDNS_API_SHA` from the FreeDNS API page, the public hostname that currently serves your NightShift instance, and an email address for Let's Encrypt. Leave `FREEDNS_HOST` blank to select an existing dynamic A-record hostname interactively, or enter a hostname you've already created. Keep `.env` private; it is excluded from Git.

Run the installer and choose whether it should create a daily cron job:

```sh
sudo ./scripts/setup-vps-proxy.sh
```

Or select cron without an interactive prompt:

```sh
sudo ./scripts/setup-vps-proxy.sh --cron
```

The script updates the selected FreeDNS A record to the VPS public IPv4 address, configures Nginx to proxy the site and `/wisp/` WebSocket to the upstream, and requests a Let's Encrypt certificate with Certbot. The optional cron job refreshes the DNS record and renews due certificates. It runs daily at 03:17 by default; set `CRON_SCHEDULE` in `.env` to change that. Choose `--no-cron` to use Certbot's systemd renewal timer. To run a refresh manually:

```sh
sudo /usr/local/sbin/nightshift-vps-proxy --refresh
```

To inspect or remove the installed cron job, use `sudo cat /etc/cron.d/nightshift-vps-proxy` or `sudo rm /etc/cron.d/nightshift-vps-proxy`. Removing the file stops scheduled FreeDNS updates; Certbot renewal then needs its systemd timer enabled with `sudo systemctl enable --now certbot.timer`.

To remove the setup created by the script, run:

```sh
sudo /usr/local/sbin/nightshift-vps-proxy --remove
```

This asks for confirmation, removes the NightShift Nginx site, cron job, installed refresh command, and saved server credentials, and keeps the certificate and DNS record. To also delete the certificate for the configured hostname, use `--remove --delete-certificate`. Nginx itself and the Certbot timer are left installed because they may serve other sites or certificates.

### Automated Docker setup when NightShift runs on this VPS

The root-level `setup.sh` installs Docker, Compose, Nginx, and Certbot when needed; builds NightShift's Docker image; publishes the app on loopback; configures Nginx and HTTPS; and enables certificate renewal. It targets Debian/Ubuntu VPSs. Before running it:

- Clone this repository onto the VPS.
- Point the hostname's A record to the VPS. Add an AAAA record only if public IPv6 works there.
- Allow inbound TCP ports 80 and 443.

Run setup interactively, or supply your hostname(s), email, and (optionally) a host port. The default port is `3005`:

```sh
# Interactive setup (guided prompts):
sudo ./setup.sh
# or explicitly:
sudo ./setup.sh --interactive

# Command-line flags:
sudo ./setup.sh --domain nightshift.example.com --email you@example.com
sudo ./setup.sh --domain nightshift.example.com --email you@example.com --port 3010

# One certificate covers every hostname provided (space-, comma-, or repeat-separated):
sudo ./setup.sh --domain nightshift.example.com proxy.example.com --email you@example.com
sudo ./setup.sh --domain nightshift.example.com --domain proxy.example.com --email you@example.com
sudo ./setup.sh --domain "nightshift.example.com, proxy.example.com" --email you@example.com
```

The chosen host port is written to the ignored `.nightshift.env` file; the container listens internally on port `3000`, and Docker binds the selected port to `127.0.0.1` only. The installer does not overwrite `.env`, which may contain the FreeDNS proxy script's settings. If the hostname already has a Certbot certificate at `/etc/letsencrypt/live/<hostname>`, setup reuses it. Otherwise it requests one through Certbot's Nginx plugin. It adds a renewal deploy hook that reloads Nginx after renewal.

If the old default Nginx site contains only the catch-all and this hostname, the installer asks to back it up and disable its symlink so it won't serve the old welcome page for this domain. The backup is stored under `/var/backups/nightshift-setup/`. It stops if another named Nginx site conflicts, rather than editing an unrelated site. If a manually started container named `nightshift` uses this same checkout, setup replaces it with the Compose-managed container. It asks before replacing a different container with that name. Review each prompt; `--yes` accepts those replacements automatically.

Use the installer to manage the daemon-backed container:

```sh
sudo ./setup.sh --stop
sudo ./setup.sh --start
sudo ./setup.sh --restart
sudo ./setup.sh --logs
```

Update the checkout and rebuild/recreate the container in one step:

```sh
sudo ./setup.sh --update
```

`--update` requires a Git clone with a configured upstream and a clean working tree. It pulls with `--ff-only`, so it stops safely if local changes or divergent commits need attention, then rebuilds the image and recreates the container.

The Compose service uses Docker's `unless-stopped` restart policy, and setup enables the Docker daemon at boot. The container returns after a VPS reboot unless you explicitly stopped it. Docker documents the [restart policy](https://docs.docker.com/reference/compose-file/services/#restart) and [port binding](https://docs.docker.com/reference/compose-file/services/#ports). The same operations are available through `docker compose --project-name nightshift --env-file .nightshift.env -f compose.yaml` (`stop`, `start`, `restart`, `logs -f`, and `up -d --build`).

To remove the container and NightShift's Nginx site:

```sh
sudo ./setup.sh --remove
```

When run interactively, `--remove` prompts whether to also delete the Let's Encrypt certificate. To delete the SSL certificate without prompting during removal, pass `--delete-certificate`:

```sh
sudo ./setup.sh --remove --delete-certificate
```

To remove only the Nginx site configuration and renewal hooks without affecting the running container:

```sh
sudo ./setup.sh --remove-nginx
```

To delete only the Let's Encrypt SSL certificate for the domain:

```sh
sudo ./setup.sh --delete-certificate
```

If setup disabled the prior default-site symlink, removing the Nginx configuration restores it from the recorded target. Inspect Nginx before removing if other sites rely on that default configuration.

### Manual Nginx setup for a separate upstream

Use this alternative when the public Nginx VPS is **not** the machine running NightShift. The upstream hostname must resolve to that other machine, and it must already serve NightShift over HTTPS. Do not use the public Nginx hostname as the upstream when it resolves back to this VPS.

#### 1. Point your DNS hostname at the VPS

At your DNS provider, create an **A record** for your public proxy hostname pointing to the VPS public IPv4 address. Do not create an AAAA record unless the VPS has working public IPv6 and its firewall permits it. If using FreeDNS, choose an A record rather than **Web Forward / Cloak**. Wait for DNS to update and check it with:

```sh
dig +short A proxy.your-domain.example
```

DNS must return the VPS address.

#### 2. Install Nginx and Certbot on the VPS

On Debian or Ubuntu, install Nginx and Certbot's Nginx plugin, then allow inbound TCP ports 80 and 443 in the VPS firewall/provider firewall:

```sh
sudo apt update
sudo apt install nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/conf.d/nightshift-websocket-map.conf` so Nginx can set the proper connection header for WebSocket upgrades:

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

Create `/etc/nginx/sites-available/nightshift` with this HTTP virtual host. Replace both example hostnames: `proxy.your-domain.example` is the public DNS name for this VPS, and `nightshift-upstream.your-domain.example` is a different hostname where NightShift is already reachable:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name proxy.your-domain.example;

    location /wisp/ {
        proxy_pass https://nightshift-upstream.your-domain.example;
        proxy_hide_header Cross-Origin-Embedder-Policy;
        proxy_http_version 1.1;
        proxy_set_header Host nightshift-upstream.your-domain.example;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_ssl_server_name on;
        proxy_ssl_name nightshift-upstream.your-domain.example;
        proxy_ssl_verify on;
        proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
        proxy_read_timeout 3600s;
    }

    location / {
        proxy_pass https://nightshift-upstream.your-domain.example;
        proxy_hide_header Cross-Origin-Embedder-Policy;
        proxy_set_header Host nightshift-upstream.your-domain.example;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_ssl_server_name on;
        proxy_ssl_name nightshift-upstream.your-domain.example;
        proxy_ssl_verify on;
        proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
    }
}
```

Enable the site and check the configuration:

```sh
sudo ln -s /etc/nginx/sites-available/nightshift /etc/nginx/sites-enabled/nightshift
sudo nginx -t
sudo systemctl reload nginx
```

If the symlink already exists, do not create it again. Confirm that `http://proxy.your-domain.example/` reaches the NightShift page before requesting the certificate.

#### 3. Issue the HTTPS Certificate

Run Certbot for your public hostname:

```sh
sudo certbot --nginx -d proxy.your-domain.example
```

Follow the prompts and select the HTTP-to-HTTPS redirect option. Certbot's HTTP validation needs public access to port 80, and the A record must resolve to this VPS. Certbot configures Nginx to serve the certificate and renewals are normally handled by its system timer. Check renewal with:

```sh
sudo certbot renew --dry-run
```

Then browse to `https://proxy.your-domain.example` and test navigation. The `/wisp/` WebSocket route is required for proxy traffic. This VPS terminates public HTTPS and relays requests to the separate NightShift upstream hostname.

### Certificate renewal and the setup script's cron job

An issued certificate does not renew itself just because Nginx is serving it. Certbot needs a scheduled `certbot renew` run. On Debian/Ubuntu, check whether the systemd timer or a cron job is active:

```sh
sudo systemctl status certbot.timer
sudo systemctl list-timers --all certbot.timer
sudo grep -R "certbot.*renew" /etc/cron.d /etc/crontab 2>/dev/null
sudo certbot renew --dry-run
```

Certbot's `renew` command skips certificates that are not due yet; a dry run checks the renewal path without replacing the live certificate. The Nginx plugin stores its renewal configuration for certificates issued with `certbot --nginx`. See the [Certbot renewal documentation](https://eff-certbot.readthedocs.io/en/stable/using.html#renewing-certificates).

The optional FreeDNS cron job created by `setup-vps-proxy.sh` is `/etc/cron.d/nightshift-vps-proxy`. It runs the installed helper at `/usr/local/sbin/nightshift-vps-proxy --refresh`, which updates the FreeDNS A record and then runs `certbot renew` with an Nginx reload hook. The script writes this cron file only near the end of a successful setup. If an earlier step failed, earlier DNS/Nginx/certificate changes may remain even though the cron file and helper were never installed. Inspect the cron file and timer directly; do not assume the script's cron exists because the script was started.

The same-VPS `setup.sh` uses Certbot's systemd timer when available and installs a daily renewal cron fallback otherwise. It does not depend on the FreeDNS script's cron job.

When the script is configured to use its cron job, it disables `certbot.timer` to avoid relying on two schedulers. If the script's cron file is missing, make sure the systemd timer is enabled instead:

```sh
sudo systemctl enable --now certbot.timer
sudo certbot renew --dry-run
```

If a certificate expires before a successful renewal, browsers will report that the HTTPS certificate is expired and normally block the page. The HTTP-to-HTTPS redirect does not avoid that error. Restore automated renewal, run `sudo certbot renew`, and reload Nginx so it serves the renewed certificate. Certbot's official [renewal instructions](https://eff-certbot.readthedocs.io/en/stable/using.html#automated-renewals) explain how to verify the scheduler for the installation method.

### Firefox Reports `NS_ERROR_DOM_COEP_FAILED`

NightShift no longer sets `Cross-Origin-Embedder-Policy`, because that policy prevents Firefox from embedding interactive entertainment pages that do not opt in. Restart NightShift after updating it. For the Docker setup above:

```sh
docker restart nightshift
```

For a PM2 deployment, use:

```sh
pm2 restart nightshift
```

If the error remains, check whether the public response still includes the header:

```sh
curl -sSI https://your.domain.example/ | grep -i cross-origin-embedder-policy
```

No output is expected. Find Nginx rules that set or forward the header:

```sh
sudo nginx -T 2>/dev/null | grep -niE 'Cross-Origin-Embedder-Policy|require-corp'
```

Remove any Nginx `add_header Cross-Origin-Embedder-Policy ...;` directive. `proxy_hide_header Cross-Origin-Embedder-Policy;` inside `location /` and `location /wisp/` only hides a header received from the upstream; it does not cancel an Nginx `add_header`. Then validate and reload Nginx:

```sh
sudo nginx -t && sudo systemctl reload nginx
```

Check the public response again. If the header still appears and Nginx's config has no `add_header` rule for it, inspect any CDN, tunnel, or other reverse proxy in front of Nginx for a response-header rule adding COEP.

### Remove a Manually Configured VPS Proxy

For the separate-upstream setup above, remove only the NightShift site and its related files. Replace the site filename below if you chose a different name:

```sh
sudo rm -f /etc/nginx/sites-enabled/nightshift
sudo rm -f /etc/nginx/sites-available/nightshift
sudo nginx -t
sudo systemctl reload nginx
```

If you created the WebSocket map file and no other Nginx site uses it, remove it too, then validate and reload Nginx again:

```sh
sudo rm -f /etc/nginx/conf.d/nightshift-websocket-map.conf
sudo nginx -t
sudo systemctl reload nginx
```

To delete the certificate as well, first list its Certbot name with `sudo certbot certificates`, then remove the matching certificate by name, for example `sudo certbot delete --cert-name your.domain.example`. Remove or repoint the DNS A record separately in your DNS provider. Do not uninstall Nginx or disable the Certbot renewal timer if the VPS uses them for other sites.

For the same-VPS Docker setup, remove the proxy locations from the existing NightShift TLS virtual host, validate/reload Nginx, and then stop/remove the container. Keep its certificate directives and other apps' Nginx sites:

```sh
sudo nginx -t && sudo systemctl reload nginx
docker stop nightshift
docker rm nightshift
```

## Configuration

Open the gear menu to select a search engine and proxy transport, edit homepage shortcuts, configure cloaking, or save settings. Use the Backup section in Settings to export or import these preferences and bookmarks as a JSON file. Otherwise, bookmarks, shortcuts, and preferences are stored in the current browser's local storage; they are not shared between browsers or server instances. Server configuration currently uses the `PORT` environment variable.

## Roadmap

- Optional Tor routing for proxy traffic and support for `.onion` sites
- Import and export for bookmarks and preferences
- Broader site compatibility and clearer connection diagnostics

Roadmap items are planned and are not implemented unless listed under Features.
