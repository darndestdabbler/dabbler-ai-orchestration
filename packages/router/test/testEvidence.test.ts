// Test evidence: the suite declaration, the digest of a covered surface,
// the run records and the freshness judgement, all from literal inputs.
// The enumeration of a surface (git) and the record's digest against a
// real tree are walked in walk-record.test.ts.
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  RecordError,
  affectedSuites,
  closedSessionSeconds,
  digestOfEntries,
  freshnessVerdict,
  loadSuitesChecked,
  readRecords,
  recordRun,
  releaseTestsHold,
  runsWholeAtClose,
  wholeRunStandsForRelease,
  type SuiteSpec,
  type TestRunRecord,
} from "../src/testEvidence.ts";
import { TEST_OUTPUT_REL, spawnSuite } from "../src/cli/testEvidence.ts";
import { judgeFreshness } from "../src/gates.ts";
import { capture } from "../src/output.ts";
import { gitAnswers, tempDir } from "./support/answers.ts";

const UNIT: SuiteSpec = { name: "unit", command: "npm test", covers: ["src/"], expensive: true, runsWhole: false };

describe("the digest of a covered surface", () => {
  it("tracks content rather than order or time, and every byte counts", () => {
    const a = digestOfEntries([["b.txt", Buffer.from("two")], ["a.txt", Buffer.from("one")]]);
    assert.equal(a, digestOfEntries([["a.txt", Buffer.from("one")], ["b.txt", Buffer.from("two")]]));
    assert.notEqual(a, digestOfEntries([["a.txt", Buffer.from("one ")], ["b.txt", Buffer.from("two")]]));
    assert.notEqual(a, digestOfEntries([["a.txt", Buffer.from("one")]]));
  });

  it("is a function of the entries that remain, so a deletion moves it once and a marker could never move it again", () => {
    // D170: `ls-files` still names a deleted tracked file; the reader omits
    // it, and the digest of what remains is the digest an untouched tree of
    // those same files would carry -- there is nothing for a later commit of
    // the deletion to remove.
    const both = digestOfEntries([["a.txt", Buffer.from("one")], ["b.txt", Buffer.from("two")]]);
    const afterDeletingB = digestOfEntries([["a.txt", Buffer.from("one")]]);
    assert.notEqual(afterDeletingB, both);
    assert.equal(afterDeletingB, digestOfEntries([["a.txt", Buffer.from("one")]]));
  });
});

describe("the suite declaration", () => {
  it("reports every declaration error while still loading the suites that parse", () => {
    const loaded = loadSuitesChecked({
      testing: {
        suites: [
          { name: "unit", command: "npm test", covers: ["src/"], expensive: true },
          { name: "", command: "x", covers: [] },
          { name: "lint", covers: ["."] },
          { name: "e2e", command: "npx e2e", covers: "not a list" },
          { name: "extra", command: "x", covers: ["."], surprise: 1 },
          "not a mapping",
        ],
      },
    });
    assert.equal(loaded.ok, false);
    assert.deepEqual(loaded.suites.map((suite) => suite.name), ["unit", "extra"]);
    assert.deepEqual(loaded.errors, [
      "testing.suites[1].name must be a non-empty string",
      "testing.suites[2].command must be a non-empty string",
      "testing.suites[3].covers must be a list of path prefixes",
      "testing.suites[4] has unknown key(s) ['surprise']",
      "testing.suites[5] must be a mapping",
      // `extra` parses, is not expensive, and covers the whole repository,
      // which `unit`'s src/ does not reach.
      "testing.suites 'extra' is not expensive and covers '.', which no expensive suite covers: " +
        "its run would never be the run of record, and nothing would notice the run was missing. " +
        "Declare it expensive, or cover '.' from a suite that is.",
    ]);
  });

  it("reads no suites from no declaration and refuses one that is not a list", () => {
    assert.deepEqual(loadSuitesChecked({}), { suites: [], errors: [], ok: true });
    assert.deepEqual(loadSuitesChecked({ testing: { suites: {} } }).errors, ["testing.suites must be a list"]);
  });

  it("refuses a cheap suite alone over a path, by name, and accepts one beside an expensive suite that reaches it", () => {
    // The flag gates the run of record AND the gate that would notice the
    // run was missing: sessions 90 and 91 closed green over 1117 tests
    // nobody ran because the router's suite had kept `expensive: false`
    // from a tier session 88 retired.
    const alone = loadSuitesChecked({
      testing: { suites: [{ name: "quick", command: "npm run quick", covers: ["src/"] }] },
    });
    assert.equal(alone.ok, false);
    assert.equal(alone.errors.length, 1);
    assert.match(alone.errors[0] ?? "", /^testing\.suites 'quick' is not expensive and covers 'src\/'/);
    assert.match(alone.errors[0] ?? "", /never be the run of record/);
    const beside = loadSuitesChecked({
      testing: {
        suites: [
          { name: "full", command: "npm test", covers: ["src/", "tests/"], expensive: true },
          { name: "quick", command: "npm run quick", covers: ["src/lib/", "tests/"] },
        ],
      },
    });
    assert.equal(beside.ok, true, beside.errors.join("; "));
    assert.deepEqual(beside.suites.map((suite) => suite.name), ["full", "quick"]);
  });

  it("reads a suite's role and close obligation, ignores the module and against it once named, and refuses a role it does not know", () => {
    const loaded = loadSuitesChecked({
      testing: {
        suites: [
          { name: "model-unit", command: "dotnet test m", covers: ["modules/model/"], expensive: true, module: "model" },
          { name: "listener-model", command: "dotnet test c", covers: ["modules/listener/"], expensive: true, module: "listener", role: "consumer-contract", against: "model", required_for_close: false },
          { name: "loose", command: "dotnet test l", covers: ["."], expensive: true, role: "consumer-contract" },
        ],
      },
    });
    assert.equal(loaded.ok, true, loaded.errors.join("; "));
    assert.deepEqual(
      loaded.suites.map((suite) => [suite.name, suite.role, suite.requiredForClose, "module" in suite, "against" in suite]),
      [
        ["model-unit", "unit", true, false, false],
        ["listener-model", "consumer-contract", false, false, false],
        ["loose", "consumer-contract", true, false, false],
      ],
    );
    const refused = loadSuitesChecked({ testing: { suites: [{ name: "d", command: "x", covers: ["."], expensive: true, role: "smoke" }] } });
    assert.deepEqual(refused.errors, ["testing.suites[0].role must be one of unit, provider-contract, consumer-contract"]);
  });
});

describe("which suites a change affects", () => {
  it("intersects the change with each suite's covers and drops the session's own bookkeeping", () => {
    const docs: SuiteSpec = { ...UNIT, name: "docs", covers: ["docs/"] };
    const affected = affectedSuites(["src/a.ts", "docs/sessions/sessions.json", "docs/guide.md"], [UNIT, docs], {
      sessionsRel: "docs/sessions",
    });
    assert.deepEqual([...affected.entries()], [["unit", ["src/a.ts"]], ["docs", ["docs/guide.md"]]]);
  });
});

function record(overrides: Partial<TestRunRecord>): TestRunRecord {
  return {
    suite: "unit", command: "npm test", outcome: "passed", surfaceDigest: "d1", recordedAt: "2026-01-01T00:00:00+00:00",
    stage: "final-full", treeDigest: "", policy: "", policyReason: "", selectedTests: [], sessionNumber: null,
    detail: "", durationSeconds: 1, ...overrides,
  };
}

describe("judging a suite's freshness", () => {
  const facts = (records: TestRunRecord[], current: string | null = "d1", tree = "t1", driven = false): Parameters<typeof freshnessVerdict>[1] => ({
    changed: ["src/a.ts"], current, records, currentTree: () => tree, driven,
  });

  it("says what it measured and nothing about how to satisfy it while a driven session is in flight", () => {
    // The sample's engine read the gate's advice mid-session -- run the
    // suite, then record `--outcome passed` -- as an invitation the framework
    // itself would honour a phase later. The row still fails; only the
    // by-hand recipe is gone, in each of its three shapes.
    const none = freshnessVerdict(UNIT, facts([], "d1", "t1", true));
    assert.equal(none.passed, false);
    assert.match(none.reason, /no final-full run of record exists$/);
    const stale = freshnessVerdict(UNIT, facts([record({ surfaceDigest: "d0" })], "d1", "t1", true));
    assert.equal(stale.passed, false);
    assert.match(stale.reason, /PREDATES a change to the surfaces it covers$/);
    const moved = freshnessVerdict(UNIT, facts([record({ treeDigest: "t0" })], "d1", "t1", true));
    assert.equal(moved.passed, false);
    assert.match(moved.reason, /does not match$/);
    for (const verdict of [none, stale, moved]) {
      assert.doesNotMatch(verdict.reason, /test-evidence record|re-run|Re-run/i);
    }
  });

  it("fails closed when the surfaces could not be digested", () => {
    assert.match(freshnessVerdict(UNIT, facts([], null)).reason, /could not digest/);
  });

  it("refuses when no run of record exists, naming the command and the record to make, and never accepts a targeted run instead", () => {
    const none = freshnessVerdict(UNIT, facts([]));
    assert.equal(none.passed, false);
    assert.match(none.reason, /no final-full run of record exists; run `npm test` after your last code change/);
    assert.match(none.reason, /--suite unit --stage final-full --outcome passed/);
    const targeted = freshnessVerdict(UNIT, facts([record({ stage: "preverify-targeted" })]));
    assert.match(targeted.reason, /1 preverify-targeted record\(s\) are present; a targeted run precedes verification/);
  });

  it("refuses a record that predates a change to the surfaces it covers", () => {
    assert.match(freshnessVerdict(UNIT, facts([record({ surfaceDigest: "old" })])).reason, /PREDATES a change/);
  });

  it("refuses a fresh record whose outcome was red", () => {
    assert.match(freshnessVerdict(UNIT, facts([record({ outcome: "failed" })])).reason, /outcome is 'failed'/);
  });

  it("refuses a green record the tree moved under, and binds only when the record named a tree", () => {
    assert.match(freshnessVerdict(UNIT, facts([record({ treeDigest: "t0" })])).reason, /the tree moved under it/);
    assert.equal(freshnessVerdict(UNIT, facts([record({ treeDigest: "t1" })])).passed, true);
    assert.equal(freshnessVerdict(UNIT, facts([record({})])).passed, true);
  });

  it("passes a fresh green record and says when it was recorded, judging by the latest of the suite's records", () => {
    const verdict = freshnessVerdict(UNIT, facts([record({ surfaceDigest: "old" }), record({ recordedAt: "later" })]));
    assert.deepEqual(verdict, { suite: "unit", required: true, passed: true, reason: "fresh, green, recorded later", changedInputs: ["src/a.ts"] });
  });

  it("judges a suite run for information and never demands it", () => {
    // `required_for_close: false` on an expensive suite: it runs as the run
    // of record and its verdict is on the record, but a stale or red one
    // refuses nothing. The one flag used to mean both.
    const information: SuiteSpec = { ...UNIT, name: "integration", requiredForClose: false };
    const verdict = freshnessVerdict(information, facts([]));
    assert.equal(verdict.passed, false);
    assert.equal(verdict.required, false);
    assert.deepEqual(judgeFreshness([verdict]), [true, ""]);
    // Absent, the word means what `expensive` meant.
    assert.equal(freshnessVerdict(UNIT, facts([])).required, true);
  });
});

describe("whether a suite runs whole at the end of a session", () => {
  const SELECTING: SuiteSpec = { ...UNIT, select: "npm test -- {paths}" };
  const whole = (durationSeconds: number, sessionNumber = 7): TestRunRecord => record({ durationSeconds, sessionNumber });
  const HOUR = [3600, 3600, 3600, 3600, 3600];

  it("runs whole under the threshold, targeted past it, and whole with no earlier whole run or no way to select", () => {
    assert.deepEqual(
      closedSessionSeconds({
        sessions: [
          { status: "complete", startedAt: "2026-09-14T12:00:00.000000-04:00", completedAt: "2026-09-14T13:00:00.000000-04:00" },
          { status: "in-progress", startedAt: "2026-09-14T14:00:00.000000-04:00", completedAt: null },
        ],
      }),
      [3600],
    );
    // 5% of an hour is 180 seconds, and a minute is the floor.
    assert.equal(runsWholeAtClose(SELECTING, [whole(170)], HOUR, 8).whole, true);
    const past = runsWholeAtClose(SELECTING, [whole(200)], HOUR, 8);
    assert.equal(past.whole, false);
    assert.match(past.reason, /took 200s, past 180s/);
    assert.equal(runsWholeAtClose(SELECTING, [whole(59)], [], 8).whole, true);
    // The session's own whole run does not decide what it owed.
    assert.equal(runsWholeAtClose(SELECTING, [whole(200, 8)], HOUR, 8).whole, true);
    assert.equal(runsWholeAtClose(SELECTING, [], HOUR, 8).whole, true);
    assert.equal(runsWholeAtClose(UNIT, [whole(200)], HOUR, 8).whole, true);
  });

  it("accepts a targeted run of record over the same tree for a suite past the threshold, and neither kind in the other's place", () => {
    const facts = { changed: ["src/a.ts"], current: "d1", currentTree: () => "t1", driven: true };
    const targeted = record({ stage: "final-targeted", command: "npm test -- test/a.test.ts", treeDigest: "t1" });
    assert.equal(freshnessVerdict(UNIT, { ...facts, records: [targeted], wholeAtClose: false }).passed, true);
    assert.equal(freshnessVerdict(UNIT, { ...facts, records: [record({ treeDigest: "t1" })], wholeAtClose: false }).passed, false);
    assert.equal(freshnessVerdict(UNIT, { ...facts, records: [targeted], wholeAtClose: true }).passed, false);
    // A targeted run of record that selected nothing ran nothing, and satisfies the gate over the same tree.
    const nothing = record({ stage: "final-targeted", outcome: "none-selected", command: "", treeDigest: "t1" });
    assert.equal(freshnessVerdict(UNIT, { ...facts, records: [nothing], wholeAtClose: false }).passed, true);
    assert.equal(freshnessVerdict(UNIT, { ...facts, records: [{ ...nothing, treeDigest: "t0" }], wholeAtClose: false }).passed, false);
  });
});

describe("the whole run before a release", () => {
  const facts = (records: TestRunRecord[], tree = "t1"): Parameters<typeof wholeRunStandsForRelease>[1] => ({
    changed: [], current: "d1", records, currentTree: () => tree, driven: true,
  });

  it("runs none when a passing whole run stands against the tree, and names the run that proved it", () => {
    const verdict = wholeRunStandsForRelease(UNIT, facts([record({ treeDigest: "t1", sessionNumber: 7, recordedAt: "then" })]));
    assert.equal(verdict.passed, true);
    assert.equal(verdict.reason, "proved by the whole run recorded then by session 7");
  });

  it("runs the suite whole when it ran targeted since its last whole run, or the tree moved under that run", () => {
    const targeted = record({ stage: "final-targeted", command: "npm test -- test/a.test.ts", treeDigest: "t1", sessionNumber: 8 });
    const since = wholeRunStandsForRelease(UNIT, facts([record({ treeDigest: "t1", sessionNumber: 7 }), targeted]));
    assert.equal(since.passed, false);
    assert.match(since.reason, /ran targeted after its last whole run/);
    assert.equal(wholeRunStandsForRelease(UNIT, facts([record({ treeDigest: "t0" })])).passed, false);
  });

  it("holds the release on a red whole run after a targeted run of record, naming the suite, and on nothing else", () => {
    const targeted = [record({ stage: "final-targeted", command: "npm test -- test/a.test.ts", sessionNumber: 9 })];
    assert.equal(releaseTestsHold(targeted, 9), null);
    const red = [...targeted, record({ outcome: "failed", sessionNumber: 9 })];
    assert.match(String(releaseTestsHold(red, 9)), /^held by its tests: the whole unit run before the release failed/);
    assert.equal(releaseTestsHold([...targeted, record({ sessionNumber: 9 })], 9), null);
    // Another session's records hold nothing here.
    assert.equal(releaseTestsHold(red, 10), null);
  });
});

describe("the run record", () => {
  // The writer digests the covered surfaces through git: an empty listing
  // answers every question here.
  gitAnswers([
    [["-c", "core.quotepath=false", "ls-files"], { stdout: "" }],
    [["rev-parse", "--show-toplevel"], (_args, root) => ({ stdout: root.split("\\").join("/") })],
  ]);
  const options = { stage: "preverify-targeted", durationSeconds: 1.5, command: "npm test -- a", policy: "targeted" };

  it("is strict at the write boundary about outcome, stage and duration", () => {
    const root = tempDir();
    assert.throws(() => recordRun(root, UNIT, "green", { ...options, repoRoot: root }), /outcome must be one of/);
    assert.throws(() => recordRun(root, UNIT, "passed", { ...options, stage: "sometime", repoRoot: root }), /stage must be one of/);
    assert.throws(() => recordRun(root, UNIT, "passed", { ...options, durationSeconds: 0, repoRoot: root }), /duration_seconds must be a positive finite number, got 0\.0/);
  });

  it("requires a targeted record to name its command and its policy, and a final-full one to name neither", () => {
    const root = tempDir();
    assert.throws(() => recordRun(root, UNIT, "passed", { ...options, command: " ", repoRoot: root }), /must name the command that ran/);
    assert.throws(() => recordRun(root, UNIT, "passed", { ...options, policy: "whim", repoRoot: root }), /policy must be one of/);
    assert.throws(() => recordRun(root, UNIT, "passed", { stage: "final-full", durationSeconds: 1, command: "npm test", repoRoot: root }), /caller-supplied command does not apply/);
  });

  it("records that the selector ran and chose nothing without claiming a run, and refuses that as a run of record", () => {
    const root = tempDir();
    assert.throws(() => recordRun(root, UNIT, "none-selected", { ...options, repoRoot: root }), /names no command, because nothing ran/);
    assert.throws(
      () => recordRun(root, UNIT, "none-selected", { stage: "final-full", durationSeconds: 1, repoRoot: root }),
      /cannot be a run that did not happen/,
    );
    const row = recordRun(root, UNIT, "none-selected", { stage: "preverify-targeted", durationSeconds: 1, policy: "none-selected", repoRoot: root });
    assert.equal(row.outcome, "none-selected");
    assert.equal(readRecords(root).length, 1);
    // A targeted run of record that selected nothing is recorded with no command.
    assert.throws(
      () => recordRun(root, UNIT, "none-selected", { stage: "final-targeted", durationSeconds: 1, command: "npm test", repoRoot: root }),
      /names no command, because nothing ran/,
    );
    const nothing = recordRun(root, UNIT, "none-selected", { stage: "final-targeted", durationSeconds: 1, sessionNumber: 4, repoRoot: root });
    assert.deepEqual([nothing.stage, nothing.outcome, nothing.command], ["final-targeted", "none-selected", ""]);
  });

  it("writes the duration as the float it is, and reads back leniently, dropping a stage or policy it does not recognise", () => {
    const root = tempDir();
    recordRun(root, UNIT, "passed", { ...options, durationSeconds: 2, repoRoot: root });
    const path = join(root, ".dabbler", "runs", "test-runs.jsonl");
    mkdirSync(join(root, ".dabbler", "runs"), { recursive: true });
    writeFileSync(
      path,
      '{"suite": "unit", "surfaceDigest": "x", "stage": "someday", "policy": "whim", "durationSeconds": 2.0}\n{ not json\n{"suite": 3}\n',
      "utf8",
    );
    const [row] = readRecords(root);
    assert.equal(readRecords(root).length, 1);
    assert.equal(row.stage, "");
    assert.equal(row.policy, "");
    assert.equal(row.durationSeconds, 2);
    assert.ok(RecordError.name);
  });
});

describe("what a suite's run says while it runs", () => {
  /** A suite that prints `lines` and exits `code`, reached by a command that names `dotnet test`. */
  function fakeSuite(root: string, lines: readonly string[], code: number): string {
    const script = join(root, "suite.cjs");
    writeFileSync(
      script,
      `for (const line of ${JSON.stringify(lines)}) console.log(line);\nprocess.exit(${code});\n`,
      "utf8",
    );
    return `node "${script}"`;
  }

  // `dotnet test`'s own lines, from the operator's machine (see testOutput.test.ts).
  const RAN = [
    "  Determining projects to restore...",
    String.raw`Test run for D:\Projects\csv-parser\tests\CsvParser.Model.Tests\bin\Debug\net10.0\CsvParser.Model.Tests.dll (.NETCoreApp,Version=v10.0)`,
    String.raw`Test run for D:\Projects\csv-parser\tests\CsvParser.ConsoleApp.Tests\bin\Debug\net10.0\CsvParser.ConsoleApp.Tests.dll (.NETCoreApp,Version=v10.0)`,
    String.raw`No test is available in D:\Projects\csv-parser\tests\CsvParser.Model.Tests\bin\Debug\net10.0\CsvParser.Model.Tests.dll. Make sure that test discoverer & executors are registered and platform & framework version settings are appropriate and try again.`,
    "Passed!  - Failed:     0, Passed:     5, Skipped:     0, Total:     5, Duration: 30 ms - CsvParser.ConsoleApp.Tests.dll (net10.0)",
  ];

  it("is one line a project for a suite it can read, with the suite's own output kept whole beside it", async () => {
    const root = tempDir("suite-says-");
    const collected = await capture(() => spawnSuite(`${fakeSuite(root, RAN, 0)} dotnet test`, root, "dotnet-final-full"));
    assert.equal(collected.value, 0);
    assert.match(collected.stdout, /project-running project=CsvParser\.ConsoleApp\.Tests/);
    assert.match(collected.stdout, /project-no-tests project=CsvParser\.Model\.Tests/);
    assert.match(collected.stdout, /project-passed project=CsvParser\.ConsoleApp\.Tests pass=5 fail=0 not_run=0/);
    // What the runner said around its results stays out of the terminal and in the log it names.
    assert.doesNotMatch(collected.stdout, /Determining projects|test discoverer/);
    const named = /suite-output log=(\S+)/.exec(collected.stdout)?.[1] ?? "";
    assert.deepEqual(readFileSync(join(root, named), "utf8").split(/\r?\n/).filter(Boolean), RAN);
  });

  it("is the suite's own output, whole, when the run failed and no project it read did", async () => {
    // A build that never reached its tests: the lines that explain it are the ones no reader knows.
    const broke = ["  Determining projects to restore...", "Program.cs(4,1): error CS1002: ; expected"];
    const root = tempDir("suite-says-");
    const collected = await capture(() => spawnSuite(`${fakeSuite(root, broke, 1)} dotnet test`, root, "dotnet-final-full"));
    assert.equal(collected.value, 1);
    assert.match(collected.stdout, /error CS1002/);
  });

  it("keeps a suite it cannot read exactly as it was: the terminal is the suite's, and no log is kept", async () => {
    const root = tempDir("suite-says-");
    const collected = await capture(() => spawnSuite(fakeSuite(root, [], 3), root, "unit-final-full"));
    assert.equal(collected.value, 3);
    assert.equal(collected.stdout, "");
    assert.equal(existsSync(join(root, TEST_OUTPUT_REL)), false);
  });
});
