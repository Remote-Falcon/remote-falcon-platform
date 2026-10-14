#!/usr/bin/env bash
# Fixed-instant tests for deploy-freeze.sh. Instants are given in UTC so the
# tests prove the ET conversion (EDT before Nov 1 2026, EST after) rather
# than assuming the runner's zone. Runs on GNU (CI) and BSD (macOS) date.
#
#   .github/scripts/deploy-freeze.test.sh
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
guard="$here/deploy-freeze.sh"

epoch() {
  if date -d @0 +%s >/dev/null 2>&1; then
    date -u -d "$1" +%s
  else
    date -u -j -f '%Y-%m-%dT%H:%M:%SZ' "$1" +%s
  fi
}

pass=0; fail=0
check() {
  local utc="$1" want="$2" label="$3" out rc
  set +e
  out=$(DEPLOY_FREEZE_NOW="$(epoch "$utc")" bash "$guard")
  rc=$?
  set -e
  local got=open; (( rc == 1 )) && got=frozen
  if (( rc > 1 )); then got="error($rc)"; fi
  if [[ "$got" == "$want" ]]; then
    pass=$((pass + 1)); printf 'ok    %-7s %s  %s\n' "$want" "$utc" "$label"
  else
    fail=$((fail + 1)); printf 'FAIL  want=%s got=%s %s  %s\n      %s\n' "$want" "$got" "$utc" "$label" "$out"
  fi
}

# Before the season
check 2026-10-16T23:00:00Z open   "Fri Oct 16 19:00 EDT, pre-season"
check 2026-10-29T23:00:00Z open   "Thu Oct 29 19:00 EDT, day before the season"
# Weekend freeze, Oct 30 onward
check 2026-10-30T18:59:00Z open   "Fri Oct 30 14:59 EDT, first in-season day"
check 2026-10-30T19:00:00Z frozen "Fri Oct 30 15:00 EDT, Halloween weekend freeze starts"
check 2026-10-31T23:00:00Z frozen "Sat Oct 31 19:00 EDT, Halloween"
check 2026-11-01T05:30:00Z frozen "Sun Nov 1 01:30 EDT, Halloween weekend"
check 2026-11-06T19:59:00Z open   "Fri Nov 6 14:59 EST"
check 2026-11-06T20:00:00Z frozen "Fri Nov 6 15:00 EST, weekend freeze starts"
check 2026-11-07T15:00:00Z frozen "Sat Nov 7 10:00 EST"
check 2026-11-09T13:59:00Z frozen "Mon Nov 9 08:59 EST"
check 2026-11-09T14:00:00Z open   "Mon Nov 9 09:00 EST, weekend freeze ends"
check 2026-11-10T22:00:00Z open   "Tue Nov 10 17:00 EST, weekday evening before peak"
check 2026-11-25T21:00:00Z open   "Wed Nov 25 16:00 EST, day before peak"
# Peak: daily 15:00 freeze from Nov 26
check 2026-11-26T19:59:00Z open   "Thu Nov 26 14:59 EST"
check 2026-11-26T20:00:00Z frozen "Thu Nov 26 15:00 EST, peak evening freeze"
check 2026-12-15T03:00:00Z frozen "Mon Dec 14 22:00 EST (Tue in UTC)"
check 2026-12-15T15:00:00Z open   "Tue Dec 15 10:00 EST"
check 2026-12-31T16:00:00Z open   "Thu Dec 31 11:00 EST"
check 2027-01-01T20:00:00Z frozen "Fri Jan 1 15:00 EST, last season day"
check 2027-01-02T15:00:00Z open   "Sat Jan 2 10:00 EST, season over"

echo "passed=$pass failed=$fail"
(( fail == 0 ))
