// Set 101 Session 1 — the REAL first-run walkthrough the spec's "Ends
// with" line names verbatim: "walk Default -> rename -> delete -> re-add
// a real module -- the full first-run loop against the locally built
// VSIX." Unlike every other test that session added (which call
// `buildProjectStructureNoPrompt` / the writer functions directly, or
// stub `vscode.commands.registerCommand` to capture a callback), THIS
// spec drives the actual packaged code end to end through the real user
// journey: a real VS Code Electron instance (the same
// `--extensionDevelopmentPath` mechanism this repo's whole Layer-3 suite
// already relies on as the accepted stand-in for "the locally built
// VSIX" -- it runs the identical compiled `dist/extension.js` the .vsix
// packages), and the real Command Palette + QuickPick + InputBox +
// modal-confirm dialogs — no seams, no fixture seeding, no fakery, a REAL
// git init + REAL network `pip install`.
//
// This closes the gap a routed third-party opinion (gemini-pro,
// s1-third-opinion-vsix-dispute.json) identified and the round-5 verifier
// held the orchestrator to: a stub-level callback test proves wiring but
// not the real interactive journey; this spec proves the journey itself.
//
// SET 123 S3 — REWRITTEN, NOT RETIRED.
//
// The Build step used to drive the Getting Started webview form, because
// that form was the primary documented first-run path. That form is
// deleted: setup is now a terminal step (`python -m ai_router.verify_type`
// resolves what verifies the project and writes `project-verify-type.txt`),
// and the scaffold's own entry point is the fully non-interactive
// `Dabbler: Set Up New Project` palette command. So the Build step now goes
// through the palette like every other step in this walk, and the spec is
// end-to-end through ONE surface instead of two.
//
// It is rewritten rather than deleted for two reasons already adjudicated:
// it is the ONLY end-to-end proof of first run, and first run is the path
// NEW STAFF take — every other Layer 3 spec tests a surface an existing user
// navigates. That argument got stronger, not weaker, in this session: the 8
// webview scenarios retired alongside it were the rest of the first-run
// coverage.
//
// THE REAL NETWORK `pip install` IS KEPT, deliberately (the spec asked for
// this to be a decision rather than an inheritance). It is the bulk of the
// runtime and the only network dependency, and the case for dropping it —
// "at some point it is testing pip rather than testing us" — is real. It
// stays because provisioning is precisely what this spec exists to prove:
// `L-079-3` requires any set shipping provisioning to dogfood the TRUE cold
// start, this session ships a provisioning change (the scaffold no longer
// has a form in front of it), and trimming coverage in the same session that
// retired 8 scenarios would compound a reduction rather than offset it. The
// completion signal below also depends on the scaffold really running.
//
// Hard-won lessons from getting this running (kept so a future editor
// does not have to rediscover them):
//   1. The extension's `activationEvents` is `[]` — it activates on the
//      Dabbler view being revealed, not eagerly at window load. Open the
//      container (openDabblerContainer) BEFORE invoking any Dabbler
//      palette command, or the command simply does not exist yet.
//   2. F1 opens the Command Palette with the `>` command prefix already
//      in the input, and Playwright's fill() REPLACES the whole value —
//      losing the prefix turns the query into a file search that matches
//      no commands. Always fill(">" + title).
//   3. A QuickPick's placeHolder is an input ATTRIBUTE, not rendered
//      text — `filter({ hasText })` never matches it. Wait on
//      input[placeholder*=...] instead. An InputBox's prefilled VALUE
//      (toHaveValue) is the cleanest swap signal, since VS Code reuses
//      ONE quick-input widget and swaps its content in place.
//   4. `window.dialogStyle` defaults to "native" on desktop (verified in
//      the shipped 1.128 workbench.desktop.main.js), so a modal
//      showWarningMessage confirm is an OS dialog Playwright cannot see.
//      Launching with `--enable-smoke-test-driver` (the facility VS
//      Code's own smoke tests use; the dialog handler ORs it with the
//      custom-style setting) forces a real HTML `.monaco-dialog-box`
//      whose buttons are clickable.
//
// SLOW: includes a real venv + pip install (the same first-run cost any
// human operator pays). Generous timeouts throughout.

import { expect, test } from "@playwright/test";
import {
  cleanupTmpDir,
  closeVSCode,
  expandTreeRow,
  launchVSCode,
  LaunchedVSCode,
  makeTmpDir,
  openDabblerContainer,
  treeRow,
  treeRows,
  workExplorerPane,
} from "./electronLaunch";

interface PerTest {
  tmpPath?: string;
  launch?: LaunchedVSCode;
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
    console.warn("teardown errors:", errs);
  }
}

/** Open the Command Palette (F1 — the cross-platform binding) and run a
 * command by its palette title. fill() must re-include the `>` command
 * prefix F1 pre-filled (lesson 2 above). Only called after the extension
 * has activated (lesson 1). */
async function runCommand(
  page: import("@playwright/test").Page,
  title: string,
): Promise<void> {
  await page.keyboard.press("F1");
  const input = page.locator(".quick-input-widget input");
  await input.waitFor({ state: "visible", timeout: 15_000 });
  await input.fill(">" + title);
  await page.keyboard.press("Enter");
}

/** Wait for a QuickPick identified by its placeholder ATTRIBUTE
 * (lesson 3), then accept the focused (sole) item with Enter. */
async function acceptSoleQuickPickItem(
  page: import("@playwright/test").Page,
  placeholderSubstring: string,
): Promise<void> {
  const input = page.locator(
    `.quick-input-widget input[placeholder*="${placeholderSubstring}"]`,
  );
  await input.waitFor({ state: "visible", timeout: 15_000 });
  // Set 110 S4: waiting only on the INPUT is a race. VS Code shows the
  // quick-input widget as soon as the command opens it, and populates the item
  // list a tick later; Enter pressed against an empty list is a silent no-op
  // that leaves the picker sitting open. The failure then surfaces 4 lines
  // later, at the InputBox that never arrived, naming the wrong cause — which
  // is exactly how this read in the round-2 Layer 3 run: "expected 'default',
  // received ''" against a locator still carrying the PICKER's placeholder.
  // So wait for a row to exist, which is the thing Enter actually accepts.
  await page
    .locator(".quick-input-widget .monaco-list-row")
    .first()
    .waitFor({ state: "visible", timeout: 15_000 });
  await page.keyboard.press("Enter");
  // And prove the picker advanced. A swallowed Enter now fails HERE, on the
  // step that swallowed it, instead of poisoning a downstream assertion.
  await input.waitFor({ state: "hidden", timeout: 15_000 });
}

test("REAL first-run walkthrough: Build -> Default -> rename -> delete -> re-add, driven through the extension's actual VS Code UI", async () => {
  test.setTimeout(600_000); // real venv + network pip install
  const per: PerTest = {};
  try {
    per.tmpPath = makeTmpDir("dabbler-pw-vsix-walkthrough");
    // Lesson 4: force HTML dialogs so the modal rename/delete confirms
    // are clickable.
    per.launch = await launchVSCode(per.tmpPath, ["--enable-smoke-test-driver"]);
    const page = per.launch.page;

    // Reveal the Dabbler container, which is what activates the extension
    // (lesson 1) and therefore what makes its palette commands exist. On a
    // genuinely empty workspace the tree has no rows yet — that is the
    // correct cold-start shape, not a failure.
    await openDabblerContainer(page);

    // ---- Step 1: Build project structure, through the REAL palette
    // command — real git init, real template render, real venv + pip
    // install, and the default-module + lifecycle-set scaffold.
    // `Dabbler: Set Up New Project` is fully non-interactive by design
    // (Set 060 S3 retired the prompt chain; Set 112 S2 retired the last
    // tier QuickPick), so there is nothing to answer: the command IS the
    // consent, exactly as clicking Build used to be. ----
    await runCommand(page, "Dabbler: Set Up New Project");

    // The real install takes a while; the tree acquiring the scaffolded
    // Default module is the observable completion signal (the Layer 3
    // convention: assert the rendered tree, never a transient toast).
    // `workExplorerPane`, NOT `openWorkExplorerTree`: the latter waits 30s
    // for a first row, and at this instant the tree has none — the real venv
    // + pip install is still running and can take minutes. The wait that
    // matters is the one below, on the Default module row, with the install's
    // own timeout. Reaching for the row-waiting helper here was the last
    // failure of Set 110 S3's switch-over and is worth naming: a convenience
    // helper's built-in wait is a hidden assumption about what has already
    // happened.
    //   - `reveal: false`: the container is ALREADY open (opened above).
    //     Revealing again would click the activity-bar icon a second time,
    //     which TOGGLES the sidebar shut.
    const pane = await workExplorerPane(page, { reveal: false });
    // The SET COUNT is the completion signal, not the module row. The
    // scaffold writes `docs/modules.yaml` before it creates the lifecycle
    // sets, so the Default row appears reading "Default0 sets" while the real
    // venv + pip install is still running, and only later becomes "2 sets".
    // Waiting on the row and then asserting the count with a short timeout
    // raced that gap and failed on "Default0 sets".
    await expect(treeRow(pane, "Default")).toContainText("2 sets", {
      timeout: 300_000,
    });
    // Exactly one module row, so no pseudo module rendered alongside the
    // declared one. Before expansion the root rows ARE the modules.
    await expect(treeRows(pane)).toHaveCount(1);

    // ---- Step 2: rename Default -> Greeter, through the real palette
    // command + QuickPick + two InputBoxes + modal confirm. ----
    await runCommand(page, "Dabbler: Rename Module");
    await acceptSoleQuickPickItem(page, "Which module do you want to rename");
    // The slug InputBox arrives prefilled with the current slug — the
    // value swap is the content-based wait (lesson 4).
    const qiInput = page.locator(".quick-input-widget input");
    await expect(qiInput).toHaveValue("default", { timeout: 15_000 });
    await qiInput.fill("greeter");
    await page.keyboard.press("Enter");
    await expect(qiInput).toHaveValue("Default", { timeout: 15_000 });
    await qiInput.fill("Greeter");
    await page.keyboard.press("Enter");
    // The two-step modal confirm (custom-styled workbench dialog,
    // lesson 5) — wait for the dialog box itself first so a missing
    // dialog fails distinctly from a missing button.
    const renameDialog = page.locator(".monaco-dialog-box");
    await renameDialog.waitFor({ state: "visible", timeout: 15_000 });
    await renameDialog.getByRole("button", { name: "Rename Module" }).click();

    // The rename restamped both lifecycle sets — names unchanged, still 2.
    // A rename that failed to restamp would strand the sets in a pseudo
    // module, which would show up as a SECOND root row.
    await expect(treeRow(pane, "Greeter")).toContainText("2 sets", {
      timeout: 60_000,
    });
    await expect(treeRows(pane)).toHaveCount(1);

    // ---- Step 3: delete Greeter, through the real palette command +
    // QuickPick + modal confirm. ----
    await runCommand(page, "Dabbler: Delete Module");
    await acceptSoleQuickPickItem(page, "Which module do you want to delete");
    const deleteDialog = page.locator(".monaco-dialog-box");
    await deleteDialog.waitFor({ state: "visible", timeout: 15_000 });
    await deleteDialog.getByRole("button", { name: "Delete Module" }).click();

    await expect(
      treeRows(pane).filter({ hasText: "Greeter" }),
    ).toHaveCount(0, { timeout: 30_000 });

    // ---- Step 4: re-add a real module (payments), through the real
    // palette command + two InputBoxes (titled steps 1/2 and 2/2). ----
    await runCommand(page, "Dabbler: New Module");
    const newSlugStep = page
      .locator(".quick-input-widget")
      .filter({ hasText: "New module (1/2)" });
    await newSlugStep.waitFor({ state: "visible", timeout: 15_000 });
    await newSlugStep.locator("input").fill("payments");
    await page.keyboard.press("Enter");
    const newTitleStep = page
      .locator(".quick-input-widget")
      .filter({ hasText: "New module (2/2)" });
    await newTitleStep.waitFor({ state: "visible", timeout: 15_000 });
    await newTitleStep.locator("input").fill("Payments");
    await page.keyboard.press("Enter");

    // The re-add scaffolded a fresh plan/decomposition pair — again, the
    // count is the completion signal, not the row.
    await expect(treeRow(pane, "Payments")).toContainText("2 sets", {
      timeout: 120_000,
    });
    await expect(treeRows(pane)).toHaveCount(1);
    // And they really are under it, not merely counted: drill once at the
    // end of the walk so the whole journey ends on a real leaf.
    await expandTreeRow(pane, "Payments");
    await expandTreeRow(pane, "Not Started");
    await expect(treeRows(pane).filter({ hasText: /-plan$/ })).toHaveCount(1);
  } finally {
    await teardown(per);
  }
});
