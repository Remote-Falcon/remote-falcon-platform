import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import EmptyState from '../EmptyState';

const theme = createTheme();
const renderWithTheme = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('EmptyState', () => {
  it('renders title only when description/cta/icon are absent', () => {
    renderWithTheme(<EmptyState title="No data yet" />);
    expect(screen.getByText('No data yet')).toBeInTheDocument();
  });

  it('renders the description below the title when provided', () => {
    renderWithTheme(<EmptyState title="Empty" description="Add your first show" />);
    expect(screen.getByText('Add your first show')).toBeInTheDocument();
  });

  it('renders the icon inside the circular badge', () => {
    renderWithTheme(
      <EmptyState
        title="No items"
        icon={<span data-testid="empty-icon">x</span>}
      />
    );
    expect(screen.getByTestId('empty-icon')).toBeInTheDocument();
  });

  it('renders the CTA button and wires onClick', () => {
    const onClick = vi.fn();
    renderWithTheme(
      <EmptyState
        title="No items"
        cta={{ label: 'Create first', onClick }}
      />
    );
    const btn = screen.getByRole('button', { name: 'Create first' });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not render the CTA button when cta is absent', () => {
    renderWithTheme(<EmptyState title="Empty" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
