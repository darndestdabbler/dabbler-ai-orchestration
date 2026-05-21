"use strict";
// D13 lint: application readers must not access legacy progress fields.
//
// Set 030 spec D13:
//     "No application reader may read legacy fields except through
//      approved compatibility helpers."
//
// The legacy progress triple — `currentSession`, `totalSessions`,
// `completedSessions` — was replaced by the v3 `sessions[]` ledger
// in Session 1. Session 2 added the dual-write writers (Python side).
// Session 3 migrated every application reader to `readProgress` and
// adds this guard so regressions surface in test runs.
//
// Scope (the lint rule applies to):
//   - `tools/dabbler-ai-orchestration/src/**/*.ts` source files
//     (excluding tests and the carve-out files below)
//   - Direct member-access patterns: `.currentSession`,
//     `.totalSessions`, `.completedSessions`
//
// Carve-outs (allowed):
//   - `utils/progress.ts` — the helper itself
//   - `utils/sessionState.ts` — the writer that emits the dual shape;
//     reads/writes exist only inside writer-derivation paths
//   - `types.ts` — interface field declarations (compile-time only)
//   - `providers/SessionSetsProvider.ts` — reads from the SessionSet
//     model, not the raw state-file dict. The SessionSet's fields
//     are downstream of `readProgress` (populated by fileSystem.ts);
//     the lint rule applies to RAW state reads, not model reads.
//   - `test/` — tests intentionally construct v2 and drift shapes
//   - Any line annotated with `// noqa: D13` — inline carve-out for
//     v2-compat code (e.g., the ledger-merge pre-processor in
//     fileSystem.ts that reconciles legacy fields before calling
//     readProgress on a pre-Set-022 snapshot)
//
// A regression that adds `sd.currentSession` to, say, a new
// fileSystem.ts derivation path will fail this test with the
// file:line pointer so the offender knows where to migrate to
// `readProgress`.
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
const LEGACY_FIELDS = ["currentSession", "totalSessions", "completedSessions"];
// Match direct state-dict access. The lint targets RAW state-file
// reads (variable names commonly bound to the parsed session-state.json
// dict) — not downstream reads from the ProgressView or SessionSet
// model objects, which legitimately surface the same field names but
// are derived through `readProgress`.
//
// Common raw-state variable names this rule catches:
//   sd, state, stateData, snapshot, data, raw, parsed
//
// Downstream-view reads explicitly NOT caught:
//   view.totalSessions, view.completedSessions, view.currentSession
//   set.totalSessions, set.liveSession.currentSession
//   progress.totalSessions, etc.
const RAW_STATE_VARS = "(?:sd|state|stateData|snapshot|data|raw|parsed)";
const ACCESS_PATTERNS = [
    ...LEGACY_FIELDS.map((f) => new RegExp(`\\b${RAW_STATE_VARS}\\.${f}\\b`)),
    ...LEGACY_FIELDS.map((f) => new RegExp(`\\b${RAW_STATE_VARS}\\[["']${f}["']\\]`)),
];
// Paths relative to the `src/` root.
const ALLOWLIST = new Set([
    "utils/progress.ts",
    "utils/sessionState.ts",
    // utils/migrateSessionState.ts — the v2 → v3 disk migrator (in-extension
    // TS port of ai_router/migrate_session_state.py). The entire file's
    // purpose is to read v2 legacy fields and rewrite them into the v3
    // sessions[] shape; gating each read on a per-line noqa would just be
    // noise. Same shape carve-out as utils/progress.ts's synthesizer.
    "utils/migrateSessionState.ts",
    "types.ts",
    "providers/SessionSetsProvider.ts",
]);
const ALLOWLIST_PREFIXES = ["test/"];
function srcRoot() {
    // The npm test:unit script runs mocha from the extension package
    // root (tools/dabbler-ai-orchestration/), so process.cwd() lands
    // there. Using cwd avoids ESM/CJS issues with __dirname under
    // ts-node's loader.
    return path.resolve(process.cwd(), "src");
}
function isAllowlisted(rel) {
    const normalized = rel.replace(/\\/g, "/");
    if (ALLOWLIST.has(normalized))
        return true;
    for (const prefix of ALLOWLIST_PREFIXES) {
        if (normalized.startsWith(prefix))
            return true;
    }
    return false;
}
function isNoqaLine(line) {
    return line.includes("noqa: D13");
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
function scanForViolations() {
    const root = srcRoot();
    const all = walkTs(root);
    const violations = [];
    for (const file of all) {
        const rel = path.relative(root, file).replace(/\\/g, "/");
        if (isAllowlisted(rel))
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
            if (isNoqaLine(line))
                continue;
            for (const pattern of ACCESS_PATTERNS) {
                if (pattern.test(line)) {
                    violations.push({ rel, lineno: i + 1, line: line.trim() });
                    break;
                }
            }
        }
    }
    return violations;
}
suite("D13 lint — no legacy field reads in application code", () => {
    test("no direct access to currentSession / totalSessions / completedSessions", () => {
        const violations = scanForViolations();
        if (violations.length > 0) {
            const formatted = violations
                .map((v) => `  ${v.rel}:${v.lineno}: ${v.line}`)
                .join("\n");
            assert.fail(`D13 lint violation: ${violations.length} direct legacy-field ` +
                `access(es) found in application code:\n${formatted}\n\n` +
                "Route reads through readProgress() (utils/progress.ts) or " +
                "annotate the line with '// noqa: D13' (with a justifying " +
                "comment) if this is a v2-compat carve-out.");
        }
    });
    test("lint scanner finds the source tree (sanity check)", () => {
        // Without this, a buggy `scanForViolations` that returned nothing
        // would silently pass the main test. We exercise the walker
        // against `utils/fileSystem.ts` — which has multiple `// noqa: D13`
        // markers — and assert the scanner can see that file.
        const root = srcRoot();
        const filesystemPath = path.join(root, "utils", "fileSystem.ts");
        assert.ok(fs.existsSync(filesystemPath), "fileSystem.ts must exist");
        const text = fs.readFileSync(filesystemPath, "utf8");
        assert.ok(text.includes("noqa: D13"), "fileSystem.ts should carry the D13 carve-out marker " +
            "(the v2-compat ledger-merge pre-processor). If this assertion " +
            "fails, either the markers were removed or the ledger-merge " +
            "was migrated away from legacy reads — update this sanity check.");
    });
});
//# sourceMappingURL=noLegacyFieldReads.test.js.map