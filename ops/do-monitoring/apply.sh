#!/usr/bin/env bash
# Wrapper that runs apply.py inside a local venv, same pattern as
# ops/posthog-alerts/apply.sh. Sidesteps Homebrew Python's PEP 668
# lock-out without polluting the system Python.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

VENV="${RF_DO_MONITORING_VENV:-$HOME/.cache/rf-do-monitoring-venv}"

if [ ! -x "$VENV/bin/python" ]; then
  echo "Creating venv at $VENV (one-time setup)..."
  mkdir -p "$(dirname "$VENV")"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --upgrade pip
  "$VENV/bin/pip" install --quiet pyyaml
fi

exec "$VENV/bin/python" ops/do-monitoring/apply.py "$@"
