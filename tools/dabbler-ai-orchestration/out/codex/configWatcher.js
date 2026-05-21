"use strict";
// Codex auto-detection: watches `~/.codex/config.toml` for changes and
// invokes `python -m ai_router.start_session` to record a `codex +
// openai` orchestrator check-out on the workspace's in-progress
// session set.
//
// Set 029 audit Q3 retained the "configured-default" framing — the
// signal is medium-confidence and does not track runtime changes —
// but Set 033 Session 3's H1 verdict moved write authority entirely
// into the canonical `ai_router.start_session` writer. The watcher is
// now an invoker, not a writer; the per-set marker file is retired
// (H2) and the orchestrator block on `session-state.json` is the
// authoritative check-out record.
//
// Hard coordination (H3): the writer REFUSES when a different
// engine+provider already holds the check-out, and the watcher does
// NOT pass `--force` — the operator must explicitly take over via the
// Command Palette "Release Check-Out" action.
//
// Set 033 Session 5: on EXIT_CHECKOUT_CONFLICT (4), the watcher writes
// a structured conflict record to `~/.dabbler/checkout-conflicts/` so
// the in-extension CheckoutPollService can surface a non-blocking
// poll/force-override/dismiss prompt. Refusal toasts remain off — the
// watcher fires on every config-file touch, and one prompt per
// distinct (slug, codex+openai) pair is what the operator sees (the
// service's in-flight de-dup short-circuits duplicates).
//
// The TOML parse is intentionally minimal: only the top-level `model`
// and `model_reasoning_effort` keys are read. A full TOML parser is
// overkill for two scalar fields, and shipping `@iarna/toml` (the
// nearest dependency-light option) would balloon the extension VSIX
// for ~50 LOC of behavior. The regex-based extractor below tolerates
// both quoted and bare values, leading whitespace, and trailing
// comments — the formats Codex actually writes.
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
exports.extractTopLevelScalar = extractTopLevelScalar;
exports.parseCodexConfig = parseCodexConfig;
exports.activateCodexConfigWatcher = activateCodexConfigWatcher;
const vscode = __importStar(require("vscode"));
const cp = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const CODEX_CONFIG_REL = path.join(".codex", "config.toml");
const CODEX_ENGINE = "codex";
const CODEX_PROVIDER = "openai";
const EXIT_CHECKOUT_CONFLICT = 4;
const CONFLICT_DIR = path.join(os.homedir(), ".dabbler", "checkout-conflicts");
// Extract a top-level scalar key from a TOML body. We only look at lines
// that aren't inside a `[section]`, which is where Codex puts `model` and
// `model_reasoning_effort` per its CLI defaults. Returns the raw string
// value (without quotes) or null if not present.
function extractTopLevelScalar(toml, key) {
    const lines = toml.split(/\r?\n/);
    const keyRe = new RegExp(`^\\s*${key}\\s*=\\s*(.+?)\\s*(#.*)?$`);
    let inSection = false;
    for (const rawLine of lines) {
        const line = rawLine.replace(/^\s+/, "");
        if (line.startsWith("[")) {
            inSection = true;
            continue;
        }
        if (inSection)
            continue;
        const m = keyRe.exec(rawLine);
        if (!m)
            continue;
        let value = m[1].trim();
        // Strip a trailing inline comment that the regex's optional group
        // didn't catch (e.g., when the value itself contains the `#`).
        // Trim surrounding quotes (single or double).
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        return value;
    }
    return null;
}
function parseCodexConfig(toml) {
    const model = extractTopLevelScalar(toml, "model");
    const rawEffort = extractTopLevelScalar(toml, "model_reasoning_effort");
    let effort = null;
    if (rawEffort) {
        const lower = rawEffort.toLowerCase();
        if (lower === "low" || lower === "medium" || lower === "high") {
            effort = lower;
        }
    }
    // Codex doesn't expose a thinking-on/off boolean in config.toml; the
    // reasoning-effort tier IS the thinking control. Treat any effort
    // setting as "thinking on" so downstream UI surfaces (MRU labels,
    // quickpick) match how other providers render.
    const thinking = effort !== null;
    return { model, effort, thinking };
}
function codexConfigPath() {
    return path.join(os.homedir(), CODEX_CONFIG_REL);
}
// Resolve the python executable for the workspace. Mirrors the
// resolvePythonPath logic in checkOutOrchestrator.ts and
// installAiRouterCommands.ts.
function resolvePythonPath(workspaceCwd) {
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
        return path.resolve(workspaceCwd, raw);
    }
    return raw;
}
function resolveSingleInProgressSet(workspaceCwd) {
    let current = path.resolve(workspaceCwd);
    while (true) {
        const candidate = path.join(current, "docs", "session-sets");
        let entries = null;
        try {
            if (fs.statSync(candidate).isDirectory()) {
                entries = fs.readdirSync(candidate, { withFileTypes: true });
            }
        }
        catch {
            // not a dir; fall through to parent walk
        }
        if (entries) {
            const inProgress = [];
            for (const entry of entries) {
                if (!entry.isDirectory())
                    continue;
                const setDir = path.join(candidate, entry.name);
                const statePath = path.join(setDir, "session-state.json");
                try {
                    const raw = fs.readFileSync(statePath, "utf8");
                    const state = JSON.parse(raw);
                    if (state && state.status === "in-progress") {
                        const cs = typeof state.currentSession === "number" ? state.currentSession : null; // noqa: D13: in-flight session number passed verbatim to start_session writer; not a legacy-progress derivation
                        inProgress.push({
                            setDir,
                            slug: entry.name,
                            currentSession: cs,
                            existingHolder: state.orchestrator
                                ? {
                                    engine: state.orchestrator.engine,
                                    provider: state.orchestrator.provider,
                                    model: state.orchestrator.model,
                                    checkedOutAt: state.orchestrator.checkedOutAt,
                                }
                                : null,
                        });
                    }
                }
                catch {
                    // skip — unreadable / missing / invalid JSON
                }
            }
            if (inProgress.length === 1)
                return inProgress[0];
            // 0 or >1 → fail-closed; the watcher doesn't claim
            return null;
        }
        const parent = path.dirname(current);
        if (parent === current)
            return null;
        current = parent;
    }
}
// Set 033 Session 5: write a structured conflict record so the
// in-extension CheckoutPollService can surface a poll/force-override/
// dismiss prompt. Best-effort: failure here is silent (the watcher's
// existing log-nothing-on-refusal posture is preserved as a fallback).
function emitConflictRecord(resolved, wouldBeModel, wouldBeEffort) {
    try {
        fs.mkdirSync(CONFLICT_DIR, { recursive: true });
        const existing = resolved.existingHolder ?? {};
        const detectedAt = new Date().toISOString();
        const record = {
            schemaVersion: 1,
            detectedAt,
            source: "codex-watcher",
            sessionSetPath: resolved.setDir,
            sessionSetSlug: resolved.slug,
            sessionNumber: resolved.currentSession,
            heldByEngine: typeof existing.engine === "string" ? existing.engine : "",
            heldByProvider: typeof existing.provider === "string" ? existing.provider : "",
            heldByModel: typeof existing.model === "string" ? existing.model : null,
            checkedOutAt: typeof existing.checkedOutAt === "string"
                ? existing.checkedOutAt
                : null,
            wouldBeHolderEngine: CODEX_ENGINE,
            wouldBeHolderProvider: CODEX_PROVIDER,
            wouldBeHolderModel: wouldBeModel,
            wouldBeHolderEffort: wouldBeEffort,
        };
        const stamp = detectedAt.replace(/:/g, "-");
        const filename = `${stamp}-codex-${resolved.slug}.json`;
        fs.writeFileSync(path.join(CONFLICT_DIR, filename), JSON.stringify(record) + "\n", "utf8");
    }
    catch {
        // best-effort
    }
}
// Dispatches a check-out claim for the current Codex config snapshot
// via `python -m ai_router.start_session`. Best-effort: silent on
// success AND on H3 refusal (the operator picks override via the
// Command Palette). Errors surface to the writer log via
// start_session's own logging path.
function dispatchCheckOut(snapshot, opts) {
    if (!snapshot.model)
        return;
    const resolved = resolveSingleInProgressSet(opts.cwd);
    if (!resolved)
        return;
    // Same-holder no-op short-circuit: when codex+openai already holds
    // the slot, `start_session` would idempotently bump `lastActivityAt`,
    // but the watcher fires on every config-file touch; firing dozens of
    // python invocations per second when the operator edits config.toml
    // is wasteful. Skip when the holder is already us.
    if (resolved.existingHolder?.engine === CODEX_ENGINE &&
        resolved.existingHolder?.provider === CODEX_PROVIDER) {
        return;
    }
    const python = resolvePythonPath(opts.cwd);
    const model = snapshot.model;
    const effort = snapshot.effort ?? "medium";
    const args = [
        "-m", "ai_router.start_session",
        "--session-set-dir", resolved.setDir,
        "--engine", CODEX_ENGINE,
        "--provider", CODEX_PROVIDER,
        "--model", model,
        "--effort", effort,
    ];
    if (resolved.currentSession != null) {
        args.push("--session-number", String(resolved.currentSession));
    }
    // No `--force`: the watcher never overrides an existing different-
    // holder check-out. H3 refusal returns exit 4 — we emit a structured
    // conflict record so the in-extension CheckoutPollService can offer
    // poll/force/dismiss. The operator routes explicit immediate
    // overrides through the Command Palette "Release Check-Out" action.
    const child = cp.spawn(python, args, {
        cwd: opts.cwd,
        stdio: ["ignore", "ignore", "ignore"],
        detached: false,
    });
    child.on("error", () => {
        // Best-effort: spawn failure (python not on PATH, etc.) is
        // silent. The operator notices via the orchestrator indicator
        // not updating; they can run the manual quickpick to claim
        // explicitly.
    });
    child.on("exit", (code) => {
        if (code === EXIT_CHECKOUT_CONFLICT) {
            emitConflictRecord(resolved, model, effort);
        }
    });
}
function readSnapshotSafe() {
    const p = codexConfigPath();
    let toml;
    try {
        toml = fs.readFileSync(p, "utf8");
    }
    catch {
        return null;
    }
    return parseCodexConfig(toml);
}
// Activates the watcher: runs an initial scan, then watches the parent
// directory of `~/.codex/config.toml` for change/create/delete events.
// We watch the directory rather than the file itself so we still see
// `config.toml` first appearing after the operator runs `codex init`
// post-extension-activation. Returns a Disposable the caller pushes to
// `context.subscriptions`.
function activateCodexConfigWatcher(context) {
    void context; // Set 033 S3: no longer needs extensionUri (helper retired)
    const codexDir = path.join(os.homedir(), ".codex");
    const workspaceCwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || process.cwd();
    const runOnce = () => {
        const snap = readSnapshotSafe();
        if (snap && snap.model) {
            dispatchCheckOut(snap, { cwd: workspaceCwd });
        }
    };
    // Initial scan: if the config exists at activation time, push a
    // check-out claim. The writer's H3 hard coordination skips when a
    // different holder already has the slot.
    runOnce();
    // Watch the parent directory so `config.toml` appearing later (e.g.,
    // after `codex init`) is also picked up. fs.watch is best-effort and
    // can emit duplicate events on some platforms; we debounce to a
    // single dispatch per 500ms quiet window.
    let debounceTimer = null;
    let watcher = null;
    try {
        if (fs.existsSync(codexDir)) {
            watcher = fs.watch(codexDir, { persistent: false }, (_event, filename) => {
                if (filename && filename.toString() !== "config.toml")
                    return;
                if (debounceTimer)
                    clearTimeout(debounceTimer);
                debounceTimer = setTimeout(runOnce, 500);
            });
        }
    }
    catch {
        // ~/.codex/ doesn't exist or isn't watchable. Silent — the watcher
        // is best-effort; absence of Codex install is a normal state.
    }
    return {
        dispose() {
            if (debounceTimer)
                clearTimeout(debounceTimer);
            try {
                watcher?.close();
            }
            catch {
                // best effort
            }
        },
    };
}
//# sourceMappingURL=configWatcher.js.map