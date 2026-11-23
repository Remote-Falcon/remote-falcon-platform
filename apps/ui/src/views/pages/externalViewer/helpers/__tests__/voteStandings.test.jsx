import { render } from '@testing-library/react';

import { computeVoteStandings, isViewerVote, leadingVoteElement, leadingVoteCountElement, votingResultsElement } from '../voteStandings';

const seq = (name, extra = {}) => ({ name, displayName: `${name} Display`, artist: `${name} Artist`, index: 1, visible: true, ...extra });
const vote = (name, votes, lastVoteTime, extra = {}) => ({
  sequence: { name, displayName: `${name} Display` },
  sequenceGroup: null,
  votes,
  lastVoteTime,
  ...extra
});

describe('isViewerVote', () => {
  it('accepts an ordinary viewer vote', () => {
    expect(isViewerVote(vote('A', 3, '2026-12-01T01:00:00Z'))).toBe(true);
  });

  it.each([
    ['systemInjected', { systemInjected: true }],
    ['ownerOverride', { ownerOverride: true }]
  ])('rejects a %s vote even when its count is small', (_label, extra) => {
    expect(isViewerVote(vote('A', 1, '2026-12-01T01:00:00Z', extra))).toBe(false);
  });

  it('rejects a vote at or above the 2000 system floor (mirrors Vote.isSystemInjected)', () => {
    expect(isViewerVote(vote('A', 2000, '2026-12-01T01:00:00Z'))).toBe(false);
    expect(isViewerVote(vote('A', 1999, '2026-12-01T01:00:00Z'))).toBe(true);
  });

  it('rejects null and zero-count entries', () => {
    expect(isViewerVote(null)).toBe(false);
    expect(isViewerVote(vote('A', 0, '2026-12-01T01:00:00Z'))).toBe(false);
  });
});

describe('computeVoteStandings', () => {
  it('returns [] when there are no votes', () => {
    expect(computeVoteStandings(undefined, [seq('A')])).toEqual([]);
    expect(computeVoteStandings([], [seq('A')])).toEqual([]);
  });

  it('sorts by votes desc, ties to the EARLIEST vote time (same order the plugins-api plays)', () => {
    const standings = computeVoteStandings(
      [vote('A', 2, '2026-12-01T01:05:00Z'), vote('B', 5, '2026-12-01T01:09:00Z'), vote('C', 2, '2026-12-01T01:01:00Z')],
      [seq('A'), seq('B'), seq('C')]
    );
    expect(standings.map((s) => s.name)).toEqual(['B', 'C', 'A']);
    expect(standings[0]).toMatchObject({ displayName: 'B Display', artist: 'B Artist', votes: 5 });
  });

  it('ranks across categories (category grouping is a display concern only)', () => {
    const standings = computeVoteStandings(
      [vote('Uncat', 1, '2026-12-01T01:00:00Z'), vote('Cat2Song', 4, '2026-12-01T01:00:00Z')],
      [seq('Uncat'), seq('Cat2Song', { category: 'Classics' })]
    );
    expect(standings[0].name).toBe('Cat2Song');
  });

  it('drops PSA / leader / override entries so they never lead', () => {
    const standings = computeVoteStandings(
      [vote('PSA', 2000, '2026-12-01T01:00:00Z', { systemInjected: true }), vote('A', 1, '2026-12-01T01:00:00Z')],
      [seq('PSA'), seq('A')]
    );
    expect(standings.map((s) => s.name)).toEqual(['A']);
  });

  it('resolves a group vote to the collapsed group row getShow sends', () => {
    const standings = computeVoteStandings(
      [{ sequence: null, sequenceGroup: { name: 'Medley' }, votes: 3, lastVoteTime: '2026-12-01T01:00:00Z' }],
      [seq('Medley', { displayName: 'Medley', artist: 'Various' })]
    );
    expect(standings).toHaveLength(1);
    expect(standings[0]).toMatchObject({ name: 'Medley', displayName: 'Medley', votes: 3 });
  });

  it("falls back to the vote's own display name when the sequence isn't in the list", () => {
    const standings = computeVoteStandings([vote('Gone', 2, '2026-12-01T01:00:00Z')], []);
    expect(standings[0]).toMatchObject({ name: 'Gone', displayName: 'Gone Display', artist: null });
  });

  it('drops a vote with neither a sequence nor a group', () => {
    expect(computeVoteStandings([{ votes: 3, lastVoteTime: '2026-12-01T01:00:00Z' }], [])).toEqual([]);
  });
});

describe('rendered slots', () => {
  const standings = [
    { name: 'B', displayName: 'B Display', artist: 'B Artist', votes: 5 },
    { name: 'A', displayName: 'A Display', artist: null, votes: 2 }
  ];

  it('renders nothing for every slot when nobody has voted, so the wrapper is :empty', () => {
    expect(leadingVoteElement([])).toBeNull();
    expect(leadingVoteCountElement([])).toBeNull();
    expect(votingResultsElement([])).toBeNull();
  });

  it('{LEADING_VOTE} renders the leader title + artist in styleable spans', () => {
    const { container } = render(leadingVoteElement(standings));
    expect(container.querySelector('.leading-vote-title').textContent).toBe('B Display');
    expect(container.querySelector('.leading-vote-artist').textContent).toBe('B Artist');
    expect(container.querySelector('.leading-vote').getAttribute('data-key')).toBe('B');
  });

  it('{LEADING_VOTE} omits the artist span when the song has no artist', () => {
    const { container } = render(leadingVoteElement([standings[1]]));
    expect(container.querySelector('.leading-vote-artist')).toBeNull();
  });

  it('{LEADING_VOTE_COUNT} renders the bare count', () => {
    const { container } = render(<div>{leadingVoteCountElement(standings)}</div>);
    expect(container.textContent).toBe('5');
  });

  it('{VOTING_RESULTS} renders one ranked row per song, highest first', () => {
    const { container } = render(votingResultsElement(standings));
    const rows = container.querySelectorAll('.voting-results > .voting-result');
    expect(rows).toHaveLength(2);
    expect(rows[0].classList).toContain('voting-result-1');
    expect(rows[0].querySelector('.voting-result-rank').textContent).toBe('1');
    expect(rows[0].querySelector('.voting-result-title').textContent).toBe('B Display');
    expect(rows[0].querySelector('.voting-result-count').textContent).toBe('5');
    expect(rows[1].getAttribute('data-key')).toBe('A');
    expect(rows[1].querySelector('.voting-result-artist')).toBeNull();
  });
});
