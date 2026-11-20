// A person's review: the verdict a person signs, where it may be given, and
// that an engine can never give it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { appendRound, readRounds } from "../src/ledger.ts";
import { writeRun } from "../src/driver.ts";
import { capture } from "../src/output.ts";
import { runPersonReview } from "../src/verify/personReview.ts";
import { type AnswerRow, gitAnswers, seed, tempDir } from "./support/answers.ts";

const TREE = "e".repeat(40);
const PLAN = "### Session 2 of 3: The fix\nMake a.ts say two.\n\n### Session 3 of 3: Later\nTouch b.\n";
const FINDING = { severity: "major", description: "a.ts still says one", blocking: true };

const RUN = {
  schema_version: 1, session_number: 2, engine: "cli", phase: "verify", seq: 9, invocations: 1,
  max_invocations: 24, accepted_steps: [], baseline_tree: null, stop: null,
  started_at: "2026-11-20T09:00:00-05:00", updated_at: "2026-11-20T10:00:00-05:00",
};

/** A repository whose session 2 is in flight, or closed with `verdict`, after one blocking round. */
function repository(status: "in-progress" | "complete", verdict: string | null): string {
  const repo = tempDir();
  seed(repo, {
    "docs/sessions/session-plan.md": PLAN,
    "docs/sessions/sessions.json": JSON.stringify({
      schemaVersion: 5,
      sessions: [
        { number: 1, title: "Before", status: "complete", verificationVerdict: "VERIFIED" },
        {
          number: 2,
          title: "The fix",
          status,
          verificationVerdict: verdict,
          startCommit: "5".repeat(40),
          orchestrator: { engine: "claude-code", provider: "anthropic", model: "claude-opus-5-5" },
        },
      ],
    }),
  });
  appendRound(repo, 2, {
    round: 1,
    verdict: "ISSUES_FOUND",
    blocking: true,
    reviewer_model: "m",
    reviewer_provider: "openai",
    orchestrator_provider: "anthropic",
    findings: [FINDING],
    completion_tree: "b".repeat(40),
    recorded_at: "2026-11-20T09:30:00.000000-05:00",
  });
  return repo;
}

function session2(repo: string): Record<string, unknown> {
  const state = JSON.parse(readFileSync(join(repo, "docs", "sessions", "sessions.json"), "utf8"));
  return (state.sessions as Record<string, unknown>[])[1] as Record<string, unknown>;
}

describe("a person's review", () => {
  const committed: string[] = [];
  let restore: () => void = () => {};
  before(() => {
    const answers: AnswerRow[] = [
      [(args) => args[0] === "cat-file" && args[1] === "-e", { code: 128 }],
      [["rev-parse", "--show-toplevel"], (_args, at) => ({ stdout: join(at, "..", "..") })],
      [["config", "user.name"], { stdout: "Pat Reviewer\n" }],
      [["rev-parse", "HEAD^{tree}"], { stdout: TREE }],
      [["rev-parse", "--verify", "HEAD"], { stdout: "d".repeat(40) }],
      [["read-tree"], { code: 0 }],
      [["add"], { code: 0 }],
      [["rm", "--cached"], { code: 0 }],
      [["write-tree"], { stdout: TREE }],
      [(args) => args[0] === "commit" || args[0] === "push", (args) => (committed.push(args.join(" ")), {})],
    ];
    restore = gitAnswers(answers);
  });
  after(() => restore());

  it("records the verdict at a verification stop, with who and why, on the tree reviewed", async () => {
    const repo = repository("in-progress", "ISSUES_FOUND");
    writeRun(repo, 2, {
      ...RUN,
      stop: { kind: "verification", code: "cap-reviewed", reason: "round 1 still blocks", at: "2026-11-20T10:00:00-05:00" },
    });
    const run = await capture(async () =>
      runPersonReview(join(repo, "docs", "sessions"), { sessionNumber: null, reason: "I read it; one stays", engine: false }),
    );
    assert.equal(run.value, 0, run.stderr);
    const row = readRounds(repo, 2).at(-1) as Record<string, unknown>;
    assert.equal(row["type"], "person_review");
    assert.equal(row["verdict"], "REVIEWED_BY_PERSON");
    assert.equal(row["reviewed_by"], "Pat Reviewer");
    assert.equal(row["reason"], "I read it; one stays");
    assert.equal(row["completion_tree"], TREE);
    assert.equal(session2(repo)["verificationVerdict"], "REVIEWED_BY_PERSON");
  });

  it("is refused where the session stands at no verification stop, and writes nothing", async () => {
    const repo = repository("in-progress", null);
    writeRun(repo, 2, RUN);
    const run = await capture(async () =>
      runPersonReview(join(repo, "docs", "sessions"), { sessionNumber: null, reason: "r", engine: false }),
    );
    assert.notEqual(run.value, 0);
    assert.match(run.stderr, /does not stand at a verification stop/);
    assert.equal(readRounds(repo, 2).length, 1);
  });

  it("turns a closed session that ended at the cap into REVIEWED_BY_PERSON, and commits it", async () => {
    const repo = repository("complete", "REMEDIATED_AT_CAP");
    committed.length = 0;
    const run = await capture(async () =>
      runPersonReview(join(repo, "docs", "sessions"), { sessionNumber: 2, reason: "a stated limitation", engine: false }),
    );
    assert.equal(run.value, 0, run.stderr);
    assert.equal(session2(repo)["verificationVerdict"], "REVIEWED_BY_PERSON");
    assert.equal((session2(repo)["verification"] as Record<string, unknown>)["reviewedBy"], "Pat Reviewer");
    assert.equal(readRounds(repo, 2).at(-1)?.["previous_tree"], "b".repeat(40));
    assert.match(committed[0] ?? "", /reviewed by Pat Reviewer after its close/);
  });

  it("is refused to an engine, and writes nothing", async () => {
    const repo = repository("complete", "REMEDIATED_AT_CAP");
    const run = await capture(async () =>
      runPersonReview(join(repo, "docs", "sessions"), { sessionNumber: 2, reason: "r", engine: true }),
    );
    assert.notEqual(run.value, 0);
    assert.match(run.stderr, /a person's verb, never the engine's/);
    assert.equal(readRounds(repo, 2).length, 1);
    assert.equal(session2(repo)["verificationVerdict"], "REMEDIATED_AT_CAP");
  });
});
