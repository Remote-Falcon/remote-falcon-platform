# Runbook: backend-error-spike (PostHog log alert)

**Alert source:** PostHog log alert `rf-backend-error-spike` ([source](../../ops/posthog-alerts/alerts.yml))
**Fires on:** ≥20 ERROR/FATAL logs across the backend services in any 5min window
**Services watched:** viewer, plugins-api, control-panel, external-api, gateway, account-archive
**Severity:** P2 (broad signal; specific impact depends on what's erroring)
**Cooldown:** 30min between repeat notifications

## What this means

Multiple backend services are throwing errors faster than baseline.
Could be: deploy regression, dependency outage (Mongo, S3, third-party
API), a single misbehaving client hammering a broken endpoint, or a
spike of expected-but-noisy errors (e.g., bad bot traffic).

## Triage (first 5 min)

1. **Open PostHog Logs filtered to the error window:**
   [/logs?severityLevels=error,fatal&dateRange=-15m](https://us.posthog.com/logs?severityLevels=error%2Cfatal&dateRange=-15m)

2. **Identify the dominant service + error class:**

   ```sh
   # Via CLI if you prefer
   kubectl logs -n remote-falcon -l 'app in (remote-falcon-viewer,remote-falcon-plugins-api,remote-falcon-control-panel)' \
     --tail=500 --since=15m --prefix | grep -iE "ERROR|FATAL" | awk '{print $1}' | sort | uniq -c | sort -rn | head
   ```

   Look for ONE service or ONE exception class dominating the count.

3. **Match against recent deploys:**

   ```sh
   gh run list --workflow=deploy.yml --limit=5
   ```

   If a deploy completed within 30min of the spike, that's the suspect.
   Roll back the affected service via `gh workflow run deploy.yml` with
   a prior commit, or `kubectl rollout undo deployment/<svc> -n remote-falcon`.

## Common patterns

| Symptom | Likely cause | Fix |
|---|---|---|
| Single service, single exception class, started ~deploy time | Regression | Rollback the deploy |
| All services, MongoDB-related exceptions | Managed DB hiccup | Check DO status; usually self-resolves within minutes |
| Single service, 4xx-flavored stack traces, persistent | Bad client traffic | Identify the IP/UA via logs, consider rate-limiting upstream |
| Spike clears before you respond, threshold breached once | Transient blip (managed DB failover, node replacement) | Acknowledge, no action |

## Recovery

Depends on root cause. Common interventions:

- **Rollback:** `kubectl rollout undo deployment/<svc> -n remote-falcon`
- **Scale up:** if the spike is load-driven, `kubectl scale deployment/<svc> -n remote-falcon --replicas=N` (the HPA may already be doing this)
- **Restart a misbehaving pod:** `kubectl delete pod -n remote-falcon -l app=<svc> --field-selector status.phase=Running` (HPA recreates)

## Tuning

- Threshold (20 errors / 5min) is intentionally conservative for the
  first week. After observing baseline, adjust in
  [ops/posthog-alerts/alerts.yml](../../ops/posthog-alerts/alerts.yml).
- If a single service dominates the baseline error rate, consider
  splitting it into its own alert with a different threshold.
- Apply changes via `./ops/posthog-alerts/apply.sh --apply`.
