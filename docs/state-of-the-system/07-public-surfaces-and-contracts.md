# 07 - Public surfaces and contracts

Zoom Page TL exposes no network API and no library exports. Its surfaces are the browser-facing ones below.

## User-facing surfaces

| Surface | Definition | Status |
| --- | --- | --- |
| Toolbar action + popup | `extension/manifest.json:23-32`; [06](06-popup-and-options.md) | Functional |
| Options page | `extension/manifest.json:19-22`; [06](06-popup-and-options.md) | Functional |
| Badge | `extension/background.js:112-123` | Functional |
| Keyboard commands (rebindable) | `extension/manifest.json:39-58`; [05](05-service-worker.md) | Functional; dispatch verified manually only |
| `Ctrl +/-/0` page keys | `extension/content.js:405-427`; [04](04-content-script.md) | Functional |
| JSON backup file | `extension/options.js:192-247`; [03](03-storage-and-state.md) | Functional |

## Internal contracts

**Runtime messages** (`chrome.tabs.sendMessage` to the content script; handler `extension/content.js:355-372`):

| Message | Sent by | Response | Side effects |
| --- | --- | --- | --- |
| `{type: "autofit"}` | popup Fit/Auto (`extension/popup.js:324`); worker `zoom-autofit` (`extension/background.js:217`) | `{factor, fits}` or `{error}` (async) | Applies and writes `z:` unless suppressed. |
| `{type: "previewZoom", factor}` | popup slider drag (`extension/popup.js:83-88`) | `{ok: true}` (sync) | Applies inline zoom only; no storage write. |

Unknown messages get no response. There are no messages from the content script to the worker; all other coordination goes through `storage.onChanged`.

**Storage contract.** The key set, value types and conventions in [03](03-storage-and-state.md) are the contract between the four components. Every component reads keys independently, so adding a key requires updating each reader (content `refresh` key list `extension/content.js:69`, worker `isSuppressed`/`getFactor`, popup init `extension/popup.js:403-412`, options `listSites`/`removeSite`/`exportData`).

**`window.ZP` on the options page** (`extension/options.js:486-501`): a test seam used by `tests/options.spec.js` and `tests/slider.spec.js`. Not intended for other code.

**DOM footprint on host pages:** inline `style.zoom` on `<html>`, `<style id="zp-recenter">`, and an optional `data-zp-recenter` attribute ([04](04-content-script.md)). Page scripts can observe these; nothing else is injected.

## Contracts with sibling repos and systems

- **Chrome Web Store.** `store/listing.md` and `PRIVACY.md` make promises the code must keep: no data collection or transmission, no remote code, content script in the top frame only, permissions limited to `storage`, `tabs` and `<all_urls>`. The privacy policy URL points at `PRIVACY.md` on GitHub `main`, so that file must stay at the repo root on the default branch.
- **GitHub.** Public repo `https://github.com/ThroughlineTech/zoom-page-tl` (linked from `extension/options.html:198` and `PRIVACY.md`).
- **Zoom Page WE.** No runtime interaction. The original's source may be placed locally in git-ignored `reference/` (`.gitignore:12-14`) as read-only reference; its GPLv2 code must not enter `extension/`. The original's storage format is not imported; there is no migration path from ZPWE settings.
- **Parent workspace tooling.** `~/src/notify.sh` and the `build` CLI are used by agents per `~/src/AGENTS.md`; this repo has no `.build/config.toml`, so it has no ticket backend.
- **uBlock Origin.** Development-only: loaded beside the extension in the dev browser to verify coexistence ([08](08-dev-tooling.md)).

No shared artifact is defined twice across repositories.

## Loose ends

- No import path from Zoom Page WE settings, although former ZPWE users are the target audience.
- The backup format's `version` field is not checked on import (`extension/options.js:207-212`); a future format change has no compatibility switch.
