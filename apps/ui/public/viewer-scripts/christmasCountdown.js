(function () {
  'use strict';

  if (window.__rfChristmasCountdown) return;
  window.__rfChristmasCountdown = true;

  // Re-query the DOM each tick rather than caching refs in start().
  // The platform viewer re-parses the page HTML through html-to-react every
  // 500ms (see externalViewer/index.jsx), which replaces/overwrites the text
  // nodes the script writes into. Cached refs go stale after the first tick.
  function update() {
    let now = new Date();
    let year = now.getFullYear();
    let evenDate = new Date(year, 11, 25);

    // Roll over to next year only after Christmas Day has fully passed,
    // so visitors on Dec 25 see 0d 00:00:00 instead of ~365 days.
    if (now > new Date(year, 11, 26)) {
      evenDate = new Date(year + 1, 11, 25);
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

    const elDays = document.querySelector('#to-christmas-days');
    const elHours = document.querySelector('#to-christmas-hours');
    const elMinutes = document.querySelector('#to-christmas-minutes');
    const elSeconds = document.querySelector('#to-christmas-seconds');

    if (elDays) elDays.textContent = d;
    if (elHours) elHours.textContent = h;
    if (elMinutes) elMinutes.textContent = m;
    if (elSeconds) elSeconds.textContent = s;
  }

  function loop() {
    if (!document.hidden) update();
    setTimeout(loop, 1000);
  }

  function start() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) update();
    });

    update();
    loop();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
