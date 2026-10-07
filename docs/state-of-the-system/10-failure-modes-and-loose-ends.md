# 10 - Failure modes and loose ends

## Failure modes and idempotency

| Operation | How it fails | Re-run safe? |
| --- | --- | --- |
| Apply zoom at `document_start` (`extension/content.js:66-89`) | Extension context unavailable or `lastError`: silently no zoom. Restricted pages: script never runs. Slow storage read: brief 100% frame possible. | Yes; `refresh()` is a pure function of storage. |
| Set zoom mode (`extension/background.js:100-110`) | Restricted page rejects; swallowed. A missed event leaves the previous mode until the next navigation, activation or storage change. | Yes. |
| Keyboard step (`extension/content.js:384-403`) | No-op when suppressed or context unavailable. Two rapid presses can both read the same value before either write lands, so one step may be lost. | Each press is a relative step, so repeating changes the level again; reset is idempotent. |
| Command step (`extension/background.js:225-234`) | No active tab, no host or suppressed: no-op. Same read-modify-write race as the keyboard. | As above. |
| AutoFit (`extension/content.js:335-351`) | No content script: popup and worker swallow the error and leave the level unchanged (`extension/popup.js:336-338`, `extension/background.js:218-220`). Messy pages: factor can vary run to run. | Mostly; re-running re-measures and may produce a slightly different factor. |
| Auto re-fit (`extension/content.js:470-494`) | Any error is swallowed; the previous level stays. | Yes. |
| Re-center (`extension/content.js:207-277`) | No stable selector: falls back to a marker attribute that a re-render can drop until the next pass. Transient miss keeps the last rule. | Yes; accumulation converges and a centered reading is a no-op. |
| Popup writes (`extension/popup.js:141-162`) | Restricted page: controls still write storage for the host, but nothing applies until a normal page. | Yes (absolute values). |
| Options import (`extension/options.js:207-248`, `:461-476`) | Invalid JSON or non-object: status "Import failed: ..." and nothing written. Replace deletes before writing, so a failure after the delete (unlikely; local storage) would leave a partial state. | Merge import is idempotent; replace import is idempotent for the carried keys. |
| Options export | Never fails in practice; a Blob download. | Yes. |
| `npm run lint` | Exit 1 with a problem list. | Yes. |
| `npm test` | Flakes under CPU contention (dev browser running). | Yes; storage cleared per test. |
| `npm run dev` | Profile lock or port collision with an existing or orphaned instance. | No; one instance at a time ([08](08-dev-tooling.md) recovery). |
| `npm run build` | `web-ext` missing. | Yes (`--overwrite-dest`). |

## Consolidated loose ends

### Behavior

1. **Popup ignores `cfg:defaultZoom`** (`extension/popup.js:422`): wrong percent and step base on un-customized sites when the default is not 100%. Broken (minor). [03](03-storage-and-state.md)
2. **Replace-import leaves `af:`, `rc:`, `p:` orphans** (`extension/options.js:215-217`). [03](03-storage-and-state.md)
3. **Multi-window sync** updates only the current window's active tab (`extension/background.js:164`). [05](05-service-worker.md)
4. **Incognito spanning:** levels set in incognito persist to the normal profile; not mentioned in PRIVACY.md. [03](03-storage-and-state.md)
5. **Ladder floor vs clamp:** the keyboard ladder bottoms at 25% while the clamp and slider reach 5% (`extension/zoom.js:6-10`, `:44`, `:49`). Roadmap VT-8 should record whether that is intended.
6. **Site links force `https://`** in the options manager (`extension/options.js:292`).
7. **Duplicated ladder** in the worker must be kept in sync by hand (`extension/background.js:11-27`).

### Aspirational (on the roadmap, not implemented)

eTLD+1 grouping (VT-2), storage.sync, zero-flash hardening beyond re-assert, Ctrl+wheel zoom (VT-1), on-page indicator (VT-3), file:// support (VT-4), context menu (VT-6), Auto/Re-center in backups, incognito/restart persistence test, CSS-zoom cursor-offset fixes. See [roadmap.md](../roadmap.md).

### Documentation disagreements found in this pass

| Claim (source) | Code says | Resolution |
| --- | --- | --- |
| Content script deliberately has no mutation observer (retired design brief, section 8) | Two observers re-assert zoom (`extension/content.js:440-464`) | Brief retired; [01](01-architecture-and-design.md) supersedes. |
| AutoFit clamps to [0.25, 5.0] (retired brief; roadmap) | `[0.05, 5.0]` (`extension/content.js:25`, `:116-120`) | Roadmap corrected in this pass. |
| Options accepts 25-500% (roadmap) | 5-500% (`extension/options.html:130`) | Roadmap corrected in this pass. |
| Manual checklist "Disable here" (retired brief) | Controls are Pause and Exclude (`extension/popup.html:316-321`) | Checklist rewritten in [09](09-testing-and-verification.md). |
| Keyboard section listed only Alt+Shift (chrome-zoom-api-reference.md) | Ctrl +/-/0 intercept also exists (`extension/content.js:405-427`) | Reference corrected in this pass. |
| Service-worker pre-paint stylesheet is the "first line of defense" (`extension/content.js:431-432` comment) | No such code in `background.js` | Open: stale code comment. |
| "see HANDOFF section 9" (`extension/content.js:292` comment) | HANDOFF retired | Open: stale code comment; [04](04-content-script.md) documents the algorithm. |
| README layout omitted most tests, scripts, store and docs | Repository contents | README rewritten in this pass. |
| `fs.watch` recursive "not Linux" (retired dev handoff) | Supported on Linux in current Node | Noted in [08](08-dev-tooling.md). |

### Repository hygiene

- Untracked tooling in `.dev-shots/` (store screenshot and promo generators) ([08](08-dev-tooling.md)).
- `npm start` (web-ext run) untested and redundant with the dev browser.
- No CI.
- Store submission status not recorded.
