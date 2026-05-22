# Runbook: sending notifications via the bell

**Surface:** in-app notification bell in the control panel header (PRD-002)
**Mutations:** `createNotification` (ADMIN broadcast), `createNotificationForUser` (per-show DM) on the control-panel GraphQL endpoint
**Auth:** Bearer JWT, admin role (`@RequiresAdminAccess`)

Operator-facing playbook for hand-writing notifications.

## What this is for

- **ADMIN broadcast** (`createNotification`) — one notification, visible in every logged-in user's bell. Use for release announcements, scheduled-maintenance heads-ups, breaking-change warnings.
- **USER DM** (`createNotificationForUser`) — visible only to the named show. Use for "we restored your account, please log in," targeted support follow-up, one-off compliance pings.

**Do NOT use either for:**
- FPP heartbeat alerts — `ScheduledTaskService.fppHeartbeatTask()` writes `FPP_HEALTH` rows automatically. Operators never write `FPP_HEALTH` by hand.
- Bug reports / feature requests — route to the issue tracker.
- Anything that needs email delivery — there's no email fan-out in v1, only the bell.

## Auth — getting a Bearer token

No CLI-friendly issuance path today; extract from the browser:

1. Log in to the control panel as an admin user.
2. Open DevTools -> Network tab, filter to `graphql`.
3. Trigger any GraphQL request (loading the dashboard does it).
4. Copy the `Authorization` header value (`Bearer eyJhbGc...`).

That token is what every snippet below expects in `$TOKEN`.

**Endpoint URLs:**
- Prod: `https://remotefalcon.com/remote-falcon-control-panel/graphql`
- Local: `http://localhost:8080/remote-falcon-control-panel/graphql`

(Base API is the `VITE_CONTROL_PANEL_API` build-arg in [`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml); Spring's default `/graphql` is appended.)

## Sending a release announcement (ADMIN, all users)

Mutation:

```graphql
mutation CreateNotification {
  createNotification(notification: {
    subject: "Remote Falcon v2.3 is live",
    preview: "Notification bell, page templates refresh, viewer fixes.",
    message: "v2.3 ships the in-app notification bell (you're looking at it), a refreshed page-template gallery, and three viewer fixes. Full release notes at https://docs.remotefalcon.com/release-notes/v2.3."
  })
}
```

Curl one-liner:

```sh
TOKEN="eyJhbGc..."   # paste from DevTools

curl -X POST https://remotefalcon.com/remote-falcon-control-panel/graphql \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation($n: NotificationInput!) { createNotification(notification: $n) }",
    "variables": {
      "n": {
        "subject": "Remote Falcon v2.3 is live",
        "preview": "Notification bell, page templates refresh, viewer fixes.",
        "message": "v2.3 ships the in-app notification bell, a refreshed page-template gallery, and three viewer fixes.",
        "link": "https://docs.remotefalcon.com/release-notes/v2.3"
      }
    }
  }'
```

Success: `{"data":{"createNotification":true}}`. The server stamps `uuid`, `createdDate`, and forces `type: ADMIN` — don't supply them.

> **`link` field:** the bell renders this as a button on the notification row. If you set it, viewers click through to the link (opens in a new tab) and the row gets marked dismissed in their browser. If you omit it, the row is text-only.

## Sending a per-show DM (USER, one show)

`showSubdomain` is the subdomain slug (e.g. `holtz`, `parkway-lights`), not the full URL.

Mutation:

```graphql
mutation CreateNotificationForUser {
  createNotificationForUser(
    notification: {
      subject: "Account restored",
      preview: "We restored your account from backup. Please log in.",
      message: "Following the 2026-05-21 incident, your show data was restored from the 2026-05-20 backup. A handful of votes/requests from the affected window are lost. Please log in and confirm your sequences and pages look right."
    },
    showSubdomain: "holtz"
  )
}
```

Curl:

```sh
curl -X POST https://remotefalcon.com/remote-falcon-control-panel/graphql \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mutation($n: NotificationInput!, $s: String!) { createNotificationForUser(notification: $n, showSubdomain: $s) }",
    "variables": {
      "n": {
        "subject": "Account restored",
        "preview": "We restored your account from backup. Please log in.",
        "message": "Following the 2026-05-21 incident, your show data was restored from the 2026-05-20 backup. Please log in and confirm sequences/pages look right."
      },
      "s": "holtz"
    }
  }'
```

Returns `true` on success, `false` if `showSubdomain` doesn't match a show.

## Verifying it landed

In Mongo (read-only, via the cluster's Mongo or a port-forward):

```sh
# ADMIN broadcasts live in the top-level notification collection
db.notification.find({}).sort({createdDate: -1}).limit(5)

# Per-show DMs land inside the show document's showNotifications array
db.show.find(
  { showSubdomain: "holtz" },
  { "showNotifications.notification": 1 }
)
```

In the UI:

1. Log in as any user (for ADMIN) or as the targeted show owner (for DM).
2. Click the bell in the header.
3. Confirm subject + preview render and the dropdown shows an unread indicator.

## Removing a bad notification

Grab the `uuid` from the verification step above first.

**ADMIN already sent** (removes it for everyone):

```sh
db.notification.deleteOne({ uuid: "<the-uuid>" })
```

**Per-show DM:**

```sh
db.show.updateOne(
  { showSubdomain: "holtz" },
  { $pull: { showNotifications: { "notification.uuid": "<the-uuid>" } } }
)
```

Users who already dismissed it (read state is browser-local) won't see it return. Users who hadn't seen it simply never will. No re-broadcast risk.

## Suspending notifications globally

No CronJob, no automation, no queue. Creation is 100% manual — to suspend, don't run the mutation.

## Worked example: shipping v2.3

1. Log in as admin, grab `$TOKEN` from DevTools (see Auth).
2. Run the ADMIN curl one-liner above with v2.3 subject/preview/message. Expect `{"data":{"createNotification":true}}`.
3. Verify: `db.notification.find({}).sort({createdDate:-1}).limit(1)` returns a row with `type: "ADMIN"` and your subject.
4. Open the control panel in an incognito window, log in, click the bell. Confirm the row appears with an unread dot.

If something's wrong, see "Removing a bad notification" above — `db.notification.deleteOne({uuid: "..."})` is idempotent and safe.

## Tuning / limitations

- **20-item cap** in the bell dropdown (UI-side); older items fall off the visible list but stay in Mongo.
- **Read state is browser-local** (`localStorage`). Same user on a different device sees the row as unread again. No server-side read flag for ADMIN rows. (Per-show DMs do persist `read`/`deleted` on the `showNotifications` subdocument.)
- **No webhook automation in v1.** Every release announcement is hand-typed. To automate later (e.g. on GitHub release publish), add a new caller of `createNotification` — the mutation is the integration point.
- **Keep link URLs stable.** `https://docs.remotefalcon.com` is the canonical docs target; once a notification is in users' bells, changing the underlying URL on the docs side breaks the click-through.
- **No email distribution.** Bell-only; users who never log in never see the notification.
- **Admin-gated.** Both mutations carry `@RequiresAdminAccess`; a normal show-owner JWT gets rejected.
