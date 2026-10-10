# Nightshift

Nightshift is a self-hosted web proxy with a tabbed dark-mode interface. It uses [Scramjet](https://github.com/MercuryWorkshop/scramjet) to proxy browser traffic and [Wisp](https://github.com/MercuryWorkshop/wisp-js) for its WebSocket transport.

## Features

- Full-screen sidebar navigation for Proxy, Games, and quick cloaking access
- Multi-tab browsing, address/search bar, an editable homepage, and configurable quick-access shortcuts
- A bookmarks bar that appears only when bookmarks are saved; bookmarks persist in browser storage
- Search choices for DuckDuckGo, Brave, Startpage, Palmtree Search, and custom URL templates
- Epoxy and libcurl transport choices
- Optional `about:blank` and blob-tab cloaking, with a favorite method and configurable tab title and icon
- Configurable page shown behind a cloaked tab
- A separate Games page with a custom dark-themed catalog and player powered by LuminSDK
- Creator credit linking to [palmtree890's GitHub profile](https://github.com/palmtree890)
- Browser-local settings, bookmarks, and import/export for search, transport, quick access, cloaking, and bookmarks

Compatibility varies; sites may limit proxy traffic or rely on browser features that are difficult to proxy. Duck.ai may rate-limit proxy or VPN addresses.

## How It Is Built

Nightshift is built with Node.js and ES modules. The server uses Express to serve the static browser app and the Scramjet, controller, Epoxy, and libcurl assets; Wisp handles the `/wisp/` WebSocket transport. The frontend is plain HTML, CSS, and browser JavaScript in `public/`, with no frontend build step. Scramjet runs proxied pages in the browser. The separate `public/games.html` page uses LuminSDK's headless methods to render its own game catalog and player. Bookmarks and preferences are stored in browser `localStorage`. The server port is selected with `PORT` (default `3000`).

## Self-hosting

### Requirements

- Node.js with npm
- Network access for package installation and outbound Wisp connections

### Run locally

```sh
git clone https://github.com/palmtree890/NightShift.git
cd NightShift
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

### 1. Point FreeDNS at the VPS

At your DNS provider, create an **A record** for `proxy.example.com` pointing to the VPS public IPv4 address. Do not create an AAAA record unless the VPS has working public IPv6 and its firewall permits it. If using FreeDNS, choose an A record rather than **Web Forward / Cloak**. Wait for DNS to update and check it with:

```sh
dig +short A proxy.example.com
```

DNS must return the VPS address.

### 2. Install Nginx and Certbot on the VPS

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

Create `/etc/nginx/sites-available/nightshift` with this HTTP virtual host. It proxies requests to the hostname where your NightShift server is already reachable:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name proxy.example.com;

    location /wisp/ {
        proxy_pass https://nightshift.example.net;
        proxy_hide_header Cross-Origin-Embedder-Policy;
        proxy_http_version 1.1;
        proxy_set_header Host nightshift.example.net;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_ssl_server_name on;
        proxy_ssl_name nightshift.example.net;
        proxy_ssl_verify on;
        proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
        proxy_read_timeout 3600s;
    }

    location / {
        proxy_pass https://nightshift.example.net;
        proxy_hide_header Cross-Origin-Embedder-Policy;
        proxy_set_header Host nightshift.example.net;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_ssl_server_name on;
        proxy_ssl_name nightshift.example.net;
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

If the symlink already exists, do not create it again. Confirm that `http://proxy.example.com/` reaches the NightShift page before requesting the certificate.

### 3. Issue the HTTPS Certificate

Run Certbot for your public hostname:

```sh
sudo certbot --nginx -d proxy.example.com
```

Follow the prompts and select the HTTP-to-HTTPS redirect option. Certbot's HTTP validation needs public access to port 80, and the A record must resolve to this VPS. Certbot configures Nginx to serve the certificate and renewals are normally handled by its system timer. Check renewal with:

```sh
sudo certbot renew --dry-run
```

Then browse to `https://proxy.example.com` and test navigation. The `/wisp/` WebSocket route is required for proxy traffic. This VPS terminates public HTTPS and relays requests to the NightShift upstream hostname. The upstream example `nightshift.example.net` should be replaced with the public hostname for your NightShift server.

### Firefox Reports `NS_ERROR_DOM_COEP_FAILED`

NightShift no longer sets `Cross-Origin-Embedder-Policy`, because that policy prevents Firefox from embedding game pages that do not opt in. Restart the Node process after updating NightShift:

```sh
pm2 restart nightshift
```

If the error remains, check whether the public response still includes the header:

```sh
curl -sSI https://proxy.example.com/ | grep -i cross-origin-embedder-policy
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

For a setup made with the manual steps above, remove only the NightShift site and its related files. Replace the site filename below if you chose a different name:

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

To delete the certificate as well, first list its Certbot name with `sudo certbot certificates`, then remove the matching certificate by name, for example `sudo certbot delete --cert-name proxy.example.com`. Remove or repoint the DNS A record separately in your DNS provider. Do not uninstall Nginx or disable Certbot's renewal timer if the VPS uses them for other sites.

## Configuration

Open the gear menu to select a search engine and proxy transport, edit homepage shortcuts, configure cloaking, or save settings. Use the Backup section in Settings to export or import these preferences and bookmarks as a JSON file. Otherwise, bookmarks, shortcuts, and preferences are stored in the current browser's local storage; they are not shared between browsers or server instances. Server configuration currently uses the `PORT` environment variable.

## Roadmap

- Optional Tor routing for proxy traffic and support for `.onion` sites
- Import and export for bookmarks and preferences
- Container and service-manager deployment examples
- Broader site compatibility and clearer connection diagnostics

Roadmap items are planned and are not implemented unless listed under Features.
