// `dabbler triage`: who gets asked, what comes back, and what is refused.
// The rules a stop cites, the prompt over literal artifacts, the answer's
// shape; and one triage over a stopped session with the router scripted.
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import { CONFIG_ENV_VAR } from "../src/config.ts";
import { DRIVER_SCHEMA_VERSION, readRun, writeInstruction, writeRun } from "../src/driver.ts";
import { TriageError, buildTriagePrompt, citedRules, parseTriageAnswer, ruleSourceFor, triage } from "../src/triage.ts";
import { registerSessionStart } from "../src/writers.ts";
import { cleanRepoAnswers, makeConfig, routeAnswers, seed, setProviderKeys, tempDir, type RoutedCall } from "./support/answers.ts";
import { writeFileSync } from "node:fs";
import { stringify as stringifyYaml } from "yaml";

const ANSWER = JSON.stringify({
  classification: "plan-defect",
  reasoning: "The step declares a file its own check forbids, so no report can satisfy both.",
  recommendation: "Amend the step's files and ask for it again.",
  amendment: { step_id: "widget", files: ["src/widget.py"], reason: "Dropping the file the check forbids is the smallest change that lets it pass.", relaxes_a_gate: false },
});

const STOP = { kind: "rejected-thrice", reason: "[files-changed-omits] files_changed omits 'src/widget.py', which the tree changed", at: "2026-08-31T12:00:00-04:00", step_id: "widget", class: "deadlock" };

describe("what a stop cites", () => {
  it("reads each rule slug once, in the order it first appears, and quotes the driver's own source for it", () => {
    assert.deepEqual(citedRules(["[files-changed-omits] x", "[check-failed] y", "[files-changed-omits] z", "no slug here"]), ["files-changed-omits", "check-failed"]);
    const source = ruleSourceFor(["files-changed-omits"]);
    assert.ok(source["files-changed-omits"].includes("RULE.filesChangedOmits") || source["files-changed-omits"].includes("not readable"));
  });
});

describe("the adviser's brief and answer", () => {
  it("carries the stop with its class, the refusal, the rule as stated, the step, the report and the transcript tail", () => {
    const prompt = buildTriagePrompt({
      sessionNumber: 1,
      instruction: { seq: 3, kind: "rejection", step_id: "widget" } as never,
      report: null,
      run: { stop: STOP, stop_history: [{ kind: "verification", reason: "earlier", step_id: null }] } as never,
      reasons: [STOP.reason],
      rules: ["files-changed-omits"],
      ruleSource: { "files-changed-omits": "RULE.filesChangedOmits: ..." },
      step: { id: "widget", ask: "Make widget() return 2.", files: ["src/widget.py"], checks: [] },
      transcriptTail: "",
    });
    assert.ok(prompt.includes("class: deadlock") && prompt.includes("[files-changed-omits]") && prompt.includes("RULE.filesChangedOmits"));
    assert.ok(prompt.includes("verification on -: earlier") && prompt.includes("Make widget() return 2.") && prompt.includes("(none)"));
  });

  it("reads a JSON answer, fenced or bare, and refuses one that is not JSON or does not fit the shape", () => {
    assert.equal(parseTriageAnswer(ANSWER).classification, "plan-defect");
    assert.equal(parseTriageAnswer("```json\n" + ANSWER + "\n```").amendment?.step_id, "widget");
    assert.throws(() => parseTriageAnswer("I think the plan is wrong."), TriageError);
    assert.throws(() => parseTriageAnswer(JSON.stringify({ classification: "nobody-s-fault", reasoning: "x", recommendation: "y" })), TriageError);
  });
});

describe("dabbler triage over a stopped session", () => {
  function stoppedSession(): { repo: string; sessionsDir: string } {
    const repo = tempDir();
    seed(repo, { "docs/sessions/session-plan.md": "### Session 1 of 1: First things\n1. Register.\n2. **Build the widget.** Make it real.\n" });
    const sessionsDir = join(repo, "docs", "sessions");
    cleanRepoAnswers(repo);
    setProviderKeys();
    const config = join(tempDir(), "router-config.yaml");
    writeFileSync(config, stringifyYaml(makeConfig()), "utf8");
    process.env[CONFIG_ENV_VAR] = config;
    registerSessionStart(sessionsDir, 1, { engine: "claude-code", provider: "anthropic" });
    const run = {
      schema_version: DRIVER_SCHEMA_VERSION, session_number: 1, engine: "claude-code", phase: "steps", seq: 3, invocations: 0,
      max_invocations: 24, accepted_steps: [], baseline_tree: null, stop: STOP, started_at: "2026-08-31T11:00:00-04:00", updated_at: "2026-08-31T12:00:00-04:00",
    };
    writeRun(repo, 1, run as never);
    writeInstruction(repo, 1, {
      schema_version: DRIVER_SCHEMA_VERSION, seq: 3, session_number: 1, issued_at: "2026-08-31T12:00:00-04:00", kind: "rejection", step_id: "widget",
      ask: "Make widget() return 2.", reasons: [STOP.reason], answer_schema: "driver-report.schema.json", answer_command: "dabbler session report --seq 3",
    } as never);
    return { repo, sessionsDir };
  }

  it("asks a provider that is not the working engine's, and refuses an answer that does not fit, once more when the shape is said again", async () => {
    const { sessionsDir } = stoppedSession();
    const calls: RoutedCall[] = [];
    const restore = routeAnswers([["openai", ANSWER]], { calls });
    try {
      const outcome = await triage(sessionsDir);
      assert.deepEqual(outcome.excluded, ["anthropic"]);
      assert.equal(outcome.adviser.provider, "openai");
      assert.equal(outcome.answer.classification, "plan-defect");
      assert.equal(calls.length, 1);
      assert.ok(calls[0].content.includes("class: deadlock") && calls[0].content.includes("[files-changed-omits]"));
      assert.deepEqual(calls[0].exclude, ["anthropic"]);
    } finally {
      restore();
    }
    const refused: RoutedCall[] = [];
    const again = routeAnswers([["openai", "I think the plan is wrong."], ["openai", JSON.stringify({ classification: "nobody-s-fault", reasoning: "x", recommendation: "y" })]], { calls: refused });
    try {
      await assert.rejects(triage(sessionsDir), TriageError);
      assert.equal(refused.length, 2);
    } finally {
      again();
    }
  });

  it("asks nobody about a run that has not stopped", async () => {
    const { repo, sessionsDir } = stoppedSession();
    writeRun(repo, 1, { ...readRun(repo, 1), stop: null } as never);
    const calls: RoutedCall[] = [];
    const restore = routeAnswers([["openai", ANSWER]], { calls });
    try {
      await assert.rejects(triage(sessionsDir), /has not stopped/);
      assert.deepEqual(calls, []);
    } finally {
      restore();
    }
  });
});
