# Runbook: mongo-unreachable (PostHog log alert)

**Alert source:** PostHog log alert `rf-mongo-unreachable` ([source](../../ops/posthog-alerts/alerts.yml))
**Fires on:** ≥25 `Waiting for server to become available` logs across the backend services in any 5min window
**Services watched:** viewer, plugins-api, control-panel, external-api, account-archive
**Severity:** P1 if sustained past ~30s (every read/write is blocked); P3 if it clears on its own
**Cooldown:** 30min between repeat notifications

## What this means

The MongoDB driver can't reach the primary on the DO Managed cluster
(`remote-falcon-mongo-e3492ace.mongo.ondigitalocean.com`) and is retrying
server selection. Every service shares that one cluster, so this is
platform-wide by definition, not a single-service problem.

## Why this alert exists separately from `rf-backend-error-spike`

**The driver logs this at INFO, not ERROR.** Server selection retry is a
normal-operation code path to the driver, so `severity_levels: [error,
fatal]` cannot see it. This alert matches on message text instead. Do not
"simplify" it by adding a severity filter — that would make it inert.

## The 30-second rule

The driver retries within a 30s server-selection budget. What matters is
whether operations completed inside that budget or blew through it:

```
Timed out after 30000 ms while waiting for a server
```

- **That string absent** → the driver rode it out. No request actually
  failed. Blip, not an outage.
- **That string present** → real user-facing failures. Requests returned
  5xx. Treat as P1.

Check it first, before anything else:

[PostHog Logs: `Timed out after 30000 ms`](https://us.posthog.com/project/425428/logs)

## Triage (first 5 min)

1. **Is it still happening?** If the log stream is quiet, it already
   recovered — go to "Aftermath" below.

2. **Check the 30-second rule** (above). This determines severity.

3. **Check DO's side.** The cluster is DO Managed, so there is no
   `deploy/mongo` to exec into and the laptop cannot reach it (VPC
   restricted). Look at:
   - DigitalOcean status page and the cluster's own event log in the DO console
   - The cluster's maintenance window — a failover during maintenance
     produces exactly this signature

4. **Check whether it's one pod or all of them.** If a single pod is
   affected while others are fine, it's that pod's connection pool, not
   the cluster:

   ```sh
   kubectl logs -n remote-falcon -l app=remote-falcon-plugins-api \
     --tail=200 --since=10m --prefix | grep -c "Waiting for server"
   ```

## Reading the signature

The failure modes interleave and all three point at the same thing
(transport to the primary is gone), so don't read them as separate bugs:

| Log fragment | Means |
|---|---|
| `MongoSocketWriteException: Exception sending message` | Write to an already-dead socket |
| `MongoSocketReadTimeoutException: Timeout while receiving message` | Socket open, primary not answering |
| `SslHandshakeTimeoutException: handshake timed out after 10000ms` | Can't even complete TLS — usually a failover mid-handshake |
| `type=REPLICA_SET, servers=[{... state=CONNECTING, type=UNKNOWN}]` | Driver has no primary to talk to |

`plugins-api` will always dominate the count — FPP controllers poll
constantly, so it has the most operations in flight when the primary
drops. That is expected and is not evidence that plugins-api is the cause.

## Recovery

Usually none needed; the driver reconnects on its own once DO restores a
primary. If a pod stays wedged after the cluster is healthy:

```sh
kubectl rollout restart deployment/<svc> -n remote-falcon
```

Do not restart everything reflexively during an active outage — the pods
will reconnect, and a mass restart adds a cold-start thundering herd on
top of a database that is already struggling.

## Aftermath

Even for a self-healed blip, record it: date, duration, per-service line
counts, and whether the 30s timeout string appeared. Repeat blips in the
same maintenance window are worth raising with DO support, and that
argument needs a list of dates.

### Known events

| When | Duration | Impact |
|---|---|---|
| 2026-08-07 01:53Z (Thu 21:53 EDT) | ~1 min, 231 lines | None confirmed. No operation hit the 30s timeout. plugins-api 203, viewer 11, control-panel 8, external-api 2. Predates this alert existing. |

## Tuning

- Threshold (25 / 5min) is set against a measured baseline of **zero**
  outside the incident minute: over 2026-08-03..08-10, all 231 matching
  lines fell inside one 60-second window. Any sustained match is real.
- If a future blip produces 10-20 lines and you want to catch it, lower
  the count rather than widening the window — the signal is bursty.
- Apply changes via `./ops/posthog-alerts/apply.sh --apply`.
