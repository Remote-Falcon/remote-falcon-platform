import { describe, it, expect } from 'vitest';

import { redactEventUrls, redactVerifyEmailToken } from '../redactUrl';

// Email verification links carry a token in the path. It must never leave the
// browser in analytics.
describe('redactVerifyEmailToken', () => {
  it('redacts the token segment of a full verify URL and keeps the subdomain', () => {
    expect(redactVerifyEmailToken('https://remotefalcon.com/verifyEmail/abc123XYZ/mapleshow')).toBe(
      'https://remotefalcon.com/verifyEmail/[redacted]/mapleshow'
    );
  });

  it('redacts a bare pathname', () => {
    expect(redactVerifyEmailToken('/verifyEmail/abc123/mapleshow')).toBe('/verifyEmail/[redacted]/mapleshow');
  });

  it('stops at query strings and fragments', () => {
    expect(redactVerifyEmailToken('/verifyEmail/abc?x=1')).toBe('/verifyEmail/[redacted]?x=1');
    expect(redactVerifyEmailToken('/verifyEmail/abc#top')).toBe('/verifyEmail/[redacted]#top');
  });

  it('leaves other URLs and non-strings alone', () => {
    expect(redactVerifyEmailToken('https://remotefalcon.com/dashboard')).toBe('https://remotefalcon.com/dashboard');
    expect(redactVerifyEmailToken(undefined)).toBeUndefined();
    expect(redactVerifyEmailToken(42)).toBe(42);
  });
});

describe('redactEventUrls', () => {
  it('redacts URL properties on the event, $set and $set_once', () => {
    const url = 'https://remotefalcon.com/verifyEmail/tok123/show';
    const event = {
      event: '$pageview',
      properties: { $current_url: url, $pathname: '/verifyEmail/tok123/show', $referrer: url, other: url },
      $set: { $current_url: url },
      $set_once: { $initial_current_url: url, $initial_pathname: '/verifyEmail/tok123/show' }
    };

    const out = redactEventUrls(event);

    expect(out.properties.$current_url).toBe('https://remotefalcon.com/verifyEmail/[redacted]/show');
    expect(out.properties.$pathname).toBe('/verifyEmail/[redacted]/show');
    expect(out.properties.$referrer).toBe('https://remotefalcon.com/verifyEmail/[redacted]/show');
    expect(out.$set.$current_url).toBe('https://remotefalcon.com/verifyEmail/[redacted]/show');
    expect(out.$set_once.$initial_current_url).toBe('https://remotefalcon.com/verifyEmail/[redacted]/show');
    expect(out.$set_once.$initial_pathname).toBe('/verifyEmail/[redacted]/show');
    // Only known URL properties are touched.
    expect(out.properties.other).toBe(url);
  });

  it('passes null events (dropped by another hook) through', () => {
    expect(redactEventUrls(null)).toBeNull();
  });
});
