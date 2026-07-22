import { describe, it, expect } from 'vitest';

import { htmlValidator, isException } from '../htmlValidator';

// Pins the Problems-panel validator config. The backend sanitizer
// (ViewerPageService.sanitize) round-trips saved HTML through jsoup,
// which always serializes the doctype lowercase — so the validator must
// accept BOTH doctype cases or owners land in an unfixable error loop
// (issue tracker #172: save lowercases it, validator demands uppercase).

const page = (doctype) =>
  `${doctype}<html lang="en"><head><title>t</title></head><body></body></html>`;

const messagesFor = async (html) => {
  const report = await htmlValidator.validateString(html);
  return report.results.flatMap((r) => (r.messages ?? []).filter((m) => !isException(m.message)));
};

describe('viewer page htmlValidator', () => {
  it('accepts the lowercase doctype the sanitizer writes back', async () => {
    expect(await messagesFor(page('<!doctype html>'))).toEqual([]);
  });

  it('accepts the uppercase doctype owners type by hand', async () => {
    expect(await messagesFor(page('<!DOCTYPE html>'))).toEqual([]);
  });

  it('still rejects non-HTML5 doctypes via doctype-html', async () => {
    const messages = await messagesFor(page('<!DOCTYPE foo>'));
    expect(messages.some((m) => m.ruleId === 'doctype-html')).toBe(true);
  });

  it('isException filters the platform-accepted noise messages', () => {
    expect(isException('Inline style is not allowed')).toBe(true);
    expect(isException('DOCTYPE should be uppercase')).toBe(false);
  });
});
