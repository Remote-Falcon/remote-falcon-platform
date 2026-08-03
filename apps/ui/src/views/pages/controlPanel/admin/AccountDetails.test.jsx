import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing';
import { Provider } from 'react-redux';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import AccountDetails from './AccountDetails';
import { store } from '../../../../store';
import { GET_SHOW_BY_EMAIL, GET_SHOW_BY_SHOW_NAME } from '../../../../utils/graphql/controlPanel/queries';

// Covers the admin email-lookup path added alongside the existing
// show-name search: the mode toggle, the client-side trim, and the
// not-found branch. The show-name path and the impersonate/reset-2FA
// flows are deliberately out of scope -- they were untested before this
// change and mocking impersonation's multi-query chain is brittle at
// this granularity.
//
// JWTContext has to be stubbed: it imports `setGraphqlHeaders` from
// `src/index.jsx`, and that module calls `createRoot(...)` at import
// time, so pulling it into a test bootstraps the entire application and
// dies on the missing #root element. AccountDetails only needs
// setImpersonationSession from it. That entrypoint-exports-a-utility
// coupling is pre-existing and is most likely why this component had no
// test before now.
vi.mock('../../../../contexts/JWTContext', () => ({
  setImpersonationSession: vi.fn()
}));

const theme = createTheme();

// Build a fully null-populated result straight from the query's own
// selection set. Every field the query selects is present, so Apollo never
// warns about missing fields, and the object stays correct automatically if
// the selection set gains a field later.
//
// __typename is required: this Apollo version has removed MockedProvider's
// `addTypename={false}` escape hatch, so the outgoing query always carries
// __typename and a mock result without it fails to satisfy the cache.
const showFromQuery = (overrides = {}) => {
  const op = GET_SHOW_BY_EMAIL.definitions.find((d) => d.kind === 'OperationDefinition');
  const root = op.selectionSet.selections.find((s) => s.name.value === 'getShowByEmail');
  const base = Object.fromEntries(
    root.selectionSet.selections.map((selection) => [selection.name.value, null])
  );
  return { __typename: 'Show', ...base, ...overrides };
};

const renderPage = (mocks) =>
  render(
    <Provider store={store}>
      <MockedProvider mocks={mocks}>
        <MemoryRouter>
          <ThemeProvider theme={theme}>
            <AccountDetails />
          </ThemeProvider>
        </MemoryRouter>
      </MockedProvider>
    </Provider>
  );

const emailMock = (email, show) => ({
  request: { query: GET_SHOW_BY_EMAIL, variables: { email } },
  result: { data: { getShowByEmail: show } }
});

const switchToEmailMode = async (user) => {
  await user.click(screen.getByRole('button', { name: /search by email/i }));
};

const getShowButton = () => screen.getByRole('button', { name: /^get show$/i });

describe('AccountDetails search mode', () => {
  beforeEach(() => {
    store.dispatch({ type: 'snackbar/closeSnackbar' });
  });


  /**
   * Regression guard for a shipped production bug. Sharing these selection
   * sets via a GraphQL fragment looks like an obvious DRY win, but
   * @habx/apollo-multi-endpoint-link's MultiAPILink never settles its
   * observable for a document containing a FragmentDefinition: the request
   * goes out, the server answers 200, and useLazyQuery's execute promise
   * neither resolves nor rejects. The admin page hangs silently -- no data,
   * no error, no toast. Caught only in a real browser, never by a mocked
   * test, so this asserts on document shape instead.
   */
  it('uses no GraphQL fragments (MultiAPILink hangs on FragmentDefinition)', () => {
    [GET_SHOW_BY_EMAIL, GET_SHOW_BY_SHOW_NAME].forEach((doc) => {
      const kinds = doc.definitions.map((d) => d.kind);
      expect(kinds).not.toContain('FragmentDefinition');
      expect(kinds).toContain('OperationDefinition');
    });
  });

  it('defaults to show-name search and swaps the input when Email is selected', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage([]);

    // Anchored matchers: the toggle button's aria-label ('Search by show
    // name') would otherwise also match a loose /show name/ pattern.
    expect(screen.getByLabelText(/^show name$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^email$/i)).not.toBeInTheDocument();

    await switchToEmailMode(user);

    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^show name$/i)).not.toBeInTheDocument();
  });

  it('looks up an account by email and reveals the account actions', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage([
      emailMock('operator@example.com', showFromQuery({ showName: 'Operator Lights' }))
    ]);

    await switchToEmailMode(user);
    await user.type(screen.getByLabelText(/^email$/i), 'operator@example.com');
    await user.click(getShowButton());

    // Impersonate only renders once a show is selected, so its presence is
    // the signal that the lookup resolved and populated the panel.
    expect(await screen.findByRole('button', { name: /impersonate/i })).toBeInTheDocument();
  });

  /**
   * Admins paste emails out of support tickets, which routinely carry
   * surrounding whitespace. The mock matches ONLY the trimmed value, so a
   * resolved lookup proves a padded email still reaches the server clean.
   *
   * Scope honesty: this does NOT isolate the component's `.trim()`. Two
   * mechanisms strip the whitespace -- the HTML value-sanitization
   * algorithm for `<input type="email">` runs first, so the padding is
   * already gone before component state sees it, and `.trim()` is
   * defense-in-depth for non-typed value paths. Verified by mutation:
   * removing `.trim()` alone keeps this green, removing `.trim()` AND
   * switching to `type="text"` fails it. So it guards the combined
   * contract, not either half. The server-side trim has its own
   * non-vacuous unit test in GraphQLQueryServiceTest.
   */
  it('sends a clean address when the typed email carries whitespace', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage([
      emailMock('padded@example.com', showFromQuery({ showName: 'Padded Show' }))
    ]);

    await switchToEmailMode(user);
    await user.type(screen.getByLabelText(/^email$/i), '  padded@example.com  ');
    await user.click(getShowButton());

    expect(await screen.findByRole('button', { name: /impersonate/i })).toBeInTheDocument();
  });

  /**
   * Unlike the show-name path there's no autosuggest to confirm the value
   * exists, so a miss must say so rather than leaving the panel blank.
   */
  it('warns instead of failing silently when no account matches', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage([emailMock('nobody@example.com', null)]);

    await switchToEmailMode(user);
    await user.type(screen.getByLabelText(/^email$/i), 'nobody@example.com');
    await user.click(getShowButton());

    await waitFor(() => {
      const { snackbar } = store.getState();
      expect(snackbar.open).toBe(true);
      expect(snackbar.message).toMatch(/no account found with the email nobody@example\.com/i);
      expect(snackbar.alert.color).toBe('warning');
    });

    // A miss must not leave a stale account on screen.
    expect(screen.queryByRole('button', { name: /impersonate/i })).not.toBeInTheDocument();
  });

  it('does not query when the email box is empty', async () => {
    const user = userEvent.setup({ delay: null });
    // No mocks registered: any outgoing query would throw an Apollo
    // "No more mocked responses" error and fail the assertion below.
    renderPage([]);

    await switchToEmailMode(user);
    await user.click(getShowButton());

    await waitFor(() => {
      expect(store.getState().snackbar.open).toBe(false);
    });
    expect(screen.queryByRole('button', { name: /impersonate/i })).not.toBeInTheDocument();
  });

  /**
   * Impersonate and Reset 2FA act on whatever is loaded. Leaving a
   * previously-found account on screen after a mode switch points both at
   * a stale target while the search box reads empty.
   */
  it('clears the loaded account when the search mode changes', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage([
      emailMock('operator@example.com', showFromQuery({ showName: 'Operator Lights' }))
    ]);

    await switchToEmailMode(user);
    await user.type(screen.getByLabelText(/^email$/i), 'operator@example.com');
    await user.click(getShowButton());
    expect(await screen.findByRole('button', { name: /impersonate/i })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /search by show name/i }));

    expect(screen.queryByRole('button', { name: /impersonate/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /reset 2fa/i })).not.toBeInTheDocument();
  });

  /**
   * MUI's ToggleButtonGroup hands back null when the active button is
   * re-clicked. Without the null-guard the component would drop into a
   * mode that renders neither input.
   */
  it('keeps the current mode when the active toggle is re-clicked', async () => {
    const user = userEvent.setup({ delay: null });
    renderPage([]);

    await switchToEmailMode(user);
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();

    await switchToEmailMode(user);
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
  });
});
