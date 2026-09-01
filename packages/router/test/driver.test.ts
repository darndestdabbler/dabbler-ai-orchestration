// The driver's contract: four answer shapes the framework acts on, the
// ledger that holds them, and the one verb an engine has to write into it.
//
// What is asserted is the refusals -- the schemas are the meaning, and a
// schema is proven by what it will not admit. One refusal per schema, the
// verb's own boundary, and the reader's refusal of a report somebody typed.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { sessionVerb } from "../src/cli/session.ts";
import type { DriverInstruction, DriverRun } from "../src/generated/index.ts";
import {
  WATCHER_JOB_OUTSTANDING,
  WATCHER_OUTSTANDING,
  WATCHER_QUIET,
  type WatcherInputs,
  readAmendments,
  readDispositions,
  readReport,
  readRepairs,
  readRun,
  readWatcher,
  readWorkPlan,
  reportPath,
  validateDispositions,
  validateInstruction,
  validateReport,
  treeTouchedAt,
  validateWorkPlan,
  watcherReading,
  writeDispositions,
  writeInstruction,
  writeRun,
  writeWorkPlan,
} from "../src/driver.ts";
import { LedgerError, appendRound } from "../src/ledger.ts";
import { snapshotWorktreeTree } from "../src/journal.ts";
import { openDecisions } from "../src/owedDecisions.ts";
import { registerSessionStart } from "../src/writers.ts";
import { captured, makeProject, makeSandboxRepo, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

const STEP_INSTRUCTION = {
  schema_version: 1,
  seq: 1,
  kind: "step",
  session_number: 1,
  issued_at: "2026-08-31T10:00:00-04:00",
  step_id: "widget",
  ask: "Make the widget real.",
  answer_schema: "driver-report.schema.json",
  answer_command: "dabbler session report --seq 1 --step widget ...",
};

const REPORT = {
  schema_version: 1,
  seq: 1,
  session_number: 1,
  step_id: "widget",
  status: "done",
  files_changed: ["src/widget.py"],
  tests_run: null,
  notes: "made it real",
  reported_at: "2026-08-31T10:05:00-04:00",
};

const PLAN = {
  schema_version: 1,
  session_number: 1,
  task: "Make the widget real.",
  releasable: false,
  steps: [
    { id: "widget", ask: "Make it.", files: ["src/widget.py"], checks: [{ argv: ["python", "-m", "pytest"] }] },
  ],
  recorded_at: "2026-08-31T10:00:00-04:00",
};

/** A run that has accepted nothing, so a step is still amendable. */
const RUN = {
  schema_version: 1,
  session_number: 1,
  engine: "claude-code",
  phase: "steps",
  seq: 1,
  invocations: 0,
  max_invocations: 24,
  accepted_steps: [] as string[],
  baseline_tree: null,
  stop: null,
  started_at: "2026-08-31T10:00:00-04:00",
  updated_at: "2026-08-31T10:00:00-04:00",
};

const DISPOSITIONS = {
  schema_version: 1,
  session_number: 1,
  seq: 3,
  round: 1,
  dispositions: [{ finding_index: 0, action: "fix" }],
  recorded_at: "2026-08-31T10:30:00-04:00",
};

describe("the four answer schemas", () => {
  it("an instruction is one of four kinds, and each kind carries what it requires", () => {
    expect(validateInstruction(STEP_INSTRUCTION).kind).toBe("step");
    // A rejection with nothing to say is not a rejection.
    expect(() =>
      validateInstruction({ ...STEP_INSTRUCTION, kind: "rejection", ask: undefined }),
    ).toThrow(/driver instruction failed schema validation at \(root\)/);
    // There is no kind that asks the engine for a verdict.
    expect(() => validateInstruction({ ...STEP_INSTRUCTION, kind: "verdict" })).toThrow(
      LedgerError,
    );
    // A closed conversation names no answer, so nothing can answer it.
    expect(() =>
      validateInstruction({ ...STEP_INSTRUCTION, kind: "done", step_id: undefined, ask: undefined }),
    ).toThrow(LedgerError);
    const done = {
      ...STEP_INSTRUCTION,
      kind: "done",
      step_id: undefined,
      ask: undefined,
      answer_schema: undefined,
      answer_command: undefined,
    };
    expect(validateInstruction(done).kind).toBe("done");
  });

  it("a report has no word for a verdict and no path outside the repository", () => {
    expect(validateReport(REPORT).status).toBe("done");
    expect(() => validateReport({ ...REPORT, status: "verified" })).toThrow(
      /driver report failed schema validation at status/,
    );
    for (const path of [
      "src\\widget.py",
      "../elsewhere.py",
      "C:/abs/widget.py",
      "./src/widget.py",
      "src/./widget.py",
      "src/..",
      ".",
      // A newline before the `..` segment: `.` does not span it, `[\s\S]` does.
      "src\n/../widget.py",
    ]) {
      expect(() => validateReport({ ...REPORT, files_changed: [path] })).toThrow(
        /at files_changed\/0/,
      );
    }
  });

  it("a work plan's checks are argv, at least one per step, and its step ids are unique", () => {
    expect(validateWorkPlan(PLAN).steps).toHaveLength(1);
    // A step with no check is a step closed on the engine's word.
    const unchecked = { ...PLAN, steps: [{ ...PLAN.steps[0], checks: [] }] };
    expect(() => validateWorkPlan(unchecked)).toThrow(/at steps\/0\/checks/);
    const shellString = {
      ...PLAN,
      steps: [{ ...PLAN.steps[0], checks: [{ command: "python -m pytest" }] }],
    };
    expect(() => validateWorkPlan(shellString)).toThrow(/at steps\/0\/checks\/0/);
    const twice = { ...PLAN, steps: [PLAN.steps[0], { ...PLAN.steps[0], ask: "Again." }] };
    expect(() => validateWorkPlan(twice)).toThrow(/declares step 'widget' twice/);
  });

  it("a disposition fixes or rejects, and a rejection carries its evidence", () => {
    expect(validateDispositions(DISPOSITIONS).dispositions[0].action).toBe("fix");
    const proseOnly = {
      ...DISPOSITIONS,
      dispositions: [{ finding_index: 0, action: "reject", reason: "not a defect" }],
    };
    expect(() => validateDispositions(proseOnly)).toThrow(/at dispositions\/0/);
    const accepted = { ...DISPOSITIONS, dispositions: [{ finding_index: 0, action: "accept" }] };
    expect(() => validateDispositions(accepted)).toThrow(LedgerError);
    const twice = {
      ...DISPOSITIONS,
      dispositions: [DISPOSITIONS.dispositions[0], DISPOSITIONS.dispositions[0]],
    };
    expect(() => validateDispositions(twice)).toThrow(/answers finding 0 of round 1 twice/);
  });

  it("a disposition set answers the whole round it names, and only that round", () => {
    const repo = makeProject();
    const finding = { description: "a defect", severity: "major", blocking: true };
    const nit = { description: "a nit", severity: "minor", blocking: false };

    // No round recorded: nothing to answer.
    expect(() => writeDispositions(repo, 1, DISPOSITIONS)).toThrow(/round 1, which the rounds ledger/);

    appendRound(repo, 1, {
      round: 1,
      verdict: "ISSUES_FOUND",
      blocking: true,
      findings: [finding, finding, nit],
      completion_tree: "0".repeat(40),
      recorded_at: "2026-08-31T10:20:00-04:00",
      verifier_model: "gpt",
      verifier_provider: "openai",
    });

    // The second blocking finding was never mentioned.
    expect(() => writeDispositions(repo, 1, DISPOSITIONS)).toThrow(
      /leaves blocking finding\(s\) 1 of round 1 unanswered/,
    );
    // An index the round does not have.
    expect(() =>
      writeDispositions(repo, 1, {
        ...DISPOSITIONS,
        dispositions: [{ finding_index: 0, action: "fix" }, { finding_index: 1, action: "fix" }, { finding_index: 7, action: "fix" }],
      }),
    ).toThrow(/finding 7 of round 1, which has 3 finding\(s\)/);
    // Both blocking findings answered; the nit may go unmentioned.
    const whole = writeDispositions(repo, 1, {
      ...DISPOSITIONS,
      dispositions: [
        { finding_index: 0, action: "fix" },
        { finding_index: 1, action: "reject", reason: "by design", evidence_paths: ["src/widget.py:1-3"] },
      ],
    });
    expect(whole.dispositions).toHaveLength(2);
    expect(readDispositions(repo, 1)?.dispositions[1].action).toBe("reject");
  });
});

describe("dabbler session report", () => {
  it("answers the outstanding step instruction, and nothing else", async () => {
    const { repo, sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const flags = [
      "report", "--sessions-dir", sessionsDir,
      "--seq", "1", "--step", "widget", "--status", "done",
      "--files", "src\\widget.py, ./tests/test_widget.py,src/widget.py,",
      "--notes", "made it real",
    ];

    // Nothing asked: nothing to answer, and no file appears.
    const unasked = await captured(() => sessionVerb(flags));
    expect(unasked.code).toBe(3);
    expect(unasked.err).toContain("no instruction is outstanding");
    expect(readReport(repo, 1)).toBeNull();

    // The driver asked for a plan: a report is the wrong answer.
    writeInstruction(repo, 1, {
      ...STEP_INSTRUCTION,
      answer_schema: "driver-work-plan.schema.json",
      answer_command: "dabbler session report --plan-file ...",
    });
    const wrongAnswer = await captured(() => sessionVerb(flags));
    expect(wrongAnswer.code).toBe(3);
    expect(wrongAnswer.err).toContain("driver-work-plan.schema.json");

    // The driver asked for a step: the flags become the record, shaped.
    writeInstruction(repo, 1, STEP_INSTRUCTION);
    const answered = await captured(() => sessionVerb(flags));
    expect(answered.code).toBe(0);
    expect(answered.out).toContain("seq 1 (widget, done; 2 file(s))");
    const written = readReport(repo, 1);
    expect(written).toMatchObject({
      schema_version: 1,
      seq: 1,
      session_number: 1,
      step_id: "widget",
      status: "done",
      files_changed: ["src/widget.py", "tests/test_widget.py"],
      tests_run: null,
      notes: "made it real",
    });
    expect(written?.reported_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // A shape the schema refuses is refused at the verb, and the record keeps
    // the last accepted answer.
    const stale = await captured(() =>
      sessionVerb(flags.map((flag) => (flag === "done" ? "verified" : flag))),
    );
    expect(stale.code).toBe(2);
    expect(stale.err).toContain("failed schema validation at status");
    expect(readReport(repo, 1)?.status).toBe("done");
  });

  it("refuses a report somebody typed instead of skipping it", () => {
    const { repo } = makeSandboxRepo();
    const path = reportPath(repo, 1);
    mkdirSync(dirname(path), { recursive: true });

    // The spike's shape, typed by hand into the framework's ledger.
    writeFileSync(
      path,
      JSON.stringify({ seq: 1, step: "widget", status: "done", filesChanged: [], notes: "x" }),
      "utf8",
    );
    expect(() => readReport(repo, 1)).toThrow(LedgerError);

    // A member this build has never heard of is READ PAST, and a verdict
    // smuggled in beside a well-formed report is one of them. It buys the
    // smuggler nothing: a verdict is what the verifier recorded in the
    // rounds ledger, and no reader of a report has ever looked here for
    // one. What still catches a typed answer is the shape above -- and the
    // writer, which validates strictly and would never have written this.
    writeFileSync(path, JSON.stringify({ ...REPORT, verdict: "VERIFIED" }), "utf8");
    expect(readReport(repo, 1)).toMatchObject({ status: "done", step_id: "widget" });
    // A member the schema DOES know, with the wrong value, is still refused.
    writeFileSync(path, JSON.stringify({ ...REPORT, status: "verified" }), "utf8");
    expect(() => readReport(repo, 1)).toThrow(/driver report failed schema validation/);

    // Not JSON at all.
    writeFileSync(path, "done\n", "utf8");
    expect(() => readReport(repo, 1)).toThrow(/is not valid JSON/);
  });
});

describe("dabbler session plan amend", () => {
  it("moves what a step is measured against, with the reason and the approver, and never after it was accepted", async () => {
    const { repo, sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    writeWorkPlan(repo, 1, PLAN);
    const flags = [
      "plan", "amend", "--sessions-dir", sessionsDir,
      "--step", "widget",
      "--files", "src/widget.py,tests/test_widget.py",
      "--reason", "the step's own check reads the test the plan never named",
      "--approver", "operator",
    ];

    const amended = await captured(() => sessionVerb(flags));
    expect(amended.code).toBe(0);
    // The plan on disk is what the next instruction for the step measures
    // against, and it is still a plan the reader accepts.
    expect(readWorkPlan(repo, 1)?.steps[0]).toMatchObject({
      id: "widget",
      files: ["src/widget.py", "tests/test_widget.py"],
      ask: "Make it.",
      checks: [{ argv: ["python", "-m", "pytest"] }],
    });
    // What changed, why and who said so, where nothing overwrites it.
    const record = readAmendments(repo, 1);
    expect(record).toHaveLength(1);
    expect(record[0]).toMatchObject({
      step_id: "widget",
      approver: "operator",
      reason: "the step's own check reads the test the plan never named",
      before: { files: ["src/widget.py"] },
      after: { files: ["src/widget.py", "tests/test_widget.py"] },
    });

    // Unsigned is refused: an amendment nobody stands behind is a bar moved
    // by nobody.
    const unsigned = await captured(() =>
      sessionVerb(flags.filter((flag, index) => flag !== "--approver" && flags[index - 1] !== "--approver")),
    );
    expect(unsigned.code).toBe(2);
    expect(unsigned.err).toContain("--approver");

    // Accepted is settled: the report was measured against the step as it
    // stood, and this would move that bar afterwards.
    writeRun(repo, 1, { ...RUN, accepted_steps: ["widget"] });
    const late = await captured(() => sessionVerb(flags));
    expect(late.code).toBe(3);
    expect(late.err).toContain("has already been accepted");
    expect(readAmendments(repo, 1)).toHaveLength(1);
  });
});

describe("the watcher, which separates a thinking engine from a stopped one", () => {
  const ISSUED = "2026-09-01T06:40:00-04:00";
  const NOW = new Date("2026-09-01T06:41:12-04:00");
  const INSTRUCTION = { ...STEP_INSTRUCTION, issued_at: ISSUED } as unknown as DriverInstruction;
  const LIVE = { ...RUN, updated_at: ISSUED } as unknown as DriverRun;
  const never = () => {
    throw new Error("the tree was probed on a poll that could not use it");
  };

  it("stays quiet through every silence that is not the one it is for", () => {
    // Each of these is a reason the engine owes nothing, or is known to be
    // working. The probe throws, which is how "never run for nothing" is
    // asserted rather than described.
    const quiet = (inputs: Partial<WatcherInputs>) =>
      watcherReading(
        {
          instruction: INSTRUCTION,
          run: LIVE,
          answeredAt: null,
          treeTouchedAt: never,
          ...inputs,
        },
        60,
        NOW,
      ).state;
    expect(quiet({ instruction: null })).toBe(WATCHER_QUIET);
    expect(quiet({ instruction: { ...INSTRUCTION, kind: "wait" } as DriverInstruction })).toBe(
      WATCHER_QUIET,
    );
    expect(quiet({ instruction: { ...INSTRUCTION, kind: "done" } as DriverInstruction })).toBe(
      WATCHER_QUIET,
    );
    expect(
      quiet({
        run: { ...LIVE, stop: { kind: "tests", reason: "red", at: ISSUED } } as DriverRun,
      }),
    ).toBe(WATCHER_QUIET);
    expect(
      quiet({
        run: {
          ...LIVE,
          job: {
            name: "verification",
            argv: [],
            pid: 1,
            log: "l",
            status: "s",
            started_at: ISSUED,
            retry_after_seconds: 30,
          },
        } as DriverRun,
      }),
    ).toBe(WATCHER_QUIET);
    // An answer written after the instruction was issued -- whether or not
    // the driver has read it yet.
    expect(quiet({ answeredAt: "2026-09-01T06:41:00-04:00" })).toBe(WATCHER_QUIET);
    // An answer to something EARLIER is not an answer to this, and the
    // probe is reached for the first time here.
    expect(
      watcherReading(
        {
          instruction: INSTRUCTION,
          run: LIVE,
          answeredAt: "2026-09-01T06:39:00-04:00",
          treeTouchedAt: () => null,
        },
        60,
        NOW,
      ).state,
    ).toBe(WATCHER_OUTSTANDING);
    // Inside the threshold, nothing is owed but patience.
    expect(
      watcherReading(
        { instruction: INSTRUCTION, run: LIVE, answeredAt: null, treeTouchedAt: never },
        600,
        NOW,
      ).state,
    ).toBe(WATCHER_QUIET);
    // Past it, but the engine is editing.
    expect(
      watcherReading(
        {
          instruction: INSTRUCTION,
          run: LIVE,
          answeredAt: null,
          treeTouchedAt: () => "2026-09-01T06:41:05-04:00",
        },
        60,
        NOW,
      ).state,
    ).toBe(WATCHER_QUIET);
  });

  it("says an instruction is outstanding over a tree that has not moved", () => {
    const reading = watcherReading(
      { instruction: INSTRUCTION, run: LIVE, answeredAt: null, treeTouchedAt: () => null },
      60,
      NOW,
    );
    expect(reading.state).toBe(WATCHER_OUTSTANDING);
    expect(reading.sinceSeconds).toBe(72);
  });

  it("reads one session's directory, and the tree it is over", () => {
    const repo = makeProject();
    // Nothing asked for is nothing to say, before any file exists.
    expect(readWatcher(repo, 1, 60, NOW).state).toBe(WATCHER_QUIET);
    writeInstruction(repo, 1, { ...STEP_INSTRUCTION, issued_at: ISSUED });
    writeRun(repo, 1, { ...RUN, updated_at: ISSUED });
    // The driver's own files are under `.dabbler/`, which is ignored, so the
    // probe sees an untouched tree and the watcher speaks.
    expect(readWatcher(repo, 1, 60, NOW).state).toBe(WATCHER_OUTSTANDING);
    // A file written now is newer than an instruction issued in the past,
    // and the probe is what says so.
    writeFileSync(join(repo, "widget.ts"), "export const widget = 1;\n");
    expect(Date.parse(treeTouchedAt(repo) as string)).toBeGreaterThan(Date.parse(ISSUED));
    expect(readWatcher(repo, 1, 60, NOW).state).toBe(WATCHER_QUIET);
  });
});

describe("dabbler session rebaseline", () => {
  it("refuses while the run is going and records the repair while it is stopped", async () => {
    const { repo, sessionsDir } = makeSandboxRepo();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const baseline = snapshotWorktreeTree(repo) as string;
    writeRun(repo, 1, { ...RUN, baseline_tree: baseline });
    const flags = [
      "rebaseline",
      "--sessions-dir",
      sessionsDir,
      "--reason",
      "the driver's own spawn was fixed to get past the stop",
      "--by",
      "the operator",
    ];

    // A running loop reports work through its steps. Moving the baseline
    // under one would hide that step's own change from the comparison that
    // judges it.
    const running = await captured(() => sessionVerb(flags));
    expect(running.code).toBe(3);
    expect(running.err).toContain("has not stopped");
    expect(readRepairs(repo, 1)).toEqual([]);

    writeRun(repo, 1, {
      ...RUN,
      baseline_tree: baseline,
      stop: {
        kind: "blocked",
        reason: "the widget is load-bearing",
        at: "2026-08-31T12:00:00-04:00",
        step_id: "widget",
      },
    });
    writeFileSync(join(repo, "src", "widget.py"), "def widget():\n    return 2\n", "utf8");

    const repaired = await captured(() => sessionVerb(flags));
    expect(repaired.code).toBe(0);
    const [row] = readRepairs(repo, 1);
    expect(row).toMatchObject({
      session_number: 1,
      stop_kind: "blocked",
      step_id: "widget",
      by: "the operator",
      from_baseline: baseline,
    });
    expect(row?.["paths"]).toEqual(["src/widget.py"]);
    // The baseline moved and NOTHING else did: the stop the operator is
    // repairing under is still there to be re-run.
    const run = readRun(repo, 1);
    expect(run?.baseline_tree).toBe(row?.["to_baseline"]);
    expect(run?.baseline_tree).not.toBe(baseline);
    expect(run?.stop?.kind).toBe("blocked");
    expect(run?.phase).toBe("steps");
    // And a person owns it: a machine cannot judge whether work put in
    // outside a step was the right work.
    const owed = openDecisions(repo);
    expect(owed.map((entry) => entry["id"])).toContain("repair-outside-a-step-1");
    expect(owed[0]?.["severity"]).not.toBe("blocking");
  });
});

describe("the watcher's other counterparty: the framework's own job", () => {
  const STARTED = "2026-09-01T06:40:00-04:00";
  const NOW = new Date("2026-09-01T06:41:12-04:00");
  const JOB = {
    name: "verification",
    argv: ["node", "dabbler.cjs", "verify"],
    pid: 1,
    log: ".dabbler/runs/s1/driver/jobs/verification.log",
    status: ".dabbler/runs/s1/driver/jobs/verification.status.json",
    started_at: STARTED,
    retry_after_seconds: 60,
  };
  const WAITING = {
    ...RUN,
    updated_at: STARTED,
    job: JOB,
  } as unknown as DriverRun;
  // Under the pull the instruction during long work is a `wait`, re-issued
  // with a fresh stamp on every call: every test the engine rule makes reads
  // healthy for as long as somebody keeps polling.
  const WAIT = {
    schema_version: 1,
    seq: 9,
    kind: "wait",
    session_number: 1,
    issued_at: "2026-09-01T06:41:10-04:00",
    retry_after_seconds: 60,
    answer_command: "dabbler session next",
  } as unknown as DriverInstruction;

  const read = (job: WatcherInputs["jobLogGrew"], seconds = 60) =>
    watcherReading(
      {
        instruction: WAIT,
        run: WAITING,
        answeredAt: null,
        treeTouchedAt: () => {
          throw new Error("the tree is not what says whether a JOB is working");
        },
        jobLogGrew: job,
      },
      seconds,
      NOW,
    );

  it("says a job is outstanding only once it is past the threshold and writing nothing", () => {
    // A growing log is a job working -- the same discrimination the engine
    // rule makes with the tree.
    expect(read(() => true).state).toBe(WATCHER_QUIET);
    // A first look is not a comparison, so it is not evidence of silence.
    expect(read(() => null).state).toBe(WATCHER_QUIET);
    // Inside the threshold, nothing is owed but patience.
    expect(read(() => false, 600).state).toBe(WATCHER_QUIET);

    const reading = read(() => false);
    expect(reading.state).toBe(WATCHER_JOB_OUTSTANDING);
    expect(reading.sinceSeconds).toBe(72);
    expect(reading.job).toBe("verification");
  });
});
