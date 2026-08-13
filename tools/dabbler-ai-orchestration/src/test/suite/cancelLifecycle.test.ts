import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  isCancelled,
  readCancellationState,
  wasRestored,
} from "../../utils/cancelLifecycle";

// Set 122 S2: `cancelLifecycle.ts` is READERS ONLY now — the TypeScript
// cancel/restore writers were deleted along with their `session-state.json`
// write, and `python -m ai_router.session_lifecycle` is the one
// implementation. The writer suites that used to live here (prepend
// formula, LF newlines, v4 on-disk shape, preCancelStatus round-trip,
// timestamp shape) were mirrors of the Python ones, which remain in
// `ai_router/tests/test_session_lifecycle.py` and
// `ai_router/tests/test_session_state_v4_writers.py`.
//
// What stays is the part the extension still owns: the predicates and the
// state-file-first reader that the Explorer buckets rows with. Their
// fixtures are now written directly rather than produced by calling a
// writer, which is a better test anyway — the reader's contract is about
// what is ON DISK, not about who put it there.

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-cancel-test-"));
}

function writeState(dir: string, state: Record<string, unknown>): void {
  fs.writeFileSync(
    path.join(dir, "session-state.json"),
    JSON.stringify(state, null, 2) + "\n",
    "utf8"
  );
}

suite("cancelLifecycle — predicates", () => {
  test("isCancelled is false on an untouched folder", () => {
    const dir = makeTmpDir();
    assert.strictEqual(isCancelled(dir), false);
    fs.rmSync(dir, { recursive: true });
  });

  test("wasRestored is false when neither marker is present", () => {
    const dir = makeTmpDir();
    assert.strictEqual(wasRestored(dir), false);
    fs.rmSync(dir, { recursive: true });
  });

  test("wasRestored is false while CANCELLED.md exists alongside RESTORED.md", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "CANCELLED.md"), "x");
    fs.writeFileSync(path.join(dir, "RESTORED.md"), "x");
    // Defensive shape — the writers do not produce this, but a manual
    // edit could. The CANCELLED.md-wins precedence rule means
    // wasRestored must report false in that state.
    assert.strictEqual(isCancelled(dir), true);
    assert.strictEqual(wasRestored(dir), false);
    fs.rmSync(dir, { recursive: true });
  });
});

suite("cancelLifecycle — readCancellationState (Set 035 state-file-first)", () => {
  test("state says cancelled, no CANCELLED.md → reader reports cancelled (state-file wins)", () => {
    // The Set 035 contract: a state file declaring status: "cancelled"
    // is the canonical signal even without the markdown marker on disk.
    // Pre-035 this would have bucketed as "active" since file-presence
    // was the first gate.
    const dir = makeTmpDir();
    writeState(dir, { schemaVersion: 3, status: "cancelled", sessions: [] });
    assert.strictEqual(readCancellationState(dir), "cancelled");
    assert.strictEqual(fs.existsSync(path.join(dir, "CANCELLED.md")), false);
    fs.rmSync(dir, { recursive: true });
  });

  test("state says complete, CANCELLED.md present → reader reports active (state-file wins)", () => {
    // The state-file-first contract intentionally ignores a stray
    // CANCELLED.md when the state file declares a non-cancelled status.
    // The legacy `isCancelled()` predicate still reports true (file is
    // there), but the new reader trusts the state file. The legacy
    // fallback in fileSystem.ts:276 only activates when the state file
    // is absent or unparseable — covered by a separate case below.
    const dir = makeTmpDir();
    writeState(dir, { schemaVersion: 3, status: "complete", sessions: [] });
    fs.writeFileSync(path.join(dir, "CANCELLED.md"), "# Cancellation history\n");
    assert.strictEqual(readCancellationState(dir), "active");
    assert.strictEqual(isCancelled(dir), true);
    fs.rmSync(dir, { recursive: true });
  });

  test("state says complete, RESTORED.md present → reader reports restored (history-aware)", () => {
    const dir = makeTmpDir();
    writeState(dir, { schemaVersion: 3, status: "complete", sessions: [] });
    fs.writeFileSync(path.join(dir, "RESTORED.md"), "# Cancellation history\n");
    assert.strictEqual(readCancellationState(dir), "restored");
    fs.rmSync(dir, { recursive: true });
  });

  test("state says in-progress, no markdown markers → reader reports active", () => {
    const dir = makeTmpDir();
    writeState(dir, { schemaVersion: 3, status: "in-progress", sessions: [] });
    assert.strictEqual(readCancellationState(dir), "active");
    fs.rmSync(dir, { recursive: true });
  });

  test("state file missing → reader reports unknown (caller must consult isCancelled fallback)", () => {
    const dir = makeTmpDir();
    assert.strictEqual(readCancellationState(dir), "unknown");
    fs.rmSync(dir, { recursive: true });
  });

  test("state file unparseable → reader reports unknown", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "session-state.json"), "{not json");
    assert.strictEqual(readCancellationState(dir), "unknown");
    fs.rmSync(dir, { recursive: true });
  });

  test("state file with missing status field → reader reports unknown", () => {
    // A legacy v1 / hand-edited file lacking a status field falls
    // through to the unknown branch so fileSystem.ts:276's legacy
    // fallback (isCancelled file-presence check) can still apply.
    const dir = makeTmpDir();
    writeState(dir, { schemaVersion: 1, currentSession: 1 });
    assert.strictEqual(readCancellationState(dir), "unknown");
    fs.rmSync(dir, { recursive: true });
  });

  test("legacy fallback: state file absent, CANCELLED.md present → caller uses isCancelled", () => {
    // The new reader returns "unknown" for legacy snapshots; the
    // fileSystem.ts:276 branch then consults isCancelled() to honor
    // the file-presence signal. This test documents that contract
    // here so the two helpers stay in sync.
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "CANCELLED.md"), "# Cancellation history\n");
    assert.strictEqual(readCancellationState(dir), "unknown");
    assert.strictEqual(isCancelled(dir), true);
    fs.rmSync(dir, { recursive: true });
  });

});
