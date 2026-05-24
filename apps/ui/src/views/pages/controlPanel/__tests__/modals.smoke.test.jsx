import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import DeleteAccountModal from '../accountSettings/DeleteAccount.modal';
import UpdateEmailModal from '../accountSettings/UpdateEmail.modal';
import UpdateShowNameModal from '../accountSettings/UpdateShowName.modal';
import DeleteStatsModal from '../dashboard/DeleteStats.modal';

// Pure presentational modals — all four wrap MainCard + a Cancel /
// destructive-action button pair. Smoke render + verify the action
// handlers are wired so a regression that drops the onClick fires here
// instead of in a manual QA pass.

const theme = createTheme();
const wrap = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('DeleteAccountModal', () => {
  it('renders the title and warning copy', () => {
    wrap(
      <DeleteAccountModal
        theme={theme}
        handleClose={() => {}}
        deleteAccount={() => {}}
        isDeleting={false}
      />
    );
    // Title appears in MainCard header + as Delete button label.
    expect(screen.getAllByText('Delete Account').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/no going back/)).toBeInTheDocument();
  });

  it('Cancel calls handleClose, Delete Account calls deleteAccount', () => {
    const handleClose = vi.fn();
    const deleteAccount = vi.fn();
    wrap(<DeleteAccountModal theme={theme} handleClose={handleClose} deleteAccount={deleteAccount} isDeleting={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(handleClose).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Delete Account' }));
    expect(deleteAccount).toHaveBeenCalledTimes(1);
  });

  it('renders the loading state without crashing', () => {
    wrap(<DeleteAccountModal theme={theme} handleClose={() => {}} deleteAccount={() => {}} isDeleting />);
    // LoadingButton renders the loading spinner inside the button.
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });
});

describe('UpdateEmailModal', () => {
  it('renders the updated email + warning copy', () => {
    wrap(
      <UpdateEmailModal
        theme={theme}
        handleClose={() => {}}
        updateEmail={() => {}}
        isUpdatingEmail={false}
        updatedEmail="new@example.com"
      />
    );
    expect(screen.getAllByText('Update Email').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('new@example.com')).toBeInTheDocument();
    expect(screen.getByText(/signed out/)).toBeInTheDocument();
  });

  it('wires Cancel + Update Email handlers', () => {
    const handleClose = vi.fn();
    const updateEmail = vi.fn();
    wrap(
      <UpdateEmailModal
        theme={theme}
        handleClose={handleClose}
        updateEmail={updateEmail}
        isUpdatingEmail={false}
        updatedEmail="x@y"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update Email' }));
    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(updateEmail).toHaveBeenCalledTimes(1);
  });
});

describe('UpdateShowNameModal', () => {
  it('renders the updated show name + URL-change warning', () => {
    wrap(
      <UpdateShowNameModal
        theme={theme}
        handleClose={() => {}}
        updateShowName={() => {}}
        isUpdatingShowName={false}
        updatedShowName="Wonderland"
      />
    );
    expect(screen.getAllByText('Update Show Name').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Wonderland')).toBeInTheDocument();
    expect(screen.getByText(/Viewer Page URL/)).toBeInTheDocument();
  });

  it('wires Cancel + Update Show Name handlers', () => {
    const handleClose = vi.fn();
    const updateShowName = vi.fn();
    wrap(
      <UpdateShowNameModal
        theme={theme}
        handleClose={handleClose}
        updateShowName={updateShowName}
        isUpdatingShowName={false}
        updatedShowName="x"
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update Show Name' }));
    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(updateShowName).toHaveBeenCalledTimes(1);
  });
});

describe('DeleteStatsModal', () => {
  it('renders the date range in the confirmation copy', () => {
    wrap(
      <DeleteStatsModal
        theme={theme}
        dateMinus7Formatted="Nov 15"
        datePlus1Formatted="Nov 23"
        handleClose={() => {}}
        deleteStats={() => {}}
        isDeleting={false}
      />
    );
    expect(screen.getAllByText('Delete Stats').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Nov 15/)).toBeInTheDocument();
    expect(screen.getByText(/Nov 23/)).toBeInTheDocument();
  });

  it('wires Cancel + Delete Stats handlers', () => {
    const handleClose = vi.fn();
    const deleteStats = vi.fn();
    wrap(
      <DeleteStatsModal
        theme={theme}
        dateMinus7Formatted="A"
        datePlus1Formatted="B"
        handleClose={handleClose}
        deleteStats={deleteStats}
        isDeleting={false}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Stats' }));
    expect(handleClose).toHaveBeenCalledTimes(1);
    expect(deleteStats).toHaveBeenCalledTimes(1);
  });
});
