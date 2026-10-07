// Shared constants/helpers. Loaded as a plain script in the popup and options
// page and as the first content script (before content.js): the zoom ladder, the
// popup slider math, and the configurable keyboard shortcuts. stepFrom and the
// ladder are duplicated minimally in background.js (service workers can't import
// this without module plumbing).

const ZOOM_STEPS = [
  0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9,
  1.0,
  1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0, 5.0
];

function hostKey(host) {
  return "z:" + host;
}

function stepFrom(current, dir) {
  // dir: +1 in, -1 out. Snap to nearest step, then move one.
  const c = current || 1.0;
  if (dir > 0) {
    for (const s of ZOOM_STEPS) if (s > c + 1e-6) return s;
    return ZOOM_STEPS[ZOOM_STEPS.length - 1];
  } else {
    for (let i = ZOOM_STEPS.length - 1; i >= 0; i--) {
      if (ZOOM_STEPS[i] < c - 1e-6) return ZOOM_STEPS[i];
    }
    return ZOOM_STEPS[0];
  }
}

// --- Zoom slider (popup) ---------------------------------------------------
//
// The popup's live zoom slider maps a 0..1 track position to a zoom factor on a
// LOG scale, so equal travel == equal ratio (the common 75-200 band gets even,
// fine spacing instead of being crushed into the right edge of a 5-400 range).
// These are pure functions so the test suite can exercise the math directly.

// The "normal numbers" the slider softly snaps to (factors). Drawn as ticks; the
// slider grabs them within a small well but slides past to any in-between value.
const ZOOM_DETENTS = [
  0.25, 0.5, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0,
];

// Default slider extents (settable via cfg:zoomMin / cfg:zoomMax). Factors.
const ZOOM_MIN_DEFAULT = 0.05; // 5%
const ZOOM_MAX_DEFAULT = 4.0; // 400%

// Hard safety clamp for any stored factor, also enforced in content.js and
// options.js. The settable extents must stay inside this.
const ZOOM_CLAMP_MIN = 0.05;
const ZOOM_CLAMP_MAX = 5.0;

// Position (0..1) -> factor, and back, on a logarithmic scale over [min, max].
function posToFactor(pos, min, max) {
  const p = pos < 0 ? 0 : pos > 1 ? 1 : pos;
  return min * Math.pow(max / min, p);
}
function factorToPos(factor, min, max) {
  const f = factor < min ? min : factor > max ? max : factor;
  return Math.log(f / min) / Math.log(max / min);
}

// Soft magnetic snap: if the raw factor sits within `well` (in 0..1 position
// units) of a detent that lies inside [min, max], return that detent; otherwise
// return the raw factor unchanged. Keep `well` smaller than half the gap between
// adjacent detents so their wells never overlap (and so any in-between value
// remains reachable by sliding a touch further).
function snapFactor(factor, min, max, well) {
  const pos = factorToPos(factor, min, max);
  let best = null;
  let bestD = Infinity;
  for (const d of ZOOM_DETENTS) {
    if (d < min - 1e-9 || d > max + 1e-9) continue;
    const dp = Math.abs(factorToPos(d, min, max) - pos);
    if (dp < bestD) {
      bestD = dp;
      best = d;
    }
  }
  return best != null && bestD <= well ? best : factor;
}

// Clamp a factor to the settable extents and round to 0.01 (clean storage/badge).
function clampToExtents(factor, min, max) {
  const c = factor < min ? min : factor > max ? max : factor;
  return Math.round(c * 100) / 100;
}

// A site's level is stored only when it differs from the global default: a site
// with no z: key follows cfg:defaultZoom (absent = 100%). So "at the default" is
// the absence of a key, and any other level - including an explicit 100% while
// the default is something else - is kept for that site.
function sameFactor(a, b) {
  return Math.abs(a - b) < 1e-6;
}

// --- Keyboard shortcuts (page-level, configurable in Options) --------------
//
// Handled by the content script's keydown listener, so they work on any page the
// content script runs on (not chrome:// pages, the Web Store, or the PDF viewer).
// A chord is a canonical string: modifiers in a fixed order, then the physical
// key's KeyboardEvent.code - e.g. "Ctrl+Alt+BracketLeft". Stored under cfg:keys
// as { <action>: { on, chord } }; absent means the defaults below.

const KEYS_KEY = "cfg:keys";

const KEY_ACTIONS = [
  { id: "toggle", label: "Turn on/off everywhere" },
  { id: "zoomIn", label: "Zoom in" },
  { id: "zoomOut", label: "Zoom out" },
  { id: "reset", label: "Reset to 100%" },
  { id: "default", label: "Back to the default zoom" },
  { id: "fit", label: "Fit to width (once)" },
  { id: "auto", label: "Auto-fit on/off" },
];

// The familiar Ctrl +/-/0 keep working out of the box; the rest are unset.
const KEY_DEFAULTS = {
  toggle: { on: false, chord: null },
  zoomIn: { on: true, chord: "Ctrl+Equal" },
  zoomOut: { on: true, chord: "Ctrl+Minus" },
  reset: { on: true, chord: "Ctrl+Digit0" },
  default: { on: false, chord: null },
  fit: { on: false, chord: null },
  auto: { on: false, chord: null },
};

const MOD_ORDER = ["Ctrl", "Alt", "Shift", "Meta"];
const MODIFIER_CODES = new Set([
  "ControlLeft", "ControlRight", "AltLeft", "AltRight", "ShiftLeft",
  "ShiftRight", "MetaLeft", "MetaRight", "OSLeft", "OSRight", "CapsLock",
  "NumLock", "ScrollLock", "Fn", "FnLock", "AltGraph",
]);

// A numpad key counts as its main-keyboard twin (Ctrl+Num0 == Ctrl+0).
const NUMPAD_TWINS = {
  NumpadAdd: "Equal",
  NumpadSubtract: "Minus",
};
for (let i = 0; i <= 9; i++) NUMPAD_TWINS["Numpad" + i] = "Digit" + i;

// Typed characters that also count as a key, ignoring Shift, so "Ctrl+Equal"
// matches Ctrl++ on any layout (US Ctrl+Shift+=, German Ctrl and the + key).
const CHAR_ALIASES = { "+": "Equal", "=": "Equal", "-": "Minus", "_": "Minus" };

function chordString(c) {
  const mods = [];
  if (c.ctrl) mods.push("Ctrl");
  if (c.alt) mods.push("Alt");
  if (c.shift) mods.push("Shift");
  if (c.meta) mods.push("Meta");
  return mods.concat(c.code).join("+");
}

// "Ctrl+Alt+BracketLeft" -> { ctrl, alt, shift, meta, code }, or null if malformed.
function parseChord(s) {
  if (typeof s !== "string" || !s) return null;
  const parts = s.split("+");
  const code = parts.pop();
  if (!/^[A-Za-z0-9]+$/.test(code) || MODIFIER_CODES.has(code)) return null;
  const c = { ctrl: false, alt: false, shift: false, meta: false, code };
  let last = -1;
  for (const p of parts) {
    const i = MOD_ORDER.indexOf(p);
    if (i <= last) return null; // unknown, repeated, or out of order
    last = i;
    c[p.toLowerCase()] = true;
  }
  return c;
}

// Comparison key: numpad keys fold into their twins, so they count as the same.
function chordKey(s) {
  const c = parseChord(s);
  if (!c) return "";
  return chordString({ ...c, code: NUMPAD_TWINS[c.code] || c.code });
}

// The chord a keydown event spells, or null for a bare modifier.
function chordFromEvent(e) {
  if (!e.code || MODIFIER_CODES.has(e.code)) return null;
  return chordString({
    ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey, code: e.code,
  });
}

// Candidate chords for an event, most specific first: the exact chord, its
// numpad twin, then the typed-character alias without Shift.
function eventChords(e) {
  // AltGr (reported as Ctrl+Alt on Windows) types characters; never steal it.
  if (e.getModifierState && e.getModifierState("AltGraph")) return [];
  const exact = chordFromEvent(e);
  if (!exact) return [];
  const mods = { ctrl: e.ctrlKey, alt: e.altKey, shift: e.shiftKey, meta: e.metaKey };
  const out = [exact];
  if (NUMPAD_TWINS[e.code]) out.push(chordString({ ...mods, code: NUMPAD_TWINS[e.code] }));
  if (CHAR_ALIASES[e.key]) {
    out.push(chordString({ ...mods, shift: false, code: CHAR_ALIASES[e.key] }));
  }
  return out;
}

// Stored value -> a complete, valid map. Unknown actions, malformed chords and
// duplicates (a later action reusing an earlier one's chord) fall back to unset.
function normalizeShortcuts(raw) {
  const out = {};
  const used = new Set();
  for (const { id } of KEY_ACTIONS) {
    const r = raw && typeof raw === "object" && raw[id];
    let b = { ...KEY_DEFAULTS[id] };
    if (r && typeof r === "object") {
      const chord = r.chord == null ? null : parseChord(r.chord) ? r.chord : undefined;
      if (chord !== undefined) b = { on: !!r.on && chord != null, chord };
    }
    if (b.chord) {
      const k = chordKey(b.chord);
      if (used.has(k)) b = { on: false, chord: null };
      else used.add(k);
    }
    out[id] = b;
  }
  return out;
}

function shortcutsAreDefault(map) {
  return KEY_ACTIONS.every(
    ({ id }) =>
      map[id].on === KEY_DEFAULTS[id].on && map[id].chord === KEY_DEFAULTS[id].chord
  );
}

// chordKey -> action id, for the enabled shortcuts only.
function shortcutLookup(map) {
  const m = new Map();
  for (const { id } of KEY_ACTIONS) {
    if (map[id].on && map[id].chord) m.set(chordKey(map[id].chord), id);
  }
  return m;
}

// The action a keydown event triggers, or null.
function matchShortcut(lookup, e) {
  for (const c of eventChords(e)) {
    const id = lookup.get(chordKey(c));
    if (id) return id;
  }
  return null;
}

// Shortcuts Chrome handles itself and never passes to a page: binding them would
// never fire, so they are refused.
const CHROME_RESERVED = {};
// Shortcuts Chrome uses but a page can override: allowed, with a warning that the
// binding replaces Chrome's action on web pages.
const CHROME_SHORTCUTS = {};
(() => {
  const both = (table, rest, what) => {
    table["Ctrl+" + rest] = what;
    table["Meta+" + rest] = what; // Cmd on macOS
  };
  const reserved = {
    KeyN: "New window", "Shift+KeyN": "New incognito window", KeyT: "New tab",
    "Shift+KeyT": "Reopen closed tab", KeyW: "Close tab", "Shift+KeyW": "Close window",
    Tab: "Next tab", "Shift+Tab": "Previous tab", PageDown: "Next tab",
    PageUp: "Previous tab", F4: "Close tab",
  };
  for (const k in reserved) both(CHROME_RESERVED, k, reserved[k]);
  CHROME_RESERVED["Alt+F4"] = "Close window";
  CHROME_RESERVED["Meta+KeyQ"] = "Quit Chrome";
  const used = {
    KeyA: "Select all", KeyC: "Copy", KeyV: "Paste", KeyX: "Cut", KeyZ: "Undo",
    KeyY: "Redo", "Shift+KeyZ": "Redo", KeyF: "Find", KeyG: "Find next",
    "Shift+KeyG": "Find previous", KeyP: "Print", KeyS: "Save page",
    KeyD: "Bookmark this tab", "Shift+KeyD": "Bookmark all tabs",
    KeyL: "Focus the address bar", KeyE: "Search from the address bar",
    KeyK: "Search from the address bar", KeyR: "Reload",
    "Shift+KeyR": "Reload without cache", KeyH: "History", KeyJ: "Downloads",
    KeyU: "View source", KeyO: "Open file", "Shift+KeyB": "Show bookmarks bar",
    "Shift+KeyO": "Bookmark manager", "Shift+KeyI": "Developer tools",
    "Shift+KeyJ": "Developer tools console", "Shift+KeyC": "Inspect element",
    "Shift+Delete": "Clear browsing data", "Shift+KeyA": "Search tabs",
    "Shift+KeyM": "Switch profile", Enter: "Complete .com address",
  };
  for (const k in used) both(CHROME_SHORTCUTS, k, used[k]);
  for (let i = 1; i <= 9; i++) both(CHROME_SHORTCUTS, "Digit" + i, "Switch to tab " + i);
  Object.assign(CHROME_SHORTCUTS, {
    F1: "Help", F3: "Find next", F5: "Reload", F6: "Focus the address bar",
    F7: "Caret browsing", F10: "Chrome menu", F11: "Full screen",
    F12: "Developer tools", "Alt+KeyD": "Focus the address bar",
    "Alt+KeyE": "Chrome menu", "Alt+KeyF": "Chrome menu", "Alt+Home": "Home page",
    "Alt+ArrowLeft": "Back", "Alt+ArrowRight": "Forward", "Shift+F5": "Reload without cache",
  });
})();

// Chrome's own string for an extension command's shortcut ("Alt+Shift+Up",
// "Ctrl+Shift+0", or the macOS modifier/arrow symbols) -> chord.
function chordFromChromeShortcut(s) {
  if (!s) return null;
  const sym = { "\u2318": "Meta+", "\u2325": "Alt+", "\u21e7": "Shift+", "\u2303": "Ctrl+" };
  let t = String(s).replace(/[\u2318\u2325\u21e7\u2303]/g, (m) => sym[m]);
  t = t.replace(/\+\+/g, "+").replace(/\+$/, "");
  const parts = t.split("+").map((p) => p.trim()).filter(Boolean);
  // Chrome spells arrows "Up Arrow" on some platforms and "Up" on others.
  const name = (parts.pop() || "").replace(/\s*Arrow$/i, "");
  const c = { ctrl: false, alt: false, shift: false, meta: false, code: null };
  for (const p of parts) {
    const k = p.toLowerCase();
    if (k === "ctrl" || k === "macctrl") c.ctrl = true;
    else if (k === "alt" || k === "option") c.alt = true;
    else if (k === "shift") c.shift = true;
    else if (k === "command" || k === "cmd" || k === "meta" || k === "search") c.meta = true;
  }
  const names = {
    Up: "ArrowUp", Down: "ArrowDown", Left: "ArrowLeft", Right: "ArrowRight",
    "\u2191": "ArrowUp", "\u2193": "ArrowDown", "\u2190": "ArrowLeft", "\u2192": "ArrowRight",
    Comma: "Comma", Period: "Period", ",": "Comma", ".": "Period", Space: "Space",
    Home: "Home", End: "End", PageUp: "PageUp", PageDown: "PageDown",
    Insert: "Insert", Delete: "Delete", Tab: "Tab",
  };
  if (!name) return null;
  if (names[name]) c.code = names[name];
  else if (/^[A-Za-z]$/.test(name)) c.code = "Key" + name.toUpperCase();
  else if (/^[0-9]$/.test(name)) c.code = "Digit" + name;
  else if (/^F([1-9]|1[0-9]|2[0-4])$/.test(name)) c.code = name;
  else return null;
  return chordString(c);
}

// Can `chord` be bound to action `id`? Returns { error } (refuse), { warning }
// (allow, but tell the user), or {}. `map` is the current normalized map and
// `commandChords` maps chordKey -> description for this extension's own Chrome
// keyboard commands (chrome.commands.getAll), which Chrome handles before any page.
function checkChord(chord, id, map, commandChords) {
  const c = parseChord(chord);
  if (!c) return { error: "That key cannot be used." };
  const fkey = /^F([1-9]|1[0-9]|2[0-4])$/.test(c.code);
  if (!fkey && !c.ctrl && !c.alt && !c.meta) {
    return { error: "Use Ctrl, Alt or Cmd with the key (or a function key), so it does not get in the way of typing." };
  }
  const k = chordKey(chord);
  for (const { id: other, label } of KEY_ACTIONS) {
    if (other !== id && map[other].chord && chordKey(map[other].chord) === k) {
      return { error: `Already used by "${label}".` };
    }
  }
  if (CHROME_RESERVED[k]) {
    return { error: `Chrome keeps ${chordLabel(chord)} for itself (${CHROME_RESERVED[k]}); pages never see it.` };
  }
  if (commandChords && commandChords.get && commandChords.get(k)) {
    return {
      error: `Chrome already uses ${chordLabel(chord)} for this extension's "${commandChords.get(k)}" shortcut (change it at chrome://extensions/shortcuts).`,
    };
  }
  if (CHROME_SHORTCUTS[k]) {
    return { warning: `Chrome uses ${chordLabel(chord)} for "${CHROME_SHORTCUTS[k]}"; on web pages this shortcut will replace it.` };
  }
  if (c.ctrl && c.alt && !c.meta) {
    return { warning: "Ctrl+Alt combinations can clash with AltGr characters on some keyboard layouts." };
  }
  return {};
}

const KEY_LABELS = {
  BracketLeft: "[", BracketRight: "]", Minus: "-", Equal: "=", Semicolon: ";",
  Quote: "'", Backquote: "`", Backslash: "\\", Comma: ",", Period: ".", Slash: "/",
  ArrowUp: "Up", ArrowDown: "Down", ArrowLeft: "Left", ArrowRight: "Right",
  NumpadAdd: "Num +", NumpadSubtract: "Num -", NumpadMultiply: "Num *",
  NumpadDivide: "Num /", NumpadDecimal: "Num .", NumpadEnter: "Num Enter",
  IntlBackslash: "\\",
};

function isMacPlatform() {
  try {
    return /Mac/i.test(navigator.platform || "");
  } catch (e) {
    return false;
  }
}

// Human label: "Ctrl+Alt+[", "Cmd+Shift+K", "Ctrl+Num 0".
function chordLabel(chord) {
  const c = parseChord(chord);
  if (!c) return "";
  const mac = isMacPlatform();
  const parts = [];
  if (c.ctrl) parts.push("Ctrl");
  if (c.alt) parts.push(mac ? "Option" : "Alt");
  if (c.shift) parts.push("Shift");
  if (c.meta) parts.push(mac ? "Cmd" : "Win");
  let key = KEY_LABELS[c.code];
  if (!key) {
    const m = /^(?:Key|Digit)(.)$/.exec(c.code) || /^Numpad(\d)$/.exec(c.code);
    key = m ? (c.code.startsWith("Numpad") ? "Num " + m[1] : m[1]) : c.code;
  }
  parts.push(key);
  return parts.join("+");
}
