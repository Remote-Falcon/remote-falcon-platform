import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import QrVisitsTile from '../QrVisitsTile';

const renderTile = (props) =>
  render(
    <MemoryRouter>
      <QrVisitsTile {...props} />
    </MemoryRouter>
  );

describe('QrVisitsTile (#189)', () => {
  it('zero state points to the QR Code page toggle and says counting starts from this release', () => {
    renderTile({ visits: { unique: 0, total: 0 } });

    expect(screen.getByText('Visits from your QR code')).toBeTruthy();
    const hint = screen.getByTestId('qr-visits-empty');
    expect(hint.textContent).toContain('Tag with print campaign');
    expect(hint.textContent).toContain('Counting starts from this release');
    expect(screen.getByRole('link', { name: 'QR Code page' }).getAttribute('href')).toBe('/control-panel/qr-code');
  });

  it('treats a response without qrVisits (older backend) as the zero state', () => {
    renderTile({ visits: undefined });
    expect(screen.getByTestId('qr-visits-empty')).toBeTruthy();
  });

  it('zero state hides any compare badge so the setup hint stays visible', () => {
    renderTile({ visits: { unique: 0, total: 0 }, delta: { text: '-100% vs prior', color: 'error.main' } });
    expect(screen.queryByText('-100% vs prior')).toBeNull();
    expect(screen.getByTestId('qr-visits-empty')).toBeTruthy();
  });

  it('shows unique viewers and hits', () => {
    renderTile({ visits: { unique: 12, total: 30 } });

    expect(screen.queryByTestId('qr-visits-empty')).toBeNull();
    expect(screen.getByText('12')).toBeTruthy();
    expect(screen.getByText(/viewers · 30 hits/)).toBeTruthy();
  });

  it('uses singular labels for one viewer and one hit', () => {
    renderTile({ visits: { unique: 1, total: 1 } });
    expect(screen.getByText(/viewer · 1 hit$/)).toBeTruthy();
  });

  it('renders the compare-to-prior badge when given', () => {
    renderTile({ visits: { unique: 12, total: 30 }, delta: { text: '+50% vs prior', color: 'success.main' } });
    expect(screen.getByText('+50% vs prior')).toBeTruthy();
  });
});
