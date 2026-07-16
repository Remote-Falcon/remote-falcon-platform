import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import BulkMetadataLookupDialog from '../BulkMetadataLookupDialog';

// Mock the throttled queue — the dialog's job is the review gate, not pacing
// (pacing has its own unit tests in utils/__tests__/bulkMetadataLookup.test.js).
vi.mock('../../../../../utils/bulkMetadataLookup', () => ({
  estimateBulkLookupMinutes: vi.fn(() => 1),
  runBulkLookup: vi.fn()
}));

import { runBulkLookup } from '../../../../../utils/bulkMetadataLookup';

const match = (title, artist) => ({
  title,
  artist,
  album: null,
  artworkUrl: `https://art/${title}.jpg`,
  thumbnailUrl: `https://thumb/${title}.jpg`
});

describe('BulkMetadataLookupDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const targets = [
    { key: 'a-1', query: 'Carol of the Bells' },
    { key: 'b-1', query: 'XMAS_UNKNOWN_01' },
    { key: 'c-1', query: 'Wizards in Winter' }
  ];

  const rowsFromLookup = [
    { key: 'a-1', query: 'Carol of the Bells', match: match('Carol of the Bells', 'TSO'), error: null },
    { key: 'b-1', query: 'XMAS_UNKNOWN_01', match: null, error: null },
    { key: 'c-1', query: 'Wizards in Winter', match: match('Wizards in Winter', 'TSO'), error: null }
  ];

  it('moves to review with matches checked by default and no-match rows disabled', async () => {
    runBulkLookup.mockResolvedValue(rowsFromLookup);
    render(<BulkMetadataLookupDialog open targets={targets} onClose={vi.fn()} onApply={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/Apply 2 matches/)).toBeInTheDocument());

    expect(screen.getByLabelText('Apply match for Carol of the Bells')).toBeChecked();
    expect(screen.getByLabelText('Apply match for Wizards in Winter')).toBeChecked();
    const noMatchBox = screen.getByLabelText('Apply match for XMAS_UNKNOWN_01');
    expect(noMatchBox).toBeDisabled();
    expect(noMatchBox).not.toBeChecked();
    expect(screen.getByText('No match found')).toBeInTheDocument();
  });

  it('applies only the checked matches, keyed for the parent to resolve against current rows', async () => {
    runBulkLookup.mockResolvedValue(rowsFromLookup);
    const onApply = vi.fn();
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<BulkMetadataLookupDialog open targets={targets} onClose={onClose} onApply={onApply} />);

    await waitFor(() => expect(screen.getByText(/Apply 2 matches/)).toBeInTheDocument());

    // Uncheck one of the two matches, then apply.
    await user.click(screen.getByLabelText('Apply match for Wizards in Winter'));
    await user.click(screen.getByText(/Apply 1 match$/));

    expect(onApply).toHaveBeenCalledTimes(1);
    const picked = onApply.mock.calls[0][0];
    expect(picked).toHaveLength(1);
    expect(picked[0].key).toBe('a-1');
    expect(picked[0].match.title).toBe('Carol of the Bells');
    expect(onClose).toHaveBeenCalled();
  });

  it('disables Apply when everything is unchecked', async () => {
    runBulkLookup.mockResolvedValue(rowsFromLookup);
    const user = userEvent.setup();
    render(<BulkMetadataLookupDialog open targets={targets} onClose={vi.fn()} onApply={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/Apply 2 matches/)).toBeInTheDocument());
    await user.click(screen.getByLabelText('Select all matches')); // uncheck all

    expect(screen.getByText(/Apply 0 matches/).closest('button')).toBeDisabled();
  });

  it('summarizes outcomes as chips and filters rows by status', async () => {
    runBulkLookup.mockResolvedValue(rowsFromLookup);
    const user = userEvent.setup();
    render(<BulkMetadataLookupDialog open targets={targets} onClose={vi.fn()} onApply={vi.fn()} />);

    await waitFor(() => expect(screen.getByText('All (3)')).toBeInTheDocument());
    expect(screen.getByText('Matched (2)')).toBeInTheDocument();
    expect(screen.getByText('No match (1)')).toBeInTheDocument();
    expect(screen.queryByText(/Failed \(/)).not.toBeInTheDocument(); // hidden at zero

    await user.click(screen.getByText('No match (1)'));
    expect(screen.getByText('XMAS_UNKNOWN_01')).toBeInTheDocument();
    expect(screen.queryByText('Wizards in Winter')).not.toBeInTheDocument();
    // Apply stays global — filtering never silently changes the action.
    expect(screen.getByText(/Apply 2 matches/)).toBeInTheDocument();

    await user.click(screen.getByText('All (3)'));
    // Appears as both the sequence name and the proposed match title.
    expect(screen.getAllByText('Wizards in Winter').length).toBeGreaterThan(0);
  });

  it('sorts by sequence name when the column header is clicked', async () => {
    runBulkLookup.mockResolvedValue(rowsFromLookup);
    const user = userEvent.setup();
    render(<BulkMetadataLookupDialog open targets={targets} onClose={vi.fn()} onApply={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/Apply 2 matches/)).toBeInTheDocument());
    await user.click(screen.getByText('Sequence'));

    const labels = screen.getAllByLabelText(/Apply match for/).map((el) => el.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Apply match for Carol of the Bells',
      'Apply match for Wizards in Winter',
      'Apply match for XMAS_UNKNOWN_01'
    ]);

    await user.click(screen.getByText('Sequence')); // toggle desc
    const desc = screen.getAllByLabelText(/Apply match for/).map((el) => el.getAttribute('aria-label'));
    expect(desc).toEqual([
      'Apply match for XMAS_UNKNOWN_01',
      'Apply match for Wizards in Winter',
      'Apply match for Carol of the Bells'
    ]);
  });

  it('scopes select-all to the filtered view without dropping other selections', async () => {
    runBulkLookup.mockResolvedValue(rowsFromLookup);
    const user = userEvent.setup();
    render(<BulkMetadataLookupDialog open targets={targets} onClose={vi.fn()} onApply={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/Apply 2 matches/)).toBeInTheDocument());

    // Filter to matched rows only, uncheck them all via the header box…
    await user.click(screen.getByText('Matched (2)'));
    await user.click(screen.getByLabelText('Select all matches'));
    expect(screen.getByText(/Apply 0 matches/)).toBeInTheDocument();

    // …then re-check just one row and confirm the global count follows.
    await user.click(screen.getByLabelText('Apply match for Carol of the Bells'));
    expect(screen.getByText(/Apply 1 match$/)).toBeInTheDocument();
  });

  it('shows lookup failures as non-applicable rows', async () => {
    runBulkLookup.mockResolvedValue([{ key: 'a-1', query: 'Carol of the Bells', match: null, error: 'iTunes search failed (503)' }]);
    render(
      <BulkMetadataLookupDialog open targets={[targets[0]]} onClose={vi.fn()} onApply={vi.fn()} />
    );

    await waitFor(() => expect(screen.getByText('Lookup failed')).toBeInTheDocument());
    expect(screen.getByText(/Apply 0 matches/).closest('button')).toBeDisabled();
  });
});
