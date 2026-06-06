// Options page logic: global default zoom, manage-list of saved sites, and
// JSON import/export. hostKey() comes from zoom.js.
//
// The pure storage operations are also exposed on window.ZP so the test suite
// can exercise import/export deterministically without driving a file dialog.

const DEFAULT_KEY = "cfg:defaultZoom";
const MIN = 0.25;
const MAX = 5.0;

const $default = document.getElementById("default");
const $sites = document.getElementById("sites");
const $empty = document.getElementById("empty");
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

async function setSite(host, factor) {
  if (!host) return;
  const key = hostKey(host);
  await chrome.storage.local.remove("af:" + host); // manual level -> leave auto-fit mode
  const f = clampFactor(factor);
  if (f == null || isOne(f)) {
    await chrome.storage.local.remove(key);
  } else {
    await chrome.storage.local.set({ [key]: f });
  }
}

// Pause / resume a site (the popup's "Disable here", manageable from here too).
// Writes x:<host>; content.js holds the page at 100% and hands native zoom back
// to Chrome. The z: level is left intact so resuming restores it.
async function setPaused(host, paused) {
  if (!host) return;
  const xKey = "x:" + host;
  if (paused) {
    await chrome.storage.local.set({ [xKey]: true });
  } else {
    await chrome.storage.local.remove(xKey);
  }
}

// Forget a site entirely: drop its level, pause flag, and auto-fit mode.
async function removeSite(host) {
  await chrome.storage.local.remove([hostKey(host), "x:" + host, "af:" + host]);
}

// Every customized site: those with a stored level (z:) and those that are only
// paused (x: with no level). factor is the stored level or null when absent.
async function listSites() {
  const all = await chrome.storage.local.get(null);
  const byHost = new Map();
  const entry = (host) => {
    let e = byHost.get(host);
    if (!e) {
      e = { host, factor: null, paused: false };
      byHost.set(host, e);
    }
    return e;
  };
  for (const k of Object.keys(all)) {
    if (k.startsWith("z:")) entry(k.slice(2)).factor = all[k];
    else if (k.startsWith("x:")) entry(k.slice(2)).paused = true;
  }
  const sites = [...byHost.values()];
  sites.sort((a, b) => a.host.localeCompare(b.host));
  return sites;
}

async function exportData() {
  const all = await chrome.storage.local.get(null);
  const sites = {};
  for (const k of Object.keys(all)) {
    if (k.startsWith("z:")) sites[k.slice(2)] = all[k];
  }
  return { version: 1, defaultZoom: all[DEFAULT_KEY] || 1.0, sites };
}

// Returns the number of site entries written.
async function importData(obj, opts) {
  const replace = !!(opts && opts.replace);
  if (!obj || typeof obj !== "object") throw new Error("not an object");
  const sites = obj.sites && typeof obj.sites === "object" ? obj.sites : {};

  if (replace) {
    const all = await chrome.storage.local.get(null);
    const drop = Object.keys(all).filter(
      (k) => k.startsWith("z:") || k === DEFAULT_KEY
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

async function renderSites() {
  const [sites, def] = await Promise.all([listSites(), getDefault()]);
  $sites.textContent = "";
  $empty.hidden = sites.length > 0;

  for (const { host, factor, paused } of sites) {
    const tr = document.createElement("tr");
    if (paused) tr.className = "paused";

    const tdHost = document.createElement("td");
    tdHost.className = "host";
    tdHost.textContent = host;
    if (paused) {
      const tag = document.createElement("span");
      tag.className = "tag";
      tag.textContent = "Paused";
      tdHost.append(" ", tag);
    }

    const tdLvl = document.createElement("td");
    tdLvl.className = "lvl";
    const input = document.createElement("input");
    input.type = "number";
    input.min = "25";
    input.max = "500";
    input.step = "5";
    // A paused-only site has no stored level; show the default it will follow.
    input.value = pct(factor != null ? factor : def);
    // Zoom is inert while paused (like the popup's dimmed controls); resume to edit.
    input.disabled = paused;
    if (paused) input.title = "Resume the site to change its level";
    input.addEventListener("change", async () => {
      await setSite(host, Number(input.value) / 100);
      await renderSites();
      setStatus(`Updated ${host}.`);
    });
    const span = document.createElement("span");
    span.textContent = " %";
    tdLvl.append(input, span);

    const tdAct = document.createElement("td");
    tdAct.className = "act";
    const toggle = document.createElement("button");
    toggle.className = "toggle";
    toggle.textContent = paused ? "Resume" : "Pause";
    toggle.addEventListener("click", async () => {
      await setPaused(host, !paused);
      await renderSites();
      setStatus(paused ? `Resumed ${host}.` : `Paused ${host}.`);
    });
    const rm = document.createElement("button");
    rm.className = "remove";
    rm.textContent = "Remove";
    rm.addEventListener("click", async () => {
      await removeSite(host);
      await renderSites();
      setStatus(`Removed ${host}.`);
    });
    tdAct.append(toggle, rm);

    tr.append(tdHost, tdLvl, tdAct);
    $sites.appendChild(tr);
  }
}

async function renderAll() {
  await renderDefault();
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

document.getElementById("export").addEventListener("click", async () => {
  const data = await exportData();
  downloadJson(data, "zoom-page-tl-backup.json");
  const n = Object.keys(data.sites).length;
  setStatus(`Exported ${n} site${n === 1 ? "" : "s"}.`);
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
    await renderAll();
    setStatus(`Imported ${n} site${n === 1 ? "" : "s"}.`);
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
  setSite,
  setPaused,
  removeSite,
  listSites,
  exportData,
  importData,
};
