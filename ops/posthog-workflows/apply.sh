#!/usr/bin/env bash
# Wrapper that runs wire-drip-templates.py inside a local venv. Same
# pattern as ops/posthog-dashboards/apply.sh and ops/posthog-alerts/apply.sh.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

VENV="${RF_POSTHOG_WORKFLOWS_VENV:-$HOME/.cache/rf-posthog-workflows-venv}"

if [ ! -x "$VENV/bin/python" ]; then
  echo "Creating venv at $VENV (one-time setup)..."
  mkdir -p "$(dirname "$VENV")"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --upgrade pip
  "$VENV/bin/pip" install --quiet pyyaml
fi

exec "$VENV/bin/python" ops/posthog-workflows/wire-drip-templates.py "$@"
