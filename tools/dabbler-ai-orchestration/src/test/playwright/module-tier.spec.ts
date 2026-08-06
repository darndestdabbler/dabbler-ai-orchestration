// Set 087 Session 2 — Layer 3 smoke for the Explorer module tier,
// re-expressed by Set 110 Session 3 against the native `TreeView`.
//
// What survives, because it is OUR logic:
//
//   - one module row per manifest module, in MANIFEST FILE ORDER, with the
//     unlabeled implicit module last (routed ruling Q1);
//   - a module whose slug is stamped on sets but absent from the manifest
//     renders as a fallback, visibly warned, and offers no target-specific
//     actions;
//   - sets are grouped under their OWN module, not pooled.
//
// What was dropped, and why — each of these pinned our re-creation of a
// platform behaviour, and the platform now owns it:
//
//   - the 3-level ARIA contract (`aria-level` 1/2/3). VS Code emits it.
//   - per-(module, bucket) composite collapse keys and the whole
//     collapse/expand persistence dance. VS Code keys expansion on
//     `TreeItem.id`; `work-explorer-tree.spec.ts` asserts the ONE thing that
//     is still ours — that the ids are stable across a refresh.
//   - the entire second test, "module rows carry a hover/focus-revealed
//     action strip". The strip is DELETED this session. Its replacement is
//     platform-rendered inline icons plus a real context menu, whose gating
//     is pinned bidirectionally at Layer 2 (`workExplorerMenuParity.test.ts`:
//     every registry action reaches exactly one menu, and every menu entry
//     is reachable by some real row) and end to end in `native-tree.spec.ts`.
//     Roughly 120 lines of roving-tabindex and stale-anchor assertions go
//     with it: they were load-bearing for a hand-rolled toolbar and are
//     meaningless against `"group": "inline"`.
//   - the kind chip ("plan" / "decomposition") as a rendered row element.
//     A set row has no description and one icon slot, so `kind` moved into
//     the tooltip; `workExplorerTreeModel.test.ts` pins it there.
//
// The two System Status scenarios that lived in this file moved to
// `system-status.spec.ts`, which is the surface they actually test.

import { expect, test } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  cleanupTmpDir,
  closeVSCode,
  expandTreeRow,
  expectFileIcon,
  LaunchedVSCode,
  launchVSCode,
  makeAdditionalSet,
  makeSet,
  makeTmpDir,
  MODULES_YAML,
  openWorkExplorerTree,
  rowContextMenuText,
  stampModule,
  treeRow,
  treeRows,
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

test.describe("Set 087 S2 — the module tier, on the native tree", () => {
  const per: PerTest = {};
  test.afterEach(async () => {
    await teardown(per);
    per.tmpPath = undefined;
    per.launch = undefined;
  });

  test("renders modules in manifest order, fallback warned, Unassigned last", async () => {
    per.tmpPath = makeTmpDir("dabbler-modtier");
    // Manifest order is greeter -> clock -> integration; the sets are
    // created in a DIFFERENT order, so this discriminates manifest order
    // from directory/creation order. A fourth set stays unlabeled -> the
    // implicit module, last. A fifth carries a slug absent from the
    // manifest -> the fallback module.
    const a = makeSet(per.tmpPath, "087-clock-widget", 2);
    const b = makeAdditionalSet(a, "087-greeter-core", 2);
    const c = makeAdditionalSet(a, "087-compose-both", 2);
    const d = makeAdditionalSet(a, "087-loose-end", 2);
    const e = makeAdditionalSet(a, "087-undeclared", 2);
    stampModule(a, "clock");
    stampModule(b, "greeter");
    stampModule(c, "integration");
    stampModule(e, "not-in-manifest");
    void d; // deliberately unlabeled
    fs.writeFileSync(
      path.join(a.repo_root, "docs", "modules.yaml"),
      MODULES_YAML,
      "utf8",
    );

    per.launch = await launchVSCode(a.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);

    // Root rows are exactly the modules, in order. Nothing is expanded yet,
    // so every visible row IS a module — which is the laziness guarantee,
    // asserted here for free.
    //
    // Matched by PREFIX rather than equality, and with a plain string check
    // rather than a regex. Two things about how VS Code renders these rows
    // were established by running it, and both are recorded so the next
    // reader does not re-derive them:
    //
    //   1. the label and the `description` are in the SAME text node, not on
    //      separate lines — an earlier draft split on a newline that is not
    //      there;
    //   2. they are concatenated with NO separator, so a module row reads
    //      "Greeter1 set". A `^Greeter\b` regex therefore does not match:
    //      `r` and `1` are both word characters, so there is no boundary
    //      between them.
    const rootTexts = (await treeRows(pane).allInnerTexts()).map((t) =>
      t.replace(/\s+/g, " ").trim(),
    );
    const startsWith = (i: number, label: string) =>
      expect(
        rootTexts[i]?.startsWith(label),
        `row ${i} was "${rootTexts[i]}", expected it to start with "${label}"`,
      ).toBe(true);
    startsWith(0, "Greeter");
    startsWith(1, "Clock");
    startsWith(2, "Cross-Module Integration");
    // A fallback module (a slug stamped on sets but absent from the
    // manifest) sorts after the declared ones...
    startsWith(3, "not-in-manifest");
    // ...and the pseudo module is labeled `Unassigned` (not `Default`) once
    // declared modules exist, and sorts last.
    startsWith(rootTexts.length - 1, "Unassigned");
    expect(rootTexts).toHaveLength(5);

    // The fallback module is visibly warned rather than silently dropped —
    // never hide work.
    const fallback = treeRow(pane, "not-in-manifest");
    await expect(fallback.locator(".custom-view-tree-node-item-icon")).toHaveCount(0);

    // Sets group under their OWN module.
    await expandTreeRow(pane, "Greeter");
    await expandTreeRow(pane, "Not Started");
    await expect(treeRow(pane, "087-greeter-core")).toBeVisible();
    await expect(
      treeRows(pane).filter({ hasText: "087-clock-widget" }),
    ).toHaveCount(0);
  });

  test("module capabilities are gated by kind, through VS Code's own when-clauses", async () => {
    // The behavioural residue of the deleted action strip: a DECLARED module
    // offers the lifecycle actions, a FALLBACK module offers none of them,
    // and the pseudo `Unassigned` module offers the legacy-assignment
    // affordance. The webview enforced this by refusing to render buttons;
    // the native tree enforces it with `contextValue` tokens that VS Code
    // evaluates, which is why this is now driven through the real menu.
    per.tmpPath = makeTmpDir("dabbler-modcaps");
    const a = makeSet(per.tmpPath, "093-clock-widget", 2);
    const b = makeAdditionalSet(a, "093-greeter-core", 2);
    const d = makeAdditionalSet(a, "093-loose-end", 2);
    const e = makeAdditionalSet(a, "093-undeclared", 2);
    stampModule(a, "clock");
    stampModule(b, "greeter");
    stampModule(e, "not-in-manifest");
    void d; // deliberately unlabeled -> the pseudo Unassigned module
    fs.writeFileSync(
      path.join(a.repo_root, "docs", "modules.yaml"),
      MODULES_YAML,
      "utf8",
    );

    per.launch = await launchVSCode(a.repo_root);
    const pane = await openWorkExplorerTree(per.launch.page);
    const page = per.launch.page;

    const declared = await rowContextMenuText(page, treeRow(pane, "Greeter"));
    expect(declared).toContain("Rename Module");
    expect(declared).toContain("Delete Module");

    // A fallback module has no manifest entry to rename, delete, or resolve
    // a plan path against, so it must offer none of them. This is the
    // assertion that catches an over-broad `when` clause — the step-3.5
    // analyst's named risk for Session 2, checked end to end rather than
    // only in the parity unit test.
    const fallback = await rowContextMenuText(
      page,
      treeRow(pane, "not-in-manifest"),
    );
    expect(fallback).not.toContain("Rename Module");
    expect(fallback).not.toContain("Delete Module");

    // The pseudo module gains the assignment affordance precisely because a
    // declared module exists to assign INTO (Set 093 ruling D2 — the same
    // condition that renames it from `Default` to `Unassigned`).
    const pseudo = await rowContextMenuText(page, treeRow(pane, "Unassigned"));
    expect(pseudo).toContain("Assign");
    expect(pseudo).not.toContain("Rename Module");
  });
});
