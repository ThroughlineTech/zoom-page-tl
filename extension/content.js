// Runs at document_start on every page. Reads the stored zoom factor for this
// hostname and applies it via the CSS `zoom` property on <html>. Because we
// never touch chrome.tabs.setZoom, Chrome's native zoom bubble never appears.
//
// CSS `zoom` in Chromium is a real layout zoom (reflows like browser zoom),
// so there are no transform-scale scrollbar/overflow hacks and it runs at
// native speed.
//
// This script owns the zoom: it applies the stored factor at document_start,
// reflects live updates, handles the keyboard zoom and AutoFit, and re-asserts
// the factor against sites that re-render and clobber it (see "Resilience"
// below) - which is what keeps heavy/re-rendering sites (e.g. cnn.com) stable.

(() => {
  const host = location.hostname;
  if (!host) return; // about:, data:, etc.
  const key = "z:" + host;
  const DEFAULT_KEY = "cfg:defaultZoom"; // global default for un-customized sites
  const GLOBAL_OFF_KEY = "cfg:off"; // master switch: when set, off on every site
  const excludedKey = "x:" + host; // when set, this site is excluded (never zoom)
  const pausedKey = "p:" + host; // when set, zoom is paused (temporarily) for this host
  const autoKey = "af:" + host; // when set, this site is in EXPLICIT auto-fit mode
  const recenterKey = "rc:" + host; // when set, re-center content that drifts under zoom

  const MIN = 0.05; // hard floor (matches ZOOM_CLAMP_MIN); the slider can reach 5%
  const MAX = 5.0;

  // Cached state, kept current by refresh(): `suppressed` (excluded OR paused)
  // lets the keydown handler decide synchronously whether to let Ctrl +/- through;
  // `autoMode` (af:<host>, opt-in only) says the site re-fits on load/resize;
  // `desired` is the factor we want on <html>, used to re-assert if the page
  // clobbers it. Plain "Fit width" is a ONE-SHOT fixed level; Auto mode is the
  // explicit opt-in that brings back per-load re-fitting for one site.
  let suppressed = false;
  let autoMode = false;
  let desired = 1.0;
  // Re-center (rc:<host>, opt-in): some sites size full-bleed wrappers to the device
  // viewport (100vw / min-width:100vw). Under CSS `zoom` those wrappers do NOT shrink
  // (Chromium resolves vw against the un-zoomed viewport), so content centered inside
  // them drifts sideways and clips. When enabled, we translate the offending wrapper
  // back so the content column re-centers. `recenterEl` is the element we transformed
  // (kept so we can clear it).
  let recenter = false;
  let recenterEl = null; // only used for the marker-attribute fallback selector
  let recenterStyle = null; // our owned <style> carrying the transform rule
  let recenterShift = 0; // the translateX (CSS px) currently in our rule
  let recenterSelector = ""; // the selector our rule currently targets

  function apply(factor) {
    desired = factor && factor > 0 ? factor : 1.0;
    // documentElement exists at document_start even before the body is parsed.
    if (document.documentElement) {
      document.documentElement.style.zoom = desired === 1 ? "" : String(desired);
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
      chrome.storage.local.get(
        [key, DEFAULT_KEY, GLOBAL_OFF_KEY, excludedKey, pausedKey, autoKey, recenterKey],
        (res) => {
          if (chrome.runtime.lastError) return;
          suppressed =
            !!res[GLOBAL_OFF_KEY] || !!res[excludedKey] || !!res[pausedKey];
          autoMode = !suppressed && !!res[autoKey];
          recenter = !suppressed && !!res[recenterKey];
          // Off globally, or excluded/paused here: leave the page at its natural
          // 100%, ignoring any stored factor and the global default.
          apply(suppressed ? 1.0 : resolve(res));
          scheduleRecenter(); // (re)apply or clear the horizontal correction
        }
      );
    } catch (e) {
      /* extension context can be unavailable on some restricted pages */
    }
  }

  // Initial apply. storage.local.get is async but resolves well before first
  // paint in the common case, since document_start fires very early.
  refresh();

  // Live updates: popup, keyboard command, or options page writes storage;
  // reflect instantly without a reload. React to this site's key, the global
  // default, the excluded/paused flags, and the auto-fit flag.
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local") return;
      if (
        changes[key] ||
        changes[DEFAULT_KEY] ||
        changes[GLOBAL_OFF_KEY] ||
        changes[excludedKey] ||
        changes[pausedKey] ||
        changes[autoKey] ||
        changes[recenterKey]
      ) {
        refresh();
      }
      // Auto mode just turned on (e.g. from the options page): fit now, not only
      // on the next load.
      if (changes[autoKey] && changes[autoKey].newValue) scheduleRefit();
    });
  } catch (e) {
    /* ignore */
  }

  function clampF(f) {
    if (f < MIN) return MIN;
    if (f > MAX) return MAX;
    return Math.round(f * 100) / 100; // 0.01 precision => clean storage/badge
  }

  // Scan content blocks once and return the two candidates AutoFit chooses
  // between: the widest INSET column (a centered/capped container that leaves a
  // side margin - what we enlarge to fill) and the widest block OVERALL (which,
  // if it exceeds the viewport, is genuinely-too-wide content to shrink). We skip
  // breakouts (elements pulled off the left edge with negative margins, e.g.
  // full-bleed ad zones) because their off-screen spill is not content to fit and
  // would otherwise masquerade as overflow. (This is why we do NOT trust
  // documentElement.scrollWidth - ad breakouts pollute it.)
  function pickContentTargets(viewport) {
    let column = null,
      columnW = 0;
    let widest = null,
      widestW = 0;
    if (!document.body) return { column, widest };
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.height < 100 || r.width < 200) continue; // not a real content block
      if (r.left < -20) continue; // breakout pulled off the left edge; ignore
      if (r.width > widestW) {
        widestW = r.width;
        widest = el;
      }
      if (viewport - r.width >= 20 && r.width > columnW) {
        columnW = r.width; // inset (has a side margin)
        column = el;
      }
    }
    return { column, widest };
  }

  // --- Re-center (rc:<host>) -------------------------------------------------
  // The correction is applied via a content-script-OWNED stylesheet rule keyed on a
  // stable selector for the offending wrapper - NOT inline style on the wrapper. SPA
  // sites (e.g. WaPo) re-render and re-CREATE that wrapper during hydration and on
  // scroll; an inline transform (or a marker attribute) gets wiped, which made the
  // page bounce drift<->center. A stylesheet rule keeps matching whatever the site
  // renders, so the fix survives re-renders flicker-free.
  function ensureRecenterStyle() {
    if (!recenterStyle || !recenterStyle.isConnected) {
      recenterStyle = document.createElement("style");
      recenterStyle.id = "zp-recenter";
      (document.head || document.documentElement).appendChild(recenterStyle);
    }
    return recenterStyle;
  }
  function clearRecenter() {
    if (recenterStyle) recenterStyle.textContent = "";
    recenterShift = 0;
    recenterSelector = "";
    if (recenterEl) {
      try {
        recenterEl.removeAttribute("data-zp-recenter");
      } catch (e) {
        /* element may be gone after a re-render */
      }
      recenterEl = null;
    }
  }
  // A stable, UNIQUE selector for the wrapper (id, else its classes) so the rule keeps
  // matching after a re-render. null => caller falls back to a marker attribute.
  function selectorFor(el) {
    try {
      const tag = el.tagName.toLowerCase();
      if (el.id) {
        const s = tag + "#" + CSS.escape(el.id);
        if (document.querySelectorAll(s).length === 1) return s;
      }
      const cls =
        typeof el.className === "string"
          ? el.className.trim().split(/\s+/).filter(Boolean)
          : [];
      if (cls.length) {
        const s = tag + cls.map((c) => "." + CSS.escape(c)).join("");
        if (document.querySelectorAll(s).length === 1) return s;
      }
    } catch (e) {
      /* bad className / unsupported selector */
    }
    return null;
  }

  // Measure the content column, find the full-bleed wrapper it sits inside, and write
  // a rule that translates that wrapper so the column re-centers. All measured in
  // painted pixels (getBoundingClientRect and clientWidth share that space under CSS
  // zoom); the translate runs INSIDE zoom:Z, so the shift is divided by Z.
  function applyRecenter() {
    // Definitely off: clear the rule. (These are the ONLY conditions that clear -
    // a transient measurement miss during a re-render must NOT, or the page bounces.)
    if (!recenter || suppressed || !document.body) {
      clearRecenter();
      return;
    }
    const Z = desired && desired > 0 ? desired : 1;
    if (Math.abs(Z - 1) < 1e-6) {
      clearRecenter(); // nothing to correct at 100%
      return;
    }
    const html = document.documentElement;
    const viewport = html.clientWidth;
    if (!viewport) return;
    const { column } = pickContentTargets(viewport);
    if (!column) return; // transient (article mid-render): keep the existing rule
    const cr = column.getBoundingClientRect();
    const drift = viewport / 2 - (cr.left + cr.width / 2); // painted px to shift
    // Outermost full-bleed ancestor (wider than the viewport) that holds the column.
    let target = null;
    for (let el = column; el && el !== document.body; el = el.parentElement) {
      if (el.getBoundingClientRect().width > viewport + 8) target = el;
    }
    if (!target) {
      clearRecenter(); // column present but NOT inside an over-wide wrapper: no drift
      return;
    }
    // Prefer a stable selector (survives re-renders); else mark the element.
    let selector = selectorFor(target);
    if (selector) {
      if (recenterEl) {
        try {
          recenterEl.removeAttribute("data-zp-recenter");
        } catch (e) {
          /* ignore */
        }
        recenterEl = null;
      }
    } else {
      if (recenterEl && recenterEl !== target) {
        try {
          recenterEl.removeAttribute("data-zp-recenter");
        } catch (e) {
          /* ignore */
        }
      }
      recenterEl = target;
      try {
        target.setAttribute("data-zp-recenter", "");
      } catch (e) {
        /* ignore */
      }
      selector = "[data-zp-recenter]";
    }
    // Already centered (our rule is holding it, or the page needs no shift): no-op.
    // Crucially this does NOT clear - that would drop the rule and re-drift.
    if (Math.abs(drift) < 4) return;
    // Accumulate: the measured drift is the RESIDUAL with the current shift applied,
    // so the new shift is current + drift/Z (the /Z because the translate is inside
    // zoom:Z). This converges in one step and a centered reading becomes a no-op,
    // so there is no feedback oscillation. Reset the base if the wrapper changed.
    const base = selector === recenterSelector ? recenterShift : 0;
    recenterShift = base + drift / Z;
    recenterSelector = selector;
    ensureRecenterStyle().textContent =
      selector +
      "{transform:translateX(" +
      recenterShift.toFixed(2) +
      "px) !important;}";
  }

  // Debounced so a burst of mutations / a resize coalesces into one measurement.
  let recenterTimer = null;
  function scheduleRecenter() {
    if (recenterTimer) clearTimeout(recenterTimer);
    recenterTimer = setTimeout(() => {
      try {
        applyRecenter();
      } catch (e) {
        /* ignore */
      }
    }, 150);
  }

  // AutoFit-to-width. Three regimes (see HANDOFF section 9): a centered content
  // column narrower than the viewport enlarges to fill it (the common case); a
  // genuinely-too-wide block shrinks to fit; a fluid edge-to-edge page already
  // fits at every zoom, so there is nothing to do. Returns { factor, fits } where
  // fits=true means "no change worth making". Measuring under CSS zoom is
  // unreliable (clientWidth is zoom-invariant while getBoundingClientRect
  // rescales), so we compute once at scale 1 and do a single re-check that tracks
  // the SAME element (re-selecting the widest block would diverge).
  function computeAutofitFactor() {
    const html = document.documentElement;
    html.style.zoom = ""; // measure at scale 1 (reading width forces a reflow)
    void html.offsetWidth;
    const viewport = html.clientWidth;
    if (!viewport) return { factor: 1, fits: true };

    const { column, widest } = pickContentTargets(viewport);

    let el, factor;
    if (column) {
      el = column; // a centered/inset content column -> fill it
      factor = clampF(viewport / column.getBoundingClientRect().width);
    } else if (widest && widest.getBoundingClientRect().width > viewport + 20) {
      el = widest; // no inset column, but content is genuinely too wide -> shrink
      factor = clampF(viewport / widest.getBoundingClientRect().width);
    } else {
      return { factor: 1, fits: true }; // fluid edge-to-edge: nothing to fit
    }
    if (factor >= 0.99 && factor <= 1.01) return { factor: 1, fits: true };

    // Single re-check tracking the same element: did it actually fill at the
    // chosen factor? If a breakpoint shifted its width, correct once.
    html.style.zoom = String(factor);
    void html.offsetWidth;
    const vw2 = html.clientWidth;
    const w2 = el.getBoundingClientRect().width;
    html.style.zoom = ""; // restore; apply() below sets the final value
    if (vw2 > 0 && w2 > 0) {
      const fill = w2 / vw2; // ~1 means it filled the width
      if (fill > 0.2 && Math.abs(fill - 1) > 0.03) factor = clampF(factor / fill);
    }
    return { factor, fits: false };
  }

  async function autofit() {
    const st = await chrome.storage.local.get([
      GLOBAL_OFF_KEY,
      excludedKey,
      pausedKey,
    ]);
    if (st[GLOBAL_OFF_KEY] || st[excludedKey] || st[pausedKey])
      return { factor: 1, fits: true }; // suppressed; do nothing
    const { factor, fits } = computeAutofitFactor();
    apply(factor);
    if (Math.abs(factor - 1.0) < 1e-6) {
      await chrome.storage.local.remove(key); // 100% => store nothing
    } else {
      await chrome.storage.local.set({ [key]: factor }); // fixed level until refit
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
      // Ephemeral live preview while the popup slider is being dragged. Apply the
      // factor to <html> WITHOUT writing storage (no write churn, no badge/tab
      // fan-out) - the popup commits once to storage on release. apply() updates
      // `desired`, so the re-assert observer holds the preview steady instead of
      // reverting it. Ignored while suppressed (off/excluded/paused).
      if (msg && msg.type === "previewZoom") {
        if (!suppressed) apply(msg.factor);
        sendResponse({ ok: true });
        return; // synchronous response
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
      chrome.storage.local.get(
        [key, DEFAULT_KEY, GLOBAL_OFF_KEY, excludedKey, pausedKey],
        (res) => {
          if (chrome.runtime.lastError) return;
          if (res[GLOBAL_OFF_KEY] || res[excludedKey] || res[pausedKey]) return; // suppressed
          const next = dir === 0 ? 1.0 : stepFrom(resolve(res), dir);
          chrome.storage.local.remove(autoKey); // manual zoom -> leave auto mode
          if (Math.abs(next - 1.0) < 1e-6) {
            chrome.storage.local.remove(key); // 100% => store nothing
          } else {
            chrome.storage.local.set({ [key]: next });
          }
        }
      );
    } catch (e) {
      /* extension context unavailable on some restricted pages */
    }
  }

  try {
    window.addEventListener(
      "keydown",
      (e) => {
        // Excluded or paused on this site: do not touch the keys at all. Leaving
        // them un-prevented lets Chrome's native Ctrl +/- (and its bubble) work.
        if (suppressed) return;
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

  // Resilience: some sites (e.g. cnn.com) re-render after load, clobbering the
  // inline zoom or replacing <html>. Re-assert the desired factor when that
  // happens. (The service worker's pre-paint stylesheet is the first line of
  // defense; this is the second.) The apply() guard keeps this from fighting the
  // AutoFit measurement (apply() updates `desired`, so re-assert sees a match).
  function reassert() {
    if (suppressed) return;
    const cur = document.documentElement.style.zoom;
    const curN = cur ? parseFloat(cur) : 1.0;
    if (Math.abs(curN - desired) > 0.005) apply(desired);
  }
  let styleObserver = null;
  function watchStyle() {
    try {
      if (styleObserver) styleObserver.disconnect();
      styleObserver = new MutationObserver(reassert);
      styleObserver.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ["style"],
      });
    } catch (e) {
      /* ignore */
    }
  }
  watchStyle();
  try {
    // Wholesale <html> replacement: re-apply and re-attach the style observer.
    new MutationObserver(() => {
      if (suppressed) return;
      apply(desired);
      watchStyle();
      scheduleRecenter(); // the <html> (and our transform) was replaced; re-apply
    }).observe(document, { childList: true });
  } catch (e) {
    /* ignore */
  }

  // Auto mode (af:<host>, opt-in only) re-fits once the page settles (after load)
  // and on resize, so an explicitly-auto site reshapes to fit as it loads. A plain
  // fixed level is NEVER re-measured here - it just gets re-asserted, so it stays
  // put across loads instead of bouncing. Debounced.
  let refitTimer = null;
  function scheduleRefit() {
    if (refitTimer) clearTimeout(refitTimer);
    // Read the flags when the timer fires, not now: on a fast-loading page `load`
    // can beat the initial async storage read, so cached state may be stale here.
    refitTimer = setTimeout(() => {
      try {
        chrome.storage.local.get(
          [GLOBAL_OFF_KEY, excludedKey, pausedKey, autoKey],
          (res) => {
            if (chrome.runtime.lastError) return;
            if (
              res[autoKey] &&
              !res[GLOBAL_OFF_KEY] &&
              !res[excludedKey] &&
              !res[pausedKey]
            )
              autofit().catch(() => {});
          }
        );
      } catch (e) {
        /* ignore */
      }
    }, 400);
  }
  try {
    window.addEventListener("load", () => {
      refresh(); // re-assert the level (and re-center) after the load churn
      scheduleRefit(); // ...and re-fit if this site is explicitly in auto mode
      // A late re-render can wipe our transform; re-apply once the page settles.
      setTimeout(scheduleRecenter, 700);
    });
    window.addEventListener("resize", () => {
      scheduleRefit();
      scheduleRecenter(); // the drift depends on the viewport width
    });
  } catch (e) {
    /* ignore */
  }
})();
