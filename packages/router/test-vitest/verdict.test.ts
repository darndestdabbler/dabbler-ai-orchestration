import { describe, expect, it } from "vitest";

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
  it("reads a VERIFIED token", () => {
    const [verdict, issues] = parseVerificationResponse(
      "VERIFIED — I attacked the diff and could not break it.",
    );
    expect(verdict).toBe(VERDICT_VERIFIED);
    expect(issues).toEqual([]);
  });

  it("sees through a VERDICT prefix and markdown noise", () => {
    const [verdict] = parseVerificationResponse("**VERDICT: VERIFIED**\nok");
    expect(verdict).toBe(VERDICT_VERIFIED);
  });

  it("parses every field an issue block declares", () => {
    const [verdict, issues] = parseVerificationResponse(ISSUE_BLOCK);
    expect(verdict).toBe(VERDICT_ISSUES_FOUND);
    expect(issues).toHaveLength(2);
    // No leading `**`: the marker consumes the bold that wraps the colon.
    expect(issues[0].description).toBe("the close gate reads the wrong field");
    expect(issues[0].severity).toBe("major");
    expect(issues[0].category).toBe("Correctness");
    expect(issues[0].failureScenario).toMatch(/^every close/);
    expect(issues[0].evidencePaths).toContain("ai_router/gates.py");
    expect(issues[1].severity).toBe("minor");
  });

  it("fails closed on an unrecognizable head", () => {
    const [verdict, issues] = parseVerificationResponse("Looks fine to me!");
    expect(verdict).toBe(VERDICT_ISSUES_FOUND);
    expect(issues[0].severity).toBe("unknown");
  });

  it("synthesizes one finding when ISSUES FOUND carries no block", () => {
    const [verdict, issues] = parseVerificationResponse(
      "ISSUES FOUND\nSomething is off but I won't structure it.",
    );
    expect(verdict).toBe(VERDICT_ISSUES_FOUND);
    expect(issues).toHaveLength(1);
    expect(issues[0].description).toContain("Something is off");
  });

  it("records a NITS finding as minor and tags its section", () => {
    const [verdict, issues] = parseVerificationResponse(
      "VERIFIED\n\n#### NITS\n- **Issue 1:** not really an issue\n",
    );
    expect(verdict).toBe(VERDICT_VERIFIED);
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe("minor");
    expect(issues[0].section).toBe("nits");
    expect(isBlockingIssue(issues[0])).toBe(false);
  });

  it("records prose bullets under NITS, which is the common shape", () => {
    const [verdict, issues] = parseVerificationResponse(
      "VERIFIED\n\n### NITS\n" +
        "- the retry loop looks suspicious to me\n" +
        "- naming here is inconsistent\n",
    );
    expect(verdict).toBe(VERDICT_VERIFIED);
    expect(issues.map((issue) => issue.description)).toEqual([
      "the retry loop looks suspicious to me",
      "naming here is inconsistent",
    ]);
  });

  it("records an unstructured NITS section whole rather than dropping it", () => {
    const [, issues] = parseVerificationResponse(
      "VERIFIED\n\nNITS\nI have a vague worry about the cache.\n",
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].description).toContain("vague worry");
  });

  it("does not launder a blocking severity by filing it under NITS", () => {
    const [, issues] = parseVerificationResponse(
      "VERIFIED\n\n## NITS\n- **Issue 1:** the fold drops events\n" +
        "  - **Severity:** Major\n",
    );
    expect(issues[0].severity).toBe("major");
    expect(isBlockingIssue(issues[0])).toBe(true);
  });

  it("honours a severity declared on a NITS bullet", () => {
    // NITS bodies are usually bullets, so honouring a severity only inside
    // an `Issue N:` block leaves the common shape as a laundering route.
    const [, issues] = parseVerificationResponse(
      "VERIFIED\n\n## NITS\n" +
        "- Severity: Major - adoption skips the check evidence\n",
    );
    expect(issues[0].severity).toBe("major");
    expect(isBlockingIssue(issues[0])).toBe(true);
  });

  it("records a bullet in a VERIFIED body that opens no issue block", () => {
    const [, issues] = parseVerificationResponse(
      "VERIFIED\n\nThe implementation looks correct.\n" +
        "- The lock can be deleted by a displaced holder.\n",
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].description).toContain("displaced holder");
    expect(issues[0].section).toBe("body");
    expect(isBlockingIssue(issues[0])).toBe(false);
  });

  it("blocks on a VERIFIED bullet that declares a blocking severity", () => {
    const [, issues] = parseVerificationResponse(
      "VERIFIED\n\n- Severity: Major - the fold drops events\n",
    );
    expect(issues[0].severity).toBe("major");
    expect(isBlockingIssue(issues[0])).toBe(true);
  });

  it("records no finding for a clean VERIFIED", () => {
    const [, issues] = parseVerificationResponse(
      "VERIFIED\n\nAll checks pass and the diff matches the spec.\n",
    );
    expect(issues).toEqual([]);
  });

  it("keeps a minor finding a VERIFIED response carries", () => {
    const [, issues] = parseVerificationResponse(
      "VERIFIED\n\n- **Issue 1:** small thing\n  - **Severity:** Minor\n",
    );
    expect(issues).toHaveLength(1);
  });

  it("carries a speculative NITS finding into the record", () => {
    // The HL7 study case: the verifier found the real defect, filed it under
    // NITS, and called it speculative. It must reach the record.
    const [verdict, issues] = parseVerificationResponse(
      "VERIFIED\n\nThe implementation looks correct.\n\n" +
        "#### NITS\n" +
        "- Segment counting may mis-handle a trailing empty field. " +
        "This is speculative rather than blocking.\n",
    );
    const classification = classifyBlocking(verdict, issues);
    expect(classification.blocking).toBe(false);
    expect(classification.nitIssues).toHaveLength(1);
    expect(classification.nitIssues[0].description).toContain(
      "trailing empty field",
    );
  });

  it("never drops a blocking block under a VERIFIED token", () => {
    const [verdict, issues] = parseVerificationResponse(
      "VERIFIED\n\n- **Issue 1:** actually broken\n  - **Severity:** Major\n",
    );
    expect(verdict).toBe(VERDICT_VERIFIED);
    expect(issues).toHaveLength(1);
  });

  it("fails closed on an empty response", () => {
    const [verdict, issues] = parseVerificationResponse("");
    expect(verdict).toBe(VERDICT_ISSUES_FOUND);
    expect(issues).toHaveLength(1);
  });
});

describe("severity and blocking", () => {
  it("blocks on an unrecognized severity", () => {
    expect(isBlockingIssue({ description: "x", severity: "High" })).toBe(true);
  });

  it("does not block on minor", () => {
    expect(isBlockingIssue({ description: "x", severity: "minor" })).toBe(false);
  });

  it("normalizes into the closed vocabulary, preserving blocking", () => {
    expect(normalizeSeverity("Critical")).toBe("critical");
    expect(normalizeSeverity("HIGH")).toBe("major");
    expect(normalizeSeverity(null)).toBe("major");
    expect(normalizeSeverity(" minor ")).toBe("minor");
  });

  it("blocks on a major finding that cites only prose", () => {
    // The verifier picks the severity and the evidence paths both, so a cap
    // keyed on the paths let it exempt its own finding.
    expect(
      isBlockingIssue({
        description: "readme contradicts the gate",
        severity: "major",
        evidencePaths: ["README.md", "docs/notes.txt"],
      }),
    ).toBe(true);
  });

  it("blocks a findings-free non-VERIFIED verdict and clears a clean one", () => {
    expect(classifyBlocking(VERDICT_VERIFIED, []).blocking).toBe(false);
    expect(classifyBlocking(VERDICT_ISSUES_FOUND, []).blocking).toBe(true);
  });

  it("partitions findings by severity", () => {
    const result = classifyBlocking(VERDICT_ISSUES_FOUND, [
      { description: "a", severity: "critical" },
      { description: "b", severity: "minor" },
      { description: "c", severity: "major", evidencePaths: ["README.md"] },
    ]);
    expect(result.blocking).toBe(true);
    expect(result.blockingIssues).toHaveLength(2);
    expect(result.nitIssues).toHaveLength(1);
  });
});

describe("the session verdict vocabulary", () => {
  it.each(["VERIFIED", "ISSUES_FOUND", "REMEDIATED_AT_CAP"])(
    "accepts %s",
    (token) => {
      expect(validateSessionVerdict(token)).toBe(token);
    },
  );

  it.each([
    "manual-override-development", // the 2026-07-08 incident token
    "VERIFIED_NOT_REALLY", // prefix look-alike
    "WAIVED", // retired: no writer emits it again
    "",
    null,
    "verified ",
  ])("refuses %s", (token) => {
    expect(() => validateSessionVerdict(token)).toThrow();
  });
});

describe("adjudication parsing", () => {
  it("fails closed on every ambiguity", () => {
    const response =
      "Dispute 1: OVERRULE — the scope file settles it\n" +
      "Dispute 3: OVERRULE — fine here\n" +
      "Dispute 3: UPHOLD — no wait\n" +
      "Dispute 4: OVERRULE\n";
    const outcomes = parseAdjudicationResponse(response, 4);
    expect(outcomes[0].outcome).toBe("OVERRULED");
    expect(outcomes[0].reasons).toBe("the scope file settles it");
    // Dispute 2 was never judged; dispute 3 was judged both ways; dispute 4
    // was overruled on no argument at all. Ambiguity never overrules.
    expect(outcomes[1].outcome).toBe("UPHELD");
    expect(outcomes[1].reasons).toContain("no parseable judgment");
    expect(outcomes[2].outcome).toBe("UPHELD");
    expect(outcomes[2].reasons).toContain("contradictory");
    expect(outcomes[3].outcome).toBe("UPHELD");
    expect(outcomes[3].reasons).toContain("without reasons");
  });
});
