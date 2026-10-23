(function () {
  "use strict";

  if (window.__rfNowPlayingProgress) return;
  window.__rfNowPlayingProgress = true;

  // Turns the existing {NOW_PLAYING_TIMER} countdown into a progress bar.
  // Opt-in from the viewer page HTML; nothing happens unless a bar is present:
  //
  //   <span id="now-playing-timer">{NOW_PLAYING_TIMER}</span>
  //   <div class="now-playing-progress"></div>
  //
  // Optional attributes on the bar:
  //   data-timer="#selector"      element holding {NOW_PLAYING_TIMER} (default #now-playing-timer)
  //   data-title="#selector"      element holding {NOW_PLAYING}; a title change marks a new song
  //   data-direction="remaining"  drain instead of fill
  //
  // The timer only exposes time remaining, so the song length is learned as the
  // largest remaining value seen for the current song. A viewer who opens the
  // page mid-song gets a bar that starts empty for that one song; the bar
  // carries the `now-playing-progress--estimated` class until the first song
  // change, so designs can style or hide it.

  const BAR_SELECTOR = ".now-playing-progress";
  const FILL_CLASS = "now-playing-progress__fill";
  const ESTIMATED_CLASS = "now-playing-progress--estimated";
  const DEFAULT_TIMER = "#now-playing-timer";
  // The viewer shows 0:00 both at the end of a song and when nothing is
  // playing. Keep the bar full briefly at the end, then empty it.
  const IDLE_RESET_MS = 5000;

  // One state per timer source, not per bar element: the page is re-parsed
  // through html-to-react every 500ms (see externalViewer/index.jsx), so
  // element identity isn't stable.
  const states = new Map();
  let timerWarned = false;

  function parseTimer(text) {
    const match = /^\s*(\d+):(\d{1,2})\s*$/.exec(text || "");
    if (!match) return null;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  }

  function injectDefaultStyles() {
    if (document.getElementById("rf-now-playing-progress-styles")) return;
    const style = document.createElement("style");
    style.id = "rf-now-playing-progress-styles";
    // :where() keeps specificity at zero so any rule in the page's own CSS wins.
    style.textContent =
      ":where(.now-playing-progress){display:block;position:relative;width:100%;height:8px;" +
      "border-radius:4px;overflow:hidden;background:rgba(127,127,127,0.3);}" +
      ":where(.now-playing-progress__fill){display:block;height:100%;width:0;" +
      "background:var(--rf-progress-color,currentColor);border-radius:inherit;}";
    (document.head || document.documentElement).appendChild(style);
  }

  function getState(key) {
    let state = states.get(key);
    if (!state) {
      state = {
        title: null,
        remaining: null,
        total: null,
        changedAt: 0,
        idleSince: null,
        estimated: true,
        seenSong: false,
      };
      states.set(key, state);
    }
    return state;
  }

  // Advances the per-source state from the latest timer reading and returns
  // progress as a 0..1 fraction of the song elapsed.
  function advance(state, remaining, title, now) {
    if (remaining == null) {
      state.remaining = null;
      return 0;
    }

    const titleChanged =
      title != null && state.title != null && title !== state.title;
    if (title != null) state.title = title;

    if (remaining === 0) {
      if (state.idleSince == null) state.idleSince = now;
      state.remaining = 0;
      if (state.total == null || now - state.idleSince > IDLE_RESET_MS) {
        state.total = null;
        return 0;
      }
      return 1;
    }
    state.idleSince = null;

    // The timer seeds at the song length and ticks down by one each second,
    // so any jump upward (or a new title) is a new song.
    const newSong =
      state.remaining == null ||
      state.remaining === 0 ||
      titleChanged ||
      remaining > state.remaining + 1;
    if (newSong) {
      // The first song seen after load may have been joined mid-way.
      if (state.seenSong) state.estimated = false;
      state.seenSong = true;
      state.total = remaining;
      state.remaining = remaining;
      state.changedAt = now;
    } else if (remaining !== state.remaining) {
      state.remaining = remaining;
      state.changedAt = now;
    }
    if (remaining > state.total) state.total = remaining;

    // Interpolate within the current second so the bar moves smoothly rather
    // than in 1s steps. Never run more than a second ahead of the display.
    const sinceTick = Math.min(Math.max((now - state.changedAt) / 1000, 0), 1);
    const exact = Math.max(state.remaining - sinceTick, 0);
    return Math.min(Math.max((state.total - exact) / state.total, 0), 1);
  }

  function renderBar(bar, fraction, estimated) {
    let fill = bar.querySelector("." + FILL_CLASS);
    if (!fill) {
      fill = document.createElement("span");
      fill.className = FILL_CLASS;
      bar.appendChild(fill);
    }

    const shown =
      bar.getAttribute("data-direction") === "remaining"
        ? 1 - fraction
        : fraction;
    const width = (shown * 100).toFixed(2) + "%";
    if (fill.style.width !== width) fill.style.width = width;

    const value = String(Math.round(fraction * 100));
    if (bar.getAttribute("aria-valuenow") !== value) {
      bar.setAttribute("role", "progressbar");
      bar.setAttribute("aria-valuemin", "0");
      bar.setAttribute("aria-valuemax", "100");
      bar.setAttribute("aria-valuenow", value);
    }
    bar.style.setProperty("--rf-progress", shown.toFixed(4));
    bar.classList.toggle(ESTIMATED_CLASS, estimated);
  }

  function update() {
    const bars = document.querySelectorAll(BAR_SELECTOR);
    if (bars.length === 0) return;
    injectDefaultStyles();

    const now = Date.now();
    const results = new Map();

    for (const bar of bars) {
      const timerSelector = bar.getAttribute("data-timer") || DEFAULT_TIMER;
      const titleSelector = bar.getAttribute("data-title") || "";
      const key = timerSelector + "|" + titleSelector;

      // Several bars can share a source; advance its state once per frame.
      if (!results.has(key)) {
        const timerEl = document.querySelector(timerSelector);
        if (timerEl == null && !timerWarned) {
          console.warn(
            "[remote-falcon] now-playing-progress: no timer element matches",
            timerSelector
          );
          timerWarned = true;
        }
        const titleEl = titleSelector
          ? document.querySelector(titleSelector)
          : null;
        const remaining = timerEl ? parseTimer(timerEl.textContent) : null;
        const title = titleEl ? titleEl.textContent.trim() : null;
        const state = getState(key);
        results.set(key, {
          fraction: advance(state, remaining, title, now),
          estimated: state.estimated,
        });
      }

      const result = results.get(key);
      renderBar(bar, result.fraction, result.estimated);
    }
  }

  // Same rAF loop as customCountdown.js: the 500ms re-parse can recreate the
  // bar without its fill, and repainting every frame restores it before paint.
  function loop() {
    update();
    window.requestAnimationFrame(loop);
  }

  function start() {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) update();
    });

    update();
    window.requestAnimationFrame(loop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
