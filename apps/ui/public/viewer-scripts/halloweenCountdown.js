(function () {
  'use strict';

  if (window.__rfHalloweenCountdown) return;
  window.__rfHalloweenCountdown = true;

  let elDays, elHours, elMinutes, elSeconds;

  function update() {
    let now = new Date();
    let year = now.getFullYear();
    let evenDate = new Date(year, 9, 31); // October 31

    // Roll over to next year only after Halloween has fully passed,
    // so visitors on Oct 31 (especially trick-or-treat night) see 0d 00:00:00.
    if (now > new Date(year, 10, 1)) {
      evenDate = new Date(year + 1, 9, 31);
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
    elDays = document.querySelector('#to-halloween-days');
    elHours = document.querySelector('#to-halloween-hours');
    elMinutes = document.querySelector('#to-halloween-minutes');
    elSeconds = document.querySelector('#to-halloween-seconds');

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
