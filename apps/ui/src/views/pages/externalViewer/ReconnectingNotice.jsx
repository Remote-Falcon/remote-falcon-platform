import React from 'react';

// Fixed, self-colored pill rather than operator-styled markup: it floats over
// whatever the operator's page looks like (and over the full-screen loader on
// a failed first load), so it can't borrow the page palette the way
// LocationRecoveryControl does. pointer-events:none keeps it from ever blocking
// a tap on the page underneath.
const PILL_STYLE = {
  position: 'fixed',
  left: '50%',
  bottom: 16,
  transform: 'translateX(-50%)',
  zIndex: 2147483000,
  padding: '6px 14px',
  borderRadius: 999,
  background: 'rgba(0, 0, 0, 0.75)',
  color: '#fff',
  font: '14px/1.4 system-ui, -apple-system, sans-serif',
  pointerEvents: 'none',
  whiteSpace: 'nowrap'
};

/**
 * Non-blocking "we lost the show, still trying" signal for the viewer page.
 * Replaces the error alert that used to fire on every failed poll, which
 * trained viewers to reload (each reload is a full init plus a stats write).
 */
const ReconnectingNotice = ({ visible }) => {
  if (!visible) {
    return null;
  }
  return (
    <div role="status" aria-live="polite" className="rf-reconnecting-notice" style={PILL_STYLE}>
      Reconnecting…
    </div>
  );
};

export default ReconnectingNotice;
