"use strict";
// Claude Code orchestrator-hook installer.
//
// Set 033 Session 3 (H1 refactor: hooks become invokers, not writers).
//
// Adds (or refreshes) one hook in ~/.claude/settings.json:
//   - SessionStart  → pipes hook payload into
//                     `scripts/claude-session-start-invoker.js`, which
//                     walks up the cwd to find the in-progress session
//                     set and invokes `python -m ai_router.start_session`
//                     — the canonical writer that enforces H3 hard
//                     coordination and writes `session-state.json`'s
//                     `orchestrator` block.
//
// The previous installer also installed a `UserPromptSubmit` hook that
// piped through the retired `write-orchestrator-marker.js` helper to
// update `effort.signalKind`. With the marker file retired (H2) and
// the `orchestrator` block having no `signalKind` field, that hook
// no longer has a meaningful behavior. The installer drops the
// `UserPromptSubmit` entry — and ALSO removes any previously-installed
// dabbler `UserPromptSubmit` entry that still points at the deleted
// helper, so re-running the installer cleans up the stale reference
// in operators' settings.
//
// The command is idempotent. It locates an existing dabbler entry by
// matcher AND command-path-substring; re-running upgrades the command
// string to the current shipped helper path without duplicating
// entries. The substring check accepts BOTH the new helper
// (`claude-session-start-invoker.js`) AND the retired helper
// (`write-orchestrator-marker.js`) so installs landing on operators
// who still have the broken old reference are repaired in place.
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
exports.installClaudeCodeOrchestratorHook = installClaudeCodeOrchestratorHook;
exports.registerInstallOrchestratorHookClaudeCodeCommand = registerInstallOrchestratorHookClaudeCodeCommand;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
// Set 033 S3: invoker shim (Node, ships in the VSIX) that bridges
// Claude Code's SessionStart hook payload to `python -m ai_router.start_session`.
const INVOKER_REL = path.join("scripts", "claude-session-start-invoker.js");
// Substrings the installer treats as "this is a dabbler-managed hook entry":
// the current invoker filename PLUS the retired helper filename so a
// re-install replaces any leftover stale reference an operator may have.
const DABBLER_HOOK_SUBSTRINGS = [
    "claude-session-start-invoker.js",
    "write-orchestrator-marker.js",
];
function isDabblerManagedCommand(command) {
    return DABBLER_HOOK_SUBSTRINGS.some((s) => command.includes(s));
}
function invokerPathAbs(extensionUri) {
    return vscode.Uri.joinPath(extensionUri, INVOKER_REL).fsPath;
}
function buildHookCommand(invokerAbsPath) {
    // Claude Code hooks invoke a shell command and pipe the JSON payload
    // to its stdin. node + the absolute invoker path is the simplest
    // portable invocation across Windows/macOS/Linux. The invoker reads
    // the payload, walks up to the in-progress session set, and spawns
    // `python -m ai_router.start_session`.
    // We quote the invoker path in case the path contains spaces (e.g.,
    // "C:\Program Files\..." or "C:\Users\Some Name\..."). Backslashes
    // need no escaping inside the double-quoted string for the shell
    // executors Claude Code runs.
    return `node "${invokerAbsPath}"`;
}
function ensureMatcherEntry(entries, matcher, command) {
    const list = Array.isArray(entries) ? entries.slice() : [];
    // Find an existing entry: same matcher (or both undefined) AND already
    // points at a dabbler-managed command. Update in place if found.
    for (let i = 0; i < list.length; i++) {
        const entry = list[i];
        const matcherMatches = (entry.matcher ?? undefined) === (matcher ?? undefined);
        if (!matcherMatches)
            continue;
        if (!Array.isArray(entry.hooks))
            continue;
        let updated = false;
        const newHooks = entry.hooks.map((h) => {
            if (h.type === "command" &&
                typeof h.command === "string" &&
                isDabblerManagedCommand(h.command)) {
                updated = true;
                return { type: "command", command };
            }
            return h;
        });
        if (updated) {
            list[i] = { ...entry, hooks: newHooks };
            return list;
        }
    }
    // No existing entry — append a fresh one. Keep matcher only if the
    // caller specified one.
    const newEntry = matcher !== undefined
        ? { matcher, hooks: [{ type: "command", command }] }
        : { hooks: [{ type: "command", command }] };
    list.push(newEntry);
    return list;
}
// Set 033 S3: prune the retired UserPromptSubmit hook (and any other
// hook event the installer historically wrote into) so a re-install
// after the H1 refactor leaves operators with a clean settings.json.
// We ONLY remove the specific dabbler-managed hook commands — other
// hooks the operator may have installed at the same matcher are
// preserved verbatim. If a matcher entry's `hooks` array becomes
// empty after pruning, the entry itself is dropped.
function pruneDabblerHooks(entries) {
    if (!Array.isArray(entries))
        return entries;
    const pruned = [];
    for (const entry of entries) {
        if (!Array.isArray(entry.hooks)) {
            pruned.push(entry);
            continue;
        }
        const filtered = entry.hooks.filter((h) => !(h.type === "command" &&
            typeof h.command === "string" &&
            isDabblerManagedCommand(h.command)));
        if (filtered.length > 0) {
            pruned.push({ ...entry, hooks: filtered });
        }
        // Empty `hooks` after the prune → drop the entry entirely.
    }
    return pruned;
}
function loadClaudeSettings() {
    const settingsPath = path.join(os.homedir(), ".claude", "settings.json");
    if (!fs.existsSync(settingsPath)) {
        return { settings: {}, path: settingsPath, exists: false };
    }
    const raw = fs.readFileSync(settingsPath, "utf8");
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (err) {
        // Don't clobber a malformed file — bail out with a clear message.
        throw new Error(`~/.claude/settings.json contains invalid JSON (${err.message}). ` +
            `Fix or back up the file, then re-run the install command.`);
    }
    return { settings: parsed || {}, path: settingsPath, exists: true };
}
function writeClaudeSettings(settingsPath, settings) {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    const text = JSON.stringify(settings, null, 2) + "\n";
    // Atomic write: tmp + rename. Same precaution as before — Claude
    // tooling occasionally has the file open.
    const tmp = `${settingsPath}.tmp.${process.pid}.${Math.floor(Math.random() * 1e9)}`;
    fs.writeFileSync(tmp, text, { encoding: "utf8" });
    fs.renameSync(tmp, settingsPath);
}
async function installClaudeCodeOrchestratorHook(extensionUri) {
    const invokerAbs = invokerPathAbs(extensionUri);
    if (!fs.existsSync(invokerAbs)) {
        vscode.window.showErrorMessage(`Cannot install hook: invoker script not found at ${invokerAbs}. ` +
            `Re-install the Dabbler AI Orchestration extension.`);
        return;
    }
    let loaded;
    try {
        loaded = loadClaudeSettings();
    }
    catch (err) {
        vscode.window.showErrorMessage(err.message);
        return;
    }
    const { settings, path: settingsPath, exists } = loaded;
    const sessionStartCmd = buildHookCommand(invokerAbs);
    settings.hooks = settings.hooks || {};
    // SessionStart: install one entry per source matcher we care about.
    // The Claude Code docs list four source values: startup, resume, clear,
    // compact. We attach to all four so the orchestrator block updates on
    // every session boundary. The matcher field accepts a single value per
    // entry; we create one entry per matcher to keep the resulting
    // settings.json readable and easy to remove by hand.
    for (const matcher of ["startup", "resume", "clear", "compact"]) {
        settings.hooks.SessionStart = ensureMatcherEntry(settings.hooks.SessionStart, matcher, sessionStartCmd);
    }
    // UserPromptSubmit: prune any dabbler-managed entries left over from
    // the pre-Set-033 helper. The new check-out model doesn't carry
    // signalKind, so there's nothing for a per-prompt hook to do.
    settings.hooks.UserPromptSubmit = pruneDabblerHooks(settings.hooks.UserPromptSubmit);
    if (Array.isArray(settings.hooks.UserPromptSubmit) && settings.hooks.UserPromptSubmit.length === 0) {
        delete settings.hooks.UserPromptSubmit;
    }
    try {
        writeClaudeSettings(settingsPath, settings);
    }
    catch (err) {
        vscode.window.showErrorMessage(`Failed to write ${settingsPath}: ${err.message}`);
        return;
    }
    const verbWasWord = exists ? "Updated" : "Created";
    vscode.window
        .showInformationMessage(`${verbWasWord} ~/.claude/settings.json with the Dabbler orchestrator hook ` +
        `(SessionStart → start_session). Restart Claude Code or run /clear in ` +
        `an active session to claim the check-out.`, "Open settings.json")
        .then((picked) => {
        if (picked === "Open settings.json") {
            vscode.workspace.openTextDocument(settingsPath).then((doc) => vscode.window.showTextDocument(doc), () => undefined);
        }
    });
}
function registerInstallOrchestratorHookClaudeCodeCommand(context) {
    context.subscriptions.push(vscode.commands.registerCommand("dabbler.installOrchestratorHook.claudeCode", () => installClaudeCodeOrchestratorHook(context.extensionUri)));
}
//# sourceMappingURL=installOrchestratorHookClaudeCode.js.map