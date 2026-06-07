// Chrome-targeted static check for the extension.
//
// Why not `web-ext lint`: that runs Mozilla's addons-linter, which validates
// against Firefox. It rejects Chrome's MV3 `background.service_worker` and
// demands a Gecko extension id, producing errors that are false positives for a
// Chromium-only extension. This script checks what actually matters for Chrome:
// the manifest is valid JSON, every JS file parses, and every file the manifest
// references exists (icons verified as real PNGs at their declared sizes).

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const EXT = path.resolve(__dirname, "..", "extension");
const errors = [];
const checked = { js: 0, assets: 0 };

function rel(p) {
  return path.relative(EXT, p).replace(/\\/g, "/");
}

function fail(msg) {
  errors.push(msg);
}

function mustExist(file, why) {
  const full = path.join(EXT, file);
  if (!fs.existsSync(full)) {
    fail(`missing file referenced by ${why}: ${file}`);
    return null;
  }
  return full;
}

function checkJs(full) {
  try {
    execFileSync(process.execPath, ["--check", full], { stdio: "pipe" });
    checked.js++;
  } catch (e) {
    fail(`syntax error in ${rel(full)}:\n${e.stderr || e.message}`);
  }
}

function checkPng(file, expectedSize) {
  const full = mustExist(file, "icons");
  if (!full) return;
  const b = fs.readFileSync(full);
  const sigOk = b.slice(0, 8).toString("hex") === "89504e470d0a1a0a";
  if (!sigOk) {
    fail(`${file} is not a valid PNG`);
    return;
  }
  const w = b.readUInt32BE(16);
  const h = b.readUInt32BE(20);
  if (expectedSize && (w !== expectedSize || h !== expectedSize)) {
    fail(`${file} is ${w}x${h}, expected ${expectedSize}x${expectedSize}`);
  }
  checked.assets++;
}

// --- manifest ---
const manifestPath = path.join(EXT, "manifest.json");
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (e) {
  console.error(`manifest.json is not valid JSON: ${e.message}`);
  process.exit(1);
}

if (manifest.manifest_version !== 3) {
  fail(`manifest_version is ${manifest.manifest_version}, expected 3`);
}

// --- service worker ---
if (manifest.background && manifest.background.service_worker) {
  const sw = mustExist(manifest.background.service_worker, "background.service_worker");
  if (sw) checkJs(sw);
} else {
  fail("manifest.background.service_worker is required for MV3 (Chrome)");
}

// --- content scripts ---
for (const cs of manifest.content_scripts || []) {
  for (const js of cs.js || []) {
    const full = mustExist(js, "content_scripts");
    if (full) checkJs(full);
  }
}

// --- action popup + its scripts ---
const popup = manifest.action && manifest.action.default_popup;
if (popup) {
  const full = mustExist(popup, "action.default_popup");
  if (full) {
    const html = fs.readFileSync(full, "utf8");
    const re = /<script[^>]*\bsrc=["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(html))) {
      const ref = mustExist(m[1], `${popup} <script src>`);
      if (ref) checkJs(ref);
    }
  }
}

// --- options page + its scripts ---
const optionsPage =
  (manifest.options_ui && manifest.options_ui.page) || manifest.options_page;
if (optionsPage) {
  const full = mustExist(optionsPage, "options page");
  if (full) {
    const html = fs.readFileSync(full, "utf8");
    const re = /<script[^>]*\bsrc=["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(html))) {
      const ref = mustExist(m[1], `${optionsPage} <script src>`);
      if (ref) checkJs(ref);
    }
  }
}

// --- icons ---
const sizes = [16, 32, 48, 128];
for (const s of sizes) {
  if (manifest.icons && manifest.icons[String(s)]) {
    checkPng(manifest.icons[String(s)], s);
  }
  if (
    manifest.action &&
    manifest.action.default_icon &&
    manifest.action.default_icon[String(s)]
  ) {
    checkPng(manifest.action.default_icon[String(s)], s);
  }
}

// --- off-state icons (referenced by background.js setIcon, not the manifest) ---
for (const s of sizes) {
  checkPng(`icons/off/icon${s}.png`, s);
}

// --- report ---
if (errors.length) {
  console.error("FAIL: extension static check\n");
  for (const e of errors) console.error("  - " + e);
  console.error(`\n${errors.length} problem(s).`);
  process.exit(1);
}

console.log(
  `OK: extension static check passed (${checked.js} JS files, ${checked.assets} icons, manifest v${manifest.manifest_version}).`
);
