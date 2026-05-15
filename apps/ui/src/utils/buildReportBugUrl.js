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

- Show subdomain: \`${showSubdomain || '(unknown)'}\`
- Plugin version: \`${pluginVersion || '(not reported)'}\`
- FPP version: \`${fppVersion || '(not reported)'}\`
- Page: \`${pageUrl || '(unknown)'}\`
- Browser: \`${userAgent || '(unknown)'}\`
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
