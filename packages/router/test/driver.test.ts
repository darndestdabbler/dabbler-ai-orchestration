// The driver's contract: four answer shapes the framework acts on, the
// ledger that holds them, and the clocks that separate a thinking engine
// from a stopped one.
//
// What is asserted is the refusals -- a schema is proven by what it will not
// admit -- and every clock is a function of an instruction, a run record and
// two probes handed in. The verbs an engine types are walk-session's.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import { judgeLease, nextLeaseEpoch, staleJobDisposition } from "../src/drive.ts";
import {
  WATCHER_JOB_OUTSTANDING,
  WATCHER_OUTSTANDING,
  WATCHER_QUIET,
  progressResumed,
  dropNonGoal,
  readAmendments,
  readDispositions,
  readReport,
  readWatcher,
  renderAmendmentProposal,
  renderStop,
  renderUncollected,
  reportPath,
  treeTouchedAt,
  uncollectedJob,
  validateDispositions,
  validateInstruction,
  validateRun,
  validateReport,
  validateWorkPlan,
  judgeWorkPlanNonGoals,
  judgeWorkPlanRelease,
  watcherReading,
  writeDispositions,
  writeInstruction,
  writeWorkPlan,
  writeRun,
  waiterSeenSince,
  waiterPath,
  type WatcherInputs,
} from "../src/driver.ts";
import type { DriverInstruction, DriverRun } from "../src/generated/index.ts";
import { LedgerError, appendRound } from "../src/ledger.ts";
import { gitAnswers, makeAnsweredSandbox, tempDir } from "./support/answers.ts";
import { TRANSPORT_COPILOT_CLI, loadConfig, resetProjectRootCache } from "../src/config.ts";
import { SETTING_REVIEWER_TRANSPORT, writeSettings } from "../src/settings.ts";
import { ENGINE_MARKERS, asAPersonsClick, reviewingVehicleRefusal } from "../src/session.ts";
import { shlexSplit } from "../src/checks.ts";
import { HANDLERS } from "../src/cli/registry.ts";
import { sessionVerb } from "../src/cli/session.ts";
import { capture } from "../src/output.ts";
import { registerSessionStart } from "../src/writers.ts";

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
  non_goals: ["Anything the step does not name."],
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

  it("a plan answered now that names a release member is refused, and a recorded one is still read", () => {
    // A release is a session of its own; the record is never refused after the fact.
    const older = validateWorkPlan({ ...PLAN, hold_release: "session 2 lands the consumer" });
    assert.equal(older.hold_release, "session 2 lands the consumer");
    assert.match(judgeWorkPlanRelease(older)[0] ?? "", /`hold_release`.*a release is a session of its own/);
    assert.match(judgeWorkPlanRelease({ ...older, release: "now" })[0] ?? "", /`release` and `hold_release`/);
    assert.deepEqual(judgeWorkPlanRelease(validateWorkPlan(PLAN)), []);
  });

  it("a plan names at least one non-goal, and the refusal names the member", () => {
    // A plan that cannot say what it will NOT do has not understood its
    // scope, and the reviewer is told to hold the work to the list.
    const plan = validateWorkPlan(PLAN);
    for (const non_goals of [undefined, [], [" "]]) {
      assert.match(judgeWorkPlanNonGoals({ ...plan, non_goals })[0] ?? "", /non_goals/);
    }
    assert.deepEqual(judgeWorkPlanNonGoals({ ...plan, non_goals: ["A second widget."] }), []);
    // An empty list is the schema's to refuse where the member is present.
    assert.throws(() => validateWorkPlan({ ...PLAN, non_goals: [] }), /non_goals/);
  });

  it("drops a declared non-goal the work falsified, and records the amendment", () => {
    // A non-goal is declared before the work and the work can falsify it.
    // Without this the only exit was to dispute a true finding, which
    // teaches the author to reject correct findings.
    const { repo, restore } = runDir();
    try {
      writeWorkPlan(repo, 1, { ...PLAN, non_goals: ["Anything the step does not name.", "A second widget."] });
      const amended = dropNonGoal(
        repo,
        1,
        { text: "A second widget.", reason: "the step's own contract needs it", by: "claude-code" },
        "2026-09-17T12:00:00-04:00",
      );
      // The plan the verifier reads no longer holds the work to it, and
      // carries the drop with its reason instead.
      assert.deepEqual(amended.non_goals, ["Anything the step does not name."]);
      assert.deepEqual(amended.dropped_non_goals, [
        { text: "A second widget.", reason: "the step's own contract needs it" },
      ]);
      const row = readAmendments(repo, 1).at(-1) ?? {};
      assert.equal(row["step_id"], null);
      assert.match(String(row["reason"]), /own contract/);
      // The last one goes with the member: the schema admits no empty list.
      const emptied = dropNonGoal(
        repo,
        1,
        { text: "Anything the step does not name.", reason: "the fix is in it", by: "claude-code" },
        "2026-09-17T12:01:00-04:00",
      );
      assert.equal(emptied.non_goals, undefined);
      assert.equal(emptied.dropped_non_goals?.length, 2);
    } finally {
      restore();
    }
  });

  it("refuses a drop naming text declared nowhere, and names what is declared", () => {
    // The refusal carries the list so the next call is typeable from it,
    // instead of sending the author to read the plan under `.dabbler/runs/`.
    const { repo, restore } = runDir();
    try {
      writeWorkPlan(repo, 1, PLAN);
      assert.throws(
        () =>
          dropNonGoal(repo, 1, { text: "A third widget.", reason: "why", by: "claude-code" }, "t"),
        (error: unknown) =>
          error instanceof LedgerError && /Anything the step does not name\./.test(error.message),
      );
      // A reason is not optional, and a drop happens once.
      assert.throws(
        () =>
          dropNonGoal(
            repo,
            1,
            { text: "Anything the step does not name.", reason: " ", by: "claude-code" },
            "t",
          ),
        /reason/,
      );
      dropNonGoal(
        repo,
        1,
        { text: "Anything the step does not name.", reason: "falsified", by: "claude-code" },
        "t",
      );
      assert.throws(
        () =>
          dropNonGoal(
            repo,
            1,
            { text: "Anything the step does not name.", reason: "again", by: "claude-code" },
            "t",
          ),
        /already dropped/,
      );
    } finally {
      restore();
    }
  });

  it("still accepts a recorded plan that names modules, and reads nothing from them", () => {
    const recorded = validateWorkPlan({ ...PLAN, modules: ["model", "persister"], reason: "both" });
    assert.deepEqual(recorded.steps, validateWorkPlan(PLAN).steps);
  });

  it("reads a run the focused checkout wrote, suites owed elsewhere and all", () => {
    const recorded = { ...RUN, suites_owed_elsewhere: [{ suite: "listener-against-persister", module: "listener" }] };
    assert.equal(validateRun(recorded).phase, RUN.phase);
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
    // The probe is `git status` plus the mtimes of what it names: git
    // answers from the table, the mtimes are the files' own. The seed is
    // aged behind the instruction so the first reading is over a tree that
    // has not moved SINCE.
    const sandbox = makeAnsweredSandbox({ "widget.ts": "export const widget = 0;\n" });
    const repo = sandbox.repo;
    const long_ago = new Date("2026-09-01T06:30:00-04:00");
    for (const name of [".gitignore", "widget.ts"]) {
      utimesSync(join(repo, name), long_ago, long_ago);
    }

    // Nothing asked for is nothing to say, before any file exists.
    assert.equal(readWatcher(repo, 1, 60, NOW).state, WATCHER_QUIET);
    writeInstruction(repo, 1, { ...STEP_INSTRUCTION, issued_at: ISSUED });
    writeRun(repo, 1, { ...RUN, updated_at: ISSUED });
    // The driver's own files are under `.dabbler/`, which git does not
    // report, so the probe sees an untouched tree and the watcher speaks.
    assert.equal(readWatcher(repo, 1, 60, NOW).state, WATCHER_OUTSTANDING);
    // A file written now is newer than an instruction issued in the past,
    // and the probe is what says so.
    writeFileSync(join(repo, "widget.ts"), "export const widget = 1;\n", "utf8");
    sandbox.status(" M widget.ts");
    assert.ok(Date.parse(treeTouchedAt(repo) as string) > Date.parse(ISSUED));
    assert.equal(readWatcher(repo, 1, 60, NOW).state, WATCHER_QUIET);
  });
});

describe("an adviser's proposal, as a person would type it", () => {
  it("names the step, what moves, and the reason flag, and nothing about who", () => {
    // What is printed at the stop and offered on the owed row is the same
    // rendering: a proposal a person cannot type is a description. Who was
    // working is on the record, so there is no name to type.
    const text = renderAmendmentProposal(
      {
        step_id: "widget",
        files: ["src/widget.py", "tests/test_widget.py"],
        checks: [{ argv: ["node", "--test"] }],
        relaxes_a_gate: false,
        reason: "the check named the value the plan guessed",
      },
      "docs\\sessions",
    );
    assert.match(text, /plan amend --sessions-dir docs\/sessions/);
    assert.match(text, /--step widget/);
    assert.match(text, /--files src\/widget\.py,tests\/test_widget\.py/);
    assert.match(text, /--checks-file .*"node","--test"/);
    assert.match(text, /--reason "<why>"/);
    assert.doesNotMatch(text, /--approver/);
  });
});

describe("a stop, as a person reads it", () => {
  // The closed unions themselves, so a kind or code added to the schema is
  // held to the same rule the moment it can be recorded.
  const RUN_DEFS = (
    JSON.parse(readFileSync(new URL("../schemas/driver-run.schema.json", import.meta.url), "utf8")) as {
      $defs: { stopKind: { enum: string[] }; stopCode: { enum: Array<string | null> } };
    }
  ).$defs;
  const KINDS = RUN_DEFS.stopKind.enum;
  const CODES = RUN_DEFS.stopCode.enum.filter((code): code is string => code !== null);

  it("offers a runnable way on from every kind and every code, besides ending the session", () => {
    // Zero deadlock tolerance as a property: no stop the loop can record
    // leaves a person with nothing to run but the cancel.
    for (const [kind, code] of [
      ...KINDS.map((kind) => [kind, null] as const),
      ...CODES.map((code) => ["verification", code] as const),
    ]) {
      for (const engine of ["cli", "claude-code"]) {
        const stop = { kind, code, reason: "the widget is load-bearing", step_id: "widget" };
        const words = renderStop(stop as never, { session_number: 7, phase: "verify", engine });
        const onward = words.choices.filter(
          (choice) => /^dabbler \S/.test(choice.command) && !/session cancel/.test(choice.command),
        );
        assert.ok(onward.length >= 1, `${code ?? kind}/${engine}: ${words.ways}`);
      }
    }
  });

  it("prints no command its own verb would refuse as usage, and the cancel it prints runs as printed", async () => {
    // Every stop offered `dabbler session cancel --reason "<why>"`, and the
    // verb refused it twice -- no session number, and no --force for a
    // session in flight -- so an AI that read the offer reached `--force` by
    // elimination. Push-mode moves printed `session drive` bare, which needs
    // its engine. Held here against the CLI's own tables: the verb exists, a
    // `session` subcommand is implemented, every flag printed is one its help
    // names, and every flag its help marks required is printed.
    const commands = new Set<string>();
    for (const [kind, code] of [
      ...KINDS.map((kind) => [kind, null] as const),
      ...CODES.map((code) => ["verification", code] as const),
    ]) {
      for (const engine of ["cli", "claude-code"]) {
        const stop = { kind, code, reason: "the widget is load-bearing", step_id: "widget" };
        for (const choice of renderStop(stop as never, { session_number: 7, phase: "verify", engine }).choices) {
          commands.add(choice.command);
        }
      }
    }
    for (const command of commands) {
      const tokens = shlexSplit(command);
      assert.equal(tokens[0], "dabbler", command);
      assert.ok(tokens[1]! in HANDLERS, command);
      if (tokens[1] !== "session") continue;
      const help = await capture(() => Promise.resolve(sessionVerb([tokens[2]!, "--help"])));
      assert.equal(help.value, 0, command);
      const printed = tokens.slice(3).filter((token) => token.startsWith("--"));
      for (const flag of printed) assert.ok(help.stdout.includes(flag), `${command}: ${flag}`);
      for (const required of help.stdout.matchAll(/^ {2}(--[\w-]+)(?: \S+)? +required:/gm)) {
        assert.ok(printed.includes(required[1]!), `${command} lacks ${required[1]}`);
      }
    }

    const cancelCommand = [...commands].find((command) => /session cancel/.test(command))!;
    const { sessionsDir } = makeAnsweredSandbox();
    registerSessionStart(sessionsDir, 1, { engine: "copilot" });
    const saved = ENGINE_MARKERS.map((name) => [name, process.env[name]] as const);
    try {
      for (const name of ENGINE_MARKERS) delete process.env[name];
      const ran = await capture(() =>
        asAPersonsClick(() => sessionVerb([...shlexSplit(cancelCommand).slice(2), "--sessions-dir", sessionsDir])),
      );
      assert.equal(ran.value, 0, ran.stderr);
      assert.match(ran.stdout, /"status": "cancelled"/);
    } finally {
      for (const [key, value] of saved) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("says what happened, that the command ended and the session did not, who acts, and every way on with its cost and its command", () => {
    // Every kind, both modes: the four things a person needs are the same
    // four things every time. What the words never say is that the engine
    // is working on it -- under the pull the framework cannot see the
    // engine, and a sentence that claimed otherwise would have a person
    // waiting on a process that is gone.
    for (const kind of KINDS) {
      for (const engine of ["cli", "claude-code"]) {
        const stop = { kind, reason: "the widget is load-bearing", step_id: "widget" };
        const words = renderStop(stop, { session_number: 7, phase: "verify", engine });
        const label = `${kind}/${engine}`;
        assert.equal(words.headline, `Session 007 paused (${kind})`, label);
        // The stop's own words open the sentence: a toast shows only the
        // first one, and the kind's sentence is a category, not a reason.
        assert.match(words.happened, /^The widget is load-bearing/, label);
        assert.match(words.ended, /has ended/, label);
        assert.match(words.ended, /remains in flight/, label);
        assert.match(words.next, /^Next: /, label);
        // A question with one answer is a notification, and every choice
        // is a real move: something to do, what it costs, and the command.
        assert.ok(words.choices.length >= 2, label);
        for (const choice of words.choices) {
          for (const part of [choice.label, choice.cost, choice.command]) {
            assert.ok(part.trim().length > 0, `${label}: ${JSON.stringify(choice)}`);
          }
          assert.ok(words.text.includes(choice.command), label);
        }
        // Whatever the choices are, the mode's own resume verb is the only
        // one offered: a session run one way must never be told the other
        // way's command.
        const commands = words.choices.map((choice) => choice.command).join(" ");
        const otherMode = engine === "cli" ? /session drive/ : /session next/;
        assert.doesNotMatch(commands, otherMode, label);
        // Ending it is always on the table, and never the recommendation.
        assert.match(commands, /session cancel/, label);
        assert.doesNotMatch(words.choices[0]!.command, /session cancel/, label);
        assert.doesNotMatch(words.text, /working on|is working|fixing it|STOPPED/, label);
        assert.doesNotMatch(words.text, /deadlock/i, label);
        for (const part of [words.headline, words.happened, words.ended, words.next]) {
          assert.ok(words.text.includes(part), label);
        }
      }
    }
  });

  it("says who acts as a field, and never says the engine might under the push", () => {
    // The sentence said "Next: you" over a stop whose actor was the engine,
    // and a person ran the engine's command on a live loop. Who acts is a
    // fact off the record now, and the sentence follows the fact.
    const pull = { session_number: 7, phase: "verify", engine: "cli" };
    const push = { session_number: 7, phase: "verify", engine: "claude-code" };
    const engineStop = { kind: "verification", code: "dispute-refused", reason: "over the inline cap" };
    const operatorStop = { kind: "verification", code: "cap-disputed", reason: "two disputes stand" };
    const eitherStop = { kind: "interrupted", reason: "you asked it to stop" };

    assert.equal(renderStop(engineStop, pull).actor, "engine");
    assert.match(renderStop(engineStop, pull).next, /^Next: the engine/);
    // Nothing waits for the engine, so its stop still names the call that
    // asks again -- the AI's own, and no button.
    assert.ok(renderStop(engineStop, pull).choices.some((choice) => /have the AI ask again/.test(choice.label) && choice.command === "dabbler session next"));
    assert.doesNotMatch(renderStop(engineStop, pull).text, /Resume Session/);
    assert.equal(renderStop(operatorStop, pull).actor, "operator");
    assert.match(renderStop(operatorStop, pull).next, /^Next: you/);
    // A tree that carried work when the declaration was made is the tree's
    // stop: a person commits or reverts, and the pause says so rather than
    // "the engine could not be run".
    const treeStop = { kind: "tree", reason: "the declaration was refused: session 7 cannot declare its task list now" };
    const tree = renderStop(treeStop, pull);
    assert.equal(tree.actor, "operator");
    assert.match(tree.happened, /The working tree carried changes the declaration would not accept\./);
    assert.doesNotMatch(tree.happened, /The engine could not be run/);
    // Under the pull the framework cannot see the engine, so "either" is
    // the honest answer; under the push nothing calls back but a person,
    // and saying otherwise leaves them waiting on a loop that is not running.
    assert.equal(renderStop(eitherStop, pull).actor, "either");
    assert.match(renderStop(eitherStop, pull).next, /if it is still answering; otherwise you/);
    assert.equal(renderStop(eitherStop, push).actor, "operator");
    assert.equal(renderStop(eitherStop, push).next, "Next: you.");
    // An engine's stop stays the engine's whichever way the session runs:
    // the mode decides who else might call, not whose refusal it was.
    assert.equal(renderStop(engineStop, push).actor, "engine");
  });

  it("tells the four verification stops apart: four accounts, four sets of moves", () => {
    // One sentence served all four, and the operator read it as clear as
    // mud. They are four situations: a round with no verdict, a dispute the
    // framework would not write, a cap over findings that cannot be shown
    // remediated, and a cap terminal met by a tree that has moved.
    const run = { session_number: 7, phase: "verify", engine: "cli" };
    const codes = [
      "no-verdict",
      "provider-unreachable",
      "reviewer-unreachable",
      "dispute-refused",
      "cap-unresolved",
      "cap-disputed",
      "cap-terminal-tree-moved",
    ];
    const accounts = new Set<string>();
    const firstMoves = new Set<string>();
    for (const code of codes) {
      const words = renderStop({ kind: "verification", code, reason: "the round said so" }, run);
      accounts.add(words.happened);
      firstMoves.add(words.choices[0]!.command);
    }
    assert.equal(accounts.size, codes.length);
    // Not five distinct commands -- two of them are answered by the same
    // verb -- but no longer one command for all of them, which is what
    // sent a person to run the engine's `next`.
    assert.ok(firstMoves.size >= 3, [...firstMoves].join(" | "));
    // The stop with no code renders its kind, which is what every run
    // written before the code carries.
    const uncoded = renderStop({ kind: "verification", reason: "the round said so" }, run);
    assert.match(uncoded.happened, /without a verdict/);
    // A cap terminal names the verb that buys the round, and never `plan
    // amend --max-rounds`, which is read after the terminal and does nothing.
    const capped = renderStop({ kind: "verification", code: "cap-terminal-tree-moved", reason: "the tree moved" }, run);
    assert.match(capped.choices.map((choice) => choice.command).join(" "), /verify reopen/);
    assert.doesNotMatch(capped.text, /--max-rounds/);
    // A standing dispute is judged, not terminated: the adjudication is
    // the first move offered and it is the operator's.
    const disputed = renderStop({ kind: "verification", code: "cap-disputed", reason: "one dispute stands" }, run);
    assert.equal(disputed.actor, "operator");
    assert.match(disputed.choices[0]!.command, /verify adjudicate/);
    // A provider that could not be reached is not a round that produced no
    // verdict: nothing was asked, the tree is not the problem, and the
    // moves are to try again or to route the round elsewhere.
    const unreachable = renderStop({ kind: "verification", code: "provider-unreachable", reason: "the call failed" }, run);
    assert.match(unreachable.happened, /not reached/);
    assert.doesNotMatch(unreachable.happened, /without a verdict/);
    assert.match(unreachable.choices.map((choice) => choice.command).join(" "), /dabbler configure/);
  });

  it("names the free refresh, never a model to choose, when a seat round has no catalog", () => {
    // The round stopped as a provider that could not be reached and offered
    // `--reviewer-model`, when the repair was a refresh that costs nothing.
    const root = tempDir("seat-no-catalog-");
    writeSettings(root, { [SETTING_REVIEWER_TRANSPORT]: TRANSPORT_COPILOT_CLI });
    const ungit = gitAnswers([[["rev-parse", "--show-toplevel"], { stdout: root.split("\\").join("/") }]]);
    resetProjectRootCache();
    try {
      const refusal = reviewingVehicleRefusal(loadConfig(undefined, root), root, "anthropic").refusal;
      const words = renderStop(
        { kind: "verification", code: "reviewer-unreachable", reason: String(refusal) },
        { session_number: 7, phase: "verify", engine: "cli" },
      );
      assert.match(words.text, /dabbler discovery refresh/);
      assert.doesNotMatch(words.text, /--reviewer-model/);
    } finally {
      ungit();
      resetProjectRootCache();
    }
  });

  it("prints its ways on once, in the same words wherever a stop is printed", () => {
    // The command that met the stop is the surface the person is already
    // looking at, and it printed three of the four things the framework
    // knew -- sending them to look for the fourth in a record they had no
    // reason to know existed. One formatter, so the stderr line, the status
    // row and the terminal cannot spell the choices differently.
    const words = renderStop(
      { kind: "verification", code: "cap-unresolved", reason: "two findings cannot be shown remediated" },
      { session_number: 7, phase: "verify", engine: "cli" },
    );
    assert.ok(words.ways.length > 0);
    for (const choice of words.choices) {
      assert.ok(words.ways.includes(choice.label));
      assert.ok(words.ways.includes(choice.command));
      assert.ok(words.ways.includes(choice.cost));
    }
    assert.ok(words.text.endsWith(words.ways));
  });

  it("names its refusal from a closed vocabulary, or names none at all", () => {
    // The kind is the bound the loop met and four unlike things meet the
    // `verification` bound. The code is which of them it was, and it is
    // closed on purpose: a site that invented one would reach every
    // surface as an unrendered slug, which is the coarse-kind problem
    // again one level down. Absent stays legal -- it is what every run
    // written before this member carries, and what a stop whose kind says
    // everything still carries.
    const stopped = (code: unknown): unknown => ({
      ...RUN,
      stop: { kind: "verification", code, reason: "the dispute was refused", at: RUN.updated_at },
    });
    for (const code of ["no-verdict", "provider-unreachable", "reviewer-unreachable", "dispute-refused", "cap-unresolved", "cap-disputed", "cap-terminal-tree-moved", null]) {
      assert.equal(validateRun(stopped(code)).stop?.code ?? null, code);
    }
    assert.throws(() => validateRun(stopped("verification-went-wrong")), LedgerError);
    // And the kind alone is still a whole stop.
    const uncoded = { ...RUN, stop: { kind: "tests", reason: "red", at: RUN.updated_at } };
    assert.equal(validateRun(uncoded).stop?.code ?? null, null);
  });

  it("says progress resumed only once the phase has moved past the pause, with nothing in its place", () => {
    const paused = { stop: { kind: "tests", reason: "red", at: "2026-09-05T10:00:00-04:00" }, phase: "verify" };
    // No pause to move past.
    assert.equal(progressResumed({ stop: null, phase: "verify" }, { stop: null, phase: "land" }), false);
    // Cleared by the resume, but nothing has happened yet.
    assert.equal(progressResumed(paused, { stop: null, phase: "verify" }), false);
    // Replaced: the opposite of progress, however far the phase moved.
    assert.equal(
      progressResumed(paused, { stop: { kind: "land" }, phase: "land" }),
      false,
    );
    // Gone, and the loop is somewhere else.
    assert.equal(progressResumed(paused, { stop: null, phase: "land" }), true);
  });
});

describe("a job finished and nobody collected", () => {
  const job = { name: "verification", log: ".dabbler/runs/s91/driver/jobs/verification.log" };
  const exited = { state: "exited", exitCode: 4, endedAt: "2026-09-05T11:43:12.000Z" };

  it("is a job on the record whose poll says exited, under no stop -- and nothing else", () => {
    // Session 91: the status file held {exit: 4, ended_at} for three hours
    // while run.json kept naming the job and every surface said working.
    assert.deepEqual(uncollectedJob({ stop: null, job }, exited), {
      name: "verification",
      log: job.log,
      exit: 4,
      ended_at: "2026-09-05T11:43:12.000Z",
    });
    // Still running is the framework working; a stop is a row of its own
    // and ended the job under it; a vanished job is the driver's to report
    // as a stop when it collects; no job is the space between calls.
    assert.equal(uncollectedJob({ stop: null, job }, { state: "running" }), null);
    assert.equal(uncollectedJob({ stop: { kind: "tests" }, job }, exited), null);
    assert.equal(uncollectedJob({ stop: null, job }, { state: "vanished" }), null);
    assert.equal(uncollectedJob({ stop: null, job: null }, exited), null);
    // A status the runner did not stamp still reads as finished.
    assert.equal(uncollectedJob({ stop: null, job }, { state: "exited" })?.exit, null);
  });

  it("is worded once: the job, when and how it ended, nothing running, and who calls next", () => {
    const found = uncollectedJob({ stop: null, job }, exited);
    assert.ok(found);
    const pull = renderUncollected(found, { session_number: 91, phase: "verify", engine: "cli" });
    assert.match(pull, /^Session 091: the framework's job 'verification' finished at 2026-09-05T11:43:12.000Z \(exit 4\)/);
    assert.match(pull, /has not been collected\. Nothing is running/);
    assert.match(pull, /ask your AI to run `dabbler session next` in its chat/);
    assert.match(pull, /carries on from 'verify'/);
    // Under the push the driver's own poll would have collected it, so an
    // uncollected job means the drive is gone and a person restarts it.
    const push = renderUncollected(found, { session_number: 91, phase: "verify", engine: "claude-code" });
    // With its engine: `session drive` requires one, and the record has it.
    assert.match(push, /Next: you\. `dabbler session drive --engine claude-code` collects the result first/);
    // Never a claim the engine is working on it, in either mode.
    for (const words of [pull, push]) assert.doesNotMatch(words, /working/);
  });
});

describe("the lease on a run", () => {
  it("takes one past whatever stood, so two processes cannot both hold it", () => {
    assert.equal(nextLeaseEpoch(undefined), 2);
    assert.equal(nextLeaseEpoch(null), 2);
    assert.equal(nextLeaseEpoch(7), 8);
  });

  it("lets the holder save as often as it likes", () => {
    // The ordinary case: one driver, writing the run repeatedly through a
    // session. Equal epochs are the same process, not a contention.
    assert.equal(judgeLease(3, 3).refusal, null);
  });

  it("refuses a save from a process the lease moved past, naming both epochs", () => {
    // Two drivers wrote one run on 2026-09-02 and phases were skipped
    // silently. A save whose in-memory epoch is behind the file's is that
    // second driver: advancing state from its stale view would overwrite
    // what the holder wrote.
    const refusal = String(judgeLease(3, 4).refusal);
    assert.match(refusal, /another driver holds the lease \(epoch 4; this process took 3\)/);
    assert.match(refusal, /does not advance the run/);
  });

  it("says nothing about a disk epoch behind the caller's", () => {
    // That cannot happen without the file having been rewound, which is not
    // this fence's to judge -- and failing closed on it would stop a run for
    // a repair somebody made deliberately.
    assert.equal(judgeLease(4, 3).refusal, null);
  });
});

describe("whether a waiter has read what a session is waiting on", () => {
  const began = "2026-09-20T12:00:00.000Z";

  it("is a beacon stamped since the wait began, and nothing else", () => {
    // The question the second beta test could not answer: an instruction
    // unanswered for six hours says nothing about whether anybody ever
    // picked it up. No beacon and a beacon from BEFORE this wait are the
    // same answer -- no: a stamp left by the previous instruction must
    // never answer for this one.
    const root = tempDir("waiter-beacon-");
    assert.equal(waiterSeenSince(root, 1, began), false);
    mkdirSync(dirname(waiterPath(root, 1)), { recursive: true });
    const stamp = (at: string): void => {
      writeFileSync(waiterPath(root, 1), JSON.stringify({ pid: 1, at }));
    };
    stamp("2026-09-20T11:59:59.000Z");
    assert.equal(waiterSeenSince(root, 1, began), false);
    stamp("2026-09-20T12:00:01.000Z");
    assert.equal(waiterSeenSince(root, 1, began), true);
    // Presence is NOT the question: a waiter prints what it finds and
    // exits, so an hour later the same stamp still says the AI received it.
    assert.equal(waiterSeenSince(root, 1, began), true);
    // A wait that has not begun for the reader is not a wait it can answer.
    assert.equal(waiterSeenSince(root, 1, "not a time"), false);
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
