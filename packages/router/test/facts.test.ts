// `facts` -- the deterministic pass a round runs before it buys a verifier.
//
// The vocabulary is what these check. Four words, and the two that are not
// `pass` carry the weight: a control nobody declared and a control that
// could not be launched must never look like a control that ran and was
// green. The controls that really spawn, and the evidence bundle over a
// real diff, are walked in walk-record.test.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  CONTROL_TIMEOUT_SECONDS,
  DEFAULT_DIFF_EXCLUDES,
  EvidenceTooLargeError,
  STATUS_FAIL,
  STATUS_NOT_APPLICABLE,
  STATUS_PASS,
  STATUS_UNKNOWN,
  appendFacts,
  buildDiffPathspecs,
  changedLines,
  checkEvidenceCap,
  controlFact,
  controlFactRed,
  factRecord,
  factRecordToDict,
  factsPath,
  loadControlsChecked,
  parseChangedLines,
  redFactsRefusal,
} from "../src/facts.ts";
import { gitAnswers, tempDir } from "./support/answers.ts";

const CAP_ENV = "AI_ROUTER_VERIFY_MAX_EVIDENCE_CHARS";

describe("the diff pathspecs", () => {
  it("excludes each pattern at any depth, names the lifecycle files, and gives a glob no /** twin", () => {
    // The anchored form missed `tools/x/dist`, which is the incident this
    // shape exists for; and the session's own record is not its work.
    const pathspecs = buildDiffPathspecs();
    assert.equal(pathspecs[0], ".");
    assert.ok(pathspecs.includes(":(exclude,glob)**/dist"));
    assert.ok(pathspecs.includes(":(exclude,glob)**/dist/**"));
    assert.ok(pathspecs.includes(":(exclude,glob)**/sessions.json"));
    assert.ok(pathspecs.includes(":(exclude,glob)**/*.vsix"));
    assert.ok(!pathspecs.includes(":(exclude,glob)**/*.vsix/**"));
    assert.ok(DEFAULT_DIFF_EXCLUDES.includes(".dabbler"));
  });
});

describe("the evidence cap", () => {
  it("refuses over the cap and names the variable that raises it, and falls back when the variable is not an integer", () => {
    process.env[CAP_ENV] = "10";
    try {
      assert.throws(() => checkEvidenceCap("x".repeat(11)), EvidenceTooLargeError);
      assert.throws(() => checkEvidenceCap("x".repeat(11)), /evidence bundle is 11 chars \(cap 10\)/);
      process.env[CAP_ENV] = "600k";
      assert.doesNotThrow(() => checkEvidenceCap("x".repeat(1000)));
    } finally {
      delete process.env[CAP_ENV];
    }
  });
});

describe("the changed lines", () => {
  it("counts only what the diff adds, numbered in the post-image, and attributes nothing to a deleted file", () => {
    const diff = ["--- a/one.py", "+++ b/one.py", "@@ -1,2 +1,3 @@", " keep", "+added", "+also", "@@ -10,2 +12,0 @@", "-gone", "-gone too"].join("\n");
    assert.deepEqual(parseChangedLines(diff), { "one.py": [1, 2, 3] });
    assert.deepEqual(parseChangedLines(["--- a/gone.py", "+++ /dev/null", "@@ -1,2 +0,0 @@", "-x"].join("\n")), {});
  });

  it("answers null when git cannot measure, never an empty change set", () => {
    const restore = gitAnswers([[() => true, { code: 128, stderr: "not a git repository" }]]);
    try {
      assert.equal(changedLines(tempDir()), null);
    } finally {
      restore();
    }
  });
});

describe("the control declarations", () => {
  it("reports every error rather than the first, loading what parsed", () => {
    // A control lost to a typo and a control never declared both end up
    // `not_applicable`; only the error list tells them apart.
    const loaded = loadControlsChecked({
      testing: {
        controls: [
          { kind: "compile", command: "true", extra: 1 },
          { kind: "nonsense", command: "true" },
          { kind: "lint", command: "  " },
          { kind: "compile", command: "twice" },
          "not a mapping",
        ],
      },
    });
    assert.deepEqual(loaded.errors, [
      "testing.controls[0] has unknown key(s) ['extra']",
      "testing.controls[1].kind must be one of ['compile', 'typecheck', 'lint', 'analyzer']",
      "testing.controls[2].command must be a non-empty string",
      "testing.controls[3].kind 'compile' is declared more than once",
      "testing.controls[4] must be a mapping",
    ]);
    assert.deepEqual(loaded.controls.map((spec) => spec.kind), ["compile"]);
    assert.deepEqual(loadControlsChecked({ testing: { controls: {} } }).errors, ["testing.controls must be a list"]);
  });

  it("has a timeout, so a hung control cannot wedge every round", () => {
    assert.equal(CONTROL_TIMEOUT_SECONDS, 600);
  });
});

describe("what counts as red", () => {
  it("is a required control on anything but green, UNKNOWN included", () => {
    // The author is the only one who can turn "the tool did not run" into
    // an answer, and a verifier cannot.
    assert.equal(controlFactRed(controlFact("lint", STATUS_UNKNOWN, "x", true)), true);
    assert.equal(controlFactRed(controlFact("lint", STATUS_FAIL, "x", true)), true);
    assert.equal(controlFactRed(controlFact("lint", STATUS_FAIL, "x", false)), false);
    assert.equal(controlFactRed(controlFact("lint", STATUS_NOT_APPLICABLE, "", true)), false);
  });

  it("says nothing when nothing is red, and returns the red rows to their author with the prefix it was given", () => {
    assert.equal(redFactsRefusal(factRecord({ controls: [] })), "");
    const refusal = redFactsRefusal(
      factRecord({ controls: [controlFact("lint", STATUS_UNKNOWN, "ruff check", true, "gone\nmore")] }),
      "verify step close",
    );
    assert.match(refusal, /verify step close: refused -- 1 required deterministic control\(s\) are not green:/);
    assert.ok(refusal.includes("  lint       UNKNOWN        ruff check"), refusal);
    assert.ok(refusal.includes("\n              gone\n"), refusal);
    assert.doesNotMatch(refusal, /more/);
  });
});

describe("the record", () => {
  it("carries counts rather than line numbers, omits what is absent, and tells an unmeasurable change set from an empty one", () => {
    const dict = factRecordToDict(
      factRecord({
        controls: [controlFact("lint", STATUS_PASS, "ruff", true, "clean")],
        changed: { "a.py": [1, 2, 3] },
        recordedAt: "2026-01-01T00:00:00+00:00",
      }),
    );
    assert.deepEqual(dict["changedLines"], { "a.py": 3 });
    assert.deepEqual(dict["controls"], [{ kind: "lint", status: "pass", required: true, command: "ruff", detail: "clean" }]);
    assert.equal("sessionNumber" in dict, false);
    assert.equal(factRecordToDict(factRecord({}))["changedLines"], null);
  });

  it("appends one sorted-key line per collection", () => {
    const repo = tempDir();
    appendFacts(repo, factRecord({ recordedAt: "one" }));
    appendFacts(repo, factRecord({ recordedAt: "two" }));
    const lines = readFileSync(factsPath(repo), "utf8").trimEnd().split("\n");
    assert.equal(lines.length, 2);
    assert.equal(lines[0], '{"changedLines": null, "controls": [], "recordedAt": "one"}');
  });
});
