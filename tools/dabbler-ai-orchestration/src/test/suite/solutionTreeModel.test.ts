import * as assert from "assert";
import {
  Projection,
  childrenOf,
  contractTarget,
  descriptorFor,
  orderedComponents,
  repositoryPathOf,
  rootNodes,
} from "../../providers/solutionTreeModel";
import {
  repositoryTarget,
  workspaceFileIn,
} from "../../commands/openRepository";

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

suite("the contract row's target", () => {
  test("the readable rendering wins over the source it came from", () => {
    const c = projection().components[0];
    assert.strictEqual(
      contractTarget({ ...c, contractDoc: "c/model.md" }),
      "c/model.md",
    );
  });

  test("the source is opened when nothing has been rendered yet", () => {
    const c = projection().components[0];
    assert.strictEqual(
      contractTarget({ ...c, contractDoc: null }),
      "c/model.yaml",
    );
  });
});


suite("solutionTreeModel: what other repositories build", () => {
  const external = (over: Record<string, unknown> = {}) => ({
    id: "Dabbler.Csv.Model",
    producedBy: "csv-model",
    pinned: "1.0.0",
    published: "2.0.0",
    resolve: "feed",
    root: "C:/repos/csv-model",
    reason: "",
    drift: "csv-model has published 2.0.0",
    driftKind: "behind" as const,
    ...over,
  });

  test("does not render a folder for a solution that consumes nothing", () => {
    // An empty folder is a row the reader has to open to learn nothing.
    const p = projection();
    const kinds = childrenOf({ kind: "solution" }, p).map((n) => n.kind);
    assert.ok(!kinds.includes("externalGroup"));
  });

  test("renders the drift line nothing has rendered before", () => {
    const p = projection({ external: [external()] } as Partial<Projection>);
    const row = descriptorFor({ kind: "external", id: "Dabbler.Csv.Model" }, p);
    assert.ok(row.description?.includes("v1.0.0"));
    assert.ok(row.description?.includes("2.0.0 is out"));
  });

  test("says a producer's checkout is ahead without calling it an upgrade", () => {
    // A version bumped while preparing a release is not something anyone can
    // move to yet.
    const p = projection({
      external: [external({ driftKind: "ahead", published: null })],
    } as Partial<Projection>);
    const row = descriptorFor({ kind: "external", id: "Dabbler.Csv.Model" }, p);
    assert.ok(row.description?.includes("ahead"));
    assert.ok(!row.description?.includes("is out"));
  });

  test("offers navigation only for a repository that is on this machine", () => {
    // A menu entry that fails when it is used costs more trust than one that
    // is not there.
    const here = projection({ external: [external()] } as Partial<Projection>);
    const away = projection({
      external: [external({ root: null, reason: "not on this machine" })],
    } as Partial<Projection>);
    const node = { kind: "external" as const, id: "Dabbler.Csv.Model" };
    assert.strictEqual(descriptorFor(node, here).contextValue, "dabblerExternalHere");
    assert.strictEqual(descriptorFor(node, away).contextValue, "dabblerExternalAbsent");
  });

  test("resolves the path through the row the operator clicked", () => {
    const p = projection({ external: [external()] } as Partial<Projection>);
    const node = { kind: "external" as const, id: "Dabbler.Csv.Model" };
    assert.strictEqual(repositoryPathOf(node, p), "C:/repos/csv-model");
    assert.strictEqual(repositoryPathOf({ kind: "solution" }, p), null);
  });

  test("explains an absent sibling rather than failing at it", () => {
    // The graph is a declaration about a solution, not about one laptop.
    const p = projection({
      external: [external({ root: null })],
    } as Partial<Projection>);
    const target = repositoryTarget({
      node: { kind: "external", id: "Dabbler.Csv.Model" },
      projection: p,
    });
    assert.strictEqual(target.path, null);
    assert.ok(target.reason.includes("not on this machine"));
  });

  test("renders the consumers of a package as derived rows", () => {
    // `usedBy` is a reading of who declares what, and it is why nothing is
    // allowed to state it in a file.
    const p = projection({
      external: [
        external({
          usedBy: ["csv-app", "csv-report"],
          pins: [
            { repository: "csv-app", version: "1.0.0" },
            { repository: "csv-report", version: "2.0.0" },
          ],
        }),
      ],
    } as Partial<Projection>);
    const kids = childrenOf({ kind: "external", id: "Dabbler.Csv.Model" }, p);
    assert.deepStrictEqual(kids, [
      { kind: "externalUsedBy", id: "Dabbler.Csv.Model" },
    ]);
    const consumers = childrenOf({ kind: "externalUsedBy", id: "Dabbler.Csv.Model" }, p);
    assert.strictEqual(consumers.length, 2);
    const row = descriptorFor(
      { kind: "externalConsumer", id: "Dabbler.Csv.Model", repository: "csv-report" },
      p,
    );
    assert.strictEqual(row.description, "v2.0.0");
  });

  test("flags two repositories on two versions of one package", () => {
    // The diamond that makes an upgrade a negotiation, and one repository
    // cannot see it.
    const p = projection({
      external: [
        external({
          usedBy: ["csv-app", "csv-report"],
          pins: [
            { repository: "csv-app", version: "1.0.0" },
            { repository: "csv-report", version: "2.0.0" },
          ],
        }),
      ],
    } as Partial<Projection>);
    const row = descriptorFor({ kind: "externalUsedBy", id: "Dabbler.Csv.Model" }, p);
    assert.strictEqual(row.icon?.tone, "attention");
  });

  test("does not open a package only this repository takes", () => {
    // One consumer is what the row already says.
    const p = projection({
      external: [external({ usedBy: ["csv-app"] })],
    } as Partial<Projection>);
    assert.strictEqual(
      descriptorFor({ kind: "external", id: "Dabbler.Csv.Model" }, p).expandable,
      false,
    );
  });

  test("asks for a row when it was given none", () => {
    const target = repositoryTarget({});
    assert.strictEqual(target.path, null);
    assert.ok(target.reason.includes("Solution Explorer"));
  });
});

suite("openSolutionWorkspace: one window over the solution", () => {
  test("opens the file the router reported writing, not one it recomputed", () => {
    // A second derivation eventually disagrees with the first, and opening a
    // workspace other than the one just written is a near-miss nobody debugs
    // quickly.
    const said = [
      "  csv-app                  .",
      "  csv-model                ../csv-model",
      "",
      "wrote C:/repos/csv-app/.dabbler/solution.code-workspace",
      "It is derived from the graph and lives under `.dabbler/`.",
    ].join("\n");
    assert.strictEqual(
      workspaceFileIn(said),
      "C:/repos/csv-app/.dabbler/solution.code-workspace",
    );
  });

  test("opens nothing when the router wrote nothing", () => {
    // "This repository reaches no other repository here" is an answer, and
    // opening something anyway would contradict it.
    assert.strictEqual(
      workspaceFileIn(
        "workspace: this repository reaches no other repository on this machine",
      ),
      null,
    );
  });

  test("does not read a path out of prose that merely mentions one", () => {
    // The line the router prints is the contract; a sentence describing the
    // file is not the router saying it wrote it.
    assert.strictEqual(
      workspaceFileIn("it would go to C:/repos/x/.dabbler/solution.code-workspace"),
      null,
    );
  });
});
