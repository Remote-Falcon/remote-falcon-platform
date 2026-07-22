import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import SequenceMetadataLookup from '../SequenceMetadataLookup';

// The popover's contract: auto-search the (cleaned) sequence name on open,
// let the owner pick a match, and hand { artist, artworkUrl, ... } back via
// onSelect — persistence stays with the parent. iTunes pacing/mapping is
// pinned in utils/__tests__/musicMetadata.test.js; these tests cover the
// pick/error/empty flows.

vi.mock('../../../../../utils/musicMetadata', () => ({
  lookupITunes: vi.fn()
}));
vi.mock('../../../../../utils/analytics/posthog', () => ({
  trackPosthogEvent: vi.fn()
}));

import { trackPosthogEvent } from '../../../../../utils/analytics/posthog';
import { lookupITunes } from '../../../../../utils/musicMetadata';

// album stays null so the caption renders the artist alone — keeps the
// getByText assertions exact instead of regex-matching a joined string.
const result = (title, artist) => ({
  title,
  artist,
  album: null,
  artworkUrl: `https://art/${title}.jpg`,
  thumbnailUrl: `https://thumb/${title}.jpg`
});

const renderPopover = (props = {}) => {
  const anchorEl = document.createElement('div');
  document.body.appendChild(anchorEl);
  return render(
    <SequenceMetadataLookup
      anchorEl={anchorEl}
      defaultQuery="Carol of the Bells"
      onClose={vi.fn()}
      onSelect={vi.fn()}
      {...props}
    />
  );
};

describe('SequenceMetadataLookup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('auto-searches the default query on open and preselects the first result', async () => {
    lookupITunes.mockResolvedValue([result('Carol of the Bells', 'TSO'), result('Carol of the Bells', 'Pentatonix')]);
    renderPopover();

    await waitFor(() => expect(screen.getByText('TSO')).toBeInTheDocument());
    expect(lookupITunes).toHaveBeenCalledWith('Carol of the Bells');
    expect(screen.getByText('Use selected').closest('button')).toBeEnabled();
  });

  it('hands the picked result to onSelect and tracks the pick', async () => {
    lookupITunes.mockResolvedValue([result('Carol of the Bells', 'TSO'), result('Carol of the Bells', 'Pentatonix')]);
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    renderPopover({ onSelect, onClose });

    await waitFor(() => expect(screen.getByText('Pentatonix')).toBeInTheDocument());
    await user.click(screen.getByText('Pentatonix'));
    await user.click(screen.getByText('Use selected'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0].artist).toBe('Pentatonix');
    expect(onClose).toHaveBeenCalled();
    expect(trackPosthogEvent).toHaveBeenCalledWith(
      'sequence_metadata_lookup_used',
      expect.objectContaining({ result_index: 1, result_count: 2 })
    );
  });

  it('shows the empty state when the search returns nothing', async () => {
    lookupITunes.mockResolvedValue([]);
    renderPopover({ defaultQuery: 'XMAS_UNKNOWN_01' });

    await waitFor(() => expect(screen.getByText(/No matches/)).toBeInTheDocument());
    expect(screen.getByText('Use selected').closest('button')).toBeDisabled();
  });

  it('shows the error state when the lookup throws', async () => {
    lookupITunes.mockRejectedValue(new Error('iTunes search failed (503)'));
    renderPopover();

    await waitFor(() => expect(screen.getByText(/Lookup failed/)).toBeInTheDocument());
    expect(screen.getByText('Use selected').closest('button')).toBeDisabled();
  });
});
