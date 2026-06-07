// Popup logic. ZOOM_STEPS / stepFrom / hostKey, the slider log-map helpers
// (posToFactor / factorToPos / snapFactor / clampToExtents) and the
// ZOOM_DETENTS / ZOOM_*_DEFAULT constants all come from zoom.js.

const PRESETS = [0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0];

// Slider track resolution: a native range of 0..SLIDER_MAX positions mapped
// through the log scale. The well (snap radius, in 0..1 position units) is kept
// well under half the smallest detent gap so wells never overlap.
const SLIDER_MAX = 1000;
const SNAP_WELL = 0.01;
// Detents to label on the tick strip (factors). The rest are unlabeled ticks.
const TICK_LABELS = new Set([0.5, 1.0, 1.5, 2.0, 4.0]);

let currentTab = null;
let currentHost = "";
let currentFactor = 1.0;
let currentGlobalOff = false; // cfg:off - master switch, off on every site
let currentExcluded = false; // x:<host> - never zoom this site
let currentPaused = false; // p:<host> - zoom suspended for now (resume later)
let currentAuto = false; // af:<host> - explicit auto-fit mode (re-fits each load)
let zoomMin = ZOOM_MIN_DEFAULT; // cfg:zoomMin - slider low extent (factor)
let zoomMax = ZOOM_MAX_DEFAULT; // cfg:zoomMax - slider high extent (factor)
let dragging = false; // true while the slider thumb is being dragged

const $host = document.getElementById("host");
const $pct = document.getElementById("pct");
const $presets = document.getElementById("presets");
const $power = document.getElementById("power");
const $powerLabel = document.getElementById("powerLabel");
const $pause = document.getElementById("pause");
const $exclude = document.getElementById("exclude");
const $auto = document.getElementById("auto");
const $slider = document.getElementById("slider");
const $ticks = document.getElementById("ticks");

function pctText(f) {
  return Math.round(f * 100) + "%";
}

// The manual numbers (slider, stepper, presets, % field) are inert when the site
// is suppressed (off/excluded/paused) or auto-managed.
function manualOff() {
  return currentGlobalOff || currentExcluded || currentPaused || currentAuto;
}

// Clamp a factor to the current settable extents (rounded to 0.01).
function clampF(f) {
  return clampToExtents(f, zoomMin, zoomMax);
}

// Slider position (0..SLIDER_MAX) <-> factor over the current extents.
function sliderPosFor(factor) {
  return Math.round(factorToPos(factor, zoomMin, zoomMax) * SLIDER_MAX);
}
function factorForSlider(pos) {
  return posToFactor(pos / SLIDER_MAX, zoomMin, zoomMax);
}

// Build the tick strip for the detents inside the current extents.
function buildTicks() {
  $ticks.textContent = "";
  for (const d of ZOOM_DETENTS) {
    if (d < zoomMin - 1e-9 || d > zoomMax + 1e-9) continue;
    const tick = document.createElement("div");
    tick.className = "tick";
    tick.style.left = factorToPos(d, zoomMin, zoomMax) * 100 + "%";
    if (TICK_LABELS.has(d)) {
      tick.classList.add("major");
      const lbl = document.createElement("span");
      lbl.className = "ticklbl";
      lbl.textContent = Math.round(d * 100);
      tick.appendChild(lbl);
    }
    $ticks.appendChild(tick);
  }
}

// Ephemeral live preview while dragging: apply to the active tab WITHOUT writing
// storage. The popup commits once to storage on release (see the change handler).
function previewZoom(f) {
  if (!currentTab) return;
  chrome.tabs
    .sendMessage(currentTab.id, { type: "previewZoom", factor: f })
    .catch(() => {}); // no content script on restricted pages
}

function render() {
  // Suppressed = off everywhere, or excluded/paused here: the page is held at
  // 100% and the zoom controls are inert. The master switch dominates: when off
  // everywhere, the per-site toggles are moot (disabled).
  const suppressed = currentGlobalOff || currentExcluded || currentPaused;
  // In auto mode the zoom is auto-managed, so the MANUAL numbers (slider,
  // stepper, presets, % field) are inert too - but Fit/Auto/Reset stay usable.
  const mOff = manualOff();
  $host.textContent = currentHost || "(no site)";
  // The percent doubles as an editable field, so set .value (not textContent).
  $pct.value =
    currentGlobalOff || currentExcluded
      ? "Off"
      : currentPaused
      ? "Paused"
      : pctText(currentFactor);
  $pct.disabled = mOff;
  document.body.classList.toggle("off", suppressed);
  document.body.classList.toggle("globaloff", currentGlobalOff);
  document.body.classList.toggle("auto", currentAuto && !suppressed);
  // Master switch: checked = on.
  $power.checked = !currentGlobalOff;
  $powerLabel.textContent = currentGlobalOff ? "Off" : "On";
  // Per-site toggles (excluded disables pause; off-everywhere disables both).
  $pause.checked = currentPaused;
  $pause.disabled = currentGlobalOff || currentExcluded;
  $exclude.checked = currentExcluded;
  $exclude.disabled = currentGlobalOff;
  // Slider: reflect the current factor (unless mid-drag, which sets it itself)
  // and disable it when the manual numbers are inert.
  if (!dragging) $slider.value = String(sliderPosFor(currentFactor));
  $slider.disabled = mOff;
  // Highlight the matching preset only when a manual fixed level is in effect.
  [...$presets.children].forEach((btn) => {
    const v = parseFloat(btn.dataset.v);
    btn.classList.toggle("on", !mOff && Math.abs(v - currentFactor) < 1e-6);
    btn.disabled = mOff;
  });
  document.getElementById("in").disabled = mOff;
  document.getElementById("out").disabled = mOff;
  for (const id of ["fit", "auto", "reset"]) {
    document.getElementById(id).disabled = suppressed;
  }
  // Highlight "Auto" while auto mode is on.
  $auto.classList.toggle("on", currentAuto && !suppressed);
}

async function persist() {
  const key = hostKey(currentHost);
  // A manually chosen level is fixed: leave auto mode.
  currentAuto = false;
  await chrome.storage.local.remove("af:" + currentHost);
  if (Math.abs(currentFactor - 1.0) < 1e-6) {
    await chrome.storage.local.remove(key);
  } else {
    await chrome.storage.local.set({ [key]: currentFactor });
  }
  // Badge refresh (best-effort; service worker also keeps it in sync).
  const text = Math.abs(currentFactor - 1.0) < 1e-6
    ? ""
    : String(Math.round(currentFactor * 100));
  if (currentTab) chrome.action.setBadgeText({ tabId: currentTab.id, text });
  render();
}

function setFactor(f) {
  currentFactor = clampF(f);
  persist();
}

// Build preset buttons
for (const v of PRESETS) {
  const b = document.createElement("button");
  b.textContent = Math.round(v * 100);
  b.dataset.v = v;
  b.addEventListener("click", () => setFactor(v));
  $presets.appendChild(b);
}

document.getElementById("in").addEventListener("click", () =>
  setFactor(stepFrom(currentFactor, 1))
);
document.getElementById("out").addEventListener("click", () =>
  setFactor(stepFrom(currentFactor, -1))
);
document.getElementById("reset").addEventListener("click", () =>
  setFactor(1.0)
);

// --- Live zoom slider ---
// Drag (input): preview live with NO storage write, and reflect the soft snap on
// the thumb. Release (change): commit the current factor once to storage.

$slider.addEventListener("input", () => {
  if (manualOff()) return;
  dragging = true;
  let f = clampF(snapFactor(factorForSlider($slider.valueAsNumber), zoomMin, zoomMax, SNAP_WELL));
  // Reflect a snap so the thumb visibly grabs the detent.
  const snapped = sliderPosFor(f);
  if (snapped !== $slider.valueAsNumber) $slider.value = String(snapped);
  currentFactor = f;
  previewZoom(f);
  // Live readout + preset highlight without a full re-render (which would reset
  // the thumb we just positioned).
  $pct.value = pctText(f);
  [...$presets.children].forEach((btn) =>
    btn.classList.toggle("on", Math.abs(parseFloat(btn.dataset.v) - f) < 1e-6)
  );
});

$slider.addEventListener("change", () => {
  dragging = false;
  if (manualOff()) return;
  setFactor(currentFactor); // commit the previewed value
});

// Arrow keys: fine +/-1%. A drag cannot resolve a single percent at this range
// (sub-pixel), so the keys own exact in-between values like 126.
$slider.addEventListener("keydown", (e) => {
  let delta = 0;
  if (e.key === "ArrowLeft" || e.key === "ArrowDown") delta = -1;
  else if (e.key === "ArrowRight" || e.key === "ArrowUp") delta = 1;
  else return;
  e.preventDefault(); // override the native sub-percent step
  if (manualOff()) return;
  setFactor((Math.round(currentFactor * 100) + delta) / 100);
});

// Ctrl/Shift + wheel over the slider: step the zoom ladder (coarse, fast). Plain
// wheel is left alone so it can scroll if the popup ever overflows.
$slider.addEventListener(
  "wheel",
  (e) => {
    if (!(e.ctrlKey || e.shiftKey)) return;
    e.preventDefault();
    if (manualOff()) return;
    setFactor(stepFrom(currentFactor, e.deltaY < 0 ? 1 : -1));
  },
  { passive: false }
);

// --- Editable percent field (exact entry) ---
$pct.addEventListener("focus", () => {
  if (!$pct.disabled) $pct.select();
});
$pct.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $pct.blur(); // commit via the change handler
  } else if (e.key === "Escape") {
    e.preventDefault();
    render(); // discard the edit
    $pct.blur();
  }
});
$pct.addEventListener("change", () => {
  if (manualOff()) return;
  const n = parseFloat(String($pct.value).replace(/[^0-9.]/g, ""));
  if (!isFinite(n) || n <= 0) {
    render(); // invalid: restore the previous value
    return;
  }
  setFactor(n / 100);
});

// Master switch: turn the whole extension on/off. Writes cfg:off; the service
// worker sweeps every tab (mode + badge) and greys the toolbar icon, and every
// content script holds its page at 100% while off.
$power.addEventListener("change", async () => {
  currentGlobalOff = !$power.checked; // checked = on
  if (currentGlobalOff) {
    await chrome.storage.local.set({ "cfg:off": true });
  } else {
    await chrome.storage.local.remove("cfg:off");
  }
  render();
});

// Pause (temporary) zoom on this site. Writes p:<host>; content.js suspends the
// zoom live and the service worker hands native zoom back. The stored level is
// kept, so resuming restores it.
$pause.addEventListener("change", async () => {
  if (!currentHost) {
    $pause.checked = false;
    return;
  }
  currentPaused = $pause.checked;
  const pKey = "p:" + currentHost;
  if (currentPaused) {
    await chrome.storage.local.set({ [pKey]: true });
  } else {
    await chrome.storage.local.remove(pKey);
  }
  render();
});

// Exclude (never) zoom on this site. Writes x:<host>. Excluding supersedes a
// pause, so it clears p:<host> too; including (uncheck) just removes x:.
$exclude.addEventListener("change", async () => {
  if (!currentHost) {
    $exclude.checked = false;
    return;
  }
  currentExcluded = $exclude.checked;
  const xKey = "x:" + currentHost;
  const pKey = "p:" + currentHost;
  if (currentExcluded) {
    currentPaused = false;
    await chrome.storage.local.set({ [xKey]: true });
    await chrome.storage.local.remove(pKey);
  } else {
    await chrome.storage.local.remove(xKey);
  }
  render();
});

let noteTimer = null;
function showNote(msg) {
  const $note = document.getElementById("note");
  $note.textContent = msg;
  if (noteTimer) clearTimeout(noteTimer);
  noteTimer = setTimeout(() => {
    $note.textContent = "";
  }, 1800);
}

// Measure-and-apply: the content script does the AutoFit (it needs a live
// measurement) and writes the resulting factor to storage; we just reflect it.
async function runFit() {
  try {
    const resp = await chrome.tabs.sendMessage(currentTab.id, { type: "autofit" });
    if (resp && typeof resp.factor === "number") {
      currentFactor = resp.factor;
      const text =
        Math.abs(currentFactor - 1.0) < 1e-6
          ? ""
          : String(Math.round(currentFactor * 100));
      chrome.action.setBadgeText({ tabId: currentTab.id, text });
      // Nothing to fit (already spans the window): say so, since the percent
      // not moving would otherwise look like a dead button.
      if (resp.fits) showNote("Already fits the width");
    }
  } catch (e) {
    /* no content script on restricted pages */
  }
  render();
}

// "Fit" is a ONE-SHOT: measure once, write a fixed level, and leave auto mode.
document.getElementById("fit").addEventListener("click", async () => {
  if (!currentTab || !currentHost) return;
  currentAuto = false;
  await chrome.storage.local.remove("af:" + currentHost);
  await runFit();
});

// "Auto" toggles explicit auto-fit mode (af:<host>). On: fit now AND re-fit on
// every later load/resize (content.js). Off: keep the last fit as a fixed level.
$auto.addEventListener("click", async () => {
  if (!currentTab || !currentHost) return;
  currentAuto = !currentAuto;
  if (currentAuto) {
    await chrome.storage.local.set({ ["af:" + currentHost]: true });
    await runFit();
  } else {
    await chrome.storage.local.remove("af:" + currentHost);
    render();
  }
});

document.getElementById("options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// A stored slider extent, clamped to the hard safety range; falls back to the
// default when missing or invalid.
function sanitizeBound(v, fallback) {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return fallback;
  return Math.min(ZOOM_CLAMP_MAX, Math.max(ZOOM_CLAMP_MIN, n));
}

// Init
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  try {
    currentHost = tab && tab.url ? new URL(tab.url).hostname : "";
  } catch (e) {
    currentHost = "";
  }
  // cfg:off and the slider extents are host-independent.
  const keys = ["cfg:off", "cfg:zoomMin", "cfg:zoomMax"];
  if (currentHost) {
    keys.push(
      hostKey(currentHost),
      "x:" + currentHost,
      "p:" + currentHost,
      "af:" + currentHost
    );
  }
  const res = await chrome.storage.local.get(keys);
  currentGlobalOff = !!res["cfg:off"];
  zoomMin = sanitizeBound(res["cfg:zoomMin"], ZOOM_MIN_DEFAULT);
  zoomMax = sanitizeBound(res["cfg:zoomMax"], ZOOM_MAX_DEFAULT);
  if (zoomMax <= zoomMin) {
    zoomMin = ZOOM_MIN_DEFAULT; // incoherent extents: fall back to the defaults
    zoomMax = ZOOM_MAX_DEFAULT;
  }
  if (currentHost) {
    currentFactor = res[hostKey(currentHost)] || 1.0;
    currentExcluded = !!res["x:" + currentHost];
    currentPaused = !!res["p:" + currentHost];
    currentAuto = !!res["af:" + currentHost];
  }
  buildTicks();
  render();
})();
