"use strict";
// Set 045 / Session 5 — shells out to `python -m ai_router.joiner`
// to fetch per-session-set coverage signals + conflict reports for
// the Session Set Explorer.
//
// The joiner's CLI surface (ai_router/joiner/cli.py) is the only
// IPC surface per joiner-spec.md §8; this service consumes the
// `--coverage --json` and `--conflicts --json` modes and groups
// results by set_slug so CustomSessionSetsView.buildRow can attach
// signals + conflicts to each row's payload.
//
// Latency posture: a synchronous spawnSync in postSnapshot would
// add ~1–2s per Python cold-start to every snapshot fire. Instead
// this service caches results behind a TTL and refreshes
// asynchronously; CustomSessionSetsView reads the cache synchronously
// (returning null on cold cache so the row renders without badges
// momentarily) and the service triggers a re-render via the
// onUpdate callback when fresh data arrives.
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
exports.HarvestService = void 0;
const cp = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const vscode = __importStar(require("vscode"));
const CACHE_TTL_MS = 30000;
const VALID_CONFLICT_KINDS = new Set([
    "engine-mismatch",
    "bare-touch",
    "stale-checkout-touch",
    "writer-bypass",
]);
const VALID_SEVERITIES = new Set([
    "high",
    "medium",
    "low",
]);
class HarvestService {
    constructor(onUpdate, extensionUri) {
        this.onUpdate = onUpdate;
        this.extensionUri = extensionUri;
        this.cache = null;
        this.inFlight = false;
        this.disposed = false;
        // Set 045 / S5 — surface a one-time toast when the joiner CLI
        // can't be invoked (Python missing, dabbler-ai-router not pip-
        // installed). The dev-mode PYTHONPATH discovery handles the
        // extensionDevelopmentPath path, but the Marketplace install
        // path requires `pip install dabbler-ai-router` and a silent-
        // degrade would hide a setup gap from the operator. Once shown
        // (per session), the toast stays suppressed; the file watcher's
        // refresh() invalidates the cache but not this flag.
        this.missingDependencyNotified = false;
    }
    dispose() {
        this.disposed = true;
    }
    /** Synchronous accessor. Returns the cached snapshot or null on cold
     * cache; triggers a background refresh when stale. Callers (the
     * Explorer snapshot path) read the returned object and attach
     * signals/conflicts to each row payload. */
    getSnapshot() {
        const now = Date.now();
        if (!this.cache || now - this.cache.fetchedAt > CACHE_TTL_MS) {
            void this.refresh();
        }
        return this.cache;
    }
    /** Force-evict the cache. Useful when a file watcher fires that the
     * service knows would change the harvest output (a session-state
     * write, a new session-events.jsonl line). */
    invalidate() {
        this.cache = null;
    }
    async refresh() {
        if (this.inFlight || this.disposed)
            return;
        this.inFlight = true;
        try {
            const next = await this.fetch();
            if (this.disposed)
                return;
            this.cache = next;
            this.onUpdate();
        }
        finally {
            this.inFlight = false;
        }
    }
    async fetch() {
        const workspaceRoot = workspaceRootForHarvest();
        if (!workspaceRoot) {
            return emptySnapshot(false);
        }
        const pythonPath = resolvePythonPath(workspaceRoot);
        // Dev-mode fallback: when the extension runs via
        // `--extensionDevelopmentPath` (or under the Playwright harness),
        // the source `ai_router/` package sits at `<extensionRoot>/../../`.
        // The Marketplace install path has no such sibling — production
        // users `pip install dabbler-ai-router` and import resolves the
        // normal way. devPythonPath is null in production.
        const devPythonPath = resolveDevPythonPath(this.extensionUri);
        const spawnEnv = devPythonPath ? { PYTHONPATH: devPythonPath } : undefined;
        const coverage = await spawnJson(pythonPath, ["-m", "ai_router.joiner", "--coverage", "--json", "--workspace", workspaceRoot], workspaceRoot, spawnEnv);
        const conflicts = await spawnJson(pythonPath, ["-m", "ai_router.joiner", "--conflicts", "--json", "--workspace", workspaceRoot], workspaceRoot, spawnEnv);
        if (!coverage.ok && !conflicts.ok) {
            // Both calls failed — Python missing, the package not installed,
            // or another fatal IPC error. Cache an empty snapshot so the
            // service does not hot-spin the subprocess on every refresh.
            // Surface the failure as a one-time toast when we detect the
            // canonical "ai_router not importable" symptom; other failures
            // (spawn ENOENT, generic non-zero exits) are quieter.
            const missingDep = coverage.diagnostic === "missing-ai-router" ||
                conflicts.diagnostic === "missing-ai-router";
            if (missingDep && !this.missingDependencyNotified) {
                this.missingDependencyNotified = true;
                void vscode.window
                    .showWarningMessage("Dabbler: harvest signals disabled — `dabbler-ai-router` is not installed in the configured Python. Install it with `pip install dabbler-ai-router` (or set `dabblerSessionSets.pythonPath` to a Python that has it) to see wrapper / native-log / narration / bypass badges.", "Open settings")
                    .then((choice) => {
                    if (choice === "Open settings") {
                        void vscode.commands.executeCommand("workbench.action.openSettings", "dabblerSessionSets.pythonPath");
                    }
                });
            }
            return emptySnapshot(false);
        }
        return {
            signalsBySlug: coverage.ok ? parseCoverage(coverage.payload) : new Map(),
            conflictsBySlug: conflicts.ok ? parseConflicts(conflicts.payload) : new Map(),
            ok: coverage.ok || conflicts.ok,
            fetchedAt: Date.now(),
        };
    }
}
exports.HarvestService = HarvestService;
function emptySnapshot(ok) {
    return {
        signalsBySlug: new Map(),
        conflictsBySlug: new Map(),
        ok,
        fetchedAt: Date.now(),
    };
}
function spawnJson(pythonPath, args, cwd, envOverlay) {
    return new Promise((resolve) => {
        let proc;
        try {
            const env = envOverlay
                ? { ...process.env, ...envOverlay }
                : process.env;
            proc = cp.spawn(pythonPath, args, { cwd, env, windowsHide: true });
        }
        catch {
            resolve({ ok: false, payload: null, diagnostic: "spawn-failed" });
            return;
        }
        let stdout = "";
        let stderr = "";
        proc.stdout.on("data", (d) => {
            stdout += d.toString();
        });
        proc.stderr.on("data", (d) => {
            stderr += d.toString();
        });
        proc.on("error", () => {
            resolve({ ok: false, payload: null, diagnostic: "spawn-failed" });
        });
        proc.on("close", (code) => {
            if (code !== 0) {
                // Verifier nice-to-have: include cwd in the warn so the dev
                // console line carries enough context to diagnose without
                // grep-walking the source.
                const trimmedErr = stderr.trim() || "(no stderr)";
                // eslint-disable-next-line no-console
                console.warn(`[HarvestService] ${args.slice(0, 3).join(" ")} (cwd=${cwd}) exited ${code}: ${trimmedErr}`);
                // Detect the canonical "ai_router not importable" symptom so
                // the caller can surface a setup toast. Python prints
                // ModuleNotFoundError on `python -m foo.bar` when `foo` is
                // not importable; matching the substring keeps us
                // forward-compatible with Python's varying message wording.
                const diagnostic = /ModuleNotFoundError.*ai_router|No module named ['"]ai_router['"]/.test(trimmedErr)
                    ? "missing-ai-router"
                    : "non-zero-exit";
                resolve({ ok: false, payload: null, diagnostic });
                return;
            }
            try {
                resolve({ ok: true, payload: JSON.parse(stdout) });
            }
            catch {
                resolve({ ok: false, payload: null, diagnostic: "json-parse" });
            }
        });
    });
}
function parseCoverage(payload) {
    const out = new Map();
    if (!Array.isArray(payload))
        return out;
    for (const item of payload) {
        if (!item || typeof item !== "object")
            continue;
        const obj = item;
        const slug = typeof obj.set_slug === "string" ? obj.set_slug : null;
        if (!slug)
            continue;
        out.set(slug, {
            wrapperLaunched: obj.wrapper_launched === true,
            narrationPresent: obj.narration_present === true,
            nativeLogBound: obj.native_log_bound === true,
            bypassInferred: obj.bypass_inferred === true,
            lastSignalTs: typeof obj.last_signal_ts === "string" ? obj.last_signal_ts : null,
        });
    }
    return out;
}
function parseConflicts(payload) {
    const out = new Map();
    if (!Array.isArray(payload))
        return out;
    for (const item of payload) {
        if (!item || typeof item !== "object")
            continue;
        const obj = item;
        const slug = typeof obj.set_slug === "string" ? obj.set_slug : null;
        if (!slug)
            continue;
        const kind = obj.kind;
        const severity = obj.severity;
        if (typeof kind !== "string" ||
            typeof severity !== "string" ||
            !VALID_CONFLICT_KINDS.has(kind) ||
            !VALID_SEVERITIES.has(severity)) {
            continue;
        }
        const note = typeof obj.note === "string" ? obj.note : "";
        const list = out.get(slug) ?? [];
        list.push({
            kind: kind,
            severity: severity,
            note,
        });
        out.set(slug, list);
    }
    return out;
}
function workspaceRootForHarvest() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0)
        return null;
    return folders[0].uri.fsPath;
}
function resolveDevPythonPath(extensionUri) {
    // Walk up from the extension root looking for an `ai_router/`
    // package sibling. Present when running via
    // `--extensionDevelopmentPath` against this repo or under the
    // Playwright harness. Returns the directory CONTAINING ai_router/
    // (i.e., the repo root), since that's what PYTHONPATH needs.
    const start = extensionUri.fsPath;
    let current = start;
    for (let depth = 0; depth < 5; depth++) {
        const candidate = path.join(current, "ai_router", "__init__.py");
        if (fs.existsSync(candidate)) {
            return current;
        }
        const parent = path.dirname(current);
        if (parent === current)
            break;
        current = parent;
    }
    return null;
}
function resolvePythonPath(workspaceRoot) {
    // Mirrors the pythonPath resolver used by installAiRouterCommands +
    // checkOutOrchestrator + regenerateNarrationTemplates (same
    // per-workspace setting, same fallback).
    const cfg = vscode.workspace.getConfiguration("dabblerSessionSets");
    const inspected = cfg.inspect("pythonPath");
    const explicit = inspected?.workspaceFolderValue ??
        inspected?.workspaceValue ??
        inspected?.globalValue;
    const raw = (explicit ?? "python").trim();
    if (!raw)
        return "python";
    if (path.isAbsolute(raw))
        return raw;
    if (raw.includes(path.sep) || raw.includes("/")) {
        return path.resolve(workspaceRoot, raw);
    }
    return raw;
}
//# sourceMappingURL=HarvestService.js.map