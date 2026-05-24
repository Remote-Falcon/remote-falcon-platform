import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import PhoneFrame from '../PhoneFrame';
import CommunityPreview from '../CommunityPreview';
import JukeboxPreview from '../JukeboxPreview';
import ShowsMapPreview from '../ShowsMapPreview';
import ViewerPagePreview from '../ViewerPagePreview';

// These are pure decorative visuals on the landing page — no data deps,
// no fetch, no router. Smoke render in both light + dark themes catches:
//   • a refactor that renames an SCSS module or icon import
//   • a theme switch that breaks `theme.palette.mode === 'dark'` branches
// Pair this with the marketing review when we touch the landing page.

const renderInBoth = (ui) => {
  const lightWrap = render(
    <ThemeProvider theme={createTheme({ palette: { mode: 'light' } })}>{ui}</ThemeProvider>
  );
  const darkWrap = render(
    <ThemeProvider theme={createTheme({ palette: { mode: 'dark' } })}>{ui}</ThemeProvider>
  );
  return { lightWrap, darkWrap };
};

describe('landing/visuals — smoke render', () => {
  it('PhoneFrame renders with empty children', () => {
    const { container } = render(
      <ThemeProvider theme={createTheme()}>
        <PhoneFrame>{null}</PhoneFrame>
      </ThemeProvider>
    );
    expect(container.querySelector('div')).not.toBeNull();
  });

  it('PhoneFrame renders children inside the screen inset', () => {
    const { getByTestId } = render(
      <ThemeProvider theme={createTheme()}>
        <PhoneFrame>
          <div data-testid="phone-content">hi</div>
        </PhoneFrame>
      </ThemeProvider>
    );
    expect(getByTestId('phone-content')).toBeInTheDocument();
  });

  it('CommunityPreview renders in light and dark themes without throwing', () => {
    expect(() => renderInBoth(<CommunityPreview />)).not.toThrow();
  });

  it('JukeboxPreview renders in light and dark themes without throwing', () => {
    expect(() => renderInBoth(<JukeboxPreview />)).not.toThrow();
  });

  it('ShowsMapPreview renders in light and dark themes without throwing', () => {
    expect(() => renderInBoth(<ShowsMapPreview />)).not.toThrow();
  });

  it('ViewerPagePreview renders in light and dark themes without throwing', () => {
    expect(() => renderInBoth(<ViewerPagePreview />)).not.toThrow();
  });
});
