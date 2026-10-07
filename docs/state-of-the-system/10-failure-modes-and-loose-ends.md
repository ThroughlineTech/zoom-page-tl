# 10 - Failure modes and loose ends

## Failure modes and idempotency

| Operation | How it fails | Re-run safe? |
| --- | --- | --- |
| Apply zoom at `document_start` (`extension/content.js:69-102`) | Extension context unavailable or `lastError`: silently no zoom. Restricted pages: script never runs. Slow storage read: brief 100% frame possible. | Yes; `refresh()` is a pure function of storage. |
| Set zoom mode (`extension/background.js:105-115`) | Restricted page rejects; swallowed. A missed event leaves the previous mode until the next navigation, activation or storage change. | Yes. |
| Keyboard shortcut (`extension/content.js:412-450`) | No-op when suppressed or context unavailable. Two rapid presses can both read the same value before either write lands, so one step may be lost. | Each press is a relative step, so repeating changes the level again; reset is idempotent. |
| Command step (`extension/background.js:230-239`) | No active tab, no host or suppressed: no-op. Same read-modify-write race as the keyboard. | As above. |
| AutoFit (`extension/content.js:349-367`) | No content script: popup and worker swallow the error and leave the level unchanged (`extension/popup.js:339-341`, `extension/background.js:223-225`). Messy pages: factor can vary run to run. | Mostly; re-running re-measures and may produce a slightly different factor. |
| Auto re-fit (`extension/content.js:514-538`) | Any error is swallowed; the previous level stays. | Yes. |
| Re-center (`extension/content.js:221-291`) | No stable selector: falls back to a marker attribute that a re-render can drop until the next pass. Transient miss keeps the last rule. | Yes; accumulation converges and a centered reading is a no-op. |
| Popup writes (`extension/popup.js:142-165`) | Restricted page: controls still write storage for the host, but nothing applies until a normal page. | Yes (absolute values). |
| Options import (`extension/options.js:272-328`, `:686-701`) | Invalid JSON or non-object: status "Import failed: ..." and nothing written. Replace deletes before writing, so a failure after the delete (unlikely; local storage) would leave a partial state. | Merge import is idempotent; replace import is idempotent for the carried keys. |
| Options export | Never fails in practice; a Blob download. | Yes. |
| Options shortcut recording (`extension/options.js:576-603`) | Refused chord: row shows the reason and storage is unchanged. Clicking elsewhere cancels. | Yes. |
| `npm run lint` | Exit 1 with a problem list. | Yes. |
| `npm test` | Flakes under CPU contention (dev browser running). | Yes; storage cleared per test. |
| `npm run dev` | Profile lock or port collision with an existing or orphaned instance. | No; one instance at a time ([08](08-dev-tooling.md) recovery). |
| `npm run build` | `web-ext` missing. | Yes (`--overwrite-dest`). |

## Consolidated loose ends

### Behavior

1. **Replace-import leaves `af:`, `rc:`, `p:` orphans** (`extension/options.js:280-282`). [03](03-storage-and-state.md)
2. **Multi-window sync** updates only the current window's active tab (`extension/background.js:169`). [05](05-service-worker.md)
3. **Incognito spanning:** levels set in incognito persist to the normal profile; not mentioned in PRIVACY.md. [03](03-storage-and-state.md)
4. **Ladder floor vs clamp:** the keyboard ladder bottoms at 25% while the clamp and slider reach 5% (`extension/zoom.js:7-11`, `:45`, `:50`). Roadmap VT-8 should record whether that is intended.
5. **Site links force `https://`** in the options manager (`extension/options.js:372`).
6. **Duplicated ladder** in the worker must be kept in sync by hand (`extension/background.js:11-27`).

7. **Shortcut conflict detection is partial by necessity:** Chrome-reserved and Chrome-used keys come from a hand-maintained list, this extension's own commands are read live, and other extensions' shortcuts cannot be seen at all. [06](06-popup-and-options.md)
8. **Page shortcuts do not work where content scripts cannot run** (chrome:// pages, the Web Store, the PDF viewer, browser UI). The Chrome-level `toggle-global` command covers on/off there. [04](04-content-script.md)

### Fixed on 2026-10-07

- Popup ignored `cfg:defaultZoom`, showing 100% and stepping from 100% on un-customized sites under a non-100% default (`tests/shortcuts.spec.js` popup test).
- A site could not be pinned at 100% under a non-100% default (the "100% is absence" rule); now "the default is absence" ([03](03-storage-and-state.md)).
- Two stale comments in `content.js`.

### Aspirational (on the roadmap, not implemented)

eTLD+1 grouping (VT-2), storage.sync, zero-flash hardening beyond re-assert, Ctrl+wheel zoom (VT-1), on-page indicator (VT-3), file:// support (VT-4), context menu (VT-6), Auto/Re-center in backups, incognito/restart persistence test, CSS-zoom cursor-offset fixes. See [roadmap.md](../roadmap.md).

### Documentation disagreements found in this pass

| Claim (source) | Code says | Resolution |
| --- | --- | --- |
| Content script deliberately has no mutation observer (retired design brief, section 8) | Two observers re-assert zoom (`extension/content.js:484-508`) | Brief retired; [01](01-architecture-and-design.md) supersedes. |
| AutoFit clamps to [0.25, 5.0] (retired brief; roadmap) | `[0.05, 5.0]` (`extension/content.js:25`, `:130-134`) | Roadmap corrected in this pass. |
| Options accepts 25-500% (roadmap) | 5-500% (`extension/options.html:153`) | Roadmap corrected in this pass. |
| Manual checklist "Disable here" (retired brief) | Controls are Pause and Exclude (`extension/popup.html:316-321`) | Checklist rewritten in [09](09-testing-and-verification.md). |
| Keyboard section listed only Alt+Shift (chrome-zoom-api-reference.md) | Ctrl +/-/0 intercept also exists (`extension/content.js:452-470`) | Reference corrected in this pass. |
| Service-worker pre-paint stylesheet is the "first line of defense" (`extension/content.js` re-assert comment) | No such code in `background.js` | Fixed: comment corrected. |
| "see HANDOFF section 9" (AutoFit comment in `extension/content.js`) | HANDOFF retired | Fixed: comment points to [04](04-content-script.md). |
| README layout omitted most tests, scripts, store and docs | Repository contents | README rewritten in this pass. |
| `fs.watch` recursive "not Linux" (retired dev handoff) | Supported on Linux in current Node | Noted in [08](08-dev-tooling.md). |

### Repository hygiene

- Untracked tooling in `.dev-shots/` (store screenshot and promo generators) ([08](08-dev-tooling.md)).
- `npm start` (web-ext run) untested and redundant with the dev browser.
- No CI.
- Store submission status not recorded.
