// The Work Explorer projection, and the two legacy readers beneath it.
//
// The extension renders this JSON and re-implements none of it, so every
// question it can ask has to be answered here: where the sessions came
// from, which of them is in flight, what its steps are doing, what stopped
// its verification, and -- the part a projection gets wrong most easily --
// how it says it could not tell.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, afterEach, describe, expect, it } from "vitest";

import { snapshotWorktreeTree } from "../src/journal.ts";
import {
  appendRound,
  appendStepEvent,
  roundsPath,
  sessionRunDir,
} from "../src/ledger.ts";
import {
  SOURCE_LEDGER,
  SOURCE_PLAN,
  TaskRowsRefused,
  VerificationRefused,
  buildProjection,
  buildTaskRows,
  buildVerificationView,
  healStaleTitles,
  ledgerExists,
  needsTitleHeal,
  normalizeLegacyState,
  readRawLegacyState,
  sessionsFromPlan,
  synthesizeV3FromV2,
  useApprovedPlanReader,
  verificationCap,
} from "../src/progress.ts";
import { registerSessionStart } from "../src/writers.ts";
import { git, makeSandboxRepo, makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

/** The reader session 32 registers; here it is a stand-in with no integrity check. */
let plannedSteps: Record<string, unknown>[] | null = null;
let planThrows: string | null = null;

useApprovedPlanReader({
  planFilename: "approved-plan.json",
  effectivePlan: () => {
    if (planThrows !== null) throw new Error(planThrows);
    return { steps: plannedSteps ?? [] };
  },
});

afterEach(() => {
  plannedSteps = null;
  planThrows = null;
});

function writePlanFile(repo: string, sessionNumber: number): string {
  const runDir = sessionRunDir(repo, sessionNumber);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "approved-plan.json"), "{}", "utf8");
  return runDir;
}

/** A schema-valid step event; the fold is what the tests are about. */
function stepEvent(
  event: "opened" | "closed",
  stepId: string,
  minute: number,
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    schema_version: 1,
    event,
    step_id: stepId,
    session_number: 1,
    recorded_at: `2026-01-01T00:0${minute}:00+00:00`,
    base_commit: "c".repeat(40),
  };
  if (event === "closed") {
    row["closed_tree"] = "d".repeat(40);
    row["envelope"] = { inside: ["src/widget.py"] };
    row["deterministic"] = [{ kind: "lint", status: "pass", required: true }];
  }
  return row;
}

function recordRound(
  repo: string,
  row: Record<string, unknown>,
  sessionNumber = 1,
): void {
  appendRound(repo, sessionNumber, {
    verifier_model: "gpt-5-4",
    verifier_provider: "openai",
    findings: [],
    cost_usd: 0.05,
    completion_tree: snapshotWorktreeTree(repo),
    recorded_at: new Date().toISOString(),
    ...row,
  });
}

// --- The legacy readers -------------------------------------------------------

describe("reading a pre-v5 record", () => {
  it("answers null for a directory that carries none", () => {
    expect(readRawLegacyState(makeTempDir())).toBeNull();
  });

  it("answers null for one that does not parse rather than throwing", () => {
    const dir = makeTempDir();
    writeFileSync(join(dir, "session-state.json"), "{ not json", "utf8");
    expect(readRawLegacyState(dir)).toBeNull();
  });

  it("synthesizes sessions from a v2 file's bare counters", () => {
    const dir = makeTempDir();
    const plan = join(dir, "spec.md");
    writeFileSync(plan, "### Session 2 of 3: The middle one\n", "utf8");
    const out = synthesizeV3FromV2(
      { totalSessions: 3, completedSessions: [1], currentSession: 2, status: "in-progress" },
      plan,
    );
    const sessions = out["sessions"] as Record<string, unknown>[];
    expect(sessions.map((s) => s["status"])).toEqual([
      "complete",
      "in-progress",
      "not-started",
    ]);
    expect(sessions[1]["title"]).toBe("The middle one");
  });

  it("does not count currentSession into the total it derives", () => {
    // Including it once inflated a plan-less set to 0/1.
    const dir = makeTempDir();
    const out = synthesizeV3FromV2({ currentSession: 4 }, join(dir, "absent.md"));
    expect(out["sessions"]).toEqual([]);
  });

  it("takes only a real positive integer as a session number", () => {
    const dir = makeTempDir();
    const out = synthesizeV3FromV2(
      { totalSessions: "2", completedSessions: [0, -1, 1.5] },
      join(dir, "absent.md"),
    );
    expect(out["sessions"]).toEqual([]);
  });

  it("promotes a v3 file's single-valued metadata onto the sessions it belongs to", () => {
    const dir = makeTempDir();
    const out = normalizeLegacyState(
      {
        schemaVersion: 3,
        status: "in-progress",
        orchestrator: { engine: "claude-code" },
        startedAt: "2026-01-01T00:00:00Z",
        sessions: [
          { number: 1, title: "One", status: "complete" },
          { number: 2, title: "Two", status: "in-progress" },
        ],
      },
      join(dir, "absent.md"),
    );
    const sessions = out["sessions"] as Record<string, unknown>[];
    expect(sessions[1]["orchestrator"]).toEqual({ engine: "claude-code" });
    expect(sessions[1]["startedAt"]).toBe("2026-01-01T00:00:00Z");
    expect(out["currentSession"]).toBe(2);
  });

  it("leaves a v4 file's per-session metadata where it already is", () => {
    const dir = makeTempDir();
    const out = normalizeLegacyState(
      {
        schemaVersion: 4,
        status: "in-progress",
        orchestrator: { engine: "codex" },
        sessions: [{ number: 1, title: "One", status: "in-progress" }],
      },
      join(dir, "absent.md"),
    );
    expect((out["sessions"] as Record<string, unknown>[])[0]["orchestrator"]).toBeNull();
  });

  it("carries the passthrough keys forward and drops nothing else", () => {
    const dir = makeTempDir();
    const out = normalizeLegacyState(
      { schemaVersion: 4, sessions: [], forceClosed: true, nextOrchestrator: "gemini" },
      join(dir, "absent.md"),
    );
    expect(out["forceClosed"]).toBe(true);
    expect(out["nextOrchestrator"]).toBe("gemini");
    expect(out["schemaVersion"]).toBe(4);
  });

  it("keeps a non-mapping session entry as a placeholder rather than dropping it", () => {
    const dir = makeTempDir();
    const out = normalizeLegacyState(
      { schemaVersion: 4, sessions: ["nonsense"] },
      join(dir, "absent.md"),
    );
    expect(out["sessions"]).toEqual([{ number: null, title: null, status: null }]);
  });
});

describe("healing a whole ledger's titles", () => {
  it("asks for a heal when any session is generic or historyless", () => {
    expect(needsTitleHeal([{ number: 1, title: "Session 1", status: "complete" }])).toBe(
      true,
    );
    expect(
      needsTitleHeal([
        { number: 1, title: "Real work", status: "complete", startedAt: "x" },
      ]),
    ).toBe(false);
  });

  it("skips an entry whose number is not a session number", () => {
    expect(needsTitleHeal([{ number: "1", title: "" }])).toBe(false);
  });

  it("counts the titles it moved and leaves the rest alone", () => {
    const sessions = [
      { number: 1, title: "Session 1", status: "not-started" },
      { number: 2, title: "Kept", status: "complete", completedAt: "x" },
    ];
    const healed = healStaleTitles(sessions, new Map([[1, "From the plan"], [2, "Ignored"]]));
    expect(healed).toBe(1);
    expect(sessions[0]["title"]).toBe("From the plan");
    expect(sessions[1]["title"]).toBe("Kept");
  });
});

// --- Where a projection's sessions come from ----------------------------------

describe("the source of a projection's sessions", () => {
  it("reads the plan when nothing has ever run here", () => {
    const { repo, sessionsDir } = makeSandboxRepo();
    void repo;
    expect(ledgerExists(sessionsDir)).toBe(false);
    expect(sessionsFromPlan(sessionsDir)).toHaveLength(2);
    const projection = buildProjection(sessionsDir);
    expect(
      (projection["repository"] as Record<string, unknown>)["sessionsSource"],
    ).toBe(SOURCE_PLAN);
    expect((projection["sessions"] as unknown[]).length).toBe(2);
  });

  it("reads the ledger once one exists", () => {
    const { sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const repository = buildProjection(sessionsDir)["repository"] as Record<
      string,
      unknown
    >;
    expect(repository["sessionsSource"]).toBe(SOURCE_LEDGER);
    expect(repository["currentSession"]).toBe(1);
  });

  it("calls an unreadable ledger a fault rather than a fresh repository", () => {
    // Answering a broken record with the plan would report a fresh
    // repository where there is a record that needs looking at.
    const { sessionsDir } = makeSandboxRepo();
    writeFileSync(join(sessionsDir, "sessions.json"), "{ not json", "utf8");
    const repository = buildProjection(sessionsDir)["repository"] as Record<
      string,
      unknown
    >;
    expect(repository["sessionsSource"]).toBe(SOURCE_LEDGER);
    expect(String(repository["invariantViolation"])).toContain("could not be read");
    expect(buildProjection(sessionsDir)["sessions"]).toEqual([]);
  });

  it("reports a record whose invariants do not hold instead of throwing", () => {
    const { sessionsDir } = makeSandboxRepo();
    writeFileSync(
      join(sessionsDir, "sessions.json"),
      JSON.stringify({
        schemaVersion: 5,
        sessions: [
          { number: 1, status: "in-progress" },
          { number: 2, status: "in-progress" },
        ],
      }),
      "utf8",
    );
    const repository = buildProjection(sessionsDir)["repository"] as Record<
      string,
      unknown
    >;
    expect(String(repository["invariantViolation"])).toContain("more than one in-progress");
  });

  it("renders a moved session under the plan's title", () => {
    const { sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    writeFileSync(
      join(sessionsDir, "session-plan.md"),
      "### Session 1 of 2: Renamed after the recut\n1. Register.\n\n" +
        "### Session 2 of 2: Second things\n1. Register.\n",
      "utf8",
    );
    const sessions = buildProjection(sessionsDir)["sessions"] as Record<
      string,
      unknown
    >[];
    // Session 1 has run, so it keeps its own title; session 2 has not.
    expect(sessions[1]["title"]).toBe("Second things");
  });

  it("names each session beside its number and gives it an icon key", () => {
    const { sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const sessions = buildProjection(sessionsDir)["sessions"] as Record<
      string,
      unknown
    >[];
    expect(sessions[0]["displayNumber"]).toBe("001");
    expect(sessions[0]["iconKey"]).toBe("in-progress");
    expect(sessions[0]["inFlight"]).toBe(true);
    expect(sessions[1]["iconKey"]).toBe("not-started");
  });
});

// --- The task level -----------------------------------------------------------

describe("the task rows", () => {
  it("has no tasks and no refusal when the session has no plan", () => {
    const { repo, sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    expect(buildTaskRows(repo, 1)).toEqual([]);
    const sessions = buildProjection(sessionsDir)["sessions"] as Record<
      string,
      unknown
    >[];
    expect(sessions[0]["tasks"]).toEqual([]);
    expect(sessions[0]["tasksRefused"]).toBeNull();
  });

  it("folds plan order against the execution record", () => {
    const { repo } = makeSandboxRepo();
    writePlanFile(repo, 1);
    plannedSteps = [
      { step_id: "s1", intent: "First" },
      { step_id: "s2", intent: "Second" },
      { step_id: "s3", intent: "Third" },
    ];
    appendStepEvent(repo, 1, stepEvent("opened", "s1", 0));
    appendStepEvent(repo, 1, stepEvent("closed", "s1", 1));
    appendStepEvent(repo, 1, stepEvent("opened", "s2", 2));
    const rows = buildTaskRows(repo, 1);
    expect(rows.map((row) => row["state"])).toEqual(["done", "in flight", "pending"]);
    expect(rows.map((row) => row["iconKey"])).toEqual([
      "complete",
      "in-progress",
      "not-started",
    ]);
    expect(rows[1]["isOpen"]).toBe(true);
    expect(typeof rows[1]["startedAt"]).toBe("string");
    expect(rows[2]["startedAt"]).toBeNull();
  });

  it("leaves nothing in flight once the open step is closed", () => {
    const { repo } = makeSandboxRepo();
    writePlanFile(repo, 1);
    plannedSteps = [{ step_id: "s1", intent: "Only" }];
    appendStepEvent(repo, 1, stepEvent("opened", "s1", 0));
    appendStepEvent(repo, 1, stepEvent("closed", "s1", 1));
    expect(buildTaskRows(repo, 1).every((row) => row["isOpen"] === false)).toBe(true);
  });

  it("refuses rather than rendering a plan it could not read", () => {
    const { repo } = makeSandboxRepo();
    writePlanFile(repo, 1);
    planThrows = "content is not backed by a sanctioned write";
    expect(() => buildTaskRows(repo, 1)).toThrow(TaskRowsRefused);
  });

  it("refuses rather than rendering an unreadable execution record", () => {
    const { repo } = makeSandboxRepo();
    const runDir = writePlanFile(repo, 1);
    plannedSteps = [{ step_id: "s1", intent: "Only" }];
    writeFileSync(join(runDir, "step-execution.jsonl"), "{ not json\n", "utf8");
    expect(() => buildTaskRows(repo, 1)).toThrow(TaskRowsRefused);
  });

  it("carries the refusal on the session rather than as an empty task list", () => {
    const { repo, sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    writePlanFile(repo, 1);
    planThrows = "unreadable";
    const sessions = buildProjection(sessionsDir)["sessions"] as Record<
      string,
      unknown
    >[];
    expect(sessions[0]["tasks"]).toEqual([]);
    expect(String(sessions[0]["tasksRefused"])).toContain("approved plan");
  });
});

// --- The verification view ----------------------------------------------------

describe("the verification view", () => {
  it("answers null for a session with no rounds", () => {
    const { repo } = makeSandboxRepo();
    expect(buildVerificationView(repo, 1, 3)).toBeNull();
  });

  it("reads a clean round as verified and keeps the nits it noted", () => {
    const { repo } = makeSandboxRepo();
    recordRound(repo, {
      round: 1,
      verdict: "VERIFIED",
      blocking: false,
      findings: [{ description: "a nit", severity: "minor" }],
    });
    const view = buildVerificationView(repo, 1, 3) as Record<string, unknown>;
    expect(view["terminal"]).toBe("VERIFIED");
    expect(view["clean"]).toBe(true);
    const findings = view["findings"] as Record<string, unknown>[];
    expect(findings[0]["blocking"]).toBe(false);
    expect(findings[0]["disposition"]).toBe("noted");
  });

  it("calls a blocking round unresolved only once it is at the cap", () => {
    const { repo } = makeSandboxRepo();
    recordRound(repo, {
      round: 1,
      verdict: "ISSUES_FOUND",
      blocking: true,
      findings: [{ description: "a bug", severity: "major" }],
    });
    const below = buildVerificationView(repo, 1, 3) as Record<string, unknown>;
    expect(below["terminal"]).toBeNull();
    expect(String(below["headline"])).toBe(
      "blocking findings outstanding after round 1 of 3",
    );
    expect((below["findings"] as Record<string, unknown>[])[0]["disposition"]).toBe(
      "outstanding",
    );

    const atCap = buildVerificationView(repo, 1, 1) as Record<string, unknown>;
    expect(atCap["terminal"]).toBe("ISSUES_FOUND");
  });

  it("says nothing about a cap it did not get", () => {
    const { repo } = makeSandboxRepo();
    recordRound(repo, { round: 1, verdict: "ISSUES_FOUND", blocking: true });
    const view = buildVerificationView(repo, 1, null) as Record<string, unknown>;
    expect(view["terminal"]).toBeNull();
    expect(String(view["headline"])).toBe(
      "blocking findings outstanding after round 1",
    );
  });

  it("reads a cap remediation as that terminal, with the paths the fix touched", () => {
    const { repo } = makeSandboxRepo();
    recordRound(repo, { round: 1, verdict: "ISSUES_FOUND", blocking: true });
    recordRound(repo, {
      round: 2,
      verdict: "REMEDIATED_AT_CAP",
      blocking: false,
      type: "remediated_at_cap",
      previous_tree: snapshotWorktreeTree(repo),
      remediated: {
        reviewed_round: 1,
        findings: [{ description: "fixed", severity: "major" }],
        fix_paths: ["src/widget.py"],
      },
    });
    const view = buildVerificationView(repo, 1, 2) as Record<string, unknown>;
    expect(view["terminal"]).toBe("REMEDIATED_AT_CAP");
    expect(view["fixPaths"]).toEqual(["src/widget.py"]);
    expect((view["findings"] as Record<string, unknown>[])[0]["disposition"]).toBe(
      "fixed, unreviewed",
    );
    expect((view["findings"] as Record<string, unknown>[])[0]["round"]).toBe(1);
  });

  it("reads the vendor and the agency log from the round that stopped the session", () => {
    const { repo } = makeSandboxRepo();
    recordRound(repo, {
      round: 1,
      verdict: "ISSUES_FOUND",
      blocking: true,
      transport: "api",
      agency: {
        mode: "tools",
        reads: 4,
        operations: [{ kind: "read", target: "a", in_scope: true }],
      },
    });
    recordRound(repo, {
      round: 2,
      verdict: "REMEDIATED_AT_CAP",
      blocking: false,
      type: "remediated_at_cap",
      previous_tree: snapshotWorktreeTree(repo),
      remediated: {
        reviewed_round: 1,
        findings: [{ description: "fixed", severity: "major" }],
        fix_paths: ["src/widget.py"],
      },
    });
    const view = buildVerificationView(repo, 1, 2) as Record<string, unknown>;
    expect(view["rounds"]).toBe(1);
    expect(view["stoppedAtRound"]).toBe(1);
    expect(view["transport"]).toBe("api");
    const agency = view["agency"] as Record<string, unknown>;
    expect(agency["mode"]).toBe("tools");
    expect(agency["reads"]).toBe(4);
    expect((agency["operations"] as Record<string, unknown>[])[0]["inScope"]).toBe(true);
  });

  it("reads a row that predates the agency record as unknown, never as none", () => {
    const { repo } = makeSandboxRepo();
    recordRound(repo, { round: 1, verdict: "VERIFIED", blocking: false });
    const view = buildVerificationView(repo, 1, 3) as Record<string, unknown>;
    expect((view["agency"] as Record<string, unknown>)["mode"]).toBeNull();
    expect((view["agency"] as Record<string, unknown>)["reads"]).toBe(0);
  });

  it("refuses rather than reading past a ledger line it cannot parse", () => {
    const { repo } = makeSandboxRepo();
    recordRound(repo, { round: 1, verdict: "VERIFIED", blocking: false });
    writeFileSync(roundsPath(repo, 1), "{ not json\n", "utf8");
    expect(() => buildVerificationView(repo, 1, 3)).toThrow(VerificationRefused);
  });

  it("carries the view on every session that has rounds, and the refusal apart", () => {
    const { repo, sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    recordRound(repo, { round: 1, verdict: "VERIFIED", blocking: false });
    const sessions = buildProjection(sessionsDir)["sessions"] as Record<
      string,
      unknown
    >[];
    expect((sessions[0]["verification"] as Record<string, unknown>)["clean"]).toBe(true);
    expect(sessions[0]["verificationRefused"]).toBeNull();
    expect(sessions[1]["verification"]).toBeNull();
  });
});

describe("the round cap the view is judged against", () => {
  it("is unknown, never a guess, when no configuration can be read", () => {
    const dir = makeTempDir();
    expect(verificationCap(join(dir, "nowhere"))).toBeTypeOf("number");
  });

  it("comes from the repository the projection is about", () => {
    const { repo } = makeSandboxRepo();
    git(repo, "status", "--porcelain");
    expect(verificationCap(repo)).toBeGreaterThan(0);
  });
});
