// Re-center (rc:<host>). Some sites size full-bleed wrappers to the device viewport
// (min-width:100vw), which does NOT shrink under CSS `zoom`, so content centered
// inside drifts sideways. The /drift fixture reproduces that. With rc on, the content
// script translates the wrapper so the column re-centers; with it off, nothing moves.

const { test, expect } = require("./fixtures");

function colCenter(page) {
  return page.evaluate(() => {
    const r = document.getElementById("col").getBoundingClientRect();
    return (r.left + r.right) / 2;
  });
}
function viewport(page) {
  return page.evaluate(() => document.documentElement.clientWidth);
}
// The correction is applied via a content-script-owned stylesheet rule (not inline
// style), so it survives the page's re-renders. Read that rule's text.
function recenterRule(page) {
  return page.evaluate(() => {
    const s = document.getElementById("zp-recenter");
    return s ? s.textContent : "";
  });
}

test.beforeEach(async ({ serviceWorker }) => {
  await serviceWorker.evaluate(() => chrome.storage.local.clear());
});

test("re-center pulls a drifting column back to the viewport center", async ({
  page,
  serviceWorker,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:localhost": 2.0 })
  );
  await page.goto("/drift");

  const vw = await viewport(page);
  // Without re-center, the column has drifted well past the viewport center.
  await expect.poll(() => colCenter(page)).toBeGreaterThan(vw * 0.62);
  expect(await recenterRule(page)).toBe("");

  // Turn re-center on: the wrapper is translated so the column centers.
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "rc:localhost": true })
  );
  await expect
    .poll(async () => Math.abs((await colCenter(page)) - vw / 2))
    .toBeLessThan(60);
  expect(await recenterRule(page)).toContain("translateX");
});

test("turning re-center off clears the transform (column drifts again)", async ({
  page,
  serviceWorker,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "z:localhost": 2.0, "rc:localhost": true })
  );
  await page.goto("/drift");

  const vw = await viewport(page);
  await expect
    .poll(async () => Math.abs((await colCenter(page)) - vw / 2))
    .toBeLessThan(60);

  await serviceWorker.evaluate(() =>
    chrome.storage.local.remove("rc:localhost")
  );
  await expect.poll(() => recenterRule(page)).toBe("");
  await expect.poll(() => colCenter(page)).toBeGreaterThan(vw * 0.62);
});

test("re-center does nothing at 100% (no zoom, nothing to correct)", async ({
  page,
  serviceWorker,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({ "rc:localhost": true })
  );
  await page.goto("/drift"); // no z: => 100%
  await page.waitForTimeout(500);
  expect(await recenterRule(page)).toBe("");
});

test("re-center is inert while the site is suppressed (excluded)", async ({
  page,
  serviceWorker,
}) => {
  await page.setViewportSize({ width: 1200, height: 900 });
  await serviceWorker.evaluate(() =>
    chrome.storage.local.set({
      "z:localhost": 2.0,
      "rc:localhost": true,
      "x:localhost": true,
    })
  );
  await page.goto("/drift");
  await page.waitForTimeout(500);
  // Excluded => held at 100%, no zoom, so no re-center transform.
  expect(await recenterRule(page)).toBe("");
});
