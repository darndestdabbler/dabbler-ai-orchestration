// Test evidence: the suite declaration, the digest of a covered surface,
// the run records and the freshness judgement, all from literal inputs.
// The enumeration of a surface (git) and the record's digest against a
// real tree are walked in walk-record.test.ts.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  RecordError,
  affectedSuites,
  digestOfEntries,
  freshnessVerdict,
  loadSuitesChecked,
  readRecords,
  recordRun,
  type SuiteSpec,
  type TestRunRecord,
} from "../src/testEvidence.ts";
import { gitAnswers, tempDir } from "./support/answers.ts";

const UNIT: SuiteSpec = { name: "unit", command: "npm test", covers: ["src/"], expensive: true, runsWhole: false };

describe("the digest of a covered surface", () => {
  it("tracks content rather than order or time, and every byte counts", () => {
    const a = digestOfEntries([["b.txt", Buffer.from("two")], ["a.txt", Buffer.from("one")]]);
    assert.equal(a, digestOfEntries([["a.txt", Buffer.from("one")], ["b.txt", Buffer.from("two")]]));
    assert.notEqual(a, digestOfEntries([["a.txt", Buffer.from("one ")], ["b.txt", Buffer.from("two")]]));
    assert.notEqual(a, digestOfEntries([["a.txt", Buffer.from("one")]]));
  });

  it("moves once for a deletion: an omitted entry is an omitted entry, never a marker", () => {
    // D170: `ls-files` still names a deleted tracked file, and a marker line
    // for it would leave the digest again when the deletion is committed.
    const without = digestOfEntries([["a.txt", Buffer.from("one")]]);
    assert.equal(digestOfEntries([["a.txt", Buffer.from("one")]]), without);
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
    ]);
  });

  it("reads no suites from no declaration and refuses one that is not a list", () => {
    assert.deepEqual(loadSuitesChecked({}), { suites: [], errors: [], ok: true });
    assert.deepEqual(loadSuitesChecked({ testing: { suites: {} } }).errors, ["testing.suites must be a list"]);
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
  const facts = (records: TestRunRecord[], current: string | null = "d1", tree = "t1"): Parameters<typeof freshnessVerdict>[1] => ({
    changed: ["src/a.ts"], current, records, currentTree: () => tree,
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
