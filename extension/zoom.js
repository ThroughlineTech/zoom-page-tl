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
