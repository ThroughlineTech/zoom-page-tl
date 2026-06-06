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

  // Cached paused state, kept current by refresh() so the keydown handler can
  // decide synchronously whether to intercept Ctrl +/- or let the browser have
  // them (an async storage read would be too late to call preventDefault).
  let disabled = false;

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
        disabled = !!res[disabledKey];
        // Paused on this site: leave the page at its natural 100%, ignoring any
        // stored factor and the global default.
        apply(disabled ? 1.0 : resolve(res));
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

  function clampF(f) {
    if (f < MIN) return MIN;
    if (f > MAX) return MAX;
    return Math.round(f * 100) / 100; // 0.01 precision => clean storage/badge
  }

  // The widest content block that still leaves a side margin: a centered/capped
  // container, not a full-bleed background. This is the column AutoFit fills.
  function widestContentElement(viewport) {
    if (!document.body) return null;
    let best = null;
    let bestW = 0;
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width < 200 || r.height < 100) continue; // not a real content block
      if (viewport - r.width < 20) continue; // full-bleed; nothing to fill
      if (r.width > bestW) {
        bestW = r.width;
        best = el;
      }
    }
    return best;
  }

  // AutoFit-to-width. Three regimes (see HANDOFF section 9): content wider than
  // the viewport shrinks to fit; a centered content column narrower than the
  // viewport enlarges to fill it; a fluid edge-to-edge page already fits at every
  // zoom, so there is nothing to do. Returns { factor, fits } where fits=true
  // means "no change worth making". Measuring under CSS zoom is unreliable
  // (clientWidth is zoom-invariant while getBoundingClientRect rescales), so we
  // compute once at scale 1 and, for the enlarge case, do a single re-check that
  // tracks the SAME element (re-selecting the widest block would diverge).
  function computeAutofitFactor() {
    const html = document.documentElement;
    html.style.zoom = ""; // measure at scale 1 (reading width forces a reflow)
    void html.offsetWidth;
    const viewport = html.clientWidth;
    if (!viewport) return { factor: 1, fits: true };

    // Regime 1: content overflows the viewport -> shrink to fit.
    if (html.scrollWidth > viewport + 1) {
      return { factor: clampF(viewport / html.scrollWidth), fits: false };
    }

    // Regime 2/3: no overflow. Find the centered content column to fill.
    const el = widestContentElement(viewport);
    if (!el) return { factor: 1, fits: true }; // fluid edge-to-edge

    const contentW = el.getBoundingClientRect().width;
    if (contentW <= 0 || viewport - contentW < 20) {
      return { factor: 1, fits: true };
    }
    let factor = clampF(viewport / contentW);
    if (factor <= 1.01) return { factor: 1, fits: true };

    // Single re-check tracking the same element: does it actually fill at the
    // chosen factor? If a breakpoint shifted its width, correct once.
    html.style.zoom = String(factor);
    void html.offsetWidth;
    const vw2 = html.clientWidth;
    const w2 = el.getBoundingClientRect().width;
    html.style.zoom = ""; // restore; autofit() applies the final value
    if (vw2 > 0 && w2 > 0) {
      const fill = w2 / vw2; // ~1 means it filled the width
      if (fill > 0.2 && Math.abs(fill - 1) > 0.03) factor = clampF(factor / fill);
    }
    return { factor, fits: false };
  }

  async function autofit() {
    const dis = await chrome.storage.local.get(disabledKey);
    if (dis[disabledKey]) return { factor: 1, fits: true }; // paused; do nothing
    const { factor, fits } = computeAutofitFactor();
    apply(factor);
    if (Math.abs(factor - 1.0) < 1e-6) {
      await chrome.storage.local.remove(key); // 100% => store nothing
    } else {
      await chrome.storage.local.set({ [key]: factor });
    }
    return { factor, fits };
  }

  // Message channel for the popup button and the keyboard command.
  try {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg && msg.type === "autofit") {
        autofit()
          .then((res) => sendResponse(res))
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
        // Paused on this site: do not touch the keys at all. Leaving them
        // un-prevented lets Chrome's native Ctrl +/- (and its bubble) work.
        if (disabled) return;
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
