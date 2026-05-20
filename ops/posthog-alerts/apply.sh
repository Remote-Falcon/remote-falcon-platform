#!/usr/bin/env bash
# Wrapper that runs apply.py inside a local venv, sidestepping PEP 668's
# "externally-managed-environment" rejection on Homebrew Python.
#
# The venv is created once at $RF_POSTHOG_ALERTS_VENV (default
# ~/.cache/rf-posthog-alerts-venv) and reused on subsequent runs. To
# rebuild it from scratch, delete the dir.
#
# All flags are forwarded to apply.py:
#   ./ops/posthog-alerts/apply.sh             # dry-run
#   ./ops/posthog-alerts/apply.sh --apply     # reconcile
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

VENV="${RF_POSTHOG_ALERTS_VENV:-$HOME/.cache/rf-posthog-alerts-venv}"

if [ ! -x "$VENV/bin/python" ]; then
  echo "Creating venv at $VENV (one-time setup)..."
  mkdir -p "$(dirname "$VENV")"
  python3 -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --upgrade pip
  "$VENV/bin/pip" install --quiet pyyaml
fi

exec "$VENV/bin/python" ops/posthog-alerts/apply.py "$@"
