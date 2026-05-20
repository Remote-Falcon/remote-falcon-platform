# PostHog log alerts — declarative config

Source of truth: [`alerts.yml`](./alerts.yml).
Reconciler: [`apply.py`](./apply.py).

`alerts.yml` defines every PostHog log-based alert for Remote Falcon plus
the Discord destination wiring. `apply.py` reads it, compares against
PostHog's current state, and converges them. The intent is no drift: if
an alert exists in the UI but not in this file, the reconciler tells you;
if a threshold differs, the reconciler tells you and fixes it.

## Prereqs

1. **PostHog Personal API Key** — create at
   [/settings/user-api-keys](https://us.posthog.com/settings/user-api-keys).
   Scopes needed: `log_alert:read`, `log_alert:write`. Tag it
   `rf-alerts-iac` so you remember what it's for.

2. **Add to `ops/.env.dev`:**

   ```
   POSTHOG_API_KEY=phx_...
   ```

   `DISCORD_ALERTS_WEBHOOK` should already be there from the
   mongo-backup-watchdog work.

3. **Python deps:** handled automatically by `apply.sh`, which creates a
   one-time venv at `~/.cache/rf-posthog-alerts-venv` and installs PyYAML
   into it. This sidesteps Homebrew Python's PEP 668 lock-out without
   polluting the system Python.

## Usage

From the repo root, with env vars loaded:

```sh
set -a; source ops/.env.dev; set +a

# Dry-run: see what would change, no mutations
./ops/posthog-alerts/apply.sh

# Actually reconcile
./ops/posthog-alerts/apply.sh --apply
```

(First run downloads PyYAML into the venv — takes a few seconds.
Subsequent runs are instant.)

The script prints one line per alert:

- `[CREATE]` — alert missing in PostHog, will be added
- `[UPDATE]` — alert exists but drifted from `alerts.yml`; field-level diff
  shown
- `[OK]` — alert matches the YAML exactly
- `[REMOTE-ONLY]` — alert exists in PostHog with no matching entry in
  `alerts.yml`. No automatic delete — operator decides whether to add
  the entry or remove the alert manually

## Discord destinations — one-time UI attach

**Platform limitation:** PostHog rejects Personal API Key auth on the
log-alert destinations endpoint:

```
HTTP 403  "This action does not support personal API key access"
```

The same restriction applies to the PostHog MCP, so there is no
scripted path today. `apply.py` creates/updates the alerts themselves
via API and reports any alerts that need a destination attached as
`!! destination attach failed`.

To complete setup for a new alert:

1. After `apply.sh --apply` reports the new alert was created, click
   into it in PostHog:
   [Log alerts](https://us.posthog.com/logs/alerts).
2. In the alert's detail view, add a new destination → type `Webhook`
   → paste the same URL stored in `DISCORD_ALERTS_WEBHOOK`.
3. Save. From then on the alert fires to `#alerts` directly.

`apply.sh` will not re-prompt about the destination on subsequent runs
(it gracefully ignores the read-side 403 too). If you rotate the
webhook URL, you'll need to edit each alert's destination by hand —
file an issue with PostHog if you want this scripted.

## Adding a new alert

1. Append a block to `alerts.yml` under `alerts:`. See existing entries for
   the schema (also documented in the file's header comment).
2. Write a runbook at the `runbook:` path you set. The reconciler doesn't
   validate the file exists, but on-call will need it when the alert fires.
3. `apply.py` (dry-run, then `--apply`).
4. Trip-test the alert. PostHog has a `simulate` endpoint on each alert
   that emits a synthetic firing event without waiting for the threshold;
   if `apply.py` grows a `--simulate <name>` flag later, that's the path.
   For now, simulate via the alert's three-dot menu in the PostHog UI.

## Rotating the Discord webhook

Webhook URL lives in the env var named by `discord_webhook_env:` in
`alerts.yml` (default `DISCORD_ALERTS_WEBHOOK`). Rotation flow:

1. Generate the new webhook URL in Discord.
2. Update `ops/.env.dev`.
3. Re-run `apply.py --apply`. The reconciler detects that each alert's
   destination doesn't match the new URL and re-creates it.

## Drift detection

Run `apply.py` (dry-run) in CI or on a schedule and fail if it prints any
`[CREATE]`, `[UPDATE]`, or `[REMOTE-ONLY]` lines. Today this is operator-
driven — re-run before merging anything that touches `alerts.yml`.

## Why no GitHub Action

By design — this stays a local-run tool so the Personal API Key never
leaves the operator's `.env.dev`. If we later decide we need scheduled
drift detection, we can move it into Actions with a project-scoped key.
