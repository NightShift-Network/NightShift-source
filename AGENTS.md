# Repository Guidelines

## Project Structure

NightShift is a Node.js/Express proxy. `server.js` serves the app and routes `/wisp/` WebSocket upgrades. `public/` holds the interface and Scramjet service worker; `index.html`, `style.css`, and `app.js` make up the proxy UI, while `games.html` is a separate full-page, headless LuminSDK catalog and player. The main UI has full-screen sidebar sections for Proxy, Games, and quick cloaking. Epoxy and libcurl are selectable transports. There is no frontend build step.

## Development Commands

- `npm install` installs dependencies.
- `npm start` runs NightShift on port 3000; set `PORT` to change it.
- PM2 deployments should restart the named process after server changes: `pm2 restart nightshift`.

No build, lint, or automated test scripts are configured.

## Style and Testing

Use two spaces in JavaScript, JSON, HTML, and CSS. Use server ES modules, `camelCase` in JavaScript, and kebab-case for CSS classes and IDs. Keep dependencies minimal and follow existing `localStorage` patterns for bookmarks, search, shortcuts, and settings. The bookmarks bar should remain hidden when the saved list is empty. No test framework is configured; document commands for tests added under `tests/`. Manually check affected UI and proxy behavior. For Games changes, check search, pagination, launch/close, and dark styling in `/games.html`.

## Changes and Reviews

Use short, imperative commit subjects, such as `Add persistent bookmarks`. Pull requests should summarize visible changes, config/dependency updates, checks, and screenshots for substantial UI work. Link issues when relevant.

## Security and Configuration

Keep secrets and host-specific settings out of source control; use environment variables such as `PORT`. Preserve `/wisp/` and service-worker behavior. `server.js` intentionally omits `Cross-Origin-Embedder-Policy`; `require-corp` or `credentialless` can block game iframes. A proxy/CDN may add COEP; Nginx `proxy_hide_header` does not override its own `add_header`.

## Games and Service Worker

The Games link opens `public/games.html`. It uses LuminSDK headless mode and builds its themed catalog/player with `getGames`, `getImageUrl`, and `getGameUrl`; the standard UI is inside Shadow DOM. Game URLs are single-use; request a fresh one per launch. `public/sw.js` routes Scramjet's same-origin requests and passes SDK/API requests directly to the browser. Preserve this bypass. For Lumin failures, inspect Firefox Network details; cross-origin `responseStatus: 0` alone does not prove failure.

## Current Interface Features

The Proxy, Games, and Cloak sections fill the app viewport and are selected from the sidebar. Cloaking preferences include a favorite method, a configurable page behind the cloaked tab, and custom tab title/icon values. Bookmark and settings data are stored locally and can be imported or exported; preserve validation and avoid overwriting unrelated browser storage. The bookmark bar is rendered only when at least one bookmark exists. The home footer credits `palmtree890` with a link to the GitHub profile.

## Roadmap: Tor and Onion Support

Tor and `.onion` access are planned, not implemented. Destination connections originate from the NightShift host. Current Wisp integration connects directly and does not expose an upstream SOCKS option, so installing Tor alone is insufficient. Any implementation must route onion hostnames through Tor SOCKS without ordinary DNS or direct fallback, clearly state whether Tor covers onion-only or all traffic, and fail closed when Tor is unavailable. Server-side Tor does not anonymize a user's connection to NightShift. Verify both Epoxy and libcurl paths before documenting support.
