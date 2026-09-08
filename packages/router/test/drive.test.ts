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
  REFUSE_START_REASON,
  REGISTER_COLLECT,
  REGISTER_CONTINUE,
  REGISTER_IDLE,
  REGISTER_REFUSE_START,
  REGISTER_START,
  idleInstruction,
  judgeRegistration,
  planModulesMember,
  judgeReportFiles,
  judgeReportShape,
  candidateTrunk,
  localGateReceipt,
  suiteRetrySeconds,
  staleJobDisposition,
  stepChangedPaths,
  suiteOwedElsewhere,
  unchangedStepFiles,
  type RegistrationFacts,
  type StepSpec,
} from "../src/drive.ts";
import { judgeFreshness } from "../src/gates.ts";
import type { DriverInstruction, DriverReport } from "../src/generated/index.ts";
import { type ImpactPlan, demandedByPlan } from "../src/impact.ts";
import { dependencyOrder, impliedDeployables, parseEntries } from "../src/modules.ts";
import { answerOwed, raiseRunOfRecordOwed, suitesOwedElsewhere } from "../src/owedDecisions.ts";
import { gitAnswers, seed, tempDir } from "./support/answers.ts";

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

describe("what a registration call is, from the facts it can read", () => {
  const facts = (over: Partial<RegistrationFacts> = {}): RegistrationFacts => ({
    engineNamed: false,
    inFlight: false,
    closing: false,
    pull: true,
    ...over,
  });

  it("refuses to start when an identity is named and nothing is in flight", () => {
    // The defect this session exists for. The extension hands the engine one
    // command line carrying --engine; an engine that re-runs it once after
    // `done` used to register and start the NEXT session unasked.
    assert.equal(
      judgeRegistration(facts({ engineNamed: true })),
      REGISTER_REFUSE_START,
    );
  });

  it("starts under a push, where registering is the launcher's job", () => {
    // `session drive` is how a person BEGINS work; the same facts under a
    // pull are an engine's leftover launch flags, not a request for a new
    // session. The mode is the whole difference between the two.
    assert.equal(
      judgeRegistration(facts({ engineNamed: true, pull: false })),
      REGISTER_START,
    );
  });

  it("continues the session in flight when an identity is named", () => {
    // Re-registering the session in flight under the same identity is silent
    // and idempotent, and is how a pull legitimately continues.
    assert.equal(
      judgeRegistration(facts({ engineNamed: true, inFlight: true })),
      REGISTER_CONTINUE,
    );
  });

  it("continues the session in flight when no identity is named", () => {
    assert.equal(judgeRegistration(facts({ inFlight: true })), REGISTER_CONTINUE);
  });

  it("is idle when nothing is named and nothing is in flight", () => {
    assert.equal(judgeRegistration(facts()), REGISTER_IDLE);
  });

  it("collects a standing close before anything else", () => {
    // Precedence, and it matters: registering underneath an uncollected close
    // would start the next session while this one's close is in flight.
    for (const over of [{}, { engineNamed: true }, { inFlight: true }]) {
      assert.equal(
        judgeRegistration(facts({ ...over, closing: true })),
        REGISTER_COLLECT,
      );
    }
  });

  it("names the door in when it refuses", () => {
    // The refusal has to say what to do instead, or it strands the loop it
    // just stopped.
    assert.match(REFUSE_START_REASON, /session start/);
  });
});

describe("what `next` answers when nothing is in flight", () => {
  it("is a done, so a loop told to run until done can end", () => {
    // The other half of the same defect: an engine that correctly dropped its
    // launch flags used to get a usage refusal, so both ways out of the
    // documented loop were wrong.
    const instruction = idleInstruction("2026-09-05T03:00:00-04:00");
    assert.equal(instruction.kind, "done");
    assert.equal(instruction.schema_version, 1);
  });

  it("names no session, because there is none", () => {
    // Every other kind carries a real session number; this is the only
    // instruction that can honestly name none.
    assert.equal(idleInstruction("2026-09-05T03:00:00-04:00").session_number, 0);
    assert.equal(idleInstruction("2026-09-05T03:00:00-04:00").seq, 0);
  });

  it("says how to begin the next one", () => {
    assert.match(String(idleInstruction("2026-09-05T03:00:00-04:00").ask), /session start/);
  });
});

describe("a drive binds the session it registered, and only that one", () => {
  it("registers once under a push, and continues rather than starting again", () => {
    // `withDriver` registers a driver once and that driver drives one
    // session, so the binding is structural. What this pins is the decision
    // underneath it: a second push call against a session already in flight
    // continues it -- it does not start session N+1.
    assert.equal(
      judgeRegistration({
        engineNamed: true,
        inFlight: true,
        closing: false,
        pull: false,
      }),
      REGISTER_CONTINUE,
    );
  });

  it("never starts a second session while a close is being collected", () => {
    // Sessions 78 and 81 both slid through the run of record because an
    // uncollected job answered for a later phase; registering underneath a
    // standing close is the same shape of mistake.
    assert.equal(
      judgeRegistration({
        engineNamed: true,
        inFlight: false,
        closing: true,
        pull: false,
      }),
      REGISTER_COLLECT,
    );
  });
});

describe("what the local gate receipt names", () => {
  it("names the branch HEAD is on, and refuses a detached HEAD rather than guessing", () => {
    // Three receipts in a repository whose trunk is `main` once named a
    // `master` that did not exist: the branch was a literal.
    const onMain = gitAnswers([
      [["rev-parse", "--abbrev-ref", "HEAD"], { stdout: "main" }],
      [["rev-parse", "HEAD"], { stdout: "0123456789abcdef0123456789abcdef01234567" }],
    ]);
    try {
      const local = localGateReceipt("/repo");
      assert.equal(local.refusal, null);
      assert.equal(local.receipt?.["branch"], "main");
      assert.equal(local.receipt?.["mode"], "local");
      assert.equal(local.receipt?.["tested_sha"], "0123456789abcdef0123456789abcdef01234567");
      assert.equal(local.receipt?.["base_sha"], local.receipt?.["tested_sha"]);
    } finally {
      onMain();
    }
    const detached = gitAnswers([[["rev-parse", "--abbrev-ref", "HEAD"], { stdout: "HEAD" }]]);
    try {
      const local = localGateReceipt("/repo");
      assert.equal(local.receipt, null);
      assert.match(String(local.refusal), /detached/);
    } finally {
      detached();
    }
  });

  it("names a run-of-record wait from the suite's last recorded duration, within a floor and the old ceiling", () => {
    // csv-model's four-second suite was told to wait sixty, every time.
    const row = (suite: string, durationSeconds: number | null) => ({ suite, durationSeconds });
    assert.equal(suiteRetrySeconds([row("dotnet", 4)], "dotnet"), 10);
    assert.equal(suiteRetrySeconds([row("dotnet", 17)], "dotnet"), 22);
    assert.equal(suiteRetrySeconds([row("dotnet", 600)], "dotnet"), 60);
    assert.equal(suiteRetrySeconds([], "dotnet"), 60);
    // The newest row for the suite counts; another suite's and an undated one do not.
    assert.equal(
      suiteRetrySeconds([row("dotnet", 40), row("node", 4), row("dotnet", 16), row("dotnet", null)], "dotnet"),
      20,
    );
  });

  it("gates a candidate onto the branch HEAD is on, never onto a literal master", () => {
    // Both candidate-mode sites read `origin/master` as a literal; a `main`
    // repository would have polled a ref that does not exist and stopped.
    const onMain = gitAnswers([[["rev-parse", "--abbrev-ref", "HEAD"], { stdout: "main" }]]);
    try {
      assert.deepEqual(candidateTrunk("/repo"), { trunk: "main", refusal: null });
    } finally {
      onMain();
    }
    const detached = gitAnswers([[["rev-parse", "--abbrev-ref", "HEAD"], { stdout: "HEAD" }]]);
    try {
      const read = candidateTrunk("/repo");
      assert.equal(read.trunk, null);
      assert.match(String(read.refusal), /detached/);
    } finally {
      detached();
    }
  });
});

describe("a reached suite whose tests are not in this folder", () => {
  it("is owed to its module's session rather than run, and the close here is not held to it", () => {
    // The proof of 2026-09-08: the run of record ran app's suite in model's
    // folder, where app's tests are not, and handed the AI a fix step it
    // could only refuse, twice, into a deadlock.
    const root = tempDir("owed-");
    seed(root, {
      ".dabbler/checkout.json": JSON.stringify({ slug: "persister", origin: "../remote.git", cone: [], madeAt: "now" }),
      "modules/persister/tests/Store.Tests.cs": "",
    });
    const plan = {
      multi: true,
      changedModules: ["persister"],
      suites: [
        { name: "persister-unit", module: "persister", role: "unit", against: null, reason: "module-changed", via: "persister" },
        { name: "listener-against-persister", module: "listener", role: "consumer-contract", against: "persister", reason: "consumer-contract", via: "persister" },
      ],
      candidates: ["persister"],
      unowned: [],
    } as unknown as ImpactPlan;
    const scopes = [
      { suite: "persister-unit", roots: ["modules/persister/tests"], glob: "*.Tests.cs" },
      { suite: "listener-against-persister", roots: ["modules/listener/tests"], glob: "*.cs" },
    ];
    const own = { name: "persister-unit", module: "persister" };
    const sibling = { name: "listener-against-persister", module: "listener" };
    // The folder's own suite runs here; the sibling's, whose tests are not
    // on this disk, is owed to the sibling's session.
    assert.equal(suiteOwedElsewhere(root, own, plan, scopes), null);
    assert.equal(suiteOwedElsewhere(root, sibling, plan, scopes), "listener");
    // Not in a focused folder, and not a suite that declares no test roots.
    assert.equal(suiteOwedElsewhere(tempDir("repo-"), sibling, plan, scopes), null);
    assert.equal(suiteOwedElsewhere(root, sibling, plan, []), null);
    // With the tests on this disk after all, it runs here.
    seed(root, { "modules/listener/tests/Compatibility.cs": "" });
    assert.equal(suiteOwedElsewhere(root, sibling, plan, scopes), null);

    // Recorded as owed, with the module on the row, and the close here does
    // not demand a record that cannot exist here; without the record it would.
    const row = raiseRunOfRecordOwed(root, 3, sibling.name, "listener");
    assert.equal(row?.["module"], "listener");
    assert.deepEqual([...suitesOwedElsewhere(root, 3)], [sibling.name]);
    const verdicts = [
      { suite: own.name, required: true, passed: true, reason: "fresh", changedInputs: [] },
      { suite: sibling.name, required: true, passed: false, reason: "no record", changedInputs: [] },
    ];
    assert.deepEqual(judgeFreshness(demandedByPlan(verdicts, plan, suitesOwedElsewhere(root, 3))), [true, ""]);
    assert.match(judgeFreshness(demandedByPlan(verdicts, plan))[1], /listener-against-persister/);
    // Accepting the recommendation keeps the suite owed elsewhere: the
    // close must not get back the demand the decision was raised to lift.
    answerOwed(root, String(row?.["id"]), "Owed to listener's session", 3);
    assert.deepEqual([...suitesOwedElsewhere(root, 3)], [sibling.name]);
    // The other answer puts it back on this session's close.
    const other = raiseRunOfRecordOwed(root, 3, "listener-unit", "listener");
    answerOwed(root, String(other?.["id"]), "Run it in the repository now", 3);
    assert.deepEqual([...suitesOwedElsewhere(root, 3)], [sibling.name]);
  });
});

describe("what the plan instruction asks for", () => {
  it("names the modules member in a multi-module solution, and nothing in a single-module one", () => {
    // The Java walk: driver.ts refuses a declaration that names no module,
    // and the instruction listing the members a plan carries never
    // mentioned it. An engine answering what it was asked for was refused,
    // and the second identical refusal is a deadlock.
    const entries = parseEntries({
      modules: [
        { slug: "model", kind: "shared-types" },
        { slug: "store" },
        { slug: "app", kind: "application", dependsOn: ["store"] },
      ],
    });
    const many = planModulesMember({
      multi: true,
      implicit: false,
      modules: dependencyOrder(entries),
      deployables: impliedDeployables(entries),
    });
    assert.match(many, /modules {5}the module\(s\) this session works in/);
    assert.match(many, /Declared here: model, store, app/);
    assert.match(many, /reason {6}why this session must change more than one module/);

    const one = parseEntries({ modules: [{ slug: "only" }] });
    assert.equal(
      planModulesMember({ multi: false, implicit: false, modules: one, deployables: impliedDeployables(one) }),
      "",
    );
  });
});
