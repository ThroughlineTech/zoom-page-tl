// Shared constants/helpers. Loaded as a plain script in the popup and as the
// first content script (before content.js), so both can use stepFrom for the
// zoom ladder. The same two functions are duplicated minimally in background.js
// (service workers can't import this without module plumbing).

const ZOOM_STEPS = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9,
  1.0,
  1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0
];

function hostKey(host) {
  return "z:" + host;
}

function stepFrom(current, dir) {
  // dir: +1 in, -1 out. Snap to nearest step, then move one.
  const c = current || 1.0;
  if (dir > 0) {
    for (const s of ZOOM_STEPS) if (s > c + 1e-6) return s;
    return ZOOM_STEPS[ZOOM_STEPS.length - 1];
  } else {
    for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
      if (ZOOM_STEPS[i] < c - 1e-6) return ZOOM_STEPS[i];
    }
    return ZOOM_STEPS[0];
  }
}

// --- Zoom slider (popup) ---------------------------------------------------
//
// The popup's live zoom slider maps a 0..1 track position to a zoom factor on a
// LOG scale, so equal travel == equal ratio (the common 75-200 band gets even,
// fine spacing instead of being crushed into the right edge of a 5-400 range).
// These are pure functions so the test suite can exercise the math directly.

// The "normal numbers" the slider softly snaps to (factors). Drawn as ticks; the
// slider grabs them within a small well but slides past to any in-between value.
const ZOOM_DETENTS = [
  0.25, 0.5, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0,
];

// Default slider extents (settable via cfg:zoomMin / cfg:zoomMax). Factors.
const ZOOM_MIN_DEFAULT = 0.05; // 5%
const ZOOM_MAX_DEFAULT = 4.0; // 400%

// Hard safety clamp for any stored factor, also enforced in content.js and
// options.js. The settable extents must stay inside this.
const ZOOM_CLAMP_MIN = 0.05;
const ZOOM_CLAMP_MAX = 5.0;

// Position (0..1) -> factor, and back, on a logarithmic scale over [min, max].
function posToFactor(pos, min, max) {
  const p = pos < 0 ? 0 : pos > 1 ? 1 : pos;
  return min * Math.pow(max / min, p);
}
function factorToPos(factor, min, max) {
  const f = factor < min ? min : factor > max ? max : factor;
  return Math.log(f / min) / Math.log(max / min);
}

// Soft magnetic snap: if the raw factor sits within `well` (in 0..1 position
// units) of a detent that lies inside [min, max], return that detent; otherwise
// return the raw factor unchanged. Keep `well` smaller than half the gap between
// adjacent detents so their wells never overlap (and so any in-between value
// remains reachable by sliding a touch further).
function snapFactor(factor, min, max, well) {
  const pos = factorToPos(factor, min, max);
  let best = null;
  let bestD = Infinity;
  for (const d of ZOOM_DETENTS) {
    if (d < min - 1e-9 || d > max + 1e-9) continue;
    const dp = Math.abs(factorToPos(d, min, max) - pos);
    if (dp < bestD) {
      bestD = dp;
      best = d;
    }
  }
  return best != null && bestD <= well ? best : factor;
}

// Clamp a factor to the settable extents and round to 0.01 (clean storage/badge).
function clampToExtents(factor, min, max) {
  const c = factor < min ? min : factor > max ? max : factor;
  return Math.round(c * 100) / 100;
}
