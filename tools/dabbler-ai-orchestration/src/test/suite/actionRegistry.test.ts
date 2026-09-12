import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  REPOSITORY_ACTIONS,
  SESSION_ACTIONS,
  applicableRepositoryActions,
  applicableSessionActions,
} from "../../providers/ActionRegistry";
import {
  actionToken,
  tokenMatcher,
} from "../../providers/workExplorerTreeModel";
import {
  childrenOf,
  descriptorFor,
  rootNodes,
} from "../../providers/solutionTreeModel";
import type {
  Projection,
  RowDescriptor,
  SolutionContext,
  SolutionNode,
} from "../../providers/solutionTreeModel";
import { makeRepository, makeSession, makeVerification } from "./helpers";

const finished = makeRepository({
  currentSession: null,
  sessions: [makeSession({ number: 1, status: "complete" })],
});
const inFlight = makeRepository({
  currentSession: 2,
  sessions: [
    makeSession({ number: 1, status: "complete" }),
    makeSession({ number: 2, status: "in-progress" }),
  ],
});

suite("ActionRegistry: repository actions", () => {
  test("open-file actions apply whatever state the work is in", () => {
    for (const repository of [finished, inFlight]) {
      const ids = applicableRepositoryActions(repository).map((a) => a.id);
      assert.ok(ids.includes("dabblerSessionSets.openSpec"));
      assert.ok(ids.includes("dabblerSessionSets.openSessionState"));
    }
  });

  test("start offers while work remains; close only while one is in flight", () => {
    const running = applicableRepositoryActions(inFlight).map((a) => a.id);
    assert.ok(running.includes("dabblerSessionSets.startSession"));
    assert.ok(running.includes("dabblerSessionSets.closeSession"));
    const done = applicableRepositoryActions(finished).map((a) => a.id);
    assert.ok(!done.includes("dabblerSessionSets.startSession"));
    assert.ok(!done.includes("dabblerSessionSets.closeSession"));
  });

  test("a repository with only planned sessions can still be started", () => {
    // The affordances are gated on session status, never on a ledger
    // existing. Project setup is unreachable otherwise: the two setup
    // sessions are exactly the ones that run before anything is written.
    const scaffolded = makeRepository({
      sessionsSource: "plan",
      sessions: [makeSession({ number: 1, status: "not-started" })],
    });
    const ids = applicableRepositoryActions(scaffolded).map((a) => a.id);
    assert.ok(ids.includes("dabblerSessionSets.startSession"));
    assert.ok(!ids.includes("dabblerSessionSets.closeSession"));
  });

  test("actions come back sorted by group", () => {
    const groups = applicableRepositoryActions(inFlight).map((a) => a.group);
    assert.deepStrictEqual(groups, [...groups].sort((a, b) => a - b));
  });
});

suite("ActionRegistry: session actions", () => {
  test("a session stopped at the cap can be cancelled, and nothing approves", () => {
    const stopped = makeSession({ number: 1, status: "in-progress", verification: makeVerification() });
    const ids = applicableSessionActions(makeRepository({ sessions: [stopped] }), stopped).map((a) => a.id);
    assert.ok(ids.includes("dabblerSessionSets.cancel"));
    // There is no approval anywhere in this framework, so there is no
    // action that could accept work over a standing finding -- and nothing
    // that hands a person a prompt to paste, because the framework sends.
    for (const action of [...REPOSITORY_ACTIONS, ...SESSION_ACTIONS]) {
      assert.doesNotMatch(`${action.id} ${action.label}`, /approv|waive|accept|copy|prompt/i);
    }
  });

  test("Start Session is offered on the row that would actually be registered", () => {
    // csv-model feedback item 9: right-clicking the next session in Not
    // Started and choosing Start Session. The repository row already
    // offered it; the session rows offered nothing but Cancel, so the
    // operator's own reading of "what runs next" was the one place they
    // could not act.
    const sessions = [
      makeSession({ number: 1, status: "complete" }),
      makeSession({ number: 2, status: "not-started" }),
      makeSession({ number: 3, status: "not-started" }),
    ];
    const idle = makeRepository({ currentSession: null, nextSession: 2, sessions });
    const offered = (
      repository: ReturnType<typeof makeRepository>,
      session: ReturnType<typeof makeSession>,
    ) => applicableSessionActions(repository, session).map((a) => a.id);

    assert.ok(offered(idle, sessions[1]).includes("dabblerSessionSets.startSession"));
    // Not on any other row. `session start` takes no session number -- it
    // registers the next one -- so an entry on session 3 would start
    // session 2, which is a menu item that lies about what it does.
    assert.ok(!offered(idle, sessions[2]).includes("dabblerSessionSets.startSession"));
    assert.ok(!offered(idle, sessions[0]).includes("dabblerSessionSets.startSession"));

    // And never while one is in flight, whatever the row says.
    const running = makeRepository({ currentSession: 2, nextSession: 2, sessions });
    assert.ok(!offered(running, sessions[1]).includes("dabblerSessionSets.startSession"));

    // A repository whose projection could not say what is next offers it
    // nowhere, rather than guessing a session to register.
    const unknown = makeRepository({ currentSession: null, nextSession: null, sessions });
    for (const session of sessions) {
      assert.ok(!offered(unknown, session).includes("dabblerSessionSets.startSession"));
    }
  });

  test("Start Session is withheld in a module's folder unless the next session is focused on that module", () => {
    // The proof of 2026-09-08: Start Session in the model window registered
    // a session whose plan named app, and nothing said no. `session start`
    // now refuses it by name, and the launcher is not offered for a refusal.
    const sessions = [
      makeSession({ number: 1, status: "complete" }),
      makeSession({ number: 2, status: "not-started", kind: "focused", module: "app" }),
      makeSession({ number: 3, status: "planned", iconKey: "not-started", kind: "global" }),
    ];
    const starts = (repository: ReturnType<typeof makeRepository>) => ({
      repository: applicableRepositoryActions(repository).map((a) => a.id).includes("dabblerSessionSets.startSession"),
      row: applicableSessionActions(repository, sessions[1]).map((a) => a.id).includes("dabblerSessionSets.startSession"),
    });
    const inApp = makeRepository({ currentSession: null, nextSession: 2, sessions, checkoutModule: "app" });
    assert.deepStrictEqual(starts(inApp), { repository: true, row: true });
    const inModel = makeRepository({ currentSession: null, nextSession: 2, sessions, checkoutModule: "model" });
    assert.deepStrictEqual(starts(inModel), { repository: false, row: false });
    // The repository itself starts anything; a module's folder never starts
    // a global session.
    const inRepository = makeRepository({ currentSession: null, nextSession: 2, sessions, checkoutModule: null });
    assert.strictEqual(starts(inRepository).repository, true);
    const globalNext = makeRepository({ currentSession: null, nextSession: 3, sessions, checkoutModule: "app" });
    assert.strictEqual(starts(globalNext).repository, false);
  });

  test("cancel and restore are mutually exclusive on one row", () => {
    const cancelled = makeSession({ number: 1, status: "cancelled" });
    const ids = applicableSessionActions(
      makeRepository({ sessions: [cancelled] }),
      cancelled,
    ).map((a) => a.id);
    assert.ok(ids.includes("dabblerSessionSets.restore"));
    assert.ok(!ids.includes("dabblerSessionSets.cancel"));
  });

  test("Resume Session is withheld while the stop is the engine's to clear", () => {
    // `session run` calls `next`, and one instruction has exactly one
    // caller. The operator clicked this at a stop that was the engine's --
    // a dispute the framework had refused to write -- and became a second
    // driver on a live loop.
    const offered = (stopActor?: "engine" | "operator" | "either") =>
      applicableSessionActions(
        makeRepository({
          currentSession: 2,
          sessions: [makeSession({ number: 2, status: "in-progress", ...(stopActor ? { stopActor } : {}) })],
        }),
        makeSession({ number: 2, status: "in-progress", ...(stopActor ? { stopActor } : {}) }),
      ).map((a) => a.id);

    assert.ok(!offered("engine").includes("dabblerSessionSets.resumeSession"));
    // Where the stop is genuinely theirs, or nothing has stopped at all,
    // the action is exactly where it was: this withholds a button in one
    // state rather than removing an affordance.
    assert.ok(offered("operator").includes("dabblerSessionSets.resumeSession"));
    assert.ok(offered("either").includes("dabblerSessionSets.resumeSession"));
    assert.ok(offered().includes("dabblerSessionSets.resumeSession"));
    // And nothing else moves: cancelling a session is the person's verb
    // whatever the loop is doing.
    assert.ok(offered("engine").includes("dabblerSessionSets.cancel"));
  });
});

suite("ActionRegistry: package.json menu registry", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "package.json"), "utf8"),
  ) as {
    contributes: {
      commands: Array<{ command: string }>;
      menus: Record<string, Array<{ command?: string; when?: string }>>;
    };
  };
  const menuEntries = Object.values(manifest.contributes.menus).flat();

  test("every registry action has a menu contribution gated on its token", () => {
    for (const action of [...REPOSITORY_ACTIONS, ...SESSION_ACTIONS]) {
      const token = tokenMatcher(actionToken(action));
      const hit = menuEntries.some(
        (e) => e.command === action.id && (e.when ?? "").includes(token),
      );
      assert.ok(hit, `${action.id} has no menu entry matching ${token}`);
    }
  });

  test("the Solution Explorer says what it is for, and offers a way in", () => {
    // csv-model's fourth feedback item: the view's purpose was unclear, and
    // an empty tree said nothing at all. What answers it is a welcome the
    // reader sees BEFORE there is anything to render -- so it is a
    // contribution, and a contribution nothing asserts is one a refactor
    // drops silently.
    const welcomes = (
      manifest.contributes as unknown as {
        viewsWelcome?: Array<{ view: string; contents: string }>;
      }
    ).viewsWelcome ?? [];
    const solution = welcomes.find((entry) => entry.view === "dabblerSolutionTree");
    assert.ok(solution, "the Solution Explorer contributes no welcome");
    // What it is FOR, in the terms the feedback item asked for: what the
    // view shows, and who is affected when one of those things changes.
    // "solution" alone would pass on the view's own name, which is the
    // sentence the item called unclear in the first place.
    for (const promise of [/built FROM/i, /modules/i, /promises|breaks|changes/i]) {
      assert.ok(
        promise.test(solution.contents),
        `the welcome does not say what the view is for (${promise})`,
      );
    }
    assert.ok(
      /\(command:[a-zA-Z.]+\)/.test(solution.contents),
      "the welcome offers no command, so an empty view is a dead end",
    );
  });

  test("every act- token in package.json maps back to a registry action", () => {
    const known = new Set(
      [...REPOSITORY_ACTIONS, ...SESSION_ACTIONS].map((a) => actionToken(a)),
    );
    for (const entry of menuEntries) {
      const when = entry.when ?? "";
      for (const match of when.matchAll(/;(act-[A-Za-z-]+);/g)) {
        assert.ok(known.has(match[1]), `${match[1]} in package.json has no registry entry`);
      }
    }
  });

  test("every menu command is a declared command", () => {
    const declared = new Set(manifest.contributes.commands.map((c) => c.command));
    for (const entry of menuEntries) {
      if (entry.command) assert.ok(declared.has(entry.command), entry.command);
    }
  });

  test("no declared command hands anyone a prompt to paste; Stop and Send exist only while driving", () => {
    for (const command of manifest.contributes.commands as Array<{ command: string; title: string }>) {
      assert.doesNotMatch(`${command.command} ${command.title}`, /copy|prompt|paste|respecif/i, command.command);
    }
    const palette = manifest.contributes.menus["commandPalette"] ?? [];
    for (const id of ["dabbler.stopDrive", "dabbler.sendToEngine"]) {
      const entry = palette.find((e) => e.command === id);
      assert.strictEqual(entry?.when, "dabbler.driving", id);
    }
  });

  test("at most two inline actions per row", () => {
    const inline = (manifest.contributes.menus["view/item/context"] ?? []).filter(
      (e) => ((e as { group?: string }).group ?? "").startsWith("inline"),
    );
    assert.ok(inline.length <= 2, `found ${inline.length} inline actions`);
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
 * producible here -- a focused module, a granted one, the module the next
 * session names, and a producer in each of its three locations.
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
    solution: { name: "s", title: "s", multi: true, implicit: false, moduleCount: 2 },
    modules: [
      {
        slug: "model",
        title: "The model",
        kind: "shared-types",
        package: "Model",
        contract: "package",
        codeRoots: ["modules/model"],
        dependsOn: [],
        usedBy: ["app"],
        contractDir: "modules/model/contract",
        granted: true,
      },
      {
        slug: "app",
        title: "The app",
        kind: "application",
        package: null,
        contract: null,
        codeRoots: ["modules/app"],
        dependsOn: ["model"],
        usedBy: [],
        contractDir: null,
      },
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
    bundles: [
      {
        bundle: "app",
        version: "1.0.0",
        date: "2026-09-01",
        dependencies: [{ module: "model", package: "Model", version: "1.0.0" }],
      },
    ],
    configuration,
  };
  const single: Projection = {
    solution: { name: "one", title: "one", multi: false, implicit: true, moduleCount: 1 },
    modules: [
      {
        slug: "one",
        title: "one",
        kind: "application",
        package: null,
        contract: null,
        codeRoots: ["."],
        dependsOn: [],
        usedBy: [],
        contractDir: null,
      },
    ],
    configuration,
  };
  return [
    { from: "a solution of two modules", projection: multi, context: { nextSessionModule: "app" } },
    { from: "the repository as its module", projection: single, context: {} },
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
