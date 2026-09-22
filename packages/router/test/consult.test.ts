// The brief `dabbler consult` prints: read from the projection, so a fresh
// repository, a stopped session and a session in progress are records in a
// temp directory, and git is answered from a table.
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import { MECHANIC_INSTRUCTIONS, consultBrief, mechanicBrief } from "../src/cli/consult.ts";
import { writeRun } from "../src/driver.ts";
import { registerSessionStart } from "../src/writers.ts";
import { gitAnswers, seed, tempDir } from "./support/answers.ts";

const PLAN = "### Session 1 of 2: First things\n1. Register.\n\n### Session 2 of 2: Second things\n1. Register.\n";

gitAnswers([
  [["rev-parse", "--show-toplevel"], (_args, root) => ({ stdout: root.split("\\").join("/") })],
  [["status", "--porcelain", "-uall"], { stdout: "" }],
  [["status", "--porcelain"], { stdout: "" }],
  [(args) => args[0] === "cat-file" && args[1] === "-e", { code: 0 }],
  [["commit-tree"], { stdout: "c".repeat(40) }],
  [["update-ref"], { code: 0 }],
]);

function repository(): { repo: string; sessionsDir: string } {
  const repo = tempDir("consult-");
  seed(repo, { "docs/sessions/session-plan.md": PLAN, ".gitignore": ".dabbler/\n" });
  return { repo, sessionsDir: join(repo, "docs", "sessions") };
}

const RUN = {
  schema_version: 1, session_number: 1, engine: "cli", phase: "steps", seq: 3, invocations: 1,
  max_invocations: 24, accepted_steps: [], baseline_tree: null,
  started_at: "2026-08-31T11:00:00-04:00", updated_at: "2026-08-31T12:00:00-04:00",
};

describe("consultBrief", () => {
  it("names the plan files and the next free session number where nothing is in progress", () => {
    const { sessionsDir } = repository();
    const brief = consultBrief(sessionsDir);
    assert.match(brief, /docs\/sessions\/session-plan\.md/);
    assert.match(brief, /docs\/sessions\/project-work-plan\.md/);
    assert.match(brief, /next free number is 3\b/);
  });

  it("names a stopped session's stop kind and its forward exits", () => {
    const { repo, sessionsDir } = repository();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    writeRun(repo, 1, { ...RUN, stop: { kind: "engine", reason: "it could not be done", at: "2026-08-31T12:30:00-04:00" } });
    const brief = consultBrief(sessionsDir, 1);
    assert.match(brief, /paused \(engine\)/);
    assert.match(brief, /it could not be done/i);
    assert.match(brief, /dabbler verify reopen/);
    assert.match(brief, /dabbler session plan amend/);
    assert.match(brief, /`dabbler session cancel --force` is the person's verb only/);
    // A stop that is the operator's says how a person carries it on: through the AI.
    writeRun(repo, 1, { ...RUN, stop: { kind: "verification", code: "cap-disputed", reason: "one dispute stands", at: "2026-08-31T12:30:00-04:00" } });
    const operators = consultBrief(sessionsDir, 1);
    assert.match(operators, /Stopped for: operator\./);
    assert.match(operators, /ask the AI working the session to run `dabbler session next`/);
    // A stop that is the engine's to clear is cleared by its next answer.
    writeRun(repo, 1, { ...RUN, stop: { kind: "verification", code: "dispute-refused", reason: "over the inline cap", at: "2026-08-31T12:30:00-04:00" } });
    const engines = consultBrief(sessionsDir, 1);
    assert.match(engines, /clears this stop by answering again/);
    assert.doesNotMatch(engines, /Resume Session|ask the AI working the session to run/);
  });

  it("permits plan edits only while no session is in progress", () => {
    const { sessionsDir } = repository();
    assert.match(consultBrief(sessionsDir), /Edit and commit the plan files/);
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const brief = consultBrief(sessionsDir);
    assert.doesNotMatch(brief, /Edit and commit the plan files/);
    assert.match(brief, /Do NOT edit the plan files now\. Session 1 is in progress/);
    assert.match(brief, /Draft the text in the chat/);
  });

  it("says every file a consult changes is committed and pushed before it ends", () => {
    const { sessionsDir } = repository();
    assert.match(consultBrief(sessionsDir), /committed and pushed before the consultation ends, never left in the tree/);
  });
});

describe("mechanicBrief", () => {
  it("quotes the stop, names the rules and the person's verbs, and carries the instructions verbatim", () => {
    const { repo, sessionsDir } = repository();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    writeRun(repo, 1, {
      ...RUN,
      phase: "close",
      stop: { kind: "close", reason: "no packaging run is on its record", at: "2026-08-31T12:30:00-04:00" },
    });
    const brief = mechanicBrief(sessionsDir);
    assert.match(brief, /stopped in phase 'close'.*kind 'close'/);
    assert.match(brief, /no packaging run is on its record/);
    assert.match(brief, /Never write under \.dabbler\/runs\//);
    assert.match(brief, /Never weaken a gate, a verdict or a test/);
    assert.match(brief, /dabbler session hold-release/);
    assert.match(brief, /dabbler verify reopen/);
    assert.ok(brief.includes(MECHANIC_INSTRUCTIONS));
  });
});
