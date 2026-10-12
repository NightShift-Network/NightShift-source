#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$repo_root"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm are required to publish NightShift Proxy." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "Create .env and add PROXY_REPO_TOKEN before publishing." >&2
  exit 1
fi

if ! git check-ignore -q .env; then
  echo ".env must be ignored by Git before it can store the proxy token." >&2
  exit 1
fi

if ! grep -Eq '^[[:space:]]*PROXY_REPO_TOKEN[[:space:]]*=[[:space:]]*[^[:space:]]' .env; then
  echo "Set PROXY_REPO_TOKEN in .env before publishing." >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Commit the source changes before publishing so SOURCE_COMMIT.txt points to the published code." >&2
  exit 1
fi

npm install
npm install --no-save --package-lock=false clean-css@5 html-minifier-terser@7 javascript-obfuscator@4
npm run publish:proxy
