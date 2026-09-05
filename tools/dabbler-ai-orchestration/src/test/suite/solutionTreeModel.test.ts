import * as assert from "assert";
import {
  PROJECTION_RELPATH,
  PROJECTION_SOURCE_GLOBS,
  Projection,
  childrenOf,
  contractTarget,
  descriptorFor,
  externalLocation,
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

  test("tells three location states apart, and gates each row's menu on which", () => {
    // A menu entry that fails when it is used costs more trust than one that
    // is not there -- and "not here" is not one state: a known remote is a
    // clone away, while a producer nobody has placed needs a person.
    const here = projection({ external: [external()] } as Partial<Projection>);
    const cloneable = projection({
      external: [
        external({
          root: null,
          remote: "git@github.com:dabbler/csv-model.git",
          reason: "not on this machine",
        }),
      ],
    } as Partial<Projection>);
    const away = projection({
      external: [external({ root: null, remote: null, reason: "not on this machine" })],
    } as Partial<Projection>);
    const node = { kind: "external" as const, id: "Dabbler.Csv.Model" };
    assert.strictEqual(externalLocation(here.external![0]), "here");
    assert.strictEqual(descriptorFor(node, here).contextValue, "dabblerExternalHere");
    assert.strictEqual(descriptorFor(node, cloneable).contextValue, "dabblerExternalRemote");
    assert.strictEqual(descriptorFor(node, away).contextValue, "dabblerExternalUnknown");
    // Muted, not attention: a checkout nobody made is a fact about this
    // laptop and not a defect anyone has to answer for. Drift still wins,
    // because that one IS something to do.
    const quiet = projection({
      external: [
        external({ root: null, remote: null, drift: null, driftKind: null, published: null }),
      ],
    } as Partial<Projection>);
    assert.strictEqual(descriptorFor(node, quiet).icon?.tone, "muted");
    assert.strictEqual(descriptorFor(node, away).icon?.tone, "attention");

    // A declared path that is not there was still DECLARED. Telling the
    // reader nobody said where it lives sends them looking for a
    // declaration that already exists and is simply wrong here.
    const moved = projection({
      external: [
        external({ root: null, remote: null, declaredPath: "../csv-model" }),
      ],
    } as Partial<Projection>);
    const row = descriptorFor(node, moved);
    assert.strictEqual(row.contextValue, "dabblerExternalUnknown");
    assert.ok(row.description?.includes("declared at ../csv-model"));
    assert.ok(!row.description?.includes("nobody has said"));
  });

  test("renders a repository nothing depends on, and says which way each edge runs", () => {
    // The upstream direction, without a second declared one: csv-cli is here
    // because its own declaration names this solution (D254).
    const p = projection({
      external: [external()],
      members: [
        { id: "csv-app", self: true, root: "C:/repos/csv-app", provides: [], consumes: [], shell: false },
        {
          id: "csv-model",
          self: false,
          root: "C:/repos/csv-model",
          provides: ["Dabbler.Csv.Model"],
          consumes: [],
          shell: false,
        },
        { id: "csv-cli", self: false, root: null, remote: null, provides: [], consumes: [], shell: true },
      ],
    } as Partial<Projection>);

    const kinds = childrenOf({ kind: "solution" }, p).map((n) => n.kind);
    assert.ok(kinds.includes("memberGroup"));
    assert.deepStrictEqual(
      childrenOf({ kind: "memberGroup" }, p).map((n) => (n as { id: string }).id),
      ["csv-app", "csv-model", "csv-cli"],
    );
    const shell = descriptorFor({ kind: "member", id: "csv-cli" }, p);
    assert.ok(shell.description?.includes("placemarker"));
    assert.ok(shell.description?.includes("location undeclared"));
    const producer = descriptorFor({ kind: "member", id: "csv-model" }, p);
    assert.ok(producer.description?.includes("you take 1"));
  });

  test("resolves the path through the row the operator clicked", () => {
    const p = projection({ external: [external()] } as Partial<Projection>);
    const node = { kind: "external" as const, id: "Dabbler.Csv.Model" };
    assert.strictEqual(repositoryPathOf(node, p), "C:/repos/csv-model");
    assert.strictEqual(repositoryPathOf({ kind: "solution" }, p), null);
  });

  test("a component that never entered the workflow says nothing about its steps", () => {
    // csv-model feedback item 14. `1/6 Plan and design` rendered forever on
    // a bootstrapped repository: the step is declared in the manifest and
    // nothing in the session lifecycle advances the component workflow, so
    // the reading never changed and was never a position.
    const p = projection({
      solution: {
        name: "csv-demo", title: "CSV walkthrough", step: "design",
        stepTitle: "Plan and design", stepNumber: 1, stepCount: 6,
        waitingOn: null, returns: 0, entered: false,
      },
      components: [
        {
          name: "csv-model", kind: "library", title: "Record model",
          step: "design", stepTitle: "Plan and design", stepNumber: 1,
          dependsOn: [], usedBy: [], returns: 0, entered: false,
        },
        {
          name: "csv-parser", kind: "library", title: "Parser",
          step: "mocks", stepTitle: "Build stand-ins", stepNumber: 4,
          dependsOn: [], usedBy: [], returns: 0, entered: true,
        },
      ],
    } as Partial<Projection>);

    const quiet = descriptorFor({ kind: "component", name: "csv-model" }, p);
    assert.ok(!quiet.description?.includes("1/6"));
    assert.ok(!quiet.description?.includes("Plan and design"));
    // No progress bar under it either: one filled square forever reads as
    // progress and is a default.
    assert.deepStrictEqual(
      childrenOf({ kind: "component", name: "csv-model" }, p).map((n) => n.kind),
      ["contract"],
    );
    // And the Contract row stops naming a step nothing will reach.
    const contract = descriptorFor({ kind: "contract", name: "csv-model" }, p);
    assert.ok(!contract.tooltip?.includes("step 3"));
    assert.ok(contract.tooltip?.includes("No contract yet"));

    // The solution head, same rule.
    assert.ok(!descriptorFor({ kind: "solution" }, p).description?.includes("step 1/6"));

    // A component that HAS entered is untouched: the row set, the N/6 and
    // the progress bar are exactly what they were.
    const live = descriptorFor({ kind: "component", name: "csv-parser" }, p);
    assert.ok(live.description?.includes("4/6 Build stand-ins"));
    assert.ok(
      childrenOf({ kind: "component", name: "csv-parser" }, p).some((n) => n.kind === "progress"),
    );

    // A projection written before the field existed says nothing about it,
    // and silence reads as the behaviour it was rendered under.
    const older = projection();
    assert.ok(
      descriptorFor({ kind: "component", name: "csv-model" }, older).description?.includes("6/6"),
    );
  });

  test("the tree watches what the projection is derived from, not only the projection", () => {
    // csv-model feedback item 7. The projection is written by the four
    // commands that record an event and by nothing else, so a declaration
    // edited during a session moved nothing: the view watched one file that
    // nobody had rewritten, and refreshing over it re-read the same bytes.
    // What the tree re-derives on is the INPUTS.
    const globs = [...PROJECTION_SOURCE_GLOBS];
    // What this repository builds, and what it takes from the others: the
    // component rows come from the first, the membership rows from the
    // second and from nowhere else.
    assert.ok(globs.includes("solution.yaml"));
    assert.ok(globs.includes("solution-dependencies.json"));
    // The step, the loop counters and who each component is waiting on are
    // a fold of the event log.
    assert.ok(globs.includes(".dabbler/solution/events.jsonl"));
    // The pin is read from the build files on every projection rather than
    // copied, so the drift rows change when they do.
    assert.ok(globs.some((g) => g.endsWith("*.csproj")));
    assert.ok(globs.some((g) => g.endsWith("pom.xml")));

    // And never the projection itself: it is this list's output, so
    // re-deriving on it would be a loop that never settles.
    assert.ok(!globs.includes(PROJECTION_RELPATH));
    assert.ok(!globs.some((g) => g.includes("projection.json")));
    // Nothing under the run records either. Those are the session's
    // lifecycle and the Work Explorer's subject; they change many times a
    // minute and change nothing this tree renders.
    assert.ok(!globs.some((g) => g.includes(".dabbler/runs")));
  });

  test("a membership row can be opened, cloned or located like a producer row", () => {
    // "Solution repositories" was a list nothing could be done to: the rows
    // carried no contextValue at all, so no menu entry matched, and
    // `repositoryPathOf` answered only for producer rows, so the commands
    // would have had no folder even if one had. It is the list holding the
    // repositories no edge reaches yet -- the next one the plan needs.
    const p = projection({
      members: [
        { id: "csv-app", self: true, root: "C:/repos/csv-app", provides: [], consumes: [], shell: false },
        {
          id: "csv-model",
          self: false,
          root: "C:/repos/csv-model",
          provides: ["Dabbler.Csv.Model"],
          consumes: [],
          shell: false,
        },
        {
          id: "csv-reports",
          self: false,
          root: null,
          remote: "git@github.com:dabbler/csv-reports.git",
          provides: [],
          consumes: [],
          shell: false,
        },
        { id: "csv-cli", self: false, root: null, remote: null, provides: [], consumes: [], shell: true },
      ],
    } as Partial<Projection>);
    const row = (id: string) => descriptorFor({ kind: "member", id }, p);
    // The same three values the producer rows carry, so the entries already
    // in the manifest reach these rows with no second `when`.
    assert.strictEqual(row("csv-model").contextValue, "dabblerExternalHere");
    assert.strictEqual(row("csv-reports").contextValue, "dabblerExternalRemote");
    assert.strictEqual(row("csv-cli").contextValue, "dabblerExternalUnknown");
    // This repository's own row is here, because it is: Reveal on it is the
    // ordinary way to find the checkout, and an exception would be a second
    // rule about where a row's repository is.
    assert.strictEqual(row("csv-app").contextValue, "dabblerExternalHere");

    assert.strictEqual(
      repositoryPathOf({ kind: "member", id: "csv-model" }, p),
      "C:/repos/csv-model",
    );
    assert.strictEqual(repositoryPathOf({ kind: "member", id: "csv-app" }, p), "C:/repos/csv-app");
    // Not on this machine, and the reading says so rather than guessing a
    // folder for a command to fail on.
    assert.strictEqual(repositoryPathOf({ kind: "member", id: "csv-reports" }, p), null);
    assert.strictEqual(repositoryPathOf({ kind: "member", id: "nobody" }, p), null);
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
