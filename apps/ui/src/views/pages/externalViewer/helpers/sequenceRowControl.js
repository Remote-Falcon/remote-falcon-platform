// #179 - a song row is the viewer page's main control (request or vote), but it
// was a bare <div onClick>: no role, not focusable, no keys. Keyboard, switch
// and screen-reader users could not use the page at all.
//
// The row stays the same <div> with the same classes and data-key attributes,
// because owner templates style and script against them. It gains button
// semantics: role="button", a tab stop, and Enter/Space activation.
//
// An unavailable row (cooldown or nightly cap) stays focusable so a keyboard or
// screen-reader user can still reach it and hear why it is out: it carries
// aria-disabled and aria-describedby from unavailableRowProps. Its handlers are
// no-ops. The server rejects the request regardless, this is only advisory.
//
// A view-only page has nothing to operate, so its rows get no role and no tab
// stop, matching what they do (nothing).

const ACTIVATION_KEYS = new Set(['Enter', ' ', 'Spacebar']);

const noop = () => {};

/**
 * Interaction props for a song row. `onActivate` receives the click or keydown
 * event; on keydown the target is the row itself, which carries data-key.
 */
export const sequenceRowControlProps = ({ onActivate, viewOnly, unavailable }) => {
  if (viewOnly) {
    return {};
  }
  const activate = unavailable ? noop : onActivate;
  return {
    role: 'button',
    tabIndex: 0,
    onClick: activate,
    onKeyDown: (e) => {
      if (!ACTIVATION_KEYS.has(e.key) || e.target !== e.currentTarget) {
        return;
      }
      // Space would otherwise scroll the page.
      e.preventDefault();
      // Holding the key down must not fire a stream of requests.
      if (e.repeat) {
        return;
      }
      activate(e);
    }
  };
};

// Visible focus for keyboard users. A normal-specificity selector, not
// :where(), so a template reset such as `* { outline: none }` can't hide it,
// while a template's own `.jukebox-list:focus-visible` rule (later in the page)
// still wins. The outline is inset because stock templates put the rows inside
// overflow:hidden containers that would clip an outer one at the edges.
export const SEQUENCE_ROW_FOCUS_DEFAULT_CSS =
  '.cell-vote-playlist:focus-visible, .jukebox-list:focus-visible { outline: 3px solid currentColor; outline-offset: -3px; }';
