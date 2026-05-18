// Layer 3 rendering smoke for the activation-time loading state,
// Set 030 Session 5. Verifies the viewsWelcome `when` clause gates the
// "no sets" CTA on scanState == ready — i.e., an empty workspace
// surfaces the CTA AFTER the scan completes, not as a flash before
// the tree first paints.
//
// This is a structural smoke, not a timing smoke: by the time
// Playwright connects via CDP, the activation function has already
// returned and scanState has flipped to "ready" via setImmediate. We
// assert the steady-state shape (welcome content present, scan done)
// because we can't reliably observe the loading sentinel itself in
// the cross-process timing window. The architectural unit-level
// invariant (`provider.getChildren()` returns the loading sentinel
// while scanState == "loading") is covered by mocha unit tests.

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
// Scenario: empty docs/session-sets directory → welcome CTA appears
// after scan completes (no flash before).
// ---------------------------------------------------------------------
test("welcome CTA renders after scan completes on an empty workspace", async () => {
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
    const page = per.launch.page;

    // Click the Dabbler activity-bar icon to open the side bar. We
    // deliberately do NOT call `openSessionSetsView()` because that
    // helper waits for the tree element to be visible — and the
    // tree IS visually replaced by viewsWelcome when sets[] is
    // empty + scanState is ready (which is the exact state we are
    // trying to verify). So we drive the activity icon click here
    // and then assert on the welcome content's text directly
    // inside the side-bar viewlet.
    const activityIcon = page.locator(
      '.activitybar .action-label[aria-label*="Dabbler AI Orchestration"]',
    );
    await activityIcon.waitFor({ state: "visible", timeout: 30_000 });
    await activityIcon.click();

    // Playwright's expect retries until the text appears (or
    // timeout). The key invariant: the welcome content DOES
    // eventually render — which means the `when: scanState == ready`
    // clause activated correctly. If the gate were absent the
    // content would flash; if the gate were broken the content
    // would never render.
    await expect(
      page.getByText(/No session sets in this workspace yet/),
    ).toBeVisible({ timeout: 30_000 });
    // The "Copy adoption bootstrap prompt" string is rendered inside
    // the viewsWelcome viewlet. VS Code's rendering of the
    // [text](command:foo) markdown syntax doesn't expose a
    // role="link" — it's an `<a class="monaco-button">`-style
    // element — so we assert on the plain text instead.
    await expect(
      page.getByText(/Copy adoption bootstrap prompt/i),
    ).toBeVisible();
  } finally {
    await teardown(per);
  }
});
