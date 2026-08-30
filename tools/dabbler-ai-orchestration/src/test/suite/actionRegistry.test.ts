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
  nextRunnableSessionNumber,
  planLeftClickActivation,
  sessionOffersRunPrompt,
} from "../../providers/rowMenuHelpers";
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
    assert.ok(ids.includes("dabbler.copyStartNextSessionPrompt"));
    assert.ok(ids.includes("dabblerSessionSets.startSession"));
    assert.ok(!ids.includes("dabblerSessionSets.closeSession"));
  });

  test("actions come back sorted by group", () => {
    const groups = applicableRepositoryActions(inFlight).map((a) => a.group);
    assert.deepStrictEqual(groups, [...groups].sort((a, b) => a - b));
  });
});

suite("ActionRegistry: session actions", () => {
  test("only the next runnable session offers the run prompt", () => {
    const sessions = [
      makeSession({ number: 1, status: "complete" }),
      makeSession({ number: 2, status: "not-started" }),
      makeSession({ number: 3, status: "not-started" }),
    ];
    const repository = makeRepository({ sessions });
    const offered = (s: (typeof sessions)[number]): string[] =>
      applicableSessionActions(repository, s).map((a) => a.id);
    assert.ok(offered(sessions[1]).includes("dabbler.copySessionRunPrompt"));
    assert.ok(!offered(sessions[2]).includes("dabbler.copySessionRunPrompt"));
  });

  test("send back and respecify are offered only on a session with something to read, and nothing approves", () => {
    const stopped = makeSession({ number: 1, status: "in-progress", verification: makeVerification() });
    const verified = makeSession({
      number: 1,
      status: "complete",
      verification: makeVerification({ terminal: "VERIFIED", headline: "verified", clean: true }),
    });
    const unrecorded = makeSession({ number: 1, status: "not-started" });
    // A loop still open is rendered but not acted on: no terminal yet.
    const open = makeSession({
      number: 1,
      status: "in-progress",
      verification: makeVerification({ terminal: null, headline: "blocking findings outstanding after round 1 of 3" }),
    });
    const ids = (s: typeof stopped): string[] =>
      applicableSessionActions(makeRepository({ sessions: [s] }), s).map((a) => a.id);
    assert.ok(ids(stopped).includes("dabbler.copySendBackPrompt"));
    assert.ok(ids(stopped).includes("dabbler.respecifySession"));
    assert.ok(ids(stopped).includes("dabblerSessionSets.cancel"));
    for (const quiet of [verified, unrecorded, open]) {
      assert.ok(!ids(quiet).includes("dabbler.copySendBackPrompt"));
      assert.ok(!ids(quiet).includes("dabbler.respecifySession"));
    }
    // There is no approval anywhere in this framework, so there is no
    // action that could accept work over a standing finding.
    for (const action of [...REPOSITORY_ACTIONS, ...SESSION_ACTIONS]) {
      assert.doesNotMatch(`${action.id} ${action.label}`, /approv|waive|accept/i);
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

suite("rowMenuHelpers", () => {
  test("left-click copies the start prompt only while work remains", () => {
    assert.notStrictEqual(planLeftClickActivation(inFlight).clipboardWrite, null);
    assert.strictEqual(planLeftClickActivation(finished).clipboardWrite, null);
  });

  test("nextRunnableSessionNumber fails closed on a numbering gap", () => {
    assert.strictEqual(
      nextRunnableSessionNumber([
        makeSession({ number: 1, status: "complete" }),
        makeSession({ number: 3, status: "not-started" }),
      ]),
      null,
    );
  });

  test("a gap the PLAN declares is legitimate, unlike a gap in the ledger", () => {
    // The projection publishes `nextSession` over the same rows; counting a
    // planned row toward ledger contiguity made the two disagree on exactly
    // the case the plan calls legitimate.
    assert.strictEqual(
      nextRunnableSessionNumber([
        makeSession({ number: 1, status: "complete" }),
        makeSession({ number: 2, status: "complete" }),
        makeSession({ number: 4, status: "planned" }),
      ]),
      4,
    );
  });

  test("nextRunnableSessionNumber returns the first non-terminal session", () => {
    assert.strictEqual(
      nextRunnableSessionNumber([
        makeSession({ number: 1, status: "complete" }),
        makeSession({ number: 2, status: "in-progress" }),
      ]),
      2,
    );
  });

  test("a repository with nothing left to run offers no session run prompt", () => {
    const session = finished.sessions[0];
    assert.strictEqual(sessionOffersRunPrompt(finished, session), false);
  });
});

// The typed registry check that replaces v1's token-grammar parity test:
// every registry action must have a menu contribution matching its
// token, and every act- token in package.json must map back to a
// registry entry — so neither side can drift alone.
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

  test("at most two inline actions per row", () => {
    const inline = (manifest.contributes.menus["view/item/context"] ?? []).filter(
      (e) => ((e as { group?: string }).group ?? "").startsWith("inline"),
    );
    assert.ok(inline.length <= 2, `found ${inline.length} inline actions`);
  });
});
