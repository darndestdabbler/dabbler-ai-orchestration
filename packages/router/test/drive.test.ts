// The drive loop's refusal vocabulary: whether a report answers the
// instruction it was handed, and whether it names exactly what the tree
// moved.
//
// Both are functions of a report, a step spec and a change set, so the tests
// hand them all three; the tree snapshot and the file probe are the readers
// the loop composes around them. The loop itself, driven from next to done,
// is walk-session.test.ts.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, it } from "node:test";

import { instructionPath, reportPath } from "../src/driver.ts";
import {
  MAX_REJECTIONS,
  REFUSE_START_REASON,
  REGISTER_COLLECT,
  REGISTER_CONTINUE,
  REGISTER_IDLE,
  REGISTER_REFUSE_START,
  REGISTER_START,
  alreadyRewoundFor,
  disputedFindingsBrief,
  idleInstruction,
  judgeRegistration,
  rewindFromPackaging,
  COMMIT_SUBJECT_WIDTH,
  landCommitMessage,
  judgeReportFiles,
  judgeReportShape,
  reportIsSpent,
  localGateReceipt,
  namedTestCommands,
  overdueMultiple,
  owedInstruction,
  reportedFiles,
  suiteRetrySeconds,
  staleJobDisposition,
  stepChangedPaths,
  unchangedStepFiles,
  type RegistrationFacts,
  type StepSpec,
} from "../src/drive.ts";
import { rewindPhaseFor } from "../src/gates.ts";
import { capDisputedRefusal } from "../src/verify/rounds.ts";
import type { DriverInstruction, DriverReport } from "../src/generated/index.ts";
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

describe("the instruction owed an answer, which `session wait` prints", () => {
  function writeInstruction(root: string, instruction: DriverInstruction): void {
    mkdirSync(dirname(instructionPath(root, 1)), { recursive: true });
    writeFileSync(instructionPath(root, 1), JSON.stringify(instruction));
  }

  it("is owed to every reader until a report carries its seq, and then the next one is", () => {
    const root = tempDir("owed-");
    writeInstruction(root, INSTRUCTION);
    // Nothing is consumed: a second waiter is owed the same instruction.
    assert.equal(owedInstruction(root, 1)?.seq, 4);
    assert.equal(owedInstruction(root, 1)?.seq, 4);
    // A later report is not this instruction's answer.
    writeFileSync(reportPath(root, 1), JSON.stringify(report({ seq: 5 })));
    assert.equal(owedInstruction(root, 1)?.seq, 4);
    writeFileSync(reportPath(root, 1), JSON.stringify(report({ seq: 4 })));
    assert.equal(owedInstruction(root, 1), null);
    writeInstruction(root, { ...INSTRUCTION, seq: 5 });
    assert.equal(owedInstruction(root, 1)?.seq, 5);
  });
});

describe("when an outstanding instruction is recorded as overdue", () => {
  it("is nothing before the threshold, once per multiple past it, and never the same multiple twice", () => {
    const issued = Date.parse("2026-09-15T10:00:00Z");
    const at = (seconds: number): number => issued + seconds * 1000;
    assert.equal(overdueMultiple(issued, at(1800), 1800, 0), null);
    assert.equal(overdueMultiple(issued, at(1801), 1800, 0), 1);
    assert.equal(overdueMultiple(issued, at(2500), 1800, 1), null);
    assert.equal(overdueMultiple(issued, at(3601), 1800, 1), 2);
  });
});

describe("the files a report stands for", () => {
  it("is the diff when the report named none, and the report's own list when it named some", () => {
    const changed = ["src/widget.py", "tests/test_widget.py"];
    assert.deepEqual(reportedFiles(report({ files_changed: [], files_from_diff: true }), changed), changed);
    // A report that names files is still held to them: omitting a change is refused.
    const named = report({ files_changed: ["src/widget.py"] });
    assert.deepEqual(reportedFiles(named, changed), ["src/widget.py"]);
    assert.equal(judgeReportFiles(named, changed, () => true).length, 1);
    // The flag does not excuse a list: a flagged report that names files is judged on them.
    const flaggedAndNamed = report({ files_changed: ["src/widget.py"], files_from_diff: true });
    assert.deepEqual(reportedFiles(flaggedAndNamed, changed), ["src/widget.py"]);
  });
});

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

  it("refuses a report ahead of the instruction, or for a different step", () => {
    assert.deepEqual(rules(judgeReportShape(report({ seq: 5 }), INSTRUCTION, SPEC)), [
      "report-seq",
    ]);
    assert.deepEqual(
      rules(judgeReportShape(report({ step_id: "other" }), INSTRUCTION, SPEC)),
      ["report-step"],
    );
  });

  it("reads a report that answered an earlier instruction as no report at all", () => {
    // It was judged when it was written and is on disk only because nothing
    // removes it; charging a refusal for it charges the engine for a report
    // it did not write.
    assert.ok(reportIsSpent(report({ seq: 3 }), INSTRUCTION));
    assert.deepEqual(rules(judgeReportShape(report({ seq: 3 }), INSTRUCTION, SPEC)), ["no-report"]);
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
      rules(judgeReportShape(report({ seq: 5, step_id: "other" }), INSTRUCTION, SPEC)),
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

describe("the tests a step's change runs", () => {
  it("names the selecting suite's command for the tests named after the changed source, and nothing for a suite with no select or a change no test is named after", () => {
    const repo = tempDir();
    seed(repo, { "src/widget.py": "x\n", "tests/test_widget.py": "x\n", "tests/check_widget.py": "x\n" });
    const config = {
      testing: {
        suites: [
          { name: "unit", command: "node tests/run.mjs", covers: ["src/"], expensive: true, test_roots: ["tests"], test_glob: "test_*.py", test_name: "test_{name}.py", select: "node tests/run.mjs {paths}" },
          { name: "integration", command: "node tests/all.mjs", covers: ["src/"], expensive: true, test_roots: ["tests"], test_glob: "check_*.py", test_name: "check_{name}.py" },
        ],
      },
    };
    assert.deepEqual(namedTestCommands(repo, config, ["src/widget.py"]), [
      { suite: "unit", command: "node tests/run.mjs tests/test_widget.py" },
    ]);
    assert.deepEqual(namedTestCommands(repo, config, ["docs/notes.md"]), []);
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

  // `candidateTrunk` was asserted here against a scripted git, on the
  // reading it no longer makes: HEAD alone. It reads `resolveTrunk` now --
  // HEAD *when origin has it* -- and the ref it hands the poll has to be one
  // that can actually move, which is a fact about a real remote and not
  // about a script. The assertion lives in walk-git-states.test.ts, over a
  // real origin, beside the receipt's deliberate exception.
});

describe("a publish refused on an earlier phase's evidence", () => {
  it("goes back to the phase that makes it, and stops when no phase can", () => {
    // Session 137's own packaging record, both shapes it holds. The second
    // attempt was refused with verification_clean, working_tree_clean and
    // test_run_fresh all false; the third with every gate green and the tag
    // simply not on origin. The driver stayed at `publish` for both, and the
    // recovery from the first was done by hand -- verify, both suites,
    // test-evidence record twice, commit, push -- which is exactly the set
    // the managed body tells an engine are not its to run.
    const staleEvidence = [
      {
        outcome: "refused",
        gates: [
          { name: "verification_clean", passed: false },
          { name: "working_tree_clean", passed: false },
          { name: "pushed_to_remote", passed: true },
          { name: "test_run_fresh", passed: false },
          { name: "owed_decisions", passed: true },
          { name: "verdict_vocabulary", passed: true },
        ],
      },
    ];
    // The EARLIEST of the three, not the last one read: a tree that moved
    // after verification invalidates the suite and the push as well, and
    // rewinding only to the land would carry the stale round into the close.
    assert.equal(rewindFromPackaging(staleEvidence), "verify");
    assert.equal(rewindPhaseFor(staleEvidence[0]?.gates ?? []), "verify");

    // Every gate green and the refusal about the tag: no phase remakes that,
    // so there is nothing to rewind to and the run stops.
    const tagAbsent = [
      {
        outcome: "refused",
        gates: [
          { name: "verification_clean", passed: true },
          { name: "working_tree_clean", passed: true },
          { name: "pushed_to_remote", passed: true },
          { name: "test_run_fresh", passed: true },
        ],
      },
    ];
    assert.equal(rewindFromPackaging(tagAbsent), null);

    // Nor do the gates no phase owns: an owed decision is a person's to
    // answer and a verdict's vocabulary is the verifier's, so a publish
    // refused on either stops rather than looping through a phase that
    // cannot change them.
    assert.equal(
      rewindFromPackaging([
        { outcome: "refused", gates: [{ name: "owed_decisions", passed: false }] },
      ]),
      null,
    );

    // The LAST row, because a session may be refused, fixed and refused
    // again, and what is to be remade is what failed this time.
    assert.equal(rewindFromPackaging([...staleEvidence, ...tagAbsent]), null);
    assert.equal(rewindFromPackaging([...tagAbsent, ...staleEvidence]), "verify");

    // A record with nothing in it, and a row from before gates were written
    // into it, are both "nothing to rewind to" rather than a crash.
    assert.equal(rewindFromPackaging([]), null);
    assert.equal(rewindFromPackaging([{ outcome: "refused" }]), null);

    // The suite alone sends it to the run of record, and the tree or the
    // push alone to the land.
    assert.equal(rewindPhaseFor([{ name: "test_run_fresh", passed: false }]), "run-of-record");
    assert.equal(rewindPhaseFor([{ name: "pushed_to_remote", passed: false }]), "land");
    assert.equal(rewindPhaseFor([{ name: "working_tree_clean", passed: false }]), "land");
    // And a gate that passed is not a reason to go anywhere.
    assert.equal(rewindPhaseFor([{ name: "verification_clean", passed: true }]), null);
  });

  it("goes back once per refusal, and stops rather than remaking the same evidence forever", () => {
    // A rewind throws no Stop, so `stop_history` gains no row: nothing else
    // notices a rewind that fixes nothing. Without this bound the loop
    // would return to the publish phase unchanged and go round for as long
    // as anyone kept calling `next`, paying for a verification round or a
    // whole suite each time.
    const stale =
      "the packaging run did not publish: step (f) runs after (e), and the evidence " +
      "for the earlier steps is not there: verification_clean: the working tree changed";
    const tag =
      "the packaging run did not publish: vsix-v2.0.15 is on origin but names an " +
      "earlier commit";

    // Nothing gone back for yet.
    assert.equal(alreadyRewoundFor([], stale), false);
    assert.equal(alreadyRewoundFor(null, stale), false);
    assert.equal(alreadyRewoundFor(undefined, stale), false);

    // Once the run has been sent back for it, going back again would not
    // fix what going back did not fix.
    const rewinds = [{ to: "verify", reason: stale, at: "2026-09-09T11:00:00-04:00" }];
    assert.equal(alreadyRewoundFor(rewinds, stale), true);
    // A different refusal is a different problem, and going back for it is
    // progress by the same definition the classifier reads.
    assert.equal(alreadyRewoundFor(rewinds, tag), false);
    assert.equal(
      alreadyRewoundFor([...rewinds, { to: "land", reason: tag, at: "later" }], tag),
      true,
    );
  });
});

describe("the question a standing dispute puts to the operator", () => {
  const ROUND = {
    round: 2,
    findings: [
      { severity: "major", blocking: true, description: "the widget is unreachable", evidencePaths: ["src/widget.ts"] },
      { severity: "minor", blocking: false, description: "a stale comment" },
    ],
  };
  const DISPUTES = [
    {
      round: 2,
      finding_index: 0,
      grounds: "the call site is the extension's, and the test covers it",
      evidence_paths: ["packages/router/test/widget.test.ts:12-40"],
    },
  ];

  it("carries the finding, the grounds and what the argument cites, and judges none of it", () => {
    // The operator is the tie-break between a verifier and an engine, and
    // until now they were told to "put it right" over a stop whose reason
    // named neither the finding nor the argument against it.
    const brief = disputedFindingsBrief(ROUND, DISPUTES);
    assert.match(brief, /1 dispute\(s\) standing over round 2/);
    assert.match(brief, /\[0\] major, blocking: the widget is unreachable/);
    assert.match(brief, /Disputed on: the call site is the extension's/);
    assert.match(brief, /Citing: packages\/router\/test\/widget\.test\.ts:12-40/);
    // The finding nobody disputed is not the question, and no word here
    // says which way the tie-break should go.
    assert.doesNotMatch(brief, /stale comment/);
    assert.doesNotMatch(brief, /UPHOLD|OVERRULE|should be|recommend/);
  });

  it("says nothing where nothing is disputed, or where the disputes belong to another round", () => {
    assert.equal(disputedFindingsBrief(ROUND, []), "");
    assert.equal(disputedFindingsBrief(ROUND, [{ ...DISPUTES[0]!, round: 1 }]), "");
  });

  it("is put in the words `verify` itself refuses in, from one sentence rather than two", () => {
    // The driver reads this state off the record before it spawns anything,
    // and `verify` run by hand reads it too. Two spellings of one refusal
    // is how a session ends up between two verbs that each name the other.
    const refusal = capDisputedRefusal("docs/sessions", 3, 2);
    assert.match(refusal, /the cap \(3\) is reached and round 2 carries disputed blocking finding\(s\)/);
    assert.match(refusal, /judged rather than terminated/);
    assert.match(refusal, /dabbler verify adjudicate --sessions-dir docs\/sessions/);
  });
});

describe("the landed commit's message", () => {
  it("puts the session's title in a subject under the width and the whole task in the body", () => {
    // The sample's first land had a 770-character subject: the task
    // paragraph on one line, which `git log --oneline` wrapped and every
    // hosting UI truncated.
    const task =
      "Session 1 authors the solution plan from the brief, declares the four modules " +
      "the console app is built from, and leaves the placeholder entry removed by hand.";
    const message = landCommitMessage(1, "Author or import the solution plan", task);
    assert.equal(message.subject, "Session 1: Author or import the solution plan");
    assert.ok(message.subject.length < COMMIT_SUBJECT_WIDTH);
    assert.equal(message.body, task);
    // No title on the row: the task's first line stands in, and is still cut
    // at the width, because the body carries the paragraph anyway.
    const untitled = landCommitMessage(12, null, task);
    assert.ok(untitled.subject.startsWith("Session 12: Session 1 authors"));
    assert.ok(untitled.subject.length <= COMMIT_SUBJECT_WIDTH);
    assert.equal(untitled.body, task);
  });
});
