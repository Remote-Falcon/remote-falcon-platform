#!/usr/bin/env bash
# Season deploy freeze guard. Policy: docs/SERVICES.md "Deploy freeze".
#
# Exit 0 = deploys allowed now, exit 1 = frozen (reason on stdout).
# deploy.yml runs this for push-triggered (merge-to-main) deploys only.
# workflow_dispatch is the hotfix path and is never blocked here.
#
# DEPLOY_FREEZE_NOW=<unix epoch> overrides "now" (tests only).
# Test: .github/scripts/deploy-freeze.test.sh
set -euo pipefail

# ---------------------------------------------------------------------------
# Freeze calendar. This block is the whole policy; edit dates here only.
#
# One window per line: KIND FROM TO DESCRIPTION
#   FROM/TO  MMDD, inclusive, judged on the America/New_York calendar date at
#            the moment of the check. A window whose FROM is after its TO
#            wraps the new year (1030 0101 = Oct 30 through Jan 1).
#   KIND     weekend  Fri 15:00 to Mon 09:00 ET
#            evening  every day from 15:00 ET to midnight
#            allday   all hours
# Windows are checked in order; the first match names the freeze. Because the
# date is judged at check time, the weekend that starts Fri Jan 1 ends at
# Sat Jan 2 00:00 (season over).
# ---------------------------------------------------------------------------
FREEZE_WINDOWS='
allday   1218 1226 holiday full-day freeze
weekend  1030 0101 weekend show freeze
evening  1126 0101 peak-season evening freeze
'

now="${DEPLOY_FREEZE_NOW:-$(date +%s)}"

# GNU date (CI) takes -d @epoch; BSD date (macOS) takes -r epoch.
if date -d @0 +%s >/dev/null 2>&1; then
  parts=$(TZ=America/New_York date -d "@$now" '+%m%d %u %H%M %Y-%m-%d %a %H:%M %Z')
else
  parts=$(TZ=America/New_York date -r "$now" '+%m%d %u %H%M %Y-%m-%d %a %H:%M %Z')
fi
read -r mmdd dow hhmm ymd dayname clock zone <<<"$parts"
stamp="$dayname $ymd $clock $zone"

# Strip leading zeros so 0101/0859 compare as decimals, not octal.
md=$((10#$mmdd))
hm=$((10#$hhmm))

# MMDD -> "Mon D" for messages.
pretty() {
  local months=(Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec) m d
  m=$((10#${1:0:2})); d=$((10#${1:2:2}))
  echo "${months[m-1]} $d"
}

while read -r kind from to desc; do
  [[ -z "$kind" ]] && continue
  start=$((10#$from)); end=$((10#$to))
  if (( start <= end )); then
    (( md >= start && md <= end )) || continue
  else
    (( md >= start || md <= end )) || continue
  fi
  range="$(pretty "$from") to $(pretty "$to")"
  case "$kind" in
    allday)
      echo "FROZEN: $desc (all hours, $range). Now: $stamp"
      exit 1
      ;;
    weekend)
      # %u: 1=Mon ... 5=Fri, 6=Sat, 7=Sun
      if (( (dow == 5 && hm >= 1500) || dow == 6 || dow == 7 || (dow == 1 && hm < 900) )); then
        echo "FROZEN: $desc (Fri 15:00 to Mon 09:00 ET, $range). Now: $stamp"
        exit 1
      fi
      ;;
    evening)
      if (( hm >= 1500 )); then
        echo "FROZEN: $desc (after 15:00 ET daily, $range). Now: $stamp"
        exit 1
      fi
      ;;
    *)
      echo "ERROR: unknown freeze window kind '$kind'" >&2
      exit 2
      ;;
  esac
done <<<"$FREEZE_WINDOWS"

echo "OPEN: no deploy freeze in effect. Now: $stamp"
