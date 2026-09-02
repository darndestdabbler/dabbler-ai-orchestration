// The sentinel band: one adverse decision per workflow context, plus one
// whole-pipeline walk, asserting on durable artifacts only. These are the
// fail-fast layer the local close runs -- about a minute, recorded answers
// throughout, no real processes. A sentinel that asserts a call count or a
// log line would be theater; every oracle here is a file the record owns.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { appendRound, readRounds } from "../src/ledger.ts";
import { readRawSessionState } from "../src/sessionState.ts";
import { evaluateFreshness, loadSuitesChecked, recordRun } from "../src/testEvidence.ts";
import {
  SESSION_STATUSES,
  buildTaskRows,
  buildVerificationView,
  verificationCap,
} from "../src/progress.ts";
import { loadConfig } from "../src/config.ts";
import {
  declareSessionTask,
  flipStateToClosed,
  registerSessionStart,
} from "../src/writers.ts";
import { start } from "../src/session.ts";
import { captured, makeTempDir, removeTempDirs } from "./support/fixtures.ts";
import { gitAnswers } from "./support/gitAnswers.ts";

afterAll(removeTempDirs);

const SEED: Record<string, string> = {
  "docs/sessions/session-plan.md":
    "### Session 1 of 1: The one\n1. Register.\n2. **Work.**\n3. Verify.\n4. Close.\n",
  "dabbler.yaml":
    "schema_version: 1\n\ntesting:\n  suites:\n    - name: unit\n" +
    "      command: python -m pytest\n      expensive: true\n" +
    "      covers:\n        - src/\n      test_roots:\n        - tests\n" +
    "      test_glob: \"test_*.py\"\n",
  "src/widget.py": "def widget():\n    return 1\n",
};

function makeStateDirs(): { repo: string; sessionsDir: string } {
  const repo = makeTempDir();
  for (const [rel, text] of Object.entries(SEED)) {
    const path = join(repo, ...rel.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
  }
  gitAnswers([
    [["rev-parse", "--show-toplevel"], { stdout: repo.split("\\").join("/") }],
    [["status", "--porcelain", "-uall"], { stdout: "" }],
    [["status", "--porcelain"], { stdout: "" }],
    [(args) => args[0] === "cat-file" && args[1] === "-e", { code: 0 }],
    [["commit-tree"], { stdout: "c".repeat(40) }],
    [["update-ref"], { code: 0 }],
    // The evidence surface: one tracked file, enumerated by the seam and
    // hashed from disk by the framework.
    // The enumeration rides behind `-c core.quotepath=false`, so the rows
    // match by content rather than by prefix.
    [
      (args) => args.includes("ls-files") && args.includes("--others"),
      { stdout: "" },
    ],
    [
      (args) => args.includes("ls-files") && !args.includes("--others"),
      { stdout: "src/widget.py" + String.fromCharCode(0) },
    ],
  ]);
  return { repo, sessionsDir: join(repo, "docs", "sessions") };
}

function round(repo: string, row: Record<string, unknown>, session = 1): void {
  appendRound(repo, session, {
    verifier_model: "offline:01.md",
    verifier_provider: "offline",
    findings: [],
    completion_tree: "a".repeat(40),
    recorded_at: new Date().toISOString(),
    ...row,
  });
}

describe("the sentinel band", () => {
  it("startup: a corrupt ledger blocks registration before any instruction exists", async () => {
    const { repo, sessionsDir } = makeStateDirs();
    writeFileSync(join(sessionsDir, "sessions.json"), "{ not json", "utf8");
    const result = await captured(async () => start(sessionsDir, { engine: "claude-code" }));
    expect(result.code).not.toBe(0);
    // Durable oracles: the corrupt bytes were not clobbered into a fresh
    // ledger, and no run record began.
    expect(readFileSync(join(sessionsDir, "sessions.json"), "utf8")).toBe("{ not json");
    expect(readRawSessionState(sessionsDir)).toBeNull();
    expect(() =>
      readFileSync(join(repo, ".dabbler", "runs", "s1", "driver", "run.json")),
    ).toThrow();
  });

  it("instruction-execution: work is not done until every step is accepted", () => {
    const { sessionsDir } = makeStateDirs();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    declareSessionTask(sessionsDir, { sessionNumber: 1, task: "Do it.", releasable: false });
    // No driver record, no accepted steps: the Work row must hold open --
    // an adverse state the fold may not paper over with optimism.
    const rows = buildTaskRows(sessionsDir, 1);
    expect(rows[2]?.["state"]).toBe("in flight");
    expect(rows.slice(3).every((row) => row["state"] === "pending")).toBe(true);
  });

  it("testing-fixing: a red run of record leaves the phase open and verification untouched", () => {
    const { repo, sessionsDir } = makeStateDirs();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    declareSessionTask(sessionsDir, { sessionNumber: 1, task: "Do it.", releasable: false });
    const suite = loadSuitesChecked(loadConfig(undefined, repo)).suites[0]!;
    recordRun(sessionsDir, suite, "failed", {
      stage: "final-full",
      durationSeconds: 1,
      command: null,
      sessionNumber: 1,
      repoRoot: repo,
    });
    const rows = buildTaskRows(sessionsDir, 1);
    // The red row is on the record; nothing downstream of it advanced.
    expect(rows[4]?.["state"]).not.toBe("done");
    expect(readRounds(repo, 1)).toEqual([]);
  });

  it("verification-remediation: a blocking round holds the terminal open for remediation", () => {
    const { repo, sessionsDir } = makeStateDirs();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    round(repo, {
      round: 1,
      verdict: "ISSUES_FOUND",
      blocking: true,
      findings: [{ severity: "major", description: "wrong", blocking: true }],
    });
    const view = buildVerificationView(repo, 1, verificationCap(repo));
    // The rounds ledger carries the rejection; no terminal verdict exists,
    // so a close built on this record has nothing to cite.
    expect(view?.["terminal"] ?? null).toBeNull();
    const state = readRawSessionState(sessionsDir);
    const session = (state?.["sessions"] as Array<Record<string, unknown>>)[0]!;
    expect(session["verificationVerdict"] ?? null).toBeNull();
  });

  it("close-out: evidence recorded against one tree refuses a mutated one", () => {
    const { repo, sessionsDir } = makeStateDirs();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const suite = loadSuitesChecked(loadConfig(undefined, repo)).suites[0]!;
    recordRun(sessionsDir, suite, "passed", {
      stage: "final-full",
      durationSeconds: 1,
      command: null,
      sessionNumber: 1,
      repoRoot: repo,
    });
    const fresh = evaluateFreshness(sessionsDir, null, [suite]);
    expect(fresh[0]?.passed).toBe(true);
    // The adverse decision: one tracked byte moves after the evidence.
    writeFileSync(join(repo, "src", "widget.py"), "def widget():\n    return 2\n", "utf8");
    const stale = evaluateFreshness(sessionsDir, null, [suite]);
    expect(stale[0]?.passed).toBe(false);
  });

  it("whole pipeline: one session's artifacts stay coherent from register to close", () => {
    const { repo, sessionsDir } = makeStateDirs();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code", provider: "anthropic" });
    declareSessionTask(sessionsDir, { sessionNumber: 1, task: "Do it.", releasable: false });
    const suite = loadSuitesChecked(loadConfig(undefined, repo)).suites[0]!;
    round(repo, { round: 1, verdict: "VERIFIED", blocking: false });
    // The run of record follows the verdict, strictly later on the clock.
    const spin = Date.now();
    while (Date.now() <= spin) { /* next stamp lands on its own ms */ }
    const record = recordRun(sessionsDir, suite, "passed", {
      stage: "final-full",
      durationSeconds: 1,
      command: null,
      sessionNumber: 1,
      repoRoot: repo,
    });
    flipStateToClosed(sessionsDir, { verdict: "VERIFIED", forced: false });

    const state = readRawSessionState(sessionsDir)!;
    const session = (state["sessions"] as Array<Record<string, unknown>>)[0]!;
    expect(session["status"]).toBe("complete");
    expect(SESSION_STATUSES).toContain(session["status"]);
    expect(session["verificationVerdict"]).toBe("VERIFIED");
    const rounds = readRounds(repo, 1);
    expect(rounds).toHaveLength(1);
    expect(rounds[0]?.["verdict"]).toBe("VERIFIED");
    expect((record as unknown as Record<string, unknown>)["sessionNumber"]).toBe(1);
    expect(buildTaskRows(sessionsDir, 1).every((row) => row["state"] === "done")).toBe(
      true,
    );
  });
});
