// Decisions the framework cannot make for itself.
//
// The behaviour worth pinning is not the file format -- it is the ordering of
// two rules that read as a contradiction: nothing blocks on a person, and
// anything that reduces verification is reserved to one. Both hold, because
// the first is about judgment calls and verification reduction is not one.

import { afterAll, describe, expect, it } from "vitest";

import {
  CLASS_EXTERNAL_CONSEQUENCE,
  CLASS_VERIFICATION_REDUCTION,
  EVENT_ANSWERED,
  EVENT_RAISED,
  OwedDecisionError,
  answerOwed,
  blockingDecisions,
  foldOwed,
  openDecisions,
  raiseOwed,
  readOwed,
  refreshOwedDecisions,
  supersedeOwed,
} from "../src/owedDecisions.ts";
import { checkOwedDecisions } from "../src/gates.ts";
import { makeSandboxRepo, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

const BRIEF = {
  id: "example",
  decisionClass: CLASS_EXTERNAL_CONSEQUENCE,
  question: "Which remote should this repository push to?",
  determined: "The repository has no remote configured.",
  options: [
    { label: "attach", consequence: "The framework adds the remote you name." },
    { label: "local-only", consequence: "Nothing is pushed, and the close knows it." },
  ],
  recommendation: "attach",
  onNoAnswer: "The repository stays local and the wait is recorded.",
} as const;

describe("raising a decision", () => {
  it("refuses a question with one answer, which is a notification", () => {
    const { repo } = makeSandboxRepo();
    expect(() =>
      raiseOwed(repo, { ...BRIEF, options: [BRIEF.options[0]] }),
    ).toThrow(OwedDecisionError);
  });

  it("refuses a class outside the rubric's four", () => {
    const { repo } = makeSandboxRepo();
    expect(() => raiseOwed(repo, { ...BRIEF, decisionClass: "because-i-said" })).toThrow(
      OwedDecisionError,
    );
  });

  it("is idempotent, so a standing question is not re-asked every session", () => {
    const { repo } = makeSandboxRepo();
    expect(raiseOwed(repo, BRIEF)).not.toBeNull();
    expect(raiseOwed(repo, BRIEF)).toBeNull();
    expect(readOwed(repo)).toHaveLength(1);
  });

  it("does not re-raise a question that was already answered", () => {
    const { repo } = makeSandboxRepo();
    raiseOwed(repo, BRIEF);
    answerOwed(repo, BRIEF.id, "local-only");
    expect(raiseOwed(repo, BRIEF)).toBeNull();
  });
});

describe("answering", () => {
  it("refuses a label that was never offered", () => {
    const { repo } = makeSandboxRepo();
    raiseOwed(repo, BRIEF);
    expect(() => answerOwed(repo, BRIEF.id, "whatever")).toThrow(OwedDecisionError);
  });

  it("refuses a second answer, because a different one is a new question", () => {
    const { repo } = makeSandboxRepo();
    raiseOwed(repo, BRIEF);
    answerOwed(repo, BRIEF.id, "attach");
    expect(() => answerOwed(repo, BRIEF.id, "local-only")).toThrow(OwedDecisionError);
  });

  it("keeps the question readable beside the answer", () => {
    const { repo } = makeSandboxRepo();
    raiseOwed(repo, BRIEF);
    answerOwed(repo, BRIEF.id, "attach");
    const folded = foldOwed(readOwed(repo)).get(BRIEF.id);
    expect(folded?.["event"]).toBe(EVENT_ANSWERED);
    expect(folded?.["answer"]).toBe("attach");
    // The fold carries the brief forward: an answer supersedes, never edits.
    expect(folded?.["question"]).toBe(BRIEF.question);
  });

  it("attributes the answer to the operator and to nobody else", () => {
    const { repo } = makeSandboxRepo();
    raiseOwed(repo, BRIEF);
    expect(answerOwed(repo, BRIEF.id, "attach")["answeredBy"]).toBe("operator");
  });

  it("retires a question the repository outgrew", () => {
    const { repo } = makeSandboxRepo();
    raiseOwed(repo, BRIEF);
    supersedeOwed(repo, BRIEF.id, "the remote question moved to setup");
    expect(openDecisions(repo)).toHaveLength(0);
  });
});

describe("which class holds the close", () => {
  it("lets every class but verification-reduction proceed", () => {
    const { repo, sessionsDir } = makeSandboxRepo();
    raiseOwed(repo, BRIEF);
    expect(openDecisions(repo)).toHaveLength(1);
    expect(blockingDecisions(repo)).toHaveLength(0);
    expect(checkOwedDecisions(sessionsDir)[0]).toBe(true);
  });

  it("refuses the close while a verification-reducing question stands", () => {
    const { repo, sessionsDir } = makeSandboxRepo();
    raiseOwed(repo, {
      ...BRIEF,
      id: "no-suite",
      decisionClass: CLASS_VERIFICATION_REDUCTION,
    });
    const [passed, remediation] = checkOwedDecisions(sessionsDir);
    expect(passed).toBe(false);
    expect(remediation).toContain("no-suite");
  });

  it("passes once it is answered", () => {
    const { repo, sessionsDir } = makeSandboxRepo();
    raiseOwed(repo, {
      ...BRIEF,
      id: "no-suite",
      decisionClass: CLASS_VERIFICATION_REDUCTION,
    });
    answerOwed(repo, "no-suite", "local-only");
    expect(checkOwedDecisions(sessionsDir)[0]).toBe(true);
  });

  it("passes in a repository that owes nothing at all", () => {
    const { sessionsDir } = makeSandboxRepo();
    expect(checkOwedDecisions(sessionsDir)[0]).toBe(true);
  });
});

describe("the suite-declaration condition", () => {
  const base = {
    hasExpensiveSuite: false,
    configFilename: "dabbler.yaml",
    sessionNumber: 1,
  };

  it("asks when the repository builds something and declares no suite", () => {
    const { repo } = makeSandboxRepo();
    const row = refreshOwedDecisions(repo, { ...base, ecosystems: ["node"] });
    expect(row?.["class"]).toBe(CLASS_VERIFICATION_REDUCTION);
    expect(row?.["event"]).toBe(EVENT_RAISED);
  });

  it("never asks a repository of documents, which has nothing to test", () => {
    // csv-model's first two sessions were exactly this, and closed green
    // correctly. Demanding a test command from them is the ceremony this
    // record exists to remove, not to relocate.
    const { repo } = makeSandboxRepo();
    expect(refreshOwedDecisions(repo, { ...base, ecosystems: [] })).toBeNull();
  });

  it("never asks a repository that already declared a suite", () => {
    const { repo } = makeSandboxRepo();
    expect(
      refreshOwedDecisions(repo, {
        ...base,
        ecosystems: ["node"],
        hasExpensiveSuite: true,
      }),
    ).toBeNull();
  });

  it("states a default, because a question nobody answers still has an outcome", () => {
    const { repo } = makeSandboxRepo();
    const row = refreshOwedDecisions(repo, { ...base, ecosystems: ["node"] });
    expect(String(row?.["onNoAnswer"] ?? "")).not.toBe("");
    expect(row?.["recommendation"]).toBe("declare");
  });
});
