# DigitalOcean Monitoring alerts — declarative config

Source of truth: [`alerts.yml`](./alerts.yml).
Reconciler: [`apply.py`](./apply.py) (run via [`apply.sh`](./apply.sh)).

Manages DO Monitoring alert policies declaratively: cluster node CPU,
memory, and disk thresholds wired to Discord via the `/slack`-suffix
webhook trick.

## Why these alerts (and not others)

DO Monitoring's alert API is **node-level only** — there's no native
support for pod crashloop, OOMKill, or service-down alerts. Those live
in PostHog log alerts ([`../posthog-alerts/`](../posthog-alerts/)) where
we already have the structured logs.

This file covers the bottom layer: **the node is unhealthy** (running
hot, out of memory, out of disk). When one of these fires, every pod
on the node is at risk regardless of the app — the runbook is "drain
the node and let cluster autoscaler replace it."

## Prereqs

1. **DigitalOcean API token** — already in `ops/.env.dev` as
   `DIGITALOCEAN_ACCESS_TOKEN` (same token doctl and the deploy
   workflows use). Scope must include `read` + `write` on monitoring.
2. **Discord webhook** — already in `ops/.env.dev` as
   `DISCORD_ALERTS_WEBHOOK`. apply.py appends `/slack` to it to hit
   Discord's Slack-compatible endpoint.

`apply.sh` handles Python dependencies via a one-time venv at
`~/.cache/rf-do-monitoring-venv`.

## Usage

```sh
set -a; source ops/.env.dev; set +a

# Dry-run (default): print plan, no mutations
./ops/do-monitoring/apply.sh

# Reconcile
./ops/do-monitoring/apply.sh --apply
```

## Identity / drift detection

DO Monitoring alerts don't have a stable user-facing name field — only
a free-form `description`. The reconciler matches by `description`, so
**do not rename an alert in `alerts.yml`** unless you also delete the
old one in DO first (otherwise it'll create a duplicate).

`[REMOTE-ONLY]` output flags rf-* alerts that exist in DO but aren't in
this file. The reconciler never deletes — operator decides.

## Discord routing — the /slack trick

DO Monitoring supports email and Slack-format webhooks; no native
Discord. Discord exposes a Slack-compatible endpoint at
`<webhook_url>/slack` that accepts Slack's JSON shape and reformats it
into a Discord embed.

`apply.py` reads `DISCORD_ALERTS_WEBHOOK`, appends `/slack`, and passes
that as the Slack URL. No relay function, no separate destination
config — same webhook serves both PostHog alerts (native webhook) and
DO Monitoring (Slack format).

If this stops working (Discord deprecates the endpoint, DO tightens
allowlist), fallback is a one-page DO Function that polls the
Monitoring API and POSTs to Discord. Not built yet — file an issue if
it breaks.

## Rotating the Discord webhook

1. Generate the new webhook in Discord.
2. Update `ops/.env.dev`.
3. Re-run `apply.sh --apply`. The reconciler detects the slack URL
   drift on every policy and updates each in place.

## Adding a new alert

1. Add an entry under `alerts:` in `alerts.yml`. See existing entries
   for the schema.
2. Add a runbook at the path you set in `runbook:`. Reconciler doesn't
   validate it exists, but on-call needs it.
3. `apply.sh` (dry-run, then `--apply`).
4. Trip-test: DO doesn't have a simulate endpoint, so trigger the
   condition deliberately. For node CPU: `kubectl run cpu-burn
   --image=alpine sh -- "yes > /dev/null"` on a target node, wait
   for the window. Tear down after.

## Available alert types

DO Monitoring's full type list: see
[DO API docs — Create Alert Policy](https://docs.digitalocean.com/reference/api/api-reference/#operation/monitoring_create_alertPolicy).
Common Droplet/DOKS-node types:

- `v1/insights/droplet/cpu`
- `v1/insights/droplet/memory_utilization_percent`
- `v1/insights/droplet/disk_utilization_percent`
- `v1/insights/droplet/load_1`, `load_5`, `load_15`
- `v1/insights/droplet/public_outbound_bandwidth`

For managed-DB alerts there's a separate `v1/dbaas/*` family (currently
three exist outside of `apply.sh` management — DB-CPU, DB-memory,
DB-disk). Those route email-only; if you want them moved into this
file, copy their descriptions verbatim and re-run.
