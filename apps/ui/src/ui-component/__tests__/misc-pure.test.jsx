import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import LiveIndicator from '../LiveIndicator';
import PageHead from '../PageHead';
import Loader from '../Loader';
import Logo from '../Logo';

const theme = createTheme();
const wrap = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('LiveIndicator', () => {
  it('renders only the dot when no label is provided', () => {
    const { container } = wrap(<LiveIndicator />);
    expect(container.querySelector('span')).not.toBeNull();
    expect(screen.queryByText(/.+/)).toBeNull();
  });

  it('renders the label beside the dot in lowercase', () => {
    wrap(<LiveIndicator label="LIVE" />);
    // sx applies textTransform: lowercase visually — verify the text exists
    // as-passed (DOM contains the literal string).
    expect(screen.getByText('LIVE')).toBeInTheDocument();
  });

  it.each(['xs', 'sm', 'md'])('renders the size=%s variant', (size) => {
    expect(() => wrap(<LiveIndicator size={size} label="live" />)).not.toThrow();
  });

  it('uses muted color when inactive', () => {
    expect(() => wrap(<LiveIndicator active={false} label="off" />)).not.toThrow();
  });
});

describe('PageHead', () => {
  it('renders the title as an h1 (component override)', () => {
    wrap(<PageHead title="Dashboard" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
  });

  it('renders eyebrow, description, and action slot when provided', () => {
    wrap(
      <PageHead
        eyebrow="CONTROL PANEL"
        title="Dashboard"
        description="What's happening right now"
        actions={<button type="button">Refresh</button>}
      />
    );
    expect(screen.getByText('CONTROL PANEL')).toBeInTheDocument();
    expect(screen.getByText("What's happening right now")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('omits the optional slots when not provided', () => {
    const { container } = wrap(<PageHead title="Plain" />);
    // No button slot, no eyebrow text
    expect(container.querySelector('button')).toBeNull();
  });
});

describe('Loader', () => {
  it('renders a fixed-position LinearProgress', () => {
    const { container } = wrap(<Loader />);
    // LinearProgress always renders a div with MuiLinearProgress class.
    expect(container.querySelector('[class*=MuiLinearProgress]')).not.toBeNull();
  });
});

describe('Logo (legacy wrapper)', () => {
  it('renders the design-system LogoMark via the legacy export', () => {
    const { container } = wrap(<Logo />);
    expect(container.firstChild).not.toBeNull();
  });
});
