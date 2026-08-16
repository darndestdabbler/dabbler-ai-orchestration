#!/usr/bin/env node
// Does the synthetic pointer survive a native modal? (Set 113 Session 7)
//
//   node scripts/measure-pointer-top-layer.js
//
// Verification's supplementary pass raised this and it is right: a native
// `<dialog>` opened with showModal(), and any open popover, render in the
// browser's TOP LAYER, which sits above every ordinary stacking context no
// matter what z-index anything claims. A pointer that is an ordinary child
// of <body> disappears the moment a walkthrough targets a control inside a
// modal -- and a modal is exactly where a viewer most needs to see what was
// clicked.
//
// So the claim "the pointer is visible" is measured where it is hardest,
// against a full-bleed modal, in pixels, with the fix turned off as the
// control. Two states, one page, one instrument.
//
// Output is ASCII-only (Windows cp1252 console lesson, L-079-1).

"use strict";

const fs = require("fs");
const path = require("path");

const { chromium } = require("@playwright/test");
const { decodePng } = require("./png-metrics.js");
const pointer = require("./pointer.js");

const EXTENSION_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(EXTENSION_ROOT, "..", "..");
const OUT_PATH = path.join(
  REPO_ROOT,
  "docs",
  "session-sets",
  "113-narrated-video-walkthroughs",
  "s7-pointer-top-layer.json"
);

// A modal that fills the viewport in one flat colour. Flat is the point: any
// pixel in the crop that is not this colour came from something drawn ON TOP
// of the modal, which is the only thing being measured -- so the modal's own
// button is deliberately parked far outside the crop. The first run of this
// put it under the hotspot, and both states scored 34%: the instrument was
// measuring a button, and would have called the broken state a pass.
const MODAL_RGB = [12, 74, 110];
const PAGE = `<!doctype html><html><body style="margin:0;background:#ffffff">
<dialog id="m" style="margin:0;padding:0;border:0;width:100vw;height:100vh;max-width:none;max-height:none;background:rgb(12,74,110)">
  <button id="target" style="position:absolute;left:600px;top:460px">Confirm</button>
</dialog>
<script>document.getElementById("m").showModal();</script>
</body></html>`;

const AT = { x: 300, y: 200 };
const CROP = { x: 290, y: 190, width: 56, height: 56 };

// The arrow inks a few hundred pixels of a 3136-pixel crop. The bar is set
// well under that and far above zero, and the control is expected to be
// exactly zero rather than merely under the bar.
const MIN_FOREIGN_FRACTION = 0.02;

function log(msg) {
  console.log("[top-layer] " + msg);
}

/** Fraction of a crop that is NOT the modal's flat colour. */
function foreignFraction(buffer) {
  const image = decodePng(buffer);
  const total = image.width * image.height;
  let foreign = 0;
  for (let i = 0; i < total; i += 1) {
    const p = i * image.channels;
    if (
      Math.abs(image.data[p] - MODAL_RGB[0]) > 24 ||
      Math.abs(image.data[p + 1] - MODAL_RGB[1]) > 24 ||
      Math.abs(image.data[p + 2] - MODAL_RGB[2]) > 24
    ) {
      foreign += 1;
    }
  }
  return total ? foreign / total : 0;
}

async function shoot(page, promote) {
  await page.setContent(PAGE);
  await pointer.ensureSyntheticPointer(page, AT);
  if (!promote) {
    // The control: exactly the fix removed, and nothing else. The element is
    // still drawn, still at the same point, still with the same enormous
    // z-index -- which is precisely the state that was measured to fail.
    await page.evaluate((id) => {
      const node = document.getElementById(id);
      if (node && node.matches(":popover-open")) node.hidePopover();
      node.removeAttribute("popover");
    }, pointer.POINTER_ID);
  }
  await pointer.moveSyntheticPointer(page, AT, { samples: 2, totalMs: 0 });
  await page.waitForTimeout(150);
  return page.screenshot({ clip: CROP });
}

async function main() {
  const report = {
    measurement:
      "the synthetic pointer is visible over a native modal dialog, which " +
      "renders in the browser's top layer above every z-index",
    startedAt: new Date().toISOString(),
    modalColour: MODAL_RGB,
    hotspot: AT,
    crop: CROP,
    minForeignFraction: MIN_FOREIGN_FRACTION,
    promoted: null,
    control: null,
    verdict: null,
    reason: null,
  };

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    report.promoted = Number((foreignFraction(await shoot(page, true))).toFixed(5));
    report.control = Number((foreignFraction(await shoot(page, false))).toFixed(5));
  } finally {
    await browser.close();
  }

  const passed =
    report.promoted >= MIN_FOREIGN_FRACTION && report.control < MIN_FOREIGN_FRACTION;
  report.verdict = passed ? "PASS" : "FAIL";
  report.reason = passed
    ? "the pointer is drawn over the modal (" +
      report.promoted +
      " of the crop is not the modal's colour) and is hidden behind it " +
      "without the top-layer promotion (" +
      report.control +
      ")"
    : "the check did not discriminate: promoted " +
      report.promoted +
      ", control " +
      report.control;

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(OUT_PATH, JSON.stringify(report, null, 2) + "\n", "utf8");
  log("wrote " + path.relative(REPO_ROOT, OUT_PATH));
  log(report.verdict + ": " + report.reason);
  process.exitCode = passed ? 0 : 1;
}

if (require.main === module) {
  main().catch((err) => {
    console.error("[top-layer] failed: " + ((err && err.stack) || err));
    process.exitCode = 1;
  });
}

module.exports = { foreignFraction, MODAL_RGB };
