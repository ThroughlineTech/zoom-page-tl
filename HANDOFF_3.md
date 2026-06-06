# Zoom Page TL: Engineering Handoff 3 (live dev browser + bug-fix flow)

This is the third handoff. Read the other two first:

- `HANDOFF.md` - the design brief: goal, root-cause analysis, Chrome API behavior,
  data model, backlog. Read before changing core behavior.
- `HANDOFF_2.md` - the working manual: repo orientation, the test harness, the
  development loop, conventions and gotchas.

This file adds the one piece those two were missing: a way to put a fix in front of
the author so they can confirm it by eye. It documents the "live dev browser"
(auto-deploy to a real Chromium window) and the end-to-end bug-fix flow that uses it.

Style, as everywhere in this repo: ASCII only. No em dashes, no en dashes, no curly
quotes. Plain hyphens and straight quotes.

## 1. The flow this enables

The author is the final reviewer and wants to confirm a fix visually, not just trust
a green test run. The target loop:

> Author: "this thing isn't working right <description>", pastes a URL and a picture
> of what it looks like. The agent investigates, writes a failing test, fixes it,
> proves it with Playwright, commits with a message, and the fix is ALREADY LIVE in
> a Chromium window the author is watching. The author hits refresh and says "yep."

The missing piece was the last step: get the edited extension into a real browser
without the author clicking "reload" on chrome://extensions every time. That is what
the live dev browser does.

## 2. The live dev browser (auto-deploy)

A headed Chromium window, loaded with the unpacked extension, that hot-reloads on
every save. Built on Playwright (already a dev dependency), so it reuses the same
machinery the test harness uses to load the extension.

### Commands

```
npm run dev                         # open the dev window (about:blank)
npm run dev -- https://site/page    # open it straight to a repro URL
npm run reload                      # force a hot reload (fallback; see below)
npm run shot -- https://site/page [outfile]   # screenshot a URL in the dev browser
```

Start `npm run dev` once per working session (run it in the background; it holds the
browser open). While it runs, the agent just edits files under `extension/` as usual
and the window updates itself.

### What happens on a save

`scripts/dev-browser.js` watches `extension/` with a debounced `fs.watch`. On a
change it:

1. calls `chrome.runtime.reload()` in the extension's service worker, which makes
   Chromium re-read the unpacked extension from disk (manifest, background, popup,
   options, content script), and
2. reloads every open tab, so the new `content.js` runs on the page the author is
   looking at.

So a fix is live within a second of the agent saving it. No manual reload, no
chrome://extensions click. By the time the agent says "have a look," the window
already shows the fix; the author can also just hit refresh to be sure.

### Files (all new this session, all under scripts/)

- `scripts/dev-lib.js` - shared helpers: resolves the browser executable, the launch
  flags, and the `hotReload(context)` routine (reload extension + refresh tabs).
- `scripts/dev-browser.js` - the long-lived launcher + file watcher. This is the
  window the author watches.
- `scripts/dev-reload.js` - connects over CDP and forces one hot reload. Fallback for
  when a save did not register, or after a `git checkout`/`stash` changed files on
  disk without an editor save.
- `scripts/dev-shot.js` - connects over CDP, opens a temp tab, navigates to a URL,
  screenshots it (with the extension applied), and closes the tab. This is how the
  agent reproduces a "here is a picture" report and compares before/after.

Also: `package.json` gained `dev` / `reload` / `shot` scripts; `.gitignore` gained
`.dev-profile/` and `.dev-shots/`.

### Design decisions (and why)

- Browser: the author's standalone Chromium at
  `%LOCALAPPDATA%\Chromium\Application\chrome.exe`, via Playwright's `executablePath`.
  This matches "my chromium" and gives real-world fidelity. `dev-lib.js` falls back to
  Playwright's bundled Chromium (`channel: "chromium"`) on a machine that lacks the
  standalone build, so the scripts still work on a fresh checkout.
- Profile: a dedicated, persistent `.dev-profile/` in the repo (git-ignored). It is
  isolated from the author's real browsing, so the agent can reload/close it freely
  and never touches live tabs or logins. Because it persists, logging in to a site
  once (for a login-gated repro like chatgpt.com) sticks across reloads and restarts.
- Auto-reload on save (not an explicit deploy step): chosen so the author does
  nothing. `npm run reload` exists as a fallback only.
- Nothing dev-only ships in `extension/`. Hot reload is driven entirely from outside
  the extension (the service worker's own `chrome.runtime.reload`, triggered over
  Playwright/CDP). The shipped extension has no reload/watch code in it.
- Fixed CDP port (9222, override with `ZP_DEV_PORT`) so `reload` and `shot` can
  attach to the running window from a separate short-lived process.

## 3. The bug-fix flow, step by step

When the author pastes a report ("X is broken", a URL, a picture):

1. Make sure the dev browser is up. If `npm run dev` is not already running this
   session, start it in the background (optionally pointed at the repro URL).
2. Reproduce. Look at the pasted picture. Run `npm run shot -- <url>` and Read the
   PNG to see what the extension actually does on that page right now. Compare. State
   the bug in one sentence (HANDOFF_2 section 5, step 1).
3. Write a failing Playwright test that reproduces the behavior, in the matching spec
   or a new `tests/<topic>.spec.js`. See HANDOFF_2 section 6 for the harness and the
   copy-paste patterns. (Some site-specific bugs cannot be reduced to a localhost test
   page; if so, say which part is covered by automation and which is shot/manual only.)
4. Fix it. Read before writing; match the surrounding style; keep the per-host storage
   model and the "100% == absence of a key" convention (HANDOFF_2 section 8) unless
   deliberately changing it. The watcher reloads the dev window as you save.
5. Make it green: `npm run lint` and `npm test` both pass. Do not hand back a red or
   skipped test without calling it out.
6. Update docs if behavior, data model, or the file map changed (HANDOFF.md, and
   README.md if user-facing). Mark any closed backlog item DONE.
7. Commit when asked, message `topic: short description` (or `TKT-ID: ...`). No Claude
   branding. Branch off `main`; do not push or merge without an explicit instruction.
8. Hand back the review checklist (HANDOFF_2 section 7): Automated (already verified)
   vs Manual (please verify). The fix is already live in the dev window; tell the
   author what to click and what they should see, then let them confirm.

## 4. Conventions, gotchas, limits

- One dev browser per session. A second `npm run dev` collides on the profile's
  singleton lock and on CDP port 9222. If `reload`/`shot` report "could not connect,"
  the dev browser is not running - start it.
- DO NOT run `npm test` while the dev browser is running. The headed dev Chromium
  (especially with a heavy page like cnn.com open) starves the test runner: the suite
  slows from ~1 min to 3-5 min and timing-sensitive tests flake (a DIFFERENT one each
  run - that scattered, non-deterministic pattern IS the tell-tale of contention, not a
  real regression). Stop the dev browser first (`TaskStop`/Ctrl+C), run the suite clean,
  then relaunch. A genuine regression fails the SAME test every time in isolation -
  always re-run a suspect in isolation before believing it.
- The dev browser is a background process. It survives across agent turns. It exits
  when the process is killed or Ctrl+C'd; closing the window also ends the run. The
  persistent profile means the next launch picks up where it left off.
- Orphaned instance after a stop. Killing the launcher (TaskStop) does not always
  cleanly close the Chromium it spawned - the browser can survive, holding the
  `.dev-profile` lock and port 9222. The next `npm run dev` then fails with "Opening in
  existing browser session" (Chromium forwarded to the orphan instead of launching a
  controllable one). Recover by killing the orphan, then relaunching:
  - close it over CDP:
    `node -e "(async()=>{const{chromium}=require('@playwright/test');const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const s=await b.newBrowserCDPSession();await s.send('Browser.close').catch(()=>{});await b.close().catch(()=>{})})()"`
  - then clear any stale lock: `rm -f .dev-profile/SingletonLock .dev-profile/SingletonCookie .dev-profile/SingletonSocket`
  - then `npm run dev` again.
- `fs.watch({ recursive: true })` is supported on Windows and macOS (this repo's
  target), not Linux. If this ever needs to run on Linux, swap in a watcher that
  recurses manually, or rely on `npm run reload`.
- Hot reload reloads the extension AND the open tabs. A tab on a restricted page
  (chrome://, the Web Store, the PDF viewer) refuses to reload; that rejection is
  swallowed, which is correct (the extension does not run there anyway).
- The dev profile starts logged out. For a login-gated repro, log in once in the dev
  window; it persists.
- The dev window is a SEPARATE instance from the author's everyday browsing.
  Confirm fixes in the dev window (the one `npm run dev` opens), not in a normal
  Chromium session. The standalone Chromium may already be running for normal
  browsing; the dev window uses its own `--user-data-dir` (`.dev-profile/`), so it is
  an independent instance and does not disturb that session.
- Same folder, same id, separate copies. An unpacked extension loaded from the same
  `extension/` path gets the SAME extension id in every profile (Chromium derives the
  id from the path). But each browser instance manages its own loaded copy: hot reload
  in the dev window does NOT touch a copy loaded in the everyday session. If the
  everyday session has an OLD unpacked copy (for example showing a pre-rename name),
  it must be reloaded there by hand once (the reload arrow on its chrome://extensions
  card), or just removed so the dev window is the single dev surface. This bit us on
  the first "bug": the code was already renamed; only a stale everyday-session copy
  still showed the old name.
- `dev-shot.js` opens and closes a temporary tab in the dev window each run; the
  author will see it flash. That is expected (it is the agent reproducing the page).
- Env overrides: `ZP_DEV_BROWSER` (path to a different Chromium binary) and
  `ZP_DEV_PORT` (CDP port).
- Load other extensions alongside (to test interactions, e.g. an ad blocker) with
  `ZP_DEV_EXTRA_EXTENSIONS` - one or more unpacked-extension paths separated by `;`
  or `,`. They are added to both `--load-extension` and `--disable-extensions-except`.
  Example (uBlock Origin): `ZP_DEV_EXTRA_EXTENSIONS='C:\path\to\uBlock0.chromium' npm run dev`.
  This is how the dev window confirmed uBlock + Zoom Page TL coexist (uBlock removes
  the ads, our AutoFit then fits the cleaner layout). The author's standalone Chromium
  still runs MV2 extensions, so uBlock 1.71 (MV2) loads; Playwright's bundled Chromium
  may not. The auto-reload watcher only watches `extension/`, not the extra ones.
- This is dev tooling only. It is not part of the shipped extension and not exercised
  by `npm test`; `npm run lint` ignores `scripts/` (it only checks manifest-referenced
  files under `extension/`).

## 5. Quick start for the next agent

```
npm install                          # if not done
npx playwright install chromium      # one time, if not done
npm run dev                          # background: the window you (the author) watch
# ... agent edits extension/, window auto-reloads ...
npm run lint && npm test             # must be green before handing back
```

Then follow section 3 for any "this is broken, here's a URL and a picture" report.
