// Popup logic. ZOOM_STEPS / stepFrom / hostKey come from zoom.js.

const PRESETS = [0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0];

let currentTab = null;
let currentHost = "";
let currentFactor = 1.0;

const $host = document.getElementById("host");
const $pct = document.getElementById("pct");
const $presets = document.getElementById("presets");

function pctText(f) {
  return Math.round(f * 100) + "%";
}

function render() {
  $host.textContent = currentHost || "(no site)";
  $pct.textContent = pctText(currentFactor);
  // mark the matching preset
  [...$presets.children].forEach((btn) => {
    const v = parseFloat(btn.dataset.v);
    btn.classList.toggle("on", Math.abs(v - currentFactor) < 1e-6);
  });
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
    const res = await chrome.storage.local.get(hostKey(currentHost));
    currentFactor = res[hostKey(currentHost)] || 1.0;
  }
  render();
})();
