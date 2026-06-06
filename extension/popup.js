// Popup logic. ZOOM_STEPS / stepFrom / hostKey come from zoom.js.

const PRESETS = [0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0];

let currentTab = null;
let currentHost = "";
let currentFactor = 1.0;
let currentExcluded = false; // x:<host> - never zoom this site
let currentPaused = false; // p:<host> - zoom suspended for now (resume later)
let currentAuto = false; // auto-fit mode: re-fits on load (see content.js)

const $host = document.getElementById("host");
const $pct = document.getElementById("pct");
const $presets = document.getElementById("presets");
const $pause = document.getElementById("pause");
const $exclude = document.getElementById("exclude");

function pctText(f) {
  return Math.round(f * 100) + "%";
}

function render() {
  // Suppressed = excluded or paused: either way the page is held at 100% and the
  // zoom controls are inert. Excluded is the stronger state (a never-zoom site
  // has nothing to pause), so its checkbox disables the pause one.
  const suppressed = currentExcluded || currentPaused;
  $host.textContent = currentHost || "(no site)";
  $pct.textContent = currentExcluded
    ? "Off"
    : currentPaused
    ? "Paused"
    : pctText(currentFactor);
  document.body.classList.toggle("off", suppressed);
  $pause.checked = currentPaused;
  $pause.disabled = currentExcluded;
  $exclude.checked = currentExcluded;
  // Mark the matching preset, and make the zoom controls inert while suppressed.
  [...$presets.children].forEach((btn) => {
    const v = parseFloat(btn.dataset.v);
    btn.classList.toggle("on", !suppressed && Math.abs(v - currentFactor) < 1e-6);
    btn.disabled = suppressed;
  });
  for (const id of ["in", "out", "fit", "reset"]) {
    document.getElementById(id).disabled = suppressed;
  }
  // Highlight "Fit width" while auto-fit mode is on (it re-fits on each load).
  document
    .getElementById("fit")
    .classList.toggle("on", currentAuto && !suppressed);
}

async function persist() {
  const key = hostKey(currentHost);
  // A manual zoom leaves auto-fit mode (the user picked a level; don't re-fit).
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
  currentFactor = f;
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

// AutoFit runs in the content script (it needs a live measurement). It writes
// storage itself, so we just reflect the returned factor in the popup UI.
document.getElementById("fit").addEventListener("click", async () => {
  if (!currentTab || !currentHost) return;
  // Entering auto-fit mode: re-fits on each load (see content.js). Set the flag
  // before measuring so the content script sees it.
  currentAuto = true;
  await chrome.storage.local.set({ ["af:" + currentHost]: true });
  try {
    const resp = await chrome.tabs.sendMessage(currentTab.id, {
      type: "autofit",
    });
    if (resp && typeof resp.factor === "number") {
      currentFactor = resp.factor;
      const text =
        Math.abs(currentFactor - 1.0) < 1e-6
          ? ""
          : String(Math.round(currentFactor * 100));
      chrome.action.setBadgeText({ tabId: currentTab.id, text });
      render();
      // Nothing to fit (already spans the window): say so, since the percent
      // not moving would otherwise look like a dead button.
      if (resp.fits) showNote("Already fits the width");
    } else {
      render();
    }
  } catch (e) {
    /* no content script on restricted pages */
    render();
  }
});

document.getElementById("options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// Init
(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;
  try {
    currentHost = tab && tab.url ? new URL(tab.url).hostname : "";
  } catch (e) {
    currentHost = "";
  }
  if (currentHost) {
    const res = await chrome.storage.local.get([
      hostKey(currentHost),
      "x:" + currentHost,
      "p:" + currentHost,
      "af:" + currentHost,
    ]);
    currentFactor = res[hostKey(currentHost)] || 1.0;
    currentExcluded = !!res["x:" + currentHost];
    currentPaused = !!res["p:" + currentHost];
    currentAuto = !!res["af:" + currentHost];
  }
  render();
})();
