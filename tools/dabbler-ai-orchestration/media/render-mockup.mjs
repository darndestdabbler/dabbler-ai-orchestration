// One-shot renderer: opens a mockup html in headless Chromium (via the
// Playwright already installed for Layer-3 tests), then takes a
// screenshot of just the .frame element at deviceScaleFactor 2.
//
// Run (defaults preserve the original behavior):
//   node tools/dabbler-ai-orchestration/media/render-mockup.mjs \
//     [input.html] [output.png]
// Default input:  screenshot-mockup.html
// Default output: session-set-explorer-and-spec.png
// Marketplace Work Explorer mock:
//   node media/render-mockup.mjs media/marketplace-work-explorer-mock.html \
//     media/work-explorer-modules.png

import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const htmlPath = path.resolve(
  process.argv[2] || path.join(__dirname, "screenshot-mockup.html"),
);
const outPath = path.resolve(
  process.argv[3] || path.join(__dirname, "session-set-explorer-and-spec.png"),
);

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 900, height: 600 },
  deviceScaleFactor: 2, // crisp output on Marketplace zoom
});
const page = await ctx.newPage();
await page.goto("file:///" + htmlPath.replace(/\\/g, "/"));
const frame = await page.waitForSelector(".frame");
await frame.screenshot({ path: outPath });
await browser.close();

console.log("Wrote", outPath);
