import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import React from 'react';

// #191: applying a template adds a viewer page, so the gallery must honor
// the same five-page cap as the editor. Services and store are mocked at
// the module boundary, following TwoFactorAuth.test.jsx.

const { mocks } = vi.hoisted(() => ({
  mocks: {
    dispatch: vi.fn(),
    state: {},
    savePagesService: vi.fn(),
    getTemplates: vi.fn()
  }
}));

vi.mock('@apollo/client', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useMutation: () => [vi.fn()] };
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, useNavigate: () => vi.fn() };
});

vi.mock('../../../../../store', () => ({
  useDispatch: () => mocks.dispatch,
  useSelector: (fn) => fn(mocks.state)
}));

vi.mock('../../../../../services/controlPanel/mutations.service', () => ({
  savePagesService: mocks.savePagesService
}));

vi.mock('../../../../../services/controlPanel/viewerPage.service', () => ({
  getRemoteViewerPageTemplatesFromGithubService: mocks.getTemplates
}));

vi.mock('../../../../../utils/analytics/posthog', () => ({
  trackPosthogEvent: vi.fn()
}));

import FreeTemplates from '../FreeTemplates';

const theme = createTheme();

const makePages = (n) => Array.from({ length: n }, (_, i) => ({ name: `Page ${i + 1}`, html: '<p/>', active: i === 0 }));

const renderWithPages = async (n) => {
  mocks.state = {
    show: { show: { pages: makePages(n) } },
    controlPanel: { remoteViewerPageTemplates: [] }
  };
  render(
    <ThemeProvider theme={theme}>
      <FreeTemplates />
    </ThemeProvider>
  );
  // Wait for the mocked template fetch to select the first template.
  return screen.findByRole('button', { name: /Add new page from template/i });
};

describe('FreeTemplates: page limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getTemplates.mockResolvedValue([{ key: 'bare', title: 'Bare', content: '<html>bare</html>' }]);
  });

  it('enables "Add new page from template" below the cap and opens the dialog', async () => {
    const button = await renderWithPages(4);
    await vi.waitFor(() => expect(button.disabled).toBe(false));
    fireEvent.click(button);
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('disables "Add new page from template" at the cap with an explanation', async () => {
    const button = await renderWithPages(5);
    // Let the template fetch settle so the only reason left is the cap.
    await vi.waitFor(() => expect(mocks.getTemplates).toHaveBeenCalled());
    await screen.findByDisplayValue('Bare');
    expect(button.disabled).toBe(true);
    // MUI Tooltip labels its (span) child with the title.
    expect(button.parentElement.getAttribute('aria-label')).toBe(
      'You have 5 pages. Delete one to add a page from a template.'
    );
    expect(mocks.savePagesService).not.toHaveBeenCalled();
  });
});
