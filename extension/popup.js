// Popup logic. ZOOM_STEPS / stepFrom / hostKey come from zoom.js.

const PRESETS = [0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0];

let currentTab = null;
let currentHost = "";
let currentFactor = 1.0;
let currentDisabled = false;

const $host = document.getElementById("host");
const $pct = document.getElementById("pct");
const $presets = document.getElementById("presets");
const $disable = document.getElementById("disable");

function pctText(f) {
  return Math.round(f * 100) + "%";
}

function render() {
  $host.textContent = currentHost || "(no site)";
  $pct.textContent = currentDisabled ? "Off" : pctText(currentFactor);
  document.body.classList.toggle("off", currentDisabled);
  $disable.checked = currentDisabled;
  // Mark the matching preset, and make the zoom controls inert while paused.
  [...$presets.children].forEach((btn) => {
    const v = parseFloat(btn.dataset.v);
    btn.classList.toggle(
      "on",
      !currentDisabled && Math.abs(v - currentFactor) < 1e-6
    );
    btn.disabled = currentDisabled;
  });
  for (const id of ["in", "out", "fit", "reset"]) {
    document.getElementById(id).disabled = currentDisabled;
  }
}

async function persist() {
  const key = hostKey(currentHost);
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

// Disable (pause) zoom on this site. Writes x:<host>; the content script
// un-zooms/re-zooms live and the service worker updates the badge.
$disable.addEventListener("change", async () => {
  if (!currentHost) {
    $disable.checked = false;
    return;
  }
  currentDisabled = $disable.checked;
  const xKey = "x:" + currentHost;
  if (currentDisabled) {
    await chrome.storage.local.set({ [xKey]: true });
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
  if (!currentTab) return;
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
    }
  } catch (e) {
    /* no content script on restricted pages */
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
    ]);
    currentFactor = res[hostKey(currentHost)] || 1.0;
    currentDisabled = !!res["x:" + currentHost];
  }
  render();
})();
