// Builds a pre-filled URL for the Remote-Falcon/remote-falcon-issue-tracker
// "new issue" form. Triagers get a consistent template + show/plugin/browser
// context baked into the body so they don't have to ask "what version are
// you on?" — users only need to describe the bug itself.
//
// GitHub's URL-param pre-fill is documented at
// https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/about-issue-and-pull-request-templates
//
// We deliberately do NOT use a server-side mutation because:
//   • zero secret management (no PAT / GitHub App)
//   • no spam surface — users have to have a GitHub account
//   • the issue tracker repo is public, so users see exactly what they're
//     posting before submitting (privacy-positive for accidental data leaks)

const ISSUE_TRACKER_NEW_ISSUE_URL =
  'https://github.com/Remote-Falcon/remote-falcon-issue-tracker/issues/new';

// Sanitize values interpolated inside markdown backtick spans. Each field
// is sourced from server state — `pluginVersion` and `fppVersion`
// originate at the FPP plugin and travel through plugins-api before
// landing in Redux, so we can't fully trust them. A backtick + newline in
// any value would break out of the `code span`/list-item and let the
// resulting GitHub issue body render attacker-controlled markdown.
const safeForBacktick = (v) =>
  (v == null ? '' : String(v)).replace(/[`\r\n]/g, ' ').trim();

const buildBody = ({ showSubdomain, pluginVersion, fppVersion, pageUrl, userAgent }) => `**What happened?**

<!-- describe the bug -->


**Steps to reproduce**

1.
2.


**Expected**

<!-- what should have happened -->


**Actual**

<!-- what actually happened -->


---

<sub>Auto-attached context (please leave this section — it speeds up triage):</sub>

- Show subdomain: \`${safeForBacktick(showSubdomain) || '(unknown)'}\`
- Plugin version: \`${safeForBacktick(pluginVersion) || '(not reported)'}\`
- FPP version: \`${safeForBacktick(fppVersion) || '(not reported)'}\`
- Page: \`${safeForBacktick(pageUrl) || '(unknown)'}\`
- Browser: \`${safeForBacktick(userAgent) || '(unknown)'}\`
`;

const buildReportBugUrl = (context = {}) => {
  const params = new URLSearchParams({
    labels: 'bug',
    title: '',
    body: buildBody(context)
  });
  return `${ISSUE_TRACKER_NEW_ISSUE_URL}?${params.toString()}`;
};

export default buildReportBugUrl;
