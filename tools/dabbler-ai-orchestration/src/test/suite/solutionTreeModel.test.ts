import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  NO_PROJECTS_YET,
  PROJECTION_RELPATH,
  PROJECTION_SOURCE_GLOBS,
  Projection,
  ProjectionProject,
  childrenOf,
  descriptorFor,
  externalLocation,
  repositoryPathOf,
  rootNodes,
} from "../../providers/solutionTreeModel";
import {
  repositoryTarget,
  workspaceFileIn,
} from "../../commands/openRepository";
import * as vscode from "vscode";
import {
  ENGINES,
  ENTER_MODEL_ID,
  defaultSessionRunUi,
  engineModelRefusal,
  modelPickItems,
  runConsultWithAi,
  type EngineChoice,
  type ModelPickItem,
  type SessionRunUi,
} from "../../commands/sessionCommands";
import type { SessionsRepository } from "../../utils/fileSystem";
import { makeTempDir, rmrf, writeFileTree } from "./helpers";

/** A CSV service's three projects, as the router projects them: dependency order, usedBy derived. */
function projects(): ProjectionProject[] {
  return [
    { name: "Csv.Model", path: "src/Csv.Model/Csv.Model.csproj", kind: "library", dependsOn: [], usedBy: ["Csv.Api", "Csv.Tests"] },
    { name: "Csv.Api", path: "src/Csv.Api/Csv.Api.csproj", kind: "service", dependsOn: ["Csv.Model"], usedBy: ["Csv.Tests"] },
    { name: "Csv.Tests", path: "tests/Csv.Tests/Csv.Tests.csproj", kind: "test", dependsOn: ["Csv.Api", "Csv.Model"], usedBy: [] },
  ];
}

function projection(over: Partial<Projection> = {}): Projection {
  const rows = projects();
  return {
    solution: { name: "csv", title: "csv", ecosystem: "dotnet", projectCount: rows.length },
    projects: rows,
    ...over,
  };
}

/** A repository with no build files: the one project it is. */
function single(): Projection {
  return {
    solution: { name: "csv-model", title: "csv-model", ecosystem: null, projectCount: 1 },
    projects: [{ name: "csv-model", path: ".", kind: "application", dependsOn: [], usedBy: [] }],
  };
}

suite("solutionTreeModel: projects", () => {
  test("renders a projection's project rows in the router's dependency order, with depends-on and used-by", () => {
    const p = projection();
    const roots = rootNodes();
    // The solution, and beside it what a session is run with.
    assert.deepStrictEqual(roots.map((n) => n.kind), ["solution", "configuration"]);
    const rows = childrenOf(roots[0], p);
    assert.deepStrictEqual(rows.map((n) => (n as { name: string }).name), ["Csv.Model", "Csv.Api", "Csv.Tests"]);
    // The library at the bottom is used by everything above it, and the row
    // says so without anyone having written it down.
    assert.deepStrictEqual(childrenOf({ kind: "project", name: "Csv.Model" }, p).map((n) => n.kind), ["usedBy"]);
    assert.deepStrictEqual(
      childrenOf({ kind: "usedBy", name: "Csv.Model" }, p).map((n) => (n as { consumer: string }).consumer),
      ["Csv.Api", "Csv.Tests"],
    );
    assert.deepStrictEqual(
      childrenOf({ kind: "dependsOn", name: "Csv.Tests" }, p).map((n) => (n as { dependency: string }).dependency),
      ["Csv.Api", "Csv.Model"],
    );
    const api = descriptorFor({ kind: "project", name: "Csv.Api" }, p);
    assert.strictEqual(api.description, "service · src/Csv.Api/Csv.Api.csproj");
    assert.strictEqual(api.contextValue, "dabblerProject:service");
    assert.strictEqual(api.expandable, true);
    assert.strictEqual(descriptorFor({ kind: "solution" }, p).description, "3 projects");
  });

  test("a repository with no build files is one row with nothing under it", () => {
    const p = single();
    const rows = childrenOf({ kind: "solution" }, p);
    assert.strictEqual(rows.length, 1);
    assert.deepStrictEqual(childrenOf(rows[0], p), []);
    const row = descriptorFor(rows[0], p);
    assert.strictEqual(row.label, "csv-model");
    assert.strictEqual(row.expandable, false);
    assert.strictEqual(descriptorFor({ kind: "solution" }, p).description, "one project");
  });

  test("a projection with no projects, or one an older router wrote, says what session 1 does", () => {
    const empty = projection({ solution: { name: "fresh", title: "fresh", projectCount: 0 }, projects: [] });
    assert.deepStrictEqual(childrenOf({ kind: "solution" }, empty), []);
    assert.strictEqual(descriptorFor({ kind: "solution" }, empty).description, NO_PROJECTS_YET);
    const older = { solution: { name: "old", title: "old", projectCount: 0 } } as unknown as Projection;
    assert.deepStrictEqual(childrenOf({ kind: "solution" }, older), []);
    assert.deepStrictEqual(childrenOf({ kind: "project", name: "ghost" }, projection()), []);
  });

  test("every node kind resolves to a descriptor with a stable id", () => {
    const p = projection();
    const nodes = [
      { kind: "solution" as const },
      { kind: "project" as const, name: "Csv.Model" },
      { kind: "dependsOn" as const, name: "Csv.Tests" },
      { kind: "dependency" as const, name: "Csv.Tests", dependency: "Csv.Model" },
      { kind: "usedBy" as const, name: "Csv.Model" },
      { kind: "consumer" as const, name: "Csv.Model", consumer: "Csv.Api" },
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
    // project rows come from the solution and project files, the membership
    // rows from the declaration and from nowhere else.
    assert.ok(globs.includes("**/*.slnx") && globs.includes("**/*.sln"));
    assert.ok(!globs.includes("docs/modules.yaml"));
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

suite("solutionTreeModel: what a configuration reading costs", () => {
  // The whole path, from the rows on disk to the row on the screen. The pane
  // now derives this on EVERY read, so what it may touch matters more than
  // it did when the answer sat in a file: a reading that enumerated a vendor
  // would charge a window for being open, once per repaint.
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
  /** One model, as a vendor's own free enumeration records it. */
  const catalogRow = (id: string, provider: string): Record<string, unknown> => ({
    id,
    provider,
    provider_source: "vendor-endpoint",
    display_name: id,
    enabled: true,
    price_category: null,
    cost: null,
    listed_at: "2026-08-01T09:00:00Z",
  });

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
    "roles:",
    "  reviewer:",
    "    prefer: [o-reviewer]",
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
      // The engine and the model it declared when the session was
      // registered. The authoring row REPORTS this rather than resolving a
      // role, because this is the model that authors.
      "docs/sessions/sessions.json": JSON.stringify({
        schemaVersion: 5,
        sessions: [
          {
            number: 1,
            status: "in-progress",
            orchestrator: { engine: "copilot", provider: "anthropic", model: "a-author" },
          },
        ],
      }),
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
    // What this machine's vendors listed, with a date NO refresh could
    // produce: a refresh stamps now, so the date below is how the next test
    // tells a record that was READ from one that was fetched. The runner
    // points the catalog at a temp file, so this writes nothing of the
    // operator's.
    const catalog = process.env.DABBLER_CATALOG_PATH as string;
    fs.mkdirSync(path.dirname(catalog), { recursive: true });
    fs.writeFileSync(
      catalog,
      JSON.stringify({
        schema_version: 1,
        written_by: "test",
        written_at: "2026-08-01T09:00:00Z",
        transports: {
          api: {
            refreshed_at: "2026-08-01T09:00:00Z",
            source: "vendor-enumeration",
            // The set of providers whose keys are present: a block recorded
            // for any other set is not a reading of this machine.
            scope: { providers: ["anthropic", "openai"] },
            models: [
              catalogRow("a-author", "anthropic"),
              catalogRow("a-second", "anthropic"),
              catalogRow("o-reviewer", "openai"),
            ],
            retired: [],
          },
        },
      }),
      "utf8",
    );
  });

  teardown(() => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    rmrf(root);
  });

  test("refuses to LAUNCH a model the engine's own list does not name", () => {
    // Round 1's first blocking finding. `session start` revalidates a
    // configured model before anything is billed, but the Start box takes
    // free text and the terminal it opens belongs to the person -- nothing in
    // this window can read what their CLI prints. So a stale id, a seat id
    // under Claude Code or a plain typo produced a CLI that printed one
    // warning line and carried on with a model nobody chose, while the ledger
    // recorded the one they named.
    //
    // The fixture's session is in flight under `copilot`, so the engine's own
    // record here is the seat's -- which this machine has never read, so the
    // list is empty and NOTHING may be refused. That is the other half of the
    // rule and is asserted first.
    const repository = { root, label: "r" } as unknown as SessionsRepository;
    const seat = ENGINES.find((entry) => entry.engine === "copilot") as EngineChoice;
    assert.strictEqual(engineModelRefusal(repository, seat, "anything-at-all"), null);

    // Under Claude Code the record IS readable -- the catalog's Anthropic
    // block -- so a model it does not name is refused before the terminal
    // opens, with what it offers instead.
    const claude = ENGINES.find((entry) => entry.engine === "claude-code") as EngineChoice;
    const refusal = engineModelRefusal(repository, claude, "not-a-model-anywhere");
    assert.ok(refusal, "a model no list names was launched anyway");
    assert.ok(refusal?.includes("not-a-model-anywhere"), refusal);
    assert.ok(refusal?.includes("a-author"), refusal);
    assert.ok(refusal?.includes("Nothing was launched"), refusal);
    // A model it DOES name goes through, and so does an empty one, which
    // means the engine's own default.
    assert.strictEqual(engineModelRefusal(repository, claude, "a-author"), null);
    assert.strictEqual(engineModelRefusal(repository, claude, ""), null);
  });

  test("Consult with AI refuses a model the engine's own list does not name, and opens nothing", async () => {
    const repository = { root, label: "r" } as unknown as SessionsRepository;
    const claude = ENGINES.find((entry) => entry.engine === "claude-code") as EngineChoice;
    const errors: string[] = [];
    const opened: unknown[] = [];
    const ui = {
      pickEngine: async () => claude,
      askModel: async () => "not-a-model-anywhere",
      // The installed CLI accepts it: the list alone refuses.
      engineKnowsModel: async () => null,
      showErrorMessage: (message: string) => errors.push(message),
      openTerminal: (terminal: unknown) => opened.push(terminal),
    } as unknown as SessionRunUi;
    assert.strictEqual(await runConsultWithAi(repository, ui), false);
    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].includes("not-a-model-anywhere"), errors[0]);
    assert.strictEqual(opened.length, 0);
  });

  test("the model question offers the engine's candidates, the chosen one first", () => {
    const claude = ENGINES.find((entry) => entry.engine === "claude-code") as EngineChoice;
    const items = modelPickItems(root, claude, "a-second");
    assert.ok(items);
    assert.deepStrictEqual(
      items.map((item) => item.model),
      ["a-second", "a-author", "", undefined],
    );
    assert.strictEqual(items[0].detail, "what you chose");
    assert.strictEqual(items[3].label, ENTER_MODEL_ID);
    // A seat is nothing without a model, so it is offered no default.
    const required = modelPickItems(root, { ...claude, modelRequired: true }, "");
    assert.deepStrictEqual(required?.map((item) => item.model), ["a-author", "a-second", undefined]);
  });

  test("the model question marks an authoring model from the chosen Primary Reviewer's vendor, and still offers it", () => {
    const preferences = process.env.DABBLER_PREFERENCES_PATH as string;
    const before = fs.existsSync(preferences) ? fs.readFileSync(preferences, "utf8") : null;
    const chose = (reviewer: string): string =>
      JSON.stringify({ schema_version: 1, written_by: "test", written_at: "2026-09-17T00:00:00Z", selected: { reviewer } });
    fs.mkdirSync(path.dirname(preferences), { recursive: true });
    fs.writeFileSync(preferences, chose("o-reviewer"), "utf8");
    try {
      const claude = ENGINES.find((entry) => entry.engine === "claude-code") as EngineChoice;
      const items = modelPickItems(root, claude, "a-author");
      assert.ok(items);
      // Claude Code authors Anthropic only, so nothing on its list is the reviewer's vendor.
      assert.ok(items.every((item) => !item.description?.includes("same vendor as your Primary Reviewer")));
      fs.writeFileSync(preferences, chose("a-second"), "utf8");
      const marked = modelPickItems(root, claude, "a-author");
      const author = marked?.find((item) => item.model === "a-author");
      assert.ok(
        author?.description?.includes("same vendor as your Primary Reviewer (a-second); this session would not start"),
        author?.description,
      );
    } finally {
      if (before === null) fs.rmSync(preferences, { force: true });
      else fs.writeFileSync(preferences, before, "utf8");
    }
  });

  test("the model question falls back to the text box on 'Enter a model id…', no list, or the alias floor", async () => {
    const window = vscode.window as unknown as Record<string, unknown>;
    const [pick, input] = [window.showQuickPick, window.showInputBox];
    const picks: unknown[] = [];
    const boxes: Array<{ placeHolder?: string }> = [];
    window.showInputBox = async (options: { placeHolder?: string }) => {
      boxes.push(options);
      return "typed-id";
    };
    try {
      const claude = ENGINES.find((entry) => entry.engine === "claude-code") as EngineChoice;
      const seat = ENGINES.find((entry) => entry.engine === "copilot") as EngineChoice;
      window.showQuickPick = async (items: ModelPickItem[]) => {
        picks.push(items);
        return items.find((item) => item.label === ENTER_MODEL_ID);
      };
      const ui = defaultSessionRunUi();
      assert.strictEqual(await ui.askModel(root, claude, ""), "typed-id");
      assert.deepStrictEqual([picks.length, boxes.length], [1, 1]);
      // This machine has read nothing for the seat: no pick, the box.
      assert.strictEqual(await ui.askModel(root, seat, ""), "typed-id");
      assert.deepStrictEqual([picks.length, boxes.length], [1, 2]);
      // Nothing enumerated for Claude Code: the aliases are the reading, and
      // the box shows them rather than offering them as the whole choice.
      const catalog = process.env.DABBLER_CATALOG_PATH as string;
      const record = JSON.parse(fs.readFileSync(catalog, "utf8"));
      record.transports.api.models = [catalogRow("o-reviewer", "openai")];
      fs.writeFileSync(catalog, JSON.stringify(record), "utf8");
      assert.strictEqual(modelPickItems(root, claude, ""), null);
      assert.strictEqual(await ui.askModel(root, claude, ""), "typed-id");
      assert.deepStrictEqual([picks.length, boxes.length], [1, 3]);
      assert.ok(boxes[2].placeHolder?.includes("sonnet"), boxes[2].placeHolder);
    } finally {
      window.showQuickPick = pick;
      window.showInputBox = input;
    }
  });
});
