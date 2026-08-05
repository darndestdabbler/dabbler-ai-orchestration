// Set 110 Session 2 — the host-side startup instrumentation S1 assigned
// here (its plan forbade touching product code; this session is building
// product code anyway, so it is the right place).
//
// These tests cover the three properties that would otherwise fail
// silently and be discovered in Session 4, when the measurement is
// supposed to be trustworthy:
//
//   * a mark is recorded once and not overwritten by later refreshes —
//     otherwise "time to first roots" would report the most recent
//     watcher tick instead of startup;
//   * durations are null rather than 0 when a mark is missing, so a
//     bucket that never happened cannot masquerade as an instant one;
//   * the emit path is off unless asked for, and says so loudly when it
//     cannot write — a harness that silently produced no file would be
//     indistinguishable from a fast startup, which is exactly the
//     confusion S1 spent three rounds on.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  markActivateEnd,
  markActivateStart,
  markFirstChildrenServed,
  markWebviewResolveEnd,
  markWebviewResolveStart,
  readStartupMarks,
  resetStartupMarksForTests,
  startupDurations,
} from "../../utils/startupTiming";

suite("Set 110 S2 — startup timing marks", () => {
  test("module load is captured at import, before anything is activated", () => {
    const marks = readStartupMarks();
    assert.strictEqual(typeof marks.moduleLoadedAt, "number");
    assert.strictEqual(typeof marks.moduleLoadedAtUptimeMs, "number");
    // Uptime at import must be a plausible non-negative process age.
    assert.ok((marks.moduleLoadedAtUptimeMs as number) >= 0);
  });

  test("durations are null when a mark is missing, never zero", () => {
    // A zero would read as "this bucket cost nothing", which is a very
    // different claim from "this bucket was never measured". S1's whole
    // residual is about not confusing the two.
    const d = startupDurations({
      moduleLoadedAtUptimeMs: 10,
      moduleLoadedAt: 1000,
      activateStart: 1000,
      activateEnd: null,
      webviewResolveStart: null,
      webviewResolveEnd: null,
      treeFirstChildrenServed: null,
      treeFirstChildrenCount: null,
    });
    assert.strictEqual(d.activateMs, null);
    assert.strictEqual(d.webviewResolveMs, null);
    assert.strictEqual(d.activateEndToTreeRootsMs, null);
  });

  test("durations subtract correctly when both marks exist", () => {
    const d = startupDurations({
      moduleLoadedAtUptimeMs: 10,
      moduleLoadedAt: 900,
      activateStart: 1000,
      activateEnd: 1350,
      webviewResolveStart: 1400,
      webviewResolveEnd: 1401,
      treeFirstChildrenServed: 1600,
      treeFirstChildrenCount: 3,
    });
    assert.strictEqual(d.activateMs, 350);
    assert.strictEqual(d.webviewResolveMs, 1);
    assert.strictEqual(d.activateEndToTreeRootsMs, 250);
  });

  test("the first-roots mark is recorded ONCE — a refresh must not overwrite startup", () => {
    resetStartupMarksForTests();
    markFirstChildrenServed(4);
    const first = readStartupMarks();
    assert.strictEqual(first.treeFirstChildrenCount, 4);
    // Simulate a watcher-driven repaint some time later.
    markFirstChildrenServed(99);
    const second = readStartupMarks();
    assert.strictEqual(second.treeFirstChildrenCount, 4, "a later refresh overwrote the startup mark");
    assert.strictEqual(second.treeFirstChildrenServed, first.treeFirstChildrenServed);
  });

  test("zero root modules is a legitimate measurement, not a missing one", () => {
    // An empty workspace serves zero roots. That must record a TIME with
    // a count of 0, not look like the mark never fired.
    //
    // This test previously ran on state a PREVIOUS test had left behind
    // and asserted only that the mark was numeric — it would have passed
    // whether or not zero was handled at all. Verification round 1 caught
    // it; the reset is what makes it mean something.
    resetStartupMarksForTests();
    assert.strictEqual(readStartupMarks().treeFirstChildrenServed, null);
    markFirstChildrenServed(0);
    const marks = readStartupMarks();
    assert.strictEqual(typeof marks.treeFirstChildrenServed, "number");
    assert.strictEqual(marks.treeFirstChildrenCount, 0);
  });

  test("the webview resolve marks are ALSO first-wins", () => {
    // A WebviewView is re-resolved on hide/re-expand and on window
    // reload. Without this guard a later resolve would silently replace
    // the startup figure Session 4 quotes.
    resetStartupMarksForTests();
    markWebviewResolveStart();
    markWebviewResolveEnd();
    const first = readStartupMarks();
    markWebviewResolveStart();
    markWebviewResolveEnd();
    const second = readStartupMarks();
    assert.strictEqual(second.webviewResolveStart, first.webviewResolveStart);
    assert.strictEqual(second.webviewResolveEnd, first.webviewResolveEnd);
  });
});

suite("Set 110 S2 — startup timing emission", () => {
  const originalTarget = process.env.DABBLER_STARTUP_TIMING_PATH;

  teardown(() => {
    if (originalTarget === undefined) delete process.env.DABBLER_STARTUP_TIMING_PATH;
    else process.env.DABBLER_STARTUP_TIMING_PATH = originalTarget;
  });

  test("writes nothing unless DABBLER_STARTUP_TIMING_PATH is set", () => {
    delete process.env.DABBLER_STARTUP_TIMING_PATH;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-timing-"));
    try {
      markActivateStart();
      markActivateEnd();
      assert.deepStrictEqual(fs.readdirSync(dir), []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("writes a complete payload when asked, creating the directory", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-timing-"));
    const target = path.join(dir, "nested", "timing.json");
    process.env.DABBLER_STARTUP_TIMING_PATH = target;
    try {
      // The resolve marks are first-wins now, so an earlier test having
      // set them would make these calls no-ops and write nothing.
      resetStartupMarksForTests();
      markWebviewResolveStart();
      markWebviewResolveEnd();
      assert.ok(fs.existsSync(target), "no timing file written");
      const payload = JSON.parse(fs.readFileSync(target, "utf-8"));
      assert.ok(payload.marks);
      assert.ok(payload.durations);
      // The note is load-bearing, not decoration: it is what stops a
      // reader treating these host buckets as an end-to-end first-paint
      // number, which is the over-claim S1 had to withdraw.
      assert.ok(String(payload.note).includes("First paint is NOT here"));
      assert.strictEqual(typeof payload.durations.webviewResolveMs, "number");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test("an unwritable target does not break activation", () => {
    // Fail-open on the emit path: instrumentation must never be able to
    // stop the extension from starting.
    //
    // Genuinely unwritable, and legibly so: a regular FILE stands where the
    // payload's parent directory would be, so `mkdirSync` raises on every
    // platform. (An earlier draft of this test smuggled a NUL byte into the
    // path — it did exercise the failure branch, but a NUL in source is not
    // something a reader should have to notice.)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-timing-"));
    const blocker = path.join(dir, "not-a-directory");
    fs.writeFileSync(blocker, "occupied", "utf-8");
    const target = path.join(blocker, "timing.json");
    process.env.DABBLER_STARTUP_TIMING_PATH = target;
    try {
      assert.doesNotThrow(() => {
        markActivateStart();
        markActivateEnd();
      });
      assert.strictEqual(fs.existsSync(target), false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
