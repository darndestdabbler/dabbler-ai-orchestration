// The driver's contract: four answer shapes the framework acts on, the
// ledger that holds them, and the clocks that separate a thinking engine
// from a stopped one.
//
// What is asserted is the refusals -- a schema is proven by what it will not
// admit -- and every clock is a function of an instruction, a run record and
// two probes handed in. The verbs an engine types are walk-session's.
import assert from "node:assert/strict";
import { mkdirSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import { staleJobDisposition } from "../src/drive.ts";
import {
  WATCHER_JOB_OUTSTANDING,
  WATCHER_OUTSTANDING,
  WATCHER_QUIET,
  readDispositions,
  readReport,
  readWatcher,
  reportPath,
  treeTouchedAt,
  validateDispositions,
  validateInstruction,
  validateReport,
  validateWorkPlan,
  watcherReading,
  writeDispositions,
  writeInstruction,
  writeRun,
  type WatcherInputs,
} from "../src/driver.ts";
import type { DriverInstruction, DriverRun } from "../src/generated/index.ts";
import { LedgerError, appendRound } from "../src/ledger.ts";
import { gitAnswers, tempDir } from "./support/answers.ts";
import { makeRepo } from "./support/repo.ts";

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
    {
      id: "widget",
      ask: "Make it.",
      files: ["src/widget.py"],
      checks: [{ argv: ["python", "-m", "pytest"] }],
    },
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

/** A directory the run ledger can be written into, with git answering. */
function runDir(): { repo: string; restore: () => void } {
  const repo = tempDir("driver-");
  return {
    repo,
    restore: gitAnswers([
      [["rev-parse", "--show-toplevel"], { stdout: repo.split("\\").join("/") }],
      [(args) => args[0] === "cat-file" && args[1] === "-e", { code: 0 }],
      [["status", "--porcelain", "-uall"], { stdout: "" }],
      [["commit-tree"], { stdout: "c".repeat(40) }],
      [["update-ref"], { code: 0 }],
    ]),
  };
}

describe("the four answer schemas", () => {
  it("an instruction is one of four kinds, and each carries what it requires", () => {
    assert.equal(validateInstruction(STEP_INSTRUCTION).kind, "step");
    // A rejection with nothing to say is not a rejection.
    assert.throws(
      () => validateInstruction({ ...STEP_INSTRUCTION, kind: "rejection", ask: undefined }),
      /driver instruction failed schema validation at \(root\)/,
    );
    // There is no kind that asks the engine for a verdict.
    assert.throws(
      () => validateInstruction({ ...STEP_INSTRUCTION, kind: "verdict" }),
      LedgerError,
    );
    // A closed conversation names no answer, so nothing can answer it.
    assert.throws(
      () =>
        validateInstruction({
          ...STEP_INSTRUCTION,
          kind: "done",
          step_id: undefined,
          ask: undefined,
        }),
      LedgerError,
    );
    assert.equal(
      validateInstruction({
        ...STEP_INSTRUCTION,
        kind: "done",
        step_id: undefined,
        ask: undefined,
        answer_schema: undefined,
        answer_command: undefined,
      }).kind,
      "done",
    );
  });

  it("a report has no word for a verdict and no path outside the repository", () => {
    assert.equal(validateReport(REPORT).status, "done");
    assert.throws(
      () => validateReport({ ...REPORT, status: "verified" }),
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
      assert.throws(
        () => validateReport({ ...REPORT, files_changed: [path] }),
        /at files_changed\/0/,
        path,
      );
    }
  });

  it("a work plan's checks are argv, at least one per step, and its ids are unique", () => {
    assert.equal(validateWorkPlan(PLAN).steps.length, 1);
    // A step with no check is a step closed on the engine's word.
    assert.throws(
      () => validateWorkPlan({ ...PLAN, steps: [{ ...PLAN.steps[0]!, checks: [] }] }),
      /at steps\/0\/checks/,
    );
    assert.throws(
      () =>
        validateWorkPlan({
          ...PLAN,
          steps: [{ ...PLAN.steps[0]!, checks: [{ command: "python -m pytest" }] }],
        }),
      /at steps\/0\/checks\/0/,
    );
    assert.throws(
      () =>
        validateWorkPlan({
          ...PLAN,
          steps: [PLAN.steps[0]!, { ...PLAN.steps[0]!, ask: "Again." }],
        }),
      /declares step 'widget' twice/,
    );
  });

  it("a disposition fixes or rejects, and a rejection carries its evidence", () => {
    assert.equal(validateDispositions(DISPOSITIONS).dispositions[0]!.action, "fix");
    assert.throws(
      () =>
        validateDispositions({
          ...DISPOSITIONS,
          dispositions: [{ finding_index: 0, action: "reject", reason: "not a defect" }],
        }),
      /at dispositions\/0/,
    );
    // There is no word for accepting a finding and doing nothing about it.
    assert.throws(
      () =>
        validateDispositions({
          ...DISPOSITIONS,
          dispositions: [{ finding_index: 0, action: "accept" }],
        }),
      LedgerError,
    );
    assert.throws(
      () =>
        validateDispositions({
          ...DISPOSITIONS,
          dispositions: [DISPOSITIONS.dispositions[0]!, DISPOSITIONS.dispositions[0]!],
        }),
      /answers finding 0 of round 1 twice/,
    );
  });
});

describe("answering a whole round of findings", () => {
  it("answers the round it names, and every blocking finding in it", () => {
    const { repo, restore } = runDir();
    const finding = { description: "a defect", severity: "major", blocking: true };
    const nit = { description: "a nit", severity: "minor", blocking: false };
    try {
      // No round recorded: nothing to answer.
      assert.throws(
        () => writeDispositions(repo, 1, DISPOSITIONS),
        /round 1, which the rounds ledger/,
      );

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
      assert.throws(
        () => writeDispositions(repo, 1, DISPOSITIONS),
        /leaves blocking finding\(s\) 1 of round 1 unanswered/,
      );
      // An index the round does not have.
      assert.throws(
        () =>
          writeDispositions(repo, 1, {
            ...DISPOSITIONS,
            dispositions: [
              { finding_index: 0, action: "fix" },
              { finding_index: 1, action: "fix" },
              { finding_index: 7, action: "fix" },
            ],
          }),
        /finding 7 of round 1, which has 3 finding\(s\)/,
      );
      // Both blocking findings answered; the nit may go unmentioned.
      const whole = writeDispositions(repo, 1, {
        ...DISPOSITIONS,
        dispositions: [
          { finding_index: 0, action: "fix" },
          {
            finding_index: 1,
            action: "reject",
            reason: "by design",
            evidence_paths: ["src/widget.py:1-3"],
          },
        ],
      });
      assert.equal(whole.dispositions.length, 2);
      assert.equal(readDispositions(repo, 1)?.dispositions[1]!.action, "reject");
    } finally {
      restore();
    }
  });
});

describe("reading a report back", () => {
  it("refuses one somebody typed instead of skipping it", () => {
    const { repo, restore } = runDir();
    try {
      const path = reportPath(repo, 1);
      mkdirSync(dirname(path), { recursive: true });

      // The spike's shape, typed by hand into the framework's ledger.
      writeFileSync(
        path,
        JSON.stringify({ seq: 1, step: "widget", status: "done", filesChanged: [], notes: "x" }),
        "utf8",
      );
      assert.throws(() => readReport(repo, 1), LedgerError);

      // A member this build has never heard of is READ PAST, and a verdict
      // smuggled in beside a well-formed report is one of them. It buys the
      // smuggler nothing: a verdict is what the verifier recorded in the
      // rounds ledger, and no reader of a report has ever looked here for
      // one.
      writeFileSync(path, JSON.stringify({ ...REPORT, verdict: "VERIFIED" }), "utf8");
      assert.equal(readReport(repo, 1)?.status, "done");
      assert.equal(readReport(repo, 1)?.step_id, "widget");

      // A member the schema DOES know, with the wrong value, is still refused.
      writeFileSync(path, JSON.stringify({ ...REPORT, status: "verified" }), "utf8");
      assert.throws(() => readReport(repo, 1), /driver report failed schema validation/);

      writeFileSync(path, "done\n", "utf8");
      assert.throws(() => readReport(repo, 1), /is not valid JSON/);
    } finally {
      restore();
    }
  });
});

// --- The watcher --------------------------------------------------------------

describe("the watcher, which separates a thinking engine from a stopped one", () => {
  const ISSUED = "2026-09-01T06:40:00-04:00";
  const NOW = new Date("2026-09-01T06:41:12-04:00");
  const INSTRUCTION = { ...STEP_INSTRUCTION, issued_at: ISSUED } as unknown as DriverInstruction;
  const LIVE = { ...RUN, updated_at: ISSUED } as unknown as DriverRun;
  const never = (): never => {
    throw new Error("the tree was probed on a poll that could not use it");
  };

  const reading = (inputs: Partial<WatcherInputs>, seconds = 60, now = NOW) =>
    watcherReading(
      { instruction: INSTRUCTION, run: LIVE, answeredAt: null, treeTouchedAt: never, ...inputs },
      seconds,
      now,
    );

  it("stays quiet through every silence that is not the one it is for", () => {
    // Each of these is a reason the engine owes nothing, or is known to be
    // working. The probe throws, which is how "never run for nothing" is
    // asserted rather than described.
    assert.equal(reading({ instruction: null }).state, WATCHER_QUIET);
    for (const kind of ["wait", "done"]) {
      assert.equal(
        reading({ instruction: { ...INSTRUCTION, kind } as DriverInstruction }).state,
        WATCHER_QUIET,
      );
    }
    // A run that has stopped owes nothing but a person's attention.
    assert.equal(
      reading({
        run: { ...LIVE, stop: { kind: "tests", reason: "red", at: ISSUED } } as DriverRun,
      }).state,
      WATCHER_QUIET,
    );
    // An answer written after the instruction was issued -- whether or not
    // the driver has read it yet.
    assert.equal(reading({ answeredAt: "2026-09-01T06:41:00-04:00" }).state, WATCHER_QUIET);
    // Inside the threshold, nothing is owed but patience.
    assert.equal(reading({ treeTouchedAt: () => null }, 600).state, WATCHER_QUIET);
    // Past it, but the engine is editing.
    assert.equal(
      reading({ treeTouchedAt: () => "2026-09-01T06:41:05-04:00" }).state,
      WATCHER_QUIET,
    );
  });

  it("reads an answer to something earlier as no answer to this", () => {
    assert.equal(
      reading({ answeredAt: "2026-09-01T06:39:00-04:00", treeTouchedAt: () => null }).state,
      WATCHER_OUTSTANDING,
    );
  });

  it("says an instruction is outstanding over a tree that has not moved", () => {
    const read = reading({ treeTouchedAt: () => null });
    assert.equal(read.state, WATCHER_OUTSTANDING);
    assert.equal(read.sinceSeconds, 72);
    // Nothing was ever observed: the acknowledgment clock, with the move a
    // supervisor should make in its words.
    assert.equal(read.clock, "acknowledgment");
    assert.match(String(read.recommended_action), /session next/);
  });

  it("names the progress clock when edits happened and then stopped", () => {
    // Responsiveness is not progress: the old rule read ANY touch after the
    // instruction as healthy forever, so an engine that edited once and
    // wandered off was invisible.
    const read = reading({ treeTouchedAt: () => "2026-09-01T06:40:05-04:00" });
    assert.equal(read.state, WATCHER_OUTSTANDING);
    assert.equal(read.clock, "progress");
    assert.equal(read.sinceSeconds, 67);
    assert.match(String(read.recommended_action), /answer_command/);
  });

  it("escalates a long acknowledgment silence to the progress clock", () => {
    const read = reading(
      { treeTouchedAt: () => null },
      60,
      new Date("2026-09-01T06:47:00-04:00"),
    );
    assert.equal(read.state, WATCHER_OUTSTANDING);
    assert.equal(read.clock, "progress");
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
  const WAITING = { ...RUN, updated_at: STARTED, job: JOB } as unknown as DriverRun;
  // Under the pull the instruction during long work is a `wait`, re-issued
  // with a fresh stamp on every call: every test the ENGINE rule makes reads
  // healthy for as long as somebody keeps polling, so the job needs its own.
  const WAIT = {
    schema_version: 1,
    seq: 9,
    kind: "wait",
    session_number: 1,
    issued_at: "2026-09-01T06:41:10-04:00",
    retry_after_seconds: 60,
    answer_command: "dabbler session next",
  } as unknown as DriverInstruction;

  const read = (jobLogGrew: WatcherInputs["jobLogGrew"], seconds = 60) =>
    watcherReading(
      {
        instruction: WAIT,
        run: WAITING,
        answeredAt: null,
        treeTouchedAt: () => {
          throw new Error("the tree is not what says whether a JOB is working");
        },
        jobLogGrew,
      },
      seconds,
      NOW,
    );

  it("says a job is outstanding only once it is past the threshold and writing nothing", () => {
    // A growing log is a job working -- the same discrimination the engine
    // rule makes with the tree.
    assert.equal(read(() => true).state, WATCHER_QUIET);
    // A first look is not a comparison, so it is not evidence of silence.
    assert.equal(read(() => null).state, WATCHER_QUIET);
    // Inside the threshold, nothing is owed but patience.
    assert.equal(read(() => false, 600).state, WATCHER_QUIET);

    const outstanding = read(() => false);
    assert.equal(outstanding.state, WATCHER_JOB_OUTSTANDING);
    assert.equal(outstanding.sinceSeconds, 72);
    assert.equal(outstanding.job, "verification");
  });

  it("names a spinning job on the progress clock even while its log grows", () => {
    const spinning = watcherReading(
      {
        instruction: { ...STEP_INSTRUCTION, kind: "wait" } as DriverInstruction,
        run: {
          ...RUN,
          updated_at: "2026-09-01T06:40:00-04:00",
          job: { ...JOB, started_at: "2026-09-01T06:35:00-04:00" },
        } as DriverRun,
        answeredAt: null,
        treeTouchedAt: () => null,
        jobLogGrew: () => true,
      },
      60,
      NOW,
    );
    assert.equal(spinning.state, WATCHER_JOB_OUTSTANDING);
    assert.equal(spinning.clock, "progress");
    assert.match(String(spinning.recommended_action), /spin/);
  });
});

describe("the watcher over one session's directory", () => {
  const ISSUED = "2026-09-01T06:40:00-04:00";
  const NOW = new Date("2026-09-01T06:41:12-04:00");

  it("reads the record it kept, and the tree it is over", () => {
    // A real repository, because the probe is `git status` plus the mtimes
    // of what it names. The seed is aged behind the instruction so the first
    // reading is over a tree that has not moved SINCE.
    const repo = makeRepo({ ".gitignore": ".dabbler/\n", "widget.ts": "export const widget = 0;\n" });
    const long_ago = new Date("2026-09-01T06:30:00-04:00");
    for (const name of [".gitignore", "widget.ts"]) {
      utimesSync(join(repo, name), long_ago, long_ago);
    }

    // Nothing asked for is nothing to say, before any file exists.
    assert.equal(readWatcher(repo, 1, 60, NOW).state, WATCHER_QUIET);
    writeInstruction(repo, 1, { ...STEP_INSTRUCTION, issued_at: ISSUED });
    writeRun(repo, 1, { ...RUN, updated_at: ISSUED });
    // The driver's own files are under `.dabbler/`, which is ignored, so
    // the probe sees an untouched tree and the watcher speaks.
    assert.equal(readWatcher(repo, 1, 60, NOW).state, WATCHER_OUTSTANDING);
    // A file written now is newer than an instruction issued in the past,
    // and the probe is what says so.
    writeFileSync(join(repo, "widget.ts"), "export const widget = 1;\n", "utf8");
    assert.ok(Date.parse(treeTouchedAt(repo) as string) > Date.parse(ISSUED));
    assert.equal(readWatcher(repo, 1, 60, NOW).state, WATCHER_QUIET);
  });
});

describe("the stale-job disposition", () => {
  it("reads a running job of another name as this site being behind the walk", () => {
    assert.equal(
      staleJobDisposition("run of record: extension", "run of record: typescript", "running"),
      "behind",
    );
  });

  it("reads an exited job of another name as stale, never as proof of completion", () => {
    // Sessions 78 and 81: an uncollected verification job after an
    // adjudication fake-greened every later phase. Exited-and-mismatched
    // must always read as stale.
    assert.equal(
      staleJobDisposition("verification", "run of record: typescript", "exited"),
      "stale",
    );
    assert.equal(staleJobDisposition("verification", "close", "vanished"), "stale");
  });
});
