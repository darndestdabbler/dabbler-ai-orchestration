// Set 115 Session 2 — the Layer 3 spec for left-clicking a session row.
//
// What only a real host can show. The line arithmetic — which lines of
// `spec.md` belong to session 2 — is proven exhaustively at Layer 2 in
// `sessionPlanReveal.test.ts`, and re-asserting it here would buy nothing
// at ~40 seconds a run. What a unit test cannot reach is the part the
// operator actually experiences: that a click on the fourth level of the
// tree lands them IN the file, at their session, with the editor scrolled
// there — and that a spec which cannot answer still puts the real file on
// screen instead of an error.
//
// The cursor position is read from the workbench status bar rather than
// from the rendered text, deliberately. A short fixture spec fits entirely
// in the viewport, so "the heading is visible" would pass even if nothing
// was revealed at all; `Ln <n>, Col 1` is the assertion that can fail.

import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  cleanupTmpDir,
  closeVSCode,
  expandTreeRow,
  LaunchedVSCode,
  launchVSCode,
  makeSet,
  makeTmpDir,
  openWorkExplorerTree,
  revealSetRow,
  treeRow,
} from "./electronLaunch";

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
 * The 1-based line of a session's heading in the fixture spec — the line
 * the editor's status bar must report after the click.
 *
 * Read from the fixture on disk rather than hardcoded: the harness owns
 * the spec template, and a hardcoded number would turn a template edit
 * into a mysterious failure in an unrelated spec.
 */
function headingLine(setDir: string, sessionNumber: number): number {
  const lines = fs.readFileSync(path.join(setDir, "spec.md"), "utf-8").split("\n");
  const index = lines.findIndex((line) =>
    new RegExp(`^###\\s+Session\\s+${sessionNumber}\\b`).test(line),
  );
  expect(index, "the fixture spec declares no such session heading").toBeGreaterThan(-1);
  return index + 1;
}

function statusBar(launch: LaunchedVSCode) {
  return launch.page.locator(".statusbar");
}

function specTab(launch: LaunchedVSCode) {
  return launch.page.locator(".tabs-container .tab").filter({ hasText: "spec.md" });
}

test.describe("Set 115 S2 — a session row opens its own plan", () => {
  const per: PerTest = {};
  test.afterEach(async () => {
    await teardown(per);
    per.tmpPath = undefined;
    per.launch = undefined;
  });

  test("clicking a session lands the editor on that session's section", async () => {
    per.tmpPath = makeTmpDir("dabbler-session-reveal");
    // `withSessionSteps` gives the fixture spec real `### Session N of M:`
    // headings — the shape the locator reads.
    const h = makeSet(per.tmpPath, "115-reveal-me", 2, { withSessionSteps: true });
    const expectedLine = headingLine(h.set_dir, 2);

    per.launch = await launchVSCode(h.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);
    await revealSetRow(pane, { bucket: "Not Started", set: "115-reveal-me" });
    await expandTreeRow(pane, "115-reveal-me");

    // Before the click there is no editor at all: this is what proves the
    // tab and the cursor position below came from the click.
    await expect(specTab(per.launch)).toHaveCount(0);

    await treeRow(pane, "Fixture session 2").click();

    await expect(specTab(per.launch)).toHaveCount(1, { timeout: 15_000 });
    // The second session's heading, at the cursor — not the top of the
    // file, and not session 1's block.
    await expect(statusBar(per.launch)).toContainText(`Ln ${expectedLine}, Col 1`, {
      timeout: 15_000,
    });
    // The section is on screen, which is the point of revealing AtTop
    // rather than letting a minimal scroll leave it on the last row.
    // Scoped to the editor PART: the workbench hosts other Monaco
    // instances (the chat input, for one) whose `.view-lines` would
    // otherwise make this locator ambiguous.
    await expect(
      per.launch.page.locator(".part.editor .view-lines").first(),
    ).toContainText("Fixture session 2", { timeout: 15_000 });
  });

  test("a session with no heading in the spec opens the real file at the top", async () => {
    // The degradation case, and it is not hypothetical: a spec with NO
    // `### Session N` headings is exactly what every pre-114 consumer-repo
    // spec looks like, and the default fixture keeps that shape. The
    // operator still ends up looking at the real file.
    per.tmpPath = makeTmpDir("dabbler-session-reveal-degrade");
    const h = makeSet(per.tmpPath, "115-no-headings", 2);

    per.launch = await launchVSCode(h.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);
    await revealSetRow(pane, { bucket: "Not Started", set: "115-no-headings" });
    await expandTreeRow(pane, "115-no-headings");

    await treeRow(pane, /^Session 2/).click();

    await expect(specTab(per.launch)).toHaveCount(1, { timeout: 15_000 });
    await expect(statusBar(per.launch)).toContainText("Ln 1, Col 1", { timeout: 15_000 });
    // No error notification: an unlocatable section is a normal state of
    // the world, not a fault to report.
    await expect(
      per.launch.page.locator(".notifications-toasts .notification-toast"),
    ).toHaveCount(0);
  });
});
