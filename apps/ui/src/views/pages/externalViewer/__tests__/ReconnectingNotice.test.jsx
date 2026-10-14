import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import ReconnectingNotice from '../ReconnectingNotice';

describe('ReconnectingNotice', () => {
  it('renders nothing while connected', () => {
    const { container } = render(<ReconnectingNotice visible={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces reconnecting politely without blocking taps', () => {
    render(<ReconnectingNotice visible />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('Reconnecting');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status.style.pointerEvents).toBe('none');
  });
});
