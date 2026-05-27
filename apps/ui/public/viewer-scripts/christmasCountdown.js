(function () {
  'use strict';

  if (window.__rfChristmasCountdown) return;
  window.__rfChristmasCountdown = true;

  let elDays, elHours, elMinutes, elSeconds;

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
    elDays = document.querySelector('#to-christmas-days');
    elHours = document.querySelector('#to-christmas-hours');
    elMinutes = document.querySelector('#to-christmas-minutes');
    elSeconds = document.querySelector('#to-christmas-seconds');

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
