# 02 - Install, build and run

## What the host must provide

- **To use the extension:** a Chromium-based browser with Manifest V3 support. The extension uses `storage` and `tabs` permissions and `<all_urls>` host access (`extension/manifest.json:6-7`). CSS `zoom` behavior is Chromium-specific; there is no Firefox build (see the lint note below).
- **To develop:** Node.js with npm (the dev dependencies are `@playwright/test` and `web-ext`, `package.json:16-19`). `npx playwright install chromium` downloads the full Chromium build the test harness needs (`tests/fixtures.js:3-6`). The live dev browser prefers a standalone Chromium at `%LOCALAPPDATA%\Chromium\Application\chrome.exe` and falls back to Playwright's bundled build (`scripts/dev-lib.js:22-33`); see [08](08-dev-tooling.md).
- **Not required:** any server, database, account, API key or network access at runtime.

## External dependencies

| Dependency | Used by | Specific surface | When missing |
| --- | --- | --- | --- |
| Chrome extension APIs | `extension/*` | `storage.local` + `onChanged`; `tabs.setZoomSettings`, `query`, `get`, `sendMessage`, `onUpdated`, `onActivated`; `action.setBadgeText`, `setBadgeBackgroundColor`, `setIcon`; `commands.onCommand`; `runtime.onMessage`, `openOptionsPage` | Restricted pages reject; all such calls are wrapped and swallowed (e.g. `extension/background.js:112-114`, `extension/content.js:95-97`). |
| `@playwright/test` | tests, all `scripts/dev-*.js`, `scripts/make-off-icons.js` | `chromium.launchPersistentContext`, `connectOverCDP`, `launch` | `npm test` / `npm run dev` fail at `require`. |
| `web-ext` | `npm start`, `npm run build` (`package.json:13-14`) | `web-ext run -t chromium`, `web-ext build` | Those two scripts fail; lint/test unaffected. |
| Standalone Chromium (optional) | dev browser | Executable path | Falls back to `channel: "chromium"` (`scripts/dev-lib.js:32`). |
| uBlock Origin unpacked (optional) | dev browser | `ZP_DEV_EXTRA_EXTENSIONS` | Dev window runs without it ([08](08-dev-tooling.md)). |

No MCP servers, services, APIs or databases are used. Nothing is fetched at runtime; the store listing and [PRIVACY.md](../../PRIVACY.md) make that a published promise.

## npm scripts

| Command | Definition | Status | Notes |
| --- | --- | --- | --- |
| `npm install` | - | Functional | Installs the two dev dependencies. |
| `npm run lint` | `node scripts/check.js` (`package.json:8`) | Functional | Chrome-targeted static check, [08](08-dev-tooling.md). Replaces `web-ext lint`, which validates against Firefox and false-flags the MV3 `service_worker` and missing Gecko id (`scripts/check.js:3-8`). |
| `npm test` | `playwright test` (`package.json:9`) | Functional | Serial, one worker, boots `tests/server.js` on port 3210 (`playwright.config.js:3-21`). Results in [09](09-testing-and-verification.md). |
| `npm run dev` | `node scripts/dev-browser.js` (`package.json:10`) | Functional | Headed dev Chromium with hot reload. |
| `npm run reload` | `node scripts/dev-reload.js` (`package.json:11`) | Functional | Requires a running dev browser. |
| `npm run shot` | `node scripts/dev-shot.js` (`package.json:12`) | Functional | Requires a running dev browser. |
| `npm start` | `web-ext run -s extension -t chromium` (`package.json:13`) | Partial | Not exercised by tests or this pass; superseded in practice by `npm run dev`. |
| `npm run build` | `web-ext build -s extension -a dist --overwrite-dest` (`package.json:14`) | Functional | Writes `dist/zoom_page_tl-<manifest version>.zip`; `dist/zoom_page_tl-1.0.0.zip` exists locally (git-ignored, `.gitignore:2`). |
| `node scripts/make-off-icons.js` | not an npm script | Functional (one-off) | Regenerates `extension/icons/off/` ([08](08-dev-tooling.md)). |

## Install for use (development load)

1. `chrome://extensions`, enable Developer mode, Load unpacked, select `extension/`.
2. After editing `background.js` or `manifest.json`, reload the extension card; after `content.js`, reload the extension and the page; popup and options changes apply on reopen. The dev browser automates all of this ([08](08-dev-tooling.md)).

Unpacked extensions get a path-derived id, so the same `extension/` folder loaded in two profiles has the same id but separate loaded copies; hot reload in the dev window does not touch a copy in the everyday browser.

## Release and store packaging

- The version lives in two places that must move together: `extension/manifest.json:4` and `package.json:3` (both `1.1.0`). `web-ext build` names the zip from the manifest.
- `npm run build` produces the store upload; the manifest sits at the zip root.
- Submission content is prepared in [store/listing.md](../../store/listing.md): name, summary, description, single purpose, category Accessibility, permission justifications, data-use certifications and the privacy policy URL (`https://github.com/ThroughlineTech/zoom-page-tl/blob/main/PRIVACY.md`). Screenshots are in `store/screenshots/` (3 PNGs).
- Submission itself is a manual step in the Chrome Web Store Developer Dashboard. Whether 1.0.0 has been submitted or approved is not recorded in the repository.

## Update and uninstall

- **Update.** A store update replaces the package; `chrome.storage.local` persists across updates. No migration code exists, so a future key-format change would need one ([03](03-storage-and-state.md)).
- **Uninstall.** Chrome deletes the extension's `chrome.storage.local`, so all levels and flags are removed. Tabs revert to default zoom settings on their next navigation, since the per-tab `disabled` mode is not persisted by Chrome.
- **Developer artifacts** left on disk after use: `node_modules/`, `.dev-profile/`, `.dev-shots/`, `test-results/`, `dist/` (all git-ignored, `.gitignore:1-11`). Nothing outside the repo is written except Playwright's browser cache from `npx playwright install`.

## Loose ends

- `npm start` (web-ext run) is untested and overlaps the dev browser; it could be removed or documented as legacy.
- No CI configuration exists; lint and tests run only locally.
- Store submission state is not tracked in the repo.
- The store-screenshot and promo-video generators that produced `store/screenshots/` live only in the git-ignored `.dev-shots/` (`generate-screenshots.js`, `make-promo-video.js`), so the screenshots cannot be regenerated from tracked source.
