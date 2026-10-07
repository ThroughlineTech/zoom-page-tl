# AGENTS.md - Working on Zoom Page TL

These are instructions for coding and reviewing agents. Read this file at the start of work. The purpose of the product is fixed (below); do not rewrite it to justify a convenient implementation.

## Read the right sources

Before searching implementation code, read the [state-of-the-system index](docs/state-of-the-system/00-README.md), then the numbered sections relevant to the task. Use the [source inventory](docs/state-of-the-system/11-source-inventory.md) to find the owning file and the focused spec. Start code inspection there; broaden to repository-wide searches only when those references leave a concrete question unanswered. Verify behavior against the code and correct stale documentation when you find it.

For the affected area, read only the relevant additional references:

- **Why the code is shaped this way** (CSS zoom, disabled browser zoom, what was tried and reverted): [01 - Architecture and design](docs/state-of-the-system/01-architecture-and-design.md).
- **Chrome zoom/tabs/commands API behavior:** [chrome-zoom-api-reference.md](docs/chrome-zoom-api-reference.md). It is researched; do not re-derive it.
- **Storage keys and the data model:** [03 - Storage and state](docs/state-of-the-system/03-storage-and-state.md).
- **What to build next, and what was deliberately declined:** [roadmap.md](docs/roadmap.md). Real-world demand behind it is in [zpwe-feedback-triage.md](docs/zpwe-feedback-triage.md).
- **Chrome Web Store submission and privacy claims:** [store/listing.md](store/listing.md) and [PRIVACY.md](PRIVACY.md).

Use [README.md](README.md) and `package.json` for user-facing behavior and commands. Follow parent instructions (`~/src/AGENTS.md`) too. Keep one canonical reference for each purpose.

## What this product is

A small, fast Manifest V3 Chrome extension that applies **per-site full-page zoom** and **never triggers Chrome's native zoom bubble**. It is an independent MIT rewrite, in spirit, of the unmaintained "Zoom Page WE" (GPLv2), scoped to the one feature the author uses.

**A site has a level -> the level is applied before first paint -> it stays put -> the browser's own zoom never interferes.**

Text-only zoom, per-tab zoom, subsite trees and image zoom are non-goals unless the owner changes scope ([roadmap.md](docs/roadmap.md) section 4 records why). Pause and Exclude are the escape hatch for sites that misbehave; they are not a reason to add a browser-zoom mode.

## Invariants (do not break these silently)

- **Never call `chrome.tabs.setZoom`.** The no-bubble guarantee depends on browser zoom staying `disabled` and all zoom being CSS `zoom` on `<html>`. The only exception is suppressed sites (`cfg:off`, `x:`, `p:`), which are deliberately handed back to `"automatic"`.
- **One actor owns the zoom on the page: `content.js`.** A service-worker pre-paint stylesheet was tried and reverted because two async actors raced. If you revisit zero-flash hardening, read the design doc first.
- **100% is the absence of a key.** Setting any level to 100% removes `z:<host>` (and the same for `cfg:defaultZoom`, `cfg:zoomMin`, `cfg:zoomMax`). A site with no key follows the global default. Preserve this unless you are deliberately changing the model, with tests.
- **Keying is `location.hostname`.** Subdomains are independent; http and https share a key.
- **The service worker is ephemeral.** Re-read `chrome.storage` on each event; hold no long-lived state.
- **No remote code, no network requests, no telemetry.** PRIVACY.md and the store listing promise this. Any new permission or data category must update both, and is an owner decision.
- **Licensing.** Do not paste Zoom Page WE source into this repo; reimplement from behavior. A local ZPWE copy, if present, lives in git-ignored `reference/` and is read-only.
- **ASCII only** in code, docs and commits (parent rule): plain hyphens, straight quotes.

## Before implementing

Inspect the working tree. Preserve the owner's edits and other agents' work. State the change in one sentence: what the user does, what changes on the page, what they see next. For a bug, reproduce it first and, where it can be reduced to a localhost page, write a failing Playwright test before fixing it. Some site-specific bugs cannot be reduced; say which part is covered by automation and which only by a dev-browser screenshot or manual check.

Implement the smallest complete change. Read before writing and match the surrounding style. Keep the per-host storage model and the 100%-means-absent convention.

## Prove it

Every change gets at least one test that would fail without it, in the matching `tests/<topic>.spec.js` (or a new one). `npm run lint` and `npm test` must both pass before handing back. Do not hand back a red or skipped test without calling it out.

**Do not run `npm test` while the dev browser is running.** The headed dev Chromium starves the runner and timing-sensitive tests flake, a different one each run. Stop the dev browser, run the suite clean, then relaunch. A genuine regression fails the same test every time in isolation; re-run a suspect alone before believing it.

The harness cannot reach the native zoom bubble itself (it asserts browser zoom `disabled` as the proxy), global hotkey dispatch (`chrome.commands`), real file dialogs, first-paint flash, or visual correctness on real sites. Those are always manual checks.

## The live dev browser

The owner confirms fixes by eye in a headed Chromium that hot-reloads `extension/` on save. Start it in the background once per session, **always with uBlock Origin loaded** (a bare `npm run dev` drops it, because the launcher disables every extension not named on the command line):

```
ZP_DEV_EXTRA_EXTENSIONS='C:\Users\fubar\src\Tools\uBlock0.chromium' npm run dev [-- <repro-url>]
```

`npm run shot -- <url> [out.png]` screenshots a page in that window (read the PNG to compare with the owner's picture); `npm run reload` forces a reload after a checkout or stash. One instance per session (profile lock and CDP port 9222). If a stopped launcher leaves an orphaned Chromium, close it over CDP, delete `.dev-profile/Singleton*`, and relaunch; the exact commands are in [08 - Dev tooling](docs/state-of-the-system/08-dev-tooling.md).

## Hand back a review checklist

The owner is the final reviewer. After each change, hand back a checklist specific to that change:

```
## Review checklist: <feature or bug>

Automated (already verified by `npm test` + `npm run lint`):
- [x] <assertion that proves the change>
- [x] Full suite green (N/N), lint green

Manual (please verify - automation cannot reach these):
- [ ] <the new user-facing behavior: exact steps, expected result, in the dev window>
- [ ] <anything touching the zoom bubble, hotkeys or file dialogs>
- [ ] Regression: <the closest existing behavior this could have broken>
```

Only put things under Manual that automation genuinely cannot reach.

## Shipping boundaries

Commit only when asked: `topic: short description`, no Claude branding. Do not push, merge, build a release zip for submission, or submit to the Chrome Web Store without an explicit instruction. A release bumps `version` in both `extension/manifest.json` and `package.json`; `npm run build` names the zip from the manifest. Store updates go through Google review, so batch them deliberately.

## Leave the next agent oriented

Update the affected [state-of-the-system](docs/state-of-the-system/00-README.md) sections in the same change whenever behavior, storage keys, commands, messages, files or verification boundaries change; update the source inventory when files move. Update README.md when user-facing behavior changes, and mark roadmap items done in [roadmap.md](docs/roadmap.md). This repo has no ticket tracker configured (no `.build/config.toml`); roadmap items are virtual tickets until the owner promotes them.

Keep backlog and status in the roadmap, current behavior in state-of-the-system, and working rules here. Do not recreate HANDOFF files.

**Your job is not to port every Zoom Page WE option. It is to keep per-site zoom fast, sticky and bubble-free.**
