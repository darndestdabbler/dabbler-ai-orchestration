// The record's readers and writers.
//
// The parity control proves the two routers agree; these prove the rules
// the record is made of, which a comparison cannot reach: the refusals
// nothing in the corpus triggers, the folds whose ordering is the whole
// claim, and the serializer's shape.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import {
  LedgerError,
  appendDispute,
  appendPackaging,
  appendReanchor,
  closedStepIds,
  effectiveBaseline,
  lastClosedTree,
  openStep,
  openStepsInRepo,
  readJsonl,
  readRounds,
  sessionRunDir,
} from "../src/ledger.ts";
import { appendWorkerResult, quarantineDir, writeReviewRun } from "../src/critique.ts";
import { materialWorktreeChanges, previewPaths } from "../src/gates.ts";
import { isMachineStatePath, nowIso, platformNewlines } from "../src/journal.ts";
import {
  SessionStateInvariantError,
  canonicalizeStatus,
  derivedView,
  getProgress,
  healTitle,
  sessionDisplayNumber,
  sessionHasHistory,
} from "../src/progress.ts";
import { PythonFloat, dumps } from "../src/pythonJson.ts";
import {
  DuplicateSlugError,
  MalformedSlugError,
  parseSessionPlans,
  parseStepTexts,
  splitSlugMarker,
} from "../src/session.ts";
import {
  SanctionedWriteError,
  appendDecision,
  buildOrchestratorBlock,
  declareSessionTask,
  planStepKey,
  registerSessionStart,
  renderDecisionsLog,
} from "../src/writers.ts";
import { makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

// --- The serializer ----------------------------------------------------------

describe("serializing a value the way json.dumps does", () => {
  it("puts a space after the comma when there is no indent", () => {
    // `json.dumps` defaults to `", "`; `JSON.stringify` writes `","`. Every
    // JSONL row in the record is written this way.
    expect(dumps({ a: 1, b: 2 })).toBe('{"a": 1, "b": 2}');
  });

  it("drops that space when an indent carries it", () => {
    expect(dumps({ a: 1, b: 2 }, { indent: 2 })).toBe('{\n  "a": 1,\n  "b": 2\n}');
  });

  it("escapes non-ASCII by default", () => {
    expect(dumps({ dash: "—" })).toBe('{"dash": "\\u2014"}');
  });

  it("writes non-ASCII through when ensure_ascii is off", () => {
    expect(dumps({ dash: "—" }, { ensureAscii: false })).toBe('{"dash": "—"}');
  });

  it("escapes an astral character as its surrogate pair", () => {
    expect(dumps("🎯")).toBe('"\\ud83c\\udfaf"');
  });

  it("escapes DEL, which is ASCII and which CPython still escapes", () => {
    expect(dumps("")).toBe('"\\u007f"');
  });

  it("leaves an empty container on one line under an indent", () => {
    expect(dumps({ a: {}, b: [] }, { indent: 2 })).toBe('{\n  "a": {},\n  "b": []\n}');
  });

  it("keeps a float a float, so 1.0 does not become 1", () => {
    expect(dumps({ seconds: new PythonFloat(1) })).toBe('{"seconds": 1.0}');
  });
});

// --- Line endings ------------------------------------------------------------

describe("the line-ending seam", () => {
  it("writes what this host's Python text mode writes", () => {
    // Not a claim about which ending is right: a claim that the router
    // writes the one Python writes on the same machine. Cross-OS parity is
    // not claimed, so this asserts the host's own answer.
    const expected = process.platform === "win32" ? "a\r\nb\r\n" : "a\nb\n";
    expect(platformNewlines("a\nb\n")).toBe(expected);
  });

  it("does not double an ending that is already there", () => {
    expect(platformNewlines(platformNewlines("a\n"))).toBe(platformNewlines("a\n"));
  });
});

// --- The machine-state predicate ---------------------------------------------

describe("telling the record from the work", () => {
  it("counts everything under .dabbler as the record", () => {
    expect(isMachineStatePath(".dabbler/runs/s1/rounds.jsonl")).toBe(true);
  });

  it("reads a Windows separator as the same path", () => {
    expect(isMachineStatePath(".dabbler\\runs\\s1\\rounds.jsonl")).toBe(true);
  });

  it("does not count a path that merely starts with the same letters", () => {
    expect(isMachineStatePath(".dabblerish/notes.md")).toBe(false);
  });
});

// --- The clock ---------------------------------------------------------------

describe("the writer's clock", () => {
  it("prints milliseconds to exactly three places", () => {
    expect(nowIso("milliseconds", new Date(2026, 0, 2, 3, 4, 5, 60))).toMatch(
      /^2026-01-02T03:04:05\.060[+-]\d{2}:\d{2}$/,
    );
  });

  it("omits the fraction entirely when it is zero, as isoformat does", () => {
    expect(nowIso("microseconds", new Date(2026, 0, 2, 3, 4, 5, 0))).toMatch(
      /^2026-01-02T03:04:05[+-]\d{2}:\d{2}$/,
    );
  });
});

// --- The session vocabulary --------------------------------------------------

describe("the session record's vocabulary", () => {
  it("folds a drifted synonym onto the canonical status", () => {
    expect(canonicalizeStatus("completed")).toBe("complete");
  });

  it("passes an unknown status through for a validator to reject", () => {
    expect(canonicalizeStatus("half-done")).toBe("half-done");
  });

  it("pads a session number to three digits", () => {
    expect(sessionDisplayNumber(15)).toBe("015");
  });

  it("does not truncate a number wider than the pad", () => {
    expect(sessionDisplayNumber(1234)).toBe("1234");
  });

  it("renders a non-positive value as-is rather than inventing one", () => {
    expect(sessionDisplayNumber(0)).toBe("0");
  });
});

describe("healing a session's title", () => {
  const spec = new Map([[3, "The plan's words"]]);

  it("keeps a real title on a session that has run", () => {
    expect(healTitle("What happened", 3, spec, { hasHistory: true })).toBe(
      "What happened",
    );
  });

  it("takes the plan's title over a generic one", () => {
    expect(healTitle("Session 3", 3, spec, { hasHistory: true })).toBe(
      "The plan's words",
    );
  });

  it("does not treat another session's number as generic", () => {
    // `Session 5` stored on session 3 is drift or operator words, and
    // healing it would silently discard what someone wrote.
    expect(healTitle("Session 5", 3, spec, { hasHistory: true })).toBe("Session 5");
  });

  it("lets the plan rewrite a historyless session", () => {
    expect(healTitle("Old words", 3, spec, { hasHistory: false })).toBe(
      "The plan's words",
    );
  });

  it("counts a mere stamp as history", () => {
    expect(sessionHasHistory({ status: "not-started", startedAt: "2026-01-01" })).toBe(
      true,
    );
  });
});

describe("the derived view", () => {
  it("computes currentSession rather than trusting a stored one", () => {
    const view = derivedView({
      schemaVersion: 5,
      currentSession: 99,
      sessions: [
        { number: 1, status: "complete" },
        { number: 2, status: "in-progress" },
      ],
    });
    expect(view["currentSession"]).toBe(2);
  });

  it("reads a closed record as closed", () => {
    const view = derivedView({
      schemaVersion: 5,
      sessions: [{ number: 1, status: "complete" }],
    });
    expect(view["lifecycleState"]).toBe("closed");
  });
});

describe("the state invariants", () => {
  const progress = (sessions: unknown[]): unknown =>
    getProgress({ schemaVersion: 5, sessions });

  it("refuses two sessions in flight at once", () => {
    expect(() =>
      progress([
        { number: 1, status: "in-progress" },
        { number: 2, status: "in-progress" },
      ]),
    ).toThrow(SessionStateInvariantError);
  });

  it("refuses a complete session sitting behind an open one", () => {
    expect(() =>
      progress([
        { number: 1, status: "not-started" },
        { number: 2, status: "complete" },
      ]),
    ).toThrow(/follows an open one/);
  });

  it("refuses numbering that is not contiguous from one", () => {
    expect(() =>
      progress([
        { number: 1, status: "complete" },
        { number: 3, status: "not-started" },
      ]),
    ).toThrow(/contiguous/);
  });

  it("lets a cancelled session sit behind an open one", () => {
    // Cancelled is closed: a session that will not run, not one waiting.
    const view = progress([
      { number: 1, status: "cancelled" },
      { number: 2, status: "in-progress" },
    ]) as { currentSession: number };
    expect(view.currentSession).toBe(2);
  });
});

// --- The plan grammar --------------------------------------------------------

describe("the session plan's grammar", () => {
  it("takes top-level ordered items as steps and leaves nested ones alone", () => {
    const steps = parseStepTexts(
      "1. First thing\n   1. Not a step\n2. Second thing\n\n**Creates:** a file\n",
    );
    expect(steps).toEqual(["First thing 1. Not a step", "Second thing"]);
  });

  it("does not read a fenced block's numbers as steps", () => {
    const plans = parseSessionPlans(
      "### Session 1 of 1: Title\n1. Real\n\n```\n2. Fake\n```\n",
    );
    expect(plans[0].steps).toEqual(["Real"]);
  });

  it("splits an authored slug off a heading", () => {
    expect(splitSlugMarker("Do the thing (slug: do-thing)")).toEqual([
      "Do the thing",
      "do-thing",
    ]);
  });

  it("refuses a marker that is nearly but not exactly the literal form", () => {
    // A typo must not fall back to "no marker", which would silently give
    // the step a different, unannounced identity.
    expect(() => splitSlugMarker("Do the thing (Slug: do-thing)")).toThrow(
      MalformedSlugError,
    );
  });

  it("refuses an unclosed marker", () => {
    expect(() => splitSlugMarker("Do the thing (slug: do-thing")).toThrow(
      MalformedSlugError,
    );
  });

  it("refuses two sessions declaring the same slug", () => {
    expect(() =>
      parseSessionPlans(
        "### Session 1 of 2: One (slug: same)\n1. a\n\n### Session 2 of 2: Two (slug: same)\n1. b\n",
      ),
    ).toThrow(DuplicateSlugError);
  });
});

describe("deriving a step key", () => {
  it("stops at the first sentence and keeps at most six words", () => {
    expect(planStepKey("Port the three modules of the record. Then rest.", 1)).toBe(
      "port-the-three-modules-of-the",
    );
  });

  it("falls back to the ordinal when nothing survives", () => {
    expect(planStepKey("!!!", 4)).toBe("step-4");
  });
});

// --- The writers -------------------------------------------------------------

function makeSessionsDir(): { repo: string; sessionsDir: string } {
  const repo = makeTempDir();
  execFileSync("git", ["init", "-q"], { cwd: repo, stdio: "ignore" });
  const sessionsDir = join(repo, "docs", "sessions");
  mkdirSync(sessionsDir, { recursive: true });
  writeFileSync(
    join(sessionsDir, "session-plan.md"),
    "### Session 1 of 2: First\n1. Register.\n2. Build it.\n\n### Session 2 of 2: Second\n1. Register.\n",
    "utf8",
  );
  commitAll(repo);
  return { repo, sessionsDir };
}

/**
 * The seed, committed.
 *
 * `materialWorktreeChanges` asks git what is uncommitted, so a fixture that
 * left its own plan file untracked would make every declaration refuse --
 * and the refusal would be about the fixture rather than about the rule.
 */
function commitAll(repo: string): void {
  const options = {
    cwd: repo,
    stdio: "ignore" as const,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.invalid",
      GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.invalid",
    },
  };
  execFileSync("git", ["add", "-A"], options);
  execFileSync("git", ["commit", "-q", "-m", "seed", "--no-gpg-sign"], options);
}

describe("the orchestrator block", () => {
  it("omits a key rather than writing a null placeholder", () => {
    const block = buildOrchestratorBlock("claude-code", "anthropic", null, "  ");
    expect(block).not.toHaveProperty("model");
    expect(block).not.toHaveProperty("effort");
  });
});

describe("registering a session start", () => {
  it("grows the ledger to the plan and heals titles from it", () => {
    const { sessionsDir } = makeSessionsDir();
    const state = registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const sessions = state["sessions"] as Array<Record<string, unknown>>;
    expect(sessions).toHaveLength(2);
    expect(sessions[1]["title"]).toBe("Second");
  });

  it("refuses to re-open a closed session at the writer, not only the CLI", () => {
    const { sessionsDir } = makeSessionsDir();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const path = join(sessionsDir, "sessions.json");
    const state = JSON.parse(readFileSync(path, "utf8"));
    state.sessions[0].status = "complete";
    writeFileSync(path, JSON.stringify(state), "utf8");
    expect(() => registerSessionStart(sessionsDir, 1, { engine: "claude-code" })).toThrow(
      /already in completedSessions/,
    );
  });

  it("drops a stale verification summary when a session is restarted", () => {
    // A leftover summary beside a null verdict is a lie about what has
    // been verified.
    const { sessionsDir } = makeSessionsDir();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const path = join(sessionsDir, "sessions.json");
    const state = JSON.parse(readFileSync(path, "utf8"));
    state.sessions[0].verification = { rounds: 3 };
    writeFileSync(path, JSON.stringify(state), "utf8");
    const rebuilt = registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    expect((rebuilt["sessions"] as Record<string, unknown>[])[0]).not.toHaveProperty(
      "verification",
    );
  });
});

describe("appending a decision", () => {
  it("assigns the identifier and the ordinal itself", () => {
    const { sessionsDir } = makeSessionsDir();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const entry = appendDecision(sessionsDir, {
      sessionNumber: 1,
      decider: "operator",
      headline: "A thing",
      body: "Because.",
    });
    expect(entry["decisionId"]).toBe("D1");
    expect(entry["ordinal"]).toBe(1);
  });

  it("refuses a backdate without the reason that says it is one", () => {
    const { sessionsDir } = makeSessionsDir();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    expect(() =>
      appendDecision(sessionsDir, {
        sessionNumber: 1,
        decider: "operator",
        headline: "A thing",
        body: "Because.",
        decidedOn: "2026-01-01",
      }),
    ).toThrow(SanctionedWriteError);
  });

  it("refuses a decider outside the closed set", () => {
    const { sessionsDir } = makeSessionsDir();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    expect(() =>
      appendDecision(sessionsDir, {
        sessionNumber: 1,
        decider: "the team",
        headline: "A thing",
        body: "Because.",
      }),
    ).toThrow(/decider must be one of/);
  });

  it("emits a session heading again when a session receives a later decision", () => {
    // The file's whole claim is "in order", so a session that comes back
    // appears twice rather than being grouped upward.
    const { sessionsDir } = makeSessionsDir();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const common = { decider: "operator" as const, body: "Because." };
    appendDecision(sessionsDir, { ...common, sessionNumber: 1, headline: "First" });
    appendDecision(sessionsDir, { ...common, sessionNumber: 2, headline: "Second" });
    appendDecision(sessionsDir, { ...common, sessionNumber: 1, headline: "Third" });
    expect(renderDecisionsLog(sessionsDir)).toContain("(continued)");
  });
});

describe("declaring a session's task list", () => {
  it("refuses a second declaration", () => {
    const { sessionsDir } = makeSessionsDir();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const declaration = { sessionNumber: 1, task: "Do it.", releasable: false };
    declareSessionTask(sessionsDir, declaration);
    expect(() => declareSessionTask(sessionsDir, declaration)).toThrow(
      /already declared/,
    );
  });

  it("refuses once the tree carries the session's work", () => {
    const { repo, sessionsDir } = makeSessionsDir();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    writeFileSync(join(repo, "widget.py"), "x = 1\n", "utf8");
    expect(() =>
      declareSessionTask(sessionsDir, {
        sessionNumber: 1,
        task: "Do it.",
        releasable: true,
      }),
    ).toThrow(/already carries 1 change/);
  });
});

describe("what counts as the session's work", () => {
  it("does not count the run ledger, which is appended after the tree", () => {
    const { repo, sessionsDir } = makeSessionsDir();
    mkdirSync(join(repo, ".dabbler", "runs"), { recursive: true });
    writeFileSync(join(repo, ".dabbler", "runs", "state-writes.jsonl"), "{}\n", "utf8");
    expect(materialWorktreeChanges(sessionsDir).paths).toEqual([]);
  });

  it("does not count editor droppings", () => {
    const { repo, sessionsDir } = makeSessionsDir();
    writeFileSync(join(repo, ".DS_Store"), "x", "utf8");
    expect(materialWorktreeChanges(sessionsDir).paths).toEqual([]);
  });

  it("names the first five paths and counts the rest", () => {
    expect(previewPaths(["a", "b", "c", "d", "e", "f", "g"])).toBe(
      "a, b, c, d, e (+2 more)",
    );
  });
});

// --- The ledger --------------------------------------------------------------

const ROUND = {
  round: 1,
  verdict: "VERIFIED",
  blocking: false,
  findings: [],
  completion_tree: "0".repeat(40),
  recorded_at: "2026-01-01T00:00:00+00:00",
  verifier_model: "gpt",
  verifier_provider: "openai",
};

function makeLedgerRepo(): string {
  const repo = makeTempDir();
  execFileSync("git", ["init", "-q"], { cwd: repo, stdio: "ignore" });
  return repo;
}

function writeRow(repo: string, filename: string, row: unknown): string {
  const directory = sessionRunDir(repo, 1);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, filename);
  writeFileSync(path, platformNewlines(dumps(row) + "\n"), "utf8");
  return path;
}

describe("reading the round ledger", () => {
  it("refuses a line that is not valid JSON rather than skipping it", () => {
    // The ledger is machine-written, so a bad line is tampering or
    // corruption -- never noise to step over.
    const repo = makeLedgerRepo();
    const directory = sessionRunDir(repo, 1);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "rounds.jsonl"), "{not json}\n", "utf8");
    expect(() => readRounds(repo, 1)).toThrow(LedgerError);
  });

  it("refuses a row that does not match its schema", () => {
    const repo = makeLedgerRepo();
    writeRow(repo, "rounds.jsonl", { round: 1 });
    expect(() => readRounds(repo, 1)).toThrow(/schema validation/);
  });

  it("reads a file the writer left with this host's line endings", () => {
    const repo = makeLedgerRepo();
    writeRow(repo, "rounds.jsonl", ROUND);
    expect(readRounds(repo, 1)).toHaveLength(1);
  });

  it("reads no rows from a file that is not there", () => {
    expect(readRounds(makeLedgerRepo(), 1)).toEqual([]);
  });
});

describe("appending to the ledger", () => {
  it("refuses a second re-anchor for one round", () => {
    const repo = makeLedgerRepo();
    const row = {
      round: 1, recorded_tree: "0".repeat(40), anchor_tree: "a".repeat(40),
      anchor_commit: "b".repeat(40), reason: "moved",
      recorded_at: "2026-01-01T00:00:00+00:00",
    };
    appendReanchor(repo, 1, { ...row });
    expect(() => appendReanchor(repo, 1, { ...row })).toThrow(/recovered once/);
  });

  it("refuses a second dispute of one finding", () => {
    const repo = makeLedgerRepo();
    const row = {
      round: 1, finding_index: 0, filed_after_round: 1,
      grounds: "misread", evidence_paths: ["a.py"],
      recorded_at: "2026-01-01T00:00:00+00:00",
    };
    appendDispute(repo, 1, { ...row });
    expect(() => appendDispute(repo, 1, { ...row })).toThrow(/at most once/);
  });

  it("appends a packaging refusal beside its later success", () => {
    // A record holding only the last attempt reads as if the refusal
    // never happened.
    const repo = makeLedgerRepo();
    const base = {
      recorded_at: "2026-01-01T00:00:00+00:00", session_number: 1,
      releasable: true,
    };
    appendPackaging(repo, 1, {
      ...base, outcome: "refused", releasable: false,
      refusal: "the session did not declare itself releasable",
    });
    appendPackaging(repo, 1, {
      ...base, outcome: "published", tree_mutated: false,
      feed: "internal", secret_name: "FEED_PAT", steps: [],
      artifacts: ["widget-1.0.0.tgz"],
    });
    expect(readJsonl(join(sessionRunDir(repo, 1), "packaging.jsonl"), (r) => r)).toHaveLength(2);
  });
});

describe("the step execution record", () => {
  const opened = {
    schema_version: 1, event: "opened", step_id: "one", session_number: 1,
    recorded_at: "2026-01-01T00:00:00+00:00", base_commit: "c".repeat(40),
  };
  const closed = {
    schema_version: 1, event: "closed", step_id: "one", session_number: 1,
    recorded_at: "2026-01-01T00:01:00+00:00", closed_tree: "d".repeat(40),
    base_commit: "c".repeat(40), envelope: { inside: ["widget.py"] },
    deterministic: [{ kind: "lint", status: "pass", required: true }],
  };

  function withEvents(rows: unknown[]): string {
    const repo = makeLedgerRepo();
    const directory = sessionRunDir(repo, 1);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, "step-execution.jsonl"),
      platformNewlines(rows.map((row) => dumps(row)).join("\n") + "\n"),
      "utf8",
    );
    return repo;
  }

  it("folds an open step out of the rows rather than counting one", () => {
    expect(openStep(withEvents([opened]), 1)?.["step_id"]).toBe("one");
  });

  it("has no open step once it closed", () => {
    expect(openStep(withEvents([opened, closed]), 1)).toBeNull();
  });

  it("lists a closed step as executed", () => {
    expect(closedStepIds(withEvents([opened, closed]), 1)).toEqual(["one"]);
  });

  it("takes the last closed tree as the next step's baseline", () => {
    expect(lastClosedTree(withEvents([opened, closed]), 1)).toBe("d".repeat(40));
  });

  it("finds an open step anywhere in the repository, without being told where", () => {
    // A commit hook gets no arguments and must not have to resolve which
    // session is active.
    expect(openStepsInRepo(withEvents([opened]))).toHaveLength(1);
  });
});

describe("the baseline a later round diffs from", () => {
  it("takes the re-anchored tree over the recorded one", () => {
    const repo = makeLedgerRepo();
    appendReanchor(repo, 1, {
      round: 1, recorded_tree: ROUND.completion_tree,
      anchor_tree: "e".repeat(40), anchor_commit: "f".repeat(40),
      reason: "the clone lacked it",
      recorded_at: "2026-01-01T00:00:00+00:00",
    });
    expect(effectiveBaseline(repo, 1, ROUND)).toBe("e".repeat(40));
  });

  it("takes the recorded tree when nothing was re-anchored", () => {
    expect(effectiveBaseline(makeLedgerRepo(), 1, ROUND)).toBe(ROUND.completion_tree);
  });
});

// --- The critique subtree ----------------------------------------------------

describe("the critique subtree", () => {
  const CHANGE_ID = "abc1234";

  it("refuses a change-id that is not a derived digest", () => {
    // The constraint is a path guard as much as a format one.
    const repo = makeLedgerRepo();
    expect(() =>
      appendWorkerResult(repo, 1, {
        schema_version: 1, change_id: "../escape", check_id: "c1",
        attempt: 1, result: "pass",
        recorded_at: "2026-01-01T00:00:00+00:00",
      }),
    ).toThrow(LedgerError);
  });

  it("keeps a refused payload beside the subtree rather than dropping it", () => {
    // A refusal with no way to see what was rejected is how a bad writer
    // gets blamed on a bad reader.
    const repo = makeLedgerRepo();
    expect(() =>
      writeReviewRun(repo, 1, {
        schema_version: 1, change_id: CHANGE_ID, session_number: 1,
        attempts: "not a list", opened_at: "2026-01-01T00:00:00+00:00",
      }),
    ).toThrow(/quarantined at/);
    expect(existsSync(quarantineDir(repo, 1))).toBe(true);
  });
});
