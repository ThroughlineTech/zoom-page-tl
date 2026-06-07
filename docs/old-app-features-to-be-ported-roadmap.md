# Zoom Page WE -> Zoom Page TL: Feature Roadmap

> This is the verdict doc. It is parallel to the two raw investigation backlogs,
> `old-app-feature-list-investigation.md` (the OLD app's 15 option features) and
> `old-app-feature-list-zoom-levels.md` (its 16 zoom-level values). Those two docs
> enumerate Zoom Page WE's options UI; this doc is the result of investigating
> them: each old-app feature mapped to what Zoom Page TL already does, then a
> focused, tiered roadmap of the gaps worth filling, each written as a virtual
> Plane ticket we can promote later.
>
> Inputs used: the old-app General-tab screenshot, the two investigation docs, the
> triaged real-world demand signal in `chrome-web-store-buglist.md`, and the
> current `extension/` code (`content.js`, `background.js`, `popup.js`,
> `options.js`, `zoom.js`, `manifest.json`). Recommendations are filtered through
> this app's stated philosophy (`HANDOFF.md` section 1): small, fast, per-site
> full-page CSS zoom, no native zoom bubble. We add a feature only when it serves
> that core, or when real-world demand is strong enough to justify a scope
> decision (those are flagged STRATEGIC).
>
> Virtual ticket IDs are "VT-N". They are NOT created in Plane yet. To promote one,
> run `/ticket-new` (or `/tn`) with the title and paste the body. Size is S/M/L
> (matching the HANDOFF backlog convention); priority is Low/Medium/High (matching
> the buglist).
>
> Style: ASCII only, no em/en dashes, straight quotes (repo convention).

---

## 1. The lens: what this app is on purpose

Zoom Page TL is a deliberate subset of Zoom Page WE. Per `HANDOFF.md` section 1,
v1 was scoped to "the one feature the author actually uses: per-site full zoom,"
and the architecture exists to kill the native zoom bubble: browser zoom is held
`disabled` and all zoom is CSS `zoom` on `<html>`. Several old-app options were
not just skipped, they are actively against that architecture (anything that puts
zoom back through `chrome.tabs.setZoom` reintroduces the bubble).

So every recommendation below is judged on three axes:

1. Real demand (does the buglist or common usage show people want it?).
2. Architecture fit (does it work WITH the CSS-zoom / no-bubble design, or fight
   it?).
3. Cost vs the author's "small and fast" goal.

A feature can be popular and still be a decline here if it only makes sense under
browser zoom (the thing we removed) or if its old-app implementation was a
chronic bug source.

---

## 2. Status at a glance

Every old-app feature, mapped. "Verdict" is one of: DONE (already shipped, no
action), ROADMAP (recommended, see section 3), DECLINE (investigated, recommend
against, see section 4), or STRATEGIC (a scope-expanding maybe, see section 3,
Tier C).

| Old-app feature | Current state in Zoom Page TL | Verdict |
|---|---|---|
| 001 Zoom mode: Full Page | The core feature. CSS `zoom` on `<html>`, per host, at `document_start`. | DONE |
| 002 Zoom mode: Page Text | Not supported. Explicit v1 non-goal. | STRATEGIC (VT-9) |
| 003 Zoom mode: Browser | Deliberately removed. Browser zoom is the thing we disable. | DECLINE |
| 004 Default full-page zoom level | `cfg:defaultZoom` global default in Options. | DONE |
| 005 Default page-text zoom level | N/A unless 002 ships. | DECLINE (rides on VT-9) |
| 006 Set zoom per site | The core data model: one `z:<host>` key per hostname. | DONE (+ VT-2 refinement) |
| 007 Set zoom per tab | Not supported. Explicit non-goal. | DECLINE |
| 008 Mouse-wheel zoom (modifier) | Not supported. | ROADMAP (VT-1) |
| 009 Wheel modifier key choice | Not supported. | ROADMAP (folded into VT-1) |
| 010 Keyboard shortcuts to zoom | Ctrl +/-/0 intercept + Alt+Shift+Up/Down/0 commands (rebindable). | DONE (+ VT-5 refinement) |
| 011 Zoom images only | Not supported. Non-goal; historically buggy in ZPWE. | DECLINE |
| 012 Zoom-level indicator / notification | Toolbar badge shows percent. No on-page indicator. | ROADMAP (VT-3) |
| 013 Enable on PDF / local files | Restricted pages degrade to no-zoom. | ROADMAP (VT-4, file:// only; PDF documented) |
| 014 Exclude / disable on listed sites | Done: `x:` Exclude + `p:` Pause + `cfg:off` global. | DONE |
| 015 Toolbar button click action | Always opens the popup (not configurable). | DECLINE |
| ZL-001..016 Zoom-level values (30%-500%) | Ladder spans 25%-500% (17 steps); 8-button preset grid; Options accepts any 25-500. | ROADMAP (VT-8 decision; VT-7 custom entry) |

Net: 5 already shipped (001, 004, 006, 010, 014), plus three screenshot-only DONEs
(AutoFit, CSS full zoom, on-button badge - see 2b). 8 roadmap tickets (VT-1..8),
1 strategic (VT-9), and the rest declined for the reasons in section 4.

### 2b. Reconciling the old-app General-tab screenshot

The two investigation docs enumerate the option tickets and zoom levels, but the
author also supplied a screenshot of ZPWE's General options tab. Several toggles
there are not in the text docs. Each is mapped below; almost all resolve to an
existing verdict, with the net-new items (subsites, reset-on-load, Right-Button+
Wheel) landing on DECLINE and the context-menu submenu promoted to VT-6.

| Screenshot option (General tab) | Maps to | Verdict |
|---|---|---|
| Mode: Per-Site / Per-Tab | 006 / 007 | Per-Site DONE; Per-Tab DECLINE |
| Let browser manage per-site full zoom | 003 | DECLINE (browser zoom = the bubble we kill) |
| Automatically apply AutoFit zoom | our Auto mode (`af:<host>`) | DONE |
| Use Per-Tab zoom when viewing images | 007 + 011 | DECLINE |
| Use CSS full zoom instead of browser full zoom | our only mechanism | DONE (by design; not a toggle here) |
| Treat domain and subdomains as separate sites | 006 | Current behavior; the opt-OUT toggle is VT-2 (eTLD+1) |
| Allow definition of subsites and per-subsite zoom | net-new | DECLINE (subsite trees non-goal; buglist #23 pattern-syntax confusion) |
| Reset zoom level when loading page | net-new | DECLINE (anti-feature under our persist-per-site model) |
| Zoom Type: Full / Text | 002 | STRATEGIC (VT-9) |
| Image Scaling: fit-to-window (both checkboxes) | 011 | DECLINE |
| Show full or text zoom level on button | toolbar badge | DONE |
| Show zoom/font/subsite states on button | toolbar badge | DONE (partial: percent + gray "off") |
| Show add-on submenu on context menu | net-new | ROADMAP (VT-6) |
| Enable Ctrl+7, Ctrl+8, Ctrl+9 shortcuts | 010 | DONE (different keys: Ctrl +/-/0 intercept + Alt+Shift+Up/Down/0) |
| Enable Right-Button+Wheel zoom | net-new | DECLINE (buglist #29 bug magnet; VT-1 is MODIFIER+wheel, never RB+wheel) |
| Use Zoom Levels for Ctrl+Wheel & Pinch zoom | 008 / 009 | ROADMAP (VT-1 covers Ctrl+Wheel; pinch rides along, tested for oversensitivity) |
| Ignore full zoom changes made by browser | by design | N/A (moot: browser zoom is disabled, so there is nothing to ignore) |

---

## 3. Recommended roadmap

Tiered by fit-and-value. Tier A serves the core use case directly; Tier B is
low-effort polish; Tier C is the one strategic (scope-expanding) item.

### Tier A: recommended next

---

#### VT-1: Ctrl + mouse-wheel zoom (with optional modifier choice)
- **Source:** old-app 008 + 009 (mouse-wheel zoom + modifier key); buglist #7 and
  #29 (the cautionary tales).
- **Type:** Feature
- **Size:** M
- **Priority:** Medium (strongest candidate)
- **Depends on:** none (pairs well with VT-3)

**Why.** Ctrl+Wheel is the universal "zoom this" gesture, and it is a uniquely
clean fit for THIS architecture. We already disable browser zoom, so native
Ctrl+Wheel is inert on every page; intercepting it to drive CSS zoom is the exact
same trick the content script already uses for Ctrl +/-/0 (HANDOFF section 5),
with the same payoff (no bubble, instant apply, per-site persistence). The old
app's wheel zoom was a recurring bug source (buglist #29: RMB+wheel got "stuck,"
trackpad pinch triggered text zoom), but every one of those bugs came from
features we should NOT copy (right-button+wheel, text-zoom pinch). A
Ctrl-modifier-only, wheel-only implementation sidesteps all of them.

**Scope / approach.** In `content.js`, add a `wheel` listener (capture phase,
`{ passive: false }`) that, when the modifier is held, calls `preventDefault()`
and steps the per-site factor via `stepFrom` (or a finer continuous map), then
writes `z:<host>` the same way the keyboard path does. Default modifier Ctrl;
fold old-app 009 in as an optional Ctrl/Shift/Alt selector but ship Ctrl-only
first (a single sane default likely suffices). Respect the suppression flags
(off everywhere / excluded / paused -> do nothing, let the browser have it).
Make it an Options toggle; recommended default ON (the gesture is universally
expected and native Ctrl+Wheel is already inert here), shipping OFF-first only if
early feedback shows surprise.

**Acceptance criteria.**
- Ctrl+Wheel up/down steps the per-site zoom and persists it; no native zoom bubble.
- Plain wheel still scrolls normally; the gesture is debounced so one notch = one step.
- A toggle disables the gesture entirely (addresses buglist #7's "cannot fully disable").
- Playwright coverage driving a synthetic ctrl+wheel event and asserting the reflow,
  plus the disable toggle; a manual-checklist line for real trackpad pinch.

**Risks / notes.** Wheel zoom was ZPWE's biggest bug source: sticky after
right-click, trackpad pinch firing it, conflicts with other extensions (buglist
#29, #7). Avoid those traps: bind ONLY modifier+wheel (never right-click+wheel),
keep it cleanly toggleable, and do not touch pinch/gesture events directly. Note
that Chromium trackpad pinch arrives as `wheel` with `ctrlKey:true`, so this
naturally also covers pinch-zoom - a bonus, but test it for oversensitivity.

---

#### VT-2: Optional "apply zoom to whole domain" (eTLD+1 grouping)
- **Source:** old-app 006 / "treat domain and subdomains as separate sites" (the
  inverse option); buglist #23 (per-site pattern syntax confusion); HANDOFF
  backlog item 2 (already independently identified, OPEN).
- **Type:** Feature
- **Size:** M
- **Priority:** Medium
- **Depends on:** none

**Why.** Today keying is by full `location.hostname`, so `mail.google.com`,
`docs.google.com`, and `www.google.com` are three independent sites you must zoom
separately. Anyone who lives in a multi-subdomain product (Google, Atlassian,
regional Amazon/Wikipedia, internal corp tools) or hits `www`/`m`/`amp` variants
re-sets the same zoom over and over. The old app exposed this via a confusing
`~ * >` pattern syntax (buglist #23); a single opt-in toggle is the clean version
of the same idea, and it is already on our own backlog.

**Scope / approach.** Add an Options toggle "Apply zoom to whole domain (group
subdomains)", default OFF to preserve current behavior. When on, resolve the
storage key to the registrable domain (eTLD+1) instead of the full hostname, in
every reader (`content.js`, `background.js getFactor`, popup, options manager).
Bundle a static public-suffix list (PSL); do NOT fetch at runtime (MV3 forbids
remote code). Migration: existing per-subdomain keys stay valid; prefer an exact
`z:<host>` match over the collapsed key, or offer a one-time "collapse existing"
action.

**Acceptance criteria.**
- Toggle present in Options, defaults off; current per-hostname behavior unchanged when off.
- With it on, setting `mail.google.com` to 150% also applies to `docs.google.com`.
- An exact per-host key takes precedence over the collapsed key.
- PSL handles multi-part suffixes correctly (`bbc.co.uk`, not `co.uk`).
- Playwright coverage for both modes, the exact-over-collapsed precedence, and at
  least one multi-part-suffix case.

**Risks / notes.** PSL adds bundle weight (keep a trimmed copy). Key resolution
now has two modes, so every read site must agree. Subtle UX: users who
deliberately want per-subdomain control must be able to keep it (hence default off).

### Tier B: low-effort polish

---

#### VT-3: On-page zoom-level indicator (transient toast)
- **Source:** old-app 012; buglist #22 (icon not pinned -> badge invisible).
- **Type:** Feature
- **Size:** S
- **Priority:** Low to Medium
- **Depends on:** none (most valuable alongside VT-1 wheel zoom)

**Why.** Because we disabled the native zoom bubble, there is no on-page feedback
when zoom changes via keyboard or (if shipped) Ctrl+Wheel; only the toolbar badge
moves, and the badge is easy to miss - many users never pin the icon (buglist
#22). A brief on-page "150%" toast on zoom change gives the feedback the native
bubble used to, without its downsides (it is ours, it never blocks, it fades). It
matters most when zooming rapidly by keyboard or wheel, so it pairs naturally
with VT-1.

**Scope / approach.** On a zoom change, `content.js` shows a small fixed-position,
`pointer-events:none` overlay (corner) with the percent, auto-dismissing after
~1s. Render it inside a shadow DOM so page CSS cannot style it, and ensure it is
itself unaffected by the page zoom (counter-scale or render outside the zoomed
subtree). Create it lazily on the first zoom change, not at load. Make it an
Options toggle; default is a product call (likely ON, with an easy off).

**Acceptance criteria.**
- Changing zoom (preset, stepper, keys, wheel) shows the new percent briefly, then fades.
- The overlay does not shift page layout and is not itself scaled by the page zoom.
- A toggle turns it off.
- Playwright coverage that the overlay appears on change and auto-removes.

**Risks / notes.** Must not collide with site CSS (shadow DOM) or break on sites
that mutate the DOM aggressively. Injecting DOM into every page is exactly the
overhead the design avoids - keep it lazy and trivial (no per-frame work, just
show/timeout).

---

#### VT-4: Enable zoom on local files (file://), and document the PDF limitation
- **Source:** old-app 013 ("Enable on PDF / local files"); buglist #19 (chrome:// /
  restricted pages).
- **Type:** Feature + Docs
- **Size:** S to M
- **Priority:** Low to Medium
- **Depends on:** none

**Why.** The investigation ticket lumps two very different things together; they
should be split:
- **Local files (file://):** feasible. A content script CAN run on `file://` once
  the user grants "Allow access to file URLs" on the extension's details page.
  Local HTML files then zoom like any page - a real, cheap win for anyone who
  opens saved pages or local docs.
- **The built-in PDF viewer / chrome:// pages:** NOT feasible via CSS zoom. It is
  a restricted, embedded plugin surface where content scripts do not run and
  `setZoomSettings` rejects (HANDOFF section 8). Document as a known limitation,
  do not attempt.

**Scope / approach.** Confirm the manifest match patterns cover `file://` (or add
it), and that storage keying behaves for file origins. `location.hostname` is
empty for `file://`, so pick a stable key (e.g. a single `file://` bucket, or a
`file:` sentinel) and document whether all local files share one level. Add an
Options hint explaining the one-time "Allow access to file URLs" step (we cannot
flip it for the user); optionally detect a `file://` tab in the popup and show the
hint inline. Add a short "Known limitations" note (README + Options) covering the
PDF viewer and chrome:// pages.

**Acceptance criteria.**
- With file-URL access granted, a local `.html` file zooms and remembers its level.
- Clear docs on the one-time permission and on the PDF/chrome:// limitation.
- A test if the harness can serve a `file://` origin; otherwise a manual-checklist line.

**Risks / notes.** Do not let every local file collapse onto the same accidental
key unless that is the intended design. Do not request any new broad permission
for this; it is a user-side toggle. Low ceiling on value, but low effort and
closes a recurring "why no zoom here" question.

---

#### VT-5: Keyboard shortcuts - make the Ctrl +/-/0 intercept optional, and surface remapping
- **Source:** old-app 010; buglist #2 and #15 (users want REMAPPABLE shortcuts;
  Ctrl+7/8/9 collide with other apps), #7 (cannot disable).
- **Type:** Feature + Docs
- **Size:** S to M
- **Priority:** Low to Medium
- **Depends on:** none

**Why.** We already beat the old app's main complaint: the Alt+Shift+Up/Down/0
commands are rebindable at `chrome://extensions/shortcuts`. Two gaps remain, and
they fold into one ticket because they are the same surface:
- **(A) The page-level Ctrl +/-/0 intercept is not rebindable or escapable.** Some
  users want native Ctrl+/- back on a given setup without pausing the whole site.
  Old-app reporters repeatedly asked to remap shortcuts that collided with other
  tools (buglist #2, #15) and to be able to disable them (#7).
- **(B) `zoom-autofit` and `toggle-global` ship with NO default key** (by design,
  to stay under Chrome's 4-default-key limit), so users do not know they can bind
  them, and there is no in-product pointer to the shortcuts page.

**Scope / approach.**
- (A) Add an Options toggle "Intercept Ctrl +/-/0" (default ON = current
  behavior). When off, the content script does not `preventDefault` those keys, so
  native zoom returns (or nothing happens, since browser zoom may be disabled)
  while the extension still works via the Alt+Shift commands, popup, and (if
  shipped) wheel.
- (B) Add an Options/popup pointer to `chrome://extensions/shortcuts` (extensions
  cannot open `chrome://` directly, so present it as copyable text or a documented
  step). Document all five commands and which carry default keys. If we want one
  more default-keyed command, we are at the 3-of-4 limit and could promote AutoFit
  to the 4th slot - decide explicitly.

**Acceptance criteria.**
- Toggle present; with it off, Ctrl+/- do Chrome-native zoom (or nothing) and the
  extension's other inputs still work.
- README/Options text explains the remapping path and lists all five commands.
- Playwright coverage for the intercept-on vs intercept-off branch.

**Risks / notes.** Keep the default ON so existing muscle memory is unchanged. A
per-site Pause already returns native Ctrl+/-; the toggle is the global,
deliberate version. Do NOT bind anything to Ctrl+number defaults - those are the
exact collisions users complained about (buglist #2).

---

#### VT-6: Context-menu zoom actions
- **Source:** old-app "Show add-on submenu on context menu" (screenshot); buglist
  #22 (users cannot find the toolbar icon).
- **Type:** Feature
- **Size:** S
- **Priority:** Low
- **Depends on:** none

**Why.** A right-click submenu (Zoom in / Zoom out / Reset / Fit width / Pause
here / Exclude here) is a low-cost convenience that matches the old app and gives
a discoverable path for users who never pin the toolbar icon (buglist #22 is
literally "users cannot find the icon"). It reuses code paths that already exist
(the command handlers in `background.js`).

**Scope / approach.** Add the `contextMenus` permission, register a small menu
tree in `background.js`, and route each item to the existing factor-stepping /
flag-setting logic. Respect suppression (grey or no-op on excluded/off sites).
Keep the submenu short.

**Acceptance criteria.**
- A right-click submenu performs zoom in/out/reset/fit and per-site pause/exclude,
  wired to the existing handlers.
- The menu stays in sync with the master switch and per-site flags (no-op on
  suppressed sites).
- A manual-checklist line (context menus are not easily Playwright-driven).

**Risks / notes.** Adds one permission (`contextMenus`) and a little menu clutter
to a deliberately small extension. Keep it short and tied to existing logic.

---

#### VT-7: Custom zoom entry in the popup
- **Source:** old-app zoom-level set (ZL-001..016) and the per-level
  investigation; see VT-8 and section 5.
- **Type:** Feature
- **Size:** S
- **Priority:** Low (optional polish)
- **Depends on:** none

**Why.** The per-level investigation collapses to "we already offer the whole
range" (VT-8 / section 5). The one genuine gap it surfaces is entry, not coverage:
the Options page accepts any custom value (25-500), but the popup only offers 8
fixed presets plus the stepper ladder. A power user who wants, say, 138% from the
popup has to use the Options page. A small editable percent field would close that
without adding any new levels.

**Scope / approach.** Make the popup percent readout editable (or add a tiny
number input) that writes an arbitrary clamped factor to `z:<host>`, reusing the
existing clamp/persist path. Keep the preset grid as the primary path.

**Acceptance criteria.**
- Typing a value in the popup sets and persists an arbitrary clamped factor.
- Out-of-range entries clamp to `[0.25, 5.0]`.
- A test covering the editable entry and clamping.

**Risks / notes.** Minor. Do not expand the preset grid itself (the ladder +
custom entry already cover everything).

---

#### VT-8: Finalize the preset zoom-level set, range, and granularity (one verdict for ZL-001..016)
- **Source:** old-app zoom-levels doc ZL-001 through ZL-016; buglist #30 (floor
  stuck at 25%).
- **Type:** Chore / Design
- **Size:** S
- **Priority:** Low
- **Depends on:** none

**Why.** The 16 per-value "investigate this zoom level" tickets are really ONE
decision: what level menu do we offer. The current ladder (`ZOOM_STEPS` in
`zoom.js`) is:

```
0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0
```

This already covers every value the old app offered (it used 30% where we use
33%, and we additionally offer 25%), and the Options page accepts any custom value
25-500. The popup preset grid (`PRESETS` in `popup.js`) exposes 8 of them (75, 90,
100, 110, 125, 150, 175, 200). So there is no per-value work to do - just confirm
the set and close the 16 tickets as a group.

**Scope / approach.** Confirm/adjust three things and write down the rationale:
1. Floor: current 25% vs the old app's 30% (and buglist #30, floor "stuck" at
   25%). Decide the real minimum and make it consistent between the ladder and any
   clamp. (The old app's sub-25% bug is buglist #30 - not something to reproduce.)
2. Preset grid: is the 8-value comfort range right, or add a couple (e.g. 50%,
   250%)? (Custom free entry is VT-7, not here.)
3. Top end: 500% is fine to keep; confirm clamp `[0.25, 5.0]` is the intended
   ceiling.

**Acceptance criteria.**
- One short decision note (in HANDOFF or this doc) recording the chosen floor,
  preset set, and ceiling, with reasons - replacing the 16 per-value
  investigations.
- Any change to `ZOOM_STEPS` / `PRESETS` / clamps is consistent across popup,
  content script, and background, with tests updated.

**Risks / notes.** Mostly a documentation/decision task. Only touch code if the
floor or preset set actually changes.

### Tier C: strategic (scope-expanding) - decide product direction first

---

#### VT-9: Text-only zoom mode (spike first; and its default level)
- **Source:** old-app 002 + 005 (Zoom Page Text + its default level); buglist #15
  (min-font-size hotkeys), #16 (vw font unit), #18 ("zoom everything except text" /
  fit-to-width without shrinking text).
- **Type:** Spike -> Feature (large)
- **Size:** L
- **Priority:** Low (gated on a product decision)
- **Depends on:** a decision to broaden the product beyond full-page zoom

**Why it is here and not in Tier A/B.** Text-only zoom is the single largest
old-app capability we dropped, and it has the most real-world demand of any
declined feature (three separate buglist threads touch text/font sizing). It is a
genuine accessibility feature: some users want larger TEXT without reflowing the
whole layout. BUT it is a different axis from full-page zoom: it adds a second
zoom dimension, a second per-site value, more UI, and a class of layout-breakage
the current app deliberately avoids. CSS-based text zoom (scaling font-size, or a
min-font-size pass) is breakage-prone in a way full-page `zoom` is not. HANDOFF
section 1 lists text zoom as an explicit non-goal ("scoped to the one feature the
author actually uses"). So this is not a quick win - it is a decision about
whether Zoom Page TL stays a focused full-page tool or grows into a general
accessibility/readability tool. Treat it as a SPIKE first.

**Scope (spike).** Prototype text scaling via an injected stylesheet (e.g. scaling
`font-size` on text-bearing elements, or a min-font-size floor), measure breakage
on 4-5 real sites, and write up keep/drop with the cost. Only if the spike is
convincing does this become a real "add a per-site Full vs Text type" feature -
which then also pulls in old-app 005 (the text default level, `cfg:defaultTextZoom`)
and the min-font-size / vw-unit requests (buglist #15, #16, #18).

**Deliverable (spike).** A short report (in the ticket) with screenshots of the
prototype on 4-5 real sites and a clear keep/drop recommendation. No production
code until that lands.

**Risks / notes.** Reintroduces the "two zoom types" complexity the rewrite
removed; doubles parts of the data model (a per-site type, plus a text default).
Easy to half-ship something that breaks more than it helps. Keep it gated behind
the spike. Recommend NOT starting until the product-direction question is answered.

---

## 4. Considered but declined (with reasons)

These old-app features were investigated and are recommended AGAINST, to keep the
app small and true to its design. Documented so the decision is not re-litigated.

- **003 Zoom mode: Browser** (incl. screenshot "Let browser manage per-site full
  zoom" / "Use CSS full zoom instead of browser full zoom"). The entire reason this
  app exists is to avoid browser zoom: any `chrome.tabs.setZoom` call flashes the
  native zoom bubble (HANDOFF section 3.1), and we pin browser zoom to `disabled`.
  The legitimate need behind it ("on THIS site I want normal browser zoom") is
  already served by Pause and Exclude, which hand the tab back to `"automatic"` and
  let native Ctrl +/- work. Re-adding a browser-zoom mode would reintroduce the bug
  the rewrite was built to kill. Decline.
- **007 Set zoom per tab.** Conflicts with the per-site mental model and storage
  design, was an explicit v1 non-goal (HANDOFF section 1), and serves a niche
  (buglist #24 was just docs confusion about whether it existed). Per-tab state is
  also awkward under the MV3 ephemeral-worker design, and Chrome's per-tab zoom
  routes through the bubble-prone API. If a "temporary, this-tab-only, not
  persisted" zoom is ever wanted, treat it as a fresh small feature, not a port.
  Decline.
- **011 Zoom images only / image fit-to-window** (incl. screenshot "Use Per-Tab
  zoom when viewing images" + the "Image Scaling" section). Explicit non-goal,
  niche (standalone image tabs, comics, galleries), and historically ZPWE's single
  largest bug cluster (buglist #27: images flash then vanish, image zoom stuck,
  Amazon images missing until DevTools opens). High maintenance, low fit. Revisit
  only with a specific, well-scoped ask. Decline.
- **015 Toolbar button click action.** Configuring whether the button opens the
  popup vs zooms in/out/reset is low value - the popup IS the control surface, and
  click-to-open is the universal expectation. The keyboard/command paths already
  cover quick in/out/reset, and VT-6 (context menu) is a better way to add quick
  actions. Decline (revisit only if user feedback asks for it).
- **005 Default page-text zoom level.** Only meaningful if text-only zoom (002)
  ships; it rides on VT-9 and is not a standalone item. Decline for now.
- **Subsites / per-subsite (path-based) zoom (screenshot).** ZPWE let you define
  different zoom for different URL paths under one domain via a `~ * >` pattern
  syntax that users found confusing (buglist #23). Subsite trees are an explicit
  non-goal; per-host keying plus the optional eTLD+1 grouping (VT-2) covers the
  realistic cases without the syntax. A lot of surface for a niche audience.
  Decline.
- **Reset zoom level when loading page (screenshot).** Anti-feature for us. Our
  entire value proposition is that per-site zoom PERSISTS across loads; zoom is
  stored per site and reapplied at `document_start`. A "reset on load" toggle is a
  way to opt OUT of persistence; Pause/Exclude already cover "stop zooming this
  site," and the user who wants a page at 100% can set it. Decline.
- **Right-Button+Wheel zoom (screenshot).** Buglist #29 documents this as ZPWE's
  most persistent bug source: wheel sticks in zoom mode after a right-click,
  trackpad pinch mis-fires it, RMB+wheel causes unwanted scroll - patched
  repeatedly, never fully settled. VT-1 delivers the wheel-zoom value via a
  modifier key (Ctrl), never the right button. Decline the RMB variant specifically.
- **Ignore full zoom changes made by browser (screenshot).** N/A. We hold browser
  zoom `disabled`, so the browser cannot make full-zoom changes for us to ignore.
  The option only makes sense under browser-zoom mode, which we do not have.
- **Font-size unit 'vw' (buglist #16) and min-font-size (buglist #15).** Defer into
  VT-9. These are facets of the text-zoom question; do not pursue independently
  before the text-zoom spike decides whether we are in that business at all.

---

## 5. Zoom-level investigation: one verdict for all 16 tickets

The per-level investigation (`old-app-feature-list-zoom-levels.md`, ZL-001..016)
does not need 16 separate tickets. The current `ZOOM_STEPS` ladder is:

```
0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0
```

This already covers every value the old app offered (it used 30% where we use 33%,
and we additionally offer 25%), and the Options page accepts any custom value from
25% to 500%. So:

- **Coverage:** KEEP all levels. There is no missing or redundant step worth
  changing; the ladder is a reasonable geometric progression around the 100%
  anchor.
- **Floor:** Our floor is 25% (matching the old app's effective floor; the old
  app's sub-25% bug was buglist #30 - not something to reproduce).
- **Actionable items:** the level-menu confirmation/decision is VT-8; the only
  genuine feature gap (entry convenience in the popup) is VT-7. No per-level
  add/remove tickets are recommended.

---

## 6. Adjacent items (not from the old-app feature list)

For completeness, two items already on our own backlog that relate to "per-site
memory" but are not old-app options, so they are not ticketed here:

- **storage.sync** (HANDOFF backlog item 5, OPEN): sync per-site levels across the
  user's signed-in Chrome instances. Adjacent to old-app 006 / VT-2.
- **Zero-flash hardening** (HANDOFF backlog item 6, PARTLY ADDRESSED): relevant if
  first-paint flash is ever observed; see HANDOFF for why the obvious approaches
  were reverted.

---

## 7. Suggested sequencing

If we pick this up, a sensible order:

1. **VT-1 (Ctrl+Wheel zoom)** - highest value-to-fit ratio; leans directly on the
   existing Ctrl +/-/0 code path.
2. **VT-3 (on-page indicator)** - small, and it makes VT-1 feel finished (live
   feedback while scrolling).
3. **VT-2 (eTLD+1 grouping)** - removes a real recurring annoyance; already on our
   backlog.
4. **VT-5 / VT-6 / VT-7** - small polish items, any order.
5. **VT-4 (file:// + PDF doc)** - cheap win plus a docs cleanup.
6. **VT-8 (zoom-level verdict)** - a decision note; can be done anytime.
7. **VT-9 (text-zoom spike)** - largest and least certain; gate on the spike before
   committing.

Everything in section 4 stays declined unless a specific user ask reopens it.

---

## 8. How to turn these into real tickets

1. Pick a VT to promote.
2. `/ticket-new "<title>"` (or `/tn`), then paste the body (Why / Scope /
   Acceptance / Risks) into the ticket.
3. Set size and priority from the VT header.
4. For VT-1 (wheel zoom) read buglist #7 and #29 first - they are the failure modes
   to design around.
5. VT-8 can be closed as a single decision note rather than 16 separate
   investigations.

Suggested first two: **VT-1 (Ctrl+Wheel zoom)** - it extends an input path the app
already owns, with a high convenience payoff if the known wheel-zoom traps are
avoided; and **VT-2 (eTLD+1 grouping)** - it is already on our backlog and removes
real, repeated config friction.

---

_Sources: the two `old-app-feature-list-*.md` docs (which enumerate ZPWE's
investigation tickets and zoom levels), the triaged `chrome-web-store-buglist.md`,
the current `extension/` source, and a reference screenshot of ZPWE's General
options tab supplied by the author. The screenshot is reconciled in section 2b;
every option it shows is accounted for there. If a later screenshot of the Zoom
Levels or Per-Site Data tabs surfaces options not captured here, send it and the
missing items will be folded in._
