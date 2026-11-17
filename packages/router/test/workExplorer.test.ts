// The Work Explorer's rows: the nodes and their children, each row's
// descriptor, the labels and icons, the verdict words, and the rule for
// which actions a row offers.
//
// What is asserted is the rows an interface is handed. The tests that read
// the VS Code extension's own files -- its manifest's menus, its status
// icons -- stay with the extension.

import assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { suite, test } from "node:test";

import type {
  ProgressProjection as ProjectionPayload,
  ProgressProjectionSession as SessionRecord,
  ProgressProjectionVerification as SessionVerification,
  ProgressProjectionTask as TaskRecord,
  ProgressProjectionFinding as VerificationFinding,
} from "../src/generated/progress-projection.ts";
import type { WorkExplorer } from "../src/generated/work-explorer.ts";
import { viewVerb } from "../src/cli/view.ts";
import { loadSchemaFile, schemaFailure } from "../src/schema/validate.ts";
import {
  ICON_FILES,
  NODE_TOKEN,
  REPOSITORY_ACTIONS,
  SESSION_ACTIONS,
  actionToken,
  applicableRepositoryActions,
  applicableSessionActions,
  attentionNodes,
  bucketNodes,
  childrenOf,
  descriptorFor,
  findingDescriptor,
  hasToken,
  offeredRepositoryActions,
  offeredSessionActions,
  progressText,
  readMechanicMemo,
  refusalDescriptor,
  repositoryDescriptor,
  repositoryNodes,
  repositoryTooltip,
  sessionDescriptor,
  sessionDisplayNumber,
  sessionNodes,
  sessionRowLabel,
  sessionsInOrder,
  severityOf,
  stepStartLabel,
  taskDescriptor,
  taskNodes,
  taskRowLabel,
  tokenString,
  verdictIsUnclean,
  verificationDescriptor,
  workExplorerRepository,
  type SessionsRepository,
} from "../src/views/workExplorer.ts";

// ---------------------------------------------------------------------------
// Builders: records shaped exactly as the progress reading and the
// repository assembly build them, with per-test overrides.
// ---------------------------------------------------------------------------

export function makeFinding(
  overrides: Partial<VerificationFinding> = {},
): VerificationFinding {
  return {
    round: 3,
    description: "the suite command is guessed rather than declared",
    severity: "major",
    category: "Correctness",
    failureScenario: "A Java repository gets `python -m pytest`.",
    evidencePaths: ["ai_router/affected.py"],
    blocking: true,
    disposition: "outstanding",
    ...overrides,
  };
}

/** A session unresolved at the cap, as the projection folds one. */
export function makeVerification(
  overrides: Partial<SessionVerification> = {},
): SessionVerification {
  return {
    terminal: "ISSUES_FOUND",
    headline: "unresolved at the cap",
    clean: false,
    verdict: "ISSUES_FOUND",
    rounds: 3,
    stoppedAtRound: 3,
    cap: 3,
    verifierModel: "gpt-5-6-sol",
    verifierProvider: "openai",
    transport: "api",
    agency: {
      mode: "none",
      reads: 0,
      searches: 0,
      listings: 0,
      transformedReads: 0,
      outOfScope: 0,
      overBudget: 0,
      reason: "this transport sends no tools",
      operations: [],
    },
    findings: [makeFinding()],
    fixPaths: [],
    ...overrides,
  };
}

export function makeTask(overrides: Partial<TaskRecord> = {}): TaskRecord {
  return {
    position: 0,
    stepId: "implement",
    intent: "Implement the thing.",
    state: "pending",
    iconKey: "not-started",
    isOpen: false,
    startedAt: null,
    ...overrides,
  };
}

export function makeSession(overrides: Partial<SessionRecord> = {}): SessionRecord {
  const number = overrides.number ?? 1;
  return {
    number,
    displayNumber: String(number).padStart(3, "0"),
    title: "Session one",
    status: "complete",
    iconKey: "complete",
    inFlight: false,
    startedAt: null,
    completedAt: null,
    verificationVerdict: null,
    tasks: [],
    tasksRefused: null,
    verification: null,
    verificationRefused: null,
    ...overrides,
  };
}

export function makeRepository(
  overrides: Partial<SessionsRepository> = {},
): SessionsRepository {
  const root = overrides.root ?? path.join("D:", "ws");
  const sessionsDir = path.join(root, "docs", "sessions");
  return {
    root,
    sessionsDir,
    label: path.basename(root),
    planPath: path.join(sessionsDir, "session-plan.md"),
    activityPath: path.join(sessionsDir, "activity-log.json"),
    changeLogPath: path.join(sessionsDir, "change-log.md"),
    ledgerPath: path.join(sessionsDir, "sessions.json"),
    totalSessions: null,
    sessionsCompleted: 0,
    currentSession: null,
    nextSession: null,
    forceClosed: false,
    schemaVersionOnDisk: null,
    sessionsSource: "ledger",
    invariantViolation: null,
    lastActivityAt: null,
    possiblyStalled: false,
    orchestrator: null,
    sessions: [],
    ...overrides,
  };
}

export function makeProjection(
  overrides: {
    repository?: Partial<ProjectionPayload["repository"]>;
    sessions?: SessionRecord[];
  } = {},
): ProjectionPayload {
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-17T12:00:00-04:00",
    repository: {
      sessionsSource: "ledger",
      schemaVersionOnDisk: 5,
      totalSessions: 2,
      sessionsCompleted: 2,
      currentSession: null,
      plannedSessions: 0,
      nextSession: null,
      lastActivityAt: null,
      possiblyStalled: false,
      stalledAfterSeconds: null,
        forceClosed: false,
      orchestrator: null,
      invariantViolation: null,
      ...(overrides.repository ?? {}),
    },
    sessions: overrides.sessions ?? [
      makeSession({ number: 1 }),
      makeSession({ number: 2, title: "Session two" }),
    ],
  };
}

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rmrf(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}


suite("workExplorer: nodes", () => {
  test("sessions group under non-empty status buckets: live work ascending, finished work descending", () => {
    // The operator's ruling, superseding D104: the live buckets read in run
    // order, the finished ones put the latest close under the header, a
    // planned session shares Not Started, and an empty bucket (Cancelled
    // here) is not a row at all.
    const repository = makeRepository({
      sessions: [
        makeSession({ number: 5, status: "planned", iconKey: "not-started" }),
        makeSession({ number: 4, status: "not-started", iconKey: "not-started" }),
        makeSession({ number: 1, status: "complete", completedAt: "2026-08-01T10:00:00Z" }),
        makeSession({ number: 3, status: "in-progress", iconKey: "in-progress" }),
        makeSession({ number: 2, status: "complete", completedAt: "2026-08-02T10:00:00Z" }),
      ],
    });
    const [node] = repositoryNodes([repository]);
    const buckets = bucketNodes(node);
    assert.deepStrictEqual(
      buckets.map((b) => [b.bucket, sessionNodes(b).map((n) => n.session.number)]),
      [
        ["in-progress", [3]],
        ["not-started", [4, 5]],
        ["complete", [2, 1]],
      ],
    );
    const [live, queued, done] = buckets.map((b) => descriptorFor(b));
    // The count sits in the description slot, which VS Code dims.
    assert.strictEqual(done.description, "2");
    assert.strictEqual(live.collapsible, "expanded");
    assert.strictEqual(queued.collapsible, "collapsed");
    assert.strictEqual(done.collapsible, "collapsed");
    assert.deepStrictEqual(done.icon, { kind: "file", slug: "done.svg" });
    assert.ok(hasToken(done.contextValue, NODE_TOKEN.bucket));
  });

  test("a closed session that stopped at the cap is an Information note, not an attention row", () => {
    // Flagging every closed REMEDIATED_AT_CAP session at the top of the tree
    // read as a standing fault and invited reopening work that later
    // sessions had built on. The in-flight case stays an attention row,
    // because that one is a decision.
    const repository = makeRepository({
      currentSession: 3,
      sessions: [
        makeSession({
          number: 1,
          status: "complete",
          verification: makeVerification({ terminal: "REMEDIATED_AT_CAP" }),
        }),
        makeSession({ number: 2, status: "complete" }),
        makeSession({
          number: 3,
          status: "in-progress",
          inFlight: true,
          verification: makeVerification(),
        }),
      ],
    });
    const [node] = repositoryNodes([repository]);
    const attention = attentionNodes(node).filter((r) => r.subject === "unresolved");
    assert.deepStrictEqual(attention.map((r) => r.label.slice(0, 11)), ["Session 003"]);
    const information = bucketNodes(node).find((b) => b.bucket === "information");
    assert.ok(information, "the Information bucket renders when there is a note");
    assert.deepStrictEqual(
      childrenOf(information).map((r) => (r.kind === "attention" ? r.label.slice(0, 11) : r.kind)),
      ["Session 001"],
    );
    assert.strictEqual(descriptorFor(information).collapsible, "collapsed");
    // No notes, no bucket.
    const quiet = repositoryNodes([
      makeRepository({ sessions: [makeSession({ number: 1, status: "complete" })] }),
    ])[0];
    assert.strictEqual(bucketNodes(quiet).some((b) => b.bucket === "information"), false);
  });

  test("taskNodes mirrors the projection's task list verbatim", () => {
    const session = makeSession({
      status: "in-progress",
      tasks: [makeTask({ position: 0 }), makeTask({ position: 1, stepId: "verify" })],
    });
    const nodes = taskNodes({
      kind: "session",
      repository: makeRepository(),
      session,
    });
    assert.deepStrictEqual(
      nodes.map((n) => (n.kind === "task" ? n.row.stepId : n.kind)),
      ["implement", "verify"],
    );
  });

  test("a session without projected tasks yields no task children", () => {
    const session = makeSession({ status: "complete", tasks: [] });
    assert.deepStrictEqual(
      taskNodes({ kind: "session", repository: makeRepository(), session }),
      [],
    );
  });

  test("a refused record yields one refusal row and no task rows", () => {
    // Not an empty list and not the rows that did parse: the tree has to
    // say it cannot tell which step is open.
    const session = makeSession({
      status: "in-progress",
      tasks: [makeTask()],
      tasksRefused: "execution record: row 2 failed schema validation",
    });
    const nodes = taskNodes({
      kind: "session",
      repository: makeRepository(),
      session,
    });
    assert.deepStrictEqual(nodes.map((n) => n.kind), ["refusal"]);
  });

  test("childrenOf covers every level and terminates at tasks", () => {
    const session = makeSession({ status: "in-progress", tasks: [makeTask()] });
    const [repositoryNode] = repositoryNodes([
      makeRepository({ sessions: [session] }),
    ]);
    const bucketNode = childrenOf(repositoryNode)[0];
    assert.strictEqual(bucketNode.kind, "bucket");
    const sessionNode = childrenOf(bucketNode)[0];
    assert.strictEqual(sessionNode.kind, "session");
    const taskNode = childrenOf(sessionNode)[0];
    assert.strictEqual(taskNode.kind, "task");
    assert.deepStrictEqual(childrenOf(taskNode), []);
  });

  test("the plan's steps hang under Work, and nowhere else", () => {
    // The projection emits its rows flat and says which is whose by the
    // `work:` id prefix, so the renderer adds no structure the record does
    // not already carry.
    const session = makeSession({
      status: "in-progress",
      tasks: [
        makeTask({ position: 0, stepId: "register", state: "done" }),
        makeTask({ position: 1, stepId: "work", state: "in flight", isOpen: true }),
        makeTask({ position: 2, stepId: "work:build-the-widget", state: "done" }),
        makeTask({ position: 3, stepId: "work:polish", state: "in flight", isOpen: true }),
        makeTask({ position: 4, stepId: "verify" }),
      ],
    });
    const repository = makeRepository();
    const lifecycle = taskNodes({ kind: "session", repository, session });
    // The step rows are not siblings of the phases.
    assert.deepStrictEqual(
      lifecycle.map((n) => (n.kind === "task" ? n.row.stepId : n.kind)),
      ["register", "work", "verify"],
    );

    const work = lifecycle[1];
    assert.strictEqual(work.kind, "task");
    assert.deepStrictEqual(
      childrenOf(work).map((n) => (n.kind === "task" ? n.row.stepId : n.kind)),
      ["work:build-the-widget", "work:polish"],
    );
    // Only Work has them, and a step row is a leaf.
    assert.deepStrictEqual(childrenOf(lifecycle[0]), []);
    assert.deepStrictEqual(childrenOf(lifecycle[2]), []);
    assert.deepStrictEqual(childrenOf(childrenOf(work)[0]), []);

    // The row reads as its own step id: the prefix says who its parent is,
    // and repeating it on every child would say nothing.
    assert.strictEqual(taskRowLabel(session.tasks[2]), "Build the widget");
    // Expandable because it has children, and the phases beside it are not.
    assert.strictEqual(descriptorFor(work).collapsible, "collapsed");
    assert.strictEqual(descriptorFor(lifecycle[0]).collapsible, "none");
  });

  test("a Work row with no accepted plan yet is a leaf, not an empty expander", () => {
    const session = makeSession({
      status: "in-progress",
      tasks: [makeTask({ position: 0, stepId: "work", state: "in flight", isOpen: true })],
    });
    const [work] = taskNodes({ kind: "session", repository: makeRepository(), session });
    assert.strictEqual(descriptorFor(work).collapsible, "none");
    assert.deepStrictEqual(childrenOf(work), []);
  });

  test("a row's identity survives the plan arriving under it", () => {
    // Session 92's own round-1 nit. The Work row's steps are inserted into
    // the flat list and everything after them is renumbered, so a row keyed
    // on `position` changed identity the moment a plan was accepted — and
    // VS Code drops expansion and selection state when an id moves.
    const repository = makeRepository();
    const before = makeSession({
      status: "in-progress",
      tasks: [
        makeTask({ position: 0, stepId: "work" }),
        makeTask({ position: 1, stepId: "verify" }),
      ],
    });
    const after = makeSession({
      status: "in-progress",
      tasks: [
        makeTask({ position: 0, stepId: "work" }),
        makeTask({ position: 1, stepId: "work:build" }),
        makeTask({ position: 2, stepId: "verify" }),
      ],
    });
    const idOf = (session: ReturnType<typeof makeSession>, stepId: string) =>
      descriptorFor({
        kind: "task",
        repository,
        session,
        row: session.tasks.find((t) => t.stepId === stepId)!,
      }).id;

    assert.strictEqual(idOf(before, "verify"), idOf(after, "verify"));
    // And two rows of one session are still distinct.
    assert.notStrictEqual(idOf(after, "work"), idOf(after, "work:build"));

    // A row with no step id has no other identity, so the position is it.
    const bare = makeSession({
      status: "in-progress",
      tasks: [makeTask({ position: 3, stepId: null })],
    });
    assert.ok(
      descriptorFor({ kind: "task", repository, session: bare, row: bare.tasks[0] }).id.endsWith("#3"),
    );
  });

  test("a plan step named like a lifecycle phase keeps its own name", () => {
    // The vocabulary is over the six phases. A plan may legitimately call a
    // step `close`, and it does not mean the lifecycle's Close.
    assert.strictEqual(taskRowLabel(makeTask({ stepId: "work:close" })), "Close");
    assert.strictEqual(taskRowLabel(makeTask({ stepId: "work:run-of-record" })), "Run of record");
  });
});

suite("workExplorer: tokens", () => {
  test("tokenString wraps every token in separators on both sides", () => {
    assert.strictEqual(tokenString(["a", "b"]), ";a;b;");
  });

  test("hasToken never matches a token inside a longer kebab token", () => {
    const cv = tokenString(["act-open-spec"]);
    assert.ok(!hasToken(cv, "spec"));
    assert.ok(hasToken(cv, "act-open-spec"));
  });

  test("actionToken strips the command prefix and dots", () => {
    assert.strictEqual(
      actionToken({ id: "dabblerSessionSets.openSpec" }),
      "act-openSpec",
    );
    assert.strictEqual(
      actionToken({ id: "dabbler.consultWithAi" }),
      "act-consultWithAi",
    );
  });
});

suite("workExplorer: repository descriptor", () => {
  test("the fraction and the in-flight session read from the row itself", () => {
    const d = repositoryDescriptor(
      repositoryNodes([
        makeRepository({
          totalSessions: 20,
          sessionsCompleted: 14,
          currentSession: 15,
          sessions: [makeSession({ number: 15, status: "in-progress" })],
        }),
      ])[0],
    );
    assert.strictEqual(d.description, "14/20 · session 015 in flight");
    assert.ok(hasToken(d.contextValue, NODE_TOKEN.repository));
  });

  test("the repository row carries no lifecycle glyph of its own", () => {
    const [node] = repositoryNodes([makeRepository({ sessions: [makeSession()] })]);
    assert.strictEqual(repositoryDescriptor(node).icon, undefined);
  });

  test("a repository with no projected sessions is a leaf that says why", () => {
    const [node] = repositoryNodes([makeRepository({ sessions: [] })]);
    const d = repositoryDescriptor(node);
    assert.strictEqual(d.collapsible, "none");
    assert.ok(d.tooltip!.includes("router could not be run"));
  });

  test("the id is the root path, so two worktrees stay two rows", () => {
    const a = repositoryDescriptor(
      repositoryNodes([makeRepository({ root: "D:/ws" })])[0],
    );
    const b = repositoryDescriptor(
      repositoryNodes([makeRepository({ root: "D:/ws-wt" })])[0],
    );
    assert.notStrictEqual(a.id, b.id);
  });

  test("a never-run repository expands to its planned sessions and says so", () => {
    // Project setup is two sessions in a plan, and this is the whole
    // point of rendering them: the operator can see and start them
    // before the router has written anything here.
    const [node] = repositoryNodes([
      makeRepository({
        sessionsSource: "plan",
        totalSessions: 2,
        sessions: [
          makeSession({ number: 1, status: "not-started", iconKey: "not-started" }),
          makeSession({ number: 2, status: "not-started", iconKey: "not-started" }),
        ],
      }),
    ]);
    const d = repositoryDescriptor(node);
    assert.strictEqual(d.collapsible, "collapsed");
    assert.ok(d.tooltip!.includes("has not written a ledger here yet"));
    assert.strictEqual(sessionNodes(bucketNodes(node)[0]).length, 2);
  });

  test("tooltip surfaces the forced-close bypass and an invariant violation", () => {
    const tip = repositoryTooltip(
      makeRepository({ forceClosed: true, invariantViolation: "rule 7" }),
    );
    assert.ok(tip.includes("--force bypass"));
    assert.ok(tip.includes("rule 7"));
  });
});

suite("workExplorer: session descriptor", () => {
  const repository = makeRepository({
    sessions: [makeSession({ number: 1, status: "complete" })],
  });

  test("attention rows read above the sessions, and only when there is something", () => {
    // Sessions 38, 39 and 40 each added something worth seeing and each put
    // it somewhere different. This is the one place, and an empty one
    // renders nothing: a view that always has a row teaches people its rows
    // mean nothing.
    const quiet = makeRepository();
    assert.deepStrictEqual(attentionNodes({ kind: "repository", repository: quiet }), []);

    const waiting = makeRepository({
      currentSession: 3,
      possiblyStalled: true,
    });
    const rows = attentionNodes({ kind: "repository", repository: waiting });
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].subject, "stalled");
    // Never urgent: a quiet record is worth saying and is not an alarm.
    assert.strictEqual(rows[0].urgent, false);
  });

  test("the liveness row says working while the framework runs something, waiting between calls", () => {
    const inFlight = {
      currentSession: 3,
      lastActivityAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      sessions: [makeSession({ number: 3, status: "in-progress", inFlight: true })],
    };
    const working = attentionNodes({
      kind: "repository",
      repository: makeRepository({ ...inFlight, activity: "working" }),
    })[0];
    assert.ok(working.label.includes("working"));
    assert.ok(working.detail.includes("The framework is running something"));

    const waiting = attentionNodes({
      kind: "repository",
      repository: makeRepository({ ...inFlight, activity: "waiting" }),
    })[0];
    assert.ok(waiting.label.includes("waiting"));
    assert.ok(waiting.detail.includes("between calls"));
    // Still never a claim about the thinking, only about the record.
    assert.ok(waiting.detail.includes("the record moving, not the work"));
    assert.strictEqual(waiting.urgent, false);
  });

  test("the liveness row says a finished job is waiting to be collected, in the router's words", () => {
    // The state that read as "working" for three hours in session 91. The
    // detail is the router's wording, shared with `dabbler status` and the
    // terminal, and nothing of the Explorer's own.
    const words =
      "Session 003: the framework's job 'verification' finished at 2026-09-05T11:43:00.000Z " +
      "(exit 4) and its result has not been collected. Nothing is running, and collecting " +
      "it takes a moment. Next: whoever calls `dabbler session next`.";
    const row = attentionNodes({
      kind: "repository",
      repository: makeRepository({
        currentSession: 3,
        lastActivityAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        sessions: [makeSession({ number: 3, status: "in-progress", inFlight: true })],
        activity: "uncollected",
        uncollected: words,
      }),
    })[0];
    assert.ok(row.label.includes("finished, waiting to be collected"));
    assert.ok(!row.label.includes("working"));
    assert.ok(row.detail.startsWith(words));
    assert.strictEqual(row.urgent, false);
  });

  test("says how long since the record moved, whether or not it looks stalled", () => {
    // "What happened while I was away" is a question about a RUNNING
    // session, so answering it only once the session looks stuck leaves the
    // ordinary case blank.
    const running = makeRepository({
      currentSession: 3,
      possiblyStalled: false,
      lastActivityAt: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      sessions: [makeSession({ number: 3, status: "in-progress", inFlight: true })],
    });
    const rows = attentionNodes({ kind: "repository", repository: running });
    assert.strictEqual(rows.length, 1);
    assert.ok(rows[0].label.includes("003"));
    assert.ok(rows[0].detail.includes("45 minutes"));
  });

  test("does not hide a round-cap stop just because the session is still open", () => {
    // It is the case where the operator has to decide what happens next.
    const stopped = makeRepository({
      currentSession: 4,
      sessions: [
        makeSession({
          number: 4,
          status: "in-progress",
          inFlight: true,
          verification: makeVerification(),
        }),
      ],
    });
    const rows = attentionNodes({ kind: "repository", repository: stopped });
    const cap = rows.find((row) => row.subject === "unresolved");
    assert.ok(cap, "an in-flight session that stopped at the cap must be shown");
    assert.strictEqual(cap.urgent, true);
  });

  test("a planned session says so, since it shares the not-started glyph", () => {
    // The projection gives a plan-declared session `status: "planned"` and
    // `iconKey: "not-started"` deliberately: the two share a picture, so the
    // word on the row is the only thing that tells them apart.
    const d = sessionDescriptor({
      kind: "session",
      repository,
      session: makeSession({
        number: 9,
        status: "planned",
        iconKey: "not-started",
      }),
    });
    assert.strictEqual(d.description, "planned");
  });

  test("an in-flight row says who the session is waiting on, in the router's own sentence", () => {
    // "in flight" was true of a session being worked on and of the one that
    // waited six hours on nobody. The sentence is the router's: this row
    // shows it and derives nothing from the parts.
    const waits = (says: string, owner: "author" | "job" | "person") =>
      sessionDescriptor({
        kind: "session",
        repository,
        session: makeSession({
          status: "in-progress",
          iconKey: "in-progress",
          inFlight: true,
          waiting: {
            owner,
            for: "step 4",
            since: "2026-09-20T12:00:00Z",
            by: null,
            lastProgress: "2026-09-20T12:00:00Z",
            says,
          },
        }),
      }).description;
    assert.strictEqual(waits("Author owes step 4 — 2:13, no waiter listening", "author"), "Author owes step 4 — 2:13, no waiter listening");
    assert.strictEqual(waits("Verification — 3:42 of 10:00", "job"), "Verification — 3:42 of 10:00");
    assert.strictEqual(waits("You: the reviewer is unreachable.", "person"), "You: the reviewer is unreachable.");
  });

  test("the label leads with the zero-padded number", () => {
    const d = sessionDescriptor({
      kind: "session",
      repository,
      session: makeSession({ number: 7, title: "The sessions view" }),
    });
    assert.ok(d.label.startsWith("007 "), d.label);
    assert.ok(d.label.includes("The sessions view"));
  });

  test("the in-flight row says so; a finished row carries its close date; a queued row is quiet", () => {
    const inFlight = sessionDescriptor({
      kind: "session",
      repository,
      session: makeSession({ status: "in-progress", iconKey: "in-progress" }),
    });
    const closed = new Date(2026, 7, 30, 20, 19, 5);
    const done = sessionDescriptor({
      kind: "session",
      repository,
      session: makeSession({ completedAt: closed.toISOString() }),
    });
    const queued = sessionDescriptor({
      kind: "session",
      repository,
      session: makeSession({ status: "not-started", iconKey: "not-started" }),
    });
    assert.strictEqual(inFlight.description, "in flight");
    // The local calendar date only; the full timestamp is the tooltip's.
    assert.strictEqual(done.description, "2026-08-30");
    assert.strictEqual(queued.description, undefined);
  });

  test("a closed session that went past a stop carries a mark with the count", () => {
    const closed = new Date(2026, 10, 11, 9, 0, 0).toISOString();
    const waiver = { kind: "tests", stepId: null, unmet: "the suite failed", by: "the operator", reason: "flaky", at: closed };
    const one = sessionDescriptor({ kind: "session", repository, session: makeSession({ completedAt: closed, exceptions: [waiver] }) });
    const two = sessionDescriptor({ kind: "session", repository, session: makeSession({ completedAt: closed, exceptions: [waiver, waiver] }) });
    const none = sessionDescriptor({ kind: "session", repository, session: makeSession({ completedAt: closed }) });
    assert.strictEqual(one.description, "2026-11-11 · 1 exception");
    assert.strictEqual(two.description, "2026-11-11 · 2 exceptions");
    assert.strictEqual(none.description, "2026-11-11");
  });

  test("a session waiting for funds says whose, and a handed-back stop shows the Mechanic's memo", () => {
    const waitingOn = (forWhat: string) => ({
      owner: "person" as const,
      for: forWhat,
      since: "2026-10-21T10:00:00Z",
      by: null,
      lastProgress: "2026-10-21T10:00:00Z",
      says: "waiting on you",
    });
    const funds = sessionDescriptor({
      kind: "session",
      repository: makeRepository({ currentSession: 1 }),
      session: makeSession({ status: "in-progress", waiting: waitingOn("waiting for funds: openai.") }),
    });
    assert.strictEqual(funds.description, "Waiting for funds: openai");
    const handedBack = sessionDescriptor({
      kind: "session",
      repository: makeRepository({ currentSession: 1, mechanicMemo: "The lockfile is stale; regenerate it." }),
      session: makeSession({ status: "in-progress", waiting: waitingOn("The tests failed.") }),
    });
    assert.ok(handedBack.tooltip?.includes("The Mechanic's memo"), handedBack.tooltip);
    assert.ok(handedBack.tooltip?.includes("The lockfile is stale"), handedBack.tooltip);
  });

  test("a session with tasks is collapsible; without, a leaf", () => {
    const withSteps = sessionDescriptor({
      kind: "session",
      repository,
      session: makeSession({ status: "in-progress", tasks: [makeTask()] }),
    });
    const leaf = sessionDescriptor({
      kind: "session",
      repository,
      session: makeSession(),
    });
    assert.strictEqual(withSteps.collapsible, "collapsed");
    assert.strictEqual(leaf.collapsible, "none");
  });

  test("the icon comes from the projection's glyph key", () => {
    const d = sessionDescriptor({
      kind: "session",
      repository,
      session: makeSession({ iconKey: "cancelled" }),
    });
    assert.deepStrictEqual(d.icon, { kind: "file", slug: "cancelled.svg" });
  });

  test("applicable session actions mint contextValue tokens", () => {
    const session = makeSession({ number: 1, status: "not-started" });
    const repo = makeRepository({ sessions: [session] });
    const d = sessionDescriptor({ kind: "session", repository: repo, session });
    for (const action of SESSION_ACTIONS.filter((a) => a.when(repo, session))) {
      assert.ok(hasToken(d.contextValue, actionToken(action)), action.id);
    }
  });

  test("a cancelled session offers restore but not cancel", () => {
    const session = makeSession({ number: 1, status: "cancelled" });
    const repo = makeRepository({ sessions: [session] });
    const d = sessionDescriptor({ kind: "session", repository: repo, session });
    assert.ok(hasToken(d.contextValue, "act-restore"));
    assert.ok(!hasToken(d.contextValue, "act-cancel"));
  });

  test("the in-flight and completed rows carry the rollback token and a planned row does not", () => {
    const done = makeSession({ number: 1, status: "complete" });
    const inFlight = makeSession({ number: 2, status: "in-progress" });
    const planned = makeSession({ number: 3, status: "not-started" });
    const repo = makeRepository({ currentSession: 2, nextSession: 3, sessions: [done, inFlight, planned] });
    assert.ok(hasToken(sessionDescriptor({ kind: "session", repository: repo, session: done }).contextValue, "act-rollback"));
    assert.ok(hasToken(sessionDescriptor({ kind: "session", repository: repo, session: inFlight }).contextValue, "act-rollback"));
    assert.ok(!hasToken(sessionDescriptor({ kind: "session", repository: repo, session: planned }).contextValue, "act-rollback"));
  });

  test("an untitled session falls back to its number", () => {
    const d = sessionDescriptor({
      kind: "session",
      repository,
      session: makeSession({ number: 4, title: "" }),
    });
    assert.strictEqual(d.label, "004 · Session 4");
  });

  test("tooltip flags an unrecognized verdict instead of laundering it", () => {
    const d = sessionDescriptor({
      kind: "session",
      repository,
      session: makeSession({ verificationVerdict: "sounds-fine" }),
    });
    assert.ok(d.tooltip!.includes("not a recognized verdict"));
  });

  test("tooltip shows what a verified session's reviewer noted beside the verdict", () => {
    const d = sessionDescriptor({
      kind: "session",
      repository,
      session: makeSession({
        verificationVerdict: "VERIFIED",
        verification: makeVerification({ terminal: "VERIFIED", clean: true, minor: 1, nits: 2 }),
      }),
    });
    assert.ok(d.tooltip!.includes("Verification: VERIFIED (1 minor, 2 nits)"), d.tooltip);
  });

  test("a session that closed having changed nothing says no change, and is neither severe nor unverified", () => {
    const session = makeSession({
      status: "complete",
      iconKey: "complete",
      verificationVerdict: null,
      noChange: true,
    });
    const d = sessionDescriptor({ kind: "session", repository, session });
    assert.ok(d.tooltip!.includes("Verification: no change"), d.tooltip);
    assert.strictEqual(severityOf(session), null);
    assert.ok(!hasToken(d.contextValue ?? "", "severity-verification"), d.contextValue);
  });
});

suite("workExplorer: severity", () => {
  test("an unrecognized verdict is severe, never clean", () => {
    assert.strictEqual(
      severityOf(makeSession({ verificationVerdict: "manual-override-development" })),
      "verification",
    );
  });

  test("a VERIFIED verdict carries no severity", () => {
    assert.strictEqual(
      severityOf(makeSession({ verificationVerdict: "VERIFIED" })),
      null,
    );
  });

  test("the icon follows lifecycle status, never severity", () => {
    const session = makeSession({
      status: "complete",
      iconKey: "complete",
      verificationVerdict: "ISSUES_FOUND",
    });
    const d = sessionDescriptor({
      kind: "session",
      repository: makeRepository({ sessions: [session] }),
      session,
    });
    assert.deepStrictEqual(d.icon, { kind: "file", slug: "done.svg" });
    assert.ok(hasToken(d.contextValue, "severity-verification"));
  });
});
suite("workExplorer: task rows", () => {
  const repository = makeRepository();

  test("the six lifecycle rows read in the operator's words, and the ids do not move", () => {
    // csv-model feedback item 16. The step ids are what the plan, the
    // execution record, the CLI and every gate address a phase by, so the
    // vocabulary change is a label change and nothing else.
    const labelFor = (stepId: string) => taskRowLabel(makeTask({ stepId }));
    assert.strictEqual(labelFor("register"), "Register");
    assert.strictEqual(labelFor("work"), "Work");
    assert.strictEqual(labelFor("verify"), "Verify");
    assert.strictEqual(labelFor("close"), "Close");
    // The two that say something the humanized id did not. The declare row
    // is what a developer looks for as the plan, and is called that; the
    // more exact "Plan declared" confused the readers it was exact for.
    assert.strictEqual(labelFor("declare"), "Plan");
    // "Run of record" is what the evidence is called; what the row waits
    // for is the suite.
    assert.strictEqual(labelFor("run-of-record"), "Test");
  });

  test("taskRowLabel prefers the step id, then truncated intent, then position", () => {
    // A row whose id is not one of the six still renders, humanized: the
    // map is a vocabulary over the lifecycle rows, not a gate on which
    // rows may exist.
    assert.strictEqual(taskRowLabel(makeTask({ stepId: "close-out" })), "Close out");
    const longIntent = "d".repeat(80);
    const noId = makeTask({ stepId: null, intent: longIntent });
    assert.strictEqual(taskRowLabel(noId).length, 58);
    const bare = makeTask({ stepId: null, intent: "", position: 2 });
    assert.strictEqual(taskRowLabel(bare), "Step 3");
  });

  test("stepStartLabel renders HH:MM- and nothing for unparseable input", () => {
    assert.match(stepStartLabel("2026-08-17T09:06:00-04:00"), /^\d{2}:\d{2}-$/);
    assert.strictEqual(stepStartLabel("not-a-date"), "");
    assert.strictEqual(stepStartLabel(null), "");
  });

  test("the open task renders the projection's state and glyph, unmodified", () => {
    const d = taskDescriptor({
      kind: "task",
      repository,
      session: makeSession(),
      row: makeTask({ isOpen: true, state: "in flight", iconKey: "in-progress" }),
    });
    assert.ok(d.tooltip!.includes("in flight"));
    assert.ok(hasToken(d.contextValue, "task-open"));
    assert.deepStrictEqual(d.icon, { kind: "file", slug: "in-progress.svg" });
  });

  test("task ids disambiguate by step id, which is what a row is addressed by", () => {
    // It was the plan position, and the position moves: session 92 inserts
    // the Work row's steps into the flat list and renumbers what follows.
    // Two rows of one session never share a step id — the six lifecycle ids
    // are fixed and a plan refuses a duplicate step id — so this is the
    // identity that both disambiguates and holds still.
    const idFor = (row: ReturnType<typeof makeTask>) =>
      taskDescriptor({ kind: "task", repository, session: makeSession(), row }).id;
    assert.notStrictEqual(
      idFor(makeTask({ position: 0, stepId: "work" })),
      idFor(makeTask({ position: 1, stepId: "verify" })),
    );
    // The position is the identity only where there is no other one.
    assert.notStrictEqual(
      idFor(makeTask({ position: 0, stepId: null })),
      idFor(makeTask({ position: 1, stepId: null })),
    );
  });

  test("a started task shows its opening time in the description slot", () => {
    const d = taskDescriptor({
      kind: "task",
      repository,
      session: makeSession(),
      row: makeTask({ startedAt: "2026-08-17T09:06:00-04:00" }),
    });
    assert.match(d.description ?? "", /^\d{2}:\d{2}-$/);
  });

  test("the refusal row names the fault and shows no task state", () => {
    const d = refusalDescriptor({
      kind: "refusal",
      repository,
      session: makeSession({ status: "in-progress" }),
      subject: "execution record",
      reason: "execution record: row 2 failed schema validation at event",
    });
    assert.strictEqual(d.label, "Execution record unreadable");
    assert.ok(d.tooltip!.includes("row 2 failed schema validation"));
    assert.deepStrictEqual(d.icon, { kind: "file", slug: "cancelled.svg" });
    assert.ok(hasToken(d.contextValue, NODE_TOKEN.refusal));
  });

  test("an unreadable record is a session severity of its own", () => {
    const clean = makeSession({ status: "in-progress" });
    assert.strictEqual(severityOf(clean), null);
    const refused = makeSession({
      status: "in-progress",
      tasksRefused: "execution record: unreadable",
    });
    assert.strictEqual(severityOf(refused), "record");
    const d = sessionDescriptor({ kind: "session", repository, session: refused });
    assert.ok(hasToken(d.contextValue, "severity-record"));
    assert.strictEqual(d.collapsible, "collapsed");
  });
});

suite("workExplorer: the unresolved-session view", () => {
  const repository = makeRepository();
  const sessionNode = (session: ReturnType<typeof makeSession>) =>
    ({ kind: "session", repository, session }) as const;

  test("`Execution record unreadable` is reserved for damage, not for a record this build did not write", () => {
    // The router's readers stopped refusing a driver record over a member
    // they have never heard of, so a session driven by a newer build than
    // the installed extension arrives here as ordinary rows. What that has
    // to look like from this side is nothing at all: no refusal child, no
    // record severity, the stop reading as the stop it is. Damage still
    // arrives as a refusal, and that is the whole distinction.
    const newer = makeSession({
      status: "in-progress",
      tasks: [makeTask({ state: "blocked", intent: "Driver stopped (blocked): it is load-bearing" })],
    });
    assert.strictEqual(severityOf(newer), null);
    const children = childrenOf(sessionNode(newer));
    assert.deepStrictEqual(children.map((n) => n.kind), ["task"]);
    assert.ok(
      (descriptorFor(children[0]).tooltip ?? "").includes("Driver stopped (blocked)"),
    );

    const damaged = makeSession({
      status: "in-progress",
      tasksRefused: "execution record: row 2 is not valid JSON",
    });
    assert.strictEqual(severityOf(damaged), "record");
    assert.strictEqual(
      descriptorFor(childrenOf(sessionNode(damaged))[0]).label,
      "Execution record unreadable",
    );
  });

  test("a session that stopped at the cap reads first, then its tasks; a verified one has nothing to read", () => {
    const stopped = makeSession({
      status: "in-progress",
      verification: makeVerification(),
      tasks: [makeTask()],
    });
    assert.deepStrictEqual(
      childrenOf(sessionNode(stopped)).map((n) => n.kind),
      ["verification", "task"],
    );
    // A closed session carries the row too: it is read at planning time,
    // long after it stopped being the one in flight.
    const landed = makeSession({
      status: "complete",
      verification: makeVerification({ terminal: "REMEDIATED_AT_CAP" }),
    });
    assert.strictEqual(sessionDescriptor(sessionNode(landed)).collapsible, "collapsed");
    // Python said clean; the tree asks nothing further.
    const verified = makeSession({
      status: "complete",
      verification: makeVerification({ terminal: "VERIFIED", headline: "verified", clean: true }),
    });
    assert.deepStrictEqual(childrenOf(sessionNode(verified)), []);
    assert.strictEqual(sessionDescriptor(sessionNode(verified)).collapsible, "none");
  });

  test("the verification row repeats Python's headline and mints terminal and agency tokens", () => {
    const none = verificationDescriptor({
      kind: "verification",
      repository,
      session: makeSession(),
      view: makeVerification(),
    });
    assert.strictEqual(none.label, "Unresolved at the cap");
    assert.ok(none.description!.includes("round 3 of 3"), none.description);
    assert.ok(none.description!.includes("gpt-5-6-sol/openai"), none.description);
    assert.ok(hasToken(none.contextValue, "terminal-issues_found"));
    assert.ok(hasToken(none.contextValue, "agency-none"));
    assert.ok(!hasToken(none.contextValue, "transformed-reads"));
    assert.ok(none.tooltip!.includes("could not look at the tree"));
    assert.ok(none.tooltip!.includes("no approval to give"));

    const transformed = verificationDescriptor({
      kind: "verification",
      repository,
      session: makeSession(),
      view: makeVerification({
        agency: {
          ...makeVerification().agency,
          mode: "tools",
          reads: 4,
          transformedReads: 1,
          operations: [
            { kind: "read", target: "ai_router/checks.py", fidelity: "transformed", inScope: true },
            { kind: "search", target: "spawn", fidelity: "verbatim", inScope: true },
            { kind: "read", target: "README.md", fidelity: "verbatim", inScope: false },
          ],
        },
      }),
    });
    assert.ok(hasToken(transformed.contextValue, "agency-tools"));
    assert.ok(hasToken(transformed.contextValue, "transformed-reads"));
    assert.ok(transformed.tooltip!.includes("1 read(s) were transformed"));
    // The targets themselves, not only the counts: which file a Major
    // came from is what the operator weighs it against.
    assert.ok(transformed.tooltip!.includes("- read ai_router/checks.py (transformed)"));
    assert.ok(transformed.tooltip!.includes("- search spawn\n"));
    assert.ok(transformed.tooltip!.includes("- read README.md (out of scope)"));
  });

  test("a stopping round past a since-lowered cap is not squeezed into 'round 6 of 3'", () => {
    const d = verificationDescriptor({
      kind: "verification",
      repository,
      session: makeSession(),
      view: makeVerification({ stoppedAtRound: 6, rounds: 6, cap: 3 }),
    });
    assert.ok(d.description!.includes("round 6 (cap now 3)"), d.description);
  });

  test("a remediated-at-the-cap row names the fix and calls it unreviewed, never a waiver", () => {
    const d = verificationDescriptor({
      kind: "verification",
      repository,
      session: makeSession(),
      view: makeVerification({
        terminal: "REMEDIATED_AT_CAP",
        headline: "remediated at the cap",
        findings: [makeFinding({ disposition: "fixed, unreviewed" })],
        fixPaths: ["ai_router/affected.py", "tests/test_affected.py"],
      }),
    });
    assert.strictEqual(d.label, "Remediated at the cap");
    assert.ok(hasToken(d.contextValue, "terminal-remediated_at_cap"));
    assert.ok(d.tooltip!.includes("Not a waiver"));
    assert.ok(d.tooltip!.includes("1 fixed, unreviewed"));
    assert.ok(d.tooltip!.includes("Fix touched: ai_router/affected.py, tests/test_affected.py"));
  });

  test("finding rows carry the severity, the disposition, the scenario and the cited paths", () => {
    const cited = findingDescriptor({
      kind: "finding",
      repository,
      session: makeSession({ number: 3 }),
      finding: makeFinding(),
      index: 0,
    });
    assert.ok(cited.label.startsWith("[major] "), cited.label);
    assert.strictEqual(cited.description, "outstanding");
    assert.ok(cited.tooltip!.includes("A Java repository gets"));
    assert.ok(cited.tooltip!.includes("Cited: ai_router/affected.py"));
    assert.ok(hasToken(cited.contextValue, "finding-blocking"));

    const uncited = findingDescriptor({
      kind: "finding",
      repository,
      session: makeSession({ number: 3 }),
      finding: makeFinding({ evidencePaths: [], severity: "minor", blocking: false, disposition: "noted" }),
      index: 1,
    });
    assert.ok(uncited.tooltip!.includes("No path cited"));
    assert.ok(!hasToken(uncited.contextValue, "finding-blocking"));
    assert.notStrictEqual(cited.id, uncited.id);
  });

  test("an unreadable rounds ledger is a refusal row and a record severity, never the last round that parsed", () => {
    const session = makeSession({
      status: "complete",
      verification: makeVerification(),
      verificationRefused: "rounds ledger: line 4 is not valid JSON",
    });
    const children = childrenOf(sessionNode(session));
    assert.deepStrictEqual(children.map((n) => n.kind), ["refusal"]);
    const d = descriptorFor(children[0]);
    assert.strictEqual(d.label, "Rounds ledger unreadable");
    assert.ok(d.tooltip!.includes("line 4 is not valid JSON"));
    assert.strictEqual(severityOf(session), "record");
    // Two refusals on one session are two rows, not one id.
    const tasksRefusal = descriptorFor(
      childrenOf(sessionNode(makeSession({ status: "in-progress", tasksRefused: "x" })))[0],
    );
    assert.notStrictEqual(d.id, tasksRefusal.id);
  });
});

suite("workExplorer: descriptorFor dispatch", () => {
  test("every node kind resolves to a descriptor with a stable id", () => {
    const session = makeSession({ status: "in-progress", tasks: [makeTask()] });
    const [repositoryNode] = repositoryNodes([
      makeRepository({ sessions: [session] }),
    ]);
    const sessionNode = childrenOf(repositoryNode)[0];
    const taskNode = childrenOf(sessionNode)[0];
    const refusalNode = childrenOf(
      childrenOf(
        repositoryNodes([
          makeRepository({
            sessions: [
              makeSession({ status: "in-progress", tasksRefused: "unreadable" }),
            ],
          }),
        ])[0],
      )[0],
    )[0];
    for (const node of [repositoryNode, sessionNode, taskNode, refusalNode]) {
      const d = descriptorFor(node);
      assert.ok(d.id.length > 0, node.kind);
      assert.ok(d.contextValue.startsWith(";"), node.kind);
    }
  });
});

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

suite("workExplorer: repository actions", () => {
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

suite("workExplorer: session actions", () => {
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

  test("Stop Session is offered on the session in flight and on no other row", () => {
    // The person asking for the machine back. It is `session interrupt
    // --stop`, which names the session the record says is in flight -- so
    // an entry on any other row would stop a session the operator did not
    // click on.
    const sessions = [
      makeSession({ number: 1, status: "complete" }),
      makeSession({ number: 2, status: "in-progress" }),
      makeSession({ number: 3, status: "not-started" }),
    ];
    const running = makeRepository({ currentSession: 2, nextSession: 3, sessions });
    const offered = (session: ReturnType<typeof makeSession>) =>
      applicableSessionActions(running, session).map((a) => a.id);
    assert.ok(offered(sessions[1]).includes("dabblerSessionSets.stopSession"));
    assert.ok(!offered(sessions[0]).includes("dabblerSessionSets.stopSession"));
    assert.ok(!offered(sessions[2]).includes("dabblerSessionSets.stopSession"));
    // And nowhere at all once nothing is in flight.
    const idle = makeRepository({ currentSession: null, nextSession: 3, sessions });
    assert.ok(!applicableSessionActions(idle, sessions[1]).map((a) => a.id).includes("dabblerSessionSets.stopSession"));
  });

  test("Continue Session is offered only on a session waiting for funds", () => {
    const waiting = (forWhat: string) =>
      makeSession({
        number: 2,
        status: "in-progress",
        waiting: { owner: "person", for: forWhat, since: "", by: null, lastProgress: "", says: "" },
      });
    const offered = (session: ReturnType<typeof makeSession>) =>
      applicableSessionActions(makeRepository({ currentSession: 2, sessions: [session] }), session).map((a) => a.id);
    assert.ok(offered(waiting("waiting for funds: anthropic.")).includes("dabblerSessionSets.continueSession"));
    assert.ok(!offered(waiting("The tests failed.")).includes("dabblerSessionSets.continueSession"));
  });

  test("Open a Mechanic is offered on the session in flight, and on no other row", () => {
    const sessions = [
      makeSession({ number: 1, status: "complete" }),
      makeSession({ number: 2, status: "in-progress" }),
    ];
    const running = makeRepository({ currentSession: 2, sessions });
    const offered = (session: ReturnType<typeof makeSession>) =>
      applicableSessionActions(running, session).map((a) => a.id);
    assert.ok(offered(sessions[1]).includes("dabbler.openMechanic"));
    assert.ok(!offered(sessions[0]).includes("dabbler.openMechanic"));
  });

  test("Check this stop, Review exception and Report this stop are offered on the session in flight while a stop stands, and nowhere else", () => {
    const stopped = makeSession({ number: 2, status: "in-progress", stopActor: "operator" });
    const working = makeSession({ number: 2, status: "in-progress" });
    const done = makeSession({ number: 1, status: "complete", stopActor: "operator" });
    const offered = (session: ReturnType<typeof makeSession>) =>
      applicableSessionActions(makeRepository({ currentSession: 2, sessions: [done, session] }), session).map((a) => a.id);
    for (const id of ["dabbler.checkStop", "dabbler.reviewException", "dabbler.reportStop"]) {
      assert.ok(offered(stopped).includes(id), id);
      assert.ok(!offered(working).includes(id), id);
      assert.ok(!offered(done).includes(id), id);
    }
  });

  test("Open Transcript at its Exceptions is offered on a closed session that went past a stop, and on no other row", () => {
    const waiver = { kind: "tests", stepId: null, unmet: "the suite failed", by: "the operator", reason: "flaky", at: "" };
    const waived = makeSession({ number: 1, status: "complete", exceptions: [waiver] });
    const clean = makeSession({ number: 2, status: "complete" });
    const inFlight = makeSession({ number: 3, status: "in-progress", exceptions: [waiver] });
    const repository = makeRepository({ currentSession: 3, sessions: [waived, clean, inFlight] });
    const offered = (session: ReturnType<typeof makeSession>) => applicableSessionActions(repository, session).map((a) => a.id);
    assert.ok(offered(waived).includes("dabbler.openTranscript"));
    assert.ok(!offered(clean).includes("dabbler.openTranscript"));
    assert.ok(!offered(inFlight).includes("dabbler.openTranscript"));
  });

  test("Rollback to Start of This Session is offered on a session in flight or completed, and on no other row", () => {
    // The router rolls back to the start of a session that ran -- in flight
    // or completed -- and refuses a cancelled one (restore's) and one that
    // has not started; the item follows the router row for row.
    const sessions = [
      makeSession({ number: 1, status: "complete" }),
      makeSession({ number: 2, status: "in-progress" }),
      makeSession({ number: 3, status: "not-started" }),
      makeSession({ number: 4, status: "cancelled" }),
    ];
    const running = makeRepository({ currentSession: 2, nextSession: 3, sessions });
    const offered = (session: ReturnType<typeof makeSession>) =>
      applicableSessionActions(running, session).map((a) => a.id);
    assert.ok(offered(sessions[0]).includes("dabblerSessionSets.rollback"));
    assert.ok(offered(sessions[1]).includes("dabblerSessionSets.rollback"));
    assert.ok(!offered(sessions[2]).includes("dabblerSessionSets.rollback"));
    assert.ok(!offered(sessions[3]).includes("dabblerSessionSets.rollback"));
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

  test("a session in flight offers Stop and Cancel and no Resume, whoever its stop is for", () => {
    // Nothing waits for the AI, so there is no loop for a button to start
    // again: carrying on is said to the AI, in its chat.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "no-resume-"));
    const offered = (stopActor?: "engine" | "operator" | "either") =>
      applicableSessionActions(
        makeRepository({
          root,
          currentSession: 2,
          sessions: [makeSession({ number: 2, status: "in-progress", ...(stopActor ? { stopActor } : {}) })],
        }),
        makeSession({ number: 2, status: "in-progress", ...(stopActor ? { stopActor } : {}) }),
      ).map((a) => a.id);

    for (const actor of ["engine", "operator", "either", undefined] as const) {
      assert.ok(!offered(actor).some((id) => /resume/i.test(id)), String(actor));
      assert.ok(offered(actor).includes("dabblerSessionSets.stopSession"), String(actor));
    }
    // And nothing else moves: cancelling a session is the person's verb
    // whatever the loop is doing.
    assert.ok(offered("engine").includes("dabblerSessionSets.cancel"));
    fs.rmSync(root, { recursive: true, force: true });
  });
});

suite("workExplorer: the operator's status icons", () => {
  test("the four authored filenames resolve by status, unchanged", () => {
    assert.deepStrictEqual(ICON_FILES, {
      complete: "done.svg",
      "in-progress": "in-progress.svg",
      "not-started": "not-started.svg",
      cancelled: "cancelled.svg",
    });
  });

});

suite("workExplorer: session naming", () => {
  test("the written number is the projection's, never re-derived here", () => {
    // Python owns the padding rule. A payload that carries no name
    // degrades to the plain number rather than growing a second copy of
    // the rule that could disagree with the first.
    assert.strictEqual(
      sessionDisplayNumber(makeSession({ number: 15, displayNumber: "015" })),
      "015",
    );
    assert.strictEqual(
      sessionDisplayNumber(makeSession({ number: 15, displayNumber: "" })),
      "15",
    );
  });

  test("the row label is the written number then the session's own title", () => {
    assert.strictEqual(
      sessionRowLabel(makeSession({ number: 15, title: "The sessions view" })),
      "015 · The sessions view",
    );
  });

  test("sessions come back in ledger order whatever order they arrive in", () => {
    const ordered = sessionsInOrder([
      makeSession({ number: 3 }),
      makeSession({ number: 1 }),
      makeSession({ number: 2 }),
    ]);
    assert.deepStrictEqual(ordered.map((s) => s.number), [1, 2, 3]);
  });
});

suite("workExplorer: progress text", () => {
  test("the fraction is always X/total, with the in-flight session named", () => {
    assert.strictEqual(
      progressText(
        makeRepository({
          totalSessions: 20,
          sessionsCompleted: 14,
          currentSession: 15,
          sessions: [makeSession({ number: 15, status: "in-progress" })],
        }),
      ),
      "14/20 · session 015 in flight",
    );
    assert.strictEqual(
      progressText(makeRepository({ totalSessions: 20, sessionsCompleted: 20 })),
      "20/20",
    );
  });

  test("an unknown total still reports what completed", () => {
    assert.strictEqual(
      progressText(makeRepository({ totalSessions: null, sessionsCompleted: 3 })),
      "3 complete",
    );
    assert.strictEqual(progressText(makeRepository()), "");
  });

  test("a repository whose sessions came from its plan says nothing has run", () => {
    // "0/2" would be true of a repository mid-sequence too. What the
    // operator needs from a freshly bootstrapped one is that the router
    // has never written here at all.
    const text = progressText(
      makeRepository({
        sessionsSource: "plan",
        totalSessions: 2,
        sessions: [
          makeSession({ number: 1, status: "not-started" }),
          makeSession({ number: 2, status: "not-started" }),
        ],
      }),
    );
    assert.strictEqual(text, "2 planned · nothing has run here yet");
  });
});

suite("workExplorer: verdict cleanliness", () => {
  test("an unrecognized verdict is unclean; a missing one is not a verdict", () => {
    assert.ok(verdictIsUnclean("manual-override-development"));
    assert.ok(!verdictIsUnclean(null));
    assert.ok(!verdictIsUnclean(""));
  });

  test("remediated-at-the-cap never reads as a pass", () => {
    // The work landed; no verifier reviewed the repair. A row that read
    // as clean would hide exactly that.
    assert.ok(verdictIsUnclean("REMEDIATED_AT_CAP"));
    assert.ok(verdictIsUnclean("ISSUES_FOUND"));
    assert.ok(!verdictIsUnclean("VERIFIED"));
  });
});

suite("workExplorer: an action is the verb a person would type", () => {
  const atCap = makeSession({
    number: 7,
    title: "Stuck",
    status: "in-progress",
    iconKey: "in-progress",
    inFlight: true,
    verification: makeVerification({ terminal: "ISSUES_FOUND" }),
  });
  const repository = makeRepository({ currentSession: 7, sessions: [atCap] });
  const cancelOf = (session: SessionRecord) =>
    offeredSessionActions(makeRepository({ currentSession: session.number, sessions: [session] }), session).find(
      (action) => action.id === "dabblerSessionSets.cancel",
    );

  test("Cancel carries --force exactly when the session cannot close", () => {
    const forced = cancelOf(atCap);
    assert.deepStrictEqual(forced?.argv, [
      "dabbler", "session", "cancel", "--sessions-dir", repository.sessionsDir, "--session-number", "7", "--force",
    ]);
    const live = cancelOf(makeSession({ number: 7, status: "in-progress", inFlight: true }));
    assert.ok(live?.argv !== null && live?.argv !== undefined && !live.argv.includes("--force"));
    const closed = cancelOf(makeSession({ number: 7, status: "complete", verification: makeVerification({ terminal: "ISSUES_FOUND" }) }));
    assert.ok(closed?.argv !== null && closed?.argv !== undefined && !closed.argv.includes("--force"));
  });

  test("every offered action runs a command or opens a file, never neither and never both", () => {
    const stopped = makeSession({
      ...atCap,
      stopActor: "operator",
      waiting: {
        owner: "person",
        for: "waiting for funds: openai. Pay the account, then carry on.",
        since: "2026-11-17T10:00:00-05:00",
        by: null,
        lastProgress: "2026-11-17T10:00:00-05:00",
        says: "waiting for funds",
      },
    });
    const past = makeSession({ number: 3, status: "complete", exceptions: [{ at: "close" }] as SessionRecord["exceptions"] });
    const cancelled = makeSession({ number: 4, status: "cancelled" });
    const planned = makeSession({ number: 8, status: "not-started" });
    const live = makeRepository({ currentSession: 7, sessions: [past, cancelled, stopped] });
    const idle = makeRepository({ currentSession: null, nextSession: 8, sessions: [past, planned] });
    const offered = [
      ...offeredRepositoryActions(live),
      ...offeredRepositoryActions(idle),
      ...live.sessions.flatMap((session) => offeredSessionActions(live, session)),
      ...idle.sessions.flatMap((session) => offeredSessionActions(idle, session)),
    ];
    const ids = new Set(offered.map((action) => action.id));
    // Every action either list declares is reached by these rows.
    for (const action of [...REPOSITORY_ACTIONS, ...SESSION_ACTIONS]) assert.ok(ids.has(action.id), action.id);
    for (const action of offered) {
      assert.ok((action.argv === null) !== (action.opens === null), action.id);
      if (action.argv !== null) assert.strictEqual(action.argv[0], "dabbler", action.id);
      if (action.preview !== null) assert.strictEqual(action.preview[0], "dabbler", action.id);
    }
    const transcript = offered.find((action) => action.id === "dabbler.openTranscript");
    assert.deepStrictEqual(transcript?.opens, {
      file: path.join(live.root, "docs", "transcripts", "session-003.html"),
      line: null,
      fragment: "exceptions",
    });
  });

  test("a confirmation's words are the ones the extension shows", () => {
    const forced = cancelOf(atCap);
    assert.deepStrictEqual(forced?.confirm, {
      title: 'Cancel session 7 "007 · Stuck"?',
      detail:
        "This session is unresolved at the cap and cannot close, so it is cancelled in flight. Nothing it built " +
        "lands; its record stays. The reason is recorded on the session, which can be restored later.",
      accept: "Cancel Session",
      keep: "Keep",
    });
    assert.deepStrictEqual(forced?.reason, {
      prompt: 'Reason for cancelling "007 · Stuck" (optional)',
      placeholder: "e.g. scope rolled into another session",
      blank: "",
    });
    const stop = offeredSessionActions(repository, atCap).find((action) => action.id === "dabblerSessionSets.stopSession");
    assert.strictEqual(stop?.reason?.prompt, "Why stop session 007? The reason is recorded on the stop.");
    assert.strictEqual(stop?.confirm, null);
  });
});

suite("workExplorer: dabbler view work-explorer", () => {
  async function printed(argv: string[]): Promise<{ code: number; out: string }> {
    const out: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      return { code: await viewVerb(argv), out: out.join("") };
    } finally {
      process.stdout.write = write;
    }
  }

  test("the JSON it prints for a fixture repository validates and offers the model's actions", async () => {
    // A repository set up and never run: its two sessions are its plan's,
    // and the first is the one `session start` would register.
    const root = makeTempDir("dabbler-view-");
    const empty = makeTempDir("dabbler-view-empty-");
    try {
      const sessionsDir = path.join(root, "docs", "sessions");
      fs.mkdirSync(sessionsDir, { recursive: true });
      fs.writeFileSync(
        path.join(sessionsDir, "session-plan.md"),
        "# Plan\n\n### Session 1 of 2: Set up\n\nDo it.\n\n### Session 2 of 2: Build\n\nThen this.\n",
        "utf8",
      );
      const { code, out } = await printed(["work-explorer", "--repo-root", root, "--repo-root", empty]);
      assert.strictEqual(code, 0);
      const tree = JSON.parse(out) as WorkExplorer;
      assert.strictEqual(schemaFailure(tree, loadSchemaFile("work-explorer.schema.json"), "the tree"), null);

      // A folder with no sessions root shows nothing.
      assert.deepStrictEqual(tree.repositories.map((row) => row.label), [path.basename(root)]);
      const repository = tree.repositories[0];
      assert.ok(repository.actions.some((action) => action.id === "dabblerSessionSets.startSession"));
      const sessions = repository.children.flatMap((bucket) => bucket.children).filter((row) => row.kind === "session");
      assert.strictEqual(sessions.length, 2);
      const [first, second] = sessions;
      // Start Session is offered on the row that would be registered, and only there.
      const start = first.actions.find((action) => action.id === "dabblerSessionSets.startSession");
      assert.deepStrictEqual(start?.argv, ["dabbler", "session", "start", "--sessions-dir", sessionsDir]);
      assert.ok(!second.actions.some((action) => action.id === "dabblerSessionSets.startSession"));
      // Each row offers what the model offers, its tokens minted from the same list.
      for (const row of sessions) {
        for (const action of row.actions) assert.ok(hasToken(row.contextValue, actionToken(action)), action.id);
      }
      // A click opens the plan at the session's own heading.
      assert.deepStrictEqual(first.click?.opens, { file: path.join(sessionsDir, "session-plan.md"), line: 3, fragment: null });
      assert.deepStrictEqual(second.click?.opens?.line, 7);
    } finally {
      rmrf(root);
      rmrf(empty);
    }
  });
});

suite("workExplorer: the repository a tree is built from", () => {
  test("reads the memo the router says it leaves, and nothing where there is none", () => {
    const root = makeTempDir("dabbler-memo-");
    try {
      assert.strictEqual(readMechanicMemo(root, 4), null);
      fs.mkdirSync(path.join(root, ".dabbler", "scratch"), { recursive: true });
      fs.writeFileSync(path.join(root, ".dabbler", "scratch", "mechanic-memo-s4.md"), "  The cause, and what to decide.\n", "utf8");
      assert.strictEqual(readMechanicMemo(root, 4), "The cause, and what to decide.");
    } finally {
      rmrf(root);
    }
  });

  test("a repository carries the reading's sessions and its own paths", () => {
    const root = makeTempDir("dabbler-assembly-");
    try {
      const reading = makeProjection({
        repository: { totalSessions: 2, sessionsCompleted: 1, currentSession: 2 },
      });
      const repository: SessionsRepository = workExplorerRepository(root, reading);
      assert.strictEqual(repository.currentSession, 2);
      assert.strictEqual(repository.sessions.length, 2);
      assert.strictEqual(repository.label, path.basename(root));
      assert.ok(repository.planPath.endsWith("session-plan.md"));
      assert.strictEqual(repository.sessionsDir, path.join(root, "docs", "sessions"));
    } finally {
      rmrf(root);
    }
  });

  test("a failed reading shows no sessions and claims the ledger, never a fresh plan", () => {
    const root = makeTempDir("dabbler-assembly-");
    try {
      const repository = workExplorerRepository(root, null);
      assert.deepStrictEqual(repository.sessions, []);
      assert.strictEqual(repository.totalSessions, null);
      assert.strictEqual(repository.sessionsSource, "ledger");
    } finally {
      rmrf(root);
    }
  });
});

