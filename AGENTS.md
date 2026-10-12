# Repository Guidelines

## Project Structure

NightShift is a Node.js/Express proxy. `server.js` serves the app and routes `/wisp/` WebSocket upgrades. `public/` holds the interface and Scramjet service worker; `index.html`, `style.css`, and `app.js` make up the proxy UI, while `games.html` is a separate full-page, headless LuminSDK catalog and player. The main UI has full-screen sidebar sections for Proxy, Games, and quick cloaking. Epoxy and libcurl are selectable transports. Frontend development uses the plain files in `public/`; `scripts/publish-proxy.mjs` transforms them for the public distribution repository.

## Development Commands

- `npm install` installs dependencies.
- `npm start` runs NightShift on port 3000; set `PORT` to change it.
- `npm run build:proxy -- /path/to/output` creates the minified and obfuscated distribution in a separate output directory.
- `npm run publish:proxy` builds and pushes the distribution to `NightShift-Network/NightShift-proxy`.
- PM2 deployments should restart the named process after server changes: `pm2 restart nightshift`.

No lint or automated test scripts are configured. Before publishing, install the frontend transformation tools locally with `npm install --no-save --package-lock=false clean-css@5 html-minifier-terser@7 javascript-obfuscator@4`.

## Style and Testing

Use two spaces in JavaScript, JSON, HTML, and CSS. Use server ES modules, `camelCase` in JavaScript, and kebab-case for CSS classes and IDs. Keep dependencies minimal and follow existing `localStorage` patterns for bookmarks, search, shortcuts, and settings. The bookmarks bar should remain hidden when the saved list is empty. No test framework is configured; document commands for tests added under `tests/`. Manually check affected UI and proxy behavior. For Games changes, check search, pagination, launch/close, and dark styling in `/games.html`.

## Changes and Reviews

Use short, imperative commit subjects, such as `Add persistent bookmarks`. Pull requests should summarize visible changes, config/dependency updates, checks, and screenshots for substantial UI work. Link issues when relevant.

To publish to GitHub, stage and commit changes before pushing the `main` branch:

```sh
git add -A
git commit -m "Describe the change"
git push -u origin main
```

The `src refspec main does not match any` error means there is no local commit for `main` yet. Create the initial commit first; for later pushes, use `git push` after committing.

## Security and Configuration

Keep secrets and host-specific settings out of source control; use environment variables such as `PORT`. The proxy publisher reads `PROXY_REPO_TOKEN` from the local `.env` file, which is ignored by Git. Use a token with Contents read/write access to `NightShift-proxy`. The publisher passes it to a temporary Git askpass helper and does not save it in Git configuration or the remote URL. Never commit, print, or otherwise copy the token into source files. Preserve `/wisp/` and service-worker behavior. `server.js` intentionally omits `Cross-Origin-Embedder-Policy`; `require-corp` or `credentialless` can block game iframes. A proxy/CDN may add COEP; Nginx `proxy_hide_header` does not override its own `add_header`.

## Source and Distribution Repositories

`NightShift-source` is the canonical, readable source repository. `NightShift-proxy` receives generated files; JavaScript in `public/` is obfuscated, HTML and CSS are minified, and `SOURCE_COMMIT.txt` records the source revision. Publish only from the source checkout. Commit source changes before publishing so the generated files and recorded revision match committed source.

Add `PROXY_REPO_TOKEN=<token>` to the local, uncommitted `.env`, then run:

```sh
npm install
npm install --no-save --package-lock=false clean-css@5 html-minifier-terser@7 javascript-obfuscator@4
npm run publish:proxy
```

The publish script clones the distribution repo in a temporary directory, updates generated files, commits changes, and pushes `main`. Do not copy distribution files back into the source repo. To create a local build without publishing, use `npm run build:proxy -- /path/to/output`.

## Games and Service Worker

The Games link opens `public/games.html`. It uses LuminSDK headless mode and builds its themed catalog/player with `getGames`, `getImageUrl`, and `getGameUrl`; the standard UI is inside Shadow DOM. Game URLs are single-use; request a fresh one per launch. `public/sw.js` routes Scramjet's same-origin requests and passes SDK/API requests directly to the browser. Preserve this bypass. For Lumin failures, inspect Firefox Network details; cross-origin `responseStatus: 0` alone does not prove failure.

## Current Interface Features

The Proxy, Games, and Cloak sections fill the app viewport and are selected from the sidebar. Cloaking preferences include a favorite method, a configurable page behind the cloaked tab, and custom tab title/icon values. Bookmark and settings data are stored locally and can be imported or exported; preserve validation and avoid overwriting unrelated browser storage. The bookmark bar is rendered only when at least one bookmark exists. The home footer credits `palmtree890` with a link to the GitHub profile.

## Product Naming

Use NightShift as the product name in user-facing branding where it reads naturally. Keep technical descriptions accurate about proxy behavior.

## Roadmap: Tor and Onion Support

Tor and `.onion` access are planned, not implemented. Destination connections originate from the NightShift host. Current Wisp integration connects directly and does not expose an upstream SOCKS option, so installing Tor alone is insufficient. Any implementation must route onion hostnames through Tor SOCKS without ordinary DNS or direct fallback, clearly state whether Tor covers onion-only or all traffic, and fail closed when Tor is unavailable. Server-side Tor does not anonymize a user's connection to NightShift. Verify both Epoxy and libcurl paths before documenting support.
