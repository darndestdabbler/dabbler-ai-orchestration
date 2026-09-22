// The round's own rules: which findings block, when no further round may
// open, and what the run of record asks for. Rows in a temp directory.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { proposalOutcomes, recordProposal } from "../src/writers.ts";
import { appendDispute, appendRound, readRounds } from "../src/ledger.ts";
import {
  DRIVER_RUNS_THE_REST,
  NO_ROUND_CAP_CLEAN,
  NO_ROUND_CAP_DISPUTED,
  NO_ROUND_TERMINAL,
  blockingFindings,
  dispatchVerification,
  droppedParams,
  noRoundReason,
  parseProposalRuling,
  reportedInputTokens,
  ruleOnProposal,
  runOfRecordLines,
  substitutionNote,
  turnCount,
  verificationUnavailable,
} from "../src/verify/rounds.ts";
import {
  CAUSE_VENDOR_CONFLICT,
  DispatchError,
  NoCandidateError,
  setRouteSource,
  type RouteResult,
} from "../src/route.ts";
import { gitAnswers, tempDir } from "./support/answers.ts";

// A directory with no repository holds no object, so a round's tree is never
// anchored: that is what git said of a temp directory before, and it is fed
// here so nothing is spawned to say it again.
gitAnswers([[(args) => args[0] === "cat-file" && args[1] === "-e", { code: 128 }]]);

const finding = (blocking: boolean) => ({ severity: blocking ? "major" : "minor", description: "d", blocking });

describe("what a round says it cost", () => {
  const base = {
    round: 1,
    verdict: "VERIFIED",
    blocking: false,
    findings: [],
    completion_tree: "a".repeat(40),
    recorded_at: "2026-09-05T12:00:00.000000-04:00",
  };

  it("carries what was asked for, what answered, and what it cost", () => {
    // The 364-request session charged a personal seat and its record could
    // say only which model answered: no requested id, no escalation
    // history, no turn count. Each of these was in the dispatch result and
    // was dropped at the append.
    const repo = tempDir();
    appendRound(repo, 7, {
      ...base,
      verifier_model: "gemini-3.5-flash",
      verifier_provider: "google",
      requested_model: "gemini-3.5-flash",
      served_model: null,
      escalation_history: [["gpt-5.4", "empty_response"]],
      input_tokens: 12000,
      output_tokens: 900,
      premium_requests: 14,
      tool_calls: 26,
    });
    const [row] = readRounds(repo, 7);
    assert.equal(row["requested_model"], "gemini-3.5-flash");
    // The provider said nothing, which is not the same as "it served what
    // was asked" and must stay distinguishable.
    assert.equal(row["served_model"], null);
    assert.deepEqual(row["escalation_history"], [["gpt-5.4", "empty_response"]]);
    assert.equal(row["premium_requests"], 14);
    // The multiplier a round count cannot show.
    assert.equal(row["tool_calls"], 26);
  });

  it("records every generation param the vendor refused and the call ran without", () => {
    const repo = tempDir();
    const dropped = [
      { param: "effort", reason: "This model does not support the effort parameter." },
      { param: "thinking", reason: "adaptive thinking is not supported on this model" },
    ];
    appendRound(repo, 9, {
      ...base,
      verifier_model: "claude-haiku-4-5",
      verifier_provider: "anthropic",
      dropped_params: droppedParams({ dropped_params: dropped }),
    });
    const [row] = readRounds(repo, 9);
    assert.deepEqual(row["dropped_params"], dropped);
    assert.deepEqual(droppedParams({}), []);
  });

  it("still reads a round from before it counted, and does not call its silence zero", () => {
    // A row without these is not a free round; it is a round from before
    // the framework counted, and reading absence as 0 would understate
    // exactly the sessions this record exists to explain.
    const repo = tempDir();
    appendRound(repo, 7, { ...base, verifier_model: "gpt-5.4", verifier_provider: "openai" });
    const [row] = readRounds(repo, 7);
    assert.equal(row["premium_requests"], undefined);
    assert.equal(row["tool_calls"], undefined);
    assert.equal(row["escalation_history"], undefined);
  });

  it("counts the seat's turns and does not call its unreported prompt zero", () => {
    // Both from round 1 of this session's own verification. The seat
    // reports its turns as the LIST of tool calls, so a reader expecting a
    // number wrote null and lost the multiplier it was added to capture;
    // and it reports no prompt count at all, so copying the result type's 0
    // would read as a round that sent no prompt.
    const repo = tempDir();
    appendRound(repo, 8, {
      ...base,
      verifier_model: "claude-sonnet-4.6",
      verifier_provider: "anthropic",
      tool_calls: turnCount([{ id: "t1" }, { id: "t2" }, { id: "t3" }]),
      input_tokens: reportedInputTokens(0, { input_tokens_reported: false }),
    });
    const [row] = readRounds(repo, 8);
    assert.equal(row["tool_calls"], 3);
    assert.equal(row["input_tokens"], null);
  });

  it("refuses a cost that is not a number, rather than storing whatever arrived", () => {
    const repo = tempDir();
    assert.throws(() =>
      appendRound(repo, 7, { ...base, premium_requests: "fourteen" }),
    );
  });
});

describe("which findings block", () => {
  it("counts every finding not marked non-blocking, and none of an empty or absent list", () => {
    assert.equal(blockingFindings({ findings: [finding(true), finding(false), { description: "unmarked" }] }).length, 2);
    assert.deepEqual(blockingFindings({}), []);
  });
});

describe("whether another round may open", () => {
  const round = (n: number, blocking: boolean, extra: Record<string, unknown> = {}) => ({ round: n, blocking, findings: blocking ? [finding(true)] : [], ...extra });

  it("opens the first round and any round under the cap", () => {
    assert.equal(noRoundReason(tempDir(), 1, [], 3), null);
    assert.equal(noRoundReason(tempDir(), 1, [round(1, true)], 3), null);
  });

  it("stops at a terminal row, and at the cap when the last round left nothing blocking", () => {
    assert.equal(noRoundReason(tempDir(), 1, [round(1, true), { round: 2, type: "adjudication", blocking: false }], 3), NO_ROUND_TERMINAL);
    assert.equal(noRoundReason(tempDir(), 1, [round(1, true), round(2, true), round(3, false)], 3), NO_ROUND_CAP_CLEAN);
  });

  it("at the cap with blocking findings, terminates when they were fixed and adjudicates when every one is disputed", () => {
    const rows = [round(1, true), round(2, true), round(3, true)];
    assert.equal(noRoundReason(tempDir(), 1, rows, 3), null);
    const repo = tempDir();
    appendDispute(repo, 1, { round: 3, finding_index: 0, filed_after_round: 3, grounds: "wrong", evidence_paths: ["a.py"], recorded_at: "2026-01-01T00:00:00+00:00" });
    assert.equal(noRoundReason(repo, 1, rows, 3), NO_ROUND_CAP_DISPUTED);
  });
});

describe("what stands between a verified tree and a close", () => {
  it("names the declared suite's run of record, and only the push when no expensive suite is declared", async () => {
    // The suite itself runs as a job the driver spawned, so the marker is
    // in this process's environment; the typed answer is the one WITHOUT it.
    const before = process.env["DABBLER_DRIVEN"];
    delete process.env["DABBLER_DRIVEN"];
    try {
      const generic = await runOfRecordLines("docs/sessions", { testing: {} } as never);
      assert.match(generic, /The run of record and the push remain before `dabbler session close`/);
      const named = await runOfRecordLines("docs/sessions", { testing: { suites: [{ name: "unit", command: "npm test", expensive: true, covers: ["."] }] } } as never);
      assert.ok(named.includes("npm test") && named.includes("unit"));
    } finally {
      if (before !== undefined) process.env["DABBLER_DRIVEN"] = before;
    }
  });

  it("names nothing but the driver when the driver spawned it", async () => {
    // The job log is where the managed body sends an engine during a wait,
    // and a recipe there was read as an instruction.
    const before = process.env["DABBLER_DRIVEN"];
    process.env["DABBLER_DRIVEN"] = "1";
    try {
      const driven = await runOfRecordLines("docs/sessions", { testing: { suites: [{ name: "unit", command: "npm test", expensive: true, covers: ["."] }] } } as never);
      assert.equal(driven, DRIVER_RUNS_THE_REST);
      assert.doesNotMatch(driven, /npm test|test-evidence|session close/);
    } finally {
      if (before === undefined) delete process.env["DABBLER_DRIVEN"];
      else process.env["DABBLER_DRIVEN"] = before;
    }
  });
});

describe("what a round says about the model that answered", () => {
  it("says nothing when the provider did not name one, and nothing when it named the model asked for", () => {
    // "The provider did not say" and "it served what was asked" are two
    // facts, and the row's own comment says so. Neither is a substitution.
    assert.equal(substitutionNote("gpt-5.4", null), null);
    assert.equal(substitutionNote("gpt-5.4", ""), null);
    assert.equal(substitutionNote("gpt-5.4", "gpt-5.4"), null);
    // A dated snapshot pin is the model that was asked for. A round that
    // warned about one would make the warning that matters routine.
    assert.equal(substitutionNote("gpt-5.4", "gpt-5.4-20260901"), null);
  });

  it("names both models when a different one answered, and calls it a note rather than a failure", () => {
    const note = substitutionNote("gpt-5.4", "gpt-5-mini");
    assert.ok(note !== null);
    assert.match(note, /gpt-5\.4/);
    assert.match(note, /gpt-5-mini/);
    // A provider substituting a model is a fact about what was bought, not a
    // verification failure: the verdict stands and the round is not refused.
    assert.match(note, /verdict stands/);
  });
});

describe("the reviewer a call that failed is retried against", () => {
  const answered = (provider: string): RouteResult => ({
    content: "VERDICT: VERIFIED",
    model_name: `${provider}-model`,
    model_id: "x",
    provider,
    input_tokens: 1,
    output_tokens: 1,
    escalated: false,
    escalation_history: [],
    elapsed_seconds: 0.1,
    transport: "offline",
    truncated: false,
    transport_session_id: null,
    served_model_id: null,
    metadata: {},
  });

  it("is the one the operator chose: the failed provider is not excluded, and the failure is said", async () => {
    // Excluding it is how a service that was briefly unavailable reached a
    // person as a vendor conflict -- "'gpt-5.6-terra' is OpenAI's, and so
    // is the authoring model" -- which was false, and which only the
    // operator could resolve.
    const exclusions: string[][] = [];
    const restore = setRouteSource((_content, options) => {
      exclusions.push([...(options.excludeProviders ?? [])]);
      if (exclusions.length === 1) {
        return Promise.reject(new DispatchError("503 from the provider", "openai", "gpt-5.6-sol"));
      }
      return Promise.resolve(answered("openai"));
    });
    const said: string[] = [];
    try {
      const result = await dispatchVerification("prompt", {
        excludeProviders: ["anthropic"],
        sessionNumber: 1,
        onFailed: (message, provider) => said.push(`${provider}: ${message}`),
      });
      assert.equal(result.provider, "openai");
    } finally {
      restore();
    }
    // The authoring vendor stays excluded on both attempts, and nothing else
    // is added to the exclusion.
    assert.deepEqual(exclusions, [["anthropic"], ["anthropic"]]);
    assert.deepEqual(said, ["openai: 503 from the provider"]);
  });

  it("ends on a failure that repeats, in the transport's own words", async () => {
    const restore = setRouteSource(() =>
      Promise.reject(new DispatchError("503 from the provider", "openai", "gpt-5.6-sol")),
    );
    try {
      await assert.rejects(
        dispatchVerification("prompt", { excludeProviders: ["anthropic"], sessionNumber: 1 }),
        (error: Error) => {
          assert.match(error.message, /503 from the provider/);
          // What failed, never that the choice was wrong.
          assert.doesNotMatch(error.message, /is OpenAI's/);
          return true;
        },
      );
    } finally {
      restore();
    }
  });
});

describe("a proposal, ruled on once", () => {
  const answering = (content: string): RouteResult => ({
    content,
    model_name: "gpt-5.6-sol",
    model_id: "gpt-5.6-sol",
    provider: "openai",
    input_tokens: 1,
    output_tokens: 1,
    escalated: false,
    escalation_history: [],
    elapsed_seconds: 0.1,
    transport: "offline",
    truncated: false,
    transport_session_id: null,
    served_model_id: null,
    metadata: {},
  });

  it("records an endorsement and a returned finding against the proposal, opens no round, and rules once", async () => {
    const repo = tempDir();
    const sessionsDir = join(repo, "docs", "sessions");
    mkdirSync(sessionsDir, { recursive: true });
    const why = "Hibernate 6 ships the SQLite dialect outside hibernate-core";
    recordProposal(sessionsDir, { sessionNumber: 3, change: { kind: "max-rounds", cap: 4 }, reason: why, by: "claude-code" });
    recordProposal(sessionsDir, { sessionNumber: 3, change: { kind: "hold-release" }, reason: "no feed", by: "claude-code" });
    const options = { excludeProviders: ["anthropic"], authorModel: "claude-sonnet-5", repoRoot: repo };
    const answers = [
      'Here is my ruling: {"ruling": "endorse", "reason": "H2 is inside hibernate-core"}',
      '{"ruling": "finding", "finding": {"description": "Configure the feed instead", "severity": "major"}}',
    ];
    const prompts: string[] = [];
    const restore = setRouteSource((content) => {
      prompts.push(content);
      return Promise.resolve(answering(answers[prompts.length - 1]!));
    });
    try {
      assert.equal((await ruleOnProposal(sessionsDir, 3, 1, options)).ruling, "endorse");
      assert.equal((await ruleOnProposal(sessionsDir, 3, 2, options)).ruling, "finding");
      await assert.rejects(ruleOnProposal(sessionsDir, 3, 1, options), /already ruled on/);
    } finally {
      restore();
    }
    assert.ok(prompts[0]!.includes(why));
    const outcomes = proposalOutcomes(sessionsDir, 3);
    assert.deepEqual(
      outcomes.map((entry) => [entry["proposal"], entry["outcome"], entry["by"]]),
      [
        [1, "endorsed", "gpt-5.6-sol (openai)"],
        [2, "finding", "gpt-5.6-sol (openai)"],
      ],
    );
    assert.deepEqual(outcomes[1]!["finding"], { description: "Configure the feed instead", severity: "major" });
    // No round row: a ruling spends none of the round cap.
    assert.deepEqual(readRounds(repo, 3), []);
    // An answer that is neither endorses nothing.
    assert.equal(parseProposalRuling("I think it is fine").ruling, "unclear");
  });
});

describe("what verify says when no reviewer can be dispatched", () => {
  it("carries the ladder's cause and ways forward, and never points at packaged configuration", () => {
    const stop = new NoCandidateError(
      "you chose 'gpt-5.6-sol' for the Primary Reviewer, and this call cannot dispatch to it: " +
        "'gpt-5.6-sol' is OpenAI's, and so is the authoring model.",
      CAUSE_VENDOR_CONFLICT,
    );
    const text = verificationUnavailable("docs/sessions", "openai", stop);
    assert.match(text, /VERIFICATION UNAVAILABLE/);
    assert.match(text, /is OpenAI's, and so is the authoring model/);
    assert.match(text, /dabbler verify --sessions-dir docs\/sessions/);
    assert.doesNotMatch(text, /router-config\.yaml/);
  });
});
