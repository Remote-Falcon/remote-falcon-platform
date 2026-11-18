#!/usr/bin/env bash
# Preview or apply ops/k8s/ingress-nginx/values.yaml to the prod release.
#
#   ./apply.sh [diff] [PROFILE]   read-only: drift check + kubectl diff + helm dry-run
#   ./apply.sh apply [PROFILE]    helm upgrade for real, then wait for the rollout
#
# PROFILE is a season profile from ops/season/profile.conf (default: its
# `active` line). Its ingress-nginx row sets the controller replica bounds:
# MIN == MAX is a fixed replicaCount (no HPA, as off-season); MIN < MAX turns
# on the chart's HPA (CPU only). helm gets values.yaml plus that overlay, so
# values.yaml stays the base and the profile is the knob.
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
SEASON="$DIR/../../season/resolve.sh"
PROFILE="${2:-$(bash "$SEASON" --active)}"
DEPLOY=ingress-nginx-controller

# Season overlay for one profile, as JSON (helm reads JSON as YAML). The
# memory target is nulled on purpose: the chart default (50% of a 90Mi
# request) sits below the controller's normal footprint and would pin the
# HPA at max.
overlay() {
  local sizes min max
  sizes=$(bash "$SEASON" -p "$1" ingress-nginx)
  min=$(echo "$sizes" | sed -n 's/^replicas_min=//p')
  max=$(echo "$sizes" | sed -n 's/^replicas_max=//p')
  if [ "$min" = "$max" ]; then
    printf '{"controller":{"replicaCount":%s}}\n' "$min"
  else
    printf '{"controller":{"replicaCount":%s,"autoscaling":{"enabled":true,"minReplicas":%s,"maxReplicas":%s,"targetCPUUtilizationPercentage":70,"targetMemoryUtilizationPercentage":null}}}\n' \
      "$min" "$min" "$max"
  fi
}
OVERLAY="$(mktemp -t ingress-season.XXXXXX)"
trap 'rm -f "$OVERLAY"' EXIT
overlay "$PROFILE" >"$OVERLAY"
echo "season profile: $PROFILE -> $(cat "$OVERLAY")"
autoscaled=false
if grep -q '"autoscaling"' "$OVERLAY"; then autoscaled=true; fi

ctx=$(kubectl config current-context)
echo "context: $ctx"

# 1. Drift check: the release's current user values must be empty (the
#    2026-04-24 install), exactly values.yaml (a run before season profiles),
#    or values.yaml plus any season profile's overlay (a previous run).
#    Anything else means someone changed the release by hand; fold it into
#    values.yaml first. Nulls are ignored on both sides (helm may drop them
#    when it stores user values).
current=$(helm get values "$RELEASE" -n "$NS" -o json)
overlays=$(for p in $(bash "$SEASON" --list); do printf '%s\t%s\n' "$p" "$(overlay "$p")"; done)
python3 - "$VALUES" "$current" "$overlays" <<'PY'
import json, sys, yaml

def merge(a, b):
    out = dict(a)
    for k, v in b.items():
        out[k] = merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else v
    return out

def strip(v):
    return {k: strip(x) for k, x in v.items() if x is not None} if isinstance(v, dict) else v

base = yaml.safe_load(open(sys.argv[1])) or {}
have = strip(json.loads(sys.argv[2]) or {})
if not have:
    print("values: live release is unchanged from install (null)"); sys.exit(0)
if have == strip(base):
    print("values: live release is at values.yaml (no season overlay yet)"); sys.exit(0)
for line in sys.argv[3].splitlines():
    name, ov = line.split("\t", 1)
    if have == strip(merge(base, json.loads(ov))):
        print("values: live release is at values.yaml + season profile", name); sys.exit(0)
print("DRIFT: live release values match neither values.yaml nor any season profile:")
print(json.dumps(have, indent=2))
sys.exit(1)
PY

deployed=$(helm list -n "$NS" -f "^${RELEASE}\$" -o json | python3 -c 'import json,sys;print(json.load(sys.stdin)[0]["chart"])')
if [ "$deployed" != "$CHART-$VERSION" ]; then
  echo "chart drift: deployed $deployed, this script pins $CHART-$VERSION"; exit 1
fi

# Replica hand-off when a profile switches the HPA on or off. helm applies
# server-side. With autoscaling on, the chart stops rendering spec.replicas,
# and a field dropped by its only owner falls back to the default of ONE pod
# for the only ingress. So before that upgrade a second field manager
# (season-handoff) co-owns the current count (same value, no conflict) and
# the field survives until the HPA manages it. Switching the HPA off needs
# --force-conflicts so helm can take spec.replicas back from the HPA.
hpa_live=false
if kubectl -n "$NS" get hpa "$DEPLOY" >/dev/null 2>&1; then hpa_live=true; fi
force=()
if $autoscaled && ! $hpa_live; then
  echo "hand-off: HPA turns on; field manager season-handoff co-owns spec.replicas before the upgrade"
elif ! $autoscaled && $hpa_live; then
  echo "hand-off: HPA turns off; upgrade runs with --force-conflicts to reclaim spec.replicas"
  force=(--force-conflicts)
fi
handoff() {
  local cur
  cur=$(kubectl -n "$NS" get deployment "$DEPLOY" -o jsonpath='{.spec.replicas}')
  printf 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: %s\n  namespace: %s\nspec:\n  replicas: %s\n' \
    "$DEPLOY" "$NS" "$cur" \
    | kubectl apply --server-side --field-manager=season-handoff -f -
}

if [ "$MODE" != "apply" ]; then
  # 2. What would change, field by field (server-side dry run, nothing written).
  #    Uses helm's field manager so the diff matches helm's server-side apply.
  #    Known noise: every object shows its meta.helm.sh/release-* annotations
  #    as removed. helm adds those at upgrade time and `helm template` doesn't
  #    render them, so ignore those lines. Hooks (the admission-webhook cert
  #    jobs, which helm re-runs and deletes on every upgrade) are left out.
  #    When the HPA turns on, this diff shows spec.replicas removed; apply
  #    mode runs the hand-off above first so the count is kept.
  echo "--- kubectl diff (helm template vs live) ---"
  helm template "$RELEASE" "$CHART" --repo "$REPO" --version "$VERSION" \
    -n "$NS" -f "$VALUES" -f "$OVERLAY" --no-hooks \
    | kubectl diff -n "$NS" --server-side --field-manager=helm --force-conflicts -f - || true
  # 3. helm's own server-side dry run of the exact upgrade command.
  echo "--- helm upgrade --dry-run=server ---"
  helm upgrade "$RELEASE" "$CHART" --repo "$REPO" --version "$VERSION" \
    -n "$NS" --reset-values -f "$VALUES" -f "$OVERLAY" ${force[@]+"${force[@]}"} --dry-run=server >/dev/null
  echo "dry run OK. Re-run with 'apply $PROFILE' to upgrade."
  exit 0
fi

read -r -p "helm upgrade $RELEASE on $ctx with season profile $PROFILE? type 'yes': " ok
[ "$ok" = "yes" ] || { echo "aborted"; exit 1; }

if $autoscaled && ! $hpa_live; then handoff; fi
helm upgrade "$RELEASE" "$CHART" --repo "$REPO" --version "$VERSION" \
  -n "$NS" --reset-values -f "$VALUES" -f "$OVERLAY" ${force[@]+"${force[@]}"} --wait --timeout 10m
kubectl -n "$NS" rollout status deployment/"$DEPLOY" --timeout=10m
kubectl -n "$NS" get pods -o wide -l app.kubernetes.io/component=controller
kubectl -n "$NS" get pdb
kubectl -n "$NS" get hpa 2>/dev/null || true
