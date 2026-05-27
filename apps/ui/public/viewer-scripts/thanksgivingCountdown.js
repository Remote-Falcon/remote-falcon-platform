(function () {
  'use strict';

  if (window.__rfThanksgivingCountdown) return;
  window.__rfThanksgivingCountdown = true;

  let elDays, elHours, elMinutes, elSeconds;

  // Calculate the 4th Thursday of November for a given year
  function getThanksgiving(year) {
    let november = new Date(year, 10, 1);
    let dayOfWeek = november.getDay();
    let firstThursday = 1 + ((4 - dayOfWeek + 7) % 7);
    let fourthThursday = firstThursday + 21;
    return new Date(year, 10, fourthThursday);
  }

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
    elDays = document.querySelector('#to-thanksgiving-days');
    elHours = document.querySelector('#to-thanksgiving-hours');
    elMinutes = document.querySelector('#to-thanksgiving-minutes');
    elSeconds = document.querySelector('#to-thanksgiving-seconds');

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
