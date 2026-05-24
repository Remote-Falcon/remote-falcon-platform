import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock posthog-js BEFORE importing the module under test so the import
// graph sees the mocked module.
vi.mock('posthog-js', () => ({
  default: { capture: vi.fn() }
}));

import posthog from 'posthog-js';

import { trackPosthogEvent } from '../posthog';

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
