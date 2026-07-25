# PostHog workflows — template wiring

Copies messaging-library email templates into a workflow's email nodes.

## Why this exists

A PostHog workflow email node stores its `subject` / `html` / `text`
**inline**. It does not reference the messaging-template library at
runtime — the editor's "load template" button is a one-time copy. So
editing `Onboarding — 4. Go live` in the library changes **nothing**
about what the drip sends until the content is copied into the node
again.

Doing that by hand is six editor round-trips that nobody can review. This
script makes it one reviewable command driven by [drip.yml](drip.yml).

## Usage

```bash
export POSTHOG_API_KEY=phx_...          # Personal API Key
./ops/posthog-workflows/apply.sh        # dry run — prints what would change
./ops/posthog-workflows/apply.sh --apply
```

Required key scopes: `hog_flow:read`, `hog_flow:write`. (Messaging
templates sit under the `hog_flow` scopes as well.) The script exits with
a hint pointing at the key settings page if it gets a 403.

It is idempotent — re-running with nothing changed prints `NOOP` for every
node and issues no write.

## When to run it

- After editing any `Onboarding — N` template in the library.
- Before enabling the drip, to replace the placeholder bodies.

## What it deliberately does not touch

Only `subject`, `html`, and `text` are owned by the template. The node's
`to` / `from` / `replyTo` / `message_category_type` are delivery config
that belongs to the workflow, not the template, and are left alone.

## Related

- Drip design + gating: PRD-remote-falcon-013 (Obsidian vault).
- Sibling IaC: [../posthog-alerts](../posthog-alerts),
  [../posthog-dashboards](../posthog-dashboards).
