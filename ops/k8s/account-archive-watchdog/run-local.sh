#!/usr/bin/env bash
# Local smoke-test for the account-archive-watchdog CronJob.
#
# Extracts the inline Python script from cronjob.yml and runs it in a
# local docker container (same image: python:3.12-alpine) against the
# real PostHog + Discord. Same pattern as
# ops/k8s/posthog-daily-digest/run-local.sh and
# ops/k8s/mongo-backup-watchdog/run-local.sh.
#
# Required vars in ops/.env.dev:
#   POSTHOG_API_KEY, DISCORD_ALERTS_WEBHOOK
#
# Usage:
#   ./ops/k8s/account-archive-watchdog/run-local.sh             # run the watchdog, post to Discord
#   ./ops/k8s/account-archive-watchdog/run-local.sh --dry-print  # neuter Discord webhook; print only
#   ./ops/k8s/account-archive-watchdog/run-local.sh test-ping    # synthetic Discord ping; skip PostHog
#   WINDOW_HOURS=0 ./ops/k8s/account-archive-watchdog/run-local.sh   # force the alert path (will alert)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

ENV_FILE="${ENV_FILE:-ops/.env.dev}"
if [ ! -f "$ENV_FILE" ]; then
  echo "ERROR: $ENV_FILE not found." >&2
  echo "Set ENV_FILE=path/to/your/env or create ops/.env.dev." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

mode="${1:-check}"

if [ "$mode" = "test-ping" ]; then
  : "${DISCORD_ALERTS_WEBHOOK:?missing in $ENV_FILE}"
  echo "-> Sending synthetic test ping to Discord webhook (no PostHog query)..."
  docker run --rm \
    -e DISCORD_WEBHOOK="$DISCORD_ALERTS_WEBHOOK" \
    alpine:3.20 \
    /bin/sh -uc '
      apk add --no-cache curl jq >/dev/null
      jq -n "{
        embeds: [{
          title: \"[TEST] account-archive-watchdog alert pipeline (local)\",
          description: \"Synthetic ping from run-local.sh on your laptop. Confirms the Discord webhook URL is valid.\",
          color: 3447003
        }]
      }" | curl -sS -X POST -H "Content-Type: application/json" -d @- "$DISCORD_WEBHOOK"
      echo "Test ping sent."
    '
  exit 0
fi

: "${POSTHOG_API_KEY:?missing in $ENV_FILE}"
: "${DISCORD_ALERTS_WEBHOOK:?missing in $ENV_FILE}"

# If --dry-print is passed, neuter the Discord webhook so the script
# logs the embed it would have posted but the POST fails silently.
WEBHOOK="$DISCORD_ALERTS_WEBHOOK"
if [ "$mode" = "--dry-print" ]; then
  WEBHOOK="https://example.invalid/dry-print"
  echo "-> Dry-print mode: Discord POST will fail silently; no embed posted."
fi

WINDOW_HOURS="${WINDOW_HOURS:-25}"

# Extract the watchdog script from the canonical CronJob manifest so
# this helper stays drift-free with what actually runs in the cluster.
SCRIPT=$(python3 - <<'PY'
import yaml
with open("ops/k8s/account-archive-watchdog/cronjob.yml") as f:
    doc = list(yaml.safe_load_all(f))[0]
print(doc["spec"]["jobTemplate"]["spec"]["template"]["spec"]["containers"][0]["args"][0])
PY
)

echo "-> Running account-archive-watchdog locally (WINDOW_HOURS=$WINDOW_HOURS, service=remote-falcon-account-archive)..."
docker run --rm \
  -e POSTHOG_HOST="${POSTHOG_HOST:-https://us.posthog.com}" \
  -e POSTHOG_PROJECT_ID="${POSTHOG_PROJECT_ID:-425428}" \
  -e POSTHOG_API_KEY="$POSTHOG_API_KEY" \
  -e DISCORD_WEBHOOK="$WEBHOOK" \
  -e SERVICE_NAME="remote-falcon-account-archive" \
  -e WINDOW_HOURS="$WINDOW_HOURS" \
  python:3.12-alpine \
  /bin/sh -uec "$SCRIPT"
