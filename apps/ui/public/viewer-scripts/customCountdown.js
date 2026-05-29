(function () {
  'use strict';

  if (window.__rfCustomCountdown) return;
  window.__rfCustomCountdown = true;

  let warned = false;
  let containerWarned = false;

  // Re-query the DOM each tick rather than caching refs in start().
  // The platform viewer re-parses the page HTML through html-to-react every
  // 500ms (see externalViewer/index.jsx), which replaces/overwrites the text
  // nodes the script writes into. Cached refs go stale after the first tick.
  function update() {
    const container = document.querySelector('#custom-countdown');
    if (container == null) {
      if (!containerWarned) {
        console.warn('[remote-falcon] custom-countdown: missing #custom-countdown container');
        containerWarned = true;
      }
      return;
    }
    containerWarned = false;

    const targetValue = container.getAttribute('data-target');
    if (targetValue == null) {
      if (!warned) {
        console.warn('[remote-falcon] custom-countdown: missing data-target attribute');
        warned = true;
      }
      return;
    }

    let now = new Date();
    let evenDate;

    // Check if it's a time-only format (HH:MM or HH:MM:SS)
    if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(targetValue)) {
      // Daily recurring time
      let timeParts = targetValue.split(':');
      let hours = parseInt(timeParts[0], 10);
      let minutes = parseInt(timeParts[1], 10);
      let seconds = timeParts[2] ? parseInt(timeParts[2], 10) : 0;

      evenDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, seconds);

      // If the time has passed today, set it for tomorrow
      if (now >= evenDate) {
        evenDate.setDate(evenDate.getDate() + 1);
      }
    } else {
      // Specific date/time format
      evenDate = new Date(targetValue);

      if (isNaN(evenDate.getTime())) {
        if (!warned) {
          console.warn('[remote-falcon] custom-countdown: invalid data-target', targetValue);
          warned = true;
        }
        return;
      }
    }

    warned = false;

    let remTime = evenDate.getTime() - now.getTime();
    if (remTime < 0) remTime = 0;

    let s = Math.floor(remTime / 1000);
    let m = Math.floor(s / 60);
    let h = Math.floor(m / 60);
    let d = Math.floor(h / 24);

    h %= 24;
    m %= 60;
    s %= 60;

    h = h < 10 ? '0' + h : h;
    m = m < 10 ? '0' + m : m;
    s = s < 10 ? '0' + s : s;

    const elDays = document.querySelector('#custom-countdown-days');
    const elHours = document.querySelector('#custom-countdown-hours');
    const elMinutes = document.querySelector('#custom-countdown-minutes');
    const elSeconds = document.querySelector('#custom-countdown-seconds');

    // Only write when the value actually changed. update() runs every animation
    // frame (see loop()), but the digits change at most once a second, so the
    // guard keeps this to a handful of DOM writes per second instead of ~60.
    if (elDays && elDays.textContent !== String(d)) elDays.textContent = d;
    if (elHours && elHours.textContent !== String(h)) elHours.textContent = h;
    if (elMinutes && elMinutes.textContent !== String(m)) elMinutes.textContent = m;
    if (elSeconds && elSeconds.textContent !== String(s)) elSeconds.textContent = s;
  }

  // Repaint on every animation frame rather than once a second. The platform
  // viewer re-parses the page through html-to-react every 500ms (see
  // externalViewer/index.jsx), recreating these nodes with the template's
  // static "0". A 1s timer loses that race ~half the time (visible flicker on
  // desktop, near-constant "0" on mobile where timers are throttled harder).
  // requestAnimationFrame runs after the re-render's DOM mutation and before
  // the browser paints, so the real value is restored before "0" ever shows.
  // rAF is paused while the tab is hidden, which is fine — the countdown isn't
  // visible then, and the visibilitychange handler repaints on return.
  function loop() {
    update();
    window.requestAnimationFrame(loop);
  }

  function start() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) update();
    });

    update();
    window.requestAnimationFrame(loop);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
