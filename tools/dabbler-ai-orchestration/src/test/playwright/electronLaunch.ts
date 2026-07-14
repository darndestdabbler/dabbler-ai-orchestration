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

import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { _electron, ElectronApplication, Page } from "@playwright/test";

const EXTENSION_ROOT = path.resolve(__dirname, "..", "..", "..");
const REPO_ROOT = path.resolve(EXTENSION_ROOT, "..", "..");
const HARNESS_CLI = path.join(
  REPO_ROOT,
  "ai_router",
  "tests",
  "e2e",
  "harness_cli.py",
);

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

function _filteredEnv(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const k of _ENV_PASSTHROUGH) {
    const v = process.env[k];
    if (v !== undefined) out[k] = v;
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
  "PATH", "PATHEXT",              // executable search path (Windows includes PATHEXT)
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
  "DISPLAY",                        // X11 (Linux)
  "XAUTHORITY",                     // X11 auth cookie — xvfb-run creates one;
                                    // without it the X connection is refused
                                    // and Electron dies with "The platform
                                    // failed to initialize" (ui/aura)
  "WAYLAND_DISPLAY",                // Wayland (Linux/macOS)
  "XDG_RUNTIME_DIR", "XDG_SESSION_TYPE",  // XDG desktop (Linux)
  "DBUS_SESSION_BUS_ADDRESS",       // D-Bus session (Linux)
  "DESKTOP_SESSION", "GDMSESSION",  // GNOME/session (Linux)
];

function _electronEnv(): { [key: string]: string } {
  const out: { [key: string]: string } = {};

  // Start with universal allowlist
  const allowed = [..._ELECTRON_VAR_ALLOWLIST_UNIVERSAL, ..._ELECTRON_VAR_ALLOWLIST_GUI];

  // Add platform-specific vars
  if (process.platform === "win32") {
    allowed.push(..._ELECTRON_VAR_ALLOWLIST_WINDOWS);
  }

  const allowedSet = new Set(allowed);

  // Copy allowed vars from process.env
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v !== "string") continue;
    if (allowedSet.has(k)) {
      out[k] = v;
    }
  }

  out.ELECTRON_ENABLE_LOGGING = "1";
  return out;
}

export interface FixtureHandle {
  repo_root: string;
  set_dir: string;
  bare_remote: string;
  slug: string;
  total_sessions: number;
  engine: string;
  model: string;
  provider: string;
  effort: string;
}

function runHarness(args: string[], timeoutMs = 60_000): unknown {
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
    throw new Error(
      `harness_cli ${args[0]} failed (exit ${proc.status}): ` +
        `stdout=${proc.stdout?.toString() || ""} stderr=${proc.stderr?.toString() || ""}`,
    );
  }
  const lines = proc.stdout.toString().trim().split(/\r?\n/).filter((s) => s.length > 0);
  return JSON.parse(lines[lines.length - 1]);
}

function _handleArgs(h: FixtureHandle): string[] {
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

export function makeTmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
}

export function makeSet(
  tmpPath: string,
  slug: string,
  totalSessions: number,
): FixtureHandle {
  return runHarness([
    "make-set",
    "--tmp-path", tmpPath,
    "--slug", slug,
    "--total-sessions", String(totalSessions),
  ]) as FixtureHandle;
}

export function startSession(h: FixtureHandle, n: number): void {
  runHarness(["start", ..._handleArgs(h), "--session-number", String(n)]);
}

export function makeActivity(h: FixtureHandle, n: number): void {
  runHarness([
    "make-activity",
    ..._handleArgs(h),
    "--session-number", String(n),
    "--description", "playwright rendering smoke",
  ]);
}

export function makeDisposition(
  h: FixtureHandle,
  n: number,
  isFinal: boolean,
): void {
  const args = [
    "make-disposition",
    ..._handleArgs(h),
    "--session-number", String(n),
    "--status", "completed",
  ];
  if (isFinal) args.push("--is-final");
  runHarness(args);
}

export function makeChangeLog(h: FixtureHandle, finalSessionN: number): void {
  runHarness([
    "make-change-log",
    ..._handleArgs(h),
    "--final-session-number", String(finalSessionN),
  ]);
}

export interface CloseResult {
  exit: number;
  stdout: string;
  stderr: string;
}

export function closeSession(
  h: FixtureHandle,
  n: number,
  opts: { force?: boolean } = {},
): CloseResult {
  const args = ["close", ..._handleArgs(h), "--session-number", String(n)];
  if (opts.force) args.push("--force");
  return runHarness(args) as CloseResult;
}

export function cancelSet(h: FixtureHandle): void {
  runHarness(["cancel", ..._handleArgs(h), "--reason", "playwright cancel scenario"]);
}

export interface StartSessionAttemptResult {
  exit: number;
  stdout: string;
  stderr: string;
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
export function attemptStartSession(
  h: FixtureHandle,
  sessionNumber: number,
  identity: {
    engine: string;
    provider: string;
    model: string;
    effort?: string;
  },
  opts: {
    force?: boolean;
    homeOverride?: string;
    // Set 036 Session 5: forward --chat-session-id when present.
    // The Q1 chatSessionId refinement to H4 needs this surface so
    // Layer-3 scenarios can drive the writer with two distinct
    // chats (different chatSessionIds, same engine + provider).
    // Pass null to deliberately omit the arg (lets the writer fall
    // through to the env var when set, otherwise to None).
    chatSessionId?: string | null;
    // Set 036 Session 5: extra env vars layered onto the filtered
    // base env. Used by new-chat-id-cli-flow.spec.ts to set
    // $CHAT_SESSION_ID so start_session's env-fallback branch
    // populates the orchestrator block.
    env?: Record<string, string>;
  } = {},
): StartSessionAttemptResult {
  const args = [
    "-m", "ai_router.start_session",
    "--session-set-dir", h.set_dir,
    "--session-number", String(sessionNumber),
    "--engine", identity.engine,
    "--provider", identity.provider,
    "--model", identity.model,
    "--effort", identity.effort ?? "medium",
  ];
  if (opts.force) args.push("--force");
  if (typeof opts.chatSessionId === "string") {
    args.push("--chat-session-id", opts.chatSessionId);
  }

  const env = _filteredEnv();
  if (opts.homeOverride) {
    // os.path.expanduser checks USERPROFILE on Windows and HOME on
    // POSIX; setting both keeps the redirect cross-platform.
    env.HOME = opts.homeOverride;
    env.USERPROFILE = opts.homeOverride;
  }
  if (opts.env) {
    for (const [k, v] of Object.entries(opts.env)) env[k] = v;
  }

  const proc = cp.spawnSync(PYTHON, args, {
    encoding: "utf8",
    timeout: 60_000,
    cwd: REPO_ROOT,
    env,
  });
  if (proc.error) {
    throw new Error(
      `attemptStartSession spawn error (${PYTHON}): ${proc.error.message}`,
    );
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
export function seedOrchestratorBlock(
  h: FixtureHandle,
  overrides: Partial<{
    engine: string;
    provider: string;
    model: string;
    effort: string;
    checkedOutAt: string;
    lastActivityAt: string;
    // Set 036 Session 5: chatSessionId. Three meaningful shapes:
    //   - key omitted entirely  → legacy pre-Set-036 state file
    //   - key present, value null → Set 036 writer that had no ID
    //   - key present, string    → Set 036 writer with explicit ID
    // The "in" operator distinguishes omitted from explicit-null
    // so callers can seed any of the three; the writer's tolerant-
    // on-read predicate has distinct branches for the first two.
    chatSessionId: string | null;
  }> = {},
): void {
  const statePath = path.join(h.set_dir, "session-state.json");
  const raw = fs.readFileSync(statePath, "utf8");
  const state = JSON.parse(raw) as Record<string, unknown>;
  const now = new Date().toISOString();
  const block: Record<string, unknown> = {
    engine: "claude",
    provider: "anthropic",
    model: "claude-opus-4-7",
    effort: "high",
    checkedOutAt: now,
    lastActivityAt: now,
    ...overrides,
  };
  // The spread above copies chatSessionId only when explicitly in
  // overrides — Partial's optional key is included via "in" if the
  // caller wrote it, and excluded if they didn't. We keep that
  // shape verbatim so the omitted-key vs. null-value distinction
  // survives to the writer's predicate.
  if (!("chatSessionId" in overrides)) {
    delete (block as { chatSessionId?: unknown }).chatSessionId;
  }
  state.orchestrator = block;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

export function makeAdditionalSet(
  base: FixtureHandle,
  newSlug: string,
  newTotalSessions: number,
): FixtureHandle {
  return runHarness([
    "make-additional-set",
    ..._handleArgs(base),
    "--new-slug", newSlug,
    "--new-total-sessions", String(newTotalSessions),
  ]) as FixtureHandle;
}

// Derive the legacy v2/v3 top-level triple from a sessions[] ledger.
// Fresh harness fixtures are all-not-started, but derive honestly so
// downgrades of driven fixtures stay faithful too.
function _legacyTripleFromSessions(state: Record<string, unknown>): {
  currentSession: number | null;
  totalSessions: number;
  completedSessions: number[];
} {
  const sessions = Array.isArray(state.sessions)
    ? (state.sessions as Array<Record<string, unknown>>)
    : [];
  const completed = sessions
    .filter((s) => s.status === "complete")
    .map((s) => s.number as number);
  const inProgress = sessions.find((s) => s.status === "in-progress");
  return {
    currentSession: inProgress ? (inProgress.number as number) : null,
    totalSessions: sessions.length,
    completedSessions: completed,
  };
}

/**
 * Set 030 Session 5 (reworked in the CI-repair pass, 2026-06-12) —
 * rewrite a fixture's ``session-state.json`` from the canonical v4
 * shape (what the harness emits today, post-Set-049) down to a
 * GENUINE v2 snapshot: explicit ``schemaVersion: 2`` plus the legacy
 * top-level triple, no ``sessions[]``. A real v2 file carried its
 * schemaVersion — the previous version of this helper deleted the
 * field entirely, which produced a versionless v1-ish file whose
 * migration tooltip reads "Ran under an older schema" instead of
 * "Ran under schema v2".
 *
 * Used by Layer 3 smokes for the migration asterisk + the migrate
 * command. Round-trips through ``readSessionSets`` afterwards still
 * work — the extension's tolerant reader synthesizes sessions[] from
 * the legacy triple, so the row renders normally apart from the
 * migration marker.
 */
export function downgradeStateFileToV2(h: FixtureHandle): void {
  const statePath = path.join(h.set_dir, "session-state.json");
  const raw = fs.readFileSync(statePath, "utf8");
  const state = JSON.parse(raw) as Record<string, unknown>;
  const triple = _legacyTripleFromSessions(state);
  state.schemaVersion = 2;
  state.currentSession = triple.currentSession;
  state.totalSessions = triple.totalSessions;
  state.completedSessions = triple.completedSessions;
  delete state.sessions;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

/**
 * CI-repair pass, 2026-06-12 — rewrite a fixture's
 * ``session-state.json`` from the canonical v4 shape down to
 * canonical v3: ``schemaVersion: 3``, the ``sessions[]`` ledger kept
 * (v3 dual-write carried it), plus the v3 top-level lifecycle fields.
 * Exists because the harness writers emit v4 since Set 049 — the
 * migration-cta-v4 smoke's original premise ("makeSet emits canonical
 * v3 today", true at Set 047) silently rotted, leaving its fixture
 * already-current and the asterisk it asserts never rendering.
 */
export function downgradeStateFileToV3(h: FixtureHandle): void {
  const statePath = path.join(h.set_dir, "session-state.json");
  const raw = fs.readFileSync(statePath, "utf8");
  const state = JSON.parse(raw) as Record<string, unknown>;
  const triple = _legacyTripleFromSessions(state);
  state.schemaVersion = 3;
  state.currentSession = triple.currentSession;
  state.totalSessions = triple.totalSessions;
  state.completedSessions = triple.completedSessions;
  state.lifecycleState = state.status === "complete" ? "closed"
    : state.status === "in-progress" ? "work_in_progress" : null;
  state.startedAt = state.startedAt ?? null;
  state.completedAt = state.completedAt ?? null;
  state.orchestrator = state.orchestrator ?? null;
  state.verificationVerdict = state.verificationVerdict ?? null;
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + "\n", "utf8");
}

/**
 * Read a state file from disk — used by smokes that need to assert
 * the file was rewritten in v3 shape after a migration round-trip.
 */
export function readStateFile(h: FixtureHandle): Record<string, unknown> {
  const statePath = path.join(h.set_dir, "session-state.json");
  return JSON.parse(fs.readFileSync(statePath, "utf8"));
}

export function driveHappyPath(h: FixtureHandle, throughSession: number): void {
  for (let n = 1; n <= throughSession; n++) {
    const isFinal = n === h.total_sessions;
    startSession(h, n);
    makeActivity(h, n);
    makeDisposition(h, n, isFinal);
    if (isFinal) makeChangeLog(h, n);
    const r = closeSession(h, n);
    if (r.exit !== 0) {
      throw new Error(
        `driveHappyPath: close ${h.slug} session ${n} failed: ` +
          `exit=${r.exit} stderr=${r.stderr}`,
      );
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
function _parseCachedVersion(dirName: string): number[] | null {
  const m = dirName.match(/(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return null;
  return [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
}

function _cmpVersion(a: number[] | null, b: number[] | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;   // unparseable sorts last
  if (!b) return -1;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return bv - av;  // descending
  }
  return 0;
}

function findCodeBinary(): string {
  const override = process.env.VSCODE_BIN;
  if (override) {
    if (!fs.existsSync(override)) {
      throw new Error(`VSCODE_BIN points at non-existent path: ${override}`);
    }
    return override;
  }
  const vsTestDir = path.join(EXTENSION_ROOT, ".vscode-test");
  if (!fs.existsSync(vsTestDir)) {
    throw new Error(
      `No VS Code binary found and ${vsTestDir} does not exist. ` +
        "Run `npm test` once (or set VSCODE_BIN) to populate the test binary.",
    );
  }
  // Numeric version sort, descending. Avoids the lex-sort bug where
  // "archive-1.99.0" would sort ahead of "archive-1.120.0".
  //
  // Note: the filter accepts any `vscode-*` entry rather than
  // requiring the "archive" segment that Windows downloads carry.
  // @vscode/test-electron names Windows downloads
  // `vscode-win32-x64-archive-X.Y.Z` (the zip-archive layout)
  // but Linux downloads `vscode-linux-x64-X.Y.Z` (no "archive"
  // segment, because Linux ships as a tarball). macOS uses
  // `vscode-darwin-x64-X.Y.Z` or `vscode-darwin-arm64-X.Y.Z`.
  // Filtering on "archive" would exclude Linux/macOS, breaking CI.
  const entries = fs
    .readdirSync(vsTestDir)
    .filter((e) => e.startsWith("vscode-"))
    .sort((a, b) => _cmpVersion(_parseCachedVersion(a), _parseCachedVersion(b)));
  for (const dir of entries) {
    const candidate =
      process.platform === "win32"
        ? path.join(vsTestDir, dir, "Code.exe")
        : process.platform === "darwin"
          ? path.join(vsTestDir, dir, "Visual Studio Code.app", "Contents", "MacOS", "Electron")
          : path.join(vsTestDir, dir, "code");
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `No usable VS Code binary in ${vsTestDir}. ` +
      `Inspected: ${entries.join(", ") || "(empty)"}`,
  );
}

export interface LaunchedVSCode {
  app: ElectronApplication;
  page: Page;
  userDataDir: string;
  extensionsDir: string;
}

/**
 * Launch VS Code Electron against *workspacePath*. The launch is
 * fully isolated: a fresh user-data-dir and a fresh extensions-dir
 * are spawned per call, so concurrent test invocations cannot fight
 * over profile state.
 *
 * `extraArgs` (Set 101 S1): optional additional CLI args, inserted
 * before the workspace path. The first consumer is
 * `--enable-smoke-test-driver`, which forces workbench dialogs to the
 * CUSTOM (HTML) style so a modal confirm is clickable from Playwright —
 * `window.dialogStyle` defaults to "native" on desktop, and a native OS
 * dialog is invisible to the automation (the exact facility VS Code's
 * own smoke tests use).
 */
export async function launchVSCode(
  workspacePath: string,
  extraArgs: string[] = [],
): Promise<LaunchedVSCode> {
  const code = findCodeBinary();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-pw-userdata-"));
  const extensionsDir = fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-pw-extensions-"));
  const app = await _electron.launch({
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
      ...extraArgs,
      workspacePath,
    ],
    env: _electronEnv(),
    timeout: 60_000,
  });
  const page = await app.firstWindow({ timeout: 60_000 });
  // Wait for the workbench to settle. The most reliable signal is
  // the activity bar element becoming visible.
  await page.locator(".activitybar").waitFor({ state: "visible", timeout: 60_000 });
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
export async function openSessionSetsView(
  page: Page,
): Promise<import("@playwright/test").FrameLocator> {
  const activityIcon = page.locator(
    '.activitybar .action-label[aria-label*="Dabbler AI Orchestration"]',
  );
  await activityIcon.waitFor({ state: "visible", timeout: 30_000 });
  await activityIcon.click();
  // The webview shell lives inside `iframe.webview` (outer sandbox)
  // → `iframe#active-frame` (inner content). The role="tree" element
  // is rendered by client.js into <main id="root"> in the inner
  // frame. Disambiguate by the extensionId baked into the iframe src:
  // VS Code hosts ALL webview iframes in one shared overlay container
  // (NOT inside the side-bar part's DOM), and on empty workspaces the
  // Set 060 Getting Started instructions doc opens as a markdown
  // preview — a second `iframe.webview.ready` (extensionId
  // vscode.markdown-language-features) that breaks an unscoped
  // strict-mode locator.
  const outer = page.frameLocator(
    'iframe.webview.ready[src*="dabbler-ai-orchestration"]',
  );
  // Target the content iframe by id: the webview host page keeps an
  // old and a new inner iframe alive transiently while (re)loading
  // content, so a bare `iframe` locator can strict-mode-violate on
  // fast runs (observed on the macOS CI runner).
  const inner = outer.frameLocator("iframe#active-frame");
  // Wait for the view to render (client.js has received the first
  // rowsSnapshot).
  await inner.locator("#root").waitFor({ state: "attached", timeout: 30_000 });
  return inner;
}

/**
 * Trigger the refresh command — equivalent to clicking the
 * activity-bar refresh button. Used after the harness mutates state
 * outside the running extension's awareness.
 */
export async function triggerRefresh(page: Page): Promise<void> {
  // Invoke via the command palette to avoid relying on icon hit-target
  // pixel coordinates that shift between VS Code minor versions. F1 is
  // the cross-platform command-palette shortcut (Ctrl+Shift+P /
  // Cmd+Shift+P both ultimately route to the same command, but F1 is
  // unconditionally bound on all three platforms).
  await page.keyboard.press("F1");
  const palette = page.locator(".quick-input-widget input");
  await palette.waitFor({ state: "visible", timeout: 10_000 });
  await palette.fill("Dabbler: Refresh Work Explorer");
  await page.keyboard.press("Enter");
  // Small settle window for the provider's getChildren() to run and
  // the tree to repaint. The view itself emits no public event.
  await page.waitForTimeout(750);
}

export async function closeVSCode(launch: LaunchedVSCode): Promise<void> {
  try {
    await launch.app.close();
  } catch {
    // best effort — the Electron close handler can race the harness
    // teardown when a test asserts mid-launch.
  }
  for (const dir of [launch.userDataDir, launch.extensionsDir]) {
    try {
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      // opportunistic; tmpdirs live under TMPDIR
    }
  }
}

export function cleanupTmpDir(tmpPath: string): void {
  try {
    fs.rmSync(tmpPath, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // opportunistic
  }
}
