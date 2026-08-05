// Set 110 Session 3 — Layer 3 for the two diagnostics surfaces after the
// migration. Both scenarios came from `module-tier.spec.ts`, which is not
// where they belonged: neither is about the module tier.
//
// The invalid-manifest scenario is also the falsifier for Session 2's
// assigned residual. `WorkExplorerTreeProvider` DISCARDED
// `assembleVisibleModules(...).manifestFaults`, so a broken
// `docs/modules.yaml` left the native tree showing a stale last-known-good
// module tree with no explanation — a fail-quiet in a codebase whose standing
// rule is fail-loud. Three independent reads raised it in Session 2's round 2
// and the close backstop; this session fixes it and this test is what keeps
// it fixed.
//
// ONE CHANNEL, NOT TWO — a deliberate departure from the routed architecture
// advice, recorded rather than quietly taken. The routed call
// (`s3-stacked-view-architecture.json`) recommended surfacing the manifest
// fault in BOTH `TreeView.message` and the System Status strip, reasoning
// that the strip is a consolidated dashboard. This session ships it in
// `TreeView.message` only, for three reasons the routed call did not weigh:
//
//   1. the repo's standing "prefer removal over addition" principle — two
//      renderings of one fault is a duplication that then needs parity;
//   2. the message sits DIRECTLY ABOVE the stale tree it explains, which is
//      where an operator looking at wrong modules is already looking;
//   3. the strip's subject is the ENVIRONMENT (Python, provider keys, the
//      Copilot CLI), not repository content. A manifest fault was only ever
//      in the strip because the webview owned both surfaces at once.
//
// The consequence is asserted below rather than assumed: with a broken
// manifest, the message explains it AND the strip stays silent.

import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  cleanupTmpDir,
  closeVSCode,
  LaunchedVSCode,
  launchVSCode,
  makeSet,
  makeTmpDir,
  MODULES_YAML,
  openSessionSetsView,
  openWorkExplorerTree,
  stampModule,
  treeRow,
  treeViewMessageText,
  triggerRefresh,
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

/** A repo that looks initialized, so no environment fault fires. */
function scaffoldEnvironment(repoRoot: string, opts: { routerPkg: boolean }): void {
  for (const name of ["AGENTS.md", "CLAUDE.md", "GEMINI.md"]) {
    fs.writeFileSync(path.join(repoRoot, name), `# ${name}\n`, "utf8");
  }
  if (opts.routerPkg) {
    fs.mkdirSync(
      path.join(repoRoot, ".venv", "Lib", "site-packages", "ai_router"),
      { recursive: true },
    );
  }
  fs.mkdirSync(path.join(repoRoot, ".venv", "Scripts"), { recursive: true });
  fs.writeFileSync(path.join(repoRoot, ".venv", "Scripts", "python.exe"), "", "utf8");
  // Lightweight tier gates out the provider-key fault, isolating the
  // behaviour under test. The runner has Python, so no Python fault either.
  fs.mkdirSync(path.join(repoRoot, ".dabbler"), { recursive: true });
  fs.writeFileSync(
    path.join(repoRoot, ".dabbler", "tier"),
    "lightweight\n",
    "utf8",
  );
}

test.describe("Set 110 S3 — diagnostics surfaces", () => {
  const per: PerTest = {};
  test.afterEach(async () => {
    await teardown(per);
    per.tmpPath = undefined;
    per.launch = undefined;
  });

  test("an invalid manifest explains itself, retains the last-known-good tree, and clears on repair", async () => {
    per.tmpPath = makeTmpDir("dabbler-manifest-guard");
    const fixture = makeSet(per.tmpPath, "092-manifest-guard", 2);
    stampModule(fixture, "greeter");
    const manifestPath = path.join(fixture.repo_root, "docs", "modules.yaml");
    fs.writeFileSync(manifestPath, MODULES_YAML, "utf8");
    scaffoldEnvironment(fixture.repo_root, { routerPkg: true });

    per.launch = await launchVSCode(fixture.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);

    // Healthy: the module renders and the view says nothing.
    await expect(treeRow(pane, "Greeter")).toBeVisible({ timeout: 30_000 });
    expect(await treeViewMessageText(pane)).toBe("");

    // Break the manifest by hand.
    fs.writeFileSync(manifestPath, "modules: [\n", "utf8");
    await triggerRefresh(per.launch.page);

    // The tree still shows the last-known-good module — never blank the
    // view — but it now EXPLAINS why, which is the whole fix.
    await expect(treeRow(pane, "Greeter")).toBeVisible();
    await expect
      .poll(async () => treeViewMessageText(pane), { timeout: 30_000 })
      .toMatch(/modules\.yaml/i);

    // The extension never repairs the file on the operator's behalf.
    expect(fs.readFileSync(manifestPath, "utf8")).toBe("modules: [\n");

    // Repair: the message clears and the new title lands.
    const repaired = MODULES_YAML.replace("title: Greeter", "title: Greeter Repaired");
    fs.writeFileSync(manifestPath, repaired, "utf8");
    await triggerRefresh(per.launch.page);
    await expect(treeRow(pane, "Greeter Repaired")).toBeVisible({
      timeout: 30_000,
    });
    await expect.poll(async () => treeViewMessageText(pane), { timeout: 30_000 }).toBe("");
  });

  test("a repo with sets and no scaffolded router package shows no environment fault", async () => {
    // Set 092 S2 (UAT Walk 4). A working repo that already has session sets
    // must show NO System Status strip even when the scaffold-structure
    // proxy reads false — which is the on-disk shape of an editable
    // `pip install -e .`: a `.venv` exists but no `ai_router` package dir
    // sits under site-packages. `hasAnySets` clears the fault, because a
    // repo that authored sets is initialized by construction.
    per.tmpPath = makeTmpDir("dabbler-editable-install");
    const fixture = makeSet(per.tmpPath, "092-editable-install", 2);
    scaffoldEnvironment(fixture.repo_root, { routerPkg: false });

    per.launch = await launchVSCode(fixture.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);
    await expect(treeRow(pane, "Default")).toBeVisible({ timeout: 30_000 });

    // The setup/status pane is contributed only when it has something to
    // say, so a healthy repo must not carry one at all.
    await expect(
      per.launch.page
        .locator(".pane-header")
        .filter({ hasText: "Setup & Status" }),
    ).toHaveCount(0);
  });

  test("an environment fault brings the status pane back", async () => {
    // The other half of the presence rule, and the reason a `when`-gated
    // pane is safe: a fault must never be invisible just because the pane
    // that reports it is conditional.
    //
    // THE FAULT IS CAUSED BY THIS TEST, not inherited from the machine.
    // Verification round 1 caught the first draft doing the opposite: it
    // omitted the scaffold and asserted the workspace-initialization probe
    // would fail — but `workspaceInitialized` is `hasAnySets ||
    // structureBuilt`, and the fixture HAS a session set, so that probe is
    // unconditionally true. The pane appeared anyway, on this machine, only
    // because the Electron launcher's env allowlist happens to strip the
    // `DABBLER_*` keys and the provider-key probe therefore failed. That is
    // an unrelated harness detail: on a runner that passed those keys
    // through, the mandatory full-suite gate would have failed on the
    // ENVIRONMENT rather than on the product.
    //
    // `dabblerSessionSets.pythonPath` pointed at a file that does not exist
    // makes the Python probe fail deterministically — no dependence on
    // credentials, tier, transport profile, or what is installed on the box.
    // And the assertion names the exact fault code, so the test can no
    // longer pass on a fault it did not cause.
    per.tmpPath = makeTmpDir("dabbler-env-fault");
    const fixture = makeSet(per.tmpPath, "092-env-fault", 2);
    scaffoldEnvironment(fixture.repo_root, { routerPkg: true });
    const vscodeDir = path.join(fixture.repo_root, ".vscode");
    fs.mkdirSync(vscodeDir, { recursive: true });
    fs.writeFileSync(
      path.join(vscodeDir, "settings.json"),
      JSON.stringify(
        {
          "dabblerSessionSets.pythonPath": path.join(
            fixture.repo_root,
            "no-such-python-executable",
          ),
        },
        null,
        2,
      ),
      "utf8",
    );

    per.launch = await launchVSCode(fixture.repo_root);
    const inner = await openSessionSetsView(per.launch.page);
    const strip = inner.getByTestId("system-status");
    await expect(strip).toBeVisible({ timeout: 30_000 });
    await expect(strip.locator('[data-status-code="python"]')).toHaveCount(1);
  });
});
