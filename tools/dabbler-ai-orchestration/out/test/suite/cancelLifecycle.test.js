"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const assert = __importStar(require("assert"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const cancelLifecycle_1 = require("../../utils/cancelLifecycle");
function makeTmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-cancel-test-"));
}
function readState(dir) {
    return JSON.parse(fs.readFileSync(path.join(dir, "session-state.json"), "utf8"));
}
function writeState(dir, state) {
    fs.writeFileSync(path.join(dir, "session-state.json"), JSON.stringify(state, null, 2) + "\n", "utf8");
}
suite("cancelLifecycle — predicates", () => {
    test("isCancelled is false on an untouched folder", () => {
        const dir = makeTmpDir();
        assert.strictEqual((0, cancelLifecycle_1.isCancelled)(dir), false);
        fs.rmSync(dir, { recursive: true });
    });
    test("wasRestored is false when neither marker is present", () => {
        const dir = makeTmpDir();
        assert.strictEqual((0, cancelLifecycle_1.wasRestored)(dir), false);
        fs.rmSync(dir, { recursive: true });
    });
    test("wasRestored is false while CANCELLED.md exists alongside RESTORED.md", () => {
        const dir = makeTmpDir();
        fs.writeFileSync(path.join(dir, "CANCELLED.md"), "x");
        fs.writeFileSync(path.join(dir, "RESTORED.md"), "x");
        // Defensive shape — the writers do not produce this, but a manual
        // edit could. The CANCELLED.md-wins precedence rule means
        // wasRestored must report false in that state.
        assert.strictEqual((0, cancelLifecycle_1.isCancelled)(dir), true);
        assert.strictEqual((0, cancelLifecycle_1.wasRestored)(dir), false);
        fs.rmSync(dir, { recursive: true });
    });
});
suite("cancelLifecycle — cancelSessionSet", () => {
    test("first cancel creates CANCELLED.md with the canonical header", () => {
        const dir = makeTmpDir();
        (0, cancelLifecycle_1.cancelSessionSet)(dir, "scope rolled into another set");
        const text = fs.readFileSync(path.join(dir, "CANCELLED.md"), "utf8");
        assert.ok(text.startsWith("# Cancellation history\n\n"));
        assert.ok(/Cancelled on \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}\n/.test(text));
        assert.ok(text.includes("scope rolled into another set"));
        assert.strictEqual((0, cancelLifecycle_1.isCancelled)(dir), true);
        fs.rmSync(dir, { recursive: true });
    });
    test("empty reason is valid and produces a blank reason line", () => {
        const dir = makeTmpDir();
        (0, cancelLifecycle_1.cancelSessionSet)(dir, "");
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
        (0, cancelLifecycle_1.cancelSessionSet)(dir, "the reason");
        const text = fs.readFileSync(path.join(dir, "CANCELLED.md"), "utf8");
        // Match the parts that are deterministic. The timestamp varies, but
        // the surrounding bytes are fixed.
        assert.strictEqual(text.slice(0, "# Cancellation history\n\n".length), "# Cancellation history\n\n");
        assert.ok(/^Cancelled on [^\n]+\nthe reason\n\n$/m.test(text.slice("# Cancellation history\n\n".length)), `expected entry block followed by trailing blank-line separator, got: ${JSON.stringify(text)}`);
        fs.rmSync(dir, { recursive: true });
    });
    test("cancel after restore renames RESTORED.md and prepends new entry", async function () {
        // Three 1.1s waits below — the writer's timestamp resolution is
        // one second, so each entry has to be written in a strictly later
        // wall-clock second to make the order assertion meaningful.
        this.timeout(20000);
        const dir = makeTmpDir();
        (0, cancelLifecycle_1.cancelSessionSet)(dir, "first cancel");
        await new Promise((r) => setTimeout(r, 1100));
        (0, cancelLifecycle_1.restoreSessionSet)(dir, "first restore");
        assert.strictEqual(fs.existsSync(path.join(dir, "CANCELLED.md")), false);
        assert.strictEqual(fs.existsSync(path.join(dir, "RESTORED.md")), true);
        await new Promise((r) => setTimeout(r, 1100));
        (0, cancelLifecycle_1.cancelSessionSet)(dir, "second cancel");
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
        await assert.rejects(() => (0, cancelLifecycle_1.restoreSessionSet)(dir), /does not exist|nothing to restore/);
        fs.rmSync(dir, { recursive: true });
    });
    test("restore renames CANCELLED.md to RESTORED.md and prepends entry", () => {
        const dir = makeTmpDir();
        (0, cancelLifecycle_1.cancelSessionSet)(dir, "the reason");
        (0, cancelLifecycle_1.restoreSessionSet)(dir, "back on track");
        assert.strictEqual(fs.existsSync(path.join(dir, "CANCELLED.md")), false);
        assert.strictEqual(fs.existsSync(path.join(dir, "RESTORED.md")), true);
        assert.strictEqual((0, cancelLifecycle_1.wasRestored)(dir), true);
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
        (0, cancelLifecycle_1.cancelSessionSet)(dir, "C1");
        await new Promise((r) => setTimeout(r, 1100));
        (0, cancelLifecycle_1.restoreSessionSet)(dir, "R1");
        await new Promise((r) => setTimeout(r, 1100));
        (0, cancelLifecycle_1.cancelSessionSet)(dir, "C2");
        await new Promise((r) => setTimeout(r, 1100));
        (0, cancelLifecycle_1.restoreSessionSet)(dir, "R2");
        const text = fs.readFileSync(path.join(dir, "RESTORED.md"), "utf8");
        const positions = ["R2", "C2", "R1", "C1"].map((s) => text.indexOf(s));
        for (let i = 0; i < positions.length; i++) {
            assert.notStrictEqual(positions[i], -1, `${["R2", "C2", "R1", "C1"][i]} not found`);
        }
        for (let i = 1; i < positions.length; i++) {
            assert.ok(positions[i - 1] < positions[i], `expected entries in newest-first order, but ${["R2", "C2", "R1", "C1"][i - 1]} was after ${["R2", "C2", "R1", "C1"][i]}`);
        }
        fs.rmSync(dir, { recursive: true });
    });
});
suite("cancelLifecycle — session-state.json plumbing", () => {
    test("cancel captures prior status into preCancelStatus", () => {
        const dir = makeTmpDir();
        writeState(dir, { schemaVersion: 2, status: "in-progress", currentSession: 2 });
        (0, cancelLifecycle_1.cancelSessionSet)(dir, "");
        const state = readState(dir);
        assert.strictEqual(state.status, "cancelled");
        assert.strictEqual(state.preCancelStatus, "in-progress");
        fs.rmSync(dir, { recursive: true });
    });
    test("re-cancel preserves the original preCancelStatus", () => {
        const dir = makeTmpDir();
        writeState(dir, { schemaVersion: 2, status: "in-progress" });
        (0, cancelLifecycle_1.cancelSessionSet)(dir, "");
        (0, cancelLifecycle_1.cancelSessionSet)(dir, ""); // re-cancel without an intervening restore
        const state = readState(dir);
        assert.strictEqual(state.status, "cancelled");
        assert.strictEqual(state.preCancelStatus, "in-progress", "second cancel must not overwrite preCancelStatus with 'cancelled'");
        fs.rmSync(dir, { recursive: true });
    });
    test("restore restores status from preCancelStatus and clears the field", () => {
        const dir = makeTmpDir();
        writeState(dir, { schemaVersion: 2, status: "complete" });
        (0, cancelLifecycle_1.cancelSessionSet)(dir, "");
        let state = readState(dir);
        assert.strictEqual(state.status, "cancelled");
        assert.strictEqual(state.preCancelStatus, "complete");
        (0, cancelLifecycle_1.restoreSessionSet)(dir, "");
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
        (0, cancelLifecycle_1.restoreSessionSet)(dir, "");
        const state = readState(dir);
        assert.strictEqual(state.status, "complete", "change-log.md present should infer 'complete' on restore");
        fs.rmSync(dir, { recursive: true });
    });
    test("restore infers 'in-progress' when only activity-log is present and preCancelStatus is missing", () => {
        const dir = makeTmpDir();
        fs.writeFileSync(path.join(dir, "activity-log.json"), JSON.stringify({ entries: [] }));
        fs.writeFileSync(path.join(dir, "CANCELLED.md"), "# Cancellation history\n\nCancelled on x\n\n");
        writeState(dir, { schemaVersion: 2, status: "cancelled" });
        (0, cancelLifecycle_1.restoreSessionSet)(dir, "");
        const state = readState(dir);
        assert.strictEqual(state.status, "in-progress");
        fs.rmSync(dir, { recursive: true });
    });
    test("cancel/restore is a no-op for state.json updates when the file is absent", () => {
        const dir = makeTmpDir();
        (0, cancelLifecycle_1.cancelSessionSet)(dir, "no state file in this folder");
        assert.strictEqual(fs.existsSync(path.join(dir, "session-state.json")), false);
        assert.strictEqual((0, cancelLifecycle_1.isCancelled)(dir), true);
        (0, cancelLifecycle_1.restoreSessionSet)(dir, "");
        assert.strictEqual(fs.existsSync(path.join(dir, "session-state.json")), false);
        assert.strictEqual((0, cancelLifecycle_1.wasRestored)(dir), true);
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
        assert.strictEqual((0, cancelLifecycle_1.readCancellationState)(dir), "cancelled");
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
        assert.strictEqual((0, cancelLifecycle_1.readCancellationState)(dir), "active");
        assert.strictEqual((0, cancelLifecycle_1.isCancelled)(dir), true);
        fs.rmSync(dir, { recursive: true });
    });
    test("state says complete, RESTORED.md present → reader reports restored (history-aware)", () => {
        const dir = makeTmpDir();
        writeState(dir, { schemaVersion: 3, status: "complete", sessions: [] });
        fs.writeFileSync(path.join(dir, "RESTORED.md"), "# Cancellation history\n");
        assert.strictEqual((0, cancelLifecycle_1.readCancellationState)(dir), "restored");
        fs.rmSync(dir, { recursive: true });
    });
    test("state says in-progress, no markdown markers → reader reports active", () => {
        const dir = makeTmpDir();
        writeState(dir, { schemaVersion: 3, status: "in-progress", sessions: [] });
        assert.strictEqual((0, cancelLifecycle_1.readCancellationState)(dir), "active");
        fs.rmSync(dir, { recursive: true });
    });
    test("state file missing → reader reports unknown (caller must consult isCancelled fallback)", () => {
        const dir = makeTmpDir();
        assert.strictEqual((0, cancelLifecycle_1.readCancellationState)(dir), "unknown");
        fs.rmSync(dir, { recursive: true });
    });
    test("state file unparseable → reader reports unknown", () => {
        const dir = makeTmpDir();
        fs.writeFileSync(path.join(dir, "session-state.json"), "{not json");
        assert.strictEqual((0, cancelLifecycle_1.readCancellationState)(dir), "unknown");
        fs.rmSync(dir, { recursive: true });
    });
    test("state file with missing status field → reader reports unknown", () => {
        // A legacy v1 / hand-edited file lacking a status field falls
        // through to the unknown branch so fileSystem.ts:276's legacy
        // fallback (isCancelled file-presence check) can still apply.
        const dir = makeTmpDir();
        writeState(dir, { schemaVersion: 1, currentSession: 1 });
        assert.strictEqual((0, cancelLifecycle_1.readCancellationState)(dir), "unknown");
        fs.rmSync(dir, { recursive: true });
    });
    test("legacy fallback: state file absent, CANCELLED.md present → caller uses isCancelled", () => {
        // The new reader returns "unknown" for legacy snapshots; the
        // fileSystem.ts:276 branch then consults isCancelled() to honor
        // the file-presence signal. This test documents that contract
        // here so the two helpers stay in sync.
        const dir = makeTmpDir();
        fs.writeFileSync(path.join(dir, "CANCELLED.md"), "# Cancellation history\n");
        assert.strictEqual((0, cancelLifecycle_1.readCancellationState)(dir), "unknown");
        assert.strictEqual((0, cancelLifecycle_1.isCancelled)(dir), true);
        fs.rmSync(dir, { recursive: true });
    });
    test("end-to-end: cancelSessionSet then readCancellationState reports cancelled", () => {
        const dir = makeTmpDir();
        writeState(dir, { schemaVersion: 3, status: "in-progress", sessions: [] });
        (0, cancelLifecycle_1.cancelSessionSet)(dir, "scope rolled into another set");
        assert.strictEqual((0, cancelLifecycle_1.readCancellationState)(dir), "cancelled");
        fs.rmSync(dir, { recursive: true });
    });
    test("end-to-end: cancel then restore reports restored", () => {
        const dir = makeTmpDir();
        writeState(dir, { schemaVersion: 3, status: "in-progress", sessions: [] });
        (0, cancelLifecycle_1.cancelSessionSet)(dir, "first");
        (0, cancelLifecycle_1.restoreSessionSet)(dir, "back");
        assert.strictEqual((0, cancelLifecycle_1.readCancellationState)(dir), "restored");
        fs.rmSync(dir, { recursive: true });
    });
});
suite("cancelLifecycle — writer parity (Set 035 Session 2)", () => {
    // These tests pin the byte-level shape of what cancelLifecycle.ts
    // writes to disk so the Python mirror in ai_router/session_lifecycle.py
    // and the TS writer here stay in lockstep. The Python side's parity
    // is enforced by ai_router/tests/test_session_lifecycle.py; this suite
    // is the matching TS half.
    test("CANCELLED.md uses LF newlines only (no \\r\\n on Windows)", async () => {
        const dir = makeTmpDir();
        await (0, cancelLifecycle_1.cancelSessionSet)(dir, "lf check");
        const bytes = fs.readFileSync(path.join(dir, "CANCELLED.md"));
        for (let i = 0; i < bytes.length; i++) {
            if (bytes[i] === 0x0d) {
                assert.fail(`CANCELLED.md contains a CR byte at offset ${i}; the writer must emit LF only`);
            }
        }
        // BOM check: must not begin with 0xEF 0xBB 0xBF
        assert.notStrictEqual(bytes[0], 0xef, "CANCELLED.md must not have a UTF-8 BOM");
        fs.rmSync(dir, { recursive: true });
    });
    test("session-state.json serialization matches Python json.dumps(state, indent=2) + '\\n'", () => {
        const dir = makeTmpDir();
        const input = {
            schemaVersion: 3,
            sessionSetName: "test",
            sessions: [{ number: 1, title: "s1", status: "not-started" }],
            currentSession: null,
            totalSessions: 1,
            completedSessions: [],
            status: "not-started",
        };
        writeState(dir, input);
        const raw = fs.readFileSync(path.join(dir, "session-state.json"), "utf8");
        // 2-space indent (no tabs), no leading whitespace, trailing newline.
        assert.ok(raw.endsWith("\n"), "state file must end with a trailing newline");
        assert.strictEqual(raw[raw.length - 2], "}", "trailing char before newline must be }");
        assert.ok(!raw.includes("\t"), "state file must not contain tab indentation");
        // 2-space indent: a nested array element should be preceded by 4 spaces
        // (2 for "completedSessions": [, then the array contents are on their own
        // lines indented 4 from the root). We check via a simple cue: any
        // top-level array's first nested line starts with exactly 4 spaces.
        const sessionsLine = raw.split("\n").find((l) => l.includes('"number": 1'));
        assert.ok(sessionsLine !== undefined, "could not find sessions[0] line");
        assert.ok(sessionsLine.startsWith("      "), `sessions[0] line should be indented 6 spaces (root.sessions[0].keys), got: ${JSON.stringify(sessionsLine)}`);
    });
    test("cancel writes only status + preCancelStatus, leaving sibling keys untouched", async () => {
        const dir = makeTmpDir();
        const baseline = {
            schemaVersion: 3,
            sessionSetName: "parity-test",
            sessions: [{ number: 1, title: "s1", status: "in-progress" }],
            currentSession: 1,
            totalSessions: 1,
            completedSessions: [],
            status: "in-progress",
            lifecycleState: "work_in_progress",
            startedAt: "2026-05-21T06:00:00-04:00",
            completedAt: null,
            verificationVerdict: null,
            orchestrator: {
                engine: "claude",
                provider: "anthropic",
                model: "claude-opus-4-7",
            },
        };
        writeState(dir, baseline);
        await (0, cancelLifecycle_1.cancelSessionSet)(dir, "writer-parity");
        const after = readState(dir);
        // Two deltas only — status + preCancelStatus.
        assert.strictEqual(after.status, "cancelled");
        assert.strictEqual(after.preCancelStatus, "in-progress");
        // Every other key preserved verbatim.
        for (const key of [
            "schemaVersion",
            "sessionSetName",
            "sessions",
            "currentSession",
            "totalSessions",
            "completedSessions",
            "lifecycleState",
            "startedAt",
            "completedAt",
            "verificationVerdict",
            "orchestrator",
        ]) {
            assert.deepStrictEqual(after[key], baseline[key], `cancel writer must not mutate ${key}`);
        }
        fs.rmSync(dir, { recursive: true });
    });
    test("round-trip: cancel + restore returns status to the exact prior value", async () => {
        // Iterates the four canonical status values to confirm the
        // preCancelStatus capture + restore reads them all symmetrically.
        for (const original of ["not-started", "in-progress", "complete"]) {
            const dir = makeTmpDir();
            writeState(dir, {
                schemaVersion: 3,
                status: original,
                sessions: [],
            });
            await (0, cancelLifecycle_1.cancelSessionSet)(dir, `cancel-${original}`);
            assert.strictEqual(readState(dir).status, "cancelled");
            assert.strictEqual(readState(dir).preCancelStatus, original);
            await (0, cancelLifecycle_1.restoreSessionSet)(dir, `restore-${original}`);
            const after = readState(dir);
            assert.strictEqual(after.status, original, `round-trip from ${original} should restore exactly`);
            assert.strictEqual(after.preCancelStatus, undefined, "preCancelStatus must be cleared after restore");
            fs.rmSync(dir, { recursive: true });
        }
    });
    test("cancel timestamp is local-time ISO-8601 with second precision and ±HH:MM offset (Python-mirror shape)", async () => {
        const dir = makeTmpDir();
        await (0, cancelLifecycle_1.cancelSessionSet)(dir, "tz check");
        const text = fs.readFileSync(path.join(dir, "CANCELLED.md"), "utf8");
        // Strict match the format the Python mirror produces:
        //   datetime.now().astimezone().replace(microsecond=0).isoformat()
        //   = "2026-05-14T11:23:07-04:00"
        // No microseconds, no Z suffix; offset always ±HH:MM (Python never
        // emits a ±HHMM bare form for whole-minute offsets).
        const match = text.match(/Cancelled on (\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2})\n/);
        assert.ok(match !== null, `expected '<ISO-8601-local-seconds>' timestamp; got: ${JSON.stringify(text)}`);
        // Negative checks: no millisecond, no UTC Z.
        assert.ok(!/\d{2}\.\d{3}/.test(text), "must not contain millisecond fractions");
        assert.ok(!/T\d{2}:\d{2}:\d{2}Z/.test(text), "must not use UTC Z suffix");
        fs.rmSync(dir, { recursive: true });
    });
    test("re-cancel after restore preserves the original preCancelStatus across the cycle", async function () {
        this.timeout(20000);
        const dir = makeTmpDir();
        writeState(dir, { schemaVersion: 3, status: "in-progress", sessions: [] });
        await (0, cancelLifecycle_1.cancelSessionSet)(dir, "C1");
        await new Promise((r) => setTimeout(r, 1100));
        await (0, cancelLifecycle_1.restoreSessionSet)(dir, "R1");
        await new Promise((r) => setTimeout(r, 1100));
        await (0, cancelLifecycle_1.cancelSessionSet)(dir, "C2");
        const after = readState(dir);
        assert.strictEqual(after.status, "cancelled");
        // The C2 cancel re-captures the post-R1 status (which was the
        // original "in-progress") as the new preCancelStatus. Symmetry
        // with the Python mirror confirmed.
        assert.strictEqual(after.preCancelStatus, "in-progress");
        fs.rmSync(dir, { recursive: true });
    });
});
//# sourceMappingURL=cancelLifecycle.test.js.map