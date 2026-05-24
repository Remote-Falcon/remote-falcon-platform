import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import StickyFormBar from '../StickyFormBar';

const theme = createTheme();
const wrap = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

// Pinned to the autosave state machine in useAutoSave. Each status maps
// to a distinct (icon, label) pill — regression in any label would erode
// the "did my edit save?" feedback users rely on.

describe('StickyFormBar', () => {
  it('hides (unmountOnExit) on idle status', () => {
    wrap(<StickyFormBar status="idle" />);
    expect(screen.queryByText(/Unsaved/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Saving/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Saved/)).not.toBeInTheDocument();
  });

  it('dirty → "Unsaved changes"', () => {
    wrap(<StickyFormBar status="dirty" />);
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
  });

  it('saving → "Saving…"', () => {
    wrap(<StickyFormBar status="saving" />);
    expect(screen.getByText('Saving…')).toBeInTheDocument();
  });

  it('saved → "Saved"', () => {
    wrap(<StickyFormBar status="saved" />);
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('error → "Couldn\'t save — try again"', () => {
    wrap(<StickyFormBar status="error" />);
    expect(screen.getByText(/Couldn't save/)).toBeInTheDocument();
  });
});
