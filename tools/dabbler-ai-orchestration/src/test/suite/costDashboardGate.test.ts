import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";

// Set 052 S2 — deterministic guard on the D3 tier-gate WIRING.
//
// The gate has two halves: (1) a `dabblerSessionSets.routesCost` context
// key the extension sets from router capability, and (2) `when`-clauses
// on the cost-dashboard menu contributions that consume it. The
// PREDICATE behind the key is unit-tested in routerConfig.test.ts; this
// suite pins the contribution manifest + the setContext call so a future
// edit can't silently un-gate the icon (or gate it on the wrong key).
//
// Why this is a unit test, not a Layer-3 Playwright smoke (verdict D7
// names Layer-3 for the gate): VS Code view/title actions are
// non-deterministic to assert through Playwright — the action bar
// duplicate-renders each action in the DOM and collapses actions past
// the first into a lazily-created "More Actions…" overflow, so a gated
// navigation@2 action is genuinely absent from the DOM in a default-width
// sidebar whether or not the gate is on. The codebase has no precedent
// for asserting view/title actions (only the always-present activity-bar
// container icon). A manifest-level guard is deterministic and pins the
// exact regression — the panel states + banner are covered in
// dashboardHtml.test.ts against the same builders the panel renders.

const PKG = path.resolve(process.cwd(), "package.json");
const EXTENSION_TS = path.resolve(process.cwd(), "src", "extension.ts");
const CONTEXT_KEY = "dabblerSessionSets.routesCost";

interface MenuItem { command?: string; when?: string; group?: string }
interface Pkg {
  contributes: { menus: { commandPalette: MenuItem[]; "view/title": MenuItem[] } };
}

function readPkg(): Pkg {
  return JSON.parse(fs.readFileSync(PKG, "utf8")) as Pkg;
}

suite("cost-dashboard D3 gate wiring", () => {
  test("view/title cost action is gated on the routesCost context key", () => {
    const items = readPkg().contributes.menus["view/title"];
    const entry = items.find((m) => m.command === "dabbler.showCostDashboard");
    assert.ok(entry, "view/title must contribute dabbler.showCostDashboard");
    assert.ok(
      entry!.when && entry!.when.includes(CONTEXT_KEY),
      `view/title cost action must be gated on ${CONTEXT_KEY}; got when="${entry!.when}"`,
    );
    // Still scoped to a single view so it does not leak elsewhere. Set 110
    // S3: that view is the native tree — the webview is contributed
    // conditionally now, and an action gated on it would vanish on exactly
    // the healthy repos most likely to want a cost dashboard.
    assert.ok(entry!.when!.includes("view == dabblerWorkExplorerTree"));
  });

  test("command palette hides the cost command unless routesCost", () => {
    const items = readPkg().contributes.menus.commandPalette;
    const entry = items.find((m) => m.command === "dabbler.showCostDashboard");
    assert.ok(entry, "commandPalette must contribute a gated dabbler.showCostDashboard entry");
    assert.strictEqual(entry!.when, CONTEXT_KEY);
  });

  test("extension.ts sets the routesCost context key from router capability", () => {
    const src = fs.readFileSync(EXTENSION_TS, "utf8");
    assert.ok(
      src.includes(`"${CONTEXT_KEY}"`),
      "extension.ts must setContext the routesCost key",
    );
    assert.ok(
      /routesCost\s*\(/.test(src),
      "extension.ts must evaluate the routesCost predicate",
    );
  });
});
