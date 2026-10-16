#!/usr/bin/env bash
# Preview or apply ops/k8s/ingress-nginx/values.yaml to the prod release.
#
#   ./apply.sh          read-only: drift check + kubectl diff + helm dry-run
#   ./apply.sh apply    helm upgrade for real, then wait for the rollout
#
# Run against the prod context (do-nyc3-remote-falcon). Apply in daylight,
# never during show hours (5pm-2am ET): this is the only ingress for every
# service. Not wired into CI on purpose.
set -euo pipefail

RELEASE=ingress-nginx
NS=ingress-nginx
CHART=ingress-nginx
REPO=https://kubernetes.github.io/ingress-nginx
VERSION=4.15.1   # pinned to what's installed; bumping the chart is a separate change
DIR="$(cd "$(dirname "$0")" && pwd)"
VALUES="$DIR/values.yaml"
MODE="${1:-diff}"

ctx=$(kubectl config current-context)
echo "context: $ctx"

# 1. Drift check: the release's current user values must be empty (the
#    2026-04-24 install) or exactly this file (a previous run). Anything else
#    means someone changed the release by hand; fold it into values.yaml first.
current=$(helm get values "$RELEASE" -n "$NS" -o json)
python3 - "$VALUES" "$current" <<'PY'
import json, sys, yaml
want = yaml.safe_load(open(sys.argv[1])) or {}
have = json.loads(sys.argv[2]) or {}
if have and have != want:
    print("DRIFT: live release values differ from values.yaml:")
    print(json.dumps(have, indent=2))
    sys.exit(1)
print("values: live release is", "unchanged from install (null)" if not have else "already at values.yaml")
PY

deployed=$(helm list -n "$NS" -f "^${RELEASE}\$" -o json | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["chart"])')
if [ "$deployed" != "$CHART-$VERSION" ]; then
  echo "chart drift: deployed $deployed, this script pins $CHART-$VERSION"; exit 1
fi

if [ "$MODE" != "apply" ]; then
  # 2. What would change, field by field (server-side dry run, nothing written).
  #    Uses helm's field manager so the diff matches helm's server-side apply.
  #    Known noise: every object shows its meta.helm.sh/release-* annotations
  #    as removed. helm adds those at upgrade time and `helm template` doesn't
  #    render them, so ignore those lines. Hooks (the admission-webhook cert
  #    jobs, which helm re-runs and deletes on every upgrade) are left out.
  echo "--- kubectl diff (helm template vs live) ---"
  helm template "$RELEASE" "$CHART" --repo "$REPO" --version "$VERSION" \
    -n "$NS" -f "$VALUES" --no-hooks \
    | kubectl diff -n "$NS" --server-side --field-manager=helm --force-conflicts -f - || true
  # 3. helm's own server-side dry run of the exact upgrade command.
  echo "--- helm upgrade --dry-run=server ---"
  helm upgrade "$RELEASE" "$CHART" --repo "$REPO" --version "$VERSION" \
    -n "$NS" --reset-values -f "$VALUES" --dry-run=server >/dev/null
  echo "dry run OK. Re-run with 'apply' to upgrade."
  exit 0
fi

read -r -p "helm upgrade $RELEASE on $ctx? type 'yes': " ok
[ "$ok" = "yes" ] || { echo "aborted"; exit 1; }

helm upgrade "$RELEASE" "$CHART" --repo "$REPO" --version "$VERSION" \
  -n "$NS" --reset-values -f "$VALUES" --wait --timeout 10m
kubectl -n "$NS" rollout status deployment/ingress-nginx-controller --timeout=10m
kubectl -n "$NS" get pods -o wide -l app.kubernetes.io/component=controller
kubectl -n "$NS" get pdb
