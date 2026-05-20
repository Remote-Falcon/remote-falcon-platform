#!/usr/bin/env bash
# Wrapper that runs apply.py inside a local venv. Same pattern as
# ops/posthog-alerts/apply.sh and ops/do-monitoring/apply.sh.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

VENV="${RF_POSTHOG_DASHBOARDS_VENV:-$HOME/.cache/rf-posthog-dashboards-venv}"

if [ ! -x "$VENV/bin/python" ]; then
  echo "Creating venv at $VENV (one-time setup)..."
  mkdir -p "$(dirname "$VENV")"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --upgrade pip
  "$VENV/bin/pip" install --quiet pyyaml
fi

exec "$VENV/bin/python" ops/posthog-dashboards/apply.py "$@"
