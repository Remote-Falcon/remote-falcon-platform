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
- Before dispatching the Preseason broadcast — its single node is a
  placeholder until this runs.

## More than one flow

`drip.yml` describes the drip at the top level and any other
template-backed flow under `extra_flows` (currently the one-off Preseason
2026 broadcast). Every flow in the file is wired on each run; narrow it
with `--flow <flow_id>` when you only want one.

Loading a template into a node by hand is not equivalent: a node carries
`subject`/`html`/`text` inline **and** a `from.integrationId` that only
the editor's sender picker writes, and a half-copied node fails at send
time rather than at author time. That is what this script exists to
prevent.

## What it deliberately does not touch

`subject`, `html`, and `text` are owned by the template, and `from.integrationId`
is enforced from `drip.yml`. The node's `to` / `replyTo` /
`message_category_type` are delivery config that belongs to the workflow,
not the template, and are left alone.

# fix-liquid-escaping.py

PostHog's CDP Liquid renderer runs with liquidjs `outputEscape: 'escape'`,
so every `{{ ... }}` output is HTML-escaped. That is correct for the HTML
body and wrong everywhere else:

- a show called `Matt's Show` arrives as a subject line reading
  `Matt&#39;s Show`
- `{{ unsubscribe_url }}` in the plain-text part gets its `&` separators
  turned into `&amp;`, quietly breaking the link

Apostrophes and ampersands are common in show names, so this hits a large
share of recipients. Nothing catches it at author time — the editor and
preview both look fine, and it only appears in a delivered message.

```bash
./ops/posthog-workflows/apply.sh --help    # (wiring script)
"$HOME/.cache/rf-posthog-workflows-venv/bin/python" \
  ops/posthog-workflows/fix-liquid-escaping.py --apply
```

Appends `| raw` to every Liquid output in `subject` and `text` across all
templates in `drip.yml` (including `standalone_templates`). Idempotent, so
re-run it after **any** edit in the PostHog template editor — the merge-tag
dropdown reintroduces un-raw'd tags. Then re-run the wiring script to push
the corrected subject/text into the flow nodes.

**Subject and text only, never html.** Show names are user-supplied;
escaping in the HTML body is a deliberate injection defence and must stay.

`| raw` is a no-op when escaping is off, so this stays safe if PostHog
changes that setting later. Reported upstream 2026-07-25.

## Related

- Drip design + gating: PRD-remote-falcon-013 (Obsidian vault).
- Sibling IaC: [../posthog-alerts](../posthog-alerts),
  [../posthog-dashboards](../posthog-dashboards).
