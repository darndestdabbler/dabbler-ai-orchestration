// The driver's contract: four answer shapes the framework acts on, the
// ledger that holds them, and the one verb an engine has to write into it.
//
// What is asserted is the refusals -- the schemas are the meaning, and a
// schema is proven by what it will not admit. One refusal per schema, the
// verb's own boundary, and the reader's refusal of a report somebody typed.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { sessionVerb } from "../src/cli/session.ts";
import {
  readDispositions,
  readReport,
  reportPath,
  validateDispositions,
  validateInstruction,
  validateReport,
  validateWorkPlan,
  writeDispositions,
  writeInstruction,
} from "../src/driver.ts";
import { LedgerError, appendRound } from "../src/ledger.ts";
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

    // A well-formed report with a verdict smuggled in beside it.
    writeFileSync(path, JSON.stringify({ ...REPORT, verdict: "VERIFIED" }), "utf8");
    expect(() => readReport(repo, 1)).toThrow(/driver report failed schema validation/);

    // Not JSON at all.
    writeFileSync(path, "done\n", "utf8");
    expect(() => readReport(repo, 1)).toThrow(/is not valid JSON/);
  });
});
