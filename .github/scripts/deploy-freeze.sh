#!/usr/bin/env bash
# Season deploy freeze guard. Policy: docs/SERVICES.md "Deploy freeze".
#
# Exit 0 = deploys allowed now, exit 1 = frozen (reason on stdout).
# deploy.yml runs this for push-triggered (merge-to-main) deploys only.
# workflow_dispatch is the hotfix path and is never blocked here.
#
# Frozen windows, all evaluated on the America/New_York wall clock:
#   1. Oct 30 through Jan 1: Fri 15:00 -> Mon 09:00 (weekend show nights).
#   2. Nov 26 through Jan 1: every day from 15:00 to midnight.
# A window is judged by the ET calendar date at the moment of the check, so
# the weekend that starts Fri Jan 1 ends at Sat Jan 2 00:00 (season over).
#
# DEPLOY_FREEZE_NOW=<unix epoch> overrides "now" (tests only).
# Test: .github/scripts/deploy-freeze.test.sh
set -euo pipefail

SEASON_START=1030   # MMDD, weekend freeze starts
PEAK_START=1126     # MMDD, daily 15:00 freeze starts
SEASON_END=0101     # MMDD, both freezes end after this date (inclusive)

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
start=$((10#$SEASON_START)); peak=$((10#$PEAK_START)); end=$((10#$SEASON_END))

# Seasons wrap the new year: in season if on/after start OR on/before end.
in_season=false; in_peak=false
if (( md >= start || md <= end )); then in_season=true; fi
if (( md >= peak || md <= end )); then in_peak=true; fi

# %u: 1=Mon ... 5=Fri, 6=Sat, 7=Sun
weekend=false
if (( (dow == 5 && hm >= 1500) || dow == 6 || dow == 7 || (dow == 1 && hm < 900) )); then
  weekend=true
fi
evening=false
if (( hm >= 1500 )); then evening=true; fi

if $in_season && $weekend; then
  echo "FROZEN: weekend show freeze (Fri 15:00 to Mon 09:00 ET, Oct 30 to Jan 1). Now: $stamp"
  exit 1
fi
if $in_peak && $evening; then
  echo "FROZEN: peak-season evening freeze (after 15:00 ET daily, Nov 26 to Jan 1). Now: $stamp"
  exit 1
fi
echo "OPEN: no deploy freeze in effect. Now: $stamp"
