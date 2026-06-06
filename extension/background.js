// Service worker.
// Two jobs:
//   1) Suppress Chrome's native zoom bubble by disabling browser zoom on every
//      tab/navigation (setZoomSettings resets to default on each navigation, so
//      it must be reapplied).
//   2) Keep the toolbar badge showing the current site's zoom %, and handle the
//      keyboard commands.

const ZOOM_STEPS = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9,
  1.0,
  1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0
];

function stepFrom(current, dir) {
  const c = current || 1.0;
  if (dir > 0) {
    for (const s of ZOOM_STEPS) if (s > c + 1e-6) return s;
    return ZOOM_STEPS[ZOOM_STEPS.length - 1];
  }
  for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (ZOOM_STEPS[i] < c - 1e-6) return ZOOM_STEPS[i];
  }
  return ZOOM_STEPS[0];
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return "";
  }
}

const DEFAULT_KEY = "cfg:defaultZoom"; // global default for un-customized sites

// The factor a site actually renders at, resolved the same way content.js does:
// its own z:<host> key if set, otherwise the global default, otherwise 100%.
// Used for both the command stepping base (so "zoom in" steps up from what is on
// screen, even when the default is not 100%) and the badge (so it shows the true
// percent, not a blank that implies 100%).
async function getFactor(host) {
  if (!host) return 1.0;
  const key = "z:" + host;
  const res = await chrome.storage.local.get([key, DEFAULT_KEY]);
  if (res[key] != null) return res[key];
  if (res[DEFAULT_KEY] != null) return res[DEFAULT_KEY];
  return 1.0;
}

async function setFactor(host, factor) {
  if (!host) return;
  const key = "z:" + host;
  if (!factor || Math.abs(factor - 1.0) < 1e-6) {
    await chrome.storage.local.remove(key); // 100% => store nothing
  } else {
    await chrome.storage.local.set({ [key]: factor });
  }
}

function disableBrowserZoom(tabId) {
  // Pinning browser zoom to "disabled" reverts the tab to 100% silently and
  // makes Chrome ignore all zoom changes => the bubble can never appear.
  chrome.tabs.setZoomSettings(tabId, { mode: "disabled" }).catch(() => {
    /* chrome://, web store, etc. will reject; ignore */
  });
}

async function refreshBadge(tabId, host) {
  const f = await getFactor(host);
  const text = Math.abs(f - 1.0) < 1e-6 ? "" : String(Math.round(f * 100));
  chrome.action.setBadgeText({ tabId, text });
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#2563eb" });
}

// Reapply on every navigation/update. status === "loading" is the earliest
// reliable hook after the zoom settings have been reset by navigation.
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading") {
    disableBrowserZoom(tabId);
  }
  if (changeInfo.status === "complete" || changeInfo.url) {
    refreshBadge(tabId, hostOf(tab.url));
  }
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    disableBrowserZoom(tabId);
    refreshBadge(tabId, hostOf(tab.url));
  } catch (e) {
    /* ignore */
  }
});

// Keep the active tab's badge in sync when the zoom data changes from anywhere:
// the content-script Ctrl +/- keys, the popup, or the options page. (Tab events
// above cover navigation and activation; this covers in-place edits.)
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") refreshActiveBadge();
});

async function refreshActiveBadge() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) await refreshBadge(tab.id, hostOf(tab.url));
  } catch (e) {
    /* ignore */
  }
}

// Keyboard commands operate on the active tab's site.
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  const host = hostOf(tab.url);
  if (!host) return;

  // AutoFit needs a live measurement, so it runs in the content script. The
  // content script writes storage itself; we just refresh the badge after.
  if (command === "zoom-autofit") {
    try {
      await chrome.tabs.sendMessage(tab.id, { type: "autofit" });
    } catch (e) {
      /* no content script on restricted pages; nothing to do */
    }
    refreshBadge(tab.id, host);
    return;
  }

  let next;
  if (command === "zoom-reset") {
    next = 1.0;
  } else {
    const cur = await getFactor(host);
    next = stepFrom(cur, command === "zoom-in" ? 1 : -1);
  }
  await setFactor(host, next);
  refreshBadge(tab.id, host);
});
