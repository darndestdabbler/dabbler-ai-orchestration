// The evidence protocol: what makes a claim checkable, judged from literal
// inputs. The parts that ask the object store -- a quote against a real
// tree, an absence search over it, round refs a clone must carry, the
// snapshot of a worktree -- are walked in walk-record.test.ts.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  EvidenceError,
  authoritativeTier,
  compileAbsenceQuery,
  countMatches,
  detectOutOfBandWrite,
  hashOutput,
  matchScope,
  nextAbsenceFallback,
  recordStateWrite,
  validateFindingEvidence,
  validateTranscript,
  verifyQuoteAgainst,
  verifyWorkerResult,
} from "../src/evidence.ts";
import { seed, tempDir } from "./support/answers.ts";

function makeTranscript(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    pinnedRef: "abc123",
    commandId: "probe-widget-empty-input",
    pristineCheckout: true,
    exitCode: 1,
    rawOutput: "ZeroDivisionError\n",
    outputHash: hashOutput("ZeroDivisionError\n"),
    entrypoint: { kind: "cli", ref: "python -m widget" },
    replay: { pristineCheckout: true, exitCode: 1, outputHash: hashOutput("ZeroDivisionError\n") },
    ...overrides,
  };
}

describe("hashing an output", () => {
  it("prefixes the digest, coerces a missing value to the empty string, and normalises nothing", () => {
    assert.ok(hashOutput("x").startsWith("sha256:"));
    assert.equal(hashOutput(null), hashOutput(""));
    assert.notEqual(hashOutput("a"), hashOutput("a "));
  });
});

describe("validating a replay transcript", () => {
  it("accepts one that carries every trust rule", () => {
    assert.equal(validateTranscript(makeTranscript()).ok, true);
  });

  it("requires exactly one trusted probe identifier", () => {
    const both = validateTranscript(makeTranscript({ templateId: "t-1" }));
    assert.equal(both.ok, false);
    assert.ok(both.reasons.some((reason) => reason.includes("exactly one")));
    const neither = makeTranscript();
    delete neither["commandId"];
    assert.ok(validateTranscript(neither).reasons.some((reason) => reason.includes("never model-authored")));
  });

  it("names an agent-built harness and refuses it as its own oracle", () => {
    const result = validateTranscript(makeTranscript({ entrypoint: { kind: "agent_harness", ref: "my-harness" } }));
    assert.equal(result.ok, false);
    assert.ok(result.reasons.some((reason) => reason.includes("oracle")));
  });

  it("refuses a boolean where an exit code belongs, and a replay that did not reproduce the bytes", () => {
    assert.equal(validateTranscript(makeTranscript({ exitCode: true })).ok, false);
    const transcript = makeTranscript();
    (transcript["replay"] as Record<string, unknown>)["outputHash"] = hashOutput("flaky output");
    assert.ok(validateTranscript(transcript).reasons.some((r) => r.includes("did not reproduce")));
  });

  it("collapses a REPRODUCED claim with no valid transcript, and reads a finding that claims no tier as asserted", () => {
    assert.equal(authoritativeTier("REPRODUCED", makeTranscript()), "REPRODUCED");
    assert.equal(authoritativeTier("REPRODUCED", null), "ASSERTED");
    assert.equal(authoritativeTier("HYPOTHESIS", null), "HYPOTHESIS");
    const result = validateFindingEvidence({ description: "x" });
    assert.equal(result.ok, true);
    assert.equal(result.tier, "ASSERTED");
  });
});

describe("detecting a hand edit to the session record", () => {
  function withState(text: string): { repo: string; sessionsDir: string } {
    const repo = tempDir();
    seed(repo, { "docs/sessions/sessions.json": text });
    return { repo, sessionsDir: join(repo, "docs", "sessions") };
  }

  it("passes content that matches a sanctioned write and names an edit that matches none", () => {
    const { repo, sessionsDir } = withState("{}");
    recordStateWrite(sessionsDir, repo);
    assert.equal(detectOutOfBandWrite(sessionsDir, repo, { requireRecord: true }), null);
    writeFileSync(join(sessionsDir, "sessions.json"), '{"status": "complete"}', "utf8");
    assert.match(String(detectOutOfBandWrite(sessionsDir, repo)), /out of band/);
  });

  it("treats an absent ledger as a finding only where a record is required", () => {
    // Absence is the signature a fully-simulated session leaves, and also
    // what an ordinary read of a repository that never wrote one sees.
    const { repo, sessionsDir } = withState("{}");
    assert.equal(detectOutOfBandWrite(sessionsDir, repo), null);
    assert.match(String(detectOutOfBandWrite(sessionsDir, repo, { requireRecord: true })), /absent/);
  });
});

describe("re-deriving a quote from reviewed bytes", () => {
  const blob = Buffer.from("alpha\nbeta\ngamma\n");

  it("returns the hash it computed, not the one the worker claimed", () => {
    const verified = verifyQuoteAgainst("widget.py", blob, hashOutput("beta\n"), { kind: "line", start: 2, end: 2 });
    assert.equal(verified.content_hash, hashOutput("beta\n"));
    assert.deepEqual(verified.span, { kind: "line", start: 2, end: 2 });
  });

  it("refuses a quote whose bytes are not those, a span off the end, and a malformed span", () => {
    assert.throws(() => verifyQuoteAgainst("w", blob, hashOutput("delta\n"), { kind: "line", start: 2, end: 2 }), /quote-hash-mismatch/);
    assert.throws(() => verifyQuoteAgainst("w", blob, hashOutput(""), { kind: "line", start: 1, end: 99 }), /quote-span-out-of-range/);
    assert.throws(() => verifyQuoteAgainst("w", blob, hashOutput(""), { kind: "page", start: 1, end: 1 }), /quote-malformed/);
  });

  it("reads a byte span as byte offsets", () => {
    assert.equal(verifyQuoteAgainst("w", blob, hashOutput("alpha"), { kind: "byte", start: 0, end: 5 }).content_hash, hashOutput("alpha"));
  });
});

describe("re-running a declared absence search", () => {
  const paths = ["docs/c.md", "src/a.py", "src/deep/b.py"];

  it("keeps `*` inside one directory and lets `**` cross them, and refuses an empty scope declaration", () => {
    // fnmatch would let a bare `*.py` swallow the repository, turning a
    // declared narrow scope into an undeclared wide one.
    assert.deepEqual(matchScope(paths, ["src/*.py"]), ["src/a.py"]);
    assert.deepEqual(matchScope(paths, ["src/**"]), ["src/a.py", "src/deep/b.py"]);
    assert.throws(() => matchScope(paths, []), /absence-declaration-malformed/);
  });

  it("counts the matches itself, a literal as text and a regex as a regex, and refuses one that does not compile", () => {
    assert.equal(countMatches("token\ntoken\n", compileAbsenceQuery("token", "literal")), 2);
    assert.equal(countMatches("a.b axb", compileAbsenceQuery("a.b", "literal")), 1);
    assert.equal(countMatches("a.b axb", compileAbsenceQuery("a.b", "regex")), 2);
    assert.throws(() => compileAbsenceQuery("(unclosed", "regex"), /absence-query-invalid/);
  });
});

describe("the way out of a blocked check", () => {
  it("walks the ladder in the plan's order and ends at human review", () => {
    assert.equal(nextAbsenceFallback(), "deterministic-test-or-analyzer");
    assert.equal(nextAbsenceFallback(["deterministic-test-or-analyzer"]), "narrower-positive-counterexample");
    assert.equal(
      nextAbsenceFallback(["deterministic-test-or-analyzer", "narrower-positive-counterexample", "blocked-with-manager-adjudication", "human-review"]),
      null,
    );
  });

  it("refuses a pass for a check already blocked out of reach", () => {
    // A later attempt with more context is a bigger budget, which is not
    // evidence about the code.
    assert.throws(
      () =>
        verifyWorkerResult(tempDir(), "0".repeat(40), { check_id: "c1", result: "pass" }, {
          priorResults: [{ check_id: "c1", result: "blocked", blocked_reason: "unprovable-absence" }],
        }),
      /blocked-not-dischargeable/,
    );
  });

  it("carries the refusal code rather than only its prose", () => {
    try {
      verifyWorkerResult(tempDir(), "0".repeat(40), { result: "pass" });
      assert.fail("a result with no check_id must be refused");
    } catch (error) {
      assert.ok(error instanceof EvidenceError);
      assert.equal(error.code, "worker-result-malformed");
    }
  });
});
