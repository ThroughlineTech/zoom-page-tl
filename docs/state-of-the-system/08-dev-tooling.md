# 08 - Dev tooling

None of this ships: everything here lives in `scripts/` or `tests/`, outside `extension/`. `npm run lint` checks only files the manifest references.

## `scripts/check.js` (`npm run lint`) - Functional

Validates that `manifest.json` parses and has `manifest_version` 3 (`scripts/check.js:61-73`), the service worker exists and passes `node --check` (`:75-81`, `:35-42`), every content script exists and parses (`:83-89`), the popup and options pages exist and every `<script src>` they reference exists and parses (`:91-120`), every declared icon is a real PNG at its declared size (`:122-135`, `:44-59`), and the four `icons/off/` PNGs exist at the right sizes because `background.js` references them outside the manifest (`:137-140`). Exits 1 with a list of problems, else prints a one-line OK (`:142-152`). This pass: `OK ... (7 JS files, 12 icons, manifest v3)` (shared `zoom.js` counts once per page that loads it).

## Live dev browser - Functional

| Script | Purpose |
| --- | --- |
| `scripts/dev-lib.js` | Paths, CDP port, launch flags, `hotReload(context)`. |
| `scripts/dev-browser.js` (`npm run dev [-- <url>]`) | Long-lived headed Chromium with the extension and a recursive watcher on `extension/`. |
| `scripts/dev-reload.js` (`npm run reload`) | Attach over CDP and force one hot reload. |
| `scripts/dev-shot.js` (`npm run shot -- <url> [out]`) | Attach over CDP, open a temp tab, screenshot, close it. |

**Launch** (`scripts/dev-browser.js:20-25`): persistent context in `.dev-profile/` (`scripts/dev-lib.js:16`), headed, real window size, executable chosen by `browserLaunchOptions` (`ZP_DEV_BROWSER`, else `%LOCALAPPDATA%\Chromium\Application\chrome.exe`, else Playwright `channel: "chromium"`, `scripts/dev-lib.js:22-33`). Flags: `--disable-extensions-except` and `--load-extension` with `extension/` plus any `ZP_DEV_EXTRA_EXTENSIONS` paths, `--no-first-run`, `--no-default-browser-check`, `--remote-debugging-port` (`scripts/dev-lib.js:42-54`). Because of `--disable-extensions-except`, any other extension in the profile is disabled unless named in `ZP_DEV_EXTRA_EXTENSIONS`; the owner expects uBlock Origin loaded this way every time (see AGENTS.md).

**Hot reload** (`scripts/dev-lib.js:61-81`): wait for a new service worker, call `chrome.runtime.reload()` in the current one (the call rejects as the worker dies; swallowed), then reload every open page. The watcher debounces 250ms and coalesces overlapping reloads (`scripts/dev-browser.js:46-73`).

**Shot** (`scripts/dev-shot.js:16-49`): default output `.dev-shots/shot.png`; waits for `load` (30s) plus 800ms.

### Environment variables

| Variable | Default | Used at |
| --- | --- | --- |
| `ZP_DEV_BROWSER` | unset | `scripts/dev-lib.js:23-24` |
| `ZP_DEV_PORT` | 9222 | `scripts/dev-lib.js:17` |
| `ZP_DEV_EXTRA_EXTENSIONS` | unset; `;` or `,` separated | `scripts/dev-lib.js:42-46` |
| `PORT` | 3210 (set by `playwright.config.js:20`) | `tests/server.js:7` |

No secrets or required env vars exist anywhere in the repo.

### Operating rules and recovery

- One instance per session: a second launch collides on the profile's singleton lock and the CDP port. `reload`/`shot` print "could not connect" and exit 1 when the dev browser is down (`scripts/dev-reload.js:17-22`, `scripts/dev-shot.js:28-33`).
- Do not run `npm test` while it is up; contention makes timing-sensitive tests flake.
- **Orphan recovery.** Stopping the launcher does not always close the Chromium it spawned; the orphan holds the lock and port, and the next launch fails with "Opening in existing browser session". Close it over CDP, clear the locks, relaunch:

  ```
  node -e "(async()=>{const{chromium}=require('@playwright/test');const b=await chromium.connectOverCDP('http://127.0.0.1:9222');const s=await b.newBrowserCDPSession();await s.send('Browser.close').catch(()=>{});await b.close().catch(()=>{})})()"
  rm -f .dev-profile/SingletonLock .dev-profile/SingletonCookie .dev-profile/SingletonSocket
  ZP_DEV_EXTRA_EXTENSIONS='C:\Users\fubar\src\Tools\uBlock0.chromium' npm run dev
  ```
- The dev profile starts logged out; logins made in it persist.
- The dev window is separate from the everyday browser. A stale unpacked copy loaded there is not hot-reloaded and must be reloaded or removed by hand.

## `scripts/make-off-icons.js` - Functional (one-off)

Generates `extension/icons/off/icon{16,32,48,128}.png` from the color icons with a canvas `grayscale(1)` filter at 0.55 alpha in headless Chromium (`scripts/make-off-icons.js:16-49`). Run by hand; output is committed.

## Workspace and environment assumptions

- **OS.** Developed on Windows. The standalone-Chromium path is Windows-specific (`scripts/dev-lib.js:25-30`); other platforms fall back to the bundled build. The repo's docs note macOS as a target too.
- **Watcher.** `fs.watch(..., {recursive: true})` (`scripts/dev-browser.js:70`) is supported on Windows and macOS, and on Linux in recent Node releases (Node 24 was used in this pass).
- **Shell.** Commands are POSIX (Git Bash on Windows) per the parent instructions.
- **Branch.** `main` is the default branch; no branch conventions are enforced by code. No CI.
- **Browser.** The tests need Playwright's full Chromium (`channel: "chromium"`), not the headless shell, because MV3 extensions need the full build (`tests/fixtures.js:3-6`). The owner's standalone Chromium still runs MV2 extensions, which is why the MV2 uBlock build loads in the dev window.

## Loose ends

- `.dev-shots/` holds untracked tooling that has outlived "scratch": `generate-screenshots.js` (store screenshots), `make-promo-video.js`, `verify-wapo.js`, `observe-oscillation.js`, `kill-dev.ps1`, and investigation experiments. The screenshot and promo generators would need to move into `scripts/` to be reproducible.
- `npm start` (web-ext run) duplicates the dev browser and is untested.
