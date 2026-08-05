// Set 110 Session 2 — settle, by running code, HOW VS Code renders a
// `TreeItem.iconPath` that points at an SVG file.
//
// WHY THIS TEST EXISTS. Session 1 found a real defect in the operator's
// four status SVGs: they carry hardcoded `#ffffff` / `#000000`, and
// `not-started.svg` is nearly invisible on a light theme. It recommended
// re-authoring them to a single `fill:currentColor` path, "the same
// idiom already proven in this repo", and the Session 2 step-3.5
// analyst independently recommended the same at HIGH confidence.
//
// Both were reasoning from the ACTIVITY-BAR icon, which the operator had
// just fixed that way. That is a `contributes.viewsContainers` icon, and
// it is not rendered by the same mechanism as a tree row's icon. If VS
// Code paints a tree icon as a CSS `background-image`, `currentColor`
// inside the referenced SVG resolves against that SVG's own document —
// which has no inherited colour — and the recommended fix would make
// every status glyph render in one fixed colour on both themes. That
// would be worse than the defect it set out to cure.
//
// So this test asks the platform instead of the documentation, and the
// answer is deterministic rather than a screenshot someone has to
// squint at: it reads the COMPUTED STYLE of a real tree row's icon
// element in a real Extension Development Host.
//
//   mask-image present   -> the SVG is a stencil; CSS supplies the
//                           colour; ONE asset suffices and its own
//                           fills are irrelevant.
//   background-image only-> the SVG is painted as authored; a
//                           {light, dark} pair is required.
//
// The result is auditable rather than asserted: the probe is written to
// the run's own artifact directory every time, and to the TRACKED
// evidence file `s2-evidence/icon-render-mechanism.json` only when
// `DABBLER_WRITE_EVIDENCE=1` asks for it.
//
// That split exists because the tracked file is a measurement OF RECORD.
// Rewriting it on every run stamped a fresh timestamp and a
// machine-specific absolute URI into the checkout, so merely running the
// suite left the working tree dirty and quietly superseded the artifact
// this session's write-up quotes — verification round 1 caught both
// halves of that. The committed file is the measurement; a re-run
// reproduces it beside the run instead of over it.
//
// The assertion below is deliberately a REPORT plus a weak invariant —
// this test's job is to inform the design, not to freeze whichever
// answer today's VS Code gives.

import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  cleanupTmpDir,
  closeVSCode,
  launchVSCode,
  LaunchedVSCode,
  makeSet,
  makeTmpDir,
} from "./electronLaunch";

const EVIDENCE_DIR = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "docs",
  "session-sets",
  "110-work-explorer-native-treeview",
  "s2-evidence",
);

interface IconProbe {
  found: boolean;
  className?: string;
  backgroundImage?: string;
  maskImage?: string;
  webkitMaskImage?: string;
  color?: string;
  width?: string;
  height?: string;
}

/**
 * Write what the sidebar actually contains, so a selector miss produces
 * evidence instead of another guess.
 */
async function dumpSidebar(
  page: import("@playwright/test").Page,
  tag: string,
): Promise<void> {
  const dump = await page.evaluate(() => {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const g = globalThis as any;
    const panes: any[] = Array.from(g.document.querySelectorAll(".pane"));
    return panes.map((p: any) => ({
      title: p.querySelector(".title")?.textContent ?? null,
      headerAriaExpanded: p.querySelector(".pane-header")?.getAttribute("aria-expanded") ?? null,
      id: p.id || null,
      rowCount: p.querySelectorAll(".monaco-list-row").length,
      iconCount: p.querySelectorAll(".custom-view-tree-node-item-icon").length,
      welcome: p.querySelector(".welcome-view-content")?.textContent?.slice(0, 200) ?? null,
    }));
    /* eslint-enable @typescript-eslint/no-explicit-any */
  });
  // Unlike the probe result, this fires ONLY on a failing run, where
  // leaving a diagnostic in the checkout is exactly what is wanted.
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(EVIDENCE_DIR, `sidebar-dump-${tag}.json`),
    JSON.stringify(dump, null, 2),
    "utf-8",
  );
  // eslint-disable-next-line no-console
  console.log(`[icon-render-mechanism] sidebar dump (${tag}):`, JSON.stringify(dump, null, 2));
}

/**
 * Write `payload` to the run's artifact directory always, and to the
 * tracked evidence file only on explicit opt-in.
 */
function recordEvidence(
  testInfo: import("@playwright/test").TestInfo,
  filename: string,
  payload: unknown,
): void {
  const body = JSON.stringify(payload, null, 2);
  fs.writeFileSync(testInfo.outputPath(filename), body, "utf-8");
  if (process.env.DABBLER_WRITE_EVIDENCE === "1") {
    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    fs.writeFileSync(path.join(EVIDENCE_DIR, filename), body, "utf-8");
  }
}

// Playwright REQUIRES the first parameter to be an object-destructuring
// pattern even when no fixture is used — a named placeholder throws
// "First argument must use the object destructuring pattern" at load.
// So the empty pattern stays and the lint rule yields, rather than the
// other way round. (Renaming it to satisfy the linter type-checked and
// linted clean, and failed the moment the spec was actually run.)
// eslint-disable-next-line no-empty-pattern
test("TreeItem.iconPath render mechanism — mask vs background-image", async ({}, testInfo) => {
  const tmpPath = makeTmpDir("dabbler-icon-mech");
  let launch: LaunchedVSCode | undefined;
  try {
    const handle = makeSet(tmpPath, "001-icon-mechanism-probe", 3);

    launch = await launchVSCode(handle.repo_root);
    const page = launch.page;

    // Open the Dabbler container, then the NATIVE tree (the webview is
    // still the default surface this session, so the native view is
    // contributed collapsed underneath it and must be expanded).
    const activityIcon = page.locator(
      '.activitybar .action-label[aria-label*="Dabbler AI Orchestration"]',
    );
    await activityIcon.waitFor({ state: "visible", timeout: 30_000 });
    await activityIcon.click();

    // The native view ships COLLAPSED this session (the webview is still
    // the default surface), so it must be expanded before it renders any
    // row. Find its pane by title text and click the twisty.
    const nativePane = page
      .locator(".pane")
      .filter({ has: page.locator('.title:text-is("Work Explorer (native preview)")') });
    await nativePane.first().waitFor({ state: "visible", timeout: 30_000 });
    const header = nativePane.first().locator(".pane-header");
    if ((await header.getAttribute("aria-expanded")) === "false") {
      await header.click();
      await page.waitForTimeout(1000);
    }

    // Drill to a SET row, which is where a file-backed status glyph
    // renders (module and bucket rows use ThemeIcons).
    const rows = nativePane.first().locator(".monaco-list-row");
    try {
      await rows.first().waitFor({ state: "visible", timeout: 20_000 });
    } catch {
      // Self-diagnosing rather than silently timing out: dump what the
      // sidebar actually contains so the next attempt fixes the real
      // problem. Session 1 lost two real-host attempts to selector
      // guesses with no evidence to correct them.
      await dumpSidebar(page, "no-rows");
      throw new Error(
        "native tree pane rendered no rows — see s2-evidence/sidebar-dump-no-rows.json",
      );
    }

    // Expand every visible collapsed row until a set row appears. Three
    // levels: module -> bucket -> set. Bounded so a structural change
    // cannot turn this into an infinite loop.
    for (let depth = 0; depth < 3; depth++) {
      const collapsed = nativePane.first().locator('.monaco-list-row[aria-expanded="false"]');
      const n = await collapsed.count();
      if (n === 0) break;
      for (let i = 0; i < n; i++) {
        await collapsed.nth(0).click();
        await page.waitForTimeout(150);
      }
      await page.waitForTimeout(300);
    }

    // The evaluate body runs in the workbench page, where DOM globals
    // exist; this project's tsconfig has no `dom` lib (it targets the
    // extension host), so the browser-side code is deliberately untyped
    // rather than dragging DOM typings into the whole build.
    const probe: IconProbe = await page.evaluate(() => {
      /* eslint-disable @typescript-eslint/no-explicit-any */
      const g = globalThis as any;
      // Scan the whole sidebar: the icon element class is unique enough
      // that scoping to one pane buys nothing and risks missing it if
      // VS Code renames a container.
      const pane = g.document.querySelector(".sidebar") ?? g.document.body;
      const icons: any[] = Array.from(
        pane.querySelectorAll(".custom-view-tree-node-item-icon"),
      );
      const hasUrl = (v: string | undefined): boolean =>
        !!v && v !== "none" && v.indexOf("url(") >= 0;
      for (const el of icons) {
        const cs = g.getComputedStyle(el);
        const bg: string = cs.backgroundImage;
        const mask: string = cs.maskImage;
        const wmask: string = cs.webkitMaskImage;
        // Skip the ThemeIcon rows — codicon glyphs carry no url().
        if (hasUrl(bg) || hasUrl(mask) || hasUrl(wmask)) {
          return {
            found: true,
            className: String(el.className),
            backgroundImage: bg,
            maskImage: mask,
            webkitMaskImage: wmask,
            color: cs.color,
            width: cs.width,
            height: cs.height,
          };
        }
      }
      return { found: false };
      /* eslint-enable @typescript-eslint/no-explicit-any */
    });

    fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
    const usesMask =
      !!probe.maskImage && probe.maskImage !== "none" && probe.maskImage.includes("url(");
    const usesWebkitMask =
      !!probe.webkitMaskImage &&
      probe.webkitMaskImage !== "none" &&
      probe.webkitMaskImage.includes("url(");
    const usesBackground =
      !!probe.backgroundImage &&
      probe.backgroundImage !== "none" &&
      probe.backgroundImage.includes("url(");
    const verdict = probe.found
      ? usesMask || usesWebkitMask
        ? "MASKED — one asset suffices; the SVG's own fills are irrelevant"
        : usesBackground
          ? "BACKGROUND-IMAGE — the SVG paints as authored; a {light, dark} pair is required"
          : "INCONCLUSIVE — an icon element was found but neither mechanism carried a url()"
      : "NO FILE-BACKED ICON FOUND — the probe never reached a set row";

    recordEvidence(testInfo, "icon-render-mechanism.json", {
      question:
        "Does VS Code render TreeItem.iconPath (a file Uri) as a CSS mask " +
        "or as a background-image? The answer decides whether the operator's " +
        "four status SVGs need {light, dark} variants or a single " +
        "currentColor asset.",
      probe,
      verdict,
      measuredAt: new Date().toISOString(),
    });

    // eslint-disable-next-line no-console
    console.log(`[icon-render-mechanism] ${verdict}\n${JSON.stringify(probe, null, 2)}`);

    // The invariant worth asserting: the probe must actually have found
    // a file-backed icon. A silently-empty probe would let the session
    // "decide" from no evidence at all, which is the failure mode
    // Session 1 spent three verification rounds on.
    expect(probe.found, `icon probe found nothing — verdict: ${verdict}`).toBe(true);
  } finally {
    if (launch) await closeVSCode(launch);
    cleanupTmpDir(tmpPath);
  }
});
