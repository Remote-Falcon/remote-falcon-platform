(function () {
  'use strict';

  if (window.__rfThanksgivingCountdown) return;
  window.__rfThanksgivingCountdown = true;

  // Calculate the 4th Thursday of November for a given year
  function getThanksgiving(year) {
    let november = new Date(year, 10, 1);
    let dayOfWeek = november.getDay();
    let firstThursday = 1 + ((4 - dayOfWeek + 7) % 7);
    let fourthThursday = firstThursday + 21;
    return new Date(year, 10, fourthThursday);
  }

  // Re-query the DOM each tick rather than caching refs in start().
  // The platform viewer re-parses the page HTML through html-to-react every
  // 500ms (see externalViewer/index.jsx), which replaces/overwrites the text
  // nodes the script writes into. Cached refs go stale after the first tick.
  function update() {
    let now = new Date();
    let year = now.getFullYear();
    let evenDate = getThanksgiving(year);

    // Roll over only after Thanksgiving Day has fully passed.
    let dayAfter = new Date(evenDate.getTime());
    dayAfter.setDate(dayAfter.getDate() + 1);
    if (now > dayAfter) {
      evenDate = getThanksgiving(year + 1);
    }

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

    const elDays = document.querySelector('#to-thanksgiving-days');
    const elHours = document.querySelector('#to-thanksgiving-hours');
    const elMinutes = document.querySelector('#to-thanksgiving-minutes');
    const elSeconds = document.querySelector('#to-thanksgiving-seconds');

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
