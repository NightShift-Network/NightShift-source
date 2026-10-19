#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$repo_root"

if [[ "$(git rev-parse --show-toplevel)" != "$repo_root" ]]; then
  echo "Run publish.sh from the NightShift-source repository root." >&2
  exit 1
fi

if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Switch to the main branch before publishing both repositories." >&2
  exit 1
fi

origin_url="$(git remote get-url origin)"
shopt -s nocasematch
case "$origin_url" in
  https://github.com/NightShift-Network/NightShift-source.git|https://github.com/NightShift-Network/NightShift-source|git@github.com:NightShift-Network/NightShift-source.git|ssh://git@github.com/NightShift-Network/NightShift-source.git)
    ;;
  *)
    echo "origin must point to NightShift-Network/NightShift-source." >&2
    exit 1
    ;;
esac

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
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Dependency installation changed tracked files. Review and commit those changes, then rerun publish.sh." >&2
  exit 1
fi

echo "Pushing NightShift-source main..."
git push origin main

echo "Publishing generated NightShift-proxy main..."
npm run publish:proxy
