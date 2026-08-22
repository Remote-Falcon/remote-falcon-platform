import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock posthog-js BEFORE importing the module under test so the import
// graph sees the mocked module.
vi.mock('posthog-js', () => ({
  default: { capture: vi.fn() }
}));

import posthog from 'posthog-js';

import { deriveShowSubdomain, trackPosthogEvent } from '../posthog';

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
