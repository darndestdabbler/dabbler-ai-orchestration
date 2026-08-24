import * as assert from "assert";
import {
  Projection,
  childrenOf,
  descriptorFor,
  orderedComponents,
  rootNodes,
} from "../../providers/solutionTreeModel";

function projection(over: Partial<Projection> = {}): Projection {
  return {
    solution: {
      name: "csv-demo", title: "CSV walkthrough", step: "contracts",
      stepTitle: "Write down the promises", stepNumber: 3, stepCount: 6,
      waitingOn: null, returns: 0,
    },
    components: [
      {
        name: "csv-model", kind: "library", title: "Record model",
        step: "build", stepTitle: "Replace the stand-ins for real",
        stepNumber: 6, version: "1.0.0", contract: "c/model.yaml",
        dependsOn: [], usedBy: ["csv-app", "csv-parser"], returns: 0,
      },
      {
        name: "csv-app", kind: "integration", title: "The app",
        step: "mocks", stepTitle: "Build stand-ins", stepNumber: 4,
        dependsOn: ["csv-parser"], usedBy: [], returns: 0,
      },
      {
        name: "csv-parser", kind: "library", title: "Parser",
        step: "mocks", stepTitle: "Build stand-ins", stepNumber: 4,
        dependsOn: ["csv-model"], usedBy: ["csv-app"], returns: 2,
        owner: "Ama", waitingOn: "developer", contract: null,
      },
    ],
    needsYou: ["csv-parser"],
    ...over,
  };
}

suite("solutionTreeModel: shape", () => {
  test("the integration sorts last, since it composes the others", () => {
    const names = orderedComponents(projection()).map((c) => c.name);
    assert.deepStrictEqual(names, ["csv-model", "csv-parser", "csv-app"]);
  });

  test("the root is the solution, and it expands to components", () => {
    const p = projection();
    const roots = rootNodes();
    assert.strictEqual(roots.length, 1);
    assert.strictEqual(childrenOf(roots[0], p).length, 3);
  });

  test("a component with no consumers omits the Used by row", () => {
    const p = projection();
    const kinds = childrenOf({ kind: "component", name: "csv-app" }, p)
      .map((n) => n.kind);
    assert.ok(!kinds.includes("usedBy"));
    assert.ok(kinds.includes("contract"));
  });

  test("Used by expands to one row per consumer", () => {
    const p = projection();
    const kids = childrenOf({ kind: "usedBy", name: "csv-model" }, p);
    assert.deepStrictEqual(
      kids.map((k) => (k as { consumer: string }).consumer),
      ["csv-app", "csv-parser"],
    );
  });

  test("an unknown component yields no children rather than throwing", () => {
    assert.deepStrictEqual(
      childrenOf({ kind: "component", name: "ghost" }, projection()), []);
  });
});

suite("solutionTreeModel: rows", () => {
  test("the solution row carries its step position", () => {
    const d = descriptorFor({ kind: "solution" }, projection());
    assert.ok(d.description?.includes("step 3/6"));
  });

  test("the solution row flags when something waits on the developer", () => {
    const d = descriptorFor({ kind: "solution" }, projection());
    assert.strictEqual(d.icon?.tone, "attention");
    assert.ok(d.tooltip?.includes("csv-parser"));
  });

  test("nothing waiting means no attention tone", () => {
    const d = descriptorFor({ kind: "solution" }, projection({ needsYou: [] }));
    assert.strictEqual(d.icon?.tone, undefined);
  });

  test("a component shows version, step and owner", () => {
    const d = descriptorFor({ kind: "component", name: "csv-parser" }, projection());
    assert.ok(d.description?.includes("4/6"));
    assert.ok(d.description?.includes("Ama"));
  });

  test("a component that has been sent back says so", () => {
    const d = descriptorFor({ kind: "component", name: "csv-parser" }, projection());
    assert.ok(d.description?.includes("2× sent back"));
  });

  test("a finished component reads as done", () => {
    const d = descriptorFor({ kind: "component", name: "csv-model" }, projection());
    assert.strictEqual(d.icon?.tone, "done");
  });

  test("a component waiting on the developer takes the attention tone", () => {
    const d = descriptorFor({ kind: "component", name: "csv-parser" }, projection());
    assert.strictEqual(d.icon?.tone, "attention");
  });

  test("a missing contract says so rather than looking present", () => {
    const d = descriptorFor({ kind: "contract", name: "csv-parser" }, projection());
    assert.strictEqual(d.description, "not written yet");
  });

  test("Used by explains what it means for the reader", () => {
    const d = descriptorFor({ kind: "usedBy", name: "csv-model" }, projection());
    assert.strictEqual(d.description, "2");
    assert.ok(d.tooltip?.includes("break"));
  });

  test("progress renders the step as a bar", () => {
    const d = descriptorFor({ kind: "progress", name: "csv-model" }, projection());
    assert.strictEqual(d.description, "■■■■■■");
  });

  test("every node kind resolves to a descriptor with a stable id", () => {
    const p = projection();
    const nodes = [
      { kind: "solution" as const },
      { kind: "component" as const, name: "csv-model" },
      { kind: "contract" as const, name: "csv-model" },
      { kind: "usedBy" as const, name: "csv-model" },
      { kind: "consumer" as const, name: "csv-model", consumer: "csv-app" },
      { kind: "progress" as const, name: "csv-model" },
    ];
    const ids = nodes.map((n) => descriptorFor(n, p).id);
    assert.strictEqual(new Set(ids).size, ids.length);
    ids.forEach((id) => assert.ok(id.length > 0));
  });
});
