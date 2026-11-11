// The brief `dabbler consult` prints: read from the projection, so a fresh
// repository, a stopped session and a session in progress are records in a
// temp directory, and git is answered from a table.
import assert from "node:assert/strict";
import { join } from "node:path";
import { describe, it } from "node:test";

import { UNATTENDED_DENIED, consultBrief, mechanicBrief } from "../src/cli/consult.ts";
import { writeRun } from "../src/driver.ts";
import { appendAdvice, appendPackaging } from "../src/ledger.ts";
import { writeFileSync } from "node:fs";
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
    assert.match(brief, /rollback` keeps the work: .*`dabbler\/rolled-back\/s<N>-<time>`.*git checkout <branch> -- <paths>/);
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

  it("says where an exception to the standing stop is, and names its files", () => {
    const { repo, sessionsDir } = repository();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    const stop = { kind: "tests", reason: "the suite failed", at: "2026-08-31T12:30:00-04:00" };
    writeRun(repo, 1, { ...RUN, stop });
    const before = consultBrief(sessionsDir, 1);
    assert.match(before, /An exception to this stop: not requested, not checked, not authorised\./);
    assert.ok(before.includes("`docs/sessions/mechanic-log.md`") && before.includes("`.dabbler/runs/s1/exceptions.jsonl`"));
    assert.match(before, /`dabbler session waive` with no reason prints the card/);
    // A request of an earlier stop is not one of this stop.
    writeFileSync(join(sessionsDir, "mechanic-log.md"), "# Mechanic log\n\n## Session 1 -- tests\n\n- **Stop at:** `2026-08-31T09:00:00-04:00`\n- **Rule in the way:** the suite failed\n");
    assert.match(consultBrief(sessionsDir, 1), /An exception to this stop: not requested,/);
    writeFileSync(join(sessionsDir, "mechanic-log.md"), `# Mechanic log\n\n## Session 1 -- tests\n\n- **Stop at:** \`${stop.at}\`\n- **Rule in the way:** the suite failed\n`);
    const row = {
      schema_version: 1, session_number: 1, advice: true, stop: { ...stop, code: null, step_id: null },
      adviser: null, simulated: false, answer: null, unreachable: "nobody", recorded_at: "2026-08-31T12:40:00-04:00",
    };
    appendAdvice(repo, 1, row);
    assert.match(
      consultBrief(sessionsDir, 1),
      /An exception to this stop: requested \(an entry with a Rule in the way line, of this stop\), a check was asked for and the adviser could not be reached, not authorised\./,
    );
    appendAdvice(repo, 1, {
      ...row, adviser: { model: "gpt-x", provider: "openai" }, unreachable: null,
      answer: { classification: "framework-defect", reasoning: "r", recommendation: "s" }, recorded_at: "2026-08-31T12:50:00-04:00",
    });
    assert.match(consultBrief(sessionsDir, 1), /requested \(an entry with a Rule in the way line, of this stop\), checked by an adviser, not authorised\./);
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
    // No packaging row yet is itself the evidence, and it is said.
    assert.match(mechanicBrief(sessionsDir), /Latest packaging run: none recorded\./);
    appendPackaging(repo, 1, {
      recorded_at: "2026-08-31T12:20:00-04:00", session_number: 1, releasable: true,
      outcome: "refused", refusal: "no credential for the feed",
    });
    const brief = mechanicBrief(sessionsDir);
    assert.match(brief, /Latest packaging run: .*"outcome":"refused".*no credential for the feed/);
    assert.match(brief, /stopped in phase 'close'.*kind 'close'/);
    assert.match(brief, /no packaging run is on its record/);
    assert.match(brief, /Never write under \.dabbler\/runs\//);
    assert.match(brief, /Never weaken a gate, a verdict or a test/);
    assert.match(brief, /rollback` keeps the work: .*`dabbler\/rolled-back\/s<N>-<time>`.*git checkout <branch> -- <paths>/);
    assert.match(brief, /dabbler session hold-release/);
    assert.match(brief, /`dabbler session waive --reason "<why>"`.*never yours to type/);
    assert.match(brief, /dabbler verify reopen/);
    assert.match(brief, /Commit nothing and push nothing/);
    // The two instructions, as the session plan states them.
    assert.ok(brief.includes("- Diagnose, recommend, and act only when the person agrees.\n"));
    assert.ok(brief.includes("- Make the minimum viable unblocking fix and record it in `docs/sessions/mechanic-log.md`.\n"));
  });

  it("tells the Mechanic, attended or not, to ask for an exception rather than work around a rule", () => {
    const { repo, sessionsDir } = repository();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    writeRun(repo, 1, {
      ...RUN,
      phase: "work",
      stop: { kind: "rejected-thrice", reason: "the step was refused three times", at: "2026-08-31T12:30:00-04:00" },
    });
    const unattended = mechanicBrief(sessionsDir, { memoPath: ".dabbler/scratch/mechanic-memo-s1.md" });
    for (const brief of [mechanicBrief(sessionsDir), unattended]) {
      assert.match(brief, /do not work around it -- ask/);
      for (const line of ["Stop at", "Rule in the way", "Why it is wrong here", "What going past it lets through", "What was tried within the rules"]) {
        assert.ok(brief.includes(`**${line}:**`), line);
      }
    }
    assert.match(unattended, /say in the memo that an exception is requested/);
  });

  it("called in unattended, carries the deny-list and the memo path, and asks for no consent", () => {
    const { repo, sessionsDir } = repository();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    writeRun(repo, 1, {
      ...RUN,
      phase: "work",
      stop: { kind: "rejected-thrice", reason: "the step was refused three times", at: "2026-08-31T12:30:00-04:00" },
    });
    const brief = mechanicBrief(sessionsDir, { memoPath: ".dabbler/scratch/mechanic-memo-s1.md" });
    for (const denied of UNATTENDED_DENIED) assert.ok(brief.includes(denied), denied);
    assert.match(brief, /memo to `\.dabbler\/scratch\/mechanic-memo-s1\.md`/);
    assert.match(brief, /keeps to the approved plan/);
    assert.ok(!brief.includes("act only when the person agrees"));
    assert.ok(!brief.includes("Once the person agrees"));
  });

  it("called in on a refused publish, diagnoses only, reads the whole job log and names both causes", () => {
    const { repo, sessionsDir } = repository();
    registerSessionStart(sessionsDir, 1, { engine: "claude-code" });
    writeRun(repo, 1, {
      ...RUN,
      phase: "publish",
      stop: { kind: "publish", reason: "the packaging run did not publish: 401", at: "2026-08-31T12:30:00-04:00" },
    });
    const brief = mechanicBrief(sessionsDir, { memoPath: ".dabbler/scratch/mechanic-memo-s1.md" });
    assert.match(brief, /make no edit, write no mechanic-log entry/);
    assert.match(brief, /`\.dabbler\/runs\/s1\/jobs\/publish\.log`/);
    assert.match(brief, /the release resumes at publish/);
    assert.match(brief, /new release session/);
    assert.ok(!brief.includes("minimum viable unblocking fix"));
  });
});
