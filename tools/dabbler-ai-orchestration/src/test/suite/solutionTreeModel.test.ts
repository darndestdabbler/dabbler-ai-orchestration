import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";
import { spawnProgram, tryWriteProjection } from "dabbler-ai-router";
import {
  NO_MODULES_YET,
  PROJECTION_RELPATH,
  PROJECTION_SOURCE_GLOBS,
  Projection,
  ProjectionConfiguration,
  ProjectionModule,
  childrenOf,
  contractTarget,
  descriptorFor,
  externalLocation,
  repositoryPathOf,
  rootNodes,
} from "../../providers/solutionTreeModel";
import {
  repositoryTarget,
  workspaceFileIn,
} from "../../commands/openRepository";
import { makeTempDir, rmrf, writeFileTree } from "./helpers";

/** The CSV pipeline's four modules, as the router projects them: dependency order, usedBy derived. */
function modules(): ProjectionModule[] {
  return [
    {
      slug: "model", title: "CSV model", kind: "shared-types", package: "CsvModel",
      contract: "package", codeRoots: ["modules/model"], dependsOn: [],
      usedBy: ["deserializer", "persister", "listener"], contractDir: "modules/model/contract",
    },
    {
      slug: "deserializer", title: "CSV deserializer", kind: "library", package: "CsvDeserializer",
      contract: "designed", codeRoots: ["modules/deserializer"], dependsOn: ["model"],
      usedBy: ["listener"], contractDir: null,
    },
    {
      slug: "persister", title: "EF Core persister", kind: "library", package: "CsvPersister",
      contract: "designed", codeRoots: ["modules/persister"], dependsOn: ["model"],
      usedBy: ["listener"], contractDir: null,
    },
    {
      slug: "listener", title: "The listener", kind: "application", package: null,
      contract: null, codeRoots: ["modules/listener"],
      dependsOn: ["model", "deserializer", "persister"], usedBy: [], contractDir: null,
    },
  ];
}

function projection(over: Partial<Projection> = {}): Projection {
  const rows = modules();
  return {
    solution: { name: "csv-pipeline", title: "csv-pipeline", multi: true, implicit: false, moduleCount: rows.length },
    modules: rows,
    ...over,
  };
}

/** A repository that IS its one module: an absent manifest, or one entry. */
function single(): Projection {
  return {
    solution: { name: "csv-model", title: "csv-model", multi: false, implicit: true, moduleCount: 1 },
    modules: [
      {
        slug: "csv-model", title: "csv-model", kind: "application", package: null, contract: null,
        codeRoots: ["."], dependsOn: [], usedBy: [], contractDir: null,
      },
    ],
  };
}

suite("solutionTreeModel: modules", () => {
  test("renders the modules in the router's dependency order, with depends-on and used-by derived", () => {
    const p = projection();
    const roots = rootNodes();
    // The solution, and beside it what a session is run with.
    assert.deepStrictEqual(roots.map((n) => n.kind), ["solution", "configuration"]);
    const rows = childrenOf(roots[0], p);
    assert.deepStrictEqual(
      rows.map((n) => (n as { slug: string }).slug),
      ["model", "deserializer", "persister", "listener"],
    );
    // The shared-types module at the bottom is used by everything above it,
    // and the row says so without anyone having written it down.
    const model = childrenOf({ kind: "module", slug: "model" }, p).map((n) => n.kind);
    assert.deepStrictEqual(model, ["contract", "usedBy"]);
    assert.deepStrictEqual(
      childrenOf({ kind: "usedBy", slug: "model" }, p).map((n) => (n as { consumer: string }).consumer),
      ["deserializer", "persister", "listener"],
    );
    // The application composes the three and nothing uses it.
    const listener = childrenOf({ kind: "module", slug: "listener" }, p).map((n) => n.kind);
    assert.deepStrictEqual(listener, ["dependsOn"]);
    assert.deepStrictEqual(
      childrenOf({ kind: "dependsOn", slug: "listener" }, p).map((n) => (n as { dependency: string }).dependency),
      ["model", "deserializer", "persister"],
    );
    const row = descriptorFor({ kind: "module", slug: "persister" }, p);
    assert.ok(row.description?.includes("library"));
    assert.ok(row.description?.includes("CsvPersister"));
    assert.strictEqual(row.tooltip, "EF Core persister");
    assert.ok(descriptorFor({ kind: "solution" }, p).description?.includes("4 modules"));
  });

  test("the module a session is working in says so, in the milestone tone, and carries ;active", () => {
    const p = projection();
    const persister = p.modules.find((m) => m.slug === "persister");
    assert.ok(persister);
    persister.inSession = 7;
    const active = descriptorFor({ kind: "module", slug: "persister" }, p);
    assert.ok(active.description?.startsWith("● session 7"), active.description);
    assert.strictEqual(active.icon?.tone, "milestone");
    assert.ok(active.contextValue?.includes(";active"));
    assert.ok(active.tooltip?.includes("session 7 is working here"));
    const idle = descriptorFor({ kind: "module", slug: "model" }, p);
    assert.ok(!idle.description?.includes("session"));
    assert.ok(!idle.contextValue?.includes(";active"));
  });

  test("the module the next session's plan names carries ;next-session, and no other row does", () => {
    // Start Focused Session is gated on it: one click on that row opens the
    // module's window with its AI in it, and the button is nowhere else.
    const p = projection();
    const context = { nextSessionModule: "persister" };
    assert.ok(descriptorFor({ kind: "module", slug: "persister" }, p, context).contextValue?.includes(";next-session"));
    assert.ok(!descriptorFor({ kind: "module", slug: "model" }, p, context).contextValue?.includes(";next-session"));
    assert.ok(!descriptorFor({ kind: "module", slug: "persister" }, p).contextValue?.includes(";next-session"));
  });

  test("the module row reads its run of record, and a consumer whose contract suite against it is red reads blocking", () => {
    // Both are readings of the records beside the run, projected by the
    // router; the row restates them and computes nothing.
    const rows = modules().map((m) =>
      m.slug === "model"
        ? { ...m, runOfRecord: "green" as const, blocking: ["persister"] }
        : m.slug === "persister"
          ? { ...m, runOfRecord: "red" as const, blocking: [] }
          : { ...m, runOfRecord: "none" as const, blocking: [] },
    );
    const p = projection({ modules: rows });
    const model = descriptorFor({ kind: "module", slug: "model" }, p);
    assert.ok(model.description?.includes("run of record: green"), model.description);
    assert.strictEqual(model.icon?.tone, "done");
    const persister = descriptorFor({ kind: "module", slug: "persister" }, p);
    assert.ok(persister.description?.includes("run of record: red"));
    assert.strictEqual(persister.icon?.tone, "attention");
    assert.ok(descriptorFor({ kind: "module", slug: "listener" }, p).description?.includes("run of record: none"));

    // Under the model's used-by, the persister is blocked; the deserializer is not.
    const blocked = descriptorFor({ kind: "consumer", slug: "model", consumer: "persister" }, p);
    assert.strictEqual(blocked.description, "blocking");
    assert.strictEqual(blocked.icon?.tone, "attention");
    const fine = descriptorFor({ kind: "consumer", slug: "model", consumer: "deserializer" }, p);
    assert.strictEqual(fine.description, undefined);

    // A single-module solution's row says nothing of a run of record: the
    // repository is the module, and the Work Explorer is where its runs read.
    const single = descriptorFor({ kind: "module", slug: "csv-model" }, {
      solution: { name: "csv-model", title: "csv-model", multi: false, implicit: true, moduleCount: 1 },
      modules: [{ slug: "csv-model", title: "csv-model", kind: "application", package: null, contract: null, codeRoots: ["."], dependsOn: [], usedBy: [], contractDir: null, runOfRecord: "none" }],
    });
    assert.ok(!single.description?.includes("run of record"));
  });

  test("a single-module solution is one row with nothing under it", () => {
    // The repository is the module. Nothing module-shaped has switched on,
    // and the tree says so by having nothing to expand.
    const p = single();
    const rows = childrenOf({ kind: "solution" }, p);
    assert.strictEqual(rows.length, 1);
    assert.deepStrictEqual(childrenOf(rows[0], p), []);
    const row = descriptorFor(rows[0], p);
    assert.strictEqual(row.label, "csv-model");
    assert.strictEqual(row.expandable, false);
    assert.strictEqual(descriptorFor({ kind: "solution" }, p).description, "one module");
  });

  test("an empty manifest says what session 1 does", () => {
    const p = projection({
      solution: { name: "fresh", title: "fresh", multi: false, implicit: false, moduleCount: 0 },
      modules: [],
    });
    assert.deepStrictEqual(childrenOf({ kind: "solution" }, p), []);
    const row = descriptorFor({ kind: "solution" }, p);
    assert.strictEqual(row.description, NO_MODULES_YET);
    assert.ok(row.tooltip?.includes("docs/modules.yaml"));
  });

  test("the contract row opens the notes page when the router found the folder, and says so when it did not", () => {
    const p = projection();
    const has = descriptorFor({ kind: "contract", slug: "model" }, p);
    assert.strictEqual(has.description, "open");
    assert.strictEqual(contractTarget(p.modules[0]), "modules/model/contract/README.md");
    const missing = descriptorFor({ kind: "contract", slug: "persister" }, p);
    assert.strictEqual(missing.description, "not written yet");
    assert.strictEqual(contractTarget(p.modules[2]), undefined);
  });

  test("an unknown module yields no children rather than throwing", () => {
    assert.deepStrictEqual(childrenOf({ kind: "module", slug: "ghost" }, projection()), []);
  });

  test("every node kind resolves to a descriptor with a stable id", () => {
    const p = projection();
    const nodes = [
      { kind: "solution" as const },
      { kind: "module" as const, slug: "model" },
      { kind: "contract" as const, slug: "model" },
      { kind: "dependsOn" as const, slug: "listener" },
      { kind: "dependency" as const, slug: "listener", dependency: "model" },
      { kind: "usedBy" as const, slug: "model" },
      { kind: "consumer" as const, slug: "model", consumer: "listener" },
    ];
    const ids = nodes.map((n) => descriptorFor(n, p).id);
    assert.strictEqual(new Set(ids).size, ids.length);
    ids.forEach((id) => assert.ok(id.length > 0));
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

  test("the tree watches what the projection is derived from, not only the projection", () => {
    // csv-model feedback item 7. The projection is written by the four
    // commands that record an event and by nothing else, so a declaration
    // edited during a session moved nothing: the view watched one file that
    // nobody had rewritten, and refreshing over it re-read the same bytes.
    // What the tree re-derives on is the INPUTS.
    const globs = [...PROJECTION_SOURCE_GLOBS];
    // What this repository builds, and what it takes from the others: the
    // module rows come from the first, the membership rows from the second
    // and from nowhere else.
    assert.ok(globs.includes("docs/modules.yaml"));
    assert.ok(globs.includes("solution-dependencies.json"));
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

  test("the bundles node renders each bundle record with its dependencies, and a module reads where it shipped", () => {
    const rows = modules().map((m) =>
      m.slug === "model" || m.slug === "persister" || m.slug === "listener" ? { ...m, shippedIn: ["listener"] } : { ...m, shippedIn: [] },
    );
    const p = projection({
      modules: rows,
      bundles: [
        {
          bundle: "listener",
          version: "2.0.0",
          baseCommit: "abc123def456",
          date: "2026-09-07",
          session: 12,
          dependencies: [
            { module: "model", package: "CsvModel", version: "1.2.0", digest: "m-120" },
            { module: "persister", package: "CsvPersister", version: "0.4.1", digest: null },
          ],
        },
      ],
    });
    // Under the solution, after the modules: a bundles node with one row per record.
    const top = childrenOf({ kind: "solution" }, p);
    assert.ok(top.some((n) => n.kind === "bundleGroup"));
    const group = descriptorFor({ kind: "bundleGroup" }, p);
    assert.strictEqual(group.label, "Bundles");
    assert.strictEqual(group.description, "1");
    const bundles = childrenOf({ kind: "bundleGroup" }, p);
    assert.deepStrictEqual(bundles, [{ kind: "bundle", bundle: "listener" }]);
    const row = descriptorFor({ kind: "bundle", bundle: "listener" }, p);
    assert.strictEqual(row.description, "2.0.0 · 2026-09-07");
    assert.ok(row.tooltip?.includes("abc123def456"));
    const deps = childrenOf({ kind: "bundle", bundle: "listener" }, p);
    assert.deepStrictEqual(deps.map((n) => (n as { pkg: string }).pkg), ["CsvModel", "CsvPersister"]);
    assert.strictEqual(descriptorFor({ kind: "bundleDependency", bundle: "listener", pkg: "CsvModel" }, p).description, "1.2.0 (model)");
    // The module row says where it shipped; a solution with no record has no bundles node.
    assert.ok(descriptorFor({ kind: "module", slug: "model" }, p).description?.includes("shipped in: listener"));
    assert.ok(!childrenOf({ kind: "solution" }, projection()).some((n) => n.kind === "bundleGroup"));
  });

  test("a bundle row names the modules the deployable ships, and one with none reads as before", () => {
    // A deployable can ship several application modules, so the row says
    // which -- and a record written before deployables existed names none.
    const p = projection({
      modules: modules().map((m) => ({ ...m, shippedIn: m.slug === "listener" ? ["edge"] : [] })),
      bundles: [
        {
          bundle: "edge",
          from: ["listener", "tool"],
          version: "3.1.0",
          baseCommit: "abc123def456",
          date: "2026-09-07",
          session: 20,
          dependencies: [{ module: "model", package: "CsvModel", version: "1.2.0", digest: "m-120" }],
        },
        {
          bundle: "legacy",
          version: "1.0.0",
          date: "2026-09-01",
          dependencies: [],
        },
      ],
    });
    const shipped = descriptorFor({ kind: "bundle", bundle: "edge" }, p);
    assert.strictEqual(shipped.description, "3.1.0 · listener, tool");
    assert.ok(shipped.tooltip?.includes("Ships listener, tool."));
    const older = descriptorFor({ kind: "bundle", bundle: "legacy" }, p);
    assert.strictEqual(older.description, "1.0.0 · 2026-09-01");
    assert.ok(!older.tooltip?.includes("Ships"));
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

suite("solutionTreeModel: what a session is run with", () => {
  /** The document, made unwritable: a renderer may read it and nothing else. */
  function deepFreeze<T>(value: T): T {
    if (value !== null && typeof value === "object") {
      for (const nested of Object.values(value)) deepFreeze(nested);
      Object.freeze(value);
    }
    return value;
  }

  /** A projection whose configuration block is what the router read from files. */
  function configured(over: Partial<ProjectionConfiguration> = {}): Projection {
    return {
      ...single(),
      configuration: {
        engines: {
          chosen: "claude-code",
          reason: "`claude` is the only engine CLI on PATH, so it is the engine the next session is offered.",
          installed: [
            { engine: "claude-code", program: "claude", path: "C:/bin/claude.cmd" },
            { engine: "copilot", program: "copilot", path: null },
          ],
        },
        transport: {
          effective: "api",
          decidedBy: "DABBLER_TRANSPORT env var",
          layers: [
            { source: "DABBLER_TRANSPORT env var", value: "api" },
            { source: "transport.profile", value: "copilot-cli" },
          ],
        },
        authoring: {
          role: "generator",
          chosen: { alias: "opus", model: "claude-opus-5", provider: "anthropic" },
          candidates: [{ alias: "opus", model: "claude-opus-5", provider: "anthropic" }],
          excludes: [],
          fellThrough: false,
        },
        verifying: {
          role: "verifier",
          chosen: { alias: "gpt-5-6-terra", model: "gpt-5.6-terra", provider: "openai" },
          candidates: [{ alias: "gpt-5-6-terra", model: "gpt-5.6-terra", provider: "openai" }],
          excludes: ["anthropic"],
          fellThrough: false,
        },
        records: [
          {
            record: "seat-catalog", path: "C:/router/copilot-catalog.lock", present: true,
            datedAt: "2026-09-01T10:00:00Z", ageHours: 30, thresholdHours: 720,
            command: "dabbler copilot refresh", stale: false, notes: [],
          },
          {
            record: "api-enumeration", path: "C:/repo/.dabbler/api-models.lock", present: false,
            datedAt: null, ageHours: null, thresholdHours: 24,
            command: "dabbler discovery enumerate", stale: true, notes: [],
          },
        ],
        ...over,
      },
    };
  }

  test("renders every row from the dated record, and derives nothing while it does", () => {
    // The claim is not only that the rows are right: it is that drawing them
    // costs a disk read the router already did. Two halves prove it. The
    // network is trapped for the duration, so a row that enumerated a vendor
    // fails here; and the projection is FROZEN, so a row that wanted
    // something the document does not carry has nowhere to put it and no way
    // to fetch it. The other half of the same claim is the last assertion:
    // with no configuration in the document there are no rows at all, which
    // is what "it reads the record" means and what "it goes and finds out"
    // would contradict.
    const fetched = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = () => {
      throw new Error("the Configuration section reached for the network");
    };
    try {
      const p = deepFreeze(configured());
      const root = rootNodes().find((n) => n.kind === "configuration");
      assert.ok(root);
      const section = descriptorFor(root, p);
      assert.strictEqual(section.expandable, true);
      assert.ok(section.description?.includes("claude-code"));

      const rows = childrenOf(root, p);
      assert.deepStrictEqual(
        rows.map((n) => n.kind),
        ["configEngine", "configTransport", "configRole", "configRole", "configRecord", "configRecord"],
      );
      const rendered = rows.map((n) => descriptorFor(n, p));

      // The record's own age and the command that re-dates it, before
      // anybody asks for a refresh.
      const seat = rendered.find((row) => row.label === "seat-catalog");
      assert.strictEqual(seat?.description, "30h old");
      assert.ok(seat?.tooltip?.includes("dabbler copilot refresh"));
      const api = rendered.find((row) => row.label === "api-enumeration");
      assert.strictEqual(api?.description, "no record yet");
      assert.strictEqual(api?.icon?.tone, "attention");

      // A transport a layer above is overriding says so; the value alone
      // would look exactly like one that is in force.
      const transport = rendered.find((row) => row.label === "Transport");
      assert.ok(transport?.description?.includes("api"));
      assert.ok(transport?.tooltip?.includes("transport.profile says 'copilot-cli' and is overridden"));

      // The cross-provider invariant is shown, not restated: the row says
      // what excluding the authoring model's provider left.
      const verifying = rendered.find((row) => row.label === "Verifying model");
      assert.ok(verifying?.description?.includes("gpt-5.6-terra"));
      assert.ok(verifying?.tooltip?.includes("anthropic"));

      // And the engine's default carries the sentence that says why.
      const engine = rendered.find((row) => row.label === "Engine");
      assert.strictEqual(engine?.description, "claude-code");
      assert.ok(engine?.tooltip?.includes("only engine CLI on PATH"));

      // The other half: a document that carries no configuration produces no
      // rows. Nothing is derived here and nothing is asked for.
      assert.deepStrictEqual(childrenOf(root, deepFreeze(single())), []);
    } finally {
      (globalThis as { fetch?: unknown }).fetch = fetched;
    }
  });

  test("says a configuration it could not read is unreadable, rather than showing an empty one", () => {
    const p: Projection = { ...single(), configuration: { unavailable: "local-overrides.yaml: bad key" } };
    const root = { kind: "configuration" as const };
    assert.deepStrictEqual(childrenOf(root, p), []);
    const row = descriptorFor(root, p);
    assert.strictEqual(row.expandable, false);
    assert.strictEqual(row.tooltip, "local-overrides.yaml: bad key");
  });
});

suite("solutionTreeModel: is the model we asked for the model that answered", () => {
  // The whole path, from the rows on disk to the row on the screen. Session
  // 144 measured this and left the reading; what fails here is the day the
  // three answers become two.
  const ROUND = {
    round: 1,
    verdict: "VERIFIED",
    blocking: false,
    findings: [],
    completion_tree: "0".repeat(40),
    recorded_at: "2026-09-01T10:00:00.000000-04:00",
    verifier_model: "reviewer",
    verifier_provider: "openai",
  };

  /** A registry of two models, so what is asserted is the reading and not the shipped list. */
  const CONFIG = [
    "providers:",
    "  anthropic:",
    "    api_key_env: TEST_ANTHROPIC_KEY",
    "    rate_limit: { requests_per_minute: 10, tokens_per_minute: 100 }",
    "    timeout_seconds: 30",
    "    retry: { max_retries: 1, backoff_base_seconds: 0 }",
    "  openai:",
    "    api_key_env: TEST_OPENAI_KEY",
    "    rate_limit: { requests_per_minute: 10, tokens_per_minute: 100 }",
    "    timeout_seconds: 30",
    "    retry: { max_retries: 1, backoff_base_seconds: 0 }",
    "models:",
    "  author:",
    "    provider: anthropic",
    "    model_id: a-author",
    "  reviewer:",
    "    provider: openai",
    "    model_id: o-reviewer",
    "roles:",
    "  generator:",
    "    prefer: [a-author]",
    "  verifier:",
    "    prefer: [o-reviewer]",
    "transports:",
    "  copilot-cli:",
    "    lockfile: copilot-catalog.lock",
    "escalation:",
    "  enabled: false",
    "  max_escalations: 0",
    "  triggers: { empty_response: true, max_tokens_hit: true, min_output_tokens: 30, refusal_detection: true }",
    "",
  ].join("\n");

  let root = "";
  const saved = new Map<string, string | undefined>();

  setup(() => {
    root = makeTempDir("fidelity-");
    // The environment is set rather than read: a suite that took the
    // operator's own DABBLER_TRANSPORT would assert a different thing on
    // their machine than on anyone else's.
    for (const name of [
      "AI_ROUTER_CONFIG",
      "DABBLER_TRANSPORT",
      "TEST_ANTHROPIC_KEY",
      "TEST_OPENAI_KEY",
    ]) {
      saved.set(name, process.env[name]);
    }
    writeFileTree(root, {
      "router-config.yaml": CONFIG,
      // Two dated records, each with a date NO probe could produce: a
      // refresh would stamp them with now. They are how the next test tells
      // a record that was read from one that was fetched.
      ".dabbler/api-models.lock": [
        "[meta]",
        'key_set_id = "test"',
        'enumerated_at = "2026-08-01T09:00:00Z"',
        "[[providers]]",
        'name = "anthropic"',
        'enumerated_at = "2026-08-01T09:00:00Z"',
        "[[providers]]",
        'name = "openai"',
        'enumerated_at = "2026-08-01T09:00:00Z"',
        "",
      ].join("\n"),
      "copilot-catalog.lock": [
        "[meta]",
        'cli_version = "test"',
        'seat_id = "test-seat"',
        'probed_at = "2026-08-02T09:00:00Z"',
        "[[models]]",
        'id = "o-reviewer"',
        'echoed_model = "o-reviewer"',
        "",
      ].join("\n"),
      // Two rounds, and they are the two KINDS of evidence. The first is on
      // the direct-API path, where the served id is the provider's own
      // statement of what answered. The second is a seat round, where the
      // same field carries the CLI's echo of what it was asked for -- a
      // label, and this framework has never trusted a seat label.
      ".dabbler/runs/s1/rounds.jsonl":
        [
          JSON.stringify({ ...ROUND, transport: "api", requested_model: "a-author", served_model: "a-author" }),
          JSON.stringify({
            ...ROUND,
            round: 2,
            previous_tree: "0".repeat(40),
            transport: "copilot-cli",
            requested_model: "o-reviewer",
            served_model: "o-reviewer",
          }),
        ].join("\n") + "\n",
    });
    process.env.AI_ROUTER_CONFIG = path.join(root, "router-config.yaml");
    process.env.DABBLER_TRANSPORT = "api";
    process.env.TEST_ANTHROPIC_KEY = "k";
    process.env.TEST_OPENAI_KEY = "k";
  });

  teardown(() => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmrf(root);
  });

  test("an exact seat echo reads not known, and does not render as one a round records as honoured", () => {
    // The router's own reading runs here, over records on disk, with the
    // network trapped: if assembling the projection enumerated a vendor
    // this throws, and if it probed the seat the dates below would be
    // today's rather than the fixture's.
    const fetched = (globalThis as { fetch?: unknown }).fetch;
    const reached = (what: string) => () => {
      throw new Error(`the projection reached ${what} while it was being assembled`);
    };
    (globalThis as { fetch?: unknown }).fetch = reached("a vendor");
    // The other way a probe happens is a CLI: `dabbler copilot refresh`
    // spawns the seat's binary once per model. So every process creation is
    // trapped too -- except `git`, which the router runs to find a
    // repository root and which is not a probe of anything. The trap is
    // PROVEN ARMED before it is relied on, by calling the router's own spawn
    // and requiring the trap's error back: a trap that silently failed to
    // install would otherwise make this test pass by doing nothing.
    const childProcess = createRequire(path.join(root, "index.js"))("child_process") as Record<
      string,
      unknown
    >;
    const spawners = ["spawn", "spawnSync", "execFile", "execFileSync", "exec", "execSync"];
    const original = spawners.map((name) => [name, childProcess[name]] as const);
    for (const [name, real] of original) {
      childProcess[name] = (...args: unknown[]) => {
        const program = String(args[0] ?? "");
        if (/(^|[\\/])git(\.exe)?$/i.test(program)) {
          return (real as (...rest: unknown[]) => unknown)(...args);
        }
        reached(`a CLI (${program})`)();
      };
    }
    try {
      assert.throws(
        () => spawnProgram(["definitely-not-a-real-program"], { stdio: "ignore" }),
        /reached a CLI/,
        "the process trap did not install, so this test proves nothing about spawning",
      );
      tryWriteProjection(root);
    } finally {
      for (const [name, value] of original) childProcess[name] = value;
      (globalThis as { fetch?: unknown }).fetch = fetched;
    }
    const p = JSON.parse(
      fs.readFileSync(path.join(root, ".dabbler", "solution", "projection.json"), "utf8"),
    ) as Projection;

    // Both records are present and carry the dates the fixture wrote.
    const records = p.configuration?.records ?? [];
    assert.strictEqual(
      records.find((row) => row.record === "api-enumeration")?.datedAt,
      "2026-08-01T09:00:00Z",
    );
    assert.strictEqual(
      records.find((row) => row.record === "seat-catalog")?.datedAt,
      "2026-08-02T09:00:00Z",
    );

    // Both models answered as themselves. Only one of them was said so by a
    // provider; the other was said so by the seat, about itself.
    assert.strictEqual(p.configuration?.fidelityTransport, "api");
    assert.strictEqual(p.configuration?.authoring?.chosen?.fidelity, "honoured");
    assert.strictEqual(p.configuration?.verifying?.chosen?.fidelity, "not-known");

    const authoring = descriptorFor({ kind: "configRole", role: "authoring" }, p);
    const verifying = descriptorFor({ kind: "configRole", role: "verifying" }, p);
    // Three answers read as three: what the rows SAY differs, and the one
    // with no evidence does not read as the one with a provider's word.
    assert.notStrictEqual(authoring.description, verifying.description);
    assert.ok(authoring.description?.includes("answers as itself"));
    assert.ok(verifying.description?.includes("not known"));
    assert.ok(!verifying.description?.includes("answers as itself"));
    // And the row says what the answer is an answer ABOUT, so the seat's
    // evidence can never be read as the API's.
    assert.ok(verifying.tooltip?.includes("api"));
    assert.ok(verifying.tooltip?.includes("echo"));
  });
});
