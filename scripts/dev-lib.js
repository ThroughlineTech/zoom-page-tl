// Shared helpers for the live dev browser (dev-browser.js / dev-reload.js /
// dev-shot.js).
//
// The dev loop reuses Playwright (already a dev dependency) to drive a real,
// headed Chromium window that the author watches. Unlike the test harness it
// launches into a PERSISTENT profile (.dev-profile/) so logins and state survive
// reloads and restarts, and it points at the author's standalone Chromium so the
// window matches their real browser. Hot reload re-reads the unpacked extension
// from disk via chrome.runtime.reload() and refreshes open tabs so content.js
// re-runs; nothing dev-only ever ships inside extension/.

const fs = require("fs");
const path = require("path");

const EXT_DIR = path.resolve(__dirname, "..", "extension");
const PROFILE_DIR = path.resolve(__dirname, "..", ".dev-profile");
const CDP_PORT = Number(process.env.ZP_DEV_PORT || 9222);

// Resolve the dev browser executable. Order: ZP_DEV_BROWSER env override, then
// the author's standalone Chromium (chosen target), else Playwright's bundled
// full Chromium as a fallback so the scripts still work on a fresh checkout.
function browserLaunchOptions() {
  const override = process.env.ZP_DEV_BROWSER;
  if (override && fs.existsSync(override)) return { executablePath: override };
  const standalone = path.join(
    process.env.LOCALAPPDATA || "",
    "Chromium",
    "Application",
    "chrome.exe"
  );
  if (fs.existsSync(standalone)) return { executablePath: standalone };
  return { channel: "chromium" };
}

// Flags shared by every launch. Only this extension is loaded, the dev profile
// skips first-run noise, and a fixed CDP port lets dev-reload/dev-shot attach
// from a separate process.
// Extra unpacked extensions to load alongside this one, for testing interactions
// (e.g. an ad blocker). Set ZP_DEV_EXTRA_EXTENSIONS to one or more paths,
// separated by ; or , -- for example:
//   ZP_DEV_EXTRA_EXTENSIONS='C:\path\to\uBlock0.chromium' npm run dev
const EXTRA_EXTENSIONS = (process.env.ZP_DEV_EXTRA_EXTENSIONS || "")
  .split(/[;,]/)
  .map((s) => s.trim())
  .filter(Boolean);
const allExtensions = [EXT_DIR, ...EXTRA_EXTENSIONS].join(",");

const launchArgs = [
  `--disable-extensions-except=${allExtensions}`,
  `--load-extension=${allExtensions}`,
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${CDP_PORT}`,
];

// Reload the unpacked extension and refresh every open tab. Set up the wait for
// the fresh service worker BEFORE triggering the reload, because
// chrome.runtime.reload() tears down the current worker (so the evaluate call
// itself usually rejects, which is expected and swallowed). After the new worker
// registers, reload pages so the updated content.js runs.
async function hotReload(context) {
  const newWorker = context
    .waitForEvent("serviceworker", { timeout: 8000 })
    .catch(() => null);
  const [sw] = context.serviceWorkers();
  if (sw) {
    try {
      await sw.evaluate(() => chrome.runtime.reload());
    } catch (e) {
      // expected: the worker is destroyed mid-call by the reload
    }
  }
  await newWorker;
  for (const page of context.pages()) {
    try {
      await page.reload({ waitUntil: "domcontentloaded" });
    } catch (e) {
      // a tab on a restricted page (chrome://, web store) may refuse; ignore
    }
  }
}

module.exports = {
  EXT_DIR,
  PROFILE_DIR,
  CDP_PORT,
  browserLaunchOptions,
  launchArgs,
  hotReload,
};
