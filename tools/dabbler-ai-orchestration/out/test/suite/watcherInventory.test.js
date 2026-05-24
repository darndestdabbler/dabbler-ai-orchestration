"use strict";
// Set 036 Session 4 (Q7 audit-locked): allowlisted watcher-inventory
// convention test.
//
// The D1 watcher-scope discipline (proposal-addendum §D1) says
// orchestrator-state inference must not be derived from indirect
// filesystem signals. The Codex config-toml watcher was retired in
// Session 3 because it was that anti-pattern. Q7's enforcement
// strategy is a hand-maintained allowlist that every new `fs.watch`
// or `vscode.workspace.createFileSystemWatcher` callsite must be
// registered against — adding an inference watcher fails the test
// loud and points the author at the discipline note in the
// proposal-addendum.
//
// What "in the allowlist" means: the file + line + a short rationale
// describing what is being watched and why D1 permits it. When the
// callsite moves (line numbers change after a refactor), update the
// allowlist line number in the same PR.
//
// What this test is NOT: a strict watcher cap, a semantic linter,
// a runtime check. It is a convention test on source-file content.
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
const path = __importStar(require("path"));
// The allowlist itself. Add new entries here when introducing a new
// filesystem watcher; the matching D1 rationale is required.
//
// Maintenance note: the line numbers must match the actual callsite
// after refactors. When a refactor shifts lines, update this list in
// the same commit. The test failure message points at the file:line
// of the unallowlisted callsite so the fix is mechanical.
const WATCHER_ALLOWLIST = [
    {
        file: "extension.ts",
        line: 146,
        target: "docs/session-sets/** (spec.md, session-state.json, session-events.jsonl, activity-log.json, change-log.md, CANCELLED.md, *-uat-checklist.json)",
        purpose: "Tree-view refresh on canonical session-set state files. Watched files are themselves the writers' source of truth (no inference from indirect signals) — D1 permits.",
    },
    {
        file: "providers/CheckoutPollService.ts",
        line: 285,
        target: "~/.dabbler/checkout-conflicts/ (directory)",
        purpose: "Conflict-sentinel directory written by the Claude SessionStart invoker on H3 refusal. The sentinel files are direct writer signals, not inferred state — D1 permits.",
    },
    {
        file: "providers/CheckoutPollService.ts",
        line: 471,
        target: "<set>/session-state.json (per-poll watch)",
        purpose: "Per-poll watcher for the held set's state file to detect slot release. session-state.json is the canonical truth source per H2 — D1 permits.",
    },
];
const WATCHER_PRIMITIVES = [
    /\bfs\.watch\s*\(/,
    /\bvscode\.workspace\.createFileSystemWatcher\s*\(/,
];
// Files allowed to use watcher primitives without an allowlist entry
// (this test file itself + future test fixtures).
const ALLOWLIST_PREFIXES = ["test/"];
function srcRoot() {
    return path.resolve(process.cwd(), "src");
}
function walkTs(dir) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...walkTs(full));
        }
        else if (entry.isFile() && entry.name.endsWith(".ts")) {
            out.push(full);
        }
    }
    return out;
}
function isUnderAllowedPrefix(rel) {
    const normalized = rel.replace(/\\/g, "/");
    for (const prefix of ALLOWLIST_PREFIXES) {
        if (normalized.startsWith(prefix))
            return true;
    }
    return false;
}
function scanCallsites() {
    const root = srcRoot();
    const callsites = [];
    for (const file of walkTs(root)) {
        const rel = path.relative(root, file).replace(/\\/g, "/");
        if (isUnderAllowedPrefix(rel))
            continue;
        let text;
        try {
            text = fs.readFileSync(file, "utf8");
        }
        catch {
            continue;
        }
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            for (const pattern of WATCHER_PRIMITIVES) {
                if (pattern.test(line)) {
                    callsites.push({ file: rel, line: i + 1, text: line.trim() });
                    break;
                }
            }
        }
    }
    return callsites;
}
function findAllowlistEntry(c) {
    return WATCHER_ALLOWLIST.find((e) => e.file === c.file && e.line === c.line);
}
suite("Q7 watcher-inventory convention", () => {
    test("every fs.watch / createFileSystemWatcher callsite is allowlisted with a D1 rationale", () => {
        const callsites = scanCallsites();
        const orphans = callsites.filter((c) => findAllowlistEntry(c) === undefined);
        if (orphans.length > 0) {
            const formatted = orphans
                .map((o) => `  ${o.file}:${o.line}: ${o.text}`)
                .join("\n");
            assert.fail("Found filesystem-watcher callsites without an entry in " +
                "WATCHER_ALLOWLIST. The D1 watcher-scope discipline " +
                "(docs/proposals/2026-05-21-chatsessionid-and-watcher-scope/" +
                "proposal-addendum.md §D1) requires that every new watcher " +
                "be evaluated for orchestrator-state-inference risk; add a " +
                "{file, line, target, purpose} entry to WATCHER_ALLOWLIST " +
                "with a one-line D1 rationale.\n\n" +
                `Unallowlisted callsites:\n${formatted}`);
        }
    });
    test("allowlist entries point at real watcher callsites (no stale line numbers)", () => {
        const callsites = scanCallsites();
        const stale = [];
        for (const entry of WATCHER_ALLOWLIST) {
            const match = callsites.find((c) => c.file === entry.file && c.line === entry.line);
            if (!match)
                stale.push(entry);
        }
        if (stale.length > 0) {
            const formatted = stale
                .map((s) => `  ${s.file}:${s.line} (${s.target})`)
                .join("\n");
            assert.fail("WATCHER_ALLOWLIST has entries that no longer point at a " +
                "watcher callsite. A refactor likely shifted the line " +
                "numbers; update the entries to match the current file " +
                "positions.\n\n" +
                `Stale entries:\n${formatted}`);
        }
    });
    test("allowlist has expected post-Set-036 baseline (3 entries)", () => {
        // Sanity check: the post-Set-036 baseline (extension.ts tree
        // refresh + 2x CheckoutPollService) is 3 watchers. A test that
        // suddenly sees 1 or 2 means an unintended watcher was deleted;
        // a test that sees 5 means new ones were added. Either way the
        // operator wants to know.
        assert.strictEqual(WATCHER_ALLOWLIST.length, 3, "Set-036 baseline watcher count is 3; bump this constant if a " +
            "watcher was added/removed legitimately and the change was " +
            "reviewed for D1 compliance.");
    });
});
//# sourceMappingURL=watcherInventory.test.js.map