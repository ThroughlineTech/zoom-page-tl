# Zoom Page WE — Investigate Tickets

> Source: Chrome Web Store support page feedback (Zoom Page WE).
> Generated for import into Plane. Each entry is a candidate "investigate" ticket.
> Priority is a suggestion only. "Reporters" lists distinct users who reported the same thing.
> NOTE: Several older complaints were marked resolved by the developer ("fixed in vXX"); those are excluded
> unless the same symptom recurs in later/recent feedback. Recurring-symptom tickets are flagged.

---

## OPEN — likely still live

### 1. Steam Discussions posts cannot be selected when extension is active
- **Type:** Bug
- **Priority:** High
- **Labels:** bug, site-compat, selection, recent
- **Reporter(s):** Zolli Fan (Nov 3, 2025)
- **Environment:** Vivaldi 7.6.3797.63, Windows 11 23H2, 3440x1440 @150% scaling
- **Description:** With the extension enabled, discussion posts on Steam community pages can no longer be selected.
- **Repro:**
  1. Enable extension.
  2. Open a Steam discussions page (e.g. steamcommunity.com/app/<id>/discussions/).
  3. Attempt to select/highlight a post — selection fails.
- **Notes:** Reporter provided a screen-recording link. Treat external link as untrusted; investigate symptom, not the link.

### 2. Keyboard shortcuts (Ctrl+7/8/9) are not remappable / collide with other shortcuts
- **Type:** Feature Request
- **Priority:** Medium
- **Labels:** feature-request, shortcuts, accessibility, recent
- **Reporter(s):** Laus Bigum (Oct 30, 2025)
- **Description:** Ctrl+7/8/9 overlap with other apps' shortcuts. Request ability to remap/customize the keyboard shortcuts.

### 3. No way to exclude/blacklist specific sites; some sites freeze (e.g. chatgpt.com)
- **Type:** Bug + Feature Request
- **Priority:** High
- **Labels:** bug, feature-request, site-compat, exclusion-list, recent
- **Reporter(s):** Trevor Anderson (Oct 4, 2025), Laus Bigum (Oct 30, 2025)
- **Description:** chatgpt.com freezes / stops responding / blocks login while the extension is active. No per-site disable/blacklist option exists to work around it. Users request a per-site exclusion (white/black) list.
- **Repro:**
  1. Enable extension.
  2. Visit chatgpt.com and attempt to log in — page freezes.
- **Notes:** Recurring theme — exclusion-list requests appear across many years (see consolidated FR #14).

### 4. "Still maintained?" — no public source repo to fork
- **Type:** Question / Project
- **Priority:** Low
- **Labels:** question, project, maintenance, recent
- **Reporter(s):** Dan Richardson (Jun 6, 2026)
- **Description:** User asking whether the extension is still maintained and whether there is an official public repo (notes it is GPL). Wants to know if a canonical repo exists to fork from. Decide whether to publish/point to an official source repo.

### 5. Kiwi Browser: extension can't be added to toolbar; options open in separate tab and don't apply
- **Type:** Bug / Compatibility
- **Priority:** Low
- **Labels:** bug, browser-compat, mobile
- **Reporter(s):** Eric (Nov 4, 2024)
- **Description:** On Kiwi Browser, the extension opens in a separate tab and options cannot be changed/applied per tab. Investigate Kiwi/mobile-Chromium limitations and whether a workaround/doc is possible.

### 6. GMail zoom pushes right side of page off-screen (all Chromium browsers)
- **Type:** Bug
- **Priority:** Medium
- **Labels:** bug, site-compat, gmail, accessibility
- **Reporter(s):** Richard McWolff (Jun 16, 2023); related: Jeff Suddaby (May 9, 2019 — zoom won't apply in GMail at all)
- **Description:** Zooming GMail causes the right edge of the page to be cut off in Chromium browsers (works in Firefox). Accessibility-impacting for a user relying on per-site zoom.

### 7. SHIFT modifier / Ctrl+Shift+Wheel zoom cannot be fully disabled
- **Type:** Bug
- **Priority:** Medium
- **Labels:** bug, mouse, shortcuts, options
- **Reporter(s):** Federico Mobrici (Jun 14, 2023)
- **Description:** With "Use Zoom Levels for Ctrl+Wheel & Pinch zoom = NO" and "Press Shift for small adjustment = NO", the Ctrl+Shift+ScrollWheel combo still stays active and re-enables zoom, conflicting with another add-on that blocks Ctrl+Wheel. Also asks whether the reset popup can be suppressed when "Reset zoom level when loading page = NO".

### 8. CSS zoom resets to 100% on some sites (Google); browser-manage mode resets on others (Reddit)
- **Type:** Bug
- **Priority:** High
- **Labels:** bug, zoom-persistence, site-compat
- **Reporter(s):** Karas (May 27, 2023)
- **Description:** With "CSS zoom" enabled, zoom resets to default on certain sites (notably Google). Switching to "let browser manage" causes other sites (e.g. Reddit) to reset frequently. No single setting works across all sites.

### 9. Reset-zoom popup appears on every visit when using browser full zoom
- **Type:** Bug / UX
- **Priority:** Medium
- **Labels:** ux, popup, zoom-mode, recurring
- **Reporter(s):** Christian Waits (Jan 20, 2023); Gesly George (Sep 12, 2021); James Holland (Jan 15, 2019)
- **Description:** Chrome's zoom-changed popup appears on every page load (and sometimes when selecting text in Google Docs). Developer's workarounds (CSS full zoom, or "let browser manage per-site full zoom") each disable a core feature (per-subdomain zoom levels). Request: suppress popup *without* losing per-domain/subdomain zoom control.
- **Notes:** Long-standing UX trade-off; worth a real fix rather than workaround.

### 10. Google Maps / Keepa overlay: cursor placement inaccurate at non-100% zoom
- **Type:** Bug
- **Priority:** Medium
- **Labels:** bug, cursor, css-zoom, site-compat
- **Reporter(s):** Jeff Statz (Mar 17, 2023)
- **Description:** At 115–125% zoom, Chrome's cursor hit position is offset from the visible pointer on Google Maps and Keepa's Amazon price-graph overlay. Dev suggested disabling "Use CSS full zoom"; confirm whether a proper fix is possible.

### 11. Performance impact with many tabs open
- **Type:** Bug / Performance
- **Priority:** Medium
- **Labels:** performance, scalability
- **Reporter(s):** Gesly George (Dec 1, 2021); related slowdown reports: Zegarmistrz Swiatla (Mar 29, 2019, Vivaldi freeze ~150s with CSS full zoom off), Kirill Lozovatsky (Apr 5, 2018)
- **Description:** Noticeable browser performance degradation, especially with a large number of open tabs. Investigate content-script overhead / dynamic-content observer cost.

### 12. Page unclickable/unresponsive after pressing browser Back
- **Type:** Bug
- **Priority:** High
- **Labels:** bug, bfcache, navigation, recurring
- **Reporter(s):** Jet Notifier (Jan 18, 2022); M B II (Nov 7, 2021, Google search results specifically)
- **Description:** After navigating to a page and pressing Back, the page becomes unresponsive/unclickable. Disabling the extension stops it. M B II notes it's specific to Google search results and that resizing the window "refreshes" and restores clickability — points at a bfcache / overlay re-render issue.

### 13. Conflict with uBlock Origin cosmetic filtering — extension "doesn't work"
- **Type:** Bug / Compatibility
- **Priority:** Medium
- **Labels:** bug, extension-conflict, ublock
- **Reporter(s):** KR (Jun 5, 2020) — note: another user (Visioo) could not reproduce
- **Description:** With uBO "cosmetic filtering" enabled (default), the extension reportedly does nothing; disabling CF fixes it. Investigate interaction; possibly add a docs note.

---

## FEATURE REQUESTS (consolidated)

### 14. Per-site exclusion / white-list & black-list (most-requested)
- **Type:** Feature Request
- **Priority:** High
- **Labels:** feature-request, exclusion-list, top-request
- **Reporter(s):** Trevor Anderson (2025), Laus Bigum (2025), Josh Quillin (2019), root (2019), RJV B (2017), Gelo Elgava (2022, white/black lists for "Apply to dynamic content"), Peter Bacon (2021, global-zoom/disable per-site)
- **Description:** Repeated, long-standing demand for the ability to exclude specific sites entirely and/or maintain white/black lists — both for the extension overall and specifically for the "Apply to dynamic content (better but slower)" option. Would also serve as the workaround for the freeze/crash site-compat bugs.

### 15. Customizable/remappable keyboard shortcuts + shortcuts for min font size
- **Type:** Feature Request
- **Priority:** Medium
- **Labels:** feature-request, shortcuts
- **Reporter(s):** Laus Bigum (2025), Gelo Elgava (2022, hotkeys to increase/decrease "Set minimum Font Size"), RJV B (2017, shortcut to set "auto" as default)
- **Description:** Allow users to remap Ctrl+7/8/9; add hotkeys for minimum font size adjustment; allow setting "auto" zoom level as default / give it a shortcut.

### 16. Font-size unit selection — support 'vw'
- **Type:** Feature Request
- **Priority:** Low
- **Labels:** feature-request, font-size
- **Reporter(s):** Gelo Elgava (Aug 24, 2022)
- **Description:** Add option to choose 'vw' as the font-size measurement unit so font size is independent of page scaling.

### 17. Auto-fit improvements: shrink-to-fit only (don't enlarge), overflow tolerance
- **Type:** Feature Request
- **Priority:** Low
- **Labels:** feature-request, autofit
- **Reporter(s):** Josh Quillin (2019), RJV B (2017)
- **Description:** Option to only shrink pages to fit the window without enlarging smaller pages; configurable "acceptable overflow" so auto level stays at current/100% when ideal is within a small margin (e.g. 98–103%).

### 18. "Zoom everything except text" / fit-to-width via CSS min-width
- **Type:** Feature Request
- **Priority:** Low
- **Labels:** feature-request, zoom-mode
- **Reporter(s):** RJV B (2017)
- **Description:** Request a mode that adjusts layout (e.g. CSS min-width) without shrinking text, similar to old Opera "Fit to width". (Dev previously declined citing UI complexity — re-evaluate.)

### 19. Work on chrome:// and other restricted pages
- **Type:** Feature Request / Won't-fix candidate
- **Priority:** Low
- **Labels:** feature-request, platform-limitation
- **Reporter(s):** Gesly George (Nov 21, 2022)
- **Description:** Request zoom support on chrome:// pages. Likely a platform limitation (extensions can't script chrome:// or the web store) — investigate and document as known limitation.

### 20. Pre-configured / managed deployment
- **Type:** Feature Request
- **Priority:** Low
- **Labels:** feature-request, enterprise, deployment
- **Reporter(s):** Jason Nelson (Feb 4, 2020)
- **Description:** Ability to deploy the extension pre-configured (e.g. per-tab zoom enabled, "reset zoom when loading" disabled) via managed policy.

### 21. Port to Microsoft Edge (legacy) — likely obsolete
- **Type:** Feature Request
- **Priority:** Lowest
- **Labels:** feature-request, browser-port, stale
- **Reporter(s):** Seven Cats (Dec 21, 2017)
- **Description:** Old request to bring extension to (legacy) Edge. Almost certainly obsolete now that Edge is Chromium-based; close or verify it already works on current Edge.

---

## DOCUMENTATION / SUPPORT

### 22. Document how to pin the toolbar icon in Chrome
- **Type:** Docs
- **Priority:** Medium
- **Labels:** docs, onboarding
- **Reporter(s):** Joe P (Jun 8, 2021)
- **Description:** Docs say the icon appears on the toolbar after install with a zoom badge; in Chrome the user must manually pin it. Update install docs to explain pinning so the icon doesn't appear "lost."

### 23. Explain per-site pattern syntax (~, *, >) in options UI
- **Type:** Docs / UX
- **Priority:** Medium
- **Labels:** docs, ux, per-site
- **Reporter(s):** Tal Lavi (Jan 29, 2020)
- **Description:** Users don't understand the per-site/sub-site pattern symbols (`~`, `*`, `>`) or how to set different zoom for different URL paths under the same domain. Add inline help / examples.

### 24. Clarify whether per-tab zoom exists in Chrome and how to enable
- **Type:** Docs / Question
- **Priority:** Low
- **Labels:** docs, per-tab
- **Reporter(s):** Tim Baverstock (Dec 6, 2019)
- **Description:** Docs mention per-tab zooming but a user couldn't find controls in Chrome. Clarify availability and steps.

### 25. Clarify per-site persistence ("Per Site" mode) in docs
- **Type:** Docs
- **Priority:** Low
- **Labels:** docs, zoom-persistence
- **Reporter(s):** Eric D (2017), thad swan (2017) — dev answered "set Zoom Mode to Per Site"
- **Description:** Multiple "zoom not remembered" reports were just the Per-Site mode not being set. Make this clearer in onboarding/docs to cut support volume.

---

## RECURRING REGRESSION WATCH (historically "fixed" but worth a regression test)

> These were marked fixed by the dev in past versions, but the same symptom resurfaced in later years.
> Recommend a regression-test ticket rather than re-opening each old report.

### 26. Zoom level / per-site settings not persisted across reloads & browser restarts
- **Type:** Bug / Regression-watch
- **Priority:** High
- **Labels:** bug, zoom-persistence, regression
- **Reporter(s):** Recurring across years — Muhammad Riaz Raja (2019), Kirill Lozovatsky (2019/2020), Jakab Gipsz (2019), Milton Rodríguez (2020), James Utting / David C Margotta / Michael V / Tony / Andrew / Gelo Elgava / Yuan Wu (Aug 2022 wave — dev says fixed in v31), Christian-style resets in Karas (2023)
- **Description:** Persistent, repeatedly-recurring class of bug: custom zoom/text-zoom/min-font-size not reapplied after page reload, opening links in new tabs, private windows, or browser restart. Each outbreak was patched, but it keeps returning. Recommend a durable regression test suite around persistence (full zoom, text zoom, min font size; normal + incognito; reload + new tab + restart).

### 27. Image-only pages: image flashes then disappears / image zoom stuck
- **Type:** Bug / Regression-watch
- **Priority:** Medium
- **Labels:** bug, image-zoom, regression
- **Reporter(s):** Haggis Smith (Feb 2018), The Dark Smurf (Jun 2018), James Drabb Jr (Dec 2020, Amazon images missing until DevTools opened), Ran (2018, standalone image zoom stopped)
- **Description:** Standalone image pages flash and vanish, or image zoom gets stuck/disabled. Patched multiple times historically; verify current behavior on small-image pages (Wikipedia thumbnails, imgur, Reddit) and Amazon product images.

### 28. White / blank loading flash on page load
- **Type:** Bug / Regression-watch
- **Priority:** Medium
- **Labels:** bug, fouc, white-flash, regression
- **Reporter(s):** Lee Button (Mar & May 2021, Vivaldi/Edge Dev), barbudo 2005 (Jul 2020, Google), Chad (Sep 2022, blank white page — dev says fixed v33.2)
- **Description:** Pages render blank/white briefly (or fully blank until reload) due to the content-script opacity:0 hide-then-show mechanism. Community workaround circulated (commenting out the `html { opacity: 0.0; }` rule). Recurs across browsers/versions; revisit the hide-on-load approach.

### 29. Right+Wheel zoom: scroll gets "stuck" zooming after right-click; touchpad pinch triggers text zoom
- **Type:** Bug / Regression-watch
- **Priority:** Medium
- **Labels:** bug, mouse, touchpad, regression
- **Reporter(s):** David Karlsson (2018, Linux), Bill Shack (2018, trackpad), Augusto Carlos Perez Arriaza (2018), Scott Bruce (2020, pinch triggers text zoom), Alex (2019, RMB+wheel page scrolling)
- **Description:** After right-clicking, mouse wheel becomes stuck in zoom mode (can't scroll until reload); trackpad pinch gestures unintentionally trigger text zoom; RMB+wheel causes unwanted page scroll. Patched in 10.3 with an option to disable Right+Wheel, but pinch-gesture interaction (Scott Bruce 2020) appears unresolved.

### 30. Minimum zoom floor stuck at 25%
- **Type:** Bug
- **Priority:** Low
- **Labels:** bug, zoom-levels
- **Reporter(s):** Ran (Oct 29, 2018)
- **Description:** Custom zoom levels below 25% (down to 1%) are configurable but zoom won't go below 25%. Confirm whether still reproducible.

---

## THIRD-PARTY CONFLICTS (FYI / verify-only)

### 31. Roboform autofill breaks when zoom > 110%
- **Type:** Bug / Third-party conflict
- **Priority:** Low
- **Labels:** extension-conflict, roboform, resolved-upstream
- **Reporter(s):** Marc Ragusa (Dec 2020)
- **Description:** At zoom >110%, Roboform didn't offer autofill / fill icon missing. Reporter notes Roboform shipped v9.1.0.1 fixing it upstream. Verify no residual issue on the extension side; likely close.

### 32. YouTube/media scrubber slider misaligned at zoom
- **Type:** Bug
- **Priority:** Low
- **Labels:** bug, site-compat, youtube, cursor
- **Reporter(s):** Daniel Albu (Dec 2018) — dev said fixed in 13.1.1
- **Description:** Video progress slider click position offset from actual point on YouTube/media sites at zoom. Related to cursor-offset family (see #10). Regression-check.