// Set 079 Session 2 (Feature 1): the Copilot seat-setup wrapper — the
// happy-path wiring between the Getting Started Build action and Set
// 078's `python -m ai_router.copilot_catalog --refresh`.
//
// Sequencing contract (spec Feature 1 → Sequencing, critique C2): the
// catalog refresh is NOT a pre-flight. It depends on `ai_router` being
// importable in the scaffolded `.venv`, exactly the state the existing
// Build sequence produces AFTER venv creation + `pip install
// dabbler-ai-router` succeed. The caller (gitScaffold.ts) therefore
// invokes this module strictly after `scaffoldConsumerRepo` reports
// `installOk`, passing the SAME venv interpreter the install exercised
// (`venvPython(outcome.venvPath)` — the interpreter-resolution
// `Dabbler: Install ai-router` already uses, reused, not re-invented).
//
// CLI contract this module relies on (spec Feature 1 → CLI contract,
// critique M5 — pinned, so drift is a noticed decision):
//   - invocation: `python -m ai_router.copilot_catalog --refresh
//     --seat-id <id> --seat-label <label> [--binary <path>]`;
//   - exit code is ALWAYS 0 on a completed probe run, regardless of the
//     provider-count outcome — never treat exit code as success;
//   - the success signal is the CLI's own stdout line
//     `Wrote <path>: <N>/<M> models confirmed, providers=[...]`;
//   - the <2-providers warning is a non-fatal stderr line.
//
// Progress granularity (critique m2 — decision recorded): the refresh
// prints NOTHING until its final summary line (`discover_catalog` has no
// per-model output, and this set's non-goals forbid touching the catalog
// discovery logic to add one), so determinate "N of M models checked"
// progress is not parseable. The VS Code layer runs an INDETERMINATE
// cancellable notification instead — the documented fallback.
//
// Async-UX robustness (critique M1): cancellation kills the child AND
// restores the lockfile to its pre-run state (delete when it did not
// exist; write back the prior content when it did — the CLI's
// `write_lockfile` truncate-rewrites at the end of the run, so a kill
// landing mid-write must not leave a half-written file a later `route()`
// could read, and must not destroy a prior successful run's lock either).
// A disposal hook the caller registers into `context.subscriptions` does
// the same on extension-host teardown. The refresh and the config write
// are two separate steps: a refresh that succeeds followed by a config
// write that fails is reported as its own `config-write-failed` state,
// never conflated with "refresh failed".
//
// VS Code-free by design (the tierMarkerStore.ts pattern): the process
// spawner, filesystem, cancellation token, and disposal registration are
// all injected so the Layer-2 suite pins the full happy path — and the
// cancellation/teardown hygiene — without spawning a real subprocess.

import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import { ROUTER_CONFIG_REL } from "./aiRouterInstall";

/** Where the refresh writes the seat-scoped lockfile, relative to the
 * project root. Mirrors `copilot_catalog.DEFAULT_LOCKFILE_PATH` (the
 * spawn runs with `cwd: projectDir` and leaves `--out` at its default,
 * per the pinned invocation) and `transports.copilot-cli.lockfile` in
 * the seeded router-config.yaml — all three must agree. */
export const CATALOG_LOCKFILE_REL = path.posix.join(
  "ai_router",
  "copilot-catalog.lock",
);

export type TransportProfile = "api" | "copilot-cli";

// ---------------------------------------------------------------------------
// Seat identity (spec Feature 1 → Seat identity, critique C1)
// ---------------------------------------------------------------------------

/**
 * Auto-derive the stable `--seat-id`: `seat-` + the first 12 hex chars
 * of sha256(hostname|username). Deterministic and machine/user-stable —
 * never operator-typed (critique C1: no text field, no validation UI,
 * no new persistence contract). Inputs are trimmed and lowercased first
 * so OS-level case variance (Windows hostnames report inconsistent
 * case across APIs) cannot fork the id between runs.
 */
export function deriveSeatId(hostname: string, username: string): string {
  const canonical = `${hostname.trim().toLowerCase()}|${username.trim().toLowerCase()}`;
  const digest = crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
  return `seat-${digest.slice(0, 12)}`;
}

/**
 * Auto-derive the `--seat-label`: the workspace folder's basename
 * (already-available Build-time context; zero typing). An operator who
 * wants a custom label re-runs the CLI by hand with `--seat-label` —
 * the guided flow's job is the zero-typing default, not every option.
 */
export function deriveSeatLabel(projectDir: string): string {
  const base = path.basename(projectDir);
  return base === "" ? "workspace" : base;
}

/**
 * The pinned refresh invocation's argv (after the interpreter).
 * `explicitBinary` threads the operator's `dabblerSessionSets.copilotCliPath`
 * setting through the CLI's `--binary` flag (S1 close-out note) so the
 * probe and the refresh spawn resolve the same executable; omitted, the
 * CLI's own default (`copilot`) applies.
 */
export function buildRefreshArgs(
  seatId: string,
  seatLabel: string,
  explicitBinary?: string,
): string[] {
  const args = [
    "-m",
    "ai_router.copilot_catalog",
    "--refresh",
    "--seat-id",
    seatId,
    "--seat-label",
    seatLabel,
  ];
  if (explicitBinary) args.push("--binary", explicitBinary);
  return args;
}

// ---------------------------------------------------------------------------
// Result parsing (spec Feature 1 → Provider-count check)
// ---------------------------------------------------------------------------

export interface RefreshSummary {
  /** The lockfile path exactly as the CLI reported it. */
  lockfilePath: string;
  confirmed: number;
  total: number;
  /** Provider names as printed — may contain duplicates never (the CLI
   * prints a sorted set), but callers should still dedupe defensively. */
  providers: string[];
}

// The CLI's completion line: `Wrote <path>: <N>/<M> models confirmed,
// providers=['anthropic', 'google']` — the providers list is a Python
// list repr (single-quoted strings; `[]` when empty).
const REFRESH_SUMMARY_RE =
  /^Wrote (.+): (\d+)\/(\d+) models confirmed, providers=\[([^\]]*)\]\s*$/m;

/**
 * Parse the refresh's own stdout completion line. Returns null when the
 * line is absent or malformed — callers MUST treat that as a failed
 * refresh, never fall back to "exit code 0 means it worked" (the CLI
 * exits 0 even when fewer than 2 providers confirm; the pinned contract).
 */
export function parseRefreshStdout(stdout: string): RefreshSummary | null {
  const m = REFRESH_SUMMARY_RE.exec(stdout);
  if (!m) return null;
  const providers = m[4]
    .split(",")
    .map((tok) => tok.trim().replace(/^'(.*)'$/, "$1"))
    .filter((tok) => tok.length > 0);
  return {
    lockfilePath: m[1],
    confirmed: Number(m[2]),
    total: Number(m[3]),
    providers,
  };
}

// ---------------------------------------------------------------------------
// transport.profile — template-variable render over the seeded config
// (spec Feature 1 → Config write, critique M4)
// ---------------------------------------------------------------------------

interface ProfileLocation {
  valueStart: number;
  valueEnd: number;
  value: string;
}

/**
 * Locate the `transport:` block's `profile:` value in a router-config
 * text. Anchored on the block AND on the block's DIRECT-child indent —
 * a `profile` key under some other top-level block must never match,
 * and neither may a `profile` key nested inside a sub-block of
 * `transport:` itself (S2 code-review cross-verifier Major: matching
 * the first indented `profile:` anywhere in the block could rewrite a
 * nested field and report success while the real `transport.profile`
 * stayed `api`). The direct-child indent is taken from the block's
 * first indented non-comment line; only lines at exactly that indent
 * are candidates. Scanning stops at the next top-level key (a column-0
 * non-comment line), so the sibling `transports:` block is out of
 * bounds. Returns null when the anchor is absent (fail loud at the
 * caller — never append a second `transport.profile:` key; that is the
 * exact last-wins YAML corruption critique M4 forbids).
 */
function locateTransportProfile(text: string): ProfileLocation | null {
  const blockMatch = /^transport:[ \t]*(?:#.*)?$/m.exec(text);
  if (!blockMatch) return null;
  let lineStart = blockMatch.index + blockMatch[0].length;
  // Step past the matched line's EOL.
  while (lineStart < text.length && (text[lineStart] === "\r" || text[lineStart] === "\n")) {
    if (text[lineStart] === "\n") {
      lineStart += 1;
      break;
    }
    lineStart += 1;
  }
  let childIndent: number | null = null;
  while (lineStart < text.length) {
    let lineEnd = text.indexOf("\n", lineStart);
    if (lineEnd === -1) lineEnd = text.length;
    const line = text.slice(lineStart, lineEnd).replace(/\r$/, "");
    if (/^[^ \t\r\n#]/.test(line)) return null; // next top-level key — out of the block
    const content = /^([ \t]+)\S/.exec(line);
    if (content && !/^[ \t]*#/.test(line)) {
      const indent = content[1].length;
      if (childIndent === null) childIndent = indent; // the block's direct-child depth
      if (indent === childIndent) {
        const m = /^([ \t]+profile:[ \t]*)([^\s#]+)/.exec(line);
        if (m) {
          const valueStart = lineStart + m[1].length;
          return {
            valueStart,
            valueEnd: valueStart + m[2].length,
            value: m[2],
          };
        }
        // a direct child that isn't profile: — keep scanning siblings
      }
      // deeper-indented lines are sub-block internals — never candidates
    }
    lineStart = lineEnd + 1;
  }
  return null;
}

export type RenderProfileResult =
  | { ok: true; text: string; changed: boolean }
  | { ok: false; reason: string };

/**
 * Render `transport.profile: <profile>` into a router-config text — the
 * config write as a resolved template variable: one anchored field
 * replacement on the known seeded shape, never an append and never a
 * general YAML-surgery pass. Fail postures:
 *   - anchor absent (no `transport:` block / no `profile:` under it) →
 *     `ok: false` — the caller reports the specific partial state;
 *   - current value is neither `api` nor the target → `ok: false` — an
 *     unexpected value means an operator hand-edited the field, and the
 *     guided flow must not clobber an explicit operator choice.
 * Already at the target value → `ok: true, changed: false` (idempotent).
 */
export function renderTransportProfile(
  configText: string,
  profile: TransportProfile,
): RenderProfileResult {
  const loc = locateTransportProfile(configText);
  if (!loc) {
    return {
      ok: false,
      reason:
        "no `transport:` block with a `profile:` field was found in " +
        "router-config.yaml (the seeded template shape this write expects)",
    };
  }
  if (loc.value === profile) return { ok: true, text: configText, changed: false };
  if (loc.value !== "api") {
    return {
      ok: false,
      reason:
        `transport.profile is ${JSON.stringify(loc.value)} — not the seeded ` +
        "default `api`, so it looks operator-edited and will not be overwritten",
    };
  }
  return {
    ok: true,
    changed: true,
    text:
      configText.slice(0, loc.valueStart) + profile + configText.slice(loc.valueEnd),
  };
}

/** The `{exists, readFile}` subset the durable-seed reader needs. */
export interface SeedReadOps {
  exists(absPath: string): boolean;
  readFile(absPath: string): string;
}

const nodeSeedReadOps: SeedReadOps = {
  exists(p: string): boolean {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  },
  readFile(p: string): string {
    return fs.readFileSync(p, "utf8");
  },
};

/**
 * The durable seat-profile seed source (S1 close-out note: "Session 2
 * creates the durable source alongside the transport.profile template
 * write"): the workspace `ai_router/router-config.yaml`'s
 * `transport.profile` value. Tolerant like the marker readers — a
 * missing file, unreadable file, absent block, or unrecognized value
 * all read as null (the form falls back to its volatile default);
 * fail-loud narrowing stays at the form/scaffold boundary.
 */
export function readTransportProfile(
  root: string,
  ops: SeedReadOps = nodeSeedReadOps,
): TransportProfile | null {
  const abs = path.join(root, ROUTER_CONFIG_REL);
  if (!ops.exists(abs)) return null;
  let text: string;
  try {
    text = ops.readFile(abs);
  } catch {
    return null;
  }
  const loc = locateTransportProfile(text);
  if (!loc) return null;
  return loc.value === "api" || loc.value === "copilot-cli" ? loc.value : null;
}

// ---------------------------------------------------------------------------
// The refresh subprocess runner (critique M1 — cancellation + teardown)
// ---------------------------------------------------------------------------

/** The filesystem subset the runner + config write need. Structurally
 * satisfied by `aiRouterInstall.FileOps` (the scaffold's ops object). */
export interface SeatSetupFileOps {
  exists(absPath: string): boolean;
  readFile(absPath: string): string;
  writeFile(absPath: string, content: string): void;
  removeRecursive(absPath: string): void;
}

/** Minimal handle over the spawned child — kill is all the runner needs. */
export interface RefreshChildHandle {
  kill(): void;
}

/** Callback set the spawner wires onto the real (or fake) child. */
export interface RefreshChildCallbacks {
  onStdout(chunk: string): void;
  onStderr(chunk: string): void;
  /** Fired once when the process exits (any path). */
  onClose(exitCode: number | null): void;
  /** Fired on a spawn-level error (ENOENT etc.). */
  onError(err: Error): void;
}

export type RefreshChildSpawner = (
  cmd: string,
  args: string[],
  opts: { cwd: string },
  callbacks: RefreshChildCallbacks,
) => RefreshChildHandle;

/** The `vscode.CancellationToken` shape, dependency-free. */
export interface CancellationLike {
  isCancellationRequested: boolean;
  onCancellationRequested(cb: () => void): { dispose(): void };
}

export interface RunCatalogRefreshDeps {
  /** The scaffolded venv's own interpreter (venvPython(outcome.venvPath)). */
  venvPythonPath: string;
  /** The scaffolded project root — the spawn's cwd, so the CLI's default
   * `--out ai_router/copilot-catalog.lock` lands inside the project. */
  projectDir: string;
  seatId: string;
  seatLabel: string;
  /** Operator's explicit copilotCliPath, threaded to `--binary`. */
  explicitBinary?: string;
  spawn: RefreshChildSpawner;
  fileOps: SeatSetupFileOps;
  cancellation: CancellationLike;
  /**
   * Register a teardown hook (the caller pushes a Disposable into
   * `context.subscriptions`); the returned disposable is disposed when
   * the run settles so a finished run's hook is inert.
   */
  registerDisposal(dispose: () => void): { dispose(): void };
  /**
   * How long a cancel waits for the killed child's `close` event before
   * force-settling (S2 review Minor 6: a child that ignores the kill
   * must not hang the progress notification forever). Defaults to
   * {@link DEFAULT_KILL_SETTLE_TIMEOUT_MS}; tests inject a small value.
   */
  killSettleTimeoutMs?: number;
}

/** Default post-kill settle timeout — generous, because the normal path
 * settles from the child's own `close` event within milliseconds. */
export const DEFAULT_KILL_SETTLE_TIMEOUT_MS = 10_000;

export type RefreshOutcome =
  | { kind: "completed"; summary: RefreshSummary; stdout: string; stderr: string }
  | { kind: "completed-unparseable"; stdout: string; stderr: string }
  | { kind: "exit-error"; exitCode: number | null; stdout: string; stderr: string }
  | { kind: "spawn-error"; message: string }
  | { kind: "cancelled"; by: "operator" | "teardown" };

/**
 * Run the catalog refresh as a cancellable child process.
 *
 * Lockfile hygiene: the pre-run lockfile state is snapshotted; every
 * non-completed path (cancel, teardown, spawn error, non-zero exit)
 * restores it — deleting a file that did not exist before, or writing
 * back the prior content when it did. A `completed` run (exit 0 +
 * parseable summary) keeps the CLI's freshly-written lockfile — even
 * when the provider count later fails the ≥2 check, the lock is the
 * CLI's own valid artifact and stays inert while `transport.profile`
 * remains `api`. `completed-unparseable` also keeps the file (the run
 * finished; only our stdout parse failed) but callers must not treat it
 * as usable.
 */
export function runCatalogRefresh(
  deps: RunCatalogRefreshDeps,
): Promise<RefreshOutcome> {
  const lockfileAbs = path.join(deps.projectDir, CATALOG_LOCKFILE_REL);

  // Snapshot the pre-run lockfile state for restore-on-failure.
  const existedBefore = deps.fileOps.exists(lockfileAbs);
  let priorContent: string | null = null;
  if (existedBefore) {
    try {
      priorContent = deps.fileOps.readFile(lockfileAbs);
    } catch {
      priorContent = null; // unreadable — restore becomes best-effort no-op
    }
  }
  const restoreLockfile = (): void => {
    try {
      if (!existedBefore) {
        deps.fileOps.removeRecursive(lockfileAbs);
      } else if (priorContent !== null) {
        deps.fileOps.writeFile(lockfileAbs, priorContent);
      }
      // existedBefore && priorContent === null: unreadable snapshot —
      // leave the file alone rather than destroy pre-existing seat data.
    } catch {
      // Best-effort: restore failures must not mask the primary outcome.
    }
  };

  return new Promise<RefreshOutcome>((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    let cancelledBy: "operator" | "teardown" | null = null;
    let cancelReg: { dispose(): void } | null = null;
    let disposal: { dispose(): void } | null = null;
    let killSettleTimer: ReturnType<typeof setTimeout> | null = null;

    const settle = (outcome: RefreshOutcome): void => {
      if (settled) return;
      settled = true;
      if (killSettleTimer) clearTimeout(killSettleTimer);
      cancelReg?.dispose();
      disposal?.dispose();
      resolve(outcome);
    };

    // Already-cancelled before we spawn: nothing ran, nothing to clean.
    if (deps.cancellation.isCancellationRequested) {
      settle({ kind: "cancelled", by: "operator" });
      return;
    }

    let child: RefreshChildHandle | null = null;
    const killForCancel = (by: "operator" | "teardown"): void => {
      if (settled || cancelledBy) return;
      cancelledBy = by;
      try {
        child?.kill();
      } catch {
        // The close handler still settles; a kill failure is not fatal.
      }
      // S2 review Minor 6: a killed child that never emits `close` (hung
      // grandchild, ignored signal) must not hang the progress
      // notification forever — force-settle after a bounded wait.
      killSettleTimer = setTimeout(() => {
        if (settled) return;
        restoreLockfile();
        settle({ kind: "cancelled", by });
      }, deps.killSettleTimeoutMs ?? DEFAULT_KILL_SETTLE_TIMEOUT_MS);
    };

    disposal = deps.registerDisposal(() => {
      // Extension-host teardown: the close callback may never get to run,
      // so kill AND best-effort restore synchronously here, then settle.
      // The dying child can still complete a final truncate-write AFTER
      // this restore (S2 review Major 1) — the close handler below runs
      // the restore AGAIN post-exit when it does get to fire, so the
      // post-exit state wins whenever the host survives long enough.
      if (settled) return;
      cancelledBy = cancelledBy ?? "teardown";
      try {
        child?.kill();
      } catch {
        // proceed to restore regardless
      }
      restoreLockfile();
      settle({ kind: "cancelled", by: cancelledBy });
    });
    cancelReg = deps.cancellation.onCancellationRequested(() =>
      killForCancel("operator"),
    );

    try {
      child = deps.spawn(
        deps.venvPythonPath,
        buildRefreshArgs(deps.seatId, deps.seatLabel, deps.explicitBinary),
        { cwd: deps.projectDir },
        {
          onStdout: (chunk) => {
            stdout += chunk;
          },
          onStderr: (chunk) => {
            stderr += chunk;
          },
          onError: (err) => {
            restoreLockfile();
            settle({ kind: "spawn-error", message: err.message });
          },
          onClose: (exitCode) => {
            if (settled) {
              // Teardown settled before the child exited; now that it
              // has, re-run the restore so a truncate-write that raced
              // the teardown restore cannot survive the exit (Major 1).
              if (cancelledBy === "teardown") restoreLockfile();
              return;
            }
            // A run that actually completed (exit 0 + parseable summary)
            // wins over a cancel that raced in AFTER the process already
            // exited — restoring would destroy the CLI's freshly-written
            // valid artifact and report `cancelled` for a run that
            // succeeded (S2 review Major 2).
            if (exitCode === 0) {
              const summary = parseRefreshStdout(stdout);
              if (summary) {
                settle({ kind: "completed", summary, stdout, stderr });
                return;
              }
            }
            if (cancelledBy) {
              // Restore AFTER the process is gone (file handles released).
              restoreLockfile();
              settle({ kind: "cancelled", by: cancelledBy });
              return;
            }
            if (exitCode !== 0) {
              restoreLockfile();
              settle({ kind: "exit-error", exitCode, stdout, stderr });
              return;
            }
            settle({ kind: "completed-unparseable", stdout, stderr });
          },
        },
      );
    } catch (err) {
      restoreLockfile();
      settle({
        kind: "spawn-error",
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }
  });
}

// ---------------------------------------------------------------------------
// The full seat-setup step: refresh → provider check → config write
// ---------------------------------------------------------------------------

export type SeatSetupOutcome =
  | {
      kind: "success";
      providers: string[];
      confirmed: number;
      total: number;
    }
  | {
      /** Refresh completed but <2 distinct providers confirmed — routed
       * dispatch would fail closed, so transport.profile stays `api`.
       * The lockfile (the CLI's own artifact) is kept for inspection. */
      kind: "insufficient-providers";
      providers: string[];
      confirmed: number;
      total: number;
    }
  | { kind: "refresh-failed"; detail: string }
  | { kind: "cancelled"; by: "operator" | "teardown" }
  | {
      /** The two-step non-atomicity state (critique M1): the refresh
       * succeeded — the lockfile is in place — but the config write did
       * not. Reported as its own state, never conflated with a refresh
       * failure; the fix is the one-field config edit, not a re-probe. */
      kind: "config-write-failed";
      providers: string[];
      detail: string;
    };

/** Last couple of non-empty output lines, for operator-facing messages
 * (the `aiRouterInstall.oneLine` posture). */
function outputTail(s: string): string {
  const trimmed = (s || "").trim();
  if (!trimmed) return "";
  return trimmed.split(/\r?\n/).filter(Boolean).slice(-2).join(" / ");
}

/**
 * The whole guided seat-setup step. Decides usability from the refresh's
 * PARSED result (never the exit code); on ≥2 distinct confirmed
 * providers renders `transport.profile: copilot-cli` into the workspace
 * router-config.yaml via the anchored template replacement above.
 */
export async function performCopilotSeatSetup(
  deps: RunCatalogRefreshDeps,
): Promise<SeatSetupOutcome> {
  const outcome = await runCatalogRefresh(deps);
  switch (outcome.kind) {
    case "cancelled":
      return { kind: "cancelled", by: outcome.by };
    case "spawn-error":
      return {
        kind: "refresh-failed",
        detail: `the refresh subprocess could not start: ${outcome.message}`,
      };
    case "exit-error":
      return {
        kind: "refresh-failed",
        detail:
          `the refresh exited with code ${outcome.exitCode}` +
          (outputTail(outcome.stderr || outcome.stdout)
            ? `: ${outputTail(outcome.stderr || outcome.stdout)}`
            : ""),
      };
    case "completed-unparseable":
      return {
        kind: "refresh-failed",
        detail:
          "the refresh finished but its result line could not be parsed" +
          (outputTail(outcome.stdout)
            ? ` (last output: ${outputTail(outcome.stdout)})`
            : " (no output)"),
      };
    case "completed": {
      const distinct = Array.from(new Set(outcome.summary.providers)).sort();
      const base = {
        providers: distinct,
        confirmed: outcome.summary.confirmed,
        total: outcome.summary.total,
      };
      if (distinct.length < 2) {
        return { kind: "insufficient-providers", ...base };
      }
      const configAbs = path.join(deps.projectDir, ROUTER_CONFIG_REL);
      if (!deps.fileOps.exists(configAbs)) {
        return {
          kind: "config-write-failed",
          providers: distinct,
          detail: `${ROUTER_CONFIG_REL} is missing from the workspace`,
        };
      }
      try {
        const rendered = renderTransportProfile(
          deps.fileOps.readFile(configAbs),
          "copilot-cli",
        );
        if (!rendered.ok) {
          return {
            kind: "config-write-failed",
            providers: distinct,
            detail: rendered.reason,
          };
        }
        if (rendered.changed) deps.fileOps.writeFile(configAbs, rendered.text);
        return { kind: "success", ...base };
      } catch (err) {
        return {
          kind: "config-write-failed",
          providers: distinct,
          detail: err instanceof Error ? err.message : String(err),
        };
      }
    }
  }
}
