// Set 115 Session 3 — the Layer 3 spec for the session row's context menu.
// Narrowed by Set 115 Session 4, after the operator walked the finished
// row and ruled "Open Session Artifacts" out of the menu: one entry is
// enough on a session row. Its two scenarios went with the command.
//
// What only a real host can show. WHICH row may offer the run prompt is
// proven exhaustively at Layer 2 in `sessionRowActions.test.ts`; that the
// registry and `package.json` agree on tokens is proven statically in
// `workExplorerMenuParity.test.ts`. Re-asserting either here would buy
// nothing at ~40 seconds a run.
//
// What neither can reach is the seam between them: VS Code's own `when`
// evaluation of `viewItem =~ /;act-…;/` against a `contextValue` we compute
// in TypeScript. A token emitted with the wrong delimiters, a `when` clause
// with a typo, or an entry anchored on the wrong menu id all compile, all
// pass every unit test, and all render an empty context menu on the row the
// operator right-clicks. So this spec right-clicks the row.
//
// The ABSENCE assertions carry as much weight as the presence ones now:
// a set-row entry leaking down a level, or the removed artifact entry
// coming back, are both invisible to every other layer.

import { expect, test } from "@playwright/test";
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
  rowContextMenuText,
  startSession,
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

const RUN_PROMPT = "Copy Run Prompt";
const ARTIFACTS = "Open Session Artifacts";

test.describe("Set 115 S3 — a session row's context menu", () => {
  const per: PerTest = {};
  test.afterEach(async () => {
    await teardown(per);
    per.tmpPath = undefined;
    per.launch = undefined;
  });

  test("the runnable session offers the run prompt; the one after it does not", async () => {
    per.tmpPath = makeTmpDir("dabbler-session-menu");
    const h = makeSet(per.tmpPath, "115-menu-me", 2, { withSessionSteps: true });
    // Session 1 in flight, so it is the session the trigger phrase runs
    // and session 2 is not.
    startSession(h, 1);

    per.launch = await launchVSCode(h.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);
    await revealSetRow(pane, { bucket: "In Progress", set: "115-menu-me" });
    await expandTreeRow(pane, "115-menu-me");

    const live = await rowContextMenuText(
      per.launch.page,
      treeRow(pane, "Fixture session 1"),
    );
    expect(live, `menu was:\n${live}`).toContain(RUN_PROMPT);
    // Set 115 S4, operator ruling at the walk: the artifact entry is
    // GONE. Asserted here rather than only in the registry because a
    // re-added `package.json` menu contribution would put it back on
    // screen while every unit test still passed.
    expect(live, `menu was:\n${live}`).not.toContain(ARTIFACTS);
    // The set-row entries do NOT leak down a level: both submenus are
    // anchored on `;dabblerSet;`, and this is where that anchoring is
    // checked against VS Code's own evaluation rather than against ours.
    expect(live, `menu was:\n${live}`).not.toContain("Cancel Session Set");
    expect(live, `menu was:\n${live}`).not.toContain("Copy Slug");

    const later = await rowContextMenuText(
      per.launch.page,
      treeRow(pane, "Fixture session 2"),
    );
    // The gate, end to end: a prompt copied from session 2 would start
    // session 1, so session 2 does not offer one. And since Set 115 S4
    // removed the artifact entry, that leaves session 2 with NO menu at
    // all — the honest result of a row with no applicable actions, and a
    // case no layer below this one can produce.
    expect(later, `menu was:\n${later}`).not.toContain(RUN_PROMPT);
    expect(later, `menu was:\n${later}`).not.toContain(ARTIFACTS);
    expect(later.trim(), `menu was:\n${later}`).toBe("");
  });
});
