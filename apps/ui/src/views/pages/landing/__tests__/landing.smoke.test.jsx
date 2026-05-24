import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';

import Feature from '../Feature';
import Footer from '../Footer';
import Header from '../Header';
import KeyFeature from '../KeyFeature';

// Landing page is pure markup + the four visual previews. Smoke render
// the heavy feature/footer blocks (Header is image-loaded + framer-motion
// driven so skipped). KeyFeature is a deprecated stub that should
// continue to render harmlessly until legacy cleanup.

const wrap = (ui) => (
  <ThemeProvider theme={createTheme()}>
    <MemoryRouter>{ui}</MemoryRouter>
  </ThemeProvider>
);

describe('landing — smoke render', () => {
  it('Feature renders all four feature blocks without throwing', () => {
    expect(() => render(wrap(<Feature />))).not.toThrow();
  });

  it('Header (hero) renders without throwing', () => {
    expect(() => render(wrap(<Header />))).not.toThrow();
  });

  it('Footer renders the column links + version chip without throwing', () => {
    expect(() => render(wrap(<Footer />))).not.toThrow();
  });

  it('KeyFeature is a deprecated stub that returns null', () => {
    const { container } = render(wrap(<KeyFeature />));
    expect(container.firstChild).toBeNull();
  });
});
