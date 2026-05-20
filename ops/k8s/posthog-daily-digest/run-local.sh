#!/usr/bin/env bash
# Local smoke-test for the posthog-daily-digest CronJob.
#
# Extracts the inline Python script from cronjob.yml and runs it in a
# local docker container (same image: python:3.12-alpine) against the
# real PostHog + Discord. Same pattern as
# ops/k8s/mongo-backup-watchdog/run-local.sh.
#
# Required vars in ops/.env.dev:
#   POSTHOG_API_KEY, DISCORD_ALERTS_WEBHOOK
#
# Usage:
#   ./ops/k8s/posthog-daily-digest/run-local.sh             # run the digest, post to Discord
#   ./ops/k8s/posthog-daily-digest/run-local.sh --dry-print  # print embed payload, skip POST
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

ENV_FILE="${ENV_FILE:-ops/.env.dev}"
[ -f "$ENV_FILE" ] || { echo "ERROR: $ENV_FILE not found." >&2; exit 1; }

set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

: "${POSTHOG_API_KEY:?missing in $ENV_FILE}"
: "${DISCORD_ALERTS_WEBHOOK:?missing in $ENV_FILE}"

# If --dry-print is passed, neuter the Discord webhook so the script
# logs but doesn't POST.
WEBHOOK="$DISCORD_ALERTS_WEBHOOK"
if [ "${1:-}" = "--dry-print" ]; then
  WEBHOOK="https://example.invalid/dry-print"
  echo "-> Dry-print mode: Discord POST will fail silently; no embed posted."
fi

SCRIPT=$(python3 - <<'PY'
import yaml
with open("ops/k8s/posthog-daily-digest/cronjob.yml") as f:
    doc = list(yaml.safe_load_all(f))[0]
print(doc["spec"]["jobTemplate"]["spec"]["template"]["spec"]["containers"][0]["args"][0])
PY
)

echo "-> Running daily digest locally against prod data..."
docker run --rm \
  -e POSTHOG_HOST="${POSTHOG_HOST:-https://us.posthog.com}" \
  -e POSTHOG_PROJECT_ID="${POSTHOG_PROJECT_ID:-425428}" \
  -e POSTHOG_API_KEY="$POSTHOG_API_KEY" \
  -e DISCORD_WEBHOOK="$WEBHOOK" \
  python:3.12-alpine \
  /bin/sh -uec "$SCRIPT"
