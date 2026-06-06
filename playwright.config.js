const { defineConfig } = require("@playwright/test");

const PORT = 3210;

// The extension shares one service worker and one chrome.storage area across
// all tabs, so tests must not run in parallel against the same browser. One
// worker, serial, with storage cleared in beforeEach keeps them isolated.
module.exports = defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
  },
  webServer: {
    command: "node tests/server.js",
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: true,
    env: { PORT: String(PORT) },
    stdout: "ignore",
    stderr: "pipe",
  },
});
