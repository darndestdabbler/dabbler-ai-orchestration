// The verifier's answer, read: the verdict token, the issue blocks and what
// they launder, the severity vocabulary, and the adjudicator's judgments.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  VERDICT_ISSUES_FOUND,
  VERDICT_VERIFIED,
  classifyBlocking,
  isBlockingIssue,
  normalizeSeverity,
  parseAdjudicationResponse,
  parseVerificationResponse,
  validateSessionVerdict,
} from "../src/verdict.ts";

const ISSUE_BLOCK = `ISSUES FOUND

- **Issue 1:** the close gate reads the wrong field
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** ai_router/gates.py:42, ai_router/session.py
  - **Failure scenario:** every close on a v3 set fails
- **Issue 2:** typo in the report header
  - **Severity:** Minor
`;

describe("verdict parsing", () => {
  it("reads a VERIFIED token, through a VERDICT prefix and markdown noise", () => {
    const [verdict, issues] = parseVerificationResponse("VERIFIED — I attacked the diff and could not break it.");
    assert.equal(verdict, VERDICT_VERIFIED);
    assert.deepEqual(issues, []);
    assert.equal(parseVerificationResponse("**VERDICT: VERIFIED**\nok")[0], VERDICT_VERIFIED);
  });

  it("parses every field an issue block declares", () => {
    const [verdict, issues] = parseVerificationResponse(ISSUE_BLOCK);
    assert.equal(verdict, VERDICT_ISSUES_FOUND);
    assert.equal(issues.length, 2);
    assert.equal(issues[0].description, "the close gate reads the wrong field");
    assert.equal(issues[0].severity, "major");
    assert.equal(issues[0].category, "Correctness");
    assert.match(String(issues[0].failureScenario), /^every close/);
    assert.ok(issues[0].evidencePaths?.includes("ai_router/gates.py"));
    assert.equal(issues[1].severity, "minor");
  });

  it("fails closed on an unrecognizable head, on an empty response, and on ISSUES FOUND with no block", () => {
    const [verdict, issues] = parseVerificationResponse("Looks fine to me!");
    assert.equal(verdict, VERDICT_ISSUES_FOUND);
    assert.equal(issues[0].severity, "unknown");
    assert.equal(parseVerificationResponse("")[1].length, 1);
    const [, synthesized] = parseVerificationResponse("ISSUES FOUND\nSomething is off but I won't structure it.");
    assert.equal(synthesized.length, 1);
    assert.match(synthesized[0].description, /Something is off/);
  });

  it("records a NITS finding as minor and tags its section, whether a block, prose bullets, or unstructured text", () => {
    const [verdict, block] = parseVerificationResponse("VERIFIED\n\n#### NITS\n- **Issue 1:** not really an issue\n");
    assert.equal(verdict, VERDICT_VERIFIED);
    assert.equal(block[0].severity, "minor");
    assert.equal(block[0].section, "nits");
    assert.equal(isBlockingIssue(block[0]), false);
    const [, bullets] = parseVerificationResponse("VERIFIED\n\n### NITS\n- the retry loop looks suspicious to me\n- naming here is inconsistent\n");
    assert.deepEqual(bullets.map((issue) => issue.description), ["the retry loop looks suspicious to me", "naming here is inconsistent"]);
    const [, prose] = parseVerificationResponse("VERIFIED\n\nNITS\nI have a vague worry about the cache.\n");
    assert.match(prose[0].description, /vague worry/);
  });

  it("does not launder a blocking severity by filing it under NITS, in a block or on a bullet", () => {
    const [, block] = parseVerificationResponse("VERIFIED\n\n## NITS\n- **Issue 1:** the fold drops events\n  - **Severity:** Major\n");
    assert.equal(isBlockingIssue(block[0]), true);
    const [, bullet] = parseVerificationResponse("VERIFIED\n\n## NITS\n- Severity: Major - adoption skips the check evidence\n");
    assert.equal(bullet[0].severity, "major");
    assert.equal(isBlockingIssue(bullet[0]), true);
  });

  it("records a bullet in a VERIFIED body, blocks when it declares a blocking severity, and never drops a blocking block", () => {
    const [, body] = parseVerificationResponse("VERIFIED\n\nThe implementation looks correct.\n- The lock can be deleted by a displaced holder.\n");
    assert.equal(body[0].section, "body");
    assert.equal(isBlockingIssue(body[0]), false);
    const [, declared] = parseVerificationResponse("VERIFIED\n\n- Severity: Major - the fold drops events\n");
    assert.equal(isBlockingIssue(declared[0]), true);
    const [verdict, block] = parseVerificationResponse("VERIFIED\n\n- **Issue 1:** actually broken\n  - **Severity:** Major\n");
    assert.equal(verdict, VERDICT_VERIFIED);
    assert.equal(block.length, 1);
  });

  it("records no finding for a clean VERIFIED and keeps a minor one it carries", () => {
    assert.deepEqual(parseVerificationResponse("VERIFIED\n\nAll checks pass and the diff matches the spec.\n")[1], []);
    assert.equal(parseVerificationResponse("VERIFIED\n\n- **Issue 1:** small thing\n  - **Severity:** Minor\n")[1].length, 1);
  });

  it("carries a speculative NITS finding into the record", () => {
    // The HL7 study case: the verifier found the real defect, filed it under
    // NITS, and called it speculative. It must reach the record.
    const [verdict, issues] = parseVerificationResponse(
      "VERIFIED\n\nThe implementation looks correct.\n\n#### NITS\n- Segment counting may mis-handle a trailing empty field. This is speculative rather than blocking.\n",
    );
    const classification = classifyBlocking(verdict, issues);
    assert.equal(classification.blocking, false);
    assert.match(classification.nitIssues[0].description, /trailing empty field/);
  });
});

describe("severity and blocking", () => {
  it("blocks on an unrecognized severity and not on minor", () => {
    assert.equal(isBlockingIssue({ description: "x", severity: "High" }), true);
    assert.equal(isBlockingIssue({ description: "x", severity: "minor" }), false);
  });

  it("normalizes into the closed vocabulary, preserving blocking", () => {
    assert.equal(normalizeSeverity("Critical"), "critical");
    assert.equal(normalizeSeverity("HIGH"), "major");
    assert.equal(normalizeSeverity(null), "major");
    assert.equal(normalizeSeverity(" minor "), "minor");
  });

  it("blocks on a major finding that cites only prose", () => {
    // The verifier picks the severity and the evidence paths both, so a cap
    // keyed on the paths let it exempt its own finding.
    assert.equal(isBlockingIssue({ description: "readme contradicts the gate", severity: "major", evidencePaths: ["README.md", "docs/notes.txt"] }), true);
  });

  it("blocks a findings-free non-VERIFIED verdict, clears a clean one, and partitions findings by severity", () => {
    assert.equal(classifyBlocking(VERDICT_VERIFIED, []).blocking, false);
    assert.equal(classifyBlocking(VERDICT_ISSUES_FOUND, []).blocking, true);
    const result = classifyBlocking(VERDICT_ISSUES_FOUND, [
      { description: "a", severity: "critical" },
      { description: "b", severity: "minor" },
      { description: "c", severity: "major", evidencePaths: ["README.md"] },
    ]);
    assert.equal(result.blockingIssues.length, 2);
    assert.equal(result.nitIssues.length, 1);
  });
});

describe("the session verdict vocabulary", () => {
  it("accepts exactly the three tokens the router writes", () => {
    for (const token of ["VERIFIED", "ISSUES_FOUND", "REMEDIATED_AT_CAP"]) assert.equal(validateSessionVerdict(token), token);
  });

  it("refuses the v1 incident token, a prefix look-alike, the retired WAIVED, and anything unclean", () => {
    for (const token of ["manual-override-development", "VERIFIED_NOT_REALLY", "WAIVED", "", null, "verified "]) {
      assert.throws(() => validateSessionVerdict(token));
    }
  });
});

describe("adjudication parsing", () => {
  it("fails closed on every ambiguity: unjudged, contradictory, or overruled without reasons", () => {
    const outcomes = parseAdjudicationResponse(
      "Dispute 1: OVERRULE — the scope file settles it\nDispute 3: OVERRULE — fine here\nDispute 3: UPHOLD — no wait\nDispute 4: OVERRULE\n",
      4,
    );
    assert.deepEqual(outcomes[0], { outcome: "OVERRULED", reasons: "the scope file settles it" });
    assert.equal(outcomes[1].outcome, "UPHELD");
    assert.match(outcomes[1].reasons, /no parseable judgment/);
    assert.equal(outcomes[2].outcome, "UPHELD");
    assert.match(outcomes[2].reasons, /contradictory/);
    assert.equal(outcomes[3].outcome, "UPHELD");
    assert.match(outcomes[3].reasons, /without reasons/);
  });

  it("reads UPHOLD as the finding kept and OVERRULE as the finding cleared, in either tense", () => {
    // The verb is about the FINDING: the adjudicator's prompt says so in the
    // same words, so a judge siding with the dispute writes OVERRULE.
    const [upheld, overruled] = parseAdjudicationResponse("Dispute 1: UPHELD — it stands\nDispute 2: OVERRULED — the evidence answers it\n", 2);
    assert.equal(upheld.outcome, "UPHELD");
    assert.equal(overruled.outcome, "OVERRULED");
  });
});
