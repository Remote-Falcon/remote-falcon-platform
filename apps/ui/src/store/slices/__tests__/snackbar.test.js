import { describe, it, expect } from 'vitest';

import reducer, { openSnackbar, closeSnackbar } from '../snackbar';

// Single global snackbar — every showAlert() dispatch lands here. Because
// showAlert only sends a partial payload (e.g. {open, message}), the
// reducer is responsible for filling in defaults so the renderer always
// sees a complete shape. These tests pin that contract.

describe('snackbar slice reducer', () => {
  const initial = reducer(undefined, { type: '@@INIT' });

  it('initial state matches showAlert defaults', () => {
    expect(initial.open).toBe(false);
    expect(initial.message).toBe('');
    expect(initial.variant).toBe('alert');
    expect(initial.alert).toEqual({ color: 'success', variant: 'filled' });
    expect(initial.transition).toBe('Fade');
    expect(initial.close).toBe(true);
    expect(initial.anchorOrigin).toEqual({ vertical: 'top', horizontal: 'center' });
  });

  it('openSnackbar fills missing fields from defaults', () => {
    const next = reducer(
      initial,
      openSnackbar({ open: true, message: 'hello world' })
    );
    expect(next.open).toBe(true);
    expect(next.message).toBe('hello world');
    expect(next.alert).toEqual({ color: 'success', variant: 'filled' });
    expect(next.anchorOrigin).toEqual({ vertical: 'top', horizontal: 'center' });
  });

  it('openSnackbar respects explicit alert.color overrides (e.g. error toasts)', () => {
    const next = reducer(
      initial,
      openSnackbar({
        open: true,
        message: 'oops',
        alert: { color: 'error' }
      })
    );
    expect(next.alert.color).toBe('error');
    // variant default still applies because only color was overridden
    expect(next.alert.variant).toBe('filled');
  });

  it('openSnackbar toggles the action flag so the Snackbar re-mounts on repeat toasts', () => {
    const first = reducer(initial, openSnackbar({ open: true, message: 'a' }));
    const second = reducer(first, openSnackbar({ open: true, message: 'b' }));
    // action is a parity bit — must flip on every open so identical
    // back-to-back toasts still trigger a re-render.
    expect(first.action).not.toBe(initial.action);
    expect(second.action).not.toBe(first.action);
  });

  it('closeSnackbar only flips open without touching message/alert', () => {
    const opened = reducer(initial, openSnackbar({ open: true, message: 'keep me' }));
    const closed = reducer(opened, closeSnackbar());
    expect(closed.open).toBe(false);
    expect(closed.message).toBe('keep me');
    expect(closed.alert).toEqual(opened.alert);
  });

  it('openSnackbar uses provided id or falls back to default', () => {
    const withId = reducer(initial, openSnackbar({ open: true, id: 'custom-id' }));
    expect(withId.id).toBe('custom-id');
    const withoutId = reducer(initial, openSnackbar({ open: true }));
    expect(withoutId.id).toBe('snackbar');
  });
});
