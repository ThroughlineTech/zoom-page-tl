// Force a hot reload of the running dev browser.
//
//   npm run reload
//
// The watcher in dev-browser.js already reloads on save, so this is a fallback:
// use it if a save did not register, after a git checkout/stash that changed
// files without an editor save, or to reload on demand. It attaches over CDP, so
// it does not close the browser it connects to.

const { chromium } = require("@playwright/test");
const lib = require("./dev-lib");

(async () => {
  let browser;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${lib.CDP_PORT}`);
  } catch (e) {
    console.error(
      `[reload] could not connect on :${lib.CDP_PORT} - is 'npm run dev' running?`
    );
    process.exit(1);
  }
  const context = browser.contexts()[0];
  await lib.hotReload(context);
  console.log(`[reload] extension reloaded + tabs refreshed`);
  await browser.close(); // disconnects CDP only; the dev browser stays open
  process.exit(0);
})();
