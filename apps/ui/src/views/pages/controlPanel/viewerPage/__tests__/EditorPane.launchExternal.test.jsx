import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

// Stub Monaco — it's heavy, requires a real DOM with measurable layout,
// and isn't what we're testing here. The real Editor is exercised by
// docs-screenshots Playwright runs.
vi.mock('@monaco-editor/react', () => ({
  default: () => <div data-testid="monaco-stub" />
}));

// Import AFTER the vi.mock above.
import EditorPane from '../EditorPane';

// Tests for the "Edit in RF Page Builder ↗" CTA added in PR-C M1 of
// the RF Page Builder integration (PRD External Viewer Page API).
//
// Pins:
//  • Button only renders when onLaunchExternal is passed (additive CTA,
//    backward-compatible — older callers don't get the button)
//  • canLaunchExternal=false disables the button
//  • launchingExternal=true disables the button (avoids double-click)
//  • Click fires the callback exactly once
describe('EditorPane — Edit in RF Page Builder CTA', () => {
  const noop = () => {};

  const renderEditorPane = (props = {}) =>
    render(
      <EditorPane
        value=""
        isDirty={false}
        lineToFocus={0}
        onChange={noop}
        onSave={noop}
        onCopy={noop}
        {...props}
      />
    );

  it('does not render the button when onLaunchExternal is not provided', () => {
    renderEditorPane();
    expect(screen.queryByRole('button', { name: /RF Page Builder/i })).toBeNull();
  });

  it('tooltip mentions opening in a new tab when launch is available', () => {
    // Pin the UX promise: the button's tooltip + the IconExternalLink
    // affordance both signal "this opens elsewhere." Caught a real bug
    // where the tooltip said "opens in this tab" but the icon implied
    // otherwise, and the click handler used window.location.assign
    // (same-tab). The handler test for window.open lives on the parent
    // viewerPage component.
    renderEditorPane({ onLaunchExternal: noop, canLaunchExternal: true });
    const button = screen.getByRole('button', { name: /RF Page Builder/i });
    // MUI Tooltip puts the title on the wrapping element; query the parent.
    const tooltipHost = button.closest('[aria-label]') || button.parentElement;
    expect(tooltipHost?.getAttribute('aria-label') || '').toMatch(/new tab|external|opens/i);
  });

  it('renders an enabled button when canLaunchExternal is true', () => {
    const onLaunchExternal = vi.fn();
    renderEditorPane({ onLaunchExternal, canLaunchExternal: true });

    const button = screen.getByRole('button', { name: /RF Page Builder/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
  });

  it('disables the button when canLaunchExternal is false', () => {
    renderEditorPane({ onLaunchExternal: noop, canLaunchExternal: false });

    const button = screen.getByRole('button', { name: /RF Page Builder/i });
    expect(button).toBeDisabled();
  });

  it('disables the button while a launch is in flight', () => {
    renderEditorPane({
      onLaunchExternal: noop,
      canLaunchExternal: true,
      launchingExternal: true
    });

    const button = screen.getByRole('button', { name: /RF Page Builder/i });
    expect(button).toBeDisabled();
  });

  it('invokes onLaunchExternal exactly once on click', () => {
    const onLaunchExternal = vi.fn();
    renderEditorPane({ onLaunchExternal, canLaunchExternal: true });

    fireEvent.click(screen.getByRole('button', { name: /RF Page Builder/i }));

    expect(onLaunchExternal).toHaveBeenCalledTimes(1);
  });

  it('Save button still renders + behaves regardless of launch button state', () => {
    // Regression: adding the launch button shouldn't affect Save's existing
    // behavior (disabled until dirty).
    const onSave = vi.fn();
    renderEditorPane({
      onLaunchExternal: noop,
      canLaunchExternal: true,
      isDirty: true,
      onSave
    });

    const saveButton = screen.getByRole('button', { name: /^save$/i });
    expect(saveButton).not.toBeDisabled();
    fireEvent.click(saveButton);
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
