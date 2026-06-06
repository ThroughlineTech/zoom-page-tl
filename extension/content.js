// Runs at document_start on every page. Reads the stored zoom factor for this
// hostname and applies it via the CSS `zoom` property on <html>. Because we
// never touch chrome.tabs.setZoom, Chrome's native zoom bubble never appears.
//
// CSS `zoom` in Chromium is a real layout zoom (reflows like browser zoom),
// so there are no transform-scale scrollbar/overflow hacks and it runs at
// native speed.

(() => {
  const host = location.hostname;
  if (!host) return; // about:, data:, etc.
  const key = "z:" + host;
  const DEFAULT_KEY = "cfg:defaultZoom"; // global default for un-customized sites
  const disabledKey = "x:" + host; // when set, zoom is paused for this host

  const MIN = 0.25;
  const MAX = 5.0;

  function apply(factor) {
    const f = factor && factor > 0 ? factor : 1.0;
    // documentElement exists at document_start even before the body is parsed.
    if (document.documentElement) {
      document.documentElement.style.zoom = f === 1 ? "" : String(f);
    }
  }

  // A site's factor is its own key if set, otherwise the global default,
  // otherwise 100%. (So a site with no key follows the default; that is the
  // intended meaning of "default zoom for new sites".)
  function resolve(res) {
    if (res && res[key] != null) return res[key];
    if (res && res[DEFAULT_KEY] != null) return res[DEFAULT_KEY];
    return 1.0;
  }

  function refresh() {
    try {
      chrome.storage.local.get([key, DEFAULT_KEY, disabledKey], (res) => {
        if (chrome.runtime.lastError) return;
        // Paused on this site: leave the page at its natural 100%, ignoring any
        // stored factor and the global default.
        apply(res[disabledKey] ? 1.0 : resolve(res));
      });
    } catch (e) {
      /* extension context can be unavailable on some restricted pages */
    }
  }

  // Initial apply. storage.local.get is async but resolves well before first
  // paint in the common case, since document_start fires very early.
  refresh();

  // Live updates: popup, keyboard command, or options page writes storage;
  // reflect instantly without a reload. React to this site's key and to the
  // global default (which affects sites that have no key of their own).
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (changes[key] || changes[DEFAULT_KEY] || changes[disabledKey]) refresh();
    });
  } catch (e) {
    /* ignore */
  }

  // AutoFit-to-width. Measure the content at natural scale and pick the factor
  // that makes the page width fit the viewport, clamped to the zoom range. This
  // is the one operation that legitimately needs a post-layout measurement, so
  // it runs on demand (popup button or keyboard command), never automatically.
  function computeAutofitFactor() {
    const html = document.documentElement;
    // Measure at scale 1. Reading clientWidth/scrollWidth forces a synchronous
    // reflow, so the numbers are correct; nothing paints between here and the
    // apply() below, so the user never sees the un-zoomed frame.
    html.style.zoom = "";
    const viewport = html.clientWidth; // viewport width, minus any scrollbar
    const content = html.scrollWidth; // full content width incl. overflow
    if (!content || content <= 0) return 1;
    let f = viewport / content;
    if (f < MIN) f = MIN;
    if (f > MAX) f = MAX;
    return Math.round(f * 100) / 100; // 0.01 precision => clean storage/badge
  }

  async function autofit() {
    const dis = await chrome.storage.local.get(disabledKey);
    if (dis[disabledKey]) return 1.0; // paused on this site; do nothing
    const f = computeAutofitFactor();
    apply(f);
    if (Math.abs(f - 1.0) < 1e-6) {
      await chrome.storage.local.remove(key); // 100% => store nothing
    } else {
      await chrome.storage.local.set({ [key]: f });
    }
    return f;
  }

  // Message channel for the popup button and the keyboard command.
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.type === "autofit") {
        autofit()
          .then((factor) => sendResponse({ factor }))
          .catch((e) => sendResponse({ error: String(e) }));
        return true; // keep the channel open for the async response
      }
    });
  } catch (e) {
    /* ignore */
  }

  // Ctrl +/-/0 zoom. Chrome reserves Ctrl with +, -, and 0 for browser zoom and
  // will not let an extension bind them as commands; and because we keep browser
  // zoom disabled, those keys are otherwise inert. So intercept them here and
  // drive the same per-site CSS zoom ladder as the popup and the Alt+Shift
  // commands (stepFrom comes from zoom.js, loaded before this script). We only
  // write storage; the storage.onChanged handler above applies it, which also
  // resolves the global default correctly when a reset removes the key.
  function stepZoom(dir) {
    try {
      chrome.storage.local.get([key, DEFAULT_KEY, disabledKey], (res) => {
        if (chrome.runtime.lastError) return;
        if (res[disabledKey]) return; // paused on this site; the keys do nothing
        const next = dir === 0 ? 1.0 : stepFrom(resolve(res), dir);
        if (Math.abs(next - 1.0) < 1e-6) {
          chrome.storage.local.remove(key); // 100% => store nothing
        } else {
          chrome.storage.local.set({ [key]: next });
        }
      });
    } catch (e) {
      /* extension context unavailable on some restricted pages */
    }
  }

  try {
    window.addEventListener(
      "keydown",
      (e) => {
        // Require Ctrl, allow Shift (Ctrl++ is Ctrl+Shift+=), exclude Alt/Meta
        // (Alt+Shift+* is the command set; Meta is OS-level).
        if (!e.ctrlKey || e.altKey || e.metaKey) return;
        let dir;
        if (e.key === "+" || e.key === "=" || e.code === "NumpadAdd") dir = 1;
        else if (e.key === "-" || e.key === "_" || e.code === "NumpadSubtract") dir = -1;
        else if (e.key === "0" || e.code === "Numpad0") dir = 0;
        else return;
        e.preventDefault();
        stepZoom(dir);
      },
      { capture: true }
    );
  } catch (e) {
    /* ignore */
  }
})();
