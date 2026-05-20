# Release validation — post-deploy error-rate check

`check.py` runs as a post-deploy step in `.github/workflows/deploy.yml`.
It compares the post-deploy error rate of the just-deployed service
against the last-24h baseline (normalized to the watch window). If
post-deploy errors exceed `multiplier × baseline` (default 3×), the
check exits 1, the deploy job fails, and the existing auto-rollback
step in `deploy.yml` triggers `kubectl rollout undo`.

This is the operational complement to the alerts in `ops/posthog-alerts/`:
alerts catch problems after they've been live for minutes; this check
catches deploy-introduced regressions in the first 10 minutes and rolls
them back automatically before customers feel the full impact.

## Inputs

| Flag | Default | Notes |
|---|---|---|
| `--service` | required | Service name without the `remote-falcon-` prefix. E.g., `viewer`, `plugins-api`. |
| `--watch-minutes` | 10 | How recent a window to evaluate post-deploy. Match this to the sleep before the check fires in `deploy.yml`. |
| `--multiplier` | 3.0 | Rollback fires when post-deploy errors > multiplier × normalized baseline. |

## Env vars

- `POSTHOG_API_KEY` — Personal API Key with `logs:read` scope. **Add as GitHub repo secret** so `deploy.yml` can use it.
- `POSTHOG_HOST` (optional, default `https://us.posthog.com`)
- `POSTHOG_PROJECT_ID` (optional, default 425428)
- `DISCORD_ALERTS_WEBHOOK` (optional but recommended) — posts the result (OK / breach / insufficient baseline) to Discord either way, so on-call always sees deploy outcomes.

## Exit codes

- `0` — within tolerance, or baseline too low to make a confident decision (no rollback either way)
- `1` — breach detected; deploy step fails, existing auto-rollback handler runs `kubectl rollout undo`
- `2` — invocation/auth/API error; deploy step fails, BUT no rollback (since we don't know if the new revision is actually bad). Manual investigation needed.

## Why these defaults

**10-minute watch window:** Short enough to keep the GitHub Actions runner cost bounded (~$0.08/service on Linux runners), long enough that low-traffic services produce a non-trivial sample.

**3× multiplier:** Chosen over standard-deviation math because it's interpretable at a glance ("post-deploy was 3× normal") and degrades gracefully when baseline is noisy. If we later get sustained false positives, raise to 4× or 5×; if we miss real regressions, lower to 2×.

**Baseline floor of 1 error in the watch window:** Services with tiny error volume (mongo-backup, account-archive) can't produce statistically meaningful spike data over 10 minutes. The check skips the rollback decision in that case rather than rolling back on a 0→2 transition.

## Tuning per service

If a particular service is consistently false-positive or false-negative, override the multiplier in `deploy.yml`'s call:

```yaml
python3 ops/release-validation/check.py --service ${{ matrix.service }} \
  --watch-minutes 10 \
  --multiplier "$(case '${{ matrix.service }}' in viewer) echo 4 ;; *) echo 3 ;; esac)"
```

## Local test

```sh
set -a; source ops/.env.dev; set +a
python3 ops/release-validation/check.py --service viewer --watch-minutes 10
```

Outputs the comparison numbers and the decision; safe to run against
prod since it's all read queries (Discord ping included unless you
unset `DISCORD_ALERTS_WEBHOOK`).
