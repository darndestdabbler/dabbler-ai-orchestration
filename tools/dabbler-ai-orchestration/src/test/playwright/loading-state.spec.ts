// Layer 3 rendering smoke for the activation-time loading state,
// Set 030 Session 5. Verifies an empty workspace surfaces the
// Getting Started empty state AFTER the scan completes, not as a
// flash before the view first paints. (The viewsWelcome `when`-clause
// gating this spec originally asserted was retired with the welcome
// CTA in Sets 060/063 — the webview's scanState-driven loading
// sentinel is the gating mechanism now.)
//
// This is a structural smoke, not a timing smoke: by the time
// Playwright connects via CDP, the activation function has already
// returned and scanState has flipped to "ready" via setImmediate. We
// assert the steady-state shape (Getting Started form present, scan
// done) because we can't reliably observe the loading sentinel itself
// in the cross-process timing window. The architectural unit-level
// invariant (the loading sentinel renders while scanState ==
// "loading") is covered by mocha unit tests.

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
  openSessionSetsView,
} from "./electronLaunch";

interface PerTest {
  tmpPath?: string;
  launch?: LaunchedVSCode;
  emptyRepoRoot?: string;
}

async function teardown(per: PerTest): Promise<void> {
  const errs: unknown[] = [];
  if (per.launch) {
    try {
      await closeVSCode(per.launch);
    } catch (e) {
      errs.push(e);
    }
  }
  if (per.tmpPath) {
    try {
      cleanupTmpDir(per.tmpPath);
    } catch (e) {
      errs.push(e);
    }
  }
  if (errs.length > 0) {
    // eslint-disable-next-line no-console
    console.warn("teardown encountered cleanup errors:", errs);
  }
}

// ---------------------------------------------------------------------
// Scenario: empty docs/session-sets directory → the Getting Started
// form appears after scan completes (no flash before).
// ---------------------------------------------------------------------
test("Getting Started form renders after scan completes on an empty workspace", async () => {
  const per: PerTest = {};
  try {
    // Build a workspace shell that has a `docs/session-sets/` dir
    // (so the extension activates per `workspaceContains` rule) but
    // zero actual session sets inside it. The harness's makeSet
    // helper produces a real set first; we delete it after capturing
    // the repo root so the directory tree the extension scans is
    // genuinely empty.
    per.tmpPath = makeTmpDir("dabbler-pw-empty");
    const seed = makeSet(per.tmpPath, "seed-to-be-removed", 2);
    per.emptyRepoRoot = seed.repo_root;
    // Remove the seed set so docs/session-sets/ is empty but
    // present. The extension's activationEvents
    // `workspaceContains:docs/session-sets` still fires.
    fs.rmSync(seed.set_dir, { recursive: true, force: true });
    // Sanity: directory exists but is empty.
    const sessionSetsDir = path.join(per.emptyRepoRoot, "docs", "session-sets");
    expect(fs.existsSync(sessionSetsDir)).toBe(true);
    expect(fs.readdirSync(sessionSetsDir)).toHaveLength(0);

    per.launch = await launchVSCode(per.emptyRepoRoot);

    // Set 060 (Getting Started redesign): an open folder with no
    // session sets renders the staged Getting Started form inside the
    // Explorer webview (gettingStarted.mode == "getting-started") —
    // the only empty state since Set 063 retired the welcome CTA. The
    // companion instructions doc auto-opens as a markdown preview — a
    // second webview iframe — which is why openSessionSetsView scopes
    // its outer locator to the side bar.
    const inner = await openSessionSetsView(per.launch.page);
    await expect(inner.locator(".getting-started")).toBeVisible({
      timeout: 30_000,
    });
    await expect(inner.locator(".gs-title")).toHaveText("Getting Started");
    // The steady-state shape this smoke exists for: the scan has
    // completed and the form's first actionable step is rendered
    // (no loading sentinel, no flash of an empty tree).
    await expect(
      inner.locator('[data-gs-action="build-structure"]'),
    ).toBeVisible();
  } finally {
    await teardown(per);
  }
});
