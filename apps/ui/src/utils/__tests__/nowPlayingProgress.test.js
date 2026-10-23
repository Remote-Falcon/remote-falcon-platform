import fs from "node:fs";
import path from "node:path";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Exercises the vendored public/viewer-scripts/nowPlayingProgress.js, which
// draws a progress bar from the {NOW_PLAYING_TIMER} text without any change to
// the viewer itself. The script only sees time remaining, so these tests pin
// how it learns the song length and spots song changes.

const SCRIPT_PATH = path.resolve(
  __dirname,
  "../../../public/viewer-scripts/nowPlayingProgress.js"
);
const SCRIPT_SOURCE = fs.readFileSync(SCRIPT_PATH, "utf8");

let frames = [];
let now = 0;

/** Run the vendored IIFE against the current jsdom document. */
const runScript = () => {
  // eslint-disable-next-line no-new-func
  new Function(SCRIPT_SOURCE)();
};

/** Run one queued animation frame (the script re-queues itself each frame). */
const frame = () => {
  const queued = frames;
  frames = [];
  queued.forEach((cb) => cb());
};

/** Show `text` in the timer, advance the clock, and paint a frame. */
const tick = (text, ms = 1000) => {
  now += ms;
  document.getElementById("now-playing-timer").textContent = text;
  frame();
};

const fillWidth = (bar = document.querySelector(".now-playing-progress")) =>
  parseFloat(bar.querySelector(".now-playing-progress__fill").style.width);

const isEstimated = () =>
  document
    .querySelector(".now-playing-progress")
    .classList.contains("now-playing-progress--estimated");

describe("now playing progress bar", () => {
  beforeEach(() => {
    frames = [];
    now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    window.requestAnimationFrame = (cb) => frames.push(cb);
    delete window.__rfNowPlayingProgress;
    document.head.innerHTML = "";
    document.body.innerHTML =
      '<span id="now-playing">Song A</span>' +
      '<span id="now-playing-timer">0:00</span>' +
      '<div class="now-playing-progress"></div>';
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does nothing when the page has no bar", () => {
    document.body.innerHTML = '<span id="now-playing-timer">1:00</span>';
    runScript();
    frame();
    expect(
      document.getElementById("rf-now-playing-progress-styles")
    ).toBeNull();
  });

  it("fills as the song counts down after a song change", () => {
    runScript();
    tick("0:10", 0);
    // Seen mid-song on load: starts empty and is flagged as an estimate.
    expect(fillWidth()).toBe(0);
    expect(isEstimated()).toBe(true);

    tick("3:20"); // timer jumped up: new song, length now known
    expect(fillWidth()).toBe(0);
    expect(isEstimated()).toBe(false);

    for (let i = 0; i < 100; i += 1) {
      const remaining = 199 - i;
      tick(
        `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(
          2,
          "0"
        )}`
      );
    }
    // 1:40 left of 3:20
    expect(fillWidth()).toBe(50);
    expect(
      document
        .querySelector(".now-playing-progress")
        .getAttribute("aria-valuenow")
    ).toBe("50");
  });

  it("moves smoothly between one-second ticks", () => {
    runScript();
    tick("0:10", 0);
    tick("0:09");
    now += 500;
    frame();
    // 1.5s into a 10s window
    expect(fillWidth()).toBe(15);
    now += 5000;
    frame();
    // Never runs more than a second ahead of the displayed timer
    expect(fillWidth()).toBe(20);
  });

  it("treats a title change as a new song even when the timer drops", () => {
    document
      .querySelector(".now-playing-progress")
      .setAttribute("data-title", "#now-playing");
    runScript();
    tick("3:00", 0);
    tick("2:00");
    tick("1:59");
    // Interrupted by a shorter song: no upward jump, only the title changes
    document.getElementById("now-playing").textContent = "Song B";
    tick("1:30");
    expect(fillWidth()).toBe(0);
    expect(isEstimated()).toBe(false);
  });

  it("stays full at the end of a song, then empties when nothing plays", () => {
    runScript();
    tick("0:05", 0);
    tick("0:04");
    tick("0:00");
    expect(fillWidth()).toBe(100);
    tick("0:00", 6000);
    expect(fillWidth()).toBe(0);
  });

  it('drains instead of filling with data-direction="remaining"', () => {
    document
      .querySelector(".now-playing-progress")
      .setAttribute("data-direction", "remaining");
    runScript();
    tick("0:10", 0);
    tick("0:05", 0);
    tick("0:10", 0);
    tick("0:05", 0);
    expect(fillWidth()).toBe(50);
  });

  it("restores the fill after the viewer re-renders the bar", () => {
    runScript();
    tick("0:10", 0);
    document.querySelector(".now-playing-progress").innerHTML = "";
    frame();
    expect(
      document.querySelector(".now-playing-progress__fill")
    ).not.toBeNull();
  });
});
