// `dabbler session drive`: the framework runs a session and the engine
// answers. One test per transition of the loop, driven by a scripted engine
// in-process -- no model, no seat -- against the offline verifier the round
// tests use. What is asserted is the record a driven session leaves: the
// same files a typed session leaves, written by the same verbs.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CONFIG_ENV_VAR } from "../src/config.ts";
import {
  type Engine,
  type EngineInvocation,
  commandEngine,
  driveSession,
} from "../src/drive.ts";
import {
  DISPOSITION_SCHEMA,
  WORK_PLAN_SCHEMA,
  readDispositions,
  readInstruction,
  readRun,
  transcriptPath,
} from "../src/driver.ts";
import type { DriverInstruction } from "../src/generated/index.ts";
import { runGit } from "../src/journal.ts";
import { readDisputes, readRounds } from "../src/ledger.ts";
import { readSessionState } from "../src/progress.ts";
import { resetForTests } from "../src/route.ts";
import { resetForTests as resetRuntimeMode } from "../src/runtimeMode.ts";
import { report } from "../src/session.ts";
import { readRecords } from "../src/testEvidence.ts";
import { readTaskDeclaration } from "../src/writers.ts";
import {
  captured,
  clearProviderKeys,
  git,
  makeConfig,
  makeTempDir,
  removeTempDirs,
  setProviderKeys,
  writeYaml,
} from "./support/fixtures.ts";

afterAll(removeTempDirs);

// --- the repository under drive ----------------------------------------------

const NODE = process.execPath;
const WIDGET_V2 = "def widget():\n    return 2\n";

const SEED: Record<string, string> = {
  "docs/sessions/session-plan.md":
    "### Session 1 of 2: The widget\n1. Register.\n2. Make `widget()` return 2.\n" +
    "3. Verify; close.\n\n### Session 2 of 2: Later\n1. Polish.\n",
  "dabbler.yaml": "schema_version: 1\n",
  "src/widget.py": "def widget():\n    return 1\n",
  "tests/test_widget.py": "def test_widget():\n    assert True\n",
  // The suite: red while the widget says it is broken, green otherwise.
  "tests/run.mjs":
    "import { readFileSync } from 'node:fs';\n" +
    "process.exit(readFileSync('src/widget.py', 'utf8').includes('broken') ? 1 : 0);\n",
  ".gitignore": ".dabbler/\n",
};

const TESTING = {
  suites: [
    {
      name: "unit",
      command: "node tests/run.mjs",
      expensive: true,
      covers: ["src/", "tests/"],
      test_roots: ["tests"],
      test_glob: "test_*.py",
    },
  ],
  selection: {
    repo_wide: ["dabbler.yaml"],
    smoke: ["tests/test_widget.py"],
    rules: [{ when: "src/widget.py", select: ["tests/test_widget.py"] }],
  },
};

function drivenRepo(): { repo: string; sessionsDir: string } {
  const target = makeTempDir();
  const repo = join(target, "repo");
  const remote = join(target, "remote.git");
  for (const [rel, text] of Object.entries(SEED)) {
    const path = join(repo, ...rel.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
  }
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "core.autocrlf", "false");
  git(repo, "config", "commit.gpgsign", "false");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "seed");
  git(target, "init", "-q", "--bare", remote);
  git(repo, "remote", "add", "origin", "../remote.git");
  git(repo, "push", "-q", "-u", "origin", "main");
  return { repo, sessionsDir: join(repo, "docs", "sessions") };
}

/** The verifier's scripted responses and the driver's budget, as the config. */
function configure(responses: readonly string[], driver: Record<string, unknown> = {}): void {
  const dir = makeTempDir();
  responses.forEach((text, index) => {
    writeFileSync(join(dir, `${String(index + 1).padStart(2, "0")}.md`), text, "utf8");
  });
  process.env[CONFIG_ENV_VAR] = writeYaml(
    join(makeTempDir(), "router-config.yaml"),
    makeConfig({
      transports: { offline: { responses_dir: dir } },
      transport: { profile: "offline" },
      testing: TESTING,
      driver,
    }),
  );
}

// --- the scripted engine -----------------------------------------------------

interface Tools {
  write(rel: string, text: string): void;
  report(fields: {
    step: string;
    files: readonly string[];
    status?: string;
    notes?: string;
  }): number;
  answer(body: unknown): number;
}

type Script = (invocation: EngineInvocation, tools: Tools) => void | Promise<void>;

interface Scripted extends Engine {
  readonly seen: DriverInstruction[];
}

/** An engine that does what the script says and reports through the verb. */
function scripted(script: Script, name = "scripted"): Scripted {
  const seen: DriverInstruction[] = [];
  return {
    name,
    seen,
    async invoke(invocation: EngineInvocation) {
      seen.push(invocation.instruction);
      invocation.emit(`scripted: seq ${invocation.instruction.seq} ${invocation.instruction.kind}`);
      const tools: Tools = {
        write(rel, text) {
          const path = join(invocation.repoRoot, ...rel.split("/"));
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, text, "utf8");
        },
        report(fields) {
          return report(invocation.sessionsDir, {
            seq: invocation.instruction.seq,
            stepId: fields.step,
            status: fields.status ?? "done",
            files: fields.files,
            testsRun: null,
            notes: fields.notes ?? "scripted",
          });
        },
        answer(body) {
          const path = join(makeTempDir(), "answer.json");
          writeFileSync(path, JSON.stringify(body), "utf8");
          return report(invocation.sessionsDir, {
            seq: invocation.instruction.seq,
            answerFile: path,
          });
        },
      };
      await script(invocation, tools);
      return { exitCode: 0 };
    },
  };
}

const PLAN = {
  task: "Make widget() return 2.",
  releasable: false,
  steps: [
    {
      id: "widget",
      ask: "Make widget() return 2.",
      files: ["src/widget.py"],
      checks: [
        {
          argv: [
            NODE,
            "-e",
            "process.exit(require('fs').readFileSync('src/widget.py','utf8').includes('return 2') ? 0 : 1)",
          ],
        },
      ],
    },
  ],
};

/** Plans, does the one step, fixes what it is asked to fix. */
const wellBehaved: Script = ({ instruction }, tools) => {
  if (instruction.answer_schema === WORK_PLAN_SCHEMA) {
    tools.answer(PLAN);
    return;
  }
  if (instruction.step_id === "widget" || instruction.step_id?.startsWith("fix-")) {
    tools.write("src/widget.py", WIDGET_V2);
    tools.report({ step: instruction.step_id, files: ["src/widget.py"] });
  }
};

function drive(sessionsDir: string, adapter: Engine, maxInvocations: number | null = null) {
  return captured(() =>
    driveSession(sessionsDir, {
      engine: "claude-code",
      provider: "anthropic",
      adapter,
      maxInvocations,
    }),
  );
}

function sessionStatus(sessionsDir: string): unknown {
  const state = readSessionState(sessionsDir);
  const sessions = (state?.["sessions"] ?? []) as Array<Record<string, unknown>>;
  return sessions.find((row) => row["number"] === 1)?.["status"];
}

const VERIFIED = "VERIFIED\n\nThe widget is real.\n";

// --- the transitions ---------------------------------------------------------

describe("dabbler session drive", () => {
  beforeEach(() => {
    setProviderKeys();
    delete process.env["DABBLER_TRANSPORT"];
    resetForTests();
    resetRuntimeMode();
  });

  afterEach(() => {
    clearProviderKeys();
    delete process.env[CONFIG_ENV_VAR];
    delete process.env["DABBLER_TRANSPORT"];
    resetForTests();
    resetRuntimeMode();
    vi.restoreAllMocks();
  });

  it("asks for a work plan, refuses a stamped member it disagrees with, and declares from the plan", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED], { max_invocations: 2 });
    const codes: number[] = [];
    const engine = scripted(({ instruction }, tools) => {
      if (instruction.kind === "step") {
        // Session 7 is not this session; the framework stamps the number.
        codes.push(tools.answer({ ...PLAN, session_number: 7 }));
        return;
      }
      codes.push(tools.answer(PLAN));
    });

    const { code, err } = await drive(sessionsDir, engine);
    // The first answer was refused at the verb, so the driver saw no plan and
    // asked again; the second was accepted; the step that followed met the
    // budget of two invocations.
    expect(codes).toEqual([2, 0]);
    expect(engine.seen.map((entry) => entry.kind)).toEqual(["step", "rejection"]);
    expect(engine.seen[1]?.reasons?.[0]).toContain("no work plan was written");
    expect(engine.seen[0]?.ask).toContain("Make `widget()` return 2.");
    expect(readTaskDeclaration(sessionsDir, 1)).toMatchObject({
      task: "Make widget() return 2.",
      releasable: false,
    });
    expect(code).toBe(1);
    expect(err).toContain("STOPPED (budget)");
    const run = readRun(repo, 1);
    expect(run?.phase).toBe("steps");
    expect(run?.stop?.kind).toBe("budget");
    expect(run?.invocations).toBe(2);
    // The step was issued before the budget refused the invocation, so a
    // re-run continues from it rather than planning again.
    expect(readInstruction(repo, 1)).toMatchObject({ seq: 3, kind: "step", step_id: "widget" });
    expect(sessionStatus(sessionsDir)).toBe("in-progress");
  });

  it("accepts a step whose report matches the tree and its check, then runs the session to a close", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);
    const engine = scripted(wellBehaved);

    const { code, out } = await drive(sessionsDir, engine);
    expect(code).toBe(0);
    expect(out).toContain("session 001 complete after 2 engine invocation(s)");
    expect(engine.seen.map((entry) => [entry.kind, entry.step_id])).toEqual([
      ["step", "plan"],
      ["step", "widget"],
    ]);
    expect(readInstruction(repo, 1)?.kind).toBe("done");
    expect(readRun(repo, 1)).toMatchObject({
      phase: "complete",
      accepted_steps: ["widget"],
      invocations: 2,
      stop: null,
    });

    // The record a typed session leaves, by the same verbs.
    expect(sessionStatus(sessionsDir)).toBe("complete");
    expect(readRounds(repo, 1).map((row) => row["verdict"])).toEqual(["VERIFIED"]);
    const stages = readRecords(repo).map((row) => `${row.stage}:${row.outcome}`);
    expect(stages).toEqual(["preverify-targeted:passed", "final-full:passed"]);
    const log = runGit(repo, ["log", "--format=%s", "-n", "3"]).stdout.split("\n");
    expect(log).toContain("Session 1: Make widget() return 2.");
    expect(runGit(repo, ["rev-list", "--count", "@{u}..HEAD"]).stdout).toBe("0");
    // One transcript per invocation, the engine's lines inside.
    expect(readFileSync(transcriptPath(repo, 1, 1), "utf8")).toContain("scripted: seq 1 step");
    expect(readFileSync(transcriptPath(repo, 1, 2), "utf8")).toContain("scripted: seq 2 step");
    expect(existsSync(transcriptPath(repo, 1, 3))).toBe(false);
  });

  it("rejects a report that omits a file the tree changed, and accepts the corrected one", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);
    const engine = scripted(({ instruction }, tools) => {
      if (instruction.answer_schema === WORK_PLAN_SCHEMA) return void tools.answer(PLAN);
      tools.write("src/widget.py", WIDGET_V2);
      tools.write("tests/test_widget.py", "def test_widget():\n    assert True  # still\n");
      const files =
        instruction.kind === "rejection"
          ? ["src/widget.py", "tests/test_widget.py"]
          : ["src/widget.py"];
      tools.report({ step: "widget", files });
    });

    const { code } = await drive(sessionsDir, engine);
    expect(code).toBe(0);
    expect(engine.seen.map((entry) => entry.kind)).toEqual(["step", "step", "rejection"]);
    expect(engine.seen[2]?.reasons).toEqual([
      "files_changed omits 'tests/test_widget.py', which the tree changed",
    ]);
    expect(engine.seen[2]?.ask).toContain("refused for the reasons listed");
    expect(readRun(repo, 1)).toMatchObject({ phase: "complete", accepted_steps: ["widget"] });
  });

  it("stops after a step is refused three times, and closes nothing", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);
    const engine = scripted(({ instruction }, tools) => {
      if (instruction.answer_schema === WORK_PLAN_SCHEMA) return void tools.answer(PLAN);
      // Changes the file every time and never says so.
      tools.write("src/widget.py", `${WIDGET_V2}# seq ${instruction.seq}\n`);
      tools.report({ step: "widget", files: [] });
    });

    const { code, err } = await drive(sessionsDir, engine);
    expect(code).toBe(1);
    expect(err).toContain("STOPPED (rejected-thrice)");
    expect(engine.seen.map((entry) => entry.kind)).toEqual(["step", "step", "rejection", "rejection"]);
    expect(readRun(repo, 1)).toMatchObject({
      phase: "steps",
      accepted_steps: [],
      stop: { kind: "rejected-thrice" },
    });
    expect(readRun(repo, 1)?.stop?.reason).toContain("step 'widget' was refused 3 times");
    expect(sessionStatus(sessionsDir)).toBe("in-progress");
    expect(readRounds(repo, 1)).toEqual([]);
  });

  it("hands blocking findings back for disposition: a fix re-enters the loop and a reject becomes a dispute", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([
      "ISSUES FOUND\n\n" +
        "Issue 1: the widget returns the wrong number.\nSeverity: Major\nEvidence paths: src/widget.py\n\n" +
        "Issue 2: the test asserts nothing.\nSeverity: Major\nEvidence paths: tests/test_widget.py\n",
      "VERIFIED\n\nThe fix stands; the dispute is withdrawn.\n",
    ]);
    const engine = scripted(async (invocation, tools) => {
      const { instruction } = invocation;
      if (instruction.answer_schema === DISPOSITION_SCHEMA) {
        tools.answer({
          dispositions: [
            { finding_index: 0, action: "fix" },
            {
              finding_index: 1,
              action: "reject",
              reason: "the placeholder test is by design until the widget settles",
              evidence_paths: ["tests/test_widget.py"],
            },
          ],
        });
        return;
      }
      if (instruction.step_id === "fix-round-1") {
        tools.write("src/widget.py", "# fixed\n" + WIDGET_V2);
        tools.report({ step: "fix-round-1", files: ["src/widget.py"] });
        return;
      }
      await wellBehaved(invocation, tools);
    });

    const { code } = await drive(sessionsDir, engine);
    expect(code).toBe(0);
    const kinds = engine.seen.map((entry) => [entry.kind, entry.step_id ?? entry.round]);
    expect(kinds).toEqual([
      ["step", "plan"],
      ["step", "widget"],
      ["rejection", 1],
      ["step", "fix-round-1"],
    ]);
    const findings = engine.seen[2]?.reasons ?? [];
    expect(findings[0]).toMatch(/^\[0\] major, blocking: the widget returns the wrong number/);
    expect(findings[1]).toContain("cited: tests/test_widget.py");
    expect(engine.seen[3]?.ask).toContain("[0] major, blocking");
    expect(engine.seen[3]?.ask).not.toContain("[1]");

    expect(readDispositions(repo, 1)).toMatchObject({ seq: 3, round: 1 });
    expect(readDisputes(repo, 1).map((row) => [row["round"], row["finding_index"]])).toEqual([[1, 1]]);
    expect(readRounds(repo, 1).map((row) => [row["round"], row["verdict"], row["phase"]])).toEqual([
      [1, "ISSUES_FOUND", "full"],
      [2, "VERIFIED", "fix-delta"],
    ]);
    expect(readRecords(repo).map((row) => `${row.stage}:${row.outcome}`)).toEqual([
      "preverify-targeted:passed",
      "preverify-targeted:passed",
      "final-full:passed",
    ]);
    expect(sessionStatus(sessionsDir)).toBe("complete");
  });

  it("stops at the invocation budget and a re-run continues from the phase it reached", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED], { max_invocations: 1 });
    const first = scripted(wellBehaved);
    const stopped = await drive(sessionsDir, first);
    expect(stopped.code).toBe(1);
    expect(stopped.err).toContain("driver.max_invocations (1)");
    expect(first.seen.map((entry) => entry.step_id)).toEqual(["plan"]);
    expect(readRun(repo, 1)).toMatchObject({ phase: "steps", invocations: 1, stop: { kind: "budget" } });

    // A different engine cannot pick the run up: one session store carries it.
    const other = scripted(wellBehaved, "elsewhere");
    const refused = await drive(sessionsDir, other, 6);
    expect(refused.code).toBe(3);
    expect(refused.err).toContain("session 001 is being driven through 'scripted'");
    expect(other.seen).toEqual([]);

    // The same engine name, a larger bound: the plan is not asked for again,
    // and the step the stop interrupted is issued afresh under the next seq.
    const second = scripted(wellBehaved);
    const resumed = await drive(sessionsDir, second, 6);
    expect(resumed.code).toBe(0);
    expect(resumed.out).toContain("run-resumed");
    expect(second.seen.map((entry) => [entry.seq, entry.step_id])).toEqual([[3, "widget"]]);
    expect(readRun(repo, 1)).toMatchObject({
      phase: "complete",
      invocations: 2,
      max_invocations: 6,
      stop: null,
    });
    expect(sessionStatus(sessionsDir)).toBe("complete");
  });

  it("stops when the engine reports a step blocked, with its notes", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);
    const engine = scripted(({ instruction }, tools) => {
      if (instruction.answer_schema === WORK_PLAN_SCHEMA) return void tools.answer(PLAN);
      tools.report({ step: "widget", files: [], status: "blocked", notes: "the widget is load-bearing" });
    });

    const { code, err } = await drive(sessionsDir, engine);
    expect(code).toBe(1);
    expect(err).toContain("STOPPED (blocked)");
    expect(readRun(repo, 1)?.stop).toMatchObject({ kind: "blocked" });
    expect(readRun(repo, 1)?.stop?.reason).toContain("the widget is load-bearing");
    expect(engine.seen).toHaveLength(2);
  });

  it("runs the affected tests itself and sends a red run back as a fix step before any verifier sees the tree", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);
    const engine = scripted(({ instruction }, tools) => {
      if (instruction.answer_schema === WORK_PLAN_SCHEMA) return void tools.answer(PLAN);
      if (instruction.step_id === "widget") {
        // Passes the step's own check and fails the suite.
        tools.write("src/widget.py", "def widget():\n    return 2  # broken\n");
        tools.report({ step: "widget", files: ["src/widget.py"] });
        return;
      }
      tools.write("src/widget.py", WIDGET_V2);
      tools.report({ step: instruction.step_id as string, files: ["src/widget.py"] });
    });

    const { code } = await drive(sessionsDir, engine);
    expect(code).toBe(0);
    expect(engine.seen.map((entry) => entry.step_id)).toEqual(["plan", "widget", "fix-tests"]);
    expect(engine.seen[2]?.ask).toContain("node tests/run.mjs tests/test_widget.py");
    expect(readRecords(repo).map((row) => `${row.stage}:${row.outcome}`)).toEqual([
      "preverify-targeted:failed",
      "preverify-targeted:passed",
      "final-full:passed",
    ]);
    expect(readRounds(repo, 1)).toHaveLength(1);
    expect(sessionStatus(sessionsDir)).toBe("complete");
  });

  it("reaches a command engine with no shell, the instruction's path substituted, and keeps its output as the transcript", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED], { max_invocations: 1 });
    const script = join(makeTempDir(), "engine.mjs");
    writeFileSync(
      script,
      "process.stdout.write(`argv ${process.argv[2]}\\n`);\n" +
        "process.stdout.write(`env ${process.env.DABBLER_DRIVER_INSTRUCTION}\\n`);\n" +
        "process.stderr.write('nothing answered\\n');\n",
      "utf8",
    );
    const adapter = commandEngine([NODE, script, "{instruction}"]);

    const { code, out } = await drive(sessionsDir, adapter);
    expect(code).toBe(1);
    const instruction = join(repo, ".dabbler", "runs", "s1", "driver", "instruction.json");
    const transcript = readFileSync(transcriptPath(repo, 1, 1), "utf8");
    expect(transcript).toContain(`argv ${instruction}`);
    expect(transcript).toContain(`env ${instruction}`);
    expect(transcript).toContain("stderr: nothing answered");
    expect(transcript).toMatch(/# exit 0 after \d+s/);
    expect(out).toContain(`  │ argv ${instruction}`);
    // Nothing was answered, so the plan was asked for again -- and the budget
    // of one refused the second invocation.
    expect(readInstruction(repo, 1)).toMatchObject({ seq: 2, kind: "rejection", step_id: "plan" });
    expect(readRun(repo, 1)?.stop?.kind).toBe("budget");
    // The tree carries the registration's bookkeeping and nothing of the work.
    const dirty = execFileSync("git", ["-C", repo, "status", "--porcelain"], { encoding: "utf8" })
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => line.slice(3));
    expect(dirty).toEqual(["docs/sessions/sessions.json"]);
  });
});
