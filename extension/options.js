// Options page logic: global default zoom, an Active/Excluded manage-list of
// saved sites, and JSON import/export. hostKey() comes from zoom.js.
//
// The pure storage operations are also exposed on window.ZP so the test suite
// can exercise them deterministically without driving a file dialog.

const DEFAULT_KEY = "cfg:defaultZoom";
// Hard clamp for any stored factor; shared with content.js and the popup slider
// (ZOOM_CLAMP_* come from zoom.js, loaded first). 5% floor, 500% ceiling.
const MIN = ZOOM_CLAMP_MIN;
const MAX = ZOOM_CLAMP_MAX;

const $default = document.getElementById("default");
const $zoomMin = document.getElementById("zoomMin");
const $zoomMax = document.getElementById("zoomMax");
const $active = document.getElementById("active");
const $excluded = document.getElementById("excluded");
const $activeEmpty = document.getElementById("activeEmpty");
const $excludedEmpty = document.getElementById("excludedEmpty");
const $status = document.getElementById("status");
const $replace = document.getElementById("replace");
const $importFile = document.getElementById("importFile");

function clampFactor(v) {
  const n = Number(v);
  if (!isFinite(n) || n <= 0) return null;
  return Math.min(MAX, Math.max(MIN, n));
}

function isOne(f) {
  return Math.abs(f - 1.0) < 1e-6;
}

function setStatus(msg) {
  $status.textContent = msg || "";
}

// --- storage operations (also exported for tests) ---

async function getDefault() {
  const res = await chrome.storage.local.get(DEFAULT_KEY);
  return res[DEFAULT_KEY] || 1.0;
}

async function setDefault(factor) {
  const f = clampFactor(factor);
  if (f == null || isOne(f)) {
    await chrome.storage.local.remove(DEFAULT_KEY);
  } else {
    await chrome.storage.local.set({ [DEFAULT_KEY]: f });
  }
}

// Slider extents (cfg:zoomMin / cfg:zoomMax). A value at the default is stored as
// the absence of its key (consistent with the rest of the model). Reads fall back
// to the defaults and guard against incoherent (max <= min) extents.
async function getBounds() {
  const res = await chrome.storage.local.get(["cfg:zoomMin", "cfg:zoomMax"]);
  let min = clampFactor(res["cfg:zoomMin"]);
  let max = clampFactor(res["cfg:zoomMax"]);
  if (min == null) min = ZOOM_MIN_DEFAULT;
  if (max == null) max = ZOOM_MAX_DEFAULT;
  if (max <= min) {
    min = ZOOM_MIN_DEFAULT;
    max = ZOOM_MAX_DEFAULT;
  }
  return { min, max };
}

// Write both extents. Returns false (and writes nothing) if invalid or max<=min.
async function setBounds(min, max) {
  const lo = clampFactor(min);
  const hi = clampFactor(max);
  if (lo == null || hi == null || hi <= lo) return false;
  if (Math.abs(lo - ZOOM_MIN_DEFAULT) < 1e-9) {
    await chrome.storage.local.remove("cfg:zoomMin");
  } else {
    await chrome.storage.local.set({ "cfg:zoomMin": lo });
  }
  if (Math.abs(hi - ZOOM_MAX_DEFAULT) < 1e-9) {
    await chrome.storage.local.remove("cfg:zoomMax");
  } else {
    await chrome.storage.local.set({ "cfg:zoomMax": hi });
  }
  return true;
}

async function setSite(host, factor) {
  if (!host) return;
  const key = hostKey(host);
  const f = clampFactor(factor);
  if (f == null || isOne(f)) {
    await chrome.storage.local.remove(key);
  } else {
    await chrome.storage.local.set({ [key]: f });
  }
}

// Exclude (x:, never zoom) / include a site. Excluding supersedes a pause, so it
// also clears p:<host>, leaving the site cleanly "never".
async function setExcluded(host, excluded) {
  if (!host) return;
  const xKey = "x:" + host;
  if (excluded) {
    await chrome.storage.local.set({ [xKey]: true });
    await chrome.storage.local.remove("p:" + host);
  } else {
    await chrome.storage.local.remove(xKey);
  }
}

// Auto-fit mode (af:, opt-in): the site re-fits on every page load/resize. The
// content script picks this up live; toggling off keeps the last fit as a fixed
// level.
async function setAuto(host, auto) {
  if (!host) return;
  const afKey = "af:" + host;
  if (auto) {
    await chrome.storage.local.set({ [afKey]: true });
  } else {
    await chrome.storage.local.remove(afKey);
  }
}

// Re-center (rc:, opt-in): translate content that drifts sideways under zoom back
// to center. The content script applies it live.
async function setRecenter(host, on) {
  if (!host) return;
  const rcKey = "rc:" + host;
  if (on) {
    await chrome.storage.local.set({ [rcKey]: true });
  } else {
    await chrome.storage.local.remove(rcKey);
  }
}

// Pause (p:, suspend for now) / resume a site. The z: level is left intact so
// resuming restores it.
async function setPaused(host, paused) {
  if (!host) return;
  const pKey = "p:" + host;
  if (paused) {
    await chrome.storage.local.set({ [pKey]: true });
  } else {
    await chrome.storage.local.remove(pKey);
  }
}

// Forget a site entirely: drop its level and all its flags.
async function removeSite(host) {
  await chrome.storage.local.remove([
    hostKey(host),
    "x:" + host,
    "p:" + host,
    "af:" + host,
    "rc:" + host,
  ]);
}

// Every customized site, with its state. factor is the stored level or null;
// excluded = x: (never zoom); paused = p: (suspended for now).
async function listSites() {
  const all = await chrome.storage.local.get(null);
  const byHost = new Map();
  const entry = (host) => {
    let e = byHost.get(host);
    if (!e) {
      e = {
        host,
        factor: null,
        excluded: false,
        paused: false,
        auto: false,
        recenter: false,
      };
      byHost.set(host, e);
    }
    return e;
  };
  for (const k of Object.keys(all)) {
    if (k.startsWith("z:")) entry(k.slice(2)).factor = all[k];
    else if (k.startsWith("x:")) entry(k.slice(2)).excluded = true;
    else if (k.startsWith("p:")) entry(k.slice(2)).paused = true;
    else if (k.startsWith("af:")) entry(k.slice(3)).auto = true;
    else if (k.startsWith("rc:")) entry(k.slice(3)).recenter = true;
  }
  const sites = [...byHost.values()];
  sites.sort((a, b) => a.host.localeCompare(b.host));
  return sites;
}

async function exportData() {
  const all = await chrome.storage.local.get(null);
  const sites = {};
  const excluded = [];
  for (const k of Object.keys(all)) {
    if (k.startsWith("z:")) sites[k.slice(2)] = all[k];
    else if (k.startsWith("x:")) excluded.push(k.slice(2));
  }
  excluded.sort((a, b) => a.localeCompare(b));
  return { version: 1, defaultZoom: all[DEFAULT_KEY] || 1.0, sites, excluded };
}

// Returns the number of site (level) entries written. Excluded hosts are applied
// too (as x: flags) but not counted here. Pause (p:) is transient: never
// exported, never touched on import.
async function importData(obj, opts) {
  const replace = !!(opts && opts.replace);
  if (!obj || typeof obj !== "object") throw new Error("not an object");
  const sites = obj.sites && typeof obj.sites === "object" ? obj.sites : {};
  const excluded = Array.isArray(obj.excluded) ? obj.excluded : [];

  if (replace) {
    const all = await chrome.storage.local.get(null);
    const drop = Object.keys(all).filter(
      (k) => k.startsWith("z:") || k.startsWith("x:") || k === DEFAULT_KEY
    );
    if (drop.length) await chrome.storage.local.remove(drop);
  }

  const writes = {};
  const removes = [];
  let count = 0;
  for (const host of Object.keys(sites)) {
    if (!host) continue;
    const f = clampFactor(sites[host]);
    if (f == null || isOne(f)) {
      removes.push(hostKey(host));
    } else {
      writes[hostKey(host)] = f;
      count++;
    }
  }

  for (const host of excluded) {
    if (host && typeof host === "string") writes["x:" + host] = true;
  }

  if ("defaultZoom" in obj) {
    const d = clampFactor(obj.defaultZoom);
    if (d == null || isOne(d)) removes.push(DEFAULT_KEY);
    else writes[DEFAULT_KEY] = d;
  }

  if (Object.keys(writes).length) await chrome.storage.local.set(writes);
  if (removes.length) await chrome.storage.local.remove(removes);
  return count;
}

// --- rendering ---

function pct(f) {
  return Math.round(f * 100);
}

async function renderDefault() {
  $default.value = pct(await getDefault());
}

async function renderBounds() {
  const { min, max } = await getBounds();
  $zoomMin.value = pct(min);
  $zoomMax.value = pct(max);
}

function makeButton(label, onClick) {
  const b = document.createElement("button");
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function makeRemoveButton(host) {
  const rm = makeButton("Remove", async () => {
    await removeSite(host);
    await renderSites();
    setStatus(`Removed ${host}.`);
  });
  rm.className = "remove";
  return rm;
}

function makeRow(site, def) {
  const { host, factor, excluded, paused, auto, recenter } = site;
  const tr = document.createElement("tr");
  if (excluded) tr.className = "excluded";
  else if (paused) tr.className = "paused";

  const tdHost = document.createElement("td");
  tdHost.className = "host";
  const link = document.createElement("a");
  link.href = "https://" + host + "/";
  link.textContent = host;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  tdHost.appendChild(link);

  const tdLvl = document.createElement("td");
  tdLvl.className = "lvl";
  const input = document.createElement("input");
  input.type = "number";
  input.min = "5";
  input.max = "500";
  input.step = "5";
  // The level is directly editable only on a plain fixed Active site. Auto manages
  // it, and excluded/paused sites are not zoomed - show the value (their stored one
  // or the default) but grey it out and disable it. (Highlighted Auto / the
  // Resume button / the Excluded list say which state it is.)
  input.value = pct(factor != null ? factor : def);
  input.disabled = excluded || paused || auto;
  if (input.disabled) {
    input.title = excluded
      ? "Include the site to change its level"
      : paused
      ? "Resume the site to change its level"
      : "Auto-fit manages this level; turn Auto off to set it manually";
  }
  input.addEventListener("change", async () => {
    await setSite(host, Number(input.value) / 100);
    await renderSites();
    setStatus(`Updated ${host}.`);
  });
  const span = document.createElement("span");
  span.textContent = " %";
  tdLvl.append(input, span);

  // Every row gets the same four controls in the same order, so the columns line
  // up across the Active and Excluded lists. Only the 3rd flips: Exclude / Include.
  const autoBtn = makeButton("Auto", async () => {
    await setAuto(host, !auto);
    await renderSites();
    setStatus(auto ? `${host}: fixed level.` : `${host}: auto-fit on.`);
  });
  autoBtn.title = "Auto-fit this site on every page load";
  if (auto) autoBtn.className = "on";

  const recenterBtn = makeButton("Center", async () => {
    await setRecenter(host, !recenter);
    await renderSites();
    setStatus(recenter ? `${host}: re-center off.` : `${host}: re-center on.`);
  });
  recenterBtn.title = "Re-center content that drifts sideways when zoomed";
  if (recenter) recenterBtn.className = "on";

  const pauseBtn = makeButton(paused ? "Resume" : "Pause", async () => {
    await setPaused(host, !paused);
    await renderSites();
    setStatus(paused ? `Resumed ${host}.` : `Paused ${host}.`);
  });

  const toggleBtn = excluded
    ? makeButton("Include", async () => {
        await setExcluded(host, false);
        await renderSites();
        setStatus(`Included ${host}.`);
      })
    : makeButton("Exclude", async () => {
        await setExcluded(host, true);
        await renderSites();
        setStatus(`Excluded ${host}.`);
      });

  const btns = document.createElement("div");
  btns.className = "btns";
  btns.append(autoBtn, recenterBtn, pauseBtn, toggleBtn, makeRemoveButton(host));

  const tdAct = document.createElement("td");
  tdAct.className = "act";
  tdAct.append(btns);

  tr.append(tdHost, tdLvl, tdAct);
  return tr;
}

async function renderSites() {
  const [sites, def] = await Promise.all([listSites(), getDefault()]);
  const active = sites.filter((s) => !s.excluded);
  const excluded = sites.filter((s) => s.excluded);

  $active.textContent = "";
  for (const s of active) $active.appendChild(makeRow(s, def));
  $activeEmpty.hidden = active.length > 0;

  $excluded.textContent = "";
  for (const s of excluded) $excluded.appendChild(makeRow(s, def));
  $excludedEmpty.hidden = excluded.length > 0;
}

async function renderAll() {
  await renderDefault();
  await renderBounds();
  await renderSites();
}

// --- file download/upload ---

function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function summary(n, x) {
  const parts = [`${n} site${n === 1 ? "" : "s"}`];
  if (x) parts.push(`${x} excluded`);
  return parts.join(", ");
}

// --- wiring ---

$default.addEventListener("change", async () => {
  await setDefault(Number($default.value) / 100);
  await renderAll();
  setStatus("Default updated.");
});

document.getElementById("defaultReset").addEventListener("click", async () => {
  await setDefault(1.0);
  await renderAll();
  setStatus("Default reset to 100%.");
});

$zoomMin.addEventListener("change", async () => {
  const { max } = await getBounds();
  const ok = await setBounds(Number($zoomMin.value) / 100, max);
  await renderBounds();
  setStatus(ok ? "Slider range updated." : "Min must be below max.");
});

$zoomMax.addEventListener("change", async () => {
  const { min } = await getBounds();
  const ok = await setBounds(min, Number($zoomMax.value) / 100);
  await renderBounds();
  setStatus(ok ? "Slider range updated." : "Max must be above min.");
});

document.getElementById("zoomRangeReset").addEventListener("click", async () => {
  await chrome.storage.local.remove(["cfg:zoomMin", "cfg:zoomMax"]);
  await renderBounds();
  setStatus("Slider range reset to 5-400%.");
});

document.getElementById("export").addEventListener("click", async () => {
  const data = await exportData();
  downloadJson(data, "zoom-page-tl-backup.json");
  setStatus(`Exported ${summary(Object.keys(data.sites).length, data.excluded.length)}.`);
});

document.getElementById("importBtn").addEventListener("click", () => {
  $importFile.click();
});

$importFile.addEventListener("change", async () => {
  const file = $importFile.files && $importFile.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const obj = JSON.parse(text);
    const n = await importData(obj, { replace: $replace.checked });
    const x = Array.isArray(obj.excluded) ? obj.excluded.length : 0;
    await renderAll();
    setStatus(`Imported ${summary(n, x)}.`);
  } catch (e) {
    setStatus("Import failed: " + e.message);
  } finally {
    $importFile.value = ""; // allow re-importing the same file
  }
});

// Reflect external changes (popup, keyboard, another tab) live.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local") renderAll();
});

renderAll();

// Exposed for the test suite.
window.ZP = {
  DEFAULT_KEY,
  getDefault,
  setDefault,
  getBounds,
  setBounds,
  setSite,
  setExcluded,
  setPaused,
  setAuto,
  setRecenter,
  removeSite,
  listSites,
  exportData,
  importData,
};
