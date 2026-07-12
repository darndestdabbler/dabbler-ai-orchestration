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

suite("moduleActionNarrowing — action (Set 093 S2)", () => {
  test("accepts the four authoring actions on declared + pseudo", () => {
    for (const action of ["ai-plan", "import-plan", "open-plan", "ai-sets"]) {
      assert.deepStrictEqual(narrowModuleAction(action, "greeter", "declared"), {
        action,
        slug: "greeter",
        kind: "declared",
      });
      assert.deepStrictEqual(narrowModuleAction(action, "", "pseudo"), {
        action,
        slug: "",
        kind: "pseudo",
      });
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
    assert.strictEqual(narrowModuleAction("import-plan", null, "declared"), null);
    assert.strictEqual(narrowModuleAction("import-plan", "x", "fallback"), null);
    assert.strictEqual(narrowModuleAction("import-plan", "greeter", "pseudo"), null);
  });
});

// Set 093 S2 verification R3 (Major): the strip→handler WIRING. Each of the
// four authoring actions must route to its handler carrying the narrowed slug
// as `preselectedSlug`; assign-legacy runs its flow; import/assign refresh
// only on a real change.
suite("moduleActionNarrowing — dispatch wiring (Set 093 S2)", () => {
  function spyExec(opts: { importWrote?: boolean; assignChanged?: boolean } = {}): {
    exec: ModuleActionExec;
    calls: string[];
  } {
    const calls: string[] = [];
    const exec: ModuleActionExec = {
      aiPlan: async (s) => void calls.push(`aiPlan:${s}`),
      importPlan: async (s) => {
        calls.push(`importPlan:${s}`);
        return !!opts.importWrote;
      },
      openPlan: async (s) => void calls.push(`openPlan:${s}`),
      aiSets: async (s) => void calls.push(`aiSets:${s}`),
      assignLegacy: async () => {
        calls.push("assignLegacy");
        return !!opts.assignChanged;
      },
      refresh: () => calls.push("refresh"),
    };
    return { exec, calls };
  }

  test("each authoring action routes to its handler with the narrowed slug", async () => {
    const cases: Array<[string, string]> = [
      ["ai-plan", "aiPlan:greeter"],
      ["import-plan", "importPlan:greeter"],
      ["open-plan", "openPlan:greeter"],
      ["ai-sets", "aiSets:greeter"],
    ];
    for (const [action, expected] of cases) {
      const { exec, calls } = spyExec();
      const narrowed = narrowModuleAction(action, "greeter", "declared");
      assert.ok(narrowed);
      await dispatchModuleAction(narrowed!, exec);
      assert.deepStrictEqual(calls, [expected]);
    }
  });

  test("pseudo row threads the empty slug (repo-level)", async () => {
    const { exec, calls } = spyExec();
    const narrowed = narrowModuleAction("ai-sets", "", "pseudo");
    await dispatchModuleAction(narrowed!, exec);
    assert.deepStrictEqual(calls, ["aiSets:"]);
  });

  test("import-plan refreshes only when it wrote", async () => {
    const wrote = spyExec({ importWrote: true });
    await dispatchModuleAction(narrowModuleAction("import-plan", "greeter", "declared")!, wrote.exec);
    assert.deepStrictEqual(wrote.calls, ["importPlan:greeter", "refresh"]);
    const noWrite = spyExec({ importWrote: false });
    await dispatchModuleAction(narrowModuleAction("import-plan", "greeter", "declared")!, noWrite.exec);
    assert.deepStrictEqual(noWrite.calls, ["importPlan:greeter"]);
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
