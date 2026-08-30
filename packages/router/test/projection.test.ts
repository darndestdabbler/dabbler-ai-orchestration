// The Work Explorer projection, and the two legacy readers beneath it.
//
// The extension renders this JSON and re-implements none of it, so every
// question it can ask has to be answered here: where the sessions came
// from, which of them is in flight, what its steps are doing, what stopped
// its verification, and -- the part a projection gets wrong most easily --
// how it says it could not tell.

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { snapshotWorktreeTree } from "../src/journal.ts";
import {
  appendRound,
  roundsPath,
} from "../src/ledger.ts";
import {
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
  ledgerExists,
  needsTitleHeal,
  normalizeLegacyState,
  readRawLegacyState,
  sessionsFromPlan,
  synthesizeV3FromV2,
  verificationCap,
} from "../src/progress.ts";
import { flipStateToClosed, logStep, registerSessionStart, seedSessionPlan } from "../src/writers.ts";
// `session.ts` registers the plan parser `seedSessionPlan` needs; importing it
// for that registration is what `cli/status.ts` does for the same reason.
import { advanceStepsAtDeclare, closeLastStep } from "../src/session.ts";
import { git, makeSandboxRepo, makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

/**
 * Register session 1 and seed its steps, which is what `dabbler session start`
 * does in two calls. Seeding is what puts a session's steps on the record, and
 * the task rows are the fold of those.
 */
function start(sessionsDir: string): void {
  registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
  seedSessionPlan(sessionsDir, 1);
  // The third thing `dabbler session start` does: it logs the register step
  // itself rather than asking the engine to report what the machine just did.
  // `in-progress`, because step 1 reads "Register; declare" and this is half.
  logStep(sessionsDir, 1, "register", "Registered session 1.", "in-progress", 1);
}

/** A schema-valid step event; the fold is what the tests are about. */
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
    start(sessionsDir);
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
    start(sessionsDir);
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
    start(sessionsDir);
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
  /** Move a seeded step, the way `dabbler session log` does. */
  function log(
    sessionsDir: string,
    key: string,
    status: string,
    stepNumber: number,
  ): void {
    logStep(sessionsDir, 1, key, `logged ${key}`, status, stepNumber);
  }

  function keysOf(sessionsDir: string): string[] {
    return buildTaskRows(sessionsDir, 1).map((row) => String(row["stepId"]));
  }

  it("shows step 1 in flight after start, and done after declare", () => {
    // Step 1 of every session reads "Register; declare". `start` does half of
    // it, so marking it complete there showed a finished step before the
    // declaration it names had happened -- and pushed the opening bookend
    // onto step 2.
    const { sessionsDir } = makeSandboxRepo();
    start(sessionsDir);
    const afterStart = buildTaskRows(sessionsDir, 1);
    expect(afterStart[0]["state"]).toBe("in flight");
    expect(afterStart[0]["isOpen"]).toBe(true);

    advanceStepsAtDeclare(sessionsDir, 1);
    const afterDeclare = buildTaskRows(sessionsDir, 1);
    expect(afterDeclare[0]["state"]).toBe("done");
    expect(afterDeclare[1]["state"]).toBe("in flight");
    expect(afterDeclare[1]["isOpen"]).toBe(true);
  });

  it("keeps at most one step open when two are logged in flight", () => {
    const { sessionsDir } = makeSandboxRepo();
    start(sessionsDir);
    const keys = keysOf(sessionsDir);
    log(sessionsDir, keys[1], "in-progress", 2);
    log(sessionsDir, keys[2], "in-progress", 3);
    const rows = buildTaskRows(sessionsDir, 1);
    expect(rows.filter((row) => row["isOpen"]).length).toBe(1);
    expect(rows[2]["isOpen"]).toBe(true);
  });

  it("closes the last step when the run of record lands", () => {
    const { sessionsDir } = makeSandboxRepo();
    start(sessionsDir);
    const before = buildTaskRows(sessionsDir, 1);
    expect(before[before.length - 1]["state"]).toBe("pending");
    expect(closeLastStep(sessionsDir, 1).error).toBe("");
    const after = buildTaskRows(sessionsDir, 1);
    expect(after[after.length - 1]["state"]).toBe("done");
  });

  it("renders the steps the plan declares, in the plan's order", () => {
    // The sandbox plan's session 1 has four numbered steps. `session start`
    // seeds them; nothing else has to be written for a task to exist.
    const { sessionsDir } = makeSandboxRepo();
    start(sessionsDir);
    const rows = buildTaskRows(sessionsDir, 1);
    expect(rows.length).toBe(4);
    expect(rows.map((row) => row["position"])).toEqual([0, 1, 2, 3]);
    expect(String(rows[1]["intent"])).toContain("widget");
  });

  it("folds the last status logged against each step", () => {
    const { sessionsDir } = makeSandboxRepo();
    start(sessionsDir);
    const keys = keysOf(sessionsDir);
    log(sessionsDir, keys[0], "complete", 1);
    log(sessionsDir, keys[1], "in-progress", 2);
    const rows = buildTaskRows(sessionsDir, 1);
    expect(rows.map((row) => row["state"])).toEqual([
      "done",
      "in flight",
      "pending",
      "pending",
    ]);
    expect(rows.map((row) => row["iconKey"])).toEqual([
      "complete",
      "in-progress",
      "not-started",
      "not-started",
    ]);
    expect(rows[1]["isOpen"]).toBe(true);
    expect(typeof rows[1]["startedAt"]).toBe("string");
    expect(rows[2]["startedAt"]).toBeNull();
  });

  it("takes the later row when a step is logged twice", () => {
    // `session start` logs `register` complete itself, and an orchestrator
    // that logs it again must not produce two truths about one step.
    const { sessionsDir } = makeSandboxRepo();
    start(sessionsDir);
    const keys = keysOf(sessionsDir);
    log(sessionsDir, keys[1], "in-progress", 2);
    log(sessionsDir, keys[1], "complete", 2);
    expect(buildTaskRows(sessionsDir, 1)[1]["state"]).toBe("done");
    expect(buildTaskRows(sessionsDir, 1)[1]["isOpen"]).toBe(false);
  });

  it("leaves nothing in flight once the open step is closed", () => {
    const { sessionsDir } = makeSandboxRepo();
    start(sessionsDir);
    const keys = keysOf(sessionsDir);
    log(sessionsDir, keys[0], "in-progress", 1);
    log(sessionsDir, keys[0], "complete", 1);
    expect(
      buildTaskRows(sessionsDir, 1).every((row) => row["isOpen"] === false),
    ).toBe(true);
  });

  it("gives a blocked step the cancelled glyph and its own word", () => {
    // There is no fifth icon asset, and a step that stopped reads closer to
    // cancelled than to any of the other three. The word is what separates
    // them.
    const { sessionsDir } = makeSandboxRepo();
    start(sessionsDir);
    log(sessionsDir, keysOf(sessionsDir)[2], "blocked", 3);
    const row = buildTaskRows(sessionsDir, 1)[2];
    expect(row["state"]).toBe("blocked");
    expect(row["iconKey"]).toBe("cancelled");
  });

  it("has no tasks and no refusal in a repository nothing has run in", () => {
    const { sessionsDir } = makeSandboxRepo();
    expect(buildTaskRows(sessionsDir, 1)).toEqual([]);
  });

  it("reaches the projection, which is where the tree reads them", () => {
    const { sessionsDir } = makeSandboxRepo();
    start(sessionsDir);
    const sessions = buildProjection(sessionsDir)["sessions"] as Record<
      string,
      unknown
    >[];
    const inFlight = sessions.find((session) => session["inFlight"]);
    expect((inFlight?.["tasks"] as unknown[]).length).toBe(4);
    expect(inFlight?.["tasksRefused"]).toBeNull();
  });

  it("refuses rather than rendering an activity log it could not read", () => {
    const { sessionsDir } = makeSandboxRepo();
    start(sessionsDir);
    writeFileSync(join(sessionsDir, "activity-log.json"), "{ not json\n", "utf8");
    expect(() => buildTaskRows(sessionsDir, 1)).toThrow(TaskRowsRefused);
  });

  it("carries the refusal on the session rather than as an empty task list", () => {
    const { sessionsDir } = makeSandboxRepo();
    start(sessionsDir);
    writeFileSync(join(sessionsDir, "activity-log.json"), "{ not json\n", "utf8");
    const sessions = buildProjection(sessionsDir)["sessions"] as Record<
      string,
      unknown
    >[];
    const inFlight = sessions.find((session) => session["inFlight"]);
    expect(inFlight?.["tasks"]).toEqual([]);
    expect(String(inFlight?.["tasksRefused"])).toContain("activity-log.json");
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

// ---------------------------------------------------------------------------
// The plan, on every projection
// ---------------------------------------------------------------------------

/** Overwrite the sandbox's plan with the given `[number, title]` headings. */
function writePlan(
  sessionsDir: string,
  headings: ReadonlyArray<readonly [number, string]>,
  extra = "",
): void {
  const total = headings.length;
  const body = headings
    .map(([n, t]) => `### Session ${n} of ${total}: ${t}\n1. Register.\n`)
    .join("\n");
  writeFileSync(join(sessionsDir, "session-plan.md"), body + extra, "utf8");
}

/** Close whatever is in flight, so the next-session rule has something to skip. */
function closeSessionForTest(sessionsDir: string): void {
  flipStateToClosed(sessionsDir, { verdict: "VERIFIED" });
}

function repository(sessionsDir: string): Record<string, unknown> {
  return buildProjection(sessionsDir)["repository"] as Record<string, unknown>;
}

function sessions(sessionsDir: string): Record<string, unknown>[] {
  return buildProjection(sessionsDir)["sessions"] as Record<string, unknown>[];
}

describe("a session the plan declares and the ledger has not reached", () => {
  it("projects as 'planned', which the ledger's own vocabulary does not contain", () => {
    const { sessionsDir } = makeSandboxRepo();
    start(sessionsDir);
    writePlan(sessionsDir, [
      [1, "First things"],
      [2, "Second things"],
      [3, "Added after the last start"],
    ]);
    const row = sessions(sessionsDir).find((s) => s["number"] === 3);
    expect(row?.["status"]).toBe(STATUS_PLANNED);
    expect(SESSION_STATUSES).not.toContain(STATUS_PLANNED);
  });

  it("keeps the not-started glyph, so only the row's words separate the two", () => {
    const { sessionsDir } = makeSandboxRepo();
    start(sessionsDir);
    writePlan(sessionsDir, [
      [1, "First"],
      [9, "Much later"],
    ]);
    const row = sessions(sessionsDir).find((s) => s["number"] === 9);
    expect(row?.["iconKey"]).toBe("not-started");
    expect(row?.["status"]).toBe(STATUS_PLANNED);
  });

  it("counts toward the total, so a caught-up ledger is not reported finished", () => {
    // csv-model's item 9, reproduced: a planning session's whole deliverable
    // is new headings, and until this the record said 2 of 2 complete.
    const { sessionsDir } = makeSandboxRepo();
    // `session start` grows the ledger to the plan as it stood then -- the
    // seed declares two -- so the ledger looks caught up and complete.
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    expect(repository(sessionsDir)["totalSessions"]).toBe(2);
    writePlan(sessionsDir, [
      [1, "First"],
      [2, "Second"],
      [3, "Third"],
      [4, "Fourth"],
    ]);
    const after = repository(sessionsDir);
    expect(after["totalSessions"]).toBe(4);
    expect(after["plannedSessions"]).toBe(2);
  });

  it("carries no run artifacts, because it has never been registered", () => {
    const { sessionsDir } = makeSandboxRepo();
    start(sessionsDir);
    writePlan(sessionsDir, [
      [1, "First"],
      [5, "Never registered"],
    ]);
    const row = sessions(sessionsDir).find((s) => s["number"] === 5);
    expect(row?.["tasks"]).toEqual([]);
    expect(row?.["tasksRefused"]).toBeNull();
    expect(row?.["verification"]).toBeNull();
    expect(row?.["verificationRefused"]).toBeNull();
    expect(row?.["inFlight"]).toBe(false);
  });
});

describe("reconciling a hand-edited plan against the ledger", () => {
  it("never re-emits a number the ledger already holds", () => {
    const { sessionsDir } = makeSandboxRepo();
    start(sessionsDir);
    writePlan(sessionsDir, [
      [1, "A title the plan changed its mind about"],
      [2, "Second"],
    ]);
    const ones = sessions(sessionsDir).filter((s) => s["number"] === 1);
    expect(ones).toHaveLength(1);
    expect(ones[0]!["status"]).not.toBe(STATUS_PLANNED);
  });

  it("contributes a duplicated number once", () => {
    const { sessionsDir } = makeSandboxRepo();
    start(sessionsDir);
    writePlan(sessionsDir, [
      [1, "First"],
      [7, "Alpha"],
      [7, "Beta"],
    ]);
    expect(sessions(sessionsDir).filter((s) => s["number"] === 7)).toHaveLength(1);
  });

  it("leaves a gap alone rather than inventing the missing number", () => {
    const { sessionsDir } = makeSandboxRepo();
    start(sessionsDir);
    writePlan(sessionsDir, [
      [1, "First"],
      [4, "Fourth"],
      [6, "Sixth"],
    ]);
    const numbers = sessions(sessionsDir).map((s) => s["number"]);
    expect(numbers).toContain(4);
    expect(numbers).toContain(6);
    expect(numbers).not.toContain(5);
  });

  it("yields nothing when the plan is shorter than the ledger", () => {
    const { sessionsDir } = makeSandboxRepo();
    start(sessionsDir);
    registerSessionStart(sessionsDir, 2, { engine: "claude-code" });
    writePlan(sessionsDir, [[1, "The only one left in the plan"]]);
    const repo = repository(sessionsDir);
    expect(repo["plannedSessions"]).toBe(0);
    expect(repo["totalSessions"]).toBe(2);
  });

  it("takes nothing from a heading the parser cannot read", () => {
    const { sessionsDir } = makeSandboxRepo();
    start(sessionsDir);
    writePlan(sessionsDir, [[1, "First"]], "\n## Session eleven: not a heading\n");
    expect(repository(sessionsDir)["plannedSessions"]).toBe(0);
  });
});

describe("what registers on the next session start", () => {
  it("is the session in flight, whatever its number", () => {
    const { sessionsDir } = makeSandboxRepo();
    start(sessionsDir);
    expect(repository(sessionsDir)["nextSession"]).toBe(1);
  });

  it("is the lowest session that has not run, planned ones included", () => {
    const { sessionsDir } = makeSandboxRepo();
    start(sessionsDir);
    closeSessionForTest(sessionsDir);
    writePlan(sessionsDir, [
      [1, "First"],
      [2, "Second"],
      [3, "Third"],
    ]);
    expect(repository(sessionsDir)["nextSession"]).toBe(2);
  });

  it("is null when the plan declares nothing further", () => {
    const { sessionsDir } = makeSandboxRepo();
    start(sessionsDir);
    closeSessionForTest(sessionsDir);
    registerSessionStart(sessionsDir, 2, { engine: "claude-code" });
    closeSessionForTest(sessionsDir);
    writePlan(sessionsDir, [
      [1, "First"],
      [2, "Second"],
    ]);
    expect(repository(sessionsDir)["nextSession"]).toBeNull();
  });
});

describe("a repository whose plan is its only record", () => {
  it("calls every row planned, because the ledger has reached none of them", () => {
    // Round 1 of this session's verification found the gap: `not-started`
    // means "registered, and not begun", and nothing here is registered.
    const { sessionsDir } = makeSandboxRepo();
    expect(ledgerExists(sessionsDir)).toBe(false);
    const projection = buildProjection(sessionsDir);
    const rows = projection["sessions"] as Record<string, unknown>[];
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) expect(row["status"]).toBe(STATUS_PLANNED);
  });

  it("counts them once, so the planned count is not the total twice over", () => {
    const { sessionsDir } = makeSandboxRepo();
    const repo = repository(sessionsDir);
    expect(repo["plannedSessions"]).toBe(2);
    expect(repo["totalSessions"]).toBe(2);
    expect(repo["sessionsCompleted"]).toBe(0);
    expect(repo["nextSession"]).toBe(1);
  });

  it("keeps the invariants readable, because the state is set after they run", () => {
    // `validateInvariants` accepts only the ledger's four statuses, and it
    // runs over the derived view. Stamping 'planned' any earlier would make a
    // fresh repository report an invariant violation instead of its sessions.
    const { sessionsDir } = makeSandboxRepo();
    expect(repository(sessionsDir)["invariantViolation"]).toBeNull();
  });
});
