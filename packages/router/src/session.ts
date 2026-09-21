// The session lifecycle's flow: the plan grammar, the lifecycle lock, and
// the four subcommands that write the record.
//
// Session 31 ports `session` whole -- the close and its five gates, cancel,
// restore, and the legacy migration. What is here is the half that WRITES:
// `start`, `declare`, `log` and `decision`. They land now because the
// sanctioned writers land now, and a writer no verb reaches is a writer the
// parity control cannot compare: `sessions.json`, the activity log and the
// two rendered files are produced by nothing else (D171).
//
// The boundary triad -- refuse a second in-flight session, refuse
// re-opening a closed one, refuse skipping ahead -- is enforced at the CLI
// *and* at the writer. The writer-level refusal is what stops a direct API
// caller from doing what the CLI refuses; the CLI's exists so an operator
// gets a sentence rather than a traceback.

import {
  closeSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  rmdirSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";

import {
  IdentityResolutionError,
  resolveOrchestratorIdentity,
} from "./identity.ts";
import { GEMINI_RETIRED, engineAliases, installedEngines } from "./engines.ts";
import { currentCatalogPath } from "./catalog.ts";
import { normalizeModelToken } from "./contracts/models.ts";
import {
  TRANSPORT_API,
  TRANSPORT_COPILOT_CLI,
  REVIEWING_TRANSPORT_KEY,
  TRANSPORT_SOURCE_CONFIG,
  explainAuthoringModel,
  explainReviewingTransport,
  loadConfig,
  sessionReviewerOf,
  withSessionReviewers,
  withSessionVehicle,
  type RouterConfig,
} from "./config.ts";
import {
  credentialStops,
  pastedKeyRefusal,
  transportPresence,
  freshnessWarnings,
  refreshStaleRecords,
} from "./discovery.ts";
import {
  ROUND_REF_NAMESPACE,
  SESSION_PLAN_FILENAME,
  changedPathsBetween,
  snapshotWorktreeTree,
  pushRoundRefs,
  repoRootFromSessionsDir,
  upstreamRemote,
} from "./evidence.ts";
import {
  DISPOSITION_SCHEMA,
  DRIVER_SCHEMA_VERSION,
  REPORT_SCHEMA,
  WORK_PLAN_SCHEMA,
  amendPlanStep,
  amendRoundCap,
  dispositionsPath,
  dropNonGoal,
  driverDir,
  planPath,
  readInstruction,
  readRepairs,
  readRun,
  recordRepair,
  WAITER_IS_WHAT_IS_RUN,
  loopAlive,
  reportPath,
  requestInterrupt,
  shapeReport,
  stampAnswer,
  writeDispositions,
  writeReport,
  writeWorkPlan,
  appendSupervision,
  releaseOfPlan,
} from "./driver.ts";
import type { DriverInstruction } from "./generated/index.ts";
import { releaseMode } from "./settings.ts";
import {
  CAUSE_NOT_LISTED,
  CAUSE_NO_KEY,
  CAUSE_UNREAD,
  NoCandidateError,
  apiLadder,
  prose,
  seatLadder,
} from "./route.ts";
import { ROLE_AUXILIARY_REVIEWER, ROLE_PRIMARY_REVIEWER } from "./selection.ts";
import { seatModels } from "./transports/copilot.ts";
import {
  ENUMERATION_CLI_ALIASES,
  configurationNode,
} from "./projection.ts";
import { isFrameworkInstalledPath, materialPaths } from "./checks.ts";
import {
  SET_BOOKKEEPING_COMMIT_BASENAMES,
  materialWorktreeChanges,
  previewPaths,
  readWorktreeStatus,
  renderGateRow,
  runGates,
  sessionChangedNothing,
} from "./gates.ts";
import { PackagingConfigError, loadDeclaration, loadTagRelease } from "./packaging.ts";
import { refuseIfResolvingFromSource } from "./resolution.ts";
import { removeStopGate } from "./bootstrap/index.ts";
import { isSessionBookkeeping } from "./testEvidence.ts";
import {
  type OriginReconciliation,
  nowIso,
  platformNewlines,
  reconcileWithOrigin,
  repoRootFor,
  runGit,
} from "./journal.ts";
import {
  LedgerError,
  MACHINE_DIRNAME,
  OUTCOME_PUBLISHED,
  RUNS_DIRNAME,
  latestRound,
  readPackaging,
  sessionRunDir,
} from "./ledger.ts";
import {
  SCHEMA_VERSION,
  STATUS_CANCELLED,
  STATUS_COMPLETE,
  STATUS_IN_PROGRESS,
  STATUS_NOT_STARTED,
  SessionStateInvariantError,
  buildProjection,
  canonicalizeStatus,
  derivedView,
  isRecord,
  normalizeLegacyState,
  readRawLegacyState,
  readRawSessionState,
  sessionDisplayNumber,
  whoIsWorking,
} from "./progress.ts";
import { dumps, pythonRepr, pythonStr } from "./pythonJson.ts";
import {
  DECIDERS,
  SanctionedWriteError,
  appendDecision,
  buildOrchestratorBlock,
  completedNumbers,
  cancelledNumbers,
  declareSessionTask,
  flipStateToClosed,
  nowIsoSeconds,
  onDiskState,
  recordProjectPlan,
  WORK_PLAN_FILENAME,
  recordHookRemoved,
  registerSessionStart,
  validateAndWriteState,
  amendmentEntries,
  amendmentLine,
  recordAmendment,
  recordReleaseHold,
  releaseHold,
  WorkBegunError,
  workBegunRefusal,
} from "./writers.ts";
import { writeErr, writeOut } from "./output.ts";
import { sessionVerdict } from "./verdict.ts";

/**
 * Bring a stale record up to date before the session is registered.
 *
 * Registration is the last moment before the work at which a refresh may
 * legitimately happen, and this is that moment: discovery runs between
 * sessions, and the free half of it belongs on this side of the line rather
 * than being reported and left. What may NOT happen here is a priced call --
 * the seat's probe is a real turn per model and is never in this path, at any
 * age -- and what may not happen is a failure: a vendor that could not be
 * reached leaves the record as it was and says so.
 *
 * The refusal in `dabbler discovery refresh` still holds and is not
 * contradicted: this runs BEFORE the session exists, so no session is
 * changing its own verifier pool while running.
 */
async function refreshDiscovery(): Promise<string[]> {
  try {
    return await refreshStaleRecords(loadConfig());
  } catch {
    return [];
  }
}

/**
 * Stale-record warnings for the session about to start.
 *
 * What the refresh above did not fix: the seat catalog, whose other half
 * costs a turn per model, and anything a vendor outage left standing. It
 * warns and names the invocation; it never blocks. A staleness check that
 * could fail a registration would be a maintenance signal capable of causing
 * an outage, which is how maintenance signals get suppressed -- so any
 * failure reading it leaves the session unblocked and silent.
 *
 * Python imports both names inside the function to keep `ai_router.session`
 * out of `discovery`'s import path at module load; here the graph runs the
 * other way and one direction only, so a plain import says the same thing
 * with less machinery.
 */
function discoveryWarnings(): string[] {
  try {
    // A record that has gone stale, and never one that was never made. The
    // second is a repository that has not run discovery, which `bootstrap`
    // says once at setup; repeating it at every session start for the life
    // of the repository is a warning nothing ever answers, and one of those
    // teaches an operator to scroll past the ones that matter.
    return freshnessWarnings(loadConfig(), Date.now(), false);
  } catch {
    return [];
  }
}

export const EXIT_OK = 0;
export const EXIT_GATE_FAILED = 1;
export const EXIT_USAGE = 2;
export const EXIT_BOUNDARY = 3;
export const EXIT_LOCK_CONTENTION = 5;

// --- The lifecycle lock ------------------------------------------------------

export const LOCK_FILENAME = ".lifecycle.lock";
const STALE_LOCK_TTL_SECONDS = 600;

export class LockContentionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LockContentionError";
  }
}

/**
 * Whether a pid names a live process.
 *
 * `process.kill(pid, 0)` sends no signal and answers the same question
 * Python's `os.kill(pid, 0)` does, on both platforms: `ESRCH` means gone,
 * `EPERM` means alive and not ours. Anything else is treated as alive,
 * because a lock whose holder cannot be established is not a lock to
 * reclaim.
 */
function pidRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    return true;
  }
}

function lockIsStale(path: string): boolean {
  let record: unknown;
  try {
    record = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return true;
  }
  if (!isRecord(record)) return true;
  const acquired = Date.parse(String(record["acquired_at"]));
  const pid = Number(record["pid"]);
  if (!Number.isFinite(acquired) || !Number.isInteger(pid)) return true;
  const ageSeconds = (Date.now() - acquired) / 1000;
  if (ageSeconds >= STALE_LOCK_TTL_SECONDS) return true;
  return !pidRunning(pid);
}

/**
 * Atomic create; one stale-reclaim retry. Throws `LockContentionError` on a
 * live holder.
 *
 * `wx` is `O_CREAT | O_EXCL`: the create either wins or fails, so two
 * processes cannot both believe they hold the lifecycle.
 */
export function acquireLock(sessionsDir: string, workerId?: string): string {
  const path = join(sessionsDir, LOCK_FILENAME);
  const record =
    dumps(
      {
        pid: process.pid,
        worker_id: workerId || `lifecycle/${process.pid}`,
        acquired_at: nowIso("microseconds"),
      },
      { indent: 2 },
    ) + "\n";
  for (const attempt of [1, 2]) {
    try {
      const handle = openSync(path, "wx");
      try {
        writeSync(handle, platformNewlines(record), null, "utf8");
      } finally {
        closeSync(handle);
      }
      return path;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (attempt === 1 && lockIsStale(path)) {
        try {
          unlinkSync(path);
        } catch {
          // Someone else reclaimed it first; the retry will find out.
        }
        continue;
      }
      throw new LockContentionError(`another lifecycle operation holds ${path}`);
    }
  }
  throw new LockContentionError(`could not acquire ${path}`);
}

/**
 * How long a waiter gives a live holder before it calls the lock contended.
 *
 * **Measured, 2026-09-11, on this suite's own load** -- `node --test
 * --test-concurrency=4` over the whole router suite, with every
 * `.lifecycle.lock` under the temp root sampled once a second. Holds are not
 * milliseconds under that load: four locks were held 14, 17, 18 and 31
 * seconds by processes that were alive the whole time and released normally
 * afterwards. At thirty seconds the last of them lost the race, and
 * `walk-impact`'s driver stopped with "the lifecycle lock is contended" --
 * which was true of nothing: the holder was working and finished.
 *
 * So the deadline was shorter than the work it was waiting on, and a waiter
 * that gives up on a live winner turns a slow save into a stopped session.
 * Three minutes is six times the worst hold measured. It costs nothing in
 * the ordinary case, where the lock is free on the first attempt, and it
 * does not weaken the fence: a holder that DIED is still reclaimed within a
 * quarter of a second by the staleness check, which reads the pid rather
 * than waiting for any deadline at all.
 */
const LOCK_WAIT_SECONDS = 180;

export function acquireLockWithTimeout(
  sessionsDir: string,
  workerId?: string,
  timeoutSeconds = LOCK_WAIT_SECONDS,
): string {
  const deadline = Date.now() + timeoutSeconds * 1000;
  for (;;) {
    try {
      return acquireLock(sessionsDir, workerId);
    } catch (error) {
      if (!(error instanceof LockContentionError)) throw error;
      if (Date.now() >= deadline) throw error;
      sleep(250);
    }
  }
}

export function releaseLock(lockPath: string): void {
  try {
    unlinkSync(lockPath);
  } catch {
    // Already released, or never taken; either way the lifecycle is free.
  }
}

/** A blocking sleep: these paths are synchronous, as the Python ones are. */
function sleep(milliseconds: number): void {
  const buffer = new Int32Array(new SharedArrayBuffer(4));
  Atomics.wait(buffer, 0, 0, milliseconds);
}

// --- Spec parsing: sessions and their steps ----------------------------------

const SESSION_HEAD_RE = /^###\s+Session\s+(\d+)(?:\s+of\s+(\d+))?\s*:\s*(.+?)\s*$/gm;
const LIST_MARKER_RE = /^([ \t]*)(\d+\.)([ \t]+)(?=\S)/;
const ANY_MARKER_RE = /^([ \t]*)(\d+\.|[-*+])([ \t]+)(?=\S)/;
const FENCE_RE = /^\s*(?:```|~~~)/;
const MAX_TOP_LEVEL_INDENT = 3;
const TAB_WIDTH = 4;

const SLUG_MARKER_LOOSE_RE = /\(\s*slug\s*:?\s*([^)]*)\)\s*$/i;
const SLUG_MARKER_LITERAL_RE = /^\(slug: [a-z0-9-]+\)$/;
const SLUG_OPEN_RE = /\(\s*slug\b/gi;

/**
 * A trailing parenthetical looked like an authored `(slug: ...)` marker but
 * was not the exact literal form -- refused at parse time rather than
 * silently treated as absent, since a typo here would otherwise fall back
 * to a different, unannounced identity.
 */
export class MalformedSlugError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedSlugError";
  }
}

/**
 * Two sessions or two steps within one session declared the same authored
 * slug -- refused rather than silently disambiguated, since a silently
 * renamed slug breaks the one-identity promise across the session plan,
 * `activity-log.json` and the plan's step_id.
 */
export class DuplicateSlugError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateSlugError";
  }
}

/**
 * Split a trailing `(slug: xxx)` marker off a session heading or a step's
 * own text.
 *
 * Returns the text unchanged and a null slug when nothing declares a
 * marker, so a plan that names none parses exactly as it always has.
 * Anything that merely *looks* like an attempted marker -- wrong case, a
 * missing colon, an invalid slug charset, or a missing closing parenthesis
 * -- raises rather than being silently read as no marker at all.
 */
export function splitSlugMarker(text: string): [string, string | null] {
  const stripped = text.replace(/\s+$/, "");
  const match = SLUG_MARKER_LOOSE_RE.exec(stripped);
  if (match) {
    if (!SLUG_MARKER_LITERAL_RE.test(match[0])) {
      throw new MalformedSlugError(
        `slug-like marker '${match[0]}' is not the literal '(slug: xxx)' ` +
          "form with xxx matching [a-z0-9-]+",
      );
    }
    return [stripped.slice(0, match.index).replace(/\s+$/, ""), match[1].trim()];
  }
  // An opening "(slug" with no closing ")" anywhere after it is an unclosed
  // marker, not ordinary prose that happens to mention one.
  let lastOpen: RegExpExecArray | null = null;
  SLUG_OPEN_RE.lastIndex = 0;
  for (
    let candidate = SLUG_OPEN_RE.exec(stripped);
    candidate !== null;
    candidate = SLUG_OPEN_RE.exec(stripped)
  ) {
    lastOpen = candidate;
  }
  if (lastOpen !== null && !stripped.slice(lastOpen.index).includes(")")) {
    throw new MalformedSlugError(
      `slug-like marker '${stripped.slice(lastOpen.index)}' is missing its closing ')'`,
    );
  }
  return [text, null];
}

/**
 * Blank out fenced code blocks preserving line count and offsets, so
 * heading positions relative to steps are unchanged.
 */
function stripFencedBlocks(text: string): string {
  const out: string[] = [];
  let inFence = false;
  for (const line of splitKeepEnds(text)) {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      out.push(line.endsWith("\n") ? "\n" : "");
    } else if (inFence) {
      out.push(line.endsWith("\n") ? "\n" : "");
    } else {
      out.push(line);
    }
  }
  return out.join("");
}

/** Python's `splitlines(keepends=True)`, for the endings this grammar sees. */
function splitKeepEnds(text: string): string[] {
  const lines = text.split("\n");
  const out = lines.map((line, index) =>
    index < lines.length - 1 ? `${line}\n` : line,
  );
  if (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}

function expand(indent: string): number {
  return indent.replace(/\t/g, " ".repeat(TAB_WIDTH)).length;
}

/**
 * Top-level ordered-list items in a session segment, each collapsed to one
 * line.
 *
 * Depth is resolved by tracking open list items' content columns -- a
 * marker indented at or past the innermost open item's content column is
 * nested, not a step. A non-marker line in column 0 ends the list; the
 * `**Creates:**` trailer never joins a step.
 */
export function parseStepTexts(segment: string): string[] {
  const lines = segment.split("\n");
  const stack: number[] = []; // content columns of open list items
  const starts: number[] = [];

  lines.forEach((line, index) => {
    if (!line.trim()) return;
    const match = ANY_MARKER_RE.exec(line);
    if (match === null) {
      if (!/^\s/.test(line.slice(0, 1)) && line.length > 0) stack.length = 0;
      return;
    }
    const indent = expand(match[1]);
    while (stack.length > 0 && indent < stack[stack.length - 1]) stack.pop();
    const nested = stack.length > 0 && indent >= stack[stack.length - 1];
    const contentColumn = indent + match[2].length + match[3].length;
    if (!nested) {
      if (indent > MAX_TOP_LEVEL_INDENT) return; // an indented code block, not a step
      if (LIST_MARKER_RE.test(line)) starts.push(index);
      stack.length = 0;
    }
    stack.push(contentColumn);
  });

  const steps: string[] = [];
  starts.forEach((start, position) => {
    const end = position + 1 < starts.length ? starts[position + 1] : lines.length;
    const bodyLines = [lines[start]];
    for (const line of lines.slice(start + 1, end)) {
      // Column-0 prose (the Creates/Touches trailer) ends the step.
      if (line.trim() && !/^\s/.test(line.slice(0, 1))) break;
      bodyLines.push(line);
    }
    const body = bodyLines.join("\n").replace(/^\s*\d+\.\s*/, "");
    steps.push(body.replace(/\s+/g, " ").trim());
  });
  return steps.filter((step) => step !== "");
}

export interface SessionPlan {
  readonly number: number;
  readonly title: string;
  readonly slug: string | null;
  readonly steps: string[];
}

/**
 * The plan's sessions and their steps.
 *
 * `slug` is the session's authored `(slug: xxx)` marker, or null when the
 * heading declares none. Two sessions declaring the same slug is refused
 * here, at parse time, rather than left for a later reader to resolve
 * however it likes.
 */
export function parseSessionPlans(specText: string): SessionPlan[] {
  const stripped = stripFencedBlocks(specText);
  SESSION_HEAD_RE.lastIndex = 0;
  const matches = [...stripped.matchAll(SESSION_HEAD_RE)];
  const plans: SessionPlan[] = [];
  const seenSlugs = new Map<string, number>();

  matches.forEach((match, index) => {
    const end =
      index + 1 < matches.length ? matches[index + 1].index! : stripped.length;
    const [title, slug] = splitSlugMarker(match[3].trim());
    const number = Number.parseInt(match[1], 10);
    if (slug !== null) {
      const prior = seenSlugs.get(slug);
      if (prior !== undefined) {
        throw new DuplicateSlugError(
          `session slug '${slug}' is declared by both session ${prior} and ` +
            `session ${number}`,
        );
      }
      seenSlugs.set(slug, number);
    }
    const segmentStart = match.index! + match[0].length;
    plans.push({
      number,
      title,
      slug,
      steps: parseStepTexts(stripped.slice(segmentStart, end)),
    });
  });
  return plans;
}

/**
 * The one session's slice of the plan, falling back to the whole when no
 * heading matches.
 */
export function extractSpecExcerpt(specText: string, sessionNumber: number): string {
  SESSION_HEAD_RE.lastIndex = 0;
  const matches = [...specText.matchAll(SESSION_HEAD_RE)];
  for (let index = 0; index < matches.length; index += 1) {
    if (Number.parseInt(matches[index][1], 10) !== sessionNumber) continue;
    const end =
      index + 1 < matches.length ? matches[index + 1].index! : specText.length;
    return specText.slice(matches[index].index!, end).trim();
  }
  return specText.trim();
}

// --- start -------------------------------------------------------------------

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export interface StartOptions {
  readonly engine: string;
  readonly provider?: string | null;
  readonly model?: string | null;
  readonly effort?: string | null;
  /**
   * The reviewers for THIS session, where the start names them. Recorded on
   * the session's row and written nowhere else: the repository's own choice
   * and the machine's default are as they were.
   */
  readonly reviewerModel?: string | null;
  readonly auxiliaryModel?: string | null;
  /** The vehicle this session's reviewers are reached through, kept the same way. */
  readonly reviewerTransport?: string | null;
  readonly sessionNumber?: number | null;
  readonly totalSessions?: number | null;
  /** The free catalog refresh a start runs first; a test speaks through it. */
  readonly refresh?: () => Promise<string[]>;
  /** Merge an origin branch that shares no history with this one, as the person answered. */
  readonly mergeOrigin?: boolean;
  /** Commit and push the uncommitted changes a start would refuse over, as the person answered. */
  readonly commitChanges?: boolean;
  /** Undo them, keeping a copy of each file outside the repository, as the person answered. */
  readonly undoChanges?: boolean;
}

/** The first line of a git error, for a one-line message. */
function firstLine(text: string): string {
  return text.split("\n").find((line) => line.trim() !== "")?.trim() ?? "no reason given";
}

/** The switch that lets a start merge an origin branch sharing no history with this one. */
export const MERGE_ORIGIN_FLAG = "--merge-origin";

/** The switches a person answers uncommitted changes at a start with: keep them, or undo them. */
export const COMMIT_CHANGES_FLAG = "--commit-changes";
export const UNDO_CHANGES_FLAG = "--undo-changes";

/** What a start refused over uncommitted changes says next, naming both ways through. */
const UNCOMMITTED_CHANGES_NEXT =
  `start: next -- run the same start with ${COMMIT_CHANGES_FLAG} to commit and push them, or with ` +
  `${UNDO_CHANGES_FLAG} to undo them (a copy of each file is kept outside the repository).`;

/**
 * Commit the changes a start refused over, as a person chose, and push them
 * where the branch tracks an upstream. Answers the refusal, or null.
 */
function commitChangesBeforeStart(repoRoot: string, number: number, paths: readonly string[]): string | null {
  const added = runGit(repoRoot, ["add", "--", ...paths]);
  if (added.code !== 0) return `git add failed: ${firstLine(added.stderr)}`;
  const committed = runGit(repoRoot, ["commit", "-m", `Commit changes made before session ${number} started`]);
  if (committed.code !== 0) return `git commit failed: ${firstLine(committed.stderr || committed.stdout)}`;
  const upstream = runGit(repoRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (upstream.code !== 0) return null;
  const pushed = runGit(repoRoot, ["push"]);
  return pushed.code === 0 ? null : `the changes were committed, but git push failed: ${firstLine(pushed.stderr)}`;
}

/**
 * Undo the changes a start refused over, as a person chose: each file is
 * copied first to a folder beside this machine's catalog, then a file HEAD
 * has is restored and one it does not is removed. Answers the folder.
 */
function undoChangesBeforeStart(repoRoot: string, paths: readonly string[]): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const folder = join(dirname(currentCatalogPath()), "undone-changes", `${basename(repoRoot)}-${stamp}`);
  for (const path of paths) {
    const source = join(repoRoot, ...path.split("/"));
    if (!isFile(source)) continue;
    const copy = join(folder, ...path.split("/"));
    mkdirSync(dirname(copy), { recursive: true });
    copyFileSync(source, copy);
  }
  for (const path of paths) {
    if (runGit(repoRoot, ["cat-file", "-e", `HEAD:${path}`]).code === 0) {
      runGit(repoRoot, ["checkout", "HEAD", "--", path]);
    } else {
      runGit(repoRoot, ["rm", "--cached", "-q", "--ignore-unmatch", "--", path]);
      rmSync(join(repoRoot, ...path.split("/")), { force: true });
    }
  }
  return folder;
}

/**
 * Move a session number's existing run record whole to a folder outside
 * `runs/`, where no reader of `runs/` sees it. Answers the folder, or null
 * where there was no record.
 */
function supersedeRunRecord(repoRoot: string, sessionNumber: number): string | null {
  const record = sessionRunDir(repoRoot, sessionNumber);
  if (!isDirectory(record)) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const folder = join(repoRoot, ...MACHINE_DIRNAME.split("/"), "superseded-runs", `${basename(record)}-${stamp}`);
  mkdirSync(dirname(folder), { recursive: true });
  moveEntry(record, folder);
  return folder;
}

/**
 * A registration brings its checkout level with origin first, when there is
 * a clean tree to do it on, so a session starts on what the server has and
 * not on what this folder last saw -- and so the push at its end is not
 * refused over a commit the host made, which is found only after the work.
 * The rule is `reconcileWithOrigin`'s; a start adds only the clean tree.
 */
function pullBeforeStart(repoRoot: string, sessionsDir: string, allowUnrelated: boolean): OriginReconciliation {
  const status = readWorktreeStatus(repoRoot);
  if (status.error !== "") return { line: null, held: null };
  const setRel = relative(repoRoot, resolve(sessionsDir)).split("\\").join("/");
  if (materialPaths(status.text, setRel, { beforeWork: true }).length > 0) return { line: null, held: null };
  return reconcileWithOrigin(repoRoot, { allowUnrelated });
}

/** The refusal for an origin branch that shares no history with this one and holds real files. */
export function originHoldsWorkRefusal(held: { readonly remote: string; readonly files: readonly string[] }): string {
  const shown = held.files.slice(0, 10).join(", ");
  return (
    `${held.remote} shares no history with this checkout and holds ${held.files.length} file(s) it has never had: ` +
    `${shown}${held.files.length > 10 ? ", and more" : ""}. That is more than a host's initial README, so it may ` +
    "be work -- yours or someone else's -- and nothing was merged or registered. To merge it into this branch " +
    "(where a file is on both sides, this checkout's copy is kept) and start, run the same start with " +
    `${MERGE_ORIGIN_FLAG}.`
  );
}

/**
 * One line when the origin does not answer as a git remote. A repository
 * provisioned from a hosting page can carry the page's address instead of
 * the clone's, and nothing else meets it before the land's push -- after the
 * work. Never a refusal: the work can be done without the remote, and the
 * push says the same at the land.
 */
function remoteUnansweredLine(repoRoot: string): string | null {
  const url = runGit(repoRoot, ["remote", "get-url", "origin"]);
  if (url.code !== 0 || url.stdout.trim() === "") return null;
  const answered = runGit(repoRoot, ["ls-remote", "--heads", "origin"], {
    // A credential prompt would hold the start open on a question nobody sees.
    env: { GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "never" },
    timeoutMs: 15_000,
  });
  if (answered.code === 0) return null;
  return (
    `start: origin (${url.stdout.trim()}) did not answer as a git remote (${firstLine(answered.stderr)}); ` +
    "the push at the end of this session fails the same way until it does: " +
    "git remote set-url origin <the repository's clone URL>"
  );
}

/** Who is working, as the four fields the orchestrator block carries. */
export interface OrchestratorIdentity {
  readonly engine: string;
  readonly provider: string | null;
  readonly model: string | null;
  readonly effort: string | null;
}

/** The orchestrator block on a session record, or null when it has none. */
function recordedIdentity(
  recorded: Record<string, unknown> | null,
): Record<string, unknown> | null {
  const block = recorded?.["orchestrator"];
  return block && typeof block === "object" ? (block as Record<string, unknown>) : null;
}

/** One field of a recorded block as a trimmed string, or "" when unstated. */
function statedField(block: Record<string, unknown> | null, field: string): string {
  const value = block?.[field];
  return typeof value === "string" ? value.trim() : "";
}

/**
 * How the identity being asked for differs from the one on the record, in
 * words, or null when it does not.
 *
 * Only the three that name WHO worked: engine, provider, model. `effort` is
 * a dial on the same worker and is deliberately not here -- refusing a
 * resumed session because a reasoning effort was omitted would make the
 * guard fire on the ordinary case it exists to allow.
 *
 * An absent value on either side is "not stated" rather than a difference,
 * so a call that omits `--model` continues a session that recorded one.
 * What is refused is a value that CONTRADICTS the record. What an omission
 * then MEANS is `carryForward`'s to say, and the two are written together
 * because letting an omission through without preserving it is how the
 * guard came to permit the erasure it was written to prevent.
 */
export function identityClash(
  recorded: Record<string, unknown> | null,
  asking: OrchestratorIdentity,
): string | null {
  const block = recordedIdentity(recorded);
  if (block === null) return null;
  const asked: ReadonlyArray<readonly [string, string | null]> = [
    ["engine", asking.engine],
    ["provider", asking.provider],
    ["model", asking.model],
  ];
  for (const [field, value] of asked) {
    const want = typeof value === "string" ? value.trim() : "";
    const have = statedField(block, field);
    if (want === "" || have === "" || want === have) continue;
    return `it was registered with ${field} '${have}', not '${want}'`;
  }
  return null;
}

/**
 * The identity to register with: what the call stated, and what the record
 * already holds wherever the call stated nothing.
 *
 * Called only after `identityClash` returned null, so there is nothing to
 * choose between -- every field either agrees or was left unsaid, and an
 * unsaid one keeps what the session was registered with. `effort` travels
 * here too even though the guard ignores it: a dial the call does not
 * mention is a dial nobody asked to change.
 */
export function carryForward(
  recorded: Record<string, unknown> | null,
  asking: OrchestratorIdentity,
): OrchestratorIdentity {
  const block = recordedIdentity(recorded);
  if (block === null) return asking;
  const keep = (value: string | null, field: string): string | null => {
    const stated = typeof value === "string" ? value.trim() : "";
    return stated !== "" ? stated : statedField(block, field) || null;
  };
  return {
    engine: keep(asking.engine, "engine") ?? asking.engine,
    provider: keep(asking.provider, "provider"),
    model: keep(asking.model, "model"),
    effort: keep(asking.effort, "effort"),
  };
}

/** What the record says about the sequence a `start` is asking to join. */
export interface SequenceFacts {
  /** The session in flight, or null. */
  readonly current: number | null;
  /** Every closed session, ascending. */
  readonly completed: readonly number[];
  /** Every cancelled session. */
  readonly cancelled: ReadonlySet<number>;
  /** The number the caller named, or null to take the next one. */
  readonly requested: number | null;
}

/**
 * Which session a `start` means, and whether it may have it.
 *
 * A cancelled session is settled work, not a hole in the sequence: the next
 * session steps over it, and "next" is the first one still available to run
 * rather than one past the highest closed number. The three refusals are the
 * boundary triad -- a session already in flight, one already closed, and one
 * that is not the next in sequence -- plus the cancelled one, which is
 * refused with the verb that would undo it rather than silently erasing the
 * reason somebody recorded.
 */
export function judgeStartBoundary(
  facts: SequenceFacts,
): { readonly requested: number } & BoundaryRuling {
  const nextAvailable = (after: number): number => {
    let candidate = after;
    while (facts.cancelled.has(candidate)) candidate += 1;
    return candidate;
  };
  const expected = nextAvailable(
    facts.completed.length > 0 ? Math.max(...facts.completed) + 1 : 1,
  );
  const requested =
    facts.requested ?? (facts.current !== null ? facts.current : expected);
  const closed = `completedSessions=[${facts.completed.join(", ")}]`;
  const refuse = (refusal: string): { requested: number } & BoundaryRuling => ({
    requested,
    refusal,
    exitCode: EXIT_BOUNDARY,
  });

  if (facts.current !== null && requested !== facts.current) {
    return refuse(
      `refused -- session ${sessionDisplayNumber(facts.current)} is still in ` +
        `flight (${closed}). Close session ` +
        `${sessionDisplayNumber(facts.current)} before starting session ` +
        `${sessionDisplayNumber(requested)}.`,
    );
  }
  if (facts.completed.includes(requested)) {
    return refuse(
      `refused -- session ${sessionDisplayNumber(requested)} is already ` +
        `closed (${closed}). Sessions are never re-opened.`,
    );
  }
  if (facts.cancelled.has(requested)) {
    return refuse(
      `refused -- session ${sessionDisplayNumber(requested)} is cancelled. ` +
        "Starting it would erase the cancellation and the reason for it; " +
        `restore it first: dabbler session restore ${requested}`,
    );
  }
  if (facts.current === null && requested !== expected) {
    return refuse(
      `refused -- session ${sessionDisplayNumber(requested)} is not the next ` +
        `sequential session (expected ${expected}; ${closed}). Close the ` +
        "intervening sessions first.",
    );
  }
  return { requested, refusal: null, exitCode: EXIT_OK };
}

/** How many names a refusal spells before it stops being readable. */
const NAMES_IN_A_START_REFUSAL = 12;

function offeredNames(candidates: readonly string[]): string {
  if (candidates.length === 0) return "It offers none.";
  const shown = [...candidates].sort().slice(0, NAMES_IN_A_START_REFUSAL);
  const rest = candidates.length - shown.length;
  return `It offers ${candidates.length}: ${shown.join(", ")}${rest > 0 ? `, and ${rest} more` : ""}.`;
}

/**
 * Why a model somebody CHOSE cannot fill the role they chose it for, or null.
 *
 * **`options` filters a list and enforces nothing.** Both files a choice
 * lives in -- this checkout's `.vscode/settings.json` and the user-level
 * `preferences.json` -- are text an operator can type into, and a pane is
 * not in the loop when `dabbler session start` is typed in a terminal. So
 * the boundary before anything is billed asks once more.
 *
 * It asks through `configurationNode`, which is the reading every other
 * surface uses: which models an engine's CLI can be launched on, which a
 * reviewing vehicle lists, and the one rule that a reviewer may not be the
 * author are all applied there, once. Restating any of them here would be
 * the second copy this block of sessions exists to delete -- and a second
 * copy that disagreed would refuse at the start a choice the pane had just
 * offered.
 *
 * **Only a value somebody chose is held to this.** A first-run machine with
 * no seat, no keys and nothing selected is not refused: refusing it would
 * refuse the setup that fixes it. A role with no selection resolves by
 * preference order, and a preference order that resolves to nothing is a
 * machine that is not set up yet rather than a configuration that is wrong.
 */
export function configuredModelRefusal(
  checkout: string,
  /** The authoring model this call resolved: typed, or this checkout's setting. */
  authoringModel: string | null,
  /**
   * The engine being registered.
   *
   * Named, because nothing on disk says so until this call has written it --
   * and the authoring list is the ENGINE's. Reading the machine's vehicle
   * instead refused a good model on a machine whose seat had never been read.
   */
  engine: string | null = null,
): string | null {
  const configuration = configurationNode(checkout, {
    engine,
    // The model THIS CALL names, so the reviewing roles are measured against
    // the author of the session about to begin rather than against whatever
    // the checkout had configured. Without it, naming the Primary Reviewer's
    // own model on `session start --model` went through.
    authoringModel,
  }) as Record<string, unknown>;
  if (typeof configuration["unavailable"] === "string") return null;
  const roleOf = (key: string): Record<string, unknown> | null => {
    const value = configuration[key];
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  };
  const modelsOf = (role: Record<string, unknown> | null): string[] =>
    Array.isArray(role?.["candidates"])
      ? (role?.["candidates"] as Record<string, unknown>[]).map((row) => String(row["model"]))
      : [];
  /**
   * One chosen model against what its role can be.
   *
   * **It refuses on knowledge and never on the absence of it.** An empty
   * list is a reading that says "I do not know what this machine offers" --
   * a seat that has never answered, a provider with no key, a CLI whose
   * catalog cannot be enumerated -- and every one of those is an ordinary
   * machine that has not been set up yet rather than a configuration that is
   * wrong. Refusing there would refuse the operator who typed the right
   * model on a machine that simply has not run a free refresh, and the CLI
   * itself refuses an id it does not know before anything is billed anyway.
   *
   * The alias FLOOR is the same case wearing a list: three names offered so
   * a pane is not empty, on a machine that by definition does not know what
   * its CLI accepts.
   */
  /** Which of the three reasons keeps a chosen model off a role's list. */
  const notACandidate = (role: Record<string, unknown>, chosen: string): string => {
    const author = roleOf("authoring")?.["chosen"] as Record<string, unknown> | null | undefined;
    const withheld = Array.isArray(role["withheld"]) ? modelsOf({ candidates: role["withheld"] }) : [];
    if (
      role !== roleOf("authoring") &&
      typeof author?.["model"] === "string" &&
      normalizeModelToken(author["model"]) === normalizeModelToken(chosen)
    ) {
      return "it is the authoring model itself, and a reviewer is never from the author's vendor";
    }
    if (withheld.includes(chosen)) return "its vendor no longer serves it";
    const vehicle = (role["vehicle"] as Record<string, unknown> | undefined)?.["chosen"];
    return typeof vehicle === "string"
      ? `the '${vehicle}' vehicle does not list it`
      : "the list it is read from does not name it";
  };
  const held = (
    role: Record<string, unknown> | null,
    chosen: string | null,
    what: string,
    where: string,
    fix: string,
  ): string | null => {
    if (chosen === null || chosen.trim() === "" || role === null) return null;
    if (role["enumeration"] === ENUMERATION_CLI_ALIASES) return null;
    const candidates = modelsOf(role);
    // By the normalized token, as the pane, `configuration explain` and the
    // dispatch all read it: a vendor's dated id and a seat's own name for the
    // same model are one model, and a start that alone held them apart
    // refused a choice every other surface had accepted.
    const token = normalizeModelToken(chosen);
    if (candidates.length === 0 || candidates.some((listed) => normalizeModelToken(listed) === token)) return null;
    return (
      `${what} is set to '${chosen}', which is not one it can be: ${notACandidate(role, chosen)}. ` +
      `${offeredNames(candidates)} It was chosen in ${where}; ${fix} changes ` +
      "it, and `dabbler configuration options` lists what this machine may " +
      "choose. Nothing was started and nothing was billed."
    );
  };
  const authoring = roleOf("authoring");
  // The authoring model only where it is a CHOICE. A session in flight
  // declared its own at `session start` and the ledger has carried it since;
  // re-judging a recorded identity here would refuse a continuation over a
  // catalog that moved after the session began.
  // A name the engine's CLI always accepts is never held to the catalog's
  // list: `sonnet` is not an enumerated id, and `claude` takes it anyway.
  const authoringRefusal =
    authoring?.["declaredAtStart"] === true || engineAliases(engine).includes(authoringModel ?? "")
      ? null
      : held(
          authoring,
          authoringModel,
          "The authoring model",
          "this checkout's `.vscode/settings.json` (`dabbler.authoringModel`), or on this call",
          "`dabbler configure --authoring-model <id>`",
        );
  if (authoringRefusal !== null) return authoringRefusal;
  // Each reviewing role against ITS OWN list, on the shared reviewing
  // vehicle. `selected` is what a person chose and is the only thing held to
  // this: a role resolving by preference order is not a choice anybody made.
  //
  // The one rule -- a reviewer may not be the author -- is applied inside
  // that reading, so a selection equal to the author is simply not among
  // the candidates and lands here with the rest.
  for (const [key, what, flag] of [
    ["primaryReviewer", "The Primary Reviewer's model", "--reviewer-model"],
    ["auxiliaryReviewer", "The Auxiliary Reviewer's model", "--auxiliary-model"],
  ] as const) {
    const role = roleOf(key);
    const selected = role?.["selected"];
    const refusal = held(
      role,
      typeof selected === "string" ? selected : null,
      what,
      "this machine's own `preferences.json`",
      `\`dabbler configure ${flag} <id>\``,
    );
    if (refusal !== null) return refusal;
  }
  return null;
}

/** What a session start found about the vehicles this session uses. */
export interface SessionUse {
  readonly refusal: string | null;
  readonly warnings: readonly string[];
}

/**
 * Whether the Primary Reviewer has a candidate outside the author's provider
 * on the reviewing vehicle as resolved, asked through the round's own ladder.
 *
 * Chosen or built-in default alike: an unreachable reviewer found at the
 * round leaves a person mid-session looking for an alternative. A credential
 * reference that names nothing, on a provider the vehicle would call, is
 * named in the refusal where it leaves no candidate and returned as a
 * warning where it does not.
 */
export function reviewingVehicleRefusal(
  config: RouterConfig,
  checkout: string,
  authorProvider: string,
): SessionUse {
  const reading = explainReviewingTransport(config, null, checkout);
  const exclude = [authorProvider];
  const credentials = reading.transport === TRANSPORT_API ? credentialStops(config, exclude) : [];
  /** The role's ladder on the reviewing vehicle, or nothing on a vehicle that has none to climb. */
  const ladder = (role: string, without: readonly string[]): ReadonlyArray<{ provider: string }> =>
    reading.transport === TRANSPORT_API
      ? apiLadder(config, role, "session-verification", without)
      : reading.transport === TRANSPORT_COPILOT_CLI
        ? // Null is a seat never read, which the ladder tells from a seat that lists nothing.
          seatLadder(config, seatModels(), role, without)
        : [];
  let judging = "the Primary Reviewer";
  try {
    const primary = ladder(ROLE_PRIMARY_REVIEWER, exclude);
    // **An auxiliary THIS start named is judged here, not at a dispute.** It
    // is never the author's vendor and never the primary's, and a session
    // started with an author and a primary of its own routinely lands on the
    // saved auxiliary's vendor -- so the one who named it is told now, while
    // they can still name another. One nobody named is judged at the dispute,
    // as it always was: a start cannot know what a round will fall to.
    if (sessionReviewerOf(config, ROLE_AUXILIARY_REVIEWER) !== null) {
      judging = "the Auxiliary Reviewer";
      ladder(ROLE_AUXILIARY_REVIEWER, [...exclude, ...(primary[0] ? [primary[0].provider] : [])]);
    }
  } catch (error) {
    if (!(error instanceof NoCandidateError)) throw error;
    const chose =
      reading.decidedBy === null ||
      reading.decidedBy === TRANSPORT_SOURCE_CONFIG ||
      reading.decidedBy === REVIEWING_TRANSPORT_KEY
        ? "is the built-in default"
        : `was set by ${reading.decidedBy}`;
    // The ladder's message already carries the ways forward its cause has.
    // Only what fixes that same cause is added: another vehicle helps a model
    // no list holds or a key this machine lacks, never a vendor conflict,
    // and an unread seat also needs signing in.
    const others = transportPresence(config)
      .filter((entry) => entry.present && entry.transport !== reading.transport)
      .map((entry) => `'${entry.transport}'`);
    const elsewhere =
      "`dabbler configure --reviewer-transport <vehicle>` moves the review to " +
      (others.length > 0 ? `${prose(others)}, which this machine has` : "a vehicle this machine has");
    const forward =
      error.stopCause === CAUSE_UNREAD && reading.transport === TRANSPORT_COPILOT_CLI
        ? ["`copilot login` signs the seat in where it is not"]
        : error.stopCause === CAUSE_NO_KEY || error.stopCause === CAUSE_NOT_LISTED
          ? [elsewhere]
          : [];
    return {
      refusal:
        `${judging} cannot be reached on the reviewing vehicle ` +
        `'${reading.transport}', which ${chose}, outside the author's provider ` +
        `(${authorProvider})${judging === "the Auxiliary Reviewer" ? " and the Primary Reviewer's" : ""}: ${error.message}` +
        (credentials.length > 0 ? ` ${credentials.join(" ")}` : "") +
        (forward.length > 0 ? ` Also: ${forward.join("; ")}.` : ""),
      warnings: [],
    };
  }
  return { refusal: null, warnings: credentials };
}

/**
 * What `session start` holds a session to: a key pasted into a setting on
 * any provider, the authoring engine's CLI, and the reviewing vehicle.
 */
export function assessSessionUse(
  config: RouterConfig,
  checkout: string,
  engine: string,
  authorProvider: string,
  env: Readonly<Record<string, string | undefined>> = process.env,
): SessionUse {
  const pasted = pastedKeyRefusal(config);
  if (pasted !== null) return { refusal: pasted, warnings: [] };
  const installation = installedEngines(env).engines.find((entry) => entry.engine === engine);
  if (installation !== undefined && installation.path === null) {
    return {
      refusal:
        `the engine '${engine}' runs through \`${installation.program}\`, which is ` +
        "not on this machine's PATH, so nothing could author this session. " +
        "Install it, or start the session with an engine this machine has.",
      warnings: [],
    };
  }
  return reviewingVehicleRefusal(config, checkout, authorProvider);
}

let sessionUseReading: typeof assessSessionUse = assessSessionUse;

/** Where a suite stands in for this machine's engines, keys and seat; null restores it. */
export function setSessionUseReading(reading: typeof assessSessionUse | null): void {
  sessionUseReading = reading ?? assessSessionUse;
}

export async function start(sessionsDir: string, options: StartOptions): Promise<number> {
  // Named at the flag or left in a machine's preferences from before, a
  // retired engine is refused before anything is read or written.
  if (options.engine === "gemini") {
    writeErr(`start: refused -- ${GEMINI_RETIRED}\n`);
    return EXIT_USAGE;
  }
  if (!isDirectory(sessionsDir)) {
    writeErr(`start: not a directory: ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  if (options.commitChanges === true && options.undoChanges === true) {
    writeErr(`start: refused -- ${COMMIT_CHANGES_FLAG} and ${UNDO_CHANGES_FLAG} cannot both be given; choose one.\n`);
    return EXIT_USAGE;
  }
  // Identity is resolved further down, AFTER the record has been read and
  // an omitted field has been filled from it. It used to be the first thing
  // this function did, on the ordering rule that the cheapest refusal comes
  // first -- and that ordering was wrong for the one case it most needed to
  // be right for. A Copilot seat's identity resolves only with a model, so
  // continuing a seat's session without repeating `--model` was refused
  // here for a model the record was holding the whole time. Reading the
  // record costs one file, once, and it is the difference between resolving
  // the identity being asked for and resolving the identity that exists.

  let lock: string;
  try {
    lock = acquireLockWithTimeout(sessionsDir, `start_session/${process.pid}`);
  } catch (error) {
    if (!(error instanceof LockContentionError)) throw error;
    writeErr(`start: refused -- lifecycle lock contention: ${error.message}\n`);
    return EXIT_LOCK_CONTENTION;
  }
  try {
    const raw = readRawSessionState(sessionsDir);
    const normalized = raw ? derivedView(raw) : null;
    const completed = [...completedNumbers(normalized)].sort((a, b) => a - b);
    const cancelled = cancelledNumbers(normalized);
    const current = (normalized?.["currentSession"] ?? null) as number | null;

    const boundary = judgeStartBoundary({
      current,
      completed,
      cancelled,
      requested: options.sessionNumber ?? null,
    });
    if (boundary.refusal !== null) {
      writeErr(`start: ${boundary.refusal}\n`);
      return boundary.exitCode;
    }
    const requested = boundary.requested;

    // Re-registering the session in flight is the ordinary way a pull
    // continues -- `dabbler session start --engine ...` called a second time
    // in the same session lands here -- and under the SAME identity it is
    // silent and idempotent. Under a different one it is not a continuation
    // at all: `registerSessionStart` rewrites the orchestrator block whole,
    // so a second Start under another engine would leave the record saying
    // this session was run by an engine that ran only part of it. Nobody
    // reading the ledger afterwards could tell which half.
    // **What this checkout chose, where the call named nothing.**
    //
    // `dabbler configure --authoring-model` writes a setting, and a setting
    // no reader consumes is a control that reports success and changes
    // nothing -- the exact failure this block of sessions exists to delete.
    // A `--model` typed at this call still wins: it is what the person said
    // now, about this session.
    const checkout = repoRootFor(sessionsDir) ?? dirname(sessionsDir);
    let identity: OrchestratorIdentity = {
      engine: options.engine,
      provider: options.provider ?? null,
      model: options.model ?? (explainAuthoringModel(null, checkout).transport || null),
      effort: options.effort ?? null,
    };
    // Free, and before anything below reads the catalog: a machine that has
    // never read it would otherwise refuse a seat's model the refresh is about
    // to record, and tell the operator to run the refresh by hand.
    for (const line of await (options.refresh ?? refreshDiscovery)()) writeOut(`${line}\n`);
    try {
      loadConfig(undefined, checkout);
      // **A MODEL somebody chose that its role cannot actually be.**
      //
      // `dabbler configuration options` filters a list; it enforces nothing,
      // and both files a choice lives in can be typed into. So the choices
      // are read once more here, at the boundary before anything is billed,
      // through the same reading every surface uses -- a second copy of any
      // of these rules is the thing this block of sessions exists to delete.
      const impossible = configuredModelRefusal(checkout, identity.model, identity.engine);
      if (impossible !== null) {
        writeErr(`start: refused -- ${impossible}\n`);
        return EXIT_USAGE;
      }
    } catch (error) {
      // A configuration this router cannot load is refused by every other
      // reader too, and with its own sentence. Starting a session over it
      // would put the refusal at the first round instead of here.
      writeErr(`start: refused -- ${error instanceof Error ? error.message : String(error)}\n`);
      return EXIT_USAGE;
    }
    if (current !== null && requested === current && normalized !== null) {
      const recorded = sessionRecord(normalized, current);
      const clash = identityClash(recorded, identity);
      if (clash !== null) {
        writeErr(
          `start: refused -- session ${sessionDisplayNumber(current)} is in ` +
            `flight and ${clash}. Its identity is on the record and the work ` +
            "already done was done under it. Continue with the same identity, " +
            "or with none -- a session in flight needs none named -- or close " +
            "this session before starting one under another.\n",
        );
        return EXIT_BOUNDARY;
      }
      // An omitted field is "not stated", and that has to mean the same
      // thing to the WRITE as it means to the guard above. It did not:
      // `registerSessionStart` assigns the orchestrator block whole and
      // `buildOrchestratorBlock` drops what it is not given, so continuing
      // a seat's session with `--engine copilot --provider openai` and no
      // `--model` passed the guard and then erased the model the seat was
      // registered with. Carrying the record forward is what makes the two
      // agree: the guard refuses a contradiction, and everything it lets
      // through preserves rather than replaces.
      identity = carryForward(recorded, identity);
    }
    // Resolved on the identity that will actually be written, which is the
    // point of doing it here rather than on the way in.
    let authorProvider: string;
    try {
      authorProvider = resolveOrchestratorIdentity(
        buildOrchestratorBlock(
          identity.engine,
          identity.provider,
          identity.model,
          identity.effort,
        ),
      ).effectiveProvider;
    } catch (error) {
      if (!(error instanceof IdentityResolutionError)) throw error;
      writeErr(`start: refused -- ${error.message}\n`);
      return EXIT_USAGE;
    }
    // **What this session uses, and nothing else, before it exists.** A
    // vehicle that cannot author or review it is found here rather than
    // mid-session; anything the session does not call says nothing.
    try {
      const use = sessionUseReading(
        // With the reviewers THIS start names, so the check judges the session
        // that would run and not the repository's saved choice.
        withSessionVehicle(
          withSessionReviewers(loadConfig(undefined, checkout), {
            [ROLE_PRIMARY_REVIEWER]: options.reviewerModel,
            [ROLE_AUXILIARY_REVIEWER]: options.auxiliaryModel,
          }),
          options.reviewerTransport,
        ),
        checkout,
        identity.engine,
        authorProvider,
      );
      if (use.refusal !== null) {
        writeErr(`start: refused -- ${use.refusal} Nothing was started and nothing was billed.\n`);
        return EXIT_USAGE;
      }
      for (const warning of use.warnings) writeErr(`start: warning -- ${warning}\n`);
    } catch (error) {
      writeErr(`start: refused -- ${error instanceof Error ? error.message : String(error)}\n`);
      return EXIT_USAGE;
    }
    // A fresh registration only: re-registering the session in flight is a
    // continuation, and moving the tree under a session's own work is not.
    if (current === null || requested !== current) {
      // The declaration's own question, asked here where the condition is
      // fully known and before any work: a tree carrying changes cannot
      // declare, and finding that out inside the first `next` -- after the
      // plan was written -- paused the sample over a file the extension
      // itself had put there. The same words, so the two never drift.
      const begun = materialWorktreeChanges(sessionsDir, { beforeWork: true });
      if (begun.error) {
        writeErr(`start: refused -- cannot tell whether session ${sessionDisplayNumber(requested)}'s work has begun: ${begun.error}\n`);
        return EXIT_USAGE;
      }
      if (begun.paths.length > 0) {
        const repoRoot = repoRootFromSessionsDir(sessionsDir);
        if (options.commitChanges === true) {
          const refused = commitChangesBeforeStart(repoRoot, requested, begun.paths);
          if (refused !== null) {
            writeErr(`start: refused -- ${refused}\n`);
            return EXIT_USAGE;
          }
          writeOut(`start: committed ${begun.paths.length} file(s) made before session ${sessionDisplayNumber(requested)}.\n`);
        } else if (options.undoChanges === true) {
          const folder = undoChangesBeforeStart(repoRoot, begun.paths);
          writeOut(`start: undid ${begun.paths.length} change(s); a copy of each file is in ${folder}\n`);
        } else {
          writeErr(`start: refused -- ${workBegunRefusal(requested, begun.paths)}\n`);
          writeErr(`${UNCOMMITTED_CHANGES_NEXT}\n`);
          return EXIT_USAGE;
        }
      }
      // The origin is asked first, with no prompt and a bound: a pull from
      // an origin that does not answer would wait on a credential nobody
      // sees, and say the same thing a second time.
      const unanswered = remoteUnansweredLine(repoRootFromSessionsDir(sessionsDir));
      if (unanswered !== null) {
        writeOut(`${unanswered}\n`);
      } else {
        const pulled = pullBeforeStart(repoRootFromSessionsDir(sessionsDir), sessionsDir, options.mergeOrigin === true);
        if (pulled.held !== null) {
          writeErr(`start: refused -- ${originHoldsWorkRefusal(pulled.held)}\n`);
          return EXIT_BOUNDARY;
        }
        if (pulled.line !== null) writeOut(`start: ${pulled.line}\n`);
      }
    }
    // What the repository still declares that nothing reads: said, and refused never.
    for (const line of retiredDeclarationLines(repoRootFromSessionsDir(sessionsDir))) writeOut(`${line}\n`);
    // Run records are keyed by number alone, so a number reused after a reset
    // or a renumbering would hand this session another run's record.
    if (current === null || requested !== current) {
      const superseded = supersedeRunRecord(repoRootFromSessionsDir(sessionsDir), requested);
      if (superseded !== null) {
        writeOut(`start: an earlier run's record for session ${sessionDisplayNumber(requested)} was moved to ${superseded}\n`);
      }
    }
    registerSessionStart(sessionsDir, requested, {
      engine: identity.engine,
      provider: identity.provider,
      model: identity.model,
      effort: identity.effort,
      totalSessions: options.totalSessions,
      reviewerModel: options.reviewerModel ?? null,
      auxiliaryModel: options.auxiliaryModel ?? null,
      reviewerTransport: options.reviewerTransport ?? null,
    });
    writeOut(
      `start: session ${sessionDisplayNumber(requested)} of ${basename(sessionsDir)} registered (${options.engine}).\n`,
    );
    for (const line of discoveryWarnings()) writeOut(`${line}\n`);
    // The Stop hook the framework used to install for this engine is taken
    // out here, where the engine is known: a hook whose verb no longer
    // exists would block every end of turn. Idempotent, and best-effort: a
    // registration must not fail because a settings file could not be
    // written.
    if (identity.engine === "claude-code") {
      try {
        const unhooked = removeStopGate(repoRootFromSessionsDir(sessionsDir));
        if (unhooked !== null) {
          // On the row, so the declaration gate exempts this edit and no
          // other change to the file.
          recordHookRemoved(sessionsDir, requested);
          writeOut(
            `start: removed the stop gate from ${unhooked} -- the framework's own ` +
              "edit, committed with this session's work; no step needs to name it.\n",
          );
        }
      } catch {
        // Deliberately silent: see above.
      }
    }
    // The one thing true under both flows. This used to print the typed
    // lifecycle's recipe -- `session declare`, then `dabbler affected` --
    // which contradicted the managed body the engine had just read, and
    // four sessions of one test repository were told to run verbs the pull
    // forbids. The declaration is the plan step's answer; the tests are the
    // framework's.
    // And it names what moves a session: the AI's one request, after which
    // every answer asks for what follows it. Under a live loop that request
    // would take the loop's lease and end it, so there it is the waiter.
    writeOut(
      liveLoopSession(sessionsDir) !== null
        ? "Next: a loop is already driving this session; the AI runs `dabbler session wait`.\n"
        : `Next: the AI runs \`dabbler session next --sessions-dir ${sessionsDir}\` once, and starts each ` +
            "`answer_command` it is given as a background command.\n",
    );
    return EXIT_OK;
  } finally {
    releaseLock(lock);
  }
}

// --- the two files -----------------------------------------------------------

/**
 * The session a decision or declaration belongs to: the one in flight, else
 * the last closed one, else refuse.
 */
function resolveTargetSession(
  sessionsDir: string,
  sessionNumber: number | null | undefined,
): number | null {
  if (sessionNumber !== null && sessionNumber !== undefined) return sessionNumber;
  const raw = readRawSessionState(sessionsDir);
  const normalized = raw ? derivedView(raw) : null;
  const current = (normalized?.["currentSession"] ?? null) as number | null;
  if (current !== null) return current;
  const completed = [...completedNumbers(normalized)];
  return completed.length > 0 ? Math.max(...completed) : null;
}

/**
 * Prose arrives inline or from a file (`-` is stdin), because a decision
 * that fits on a command line is usually not one.
 */
function readBody(text: string | null | undefined, path: string | null | undefined): string {
  if (text !== null && text !== undefined) return text;
  if (path === null || path === undefined) {
    throw new SanctionedWriteError("supply the text inline or from a file");
  }
  if (path === "-") return readFileSync(0, "utf8");
  // TEXT mode, as `read_text` is: a CRLF plan file must reach the record as
  // the same string the Python router puts there.
  return readFileSync(path, "utf8").replace(/\r\n?/g, "\n");
}

export interface DecisionCliOptions {
  readonly decider: string;
  readonly headline: string;
  readonly body?: string | null;
  readonly bodyFile?: string | null;
  readonly model?: string | null;
  readonly provider?: string | null;
  readonly decidedOn?: string | null;
  readonly backfillReason?: string | null;
  readonly sessionNumber?: number | null;
}

/** Append one decision to the log, at the moment it occurs. */
export function decision(sessionsDir: string, options: DecisionCliOptions): number {
  if (!isDirectory(sessionsDir)) {
    writeErr(`decision: not a directory: ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  const target = resolveTargetSession(sessionsDir, options.sessionNumber);
  if (target === null) {
    writeErr(
      `decision: refused -- no session has been started under ${sessionsDir}. ` +
        "Run `session start` first.\n",
    );
    return EXIT_BOUNDARY;
  }
  let text: string;
  try {
    text = readBody(options.body, options.bodyFile);
  } catch (error) {
    if (error instanceof SanctionedWriteError) {
      writeErr(`decision: refused -- ${error.message}\n`);
    } else {
      writeErr(
        `decision: cannot read body -- ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      );
    }
    return EXIT_USAGE;
  }

  let lock: string;
  try {
    lock = acquireLockWithTimeout(sessionsDir, `decision/${process.pid}`);
  } catch (error) {
    if (!(error instanceof LockContentionError)) throw error;
    writeErr(`decision: refused -- lifecycle lock contention: ${error.message}\n`);
    return EXIT_LOCK_CONTENTION;
  }
  let entry: Record<string, unknown>;
  try {
    entry = appendDecision(sessionsDir, {
      sessionNumber: target,
      decider: options.decider,
      headline: options.headline,
      body: text,
      model: options.model,
      provider: options.provider,
      decidedOn: options.decidedOn,
      backfillReason: options.backfillReason,
    });
  } catch (error) {
    if (!(error instanceof SanctionedWriteError)) throw error;
    writeErr(`decision: refused -- ${error.message}\n`);
    return EXIT_USAGE;
  } finally {
    releaseLock(lock);
  }
  writeOut(
    `decision: ${String(entry["decisionId"])} recorded for session ` +
      `${sessionDisplayNumber(target)} (${String(entry["decider"])}).\n`,
  );
  return EXIT_OK;
}

/**
 * What a repository still declares that nothing reads any more, one line
 * each. Said and never refused: the declarations are the repository's, and
 * a start that stopped over a file nothing reads would strand the checkout.
 */
export function retiredDeclarationLines(root: string): string[] {
  const lines: string[] = [];
  if (existsSync(join(root, "docs", "modules.yaml"))) {
    lines.push("start: docs/modules.yaml is no longer read; the Solution Explorer reads the solution's build files.");
  }
  let config: unknown;
  try {
    config = loadConfig(undefined, root);
  } catch {
    return lines;
  }
  const declared = isRecord(config) ? config : {};
  const modules = isRecord(declared["modules"]) ? declared["modules"] : {};
  if (Object.values(modules).some((entry) => isRecord(entry) && entry["sharedFiles"] !== undefined)) {
    lines.push("start: sharedFiles in dabbler.yaml is no longer read; a step may change any file its plan names.");
  }
  const testing = isRecord(declared["testing"]) ? declared["testing"] : {};
  const suites = Array.isArray(testing["suites"]) ? testing["suites"] : [];
  if (suites.some((suite) => isRecord(suite) && (suite["module"] !== undefined || suite["against"] !== undefined))) {
    lines.push("start: a suite's module and against in dabbler.yaml are no longer read; every expensive suite runs at the end of a session.");
  }
  const selection = isRecord(testing["selection"]) ? testing["selection"] : {};
  if (selection["rules"] !== undefined || selection["repo_wide"] !== undefined) {
    lines.push("start: testing.selection rules and repo_wide in dabbler.yaml are no longer read; a source file's tests are the tests named after it.");
  }
  return lines;
}

/** The hold every session of a repository that declares no packaging carries. */
export const NOTHING_TO_PUBLISH = "this repository declares no packaging, so there is nothing to publish";

export interface DeclareCliOptions {
  readonly task?: string | null;
  readonly taskFile?: string | null;
  readonly releasable: boolean;
  /** Why a held session publishes nothing; the record carries it beside the declaration. */
  readonly holdReason?: string | null;
  readonly sessionNumber?: number | null;
  /**
   * Handed every refusal's own words, beside the line written to stderr.
   * The driver declares on the engine's behalf and stops when this refuses;
   * a stop that said only "the declaration was refused (its reason is
   * above)" left the toast, which shows the stop's first sentence, saying
   * nothing a person could act on.
   */
  readonly onRefusal?: (message: string, cause: DeclareRefusalCause) => void;
}

/**
 * What refused a declaration, where the words alone cannot say whose fault
 * it is: `tree` is a working tree that already carries work, which is the
 * one refusal a driver must not log as the engine's.
 */
export type DeclareRefusalCause = "tree" | "other";

/** Declare the session's task list and whether it may publish. */
export function declare(sessionsDir: string, options: DeclareCliOptions): number {
  if (!isDirectory(sessionsDir)) {
    writeErr(`declare: not a directory: ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  const refuse = (message: string, code: number, cause: DeclareRefusalCause = "other"): number => {
    writeErr(`declare: refused -- ${message}\n`);
    options.onRefusal?.(message, cause);
    return code;
  };
  const target = resolveTargetSession(sessionsDir, options.sessionNumber);
  if (target === null) {
    return refuse(
      `no session has been started under ${sessionsDir}. Run \`session start\` first.`,
      EXIT_BOUNDARY,
    );
  }
  let text: string;
  try {
    text = readBody(options.task, options.taskFile);
  } catch (error) {
    if (error instanceof SanctionedWriteError) {
      return refuse(error.message, EXIT_USAGE);
    } else {
      writeErr(
        `declare: cannot read task -- ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      );
    }
    return EXIT_USAGE;
  }

  let lock: string;
  // A repository that declares no packaging has nothing to publish, so a
  // session in it is held whatever its plan said. Recorded on the
  // declaration, where the publish phase and the close already read, so
  // there is one record of why nothing shipped and no second rule.
  let holdReason = options.holdReason ?? null;
  if (holdReason === null && options.releasable) {
    // The sessions dir's own repository, not the cwd's: a typed declare and
    // a driven one both name the checkout they declare for.
    const config = loadConfig(undefined, repoRootFor(sessionsDir) ?? dirname(sessionsDir));
    let declared = true;
    try {
      // A tag release declares no pack and no push, and is packaging too.
      declared = loadTagRelease(config, null) !== null || loadDeclaration(config, null) !== null;
    } catch (error) {
      // A malformed block is packaging's to refuse, in its own words.
      if (!(error instanceof PackagingConfigError)) throw error;
    }
    if (!declared) holdReason = NOTHING_TO_PUBLISH;
  }
  const releasable = options.releasable && holdReason === null;
  try {
    lock = acquireLockWithTimeout(sessionsDir, `declare/${process.pid}`);
  } catch (error) {
    if (!(error instanceof LockContentionError)) throw error;
    return refuse(`lifecycle lock contention: ${error.message}`, EXIT_LOCK_CONTENTION);
  }
  try {
    declareSessionTask(sessionsDir, {
      sessionNumber: target,
      task: text,
      releasable,
      holdReason,
    });
  } catch (error) {
    if (!(error instanceof SanctionedWriteError)) throw error;
    return refuse(error.message, EXIT_USAGE, error instanceof WorkBegunError ? "tree" : "other");
  } finally {
    releaseLock(lock);
  }
  writeOut(
    `declare: session ${sessionDisplayNumber(target)} declared; releasable=` +
      `${releasable ? "yes" : "no"}` +
      `${holdReason ? `; held: ${holdReason}` : ""}.\n`,
  );
  return EXIT_OK;
}

// --- report ------------------------------------------------------------------

export interface ReportCliOptions {
  readonly seq: number;
  /** A step report: the four flags. Absent when the answer travels by file. */
  readonly stepId?: string | null;
  readonly status?: string | null;
  readonly files?: readonly string[] | null;
  readonly testsRun?: string | null;
  readonly notes?: string | null;
  /** A plan or a disposition: the JSON the engine wrote, validated and copied in. */
  readonly answerFile?: string | null;
  readonly sessionNumber?: number | null;
  /** `--next`: the caller goes on to ask for what follows, so a repeated answer is not a dead end. */
  readonly chained?: boolean;
}

/**
 * The engine's one verb under a driven session: answer the outstanding
 * step instruction.
 *
 * It shapes the flags into the report record, validates the shape, and
 * replaces `driver/report.json` whole. That is all it judges. Whether the
 * seq is the one outstanding, the step the one asked for, the files the
 * ones the tree changed and the check green is the driver's to decide, in
 * one place, with a rejection carrying the reasons -- a verb that judged
 * half of that would be a second implementation of the rule.
 *
 * What it does refuse is a report nobody asked for: no instruction is
 * outstanding, or the one that is asks for a different answer. A report
 * written into a session the driver is not running would be a file the
 * engine chose to put in the ledger, which is what this verb exists to
 * prevent.
 */
/** The session in flight, where a live loop is driving it; null where none is. */
export function liveLoopSession(sessionsDir: string): number | null {
  const current = inFlightSession(sessionsDir);
  const repoRoot = repoRootFor(sessionsDir);
  return current !== null && repoRoot !== null && loopAlive(repoRoot, current) ? current : null;
}

/** The session in flight, or null. */
function inFlightSession(sessionsDir: string): number | null {
  const raw = readRawSessionState(sessionsDir);
  const current = (raw ? derivedView(raw) : null)?.["currentSession"];
  return typeof current === "number" ? current : null;
}

/**
 * What an answer is told when no session is in flight to take it.
 *
 * The reader is an AI that was still working when its session ended -- a
 * person cancelled it, or it closed -- so the words are the ended session's
 * own `done` where it left one, and they never name `session start`: a loop
 * handed that command starts a session nobody asked for.
 */
function nothingToAnswer(sessionsDir: string): string {
  const nothing = `no session is in flight under ${sessionsDir}, so there is nothing to answer.`;
  const done = lastSessionDone(sessionsDir);
  return done === null ? `${nothing} Change nothing more, and tell the operator.` : `${nothing} ${String(done.ask)}`;
}

/**
 * The `done` the most recent session that ran left behind, or null.
 *
 * That session and only it: an older one's `done` says nothing about the
 * session an answer arriving now was for.
 */
export function lastSessionDone(sessionsDir: string): DriverInstruction | null {
  const repoRoot = repoRootFor(sessionsDir);
  if (repoRoot === null) return null;
  const rows = readRawSessionState(sessionsDir)?.["sessions"];
  const numbers = (Array.isArray(rows) ? rows : [])
    .map((row) => (isRecord(row) ? row["number"] : null))
    .filter((value): value is number => typeof value === "number")
    .sort((left, right) => right - left);
  for (const number of numbers) {
    let last;
    try {
      last = readInstruction(repoRoot, number);
    } catch {
      last = null;
    }
    if (last === null) continue;
    return last.kind === "done" && typeof last.ask === "string" ? last : null;
  }
  return null;
}

export function report(sessionsDir: string, options: ReportCliOptions): number {
  if (!isDirectory(sessionsDir)) {
    writeErr(`report: not a directory: ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  // The session in flight and no other: a report is an engine's answer, and
  // falling back to the last CLOSED session aimed an answer that arrived
  // after a cancellation at a session it never belonged to.
  const target = options.sessionNumber ?? inFlightSession(sessionsDir);
  if (target === null) {
    // Chained, the caller's next read says the same thing as an instruction:
    // the last answer of a session repeated after its close is told `done`.
    writeErr(`report: ${options.chained === true ? "" : "refused -- "}${nothingToAnswer(sessionsDir)}\n`);
    return options.chained === true ? EXIT_OK : EXIT_BOUNDARY;
  }
  const repoRoot = repoRootFromSessionsDir(sessionsDir);
  let instruction;
  try {
    instruction = readInstruction(repoRoot, target);
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    writeErr(`report: refused -- ${error.message}\n`);
    return EXIT_BOUNDARY;
  }
  if (instruction === null) {
    writeErr(
      `report: refused -- no instruction is outstanding for session ` +
        `${sessionDisplayNumber(target)}; a report answers one, and only the driver issues them.\n`,
    );
    return EXIT_BOUNDARY;
  }
  if (instruction.kind === "done") {
    writeErr(
      `report: refused -- instruction ${instruction.seq} says the session is over and ` +
        "expects nothing.\n",
    );
    return EXIT_BOUNDARY;
  }
  if (options.chained === true && options.seq < instruction.seq) {
    // A chained answer repeated after its process died, or one overtaken by an
    // interruption: the instruction it names is behind the one outstanding.
    // Nothing is written -- an answer is taken once -- and the caller asks for
    // what is owed now, which is what the process that died never printed.
    appendSupervision(repoRoot, target, {
      event: "chained-answer-repeated",
      got_seq: options.seq,
      outstanding_seq: instruction.seq,
    });
    writeErr(
      `report: instruction ${options.seq} is behind the outstanding one, ${instruction.seq}; ` +
        "nothing is accepted twice, and the instruction owed follows.\n",
    );
    return EXIT_OK;
  }
  if (options.seq !== instruction.seq) {
    appendSupervision(repoRoot, target, {
      event: "stale-report-refused",
      got_seq: options.seq,
      outstanding_seq: instruction.seq,
    });
    // The first lease fence. On 2026-09-02 two driver processes wrote one
    // run and phases were skipped silently; an answer that does not name
    // the OUTSTANDING instruction is a stale attempt, and a stale attempt
    // may not advance the run -- it is recorded here as refused instead.
    // A stale seq is ordinary under a loop -- an operator's Send re-issues the
    // instruction while the AI works -- and what is run next depends on who
    // is driving: the waiter under a loop, `next` only where there is none.
    writeErr(
      `report: refused -- the outstanding instruction is ${instruction.seq} ` +
        `and this report answers ${options.seq}. A stale attempt does not ` +
        "advance the run, and nothing already done is lost. " +
        (liveLoopSession(sessionsDir) !== null
          ? WAITER_IS_WHAT_IS_RUN
          : "Call `dabbler session next` and answer what it says.") +
        "\n",
    );
    return EXIT_BOUNDARY;
  }
  const answerFile = options.answerFile ?? null;
  if (answerFile === null) {
    if (instruction.answer_schema !== REPORT_SCHEMA) {
      writeErr(
        `report: refused -- instruction ${instruction.seq} asks for ` +
          `${String(instruction.answer_schema)}, not a step report; answer it with ` +
          "--answer-file <path to the JSON you wrote>.\n",
      );
      return EXIT_BOUNDARY;
    }
    const record = shapeReport(
      {
        sessionNumber: target,
        seq: options.seq,
        stepId: options.stepId ?? "",
        status: options.status ?? "",
        files: options.files ?? null,
        testsRun: options.testsRun ?? null,
        notes: options.notes ?? "",
      },
      nowIso(),
    );
    let written;
    try {
      written = writeReport(repoRoot, target, record);
    } catch (error) {
      if (!(error instanceof LedgerError)) throw error;
      writeErr(`report: refused -- ${error.message}\n`);
      return EXIT_USAGE;
    }
    writeOut(
      `report: session ${sessionDisplayNumber(target)} seq ${written.seq} ` +
        `(${written.step_id}, ${written.status}; ${written.files_changed.length} file(s)) written to ` +
        `${relative(repoRoot, reportPath(repoRoot, target)).replace(/\\/g, "/")}; ` +
        "the driver validates it next.\n",
    );
    return EXIT_OK;
  }

  // The plan and the dispositions travel by file: their substance is a
  // structure no flag grammar should try to spell, and the framework stamps
  // the members that are its own. The seq is judged here rather than by the
  // driver because a plan carries none for the driver to judge later.
  if (instruction.answer_schema === REPORT_SCHEMA) {
    writeErr(
      `report: refused -- instruction ${instruction.seq} asks for a step report; answer ` +
        "it with --step, --status, --files and --notes, not an answer file.\n",
    );
    return EXIT_BOUNDARY;
  }
  if (options.seq !== instruction.seq) {
    writeErr(
      `report: refused -- the answer names seq ${options.seq}; instruction ` +
        `${instruction.seq} is outstanding.\n`,
    );
    return EXIT_BOUNDARY;
  }
  const source = resolve(answerFile);
  const ledger = resolve(driverDir(repoRoot, target));
  if (source === ledger || source.startsWith(ledger + "\\") || source.startsWith(ledger + "/")) {
    writeErr(
      "report: refused -- the answer file is inside the driver's ledger, which only the " +
        "framework writes; write it elsewhere (for example .dabbler/scratch/) and name it here.\n",
    );
    return EXIT_BOUNDARY;
  }
  let answer: unknown;
  try {
    answer = JSON.parse(readFileSync(source, "utf8"));
  } catch (error) {
    writeErr(
      `report: cannot read the answer file -- ${
        error instanceof Error ? error.message : String(error)
      }\n`,
    );
    return EXIT_USAGE;
  }
  const isPlan = instruction.answer_schema === WORK_PLAN_SCHEMA;
  if (!isPlan && instruction.answer_schema !== DISPOSITION_SCHEMA) {
    writeErr(`report: refused -- instruction ${instruction.seq} names no answer this verb writes.\n`);
    return EXIT_BOUNDARY;
  }
  if (!isPlan && typeof instruction.round !== "number") {
    writeErr(
      `report: refused -- instruction ${instruction.seq} asks for dispositions but names ` +
        "no round; the driver issues that instruction, and this one was not its.\n",
    );
    return EXIT_BOUNDARY;
  }
  const stamps: Record<string, unknown> = isPlan
    ? { schema_version: DRIVER_SCHEMA_VERSION, session_number: target, recorded_at: nowIso() }
    : {
        schema_version: DRIVER_SCHEMA_VERSION,
        session_number: target,
        seq: instruction.seq,
        round: instruction.round,
        recorded_at: nowIso(),
      };
  let summary: string;
  try {
    if (isPlan) {
      const plan = writeWorkPlan(repoRoot, target, stampAnswer(answer, stamps, "the work plan"));
      const release = releaseOfPlan(plan, releaseMode(repoRoot));
      summary =
        `work plan (${plan.steps.length} step(s), ` +
        `${release.releasable ? "ships" : `held: ${release.holdReason}`}) ` +
        `written to ${relative(repoRoot, planPath(repoRoot, target)).replace(/\\/g, "/")}`;
    } else {
      const set = writeDispositions(repoRoot, target, stampAnswer(answer, stamps, "the disposition"));
      summary =
        `dispositions of round ${set.round} (${set.dispositions.length} finding(s)) written to ` +
        `${relative(repoRoot, dispositionsPath(repoRoot, target)).replace(/\\/g, "/")}`;
    }
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    writeErr(`report: refused -- ${error.message}\n`);
    return EXIT_USAGE;
  }
  writeOut(
    `report: session ${sessionDisplayNumber(target)} seq ${instruction.seq} answered; ` +
      `${summary}; the driver reads it next.\n`,
  );
  return EXIT_OK;
}

// --- interrupt ---------------------------------------------------------------

export interface InterruptCliOptions {
  readonly reason: string;
  readonly sessionNumber?: number | null;
  /** Halt the loop as well: `interrupted` on `run.json`, and a re-run continues. */
  readonly stop?: boolean;
}

/** The phases in which a step's instruction is still to come, so a message has one to travel with. */
const STEP_PHASES: ReadonlySet<string> = new Set(["plan", "work", "steps"]);

/**
 * End the engine's running invocation under a driven session. The one path
 * for every interrupter -- a person at the keyboard, the extension's Stop,
 * a gate that tripped -- and what it does is write a request the driver
 * polls: the driver ends the invocation, records it on the transcript, and
 * re-invokes the engine with the same instruction as `kind: interrupt`
 * carrying the reason. Nothing here touches the engine; only the process
 * that holds the child can end it, and the request is how it is told.
 *
 * Refused when nothing is being driven: no run, a run that completed, or
 * one that stopped -- an interrupt then has nothing to end, and a request
 * left lying would end the first invocation of the next re-run instead.
 *
 * Under the chained exchange no process holds the author, so nothing is
 * ended: the request waits for the next instruction, and the reply says so.
 */
export function interrupt(sessionsDir: string, options: InterruptCliOptions): number {
  if (!isDirectory(sessionsDir)) {
    writeErr(`interrupt: not a directory: ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  const reason = options.reason.trim();
  if (reason === "") {
    writeErr("interrupt: refused -- --reason is what the engine reads next; give one.\n");
    return EXIT_USAGE;
  }
  const target = resolveTargetSession(sessionsDir, options.sessionNumber);
  if (target === null) {
    writeErr(`interrupt: refused -- no session has been started under ${sessionsDir}.\n`);
    return EXIT_BOUNDARY;
  }
  const repoRoot = repoRootFromSessionsDir(sessionsDir);
  let run;
  try {
    run = readRun(repoRoot, target);
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    writeErr(`interrupt: refused -- ${error.message}\n`);
    return EXIT_BOUNDARY;
  }
  const number = sessionDisplayNumber(target);
  if (run === null) {
    writeErr(`interrupt: refused -- session ${number} was never driven; there is no run to reach.\n`);
    return EXIT_BOUNDARY;
  }
  if (run.phase === "complete") {
    writeErr(
      `interrupt: refused -- session ${number}'s drive completed and the session is closed; ` +
        "a message queued for it would never be read.\n",
    );
    return EXIT_BOUNDARY;
  }
  const stop = options.stop === true;
  // A stopped run is queued against rather than refused. There is no
  // invocation to end, but the request is exactly the coaching a person
  // wants to leave for the resume, and session 62 had no way to give it:
  // the engine was told to stop and nobody could tell it anything else.
  const waitsBehind = run.stop;
  // Only a loop holds an engine it can end. Under the chained exchange the
  // author is a person's own CLI, and a message has one way to it: the next
  // instruction -- which, once every step is answered, may never come.
  const chained = !stop && !waitsBehind && liveLoopSession(sessionsDir) !== target;
  requestInterrupt(repoRoot, target, reason, nowIso(), stop);
  writeOut(
    chained
      ? STEP_PHASES.has(run.phase)
        ? `interrupt: held for session ${number} (instruction ${run.seq}); nothing is ended, and it arrives ` +
          "first among the reasons of the next instruction.\n"
        : `interrupt: held for session ${number} (instruction ${run.seq}), but every step has been answered: ` +
          "it arrives only if the review raises another instruction, and is otherwise never read. To be " +
          "heard now, say it in the AI's own chat.\n"
      : waitsBehind
      ? stop
        ? `interrupt: session ${number} has already stopped (${waitsBehind.kind}); the request is held, and ` +
            "stopping a stopped loop changes nothing.\n"
        : `interrupt: held for session ${number}, which stopped (${waitsBehind.kind}); nothing is running to ` +
            "end, and it travels with the next instruction once the session is carried on.\n"
      : stop
        ? `interrupt: stop requested for session ${number} (instruction ${run.seq}); the driver ends the ` +
            "running invocation and halts -- the session stays in flight, and `session drive` re-runs it.\n"
        : `interrupt: requested for session ${number} (instruction ${run.seq}); the driver ends the ` +
            "running invocation and re-invokes the engine with the reason.\n",
  );
  return EXIT_OK;
}

// --- rebaseline --------------------------------------------------------------

export interface RebaselineCliOptions {
  readonly reason: string;
  readonly by?: string | null;
  readonly sessionNumber?: number | null;
}

/**
 * Report a repair made while the run was stopped, and move the baseline the
 * next report is measured against.
 *
 * There is a state the driven lifecycle reaches and had no edge out of:
 * *halted, being repaired*. A stop is answered by a person; the answer is
 * often a file; and the next report is judged against a tree the framework
 * snapshotted before that file existed -- so the report omits it and is
 * refused, correctly, every time. Session 66 met it and the only way past
 * was for the operator to fold the repair into a step it did not belong to.
 *
 * **What it costs, plainly.** Every accepted report in this framework is
 * measured against a tree the framework snapshotted itself, and that is its
 * strongest edge; this verb moves that tree without a step. So it records
 * rather than merely permits: the paths and the reason go to
 * `repairs.jsonl`, and that row is the whole of it. It asks nobody whether
 * the repair stands: no answer to that would change what the framework does
 * next, and a question whose answer changes nothing is not a decision.
 * What it does NOT do is weaken any judgement
 * downstream -- the standing verification round and the run of record both
 * bind to a tree this moves, so a repair after either is refused by exactly
 * the machinery that refuses any other post-verification change. The hole
 * is in the attribution of work, and only there.
 *
 * Refused while the run is not stopped: a running loop has steps, and a
 * step is how work is reported.
 */
/**
 * The repair, and only the repair, out of everything that moved since the
 * baseline: not the framework's bookkeeping under the sessions directory
 * or the machine's directory, and not the engine's settings the
 * registration edited -- so a two-file repair lists two paths.
 */
export function repairedPaths(
  repoRoot: string,
  sessionsDir: string,
  changed: readonly string[],
): string[] {
  const setRel = relative(repoRoot, resolve(sessionsDir)).split("\\").join("/");
  return changed.filter((path) => {
    const rel = path.split("\\").join("/");
    return (
      rel !== ".dabbler" &&
      !rel.startsWith(".dabbler/") &&
      !isFrameworkInstalledPath(rel) &&
      !isSessionBookkeeping(rel, setRel)
    );
  });
}

export function rebaseline(sessionsDir: string, options: RebaselineCliOptions): number {
  if (!isDirectory(sessionsDir)) {
    writeErr(`rebaseline: not a directory: ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  const reason = options.reason.trim();
  if (reason === "") {
    writeErr(
      "rebaseline: refused -- --reason is the whole of what this records; " +
        "say what was repaired.\n",
    );
    return EXIT_USAGE;
  }
  const target = resolveTargetSession(sessionsDir, options.sessionNumber ?? null);
  if (target === null) {
    writeErr(`rebaseline: refused -- no session has been started under ${sessionsDir}.\n`);
    return EXIT_BOUNDARY;
  }
  const repoRoot = repoRootFromSessionsDir(sessionsDir);
  const number = sessionDisplayNumber(target);

  let run;
  try {
    run = readRun(repoRoot, target);
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    writeErr(`rebaseline: refused -- ${error.message}\n`);
    return EXIT_BOUNDARY;
  }
  if (run === null) {
    writeErr(
      `rebaseline: refused -- session ${number} was never driven; a typed session reports ` +
        "its work by committing it.\n",
    );
    return EXIT_BOUNDARY;
  }
  if (!run.stop) {
    writeErr(
      `rebaseline: refused -- session ${number}'s run has not stopped, so the work belongs ` +
        "to the step in flight. Report it there; this verb exists for the repairs a person " +
        "makes while the loop is halted, which no step can carry.\n",
    );
    return EXIT_BOUNDARY;
  }

  const tree = snapshotWorktreeTree(repoRoot);
  if (tree === null) {
    writeErr("rebaseline: refused -- git could not snapshot the working tree.\n");
    return EXIT_GATE_FAILED;
  }
  const paths = repairedPaths(
    repoRoot,
    sessionsDir,
    run.baseline_tree ? (changedPathsBetween(repoRoot, run.baseline_tree, tree) ?? []) : [],
  );
  const by = (options.by ?? "").trim() || "the operator";

  let row;
  try {
    row = recordRepair(repoRoot, target, {
      reason,
      by,
      paths,
      baselineTree: tree,
      recordedAt: nowIso(),
    });
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    writeErr(`rebaseline: refused -- ${error.message}\n`);
    return EXIT_BOUNDARY;
  }

  writeOut(
    `rebaseline: session ${number}'s baseline moved to ${tree.slice(0, 12)}; ` +
      `${paths.length} path(s) recorded as repaired outside a step in repairs.jsonl; ` +
      "the close reports it. The stop is untouched -- re-run to carry on from it.\n" +
      `${dumps({ paths: row["paths"], reason })}\n`,
  );
  return EXIT_OK;
}

// --- plan --------------------------------------------------------------------

export interface PlanCliOptions {
  readonly body?: string | null;
  readonly bodyFile?: string | null;
}

/** Record the plan prose the numbered session list hangs off. */
export function plan(sessionsDir: string, options: PlanCliOptions): number {
  if (!isDirectory(sessionsDir)) {
    writeErr(`plan: not a directory: ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  let text: string;
  try {
    text = readBody(options.body, options.bodyFile);
  } catch (error) {
    if (error instanceof SanctionedWriteError) {
      writeErr(`plan: refused -- ${error.message}\n`);
    } else {
      writeErr(
        `plan: cannot read body -- ${
          error instanceof Error ? error.message : String(error)
        }\n`,
      );
    }
    return EXIT_USAGE;
  }
  let lock: string;
  try {
    lock = acquireLockWithTimeout(sessionsDir, `plan/${process.pid}`);
  } catch (error) {
    if (!(error instanceof LockContentionError)) throw error;
    writeErr(`plan: refused -- lifecycle lock contention: ${error.message}\n`);
    return EXIT_LOCK_CONTENTION;
  }
  try {
    recordProjectPlan(sessionsDir, text);
  } catch (error) {
    if (!(error instanceof SanctionedWriteError)) throw error;
    writeErr(`plan: refused -- ${error.message}\n`);
    return EXIT_USAGE;
  } finally {
    releaseLock(lock);
  }
  writeOut(`plan: recorded; ${basename(sessionsDir)}/${WORK_PLAN_FILENAME} rewritten.\n`);
  return EXIT_OK;
}

// --- plan amend --------------------------------------------------------------

export interface PlanAmendCliOptions {
  /** Null when the amendment moves the round cap rather than a step. */
  readonly stepId: string | null;
  readonly files: readonly string[] | null;
  /** A JSON file holding the step's checks, whole: `[{"argv": [...]}]`. */
  readonly checksFile: string | null;
  /**
   * The verification round cap this run should verify under, when that is
   * what is being amended. It is not typeable anywhere else.
   */
  readonly maxRounds: number | null;
  /**
   * The declared non-goal this amendment drops, when that is what is being
   * amended: a non-goal the work falsified. Drop-only -- nothing adds one.
   */
  readonly dropNonGoal?: string | null;
  readonly reason: string;
  readonly sessionNumber?: number | null;
}

/**
 * Amend what one not-yet-accepted step of the driven plan is measured
 * against, with the reason on the record beside who was working.
 *
 * The plan under `.dabbler/runs/` is machine-owned like everything else
 * there, and this is the one writer for it -- which is the point. Session 62
 * had an engine that knew exactly which step's files were wrong and no verb
 * that could change them, so the choice was to fail the step three times or
 * to edit the record by hand. Neither is a change anybody signed.
 */
export function planAmend(sessionsDir: string, options: PlanAmendCliOptions): number {
  if (!isDirectory(sessionsDir)) {
    writeErr(`plan amend: not a directory: ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  const target = resolveTargetSession(sessionsDir, options.sessionNumber ?? null);
  if (target === null) {
    writeErr(`plan amend: refused -- no session has been started under ${sessionsDir}.\n`);
    return EXIT_BOUNDARY;
  }
  const repoRoot = repoRootFromSessionsDir(sessionsDir);
  const by = whoIsWorking(sessionsDir, target);

  // The round cap is the one amendable thing that belongs to the RUN rather
  // than to a step: it is not a bar a step is measured against, it is how
  // many reviews the tree may still have. Same verb and same reason,
  // because it is the same kind of change -- and no gate reads either one.
  if (options.maxRounds !== null) {
    try {
      const run = amendRoundCap(
        repoRoot,
        target,
        { cap: options.maxRounds, reason: options.reason, by },
        nowIso(),
      );
      recordAmendment(sessionsDir, {
        sessionNumber: target,
        what: `the verification round cap, now ${String(run.verification?.max_rounds)}`,
        reason: options.reason.trim(),
        by,
      });
      writeOut(
        `plan amend: the verification round cap for session ${sessionDisplayNumber(target)} is ` +
          `now ${run.verification?.max_rounds}, amended by ${by}; the reason is on the ` +
          "record with the rounds already run, and no gate reads it.\n",
      );
      return EXIT_OK;
    } catch (error) {
      if (!(error instanceof LedgerError)) throw error;
      writeErr(`plan amend: refused -- ${error.message}\n`);
      return EXIT_BOUNDARY;
    }
  }

  // A non-goal the work falsified belongs to the plan's declaration rather
  // than to any one step, so it moves here and not through `--step`. The AI
  // runs it: the record is kept honest by what the reviewer is SHOWN, not by
  // who is allowed to type, and a stop whose only forward exit is to argue
  // that a true finding is false is a deadlock wearing a dispute's clothes.
  if (options.dropNonGoal !== null && options.dropNonGoal !== undefined) {
    try {
      dropNonGoal(
        repoRoot,
        target,
        { text: options.dropNonGoal, reason: options.reason, by },
        nowIso(),
      );
    } catch (error) {
      if (!(error instanceof LedgerError)) throw error;
      writeErr(`plan amend: refused -- ${error.message}\n`);
      return EXIT_BOUNDARY;
    }
    recordAmendment(sessionsDir, {
      sessionNumber: target,
      what: `the non-goal '${options.dropNonGoal.trim()}', dropped`,
      reason: options.reason.trim(),
      by,
    });
    writeOut(
      `plan amend: session ${sessionDisplayNumber(target)} is no longer held to the ` +
        `non-goal '${options.dropNonGoal.trim()}', dropped by ${by}; every round from ` +
        "here is shown the drop with its reason, and judges the reason.\n",
    );
    return EXIT_OK;
  }

  let checks: { argv: string[] }[] | null = null;
  if (options.checksFile !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(options.checksFile, "utf8"));
    } catch (error) {
      writeErr(
        `plan amend: refused -- ${options.checksFile} could not be read as JSON: ` +
          `${error instanceof Error ? error.message : String(error)}\n`,
      );
      return EXIT_USAGE;
    }
    if (!Array.isArray(parsed)) {
      writeErr(
        `plan amend: refused -- ${options.checksFile} must hold a list of checks, ` +
          'each `{"argv": ["<program>", "<argument>", ...]}`.\n',
      );
      return EXIT_USAGE;
    }
    checks = parsed as { argv: string[] }[];
  }

  let run;
  try {
    run = readRun(repoRoot, target);
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    writeErr(`plan amend: refused -- ${error.message}\n`);
    return EXIT_BOUNDARY;
  }

  try {
    amendPlanStep(
      repoRoot,
      target,
      {
        stepId: options.stepId as string,
        files: options.files,
        checks,
        reason: options.reason,
        by,
      },
      run?.accepted_steps ?? [],
      nowIso(),
    );
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    writeErr(`plan amend: refused -- ${error.message}\n`);
    return EXIT_BOUNDARY;
  }
  const moved = [options.files === null ? null : "files", checks === null ? null : "checks"]
    .filter((part): part is string => part !== null)
    .join(" and ");
  recordAmendment(sessionsDir, {
    sessionNumber: target,
    what: `step '${String(options.stepId)}': its ${moved}`,
    reason: options.reason.trim(),
    by,
  });
  writeOut(
    `plan amend: step '${options.stepId}' of session ${sessionDisplayNumber(target)} amended by ` +
      `${by}; the next instruction for it is measured against the new ` +
      "step, and what changed is on the record.\n",
  );
  return EXIT_OK;
}

// --- close -------------------------------------------------------------------

/**
 * What this session stepped over, one line each, for the close to print:
 * every repair made outside a step and every amendment of the plan, with
 * its reason. Read from `repairs.jsonl` and the activity log and from
 * nothing new, because nothing asks a person about either any more -- the
 * close is where a person reads what happened, so it is where these are
 * said. A session with none yields nothing.
 */
export function steppedOverLines(
  repoRoot: string | null,
  sessionsDir: string,
  sessionNumber: number,
): string[] {
  const lines: string[] = [];
  if (repoRoot) {
    for (const row of readRepairs(repoRoot, sessionNumber)) {
      const paths = Array.isArray(row["paths"]) ? row["paths"].length : 0;
      lines.push(
        `close: repaired outside a step: ${String(row["reason"])} ` +
          `(${String(row["by"])}; ${paths} path(s))`,
      );
    }
  }
  for (const entry of amendmentEntries(sessionsDir, sessionNumber)) {
    lines.push(`close: amended ${amendmentLine(entry)}`);
  }
  return lines;
}

function localOnly(repoRoot: string): boolean {
  return isFile(join(repoRoot, ".dabbler", "local-only"));
}

export interface CloseCliOptions {
  readonly dryRun?: boolean;
  readonly forced?: boolean;
  /** The caller is an engine (`callerIsEngine`); a forced close is refused it. */
  readonly engine?: boolean;
}

/**
 * Run the five gates and, unless this is a dry run, close the session.
 *
 * The order is the point: the state flips first, then the bookkeeping is
 * committed and pushed. A close that pushed before flipping would leave the
 * remote holding a session the record still calls in flight.
 */
export function close(sessionsDir: string, options: CloseCliOptions = {}): number {
  const dryRun = options.dryRun === true;
  const forced = options.forced === true;
  if (!isDirectory(sessionsDir)) {
    writeErr(`close: not a directory: ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  // A forced close skips the working-tree, push and freshness gates and
  // promotes every open session of the plan. A beta session of 2026-09-20
  // ended with uncommitted code by an engine's own hand; an engine that asks
  // is refused as it is at a forced cancel, and nothing is written. The
  // driver's own close is never forced, so a driven close is untouched.
  if (forced && options.engine === true) {
    writeErr(
      `close: ${isAPersonsVerb(
        "close --force",
        "closes every open session of the plan past its bookkeeping gates",
        "a person forces a close from an interactive terminal of their own, and only to abandon a whole plan",
      )}\n`,
    );
    return EXIT_BOUNDARY;
  }
  let lock: string;
  try {
    // With the timeout, not a single attempt: a driven close runs as a job
    // while the driver keeps polling, and every poll saves the run under
    // this same lock for a moment. A close that met that moment refused at
    // once and paused the session at its last phase -- once in a hundred
    // walks on a loaded machine, and undiagnosable until the walk showed
    // the job's log. A close can wait the seconds the other verbs wait.
    lock = acquireLockWithTimeout(sessionsDir, `close_session/${process.pid}`);
  } catch (error) {
    if (!(error instanceof LockContentionError)) throw error;
    writeErr(`close: refused -- ${error.message}\n`);
    return EXIT_BOUNDARY;
  }
  try {
    const raw = readRawSessionState(sessionsDir);
    const normalized = raw ? derivedView(raw) : null;
    const current = (normalized?.["currentSession"] ?? null) as number | null;
    if (current === null) {
      const status = normalized?.["status"] ?? null;
      if (status === STATUS_COMPLETE) {
        writeOut("close: already closed (noop).\n");
        return EXIT_OK;
      }
      writeErr(
        "close: refused -- no session is in flight under " +
          `${sessionsDir} (status=${pythonRepr(status)}).\n`,
      );
      return EXIT_BOUNDARY;
    }

    // Before the gates and not as one of them. A gate answers a question
    // about evidence that exists; this is a refusal to produce evidence at
    // all, and `--force` bypasses bookkeeping gates -- it must not become a
    // way past this.
    const switched = refuseIfResolvingFromSource(repoRootFor(sessionsDir), "the close");
    if (switched !== null) {
      writeErr(`close: refused -- ${switched}\n`);
      return EXIT_GATE_FAILED;
    }
    // Measured here and not taken from the driver: the close is the verb that
    // passes the evidence gates, so it reads the same fact the driver did.
    const noChange = sessionChangedNothing(sessionsDir);
    const results = runGates(sessionsDir, { forced, noChange });
    const width = Math.max(...results.map((row) => row.name.length));
    for (const row of results) {
      // One bullet per gate, a level in from the close's own sentences: the
      // rows are the detail under the close, and in the framework's terminal
      // they sit under the line that announced the close job. What the row
      // SAYS is `renderGateRow`'s, shared with the packaging run, because a
      // gate reads the same wherever it is shown or the two screens disagree
      // about the same fact.
      writeOut(`    ${renderGateRow(row, width)}\n`);
    }
    const failed = results.filter((row) => !row.passed);
    if (dryRun) {
      writeOut(
        `close --dry-run: ${results.length - failed.length}/` +
          `${results.length} gates pass; nothing written.\n`,
      );
      return failed.length === 0 ? EXIT_OK : EXIT_GATE_FAILED;
    }
    if (failed.length > 0) {
      writeErr(`close: refused -- ${failed.length} gate(s) failed.\n`);
      return EXIT_GATE_FAILED;
    }

    const repoRoot = repoRootFor(sessionsDir);
    let verdict: unknown = null;
    if (repoRoot) {
      const row = latestRound(repoRoot, current);
      // The gate's decision, not the reviewer's word: the row keeps that.
      if (row && row["verdict"] !== null && row["verdict"] !== undefined) {
        verdict = sessionVerdict(String(row["verdict"]), row["blocking"] !== false);
      }
    }

    flipStateToClosed(sessionsDir, {
      verdict: verdict === null || verdict === undefined ? null : String(verdict),
      forced,
      noChange,
    });
    writeOut(
      `close: session ${sessionDisplayNumber(current)} of ` +
        `${basename(sessionsDir)} closed` +
        (verdict ? ` (${String(verdict)})` : "") +
        ".\n",
    );
    for (const line of steppedOverLines(repoRoot, sessionsDir, current as number)) {
      writeOut(`${line}\n`);
    }

    if (repoRoot) {
      const bookkeeping = SET_BOOKKEEPING_COMMIT_BASENAMES.map((name) =>
        join(sessionsDir, name),
      ).filter(isFile);
      if (bookkeeping.length > 0) {
        runGit(repoRoot, ["add", "--", ...bookkeeping]);
      }
      const committed = runGit(repoRoot, [
        "commit",
        "-m",
        `Close session ${current} of ${basename(sessionsDir)}`,
      ]);
      if (
        committed.code !== 0 &&
        !committed.stderr.toLowerCase().includes("nothing to commit")
      ) {
        writeErr(`close: state flipped but commit failed: ${committed.stderr}\n`);
        return EXIT_GATE_FAILED;
      }
      if (!localOnly(repoRoot)) {
        const pushed = runGit(repoRoot, ["push"]);
        if (pushed.code !== 0) {
          writeErr(
            "close: state flipped and committed but push " +
              `failed: ${pushed.stderr}. Run \`git push\` manually.\n`,
          );
          return EXIT_GATE_FAILED;
        }
        // The round refs ride with the branch or the baselines this session
        // recorded stay on this machine: a bare push carries them only on a
        // clone that `ensureRoundRefspecs` has configured, and the close does
        // not assume that.
        const refs = pushRoundRefs(repoRoot, current);
        if (refs.error) {
          writeErr(
            "close: state flipped, committed and pushed, but " +
              `the round refs did not push: ${refs.error}. Run: git ` +
              `push ${upstreamRemote(repoRoot)} ` +
              `'${ROUND_REF_NAMESPACE}/s${current}/*:` +
              `${ROUND_REF_NAMESPACE}/s${current}/*'\n`,
          );
          return EXIT_GATE_FAILED;
        }
        if (refs.pushed.length > 0) {
          writeOut(
            `close: pushed ${refs.pushed.length} round ref(s) under ` +
              `${ROUND_REF_NAMESPACE}/s${current}/.\n`,
          );
        }
      }
    }
    writeWhatComesNext(sessionsDir);
    return EXIT_OK;
  } finally {
    releaseLock(lock);
  }
}

/**
 * What comes next, printed at the close.
 *
 * The close is the exact moment the operator asks "what now", and until this
 * existed the answer lived in a source comment: the ledger grows to the plan
 * at the next registration, so a planning session whose whole deliverable was
 * new headings closed on a record that said the project was finished. Reading
 * the projection rather than re-deriving keeps one answer to the question --
 * the Explorer renders the same two numbers.
 *
 * Best-effort by construction. A close that has already flipped the state and
 * pushed its bookkeeping must not fail because a courtesy line could not be
 * computed, so an unreadable plan or projection prints nothing at all.
 */
function writeWhatComesNext(sessionsDir: string): void {
  let repository: Record<string, unknown>;
  let rows: unknown;
  try {
    const projection = buildProjection(sessionsDir);
    repository = (projection["repository"] ?? {}) as Record<string, unknown>;
    rows = projection["sessions"];
  } catch {
    return;
  }
  const next = repository["nextSession"];
  if (!Number.isInteger(next)) {
    writeOut("close: no session is left to run; the plan declares no more.\n");
    return;
  }
  const planned = Number(repository["plannedSessions"] ?? 0);
  const total = repository["totalSessions"];
  const completed = Number(repository["sessionsCompleted"] ?? 0);
  const remaining =
    typeof total === "number" ? Math.max(total - completed, 0) : null;
  // "Registers" and "starts" are not the same act under the vocabulary this
  // projection now uses: a `not-started` row is already in the ledger, and
  // only a `planned` one is written by the next start. Saying "registers" for
  // both would contradict the distinction one line above it.
  const sessions = Array.isArray(rows) ? rows : [];
  const nextIsPlanned =
    sessions.find((s) => isRecord(s) && s["number"] === next)?.["status"] ===
    "planned";
  writeOut(
    `close: next is session ${sessionDisplayNumber(next)}` +
      (remaining === null ? "" : ` -- ${remaining} of ${total} left to run`) +
      (planned > 0
        ? `, ${planned} of them declared by the plan and not yet registered`
        : "") +
      `. It ${nextIsPlanned ? "registers" : "starts"} on the next ` +
      "`dabbler session start`.\n",
  );
}

// --- migrate (a set-scoped repository, carried forward exactly once) ----------

const MIGRATED_FILES: readonly (readonly [string, string])[] = [
  ["activity-log.json", "activity-log.json"],
  ["change-log.md", "change-log.md"],
  ["decisions-log.md", "decisions-log.md"],
  ["project-work-plan.md", "project-work-plan.md"],
  ["spec.md", "session-plan.md"],
];

/**
 * The legacy ledger as v5 session records.
 *
 * A cancelled set becomes cancelled sessions. That is the only honest
 * reading: the set said this work would not run, and after the collapse
 * there is nowhere but the session to say so.
 */
function v5SessionsFromLegacy(
  normalized: Record<string, unknown>,
): Record<string, unknown>[] {
  const setCancelled = canonicalizeStatus(normalized["status"]) === STATUS_CANCELLED;
  const sessions: Record<string, unknown>[] = [];
  const entries = normalized["sessions"];
  for (const entry of Array.isArray(entries) ? entries : []) {
    const source = isRecord(entry) ? entry : {};
    const record: Record<string, unknown> = {
      number: source["number"] ?? null,
      title: source["title"] || `Session ${pythonStr(source["number"])}`,
      status: canonicalizeStatus(source["status"]),
    };
    for (const key of [
      "startedAt",
      "completedAt",
      "orchestrator",
      "verificationVerdict",
      "verification",
      "type",
    ]) {
      if (source[key] !== null && source[key] !== undefined) record[key] = source[key];
    }
    for (const key of ["startedAt", "completedAt", "orchestrator", "verificationVerdict"]) {
      if (!(key in record)) record[key] = null;
    }
    if (setCancelled && record["status"] !== STATUS_COMPLETE) {
      record["preCancelStatus"] = record["status"];
      record["status"] = STATUS_CANCELLED;
    }
    sessions.push(record);
  }
  return sessions;
}

export interface MigrateCliOptions {
  readonly dryRun?: boolean;
}

/**
 * Carry one set-scoped directory forward into the repository's sessions
 * root.
 *
 * Run once, and refused once the root carries a record: a second migration
 * would fold a second set's numbering over the first, and two sets' session
 * 3 are not the same session. Everything it writes it writes through the
 * sanctioned writer, so the state-writes ledger covers the migrated file
 * exactly as it covers a registration.
 */
export function migrate(
  legacySetDir: string,
  sessionsDir: string,
  options: MigrateCliOptions = {},
): number {
  const dryRun = options.dryRun === true;
  if (!isDirectory(legacySetDir)) {
    writeErr(`migrate: not a directory: ${legacySetDir}\n`);
    return EXIT_USAGE;
  }
  const raw = readRawLegacyState(legacySetDir);
  if (raw === null) {
    writeErr(`migrate: no session-state.json under ${legacySetDir}\n`);
    return EXIT_USAGE;
  }
  if (readRawSessionState(sessionsDir) !== null) {
    writeErr(
      `migrate: refused -- ${sessionsDir} already carries a session ` +
        "record. A repository is migrated once; a second set folded " +
        "over the first would renumber work that is already closed.\n",
    );
    return EXIT_BOUNDARY;
  }

  const normalized = normalizeLegacyState(raw, join(legacySetDir, "spec.md"));
  const sessions = v5SessionsFromLegacy(normalized);
  if (sessions.length === 0) {
    writeErr(`migrate: ${legacySetDir} declares no sessions\n`);
    return EXIT_USAGE;
  }
  const state: Record<string, unknown> = {
    schemaVersion: SCHEMA_VERSION,
    sessions,
  };
  if ("forceClosed" in raw) state["forceClosed"] = raw["forceClosed"];

  const repoRoot = repoRootFor(dirname(sessionsDir)) ?? repoRootFor(legacySetDir);
  const runsFrom = repoRoot
    ? join(repoRoot, RUNS_DIRNAME, basename(legacySetDir))
    : null;
  const moves = MIGRATED_FILES.filter(([src]) =>
    isFile(join(legacySetDir, src)),
  ).map(([src, dst]) => [join(legacySetDir, src), join(sessionsDir, dst)] as const);

  if (dryRun) {
    writeOut(
      dumps(
        {
          sessions: sessions.length,
          files: moves.map(([, dst]) => relative(sessionsDir, dst)),
          runs: runsFrom !== null && isDirectory(runsFrom) ? runsFrom : null,
        },
        { indent: 2 },
      ) + "\n",
    );
    return EXIT_OK;
  }

  mkdirSync(sessionsDir, { recursive: true });
  for (const [src, dst] of moves) copyPreservingTimes(src, dst);
  // The ledger moves with the sessions it describes: rounds recorded under
  // the old address are the same rounds, and leaving them behind would make
  // every migrated session look unverified.
  if (runsFrom !== null && isDirectory(runsFrom)) {
    const runsTo = join(repoRoot!, RUNS_DIRNAME);
    for (const name of readdirSync(runsFrom)) {
      const target = join(runsTo, name);
      if (existsSync(target)) continue;
      moveEntry(join(runsFrom, name), target);
    }
    try {
      rmdirSync(runsFrom);
    } catch {
      // Not empty, or already gone; either way the move stands.
    }
  }
  try {
    validateAndWriteState(sessionsDir, state);
  } catch (error) {
    if (!(error instanceof SessionStateInvariantError)) throw error;
    writeErr(`migrate: refused -- ${error.message}\n`);
    return EXIT_GATE_FAILED;
  }
  writeOut(dumps({ sessions: sessions.length, sessionsDir }) + "\n");
  return EXIT_OK;
}

/** `shutil.copy2`: the bytes, and the times that say when they were written. */
function copyPreservingTimes(src: string, dst: string): void {
  copyFileSync(src, dst);
  const stats = statSync(src);
  utimesSync(dst, stats.atime, stats.mtime);
}

/** `shutil.move`: a rename where the filesystem allows one, a copy where not. */
function moveEntry(src: string, dst: string): void {
  try {
    renameSync(src, dst);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EXDEV") throw error;
  }
  cpSync(src, dst, { recursive: true, preserveTimestamps: true });
  rmSync(src, { recursive: true, force: true });
}

// --- cancel / restore ---------------------------------------------------------

const RESTORABLE_STATUSES: readonly unknown[] = [
  STATUS_NOT_STARTED,
  STATUS_IN_PROGRESS,
  STATUS_COMPLETE,
];

/** A boundary rule's answer: the words it refuses with, or nothing. */
export interface BoundaryRuling {
  readonly refusal: string | null;
  readonly exitCode: number;
}

const ALLOWED: BoundaryRuling = { refusal: null, exitCode: EXIT_OK };

/**
 * Whether this session may be cancelled, decided from its own record.
 *
 * A session already cancelled is settled. One in flight may be cancelled by
 * whoever is working it, with the reason the verb requires: the cancellation
 * unwinds nothing, so the tree is left as it was, and the loop reads the
 * ledger before every act it cannot take back. Requiring `--force` here --
 * a person's verb -- left the author of a session that should not go on
 * with no way to end it, and the beta test's AI ended one by other means.
 */
export function judgeCancellation(
  record: Record<string, unknown>,
  sessionNumber: number,
): BoundaryRuling {
  const prior = canonicalizeStatus(record["status"]);
  if (prior === STATUS_CANCELLED) {
    return {
      refusal: `session ${sessionDisplayNumber(sessionNumber)} is already cancelled`,
      exitCode: EXIT_BOUNDARY,
    };
  }
  return ALLOWED;
}

/**
 * Write the cancellation onto the record.
 *
 * The status it had is kept, because a restore has to have something to go
 * back to; a status outside the restorable set is not kept, and the restore
 * then falls back rather than reviving a state that was never a session's.
 */
export function applyCancellation(
  record: Record<string, unknown>,
  reason: string,
  at: string,
): void {
  const prior = canonicalizeStatus(record["status"]);
  if (RESTORABLE_STATUSES.includes(prior)) record["preCancelStatus"] = prior;
  record["status"] = STATUS_CANCELLED;
  record["cancelledReason"] = reason;
  record["cancelledAt"] = at;
}

/** Whether there is a cancellation to undo. */
export function judgeRestoration(
  record: Record<string, unknown>,
  sessionNumber: number,
): BoundaryRuling {
  if (canonicalizeStatus(record["status"]) === STATUS_CANCELLED) return ALLOWED;
  return {
    refusal:
      `refused -- session ${sessionDisplayNumber(sessionNumber)} is not ` +
      "cancelled; there is nothing to restore.",
    exitCode: EXIT_BOUNDARY,
  };
}

/**
 * Undo the cancellation, and answer with the status the session went back
 * to. A record that kept no prior status falls back to not-started rather
 * than to whatever it happens to hold.
 */
export function applyRestoration(
  record: Record<string, unknown>,
  reason: string,
): unknown {
  let prior: unknown = record["preCancelStatus"] ?? null;
  delete record["preCancelStatus"];
  if (!RESTORABLE_STATUSES.includes(prior)) prior = STATUS_NOT_STARTED;
  record["status"] = prior;
  delete record["cancelledReason"];
  delete record["cancelledAt"];
  if (reason) record["restoredReason"] = reason;
  return prior;
}

function sessionRecord(
  state: Record<string, unknown>,
  number: number,
): Record<string, unknown> | null {
  const sessions = state["sessions"];
  for (const record of Array.isArray(sessions) ? sessions : []) {
    if (isRecord(record) && record["number"] === number) return record;
  }
  return null;
}

/**
 * Cancel one session.
 *
 * A repository has no set to cancel, so what is cancelled is the piece of
 * work, and the reason rides on the session record rather than in a marker
 * file beside it.
 */
/**
 * What an engine's shell carries and a person's does not. `DABBLER_DRIVEN`
 * is a driver job's and `DABBLER_ENGINE_TERMINAL` is set by the extension on
 * the terminal it opens for the AI's CLI, so it holds for an engine nobody
 * measured; the rest are each vendor's own, as read in
 * `docs/design/engine-environment-markers.md`. Exact names and never a
 * prefix: a person's environment may hold a `COPILOT_*` variable of its own.
 */
export const ENGINE_MARKERS: readonly string[] = [
  "DABBLER_DRIVEN",
  "DABBLER_ENGINE_TERMINAL",
  "CLAUDECODE",
  "COPILOT_CLI",
  "COPILOT_AGENT_SESSION_ID",
];

/**
 * Whether the caller is an engine rather than a person at a terminal. A
 * person's shell carries none of the markers, and the extension's
 * in-process calls are a person's clicks.
 */
export function callerIsEngine(env: NodeJS.ProcessEnv = process.env): boolean {
  return ENGINE_MARKERS.some((name) => Boolean(env[name]));
}

/** How many of the extension's in-process calls are running: each is a person's click. */
let clicks = 0;

/**
 * Run `work` as a person's click. The extension's in-process calls pass
 * through no shell and no terminal, and are a person's by construction: a
 * button was pressed, and a modal confirmed it.
 */
export async function asAPersonsClick<T>(work: () => T | Promise<T>): Promise<T> {
  clicks += 1;
  try {
    return await work();
  } finally {
    clicks -= 1;
  }
}

/**
 * Whether a person is where this command was run -- asked of the verbs that
 * are a person's, and answered by what is THERE rather than by what is
 * absent. A click is a person. Otherwise an engine's marker says an engine;
 * and with no marker at all, a person is someone at an interactive terminal,
 * because an AI's tool runs its commands with none (measured for Claude Code,
 * `docs/design/engine-environment-markers.md`). A list of markers cannot
 * cover an engine nobody has measured; this does not need to.
 */
export function personIsPresent(
  env: NodeJS.ProcessEnv = process.env,
  interactive: boolean = process.stdin.isTTY === true,
): boolean {
  if (clicks > 0) return true;
  return !callerIsEngine(env) && interactive;
}

/**
 * The refusal an engine meets at a verb that is a person's: a forced cancel,
 * a forced close, a held release. One sentence for all of them, so the AI is
 * told the same thing wherever it reaches for one, and told what to do
 * instead.
 */
export function isAPersonsVerb(
  verb: string,
  does: string,
  how: string,
  instead = "Report the step blocked and say why",
): string {
  return (
    `refused -- \`session ${verb}\` is a person's verb, never the engine's: it ` +
    `${does}, and that judgement is not the engine's to make. ${instead}; ${how}.`
  );
}

/** The framework's own files a cancellation commits, and nothing else. */
const CANCEL_COMMIT_BASENAMES: readonly string[] = [
  "sessions.json",
  "activity-log.json",
  "project-work-plan.md",
];

/**
 * Commit the cancellation's own record: those of the three files that exist
 * and are changed, by path, so anything else uncommitted -- staged or not --
 * is left exactly as it was. Nothing is pushed. Returns why the commit
 * failed, or null.
 */
function commitCancellation(sessionsDir: string, sessionNumber: number): string | null {
  const repoRoot = repoRootFor(sessionsDir);
  if (repoRoot === null) return null;
  const paths = CANCEL_COMMIT_BASENAMES.map((name) => resolve(sessionsDir, name)).filter(isFile);
  if (paths.length === 0) return null;
  const changed = runGit(repoRoot, ["status", "--porcelain", "--", ...paths]);
  if (changed.code !== 0 || changed.stdout.trim() === "") return null;
  runGit(repoRoot, ["add", "--", ...paths]);
  const committed = runGit(repoRoot, [
    "commit",
    "-m",
    `Cancel session ${sessionNumber} of ${basename(sessionsDir)}`,
    "--",
    ...paths,
  ]);
  if (committed.code !== 0 && !`${committed.stdout}${committed.stderr}`.toLowerCase().includes("nothing to commit")) {
    return committed.stderr.trim() || committed.stdout.trim();
  }
  return null;
}

export function cancel(
  sessionsDir: string,
  sessionNumber: number,
  options: { readonly reason: string; readonly force?: boolean; readonly engine?: boolean },
): number {
  if (!isDirectory(sessionsDir)) {
    writeErr(`cancel: not a directory: ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  // A forced cancel is a person's verb. The proof of 2026-09-08 saw an
  // engine cancel its own registration and drive another folder's session
  // from the wrong window; an engine that asks is refused with the way a
  // person does it, and nothing is written.
  if (options.force === true && options.engine === true) {
    writeErr(
      `cancel: ${isAPersonsVerb(
        "cancel --force",
        "ends a session in flight",
        "a person cancels from the Work Explorer (Cancel Session) or an interactive terminal of their own",
        // The engine has a form of its own, and an engine told only to report
        // `blocked` paused a session its operator had asked it to cancel.
        'The session you are working is yours to cancel without it: `dabbler session cancel <its number> --reason "<why>"`',
      )}\n`,
    );
    return EXIT_BOUNDARY;
  }
  let lock: string;
  try {
    lock = acquireLock(sessionsDir, `cancel/${process.pid}`);
  } catch (error) {
    if (!(error instanceof LockContentionError)) throw error;
    writeErr(`cancel: refused -- ${error.message}\n`);
    return EXIT_BOUNDARY;
  }
  try {
    const raw = readRawSessionState(sessionsDir);
    if (raw === null) {
      writeErr(`cancel: no session record under ${sessionsDir}\n`);
      return EXIT_USAGE;
    }
    const state = onDiskState(raw);
    const record = sessionRecord(state, sessionNumber);
    if (record === null) {
      writeErr(
        `cancel: no session ${sessionDisplayNumber(sessionNumber)} on record\n`,
      );
      return EXIT_USAGE;
    }
    // An engine ends the session it is working, and no other: a number it got
    // wrong would otherwise cancel planned or finished work it was never given.
    // Whose session a person cancels is theirs to say, as it always was.
    const working = derivedView(raw)?.["currentSession"];
    if (options.engine === true && working !== sessionNumber) {
      writeErr(
        `cancel: refused -- session ${sessionDisplayNumber(sessionNumber)} is not the session in flight` +
          (typeof working === "number" ? ` (${sessionDisplayNumber(working)} is)` : "") +
          ", and an engine cancels only the session it is working. Cancelling another is a person's: the " +
          "Work Explorer (Cancel Session), or an interactive terminal of their own.\n",
      );
      return EXIT_BOUNDARY;
    }
    const ruling = judgeCancellation(record, sessionNumber);
    if (ruling.refusal !== null) {
      writeErr(`cancel: ${ruling.refusal}\n`);
      return ruling.exitCode;
    }
    applyCancellation(record, options.reason, nowIsoSeconds());
    try {
      validateAndWriteState(sessionsDir, state);
    } catch (error) {
      if (!(error instanceof SessionStateInvariantError)) throw error;
      writeErr(`cancel: refused -- ${error.message}\n`);
      return EXIT_GATE_FAILED;
    }
    const committed = commitCancellation(sessionsDir, sessionNumber);
    if (committed !== null) {
      writeErr(`cancel: state written but commit failed: ${committed}\n`);
      return EXIT_GATE_FAILED;
    }
    writeOut(`${dumps({ session: sessionNumber, status: STATUS_CANCELLED })}\n`);
    // Nothing is unwound, so what the session had changed is still in the
    // tree -- said here, where the person who cancelled is looking, rather
    // than found at the next start's refusal.
    const left = materialWorktreeChanges(sessionsDir);
    if (left.error === "" && left.paths.length > 0) {
      writeErr(
        `cancel: left uncommitted, exactly as it was: ${previewPaths(left.paths)}. The next ` +
          "`session start` offers to commit it (--commit-changes) or to undo it, keeping a copy " +
          "(--undo-changes).\n",
      );
    }
    return EXIT_OK;
  } finally {
    releaseLock(lock);
  }
}

/** Undo a cancellation, back to the status the session carried before it. */
export function restore(
  sessionsDir: string,
  sessionNumber: number,
  options: { readonly reason?: string } = {},
): number {
  const reason = options.reason ?? "";
  if (!isDirectory(sessionsDir)) {
    writeErr(`restore: not a directory: ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  let lock: string;
  try {
    lock = acquireLock(sessionsDir, `restore/${process.pid}`);
  } catch (error) {
    if (!(error instanceof LockContentionError)) throw error;
    writeErr(`restore: refused -- ${error.message}\n`);
    return EXIT_BOUNDARY;
  }
  try {
    const raw = readRawSessionState(sessionsDir);
    if (raw === null) {
      writeErr(`restore: no session record under ${sessionsDir}\n`);
      return EXIT_USAGE;
    }
    const state = onDiskState(raw);
    const record = sessionRecord(state, sessionNumber);
    if (record === null) {
      writeErr(
        `restore: no session ${sessionDisplayNumber(sessionNumber)} on record\n`,
      );
      return EXIT_USAGE;
    }
    const ruling = judgeRestoration(record, sessionNumber);
    if (ruling.refusal !== null) {
      writeErr(`restore: ${ruling.refusal}\n`);
      return ruling.exitCode;
    }
    const prior = applyRestoration(record, reason);
    try {
      validateAndWriteState(sessionsDir, state);
    } catch (error) {
      if (!(error instanceof SessionStateInvariantError)) throw error;
      writeErr(`restore: refused -- ${error.message}\n`);
      return EXIT_GATE_FAILED;
    }
    writeOut(`${dumps({ session: sessionNumber, status: prior })}\n`);
    return EXIT_OK;
  } finally {
    releaseLock(lock);
  }
}

// --- hold-release --------------------------------------------------------------

export interface HoldReleaseCliOptions {
  readonly reason: string;
  /** The caller is an engine (`callerIsEngine`); holding a release is a person's. */
  readonly engine?: boolean;
}

/**
 * Hold the release of the session in flight, for a person's reason.
 *
 * What a declaration decides before the work nothing else could change, so a
 * release that could not succeed -- no credential, a feed that refuses, a
 * declaration made by mistake -- left a session two exits, publish or cancel.
 * This is the third: the session closes, correctly, as held. One way only,
 * and refused once something has been published, because what reached a feed
 * is not held by saying so.
 */
export function holdRelease(sessionsDir: string, options: HoldReleaseCliOptions): number {
  if (!isDirectory(sessionsDir)) {
    writeErr(`hold-release: not a directory: ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  if (options.engine === true) {
    writeErr(
      `hold-release: ${isAPersonsVerb(
        "hold-release",
        "decides after the work that a session its plan declared releasable publishes nothing",
        "a person holds a release from an interactive terminal of their own",
      )}\n`,
    );
    return EXIT_BOUNDARY;
  }
  const reason = options.reason.trim();
  if (reason === "") {
    writeErr("hold-release: --reason carries why this session publishes nothing\n");
    return EXIT_USAGE;
  }
  let lock: string;
  try {
    lock = acquireLockWithTimeout(sessionsDir, `hold-release/${process.pid}`);
  } catch (error) {
    if (!(error instanceof LockContentionError)) throw error;
    writeErr(`hold-release: refused -- ${error.message}\n`);
    return EXIT_LOCK_CONTENTION;
  }
  try {
    const raw = readRawSessionState(sessionsDir);
    const current = ((raw ? derivedView(raw) : null)?.["currentSession"] ?? null) as number | null;
    if (current === null) {
      writeErr(`hold-release: refused -- no session is in flight under ${sessionsDir}.\n`);
      return EXIT_BOUNDARY;
    }
    const repoRoot = repoRootFor(sessionsDir);
    if (
      repoRoot !== null &&
      readPackaging(repoRoot, current).some((row) => row["outcome"] === OUTCOME_PUBLISHED)
    ) {
      writeErr(
        `hold-release: refused -- session ${sessionDisplayNumber(current)} has already published; ` +
          "what reached a feed is not held by saying so.\n",
      );
      return EXIT_BOUNDARY;
    }
    const standing = releaseHold(sessionsDir, current);
    if (standing !== null) {
      writeOut(`hold-release: session ${sessionDisplayNumber(current)} is already ${standing}.\n`);
      return EXIT_OK;
    }
    recordReleaseHold(sessionsDir, { sessionNumber: current, reason, by: "the operator" });
    writeOut(
      `hold-release: session ${sessionDisplayNumber(current)} publishes nothing: ${reason}. The ` +
        "session closes as held, and the close says so.\n",
    );
    return EXIT_OK;
  } finally {
    releaseLock(lock);
  }
}

export { DECIDERS, SESSION_PLAN_FILENAME };

