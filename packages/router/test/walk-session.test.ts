// One session, driven from `next` to `done`.
//
// One repository, one plan, one step -- reported wrongly once and then
// rightly -- the framework's own long work waited on, verification over the
// offline transport's scripted answers, the land, the run of record and the
// close. Every transition is a milestone asserted in order, because what
// this file is for is the ORDER: each of the pieces has its own test, and
// what none of them can show is that the loop goes through them once, in
// this sequence, leaving the record it leaves.
//
// No engine binary, no vendor call, no hand-written record: the step
// answers come from the verbs an engine would run, and the verifier answers
// from files the config names.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { CONFIG_ENV_VAR } from "../src/config.ts";
import { driveSession, sessionNext, type Engine } from "../src/drive.ts";
import { readInstruction, readReport, readRun, readWorkPlan, writeRun } from "../src/driver.ts";
import type { DriverInstruction } from "../src/generated/index.ts";
import { appendPackaging, readRounds } from "../src/ledger.ts";
import { capture } from "../src/output.ts";
import { readSessionState } from "../src/progress.ts";
import { resetForTests as resetRouter } from "../src/route.ts";
import { resetForTests as resetRuntimeMode } from "../src/runtimeMode.ts";
import { EXIT_OK, planAmend, report, start } from "../src/session.ts";
import { readRecords } from "../src/testEvidence.ts";
import { amendmentEntries, readTaskDeclaration } from "../src/writers.ts";
import { makeConfig, seed, setProviderKeys, tempDir } from "./support/answers.ts";
import { settleJobs, useInProcessJobs } from "./support/inProcessJobs.ts";
import { gitOut, makeRepo } from "./support/repo.ts";

const NODE = process.execPath;
const WIDGET_V3 = "def widget():\n    return 3\n";
const VERIFIED = "VERIFIED\n\nThe widget is real.\n";

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
    "const widget = readFileSync('src/widget.py', 'utf8');\n" +
    "process.exit(widget.includes('broken') ? 1 : 0);\n",
  ".gitignore": ".dabbler/\n",
};

const TESTING = {
  // Two expensive suites, because one is the shape that hid the run of
  // record's livelock for ninety sessions: with a second suite the walk's
  // first site always found the second suite's job and, until the phase
  // learned to read its own records, discarded it as stale and ran the
  // first suite again.
  suites: [
    {
      name: "unit",
      command: "node tests/run.mjs",
      expensive: true,
      covers: ["src/", "tests/"],
      test_roots: ["tests"],
      test_glob: "test_*.py",
    },
    {
      name: "integration",
      command: "node tests/run.mjs",
      expensive: true,
      covers: ["src/", "tests/"],
      test_roots: ["tests"],
      test_glob: "check_*.py",
    },
  ],
  selection: {
    repo_wide: ["dabbler.yaml"],
    smoke: ["tests/test_widget.py"],
    rules: [{ when: "src/widget.py", select: ["tests/test_widget.py"] }],
  },
};

const PLAN = {
  task: "Make widget() return 2.",
  hold_release: "the walk ships nothing",
  non_goals: ["Anything the step does not name."],
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

/** The verifier's scripted answers, and the transport that serves them. */
function configure(
  responses: readonly string[],
  testing: unknown = TESTING,
  extra: Record<string, unknown> = {},
): void {
  const dir = tempDir("responses-");
  const files: Record<string, string> = {};
  responses.forEach((text, index) => {
    files[`${String(index + 1).padStart(2, "0")}.md`] = text;
  });
  seed(dir, files);
  const configDir = tempDir("config-");
  seed(configDir, {
    "router-config.yaml": JSON.stringify(
      makeConfig({
        transports: { offline: { responses_dir: dir } },
        transport: { profile: "offline" },
        testing,
        ...extra,
      }),
    ),
  });
  process.env[CONFIG_ENV_VAR] = join(configDir, "router-config.yaml");
}

/** One `next`, and the instruction it printed on stdout. */
async function next(
  sessionsDir: string,
  options: { engine?: string; provider?: string } = {},
): Promise<{ code: number; instruction: DriverInstruction | null; err: string }> {
  const collected = await capture(() => sessionNext(sessionsDir, options));
  return {
    code: collected.value,
    err: collected.stderr,
    instruction:
      collected.stdout.trim() === ""
        ? null
        : (JSON.parse(collected.stdout) as DriverInstruction),
  };
}

/** The verb an engine runs to answer a plan instruction. */
async function answerPlan(sessionsDir: string, seq: number, body: unknown): Promise<number> {
  const path = join(tempDir("answer-"), "answer.json");
  writeFileSync(path, JSON.stringify(body), "utf8");
  return (await capture(() => Promise.resolve(report(sessionsDir, { seq, answerFile: path }))))
    .value;
}

/** The verb an engine runs to answer a step instruction. */
async function answerStep(
  sessionsDir: string,
  seq: number,
  stepId: string,
  files: readonly string[],
): Promise<{ code: number; err: string }> {
  const collected = await capture(() =>
    Promise.resolve(
      report(sessionsDir, {
        seq,
        stepId,
        status: "done",
        files,
        testsRun: null,
        notes: "walked",
      }),
    ),
  );
  return { code: collected.value, err: collected.stderr };
}

// The framework's own long work runs here rather than in a child per job:
// this file drives four whole sessions, and what it is about is the ORDER
// the phases go through, not the process each one is spawned into. The
// driver still starts a job, waits on it and collects an exit code from a
// status file -- `settleJobs` is called where the loop below would have
// slept, and runs the verb the driver asked for. `test/walk-jobs.test.ts`
// keeps the real spawn, because that one IS about the child.
let restoreJobs = useInProcessJobs();

after(() => {
  restoreJobs();
  delete process.env[CONFIG_ENV_VAR];
  resetRouter();
  resetRuntimeMode();
});

describe("one session, walked from next to done", () => {
  it("goes through every phase once, in order, and leaves the record each one owns", async () => {
    setProviderKeys();
    resetRouter();
    resetRuntimeMode();
    const repo = makeRepo(SEED, { origin: true });
    const sessionsDir = join(repo, "docs", "sessions");
    configure([VERIFIED]);

    const milestones: string[] = [];

    // --- `start` registers; the first `next` asks for a plan ------------------
    // Identity goes on `start` and nowhere else. `next` advances a session and
    // never creates one, so the flags an engine was launched with do not start
    // a second session when it re-runs its command line after `done`.
    assert.equal(
      (await capture(() =>
        Promise.resolve(start(sessionsDir, { engine: "claude-code", provider: "anthropic" })),
      )).value,
      EXIT_OK,
    );
    const plan = await next(sessionsDir);
    assert.equal(plan.code, EXIT_OK);
    assert.equal(plan.instruction?.kind, "step");
    assert.equal(plan.instruction?.step_id, "plan");
    // The session's own text reaches the engine, so the plan is of THIS work.
    assert.match(String(plan.instruction?.ask), /Make `widget\(\)` return 2\./);
    // And the one way a step is changed after acceptance, so an engine that
    // diagnoses a wrong check has the verb in front of it.
    assert.match(String(plan.instruction?.ask), /dabbler session plan amend --step <id>/);
    // Stdout is the instruction and nothing else -- a parser reads it -- and
    // everything the verbs said on the way is on stderr, where the person is.
    assert.match(plan.err, /dabbler \[/);
    assert.equal(readRun(repo, 1)?.phase, "plan");
    milestones.push("registered and asked to plan");

    assert.equal(await answerPlan(sessionsDir, plan.instruction?.seq ?? 0, PLAN), EXIT_OK);

    // --- the plan is accepted, declared, and becomes the step ----------------
    const step = await next(sessionsDir);
    assert.equal(step.instruction?.step_id, "widget");
    assert.equal(readRun(repo, 1)?.phase, "work");
    // Accepting a plan declares the session's task: the record says what this
    // session is for before any of it is done.
    assert.equal(readTaskDeclaration(sessionsDir, 1)?.["task"], PLAN.task);
    assert.equal(readTaskDeclaration(sessionsDir, 1)?.["holdReason"], PLAN.hold_release);
    milestones.push("planned and declared");

    // --- a report that names what the tree did not move is refused -----------
    const wrong = await answerStep(sessionsDir, step.instruction?.seq ?? 0, "widget", [
      "src/widget.py",
    ]);
    assert.equal(wrong.code, EXIT_OK, "the verb writes it; the driver judges it");
    const rejection = await next(sessionsDir);
    assert.equal(rejection.instruction?.kind, "rejection");
    assert.match(
      String(rejection.instruction?.reasons?.join(" ")),
      /files-changed-unchanged/,
    );
    milestones.push("refused a report the tree does not bear out");

    // --- work the step's own check refuses ----------------------------------
    // The step is done, honestly reported, and the check the plan declared
    // says no. That is the gate on the work rather than on the report.
    writeFileSync(join(repo, "src", "widget.py"), WIDGET_V3, "utf8");
    const checked = await answerStep(sessionsDir, rejection.instruction?.seq ?? 0, "widget", [
      "src/widget.py",
    ]);
    assert.equal(checked.code, EXIT_OK);
    const refusedCheck = await next(sessionsDir);
    assert.equal(refusedCheck.instruction?.kind, "rejection");
    assert.match(String(refusedCheck.instruction?.reasons?.join(" ")), /check-failed/);
    milestones.push("refused the work its own check rejects");

    // --- a call with nothing new to judge reprints, and costs nothing -------
    // The report on disk answered the instruction before this one and was
    // judged then. Asking again is asking what is outstanding: the same
    // instruction, the same seq, and no refusal spent -- a third one here
    // would have stopped the session for a report nobody wrote.
    const again = await next(sessionsDir);
    assert.equal(again.instruction?.kind, "rejection");
    assert.equal(again.instruction?.seq, refusedCheck.instruction?.seq);
    assert.equal(readRun(repo, 1)?.rejections, 2);

    // --- the step is amended, and the NEXT judgement uses the amendment -----
    // The check was wrong, not the work. A step is re-read from the plan
    // before it is judged again, so an amendment moves what the next
    // judgement measures against -- without it the step would be judged
    // forever against the definition it was refused under, and the same
    // report would be refused again for the same reason.
    const checksFile = join(tempDir("amend-"), "checks.json");
    writeFileSync(
      checksFile,
      JSON.stringify([
        {
          argv: [
            NODE,
            "-e",
            "process.exit(require('fs').readFileSync('src/widget.py','utf8').includes('return 3') ? 0 : 1)",
          ],
        },
      ]),
      "utf8",
    );
    const amended = await capture(() =>
      Promise.resolve(
        planAmend(sessionsDir, {
          stepId: "widget",
          files: null,
          checksFile,
          maxRounds: null,
          reason: "the check named the value the plan guessed, not the one the work needs",
        }),
      ),
    );
    assert.equal(amended.value, EXIT_OK, amended.stderr);
    assert.deepEqual(readWorkPlan(repo, 1)?.steps[0]?.checks[0]?.argv.slice(-1), [
      "process.exit(require('fs').readFileSync('src/widget.py','utf8').includes('return 3') ? 0 : 1)",
    ]);
    // The amendment reaches the pushed history: the activity log carries
    // it with its reason, beside the declaration, and the driver's own
    // journal under `.dabbler/runs/` is not the only place it exists.
    const folded = amendmentEntries(sessionsDir, 1);
    assert.equal(folded.length, 1);
    assert.match(String(folded[0]?.["what"]), /step 'widget': its checks/);
    assert.match(String(folded[0]?.["reason"]), /the value the plan guessed/);
    milestones.push("amended the step it was refused under");

    // --- the same report, now accepted, because the definition moved --------
    const right = await answerStep(
      sessionsDir,
      refusedCheck.instruction?.seq ?? 0,
      "widget",
      ["src/widget.py"],
    );
    assert.equal(right.code, EXIT_OK);
    assert.equal(readReport(repo, 1)?.step_id, "widget");
    milestones.push("reported the step it did");

    // --- from here the framework works, and a call is a poll ----------------
    // Never two at once: the walk answers a wait by letting the job the
    // driver started run to completion (`settleJobs`) and then asking again,
    // and gives up loudly on a deadline. Sixty calls with no pause between
    // them outran the framework's own jobs on a loaded machine and failed a
    // walk whose every phase was fine; settling is that pause, made exact.
    let instruction: DriverInstruction | null = null;
    let last = { code: EXIT_OK, err: "" };
    const deadline = Date.now() + 180_000;
    for (;;) {
      const move = await next(sessionsDir);
      instruction = move.instruction;
      last = { code: move.code, err: move.err };
      if (instruction === null) break;
      if (instruction.kind === "done") break;
      if (instruction.kind === "wait") {
        // A wait owes nothing but another call: no answer, no sleep held.
        assert.ok(Number(instruction.retry_after_seconds) > 0);
        if (!milestones.includes("waited on the framework's own job")) {
          milestones.push("waited on the framework's own job");
        }
        if (Date.now() > deadline) assert.fail("the framework's own jobs never finished");
        await settleJobs();
        continue;
      }
      assert.fail(
        `the framework asked for ${instruction.kind} ${String(instruction.step_id)} after the step was done`,
      );
    }
    // A `next` that printed no instruction exited with its reason on stderr,
    // and the framework's own jobs say why they stopped in their logs; a
    // failure here that hid both was undiagnosable once (session 104's run
    // of record, on a twenty-worker machine), so both are the message.
    const jobsDir = join(repo, ".dabbler", "runs", "s1", "driver", "jobs");
    const jobLogs = existsSync(jobsDir)
      ? readdirSync(jobsDir)
          .filter((name) => name.endsWith(".log"))
          .map((name) => `--- ${name}\n${readFileSync(join(jobsDir, name), "utf8").split("\n").slice(-12).join("\n")}`)
          .join("\n")
      : "";
    assert.equal(
      instruction?.kind,
      "done",
      `next printed no instruction (exit ${last.code}); stderr:\n${last.err}\n${jobLogs}`,
    );
    milestones.push("done");
    // The close said what this session stepped over: the one amendment,
    // with its reason, so a person reading the close does not have to know
    // the driver's journal exists. The close is a job, so its words are in
    // its log.
    const closeLog = readFileSync(join(repo, ".dabbler", "runs", "s1", "driver", "jobs", "close.log"), "utf8");
    assert.match(closeLog, /close: amended step 'widget': its checks: the check named the value the plan guessed/);

    // --- and what each phase left behind ------------------------------------
    // Verification: one round, recorded by the verifier and nobody else.
    const rounds = readRounds(repo, 1);
    assert.equal(rounds.length, 1);
    assert.equal(rounds[0]?.["verdict"], "VERIFIED");

    // The run of record: every complete suite, over the verified tree --
    // and the second one collected by the site that owns it, never read as
    // a stale leftover by the first. The phase knows which suites it has
    // run from the record, not from which job happens to be standing.
    const records = readRecords(repo);
    for (const suite of ["unit", "integration"]) {
      assert.ok(
        records.some(
          (row) => row.suite === suite && row.stage === "final-full" && row.outcome === "passed",
        ),
        `no green final-full record for ${suite}`,
      );
    }
    const supervisionPath = join(repo, ".dabbler", "runs", "s1", "driver", "supervision.jsonl");
    const supervised = existsSync(supervisionPath)
      ? readFileSync(supervisionPath, "utf8")
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((line) => JSON.parse(line) as Record<string, unknown>)
      : [];
    assert.deepEqual(supervised.filter((row) => row["event"] === "stale-job-collected"), []);

    // The land: the work is committed, the tree is clean, and the branch is
    // ahead of nothing -- it was pushed.
    assert.match(readFileSync(join(repo, "src", "widget.py"), "utf8"), /return 3/);
    assert.equal(gitOut(repo, "status", "--porcelain").trim(), "");
    assert.equal(gitOut(repo, "rev-list", "--count", "@{upstream}..HEAD").trim(), "0");

    // The close: the session is complete, and its verdict is on the record.
    const state = readSessionState(sessionsDir);
    const session = ((state?.["sessions"] ?? []) as Array<Record<string, unknown>>).find(
      (row) => row["number"] === 1,
    );
    assert.equal(session?.["status"], "complete");
    assert.equal(session?.["verificationVerdict"], "VERIFIED");

    // Nothing is outstanding: the conversation is closed, and the last
    // instruction names no answer because there is none to give.
    assert.equal(readInstruction(repo, 1)?.kind, "done");
    assert.equal(readInstruction(repo, 1)?.answer_command, undefined);
    assert.ok(existsSync(join(repo, ".dabbler", "runs", "s1", "driver", "run.json")));

    // --- a run left standing at the close of a session already closed -------
    // The state `dabbler session close` run directly leaves behind: the
    // ledger says complete and the run still says close. The next call
    // collects the close instead of running a close that would refuse.
    const closed = readRun(repo, 1);
    writeRun(repo, 1, { ...closed, phase: "close", job: null });
    const collected = await next(sessionsDir);
    assert.equal(collected.instruction?.kind, "done", collected.err);
    assert.equal(readRun(repo, 1)?.phase, "complete");
    assert.equal(
      readFileSync(join(repo, ".dabbler", "runs", "s1", "driver", "jobs", "close.log"), "utf8"),
      closeLog,
      "no second close ran",
    );
    milestones.push("collected a close already made");

    assert.deepEqual(milestones, [
      "registered and asked to plan",
      "planned and declared",
      "refused a report the tree does not bear out",
      "refused the work its own check rejects",
      "amended the step it was refused under",
      "reported the step it did",
      "waited on the framework's own job",
      "done",
      "collected a close already made",
    ]);
  });
});

describe("a run left standing at the publish of a session already published", () => {
  it("moves to the close without publishing a second time", async () => {
    setProviderKeys();
    resetRouter();
    resetRuntimeMode();
    const repo = makeRepo(SEED, { origin: true });
    const sessionsDir = join(repo, "docs", "sessions");
    // A tag release is packaging, so the plan below is declared releasable.
    configure([VERIFIED], TESTING, { packaging: { release: "tag" } });
    assert.equal(
      (await capture(() =>
        Promise.resolve(start(sessionsDir, { engine: "claude-code", provider: "anthropic" })),
      )).value,
      EXIT_OK,
    );
    const plan = await next(sessionsDir);
    const releasable = Object.fromEntries(Object.entries(PLAN).filter(([key]) => key !== "hold_release"));
    assert.equal(await answerPlan(sessionsDir, plan.instruction?.seq ?? 0, releasable), EXIT_OK);
    assert.equal((await next(sessionsDir)).instruction?.step_id, "widget");

    // The state `dabbler packaging` run directly leaves behind: the record
    // says published and the run still says publish.
    appendPackaging(repo, 1, {
      outcome: "published",
      session_number: 1,
      releasable: true,
      recorded_at: "2026-09-14T12:00:00-04:00",
      feed: "../feed",
      secret_name: "",
      artifacts: ["widget-1.0.0.tgz"],
      steps: [{ step: "pack", command: "pack", exit_code: 0, duration_seconds: 1 }],
    });
    writeRun(repo, 1, { ...readRun(repo, 1), phase: "publish", job: null });

    const move = await next(sessionsDir);
    assert.equal(readRun(repo, 1)?.phase, "close", move.err);
    assert.equal(
      existsSync(join(repo, ".dabbler", "runs", "s1", "driver", "jobs", "publish.status.json")),
      false,
      "no second publish ran",
    );
    // The close it moved to started a job; the walkthroughs share one job
    // runner, so it is settled here rather than left for the next file's walk.
    await settleJobs();
  });
});

describe("a pulled session whose framework jobs end inside the call", () => {
  it("answers with what comes after them, never a wait", async () => {
    setProviderKeys();
    resetRouter();
    resetRuntimeMode();
    const repo = makeRepo(SEED, { origin: true });
    const sessionsDir = join(repo, "docs", "sessions");
    configure([VERIFIED]);
    assert.equal(
      (await capture(() =>
        Promise.resolve(start(sessionsDir, { engine: "claude-code", provider: "anthropic" })),
      )).value,
      EXIT_OK,
    );
    const plan = await next(sessionsDir);
    assert.equal(await answerPlan(sessionsDir, plan.instruction?.seq ?? 0, PLAN), EXIT_OK);
    const step = await next(sessionsDir);
    writeFileSync(join(repo, "src", "widget.py"), "def widget():\n    return 2\n", "utf8");
    assert.equal((await answerStep(sessionsDir, step.instruction?.seq ?? 0, "widget", ["src/widget.py"])).code, EXIT_OK);

    // Real children, as an engine's own call meets them: verification, both
    // suites and the close each end inside the bound, so one call carries
    // the session from the accepted step to `done`.
    restoreJobs();
    try {
      const collected = await capture(() => sessionNext(sessionsDir, { waitInCallMs: 120_000 }));
      const instruction = JSON.parse(collected.stdout) as DriverInstruction;
      assert.equal(instruction.kind, "done", collected.stderr);
    } finally {
      restoreJobs = useInProcessJobs();
    }
  });
});

describe("a red run of record, fixed, verified again, then run again", () => {
  it("judges the fix before the suite runs again, and in that order: checks, a second round, the suite", async () => {
    setProviderKeys();
    resetRouter();
    resetRuntimeMode();
    const repo = makeRepo(SEED, { origin: true });
    const sessionsDir = join(repo, "docs", "sessions");
    configure([VERIFIED, VERIFIED]);
    await capture(() =>
      Promise.resolve(start(sessionsDir, { engine: "claude-code", provider: "anthropic" })),
    );
    const plan = await next(sessionsDir);
    assert.equal(await answerPlan(sessionsDir, plan.instruction?.seq ?? 0, PLAN), EXIT_OK);
    const step = await next(sessionsDir);
    assert.equal(step.instruction?.step_id, "widget");

    // The step is done and its own check passes -- the widget returns 2 --
    // and the suite is red, which only the run of record can see.
    writeFileSync(join(repo, "src", "widget.py"), "def widget():\n    return 2  # broken\n", "utf8");
    assert.equal(
      (await answerStep(sessionsDir, step.instruction?.seq ?? 0, "widget", ["src/widget.py"])).code,
      EXIT_OK,
    );

    // What the record says happened, in the order it happened. Read after
    // every call rather than from timestamps, because the order IS the
    // assertion: a fix judged after the suite re-ran would still leave the
    // same records, in a different order.
    const milestones: string[] = [];
    const observe = (): void => {
      const rounds = readRounds(repo, 1).length;
      const unit = readRecords(repo).filter((row) => row.suite === "unit" && row.stage === "final-full");
      const mark = (milestone: string): void => {
        if (!milestones.includes(milestone)) milestones.push(milestone);
      };
      if (rounds >= 1) mark("round 1 recorded");
      if (unit.some((row) => row.outcome !== "passed")) mark("run of record red");
      if (rounds >= 2) mark("round 2 recorded");
      if (unit.some((row) => row.outcome === "passed")) mark("run of record green");
    };
    const walk = async (
      until: (instruction: DriverInstruction) => boolean,
    ): Promise<DriverInstruction | null> => {
      const deadline = Date.now() + 180_000;
      for (;;) {
        const move = await next(sessionsDir);
        observe();
        const instruction = move.instruction;
        if (instruction === null) {
          // The reason is on stderr and in the jobs' own logs; both are the message.
          const jobsDir = join(repo, ".dabbler", "runs", "s1", "driver", "jobs");
          const logs = existsSync(jobsDir)
            ? readdirSync(jobsDir)
                .filter((name) => name.endsWith(".log"))
                .map((name) => `--- ${name}\n${readFileSync(join(jobsDir, name), "utf8").split("\n").slice(-12).join("\n")}`)
                .join("\n")
            : "";
          assert.fail(`next printed no instruction (exit ${move.code}); stderr:\n${move.err}\n${logs}`);
        }
        if (until(instruction)) return instruction;
        if (instruction.kind !== "wait") {
          assert.fail(`the framework asked for ${instruction.kind} ${String(instruction.step_id)}`);
        }
        if (Date.now() > deadline) assert.fail("the framework's own jobs never finished");
        await settleJobs();
      }
    };

    // --- verification passes, the run of record fails, the fix is asked ------
    const fix = await walk((instruction) => instruction.kind === "step");
    assert.equal(fix?.step_id, "fix-run-of-record");
    milestones.push("fix asked");
    const waiting = readRun(repo, 1);
    assert.equal(waiting?.phase, "run-of-record");
    assert.equal(waiting?.pending_step?.id, "fix-run-of-record");
    assert.equal(waiting?.pending_step?.then, "preverify");

    // --- the fix, reported; the resuming call judges it first ----------------
    writeFileSync(join(repo, "src", "widget.py"), "def widget():\n    return 2\n", "utf8");
    assert.equal(
      (await answerStep(sessionsDir, fix?.seq ?? 0, "fix-run-of-record", ["src/widget.py"])).code,
      EXIT_OK,
    );
    const judged = await next(sessionsDir);
    observe();
    // Accepted: the step is off the run, the phase is the one it named --
    // and the same call has gone on through it to start the second round,
    // not the suite.
    const accepted = readRun(repo, 1);
    assert.equal(accepted?.pending_step, null);
    assert.equal(accepted?.phase, "verify");
    assert.equal(judged.instruction?.kind, "wait");
    assert.equal(accepted?.job?.name, "verification");

    // --- round two, the suite green, the close -------------------------------
    const done = await walk((instruction) => instruction.kind === "done");
    assert.equal(done?.kind, "done");
    milestones.push("done");
    assert.deepEqual(milestones, [
      "round 1 recorded",
      "run of record red",
      "fix asked",
      "round 2 recorded",
      "run of record green",
      "done",
    ]);
    assert.equal(readRounds(repo, 1).length, 2);
    for (const suite of ["unit", "integration"]) {
      assert.ok(
        readRecords(repo).some(
          (row) => row.suite === suite && row.stage === "final-full" && row.outcome === "passed",
        ),
        `no green final-full record for ${suite}`,
      );
    }
    assert.doesNotMatch(readFileSync(join(repo, "src", "widget.py"), "utf8"), /broken/);
    assert.equal(gitOut(repo, "status", "--porcelain").trim(), "");
    const state = readSessionState(sessionsDir);
    const session = ((state?.["sessions"] ?? []) as Array<Record<string, unknown>>).find(
      (row) => row["number"] === 1,
    );
    assert.equal(session?.["status"], "complete");
    assert.equal(session?.["verificationVerdict"], "VERIFIED");
  });
});

describe("a session paused, then moving again", () => {
  it("says progress resumed once, and only once the phase has moved past the pause", async () => {
    setProviderKeys();
    resetRouter();
    resetRuntimeMode();
    const repo = makeRepo(SEED, { origin: true });
    const sessionsDir = join(repo, "docs", "sessions");
    configure([VERIFIED]);
    await capture(() =>
      Promise.resolve(start(sessionsDir, { engine: "claude-code", provider: "anthropic" })),
    );

    // --- three calls with no plan written stop the loop ----------------------
    // Under the pull an outstanding instruction is judged on the next call,
    // and a plan instruction nobody answered is judged as no plan: each call
    // is one refusal, and the third stops the session.
    let asked = await next(sessionsDir);
    assert.equal(asked.instruction?.step_id, "plan");
    for (let refusal = 0; refusal < 3; refusal += 1) {
      asked = await next(sessionsDir);
    }
    assert.equal(asked.instruction, null, "a stop prints no instruction");
    const paused = readRun(repo, 1)?.stop;
    assert.equal(paused?.kind, "rejected-thrice");
    // The record keeps its vocabulary; the person is told it is paused, that
    // this command has ended, that the session has not, and who acts next.
    assert.match(asked.err, /Session 001 paused \(rejected-thrice\) in phase 'plan'/);
    assert.match(asked.err, /has ended; session 001 remains in flight/);
    assert.match(asked.err, /Next: /);
    assert.doesNotMatch(asked.err, /STOPPED|progress-resumed/);

    // --- the next call resumes it, and says nothing green yet -----------------
    // The stop is cleared by the resume itself, which is not progress: the
    // plan is merely asked again.
    const again = await next(sessionsDir);
    assert.equal(again.instruction?.step_id, "plan");
    assert.equal(readRun(repo, 1)?.stop, null);
    assert.match(again.err, /run-resumed .*after=rejected-thrice/);
    assert.doesNotMatch(again.err, /progress-resumed/);

    // --- a plan accepted moves the phase, and THAT is progress resumed --------
    assert.equal(await answerPlan(sessionsDir, again.instruction?.seq ?? 0, PLAN), EXIT_OK);
    const moved = await next(sessionsDir);
    assert.equal(readRun(repo, 1)?.phase, "work");
    const said = moved.err.match(/progress-resumed[^\n]*/g) ?? [];
    assert.equal(said.length, 1, moved.err);
    assert.match(said[0] ?? "", /past=rejected-thrice/);
    assert.match(said[0] ?? "", /from=plan/);
    const supervision = readFileSync(
      join(repo, ".dabbler", "runs", "s1", "driver", "supervision.jsonl"),
      "utf8",
    )
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    assert.equal(supervision.filter((row) => row["event"] === "progress-resumed").length, 1);
  });
});

describe("a second driver taking the lease mid-run", () => {
  it("stops the stale one before it advances the run, and says which epoch lost", async () => {
    // Two drivers wrote one run on 2026-09-02 and phases were skipped
    // silently. The fence is inside `save()`, so proving it means DRIVING a
    // session whose lease moves under it: the scripted engine stands in for
    // the second driver, taking the lease through the sanctioned writer
    // while the first is mid-invocation. Nothing here hand-edits the record.
    setProviderKeys();
    resetRouter();
    resetRuntimeMode();
    const repo = makeRepo(SEED, { origin: true });
    const sessionsDir = join(repo, "docs", "sessions");
    configure([VERIFIED]);

    let stolenFrom: number | null = null;
    // The run exactly as the holder left it. Everything the losing driver
    // could advance -- the phase, the seq, the invocation count, the
    // accepted steps, the baseline -- is in here, so comparing the whole
    // record is the strongest form of "it wrote nothing".
    let held: Record<string, unknown> | null = null;
    const thief: Engine = {
      name: "lease-thief",
      invoke: (invocation) => {
        // The engine is called inside the driver's own lifetime, which is
        // the only place a save can go stale.
        const run = readRun(repo, 1);
        if (stolenFrom === null && run !== null) {
          stolenFrom = run.lease_epoch ?? 1;
          held = writeRun(repo, 1, {
            ...run,
            lease_epoch: stolenFrom + 5,
          }) as unknown as Record<string, unknown>;
        }
        invocation.emit("scripted: the lease moved");
        return Promise.resolve({ exitCode: 0 });
      },
    };

    const driven = await capture(() =>
      driveSession(sessionsDir, {
        engine: "claude-code",
        provider: "anthropic",
        adapter: thief,
        maxInvocations: 2,
      }),
    ).then(
      () => null,
      (error: unknown) => error,
    );

    assert.notEqual(stolenFrom, null, "the engine never got to take the lease");
    const taken = stolenFrom as unknown as number;
    // The stale driver does not carry on: it ends where the fence is, with
    // both epochs in the words.
    assert.match(
      String(driven),
      new RegExp(
        `another driver holds the lease \\(epoch ${taken + 5}; this process took ${taken}\\)`,
      ),
    );
    assert.equal((driven as { kind?: string }).kind, "interrupted");

    // And it advanced NOTHING. Not the epoch alone: the record on disk is
    // the one the holder wrote, field for field. A save that preserved the
    // winner's epoch while flushing the loser's phase, seq, invocation
    // count or accepted steps is the same incident wearing a different
    // field, and this is what refuses it.
    assert.deepEqual(readRun(repo, 1), held);
    const record = readRun(repo, 1) as unknown as Record<string, unknown>;
    const holder = held as unknown as Record<string, unknown>;
    for (const field of [
      "phase",
      "seq",
      "invocations",
      "accepted_steps",
      "baseline_tree",
      "lease_epoch",
      "updated_at",
      "stop",
    ]) {
      assert.deepEqual(record[field], holder[field], field);
    }

    // And the refusal is a supervision event before it is a stop, so the
    // record says which epoch lost.
    const supervision = readFileSync(
      join(repo, ".dabbler", "runs", "s1", "driver", "supervision.jsonl"),
      "utf8",
    )
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line) => JSON.parse(line) as Record<string, unknown>);
    const refused = supervision.find((row) => row["event"] === "stale-save-refused");
    assert.ok(refused, "no stale-save-refused row was written");
    assert.equal(refused?.["my_epoch"], stolenFrom);
    assert.equal(refused?.["disk_epoch"], (stolenFrom as unknown as number) + 5);
  });
});

describe("what actually answered, on the run's own record", () => {
  it("records the model the engine named, and records an alias as a resolution", async () => {
    // The question is whether the model an operator picked is the model that
    // ran, and it is answered from what the ENGINE said about itself. The
    // alias case is the trap: `--model haiku` comes back
    // `claude-haiku-4-5-20251001`, and a string comparison calls the most
    // routine thing a CLI does a substitution.
    setProviderKeys();
    resetRouter();
    resetRuntimeMode();
    const repo = makeRepo(SEED, { origin: true });
    const sessionsDir = join(repo, "docs", "sessions");
    configure([VERIFIED]);

    const answered: Engine = {
      name: "claude-code",
      invoke: (invocation) => {
        invocation.emit("scripted: answered");
        return Promise.resolve({
          exitCode: 0,
          servedModel: {
            id: "claude-haiku-4-5-20251001",
            canonical: "claude-haiku-4-5",
            named: ["claude-haiku-4-5-20251001"],
          },
        });
      },
    };

    await capture(() =>
      driveSession(sessionsDir, {
        engine: "claude-code",
        provider: "anthropic",
        model: "haiku",
        adapter: answered,
        maxInvocations: 1,
      }),
    );

    const evidence = (readRun(repo, 1) as unknown as {
      model_evidence?: Array<Record<string, unknown>>;
    } | null)?.model_evidence;
    assert.ok(evidence && evidence.length > 0, "no model evidence was recorded");
    const first = evidence[0] as Record<string, unknown>;
    assert.equal(first["invocation"], 1);
    assert.equal(first["requested"], "haiku");
    assert.equal(first["served"], "claude-haiku-4-5-20251001");
    assert.equal(first["canonical"], "claude-haiku-4-5");
    // Not a substitution: the CLI resolved its own name. Not honoured
    // either: an alias names no specific model to have been honoured.
    assert.equal(first["fidelity"], "not-known");
  });

  it("records an engine that said nothing as having said nothing, never as agreement", async () => {
    // The Copilot seat is the live case: it reports no conversation id, so
    // its own events file cannot be tied to the invocation this process just
    // made -- and the newest file on disk is the wrong one whenever two
    // sessions run. Its shape therefore states nothing, which is what is
    // driven here. (The seat itself is not driven: a seat identity resolves
    // through this machine's catalog, and seeding one would be arranging a
    // seat to prove a rule that is not about seats.)
    setProviderKeys();
    resetRouter();
    resetRuntimeMode();
    const repo = makeRepo(SEED, { origin: true });
    const sessionsDir = join(repo, "docs", "sessions");
    configure([VERIFIED]);

    const silent: Engine = {
      name: "claude-code",
      invoke: () => Promise.resolve({ exitCode: 0 }),
    };

    const run = await capture(() =>
      driveSession(sessionsDir, {
        engine: "claude-code",
        provider: "anthropic",
        model: "claude-opus-5",
        adapter: silent,
        maxInvocations: 1,
      }),
    );

    const evidence = (readRun(repo, 1) as unknown as {
      model_evidence?: Array<Record<string, unknown>>;
    } | null)?.model_evidence;
    assert.ok(evidence && evidence.length > 0, `no model evidence: ${run.stderr}${run.stdout}`);
    const first = evidence[0] as Record<string, unknown>;
    assert.equal(first["requested"], "claude-opus-5");
    assert.equal(first["served"], null);
    assert.equal(first["fidelity"], "not-known");
    assert.match(String(first["note"]), /states no model/);
    // And nothing claims it was an echo that agreed: `evidence` is absent
    // rather than "served", because there was no statement to grade.
    assert.equal(first["evidence"], undefined);
  });
});

describe("an engine that refuses the model it was given", () => {
  it("stops the run on the refusal, whatever the exit code said", async () => {
    // `claude` prints `[claude-code:unrecognized_model]` on stderr, answers
    // with an ordinary message explaining the problem, and EXITS 0 -- its
    // own `result` event even carries `subtype: "success"` beside
    // `is_error: true`. So every status a driver could read says the run
    // went fine, and a driver that read one would carry on into a session
    // authored by whatever the CLI fell back to: a model the operator did
    // not choose, on a ledger naming the one they did.
    //
    // The adapter here is the measured outcome and nothing more -- exit 0,
    // a refusal reported. What is under test is what the LOOP does with it.
    setProviderKeys();
    resetRouter();
    resetRuntimeMode();
    const repo = makeRepo(SEED, { origin: true });
    const sessionsDir = join(repo, "docs", "sessions");
    configure([VERIFIED]);

    let invoked = 0;
    const refuses: Engine = {
      // Named as the engine, because `builtInEngine` names an adapter after
      // the engine it is: the stop says what refused, in the words a person
      // would read in production.
      name: "claude-code",
      invoke: (invocation) => {
        invoked += 1;
        invocation.emit("stderr: [claude-code:unrecognized_model] {\"model\":\"claude-not-a-model\"}");
        return Promise.resolve({ exitCode: 0, refusedModel: "claude-not-a-model" });
      },
    };

    const driven = await capture(() =>
      driveSession(sessionsDir, {
        engine: "claude-code",
        provider: "anthropic",
        adapter: refuses,
        maxInvocations: 3,
      }),
    );

    // Once, and then stopped. A loop that read exit 0 as an answer would
    // have spent the whole invocation budget on a CLI doing no work.
    assert.equal(invoked, 1);
    assert.notEqual(driven.value, 0);
    const stop = (readRun(repo, 1) as unknown as {
      stop?: { kind?: string; reason?: string };
    } | null)?.stop;
    assert.ok(stop, "the run recorded no stop");
    assert.equal(stop?.kind, "engine");
    // The three things a stop has to say to be actionable: what refused,
    // which model, and the command that changes it.
    assert.match(String(stop?.reason), /claude-code refused the model/);
    assert.match(String(stop?.reason), /claude-not-a-model/);
    assert.match(String(stop?.reason), /dabbler configure --authoring-model/);
    // And why an exit code was not enough, so the next reader does not go
    // looking for a failure the status never reported.
    assert.match(String(stop?.reason), /its own bundled catalog/);
  });
});

describe("a session with no suite declared", () => {
  it("says so on the run of record, rather than leaving a gate's dash to be read as green", async () => {
    // The sample's first session closed VERIFIED with `test_run_fresh (N/A)`
    // and nothing in the record saying the suite was absent rather than
    // green. The phase says why it ran nothing, in its own log.
    setProviderKeys();
    resetRouter();
    resetRuntimeMode();
    const repo = makeRepo(SEED, { origin: true });
    const sessionsDir = join(repo, "docs", "sessions");
    configure([VERIFIED], { suites: [] });
    assert.equal(
      (await capture(() =>
        Promise.resolve(start(sessionsDir, { engine: "claude-code", provider: "anthropic" })),
      )).value,
      EXIT_OK,
    );
    const plan = await next(sessionsDir);
    assert.equal(await answerPlan(sessionsDir, plan.instruction?.seq ?? 0, PLAN), EXIT_OK);
    const step = await next(sessionsDir);
    assert.equal(step.instruction?.step_id, "widget");
    writeFileSync(join(repo, "src", "widget.py"), "def widget():\n    return 2\n", "utf8");
    assert.equal(
      (await answerStep(sessionsDir, step.instruction?.seq ?? 0, "widget", ["src/widget.py"])).code,
      EXIT_OK,
    );
    const said: string[] = [];
    const deadline = Date.now() + 180_000;
    for (;;) {
      const move = await next(sessionsDir);
      said.push(move.err);
      if (move.instruction === null || move.instruction.kind === "done") break;
      assert.equal(move.instruction.kind, "wait", said.join("\n"));
      if (Date.now() > deadline) assert.fail("the framework's own jobs never finished");
      await settleJobs();
    }
    assert.match(said.join("\n"), /run-of-record-none reason=no suite declared; nothing to run/);
  });
});
