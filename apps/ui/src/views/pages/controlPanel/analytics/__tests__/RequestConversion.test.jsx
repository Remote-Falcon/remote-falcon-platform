import { describe, expect, it } from 'vitest';
import { REASON_HINT, REASON_LABEL } from '../RequestConversion';

// #214 — every reason the viewer service can record in stats.rejectedRequests
// (viewer GraphQLMutationService.logRejectedRequest: the request rule chain,
// RejectionReason.forStat and the #73/#177 unavailable split) must have a
// label, or the card prints the raw code. Listed explicitly so adding a reason
// on the viewer without a label here is a visible, reviewable gap.
const RECORDED_REASONS = [
  'QUEUE_FULL',
  'ALREADY_REQUESTED',
  'NAUGHTY',
  'INVALID_LOCATION',
  'INVALID_LOCATION_IN_APP',
  'INVALID_LOCATION_PERMISSION',
  'SEQUENCE_REQUESTED',
  'SEQUENCE_UNAVAILABLE',
  'SEQUENCE_UNAVAILABLE_COOLDOWN',
  'SEQUENCE_UNAVAILABLE_NIGHTLY_CAP',
  'SEQUENCE_UNAVAILABLE_GROUP_CAP',
  'CATEGORY_REQUEST_LIMIT'
];

describe('RequestConversion reason copy', () => {
  it.each(RECORDED_REASONS)('%s has a human label', (reason) => {
    expect(REASON_LABEL[reason]).toBeTruthy();
    expect(REASON_LABEL[reason]).not.toBe(reason);
  });

  it.each(RECORDED_REASONS)('%s has a hint', (reason) => {
    expect(REASON_HINT[reason]).toBeTruthy();
  });

  it('points operators at the real settings page name', () => {
    Object.values(REASON_HINT).forEach((hint) => {
      expect(hint).not.toMatch(/(?<!Remote Falcon )Settings →/);
    });
  });
});
