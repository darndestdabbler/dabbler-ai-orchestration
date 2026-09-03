// The drive loop's refusal vocabulary: whether a report answers the
// instruction it was handed, and whether it names exactly what the tree
// moved.
//
// Both are functions of a report, a step spec and a change set, so the tests
// hand them all three; the tree snapshot and the file probe are the readers
// the loop composes around them. The loop itself, driven from next to done,
// is walk-session.test.ts.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  MAX_REJECTIONS,
  judgeReportFiles,
  judgeReportShape,
  staleJobDisposition,
  stepChangedPaths,
  unchangedStepFiles,
  type StepSpec,
} from "../src/drive.ts";
import type { DriverInstruction, DriverReport } from "../src/generated/index.ts";

const INSTRUCTION = {
  schema_version: 1,
  seq: 4,
  kind: "step",
  session_number: 1,
  issued_at: "2026-09-01T10:00:00-04:00",
  step_id: "widget",
  ask: "Make the widget real.",
  answer_schema: "driver-report.schema.json",
  answer_command: "dabbler session report --seq 4 --step widget ...",
} as unknown as DriverInstruction;

const SPEC: StepSpec = {
  id: "widget",
  ask: "Make it.",
  files: ["src/widget.py"],
  checks: [{ argv: ["node", "--test"] }],
  fromPlan: true,
};

function report(overrides: Partial<DriverReport> = {}): DriverReport {
  return {
    schema_version: 1,
    seq: 4,
    session_number: 1,
    step_id: "widget",
    status: "done",
    files_changed: ["src/widget.py"],
    tests_run: null,
    notes: "made it real",
    reported_at: "2026-09-01T10:05:00-04:00",
    ...overrides,
  } as DriverReport;
}

/** The rule name a refusal carries, which is how the log and the words agree. */
function rules(reasons: string[] | "blocked" | "ok"): string[] {
  if (!Array.isArray(reasons)) return [];
  return reasons.map((reason) => /^\[([^\]]+)]/.exec(reason)?.[1] ?? reason);
}

describe("whether a report answers the instruction at all", () => {
  it("passes a report that answers the outstanding step", () => {
    assert.equal(judgeReportShape(report(), INSTRUCTION, SPEC), "ok");
  });

  it("refuses a step that was never answered, naming the command that answers it", () => {
    const refused = judgeReportShape(null, INSTRUCTION, SPEC);
    assert.deepEqual(rules(refused), ["no-report"]);
    assert.match(String((refused as string[])[0]), /dabbler session report --seq 4/);
  });

  it("refuses a report answering a different seq, or a different step", () => {
    assert.deepEqual(rules(judgeReportShape(report({ seq: 3 }), INSTRUCTION, SPEC)), [
      "report-seq",
    ]);
    assert.deepEqual(
      rules(judgeReportShape(report({ step_id: "other" }), INSTRUCTION, SPEC)),
      ["report-step"],
    );
  });

  it("reads blocked as an answer rather than as a refusal", () => {
    // The engine saying it cannot be done is a fact the loop acts on, not a
    // report it sends back.
    assert.equal(judgeReportShape(report({ status: "blocked" }), INSTRUCTION, SPEC), "blocked");
  });

  it("decides the shape before the tree is read at all", () => {
    // A report about something else cannot be measured against this change
    // set, so reading the tree to say so would be work spent on an answer
    // already known to be the wrong one. Both wrong at once, both named.
    assert.deepEqual(
      rules(judgeReportShape(report({ seq: 3, step_id: "other" }), INSTRUCTION, SPEC)),
      ["report-seq", "report-step"],
    );
  });
});

describe("whether the report names what the tree moved", () => {
  const present = (): boolean => true;
  const absent = (): boolean => false;

  it("passes when the two sets agree", () => {
    assert.deepEqual(judgeReportFiles(report(), ["src/widget.py"], present), []);
  });

  it("refuses a named file the tree did not change", () => {
    assert.deepEqual(rules(judgeReportFiles(report(), [], present)), [
      "files-changed-unchanged",
    ]);
  });

  it("tells an unchanged file from one that is not there at all", () => {
    assert.deepEqual(rules(judgeReportFiles(report(), [], absent)), [
      "files-changed-missing-file",
    ]);
  });

  it("refuses a change the report left out, naming the way out", () => {
    // A change made while the loop was stopped -- a repair somebody did by
    // hand -- belongs to no step, and reporting it inside one is what this
    // rule refuses. Session 66 met this and folded the repair into a step it
    // was not part of.
    const refused = judgeReportFiles(report(), ["src/widget.py", "src/other.py"], present);
    assert.deepEqual(rules(refused), ["files-changed-omits"]);
    assert.match(String(refused[0]), /dabbler session rebaseline/);
  });

  it("names every disagreement at once rather than one per round trip", () => {
    const refused = judgeReportFiles(
      report({ files_changed: ["src/named.py"] }),
      ["src/moved.py"],
      present,
    );
    assert.deepEqual(rules(refused), ["files-changed-unchanged", "files-changed-omits"]);
  });
});

describe("what belongs to a step and what does not", () => {
  it("leaves the ledger's own bookkeeping out of a step's change set", () => {
    // Written by the lifecycle on the way past: counting it would make every
    // step's report omit a file it never touched.
    const diff = [
      "src/widget.py",
      "docs/sessions/sessions.json",
      "docs/sessions/activity-log.json",
      "docs/sessions/session-plan.md",
    ];
    assert.deepEqual(stepChangedPaths(diff, "docs/sessions"), [
      "src/widget.py",
      "docs/sessions/session-plan.md",
    ]);
  });

  it("keeps a bookkeeping basename that lives somewhere else", () => {
    // The rule is a path under the sessions directory, not a file name: a
    // repository with its own `sessions.json` elsewhere still owns it.
    assert.deepEqual(stepChangedPaths(["src/sessions.json"], "docs/sessions"), [
      "src/sessions.json",
    ]);
  });

  it("passes over a step file the tree left byte-identical", () => {
    // The work can be done and the diff empty -- session 62's managed body,
    // where bootstrap rewrote two files with content identical to what
    // stood. Refusing made the step unanswerable.
    assert.deepEqual(
      unchangedStepFiles(SPEC, report({ files_changed: [] }), []),
      ["src/widget.py"],
    );
    // Named or moved, it is not one of these.
    assert.deepEqual(unchangedStepFiles(SPEC, report(), []), []);
    assert.deepEqual(
      unchangedStepFiles(SPEC, report({ files_changed: [] }), ["src/widget.py"]),
      [],
    );
  });
});

describe("what a running job of another name means", () => {
  it("reads a running job as this site being behind the walk", () => {
    assert.equal(
      staleJobDisposition("run of record: extension", "run of record: typescript", "running"),
      "behind",
    );
    // The job this phase asked for, whatever it is doing, is this phase's
    // own work to wait on rather than anything to clear.
    for (const status of ["running", "exited", "vanished"]) {
      assert.equal(staleJobDisposition("verification", "verification", status), "behind");
    }
  });

  it("reads an exited job of another name as stale, never as proof of completion", () => {
    // Sessions 78 and 81 both slid through the run of record and the close:
    // an uncollected verification job after an adjudication answered for
    // every later phase. Exited-and-mismatched must always read as stale.
    for (const status of ["exited", "vanished"]) {
      assert.equal(staleJobDisposition("verification", "close", status), "stale");
    }
  });
});

describe("how many times one step may be refused", () => {
  it("stops the session at three", () => {
    // A loop that refuses forever spends an engine's budget on the same
    // misunderstanding.
    assert.equal(MAX_REJECTIONS, 3);
  });
});
