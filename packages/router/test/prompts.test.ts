// What a verification round is shown: the cited evidence, the prior findings
// and their rebuttals, the task block, the adjudicator's brief, and the
// auto-verification template. Files in a temp directory where a citation
// has to resolve; no git.
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import { grantForTransport } from "../src/agency.ts";
import {
  adjudicationPrompt,
  buildTaskBlock,
  citedEvidenceLines,
  priorFindingsBlock,
  splitDisputes,
  splitEvidenceRange,
  splitLines,
} from "../src/verify/prompts.ts";
import { buildVerificationPrompt } from "../src/verifyjob.ts";
import { seed, tempDir } from "./support/answers.ts";

describe("an evidence citation", () => {
  it("reads a bare path, a single line, and a range", () => {
    assert.deepEqual(splitEvidenceRange("src/a.py"), { path: "src/a.py", start: null, end: null });
    assert.deepEqual(splitEvidenceRange("src/a.py:12"), { path: "src/a.py", start: 12, end: 12 });
    assert.deepEqual(splitEvidenceRange("src/a.py:12-40"), { path: "src/a.py", start: 12, end: 40 });
  });

  it("renders exactly the cited passage and says which lines they were", () => {
    const repo = tempDir();
    seed(repo, { "big.py": "a\nb\nc\nd\ne\n" });
    const lines = citedEvidenceLines(repo, "big.py:2-4");
    assert.equal(lines[0], "  - Cited evidence `big.py` lines 2-4:");
    assert.equal(lines[3], "b\nc\nd");
  });

  it("says a path is missing, says how many lines a file has when the range is empty, and truncates a whole-file cite at the cap", () => {
    const repo = tempDir();
    seed(repo, { "short.py": "one\n", "huge.py": "x".repeat(17 * 1024) });
    assert.deepEqual(citedEvidenceLines(repo, "gone.py"), ["  - Cited evidence `gone.py`: (missing at render time)"]);
    assert.deepEqual(citedEvidenceLines(repo, "short.py:5-9"), [
      "  - Cited evidence `short.py:5-9`: (the file has only 1 line(s); the cited range is empty)",
    ]);
    const rendered = citedEvidenceLines(repo, "huge.py").join("\n");
    assert.ok(rendered.includes("truncated at the inline cap") && rendered.includes("`huge.py:START-END`"));
  });
});

describe("Python's line splitting", () => {
  it("takes CRLF as one boundary and drops a single trailing terminator", () => {
    assert.deepEqual(splitLines("a\r\nb\r\n"), ["a", "b"]);
    assert.deepEqual(splitLines("a\nb"), ["a", "b"]);
    assert.deepEqual(splitLines(""), []);
  });
});

describe("the dispute split", () => {
  it("keeps a dispute pending until a later round has presented it", () => {
    const dispute = { round: 1, finding_index: 0, filed_after_round: 1 };
    const { pending, settled } = splitDisputes([{ round: 1 }, { round: 2 }], [dispute]);
    assert.equal(pending.size, 0);
    assert.equal(settled.get("1:0"), 2);
    const fresh = splitDisputes([{ round: 1 }], [dispute]);
    assert.equal(fresh.pending.get("1:0"), dispute);
    assert.equal(fresh.settled.size, 0);
  });
});

describe("the prior-findings block", () => {
  it("says nothing at all when there are no prior rounds", () => {
    assert.equal(priorFindingsBlock([]), "");
  });

  it("carries a pending rebuttal and its evidence beside the finding, and tells the verifier not to re-adjudicate a settled one", () => {
    const repo = tempDir();
    seed(repo, { "cite.py": "the line\n" });
    const rounds = [{ round: 1, verdict: "ISSUES_FOUND", findings: [{ severity: "major", description: "the widget is wrong", blocking: true }] }];
    const disputes = [{ round: 1, finding_index: 0, filed_after_round: 1, grounds: "the widget is right", evidence_paths: ["cite.py"] }];
    const pending = priorFindingsBlock(rounds, disputes, repo);
    assert.ok(pending.includes("- [major] [DISPUTED] the widget is wrong"));
    assert.ok(pending.includes("Orchestrator's rebuttal (grounds): the widget is right") && pending.includes("the line"));
    assert.ok(pending.includes("engage the rebuttal"));
    const settled = priorFindingsBlock([...rounds, { round: 2, verdict: "VERIFIED", findings: [] }], disputes, null);
    assert.ok(settled.includes("the rebuttal was presented in round 2") && !settled.includes("engage the rebuttal"));
  });
});

describe("the task block a round opens with", () => {
  it("carries the session's own plan verbatim and the round number, says when the plan is unavailable, and appends the briefing only when a grant was made", () => {
    const repo = tempDir();
    seed(repo, { "docs/sessions/session-plan.md": "### Session 1 of 1: First things\n1. Register.\n2. **Build the widget.** Make it real.\n" });
    const sessionsDir = join(repo, "docs", "sessions");
    const block = buildTaskBlock(sessionsDir, 1, 1, []);
    assert.ok(block.includes("Session 1 of the active session set (verification round 1)") && block.includes("**Build the widget.**"));
    assert.ok(buildTaskBlock(tempDir(), 1, 1, []).includes("(session plan unavailable)"));
    const seat = grantForTransport("copilot-cli", { scope: ["src/widget.py"] });
    assert.notEqual(buildTaskBlock(sessionsDir, 1, 1, [], null, null, seat), block);
  });
});

describe("the adjudicator's brief", () => {
  it("hands over the complete finding row, never a projection, and says what the fix delta is", () => {
    const prompt = adjudicationPrompt(
      [{ round: 3, index: 1, finding: { severity: "major", description: "d", evidencePaths: ["a.py"] }, dispute: { grounds: "g", evidence_paths: [] } }],
      "diff --git a/a.py",
      null,
    );
    assert.ok(prompt.includes("#### Dispute 1 — round 3, finding 1"));
    assert.ok(prompt.includes('"evidencePaths": [\n    "a.py"\n  ]'));
    assert.ok(prompt.includes("You may NOT raise new findings"));
    assert.ok(adjudicationPrompt([], "", null).includes("(no changes since the last round)"));
  });

  it("tells the adjudicator that UPHOLD keeps the FINDING and OVERRULE clears it, which is how the parser reads the verbs", () => {
    // The prompt used to say only "judge each dispute", and a judge siding
    // with the dispute could write UPHOLD -- which the parser reads as the
    // finding upheld. The words now agree with the parser.
    const prompt = adjudicationPrompt([], "", null);
    assert.ok(prompt.includes("UPHOLD keeps the finding standing, so the dispute fails"));
    assert.ok(prompt.includes("OVERRULE clears the finding, so the dispute succeeds"));
    assert.ok(prompt.includes("A dispute you do not clearly judge leaves its finding UPHELD."));
  });
});

describe("the auto-verification prompt", () => {
  it("fills the configured template, falls back when there is none, substitutes every occurrence, and never expands the response's own text", () => {
    assert.equal(buildVerificationPrompt("T:{original_task} K:{task_type} R:{original_response}", "the task", "code-review", "the answer"), "T:the task K:code-review R:the answer");
    const fallback = buildVerificationPrompt("", "", "code-review", "the answer");
    assert.ok(fallback.includes("Start your response with VERIFIED or ISSUES FOUND") && fallback.includes("(not provided)"));
    assert.equal(buildVerificationPrompt("{task_type}/{task_type}", "", "code-review", ""), "code-review/code-review");
    assert.equal(buildVerificationPrompt("R:{original_response}", "", "t", "cost $& and $` and $1"), "R:cost $& and $` and $1");
  });
});
