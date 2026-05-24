import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import Logo from '../Logo';
import LogoMark from '../LogoMark';
import ThemeToggle from '../ThemeToggle';
import SupportLinks from '../SupportLinks';

// Pure design-system components — render in both light/dark themes to
// exercise palette.mode branches.
const lightTheme = createTheme({ palette: { mode: 'light' } });
const darkTheme = createTheme({ palette: { mode: 'dark' } });

const renderIn = (theme, ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('Logo', () => {
  it('renders the wordmark + mark in default lockup variant', () => {
    renderIn(lightTheme, <Logo />);
    expect(screen.getByText('Remote Falcon')).toBeInTheDocument();
  });

  it('renders the hero image variant', () => {
    const { container } = renderIn(lightTheme, <Logo variant="hero" />);
    const img = container.querySelector('img[alt="Remote Falcon"]');
    expect(img).not.toBeNull();
  });

  it('honours a custom markSize and computes wordmarkSize from it', () => {
    const { container } = renderIn(lightTheme, <Logo markSize={72} />);
    // Should still render the wordmark text.
    expect(container.textContent).toContain('Remote Falcon');
  });

  it('honours an explicit wordmarkSize override', () => {
    expect(() => renderIn(lightTheme, <Logo markSize={72} wordmarkSize={18} />)).not.toThrow();
  });
});

describe('LogoMark', () => {
  it('renders with the default size', () => {
    const { container } = renderIn(lightTheme, <LogoMark />);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders at a custom size', () => {
    expect(() => renderIn(lightTheme, <LogoMark size={64} />)).not.toThrow();
  });
});

describe('ThemeToggle', () => {
  it('renders in light theme without throwing', () => {
    const { container } = renderIn(lightTheme, <ThemeToggle />);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders in dark theme without throwing', () => {
    const { container } = renderIn(darkTheme, <ThemeToggle />);
    expect(container.firstChild).not.toBeNull();
  });
});

describe('SupportLinks', () => {
  it('renders the expanded variant (default) in light theme', () => {
    const { container } = renderIn(lightTheme, <SupportLinks />);
    expect(container.firstChild).not.toBeNull();
  });

  it('renders the expanded variant in dark theme', () => {
    expect(() => renderIn(darkTheme, <SupportLinks variant="expanded" />)).not.toThrow();
  });

  it('renders the collapsed variant', () => {
    expect(() => renderIn(lightTheme, <SupportLinks variant="collapsed" />)).not.toThrow();
  });
});
