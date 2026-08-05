// Set 110 Session 3 — the falsifier for this repo's most expensive defect
// class, and the one the operator's session ordering demanded be PROVEN
// rather than asserted.
//
// The specimen (Set 108, recorded in the deleted `tree.css` and in L-064-12):
// a hover-revealed action strip that occupied its own line in the FLOW ABOVE
// the tree content. When it appeared or disappeared, everything below it
// moved. Losing focus on mousedown hid the strip mid-click, the bucket header
// shifted ~23px between mousedown and mouseup, and the browser therefore
// fired no `click` at all — the collapse was silently swallowed. Layer 2 and
// every static gate stayed green the whole time it was live. Only Layer 3
// caught it, and only because someone ran Layer 3.
//
// The webview that hosted that defect is deleted. That does NOT retire the
// class: the container still stacks a webview above the tree, so a surface
// above tree content that gains flow height and pointer capture is still
// reachable — the step-3.5 analyst named it as this session's riskiest thing
// for exactly that reason.
//
// So this file does two things:
//
//   1. `catches a click-swallowing overlay` — SEEDS the regression, in the
//      real workbench frame, at the top of the tree area with pointer events
//      live, and requires a NORMAL (non-forced) click on a module row to
//      fail to produce its lazy child. If the seed does not break the click,
//      this test fails LOUDLY: an unfalsifiable guard is worse than none,
//      because it reads as coverage.
//   2. `the same click works once the overlay is gone` — removes the seed and
//      requires the identical interaction to succeed.
//
// Together they are the fail/pass pair the operator asked for, run on every
// suite execution rather than performed once by hand and written up. That is
// the difference between a seeded regression and a permanent falsifier.
//
// Deliberately NOT used anywhere here: `force: true`, `dispatchEvent`, or a
// presence-only assertion. Each of those would step over exactly the failure
// mode this exists to detect.

import { expect, test } from "@playwright/test";
import {
  cleanupTmpDir,
  closeVSCode,
  LaunchedVSCode,
  launchVSCode,
  makeSet,
  makeTmpDir,
  openWorkExplorerTree,
  treeRow,
} from "./electronLaunch";

const OVERLAY_ID = "dabbler-seeded-click-swallower";

interface PerTest {
  tmpPath?: string;
  launch?: LaunchedVSCode;
}

async function teardown(per: PerTest): Promise<void> {
  if (per.launch) {
    try {
      await closeVSCode(per.launch);
    } catch {
      /* best effort */
    }
  }
  if (per.tmpPath) cleanupTmpDir(per.tmpPath);
}

/**
 * Seed the Set 108 defect shape over the tree pane.
 *
 * Production-equivalent in the ways that matter: it is inside the same
 * document as the tree (not a separate webview iframe), it occupies real
 * layout space at the top of the pane body, it has non-zero height, and it
 * accepts pointer events. It is transparent only so the trace is readable —
 * opacity was never what made the original defect invisible.
 */
async function seedOverlay(
  page: import("@playwright/test").Page,
  pane: import("@playwright/test").Locator,
): Promise<void> {
  // The evaluate body runs in the workbench page, where DOM globals exist.
  // This project's tsconfig has no `dom` lib (it targets the extension host),
  // so browser-side code is deliberately untyped rather than dragging DOM
  // typings into the whole build — the same convention
  // `icon-render-mechanism.spec.ts` established.
  await pane.locator(".pane-body").evaluate((body, id) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const g = globalThis as any;
    const host = body as any;
    const el = g.document.createElement("div");
    el.id = id;
    el.style.cssText = [
      "position:absolute",
      "top:0",
      "left:0",
      "right:0",
      "height:48px",
      "z-index:1000",
      "pointer-events:auto",
      "background:transparent",
    ].join(";");
    if (g.getComputedStyle(host).position === "static") {
      host.style.position = "relative";
    }
    host.prepend(el);
  }, OVERLAY_ID);
  await page.waitForTimeout(200);
}

async function removeOverlay(
  page: import("@playwright/test").Page,
): Promise<void> {
  await page.evaluate((id) => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const g = globalThis as any;
    const el = g.document.getElementById(id);
    if (el) el.remove();
  }, OVERLAY_ID);
  await page.waitForTimeout(200);
}

/**
 * Click a module row's twistie the way a person would, and report whether the
 * child bucket appeared. No force, no synthetic events.
 */
async function tryExpandByClick(
  page: import("@playwright/test").Page,
  pane: import("@playwright/test").Locator,
  label: string,
  child: string,
): Promise<boolean> {
  const row = treeRow(pane, label);
  await row.waitFor({ state: "visible", timeout: 15_000 });
  try {
    await row.locator(".monaco-tl-twistie").click({ timeout: 5_000 });
  } catch {
    // A click the overlay intercepts raises rather than silently missing in
    // recent Playwright; both outcomes mean the same thing here.
    return false;
  }
  await page.waitForTimeout(600);
  return (await treeRow(pane, child).count()) > 0;
}

test.describe("Set 110 S3 — the click-swallowing overlay class", () => {
  const per: PerTest = {};
  test.afterEach(async () => {
    await teardown(per);
    per.tmpPath = undefined;
    per.launch = undefined;
  });

  test("a seeded overlay swallows the expand click, and removing it restores the click", async () => {
    per.tmpPath = makeTmpDir("dabbler-overlay-seed");
    const h = makeSet(per.tmpPath, "001-overlay-probe", 2);

    per.launch = await launchVSCode(h.repo_root);
    const page = per.launch.page;
    const pane = await openWorkExplorerTree(page);

    // --- 1. WITH the seed: the click must NOT work. ---
    await seedOverlay(page, pane);
    const expandedWithOverlay = await tryExpandByClick(
      page,
      pane,
      "Default",
      "Not Started",
    );
    expect(
      expandedWithOverlay,
      "the seeded overlay did NOT swallow the click — this guard is not " +
        "falsifiable as written, which is worse than having no guard at all, " +
        "because it reads as coverage. Fix the seed, do not delete the test.",
    ).toBe(false);

    // --- 2. WITHOUT the seed: the identical click must work. ---
    await removeOverlay(page);
    const expandedAfterRemoval = await tryExpandByClick(
      page,
      pane,
      "Default",
      "Not Started",
    );
    expect(
      expandedAfterRemoval,
      "the same click failed with no overlay present — the tree itself is not " +
        "expanding, which is a real product defect and not a harness problem",
    ).toBe(true);
  });
});
