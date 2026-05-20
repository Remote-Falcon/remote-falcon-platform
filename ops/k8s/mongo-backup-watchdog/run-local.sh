#!/usr/bin/env bash
# Local smoke-test for the mongo-backup-watchdog.
#
# Extracts the inline script from cronjob.yml and runs it in a local
# docker container (same image: python:3.12-alpine) against the real
# prod bucket and Discord webhook. Validates the alert logic + Discord
# wiring without going through the cluster.
#
# Required vars in ops/.env.dev (or whatever ENV_FILE points at):
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, DISCORD_ALERTS_WEBHOOK
#
# Usage:
#   ./ops/k8s/mongo-backup-watchdog/run-local.sh             # real check (no alert if fresh)
#   ./ops/k8s/mongo-backup-watchdog/run-local.sh diag         # python+boto3 diagnostic with full traceback
#   ./ops/k8s/mongo-backup-watchdog/run-local.sh list        # raw `aws s3 ls` against the bucket (debug)
#   ./ops/k8s/mongo-backup-watchdog/run-local.sh test-ping   # send a synthetic ping to verify webhook
#   THRESHOLD_HOURS=0 ./ops/k8s/mongo-backup-watchdog/run-local.sh   # force-stale path (will alert)

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

: "${AWS_ACCESS_KEY_ID:?missing in $ENV_FILE}"
: "${AWS_SECRET_ACCESS_KEY:?missing in $ENV_FILE}"
: "${DISCORD_ALERTS_WEBHOOK:?missing in $ENV_FILE}"

mode="${1:-check}"

if [ "$mode" = "diag" ]; then
  # Runs boto3 directly against DO Spaces with verbose error reporting.
  # Use this when the watchdog or `list` mode emits opaque errors —
  # boto3 prints full Python tracebacks, so we can see whether the issue
  # is auth, region, endpoint, or bucket permissions.
  DIAG_SCRIPT=$(cat <<'PYEOF'
import sys, traceback
import boto3
from botocore.exceptions import ClientError, BotoCoreError

s3 = boto3.client(
    "s3",
    endpoint_url="https://nyc3.digitaloceanspaces.com",
    region_name="us-east-1",
)

print("=== Step 1: list_buckets (auth check) ===")
try:
    resp = s3.list_buckets()
    print("Auth OK. Buckets accessible to this key:")
    for b in resp.get("Buckets", []):
        print("  - " + b["Name"])
except Exception as e:
    print("FAILED: " + type(e).__name__ + ": " + str(e))
    traceback.print_exc()
    sys.exit(1)

print()
print("=== Step 2: head_bucket rf-mongo-backup (permission check) ===")
try:
    s3.head_bucket(Bucket="rf-mongo-backup")
    print("Bucket accessible.")
except Exception as e:
    print("FAILED: " + type(e).__name__ + ": " + str(e))
    traceback.print_exc()
    sys.exit(2)

print()
print("=== Step 3: list_objects_v2 rf-mongo-backup/mongo-backups/ ===")
try:
    resp = s3.list_objects_v2(Bucket="rf-mongo-backup", Prefix="mongo-backups/")
    contents = resp.get("Contents", [])
    print("Found " + str(len(contents)) + " objects under mongo-backups/")
    for o in contents[-5:]:
        print("  " + o["Key"] + "  " + str(o["LastModified"]) + "  " + str(o["Size"]) + " bytes")
except Exception as e:
    print("FAILED: " + type(e).__name__ + ": " + str(e))
    traceback.print_exc()
    sys.exit(3)
PYEOF
)
  echo "-> Running boto3 diagnostic against DO Spaces..."
  printf '%s\n' "$DIAG_SCRIPT" | docker run --rm -i \
    -e AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
    -e AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
    -e AWS_DEFAULT_REGION="us-east-1" \
    python:3.12-alpine \
    /bin/sh -uec 'pip install --quiet --no-cache-dir --disable-pip-version-check boto3 >/dev/null && python3 -'
  exit 0
fi

if [ "$mode" = "list" ]; then
  # Uses public.ecr.aws/aws-cli/aws-cli:2 (official upstream) instead of alpine's
  # aws-cli package, which has a known compat bug with DO Spaces
  # ("argument of type 'NoneType' is not iterable" on every list op).
  echo "-> Listing s3://rf-mongo-backup/ (root) ..."
  docker run --rm \
    -e AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
    -e AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
    -e AWS_DEFAULT_REGION="us-east-1" \
    public.ecr.aws/aws-cli/aws-cli:2 \
    --endpoint-url https://nyc3.digitaloceanspaces.com s3 ls s3://rf-mongo-backup/ || true
  echo
  echo "-> Listing s3://rf-mongo-backup/mongo-backups/ (last 10) ..."
  docker run --rm \
    -e AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
    -e AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
    -e AWS_DEFAULT_REGION="us-east-1" \
    --entrypoint /bin/sh \
    public.ecr.aws/aws-cli/aws-cli:2 \
    -c 'aws --endpoint-url https://nyc3.digitaloceanspaces.com s3 ls s3://rf-mongo-backup/mongo-backups/ --recursive 2>&1 | tail -10'
  exit 0
fi

if [ "$mode" = "test-ping" ]; then
  echo "-> Sending synthetic test ping to Discord webhook (no S3 query)..."
  docker run --rm \
    -e DISCORD_WEBHOOK="$DISCORD_ALERTS_WEBHOOK" \
    alpine:3.20 \
    /bin/sh -uc '
      apk add --no-cache curl jq >/dev/null
      jq -n "{
        embeds: [{
          title: \"[TEST] mongo-backup alert pipeline (local)\",
          description: \"Synthetic ping from run-local.sh on your laptop. Confirms the Discord webhook URL is valid.\",
          color: 3447003
        }]
      }" | curl -sS -X POST -H "Content-Type: application/json" -d @- "$DISCORD_WEBHOOK"
      echo "Test ping sent."
    '
  exit 0
fi

THRESHOLD_HOURS="${THRESHOLD_HOURS:-36}"

# Extract the watchdog script from the canonical CronJob manifest so this
# helper stays drift-free with what actually runs in the cluster.
SCRIPT=$(python3 - <<'PY'
import yaml
with open('ops/k8s/mongo-backup-watchdog/cronjob.yml') as f:
    docs = list(yaml.safe_load_all(f))
print(docs[0]['spec']['jobTemplate']['spec']['template']['spec']['containers'][0]['args'][0])
PY
)

echo "-> Running watchdog locally (THRESHOLD_HOURS=$THRESHOLD_HOURS, bucket=rf-mongo-backup)..."
docker run --rm \
  -e AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
  -e AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
  -e AWS_DEFAULT_REGION="us-east-1" \
  -e S3_ENDPOINT="https://nyc3.digitaloceanspaces.com" \
  -e BUCKET="rf-mongo-backup" \
  -e PREFIX="mongo-backups/" \
  -e THRESHOLD_HOURS="$THRESHOLD_HOURS" \
  -e DISCORD_WEBHOOK="$DISCORD_ALERTS_WEBHOOK" \
  python:3.12-alpine \
  /bin/sh -uec "$SCRIPT"
