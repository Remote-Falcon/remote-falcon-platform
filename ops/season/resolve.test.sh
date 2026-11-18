#!/usr/bin/env bash
# Tests for ops/season/resolve.sh against the real profile.conf plus small
# fixture files for the error paths. Runs on GNU (CI) and BSD (macOS) tools.
#
#   ops/season/resolve.test.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
resolve="$here/resolve.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

pass=0; fail=0
ok()  { pass=$((pass + 1)); printf 'ok    %s\n' "$1"; }
bad() { fail=$((fail + 1)); printf 'FAIL  %s\n%s\n' "$1" "$2"; }

# expect LABEL WANT ARGS...: stdout must equal WANT exactly, exit 0.
expect() {
  local label="$1" want="$2" got rc; shift 2
  set +e; got=$(bash "$resolve" "$@" 2>&1); rc=$?; set -e
  if (( rc == 0 )) && [[ "$got" == "$want" ]]; then ok "$label"
  else bad "$label" "      rc=$rc"$'\n'"      want: ${want//$'\n'/ }"$'\n'"      got:  ${got//$'\n'/ }"; fi
}

# refuse LABEL MESSAGE ARGS...: must exit non-zero with MESSAGE on stderr.
refuse() {
  local label="$1" msg="$2" got rc; shift 2
  set +e; got=$(bash "$resolve" "$@" 2>&1 >/dev/null); rc=$?; set -e
  if (( rc != 0 )) && [[ "$got" == *"$msg"* ]]; then ok "$label"
  else bad "$label" "      rc=$rc want stderr containing: $msg"$'\n'"      got: $got"; fi
}

row() { printf 'replicas=%s\nreplicas_min=%s\nreplicas_max=%s\nreq_mem=%s\nreq_cpu=%s\nlim_mem=%s\nlim_cpu=%s' "$@"; }

# --- off-season must equal the deploy.yml `case` it replaced, value for value,
#     so a deploy at the default profile is a no-op diff.
expect "off-season ui"              "$(row 2 2 2 64Mi  20m  128Mi 100m)" -p off-season ui
expect "off-season control-panel"   "$(row 2 2 4 256Mi 200m 512Mi 500m)" -p off-season control-panel
expect "off-season viewer"          "$(row 2 2 4 160Mi 150m 320Mi 500m)" -p off-season viewer
expect "off-season plugins-api"     "$(row 2 2 4 192Mi 250m 384Mi 750m)" -p off-season plugins-api
expect "off-season external-api"    "$(row 2 2 4 256Mi 100m 512Mi 500m)" -p off-season external-api
expect "off-season mongo-backup"    "$(row 1 1 1 128Mi 25m  750Mi 200m)" -p off-season mongo-backup
expect "off-season account-archive" "$(row 1 1 1 64Mi  10m  384Mi 100m)" -p off-season account-archive
expect "off-season ingress-nginx"   "$(printf 'replicas=2\nreplicas_min=2\nreplicas_max=2')" -p off-season ingress-nginx

# --- the checked-in active profile is season, and no -p means active.
expect "active profile name"        "season" --active
expect "profile list"               "$(printf 'off-season\nseason\npeak')" --list
expect "no -p uses active"          "$(row 2 3 8 192Mi 250m 384Mi 750m)" plugins-api
expect "-p active uses active"      "$(row 2 2 20 160Mi 150m 320Mi 500m)" -p active viewer
expect "empty -p uses active"       "$(row 2 2 20 160Mi 150m 320Mi 500m)" -p "" viewer

# --- season: viewer 2-20, plugins-api 3-8, external-api max 6, ingress 2-6.
expect "season ui"                  "$(row 2 2 2 64Mi  20m  128Mi 100m)" -p season ui
expect "season control-panel"       "$(row 2 2 4 256Mi 200m 512Mi 500m)" -p season control-panel
expect "season viewer"              "$(row 2 2 20 160Mi 150m 320Mi 500m)" -p season viewer
expect "season plugins-api"         "$(row 2 3 8 192Mi 250m 384Mi 750m)" -p season plugins-api
expect "season external-api"        "$(row 2 2 6 256Mi 100m 512Mi 500m)" -p season external-api
expect "season mongo-backup"        "$(row 1 1 1 128Mi 25m  750Mi 200m)" -p season mongo-backup
expect "season account-archive"     "$(row 1 1 1 64Mi  10m  384Mi 100m)" -p season account-archive
expect "season ingress-nginx"       "$(printf 'replicas=2\nreplicas_min=2\nreplicas_max=6')" -p season ingress-nginx

# --- peak: viewer 4-20, plugins-api 3-8, external-api max 6, ingress 3-6.
expect "peak ui"                    "$(row 2 2 2 64Mi  20m  128Mi 100m)" -p peak ui
expect "peak control-panel"         "$(row 2 2 4 256Mi 200m 512Mi 500m)" -p peak control-panel
expect "peak viewer"                "$(row 2 4 20 160Mi 150m 320Mi 500m)" -p peak viewer
expect "peak plugins-api"           "$(row 2 3 8 192Mi 250m 384Mi 750m)" -p peak plugins-api
expect "peak external-api"          "$(row 2 2 6 256Mi 100m 512Mi 500m)" -p peak external-api
expect "peak mongo-backup"          "$(row 1 1 1 128Mi 25m  750Mi 200m)" -p peak mongo-backup
expect "peak account-archive"       "$(row 1 1 1 64Mi  10m  384Mi 100m)" -p peak account-archive
expect "peak ingress-nginx"         "$(printf 'replicas=2\nreplicas_min=3\nreplicas_max=6')" -p peak ingress-nginx

# --- the whole real file validates.
expect "real file --check"          "" --check

# --- refusals
refuse "unknown profile"   "unknown profile \"xmas\""          -p xmas viewer
refuse "unknown service"   "unknown service \"gateway\""       -p off-season gateway
refuse "no service"        "usage"                           -p off-season

f="$tmp/typo.conf"
printf 'active off-season\noff-season viewer 2 2 4 1Mi 1m 2Mi 2m\npeak viwer . 4 20 . . . .\n' >"$f"
refuse "override of unknown service" "peak: \"viwer\" is not in off-season" -f "$f" --check

f="$tmp/cols.conf"
printf 'active off-season\noff-season viewer 2 2 4 1Mi 1m 2Mi\n' >"$f"
refuse "short row"         "expected 9 columns"              -f "$f" --check

f="$tmp/dot.conf"
printf 'active off-season\noff-season viewer 2 . 4 1Mi 1m 2Mi 2m\n' >"$f"
refuse "dot in off-season" "off-season must fill every column" -f "$f" --check

f="$tmp/minmax.conf"
printf 'active off-season\noff-season viewer 2 2 4 1Mi 1m 2Mi 2m\npeak viewer . 6 . . . . .\n' >"$f"
refuse "min above max"     "peak viewer: min 6 > max 4" -f "$f" --check

f="$tmp/nan.conf"
printf 'active off-season\noff-season viewer 2 2 four 1Mi 1m 2Mi 2m\n' >"$f"
refuse "non-numeric max"   "not a whole number"              -f "$f" --check

f="$tmp/dup.conf"
printf 'active off-season\noff-season viewer 2 2 4 1Mi 1m 2Mi 2m\noff-season viewer 2 2 4 1Mi 1m 2Mi 2m\n' >"$f"
refuse "duplicate row"     "duplicate row off-season viewer" -f "$f" --check

f="$tmp/noactive.conf"
printf 'off-season viewer 2 2 4 1Mi 1m 2Mi 2m\n' >"$f"
refuse "missing active"    "no \"active\" line"                -f "$f" --check

f="$tmp/badactive.conf"
printf 'active peak\noff-season viewer 2 2 4 1Mi 1m 2Mi 2m\n' >"$f"
refuse "active not defined" "unknown profile \"peak\""    -f "$f" --check

echo "passed=$pass failed=$fail"
(( fail == 0 ))
