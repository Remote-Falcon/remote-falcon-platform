import { describe, it, expect } from 'vitest';

import {
  defaultProcessingInstructions,
  processingInstructions,
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

  it('returns 14 entries (every dynamic node blanked) when viewerControlEnabled is false', () => {
    const result = processingInstructions(pnd, false);
    expect(result).toHaveLength(14);
    allEntriesShaped(result);
  });

  it('returns 12 entries in JUKEBOX mode with GEO location', () => {
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
    expect(result).toHaveLength(12);
    allEntriesShaped(result);
  });

  it('returns 12 entries in JUKEBOX mode when location check is CODE (locationCode blanked)', () => {
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
    expect(result).toHaveLength(12);
    allEntriesShaped(result);
  });

  it('returns 13 entries in VOTING mode with GEO location', () => {
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
      'timer'
    );
    expect(result).toHaveLength(13);
    allEntriesShaped(result);
  });

  it('returns 13 entries in VOTING mode when location check is CODE', () => {
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
    expect(result).toHaveLength(13);
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
      'invalidLocationCode'
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
