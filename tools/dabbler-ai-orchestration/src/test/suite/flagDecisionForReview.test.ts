import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  QueueEntry,
  appendQueueEntry,
  findActiveSessionSetDir,
} from "../../commands/decisionReviewQueue";
import { SessionSet, SessionState } from "../../types";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-flag-test-"));
}

function ssStub(over: Partial<SessionSet> = {}): SessionSet {
  return {
    name: "test-set",
    dir: "/tmp/test-set",
    specPath: "",
    activityPath: "",
    changeLogPath: "",
    statePath: "",
    aiAssignmentPath: "",
    uatChecklistPath: "",
    state: "in-progress" as SessionState,
    totalSessions: 1,
    sessionsCompleted: 0,
    lastTouched: "2026-05-16T00:00:00Z",
    liveSession: null,
    config: { requiresUAT: false, requiresE2E: false, uatScope: "none", tier: "full", verificationMode: "out-of-band-or-none" },
    uatSummary: null,
    root: "/tmp",
    needsMigration: false,
    migrationTargetSchemaVersion: null,
    schemaVersionOnDisk: null,
    prerequisites: null,
    blockedByPrereqs: false,
    unsatisfiedPrereqs: [],
    plusFraction: false,
    externalVerificationNoteExists: false,
    completedVerification: null,
    verificationMarker: "",
    ...over,
  };
}

suite("flagDecisionForReview — appendQueueEntry", () => {
  test("creates the queue file when absent and writes one JSON line", () => {
    const dir = makeTmpDir();
    try {
      const entry: QueueEntry = {
        ts: "2026-05-16T00:00:00Z",
        reason: "first entry",
        source: "command",
        file: null,
        line: null,
      };
      appendQueueEntry(dir, entry);
      const queuePath = path.join(dir, "decision-review-queue.jsonl");
      assert.ok(fs.existsSync(queuePath));
      const content = fs.readFileSync(queuePath, "utf8");
      assert.strictEqual(content, JSON.stringify(entry) + "\n");
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("appends additional lines without rewriting existing content", () => {
    const dir = makeTmpDir();
    try {
      const e1: QueueEntry = {
        ts: "2026-05-16T00:00:00Z", reason: "a", source: "command", file: null, line: null,
      };
      const e2: QueueEntry = {
        ts: "2026-05-16T00:00:01Z", reason: "b", source: "annotation", file: "f.py", line: 1,
      };
      appendQueueEntry(dir, e1);
      appendQueueEntry(dir, e2);
      const content = fs.readFileSync(path.join(dir, "decision-review-queue.jsonl"), "utf8");
      const lines = content.trim().split("\n");
      assert.strictEqual(lines.length, 2);
      assert.deepStrictEqual(JSON.parse(lines[0]), e1);
      assert.deepStrictEqual(JSON.parse(lines[1]), e2);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });

  test("preserves unicode in the reason field", () => {
    const dir = makeTmpDir();
    try {
      const entry: QueueEntry = {
        ts: "t", reason: "résumé — café", source: "command", file: null, line: null,
      };
      appendQueueEntry(dir, entry);
      const content = fs.readFileSync(path.join(dir, "decision-review-queue.jsonl"), "utf8");
      assert.deepStrictEqual(JSON.parse(content.trim()), entry);
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});

suite("flagDecisionForReview — findActiveSessionSetDir", () => {
  test("returns null when no session sets exist", () => {
    const result = findActiveSessionSetDir(() => []);
    assert.strictEqual(result, null);
  });

  test("returns null when no session set is in-progress", () => {
    const result = findActiveSessionSetDir(() => [
      ssStub({ state: "not-started" }),
      ssStub({ state: "complete" }),
      ssStub({ state: "cancelled" }),
    ]);
    assert.strictEqual(result, null);
  });

  test("returns the dir of the single in-progress set", () => {
    const result = findActiveSessionSetDir(() => [
      ssStub({ state: "complete", dir: "/old" }),
      ssStub({ state: "in-progress", dir: "/active" }),
      ssStub({ state: "not-started", dir: "/pending" }),
    ]);
    assert.strictEqual(result, "/active");
  });

  test("when multiple in-progress sets exist, picks the most-recently-touched", () => {
    const result = findActiveSessionSetDir(() => [
      ssStub({ state: "in-progress", dir: "/a", lastTouched: "2026-05-15T10:00:00Z" }),
      ssStub({ state: "in-progress", dir: "/b", lastTouched: "2026-05-16T10:00:00Z" }),
      ssStub({ state: "in-progress", dir: "/c", lastTouched: "2026-05-14T10:00:00Z" }),
    ]);
    assert.strictEqual(result, "/b");
  });

  test("handles null lastTouched without crashing (sorts to bottom)", () => {
    const result = findActiveSessionSetDir(() => [
      ssStub({ state: "in-progress", dir: "/a", lastTouched: null }),
      ssStub({ state: "in-progress", dir: "/b", lastTouched: "2026-05-16T10:00:00Z" }),
    ]);
    assert.strictEqual(result, "/b");
  });
});

suite("flagDecisionForReview — idempotency vs append behavior", () => {
  test("re-appending the same entry produces two lines (writer is dumb; dedup is reader-side)", () => {
    const dir = makeTmpDir();
    try {
      const entry: QueueEntry = {
        ts: "t", reason: "same", source: "command", file: null, line: null,
      };
      appendQueueEntry(dir, entry);
      appendQueueEntry(dir, entry);
      const content = fs.readFileSync(path.join(dir, "decision-review-queue.jsonl"), "utf8");
      const lines = content.trim().split("\n");
      assert.strictEqual(lines.length, 2,
        "appendQueueEntry is intentionally write-only; dedup lives in the scanner per the spec");
    } finally {
      fs.rmSync(dir, { recursive: true });
    }
  });
});
