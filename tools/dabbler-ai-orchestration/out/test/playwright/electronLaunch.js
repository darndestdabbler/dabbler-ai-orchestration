"use strict";
// Helper that launches a real VS Code Electron instance with the
// dabbler-ai-orchestration extension under test, against a tmpdir
// workspace prepared by the Python harness shim. Layer 3 of the
// three-layer harness (Set 027 § Session 4).
//
// We deliberately do NOT route through @vscode/test-electron's
// runTests() launcher. That path was found broken on Windows 11 +
// VS Code 1.120 in Set 027 Session 3 (pre-existing environment
// issue; the symptom was the spawned Electron process exiting
// before the in-process test runner could attach). Playwright's
// ``_electron.launch`` connects via the Chrome DevTools Protocol
// instead, which sidesteps that path entirely — we drive Electron
// directly using the same Code.exe binary test-electron already
// downloaded to ``.vscode-test/``.
//
// Binary discovery order:
//   1. ``VSCODE_BIN`` env var (CI / dev override)
//   2. Latest ``.vscode-test/vscode-<platform>-archive-*/Code(.exe)``
//   3. Throw — no fallback to system installs, since a system VS
//      Code would launch with the user's profile and pollute their
//      Recently Opened list.
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
exports.makeTmpDir = makeTmpDir;
exports.makeSet = makeSet;
exports.startSession = startSession;
exports.makeActivity = makeActivity;
exports.makeDisposition = makeDisposition;
exports.makeChangeLog = makeChangeLog;
exports.closeSession = closeSession;
exports.cancelSet = cancelSet;
exports.attemptStartSession = attemptStartSession;
exports.seedOrchestratorBlock = seedOrchestratorBlock;
exports.makeAdditionalSet = makeAdditionalSet;
exports.downgradeStateFileToV2 = downgradeStateFileToV2;
exports.readStateFile = readStateFile;
exports.driveHappyPath = driveHappyPath;
exports.launchVSCode = launchVSCode;
exports.openSessionSetsView = openSessionSetsView;
exports.triggerRefresh = triggerRefresh;
exports.closeVSCode = closeVSCode;
exports.cleanupTmpDir = cleanupTmpDir;
const cp = __importStar(require("child_process"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const test_1 = require("@playwright/test");
const EXTENSION_ROOT = path.resolve(__dirname, "..", "..", "..");
const REPO_ROOT = path.resolve(EXTENSION_ROOT, "..", "..");
const HARNESS_CLI = path.join(REPO_ROOT, "ai_router", "tests", "e2e", "harness_cli.py");
const PYTHON = process.env.HARNESS_PYTHON || "python";
// Mirror the Layer 2 harness's env hygiene rules — strip ambient
// GIT_* and PYTHONPATH so a polluted parent shell can't redirect
// git operations or Python imports inside the harness shim.
const _ENV_PASSTHROUGH = [
    "PATH",
    "SYSTEMROOT", "SYSTEMDRIVE", "COMSPEC", "WINDIR",
    "HOME", "USERPROFILE",
    "TMP", "TEMP", "TMPDIR",
    "LANG", "LC_ALL", "LC_CTYPE",
    "APPDATA", "LOCALAPPDATA",
];
function _filteredEnv() {
    const out = {};
    for (const k of _ENV_PASSTHROUGH) {
        const v = process.env[k];
        if (v !== undefined)
            out[k] = v;
    }
    out.PYTHONIOENCODING = "utf-8";
    out.PYTHONUTF8 = "1";
    return out;
}
// Explicit allowlist for Electron-launch environment variables.
// This guards against IDE host pollution: if a developer runs
// `npm run test:playwright` from VS Code's integrated terminal, the
// child Code.exe should not inherit VS Code's IPC vars (ELECTRON_RUN_AS_NODE,
// VSCODE_*) which would flip it into CLI-arg-parsing mode. An allowlist
// is more maintainable than a blocklist: if new IDE vars are added
// (APPCODE_*, CURSOR_*, etc.), an allowlist won't inadvertently pass them.
//
// Variables are organized by platform and context:
// - Universal: needed on all platforms
// - Windows-specific: Windows system paths and user config
// - GUI/locale: needed for GUI windows and i18n on Linux/macOS
const _ELECTRON_VAR_ALLOWLIST_UNIVERSAL = [
    "PATH", "PATHEXT", // executable search path (Windows includes PATHEXT)
    "HOME", "USERPROFILE", "USER", "USERNAME",
    "TEMP", "TMP", "TMPDIR",
    "LANG", "LC_ALL", "LC_CTYPE", "LC_MESSAGES", "LC_NUMERIC", "LC_TIME",
    "TERM", "COLORTERM",
];
const _ELECTRON_VAR_ALLOWLIST_WINDOWS = [
    "SYSTEMROOT", "SYSTEMDRIVE", "COMSPEC", "WINDIR",
    "APPDATA", "LOCALAPPDATA",
];
const _ELECTRON_VAR_ALLOWLIST_GUI = [
    "DISPLAY", // X11 (Linux)
    "WAYLAND_DISPLAY", // Wayland (Linux/macOS)
    "XDG_RUNTIME_DIR", "XDG_SESSION_TYPE", // XDG desktop (Linux)
    "DBUS_SESSION_BUS_ADDRESS", // D-Bus session (Linux)
    "DESKTOP_SESSION", "GDMSESSION", // GNOME/session (Linux)
];
function _electronEnv() {
    const out = {};
    // Start with universal allowlist
    const allowed = [..._ELECTRON_VAR_ALLOWLIST_UNIVERSAL, ..._ELECTRON_VAR_ALLOWLIST_GUI];
    // Add platform-specific vars
    if (process.platform === "win32") {
        allowed.push(..._ELECTRON_VAR_ALLOWLIST_WINDOWS);
    }
    const allowedSet = new Set(allowed);
    // Copy allowed vars from process.env
    for (const [k, v] of Object.entries(process.env)) {
        if (typeof v !== "string")
            continue;
        if (allowedSet.has(k)) {
            out[k] = v;
        }
    }
    out.ELECTRON_ENABLE_LOGGING = "1";
    return out;
}
function runHarness(args, timeoutMs = 60000) {
    const proc = cp.spawnSync(PYTHON, [HARNESS_CLI, ...args], {
        encoding: "utf8",
        timeout: timeoutMs,
        cwd: REPO_ROOT,
        env: _filteredEnv(),
    });
    if (proc.error) {
        throw new Error(`harness_cli spawn error (${PYTHON}): ${proc.error.message}`);
    }
    if (proc.status !== 0) {
        throw new Error(`harness_cli ${args[0]} failed (exit ${proc.status}): ` +
            `stdout=${proc.stdout?.toString() || ""} stderr=${proc.stderr?.toString() || ""}`);
    }
    const lines = proc.stdout.toString().trim().split(/\r?\n/).filter((s) => s.length > 0);
    return JSON.parse(lines[lines.length - 1]);
}
function _handleArgs(h) {
    return [
        "--repo-root", h.repo_root,
        "--set-dir", h.set_dir,
        "--bare-remote", h.bare_remote,
        "--slug", h.slug,
        "--total-sessions", String(h.total_sessions),
        "--engine", h.engine,
        "--model", h.model,
        "--provider", h.provider,
        "--effort", h.effort,
    ];
}
function makeTmpDir(prefix) {
    return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}
function makeSet(tmpPath, slug, totalSessions) {
    return runHarness([
        "make-set",
        "--tmp-path", tmpPath,
        "--slug", slug,
        "--total-sessions", String(totalSessions),
    ]);
}
function startSession(h, n) {
    runHarness(["start", ..._handleArgs(h), "--session-number", String(n)]);
}
function makeActivity(h, n) {
    runHarness([
        "make-activity",
        ..._handleArgs(h),
        "--session-number", String(n),
        "--description", "playwright rendering smoke",
    ]);
}
function makeDisposition(h, n, isFinal) {
    const args = [
        "make-disposition",
        ..._handleArgs(h),
        "--session-number", String(n),
        "--status", "completed",
    ];
    if (isFinal)
        args.push("--is-final");
    runHarness(args);
}
function makeChangeLog(h, finalSessionN) {
    runHarness([
        "make-change-log",
        ..._handleArgs(h),
        "--final-session-number", String(finalSessionN),
    ]);
}
function closeSession(h, n, opts = {}) {
    const args = ["close", ..._handleArgs(h), "--session-number", String(n)];
    if (opts.force)
        args.push("--force");
    return runHarness(args);
}
function cancelSet(h) {
    runHarness(["cancel", ..._handleArgs(h), "--reason", "playwright cancel scenario"]);
}
/**
 * Set 033 Session 4 — invoke ``python -m ai_router.start_session``
 * with an explicit identity (engine + provider + model + effort) and
 * capture exit / stdout / stderr without raising on non-zero exit.
 *
 * Distinct from the harness shim's ``start`` command (which uses the
 * handle's identity and throws on non-zero) because the H3 + H4
 * Layer-3 scenarios need to:
 *   - Drive ``start_session`` as a DIFFERENT holder than the seeded
 *     orchestrator block, to exercise the refusal path; and
 *   - Inspect non-zero exit + stderr without the helper masking the
 *     failure.
 *
 * Optional ``homeOverride`` redirects ``~/.dabbler/orchestrator-
 * writer.log`` (where ``--force`` lands its audit trail) by setting
 * HOME + USERPROFILE on the subprocess env. Use a tmpdir-scoped
 * override so force-override scenarios don't pollute the dev's home
 * dir.
 */
function attemptStartSession(h, sessionNumber, identity, opts = {}) {
    const args = [
        "-m", "ai_router.start_session",
        "--session-set-dir", h.set_dir,
        "--session-number", String(sessionNumber),
        "--engine", identity.engine,
        "--provider", identity.provider,
        "--model", identity.model,
        "--effort", identity.effort ?? "medium",
    ];
    if (opts.force)
        args.push("--force");
    const env = _filteredEnv();
    if (opts.homeOverride) {
        // os.path.expanduser checks USERPROFILE on Windows and HOME on
        // POSIX; setting both keeps the redirect cross-platform.
        env.HOME = opts.homeOverride;
        env.USERPROFILE = opts.homeOverride;
    }
    const proc = cp.spawnSync(PYTHON, args, {
        encoding: "utf8",
        timeout: 60000,
        cwd: REPO_ROOT,
        env,
    });
    if (proc.error) {
        throw new Error(`attemptStartSession spawn error (${PYTHON}): ${proc.error.message}`);
    }
    return {
        exit: proc.status ?? -1,
        stdout: proc.stdout?.toString() ?? "",
        stderr: proc.stderr?.toString() ?? "",
    };
}
/**
 * Set 033 Session 2 — seed the `orchestrator` block on a fixture's
 * `session-state.json` so Layer-3 smokes can verify the painted-on-
 * screen treatment without driving the writer (`start_session`) end-
 * to-end. Replaces the pre-Set-033 `seedOrchestratorMarker` helper
 * which wrote `.dabbler/orchestrator.json` (now retired per H2).
 *
 * Defaults produce a Claude Opus claim that mirrors the canonical
 * Set 033 Session 1 schema: engine + provider + model + effort +
 * timestamps. Callers override for other-provider variants. Merges
 * into the existing `orchestrator` block rather than replacing the
 * full state file.
 */
function seedOrchestratorBlock(h, overrides = {}) {
    const statePath = path.join(h.set_dir, "session-state.json");
    const raw = fs.readFileSync(statePath, "utf8");
    const state = JSON.parse(raw);
    const now = new Date().toISOString();
    state.orchestrator = {
        engine: "claude",
        provider: "anthropic",
        model: "claude-opus-4-7",
        effort: "high",
        checkedOutAt: now,
        lastActivityAt: now,
        ...overrides,
    };
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}
function makeAdditionalSet(base, newSlug, newTotalSessions) {
    return runHarness([
        "make-additional-set",
        ..._handleArgs(base),
        "--new-slug", newSlug,
        "--new-total-sessions", String(newTotalSessions),
    ]);
}
/**
 * Set 030 Session 5 — rewrite a fixture's ``session-state.json`` from
 * the v3 dual-write shape (what the harness emits today) back to a
 * pure-v2 snapshot the migration UX must detect and offer to migrate.
 *
 * Used by Layer 3 smokes for the "(needs migration)" badge + the
 * migrate command. Round-trips through ``readSessionSets`` afterwards
 * still works — the extension's tolerant v3 reader synthesizes a
 * sessions[] from the legacy triple, so the row renders normally
 * apart from the migration badge.
 */
function downgradeStateFileToV2(h) {
    const statePath = path.join(h.set_dir, "session-state.json");
    const raw = fs.readFileSync(statePath, "utf8");
    const state = JSON.parse(raw);
    // Strip the v3-only fields. Keep the legacy triple and the rest of
    // the snapshot exactly as-is so the v2-reader path produces a
    // matching display.
    delete state.schemaVersion;
    delete state.sessions;
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}
/**
 * Read a state file from disk — used by smokes that need to assert
 * the file was rewritten in v3 shape after a migration round-trip.
 */
function readStateFile(h) {
    const statePath = path.join(h.set_dir, "session-state.json");
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
}
function driveHappyPath(h, throughSession) {
    for (let n = 1; n <= throughSession; n++) {
        const isFinal = n === h.total_sessions;
        startSession(h, n);
        makeActivity(h, n);
        makeDisposition(h, n, isFinal);
        if (isFinal)
            makeChangeLog(h, n);
        const r = closeSession(h, n);
        if (r.exit !== 0) {
            throw new Error(`driveHappyPath: close ${h.slug} session ${n} failed: ` +
                `exit=${r.exit} stderr=${r.stderr}`);
        }
    }
}
// ---------------------------------------------------------------------
// VS Code Electron launch
// ---------------------------------------------------------------------
// Parse "vscode-<platform>-archive-1.120.0" -> [1, 120, 0]. Returns
// null on dirs that don't match the canonical shape, so they sort
// last. Numeric comparison guards against the lex-sort gotcha where
// "1.99.0" would sort ahead of "1.120.0".
function _parseCachedVersion(dirName) {
    const m = dirName.match(/(\d+)\.(\d+)\.(\d+)$/);
    if (!m)
        return null;
    return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}
function _cmpVersion(a, b) {
    if (!a && !b)
        return 0;
    if (!a)
        return 1; // unparseable sorts last
    if (!b)
        return -1;
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const av = a[i] ?? 0;
        const bv = b[i] ?? 0;
        if (av !== bv)
            return bv - av; // descending
    }
    return 0;
}
function findCodeBinary() {
    const override = process.env.VSCODE_BIN;
    if (override) {
        if (!fs.existsSync(override)) {
            throw new Error(`VSCODE_BIN points at non-existent path: ${override}`);
        }
        return override;
    }
    const vsTestDir = path.join(EXTENSION_ROOT, ".vscode-test");
    if (!fs.existsSync(vsTestDir)) {
        throw new Error(`No VS Code binary found and ${vsTestDir} does not exist. ` +
            "Run `npm test` once (or set VSCODE_BIN) to populate the test binary.");
    }
    // Numeric version sort, descending. Avoids the lex-sort bug where
    // "archive-1.99.0" would sort ahead of "archive-1.120.0".
    const entries = fs
        .readdirSync(vsTestDir)
        .filter((e) => e.startsWith("vscode-") && e.includes("archive"))
        .sort((a, b) => _cmpVersion(_parseCachedVersion(a), _parseCachedVersion(b)));
    for (const dir of entries) {
        const candidate = process.platform === "win32"
            ? path.join(vsTestDir, dir, "Code.exe")
            : process.platform === "darwin"
                ? path.join(vsTestDir, dir, "Visual Studio Code.app", "Contents", "MacOS", "Electron")
                : path.join(vsTestDir, dir, "code");
        if (fs.existsSync(candidate))
            return candidate;
    }
    throw new Error(`No usable VS Code binary in ${vsTestDir}. ` +
        `Inspected: ${entries.join(", ") || "(empty)"}`);
}
/**
 * Launch VS Code Electron against *workspacePath*. The launch is
 * fully isolated: a fresh user-data-dir and a fresh extensions-dir
 * are spawned per call, so concurrent test invocations cannot fight
 * over profile state.
 */
async function launchVSCode(workspacePath) {
    const code = findCodeBinary();
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-pw-userdata-"));
    const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-pw-extensions-"));
    const app = await test_1._electron.launch({
        executablePath: code,
        args: [
            `--extensionDevelopmentPath=${EXTENSION_ROOT}`,
            `--user-data-dir=${userDataDir}`,
            `--extensions-dir=${extensionsDir}`,
            "--disable-workspace-trust",
            "--skip-release-notes",
            "--skip-welcome",
            "--disable-telemetry",
            "--disable-updates",
            "--new-window",
            workspacePath,
        ],
        env: _electronEnv(),
        timeout: 60000,
    });
    const page = await app.firstWindow({ timeout: 60000 });
    // Wait for the workbench to settle. The most reliable signal is
    // the activity bar element becoming visible.
    await page.locator(".activitybar").waitFor({ state: "visible", timeout: 60000 });
    return { app, page, userDataDir, extensionsDir };
}
/**
 * Activate the Dabbler activity-bar view container and wait for the
 * Session Sets webview tree to render. Returns a FrameLocator into
 * the webview's inner content frame so callers can chain treeitem
 * queries off it.
 *
 * Set 029 Session 4 pivot: the Session Sets view is now a webview
 * (CustomSessionSetsView), not a native TreeDataProvider. VS Code
 * wraps webview content in a two-level iframe stack: an outer
 * sandboxing iframe and an inner content iframe. Both must be
 * traversed before locating the `role="tree"` element rendered by
 * the webview's client.js.
 */
async function openSessionSetsView(page) {
    const activityIcon = page.locator('.activitybar .action-label[aria-label*="Dabbler AI Orchestration"]');
    await activityIcon.waitFor({ state: "visible", timeout: 30000 });
    await activityIcon.click();
    // The webview shell lives inside `iframe.webview` (outer sandbox)
    // → `iframe#active-frame` (inner content). The role="tree" element
    // is rendered by client.js into <main id="root"> in the inner
    // frame.
    const outer = page.frameLocator('iframe.webview.ready');
    const inner = outer.frameLocator('iframe');
    // Wait for the tree to render (client.js has received the first
    // rowsSnapshot or welcomeHtml fallback fired).
    await inner.locator("#root").waitFor({ state: "attached", timeout: 30000 });
    return inner;
}
/**
 * Trigger the refresh command — equivalent to clicking the
 * activity-bar refresh button. Used after the harness mutates state
 * outside the running extension's awareness.
 */
async function triggerRefresh(page) {
    // Invoke via the command palette to avoid relying on icon hit-target
    // pixel coordinates that shift between VS Code minor versions. F1 is
    // the cross-platform command-palette shortcut (Ctrl+Shift+P /
    // Cmd+Shift+P both ultimately route to the same command, but F1 is
    // unconditionally bound on all three platforms).
    await page.keyboard.press("F1");
    const palette = page.locator(".quick-input-widget input");
    await palette.waitFor({ state: "visible", timeout: 10000 });
    await palette.fill("Dabbler: Refresh Session Sets");
    await page.keyboard.press("Enter");
    // Small settle window for the provider's getChildren() to run and
    // the tree to repaint. The view itself emits no public event.
    await page.waitForTimeout(750);
}
async function closeVSCode(launch) {
    try {
        await launch.app.close();
    }
    catch {
        // best effort — the Electron close handler can race the harness
        // teardown when a test asserts mid-launch.
    }
    for (const dir of [launch.userDataDir, launch.extensionsDir]) {
        try {
            fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
        }
        catch {
            // opportunistic; tmpdirs live under TMPDIR
        }
    }
}
function cleanupTmpDir(tmpPath) {
    try {
        fs.rmSync(tmpPath, { recursive: true, force: true, maxRetries: 3 });
    }
    catch {
        // opportunistic
    }
}
//# sourceMappingURL=electronLaunch.js.map