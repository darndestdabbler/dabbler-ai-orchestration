// The run ledger: append-only rows under .dabbler/runs, read back strictly.
// Every row here is a file in a temp directory; the one git question the
// writer asks (does this tree exist, to anchor it) is answered from a table.
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { appendWorkerResult, quarantineDir, writeReviewRun } from "../src/critique.ts";
import { platformNewlines } from "../src/journal.ts";
import {
  LedgerError,
  appendDispute,
  appendPackaging,
  appendReanchor,
  appendRound,
  closedStepIds,
  effectiveBaseline,
  lastClosedTree,
  nextRoundNumber,
  openStep,
  openStepsInRepo,
  readJsonl,
  readRounds,
  sessionRunDir,
} from "../src/ledger.ts";
import { dumps } from "../src/pythonJson.ts";
import { VERSION } from "../src/version.ts";
import { existsSync } from "node:fs";
import { gitAnswers, tempDir } from "./support/answers.ts";

const ROUND = {
  round: 1,
  verdict: "VERIFIED",
  blocking: false,
  findings: [],
  completion_tree: "0".repeat(40),
  recorded_at: "2026-01-01T00:00:00+00:00",
  verifier_model: "gpt",
  verifier_provider: "openai",
};

// The store holds no objects: every anchor question is answered "no", so
// no row can carry an anchor. The walkthrough is where a real tree anchors.
gitAnswers([
  [(args) => args[0] === "cat-file" && args[1] === "-e", { code: 1 }],
  [["rev-parse", "--show-toplevel"], (_args, root) => ({ stdout: root.split("\\").join("/") })],
]);

function writeRows(repo: string, filename: string, rows: unknown[]): string {
  const directory = sessionRunDir(repo, 1);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, filename);
  writeFileSync(path, platformNewlines(rows.map((row) => dumps(row)).join("\n") + "\n"), "utf8");
  return path;
}

describe("reading the round ledger", () => {
  it("refuses a line that is not valid JSON rather than skipping it", () => {
    // Machine-written, so a bad line is tampering or corruption, never noise.
    const repo = tempDir();
    const directory = sessionRunDir(repo, 1);
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "rounds.jsonl"), "{not json}\n", "utf8");
    assert.throws(() => readRounds(repo, 1), LedgerError);
  });

  it("refuses a row that does not match its schema", () => {
    const repo = tempDir();
    writeRows(repo, "rounds.jsonl", [{ round: 1 }]);
    assert.throws(() => readRounds(repo, 1), /schema validation/);
  });

  it("reads a file the writer left with this host's line endings, and nothing from one that is not there", () => {
    const repo = tempDir();
    writeRows(repo, "rounds.jsonl", [ROUND]);
    assert.equal(readRounds(repo, 1).length, 1);
    assert.deepEqual(readRounds(tempDir(), 1), []);
  });
});

describe("appending a round", () => {
  it("records the row the reader reads back, stamped with the framework version in the writer", () => {
    // Stamped here rather than at the call sites that build a row, because
    // a stamp a caller can forget is absent on the row that most needed it.
    const repo = tempDir();
    const row = appendRound(repo, 1, { ...ROUND });
    assert.equal(row["framework_version"], VERSION);
    assert.equal(readRounds(repo, 1)[0]?.["framework_version"], VERSION);
  });

  it("carries no anchor for a tree this store does not hold", () => {
    // A row can only anchor an object it has; inventing one would be a
    // baseline nobody snapshotted.
    const row = appendRound(tempDir(), 1, { ...ROUND });
    assert.equal("anchor_commit" in row, false);
  });

  it("refuses a second row for the same round, because rounds are history", () => {
    const repo = tempDir();
    appendRound(repo, 1, { ...ROUND });
    assert.throws(() => appendRound(repo, 1, { ...ROUND }), /append-only and never overwritten/);
  });

  it("refuses a row that does not match the schema, writing nothing", () => {
    const repo = tempDir();
    assert.throws(() => appendRound(repo, 1, { round: 1 }), LedgerError);
    assert.deepEqual(readRounds(repo, 1), []);
  });

  it("takes the next round number from the last row", () => {
    const repo = tempDir();
    appendRound(repo, 1, { ...ROUND });
    assert.equal(nextRoundNumber(repo, 1), 2);
  });
});

describe("appending to the ledger", () => {
  it("refuses a second re-anchor for one round", () => {
    const repo = tempDir();
    const row = {
      round: 1, recorded_tree: "0".repeat(40), anchor_tree: "a".repeat(40),
      anchor_commit: "b".repeat(40), reason: "moved", recorded_at: "2026-01-01T00:00:00+00:00",
    };
    appendReanchor(repo, 1, { ...row });
    assert.throws(() => appendReanchor(repo, 1, { ...row }), /recovered once/);
  });

  it("refuses a second dispute of one finding", () => {
    const repo = tempDir();
    const row = {
      round: 1, finding_index: 0, filed_after_round: 1, grounds: "misread",
      evidence_paths: ["a.py"], recorded_at: "2026-01-01T00:00:00+00:00",
    };
    appendDispute(repo, 1, { ...row });
    assert.throws(() => appendDispute(repo, 1, { ...row }), /at most once/);
  });

  it("appends a packaging refusal beside its later success", () => {
    // A record holding only the last attempt reads as if the refusal never happened.
    const repo = tempDir();
    const base = { recorded_at: "2026-01-01T00:00:00+00:00", session_number: 1, releasable: true };
    appendPackaging(repo, 1, { ...base, outcome: "refused", releasable: false, refusal: "not releasable" });
    appendPackaging(repo, 1, {
      ...base, outcome: "published", tree_mutated: false, feed: "internal",
      secret_name: "FEED_PAT", steps: [], artifacts: ["widget-1.0.0.tgz"],
    });
    assert.equal(readJsonl(join(sessionRunDir(repo, 1), "packaging.jsonl"), (r) => r).length, 2);
  });
});

describe("the step execution record", () => {
  const opened = {
    schema_version: 1, event: "opened", step_id: "one", session_number: 1,
    recorded_at: "2026-01-01T00:00:00+00:00", base_commit: "c".repeat(40),
  };
  const closed = {
    schema_version: 1, event: "closed", step_id: "one", session_number: 1,
    recorded_at: "2026-01-01T00:01:00+00:00", closed_tree: "d".repeat(40),
    base_commit: "c".repeat(40), envelope: { inside: ["widget.py"] },
    deterministic: [{ kind: "lint", status: "pass", required: true }],
  };
  const withEvents = (rows: unknown[]): string => {
    const repo = tempDir();
    writeRows(repo, "step-execution.jsonl", rows);
    return repo;
  };

  it("folds an open step out of the rows, and has none once it closed", () => {
    assert.equal(openStep(withEvents([opened]), 1)?.["step_id"], "one");
    assert.equal(openStep(withEvents([opened, closed]), 1), null);
  });

  it("lists a closed step as executed and takes its tree as the next baseline", () => {
    const repo = withEvents([opened, closed]);
    assert.deepEqual(closedStepIds(repo, 1), ["one"]);
    assert.equal(lastClosedTree(repo, 1), "d".repeat(40));
  });

  it("finds an open step anywhere in the repository, without being told where", () => {
    // A commit hook gets no arguments and must not have to resolve the session.
    assert.equal(openStepsInRepo(withEvents([opened])).length, 1);
  });
});

describe("the baseline a later round diffs from", () => {
  it("takes the re-anchored tree over the recorded one, and the recorded one otherwise", () => {
    const repo = tempDir();
    appendReanchor(repo, 1, {
      round: 1, recorded_tree: ROUND.completion_tree, anchor_tree: "e".repeat(40),
      anchor_commit: "f".repeat(40), reason: "the clone lacked it",
      recorded_at: "2026-01-01T00:00:00+00:00",
    });
    assert.equal(effectiveBaseline(repo, 1, ROUND), "e".repeat(40));
    assert.equal(effectiveBaseline(tempDir(), 1, ROUND), ROUND.completion_tree);
  });
});

describe("the critique subtree", () => {
  it("refuses a change-id that is not a derived digest, which is a path guard too", () => {
    assert.throws(
      () =>
        appendWorkerResult(tempDir(), 1, {
          schema_version: 1, change_id: "../escape", check_id: "c1", attempt: 1,
          result: "pass", recorded_at: "2026-01-01T00:00:00+00:00",
        }),
      LedgerError,
    );
  });

  it("keeps a refused payload beside the subtree rather than dropping it", () => {
    const repo = tempDir();
    assert.throws(
      () =>
        writeReviewRun(repo, 1, {
          schema_version: 1, change_id: "abc1234", session_number: 1,
          attempts: "not a list", opened_at: "2026-01-01T00:00:00+00:00",
        }),
      /quarantined at/,
    );
    assert.equal(existsSync(quarantineDir(repo, 1)), true);
  });
});
