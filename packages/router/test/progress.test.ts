// The Work Explorer projection and the readers beneath it. The extension
// renders this JSON and re-implements none of it, so every question it can
// ask is answered here: where the sessions came from, which is in flight,
// what its steps are doing, what stopped its verification, and how it says
// it could not tell. Records are files in a temp directory; git is answered
// from a table.
import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import { writeRun, writeWorkPlan } from "../src/driver.ts";
import { appendRound, roundsPath } from "../src/ledger.ts";
import { CLASS_VALUE_TRADEOFF, raiseOwed } from "../src/owedDecisions.ts";
import {
  DEFAULT_STALLED_AFTER_SECONDS,
  SESSION_STATUSES,
  SOURCE_LEDGER,
  SOURCE_PLAN,
  STATUS_PLANNED,
  TaskRowsRefused,
  VerificationRefused,
  buildProjection,
  buildTaskRows,
  buildVerificationView,
  healStaleTitles,
  lastActivityAt,
  ledgerExists,
  needsTitleHeal,
  normalizeLegacyState,
  possiblyStalled,
  readRawLegacyState,
  sessionsFromPlan,
  synthesizeV3FromV2,
  verificationCap,
} from "../src/progress.ts";
import { declareSessionTask, flipStateToClosed, registerSessionStart } from "../src/writers.ts";
import { gitAnswers, seed, tempDir } from "./support/answers.ts";

const PLAN =
  "### Session 1 of 2: First things\n1. Register.\n2. **Build the widget.** Make it real.\n" +
  "3. Cross-provider verification.\n4. Close-out.\n\n" +
  "### Session 2 of 2: Second things\n1. Register.\n2. Polish it.\n";
const CONFIG =
  "schema_version: 1\n\ntesting:\n  suites:\n    - name: unit\n      command: python -m pytest\n" +
  "      expensive: true\n      covers:\n        - src/\n      test_roots:\n        - tests\n      test_glob: \"test_*.py\"\n";

gitAnswers([
  [["rev-parse", "--show-toplevel"], (_args, root) => ({ stdout: root.split("\\").join("/") })],
  [["status", "--porcelain", "-uall"], { stdout: "" }],
  [["status", "--porcelain"], { stdout: "" }],
  [(args) => args[0] === "cat-file" && args[1] === "-e", { code: 0 }],
  [["commit-tree"], { stdout: "c".repeat(40) }],
  [["update-ref"], { code: 0 }],
]);

function makeStateDirs(): { repo: string; sessionsDir: string } {
  const repo = tempDir();
  seed(repo, { "docs/sessions/session-plan.md": PLAN, "dabbler.yaml": CONFIG, ".gitignore": ".dabbler/\n" });
  return { repo, sessionsDir: join(repo, "docs", "sessions") };
}

const fakeTree = (fill: string): string => fill.repeat(40);

// Every event lands on its own millisecond, strictly after the last.
function nextStamp(): string {
  const stamp = Date.now();
  while (Date.now() <= stamp) {
    // spin
  }
  return new Date(stamp).toISOString();
}

function start(sessionsDir: string): void {
  registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
  nextStamp();
}

function recordRound(repo: string, row: Record<string, unknown>): void {
  appendRound(repo, 1, {
    verifier_model: "gpt-5-4", verifier_provider: "openai", findings: [], cost_usd: 0.05,
    completion_tree: fakeTree("a"), recorded_at: nextStamp(), ...row,
  });
}

function fileRun(repo: string, stage: string, extra: Record<string, unknown> = {}): void {
  const path = join(repo, ".dabbler", "runs", "test-runs.jsonl");
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(
    path,
    JSON.stringify({ suite: "unit", command: "python -m pytest", outcome: "passed", surfaceDigest: "0".repeat(12), recordedAt: nextStamp(), stage, ...extra }) + "\n",
    "utf8",
  );
}

const repository = (sessionsDir: string): Record<string, unknown> => buildProjection(sessionsDir)["repository"] as Record<string, unknown>;
const sessions = (sessionsDir: string): Record<string, unknown>[] => buildProjection(sessionsDir)["sessions"] as Record<string, unknown>[];
const states = (sessionsDir: string): string[] => buildTaskRows(sessionsDir, 1).map((row) => String(row["state"]));
const openId = (sessionsDir: string): string | null => {
  const open = buildTaskRows(sessionsDir, 1).find((row) => row["isOpen"]);
  return open ? String(open["stepId"]) : null;
};

function writePlan(sessionsDir: string, headings: ReadonlyArray<readonly [number, string]>, extra = ""): void {
  const body = headings.map(([n, t]) => `### Session ${n} of ${headings.length}: ${t}\n1. Register.\n`).join("\n");
  writeFileSync(join(sessionsDir, "session-plan.md"), body + extra, "utf8");
}

const RUN = {
  schema_version: 1, session_number: 1, engine: "claude-code", phase: "steps", seq: 3, invocations: 1,
  max_invocations: 24, accepted_steps: [], baseline_tree: null, stop: null,
  started_at: "2026-08-31T11:00:00-04:00", updated_at: "2026-08-31T12:00:00-04:00",
};

describe("reading a pre-v5 record", () => {
  it("answers null for a directory that carries none, or one that does not parse", () => {
    assert.equal(readRawLegacyState(tempDir()), null);
    const dir = tempDir();
    writeFileSync(join(dir, "session-state.json"), "{ not json", "utf8");
    assert.equal(readRawLegacyState(dir), null);
  });

  it("synthesizes sessions from a v2 file's bare counters, counting neither currentSession nor a non-integer", () => {
    const dir = tempDir();
    const plan = join(dir, "spec.md");
    writeFileSync(plan, "### Session 2 of 3: The middle one\n", "utf8");
    const out = synthesizeV3FromV2({ totalSessions: 3, completedSessions: [1], currentSession: 2, status: "in-progress" }, plan);
    const rows = out["sessions"] as Record<string, unknown>[];
    assert.deepEqual(rows.map((s) => s["status"]), ["complete", "in-progress", "not-started"]);
    assert.equal(rows[1]["title"], "The middle one");
    assert.deepEqual(synthesizeV3FromV2({ currentSession: 4 }, join(dir, "absent.md"))["sessions"], []);
    assert.deepEqual(synthesizeV3FromV2({ totalSessions: "2", completedSessions: [0, -1, 1.5] }, join(dir, "absent.md"))["sessions"], []);
  });

  it("promotes a v3 file's single-valued metadata onto its sessions and leaves a v4 file's where it is", () => {
    const absent = join(tempDir(), "absent.md");
    const v3 = normalizeLegacyState(
      {
        schemaVersion: 3, status: "in-progress", orchestrator: { engine: "claude-code" }, startedAt: "2026-01-01T00:00:00Z",
        sessions: [{ number: 1, title: "One", status: "complete" }, { number: 2, title: "Two", status: "in-progress" }],
      },
      absent,
    );
    const rows = v3["sessions"] as Record<string, unknown>[];
    assert.deepEqual(rows[1]["orchestrator"], { engine: "claude-code" });
    assert.equal(rows[1]["startedAt"], "2026-01-01T00:00:00Z");
    assert.equal(v3["currentSession"], 2);
    const v4 = normalizeLegacyState(
      { schemaVersion: 4, status: "in-progress", orchestrator: { engine: "codex" }, sessions: [{ number: 1, title: "One", status: "in-progress" }] },
      absent,
    );
    assert.equal((v4["sessions"] as Record<string, unknown>[])[0]["orchestrator"], null);
  });

  it("carries the passthrough keys forward and keeps a non-mapping session entry as a placeholder", () => {
    const absent = join(tempDir(), "absent.md");
    const out = normalizeLegacyState({ schemaVersion: 4, sessions: ["nonsense"], forceClosed: true, nextOrchestrator: "gemini" }, absent);
    assert.equal(out["forceClosed"], true);
    assert.equal(out["nextOrchestrator"], "gemini");
    assert.equal(out["schemaVersion"], 4);
    assert.deepEqual(out["sessions"], [{ number: null, title: null, status: null }]);
  });
});

describe("healing a whole ledger's titles", () => {
  it("asks for a heal when any session is generic or historyless, and skips a non-number", () => {
    assert.equal(needsTitleHeal([{ number: 1, title: "Session 1", status: "complete" }]), true);
    assert.equal(needsTitleHeal([{ number: 1, title: "Real work", status: "complete", startedAt: "x" }]), false);
    assert.equal(needsTitleHeal([{ number: "1", title: "" }]), false);
  });

  it("counts the titles it moved and leaves the rest alone", () => {
    const rows = [
      { number: 1, title: "Session 1", status: "not-started" },
      { number: 2, title: "Kept", status: "complete", completedAt: "x" },
    ];
    assert.equal(healStaleTitles(rows, new Map([[1, "From the plan"], [2, "Ignored"]])), 1);
    assert.equal(rows[0]["title"], "From the plan");
    assert.equal(rows[1]["title"], "Kept");
  });
});

describe("the source of a projection's sessions", () => {
  it("reads the plan when nothing has ever run here, and every row is planned", () => {
    // Round 1 of that session's verification found the gap: `not-started`
    // means registered and not begun, and nothing here is registered.
    const { sessionsDir } = makeStateDirs();
    assert.equal(ledgerExists(sessionsDir), false);
    assert.equal(sessionsFromPlan(sessionsDir).length, 2);
    const repo = repository(sessionsDir);
    assert.equal(repo["sessionsSource"], SOURCE_PLAN);
    assert.equal(repo["plannedSessions"], 2);
    assert.equal(repo["totalSessions"], 2);
    assert.equal(repo["sessionsCompleted"], 0);
    assert.equal(repo["nextSession"], 1);
    assert.equal(repo["invariantViolation"], null);
    for (const row of sessions(sessionsDir)) assert.equal(row["status"], STATUS_PLANNED);
  });

  it("reads the ledger once one exists, naming each session with a display number and an icon key", () => {
    const { sessionsDir } = makeStateDirs();
    start(sessionsDir);
    const repo = repository(sessionsDir);
    assert.equal(repo["sessionsSource"], SOURCE_LEDGER);
    assert.equal(repo["currentSession"], 1);
    assert.equal(repo["nextSession"], 1);
    const rows = sessions(sessionsDir);
    assert.equal(rows[0]["displayNumber"], "001");
    assert.equal(rows[0]["iconKey"], "in-progress");
    assert.equal(rows[0]["inFlight"], true);
    assert.equal(rows[1]["iconKey"], "not-started");
  });

  it("carries an open decision's whole brief, options and consequences included", () => {
    // A surface with the labels but not their consequences would be a menu
    // with no prices.
    const { repo, sessionsDir } = makeStateDirs();
    raiseOwed(repo, {
      id: "driver-stop-s1", decisionClass: CLASS_VALUE_TRADEOFF,
      question: "Session 001 stopped (budget). Run it again, or cancel it?",
      determined: "the loop met driver.max_invocations (1)",
      options: [
        { label: "Run `next` again", consequence: "It resumes from 'steps'." },
        { label: "Cancel the session", consequence: "It ends with a reason on the record." },
      ],
      recommendation: "Run `next` again", confidence: "high",
      onNoAnswer: "The session stays in flight and its record stops moving.",
    });
    const [decision] = repository(sessionsDir)["owedDecisions"] as Record<string, unknown>[];
    assert.equal(decision["id"], "driver-stop-s1");
    assert.equal(decision["blocking"], false);
    assert.equal(decision["recommendation"], "Run `next` again");
    assert.deepEqual(decision["options"], [
      { label: "Run `next` again", consequence: "It resumes from 'steps'." },
      { label: "Cancel the session", consequence: "It ends with a reason on the record." },
    ]);
  });

  it("calls an unreadable ledger a fault rather than a fresh repository", () => {
    const { sessionsDir } = makeStateDirs();
    writeFileSync(join(sessionsDir, "sessions.json"), "{ not json", "utf8");
    const repo = repository(sessionsDir);
    assert.equal(repo["sessionsSource"], SOURCE_LEDGER);
    assert.match(String(repo["invariantViolation"]), /could not be read/);
    assert.deepEqual(buildProjection(sessionsDir)["sessions"], []);
  });

  it("reports a record whose invariants do not hold instead of throwing", () => {
    const { sessionsDir } = makeStateDirs();
    writeFileSync(
      join(sessionsDir, "sessions.json"),
      JSON.stringify({ schemaVersion: 5, sessions: [{ number: 1, status: "in-progress" }, { number: 2, status: "in-progress" }] }),
      "utf8",
    );
    assert.match(String(repository(sessionsDir)["invariantViolation"]), /more than one in-progress/);
  });

  it("renders a session that has not run under the plan's title, and keeps a run one's own", () => {
    const { sessionsDir } = makeStateDirs();
    start(sessionsDir);
    writePlan(sessionsDir, [[1, "Renamed after the recut"], [2, "Second things renamed"]]);
    const rows = sessions(sessionsDir);
    assert.equal(rows[0]["title"], "First things");
    assert.equal(rows[1]["title"], "Second things renamed");
  });
});

describe("the task rows", () => {
  it("has six phases, and registering is the first of them done", () => {
    const { sessionsDir } = makeStateDirs();
    start(sessionsDir);
    const rows = buildTaskRows(sessionsDir, 1);
    assert.deepEqual(rows.map((row) => row["stepId"]), ["register", "declare", "work", "verify", "run-of-record", "close"]);
    assert.deepEqual(rows.map((row) => row["state"]), ["done", "in flight", "pending", "pending", "pending", "pending"]);
    assert.equal(rows[1]["isOpen"], true);
    assert.equal(typeof rows[0]["startedAt"], "string");
    assert.equal(rows[2]["startedAt"], null);
  });

  it("the declaration ends Declare and opens Work, carrying the task as its intent", () => {
    const { sessionsDir } = makeStateDirs();
    start(sessionsDir);
    declareSessionTask(sessionsDir, { sessionNumber: 1, task: "Do it.", releasable: false });
    assert.deepEqual(states(sessionsDir).slice(0, 3), ["done", "done", "in flight"]);
    assert.equal(openId(sessionsDir), "work");
    assert.match(String(buildTaskRows(sessionsDir, 1)[1]["intent"]), /Do it\./);
  });

  it("opens Work out into one row per planned step, done by accepted_steps alone", () => {
    // csv-model feedback items 14 and 15: the task list did not say what
    // the session was actually doing. The steps are the plan's, and done is
    // the driver's `accepted_steps` -- written when it accepted the report
    // AND its checks passed, so there is no state here an engine asserts
    // about itself.
    const { repo, sessionsDir } = makeStateDirs();
    start(sessionsDir);
    declareSessionTask(sessionsDir, { sessionNumber: 1, task: "Do it.", releasable: false });

    // Before a plan exists the Work row stands alone: a row is a reading of
    // a record, and an undeclared step has none.
    assert.deepEqual(
      buildTaskRows(sessionsDir, 1).map((row) => row["stepId"]),
      ["register", "declare", "work", "verify", "run-of-record", "close"],
    );

    writeWorkPlan(repo, 1, {
      schema_version: 1,
      session_number: 1,
      task: "Do it.",
      releasable: false,
      recorded_at: "2026-08-31T11:05:00-04:00",
      steps: [
        { id: "widget", ask: "Build the widget.", files: ["src/w.ts"], checks: [{ argv: ["true"] }] },
        { id: "polish", ask: "Polish it.", files: ["src/w.ts"], checks: [{ argv: ["true"] }] },
      ],
    });
    writeRun(repo, 1, { ...RUN, accepted_steps: ["widget"] });

    const rows = buildTaskRows(sessionsDir, 1);
    // Directly after their parent, so the flat list reads in order and the
    // renderer can nest on the prefix alone.
    assert.deepEqual(rows.map((row) => row["stepId"]), [
      "register", "declare", "work", "work:widget", "work:polish", "verify", "run-of-record", "close",
    ]);
    // Position is the row's place in what a reader sees, renumbered over
    // the whole list rather than left as the six phases' own count.
    assert.deepEqual(rows.map((row) => row["position"]), [0, 1, 2, 3, 4, 5, 6, 7]);
    assert.equal(rows[3]["state"], "done");
    assert.equal(rows[4]["state"], "in flight");
    assert.equal(rows[4]["isOpen"], true);
    // The step's own words, which is what a reader wants the row to say.
    assert.equal(rows[3]["intent"], "Build the widget.");
    // No invented clock: `accepted_steps` carries no timestamps and
    // `step-execution.jsonl` has a writer nothing calls.
    assert.equal(rows[3]["startedAt"], null);
    assert.equal(rows[4]["startedAt"], null);

    // A driver that stopped marks the step it stopped on, rather than
    // showing it as still being worked.
    writeRun(repo, 1, {
      ...RUN,
      accepted_steps: ["widget"],
      stop: { kind: "engine", reason: "it could not be done", at: "2026-08-31T12:30:00-04:00" },
    });
    const stopped = buildTaskRows(sessionsDir, 1);
    assert.equal(stopped[4]["state"], "blocked");
    assert.equal(stopped[4]["isOpen"], false);
  });

  it("every accepted step ends Work once the driver's phase has moved past the steps", () => {
    const { repo, sessionsDir } = makeStateDirs();
    start(sessionsDir);
    declareSessionTask(sessionsDir, { sessionNumber: 1, task: "Do it.", releasable: false });
    assert.equal(states(sessionsDir)[2], "in flight");
    writeRun(repo, 1, { ...RUN, phase: "verify", invocations: 0, accepted_steps: ["widget"], started_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    assert.equal(states(sessionsDir)[2], "done");
    assert.equal(openId(sessionsDir), "verify");
  });

  it("the affected tests recorded passing end Work, for this session's rows only", () => {
    // A row stamped with another session is not this one's; a row stamped
    // with none is attributed by the session's window.
    const { repo, sessionsDir } = makeStateDirs();
    start(sessionsDir);
    declareSessionTask(sessionsDir, { sessionNumber: 1, task: "Do it.", releasable: false });
    fileRun(repo, "preverify-targeted", { sessionNumber: 2 });
    assert.equal(openId(sessionsDir), "work");
    fileRun(repo, "preverify-targeted");
    assert.equal(openId(sessionsDir), "verify");
  });

  it("a blocking round keeps Verify open with the round in its words; a clean one ends it", () => {
    const { repo, sessionsDir } = makeStateDirs();
    start(sessionsDir);
    declareSessionTask(sessionsDir, { sessionNumber: 1, task: "Do it.", releasable: false });
    fileRun(repo, "preverify-targeted");
    recordRound(repo, { round: 1, verdict: "ISSUES_FOUND", blocking: true });
    let rows = buildTaskRows(sessionsDir, 1);
    assert.equal(rows[3]["state"], "in flight");
    assert.match(String(rows[3]["intent"]), /round 1/);
    recordRound(repo, { round: 2, verdict: "VERIFIED", blocking: false, previous_tree: fakeTree("b") });
    rows = buildTaskRows(sessionsDir, 1);
    assert.equal(rows[3]["state"], "done");
    assert.equal(rows[4]["isOpen"], true);
  });

  it("verification that stopped at the cap is blocked on the cancelled glyph, and nothing is open", () => {
    const { repo, sessionsDir } = makeStateDirs();
    start(sessionsDir);
    declareSessionTask(sessionsDir, { sessionNumber: 1, task: "Do it.", releasable: false });
    fileRun(repo, "preverify-targeted");
    recordRound(repo, { round: 1, verdict: "ISSUES_FOUND", blocking: true });
    recordRound(repo, {
      round: 2, verdict: "REMEDIATED_AT_CAP", blocking: false, type: "remediated_at_cap", previous_tree: fakeTree("b"),
      remediated: { reviewed_round: 1, findings: [{ description: "fixed", severity: "major" }], fix_paths: [] },
    });
    const rows = buildTaskRows(sessionsDir, 1);
    assert.equal(rows[3]["state"], "blocked");
    assert.equal(rows[3]["iconKey"], "cancelled");
    assert.equal(rows.every((row) => row["isOpen"] === false), true);
  });

  it("the run of record counts only after the verdict, and the close ends the list", () => {
    const { repo, sessionsDir } = makeStateDirs();
    start(sessionsDir);
    declareSessionTask(sessionsDir, { sessionNumber: 1, task: "Do it.", releasable: false });
    fileRun(repo, "preverify-targeted");
    fileRun(repo, "final-full");
    assert.equal(states(sessionsDir)[4], "pending");
    recordRound(repo, { round: 1, verdict: "VERIFIED", blocking: false });
    assert.equal(states(sessionsDir)[4], "in flight");
    fileRun(repo, "final-full");
    assert.equal(states(sessionsDir)[4], "done");
    assert.equal(openId(sessionsDir), "close");
    flipStateToClosed(sessionsDir, { verdict: "VERIFIED", forced: false });
    assert.deepEqual(states(sessionsDir), ["done", "done", "done", "done", "done", "done"]);
    assert.equal(openId(sessionsDir), null);
  });

  it("has no tasks and no refusal in a repository nothing has run in", () => {
    assert.deepEqual(buildTaskRows(makeStateDirs().sessionsDir, 1), []);
  });

  it("reads a run record carrying a member it has never heard of, and still refuses a damaged one", () => {
    const { repo, sessionsDir } = makeStateDirs();
    start(sessionsDir);
    declareSessionTask(sessionsDir, { sessionNumber: 1, task: "Do it.", releasable: false });
    const path = join(repo, ".dabbler", "runs", "s1", "driver", "run.json");
    mkdirSync(dirname(path), { recursive: true });
    const stop = { kind: "blocked", reason: "the widget is load-bearing", at: "2026-08-31T12:00:00-04:00" };
    writeFileSync(path, JSON.stringify({ ...RUN, stop: { ...stop, class: "deadlock" }, weather: "unseasonable" }), "utf8");
    const rows = buildTaskRows(sessionsDir, 1);
    assert.equal(rows.length, 6);
    assert.match(rows.map((row) => String(row["intent"])).join("\n"), /Driver stopped \(blocked\): the widget is load-bearing/);
    writeFileSync(path, JSON.stringify({ ...RUN, phase: 7 }), "utf8");
    assert.throws(() => buildTaskRows(sessionsDir, 1), TaskRowsRefused);
  });

  it("carries a refused activity log on the session rather than as an empty task list", () => {
    const { sessionsDir } = makeStateDirs();
    start(sessionsDir);
    assert.equal(((sessions(sessionsDir).find((s) => s["inFlight"])?.["tasks"]) as unknown[]).length, 6);
    writeFileSync(join(sessionsDir, "activity-log.json"), "{ not json\n", "utf8");
    assert.throws(() => buildTaskRows(sessionsDir, 1), TaskRowsRefused);
    const inFlight = sessions(sessionsDir).find((s) => s["inFlight"]);
    assert.deepEqual(inFlight?.["tasks"], []);
    assert.match(String(inFlight?.["tasksRefused"]), /activity-log\.json/);
  });
});

describe("the verification view", () => {
  it("answers null for a session with no rounds", () => {
    assert.equal(buildVerificationView(makeStateDirs().repo, 1, 3), null);
  });

  it("reads a clean round as verified and keeps the nits it noted", () => {
    const { repo } = makeStateDirs();
    recordRound(repo, { round: 1, verdict: "VERIFIED", blocking: false, findings: [{ description: "a nit", severity: "minor" }] });
    const view = buildVerificationView(repo, 1, 3) as Record<string, unknown>;
    assert.equal(view["terminal"], "VERIFIED");
    assert.equal(view["clean"], true);
    const [finding] = view["findings"] as Record<string, unknown>[];
    assert.equal(finding["blocking"], false);
    assert.equal(finding["disposition"], "noted");
  });

  it("calls a blocking round unresolved only once it is at the cap, and says nothing about a cap it did not get", () => {
    const { repo } = makeStateDirs();
    recordRound(repo, { round: 1, verdict: "ISSUES_FOUND", blocking: true, findings: [{ description: "a bug", severity: "major" }] });
    const below = buildVerificationView(repo, 1, 3) as Record<string, unknown>;
    assert.equal(below["terminal"], null);
    assert.equal(String(below["headline"]), "blocking findings outstanding after round 1 of 3");
    assert.equal((below["findings"] as Record<string, unknown>[])[0]["disposition"], "outstanding");
    assert.equal((buildVerificationView(repo, 1, 1) as Record<string, unknown>)["terminal"], "ISSUES_FOUND");
    assert.equal(String((buildVerificationView(repo, 1, null) as Record<string, unknown>)["headline"]), "blocking findings outstanding after round 1");
  });

  it("reads a cap remediation as that terminal, with the paths the fix touched and the round that stopped it", () => {
    const { repo } = makeStateDirs();
    recordRound(repo, {
      round: 1, verdict: "ISSUES_FOUND", blocking: true, transport: "api",
      agency: { mode: "tools", reads: 4, operations: [{ kind: "read", target: "a", in_scope: true }] },
    });
    recordRound(repo, {
      round: 2, verdict: "REMEDIATED_AT_CAP", blocking: false, type: "remediated_at_cap", previous_tree: fakeTree("b"),
      remediated: { reviewed_round: 1, findings: [{ description: "fixed", severity: "major" }], fix_paths: ["src/widget.py"] },
    });
    const view = buildVerificationView(repo, 1, 2) as Record<string, unknown>;
    assert.equal(view["terminal"], "REMEDIATED_AT_CAP");
    assert.deepEqual(view["fixPaths"], ["src/widget.py"]);
    const [finding] = view["findings"] as Record<string, unknown>[];
    assert.equal(finding["disposition"], "fixed, unreviewed");
    assert.equal(finding["round"], 1);
    assert.equal(view["stoppedAtRound"], 1);
    assert.equal(view["transport"], "api");
    const agency = view["agency"] as Record<string, unknown>;
    assert.equal(agency["mode"], "tools");
    assert.equal((agency["operations"] as Record<string, unknown>[])[0]["inScope"], true);
  });

  it("reads a row that predates the agency record as unknown, never as none", () => {
    const { repo } = makeStateDirs();
    recordRound(repo, { round: 1, verdict: "VERIFIED", blocking: false });
    const agency = (buildVerificationView(repo, 1, 3) as Record<string, unknown>)["agency"] as Record<string, unknown>;
    assert.equal(agency["mode"], null);
    assert.equal(agency["reads"], 0);
  });

  it("refuses rather than reading past a ledger line it cannot parse, and carries the view on every session that has rounds", () => {
    const { repo, sessionsDir } = makeStateDirs();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    recordRound(repo, { round: 1, verdict: "VERIFIED", blocking: false });
    const rows = sessions(sessionsDir);
    assert.equal((rows[0]["verification"] as Record<string, unknown>)["clean"], true);
    assert.equal(rows[0]["verificationRefused"], null);
    assert.equal(rows[1]["verification"], null);
    writeFileSync(roundsPath(repo, 1), "{ not json\n", "utf8");
    assert.throws(() => buildVerificationView(repo, 1, 3), VerificationRefused);
  });

  it("judges against the repository's own round cap, and a number even where no configuration can be read", () => {
    assert.equal(typeof verificationCap(join(tempDir(), "nowhere")), "number");
    assert.ok((verificationCap(makeStateDirs().repo) ?? 0) > 0);
  });
});

describe("a session the plan declares and the ledger has not reached", () => {
  it("projects as 'planned', outside the ledger's vocabulary, on the not-started glyph, with no run artifacts", () => {
    const { sessionsDir } = makeStateDirs();
    start(sessionsDir);
    writePlan(sessionsDir, [[1, "First"], [9, "Much later"]]);
    const row = sessions(sessionsDir).find((s) => s["number"] === 9);
    assert.equal(row?.["status"], STATUS_PLANNED);
    assert.equal(SESSION_STATUSES.includes(STATUS_PLANNED), false);
    assert.equal(row?.["iconKey"], "not-started");
    assert.deepEqual(row?.["tasks"], []);
    assert.equal(row?.["verification"], null);
    assert.equal(row?.["inFlight"], false);
  });

  it("counts toward the total, so a caught-up ledger is not reported finished", () => {
    // csv-model's item 9, reproduced: a planning session's whole deliverable
    // is new headings, and until this the record said 2 of 2 complete.
    const { sessionsDir } = makeStateDirs();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    assert.equal(repository(sessionsDir)["totalSessions"], 2);
    writePlan(sessionsDir, [[1, "First"], [2, "Second"], [3, "Third"], [4, "Fourth"]]);
    assert.equal(repository(sessionsDir)["totalSessions"], 4);
    assert.equal(repository(sessionsDir)["plannedSessions"], 2);
  });

  it("reconciles a hand-edited plan: a held number once, a duplicate once, a gap left alone, an unreadable heading ignored", () => {
    const { sessionsDir } = makeStateDirs();
    start(sessionsDir);
    writePlan(sessionsDir, [[1, "Changed its mind"], [7, "Alpha"], [7, "Beta"], [4, "Fourth"]], "\n## Session eleven: not a heading\n");
    const rows = sessions(sessionsDir);
    assert.equal(rows.filter((s) => s["number"] === 1).length, 1);
    assert.notEqual(rows.find((s) => s["number"] === 1)?.["status"], STATUS_PLANNED);
    assert.equal(rows.filter((s) => s["number"] === 7).length, 1);
    const numbers = rows.map((s) => s["number"]);
    assert.ok(numbers.includes(4) && !numbers.includes(5) && !numbers.includes(11));
  });

  it("registers next the lowest session that has not run, planned ones included, or nothing", () => {
    const { sessionsDir } = makeStateDirs();
    start(sessionsDir);
    flipStateToClosed(sessionsDir, { verdict: "VERIFIED" });
    writePlan(sessionsDir, [[1, "First"], [2, "Second"], [3, "Third"]]);
    assert.equal(repository(sessionsDir)["nextSession"], 2);
    // The register grows the ledger to the plan as it stands, so the plan
    // shrinks back before session 2 registers.
    writePlan(sessionsDir, [[1, "First"], [2, "Second"]]);
    registerSessionStart(sessionsDir, 2, { engine: "claude-code" });
    flipStateToClosed(sessionsDir, { verdict: "VERIFIED" });
    assert.equal(repository(sessionsDir)["nextSession"], null);
    assert.equal(repository(sessionsDir)["plannedSessions"], 0);
  });
});

describe("liveness, derived rather than stamped", () => {
  it("reads the latest timestamp the framework already wrote, from the driven session's own directory", () => {
    // The gap session 66 was measured in: eight steps accepted over two
    // hours moved the driver's files and nothing in the ledger, so liveness
    // answered with the registration and called a working session stalled.
    const { repo, sessionsDir } = makeStateDirs();
    start(sessionsDir);
    const registered = lastActivityAt(sessionsDir, repo, 1) as string;
    assert.ok(Date.parse(registered) > 0);
    const later = "2099-01-01T00:00:00-04:00";
    writeRun(repo, 1, { ...RUN, seq: 1, invocations: 0, started_at: registered, updated_at: later });
    assert.equal(lastActivityAt(sessionsDir, repo, 1), later);
    assert.equal(possiblyStalled(later, 1, 60, new Date("2099-01-01T00:00:30-04:00")), false);
  });

  it("says nothing about a repository nothing has run in, and calls none stalled between sessions", () => {
    const { repo, sessionsDir } = makeStateDirs();
    assert.equal(lastActivityAt(sessionsDir, repo, null), null);
    assert.equal(possiblyStalled("2000-01-01T00:00:00+00:00", null, 60), false);
  });

  it("calls a session stalled only once the threshold has passed, and publishes the threshold", () => {
    const now = new Date("2026-01-01T12:00:00Z");
    assert.equal(possiblyStalled("2026-01-01T11:59:00+00:00", 1, 1800, now), false);
    assert.equal(possiblyStalled("2026-01-01T10:00:00+00:00", 1, 1800, now), true);
    const { sessionsDir } = makeStateDirs();
    start(sessionsDir);
    const repo = repository(sessionsDir);
    assert.equal(repo["stalledAfterSeconds"], DEFAULT_STALLED_AFTER_SECONDS);
    assert.equal(repo["possiblyStalled"], false);
  });
});
