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

  test("cancel and restore are mutually exclusive on one row", () => {
    const cancelled = makeSession({ number: 1, status: "cancelled" });
    const ids = applicableSessionActions(
      makeRepository({ sessions: [cancelled] }),
      cancelled,
    ).map((a) => a.id);
    assert.ok(ids.includes("dabblerSessionSets.restore"));
    assert.ok(!ids.includes("dabblerSessionSets.cancel"));
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
    for (const promise of [/built FROM/i, /components/i, /promises|breaks|changes/i]) {
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
