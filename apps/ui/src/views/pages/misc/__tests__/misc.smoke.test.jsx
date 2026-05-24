import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';

import MiscPageShell from '../MiscPageShell';
import PrivacyPolicy from '../PrivacyPolicy';
import TermsAndConditions from '../TermsAndConditions';

// Static prose pages reachable from the marketing footer. Smoke render
// verifies the AppBar + container chrome wraps content and that the
// canonical h1 titles are present (used by SEO + scroll position).

const wrap = (ui) => (
  <ThemeProvider theme={createTheme()}>
    <MemoryRouter>{ui}</MemoryRouter>
  </ThemeProvider>
);

describe('misc pages', () => {
  it('MiscPageShell renders the title as an h1 with the chrome wrapped around it', () => {
    render(wrap(
      <MiscPageShell title="Hello">
        <p>body</p>
      </MiscPageShell>
    ));
    expect(screen.getByRole('heading', { level: 1, name: 'Hello' })).toBeInTheDocument();
    expect(screen.getByText('body')).toBeInTheDocument();
  });

  it('PrivacyPolicy renders with the documented title', () => {
    render(wrap(<PrivacyPolicy />));
    expect(screen.getByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument();
  });

  it('TermsAndConditions renders with the documented title', () => {
    render(wrap(<TermsAndConditions />));
    expect(screen.getByRole('heading', { level: 1, name: 'Terms of Service' })).toBeInTheDocument();
  });
});
