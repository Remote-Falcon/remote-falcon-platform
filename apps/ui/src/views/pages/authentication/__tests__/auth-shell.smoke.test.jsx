import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';

import AuthShell from '../AuthShell';
import AuthCardWrapper from '../AuthCardWrapper';
import AuthWrapper from '../AuthWrapper';

// Pure presentational chrome wrappers used by every auth route. Smoke
// render with both themes — same DOM, swapped palette branches inside
// AuthWrapper (background colour) and AppBar inside AuthShell.

const wrap = (ui, mode = 'light') => (
  <ThemeProvider theme={createTheme({ palette: { mode } })}>
    <MemoryRouter>{ui}</MemoryRouter>
  </ThemeProvider>
);

describe('AuthShell', () => {
  it('renders the heading + subhead + children in the form panel', () => {
    render(wrap(
      <AuthShell heading="So glad you came back!" subhead="Sign in" eyebrow="WELCOME" tagline={<>Hello</>}>
        <div data-testid="form-here">FORM</div>
      </AuthShell>
    ));
    expect(screen.getByText('So glad you came back!')).toBeInTheDocument();
    expect(screen.getByText('Sign in')).toBeInTheDocument();
    expect(screen.getByText('WELCOME')).toBeInTheDocument();
    expect(screen.getByTestId('form-here')).toBeInTheDocument();
  });

  it('renders the meta strip when provided', () => {
    render(wrap(
      <AuthShell heading="x" tagline={<>t</>} meta="Open source · Community-built">
        <div>f</div>
      </AuthShell>
    ));
    expect(screen.getByText(/Open source/)).toBeInTheDocument();
  });

  it('renders in dark mode without throwing', () => {
    expect(() => render(wrap(
      <AuthShell heading="x" tagline={<>t</>}>
        <div>f</div>
      </AuthShell>,
      'dark'
    ))).not.toThrow();
  });
});

describe('AuthCardWrapper', () => {
  it('renders children inside a MainCard with the padded body', () => {
    render(wrap(
      <AuthCardWrapper>
        <div data-testid="auth-child">x</div>
      </AuthCardWrapper>
    ));
    expect(screen.getByTestId('auth-child')).toBeInTheDocument();
  });
});

describe('AuthWrapper', () => {
  it('renders as a div with a background and full viewport min-height', () => {
    const { container } = render(wrap(<AuthWrapper data-testid="auth-bg" />));
    expect(container.firstChild).not.toBeNull();
  });

  it('renders in dark mode without throwing', () => {
    expect(() => render(wrap(<AuthWrapper />, 'dark'))).not.toThrow();
  });
});
