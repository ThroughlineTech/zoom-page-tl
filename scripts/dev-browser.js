// Live dev browser: a headed Chromium window the author watches, with the
// unpacked extension loaded and auto hot-reload on save.
//
// Run it in the background once per session:
//   npm run dev               # opens about:blank
//   npm run dev -- https://example.com/page   # opens straight to a repro URL
//
// While it runs, every save under extension/ reloads the extension and refreshes
// the open tab (debounced), so an agent's fix is live by the time it says "have
// a look." The persistent .dev-profile/ keeps logins between runs; log in once
// on a site that needs it and it sticks. Ctrl+C closes it cleanly.

const { chromium } = require("@playwright/test");
const fs = require("fs");
const lib = require("./dev-lib");

(async () => {
  const startUrl = process.argv[2] || "about:blank";

  const context = await chromium.launchPersistentContext(lib.PROFILE_DIR, {
    headless: false,
    viewport: null, // use the real window size, not an emulated viewport
    ...lib.browserLaunchOptions(),
    args: lib.launchArgs,
  });

  // Wait for the extension's service worker so the first reload has something to
  // talk to.
  if (!context.serviceWorkers().length) {
    await context.waitForEvent("serviceworker").catch(() => {});
  }

  const page = context.pages()[0] || (await context.newPage());
  if (startUrl !== "about:blank") {
    await page
      .goto(startUrl, { waitUntil: "domcontentloaded" })
      .catch((e) => console.error(`[dev] initial nav failed: ${e.message}`));
  }

  console.log(`[dev] dev browser up`);
  console.log(`[dev]   profile:   ${lib.PROFILE_DIR}`);
  console.log(`[dev]   extension: ${lib.EXT_DIR}`);
  console.log(`[dev]   cdp:       http://127.0.0.1:${lib.CDP_PORT}`);
  console.log(`[dev]   watching extension/ - saves auto-reload. Ctrl+C to quit.`);

  // Debounced watcher. fs.watch can fire several events per save on Windows, so
  // collapse a burst into one reload and skip overlapping reloads.
  let timer = null;
  let reloading = false;
  let again = false;
  const run = async () => {
    if (reloading) {
      again = true;
      return;
    }
    reloading = true;
    console.log(`[dev] change detected -> reloading`);
    try {
      await lib.hotReload(context);
      console.log(`[dev] reloaded`);
    } catch (e) {
      console.error(`[dev] reload error: ${e.message}`);
    }
    reloading = false;
    if (again) {
      again = false;
      run();
    }
  };
  fs.watch(lib.EXT_DIR, { recursive: true }, () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(run, 250);
  });

  const shutdown = async () => {
    console.log(`\n[dev] closing`);
    try {
      await context.close();
    } catch (e) {}
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Hold the process open; the persistent context keeps the browser alive only
  // while this process runs.
  await new Promise(() => {});
})();
