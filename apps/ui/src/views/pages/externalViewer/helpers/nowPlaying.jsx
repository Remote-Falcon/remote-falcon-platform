import React from 'react';

import _ from 'lodash';

import { ViewerControlMode } from '../../../../utils/enum';
import { sequenceImage } from './helpers';

// #188: the Now Playing, Next and jukebox queue artist labels used to borrow
// the artist class built for whichever sequence the main list loop was on, so
// every one of them ended up keyed by the last visible sequence's index. These
// builders key each label by the song it actually renders.

const ARTIST_CLASS_BASE = {
  [ViewerControlMode.JUKEBOX]: 'jukebox-list-artist',
  [ViewerControlMode.VOTING]: 'cell-vote-playlist-artist'
};

/**
 * Artist classname for one rendered song, e.g.
 * `jukebox-list-artist jukebox-list-artist-3`. The keyed class is omitted when
 * the sequence has no index, so a missing sequence never yields `-undefined`.
 */
export const artistClassname = (mode, sequence) => {
  const base = ARTIST_CLASS_BASE[mode];
  const index = sequence?.index;
  if (index == null || index === '') {
    return base;
  }
  return `${base} ${base}-${index}`;
};

/**
 * Content for the {NOW_PLAYING} / {NEXT_PLAYLIST} slot: artwork, display name
 * and the artist label keyed by that sequence's own index.
 */
export const playingSequenceElement = (mode, sequence) => (
  <>
    {sequenceImage(sequence)}
    {sequence?.displayName}
    <div className={artistClassname(mode, sequence)}>{sequence?.artist}</div>
  </>
);

/**
 * Rows for the jukebox queue. The first request (by position) is what's
 * playing now or next, so it is left out of the list. Each row's artist label
 * keeps the shared `jukebox-list-artist` classes (existing templates target
 * them) plus `jukebox-queue-artist`, and the title is wrapped in
 * `jukebox-queue-title` so templates can style queue rows on their own.
 */
export const jukeboxQueueElements = (requests) => {
  const ordered = _.orderBy(requests || [], ['position'], ['asc']);
  const elements = [];
  _.forEach(ordered, (request, index) => {
    if (index !== 0) {
      elements.push(
        <React.Fragment key={`${request?.position ?? ''}-${index}`}>
          <div className="jukebox-queue">
            {sequenceImage(request?.sequence)}
            <span className="jukebox-queue-title">{request?.sequence?.displayName}</span>
            <div className={`${artistClassname(ViewerControlMode.JUKEBOX, request?.sequence)} jukebox-queue-artist`}>
              {request?.sequence?.artist}
            </div>
          </div>
        </React.Fragment>
      );
    }
  });
  return elements;
};
