import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  cancelSessionSet,
  isCancelled,
  restoreSessionSet,
  wasRestored,
} from "../../utils/cancelLifecycle";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-cancel-test-"));
}

function readState(dir: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(dir, "session-state.json"), "utf8"));
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

suite("cancelLifecycle — cancelSessionSet", () => {
  test("first cancel creates CANCELLED.md with the canonical header", () => {
    const dir = makeTmpDir();
    cancelSessionSet(dir, "scope rolled into another set");
    const text = fs.readFileSync(path.join(dir, "CANCELLED.md"), "utf8");
    assert.ok(text.startsWith("# Cancellation history\n\n"));
    assert.ok(/Cancelled on \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}\n/.test(text));
    assert.ok(text.includes("scope rolled into another set"));
    assert.strictEqual(isCancelled(dir), true);
    fs.rmSync(dir, { recursive: true });
  });

  test("empty reason is valid and produces a blank reason line", () => {
    const dir = makeTmpDir();
    cancelSessionSet(dir, "");
    const text = fs.readFileSync(path.join(dir, "CANCELLED.md"), "utf8");
    // header + blank + verb-line + blank-reason-line + trailing newline
    const lines = text.split("\n");
    assert.strictEqual(lines[0], "# Cancellation history");
    assert.strictEqual(lines[1], "");
    assert.ok(lines[2].startsWith("Cancelled on "));
    assert.strictEqual(lines[3], "");
    fs.rmSync(dir, { recursive: true });
  });

  test("first-cancel byte shape matches the spec's prepend formula exactly", () => {
    // Locks in the spec line 149 contract: prepend
    // `Cancelled on <ISO-8601 local>\n<reason or "">\n\n` to the file
    // (with the standard header). The trailing blank-line separator is
    // part of the entry block, not the assembly.
    const dir = makeTmpDir();
    cancelSessionSet(dir, "the reason");
    const text = fs.readFileSync(path.join(dir, "CANCELLED.md"), "utf8");
    // Match the parts that are deterministic. The timestamp varies, but
    // the surrounding bytes are fixed.
    assert.strictEqual(text.slice(0, "# Cancellation history\n\n".length), "# Cancellation history\n\n");
    assert.ok(/^Cancelled on [^\n]+\nthe reason\n\n$/m.test(text.slice("# Cancellation history\n\n".length)),
      `expected entry block followed by trailing blank-line separator, got: ${JSON.stringify(text)}`);
    fs.rmSync(dir, { recursive: true });
  });

  test("cancel after restore renames RESTORED.md and prepends new entry", async function () {
    // Three 1.1s waits below — the writer's timestamp resolution is
    // one second, so each entry has to be written in a strictly later
    // wall-clock second to make the order assertion meaningful.
    this.timeout(20000);
    const dir = makeTmpDir();
    cancelSessionSet(dir, "first cancel");
    await new Promise((r) => setTimeout(r, 1100));
    restoreSessionSet(dir, "first restore");
    assert.strictEqual(fs.existsSync(path.join(dir, "CANCELLED.md")), false);
    assert.strictEqual(fs.existsSync(path.join(dir, "RESTORED.md")), true);

    await new Promise((r) => setTimeout(r, 1100));
    cancelSessionSet(dir, "second cancel");
    assert.strictEqual(fs.existsSync(path.join(dir, "CANCELLED.md")), true);
    assert.strictEqual(fs.existsSync(path.join(dir, "RESTORED.md")), false);

    const text = fs.readFileSync(path.join(dir, "CANCELLED.md"), "utf8");
    // All three reasons preserved; new entry is on top.
    assert.ok(text.includes("first cancel"));
    assert.ok(text.includes("first restore"));
    assert.ok(text.includes("second cancel"));
    const idxSecond = text.indexOf("second cancel");
    const idxFirstRestore = text.indexOf("first restore");
    const idxFirstCancel = text.indexOf("first cancel");
    assert.ok(idxSecond < idxFirstRestore, "second cancel should be above first restore");
    assert.ok(idxFirstRestore < idxFirstCancel, "first restore should be above first cancel");
    fs.rmSync(dir, { recursive: true });
  });
});

suite("cancelLifecycle — restoreSessionSet", () => {
  test("restore without CANCELLED.md throws", async () => {
    const dir = makeTmpDir();
    await assert.rejects(
      () => restoreSessionSet(dir),
      /does not exist|nothing to restore/
    );
    fs.rmSync(dir, { recursive: true });
  });

  test("restore renames CANCELLED.md to RESTORED.md and prepends entry", () => {
    const dir = makeTmpDir();
    cancelSessionSet(dir, "the reason");
    restoreSessionSet(dir, "back on track");
    assert.strictEqual(fs.existsSync(path.join(dir, "CANCELLED.md")), false);
    assert.strictEqual(fs.existsSync(path.join(dir, "RESTORED.md")), true);
    assert.strictEqual(wasRestored(dir), true);
    const text = fs.readFileSync(path.join(dir, "RESTORED.md"), "utf8");
    assert.ok(text.startsWith("# Cancellation history\n\n"));
    assert.ok(text.includes("Restored on "));
    assert.ok(text.includes("back on track"));
    assert.ok(text.includes("the reason"));
    fs.rmSync(dir, { recursive: true });
  });

  test("multi-cycle (cancel -> restore -> cancel -> restore) preserves all four entries in order", async function () {
    this.timeout(20000);
    const dir = makeTmpDir();
    cancelSessionSet(dir, "C1");
    await new Promise((r) => setTimeout(r, 1100));
    restoreSessionSet(dir, "R1");
    await new Promise((r) => setTimeout(r, 1100));
    cancelSessionSet(dir, "C2");
    await new Promise((r) => setTimeout(r, 1100));
    restoreSessionSet(dir, "R2");

    const text = fs.readFileSync(path.join(dir, "RESTORED.md"), "utf8");
    const positions = ["R2", "C2", "R1", "C1"].map((s) => text.indexOf(s));
    for (let i = 0; i < positions.length; i++) {
      assert.notStrictEqual(positions[i], -1, `${["R2","C2","R1","C1"][i]} not found`);
    }
    for (let i = 1; i < positions.length; i++) {
      assert.ok(
        positions[i - 1] < positions[i],
        `expected entries in newest-first order, but ${["R2","C2","R1","C1"][i - 1]} was after ${["R2","C2","R1","C1"][i]}`
      );
    }
    fs.rmSync(dir, { recursive: true });
  });
});

suite("cancelLifecycle — session-state.json plumbing", () => {
  test("cancel captures prior status into preCancelStatus", () => {
    const dir = makeTmpDir();
    writeState(dir, { schemaVersion: 2, status: "in-progress", currentSession: 2 });
    cancelSessionSet(dir, "");
    const state = readState(dir);
    assert.strictEqual(state.status, "cancelled");
    assert.strictEqual(state.preCancelStatus, "in-progress");
    fs.rmSync(dir, { recursive: true });
  });

  test("re-cancel preserves the original preCancelStatus", () => {
    const dir = makeTmpDir();
    writeState(dir, { schemaVersion: 2, status: "in-progress" });
    cancelSessionSet(dir, "");
    cancelSessionSet(dir, "");  // re-cancel without an intervening restore
    const state = readState(dir);
    assert.strictEqual(state.status, "cancelled");
    assert.strictEqual(state.preCancelStatus, "in-progress",
      "second cancel must not overwrite preCancelStatus with 'cancelled'");
    fs.rmSync(dir, { recursive: true });
  });

  test("restore restores status from preCancelStatus and clears the field", () => {
    const dir = makeTmpDir();
    writeState(dir, { schemaVersion: 2, status: "complete" });
    cancelSessionSet(dir, "");
    let state = readState(dir);
    assert.strictEqual(state.status, "cancelled");
    assert.strictEqual(state.preCancelStatus, "complete");

    restoreSessionSet(dir, "");
    state = readState(dir);
    assert.strictEqual(state.status, "complete");
    assert.strictEqual(state.preCancelStatus, undefined);
    fs.rmSync(dir, { recursive: true });
  });

  test("restore falls back to file-presence inference when preCancelStatus is missing", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "change-log.md"), "# Changes\n");
    fs.writeFileSync(path.join(dir, "CANCELLED.md"), "# Cancellation history\n\nCancelled on x\n\n");
    writeState(dir, { schemaVersion: 2, status: "cancelled" }); // no preCancelStatus
    restoreSessionSet(dir, "");
    const state = readState(dir);
    assert.strictEqual(state.status, "complete",
      "change-log.md present should infer 'complete' on restore");
    fs.rmSync(dir, { recursive: true });
  });

  test("restore infers 'in-progress' when only activity-log is present and preCancelStatus is missing", () => {
    const dir = makeTmpDir();
    fs.writeFileSync(path.join(dir, "activity-log.json"), JSON.stringify({ entries: [] }));
    fs.writeFileSync(path.join(dir, "CANCELLED.md"), "# Cancellation history\n\nCancelled on x\n\n");
    writeState(dir, { schemaVersion: 2, status: "cancelled" });
    restoreSessionSet(dir, "");
    const state = readState(dir);
    assert.strictEqual(state.status, "in-progress");
    fs.rmSync(dir, { recursive: true });
  });

  test("cancel/restore is a no-op for state.json updates when the file is absent", () => {
    const dir = makeTmpDir();
    cancelSessionSet(dir, "no state file in this folder");
    assert.strictEqual(fs.existsSync(path.join(dir, "session-state.json")), false);
    assert.strictEqual(isCancelled(dir), true);
    restoreSessionSet(dir, "");
    assert.strictEqual(fs.existsSync(path.join(dir, "session-state.json")), false);
    assert.strictEqual(wasRestored(dir), true);
    fs.rmSync(dir, { recursive: true });
  });
});
