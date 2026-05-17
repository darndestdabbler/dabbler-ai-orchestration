// Shared utilities for the @vscode/test-electron e2e tree-provider
// suite. Layer 2 of the three-layer harness defined in Set 027's spec:
// asserts on `SessionSetsProvider` output produced from real
// fixture-driven state files. The CLI driving still happens via Python
// subprocess (the same CLIs the orchestrator uses in production); only
// the assertion side runs in TS, per spec § Session 3.
//
// The harness shells into ``ai_router/tests/e2e/harness_cli.py``, a
// thin JSON-over-stdout dispatcher around the Python fixture helpers
// established in Sessions 1 and 2. Each call spawns a tmpdir-scoped
// fixture (git working tree + bare remote + spec.md + not-started
// state), drives state transitions through the real start/close CLIs,
// and returns the fixture's paths to TS. Tests then construct a fresh
// `SessionSetsProvider` against the fixture as a workspace folder and
// assert on `getChildren()` / item shape.
//
// A test-electron run launches a single VS Code instance and visits
// every test file in order; tests therefore mutate
// `vscode.workspace.workspaceFolders` to swap fixtures in and out.
// `replaceWorkspaceFolders` removes all existing folders and adds the
// fixture's repo as the sole folder, then yields control to the test.

import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as vscode from "vscode";
import { SessionSetsProvider } from "../../../providers/SessionSetsProvider";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..", "..");
const HARNESS_CLI = path.join(
  REPO_ROOT,
  "ai_router",
  "tests",
  "e2e",
  "harness_cli.py",
);

// Default to ``python`` on PATH. CI / dev shells with a venv-bound
// interpreter set HARNESS_PYTHON to override (mirrors the
// dabblerSessionSets.pythonPath config knob's intent for tests).
const PYTHON = process.env.HARNESS_PYTHON || "python";

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

function handleArgs(h: FixtureHandle): string[] {
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

// Verifier (Set 027 Session 3, Round A): strip ambient `GIT_*` and
// `PYTHONPATH` from the spawned env so a polluted parent shell can't
// redirect git operations or Python imports inside the harness shim.
// The shim builds a self-contained fixture (tmpdir + bare remote +
// fresh repo) and patches sys.path itself; the only env vars it
// legitimately depends on are PATH (to find `git`), basic OS dirs,
// and HARNESS_PYTHON (which we read separately into PYTHON above).
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
  // Force UTF-8 in the Python child so stdout JSON survives Windows
  // cp1252 codec quirks on logging paths inside fixtures.
  out.PYTHONIOENCODING = "utf-8";
  out.PYTHONUTF8 = "1";
  return out;
}

function runHarness(args: string[], timeoutMs = 60_000): unknown {
  const proc = cp.spawnSync(PYTHON, [HARNESS_CLI, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    cwd: REPO_ROOT,
    env: _filteredEnv(),
  });
  if (proc.error) {
    throw new Error(
      `harness_cli spawn error (${PYTHON}): ${proc.error.message}`,
    );
  }
  if (proc.status !== 0) {
    throw new Error(
      `harness_cli ${args[0]} failed (exit ${proc.status}): ` +
        `stdout=${proc.stdout?.toString() || ""} stderr=${proc.stderr?.toString() || ""}`,
    );
  }
  const stdout = proc.stdout.toString().trim();
  // Take the last line of stdout — the CLI emits exactly one JSON
  // object, but stray newlines from `git push` or `print()` inside
  // imported modules can prepend noise. Last-line wins keeps the
  // contract robust against incidental writes.
  const lines = stdout.split(/\r?\n/).filter((s) => s.length > 0);
  const last = lines[lines.length - 1];
  try {
    return JSON.parse(last);
  } catch (e) {
    throw new Error(
      `harness_cli ${args[0]} returned non-JSON stdout: ${stdout}`,
    );
  }
}

// ---------------------------------------------------------------------
// High-level fixture API
// ---------------------------------------------------------------------

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

export function startSession(h: FixtureHandle, sessionNumber: number): void {
  runHarness([
    "start",
    ...handleArgs(h),
    "--session-number", String(sessionNumber),
  ]);
}

export function makeActivity(
  h: FixtureHandle,
  sessionNumber: number,
  description = "harness work step",
): void {
  runHarness([
    "make-activity",
    ...handleArgs(h),
    "--session-number", String(sessionNumber),
    "--description", description,
  ]);
}

export function makeDisposition(
  h: FixtureHandle,
  sessionNumber: number,
  isFinal: boolean,
  status = "completed",
): void {
  const args = [
    "make-disposition",
    ...handleArgs(h),
    "--session-number", String(sessionNumber),
    "--status", status,
  ];
  if (isFinal) args.push("--is-final");
  runHarness(args);
}

export function makeChangeLog(
  h: FixtureHandle,
  finalSessionNumber?: number,
): void {
  const args = ["make-change-log", ...handleArgs(h)];
  if (finalSessionNumber !== undefined) {
    args.push("--final-session-number", String(finalSessionNumber));
  }
  runHarness(args);
}

export interface CloseResult {
  exit: number;
  stdout: string;
  stderr: string;
}

export function closeSession(
  h: FixtureHandle,
  sessionNumber: number,
  opts: { force?: boolean; injectForceEnv?: boolean } = {},
): CloseResult {
  const args = [
    "close",
    ...handleArgs(h),
    "--session-number", String(sessionNumber),
  ];
  if (opts.force) args.push("--force");
  if (opts.injectForceEnv === false) args.push("--no-inject-force-env");
  return runHarness(args) as CloseResult;
}

export function cancelSet(h: FixtureHandle, reason = "harness cancel"): void {
  runHarness(["cancel", ...handleArgs(h), "--reason", reason]);
}

export function restoreSet(h: FixtureHandle, reason = "harness restore"): void {
  runHarness(["restore", ...handleArgs(h), "--reason", reason]);
}

export function makeAdditionalSet(
  base: FixtureHandle,
  newSlug: string,
  newTotalSessions: number,
): FixtureHandle {
  return runHarness([
    "make-additional-set",
    ...handleArgs(base),
    "--new-slug", newSlug,
    "--new-total-sessions", String(newTotalSessions),
  ]) as FixtureHandle;
}

export function makeSiblingWorktree(
  h: FixtureHandle,
  wtSlug: string,
): string {
  const r = runHarness([
    "make-sibling-worktree",
    ...handleArgs(h),
    "--wt-slug", wtSlug,
  ]) as { worktree_path: string };
  return r.worktree_path;
}

// ---------------------------------------------------------------------
// Convenience: drive a complete happy-path session in one call
// ---------------------------------------------------------------------

/**
 * Drive sessions 1..n through the full happy path against *h*. The
 * change-log is written before the final close, matching the
 * ``check_change_log_fresh`` gate that fires only on the terminal
 * session.
 */
export function driveHappyPath(h: FixtureHandle, throughSession: number): void {
  for (let n = 1; n <= throughSession; n++) {
    const isFinal = n === h.total_sessions;
    startSession(h, n);
    makeActivity(h, n);
    makeDisposition(h, n, isFinal);
    if (isFinal) makeChangeLog(h, n);
    const res = closeSession(h, n);
    if (res.exit !== 0) {
      throw new Error(
        `close_session for ${h.slug} session ${n} failed: ` +
          `exit=${res.exit} stdout=${res.stdout} stderr=${res.stderr}`,
      );
    }
  }
}

// ---------------------------------------------------------------------
// Workspace + provider plumbing
// ---------------------------------------------------------------------

/**
 * Replace `vscode.workspace.workspaceFolders` with the single folder at
 * *folderPath*. Returns a promise that resolves when VS Code has
 * surfaced the change event — without that, a `SessionSetsProvider`
 * constructed in the next line would read pre-swap state.
 *
 * The provider doesn't bind a file-watcher in tests because activation
 * gates on at least one workspace folder being present at startup;
 * inside the test harness, activate() may have early-returned (the
 * launched workspace started empty). Tests therefore construct fresh
 * provider instances themselves rather than reaching into the
 * extension-registered one. This sidesteps the file-watcher entirely
 * — `getChildren()` is synchronous over `readAllSessionSets()`, which
 * just walks the filesystem on each call.
 */
export async function replaceWorkspaceFolders(folderPath: string): Promise<void> {
  // Verifier (Set 027 Session 3, Round A): reject on
  // `updateWorkspaceFolders` returning false, time out if the event
  // never lands, and post-condition-check the swap so a silent VS-Code
  // rejection cannot leave a test asserting against stale workspace
  // state. The prior "resolve and let the next step fail loudly" path
  // hid the swap failure behind a downstream assertion message.
  const current = vscode.workspace.workspaceFolders;
  const uri = vscode.Uri.file(folderPath);
  const SWAP_TIMEOUT_MS = 5_000;
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    let timer: NodeJS.Timeout | null = null;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      sub.dispose();
      fn();
    };
    const sub = vscode.workspace.onDidChangeWorkspaceFolders(() => {
      const first = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
      if (first === folderPath) {
        settle(() => resolve());
      }
      // Otherwise let the timeout fire — the event was for a different
      // mutation (concurrent test? activation? defensive against
      // listener-array race).
    });
    timer = setTimeout(() => {
      settle(() => reject(new Error(
        `replaceWorkspaceFolders(${folderPath}): timed out after ` +
          `${SWAP_TIMEOUT_MS}ms waiting for onDidChangeWorkspaceFolders. ` +
          `Current workspaceFolders[0]=${vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath}.`,
      )));
    }, SWAP_TIMEOUT_MS);
    const ok = vscode.workspace.updateWorkspaceFolders(
      0,
      current?.length ?? 0,
      { uri, name: path.basename(folderPath) },
    );
    if (!ok) {
      settle(() => reject(new Error(
        `replaceWorkspaceFolders(${folderPath}): ` +
          "updateWorkspaceFolders returned false (change rejected).",
      )));
    }
  });
}

/**
 * Construct a fresh `SessionSetsProvider`. Tests use this rather than
 * reaching into the extension's registered provider — extension
 * activation requires a workspace folder to be present at startup, and
 * the test-electron launch starts with none. Constructing a provider
 * directly bypasses that gate and exercises the same code path that
 * activate() would.
 */
export function buildProvider(): SessionSetsProvider {
  // The provider uses extensionUri only to resolve icon paths in
  // `iconUriFor`; the icons are not inspected in these tests. Pointing
  // it at the workspace folder is a safe stand-in.
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]?.uri
    ?? vscode.Uri.file(REPO_ROOT);
  return new SessionSetsProvider(workspaceFolder);
}

// ---------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------

/**
 * Remove a fixture tmpdir. Best-effort: on Windows, the bare remote
 * may briefly retain locks from a recent ``git push`` even after the
 * child process exits. Swallow the EBUSY/EPERM and trust the OS to
 * clean it up on shutdown — fixtures live under TMPDIR.
 */
export function cleanupTmpDir(tmpPath: string): void {
  try {
    fs.rmSync(tmpPath, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // ignore — tmpdir cleanup is opportunistic
  }
}

// ---------------------------------------------------------------------
// Group / item inspection helpers
// ---------------------------------------------------------------------

export interface GroupChild extends vscode.TreeItem {
  contextValue: "group";
  groupKey: string;
}

/**
 * Read the top-level bucket groups from *provider*. Returns the labels
 * verbatim so tests can assert on the trailing ``(N)`` count too.
 */
export function topLevelGroups(
  provider: SessionSetsProvider,
): vscode.TreeItem[] {
  return provider.getChildren(undefined) as vscode.TreeItem[];
}

/**
 * Find the group whose `groupKey` equals *key* and return its
 * children. Returns an empty array when the group is absent (e.g.
 * "cancelled" doesn't render when no cancelled sets exist).
 */
export function childrenOfGroup(
  provider: SessionSetsProvider,
  key: "in-progress" | "not-started" | "complete" | "cancelled",
): vscode.TreeItem[] {
  const groups = topLevelGroups(provider);
  const group = groups.find(
    (g) => (g as GroupChild).groupKey === key,
  );
  if (!group) return [];
  return provider.getChildren(group) as vscode.TreeItem[];
}
