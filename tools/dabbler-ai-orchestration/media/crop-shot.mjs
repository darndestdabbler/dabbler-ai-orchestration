// Crops a region out of a real capture, using the Playwright already
// installed for the Layer-3 tests.
//
//   node tools/dabbler-ai-orchestration/media/crop-shot.mjs \
//       <input.png> <output.png> <x> <y> <width> <height>
//
// **This script used to render mock-ups**, and the two HTML files its own
// header named -- screenshot-mockup.html and
// marketplace-work-explorer-mock.html -- were deleted in session 110 with
// the webview renderer they belonged to, leaving it an orphan pointing at
// nothing for twenty-seven sessions. It is not restored to that job, and
// the reason is on the page it fed: the Marketplace image was a drawing of
// a tree reading "Default 131 sets" under a caption describing a "Default
// module holding many sets" -- a picture and a caption that had drifted
// from the product and from each other, which is what a drawing does and a
// photograph cannot. So the only thing this crops is a capture something
// else really took: the operator's own, or one
// src/test/playwright/csv-module-walk.spec.ts shot against a running VS
// Code.

import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import path from "node:path";

const [input, output, ...box] = process.argv.slice(2);
if (!input || !output || box.length !== 4) {
  process.stderr.write(
    "usage: node crop-shot.mjs <input.png> <output.png> <x> <y> <width> <height>\n",
  );
  process.exit(2);
}
const [x, y, width, height] = box.map(Number);
if ([x, y, width, height].some((n) => !Number.isFinite(n) || n < 0)) {
  process.stderr.write("crop-shot: the box must be four non-negative numbers\n");
  process.exit(2);
}

const source = path.resolve(input);
const data = readFileSync(source);
// The PNG header, so the page is laid out at the capture's real pixel size
// and the box is in the capture's own coordinates rather than the browser's.
const natural = { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
if (x + width > natural.width || y + height > natural.height) {
  process.stderr.write(
    `crop-shot: the box runs past the capture (${natural.width}x${natural.height})\n`,
  );
  process.exit(2);
}

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: natural.width, height: natural.height },
});
await page.setContent(
  `<body style="margin:0"><img style="display:block" src="data:image/png;base64,${data.toString("base64")}"></body>`,
);
await page.locator("img").waitFor();
await page.screenshot({ path: path.resolve(output), clip: { x, y, width, height } });
await browser.close();

process.stdout.write(`Wrote ${output} (${width}x${height} from ${input})\n`);
