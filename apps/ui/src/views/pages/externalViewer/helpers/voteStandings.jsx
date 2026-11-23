import React from 'react';

/**
 * #218 / #202 — live vote standings for the {LEADING_VOTE},
 * {LEADING_VOTE_COUNT} and {VOTING_RESULTS} viewer-page placeholders.
 *
 * The {PLAYLISTS} list sorts within each category, so its first row is not the
 * overall leader once categories are on. These slots rank every viewer vote
 * across all categories instead.
 *
 * "Leading" is deliberately not "next": the plugins-api can play a pending
 * PSA/leader first, and anti-consecutive category rules or nightly play caps
 * can defer the leader to a later round (PluginService.selectWinningVote). The
 * client can't evaluate those, so the slots report standings only.
 */

// Mirrors Vote.SYSTEM_VOTE_FLOOR in libs/schema. PSAs, leaders, group
// expansions and owner overrides are injected at >= 2000.
const SYSTEM_VOTE_FLOOR = 2000;

/** Same predicate as Vote.isSystemInjected (libs/schema), inverted, plus count > 0. */
export const isViewerVote = (vote) => {
  if (!vote) return false;
  if (vote.systemInjected === true || vote.ownerOverride === true) return false;
  const count = vote.votes ?? 0;
  return count > 0 && count < SYSTEM_VOTE_FLOOR;
};

const voteTimeMillis = (lastVoteTime) => {
  const ms = Date.parse(lastVoteTime ?? '');
  return Number.isNaN(ms) ? Number.MAX_SAFE_INTEGER : ms;
};

/**
 * Viewer votes ranked the way the plugins-api picks a winner: most votes
 * first, ties to the earliest last vote. `sequences` is getShow's list, where a
 * group is already collapsed into one row named after the group.
 *
 * @returns {{ name: string, displayName: string, artist: string|null, votes: number, lastVoteTime: string|null }[]}
 */
export const computeVoteStandings = (votes, sequences) => {
  const byName = new Map();
  (sequences ?? []).forEach((sequence) => {
    if (sequence?.name != null) byName.set(sequence.name, sequence);
  });

  const standings = [];
  (votes ?? []).forEach((vote) => {
    if (!isViewerVote(vote)) return;
    const name = vote.sequenceGroup?.name ?? vote.sequence?.name;
    if (name == null) return;
    const sequence = byName.get(name);
    standings.push({
      name,
      displayName: sequence?.displayName || vote.sequence?.displayName || name,
      artist: sequence?.artist || null,
      votes: vote.votes,
      lastVoteTime: vote.lastVoteTime ?? null
    });
  });

  return standings.sort((a, b) => b.votes - a.votes || voteTimeMillis(a.lastVoteTime) - voteTimeMillis(b.lastVoteTime));
};

// Every slot returns null (not an empty fragment) when nobody has voted, so the
// operator's wrapper element is :empty and can be hidden with CSS alone.

export const leadingVoteElement = (standings) => {
  const leader = standings?.[0];
  if (!leader) return null;
  return (
    <span className="leading-vote" data-key={leader.name}>
      <span className="leading-vote-title">{leader.displayName}</span>
      {leader.artist ? <span className="leading-vote-artist">{leader.artist}</span> : null}
    </span>
  );
};

export const leadingVoteCountElement = (standings) => {
  return standings?.[0]?.votes ?? null;
};

export const votingResultsElement = (standings) => {
  if (!standings?.length) return null;
  return (
    <div className="voting-results">
      {standings.map((entry, i) => (
        <div key={entry.name} className={`voting-result voting-result-${i + 1}`} data-key={entry.name}>
          <span className="voting-result-rank">{i + 1}</span>
          <span className="voting-result-title">{entry.displayName}</span>
          {entry.artist ? <span className="voting-result-artist">{entry.artist}</span> : null}
          <span className="voting-result-count">{entry.votes}</span>
        </div>
      ))}
    </div>
  );
};
