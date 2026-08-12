// Retake the two README screenshots against a REAL Extension Development Host.
//
// Set 110 S3 recorded these as owed at the release (§8.5): the README's hero
// image and the Getting Started shot both showed the hand-rolled webview tree
// that Set 110 DELETED. The README is the Marketplace landing page, so
// publishing 0.49.0 -- whose headline is "the Work Explorer is now a native VS
// Code tree" -- against a screenshot of the renderer it removed would misstate
// the product on its own storefront. S3 could not retake them (no running
// build); S4 can.
//
// WHY THIS IS A SCRIPT AND NOT A SPEC. `playwright.config.ts` sets
// `testMatch: /.*\.spec\.ts$/`, so a `*.spec.ts` file here would join the Layer
// 3 suite and change the 33-test run of record that the release is verified
// against. A capture is not a test -- it has no assertion that can fail
// meaningfully -- so it runs on demand instead, against the SAME compiled
// harness the suite uses. `scripts/**` is in `.vscodeignore`, so it never ships.
//
// Usage, from tools/dabbler-ai-orchestration:
//   npm run compile && npx tsc --outDir out
//   node scripts/capture-readme-shots.js
//
// Writes media/work-explorer-modules.png.
//
// Set 123 S3: the Getting Started capture is GONE with the form it shot. The
// setup webview is deleted -- a project's verify type is resolved in the
// terminal by `python -m ai_router.verify_type` -- so there is no form to
// photograph, and `media/getting-started.png` is removed rather than left in
// the README pointing at a surface that no longer exists. The Work Explorer
// hero shot is unaffected: the tree is the whole extension now.

const fs = require("fs");
const path = require("path");

const H = require("../out/test/playwright/electronLaunch");

const MEDIA = path.resolve(__dirname, "..", "media");

// Four modules so the grouping the hero image is meant to SHOW is visible at a
// glance, with the first one carrying a set in each lifecycle state.
const MODULES_YAML = [
  "modules:",
  "  - slug: auth-service",
  "    title: Auth Service",
  "    codeRoots: [services/auth]",
  "  - slug: billing",
  "    title: Billing",
  "    codeRoots: [services/billing]",
  "  - slug: notifications",
  "    title: Notifications",
  "    codeRoots: [services/notifications]",
  "  - slug: platform-core",
  "    title: Platform Core",
  "    codeRoots: [services/platform]",
  "",
].join("\n");

function writeModulesYaml(repoRoot) {
  const docs = path.join(repoRoot, "docs");
  fs.mkdirSync(docs, { recursive: true });
  fs.writeFileSync(path.join(docs, "modules.yaml"), MODULES_YAML, "utf8");
}

async function shootLocator(page, locator, outFile) {
  await locator.waitFor({ state: "visible", timeout: 30_000 });
  // Let the tree settle so the capture cannot catch a half-painted row.
  await page.waitForTimeout(1_500);
  await locator.screenshot({ path: outFile });
  console.log(`  wrote ${path.relative(process.cwd(), outFile)}`);
}

/**
 * Collapse a named workbench pane, if it is present and open.
 *
 * Set 123 S3: both former callers were about hiding the OTHER pane, and there
 * is no other pane -- the container contributes the Work Explorer tree and
 * nothing else. Kept because it is harmless and self-guarding (it no-ops when
 * the named pane is absent), and because a second view is the kind of thing
 * that comes back.
 */
async function collapsePane(page, title) {
  const header = page.locator(".pane-header").filter({ hasText: title }).first();
  if ((await header.count()) === 0) return;
  if ((await header.getAttribute("aria-expanded")) !== "false") {
    await header.click();
    await page.waitForTimeout(400);
  }
}

async function captureWorkExplorer() {
  console.log("[1/2] Work Explorer, four modules, Auth Service expanded");
  const tmp = H.makeTmpDir("dabbler-readme-tree");
  let launch;
  try {
    // In progress: session 1 closed, session 2 of 4 started. `start_session`
    // refuses to skip ahead, so the earlier session has to be closed first.
    const base = H.makeSet(tmp, "042-token-refresh-rotation", 4);
    H.stampModule(base, "auth-service");
    H.driveHappyPath(base, 1);
    H.startSession(base, 2);

    // Two complete, one not started -- the mix the alt text describes.
    const done1 = H.makeAdditionalSet(base, "039-session-revocation", 2);
    H.stampModule(done1, "auth-service");
    H.driveHappyPath(done1, 2);

    const done2 = H.makeAdditionalSet(base, "040-password-reset-flow", 2);
    H.stampModule(done2, "auth-service");
    H.driveHappyPath(done2, 2);

    const todo = H.makeAdditionalSet(base, "045-mfa-enrolment", 3);
    H.stampModule(todo, "auth-service");

    // One set under another module so the collapsed siblings are real.
    const billing = H.makeAdditionalSet(base, "031-invoice-retries", 2);
    H.stampModule(billing, "billing");

    writeModulesYaml(base.repo_root);

    launch = await H.launchVSCode(base.repo_root);
    const pane = await H.openWorkExplorerTree(launch.page);
    // Walk all four levels open: module -> status bucket -> session set ->
    // sessions. The fourth level is this release's headline addition, so the
    // hero image should actually show it rather than stopping at set rows.
    await H.expandTreeRow(pane, "Auth Service");
    await H.expandTreeRow(pane, "In Progress");
    await H.expandTreeRow(pane, "042-token-refresh-rotation");
    await H.expandTreeRow(pane, "Not Started");
    await H.expandTreeRow(pane, "Complete");
    // The Work Explorer PANE is the subject, not the whole sidebar.
    await shootLocator(launch.page, pane, path.join(MEDIA, "work-explorer-modules.png"));
  } finally {
    if (launch) await H.closeVSCode(launch).catch(() => {});
    H.cleanupTmpDir(tmp);
  }
}

(async () => {
  await captureWorkExplorer();
  console.log("done");
})().catch((err) => {
  console.error("capture failed:", err);
  process.exit(1);
});
