// Set 093 Session 2 (routed ruling D3; S2 verification R1 Major): the host
// must STRICTLY narrow untrusted `moduleAction` / `showModuleContextMenu`
// messages and DROP malformed ones — never coerce a bad identity into the
// repo-level default (the wrong-destination hazard). These pin that contract.

import * as assert from "assert";
import {
  ModuleActionExec,
  dispatchModuleAction,
  narrowModuleAction,
  narrowModuleIdentity,
} from "../../utils/moduleActionNarrowing";

suite("moduleActionNarrowing — identity (Set 093 S2)", () => {
  test("accepts declared (non-empty slug) and pseudo (empty slug)", () => {
    assert.deepStrictEqual(narrowModuleIdentity("greeter", "declared"), {
      slug: "greeter",
      kind: "declared",
    });
    assert.deepStrictEqual(narrowModuleIdentity("", "pseudo"), {
      slug: "",
      kind: "pseudo",
    });
  });

  test("DROPS the R1 fail-open vector: null slug claiming declared → null (never repo-level)", () => {
    assert.strictEqual(narrowModuleIdentity(null, "declared"), null);
    assert.strictEqual(narrowModuleIdentity(undefined, "declared"), null);
    assert.strictEqual(narrowModuleIdentity(42 as unknown, "pseudo"), null);
  });

  test("DROPS fallback and unknown kinds (a fallback row exposes no strip)", () => {
    assert.strictEqual(narrowModuleIdentity("x", "fallback"), null);
    assert.strictEqual(narrowModuleIdentity("x", "bogus"), null);
    assert.strictEqual(narrowModuleIdentity("x", null), null);
  });

  test("enforces the kind⟺slug-shape invariant", () => {
    // declared must carry a non-empty slug; pseudo must carry "".
    assert.strictEqual(narrowModuleIdentity("", "declared"), null);
    assert.strictEqual(narrowModuleIdentity("greeter", "pseudo"), null);
  });
});

suite("moduleActionNarrowing — action (Set 093 S2, reworked Set 100 S2)", () => {
  test("open-plan is accepted on declared + pseudo", () => {
    assert.deepStrictEqual(narrowModuleAction("open-plan", "greeter", "declared"), {
      action: "open-plan",
      slug: "greeter",
      kind: "declared",
    });
    assert.deepStrictEqual(narrowModuleAction("open-plan", "", "pseudo"), {
      action: "open-plan",
      slug: "",
      kind: "pseudo",
    });
  });

  test("the three lifecycle-management actions are DECLARED-only — pseudo drops (Set 100 S2)", () => {
    for (const action of ["add-module", "rename-module", "delete-module"]) {
      assert.deepStrictEqual(narrowModuleAction(action, "greeter", "declared"), {
        action,
        slug: "greeter",
        kind: "declared",
      });
      assert.strictEqual(
        narrowModuleAction(action, "", "pseudo"),
        null,
        `${action} must drop on the pseudo module`,
      );
    }
  });

  test("the retired ai-plan / import-plan / ai-sets actions are outside the closed enum", () => {
    for (const action of ["ai-plan", "import-plan", "ai-sets"]) {
      assert.strictEqual(narrowModuleAction(action, "greeter", "declared"), null);
    }
  });

  test("DROPS actions outside the closed enum", () => {
    assert.strictEqual(narrowModuleAction("delete-everything", "greeter", "declared"), null);
    assert.strictEqual(narrowModuleAction(42 as unknown, "greeter", "declared"), null);
  });

  test("assign-legacy is pseudo-only (Unassigned) — declared drops", () => {
    assert.deepStrictEqual(narrowModuleAction("assign-legacy", "", "pseudo"), {
      action: "assign-legacy",
      slug: "",
      kind: "pseudo",
    });
    assert.strictEqual(narrowModuleAction("assign-legacy", "greeter", "declared"), null);
  });

  test("inherits every identity drop (malformed identity → dropped action)", () => {
    assert.strictEqual(narrowModuleAction("rename-module", null, "declared"), null);
    assert.strictEqual(narrowModuleAction("rename-module", "x", "fallback"), null);
    assert.strictEqual(narrowModuleAction("open-plan", "greeter", "pseudo"), null);
  });
});

// Set 093 S2 verification R3 (Major), reworked Set 100 S2: the
// strip→handler WIRING. `open-plan` routes with the narrowed slug;
// `add-module` / `rename-module` / `delete-module` / `assign-legacy` refresh
// only on a real change.
suite("moduleActionNarrowing — dispatch wiring (Set 093 S2, reworked Set 100 S2)", () => {
  function spyExec(
    opts: {
      addWrote?: boolean;
      renameWrote?: boolean;
      deleteWrote?: boolean;
      assignChanged?: boolean;
    } = {},
  ): {
    exec: ModuleActionExec;
    calls: string[];
  } {
    const calls: string[] = [];
    const exec: ModuleActionExec = {
      openPlan: async (s) => void calls.push(`openPlan:${s}`),
      addModule: async () => {
        calls.push("addModule");
        return !!opts.addWrote;
      },
      renameModule: async (s) => {
        calls.push(`renameModule:${s}`);
        return !!opts.renameWrote;
      },
      deleteModule: async (s) => {
        calls.push(`deleteModule:${s}`);
        return !!opts.deleteWrote;
      },
      assignLegacy: async () => {
        calls.push("assignLegacy");
        return !!opts.assignChanged;
      },
      refresh: () => calls.push("refresh"),
    };
    return { exec, calls };
  }

  test("open-plan routes to its handler with the narrowed slug", async () => {
    const { exec, calls } = spyExec();
    const narrowed = narrowModuleAction("open-plan", "greeter", "declared");
    assert.ok(narrowed);
    await dispatchModuleAction(narrowed!, exec);
    assert.deepStrictEqual(calls, ["openPlan:greeter"]);
  });

  test("pseudo row threads the empty slug (repo-level) for open-plan", async () => {
    const { exec, calls } = spyExec();
    const narrowed = narrowModuleAction("open-plan", "", "pseudo");
    await dispatchModuleAction(narrowed!, exec);
    assert.deepStrictEqual(calls, ["openPlan:"]);
  });

  test("add-module ignores the carried slug and refreshes only on a change", async () => {
    const wrote = spyExec({ addWrote: true });
    await dispatchModuleAction(narrowModuleAction("add-module", "greeter", "declared")!, wrote.exec);
    assert.deepStrictEqual(wrote.calls, ["addModule", "refresh"]);
    const noWrite = spyExec({ addWrote: false });
    await dispatchModuleAction(narrowModuleAction("add-module", "greeter", "declared")!, noWrite.exec);
    assert.deepStrictEqual(noWrite.calls, ["addModule"]);
  });

  test("rename-module threads the narrowed slug and refreshes only on a change", async () => {
    const wrote = spyExec({ renameWrote: true });
    await dispatchModuleAction(narrowModuleAction("rename-module", "greeter", "declared")!, wrote.exec);
    assert.deepStrictEqual(wrote.calls, ["renameModule:greeter", "refresh"]);
    const noWrite = spyExec({ renameWrote: false });
    await dispatchModuleAction(narrowModuleAction("rename-module", "greeter", "declared")!, noWrite.exec);
    assert.deepStrictEqual(noWrite.calls, ["renameModule:greeter"]);
  });

  test("delete-module threads the narrowed slug and refreshes only on a change", async () => {
    const wrote = spyExec({ deleteWrote: true });
    await dispatchModuleAction(narrowModuleAction("delete-module", "greeter", "declared")!, wrote.exec);
    assert.deepStrictEqual(wrote.calls, ["deleteModule:greeter", "refresh"]);
    const noWrite = spyExec({ deleteWrote: false });
    await dispatchModuleAction(narrowModuleAction("delete-module", "greeter", "declared")!, noWrite.exec);
    assert.deepStrictEqual(noWrite.calls, ["deleteModule:greeter"]);
  });

  test("assign-legacy runs the flow and refreshes only on a change", async () => {
    const changed = spyExec({ assignChanged: true });
    await dispatchModuleAction(narrowModuleAction("assign-legacy", "", "pseudo")!, changed.exec);
    assert.deepStrictEqual(changed.calls, ["assignLegacy", "refresh"]);
    const unchanged = spyExec({ assignChanged: false });
    await dispatchModuleAction(narrowModuleAction("assign-legacy", "", "pseudo")!, unchanged.exec);
    assert.deepStrictEqual(unchanged.calls, ["assignLegacy"]);
  });
});
