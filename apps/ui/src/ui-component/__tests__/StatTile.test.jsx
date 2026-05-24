import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import StatTile from '../StatTile';

// The canonical stat tile used by Dashboard live-stats row, Analytics
// hero row, and per-sequence detail pages. Smoke-renders cover the
// label/value contract + the optional sub/delta/sparkValues branches.

const theme = createTheme();
const renderWithTheme = (ui) => render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);

describe('StatTile', () => {
  it('renders label + value', () => {
    renderWithTheme(<StatTile label="Total Visits" value={1234} />);
    expect(screen.getByText('Total Visits')).toBeInTheDocument();
    expect(screen.getByText('1234')).toBeInTheDocument();
  });

  it('renders the sub caption when no delta is provided', () => {
    renderWithTheme(<StatTile label="Songs" value={42} sub="across 7 nights" />);
    expect(screen.getByText('across 7 nights')).toBeInTheDocument();
  });

  it('delta takes precedence over sub', () => {
    renderWithTheme(
      <StatTile
        label="Spend"
        value="$120"
        sub="this hides"
        delta={{ text: '+12%', color: 'green' }}
      />
    );
    expect(screen.getByText('+12%')).toBeInTheDocument();
    expect(screen.queryByText('this hides')).not.toBeInTheDocument();
  });

  it('renders a sparkline when sparkValues has 2+ entries', () => {
    const { container } = renderWithTheme(
      <StatTile label="Trend" value={10} sparkValues={[1, 3, 2, 5]} />
    );
    const svg = container.querySelector('svg');
    expect(svg).not.toBeNull();
    const polyline = container.querySelector('polyline');
    expect(polyline).not.toBeNull();
    expect(polyline.getAttribute('points')).toBeTruthy();
  });

  it('omits the sparkline for values arrays of length 0 or 1 (degenerate)', () => {
    const { container: c1 } = renderWithTheme(<StatTile label="X" value={0} sparkValues={[]} />);
    expect(c1.querySelector('svg')).toBeNull();

    const { container: c2 } = renderWithTheme(<StatTile label="X" value={0} sparkValues={[1]} />);
    expect(c2.querySelector('svg')).toBeNull();
  });

  it('renders the decorative icon node when provided', () => {
    renderWithTheme(
      <StatTile label="Health" value="OK" icon={<span data-testid="health-icon">ico</span>} />
    );
    expect(screen.getByTestId('health-icon')).toBeInTheDocument();
  });

  it('does not render value as an <h2> heading (a11y: stat numbers are not outline nodes)', () => {
    renderWithTheme(<StatTile label="Plays" value={99} />);
    // value uses component="div" + variant="h2" — should not appear as a heading.
    expect(screen.queryByRole('heading', { level: 2, name: '99' })).not.toBeInTheDocument();
  });
});
