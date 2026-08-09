// Set 110 Session 3 — Layer 3 for the surfaces that STAY in a webview.
//
// The Work Explorer's tree half is now a native `TreeView`; its Getting
// Started form and System Status strip are not, and cannot be: a `TreeItem`
// has no room for radio groups, a validated numeric input, or buttons, and
// `contributes.viewsWelcome` renders markdown with command links, not a form.
// So the webview view survives with its id and its iframe intact, carrying
// only the non-tree surfaces.
//
// These four scenarios were lifted verbatim in INTENT from
// `session-sets-tree.spec.ts` (deleted with the renderer) and are unchanged
// in substance — the form they drive did not move. Collecting them here is
// what makes the deletion honest: the old file mixed tree assertions that had
// to die with form assertions that had to live, and deleting it wholesale
// would have taken four live behaviours with it.
//
// The routed step-3.5 test-generation analysis judged `loading-state.spec.ts`
// and this material `delete-superseded`, reasoning that the form "was replaced
// by the TreeView's `message` property". That is wrong on the evidence — the
// form is untouched by this migration — and the verdict is rejected on the
// record rather than followed. `loading-state.spec.ts` is likewise kept.

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
  openSessionSetsView,
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

/** A repo whose `docs/session-sets/` exists but is empty. */
function emptyWorkspace(tmpPath: string): string {
  const seed = makeSet(tmpPath, "seed-to-remove", 2);
  fs.rmSync(seed.set_dir, { recursive: true, force: true });
  const dir = path.join(seed.repo_root, "docs", "session-sets");
  expect(fs.existsSync(dir)).toBe(true);
  expect(fs.readdirSync(dir)).toHaveLength(0);
  return seed.repo_root;
}

test.describe("Set 110 S3 — the re-homed Getting Started surface", () => {
  const per: PerTest = {};
  test.afterEach(async () => {
    await teardown(per);
    per.tmpPath = undefined;
    per.launch = undefined;
  });

  test("renders the form when no session sets exist", async () => {
    per.tmpPath = makeTmpDir("dabbler-gs-empty");
    const repoRoot = emptyWorkspace(per.tmpPath);

    per.launch = await launchVSCode(repoRoot);
    const inner = await openSessionSetsView(per.launch.page);

    await expect(inner.locator(".getting-started")).toBeVisible({
      timeout: 30_000,
    });
    await expect(inner.locator(".gs-title")).toHaveText("Getting Started");
  });

  test("the tier fork is GONE; provider access is the first question", async () => {
    // Set 112 S2. The form used to open with a Full/Lightweight tier radio
    // and, on Lightweight, a verification-mode sub-choice. Both are deleted.
    // This asserts the ABSENCE at the rendering layer, where the Layer-2
    // builder tests cannot see it — Set 108 proved static gates stay green
    // while a view is broken.
    //
    // The stale `.dabbler/tier` + `.dabbler/verification-mode` markers are
    // written on purpose: a consumer upgrading from a Lightweight workspace
    // still has them on disk, and they must now be INERT — no radio to
    // re-check, no block to paint. The form must render the one-tier shape
    // regardless.
    per.tmpPath = makeTmpDir("dabbler-gs-no-tier-fork");
    const repoRoot = emptyWorkspace(per.tmpPath);
    const dabblerDir = path.join(repoRoot, ".dabbler");
    fs.mkdirSync(dabblerDir, { recursive: true });
    fs.writeFileSync(path.join(dabblerDir, "tier"), "lightweight\n", "utf8");
    fs.writeFileSync(
      path.join(dabblerDir, "verification-mode"),
      "dedicated-sessions\n",
      "utf8",
    );

    per.launch = await launchVSCode(repoRoot);
    const inner = await openSessionSetsView(per.launch.page);

    await expect(inner.locator(".getting-started")).toBeVisible({
      timeout: 30_000,
    });
    // No tier radio group, and no verification-mode block, at all.
    expect(await inner.locator('input[name="gs-tier"]').count()).toBe(0);
    expect(await inner.locator("[data-gs-verification-mode]").count()).toBe(0);
    expect(
      await inner.locator('input[name="gs-verification-mode"]').count(),
    ).toBe(0);
    // Provider access is the form's first (and only) setup question, with
    // the Direct-API default checked and its budget block nested under it.
    await expect(inner.locator("[data-gs-transport-profile]")).toBeVisible();
    await expect(
      inner.locator('input[name="gs-transport-profile"][value="api"]'),
    ).toBeChecked();
    await expect(inner.locator("[data-gs-budget]")).toBeVisible();
    expect(await inner.locator('[data-status-code="python"]').count()).toBe(0);
    // Set 112 S3, from the operator's UAT walk on this exact window: the
    // form must not open under a warning about the question it is asking.
    // This launch seeds NO provider key (the Electron env allowlist strips
    // the real DABBLER_* values), so the probe genuinely fails here — the
    // assertion is a falsifier, not a vacuous pass. Before the fix this
    // window showed "No provider API key was found for direct API routing"
    // while the operator had chosen nothing at all, because `api` is the
    // default profile and an explicit Direct-API pick is never recorded.
    expect(await inner.locator('[data-status-code="provider-key"]').count()).toBe(
      0,
    );
  });

  test("renders exactly two sections with the Define-modules buttons", async () => {
    // Set 094. Two sections — Build project structure + Define modules —
    // the two Define-modules buttons, and none of the retired plan /
    // session-set / New-module actions or the parallel checkbox.
    per.tmpPath = makeTmpDir("dabbler-gs-two-section");
    const repoRoot = emptyWorkspace(per.tmpPath);

    per.launch = await launchVSCode(repoRoot);
    const inner = await openSessionSetsView(per.launch.page);

    await expect(inner.locator(".getting-started")).toBeVisible({
      timeout: 30_000,
    });
    expect(await inner.locator(".gs-step-head").count()).toBe(2);
    await expect(
      inner.locator(".gs-step-title", { hasText: "Build project structure" }),
    ).toBeVisible();
    await expect(
      inner.locator(".gs-step-title", { hasText: "Define modules (optional)" }),
    ).toBeVisible();
    await expect(inner.locator('[data-gs-action="open-modules"]')).toBeVisible();
    await expect(
      inner.locator('[data-gs-action="copy-decomposition-prompt"]'),
    ).toBeVisible();
    for (const gone of [
      "import-plan",
      "copy-plan-prompt",
      "new-module",
      "build-session-sets",
    ]) {
      expect(await inner.locator(`[data-gs-action="${gone}"]`).count()).toBe(0);
    }
    expect(await inner.locator('input[name="gs-parallel"]').count()).toBe(0);
  });

  test("opening or refreshing an empty workspace never creates docs/modules.yaml", async () => {
    // Set 094 adjudication A — the trust-boundary invariant end to end. An
    // extension that edits a repo because it was OPENED is a trust
    // violation. This drives the REAL activation + snapshot + scan->ready
    // path, not the pure model functions the Layer 2 test covers.
    //
    // It matters MORE after this session, not less: the native tree adds a
    // second consumer of the same module assembly, so there are now two
    // code paths that could write the manifest on a passive open.
    per.tmpPath = makeTmpDir("dabbler-gs-no-write");
    const repoRoot = emptyWorkspace(per.tmpPath);
    const manifestPath = path.join(repoRoot, "docs", "modules.yaml");
    expect(fs.existsSync(manifestPath)).toBe(false);

    per.launch = await launchVSCode(repoRoot);
    const inner = await openSessionSetsView(per.launch.page);
    await expect(inner.locator(".getting-started")).toBeVisible({
      timeout: 30_000,
    });
    await per.launch.page.waitForTimeout(1500);
    expect(fs.existsSync(manifestPath)).toBe(false);
  });
});
