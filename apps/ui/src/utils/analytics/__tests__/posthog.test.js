import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock posthog-js BEFORE importing the module under test so the import
// graph sees the mocked module.
vi.mock('posthog-js', () => ({
  default: { capture: vi.fn(), identify: vi.fn() }
}));

import posthog from 'posthog-js';

import safeStorage from '../../safeStorage';
import { deriveShowSubdomain, identifyShowAtSignup, trackPosthogEvent } from '../posthog';

describe('trackPosthogEvent', () => {
  beforeEach(() => {
    posthog.capture.mockClear();
  });

  it('forwards the event name + data to posthog.capture', () => {
    trackPosthogEvent('sequence_save_failed', { reason: 'timeout' });
    expect(posthog.capture).toHaveBeenCalledTimes(1);
    expect(posthog.capture).toHaveBeenCalledWith('sequence_save_failed', { reason: 'timeout' });
  });

  it('defaults the data payload to an empty object', () => {
    trackPosthogEvent('signup_click');
    expect(posthog.capture).toHaveBeenCalledWith('signup_click', {});
  });

  it('does not throw if posthog.capture is undefined (SDK not initialised)', () => {
    const original = posthog.capture;
    delete posthog.capture;
    expect(() => trackPosthogEvent('safe_path', {})).not.toThrow();
    posthog.capture = original;
  });
});

// The server derives showSubdomain as showName.replaceAll("\\s", "").toLowerCase()
// at both sites in GraphQLMutationService.java (signUp, show-name change).
// These cases are that rule; if the server's rule moves and these still pass,
// the signup -> verification funnel stops joining without any test going red.
describe('deriveShowSubdomain', () => {
  it.each([
    ['Lights On Sanford', 'lightsonsanford'],
    ['presidentiallights', 'presidentiallights'],
    ['Ausman Family Be Merry And Bright', 'ausmanfamilybemerryandbright'],
    ['  Leading And Trailing  ', 'leadingandtrailing'],
    ['Tabs\tAnd\nNewlines', 'tabsandnewlines']
  ])('derives %s -> %s', (showName, expected) => {
    expect(deriveShowSubdomain(showName)).toBe(expected);
  });

  it('preserves non-whitespace punctuation, matching the server (which only strips \\s)', () => {
    expect(deriveShowSubdomain("Matt's Lights")).toBe("matt'slights");
  });

  it.each([[undefined], [null], ['']])('returns an empty string for %s rather than throwing', (input) => {
    expect(deriveShowSubdomain(input)).toBe('');
  });
});

// PRD-013 P0-7 — the drip enrols whoever fires `sign_up`. Before this helper
// that was the anonymous signup browser (no email), and ~2/3 of enrolments
// failed at stage 1 with "No recipient identifier found". Identifying the
// show first makes the enrolled person the show itself, carrying an address
// from second 0 (only with consent, same posture as identifyShow on login).
describe('identifyShowAtSignup', () => {
  beforeEach(() => {
    posthog.identify.mockClear();
    posthog.identify.mockImplementation(() => {});
    safeStorage.removeItem('isImpersonating');
  });

  it('identifies the derived subdomain with email + consent when opted in', () => {
    identifyShowAtSignup('Lights On Sanford', 'owner@example.com', true);
    expect(posthog.identify).toHaveBeenCalledTimes(1);
    expect(posthog.identify).toHaveBeenCalledWith('lightsonsanford', {
      showName: 'Lights On Sanford',
      marketingOptIn: true,
      email: 'owner@example.com'
    });
  });

  it('stamps an explicit decline WITHOUT the email', () => {
    identifyShowAtSignup('Lights On Sanford', 'owner@example.com', false);
    const [, props] = posthog.identify.mock.calls[0];
    expect(props).toEqual({ showName: 'Lights On Sanford', marketingOptIn: false });
    expect(props).not.toHaveProperty('email');
  });

  it('omits consent entirely when never asked (null / undefined), so legacy stays distinguishable', () => {
    identifyShowAtSignup('Lights On Sanford', 'owner@example.com', null);
    identifyShowAtSignup('Lights On Sanford', 'owner@example.com', undefined);
    for (const [, props] of posthog.identify.mock.calls) {
      expect(props).toEqual({ showName: 'Lights On Sanford' });
    }
  });

  it('never stamps lastLoginDate — signup is not a login, and that property is the dormant-audience anchor', () => {
    identifyShowAtSignup('Lights On Sanford', 'owner@example.com', true);
    expect(posthog.identify.mock.calls[0][1]).not.toHaveProperty('lastLoginDate');
  });

  it('does nothing without a derivable subdomain', () => {
    identifyShowAtSignup('', 'owner@example.com', true);
    identifyShowAtSignup(undefined, 'owner@example.com', true);
    expect(posthog.identify).not.toHaveBeenCalled();
  });

  it('does nothing during an impersonation session', () => {
    safeStorage.setItem('isImpersonating', 'true');
    identifyShowAtSignup('Lights On Sanford', 'owner@example.com', true);
    expect(posthog.identify).not.toHaveBeenCalled();
  });

  it('returns the subdomain it identified so the caller can reuse it, and never throws', () => {
    expect(identifyShowAtSignup('Lights On Sanford', 'owner@example.com', true)).toBe('lightsonsanford');
    posthog.identify.mockImplementation(() => {
      throw new Error('sdk exploded');
    });
    expect(() => identifyShowAtSignup('Lights On Sanford', 'owner@example.com', true)).not.toThrow();
  });
});
