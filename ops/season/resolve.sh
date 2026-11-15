#!/usr/bin/env bash
# Resolve one service's sizes from the season profile file.
#
#   resolve.sh [-f FILE] [-p PROFILE] SERVICE   key=value lines (GITHUB_OUTPUT shape)
#   resolve.sh [-f FILE] --active               name of the active profile
#   resolve.sh [-f FILE] --list                 every profile name, one per line
#   resolve.sh [-f FILE] --check                validate every row of every profile
#
# FILE defaults to profile.conf next to this script. PROFILE defaults to the
# file's `active` line; "" and "active" also mean that. Every call validates
# the whole file first, so a typo fails the deploy before anything is applied.
#
# Output keys: replicas replicas_min replicas_max req_mem req_cpu lim_mem
# lim_cpu. A column set to "-" (not managed here) is left out.
#
# Plain bash + POSIX awk: runs the same on GitHub's ubuntu runners and macOS.
# Test: ops/season/resolve.test.sh
set -euo pipefail

file="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/profile.conf"
profile="active"
mode=resolve
service=""

usage() { echo "usage: resolve.sh [-f FILE] [-p PROFILE] SERVICE | --active | --list | --check" >&2; exit 2; }

while (( $# )); do
  case "$1" in
    -f) file="${2:?}"; shift 2 ;;
    -p) profile="${2-}"; shift 2 ;;
    --active) mode=active; shift ;;
    --check) mode=check; shift ;;
    --list) mode=list; shift ;;
    -h|--help) usage ;;
    -*) usage ;;
    *) service="$1"; shift ;;
  esac
done
[[ "$mode" == resolve && -z "$service" ]] && usage
[[ -z "$profile" ]] && profile="active"
[[ -r "$file" ]] || { echo "resolve.sh: cannot read $file" >&2; exit 2; }

awk -v mode="$mode" -v want_profile="$profile" -v want_service="$service" '
function die(msg) { print "resolve.sh: " msg > "/dev/stderr"; failed = 1; exit 1 }
function whole(v, where) {
  if (v !~ /^[0-9]+$/) die(where ": \"" v "\" is not a whole number")
  return v + 0
}
BEGIN {
  base = "off-season"
  nkeys = split("replicas replicas_min replicas_max req_mem req_cpu lim_mem lim_cpu", key, " ")
}
{ sub(/#.*/, "") }
NF == 0 { next }
$1 == "active" {
  if (NF != 2) die("line " NR ": expected \"active <profile>\"")
  active = $2; next
}
{
  if (NF != 9) die("line " NR ": expected 9 columns, got " NF)
  p = $1; s = $2
  if ((p, s) in seen) die("line " NR ": duplicate row " p " " s)
  seen[p, s] = 1
  if (!(p in profiles)) { profiles[p] = 1; order[++np] = p }
  rows[++nr] = p SUBSEP s
  for (i = 1; i <= nkeys; i++) val[p, s, i] = $(i + 2)
  if (p == base) { services[s] = 1; sorder[++ns] = s }
}
END {
  if (failed) exit 1
  if (active == "") die("no \"active\" line")
  if (!(base in profiles)) die("no " base " rows")

  # Validate every row: base rows complete, overrides only for base services.
  for (r = 1; r <= nr; r++) {
    split(rows[r], ps, SUBSEP); p = ps[1]; s = ps[2]
    if (p == base) {
      for (i = 1; i <= nkeys; i++)
        if (val[p, s, i] == ".") die(base " must fill every column (" s " " key[i] " is \".\")")
    } else if (!(s in services)) {
      die(p ": \"" s "\" is not in " base)
    }
  }
  # Resolve every profile x service and check the numbers.
  for (j = 1; j <= np; j++) {
    p = order[j]
    for (k = 1; k <= ns; k++) {
      s = sorder[k]
      for (i = 1; i <= nkeys; i++) {
        v = ((p, s, i) in val) ? val[p, s, i] : "."
        if (v == ".") v = val[base, s, i]
        res[p, s, i] = v
      }
      where = p " " s
      lo = whole(res[p, s, 2], where " min"); hi = whole(res[p, s, 3], where " max")
      whole(res[p, s, 1], where " replicas")
      if (lo > hi) die(where ": min " lo " > max " hi)
    }
  }

  if (want_profile == "active") want_profile = active
  if (!(active in profiles)) die("unknown profile \"" active "\" (the active line)")
  if (!(want_profile in profiles)) die("unknown profile \"" want_profile "\"")

  if (mode == "active") { print active; exit 0 }
  if (mode == "check") exit 0
  if (mode == "list") { for (j = 1; j <= np; j++) print order[j]; exit 0 }
  if (!(want_service in services)) die("unknown service \"" want_service "\"")
  for (i = 1; i <= nkeys; i++)
    if (res[want_profile, want_service, i] != "-") print key[i] "=" res[want_profile, want_service, i]
}
' "$file"
