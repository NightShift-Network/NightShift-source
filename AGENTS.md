# Repository Guidelines

## Project Structure

NightShift is a Node.js/Express proxy. `server.js` serves the app, a styled 404 page for unmatched routes, and `/wisp/` WebSocket upgrades. `public/` holds the interface and Scramjet service worker; `index.html`, `style.css`, and `app.js` make up the proxy UI, while `games.html` is a separate full-page, headless LuminSDK interactive entertainment catalog and player. The main UI has full-screen sidebar sections for Browser, Play, and quick cloaking. Epoxy and libcurl are selectable transports. Frontend development uses the plain files in `public/`; `scripts/publish-proxy.mjs` transforms them for the public distribution repository.

## Development Commands

- `npm install` installs dependencies.
- `npm start` runs NightShift on port 3000; set `PORT` to change it.
- `npm run build:proxy -- /path/to/output` creates the minified and obfuscated distribution in a separate output directory.
- `npm run publish:proxy` builds and pushes the distribution to `NightShift-Network/NightShift-proxy`.
- `./publish.sh` checks the local publish prerequisites, installs dependencies, and runs the full proxy publish.
- PM2 deployments should restart the named process after server changes: `pm2 restart nightshift`.

No lint or automated test scripts are configured. `publish.sh` installs the frontend transformation tools before publishing.

## Style and Testing

Use two spaces in JavaScript, JSON, HTML, and CSS. Use server ES modules, `camelCase` in JavaScript, and kebab-case for CSS classes and IDs. Keep dependencies minimal and follow existing `localStorage` patterns for bookmarks, search, shortcuts, and settings. The bookmarks bar should remain hidden when the saved list is empty. No test framework is configured; document commands for tests added under `tests/`. Manually check affected UI and proxy behavior. For Interactive Entertainment changes, check search, pagination, launch/close, and dark styling in `/games.html`.

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

Keep secrets and host-specific settings out of source control; use environment variables such as `PORT`. The proxy publisher reads `PROXY_REPO_TOKEN` from the local `.env` file, which is ignored by Git. Use a token with Contents read/write access to `NightShift-proxy`. The publisher passes it to a temporary Git askpass helper and does not save it in Git configuration or the remote URL. Never commit, print, or otherwise copy the token into source files. Preserve `/wisp/` and service-worker behavior. `server.js` intentionally omits `Cross-Origin-Embedder-Policy`; `require-corp` or `credentialless` can block interactive entertainment iframes. A proxy/CDN may add COEP; Nginx `proxy_hide_header` does not override its own `add_header`.

## Source and Distribution Repositories

`NightShift-source` is the canonical, readable source repository. `NightShift-proxy` receives generated files; JavaScript in `public/` is obfuscated, HTML and CSS are minified, and `SOURCE_COMMIT.txt` records the source revision. Publish only from the source checkout. Commit source changes before publishing so the generated files and recorded revision match committed source.

### Publish workflow

1. Work from the `NightShift-source` checkout. Confirm `origin` points to `https://github.com/NightShift-Network/NightShift-source.git` with `git remote -v`.
2. Create a fine-grained GitHub token with Contents read/write access to `NightShift-proxy`. Add it to the local `.env` as `PROXY_REPO_TOKEN=<token>`. Never paste the token into commands, chat, or tracked files.
3. Confirm `.env` is ignored with `git check-ignore -q .env`. If this exits nonzero, stop and fix `.gitignore` before adding a token. `git status --short` should not list `.env`.
4. Commit the intended source changes on `main`:

```sh
git add -A
git commit -m "Describe the source change"
```

5. Run `./publish.sh` from the source checkout. It verifies the source remote is `NightShift-source`, the current branch is `main`, and the worktree is clean; installs runtime and frontend transformation dependencies; pushes source `main` using the normal Git credentials configured for `origin`; then clones `NightShift-proxy` temporarily, commits generated changes, and pushes proxy `main` using `PROXY_REPO_TOKEN`.
6. Open both repositories and verify their latest commits. In `NightShift-proxy`, check the generated README and `SOURCE_COMMIT.txt`; the recorded source commit should match `git rev-parse HEAD` in the source checkout.

If `publish.sh` says the worktree is dirty, commit the intended source changes, then rerun it. If the source push fails, check that `origin` authentication has write access to `NightShift-source` and that remote `main` can be fast-forwarded to local `main`; reconcile divergent histories before retrying. The proxy publish is not attempted after a source push failure. If the proxy push fails, confirm the token is valid, has Contents read/write access to `NightShift-proxy`, and has not expired; replace it in `.env` without printing it, then rerun. A retry pushes source `main` again and regenerates the proxy distribution. If dependency installation fails, resolve the Node.js/npm or network issue and rerun. The publish script removes its temporary proxy checkout on success or failure, so retrying starts with a fresh clone.

Treat the proxy repository as generated output: make fixes in `NightShift-source`, then publish again. Do not copy distribution files back into the source repo or edit generated proxy files by hand. To create a local build without publishing, use `npm run build:proxy -- /path/to/output`.

## Interactive Entertainment and Service Worker

The Play link opens `public/games.html`, whose page title is Interactive Entertainment. It uses LuminSDK headless mode and builds its themed catalog/player with `getGames`, `getImageUrl`, and `getGameUrl`; the standard UI is inside Shadow DOM. Entertainment URLs are single-use; request a fresh one per launch. `public/sw.js` routes Scramjet's same-origin requests, proxies static cross-origin subresources (images, fonts, audio, and video) from proxied browser frames, and passes SDK/API requests directly to the browser. Preserve the interactive entertainment bypass. For Lumin failures, inspect Firefox Network details; cross-origin `responseStatus: 0` alone does not prove failure.

## Current Interface Features

The Browser, Play, and Cloak sections fill the app viewport and are selected from the sidebar. Cloaking preferences include a favorite method, a configurable page behind the cloaked tab, and custom tab title/icon values. Bookmark and settings data are stored locally and can be imported or exported; preserve validation and avoid overwriting unrelated browser storage. Sites that load best with a particular transport remember it per domain under `nightshift-site-transports`; the retry button pins a host to the alternate transport, and changing the global transport in Settings clears the remembered list. Tab history tracks in-frame page changes (link clicks, redirects, and SPA pushState) by decoding the proxied frame's destination from its Scramjet URL, so Back/Forward walk a normal browsing session. The bookmark bar is rendered only when at least one bookmark exists. The home footer credits `palmtree890` with a link to the GitHub profile and a SOURCE link to `NightShift-Network/NightShift-source`.

## Product Naming

Use NightShift as the product name in user-facing branding where it reads naturally. Keep technical descriptions accurate about proxy behavior.
In user-facing copy, refer to NightShift as a browser where it reads naturally.

## Roadmap: Tor and Onion Support

Tor and `.onion` access are planned, not implemented. Destination connections originate from the NightShift host. Current Wisp integration connects directly and does not expose an upstream SOCKS option, so installing Tor alone is insufficient. Any implementation must route onion hostnames through Tor SOCKS without ordinary DNS or direct fallback, clearly state whether Tor covers onion-only or all traffic, and fail closed when Tor is unavailable. Server-side Tor does not anonymize a user's connection to NightShift. Verify both Epoxy and libcurl paths before documenting support.
