import * as assert from "assert";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { SolutionTreeProvider, CONFIGURATION_TTL_MS } from "../../providers/SolutionTreeProvider";
import { childrenOf, descriptorFor, rootNodes } from "../../providers/solutionTreeModel";
import type {
  Projection,
  RowDescriptor,
  SolutionContext,
  SolutionNode,
} from "../../providers/solutionTreeModel";
import { makeTempDir, rmrf, writeFileTree } from "./helpers";

/** How long past the provider's own SETTLE_MS a background derivation is given to land. */
const PAST_SETTLE_MS = 800;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

suite("SolutionTreeProvider: derives at startup", () => {
  let root: string;
  let provider: SolutionTreeProvider | undefined;

  setup(() => (root = makeTempDir("dabbler-solexp-")));
  teardown(() => {
    provider?.dispose();
    provider = undefined;
    rmrf(root);
  });

  test("a fresh clone with build files but no projection derives one without any watcher event", async () => {
    writeFileTree(root, {
      "src/Model/Model.csproj": "<Project />\n",
      "src/App/App.csproj": '<Project><ItemGroup><ProjectReference Include="../Model/Model.csproj" /></ItemGroup></Project>\n',
    });
    const projectionFile = path.join(root, ".dabbler", "solution", "solution.json");
    assert.ok(!fs.existsSync(projectionFile), "precondition: no projection yet");

    provider = new SolutionTreeProvider(root);
    // Nothing touches a watcher: the constructor itself is what must derive.
    await sleep(PAST_SETTLE_MS);

    assert.ok(fs.existsSync(projectionFile), "projection was never derived");
    const projection = provider.currentProjection();
    assert.ok(projection, "provider read no projection back");
    assert.strictEqual(projection!.projects.length, 2);
    assert.deepStrictEqual(
      projection!.projects.map((m) => m.name),
      ["Model", "App"],
    );
    // The welcome text is what NO_PROJECTS_YET renders over; a derived,
    // populated projection must offer real root rows instead.
    assert.ok(rootNodes().length > 0);
  });

  test("a folder not yet set up shows the Configuration alone, and a set-up one shows both", async () => {
    // The vehicle and the model depend on nothing a project writes, and a
    // first session stops on them when they are unset -- so they are the
    // first thing the pane shows, before any project exists.
    provider = new SolutionTreeProvider(root);
    await sleep(PAST_SETTLE_MS);
    assert.deepStrictEqual(provider.getChildren().map((node) => node.kind), ["configuration"]);
    provider.dispose();

    writeFileTree(root, { "docs/sessions/session-plan.md": "# Session plan\n" });
    provider = new SolutionTreeProvider(root);
    await sleep(PAST_SETTLE_MS);
    assert.deepStrictEqual(provider.getChildren().map((node) => node.kind), ["solution", "configuration"]);
  });

  test("with no folder open shows the Configuration alone, labelled as this machine's defaults", () => {
    // A person who opens VS Code with no folder sets the machine's defaults
    // first; every solution set up afterwards inherits them.
    provider = new SolutionTreeProvider(undefined);
    const roots = provider.getChildren();
    assert.deepStrictEqual(roots.map((node) => node.kind), ["configuration"]);
    const item = provider.getTreeItem(roots[0]!);
    assert.match(String(item.label), /this machine's defaults/);
  });

  test("a projection already on disk is re-derived, because a stale one looks current", async () => {
    // The inverse of what this asserted until session 155, and the reason is
    // the defect the old behaviour had: deriving only over a MISSING file
    // left a projection that exists and is wrong standing until a manifest
    // happened to move. A stale file that looks exactly like a current one
    // is what an operator reads as the pane lying.
    const projectionFile = path.join(root, ".dabbler", "solution", "solution.json");
    fs.mkdirSync(path.dirname(projectionFile), { recursive: true });
    const stale = {
      solution: { name: "x", title: "x", projectCount: 1 },
      projects: [],
    };
    fs.writeFileSync(projectionFile, JSON.stringify(stale), "utf8");
    writeFileTree(root, {
      "src/Model/Model.csproj": "<Project />\n",
    });

    provider = new SolutionTreeProvider(root);
    await sleep(PAST_SETTLE_MS);

    // Not the bytes this test wrote: the manifest that was already there
    // when the window opened is what the pane renders.
    assert.notStrictEqual(fs.readFileSync(projectionFile, "utf8"), JSON.stringify(stale));
    assert.deepStrictEqual(
      provider.currentProjection()?.projects.map((m) => m.name),
      ["Model"],
    );
  });

  test("the configuration is asked for at read, never taken from the file", async () => {
    // The solution document carries the module graph and nothing about what
    // a session would be run with: configuration is derived from the model
    // catalog and this operator's preferences, both at the USER level and
    // outside every repository. A block sitting in the file would be a
    // reading no workspace source can invalidate -- and, since any router
    // may have written it, a reading this extension cannot vouch for (D276).
    // What DOES invalidate it is the watcher over those files, which the
    // test below holds the provider to.
    const projectionFile = path.join(root, ".dabbler", "solution", "solution.json");
    fs.mkdirSync(path.dirname(projectionFile), { recursive: true });
    fs.writeFileSync(
      projectionFile,
      JSON.stringify({
        solution: { name: "x", title: "x", projectCount: 1 },
        projects: [],
        configuration: { engines: { chosen: "an-engine-no-router-would-name" } },
      }),
      "utf8",
    );
    writeFileTree(root, {
      "src/Model/Model.csproj": "<Project />\n",
    });

    provider = new SolutionTreeProvider(root);
    await sleep(PAST_SETTLE_MS);

    const configuration = provider.currentProjection()?.configuration;
    assert.ok(configuration, "the provider rendered no configuration at all");
    assert.notStrictEqual(
      configuration.engines?.chosen,
      "an-engine-no-router-would-name",
      "the file's block was rendered, so a stale reading can still reach the pane",
    );
  });

  test("watches the user-level directory and repaints when it moves", async () => {
    // The TTL alone is not enough and that is the point: a value that is
    // fresh WHEN ASKED is not a pane that updates, because VS Code has no
    // reason to ask again. Something has to fire a tree-data change, and
    // nothing in this workspace ever can -- the catalog and the preferences
    // are outside every repository. A `RelativePattern` over an absolute
    // base reaches them, so they are watched rather than declared unwatchable.
    // The stub's hooks where this suite runs through the stub, and nothing
    // where it does not: under a real VS Code host `workspace` is the real
    // API and has neither, so calling them unconditionally would crash the
    // test instead of running it. The watchers are then real, and the
    // assertion below falls back to what any host can show -- that the
    // reading is current and the tree was told.
    const stub = vscode.workspace as unknown as {
      __watchers?: () => { base: string | null; pattern: string; onChange: (() => void)[] }[];
      __clearWatchers?: () => unknown;
    };
    const stubbed = typeof stub.__watchers === "function";
    if (stubbed) stub.__clearWatchers?.();
    writeFileTree(root, {
      "src/Model/Model.csproj": "<Project />\n",
    });
    provider = new SolutionTreeProvider(root);
    await sleep(PAST_SETTLE_MS);

    const preferences = process.env.DABBLER_PREFERENCES_PATH as string;
    const userDir = path.dirname(preferences);
    const watching = stubbed
      ? (stub.__watchers as () => { base: string | null; onChange: (() => void)[] }[])().filter(
          (entry) => entry.base !== null && path.resolve(entry.base) === path.resolve(userDir),
        )
      : [];
    if (stubbed) {
      assert.ok(watching.length > 0, "nothing watches the user-level configuration directory");
    }

    let repainted = false;
    provider.onDidChangeTreeData(() => (repainted = true));
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(
      preferences,
      JSON.stringify({
        schema_version: 1,
        written_by: "test",
        written_at: "2026-09-12T00:00:00Z",
        engine: "codex",
      }),
      "utf8",
    );
    // Fire what the stub recorded; a real host fires its own, and is given
    // the time to.
    for (const handler of watching.flatMap((entry) => entry.onChange)) handler();
    if (!stubbed) await sleep(PAST_SETTLE_MS);

    assert.ok(repainted, "the tree was never told to repaint");
    assert.strictEqual(provider.currentProjection()?.configuration?.engines?.chosen, "codex");
    fs.rmSync(preferences, { force: true });
  });

  test("re-reads the configuration when nothing in the workspace moved", async () => {
    // The inputs are at the USER level, so no watcher here can ever say they
    // changed -- which means a configuration frozen beside the module graph
    // is stale from the first read until something unrelated happens. A
    // `dabbler configure` or a catalog refresh typed in a terminal has to
    // reach the pane, and this is the only thing that makes it.
    writeFileTree(root, {
      "src/Model/Model.csproj": "<Project />\n",
    });
    provider = new SolutionTreeProvider(root);
    await sleep(PAST_SETTLE_MS);
    const before = provider.currentProjection()?.configuration?.engines?.chosen;

    // The preference this machine chose, written the way a terminal writes
    // it: the user-level file itself, with nothing in the workspace touched.
    // The runner points that path at a temp file, so this writes nothing of
    // the operator's.
    const preferences = process.env.DABBLER_PREFERENCES_PATH as string;
    fs.mkdirSync(path.dirname(preferences), { recursive: true });
    fs.writeFileSync(
      preferences,
      JSON.stringify({
        schema_version: 1,
        written_by: "test",
        written_at: "2026-09-12T00:00:00Z",
        engine: "codex",
      }),
      "utf8",
    );
    await sleep(CONFIGURATION_TTL_MS + 50);

    const after = provider.currentProjection()?.configuration?.engines?.chosen;
    assert.strictEqual(after, "codex", `was ${String(before)}, then ${String(after)}`);
    fs.rmSync(preferences, { force: true });
  });

  test("a picker reads the configuration again, without waiting out the reuse window", async () => {
    // What a machine can reach decides which vehicles and which models a
    // list may offer, and a list is the one place an operator acts on that
    // answer -- so it is taken when the list opens rather than out of the
    // window the rows are painted from. A TTL is a reuse window for
    // painting; it is not a repaint, and it is not freshness anybody may
    // choose from.
    writeFileTree(root, {
      "src/Model/Model.csproj": "<Project />\n",
    });
    provider = new SolutionTreeProvider(root);
    await sleep(PAST_SETTLE_MS);
    // Paint once, which takes the reading into the reuse window.
    provider.currentProjection();

    const preferences = process.env.DABBLER_PREFERENCES_PATH as string;
    fs.mkdirSync(path.dirname(preferences), { recursive: true });
    fs.writeFileSync(
      preferences,
      JSON.stringify({
        schema_version: 1,
        written_by: "test",
        written_at: "2026-09-12T00:00:00Z",
        engine: "codex",
      }),
      "utf8",
    );

    // Painting still reuses -- that is what the window is for, and is why
    // availability is not recomputed on every render.
    assert.notStrictEqual(
      provider.currentProjection()?.configuration?.engines?.chosen,
      "codex",
    );
    // Opening a picker does not.
    assert.strictEqual(
      provider.freshProjection()?.configuration?.engines?.chosen,
      "codex",
    );
    fs.rmSync(preferences, { force: true });
  });
});

// --- Every actionable Solution Explorer row has a menu ----------------------
//
// The suite above asserts that every menu command is DECLARED and that every
// registry token maps back to an action. It never asserted the other
// direction for the Solution Explorer: that a row an operator can act on has
// something to open when they right-click it. So *Authoring AI* and
// *Reviewing AI* shipped with no `view/item/context` entry matching
// `dabblerConfigParticipant;*` at all, a context menu with no items does not
// open, and right-clicking either did nothing -- green, through a release.
//
// It is a TEST over the tree model's own row kinds and not a second typed
// registry. The Work Explorer has one because it earned one, and copying the
// abstraction to prevent one missing menu is this project's documented
// failure mode: what is needed is the pair of statements held to each other,
// which is what a test is for.

/** One `when` clause, evaluated against a row's `viewItem` in one view. */
function whenHolds(when: string, view: string, viewItem: string): boolean {
  // The manifest's own forms and no others: `view == X`, `viewItem == Y`,
  // `viewItem =~ /re/`, ANDed. A clause shape this does not know fails the
  // test rather than passing silently, because a `when` nothing here can read
  // is a `when` this test is not actually checking.
  return when
    .split("&&")
    .map((part) => part.trim())
    .filter((part) => part !== "")
    .every((clause) => {
      const equals = /^(view|viewItem)\s*==\s*(.+)$/.exec(clause);
      if (equals) {
        const actual = equals[1] === "view" ? view : viewItem;
        return actual === equals[2].trim();
      }
      const matches = /^(view|viewItem)\s*=~\s*\/(.+)\/$/.exec(clause);
      if (matches) {
        const actual = matches[1] === "view" ? view : viewItem;
        return new RegExp(matches[2]).test(actual);
      }
      throw new Error(`this test cannot read the when clause '${clause}'`);
    });
}

/**
 * The states a Solution Explorer row can be in, as projections.
 *
 * Rich deliberately: the reverse assertion below is only as strong as the
 * rows these draw, so every `contextValue` the manifest gates on has to be
 * producible here -- projects of more than one kind, and a producer in each of its
 * three locations.
 */
const FIXTURES: Array<{
  from: string;
  projection: Projection;
  context: SolutionContext;
}> = (() => {
  const configuration: Projection["configuration"] = {
    engines: {
      chosen: "claude-code",
      reason: "`claude` is the only engine CLI on PATH.",
      installed: [{ engine: "claude-code", program: "claude", path: "C:/bin/claude.cmd" }],
    },
    authoring: {
      role: "authoring",
      provider: "anthropic",
      vehicle: {
        kind: "engine",
        options: [{ id: "claude-code", means: "claude" }],
        chosen: "claude-code",
      },
      chosen: { model: "claude-opus-5", provider: "anthropic" },
      candidates: [{ model: "claude-opus-5", provider: "anthropic" }],
      excludes: [],
      fellThrough: false,
    },
    primaryReviewer: {
      role: "reviewer",
      vehicle: {
        kind: "transport",
        options: [{ id: "api", means: "the provider's own endpoint" }],
        chosen: "api",
      },
      chosen: { model: "gpt-5.6-terra", provider: "openai" },
      candidates: [{ model: "gpt-5.6-terra", provider: "openai" }],
      excludes: [],
      fellThrough: false,
    },
    auxiliaryReviewer: {
      role: "auxiliary-reviewer",
      chosen: { model: "gemini-3.1-pro-preview", provider: "google" },
      candidates: [{ model: "gemini-3.1-pro-preview", provider: "google" }],
      excludes: [],
      fellThrough: false,
    },
    credentials: [
      {
        provider: "anthropic",
        displayLabel: "Anthropic",
        variable: "DABBLER_ANTHROPIC_API_KEY",
        fromEnvironment: true,
        reference: null,
        decidedBy: null,
        held: false,
        stop: null,
        store: "dabbler auth set anthropic",
        choose: "dabbler configure --credential anthropic=<name>",
      },
      {
        provider: "openai",
        displayLabel: "OpenAI",
        variable: "DABBLER_OPENAI_API_KEY",
        fromEnvironment: false,
        reference: "client-a",
        decidedBy: ".vscode/settings.json",
        held: false,
        stop: "openai is configured to use the credential 'client-a', and this machine holds no credential of that name.",
        store: "dabbler auth set openai",
        choose: "dabbler configure --credential openai=<name>",
      },
    ],
    records: [
      {
        record: "ai-model-catalog",
        path: "C:/catalog.json",
        present: true,
        datedAt: "2026-09-01T10:00:00Z",
        ageHours: 2,
        thresholdHours: 24,
        command: "dabbler discovery refresh",
        stale: false,
        notes: [],
      },
    ],
  };
  const multi: Projection = {
    solution: { name: "s", title: "s", ecosystem: "dotnet", projectCount: 2 },
    projects: [
      { name: "Model", path: "src/Model/Model.csproj", kind: "library", dependsOn: [], usedBy: ["App"] },
      { name: "App", path: "src/App/App.csproj", kind: "service", dependsOn: ["Model"], usedBy: [] },
    ],
    external: [
      {
        id: "here",
        producedBy: "sibling",
        resolve: "package",
        root: "D:/sibling",
        usedBy: ["app"],
      },
      { id: "away", producedBy: "other", resolve: "package", remote: "git@x/other.git" },
      { id: "nowhere", producedBy: "third", resolve: "package" },
    ],
    members: [
      { id: "s", self: true, provides: [], consumes: [], shell: false },
      { id: "sibling", self: false, provides: ["here"], consumes: [], shell: false },
    ],
    configuration,
  };
  const single: Projection = {
    solution: { name: "one", title: "one", ecosystem: null, projectCount: 1 },
    projects: [{ name: "one", path: ".", kind: "application", dependsOn: [], usedBy: [] }],
    configuration,
  };
  return [
    { from: "a solution of two projects", projection: multi, context: {} },
    { from: "a repository with no build files", projection: single, context: {} },
  ];
})();

suite("the Solution Explorer: every row that acts has a menu", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "package.json"), "utf8"),
  ) as {
    contributes: { menus: Record<string, Array<{ command?: string; when?: string }>> };
  };
  const VIEW = "dabblerSolutionTree";
  const entries = (manifest.contributes.menus["view/item/context"] ?? []).filter((entry) =>
    (entry.when ?? "").includes(VIEW),
  );

  /** Every row the model can draw from these projections, descriptor and all. */
  function everyRow(): Array<{
    node: SolutionNode;
    row: RowDescriptor;
    projection: Projection;
    context: SolutionContext;
    from: string;
  }> {
    const out: Array<{
      node: SolutionNode;
      row: RowDescriptor;
      projection: Projection;
      context: SolutionContext;
      from: string;
    }> = [];
    for (const { from, projection, context } of FIXTURES) {
      const walk = (node: SolutionNode): void => {
        out.push({ node, row: descriptorFor(node, projection, context), projection, context, from });
        for (const child of childrenOf(node, projection)) walk(child);
      };
      for (const root of rootNodes()) walk(root);
    }
    return out;
  }

  test("every Solution Explorer row carrying a command has a context menu entry that matches it", () => {
    for (const { row, from } of everyRow()) {
      if (!row.command) continue;
      const context = row.contextValue ?? "";
      const hit = entries.some(
        (entry) => entry.command === row.command && whenHolds(entry.when ?? "", VIEW, context),
      );
      assert.ok(
        hit,
        `${from}: the row '${row.label}' (${context || "no contextValue"}) clicks ` +
          `${row.command} and no view/item/context entry matches it`,
      );
    }
  });

  test("every Configuration row offers, on right-click, the actions its children carry", () => {
    // The defect, stated as the rule it broke: a parent row in this section
    // is a summary of the leaves beneath it, so the actions an operator can
    // take on those leaves are the actions the parent must offer. Right-
    // clicking *Authoring AI* did nothing at all.
    const rows = everyRow();
    const offered = (contextValue: string): string[] =>
      entries
        .filter((entry) => whenHolds(entry.when ?? "", VIEW, contextValue))
        .map((entry) => entry.command ?? "")
        .sort();
    for (const participant of ["authoring", "reviewing"]) {
      const parent = rows.find(
        (row) => row.row.contextValue === `dabblerConfigParticipant;${participant}`,
      );
      assert.ok(parent, `no ${participant} participant row was drawn`);
      const children = childrenOf(parent.node, parent.projection)
        .map((node) => descriptorFor(node, parent.projection, parent.context))
        .map((row) => row.command)
        .filter((command): command is string => typeof command === "string");
      assert.ok(children.length > 0, `${participant} has no actionable leaves`);
      const menu = offered(parent.row.contextValue ?? "");
      for (const command of children) {
        assert.ok(
          menu.includes(command),
          `right-clicking ${parent.row.label} offers ${menu.join(", ") || "nothing"}, ` +
            `and the leaves beneath it carry ${command}`,
        );
      }
    }
  });

  test("every Solution Explorer menu entry is reachable from a row the model can draw", () => {
    // The other direction, and it is what keeps the first one honest: a menu
    // gated on a `contextValue` no row produces is a command nobody can ever
    // reach, and it would otherwise sit in the manifest looking like coverage.
    const drawn = new Set(
      everyRow()
        .map(({ row }) => row.contextValue)
        .filter((value): value is string => typeof value === "string"),
    );
    for (const entry of entries) {
      const hit = [...drawn].some((contextValue) =>
        whenHolds(entry.when ?? "", VIEW, contextValue),
      );
      assert.ok(hit, `${entry.command} is gated on '${entry.when}', which no row satisfies`);
    }
  });
});
