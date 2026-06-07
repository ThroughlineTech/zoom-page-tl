// One-off: generate the greyed "extension is off everywhere" toolbar icons from
// the color ones. Greyscale + reduced opacity is the conventional "disabled"
// look. The service worker swaps to these via chrome.action.setIcon when the
// global disable (cfg:off) is on. Run once and commit the output; not shipped
// (lives in scripts/, ignored by lint) and not part of any build step.
//
//   node scripts/make-off-icons.js
//
// Uses Playwright's headless Chromium (already a dev dependency) just to get a
// canvas for the desaturation - no image library needed.

const { chromium } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const SIZES = [16, 32, 48, 128];
const ICONS = path.resolve(__dirname, "..", "extension", "icons");
const OUT = path.join(ICONS, "off");

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const s of SIZES) {
    const src = fs
      .readFileSync(path.join(ICONS, `icon${s}.png`))
      .toString("base64");
    const dataUrl = await page.evaluate(
      async ({ s, src }) => {
        const img = new Image();
        img.src = "data:image/png;base64," + src;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = s;
        c.height = s;
        const ctx = c.getContext("2d");
        ctx.filter = "grayscale(1)";
        ctx.globalAlpha = 0.55; // faded = "disabled"
        ctx.drawImage(img, 0, 0, s, s);
        return c.toDataURL("image/png");
      },
      { s, src }
    );
    const b64 = dataUrl.replace(/^data:image\/png;base64,/, "");
    fs.writeFileSync(path.join(OUT, `icon${s}.png`), Buffer.from(b64, "base64"));
    console.log(`wrote icons/off/icon${s}.png`);
  }
  await browser.close();
})();
