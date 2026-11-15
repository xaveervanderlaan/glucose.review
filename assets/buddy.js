// ASCII buddy for the Today view: a small animated animal keyed to the report day's time in range.
// `buddyFor()` is pure (no DOM), so it can be checked in Node; `buddyCard()` renders and animates it.
// The art is decorative (aria-hidden). The message is the real content and carries the number as text.

import { h } from "./format.js";

/** Split template art into lines and pad every frame to one width and height, so nothing jumps. */
function frameSet(...raws) {
  const sets = raws.map((raw) => raw.replace(/^\n/, "").replace(/\n$/, "").split("\n").map((line) => line.trimEnd()));
  const height = Math.max(...sets.map((lines) => lines.length));
  const width = Math.max(...sets.flat().map((line) => line.length));
  return sets.map((lines) => Array.from({ length: height }, (_, i) => (lines[i] ?? "").padEnd(width)).join("\n"));
}

// Original art. Kept flush left on purpose: leading spaces are part of the drawing.
const ANIMALS = {
  // No data: a cat asleep, with z's drifting up.
  rest: frameSet(
    String.raw`

               z
  /\_/\
 ( -.- )________
  > ^ <         \
 (__)(__)_______/~~
`,
    String.raw`
                  Z
               z
  /\_/\
 ( -.- )________
  > ^ <         \
 (__)(__)_______/~~
`,
    String.raw`
                  Z

  /\_/\
 ( -.- )________
  > ^ <         \
 (__)(__)_______/~^
`,
  ),
  // A hard day: a bunny wrapped in a blanket, a steaming mug of tea beside it.
  comfort: frameSet(
    String.raw`
                  ) )
   (\_/)         ( (
   (u.u)        .---.
  /~~~~~\       |   |)
 (~~~~~~~)      '---'
  '~~~~~'
`,
    String.raw`
                 ( (
   (\_/)          ) )
   (u.u)        .---.
  /~~~~~\       |   |)
 (~~~~~~~)      '---'
  '~~~~~'
`,
    String.raw`
                  ) )
   (\_/)         ( (
   (u.u)        .---.
  /~~~~~\       |   |)
 (~~~~~~~)      '---'
  '~~~~~'
`,
    String.raw`
                 ( (
   (\_/)          ) )
   (-.-)        .---.
  /~~~~~\       |   |)
 (~~~~~~~)      '---'
  '~~~~~'
`,
  ),
  // Middling: a tortoise plodding along.
  steady: frameSet(
    String.raw`
    ________
  _/_/\__/\_\_
 /_/__\/__\/__\  __
(______________)/ o)
  /_/      /_/ '--'
`,
    String.raw`
    ________
  _/_/\__/\_\_
 /_/__\/__\/__\  __
(______________)/ o)
  \_\      \_\ '--'
`,
  ),
  // In range: a dog trotting, tail wagging, tongue out.
  happy: frameSet(
    String.raw`
              ___
  \          /   \__
   \________/  ^    @
   (             ___/
    \__________/ U
     |_|    |_|
`,
    String.raw`
              ___
   /         /   \__
  /_________/  ^    @
   (             ___/
    \__________/ U
     /_/    \_\
`,
  ),
  // Well in range: a little bird dancing, wings up and down, swaying side to side.
  party: frameSet(
    String.raw`
  .    *     .
    \  .-.  /
     \(^v^)/
      (   )
      _" "_
`,
    String.raw`
 *     .     *
      .-.
     (^v^)
    /(   )\
     _" "_
`,
    String.raw`
  *    .     *
    \  .-.  /
     \(^v^)/
      (   )
      _" "_
`,
    String.raw`
 .     *     .
        .-.
       (^v^)
      /(   )\
       _" "_
`,
  ),
};

/** Per tier: whether the animal walks back and forth, and the frame interval in ms. */
const MOTION = {
  rest: { walk: false, stepMs: 700 },
  comfort: { walk: false, stepMs: 650 },
  steady: { walk: true, stepMs: 700 },
  happy: { walk: true, stepMs: 450 },
  party: { walk: false, stepMs: 500 },
};

const LOWS_NOTE = "Lows are exhausting, so be kind to yourself today.";
const LOWS_NOTE_ABOVE_PCT = 4; // the consensus goal for time below 3.9

/**
 * Map the report day's `time_pct` (windows["1d"].time_pct, may be null) to the buddy's tier,
 * frames and words. The tier uses the rounded percentage that the message shows, so the art and
 * the number always agree (69.6 shows as "70%" and gets the happy dog).
 */
export function buddyFor(timePct) {
  const inRange = timePct?.in_range;
  let tier;
  let message;
  let note = null;
  if (typeof inRange !== "number" || !Number.isFinite(inRange)) {
    tier = "rest";
    message = "Not enough sensor data yesterday to work out time in range.";
    note = "Gaps happen, so the cat is taking a nap.";
  } else {
    const pct = Math.round(inRange);
    const said = `${pct}% in range yesterday.`;
    if (pct < 50) {
      tier = "comfort";
      message = `${said} A hard day. That's diabetes, not you.`;
      note = "The kettle's on. Today is a fresh start.";
    } else if (pct < 70) {
      tier = "steady";
      message = `${said} Slow and steady, one step at a time.`;
    } else if (pct < 85) {
      tier = "happy";
      message = `${said} A good day, tail wags all round.`;
    } else {
      tier = "party";
      message = `${said} That calls for a happy dance!`;
    }
    const below = (timePct.very_low ?? 0) + (timePct.low ?? 0);
    if (below > LOWS_NOTE_ABOVE_PCT) note = LOWS_NOTE;
  }
  const frames = ANIMALS[tier];
  const lines = frames[0].split("\n");
  return { tier, frames, message, note, ...MOTION[tier], width: lines[0].length, height: lines.length };
}

const MIRROR = { "/": "\\", "\\": "/", "(": ")", ")": "(", "<": ">", ">": "<", "[": "]", "]": "[", "{": "}", "}": "{" };

/** The same frame facing the other way (lines are padded to equal width, so columns line up). */
export function mirrorFrame(frame) {
  return frame
    .split("\n")
    .map((line) => [...line].reverse().map((c) => MIRROR[c] ?? c).join(""))
    .join("\n");
}

/**
 * The Today card. Returns { node, mount } like the views: mount() starts the animation once the
 * node is in the DOM. The timer skips ticks while the tab is hidden and clears itself as soon as
 * the router has replaced the view (node no longer connected), so re-renders never leak intervals.
 */
export function buddyCard(latest) {
  const buddy = buddyFor(latest.windows?.["1d"]?.time_pct);
  const art = h("pre", { class: "buddy-art" }, buddy.frames[0]);
  const stage = h("div", { class: "buddy-stage", "aria-hidden": "true" }, art);
  const node = h(
    "section",
    { class: `card buddy buddy-${buddy.tier}`, "aria-label": "Daily buddy" },
    stage,
    h("div", { class: "buddy-text" }, h("p", { class: "buddy-message" }, buddy.message), buddy.note ? h("p", { class: "buddy-note" }, buddy.note) : null),
  );

  const mount = () => {
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches || buddy.frames.length < 2) return;
    const facingLeft = buddy.walk ? buddy.frames.map(mirrorFrame) : null;
    if (buddy.walk) stage.classList.add("walking"); // walkers start at the left edge, others stay centred
    let frame = 0;
    let x = 0; // columns from the left edge of the stage
    let dir = 1;
    // Free columns inside the stage, measured each step so resizes and rotation just work.
    const room = () => {
      const style = getComputedStyle(stage);
      const inner = stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const col = art.offsetWidth / buddy.width;
      return col > 0 ? Math.max(0, Math.floor(inner / col) - buddy.width) : 0;
    };
    const timer = setInterval(() => {
      if (!node.isConnected) {
        clearInterval(timer);
        return;
      }
      if (document.hidden) return; // paused while the tab is in the background
      if (reduce.matches) {
        art.textContent = buddy.frames[0];
        art.style.transform = "";
        stage.classList.remove("walking");
        clearInterval(timer);
        return;
      }
      frame = (frame + 1) % buddy.frames.length;
      if (buddy.walk) {
        const free = room();
        if (free === 0) {
          x = 0;
          dir = 1;
        } else {
          if (x + dir < 0 || x + dir > free) dir = -dir;
          x = Math.min(Math.max(x + dir, 0), free);
        }
        art.style.transform = x ? `translateX(${x}ch)` : "";
      }
      art.textContent = (dir < 0 ? facingLeft : buddy.frames)[frame];
    }, buddy.stepMs);
  };

  return { node, mount };
}
