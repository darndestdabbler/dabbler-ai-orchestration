// Decisions the framework cannot make for itself.
//
// The behaviour worth pinning is not the file format -- it is the ordering of
// two rules that read as a contradiction: nothing blocks on a person, and
// anything that reduces verification is reserved to one. Both hold, because
// the first is about judgment calls and verification reduction is not one.

import { afterAll, describe, expect, it } from "vitest";

import {
  CLASS_EXTERNAL_CONSEQUENCE,
  ID_TESTING_SUITES,
  ID_TESTING_SUITES_NOW_TESTS_EXIST,
  SEVERITY_ADVISORY,
  SEVERITY_BLOCKING,
  STATE_OPEN,
  CLASS_VERIFICATION_REDUCTION,
  EVENT_ANSWERED,
  EVENT_RAISED,
  OwedDecisionError,
  answerOwed,
  blockingDecisions,
  currentDecisions,
  foldOwed,
  openDecisions,
  raiseOwed,
  raisePackagingDecisions,
  ID_PACKAGING_FEED,
  ID_PACKAGING_SECRET,
  readOwed,
  refreshOwedDecisions,
  supersedeOwed,
} from "../src/owedDecisions.ts";
import { checkOwedDecisions } from "../src/gates.ts";
import { appendSuitesToProjectConfig } from "../src/bootstrap/detect.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
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

describe("the contract the record publishes", () => {
  it("states a current state, not just the event that produced it", () => {
    // The file is a log of events, so `raised` is a thing that happened.
    // `open` is a thing that is true, and it is what consumers were promised.
    const { repo } = makeSandboxRepo();
    raiseOwed(repo, BRIEF);
    expect(foldOwed(readOwed(repo)).get(BRIEF.id)?.["state"]).toBe(STATE_OPEN);
  });

  it("derives severity from the class, so no caller can lower it", () => {
    const { repo } = makeSandboxRepo();
    raiseOwed(repo, BRIEF);
    raiseOwed(repo, { ...BRIEF, id: "blocker", decisionClass: CLASS_VERIFICATION_REDUCTION });
    const folded = foldOwed(readOwed(repo));
    expect(folded.get(BRIEF.id)?.["severity"]).toBe(SEVERITY_ADVISORY);
    expect(folded.get("blocker")?.["severity"]).toBe(SEVERITY_BLOCKING);
  });
});

describe("when the answer stops being true", () => {
  const base = {
    ecosystems: ["node"],
    hasExpensiveSuite: false,
    configFilename: "dabbler.yaml",
    sessionNumber: 1,
  };

  it("asks again once tests exist, which is what no-tests-yet promised", () => {
    const { repo } = makeSandboxRepo();
    refreshOwedDecisions(repo, { ...base, hasTestRoot: false });
    answerOwed(repo, ID_TESTING_SUITES, "no-tests-yet");
    expect(blockingDecisions(repo)).toHaveLength(0);

    const second = refreshOwedDecisions(repo, { ...base, hasTestRoot: true });
    expect(second?.["id"]).toBe(ID_TESTING_SUITES_NOW_TESTS_EXIST);
    expect(blockingDecisions(repo)).toHaveLength(1);
  });

  it("stays quiet while the answer is still true", () => {
    const { repo } = makeSandboxRepo();
    refreshOwedDecisions(repo, { ...base, hasTestRoot: false });
    answerOwed(repo, ID_TESTING_SUITES, "no-tests-yet");
    expect(refreshOwedDecisions(repo, { ...base, hasTestRoot: false })).toBeNull();
  });

  it("does not re-ask once a suite is finally declared", () => {
    const { repo } = makeSandboxRepo();
    refreshOwedDecisions(repo, { ...base, hasTestRoot: false });
    answerOwed(repo, ID_TESTING_SUITES, "no-tests-yet");
    expect(
      refreshOwedDecisions(repo, {
        ...base,
        hasTestRoot: true,
        hasExpensiveSuite: true,
      }),
    ).toBeNull();
  });
});

describe("the published current-record contract", () => {
  it("hands consumers a state and a severity, both required", () => {
    const { repo } = makeSandboxRepo();
    raiseOwed(repo, BRIEF);
    const [row] = currentDecisions(repo);
    expect(row["state"]).toBe(STATE_OPEN);
    expect(row["severity"]).toBe(SEVERITY_ADVISORY);
  });

  it("validates the fold, so a consumer cannot be handed an off-contract record", () => {
    const { repo } = makeSandboxRepo();
    raiseOwed(repo, BRIEF);
    answerOwed(repo, BRIEF.id, "attach");
    // Answered rows carry no brief of their own; the fold has to supply it,
    // and the contract is what proves it did.
    expect(() => currentDecisions(repo)).not.toThrow();
    expect(currentDecisions(repo)[0]["question"]).toBe(BRIEF.question);
  });
});

describe("writing the suite the operator asked for", () => {
  const ECO = [
    {
      key: "node",
      command: "npm test",
      runsWhole: true,
      testRoots: ["test"],
      testGlob: "*.test.js",
    },
  ];

  it("appends to a suites list that already exists", () => {
    // A repository whose suites are all cheap raises the blocking question
    // and then, until this, had no way through it: `declare` refused because
    // a list existed, so "safe" meant the operator edited the file by hand
    // forever.
    const { repo } = makeSandboxRepo();
    const path = join(repo, "dabbler.yaml");
    writeFileSync(
      path,
      [
        "schema_version: 1",
        "",
        "testing:",
        "  suites:",
        "    - name: cheap",
        "      command: echo hi",
        "      expensive: false",
        '      covers: ["."]',
        "",
      ].join("\n"),
      "utf8",
    );
    expect(appendSuitesToProjectConfig(repo, ECO)).toBe(path);
    const text = readFileSync(path, "utf8");
    expect(text).toContain("- name: cheap");
    expect(text).toContain("- name: node");
    expect(text.endsWith("\n")).toBe(true);
  });

  it("inserts into a testing mapping that carries no suites", () => {
    const { repo } = makeSandboxRepo();
    const path = join(repo, "dabbler.yaml");
    writeFileSync(
      path,
      ["schema_version: 1", "", "testing:", "  selection:", "    smoke: []", ""].join(
        "\n",
      ),
      "utf8",
    );
    expect(appendSuitesToProjectConfig(repo, ECO)).toBe(path);
    const text = readFileSync(path, "utf8");
    expect(text).toContain("  suites:");
    expect(text).toContain("- name: node");
    // One `testing:` key, or the later copy silently wins.
    expect(text.match(/^testing:/gm)).toHaveLength(1);
  });
});

describe("what a single persisted row tells a reader", () => {
  it("carries the state it produced and the severity it costs", () => {
    // Three rounds of verification argued about this. The log is an event
    // log, and a state token stored beside the event is a denormalisation --
    // but the mapping is one-to-one and both are written at the same instant,
    // so nothing can drift, and the alternative made every consumer of the
    // ledger reimplement the fold before it could read a state the record was
    // supposed to publish.
    const { repo } = makeSandboxRepo();
    raiseOwed(repo, { ...BRIEF, decisionClass: CLASS_VERIFICATION_REDUCTION });
    answerOwed(repo, BRIEF.id, "attach");
    const rows = readOwed(repo);
    expect(rows.map((row) => row["state"])).toEqual(["open", "answered"]);
    // Severity travels onto the later row: a reader of that row alone must be
    // able to tell what leaving it unanswered would have cost.
    expect(rows.every((row) => row["severity"] === SEVERITY_BLOCKING)).toBe(true);
  });

  it("agrees with the fold, because the fold no longer derives anything", () => {
    const { repo } = makeSandboxRepo();
    raiseOwed(repo, BRIEF);
    const [row] = readOwed(repo);
    expect(foldOwed(readOwed(repo)).get(BRIEF.id)?.["state"]).toBe(row["state"]);
  });
});

describe("a suites list that sits at its key's own column", () => {
  it("gains its new entry at the list's indentation, not the renderer's", () => {
    // YAML allows `suites:` and `- name:` at the same column. Reading the
    // key's indent as the list boundary would have inserted the new item
    // before the existing ones, at the wrong depth, producing a file that
    // does not parse.
    const { repo } = makeSandboxRepo();
    const path = join(repo, "dabbler.yaml");
    writeFileSync(
      path,
      [
        "schema_version: 1",
        "",
        "testing:",
        "  suites:",
        "  - name: cheap",
        "    command: echo hi",
        "    expensive: false",
        '    covers: ["."]',
        "",
      ].join("\n"),
      "utf8",
    );
    expect(
      appendSuitesToProjectConfig(repo, [
        {
          key: "node",
          command: "npm test",
          runsWhole: true,
          testRoots: ["test"],
          testGlob: "*.test.js",
        },
      ]),
    ).toBe(path);
    const parsed = parseYaml(readFileSync(path, "utf8")) as {
      testing: { suites: { name: string }[] };
    };
    expect(parsed.testing.suites.map((suite) => suite.name)).toEqual([
      "cheap",
      "node",
    ]);
  });
});

describe("a brief that changed after it was raised", () => {
  it("re-raises it, so the reader sees the question actually being asked", () => {
    // Idempotence on the ID meant a brief corrected in code never replaced
    // one already on disk. It was live: a recommendation was reversed and
    // the list went on printing the old one, advising the operator against
    // the thing the session existed to do.
    const { repo } = makeSandboxRepo();
    raiseOwed(repo, BRIEF);
    const again = raiseOwed(repo, {
      ...BRIEF,
      recommendation: "local-only",
    });
    expect(again).not.toBeNull();
    const current = currentDecisions(repo).find((row) => row["id"] === BRIEF.id);
    expect(current?.["recommendation"]).toBe("local-only");
    expect(current?.["state"]).toBe(STATE_OPEN);
  });

  it("stays silent when the brief is the same one", () => {
    // Otherwise every run of a verb that raises would append a row, which is
    // the per-session re-ask this record exists to end.
    const { repo } = makeSandboxRepo();
    raiseOwed(repo, BRIEF);
    expect(raiseOwed(repo, BRIEF)).toBeNull();
  });

  it("leaves an answered decision alone, however the brief changes", () => {
    // Rewriting a brief under a decision somebody made changes what they are
    // recorded as having agreed to.
    const { repo } = makeSandboxRepo();
    raiseOwed(repo, BRIEF);
    answerOwed(repo, BRIEF.id, "attach");
    expect(raiseOwed(repo, { ...BRIEF, question: "Something else entirely?" })).toBeNull();
    const current = currentDecisions(repo).find((row) => row["id"] === BRIEF.id);
    expect(current?.["question"]).toBe(BRIEF.question);
  });
});

describe("asking how a repository publishes", () => {
  it("asks the feed and the credential's name as two questions", () => {
    // They fail differently: a wrong feed sends a release somewhere real, a
    // wrong credential name sends a build nowhere at all.
    const { repo } = makeSandboxRepo();
    const raised = raisePackagingDecisions(repo, {
      ecosystem: "dotnet",
      packCommand: "dotnet pack -o {output}",
    });
    expect(raised.map((row) => String(row["id"])).sort()).toEqual(
      [ID_PACKAGING_FEED, ID_PACKAGING_SECRET].sort(),
    );
  });

  it("asks once, however often setup runs", () => {
    const { repo } = makeSandboxRepo();
    raisePackagingDecisions(repo, { ecosystem: "dotnet", packCommand: "dotnet pack" });
    expect(
      raisePackagingDecisions(repo, { ecosystem: "dotnet", packCommand: "dotnet pack" }),
    ).toEqual([]);
  });

  it("does not block a close on either of them", () => {
    // Publishing is external consequence, not verification reduction. A
    // session that has not decided where it publishes still closes.
    const { repo } = makeSandboxRepo();
    raisePackagingDecisions(repo, { ecosystem: "dotnet", packCommand: "dotnet pack" });
    expect(blockingDecisions(repo)).toEqual([]);
  });

  it("names the credential and never carries one", () => {
    const { repo } = makeSandboxRepo();
    const [, secret] = raisePackagingDecisions(repo, {
      ecosystem: "dotnet",
      packCommand: "dotnet pack",
    });
    expect(String(secret["question"])).toContain("NAME");
    expect(String(secret["determined"])).toContain("never does");
  });
});
