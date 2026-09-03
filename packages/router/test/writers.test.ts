// The session record's writers and the grammar they read: the serialiser,
// the vocabulary, the plan's headings and steps, and the state file's
// sanctioned writes. The record lives in a temp directory; git's two
// questions (where is the root, is the tree clean) are answered from a table.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { materialWorktreeChanges } from "../src/gates.ts";
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
import { VERSION } from "../src/version.ts";
import {
  SanctionedWriteError,
  appendDecision,
  buildOrchestratorBlock,
  declareSessionTask,
  planStepKey,
  registerSessionStart,
  renderDecisionsLog,
} from "../src/writers.ts";
import { gitAnswers, seed, tempDir } from "./support/answers.ts";

const PLAN =
  "### Session 1 of 2: First\n1. Register.\n2. Build it.\n\n### Session 2 of 2: Second\n1. Register.\n";

// One table for the file: the root is whichever directory asked, the tree is
// clean unless a test says otherwise through `dirty`.
let dirty = "";
gitAnswers([
  [["rev-parse", "--show-toplevel"], (_args, root) => ({ stdout: root.split("\\").join("/") })],
  [["status", "--porcelain", "-uall"], () => ({ stdout: dirty })],
  [["status", "--porcelain"], () => ({ stdout: dirty })],
]);

function makeSessionsDir(): { repo: string; sessionsDir: string } {
  const repo = tempDir();
  seed(repo, { "docs/sessions/session-plan.md": PLAN });
  dirty = "";
  return { repo, sessionsDir: join(repo, "docs", "sessions") };
}

describe("serializing a value the way json.dumps does", () => {
  it("puts a space after the comma when there is no indent, and drops it under one", () => {
    assert.equal(dumps({ a: 1, b: 2 }), '{"a": 1, "b": 2}');
    assert.equal(dumps({ a: 1, b: 2 }, { indent: 2 }), '{\n  "a": 1,\n  "b": 2\n}');
  });

  it("escapes non-ASCII by default and writes it through when ensure_ascii is off", () => {
    assert.equal(dumps({ dash: "—" }), '{"dash": "\\u2014"}');
    assert.equal(dumps({ dash: "—" }, { ensureAscii: false }), '{"dash": "—"}');
  });

  it("escapes an astral character as its surrogate pair, and DEL as CPython does", () => {
    assert.equal(dumps("🎯"), '"\\ud83c\\udfaf"');
    assert.equal(dumps("\u007f"), '"\\u007f"');
  });

  it("leaves an empty container on one line under an indent", () => {
    assert.equal(dumps({ a: {}, b: [] }, { indent: 2 }), '{\n  "a": {},\n  "b": []\n}');
  });

  it("keeps a float a float, so 1.0 does not become 1", () => {
    assert.equal(dumps({ seconds: new PythonFloat(1) }), '{"seconds": 1.0}');
  });
});

describe("the session record's vocabulary", () => {
  it("folds a drifted synonym onto the canonical status and passes an unknown one through", () => {
    assert.equal(canonicalizeStatus("completed"), "complete");
    assert.equal(canonicalizeStatus("half-done"), "half-done");
  });

  it("pads a session number to three digits without truncating a wider one or inventing one", () => {
    assert.equal(sessionDisplayNumber(15), "015");
    assert.equal(sessionDisplayNumber(1234), "1234");
    assert.equal(sessionDisplayNumber(0), "0");
  });
});

describe("healing a session's title", () => {
  const spec = new Map([[3, "The plan's words"]]);

  it("keeps a real title on a session that has run, and takes the plan's over a generic one", () => {
    assert.equal(healTitle("What happened", 3, spec, { hasHistory: true }), "What happened");
    assert.equal(healTitle("Session 3", 3, spec, { hasHistory: true }), "The plan's words");
  });

  it("does not treat another session's number as generic", () => {
    // `Session 5` stored on session 3 is drift or operator words.
    assert.equal(healTitle("Session 5", 3, spec, { hasHistory: true }), "Session 5");
  });

  it("lets the plan rewrite a historyless session, and counts a mere stamp as history", () => {
    assert.equal(healTitle("Old words", 3, spec, { hasHistory: false }), "The plan's words");
    assert.equal(sessionHasHistory({ status: "not-started", startedAt: "2026-01-01" }), true);
  });
});

describe("the derived view and its invariants", () => {
  const progress = (sessions: unknown[]): unknown => getProgress({ schemaVersion: 5, sessions });

  it("computes currentSession rather than trusting a stored one, and reads a closed record as closed", () => {
    const view = derivedView({
      schemaVersion: 5, currentSession: 99,
      sessions: [{ number: 1, status: "complete" }, { number: 2, status: "in-progress" }],
    });
    assert.equal(view["currentSession"], 2);
    assert.equal(derivedView({ schemaVersion: 5, sessions: [{ number: 1, status: "complete" }] })["lifecycleState"], "closed");
  });

  it("refuses two sessions in flight at once", () => {
    assert.throws(() => progress([{ number: 1, status: "in-progress" }, { number: 2, status: "in-progress" }]), SessionStateInvariantError);
  });

  it("refuses a complete session sitting behind an open one, and numbering that is not contiguous", () => {
    assert.throws(() => progress([{ number: 1, status: "not-started" }, { number: 2, status: "complete" }]), /follows an open one/);
    assert.throws(() => progress([{ number: 1, status: "complete" }, { number: 3, status: "not-started" }]), /contiguous/);
  });

  it("lets a cancelled session sit behind an open one, because cancelled is closed", () => {
    const view = progress([{ number: 1, status: "cancelled" }, { number: 2, status: "in-progress" }]) as { currentSession: number };
    assert.equal(view.currentSession, 2);
  });
});

describe("the session plan's grammar", () => {
  it("takes top-level ordered items as steps and leaves nested ones and fenced blocks alone", () => {
    assert.deepEqual(parseStepTexts("1. First thing\n   1. Not a step\n2. Second thing\n\n**Creates:** a file\n"), [
      "First thing 1. Not a step",
      "Second thing",
    ]);
    assert.deepEqual(parseSessionPlans("### Session 1 of 1: Title\n1. Real\n\n```\n2. Fake\n```\n")[0].steps, ["Real"]);
  });

  it("splits an authored slug off a heading and refuses a marker that is nearly the literal form", () => {
    // A typo must not fall back to "no marker", which would silently give
    // the step a different, unannounced identity.
    assert.deepEqual(splitSlugMarker("Do the thing (slug: do-thing)"), ["Do the thing", "do-thing"]);
    assert.throws(() => splitSlugMarker("Do the thing (Slug: do-thing)"), MalformedSlugError);
    assert.throws(() => splitSlugMarker("Do the thing (slug: do-thing"), MalformedSlugError);
  });

  it("refuses two sessions declaring the same slug", () => {
    assert.throws(
      () => parseSessionPlans("### Session 1 of 2: One (slug: same)\n1. a\n\n### Session 2 of 2: Two (slug: same)\n1. b\n"),
      DuplicateSlugError,
    );
  });

  it("derives a step key from the first sentence, six words at most, or the ordinal", () => {
    assert.equal(planStepKey("Port the three modules of the record. Then rest.", 1), "port-the-three-modules-of-the");
    assert.equal(planStepKey("!!!", 4), "step-4");
  });
});

describe("the orchestrator block", () => {
  it("omits a key rather than writing a null placeholder", () => {
    const block = buildOrchestratorBlock("claude-code", "anthropic", null, "  ");
    assert.equal("model" in block, false);
    assert.equal("effort" in block, false);
  });
});

describe("registering a session start", () => {
  it("grows the ledger to the plan and heals titles from it", () => {
    const { sessionsDir } = makeSessionsDir();
    const sessions = registerSessionStart(sessionsDir, 1, { engine: "claude-code" })["sessions"] as Record<string, unknown>[];
    assert.equal(sessions.length, 2);
    assert.equal(sessions[1]["title"], "Second");
  });

  it("refuses to re-open a closed session at the writer, not only the CLI", () => {
    const { sessionsDir } = makeSessionsDir();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const path = join(sessionsDir, "sessions.json");
    const state = JSON.parse(readFileSync(path, "utf8"));
    state.sessions[0].status = "complete";
    writeFileSync(path, JSON.stringify(state), "utf8");
    assert.throws(() => registerSessionStart(sessionsDir, 1, { engine: "claude-code" }), /already in completedSessions/);
  });

  it("stamps the framework version on the session it registers and carries an earlier stamp unchanged", () => {
    // The orchestrator block names the ENGINE; nothing else in the row says
    // which framework produced it. Only the registered row is stamped: a
    // rebuild that restamped every row would claim the framework that last
    // touched the file rather than the one that ran the session.
    const { sessionsDir } = makeSessionsDir();
    const first = registerSessionStart(sessionsDir, 1, { engine: "claude-code" })["sessions"] as Record<string, unknown>[];
    assert.equal(first[0]["frameworkVersion"], VERSION);
    assert.equal("frameworkVersion" in first[1], false);
    const path = join(sessionsDir, "sessions.json");
    const state = JSON.parse(readFileSync(path, "utf8"));
    state.sessions[0].status = "complete";
    state.sessions[0].frameworkVersion = "1.1.0";
    writeFileSync(path, JSON.stringify(state), "utf8");
    const rebuilt = registerSessionStart(sessionsDir, 2, { engine: "claude-code" })["sessions"] as Record<string, unknown>[];
    assert.equal(rebuilt[0]["frameworkVersion"], "1.1.0");
    assert.equal(rebuilt[1]["frameworkVersion"], VERSION);
  });

  it("drops a stale verification summary when a session is restarted", () => {
    const { sessionsDir } = makeSessionsDir();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const path = join(sessionsDir, "sessions.json");
    const state = JSON.parse(readFileSync(path, "utf8"));
    state.sessions[0].verification = { rounds: 3 };
    writeFileSync(path, JSON.stringify(state), "utf8");
    const rebuilt = registerSessionStart(sessionsDir, 1, { engine: "claude-code" })["sessions"] as Record<string, unknown>[];
    assert.equal("verification" in rebuilt[0], false);
  });
});

describe("appending a decision", () => {
  const common = { decider: "operator" as const, body: "Because." };

  it("assigns the identifier and the ordinal itself", () => {
    const { sessionsDir } = makeSessionsDir();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const entry = appendDecision(sessionsDir, { ...common, sessionNumber: 1, headline: "A thing" });
    assert.equal(entry["decisionId"], "D1");
    assert.equal(entry["ordinal"], 1);
  });

  it("refuses a backdate without the reason that says it is one, and a decider outside the closed set", () => {
    const { sessionsDir } = makeSessionsDir();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    assert.throws(
      () => appendDecision(sessionsDir, { ...common, sessionNumber: 1, headline: "A thing", decidedOn: "2026-01-01" }),
      SanctionedWriteError,
    );
    assert.throws(
      () => appendDecision(sessionsDir, { sessionNumber: 1, decider: "the team", headline: "A thing", body: "Because." }),
      /decider must be one of/,
    );
  });

  it("emits a session heading again when a session receives a later decision", () => {
    // The file's whole claim is "in order": a session that comes back
    // appears twice rather than being grouped upward.
    const { sessionsDir } = makeSessionsDir();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    appendDecision(sessionsDir, { ...common, sessionNumber: 1, headline: "First" });
    appendDecision(sessionsDir, { ...common, sessionNumber: 2, headline: "Second" });
    appendDecision(sessionsDir, { ...common, sessionNumber: 1, headline: "Third" });
    assert.match(renderDecisionsLog(sessionsDir), /\(continued\)/);
  });
});

describe("declaring a session's task list", () => {
  it("refuses a second declaration", () => {
    const { sessionsDir } = makeSessionsDir();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const declaration = { sessionNumber: 1, task: "Do it.", releasable: false };
    declareSessionTask(sessionsDir, declaration);
    assert.throws(() => declareSessionTask(sessionsDir, declaration), /already declared/);
  });

  it("refuses once the tree carries the session's work, and does not count the run ledger or editor droppings as work", () => {
    const { sessionsDir } = makeSessionsDir();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    dirty = "?? .dabbler/runs/state-writes.jsonl\n?? .DS_Store\n";
    assert.deepEqual(materialWorktreeChanges(sessionsDir).paths, []);
    dirty = "?? widget.py\n";
    assert.throws(
      () => declareSessionTask(sessionsDir, { sessionNumber: 1, task: "Do it.", releasable: true }),
      /already carries 1 change/,
    );
  });
});
