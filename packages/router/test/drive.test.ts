// `dabbler session drive`: the framework runs a session and the engine
// answers. One test per transition of the loop, driven by a scripted engine
// in-process -- no model, no seat -- against the offline verifier the round
// tests use. What is asserted is the record a driven session leaves: the
// same files a typed session leaves, written by the same verbs.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  requestInterrupt,
  transcriptPath,
} from "../src/driver.ts";
import type { DriverInstruction } from "../src/generated/index.ts";
import { runGit } from "../src/journal.ts";
import { readDisputes, readRounds } from "../src/ledger.ts";
import { openDecisions } from "../src/owedDecisions.ts";
import { buildTaskRows, readSessionState } from "../src/progress.ts";
import { resetForTests } from "../src/route.ts";
import { resetForTests as resetRuntimeMode } from "../src/runtimeMode.ts";
import { EXIT_BOUNDARY, EXIT_OK, interrupt, planAmend, report, start } from "../src/session.ts";
import { readRecords } from "../src/testEvidence.ts";
import { declareSessionTask, readTaskDeclaration } from "../src/writers.ts";
import {
  captured,
  clearProviderKeys,
  git,
  initRepo,
  makeConfig,
  makeTempDir,
  removeTempDirs,
  setProviderKeys,
  writeYaml,
} from "./support/fixtures.ts";

afterAll(removeTempDirs);

/**
 * The router, replaced for triage calls and for nothing else.
 *
 * The ladder is the only thing in this file that asks a provider something
 * the offline transport cannot script -- a verification round is scripted by
 * `configure`, and intercepting that here would replace the very thing the
 * rest of these tests are about. So the fake answers `session-triage` and
 * hands every other call straight back to the real router.
 */
const advisers = vi.hoisted(() => ({
  replies: [] as Array<readonly [string, string]>,
  calls: [] as Array<{ exclude: string[] }>,
}));

vi.mock("../src/route.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/route.ts")>();
  return {
    ...actual,
    route: (content: string, options: Record<string, unknown> = {}) => {
      if (options.taskType !== "session-triage") return actual.route(content, options);
      const exclude = (options.excludeProviders as string[]) ?? [];
      advisers.calls.push({ exclude: [...exclude] });
      const next = advisers.replies.shift();
      if (next === undefined) throw new actual.NoCandidateError("no adviser is left");
      const [provider, body] = next;
      if (exclude.includes(provider)) throw new actual.NoCandidateError(`${provider} is excluded`);
      return Promise.resolve({
        content: body,
        model_name: `${provider}-model`,
        model_id: "x",
        provider,
        input_tokens: 1,
        output_tokens: 1,
        escalated: false,
        escalation_history: [],
        elapsed_seconds: 0.1,
        transport: "offline",
        truncated: false,
        transport_session_id: null,
        served_model_id: null,
        metadata: {},
      });
    },
  };
});

// --- the repository under drive ----------------------------------------------

const NODE = process.execPath;

/** The identity  registers under, for a test that registers first. */
const REGISTRATION = { engine: "claude-code", provider: "anthropic" };
const WIDGET_V2 = "def widget():\n    return 2\n";

const SEED: Record<string, string> = {
  "docs/sessions/session-plan.md":
    "### Session 1 of 2: The widget\n1. Register.\n2. Make `widget()` return 2.\n" +
    "3. Verify; close.\n\n### Session 2 of 2: Later\n1. Polish.\n",
  "dabbler.yaml": "schema_version: 1\n",
  "src/widget.py": "def widget():\n    return 1\n",
  "tests/test_widget.py": "def test_widget():\n    assert True\n",
  // The suite: red while the widget says it is broken, green otherwise. And
  // red for the WHOLE run only -- no test path named -- while
  // `.dabbler/full-suite-red` exists, which is how a session reaches a
  // failing run of record over a tree whose targeted tests pass. The marker
  // lives under `.dabbler/` because that directory is outside the tree
  // digest, so creating and removing it is not a file any step must report.
  "tests/run.mjs":
    "import { existsSync, readFileSync } from 'node:fs';\n" +
    "const widget = readFileSync('src/widget.py', 'utf8');\n" +
    "const whole = process.argv.length <= 2;\n" +
    "const red = whole && existsSync('.dabbler/full-suite-red');\n" +
    "process.exit(widget.includes('broken') || red ? 1 : 0);\n",
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
  initRepo(repo, "-b", "main");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "seed");
  git(target, "init", "-q", "--bare", remote);
  git(repo, "remote", "add", "origin", "../remote.git");
  git(repo, "push", "-q", "-u", "origin", "main");
  return { repo, sessionsDir: join(repo, "docs", "sessions") };
}

/**
 * The same repository with nothing to push to, which is the ordinary state
 * of a repository on its first day and the one the csv-model trial met.
 */
function repoWithNoRemote(): { repo: string; sessionsDir: string } {
  const made = drivenRepo();
  git(made.repo, "remote", "remove", "origin");
  return made;
}

/** The verifier's scripted responses and the driver's budget, as the config. */
function configure(
  responses: readonly string[],
  driver: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
): void {
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
      ...extra,
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

/** One adviser's answer, in the shape `triage.schema.json` asks for. */
const TRIAGE_ANSWER = JSON.stringify({
  classification: "plan-defect",
  reasoning: "The step cannot be done as written; its own notes say the widget is load-bearing.",
  recommendation: "Amend the step and run it again.",
  amendment: {
    step_id: "widget",
    checks: [{ argv: ["node", "-e", "process.exit(0)"] }],
    reason: "The check the step declares cannot pass while the widget must keep returning 1.",
    relaxes_a_gate: true,
  },
});

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
    advisers.replies = [];
    advisers.calls = [];
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
    expect(engine.seen[1]?.reasons?.[0]).toBe(
      `[no-work-plan] no work plan was written for instruction 1; the answer is \`${
        engine.seen[0]?.answer_command ?? ""
      }\``,
    );
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

  it("runs the publish between the land and the close, and only when the session may publish", async () => {
    // The csv-model defect: a session declared releasable landed, closed
    // VERIFIED and shipped nothing, because no phase ever called packaging
    // -- while the managed body told the engine the framework had done it.
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);
    const releasable: Script = ({ instruction }, tools) => {
      if (instruction.answer_schema === WORK_PLAN_SCHEMA) {
        tools.answer({ ...PLAN, releasable: true });
        return;
      }
      wellBehaved({ instruction } as Parameters<Script>[0], tools);
    };

    const { code } = await drive(sessionsDir, scripted(releasable));
    // This repository declares no packaging block, so the publish refuses
    // and the loop stops in `publish` -- which is the point: the phase ran,
    // it was reached after the land, and it did not silently do nothing.
    expect(code).not.toBe(0);
    const run = readRun(repo, 1) as { phase: string; stop: { kind: string } };
    expect(run.phase).toBe("publish");
    expect(run.stop.kind).toBe("publish");
    // The land happened first: publishing an uncommitted tree is what the
    // ordering exists to prevent, and packaging's own gates would refuse it.
    expect(runGit(repo, ["log", "--format=%s", "-n", "1"]).stdout).toContain("Session 1:");
    expect(runGit(repo, ["status", "--porcelain"]).stdout).toBe("");
  });

  it("asks the declaration whether to publish, not the plan the engine wrote", async () => {
    // Two fields for one fact: the engine writes `releasable` into its work
    // plan, and `phasePlan` turns that into a declaration ONLY when there is
    // not one already. An operator who declared the session first can
    // therefore disagree with the plan, and the publish phase used to
    // believe the plan -- which is the engine deciding whether the session
    // owes a deliverable.
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);
    expect((await captured(async () => start(sessionsDir, REGISTRATION))).code).toBe(0);
    declareSessionTask(sessionsDir, {
      sessionNumber: 1,
      task: "Make widget() return 2.",
      releasable: false,
    });
    const engine = scripted(({ instruction }, tools) => {
      if (instruction.answer_schema === WORK_PLAN_SCHEMA) {
        return void tools.answer({ ...PLAN, releasable: true });
      }
      tools.write("src/widget.py", WIDGET_V2);
      tools.report({ step: instruction.step_id as string, files: ["src/widget.py"] });
    });

    const { code } = await drive(sessionsDir, engine);
    // It closes rather than stopping in `publish`: the operator said this
    // session ships nothing, and the plan does not overrule them. (This
    // repository declares no packaging block, so a publish would have
    // stopped the loop -- which is how the old reading showed itself.)
    expect(code).toBe(0);
    expect(readTaskDeclaration(sessionsDir, 1)).toMatchObject({ releasable: false });
    expect(readRun(repo, 1)?.phase).toBe("complete");
    expect(sessionStatus(sessionsDir)).toBe("complete");
  });

  it("passes a session that may not publish straight from land to close", async () => {
    // Nothing to say about a step that does not apply. The default plan is
    // `releasable: false`, which is every session this repository has run.
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);

    const { code } = await drive(sessionsDir, scripted(wellBehaved));
    expect(code).toBe(0);
    expect(readRun(repo, 1)).toMatchObject({ phase: "complete", stop: null });
  });

  it("stops a land with no remote by saying so, and never calls it fatal", async () => {
    // git answers this with `fatal: No configuration push destination`, and
    // both of those words are wrong: nothing terminated -- the commit is on
    // disk and the session is intact -- and there is no configuration to
    // fix, only a repository nobody has given anywhere to push to yet.
    const { repo, sessionsDir } = repoWithNoRemote();
    configure([VERIFIED]);

    const { code } = await drive(sessionsDir, scripted(wellBehaved));
    expect(code).not.toBe(0);
    const run = readRun(repo, 1) as { phase: string; stop: { kind: string; reason: string } };
    expect(run.phase).toBe("land");
    expect(run.stop.kind).toBe("land");
    expect(run.stop.reason).toContain("no remote");
    expect(run.stop.reason).not.toContain("fatal");
    // Both ways forward, so the operator is not left to guess which one
    // this repository is.
    expect(run.stop.reason).toContain("git remote add origin");
    expect(run.stop.reason).toContain(".dabbler/local-only");
    // The work is committed: what stopped is the push, not the session.
    expect(runGit(repo, ["status", "--porcelain"]).stdout).toBe("");
  });

  it("commits and stops without a push when the repository says it is local-only", async () => {
    // The other half of the sentence above: a repository that declares
    // itself local reaches the close rather than the stop.
    const { repo, sessionsDir } = repoWithNoRemote();
    mkdirSync(join(repo, ".dabbler"), { recursive: true });
    writeFileSync(join(repo, ".dabbler", "local-only"), "", "utf8");
    configure([VERIFIED]);

    const { code } = await drive(sessionsDir, scripted(wellBehaved));
    expect(code).toBe(0);
    expect(readRun(repo, 1)).toMatchObject({ phase: "complete", stop: null });
  });

  it("accepts a report that omits a step-declared file the tree did not change", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);
    // The plan promises a file the work leaves byte-identical -- session 62's
    // managed-body deadlock: omitting it was refused as a must-include while
    // naming it was refused as unchanged, and no report could be accepted.
    const plan = {
      ...PLAN,
      steps: [{ ...PLAN.steps[0], files: ["src/widget.py", "tests/test_widget.py"] }],
    };
    const engine = scripted(({ instruction }, tools) => {
      if (instruction.answer_schema === WORK_PLAN_SCHEMA) return void tools.answer(plan);
      tools.write("src/widget.py", WIDGET_V2);
      tools.report({ step: "widget", files: ["src/widget.py"] });
    });

    const { code, out } = await drive(sessionsDir, engine);
    expect(code).toBe(0);
    expect(engine.seen.map((entry) => entry.kind)).toEqual(["step", "step"]);
    expect(out).toContain("step-file-unchanged");
    expect(readRun(repo, 1)).toMatchObject({
      phase: "complete",
      accepted_steps: ["widget"],
      stop: null,
    });
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
    expect(engine.seen[2]?.reasons?.[0]).toContain(
      "[files-changed-omits] files_changed omits 'tests/test_widget.py', which the tree changed",
    );
    // And it names the one way a changed file can belong to no step, so an
    // engine meeting a hand-repair is not left to fold it into this one.
    expect(engine.seen[2]?.reasons?.[0]).toContain("session rebaseline");
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
    // Spent and forgotten: the set produced its fix step, and a set left
    // behind is one the next pass through dispositions acts on again
    // without asking anybody.
    expect(readDispositions(repo, 1)).toBeNull();
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

  it("says an instruction is outstanding while a headless engine is quiet over it", async () => {
    // The pull has a terminal to say it in; a driven run has its own stream,
    // and the poll that watches for interrupts is the only thing awake while
    // the engine holds the call. One threshold of a second, an engine that
    // does nothing for two of them, and the rule -- the same one -- answers.
    const { sessionsDir } = drivenRepo();
    configure([VERIFIED], { max_invocations: 1 }, { verification: { stalled_after_seconds: 1 } });
    const idle = scripted(async () => {
      await new Promise((resolve) => setTimeout(resolve, 2400));
    });
    const { out } = await drive(sessionsDir, idle);
    const said = out.split("\n").filter((line) => line.includes("watcher "));
    expect(said.length).toBeGreaterThanOrEqual(1);
    expect(said[0]).toContain("state=instruction-outstanding");
    expect(said[0]).toMatch(/since=\d+s/);
  });

  it("classifies a second budget stop under the same bound as a deadlock", async () => {
    // The harvest read the budget stop's reason as carrying an incrementing
    // count, which would make two of them never compare equal and the
    // classifier useless on the bound most likely to be met twice. It does
    // not: the count cannot advance while the bound is met -- `invoke`
    // refuses BEFORE spending an invocation -- so the reason is identical
    // and the classifier fires. Pinned here so a later change to that
    // message cannot quietly make the harvest's version true.
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED], { max_invocations: 1 });
    expect((await drive(sessionsDir, scripted(wellBehaved))).code).toBe(1);
    expect(readRun(repo, 1)?.stop).toMatchObject({ kind: "budget", class: "first" });

    const again = await drive(sessionsDir, scripted(wellBehaved));
    expect(again.code).toBe(1);
    expect(again.err).toContain("STOPPED (budget, deadlock)");
    expect(readRun(repo, 1)?.stop).toMatchObject({ kind: "budget", class: "deadlock" });
    const history = readRun(repo, 1)?.stop_history ?? [];
    expect(history[0]?.reason).toBe(history[1]?.reason);
  });

  it("stops once at the cap on a finding that cannot be shown remediated, rather than cycling on it", async () => {
    // The cycle this breaks: `verify` at the cap writes NO round and used to
    // answer with the same code as a recorded blocking round, so the driver
    // went back to dispositions, found the set it had already acted on,
    // re-issued the same fix, ran the suite and arrived here again -- an
    // engine turn and a suite run per lap, in the colours of ordinary
    // progress. A finding citing no path can never be shown remediated, so
    // no amount of work breaks it.
    const { repo, sessionsDir } = drivenRepo();
    configure(
      ["ISSUES FOUND\n\nIssue 1: the error handling in this module is inconsistent.\nSeverity: Major\n"],
      {},
      { verification: { settings: { max_rounds: 1 } } },
    );
    const engine = scripted(async (invocation, tools) => {
      const { instruction } = invocation;
      if (instruction.answer_schema === DISPOSITION_SCHEMA) {
        tools.answer({ dispositions: [{ finding_index: 0, action: "fix" }] });
        return;
      }
      if (instruction.step_id === "fix-round-1") {
        tools.write("src/widget.py", `# tried\n${WIDGET_V2}`);
        tools.report({ step: "fix-round-1", files: ["src/widget.py"] });
        return;
      }
      await wellBehaved(invocation, tools);
    });

    const { code } = await drive(sessionsDir, engine);
    expect(code).toBe(1);
    const stop = readRun(repo, 1)?.stop;
    expect(stop?.kind).toBe("verification");
    expect(stop?.reason).toContain("cannot be shown remediated");
    expect(stop?.reason).toContain("(no path cited)");
    // One lap, not many: one fix step, one round on the ledger, and the
    // disposition set gone rather than waiting to be re-used.
    expect(engine.seen.filter((entry) => entry.step_id === "fix-round-1")).toHaveLength(1);
    expect(readRounds(repo, 1)).toHaveLength(1);
    expect(readDispositions(repo, 1)).toBeNull();
    expect(sessionStatus(sessionsDir)).toBe("in-progress");
  });

  it("routes past a verification that can open no further round, instead of stopping in front of it", async () => {
    // The run of record fails AFTER a clean verification, which is the
    // ordinary way back into `verify` -- and with the cap already reached
    // over a clean round, `verify` refuses with "there is nothing left to
    // verify. Close the session." That is an instruction to advance, and
    // the driver used to read it as a wall: correct work, a green suite,
    // and a session that could never close.
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED], {}, { verification: { settings: { max_rounds: 1 } } });
    // The run of record fails for a reason outside the tree, and the fix is
    // outside it too -- so the tree the verifier reviewed is still the tree,
    // which is the condition under which advancing is honest.
    mkdirSync(join(repo, ".dabbler"), { recursive: true });
    writeFileSync(join(repo, ".dabbler", "full-suite-red"), "", "utf8");
    const engine = scripted(({ instruction }, tools) => {
      if (instruction.answer_schema === WORK_PLAN_SCHEMA) return void tools.answer(PLAN);
      if (instruction.step_id === "widget") {
        tools.write("src/widget.py", WIDGET_V2);
        tools.report({ step: "widget", files: ["src/widget.py"] });
        return;
      }
      rmSync(join(repo, ".dabbler", "full-suite-red"));
      tools.report({ step: instruction.step_id as string, files: [] });
    });

    const { code, out, err } = await drive(sessionsDir, engine);
    if (code !== 0) throw new Error(`${err}\n---OUT---\n${out}`);
    expect(engine.seen.map((entry) => entry.step_id)).toEqual([
      "plan",
      "widget",
      "fix-run-of-record",
    ]);
    // The second visit to `verify` spends no round and no job: the ledger
    // already answers it.
    expect(out).toContain("verification-settled reason=cap-clean");
    expect(readRounds(repo, 1)).toHaveLength(1);
    expect(readRecords(repo).map((row) => `${row.stage}:${row.outcome}`)).toEqual([
      "preverify-targeted:passed",
      "final-full:failed",
      "preverify-targeted:passed",
      "final-full:passed",
    ]);
    expect(sessionStatus(sessionsDir)).toBe("complete");
  });

  it("stops with what to do when the cap is spent and the tree is not the one that was verified", async () => {
    // The other half of the same edge, and the reason it is not a bare
    // route: a repair after the last reviewed round is work no verifier
    // saw. `verify` would still say "nothing left to verify", which is
    // true of the tree it reviewed and false of this one.
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED], {}, { verification: { settings: { max_rounds: 1 } } });
    mkdirSync(join(repo, ".dabbler"), { recursive: true });
    writeFileSync(join(repo, ".dabbler", "full-suite-red"), "", "utf8");
    const engine = scripted(({ instruction }, tools) => {
      if (instruction.answer_schema === WORK_PLAN_SCHEMA) return void tools.answer(PLAN);
      if (instruction.step_id === "widget") {
        tools.write("src/widget.py", WIDGET_V2);
        tools.report({ step: "widget", files: ["src/widget.py"] });
        return;
      }
      // This one repairs the tree as well, which is the ordinary shape of a
      // fix and the reason the round it was verified against no longer
      // describes anything.
      rmSync(join(repo, ".dabbler", "full-suite-red"));
      tools.write("src/widget.py", `${WIDGET_V2}# repaired\n`);
      tools.report({ step: instruction.step_id as string, files: ["src/widget.py"] });
    });

    const { code } = await drive(sessionsDir, engine);
    expect(code).toBe(1);
    const stop = readRun(repo, 1)?.stop;
    expect(stop?.kind).toBe("verification");
    expect(stop?.reason).toContain("cap-clean");
    expect(stop?.reason).toContain("the working tree changed after verification round");
    expect(stop?.reason).toContain("--max-rounds");
    expect(sessionStatus(sessionsDir)).toBe("in-progress");
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

  it("raises a stop as an owed decision, and retires it when the run resumes", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED], { max_invocations: 1 });
    const stopped = await drive(sessionsDir, scripted(wellBehaved));
    expect(stopped.code).toBe(1);

    // One kind of row serves every "waiting on you": the stop is a question
    // with two answers, not a field somebody has to know to read.
    const raised = openDecisions(repo).find((row) =>
      String(row["id"]).startsWith("driver-stop-"),
    );
    expect(raised).toMatchObject({ severity: "advisory", recommendation: "Run `next` again" });
    expect(String(raised?.["question"])).toContain("Session 001 stopped (budget)");
    expect(String(raised?.["determined"])).toContain("driver.max_invocations (1)");
    expect(
      (raised?.["options"] as Array<Record<string, unknown>>).map((option) => option["label"]),
    ).toEqual(["Run `next` again", "Cancel the session"]);

    // Resuming IS the answer, so the question does not outlive the stop.
    const resumed = await drive(sessionsDir, scripted(wellBehaved), 6);
    expect(resumed.code).toBe(0);
    expect(
      openDecisions(repo).some((row) => String(row["id"]).startsWith("driver-stop-")),
    ).toBe(false);
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

  it("calls the second stop on a step a deadlock when its reason has not changed", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);
    const blocking = (notes: string) =>
      scripted(({ instruction }, tools) => {
        if (instruction.answer_schema === WORK_PLAN_SCHEMA) return void tools.answer(PLAN);
        tools.report({ step: "widget", files: [], status: "blocked", notes });
      });

    const first = await drive(sessionsDir, blocking("the widget is load-bearing"));
    expect(first.code).toBe(1);
    expect(readRun(repo, 1)?.stop).toMatchObject({
      kind: "blocked",
      class: "first",
      step_id: "widget",
    });

    // The same bound, the same step, the same reason: a re-run reaches this
    // exact point again, and the record says so rather than leaving whoever
    // reads it to notice they have seen this before.
    const again = await drive(sessionsDir, blocking("the widget is load-bearing"));
    expect(again.code).toBe(1);
    expect(again.err).toContain("STOPPED (blocked, deadlock)");
    expect(readRun(repo, 1)?.stop).toMatchObject({ kind: "blocked", class: "deadlock" });
    expect(readRun(repo, 1)?.stop?.reason).toContain("DEADLOCK");

    // A different reason is a loop that moved, however little.
    const moved = await drive(sessionsDir, blocking("the widget belongs to another module"));
    expect(moved.code).toBe(1);
    expect(readRun(repo, 1)?.stop).toMatchObject({ kind: "blocked", class: "first" });
    expect(readRun(repo, 1)?.stop?.reason).not.toContain("DEADLOCK");

    // Three stops, oldest first, each remembered with the reason it was
    // raised with -- which is what the next comparison is made against.
    const history = readRun(repo, 1)?.stop_history ?? [];
    expect(history.map((row) => row.step_id)).toEqual(["widget", "widget", "widget"]);
    expect(history.map((row) => row.reason.includes("DEADLOCK"))).toEqual([false, false, false]);
  });

  it("takes a deadlock to a second adviser when the first cannot answer in the shape asked for", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);
    const blocking = () =>
      scripted(({ instruction }, tools) => {
        if (instruction.answer_schema === WORK_PLAN_SCHEMA) return void tools.answer(PLAN);
        tools.report({ step: "widget", files: [], status: "blocked", notes: "the widget is load-bearing" });
      });

    // The first stop is not a deadlock, so nobody is asked about it.
    expect((await drive(sessionsDir, blocking())).code).toBe(1);
    expect(advisers.calls).toEqual([]);

    // The second is. openai answers twice and neither answer fits, so that
    // rung is spent and google is asked -- with openai excluded as well.
    advisers.replies = [
      ["openai", "I think it is fine, actually."],
      ["openai", "Still fine."],
      ["google", TRIAGE_ANSWER],
    ];
    expect((await drive(sessionsDir, blocking())).code).toBe(1);
    expect(advisers.calls.map((call) => call.exclude)).toEqual([
      ["anthropic"],
      ["anthropic"],
      ["anthropic", "openai"],
    ]);
    expect(readRun(repo, 1)?.triage).toMatchObject({
      rungs: 2,
      classification: "plan-defect",
      for_step: "widget",
    });

    // What it found reaches the operator's own row as an option and never as
    // an act: the plan is not amended by anybody but a person.
    const raised = openDecisions(repo).find((row) => String(row["id"]).startsWith("driver-stop-"));
    expect(String(raised?.["determined"])).toContain("plan-defect");
    expect(
      (raised?.["options"] as Array<Record<string, unknown>>).map((option) => option["label"]),
    ).toEqual(["Run `next` again", "Cancel the session", "Amend step 'widget'"]);
    expect(raised?.["recommendation"]).toBe("Amend step 'widget'");
    const amend = (raised?.["options"] as Array<Record<string, unknown>>)[2];
    expect(String(amend?.["consequence"])).toContain("IT RELAXES A GATE");
  });

  it("lands a deadlock nobody could classify as an owed decision with the artifacts and no recommendation", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);
    const engine = () =>
      scripted(({ instruction }, tools) => {
        if (instruction.answer_schema === WORK_PLAN_SCHEMA) return void tools.answer(PLAN);
        tools.write("src/widget.py", WIDGET_V2);
        tools.report({ step: "widget", files: [] });
      });

    expect((await drive(sessionsDir, engine())).code).toBe(1);
    // Every adviser answers, and none of them answers the question.
    advisers.replies = [
      ["openai", "no"],
      ["openai", "no"],
      ["google", "no"],
      ["google", "no"],
    ];
    expect((await drive(sessionsDir, engine())).code).toBe(1);
    expect(advisers.calls).toHaveLength(4);
    expect(readRun(repo, 1)?.triage).toMatchObject({ rungs: 2, classification: null });

    // The honest brief: the framework's own artifacts, and no recommendation
    // invented to fill the field.
    const raised = openDecisions(repo).find((row) => String(row["id"]).startsWith("driver-stop-"));
    expect(raised?.["recommendation"]).toBeNull();
    const determined = String(raised?.["determined"]);
    expect(determined).toContain("No adviser could classify this");
    expect(determined).toContain("[files-changed-omits]");
    expect(determined).toContain(".dabbler/runs/s1/driver/");
    // The artifacts are the record's own, not a summary of it: the run's
    // stop, the outstanding instruction and the report that was refused.
    expect(determined).toContain("run.json: phase 'steps', stop 'rejected-thrice'");
    expect(determined).toContain("instruction.json: seq");
    expect(determined).toContain("report.json: seq");
    expect(
      (raised?.["options"] as Array<Record<string, unknown>>).map((option) => option["label"]),
    ).toEqual(["Run `next` again", "Cancel the session"]);
  });

  it("reaches the human floor when the adviser cannot be reached at all", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);
    const blocking = () =>
      scripted(({ instruction }, tools) => {
        if (instruction.answer_schema === WORK_PLAN_SCHEMA) return void tools.answer(PLAN);
        tools.report({ step: "widget", files: [], status: "blocked", notes: "load-bearing" });
      });
    expect((await drive(sessionsDir, blocking())).code).toBe(1);

    // An outage, an expired key, a rate limit: routine, and none of them may
    // cost the operator the row that says the session stopped. Leaving the
    // reply queue empty is how the fake refuses to answer at all.
    advisers.replies = [];
    expect((await drive(sessionsDir, blocking())).code).toBe(1);
    const raised = openDecisions(repo).find((row) => String(row["id"]).startsWith("driver-stop-"));
    expect(raised?.["recommendation"]).toBeNull();
    expect(String(raised?.["determined"])).toContain("No adviser could classify this");
    expect(readRun(repo, 1)?.triage).toMatchObject({ classification: null });
  });

  it("keeps an adviser's proposal whole, so the amend option is something a person can act on", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);
    const blocking = () =>
      scripted(({ instruction }, tools) => {
        if (instruction.answer_schema === WORK_PLAN_SCHEMA) return void tools.answer(PLAN);
        tools.report({ step: "widget", files: [], status: "blocked", notes: "load-bearing" });
      });
    expect((await drive(sessionsDir, blocking())).code).toBe(1);
    advisers.replies = [["openai", TRIAGE_ANSWER]];
    expect((await drive(sessionsDir, blocking())).code).toBe(1);

    // On the record rather than in the process that heard it: the person who
    // answers the decision is not the process that asked the adviser.
    expect(readRun(repo, 1)?.triage?.amendment).toMatchObject({
      step_id: "widget",
      relaxes_a_gate: true,
      checks: [{ argv: ["node", "-e", "process.exit(0)"] }],
    });

    // And in the brief, as the command a person would type -- an option to
    // amend a step without saying what the amendment is asks somebody to
    // agree to a change nobody has shown them.
    const raised = openDecisions(repo).find((row) => String(row["id"]).startsWith("driver-stop-"));
    const amend = (raised?.["options"] as Array<Record<string, unknown>>)[2];
    const consequence = String(amend?.["consequence"]);
    expect(consequence).toContain("IT RELAXES A GATE");
    expect(consequence).toContain("dabbler session plan amend");
    expect(consequence).toContain("--step widget");
    expect(consequence).toContain("process.exit(0)");
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
    expect(err).toContain("was never driven");
  });

  it("holds a Send made against a stopped run and hands it to the instruction that resumes it", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED], { max_invocations: 1 });
    const engine = scripted(wellBehaved);
    expect((await drive(sessionsDir, engine)).code).toBe(1);
    expect(readRun(repo, 1)?.stop?.kind).toBe("budget");

    // There is no invocation to end, and that is not a reason to refuse:
    // this is exactly the coaching a person leaves for the resume, and
    // until now there was no way to give it.
    const sent = await captured(async () => interrupt(sessionsDir, { reason: "mind the widget" }));
    expect(sent.code).toBe(EXIT_OK);
    expect(sent.out).toContain("held for session 001");

    const resumed = scripted(wellBehaved);
    expect((await drive(sessionsDir, resumed, 6)).code).toBe(EXIT_OK);
    expect(resumed.seen[0]?.reasons).toEqual(["sent: mind the widget"]);
    expect(sessionStatus(sessionsDir)).toBe("complete");
  });

  it("delivers a request the driver never read instead of discarding it at the start of a run", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);
    const registered = await captured(async () =>
      start(sessionsDir, { engine: "claude-code", provider: "anthropic" }),
    );
    expect(registered.code).toBe(EXIT_OK);
    // Written before the run exists at all -- the case the push relaunch
    // used to clear on the way in. What decides is whether it has been
    // READ, not which mode is starting.
    requestInterrupt(repo, 1, "check the tests too", "2026-08-31T12:00:00-04:00");

    const engine = scripted(wellBehaved);
    expect((await drive(sessionsDir, engine)).code).toBe(EXIT_OK);
    expect(engine.seen[0]?.reasons).toEqual(["sent: check the tests too"]);
    expect(engine.seen.filter((row) => row.kind === "interrupt")).toHaveLength(0);
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
    advisers.replies = [];
    advisers.calls = [];
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

  it("judges a retried step against the amendment, not the step it just refused", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);

    // A step whose declared check cannot pass, which is what an amendment
    // is for. The engine amends it once, after the first refusal.
    const impossible = {
      ...PLAN,
      steps: [{ ...PLAN.steps[0], checks: [{ argv: [NODE, "-e", "process.exit(1)"] }] }],
    };
    const passing = join(makeTempDir(), "checks.json");
    writeFileSync(passing, JSON.stringify([{ argv: [NODE, "-e", "process.exit(0)"] }]), "utf8");

    let amendments = 0;
    const engine = scripted(({ instruction }, tools) => {
      if (instruction.answer_schema === WORK_PLAN_SCHEMA) {
        tools.answer(impossible);
        return;
      }
      if (instruction.step_id !== "widget") return;
      if (instruction.kind === "rejection" && amendments === 0) {
        amendments += 1;
        planAmend(sessionsDir, {
          stepId: "widget",
          files: null,
          checksFile: passing,
          maxRounds: null,
          reason: "the declared check cannot pass",
          approver: "the test",
        });
      }
      tools.write("src/widget.py", WIDGET_V2);
      tools.report({ step: "widget", files: ["src/widget.py"] });
    });

    await drive(sessionsDir, engine);

    // One refusal, then the amended check -- not three refusals and a stop,
    // which is what a loop holding the plan it started with produces.
    expect(amendments).toBe(1);
    expect(readRun(repo, 1)).toMatchObject({ accepted_steps: ["widget"] });
  });

  it("places the repositories the plan says it needs, when the plan is accepted", async () => {
    // A multi-repository plan that named its next repository only in prose
    // left the operator to remember it -- and the operator's own sentence
    // was that finishing the first repository left them not knowing what
    // came next. The plan names them; accepting it puts them there.
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);
    writeFileSync(
      join(repo, "solution-dependencies.json"),
      JSON.stringify({
        schemaVersion: 1,
        solution: "csv-pipeline",
        repositoryId: "csv-app",
        consumes: [],
      }),
      "utf8",
    );
    // The projection is the manifest joined to live state, so the Explorer
    // half of this needs a manifest to join to.
    writeFileSync(
      join(repo, "solution.yaml"),
      "solution:\n  name: csv-pipeline\n  title: CSV\ncomponents:\n  - name: csv-app\n",
      "utf8",
    );

    const plan = await next(sessionsDir, REGISTER);
    expect(
      await answerFile(sessionsDir, plan.instruction?.seq ?? 0, {
        ...PLAN,
        repositories: [{ id: "csv-cli" }],
      }),
    ).toBe(0);

    // The call that reads the answer is the one that accepts the plan.
    await next(sessionsDir);

    // Beside this one, because that is where the assembly looks -- and
    // carrying membership and nothing else: no edge, no version.
    const shell = join(repo, "..", "csv-cli", "solution-dependencies.json");
    expect(JSON.parse(readFileSync(shell, "utf8"))).toMatchObject({
      solution: "csv-pipeline",
      repositoryId: "csv-cli",
      consumes: [],
    });
    // And it is in the graph the Explorer reads, which is the whole point:
    // nothing depends on it, and it is there because it says it is.
    const projection = JSON.parse(
      readFileSync(join(repo, ".dabbler", "solution", "projection.json"), "utf8"),
    ) as { members?: { id: string }[] };
    expect((projection.members ?? []).map((member) => member.id)).toContain("csv-cli");
  });

  it("carries the round cap and the transport on the run, for the call that reaches verification", async () => {
    const { repo, sessionsDir } = drivenRepo();
    configure([VERIFIED]);

    // The transport is named once, on the call that opens the run. The CAP
    // is not typeable on a driving call at all -- it moves through the one
    // amendment that states a reason and a name.
    const plan = await next(sessionsDir, { ...REGISTER, transport: "offline" });
    expect(
      planAmend(sessionsDir, {
        stepId: null,
        files: null,
        checksFile: null,
        maxRounds: 1,
        reason: "one round is what this tree is worth",
        approver: "the test",
      }),
    ).toBe(0);
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

  it("answers verify's refusal by running the affected tests again, and stops with verify's own words when that cannot help", async () => {
    const { repo, sessionsDir } = drivenRepo();
    // No smoke fallback: a path the selector cannot map is a refusal the
    // pre-verification phase can never satisfy, which is what proves the
    // heal is BOUNDED. The honest case -- evidence the tree moved under --
    // is answered by the same re-run, and would not stop at all.
    configure([VERIFIED], {}, {
      testing: { ...TESTING, selection: { ...TESTING.selection, smoke: [] } },
    });
    await throughTheStep(repo, sessionsDir);

    let result = await next(sessionsDir);
    writeFileSync(join(repo, "notes.txt"), "the selector maps this to nothing\n", "utf8");
    // Every call's channel, because the heal is announced by the call that
    // makes it and the stop is printed by a later one.
    let said = result.err;
    for (let call = 0; call < 400 && result.instruction?.kind === "wait"; call += 1) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      result = await next(sessionsDir);
      said += result.err;
    }

    const run = readRun(repo, 1);
    // Twice round, then the operator: a loop that healed forever would be
    // the deadlock this fix is about, wearing a different hat.
    expect(run?.preverify_heals).toBe(2);
    expect(run?.stop?.kind).toBe("verification");
    // The refusal's OWN reason, which is what the deadlock classifier
    // compares. The sentence it replaced was identical for every refusal
    // verify has, so two unlike causes read as one impasse.
    expect(run?.stop?.reason).toContain("notes.txt");
    expect(run?.stop?.reason).not.toContain("nothing here can answer it");
    expect(said).toContain("preverify-stale");
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