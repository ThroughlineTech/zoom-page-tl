// Minimal static server for the test suite. Serves pages on a real hostname
// (localhost) so content.js, which keys by location.hostname, behaves exactly
// as it does in the wild. No files on disk: HTML is generated per route.

const http = require("http");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3210;

// Every page carries a 100x100 #marker box. Tests read its rendered width via
// getBoundingClientRect, which reflects CSS `zoom`, so a marker at zoom 1.5
// measures ~150px. That is a true behavioral check, not just a style read-back.
function page(title, bodyExtra, extraCss) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
<style>
  html, body { margin: 0; }
  body { font: 14px system-ui, sans-serif; }
  #marker { width: 100px; height: 100px; background: #2563eb; }
  ${extraCss || ""}
</style></head>
<body>
  <div id="marker"></div>
  <p>Zoom Page TL test page: ${title}</p>
  ${bodyExtra || ""}
</body></html>`;
}

const routes = {
  "/": () => page("core"),
  // A content block far wider than any viewport, for AutoFit shrink tests.
  "/wide": () =>
    page(
      "wide",
      '<div id="wide" style="width:3000px;height:400px;background:#9ca3af"></div>'
    ),
  // A centered, capped content column narrower than the viewport (the WaPo-style
  // "letterboxed" case): AutoFit should enlarge to fill it, not no-op.
  "/narrow": () =>
    page(
      "narrow",
      '<div id="col" style="max-width:600px;margin:0 auto;height:400px;background:#9ca3af"></div>'
    ),
  // The "content drifts right under zoom" pattern (WaPo et al.): a full-bleed
  // wrapper pinned to the DEVICE viewport via min-width:100vw - which does NOT
  // shrink under CSS `zoom` (Chromium resolves vw against the un-zoomed viewport) -
  // with the content column centered inside it. Under zoom the column drifts off to
  // the side; the Re-center fix must translate the wrapper to bring it back.
  "/drift": () =>
    page(
      "drift",
      '<div id="shell" style="min-width:100vw;background:#eef">' +
        '<div id="col" style="max-width:400px;margin:0 auto;height:1500px;background:#9ca3af"></div>' +
        "</div>"
    ),
  // An inset content column inside a full-width wrapper, plus a full-bleed
  // "breakout" pulled off the left edge with a negative margin (the CNN ad-zone
  // pattern). AutoFit must fill the column and ignore the breakout's overflow.
  "/messy": () =>
    page(
      "messy",
      '<div style="background:#111">' +
        '<div id="col" style="max-width:1200px;margin:0 auto;height:600px;background:#9ca3af"></div>' +
        '<div id="breakout" style="width:2400px;margin-left:-400px;height:300px;background:#444"></div>' +
        "</div>"
    ),
};

const server = http.createServer((req, res) => {
  const url = (req.url || "/").split("?")[0];
  const handler = routes[url] || routes["/"];
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(handler());
});

server.listen(PORT, () => {
  console.log(`test server on http://localhost:${PORT}`);
});
