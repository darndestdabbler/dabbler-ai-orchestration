import * as assert from "assert";
import { planLeftClickActivation } from "../../providers/rowMenuHelpers";

// Set 048 S3 — the L5 left-click planner: a pure function deciding what
// activating a set row should DO. Set 110 S3: it is now shared by the native
// tree's row command, so it is more load-bearing than it was, not less.

// Set 110 Session 3: the `buildTopLevelItems` / `buildSubmenuItems` suites
// ended here. They exercised the two-step QuickPick that stood in for a
// hierarchical context menu the webview could not draw. VS Code renders the
// real thing from `contributes.submenus` now, and the CONTRACT that replaced
// them — every registry action reaches exactly one menu, and every menu entry
// is reachable by some real row — is checked bidirectionally against the real
// `package.json` in `workExplorerMenuParity.test.ts`. That is a stronger
// assertion than the item-shape tests it replaces, because it fails on a menu
// entry nothing can reach as well as on an action nothing exposes.

suite("rowMenuHelpers — planLeftClickActivation (L5)", () => {
  test("ALWAYS opens spec.md (preserved S4 default)", () => {
    for (const st of ["in-progress", "not-started", "complete", "cancelled"] as const) {
      const plan = planLeftClickActivation("xy", st);
      assert.strictEqual(plan.openCommand.commandId, "dabblerSessionSets.openSpec");
      assert.strictEqual(plan.openCommand.setName, "xy");
    }
  });

  test("non-terminal rows ALSO copy 'Start the next session of `<slug>`.' + toast", () => {
    for (const st of ["in-progress", "not-started"] as const) {
      const plan = planLeftClickActivation("xy", st);
      assert.ok(plan.clipboardWrite !== null, `expected clipboard write for state=${st}`);
      assert.strictEqual(plan.clipboardWrite!.text, "Start the next session of `xy`.");
      assert.strictEqual(plan.clipboardWrite!.toast, "Copied: Start the next session of xy");
    }
  });

  test("terminal rows skip the clipboard write and toast", () => {
    for (const st of ["complete", "cancelled"] as const) {
      const plan = planLeftClickActivation("xy", st);
      assert.strictEqual(plan.clipboardWrite, null);
    }
  });

  test("clipboard text uses the set's slug verbatim (no escaping ambiguity)", () => {
    const plan = planLeftClickActivation("048-lightweight-tier-parity", "in-progress");
    assert.strictEqual(
      plan.clipboardWrite!.text,
      "Start the next session of `048-lightweight-tier-parity`.",
    );
  });

  test("sanitizes backticks in slug so the markdown payload stays well-formed (S3 verifier-flagged)", () => {
    const plan = planLeftClickActivation("set`-with-backtick", "in-progress");
    assert.strictEqual(
      plan.clipboardWrite!.text,
      "Start the next session of `set'-with-backtick`.",
    );
    // The toast preserves the original name (no markdown rendering on
    // an info notification) — only the clipboard text gets sanitized.
    assert.strictEqual(
      plan.clipboardWrite!.toast,
      "Copied: Start the next session of set`-with-backtick",
    );
  });

  test("unknown/future state values fail CLOSED — skip clipboard, still open spec.md", () => {
    // Defense-in-depth: if a schema migration introduces a new state
    // value (e.g., "archived"), planLeftClickActivation should NOT
    // fire the L5 clipboard shortcut on a bucket the operator never
    // approved for it. The TS type narrows to the closed 4-value
    // union, but runtime can still see widened strings under cast.
    const plan = planLeftClickActivation(
      "xy",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      "archived" as any,
    );
    assert.strictEqual(plan.openCommand.commandId, "dabblerSessionSets.openSpec");
    assert.strictEqual(plan.clipboardWrite, null);
  });
});
