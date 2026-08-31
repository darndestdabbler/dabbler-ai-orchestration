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
  type NextOptions,
  commandEngine,
  driveSession,
  sessionNext,
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
import { buildTaskRows, readSessionState } from "../src/progress.ts";
import { resetForTests } from "../src/route.ts";
import { resetForTests as resetRuntimeMode } from "../src/runtimeMode.ts";
import { EXIT_BOUNDARY, EXIT_OK, interrupt, report, start } from "../src/session.ts";
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

// Each test drives a whole session -- dozens of git calls, two spawned
// suite runs, a verification round -- and takes five to eight seconds
// alone; under the four-worker full suite it can take longer than
// vitest's five-second default, and a test that times out mid-drive leaves
// the driver running against a torn-down config. The bound is generous
// because a slow driven session is not a failing one.
describe("dabbler session drive", { timeout: 120_000 }, () => {
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
    const answered: number[] = [];
    const engine = scripted(async (invocation, tools) => {
      const { instruction } = invocation;
      if (instruction.answer_schema === DISPOSITION_SCHEMA) {
        // The first answer forgets the second blocking finding: the verb
        // holds the set against the round and refuses it before it is
        // written, so the driver sees no answer and asks again.
        const complete = instruction.reasons?.some((reason) => reason.includes("no disposition"));
        answered.push(
          tools.answer({
            dispositions: [
              { finding_index: 0, action: "fix" },
              ...(complete
                ? [
                    {
                      finding_index: 1,
                      action: "reject",
                      reason: "the placeholder test is by design until the widget settles",
                      evidence_paths: ["tests/test_widget.py"],
                    },
                  ]
                : []),
            ],
          }),
        );
        return;
      }
      if (instruction.step_id === "fix-round-1") {
        tools.write("src/widget.py", "# fixed\n" + WIDGET_V2);
        tools.report({ step: "fix-round-1", files: ["src/widget.py"] });
        return;
      }
      await wellBehaved(invocation, tools);
    });

    const { code, out } = await drive(sessionsDir, engine);
    expect(code).toBe(0);
    const kinds = engine.seen.map((entry) => [entry.kind, entry.step_id ?? entry.round]);
    expect(kinds).toEqual([
      ["step", "plan"],
      ["step", "widget"],
      ["rejection", 1],
      ["rejection", 1],
      ["step", "fix-round-1"],
    ]);
    expect(answered).toEqual([2, 0]);
    const findings = engine.seen[2]?.reasons ?? [];
    expect(findings[0]).toMatch(/^\[0\] major, blocking: the widget returns the wrong number/);
    expect(findings[1]).toContain("cited: tests/test_widget.py");
    expect(engine.seen[3]?.reasons?.[2]).toContain("no disposition of round 1 answered instruction 3");
    expect(engine.seen[4]?.ask).toContain("[0] major, blocking");
    expect(engine.seen[4]?.ask).not.toContain("[1]");

    // The loop says which way each round went in its own voice, so a reader
    // of the channel is not left to infer a blocking round from the phase it
    // moved to -- `phase phase=dispositions` reads like any other phase line.
    expect(out).toContain("verification-blocking");
    expect(out).toContain("verification-passed");
    expect(readDispositions(repo, 1)).toMatchObject({ seq: 4, round: 1 });
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
    // A stopped loop is an attention row: the phase it stopped in is blocked
    // and says which bound it met.
    const blocked = buildTaskRows(sessionsDir, 1).find((row) => row["state"] === "blocked");
    expect(blocked).toMatchObject({ stepId: "work", isOpen: false });
    expect(blocked?.["intent"]).toContain("Driver stopped (budget)");

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
    expect(buildTaskRows(sessionsDir, 1).map((row) => row["state"])).toEqual(Array(6).fill("done"));
  });

  it("reads its config from the repository under --sessions-dir, not the one it was run from", async () => {
    // `--sessions-dir` may name a repository the command was not typed in,
    // which is how a walk is driven. Resolving the overlay from the working
    // directory instead took the cap, the engine_output and -- the one that
    // does damage -- the `testing.suites` from whichever repository the
    // person happened to be standing in.
    //
    // No `configure()` here on purpose: it sets the config env var, and that
    // switches the project overlay off altogether, so the layer under test
    // would never be read. The driven repository asks for a budget of one;
    // the repository this suite runs from declares no budget at all, so a
    // config resolved from the working directory answers with the default.
    const { repo, sessionsDir } = drivenRepo();
    writeFileSync(
      join(repo, "dabbler.yaml"),
      "schema_version: 1\ndriver:\n  max_invocations: 1\n",
      "utf8",
    );
    // Committed, not merely written: the declaration is refused once the tree
    // carries work, and a dirty config would stop the run before the budget.
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "a budget of one");
    const engine = scripted(({ instruction }, tools) => {
      if (instruction.answer_schema === WORK_PLAN_SCHEMA) return void tools.answer(PLAN);
      tools.report({ step: "widget", files: [] });
    });

    const { code, out } = await drive(sessionsDir, engine);

    expect(code).toBe(1);
    expect(out).toContain("max_invocations=1");
    expect(readRun(repo, 1)).toMatchObject({ max_invocations: 1, stop: { kind: "budget" } });
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

  it("ends the running invocation on `session interrupt`, re-issues the instruction as an interrupt carrying the reason, and the session still closes", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);
    const inner = scripted(wellBehaved);
    const seen: DriverInstruction[] = [];
    let interruptVerb: number | null = null;
    const engine: Engine = {
      name: "interruptible",
      async invoke(invocation: EngineInvocation) {
        seen.push(invocation.instruction);
        const { instruction } = invocation;
        if (instruction.kind === "step" && instruction.step_id === "widget") {
          // Mid-step, the operator asks the engine to stop -- through the
          // verb, from another process's point of view -- and this
          // invocation ends when the driver's signal reaches it.
          interruptVerb = interrupt(sessionsDir, { reason: "the plan changed" });
          await new Promise<void>((resolve) =>
            invocation.signal.addEventListener("abort", () => resolve(), { once: true }),
          );
          invocation.emit("stopped mid-step");
          return { exitCode: null, interrupted: true };
        }
        return inner.invoke(invocation);
      },
    };

    const { code } = await drive(sessionsDir, engine);
    expect(code).toBe(EXIT_OK);
    expect(interruptVerb).toBe(EXIT_OK);
    expect(sessionStatus(sessionsDir)).toBe("complete");
    const stepSeq = seen.find((row) => row.kind === "step" && row.step_id === "widget")?.seq;
    expect(seen).toContainEqual(
      expect.objectContaining({
        kind: "interrupt",
        seq: Number(stepSeq) + 1,
        step_id: "widget",
        reasons: ["interrupted: the plan changed"],
        answer_schema: "driver-report.schema.json",
        answer_command: expect.stringContaining(`--seq ${Number(stepSeq) + 1} --step widget`),
      }),
    );
    // Plan, the interrupted step, the step again: three invocations, and
    // the interrupted one's transcript says so.
    expect(readRun(repo, 1)?.invocations).toBe(3);
    const transcript = readFileSync(transcriptPath(repo, 1, 2), "utf8");
    expect(transcript).toContain("stopped mid-step");
    expect(transcript).toMatch(/# interrupted \(the plan changed\); exit none after \d+s/);
    // The drive completed, so there is nothing left to interrupt.
    const { code: after, err } = await captured(async () => interrupt(sessionsDir, { reason: "again" }));
    expect(after).toBe(EXIT_BOUNDARY);
    expect(err).toContain("completed");
  });

  it("halts the loop on `session interrupt --stop`, records `interrupted` with the reason, and a re-run continues", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);
    const inner = scripted(wellBehaved);
    let stopped = false;
    const engine: Engine = {
      name: "stoppable",
      async invoke(invocation: EngineInvocation) {
        const { instruction } = invocation;
        if (instruction.kind === "step" && instruction.step_id === "widget" && !stopped) {
          stopped = true;
          expect(interrupt(sessionsDir, { reason: "wrong file", stop: true })).toBe(EXIT_OK);
          await new Promise<void>((resolve) =>
            invocation.signal.addEventListener("abort", () => resolve(), { once: true }),
          );
          return { exitCode: null, interrupted: true };
        }
        return inner.invoke(invocation);
      },
    };

    const { code } = await drive(sessionsDir, engine);
    expect(code).not.toBe(EXIT_OK);
    // The invocation ended and nothing was re-invoked: plan, then the step.
    const run = readRun(repo, 1);
    expect(run?.invocations).toBe(2);
    expect(run?.phase).toBe("steps");
    expect(run?.stop).toEqual(expect.objectContaining({ kind: "interrupted", reason: "wrong file" }));
    expect(sessionStatus(sessionsDir)).toBe("in-progress");
    expect(buildTaskRows(sessionsDir, 1).map((row) => row.intent).join("\n")).toContain(
      "Driver stopped (interrupted): wrong file",
    );
    // A stop with nothing running is refused, like any interrupt.
    const refused = await captured(async () => interrupt(sessionsDir, { reason: "again", stop: true }));
    expect(refused.code).toBe(EXIT_BOUNDARY);
    // The same command picks the step up again and runs the session to a close.
    const { code: resumed } = await drive(sessionsDir, engine);
    expect(resumed).toBe(EXIT_OK);
    expect(sessionStatus(sessionsDir)).toBe("complete");
  });

  it("carries a Send made between invocations into the next instruction instead of discarding it", async () => {
    const { sessionsDir } = drivenRepo();
    configure([VERIFIED]);
    const inner = scripted(wellBehaved);
    const seen: DriverInstruction[] = [];
    const engine: Engine = {
      name: "sent-between",
      async invoke(invocation: EngineInvocation) {
        seen.push(invocation.instruction);
        const outcome = await inner.invoke(invocation);
        if (invocation.instruction.answer_schema === WORK_PLAN_SCHEMA) {
          // The plan is answered and this invocation is about to return:
          // what the operator sends now has no invocation to end.
          expect(interrupt(sessionsDir, { reason: "mind the widget" })).toBe(EXIT_OK);
        }
        return outcome;
      },
    };
    const { code, out } = await drive(sessionsDir, engine);
    expect(code).toBe(EXIT_OK);
    expect(out).toContain("interrupt-deferred");
    // Not re-invoked, not lost: the step instruction carries it, first.
    const step = seen.find((row) => row.kind === "step" && row.step_id === "widget");
    expect(step?.reasons).toEqual(["sent: mind the widget"]);
    expect(seen.filter((row) => row.kind === "interrupt")).toHaveLength(0);
    expect(sessionStatus(sessionsDir)).toBe("complete");
  });

  it("refuses an interrupt for a session nothing is driving", async () => {
    const { sessionsDir } = drivenRepo();
    configure([VERIFIED]);
    const registered = await captured(async () => start(sessionsDir, { engine: "claude-code", provider: "anthropic" }));
    expect(registered.code).toBe(EXIT_OK);
    const { code, err } = await captured(async () => interrupt(sessionsDir, { reason: "stop" }));
    expect(code).toBe(EXIT_BOUNDARY);
    expect(err).toContain("is not being driven");
  });
});

// --- the same loop, pulled -----------------------------------------------------

// `dabbler session next` is the loop with the engine on the other side of the
// call: it advances one move and hands back the instruction instead of
// invoking anybody with it. The person's own CLI is the engine, and so is
// this describe -- it answers through the same `session report` verb.
describe("dabbler session next", { timeout: 120_000 }, () => {
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

  /** One call, and the instruction it printed on stdout. */
  async function next(sessionsDir: string, options: NextOptions = {}) {
    const result = await captured(() => sessionNext(sessionsDir, options));
    return {
      ...result,
      instruction:
        result.out.trim() === "" ? null : (JSON.parse(result.out) as DriverInstruction),
    };
  }

  const REGISTER: NextOptions = { engine: "claude-code", provider: "anthropic" };

  async function answerFile(sessionsDir: string, seq: number, body: unknown) {
    const path = join(makeTempDir(), "answer.json");
    writeFileSync(path, JSON.stringify(body), "utf8");
    return (await captured(async () => report(sessionsDir, { seq, answerFile: path }))).code;
  }

  async function answerStep(
    sessionsDir: string,
    seq: number,
    stepId: string,
    files: readonly string[],
  ) {
    const done = await captured(async () =>
      report(sessionsDir, {
        seq,
        stepId,
        status: "done",
        files,
        testsRun: null,
        notes: "pulled",
      }),
    );
    return done.code;
  }

  /** Plan, then do the one step, leaving the session at the framework's own work. */
  async function throughTheStep(repo: string, sessionsDir: string) {
    const plan = await next(sessionsDir, REGISTER);
    expect(await answerFile(sessionsDir, plan.instruction?.seq ?? 0, PLAN)).toBe(0);
    const step = await next(sessionsDir);
    expect(step.instruction).toMatchObject({ kind: "step", step_id: "widget" });
    writeFileSync(join(repo, "src", "widget.py"), WIDGET_V2, "utf8");
    expect(
      await answerStep(sessionsDir, step.instruction?.seq ?? 0, "widget", ["src/widget.py"]),
    ).toBe(0);
  }

  it("advances one move per call and prints the instruction for the next one", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);

    const first = await next(sessionsDir, REGISTER);
    expect(first.code).toBe(EXIT_OK);
    expect(first.instruction).toMatchObject({ seq: 1, kind: "step", step_id: "plan" });
    expect(first.instruction?.ask).toContain("Make `widget()` return 2.");
    // Stdout is the instruction and nothing else -- a parser reads it -- and
    // everything the verbs said on the way is on stderr, where the person is.
    expect(first.out.trimStart().startsWith("{")).toBe(true);
    expect(first.err).toContain("dabbler [");
    expect(readRun(repo, 1)).toMatchObject({ phase: "plan", seq: 1, invocations: 0 });

    expect(await answerFile(sessionsDir, 1, PLAN)).toBe(0);

    const second = await next(sessionsDir);
    expect(second.instruction).toMatchObject({ seq: 2, kind: "step", step_id: "widget" });
    expect(readTaskDeclaration(sessionsDir, 1)).toMatchObject({
      task: "Make widget() return 2.",
      releasable: false,
    });
    expect(readRun(repo, 1)).toMatchObject({ phase: "steps", seq: 2 });
  });

  it("hands back a `wait` while the framework's own work runs, and the call after collects the result", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);
    await throughTheStep(repo, sessionsDir);

    const waited = await next(sessionsDir);
    expect(waited.instruction).toMatchObject({ kind: "wait", retry_after_seconds: 60 });
    // A wait owes no written answer, so it names no schema: the answer is
    // another call.
    expect(waited.instruction?.answer_schema).toBeUndefined();
    expect(waited.instruction?.answer_command).toContain("session next");
    expect(existsSync(join(repo, String(waited.instruction?.log)))).toBe(true);
    // The affected tests are the first of the framework's own long work.
    expect(readRun(repo, 1)?.job).toMatchObject({ name: "affected tests: unit" });

    let result = waited;
    for (let call = 0; call < 200 && result.instruction?.kind === "wait"; call += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      result = await next(sessionsDir);
    }

    // A stop prints no instruction; say why rather than assert on an absence.
    if (result.instruction === null) throw new Error(`the loop stopped: ${result.err}`);
    expect(result.instruction.kind).toBe("done");
    expect(readRun(repo, 1)).toMatchObject({ phase: "complete", job: null, stop: null });
    expect(sessionStatus(sessionsDir)).toBe("complete");
    expect(readRounds(repo, 1).map((row) => row["verdict"])).toEqual(["VERIFIED"]);
    expect(readRecords(repo).map((row) => `${row.stage}:${row.outcome}`)).toEqual([
      "preverify-targeted:passed",
      "final-full:passed",
    ]);
  });

  it("resumes from the phase it stopped in when the call after a stop asks again", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);

    const plan = await next(sessionsDir, REGISTER);
    expect(await answerFile(sessionsDir, plan.instruction?.seq ?? 0, PLAN)).toBe(0);

    // A person asks it to stop between calls: there is no invocation to end,
    // and the next call is where it takes effect.
    const asked = await captured(async () =>
      interrupt(sessionsDir, { reason: "hold on", stop: true }),
    );
    expect(asked.code).toBe(EXIT_OK);

    const stopped = await next(sessionsDir);
    expect(stopped.code).toBe(1);
    expect(stopped.instruction).toBeNull();
    expect(stopped.err).toContain("STOPPED (interrupted)");
    // It stopped before the phase's own work: the plan is answered but not
    // yet judged, and that is where the next call picks it up.
    expect(readRun(repo, 1)).toMatchObject({
      phase: "plan",
      stop: { kind: "interrupted", reason: "hold on" },
    });
    expect(sessionStatus(sessionsDir)).toBe("in-progress");

    const resumed = await next(sessionsDir);
    expect(resumed.code).toBe(EXIT_OK);
    expect(resumed.instruction).toMatchObject({ kind: "step", step_id: "widget" });
    expect(readRun(repo, 1)).toMatchObject({ phase: "steps", stop: null });
  });

  it("asks the step afresh after a rejected-thrice stop instead of rejudging the answer that failed", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);

    const plan = await next(sessionsDir, REGISTER);
    expect(await answerFile(sessionsDir, plan.instruction?.seq ?? 0, PLAN)).toBe(0);

    // Three reports naming a file the tree never changed. The third refusal
    // stops the loop and issues nothing.
    let step = await next(sessionsDir);
    for (let refusal = 1; refusal <= 3; refusal += 1) {
      expect(
        await answerStep(sessionsDir, step.instruction?.seq ?? 0, "widget", ["dabbler.yaml"]),
      ).toBe(0);
      step = await next(sessionsDir);
      if (refusal < 3) expect(step.instruction).toMatchObject({ kind: "rejection" });
    }
    expect(step.code).toBe(1);
    expect(step.instruction).toBeNull();
    expect(step.err).toContain("STOPPED (rejected-thrice)");
    const stopped = readRun(repo, 1);
    expect(stopped).toMatchObject({ rejections: 3, stop: { kind: "rejected-thrice" } });

    // The call after it hands back a fresh instruction under a new seq --
    // it does not judge the same failed report a fourth time and stop again.
    const afresh = await next(sessionsDir);
    expect(afresh.code).toBe(EXIT_OK);
    expect(afresh.instruction).toMatchObject({ kind: "step", step_id: "widget" });
    expect(afresh.instruction?.seq).toBeGreaterThan(stopped?.seq ?? 0);
    expect(readRun(repo, 1)).toMatchObject({ rejections: 0, stop: null });

    // And the session goes on: answer this one properly and it is accepted.
    writeFileSync(join(repo, "src", "widget.py"), WIDGET_V2, "utf8");
    expect(
      await answerStep(sessionsDir, afresh.instruction?.seq ?? 0, "widget", ["src/widget.py"]),
    ).toBe(0);
    expect((await next(sessionsDir)).instruction?.kind).toBe("wait");
    expect(readRun(repo, 1)?.accepted_steps).toEqual(["widget"]);
  });

  it("carries the round cap and the transport on the run, for the call that reaches verification", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);

    // Named once, on the call that opens the run.
    const plan = await next(sessionsDir, { ...REGISTER, maxRounds: 1, transport: "offline" });
    expect(readRun(repo, 1)?.verification).toEqual({ max_rounds: 1, transport: "offline" });
    expect(await answerFile(sessionsDir, plan.instruction?.seq ?? 0, PLAN)).toBe(0);

    // Every later call follows the printed answer_command, which names
    // neither -- and they survive it.
    const step = await next(sessionsDir);
    writeFileSync(join(repo, "src", "widget.py"), WIDGET_V2, "utf8");
    expect(
      await answerStep(sessionsDir, step.instruction?.seq ?? 0, "widget", ["src/widget.py"]),
    ).toBe(0);
    await next(sessionsDir);
    let job = readRun(repo, 1)?.job;
    for (let call = 0; call < 200 && job?.name !== "verification"; call += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      await next(sessionsDir);
      job = readRun(repo, 1)?.job;
    }
    expect(job?.argv.join(" ")).toContain("--max-rounds 1");
    expect(job?.argv.join(" ")).toContain("--transport offline");
  });

  it("returns from every call that starts a job rather than waiting for it", async () => {
    const { repo, sessionsDir } = drivenRepo();
    // A suite slow enough that each job is still running when the call that
    // started it comes back.
    writeFileSync(
      join(repo, "tests", "run.mjs"),
      "import { readFileSync } from 'node:fs';\n" +
        "const red = readFileSync('src/widget.py', 'utf8').includes('broken');\n" +
        "setTimeout(() => process.exit(red ? 1 : 0), 2000);\n",
      "utf8",
    );
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "a slower suite");
    configure([VERIFIED]);
    await throughTheStep(repo, sessionsDir);

    const waitedOn = new Set<string>();
    let last: DriverInstruction | null = null;
    for (let call = 0; call < 200; call += 1) {
      last = (await next(sessionsDir)).instruction;
      if (last?.kind !== "wait") break;
      waitedOn.add(String(last.log));
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    expect(last?.kind).toBe("done");
    // Every long thing the framework runs was handed back as a `wait` while
    // it ran. That is the whole claim, and it is a fact about the exchange
    // rather than about the clock: a call that sat on a job would collect
    // its result and never issue a `wait` naming it. A wall-time bound here
    // would say the same thing on an idle machine and something else on a
    // busy one.
    expect([...waitedOn].map((log) => log.split("/").pop()).sort()).toEqual([
      "affected-tests-unit.log",
      "close.log",
      "run-of-record-unit.log",
      "verification.log",
    ]);
    expect(readRecords(repo).map((row) => `${row.stage}:${row.outcome}`)).toEqual([
      "preverify-targeted:passed",
      "final-full:passed",
    ]);
  });
});
