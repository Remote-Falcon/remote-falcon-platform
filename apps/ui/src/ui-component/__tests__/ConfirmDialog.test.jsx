import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import ConfirmDialog from '../ConfirmDialog';

const theme = createTheme();
const renderWithTheme = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('ConfirmDialog', () => {
  it('is closed (not in DOM) when confirm is null', () => {
    renderWithTheme(<ConfirmDialog confirm={null} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens with title + message when confirm is set', () => {
    renderWithTheme(
      <ConfirmDialog
        confirm={{ title: 'Delete user?', message: 'This cannot be undone.', action: () => {} }}
        onClose={() => {}}
      />
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Delete user?')).toBeInTheDocument();
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
  });

  it('defaults the confirm button label to "Confirm"', () => {
    renderWithTheme(
      <ConfirmDialog confirm={{ title: 'X' }} onClose={() => {}} />
    );
    expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
  });

  it('uses the supplied confirmLabel when provided', () => {
    renderWithTheme(
      <ConfirmDialog
        confirm={{ title: 'X', confirmLabel: 'Yeet', action: () => {} }}
        onClose={() => {}}
      />
    );
    expect(screen.getByRole('button', { name: 'Yeet' })).toBeInTheDocument();
  });

  it('Cancel calls onClose and does not invoke action', () => {
    const action = vi.fn();
    const onClose = vi.fn();
    renderWithTheme(
      <ConfirmDialog
        confirm={{ title: 'X', action }}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(action).not.toHaveBeenCalled();
  });

  it('Confirm closes first, then invokes action (sync)', async () => {
    const action = vi.fn();
    const onClose = vi.fn();
    renderWithTheme(
      <ConfirmDialog
        confirm={{ title: 'X', action }}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    // onClose is called synchronously before the action awaits.
    expect(onClose).toHaveBeenCalledTimes(1);
    // Allow the async handler to flush the action invocation.
    await Promise.resolve();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('does not throw when action is omitted (only title + close)', async () => {
    const onClose = vi.fn();
    renderWithTheme(
      <ConfirmDialog confirm={{ title: 'X' }} onClose={onClose} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
