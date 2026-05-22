import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { List } from '@mui/material';

import NotificationRow from './NotificationRow';

// NotificationRow is the single source of truth for what a recipient
// sees, used by both the header bell dropdown and the admin "Send a
// notification" preview. These tests pin the row's visible contract
// (subject, preview, link visibility) and the click-propagation rules
// the bell relies on for "click-to-dismiss" without intercepting
// outbound link navigation.

const theme = createTheme();

const renderRow = (props = {}) =>
  render(
    <ThemeProvider theme={theme}>
      <List>
        <NotificationRow {...props} />
      </List>
    </ThemeProvider>
  );

// Stable date so the relative-time string never matters for assertions.
const FIXED_DATE = '2026-05-01T00:00:00Z';

describe('NotificationRow', () => {
  it('renders subject and preview text', () => {
    renderRow({
      notification: {
        uuid: 'x',
        subject: 'Hello world',
        preview: 'A short preview line',
        createdDate: FIXED_DATE
      }
    });
    expect(screen.getByText('Hello world')).toBeInTheDocument();
    expect(screen.getByText('A short preview line')).toBeInTheDocument();
  });

  it('shows the View button (anchor with href) when link is present', () => {
    renderRow({
      notification: {
        uuid: 'x',
        subject: 'Subj',
        preview: 'Prev',
        link: 'https://example.com/path',
        createdDate: FIXED_DATE
      }
    });

    const viewLink = screen.getByRole('link', { name: /view/i });
    expect(viewLink).toBeInTheDocument();
    expect(viewLink).toHaveAttribute('href', 'https://example.com/path');
  });

  it('hides the View button when link is missing', () => {
    renderRow({
      notification: {
        uuid: 'x',
        subject: 'Subj',
        preview: 'Prev',
        createdDate: FIXED_DATE
      }
    });
    expect(screen.queryByRole('link', { name: /view/i })).not.toBeInTheDocument();
  });

  it('row onClick fires on body click but NOT when the link is clicked', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();

    renderRow({
      notification: {
        uuid: 'x',
        subject: 'Click me',
        preview: 'Some preview',
        link: 'https://example.com',
        createdDate: FIXED_DATE
      },
      onClick
      // disableLinkNavigation NOT set: the anchor renders with a real
      // href, which is what gives it the 'link' role. jsdom will log a
      // navigation warning when clicked, but won't actually navigate.
    });

    // Click the row body via the subject text — propagates up to ListItem onClick.
    await user.click(screen.getByText('Click me'));
    expect(onClick).toHaveBeenCalledTimes(1);

    // Click the View link — the handler stopPropagation's, so onClick
    // must NOT fire a second time. This is the core invariant the bell
    // relies on: clicking the link opens it, clicking the row dismisses.
    onClick.mockClear();
    await user.click(screen.getByRole('link', { name: /view/i }));
    expect(onClick).not.toHaveBeenCalled();
  });
});
