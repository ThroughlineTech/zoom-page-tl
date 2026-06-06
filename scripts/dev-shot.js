// Screenshot a URL in the running dev browser (with the extension applied).
//
//   npm run shot -- https://example.com/page
//   npm run shot -- https://example.com/page .dev-shots/before.png
//
// For the "here is a URL and a picture" bug flow: reproduce the report in the
// real extension and capture what it looks like, so a fix can be compared shot
// against shot. It opens a temporary tab in the dev window, navigates, captures,
// and closes the tab. Output defaults to .dev-shots/shot.png (git-ignored).

const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const lib = require("./dev-lib");

(async () => {
  const url = process.argv[2];
  const out =
    process.argv[3] || path.resolve(__dirname, "..", ".dev-shots", "shot.png");
  if (!url) {
    console.error("usage: npm run shot -- <url> [outfile]");
    process.exit(1);
  }

  let browser;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${lib.CDP_PORT}`);
  } catch (e) {
    console.error(
      `[shot] could not connect on :${lib.CDP_PORT} - is 'npm run dev' running?`
    );
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const context = browser.contexts()[0];
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "load", timeout: 30000 });
  } catch (e) {
    console.error(`[shot] nav warning: ${e.message}`);
  }
  await page.waitForTimeout(800); // let late layout/zoom settle
  await page.screenshot({ path: out });
  console.log(`[shot] saved ${out}`);
  await page.close();
  await browser.close();
  process.exit(0);
})();
