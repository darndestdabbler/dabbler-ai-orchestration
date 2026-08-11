// Set 115 Session 3 — the session row's menu: the prompt.
//
// Narrowed by Set 115 Session 4: the operator walked the finished row and
// ruled "Open Session Artifacts" out of the menu, so its command and its
// discovery helpers are gone and the suite that drove them went with them.
// What replaced that coverage is an ABSENCE assertion — no session row
// carries the token — because a re-added registry entry is otherwise
// invisible until someone right-clicks in a UAT walk.
//
// Two suites for the two things that can be wrong independently:
//
//   1. `nextRunnableSessionNumber` / `sessionOffersRunPrompt` — WHICH row
//      may offer the run prompt. This is the session's one genuinely new
//      rule, and the whole reason the entry is not simply "any non-terminal
//      session": the copied text is the framework's SET-scoped trigger
//      phrase, so a prompt offered on the wrong row would start a different
//      session than the row it came from.
//   2. `sessionDescriptor` — whether the row actually CARRIES the tokens
//      the menus gate on. `workExplorerMenuParity.test.ts` proves the menus
//      and the registry agree; nothing there proves a rendered row emits
//      the token, which is the other half of the same contract.
//
// What is NOT here: the menu rendering itself. VS Code's `when`-clause
// evaluation is proven in a real host by
// `src/test/playwright/session-menu.spec.ts`.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { SessionRecord, SessionSet, SessionStatus } from "../../types";
import {
  SESSION_ACTIONS,
  applicableSessionActions,
} from "../../providers/ActionRegistry";
import {
  nextRunnableSessionNumber,
  sessionOffersRunPrompt,
} from "../../providers/rowMenuHelpers";
import { sessionDescriptor } from "../../providers/workExplorerTreeModel";
import { readSessionSets } from "../../utils/fileSystem";
import { planSessionRunPrompt } from "../../commands/copyPromptCommands";

const RUN_PROMPT = "dabbler.copySessionRunPrompt";

function session(number: number, status: string, title = ""): SessionRecord {
  return { number, title, status: status as SessionStatus };
}

/**
 * A set record shaped like the scan produces one, minus the two dozen
 * fields none of this reads. Cast at the boundary rather than spread
 * through every assertion.
 */
function makeSet(
  name: string,
  state: string,
  sessions: SessionRecord[],
  dir = "/tmp/nowhere",
): SessionSet {
  return {
    name,
    state,
    sessions,
    dir,
    root: path.dirname(dir),
    sessionsCompleted: sessions.filter((s) => s.status === "complete").length,
    unsatisfiedPrereqs: [],
  } as unknown as SessionSet;
}

function withTmpDir(fn: (dir: string) => void): void {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-s115-s3-"));
  try {
    fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

suite("Set 115 S3 — which session may be run", () => {
  test("the first unfinished session is the next one", () => {
    assert.strictEqual(
      nextRunnableSessionNumber([
        session(1, "complete"),
        session(2, "complete"),
        session(3, "not-started"),
        session(4, "not-started"),
      ]),
      3,
    );
  });

  test("an in-flight session is the next one, not the one after it", () => {
    // `start_session` is idempotent, so the trigger phrase resumes an
    // in-flight session rather than skipping past it. The row has to agree.
    assert.strictEqual(
      nextRunnableSessionNumber([
        session(1, "complete"),
        session(2, "in-progress"),
        session(3, "not-started"),
      ]),
      2,
    );
  });

  test("ledger order does not depend on array order", () => {
    assert.strictEqual(
      nextRunnableSessionNumber([
        session(3, "not-started"),
        session(1, "complete"),
        session(2, "not-started"),
      ]),
      2,
    );
  });

  test("a cancelled session is behind us, not a wall", () => {
    assert.strictEqual(
      nextRunnableSessionNumber([
        session(1, "complete"),
        session(2, "cancelled"),
        session(3, "not-started"),
      ]),
      3,
    );
  });

  test("an unrecognised status stops the walk — nothing is runnable", () => {
    // The falsifier for the fail-closed rule, and the case that actually
    // occurs: `step-ledger-findings.md` measured four spellings of "done"
    // in this repo's own ledgers. A reader that treated `"completed"` as
    // "not complete, therefore skip" would nominate session 3 while
    // session 2's true state is unknown.
    for (const bogus of ["completed", "done", "", "COMPLETE", "finished"]) {
      assert.strictEqual(
        nextRunnableSessionNumber([
          session(1, "complete"),
          session(2, bogus),
          session(3, "not-started"),
        ]),
        null,
        `status "${bogus}" should fail closed`,
      );
    }
  });

  test("a number GAP is unknowable, not a session to skip", () => {
    // Round 1, Major. The scan does not hand an unreadable session through
    // with a funny status — `normalizeLedgerSessions` DROPS it — so by the
    // time the ledger reaches this function the corrupt session 2 is
    // simply absent and the status check above never fires. What survives
    // is the hole, and walking through it would nominate session 3 as
    // "next" on a set whose session 2 might still be unfinished.
    assert.strictEqual(
      nextRunnableSessionNumber([session(1, "complete"), session(3, "not-started")]),
      null,
    );
    // A ledger that does not start at 1 is missing its first session.
    assert.strictEqual(nextRunnableSessionNumber([session(2, "in-progress")]), null);
    // Corruption AFTER the candidate is irrelevant — a broken session 5
    // says nothing about whether session 2 is next.
    assert.strictEqual(
      nextRunnableSessionNumber([
        session(1, "complete"),
        session(2, "not-started"),
        session(5, "not-started"),
      ]),
      2,
    );
  });

  test("an empty or absent ledger is not runnable", () => {
    assert.strictEqual(nextRunnableSessionNumber([]), null);
    assert.strictEqual(nextRunnableSessionNumber(undefined), null);
  });

  test("a fully complete ledger is not runnable", () => {
    assert.strictEqual(
      nextRunnableSessionNumber([session(1, "complete"), session(2, "complete")]),
      null,
    );
  });

  test("only the next runnable ROW offers the prompt", () => {
    const sessions = [
      session(1, "complete"),
      session(2, "not-started"),
      session(3, "not-started"),
    ];
    const set = makeSet("115-x", "in-progress", sessions);
    assert.strictEqual(sessionOffersRunPrompt(set, sessions[0]), false);
    assert.strictEqual(sessionOffersRunPrompt(set, sessions[1]), true);
    // The whole point of the gate: session 3 must NOT carry a phrase that
    // would start session 2.
    assert.strictEqual(sessionOffersRunPrompt(set, sessions[2]), false);
  });

  test("a terminal SET offers nothing, whatever its sessions say", () => {
    // Borrowed from `planLeftClickActivation`, so the set row and the
    // session row cannot disagree about what a runnable set is. A cancelled
    // set with a not-started session inside it is exactly the shape that
    // would otherwise leak.
    const sessions = [session(1, "not-started")];
    for (const state of ["complete", "cancelled", "archived-someday"]) {
      assert.strictEqual(
        sessionOffersRunPrompt(makeSet("115-x", state, sessions), sessions[0]),
        false,
        `set state "${state}" should offer no run prompt`,
      );
    }
  });

  test("the copied text is the documented trigger phrase, verbatim", () => {
    const sessions = [session(1, "complete"), session(2, "in-progress")];
    const set = makeSet("115-work-explorer-session-node-ux", "in-progress", sessions);
    const plan = planSessionRunPrompt(set, sessions[1]);
    assert.ok(plan, "the in-flight session should offer a prompt");
    assert.strictEqual(
      plan.text,
      "Start the next session of `115-work-explorer-session-node-ux`.",
    );
    // The toast names the SESSION, so the operator can see the row they
    // clicked is the one that will run.
    assert.match(plan.toast, /Start session 2 of/);
    assert.strictEqual(planSessionRunPrompt(set, sessions[0]), null);
  });

  test("a backtick in a slug cannot break the copied markdown", () => {
    const sessions = [session(1, "not-started")];
    const set = makeSet("115-`rm -rf`-set", "not-started", sessions);
    const plan = planSessionRunPrompt(set, sessions[0]);
    assert.ok(plan);
    assert.strictEqual(plan.text, "Start the next session of `115-'rm -rf'-set`.");
  });
});

suite("Set 115 S3 — the session row carries its own action tokens", () => {
  function tokensFor(set: SessionSet, record: SessionRecord): string {
    return sessionDescriptor({ kind: "session", set, session: record }).contextValue;
  }

  test("only the runnable row carries the run-prompt token", () => {
    const sessions = [
      session(1, "complete", "The first one"),
      session(2, "not-started", "The next one"),
      session(3, "not-started", "The later one"),
    ];
    const set = makeSet("115-x", "in-progress", sessions);

    const next = tokensFor(set, sessions[1]);
    assert.ok(next.includes(";act-copySessionRunPrompt;"), next);

    for (const record of [sessions[0], sessions[2]]) {
      const other = tokensFor(set, record);
      assert.ok(
        !other.includes(";act-copySessionRunPrompt;"),
        `session ${record.number} should not offer the run prompt: ${other}`,
      );
    }
  });

  test("no session row carries the removed artifact token", () => {
    // Set 115 S4, operator ruling at the walk. Asserted as an ABSENCE
    // across every session status because a re-added registry entry
    // would otherwise reappear on screen with nothing failing.
    const sessions = [
      session(1, "complete"),
      session(2, "in-progress"),
      session(3, "not-started"),
    ];
    const set = makeSet("115-x", "in-progress", sessions);
    for (const record of sessions) {
      assert.ok(
        !tokensFor(set, record).includes("act-openSessionArtifacts"),
        `session ${record.number} still offers the removed entry`,
      );
    }
  });

  test("the node-kind and status tokens Set 110 and 114 rely on survive", () => {
    const sessions = [session(1, "in-progress", "Live")];
    const value = tokensFor(makeSet("115-x", "in-progress", sessions), sessions[0]);
    assert.ok(value.includes(";dabblerSession;"), value);
    assert.ok(value.includes(";session-in-progress;"), value);
  });

  test("`applicableSessionActions` and the row agree, sorted by group", () => {
    // The registry and the descriptor read the same `when` predicates, and
    // this is the assertion that keeps them from being wired to different
    // ones — the failure would be a menu entry that never appears.
    const sessions = [session(1, "in-progress")];
    const set = makeSet("115-x", "in-progress", sessions);
    assert.deepStrictEqual(
      applicableSessionActions(set, sessions[0]).map((a) => a.id),
      [RUN_PROMPT],
    );
    // A session the phrase does not resolve to offers NOTHING now that
    // the artifact entry is gone — an empty menu is the honest result,
    // not a bug.
    const complete = [session(1, "complete"), session(2, "complete")];
    assert.deepStrictEqual(
      applicableSessionActions(makeSet("115-y", "complete", complete), complete[0]).map(
        (a) => a.id,
      ),
      [],
    );
  });

  test("every registered session action is one this suite pins", () => {
    // A new entry added to `SESSION_ACTIONS` without a test lands here
    // rather than in a UAT walk.
    assert.deepStrictEqual(SESSION_ACTIONS.map((a) => a.id), [RUN_PROMPT]);
  });
});

suite("Set 115 S3 round 1 — a corrupt ledger, through the real scan", () => {
  // The round-1 Major, driven the way the acceptance criterion requires:
  // through `readSessionSets` and `sessionDescriptor` rather than by
  // casting a bogus `SessionRecord` straight into the helper. That
  // distinction is the whole finding — the scan DROPS the unreadable
  // session, so a test that hands the bad status directly to the gate
  // proves the one path production never takes.

  function scanOneSet(stateSessions: unknown[]): SessionSet {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-s115-s3-scan-"));
    try {
      const dir = path.join(root, "docs", "session-sets", "042-corrupt-ledger");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(
        path.join(dir, "spec.md"),
        "# 042\n\n### Session 1 of 3: One\n\n### Session 2 of 3: Two\n\n### Session 3 of 3: Three\n",
        "utf-8",
      );
      fs.writeFileSync(
        path.join(dir, "session-state.json"),
        JSON.stringify({
          schemaVersion: 4,
          sessionSetName: "042-corrupt-ledger",
          status: "in-progress",
          sessions: stateSessions,
        }),
        "utf-8",
      );
      const sets = readSessionSets(root);
      assert.strictEqual(sets.length, 1);
      return sets[0];
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }

  function renderedTokens(set: SessionSet): string[] {
    return (set.sessions ?? []).map(
      (record) => sessionDescriptor({ kind: "session", set, session: record }).contextValue,
    );
  }

  test("an unrenderable session 2 leaves NO row offering the run prompt", () => {
    const set = scanOneSet([
      { number: 1, title: "One", status: "complete" },
      { number: 2, title: "Two", status: "finished" },
      { number: 3, title: "Three", status: "not-started" },
    ]);
    // The scan drops session 2 outright — this is the fact that made the
    // original status check unreachable, so it is pinned here too.
    assert.deepStrictEqual(
      (set.sessions ?? []).map((s) => s.number),
      [1, 3],
      "the scan is expected to DROP the unreadable session, not degrade it",
    );
    for (const value of renderedTokens(set)) {
      assert.ok(
        !value.includes(";act-copySessionRunPrompt;"),
        `a rendered row offers the run prompt on a ledger with a hole: ${value}`,
      );
    }
  });

  test("a corrupt session NUMBER is the same class and fails the same way", () => {
    // The sibling drop path (L-069-1): `normalizeLedgerSessions` also
    // drops non-integer and non-positive numbers, and the hole it leaves
    // is indistinguishable from the status one.
    for (const broken of [
      { number: "2", title: "Two", status: "not-started" },
      { number: 2.5, title: "Two", status: "not-started" },
      { number: 0, title: "Zero", status: "not-started" },
    ]) {
      const set = scanOneSet([
        { number: 1, title: "One", status: "complete" },
        broken,
        { number: 3, title: "Three", status: "not-started" },
      ]);
      for (const value of renderedTokens(set)) {
        assert.ok(
          !value.includes(";act-copySessionRunPrompt;"),
          `number ${JSON.stringify(broken.number)} left a row offering the prompt: ${value}`,
        );
      }
    }
  });

  test("a HEALTHY scanned ledger still offers the prompt — the guard is not a mute", () => {
    // The other half of the falsifier pair (L-112-1): a check that
    // suppresses everything would pass the two tests above and be
    // worthless.
    const set = scanOneSet([
      { number: 1, title: "One", status: "complete" },
      { number: 2, title: "Two", status: "in-progress" },
      { number: 3, title: "Three", status: "not-started" },
    ]);
    const tokens = renderedTokens(set);
    assert.strictEqual(
      tokens.filter((v) => v.includes(";act-copySessionRunPrompt;")).length,
      1,
      "exactly one row should offer the run prompt on a healthy ledger",
    );
    const offering = (set.sessions ?? []).find((record) =>
      sessionDescriptor({ kind: "session", set, session: record }).contextValue.includes(
        ";act-copySessionRunPrompt;",
      ),
    );
    assert.strictEqual(offering?.number, 2);
  });
});
