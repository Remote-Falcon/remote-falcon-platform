# Runbook: post-deploy auto-rollback fired

**Triggered by:** [`ops/release-validation/check.py`](../../ops/release-validation/check.py) called from `.github/workflows/deploy.yml` — the "Post-deploy error-rate check" step.
**What happened:** A deploy completed (image pushed, replicas ready), but in the 10-minute window after rollout the service's error rate exceeded 3× its 24h baseline. `kubectl rollout undo` ran automatically.
**Where to look:** Discord `#alerts` — the bot posts the breach detail (post-deploy count, baseline, threshold) before the rollback step fires.

## Triage (first 5 minutes)

1. **Confirm the rollback succeeded.** The deploy.yml run's logs will show:
   - `Post-deploy error-rate check` step → red, exit code 1
   - `Auto-rollback on failure` step → green, ran `kubectl rollout undo`

   ```sh
   gh run list --workflow=deploy.yml --limit=5
   gh run view <run-id> --log | grep -A 5 "rolled back"
   ```

2. **Verify the cluster is back on the prior revision:**

   ```sh
   kubectl rollout history deployment/remote-falcon-<svc> -n remote-falcon
   kubectl get deployment remote-falcon-<svc> -n remote-falcon -o jsonpath='{.spec.template.spec.containers[0].image}'
   ```

   The live image should match the previous (pre-failed-deploy) tag.

3. **Pull the actual error logs** that triggered the alert:

   ```sh
   kubectl logs -n remote-falcon -l app=remote-falcon-<svc> --since=20m \
     | grep -iE "ERROR|FATAL" | head -50
   ```

   Or in PostHog: filter Logs by `service.name = remote-falcon-<svc>` + `severity in (error, fatal)` for the post-deploy window.

## Root-cause patterns

| Symptom | Likely cause | Next step |
|---|---|---|
| New `NullPointerException` / `TypeError` not seen before | Code regression in the deployed commit | Find the bad change in `git log <prev>..<head>`, revert it, ship the revert |
| Existing exception class but burst frequency | Existing bug interacting with new code paths | Same — revert and investigate |
| External dependency errors (Mongo, DO Spaces, third-party API) | Coincidental upstream outage during deploy window | Wait for upstream to recover, re-deploy when stable. NOT a code bug |
| Errors mention config or env vars | Build-time env got out of sync | Check `apps/<svc>/k8s/manifest.yml` env block + repo secrets |
| Lots of `Connection refused` from OTel | Collector hiccup, not a service bug | Look at `kubectl logs -n remote-falcon -l app=otel-collector --tail=100`. Re-deploy when collector's healthy |

## When to override the auto-rollback

The check's threshold is **3× the 24h baseline**. False positives happen when:

- **Service is normally idle.** A 0 → 5 errors jump is technically infinite-fold but operationally tiny. The script handles this with a "baseline floor" — it skips the rollback decision if normalized baseline is < 1 error in the 10min window. If you're still seeing false positives, the floor may be too low.
- **Known noisy deploy** (e.g., schema migration that throws transient errors as old/new pods crossover). For these, you can:
  - Pass `--multiplier 5.0` (or higher) in deploy.yml temporarily.
  - Or skip the check entirely for that one deploy by adding `if: ${{ inputs.skip_error_check != true }}` and wiring an input — currently the check has no skip flag, but it's a 3-line workflow edit if you need one.

## Re-deploying after fix

Once you've identified + fixed the root cause:

```sh
# Either: merge the fix to main (auto-deploys), OR
gh workflow run deploy.yml -f service=<svc>
```

The post-deploy error-rate check runs again automatically. If the fix worked, expect a green `[deploy-check]` ping in Discord.

## Tuning the check

Files:
- Threshold + multiplier: [`ops/release-validation/check.py`](../../ops/release-validation/check.py) `--multiplier` default (3.0)
- Watch window: [`ops/release-validation/check.py`](../../ops/release-validation/check.py) `--watch-minutes` default (10)
- Both can be overridden per-call in [`deploy.yml`](../../.github/workflows/deploy.yml) — see the README in `ops/release-validation/`.

Bumping the multiplier reduces false positives but increases the risk of a real regression slipping through. Lowering the watch window decreases runner cost but produces noisier baselines.
