import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import WhatsNew from '../WhatsNew.modal';

const theme = createTheme();
const wrap = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('WhatsNew modal', () => {
  it('renders the heading + the documented bullet list', () => {
    wrap(<WhatsNew handleClose={() => {}} />);
    expect(screen.getAllByText("What's New").length).toBeGreaterThanOrEqual(1);
    // Bullet copy from the modal — pin one stable phrase from each item.
    expect(screen.getByText(/This modal is new/)).toBeInTheDocument();
    expect(screen.getByText(/Delete Inactive/)).toBeInTheDocument();
  });

  it('Got It! button calls handleClose', () => {
    const handleClose = vi.fn();
    wrap(<WhatsNew handleClose={handleClose} />);
    fireEvent.click(screen.getByRole('button', { name: /Got It!/ }));
    expect(handleClose).toHaveBeenCalledTimes(1);
  });
});
