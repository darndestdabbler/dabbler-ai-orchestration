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
// the same on extension-host teardown. The refresh and the verify-type
// write are two separate steps: a refresh that succeeds followed by a
// write that fails is reported as its own `verify-type-write-failed`
// state, never conflated with "refresh failed".
//
// Set 124 S3 — WHAT THIS MODULE PERSISTS, AND WHY IT CHANGED. Through Set
// 110 this module recorded a confirmed seat by rendering
// `transport.profile: copilot-cli` into `ai_router/local-overrides.yaml`.
// Set 124 S2 retired that key outright: what verifies a project is
// machine/project state, `project-verify-type.txt` is the one place that
// records it, and a stale `transport.profile` in local-overrides.yaml is
// now REFUSED at config load. A seat setup that kept writing it would
// hand the operator a project whose every `load_config` raises — a
// successful command that bricks what it just configured. So the write is
// retargeted to the one sanctioned entry point, `python -m
// ai_router.verify_type --set COPILOT_CLI`, spawned through the SAME
// scaffolded venv interpreter the catalog refresh already uses. The
// extension deliberately does NOT write the file itself: one writer means
// the file always carries the explanatory header `write_project_verify_type`
// emits, however it was created.
//
// The Direct API path is untouched by all of this. An `"api"` pick was
// always a no-op here (the seeded `router-config.yaml` default IS `api`),
// and it still is.
//
// VS Code-free by design (the tierMarkerStore.ts pattern): the process
// spawner, filesystem, cancellation token, and disposal registration are
// all injected so the Layer-2 suite pins the full happy path — and the
// cancellation/teardown hygiene — without spawning a real subprocess.

import * as crypto from "crypto";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

/** Where the refresh writes the seat-scoped lockfile, relative to the
 * project root. Mirrors `copilot_catalog.DEFAULT_LOCKFILE_PATH` (the
 * spawn runs with `cwd: projectDir` and leaves `--out` at its default,
 * per the pinned invocation) and `transports.copilot-cli.lockfile` in
 * the seeded local-overrides.yaml — all three must agree. */
export const CATALOG_LOCKFILE_REL = path.posix.join(
  "ai_router",
  "copilot-catalog.lock",
);

/**
 * The project's answer to "what verifies this project, on this machine",
 * relative to the project root. Mirrors `verify_type.PROJECT_FILE_NAME`.
 * Machine/project state (Set 124): gitignored, never committed.
 */
export const VERIFY_TYPE_FILE_REL = "project-verify-type.txt";

/** The two values `project-verify-type.txt` may hold — `verify_type.VALID_VERIFY_TYPES`. */
export type VerifyType = "DIRECT_API" | "COPILOT_CLI";

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

/** The OS username for seat-id derivation; tolerant of the exotic hosts
 * where `os.userInfo()` throws (no passwd entry). Set 097: relocated here
 * (from gitScaffold.ts) alongside {@link rerunRefreshHint}, its only
 * caller besides the seat-setup progress wrapper. */
export function currentUsername(): string {
  try {
    return os.userInfo().username;
  } catch {
    return process.env.USERNAME ?? process.env.USER ?? "user";
  }
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
// What the confirmed seat writes (Set 124 S3)
// ---------------------------------------------------------------------------
//
// Set 110's anchored `transport.profile` YAML renderer lived here:
// locateTransportProfile / hasTopLevelTransportBlock / renderTransportProfile,
// plus the RenderProfileResult union. All of it existed to edit ONE key in
// ai_router/local-overrides.yaml that Set 124 S2 retired outright, so it is
// deleted rather than repointed -- a YAML field renderer is the wrong shape
// for a one-value file, and `verify_type --set` owns that write anyway.

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
 * The durable seat-confirmation seed source. Through Set 110 this read
 * `transport.profile` out of `ai_router/local-overrides.yaml`; Set 124 S2
 * retired that key, so the durable answer now comes from the file that
 * actually records it — `project-verify-type.txt` at the project root.
 *
 * Tolerant like the marker readers: a missing file, an unreadable file, or
 * an unrecognized value all read as null. The parse mirrors
 * `verify_type.parse_verify_type` — comment lines (the header the Python
 * writer emits) and blank lines are skipped, and the first remaining line
 * must be exactly one of the two values. Fail-loud narrowing stays at the
 * form/scaffold boundary.
 */
export function readProjectVerifyType(
  root: string,
  ops: SeedReadOps = nodeSeedReadOps,
): VerifyType | null {
  const abs = path.join(root, VERIFY_TYPE_FILE_REL);
  if (!ops.exists(abs)) return null;
  let text: string;
  try {
    text = ops.readFile(abs);
  } catch {
    return null;
  }
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    return line === "DIRECT_API" || line === "COPILOT_CLI" ? line : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// The durable "chose the Copilot seat but it isn't confirmed" marker
// (Set 097, spec D1)
// ---------------------------------------------------------------------------
//
// The defect: a cancelled, unauthenticated-CLI, install-incomplete, or
// <2-providers seat-setup attempt honestly leaves transport.profile: api
// (Set 086's confirmation gate) — but the ONLY explanation the operator
// ever saw was a one-shot toast (describeSeatSetupOutcome, above). Once the
// toast dismisses, nothing on disk remembers the attempt: the catalog
// lockfile is restored to its PRE-run state on every non-completed path
// (runCatalogRefresh's restoreLockfile), and a completed-but-insufficient
// run's lockfile carries no "the operator wanted copilot-cli" signal either
// (removal-over-addition was tried first — see the spec — and found
// insufficient for exactly this reason).
//
// This marker is the minimal addition: one word, written the instant the
// operator's Full+copilot-cli pick is known at Build time (gitScaffold.ts's
// decideCopilotSeatSetup call site — BOTH the "run" and
// "skip-install-incomplete" branches, since both mean "the operator chose
// Copilot"), before the outcome of the attempt is known.
//
// It is a write-through cache of the LATEST explicit Build-time pick, same
// contract as the tier/verification-mode markers in tierMarkerStore.ts
// (S1 discovery Majors 1-2, both fan-out calls independently): a confirmed
// retry does not need the marker cleared (the render-gate already pairs it
// with the CURRENT transport.profile, so profile flipping to copilot-cli
// suppresses the note regardless of the stale word on disk) — but an
// operator who explicitly rebuilds choosing Direct API (or Lightweight)
// instead has abandoned Copilot, and a marker that only ever grows would
// revive the note forever with no supported dismissal path. So every Build
// records the CURRENT pick: writes "unconfirmed" when this build chose
// copilot-cli, clears the file on any other explicit pick.
export const SEAT_STATUS_MARKER_REL = path.posix.join(
  ".dabbler",
  "copilot-seat-status",
);

export type SeatStatusMarker = "unconfirmed";

/** Read `.dabbler/copilot-seat-status`. Tolerant like every marker reader
 * in this codebase: missing file, unreadable file, or an unrecognized word
 * all read as null (never attempted, as far as this marker can tell). */
export function readCopilotSeatStatusMarker(
  root: string,
  ops: SeedReadOps = nodeSeedReadOps,
): SeatStatusMarker | null {
  const abs = path.join(root, SEAT_STATUS_MARKER_REL);
  if (!ops.exists(abs)) return null;
  let text: string;
  try {
    text = ops.readFile(abs);
  } catch {
    return null;
  }
  return text.trim().toLowerCase() === "unconfirmed" ? "unconfirmed" : null;
}

/** Write `.dabbler/copilot-seat-status` — always the single word
 * "unconfirmed". Callers write this the moment the operator's Copilot pick
 * is known, regardless of what the attempt goes on to do; the directory is
 * guaranteed to exist by the time this runs (the tier marker's
 * unconditional scaffold-time write creates `.dabbler/` first). */
export function writeCopilotSeatStatusMarker(
  root: string,
  ops: SeatSetupFileOps,
): void {
  ops.writeFile(path.join(root, SEAT_STATUS_MARKER_REL), "unconfirmed\n");
}

/**
 * Clear `.dabbler/copilot-seat-status` (S1 discovery Majors 1-2): the
 * operator explicitly rebuilt WITHOUT choosing the Copilot seat this time
 * (Direct API, or Lightweight) — that pick supersedes any earlier
 * unconfirmed Copilot attempt, so the marker is retired rather than left to
 * revive the note forever. Best-effort and idempotent: a missing file is
 * not an error (nothing to clear).
 */
export function clearCopilotSeatStatusMarker(
  root: string,
  ops: SeatSetupFileOps,
): void {
  const abs = path.join(root, SEAT_STATUS_MARKER_REL);
  if (!ops.exists(abs)) return;
  ops.removeRecursive(abs);
}

/**
 * The pure derivation the persistent strip note gates on (spec D1's
 * 5-state matrix: never-chose / chose+confirmed / chose+cancelled /
 * chose+CLI-missing / chose+install-incomplete). The three "attempted but
 * not confirmed" reasons are indistinguishable on disk by design (same
 * marker, same unresolved verify type) and share one honest note — the
 * derivation only needs to tell "confirmed" and "never chose" apart from
 * everything else:
 *   - never chose (or explicitly rebuilt away from Copilot — the marker is
 *     cleared then): marker is null -> false, regardless of verify type.
 *   - chose + confirmed (a later retry succeeded): the durable verify type
 *     is "COPILOT_CLI" -> false, even with a stale "unconfirmed" marker
 *     still on disk from the earlier failed attempt (the marker is cleared
 *     only on an explicit non-Copilot rebuild, not on a confirmed retry —
 *     but the verify-type check alone already suppresses the note either
 *     way).
 *   - chose + (cancelled | CLI-missing | insufficient-providers |
 *     install-incomplete), no rebuild away from Copilot since: marker is
 *     "unconfirmed" AND the durable verify type is NOT "COPILOT_CLI" -> true.
 * Independent of any VOLATILE webview control state (gsState) by design —
 * the whole point is a note that survives the exact repaint that reverts
 * the radio (S097 defect chain step 3).
 *
 * Set 124 S3: the durable half was `transport.profile` from
 * local-overrides.yaml until S2 retired that key. Same 5-state matrix,
 * same truth table — read off the file that now records the answer.
 */
export function deriveCopilotSeatChosenUnconfirmed(
  marker: SeatStatusMarker | null,
  durableVerifyType: VerifyType | null,
): boolean {
  return marker === "unconfirmed" && durableVerifyType !== "COPILOT_CLI";
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
  /** Atomic replace (S3, S2-residual): when present, the config write
   * goes through temp-file + rename so a mid-write crash can never leave
   * a truncated local-overrides.yaml. Optional so existing structural
   * satisfiers (and older test fakes) keep compiling; absent, the write
   * falls back to the plain (non-atomic) writeFile. */
  rename?(oldAbsPath: string, newAbsPath: string): void;
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

// Set 124 S3: the .gitignore guarantee that lived here (GITIGNORE_REL,
// VERIFY_TYPE_IGNORE_RULE, isVerifyTypeIgnored, ensureVerifyTypeIgnored)
// moved INTO the one writer. `verify_type.write_project_verify_type` now
// establishes its own precondition -- it writes the ignore rule before the
// project file, in the same process, so the ordering invariant Set 110 S4
// round 6 established is preserved and the guarantee reaches every caller,
// including an operator running `verify_type --set` by hand. Keeping a
// second implementation here would have been a fresh instance of exactly
// the two-mechanisms-for-one-fact defect this set exists to remove.

export type SeatSetupOutcome =
  | {
      kind: "success";
      providers: string[];
      confirmed: number;
      total: number;
      /** Present only when the writer reported a non-fatal skip on stderr —
       * in practice, an unwritable `.gitignore`. The seat IS set up and the
       * answer IS recorded, so this is not a failure; but the answer is now
       * committable, and saying so is the difference between a warning and a
       * lie. Relayed from the one writer, never re-derived here. */
      writerWarning?: string;
    }
  | {
      /** Refresh completed but <2 distinct providers confirmed — routed
       * dispatch would fail closed, so the verify type is left unwritten
       * and the project keeps resolving however it already did.
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
       * succeeded — the lockfile is in place — but persisting the answer
       * did not. Reported as its own state, never conflated with a refresh
       * failure; the fix is one terminal command, not a re-probe.
       * Set 124 S3 renamed this from `config-write-failed`: the write is
       * no longer a config edit, and a name that says otherwise is the
       * stale-echo class this set removes. */
      kind: "verify-type-write-failed";
      providers: string[];
      detail: string;
    };

// Set 124 S3: writeFileAtomically / ATOMIC_WRITE_TMP_SUFFIX went with the
// .gitignore write that was their last caller. Nothing in this module writes
// a file any more -- the lockfile is the refresh CLI's own artifact, and the
// project file belongs to `verify_type`. The atomic-replace guarantee did not
// disappear with them: it moved to the writer that now owns the write.

// ---------------------------------------------------------------------------
// Child-kill strategy (S3, the named S2 residual: POSIX process-tree kill)
// ---------------------------------------------------------------------------

export type KillStrategy = "taskkill-tree" | "posix-group" | "plain";

/**
 * Which kill mechanism the refresh spawner should use. The refresh's
 * python child spawns the `copilot` binary as a grandchild, so a plain
 * kill() signals only the interpreter and orphans the in-flight probe:
 *   - win32 → `taskkill /pid <pid> /T /F` (shipped in S2);
 *   - POSIX → signal the process GROUP (`kill(-pid)`) — requires the
 *     child to have been spawned `detached: true` so it leads its own
 *     group (the spawner's `spawnDetached` flag below);
 *   - no pid (spawn failed early) → plain kill() as the only option.
 */
export function resolveKillStrategy(
  platform: NodeJS.Platform,
  pid: number | undefined,
): KillStrategy {
  if (!pid) return "plain";
  return platform === "win32" ? "taskkill-tree" : "posix-group";
}

/** Whether the refresh child must be spawned `detached` on this platform
 * (POSIX group-kill needs the child to lead its own process group;
 * win32's taskkill /T walks the tree without it). */
export function spawnDetached(platform: NodeJS.Platform): boolean {
  return platform !== "win32";
}

/** The three concrete kill mechanisms, injected so the dispatch below is
 * pinnable at Layer 2 without real processes (S3 review Major 1). */
export interface KillEffects {
  /** win32: `taskkill /pid <pid> /T /F` (the spawner also wires the
   * taskkill child's async `error` event to `plainKill` — a missing or
   * blocked taskkill reports asynchronously, not as a sync throw). */
  taskkillTree(pid: number): void;
  /** POSIX: signal the process GROUP — `process.kill(-pid, "SIGTERM")`. */
  signalGroup(pid: number): void;
  /** The last resort: the child handle's own kill(). */
  plainKill(): void;
}

/**
 * Dispatch a cancel-kill through the platform strategy, falling back to
 * the plain kill when the preferred mechanism throws synchronously.
 * (Each `break` exits the switch; the plain kill runs after it — there
 * is no case-to-case fall-through.)
 */
export function dispatchKill(
  platform: NodeJS.Platform,
  pid: number | undefined,
  fx: KillEffects,
): void {
  switch (resolveKillStrategy(platform, pid)) {
    case "taskkill-tree":
      try {
        fx.taskkillTree(pid as number);
        return;
      } catch {
        break; // exit switch -> plainKill below
      }
    case "posix-group":
      try {
        fx.signalGroup(pid as number);
        return;
      } catch {
        break; // group gone or not a leader -> plainKill below
      }
    case "plain":
      break;
  }
  fx.plainKill();
}

// ---------------------------------------------------------------------------
// Honest per-outcome messaging (S3, critique C3 — the corrected failure UX)
// ---------------------------------------------------------------------------

export interface SeatSetupMessage {
  level: "info" | "warning";
  message: string;
}

/**
 * The recovery instruction for failure messages — the corrected failure
 * story's core promise: fixing the seat never requires re-scaffolding.
 *
 * S1 discovery supplementary Major (Set 097): this used to be a
 * copy-pasteable `python -m ai_router.copilot_catalog --refresh …`
 * command — but that CLI invocation only refreshes the seat-scoped
 * lockfile (copilot_catalog.py records no verify type at all); it never
 * invokes performCopilotSeatSetup, so the project's verify type was
 * NEVER recorded and the persistent "unconfirmed" note NEVER cleared,
 * no matter how many providers the refresh confirmed. The instruction now
 * points at `Dabbler: Set Up Copilot Seat` (copilotSeatSetupCommand.ts), a
 * standalone command that runs the SAME confirmation-gated
 * runCopilotSeatSetupWithProgress flow the Build action uses — the only
 * mechanism that actually completes the promise. Set 097: relocated here
 * (from gitScaffold.ts) so the persistent System Status strip note (D1)
 * can reuse the SAME instruction the one-shot toast composes, instead of a
 * second, drifting implementation.
 */
export function rerunRefreshHint(): string {
  return 'run "Dabbler: Set Up Copilot Seat" from the Command Palette';
}

/**
 * Compose the operator-facing message for a seat-setup outcome — the
 * corrected failure UX (spec Feature 1 → Failure UX, critique C3), as a
 * pure function so every failure branch's honesty is pinned by Layer-2
 * tests without a live extension host.
 *
 * The load-bearing rule: `api` is presented as a working state ONLY when
 * `providerKeysPresent` is true (the caller runs the same `DABBLER_*`
 * probe the Full-tier inline key warning uses). For the keyless audience
 * — this feature's exact target audience, a Copilot-locked shop where no
 * `DABBLER_*` key is possible — every failure says plainly that the
 * router is not yet functional, plus reason-specific fix guidance. Every
 * failure path lands in exactly one of those two honest states; none
 * implies `api` "still works" when no key exists to make it work.
 */
export function describeSeatSetupOutcome(
  outcome: SeatSetupOutcome,
  providerKeysPresent: boolean,
  rerunHint: string,
): SeatSetupMessage {
  const rerun = `Re-run seat setup (no need to re-scaffold): ${rerunHint}`;
  const keyless =
    "no DABBLER_* provider key is set, so the router is not yet functional";
  // Set 123 S3 (supplementary verification, Major): this used to read "keep
  // the api profile working" flat, and every failure branch below claimed
  // "local-overrides.yaml keeps transport.profile: api". Both became FALSE in
  // Session 1: `verify_type.derive_transport_profile()` returns the resolved
  // `project-verify-type.txt` profile BEFORE it reads any configured
  // `transport.profile`, so on a project that resolved COPILOT_CLI the
  // effective profile stays copilot-cli no matter what this file says. An
  // operator told "you are safely on api" would proceed on a broken seat.
  //
  // The fix is subtraction, not a new file read: these messages now report
  // only what this command actually DID (the verify type was not recorded)
  // and name the file that really decides, rather than asserting an effective
  // profile they are not in a position to know.
  //
  // Set 124 S3: local-overrides.yaml is out of this story entirely — S2
  // retired its `transport.profile` key, so naming it as the thing that was
  // "not enabled" would point the operator at a file that can no longer hold
  // the answer at all.
  const keyed =
    "the DABBLER_* provider key(s) already set keep the api profile working " +
    "wherever this project's verify type resolves to DIRECT_API";
  const notRecorded =
    `this project's verify type was NOT set to COPILOT_CLI (${VERIFY_TYPE_FILE_REL} ` +
    "is what decides the effective transport)";
  switch (outcome.kind) {
    case "success":
      return {
        level: outcome.writerWarning ? "warning" : "info",
        message:
          `Copilot seat set up: ${outcome.confirmed}/${outcome.total} models ` +
          `confirmed (providers: ${outcome.providers.join(", ")}). ` +
          (outcome.writerWarning
            ? `COPILOT_CLI written to ${VERIFY_TYPE_FILE_REL}, but it is NOT ` +
              `git-ignored: ${outcome.writerWarning}`
            : `COPILOT_CLI written to ${VERIFY_TYPE_FILE_REL} (gitignored — the ` +
              "router derives transport.profile: copilot-cli from it)."),
      };
    case "insufficient-providers": {
      // Reason-specific guidance: zero confirmations means the CLI never
      // answered (missing binary, not signed in, blocked) — a re-run
      // after fixing that can genuinely change the result. Exactly one
      // confirmed provider family is the enterprise-locked-seat shape,
      // where a plain re-run will NOT change anything (the multi-seat
      // honesty stance this set carries forward).
      const cause =
        outcome.confirmed === 0
          ? "No models responded at all — the Copilot CLI may be missing " +
            "from PATH, not signed in, or blocked by policy. "
          : outcome.providers.length === 1
            ? "This seat may expose only one provider family (an " +
              "enterprise-managed seat can do this), in which case " +
              "re-running will not change the result. "
            : "";
      return {
        level: "warning",
        message:
          `Copilot seat setup completed, but only ${outcome.providers.length} ` +
          `distinct provider(s) confirmed (${outcome.providers.join(", ") || "none"}) — ` +
          `routed dispatch would fail closed, so ${notRecorded}. ${cause}` +
          (providerKeysPresent ? `Meanwhile ${keyed}. ` : `And ${keyless}. `) +
          "The probe lockfile was kept for inspection at " +
          `ai_router/copilot-catalog.lock. ${rerun}`,
      };
    }
    case "refresh-failed":
      return {
        level: "warning",
        message: providerKeysPresent
          ? `Copilot seat setup failed: ${outcome.detail}. So ${notRecorded}, ` +
            `and ${keyed}. To use the Copilot ` +
            `seat instead, fix the cause first. ${rerun}`
          : `Scaffold completed, but the Copilot seat setup did not: ` +
            `${outcome.detail}. So ${notRecorded}, ` +
            `and ${keyless}. Fix the cause, then: ${rerun}`,
      };
    case "cancelled":
      return {
        level: "warning",
        message:
          "Copilot seat setup was cancelled — the lockfile was restored to " +
          `its pre-run state and ${notRecorded}. ` +
          (providerKeysPresent
            ? `Meanwhile ${keyed}. `
            : `Note ${keyless} until seat setup completes. `) +
          rerun,
      };
    case "verify-type-write-failed":
      return {
        level: "warning",
        message:
          `Copilot seat probe succeeded (providers: ${outcome.providers.join(", ")}) ` +
          "and the lockfile is in place, but recording this project's verify " +
          `type failed: ${outcome.detail}. Run \`${verifyTypeCommandHint("COPILOT_CLI")}\` ` +
          "in the project folder — no re-probe is needed. Until then " +
          (providerKeysPresent
            ? `the router keeps running on whatever ${VERIFY_TYPE_FILE_REL} ` +
              "resolves to, with the DABBLER_* key(s) already set."
            : "the router is not yet functional (the verify type is " +
              "unrecorded and no DABBLER_* provider key is set)."),
      };
    default: {
      // Exhaustiveness guard (S3 review finding 6): a future
      // SeatSetupOutcome kind must fail the build here, not return
      // undefined at runtime.
      const unreachable: never = outcome;
      throw new Error(`unhandled seat-setup outcome: ${JSON.stringify(unreachable)}`);
    }
  }
}

/** The honesty suffix for the install-incomplete skip branch (the
 * scaffold's install failed, so the refresh had no venv to run in) —
 * same two-honest-states rule as {@link describeSeatSetupOutcome}. */
export function describeSkipInstallIncompleteHonesty(
  providerKeysPresent: boolean,
): string {
  return providerKeysPresent
    ? "The DABBLER_* provider key(s) already set will keep the api " +
      "profile working once the install completes."
    : "No DABBLER_* provider key is set, so the router is not functional " +
      "until the install completes and seat setup succeeds.";
}

/** Last couple of non-empty output lines, for operator-facing messages
 * (the `aiRouterInstall.oneLine` posture). */
function outputTail(s: string): string {
  const trimmed = (s || "").trim();
  if (!trimmed) return "";
  return trimmed.split(/\r?\n/).filter(Boolean).slice(-2).join(" / ");
}

/**
 * The CLI contract for persisting the project's answer, pinned here the
 * same way the catalog-refresh invocation is (critique M5 — drift becomes
 * a noticed decision):
 *   - invocation: `python -m ai_router.verify_type --set <VALUE>
 *     --project-root <projectDir>`;
 *   - `--project-root` is passed EXPLICITLY rather than relying on the
 *     spawn cwd: `verify_type` otherwise resolves the write target by
 *     walking up to the first ancestor holding `.git`, and a scaffolded
 *     project that is not yet a git repo would then either fail or write
 *     somewhere above itself;
 *   - exit 0 = written; 2 = the value was rejected; 3 = setup still
 *     required. Only 0 is success.
 */
export function buildVerifyTypeArgs(
  verifyType: VerifyType,
  projectDir: string,
): string[] {
  return [
    "-m",
    "ai_router.verify_type",
    "--set",
    verifyType,
    "--project-root",
    projectDir,
  ];
}

/** The command an operator runs by hand when the spawned write fails. */
export function verifyTypeCommandHint(verifyType: VerifyType): string {
  return `python -m ai_router.verify_type --set ${verifyType}`;
}

export type VerifyTypeWriteResult =
  | { ok: true; warning?: string }
  | { ok: false; detail: string };

/**
 * The writer's own stderr contract (pinned here the same way the refresh
 * CLI's stdout contract is): `ai_router` reports a non-fatal skip as a line
 * beginning `WARNING: `. The only one this command can provoke is the
 * fail-open branch in `write_project_verify_type` — an unwritable
 * `.gitignore`, where the answer is still recorded but is left committable.
 *
 * Line-anchored on purpose. Python's own `<frozen runpy>:130: RuntimeWarning:
 * ...` noise reaches the same stream and must NOT be mistaken for the
 * writer's warning; it does not begin a line with `WARNING: `.
 */
export function extractWriterWarning(stderr: string): string | undefined {
  const lines = (stderr || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("WARNING: "));
  return lines.length > 0 ? lines.join(" ") : undefined;
}

/**
 * Persist the project's verify type through the ONE sanctioned writer.
 *
 * Set 124 S3: the extension deliberately does not write
 * `project-verify-type.txt` itself. `verify_type.write_project_verify_type`
 * emits an explanatory header explaining why the file is gitignored, and a
 * second writer here would produce header-less files that read as
 * hand-dropped — the two-mechanisms-for-one-fact defect this whole set
 * removes, recreated one layer up. Spawning the router's own entry point
 * through the SAME scaffolded venv interpreter the refresh already used
 * costs one short-lived subprocess and keeps the writer singular.
 *
 * Never rejects: every failure path resolves as `{ ok: false }` so the
 * caller reports the two-step partial state rather than throwing out of
 * the progress notification.
 */
export function writeVerifyTypeThroughRouter(
  deps: Pick<RunCatalogRefreshDeps, "venvPythonPath" | "projectDir" | "spawn">,
  verifyType: VerifyType,
): Promise<VerifyTypeWriteResult> {
  return new Promise((resolve) => {
    let settled = false;
    let stdout = "";
    let stderr = "";
    const settle = (result: VerifyTypeWriteResult): void => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const failed = (detail: string): void => settle({ ok: false, detail });
    try {
      deps.spawn(
        deps.venvPythonPath,
        buildVerifyTypeArgs(verifyType, deps.projectDir),
        { cwd: deps.projectDir },
        {
          onStdout: (chunk: string) => {
            stdout += chunk;
          },
          onStderr: (chunk: string) => {
            stderr += chunk;
          },
          onClose: (exitCode: number | null) => {
            if (exitCode === 0) {
              // Exit 0 is NOT unconditional success: the writer fails open on
              // an unwritable .gitignore, records the answer anyway, and says
              // so on stderr. Swallowing that would leave the operator with a
              // committable machine-local answer while the toast claims it is
              // gitignored — the exact failure this session removes (S3
              // discovery round 1, Major).
              const warning = extractWriterWarning(stderr);
              settle(warning === undefined ? { ok: true } : { ok: true, warning });
              return;
            }
            const tail = outputTail(stderr || stdout);
            failed(
              `\`${verifyTypeCommandHint(verifyType)}\` exited with code ` +
                `${exitCode}${tail ? `: ${tail}` : ""}`,
            );
          },
          onError: (err: Error) => {
            failed(`the write subprocess could not start: ${err.message}`);
          },
        },
      );
    } catch (err) {
      failed(
        `the write subprocess could not start: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });
}

/**
 * The whole guided seat-setup step. Decides usability from the refresh's
 * PARSED result (never the exit code); on >=2 distinct confirmed
 * providers it guarantees the `.gitignore` rule and then records
 * `COPILOT_CLI` as this project's verify type through
 * {@link writeVerifyTypeThroughRouter}, from which the router derives
 * `transport.profile: copilot-cli`.
 *
 * Set 124 S3 replaced the previous `transport.profile` write into
 * `ai_router/local-overrides.yaml`: S2 retired that key, so the old write
 * produced a project whose every `load_config` raised — a successful
 * command that bricked what it had just configured.
 */
/**
 * The whole guided seat-setup step. Decides usability from the refresh's
 * PARSED result (never the exit code); on >=2 distinct confirmed
 * providers writes `transport.profile: copilot-cli` into the workspace
 * local-overrides.yaml, creating or extending that local file when needed
 * and using the anchored template replacement when the profile already
 * exists.
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
      // The verify-type write establishes its own .gitignore precondition:
      // `write_project_verify_type` adds the rule BEFORE it writes the file,
      // in the same process, so the file never exists in an un-ignored state
      // (the Set 110 S4 round-6 ordering invariant, now owned by the writer
      // rather than duplicated here).
      const written = await writeVerifyTypeThroughRouter(deps, "COPILOT_CLI");
      if (!written.ok) {
        return {
          kind: "verify-type-write-failed",
          providers: distinct,
          detail: written.detail,
        };
      }
      // Relay the writer's own non-fatal skip rather than re-deriving it:
      // one guarantee, one signal (S3 discovery round 1, Major).
      return written.warning === undefined
        ? { kind: "success", ...base }
        : { kind: "success", ...base, writerWarning: written.warning };
    }
  }
}
