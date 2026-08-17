import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  ROW_ACTIONS,
  SESSION_ACTIONS,
  applicableActions,
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
import { makeSession, makeSet } from "./helpers";

suite("ActionRegistry: set actions", () => {
  test("open-file actions apply to every state", () => {
    for (const state of ["complete", "in-progress", "not-started", "cancelled"] as const) {
      const ids = applicableActions(makeSet({ state })).map((a) => a.id);
      assert.ok(ids.includes("dabblerSessionSets.openSpec"), state);
    }
  });

  test("cancel applies to everything but cancelled; restore only to cancelled", () => {
    const cancelled = applicableActions(makeSet({ state: "cancelled" })).map((a) => a.id);
    assert.ok(cancelled.includes("dabblerSessionSets.restore"));
    assert.ok(!cancelled.includes("dabblerSessionSets.cancel"));
    const active = applicableActions(makeSet({ state: "in-progress" })).map((a) => a.id);
    assert.ok(active.includes("dabblerSessionSets.cancel"));
    assert.ok(!active.includes("dabblerSessionSets.restore"));
  });

  test("close-session offers only on an in-progress set", () => {
    const notStarted = applicableActions(makeSet({ state: "not-started" })).map((a) => a.id);
    assert.ok(!notStarted.includes("dabblerSessionSets.closeSession"));
    assert.ok(notStarted.includes("dabblerSessionSets.startSession"));
    const inProgress = applicableActions(makeSet({ state: "in-progress" })).map((a) => a.id);
    assert.ok(inProgress.includes("dabblerSessionSets.closeSession"));
  });

  test("actions come back sorted by group", () => {
    const groups = applicableActions(makeSet({ state: "in-progress" })).map((a) => a.group);
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
    const set = makeSet({ state: "in-progress", sessions });
    assert.strictEqual(applicableSessionActions(set, sessions[1]).length, 1);
    assert.strictEqual(applicableSessionActions(set, sessions[2]).length, 0);
  });
});

suite("rowMenuHelpers", () => {
  test("left-click copies the start prompt only on non-terminal rows", () => {
    assert.notStrictEqual(
      planLeftClickActivation("001-a", "in-progress").clipboardWrite,
      null,
    );
    assert.strictEqual(planLeftClickActivation("001-a", "complete").clipboardWrite, null);
  });

  test("a backtick in the slug is sanitized before it reaches the template literal", () => {
    const plan = planLeftClickActivation("weird`name", "not-started");
    assert.ok(!plan.clipboardWrite!.text.includes("`weird`name`"));
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

  test("nextRunnableSessionNumber returns the first non-terminal session", () => {
    assert.strictEqual(
      nextRunnableSessionNumber([
        makeSession({ number: 1, status: "complete" }),
        makeSession({ number: 2, status: "in-progress" }),
      ]),
      2,
    );
  });

  test("a terminal set offers no session run prompt at all", () => {
    const session = makeSession({ number: 1, status: "not-started" });
    const set = makeSet({ state: "complete", sessions: [session] });
    assert.strictEqual(sessionOffersRunPrompt(set, session), false);
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
    for (const action of [...ROW_ACTIONS, ...SESSION_ACTIONS]) {
      const token = tokenMatcher(actionToken(action));
      const hit = menuEntries.some(
        (e) => e.command === action.id && (e.when ?? "").includes(token),
      );
      assert.ok(hit, `${action.id} has no menu entry matching ${token}`);
    }
  });

  test("every act- token in package.json maps back to a registry action", () => {
    const known = new Set(
      [...ROW_ACTIONS, ...SESSION_ACTIONS].map((a) => actionToken(a)),
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
