// Playwright fixtures for loading the unpacked MV3 extension.
//
// MV3 extensions (with a service-worker background) require the full Chromium
// build, not the headless-shell. The `channel: "chromium"` option launches that
// full build in the new headless mode, which supports extensions and their
// service workers, so the suite can run unattended.

const { test: base, chromium, expect } = require("@playwright/test");
const path = require("path");

const pathToExtension = path.resolve(__dirname, "..", "extension");

const test = base.extend({
  context: async ({}, use) => {
    const context = await chromium.launchPersistentContext("", {
      channel: "chromium",
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        "--no-first-run",
        "--no-default-browser-check",
      ],
    });
    await use(context);
    await context.close();
  },

  // The extension's service worker. We run privileged calls (chrome.storage,
  // chrome.tabs.getZoomSettings) inside it via serviceWorker.evaluate(...).
  serviceWorker: async ({ context }, use) => {
    let [sw] = context.serviceWorkers();
    if (!sw) sw = await context.waitForEvent("serviceworker");
    await use(sw);
  },

  extensionId: async ({ serviceWorker }, use) => {
    const extensionId = serviceWorker.url().split("/")[2];
    await use(extensionId);
  },
});

module.exports = { test, expect };
