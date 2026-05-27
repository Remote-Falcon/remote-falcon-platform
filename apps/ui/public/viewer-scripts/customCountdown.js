(function () {
  'use strict';

  if (window.__rfCustomCountdown) return;
  window.__rfCustomCountdown = true;

  let container, elDays, elHours, elMinutes, elSeconds;
  let warned = false;

  function update() {
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
    container = document.querySelector('#custom-countdown');
    if (container == null) {
      console.warn('[remote-falcon] custom-countdown: missing #custom-countdown container');
      return;
    }

    elDays = document.querySelector('#custom-countdown-days');
    elHours = document.querySelector('#custom-countdown-hours');
    elMinutes = document.querySelector('#custom-countdown-minutes');
    elSeconds = document.querySelector('#custom-countdown-seconds');

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
