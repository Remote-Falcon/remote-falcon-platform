import { describe, it, expect } from 'vitest';

import buildReportBugUrl from '../buildReportBugUrl';

// The Report a Bug button stuffs server-sourced context (plugin version,
// FPP version, subdomain) into a pre-filled GitHub issue. Backtick/newline
// injection in any of those fields would let attacker-controlled markdown
// render inside the issue body. These tests pin both happy-path shape and
// the sanitiser contract.

const ISSUE_URL_PREFIX =
  'https://github.com/Remote-Falcon/remote-falcon-issue-tracker/issues/new?';

describe('buildReportBugUrl', () => {
  it('builds a URL targeting the issue-tracker new-issue endpoint', () => {
    const url = buildReportBugUrl({});
    expect(url.startsWith(ISSUE_URL_PREFIX)).toBe(true);
  });

  it('sets the bug label and an empty title', () => {
    const url = buildReportBugUrl({});
    expect(url).toContain('labels=bug');
    expect(url).toMatch(/title=(&|$)/);
  });

  it('embeds the supplied context fields into the body', () => {
    const url = buildReportBugUrl({
      showSubdomain: 'mattshow',
      pluginVersion: '2.3.4',
      fppVersion: '7.0',
      pageUrl: 'https://example.com/x',
      userAgent: 'TestUA/1.0'
    });
    const params = new URL(url).searchParams;
    const body = params.get('body');
    expect(body).toContain('mattshow');
    expect(body).toContain('2.3.4');
    expect(body).toContain('7.0');
    expect(body).toContain('https://example.com/x');
    expect(body).toContain('TestUA/1.0');
  });

  it('falls back to "(unknown)" / "(not reported)" when fields are missing', () => {
    const url = buildReportBugUrl({});
    const body = new URL(url).searchParams.get('body');
    expect(body).toContain('(unknown)');
    expect(body).toContain('(not reported)');
  });

  it('strips backticks and newlines from interpolated values (sanitiser)', () => {
    // The hostile values would otherwise break out of the code span and
    // smuggle arbitrary markdown into the issue body.
    const url = buildReportBugUrl({
      showSubdomain: 'evil`whoops',
      pluginVersion: 'line1\nline2',
      fppVersion: 'with\rcarriage',
      pageUrl: '`also bad`',
      userAgent: 'plain'
    });
    const body = new URL(url).searchParams.get('body');
    expect(body).not.toContain('`whoops');
    expect(body).not.toContain('line1\nline2');
    expect(body).not.toContain('with\rcarriage');
    // The plain field survives untouched.
    expect(body).toContain('plain');
  });

  it('coerces non-string values to empty string', () => {
    const url = buildReportBugUrl({
      showSubdomain: null,
      pluginVersion: undefined,
      fppVersion: 0,
      pageUrl: false,
      userAgent: 42
    });
    const body = new URL(url).searchParams.get('body');
    // null / undefined collapse to (unknown)/(not reported).
    expect(body).toContain('(unknown)');
    // Numbers stringify.
    expect(body).toContain('0');
    expect(body).toContain('42');
  });
});
