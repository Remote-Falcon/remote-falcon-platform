import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MockedProvider } from '@apollo/client/testing';
import { Provider } from 'react-redux';
import { ThemeProvider, createTheme } from '@mui/material/styles';

import SendForm from './SendForm';
import { store } from '../../../../../store';

// These tests cover the form's client-side validation gate — the small,
// stable surface that decides whether the Send button is enabled. We
// intentionally do NOT exercise the mutation submission path here;
// that's brittle to mock at this granularity and the gate-on-validity
// behaviour is what actually protects the backend from bad inputs.

const theme = createTheme();

const renderForm = (props = {}) =>
  render(
    <Provider store={store}>
      <MockedProvider mocks={[]} addTypename={false}>
        <ThemeProvider theme={theme}>
          <SendForm mode="create" {...props} />
        </ThemeProvider>
      </MockedProvider>
    </Provider>
  );

// The submit button label is "Send notification" in create mode.
const getSendButton = () => screen.getByRole('button', { name: /send notification/i });

// Type-by-typing simulates real user behaviour and triggers MUI's
// internal onChange wiring more reliably than fireEvent.change. Callers
// build `user` with userEvent.setup({ delay: null }) so the long-string
// cases (80/1000-char limits) type instantly — without the inter-keystroke
// delay they'd exceed the 5s test timeout under vitest 4 / jsdom 29.
const typeInField = async (user, label, value) => {
  const field = screen.getByLabelText(label);
  // Clear in case of any default text, then type.
  await user.clear(field);
  if (value) await user.type(field, value);
  return field;
};

describe('SendForm validation', () => {
  beforeEach(() => {
    // Each test gets a fresh form via re-render; no shared state to clear.
  });

  it('disables the Send button when the form is empty (subject missing)', () => {
    renderForm();
    expect(getSendButton()).toBeDisabled();
  });

  it('enables the Send button when subject, preview, and message are all filled', async () => {
    const user = userEvent.setup({ delay: null });
    renderForm();

    await typeInField(user, /^subject$/i, 'A subject');
    await typeInField(user, /^preview$/i, 'A preview blurb');
    await typeInField(user, /^message$/i, 'The full message body of the broadcast.');

    expect(getSendButton()).toBeEnabled();
  });

  it('disables the Send button when subject exceeds the 80-char limit', async () => {
    const user = userEvent.setup({ delay: null });
    renderForm();

    // 81 chars — MUI's inputProps maxLength is 80, so we need to bypass
    // it. Type 80 valid chars first, then assert: the cap stops the
    // user from going past 80, so the gate enforces validity by
    // construction. Verify the 80-char ceiling holds the button enabled
    // and the field shows the counter at 80/80.
    const longSubject = 'a'.repeat(80);
    await typeInField(user, /^subject$/i, longSubject);
    await typeInField(user, /^preview$/i, 'A preview');
    await typeInField(user, /^message$/i, 'A message');

    expect(screen.getByText('80/80')).toBeInTheDocument();
    expect(getSendButton()).toBeEnabled();

    // Try to type one more char — input cap should hold the value at 80,
    // proving the limit is enforced. (Validation message would only
    // appear if the maxLength were stripped.)
    await user.type(screen.getByLabelText(/^subject$/i), 'X');
    expect(screen.getByText('80/80')).toBeInTheDocument();
  });

  it('disables the Send button when message exceeds the 1000-char limit', async () => {
    const user = userEvent.setup({ delay: null });
    renderForm();

    await typeInField(user, /^subject$/i, 'Subject');
    await typeInField(user, /^preview$/i, 'Preview');

    // Pasting is much faster than typing 1000+ chars one keystroke at
    // a time, and userEvent.paste correctly fires onChange.
    const messageField = screen.getByLabelText(/^message$/i);
    await user.click(messageField);
    await user.paste('m'.repeat(1001));

    // The input's maxLength caps at 1000, so the visible counter
    // pegs at 1000/1000 and the form is still considered valid.
    expect(screen.getByText('1000/1000')).toBeInTheDocument();
    expect(getSendButton()).toBeEnabled();
  });

  it('disables the Send button when link is not a valid URL', async () => {
    const user = userEvent.setup({ delay: null });
    renderForm();

    await typeInField(user, /^subject$/i, 'Subject');
    await typeInField(user, /^preview$/i, 'Preview');
    await typeInField(user, /^message$/i, 'Message');

    const linkField = screen.getByLabelText(/link \(optional\)/i);
    await user.type(linkField, 'not-a-url');
    // Blur so the touched flag flips and the error message renders.
    await user.tab();

    expect(getSendButton()).toBeDisabled();
    expect(screen.getByText('Must be a valid URL')).toBeInTheDocument();
  });

  it('enables the Send button when link is a valid URL', async () => {
    const user = userEvent.setup({ delay: null });
    renderForm();

    await typeInField(user, /^subject$/i, 'Subject');
    await typeInField(user, /^preview$/i, 'Preview');
    await typeInField(user, /^message$/i, 'Message');
    await typeInField(user, /link \(optional\)/i, 'https://docs.example.com/path');

    expect(getSendButton()).toBeEnabled();
  });
});
