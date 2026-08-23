#!/usr/bin/env bash
# Wrapper that runs sync-template-text.py inside the same venv apply.sh uses.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

VENV="${RF_POSTHOG_WORKFLOWS_VENV:-$HOME/.cache/rf-posthog-workflows-venv}"

if [ ! -x "$VENV/bin/python" ]; then
  echo "Creating venv at $VENV (one-time setup)..."
  mkdir -p "$(dirname "$VENV")"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --upgrade pip
fi

exec "$VENV/bin/python" ops/posthog-workflows/sync-template-text.py "$@"
