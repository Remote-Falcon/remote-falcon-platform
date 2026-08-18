import { describe, it, expect } from 'vitest';

import {
  defaultProcessingInstructions,
  processingInstructions,
  sequenceImage,
  viewerPageMessageElements
} from '../helpers';
import { LocationCheckMethod, ViewerControlMode } from '../../../../../utils/enum';

// `processingInstructions` decides which template tokens
// ({PLAYLISTS}, {VOTES}, {NOW_PLAYING}, ...) get filled vs blanked when
// html-to-react walks the user's viewer page. Three branches:
//   • viewer control disabled  → every dynamic node is blanked
//   • JUKEBOX                  → playlist queue surfaces, votes hidden
//   • VOTING                   → votes surface, queue hidden
// The shape — an array of {replaceChildren, shouldProcessNode,
// processNode} entries — is dictated by html-to-react and the count
// per branch is documented. Pin it so any silent re-ordering blows up.

// html-to-react's processNodeDefinitions exposes a `processDefaultNode`
// fn that the catch-all uses; provide a stub so allNodes() builds a
// proper entry instead of `processNode: undefined`. Real-life callers
// pass `new ProcessNodeDefinitions(React)` from html-to-react.
const fakePnd = { processDefaultNode: () => null };

const allEntriesShaped = (arr) => {
  expect(Array.isArray(arr)).toBe(true);
  for (const entry of arr) {
    expect(entry).toHaveProperty('shouldProcessNode');
    expect(typeof entry.shouldProcessNode).toBe('function');
    // processNode is a function on every node EXCEPT the CODE-mode
    // blankNode insertion (which returns the literal null value).
    expect(['function', 'object']).toContain(typeof entry.processNode);
  }
};

describe('defaultProcessingInstructions', () => {
  it('wraps the all-nodes catch-all in a single-entry array', () => {
    const result = defaultProcessingInstructions(fakePnd);
    expect(result).toHaveLength(1);
    allEntriesShaped(result);
  });
});

describe('processingInstructions', () => {
  const pnd = fakePnd;

  // Counts include the #162 {VOTES_REMAINING} node and the PRD-019
  // {RETRY_LOCATION} + {location-permission-dynamic-container} pair, all of
  // which are present in every branch.
  it('returns 17 entries (every dynamic node blanked) when viewerControlEnabled is false', () => {
    const result = processingInstructions(pnd, false);
    expect(result).toHaveLength(17);
    allEntriesShaped(result);
  });

  it('returns 15 entries in JUKEBOX mode with GEO location', () => {
    const result = processingInstructions(
      pnd,
      true,
      ViewerControlMode.JUKEBOX,
      LocationCheckMethod.GEO,
      'seqs',
      'reqs',
      'now',
      'next',
      3,
      'CODE',
      'timer'
    );
    expect(result).toHaveLength(15);
    allEntriesShaped(result);
  });

  it('returns 15 entries in JUKEBOX mode when location check is CODE (locationCode blanked)', () => {
    const result = processingInstructions(
      pnd,
      true,
      ViewerControlMode.JUKEBOX,
      LocationCheckMethod.CODE,
      'seqs',
      'reqs',
      'now',
      'next',
      3,
      'CODE',
      'timer'
    );
    expect(result).toHaveLength(15);
    allEntriesShaped(result);
  });

  it('returns 16 entries in VOTING mode with GEO location', () => {
    const result = processingInstructions(
      pnd,
      true,
      ViewerControlMode.VOTING,
      LocationCheckMethod.GEO,
      'seqs',
      null,
      'now',
      'next',
      0,
      'CODE',
      'timer',
      '2 of 5 votes left this show'
    );
    expect(result).toHaveLength(16);
    allEntriesShaped(result);
  });

  it('returns 16 entries in VOTING mode when location check is CODE', () => {
    const result = processingInstructions(
      pnd,
      true,
      ViewerControlMode.VOTING,
      LocationCheckMethod.CODE,
      'seqs',
      null,
      'now',
      'next',
      0,
      'CODE',
      'timer'
    );
    expect(result).toHaveLength(16);
    allEntriesShaped(result);
  });
});

describe('viewerPageMessageElements', () => {
  it('exposes a config for every viewer feedback message id', () => {
    const expected = [
      'requestSuccessful',
      'requestPlaying',
      'queueFull',
      'invalidLocation',
      'alreadyVoted',
      'alreadyRequested',
      'requestFailed',
      'invalidLocationCode',
      // #162 daily vote cap + #73/#163 nightly cap / cooldown feedback ids.
      'dailyVoteLimitReached',
      'sequenceUnavailable'
    ];
    expect(Object.keys(viewerPageMessageElements).sort()).toEqual(expected.sort());
  });

  it('every entry exposes element regex + current/block/none strings', () => {
    for (const [name, cfg] of Object.entries(viewerPageMessageElements)) {
      expect(cfg.element, name).toBeInstanceOf(RegExp);
      expect(typeof cfg.current).toBe('string');
      expect(cfg.block, name).toContain('display: block');
      expect(cfg.none, name).toContain('display: none');
    }
  });
});

// A busy show renders 80+ of these. Eager loading pulled megabytes of
// below-the-fold artwork during the initial load, which is what pushed viewer
// LCP into "needs improvement" and shifted layout as each image landed.
describe('sequenceImage', () => {
  const sequence = { name: 'Wizards in Winter', index: 3, imageUrl: 'https://example.test/wiz.jpg' };

  it('defers off-screen artwork and keeps decode off the main thread', () => {
    const img = sequenceImage(sequence);
    expect(img.props.loading).toBe('lazy');
    expect(img.props.decoding).toBe('async');
  });

  it('keeps the class + data-key contract operator templates style against', () => {
    const img = sequenceImage(sequence);
    expect(img.props.className).toBe('sequence-image sequence-image-3');
    expect(img.props['data-key']).toBe('Wizards in Winter');
    expect(img.props.alt).toBe('Wizards in Winter');
    expect(img.props.src).toBe('https://example.test/wiz.jpg');
  });

  // The call sites render {sequenceImage(seq)} inline, so "no artwork" has to
  // come back as nothing-at-all rather than an <img> with an empty src (which
  // browsers resolve against the page URL and re-request).
  it.each([
    ['missing sequence', undefined],
    ['no imageUrl', { name: 'x', index: 1 }],
    ['empty imageUrl', { name: 'x', index: 1, imageUrl: '' }],
    ['whitespace-only imageUrl', { name: 'x', index: 1, imageUrl: '   ' }]
  ])('renders nothing for %s', (_label, input) => {
    expect(sequenceImage(input)).toBeNull();
  });
});
