#!/usr/bin/env bash
#
# upgrade.sh — pull latest monorepo HEAD + rebuild the running stack.
#
# Run from anywhere; operates relative to its own location.
# Use this for routine updates. For first-time setup, use install.sh.

set -euo pipefail

cd "$(dirname "$0")"

ok()   { printf '\033[1;32m✓\033[0m %s\n' "$*"; }
info() { printf '\033[1;34m·\033[0m %s\n' "$*"; }
err()  { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; }

# Find monorepo root by walking up looking for .git
ROOT="$(pwd)"
while [ "$ROOT" != "/" ] && [ ! -d "$ROOT/.git" ]; do
  ROOT="$(dirname "$ROOT")"
done
if [ ! -d "$ROOT/.git" ]; then
  err "Couldn't locate the monorepo's .git directory. Are you inside a clone?"
  exit 1
fi

info "Pulling latest from monorepo at $ROOT..."
git -C "$ROOT" pull --ff-only

info "Rebuilding stack..."
docker compose -f docker-compose.yaml up -d --build

ok "Upgrade complete."
echo
echo "  Logs: docker compose -f $(pwd)/docker-compose.yaml logs -f"
