// Decisions the framework cannot make for itself.
//
// The behaviour worth pinning is not the file format -- it is the ordering
// of two rules that read as a contradiction: nothing blocks on a person,
// and anything that reduces verification is reserved to one. Both hold,
// because the first is about judgment calls and verification reduction is
// not one. The record is a file under a temp directory; git is asked nothing.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { renderDecision } from "../src/cli/owed.ts";
import type { Row } from "../src/ledger.ts";
import {
  CLASS_EXTERNAL_CONSEQUENCE,
  CLASS_VERIFICATION_REDUCTION,
  EVENT_ANSWERED,
  EVENT_RAISED,
  ID_PACKAGING_FEED,
  ID_PACKAGING_SECRET,
  ID_TESTING_SUITES,
  ID_TESTING_SUITES_NOW_TESTS_EXIST,
  OwedDecisionError,
  SEVERITY_ADVISORY,
  SEVERITY_BLOCKING,
  STATE_OPEN,
  answerOwed,
  blockingDecisions,
  currentDecisions,
  foldOwed,
  openDecisions,
  raiseOwed,
  raisePackagingDecisions,
  readOwed,
  refreshOwedDecisions,
  supersedeOwed,
} from "../src/owedDecisions.ts";
import { tempDir } from "./support/answers.ts";

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
  it("refuses a question with one answer, which is a notification, and a class outside the rubric", () => {
    const repo = tempDir();
    assert.throws(() => raiseOwed(repo, { ...BRIEF, options: [BRIEF.options[0]] }), OwedDecisionError);
    assert.throws(() => raiseOwed(repo, { ...BRIEF, decisionClass: "because-i-said" }), OwedDecisionError);
  });

  it("is idempotent, so a standing question is not re-asked every session", () => {
    const repo = tempDir();
    assert.notEqual(raiseOwed(repo, BRIEF), null);
    assert.equal(raiseOwed(repo, BRIEF), null);
    assert.equal(readOwed(repo).length, 1);
  });

  it("re-raises a brief that changed, so the reader sees the question actually being asked", () => {
    // A recommendation was reversed in code and the list went on printing
    // the old one, advising the operator against the thing the session
    // existed to do.
    const repo = tempDir();
    raiseOwed(repo, BRIEF);
    assert.notEqual(raiseOwed(repo, { ...BRIEF, recommendation: "local-only" }), null);
    const current = currentDecisions(repo).find((row) => row["id"] === BRIEF.id);
    assert.equal(current?.["recommendation"], "local-only");
    assert.equal(current?.["state"], STATE_OPEN);
  });

  it("leaves an answered decision alone, however the brief changes", () => {
    // Rewriting a brief under a decision somebody made changes what they
    // are recorded as having agreed to.
    const repo = tempDir();
    raiseOwed(repo, BRIEF);
    answerOwed(repo, BRIEF.id, "attach");
    assert.equal(raiseOwed(repo, { ...BRIEF, question: "Something else entirely?" }), null);
    assert.equal(currentDecisions(repo).find((row) => row["id"] === BRIEF.id)?.["question"], BRIEF.question);
  });
});

describe("answering", () => {
  it("refuses a label that was never offered, and a second answer", () => {
    const repo = tempDir();
    raiseOwed(repo, BRIEF);
    assert.throws(() => answerOwed(repo, BRIEF.id, "whatever"), OwedDecisionError);
    answerOwed(repo, BRIEF.id, "attach");
    assert.throws(() => answerOwed(repo, BRIEF.id, "local-only"), OwedDecisionError);
  });

  it("keeps the question readable beside the answer and attributes the answer to the operator", () => {
    const repo = tempDir();
    raiseOwed(repo, BRIEF);
    assert.equal(answerOwed(repo, BRIEF.id, "attach")["answeredBy"], "operator");
    const folded = foldOwed(readOwed(repo)).get(BRIEF.id);
    assert.equal(folded?.["event"], EVENT_ANSWERED);
    assert.equal(folded?.["answer"], "attach");
    assert.equal(folded?.["question"], BRIEF.question);
  });

  it("retires a question the repository outgrew", () => {
    const repo = tempDir();
    raiseOwed(repo, BRIEF);
    supersedeOwed(repo, BRIEF.id, "the remote question moved to setup");
    assert.equal(openDecisions(repo).length, 0);
  });
});

describe("which class holds the close", () => {
  it("lets every class but verification-reduction proceed, and refuses while that one stands", () => {
    const repo = tempDir();
    raiseOwed(repo, BRIEF);
    assert.equal(openDecisions(repo).length, 1);
    assert.equal(blockingDecisions(repo).length, 0);
    raiseOwed(repo, { ...BRIEF, id: "no-suite", decisionClass: CLASS_VERIFICATION_REDUCTION });
    assert.deepEqual(blockingDecisions(repo).map((row) => row["id"]), ["no-suite"]);
    answerOwed(repo, "no-suite", "local-only");
    assert.equal(blockingDecisions(repo).length, 0);
  });
});

describe("the suite-declaration condition", () => {
  const base = { hasExpensiveSuite: false, configFilename: "dabbler.yaml", sessionNumber: 1 };

  it("asks when the repository builds something and declares no suite, with a default", () => {
    const row = refreshOwedDecisions(tempDir(), { ...base, ecosystems: ["node"] });
    assert.equal(row?.["class"], CLASS_VERIFICATION_REDUCTION);
    assert.equal(row?.["event"], EVENT_RAISED);
    assert.notEqual(String(row?.["onNoAnswer"] ?? ""), "");
    assert.equal(row?.["recommendation"], "declare");
  });

  it("never asks a repository of documents, nor one that already declared a suite", () => {
    // csv-model's first two sessions were exactly this, and closed green.
    assert.equal(refreshOwedDecisions(tempDir(), { ...base, ecosystems: [] }), null);
    assert.equal(refreshOwedDecisions(tempDir(), { ...base, ecosystems: ["node"], hasExpensiveSuite: true }), null);
  });

  it("asks again once tests exist, which is what no-tests-yet promised, and not before or after", () => {
    const repo = tempDir();
    const eco = { ...base, ecosystems: ["node"] };
    refreshOwedDecisions(repo, { ...eco, hasTestRoot: false });
    answerOwed(repo, ID_TESTING_SUITES, "no-tests-yet");
    assert.equal(blockingDecisions(repo).length, 0);
    assert.equal(refreshOwedDecisions(repo, { ...eco, hasTestRoot: false }), null);
    assert.equal(refreshOwedDecisions(repo, { ...eco, hasTestRoot: true })?.["id"], ID_TESTING_SUITES_NOW_TESTS_EXIST);
    assert.equal(blockingDecisions(repo).length, 1);
    assert.equal(refreshOwedDecisions(tempDir(), { ...eco, hasTestRoot: true, hasExpensiveSuite: true }), null);
  });
});

describe("the contract the record publishes", () => {
  it("states a current state and derives severity from the class, on the row and in the fold", () => {
    // The file is a log of events, so `raised` is a thing that happened;
    // `open` is a thing that is true, and it is what consumers were promised.
    const repo = tempDir();
    raiseOwed(repo, BRIEF);
    raiseOwed(repo, { ...BRIEF, id: "blocker", decisionClass: CLASS_VERIFICATION_REDUCTION });
    const folded = foldOwed(readOwed(repo));
    assert.equal(folded.get(BRIEF.id)?.["state"], STATE_OPEN);
    assert.equal(folded.get(BRIEF.id)?.["severity"], SEVERITY_ADVISORY);
    assert.equal(folded.get("blocker")?.["severity"], SEVERITY_BLOCKING);
    const [row] = readOwed(repo);
    assert.equal(row["state"], STATE_OPEN);
    assert.equal(folded.get(BRIEF.id)?.["state"], row["state"]);
  });

  it("carries the state and the severity onto the answered row too", () => {
    const repo = tempDir();
    raiseOwed(repo, { ...BRIEF, decisionClass: CLASS_VERIFICATION_REDUCTION });
    answerOwed(repo, BRIEF.id, "attach");
    const rows = readOwed(repo);
    assert.deepEqual(rows.map((row) => row["state"]), ["open", "answered"]);
    assert.equal(rows.every((row) => row["severity"] === SEVERITY_BLOCKING), true);
  });

  it("validates the fold, so a consumer cannot be handed an off-contract record", () => {
    const repo = tempDir();
    raiseOwed(repo, BRIEF);
    answerOwed(repo, BRIEF.id, "attach");
    assert.doesNotThrow(() => currentDecisions(repo));
    assert.equal(currentDecisions(repo)[0]["question"], BRIEF.question);
  });
});

describe("what a row in the list says about itself", () => {
  it("states its state even when that state is open, and says when it holds the close", () => {
    const repo = tempDir();
    const row = raiseOwed(repo, BRIEF);
    assert.match(renderDecision(row as Row).split("\n")[0], new RegExp(STATE_OPEN));
    const blocker = raiseOwed(repo, { ...BRIEF, id: "reduces", decisionClass: CLASS_VERIFICATION_REDUCTION });
    assert.match(renderDecision(blocker as Row).split("\n")[0], /holds the close/);
  });
});

describe("asking how a repository publishes", () => {
  it("asks the feed and the credential's name as two questions, once, and neither holds the close", () => {
    // They fail differently: a wrong feed sends a release somewhere real, a
    // wrong credential name sends a build nowhere at all.
    const repo = tempDir();
    const raised = raisePackagingDecisions(repo, { ecosystem: "dotnet", packCommand: "dotnet pack -o {output}" });
    assert.deepEqual(raised.map((row) => String(row["id"])).sort(), [ID_PACKAGING_FEED, ID_PACKAGING_SECRET].sort());
    assert.deepEqual(raisePackagingDecisions(repo, { ecosystem: "dotnet", packCommand: "dotnet pack -o {output}" }), []);
    assert.deepEqual(blockingDecisions(repo), []);
  });

  it("names the credential and never carries one", () => {
    const [, secret] = raisePackagingDecisions(tempDir(), { ecosystem: "dotnet", packCommand: "dotnet pack" });
    assert.match(String(secret["question"]), /NAME/);
    assert.match(String(secret["determined"]), /never does/);
  });
});
