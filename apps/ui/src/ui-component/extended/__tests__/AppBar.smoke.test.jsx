import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';

import AppBar from '../AppBar';

// Marketing AppBar — full-width header used on landing + auth routes.
// Pure render; uses RouterLink so needs a MemoryRouter context.

const wrap = (ui, mode = 'light') => (
  <ThemeProvider theme={createTheme({ palette: { mode } })}>
    <MemoryRouter>{ui}</MemoryRouter>
  </ThemeProvider>
);

describe('extended/AppBar', () => {
  it('renders the marketing nav links in default variant (light theme)', () => {
    render(wrap(<AppBar />));
    expect(screen.getByText('Features')).toBeInTheDocument();
    expect(screen.getByText('Docs')).toBeInTheDocument();
    expect(screen.getByText('Community')).toBeInTheDocument();
  });

  it('renders in dark theme without throwing', () => {
    expect(() => render(wrap(<AppBar />, 'dark'))).not.toThrow();
  });

  it('renders the auth variant without throwing (minimal lockup + theme toggle)', () => {
    expect(() => render(wrap(<AppBar variant="auth" />))).not.toThrow();
  });
});
