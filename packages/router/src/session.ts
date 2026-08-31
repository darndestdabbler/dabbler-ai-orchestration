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
import { loadConfig } from "./config.ts";
import { freshnessWarnings } from "./discovery.ts";
import {
  ROUND_REF_NAMESPACE,
  SESSION_PLAN_FILENAME,
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
  dispositionsPath,
  driverDir,
  planPath,
  readInstruction,
  readRun,
  reportPath,
  requestInterrupt,
  shapeReport,
  stampAnswer,
  writeDispositions,
  writeReport,
  writeWorkPlan,
} from "./driver.ts";
import { SET_BOOKKEEPING_COMMIT_BASENAMES, governingConfig, runGates } from "./gates.ts";
import { refuseIfResolvingFromSource } from "./resolution.ts";
import { detectEcosystems } from "./bootstrap/detect.ts";
import { PROJECT_CONFIG_FILENAME } from "./config.ts";
import { refreshOwedDecisions } from "./owedDecisions.ts";
import { loadSuitesChecked } from "./testEvidence.ts";
import { nowIso, platformNewlines, repoRootFor, runGit } from "./journal.ts";
import { LedgerError, RUNS_DIRNAME, type Row, latestRound } from "./ledger.ts";
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
  readTaskDeclaration,
  recordProjectPlan,
  WORK_PLAN_FILENAME,
  registerSessionStart,
  validateAndWriteState,
} from "./writers.ts";
import { writeErr, writeOut } from "./cli/output.ts";

/**
 * Stale-record warnings for the session about to start.
 *
 * Registration is the last moment before the work at which a refresh may
 * legitimately happen, and the first at which it may not: discovery runs
 * between sessions, so the signal belongs here and the refresh does not. It
 * warns and names the invocation; it never blocks and it never refreshes. A
 * staleness check that could fail a registration would be a maintenance
 * signal capable of causing an outage, which is how maintenance signals get
 * suppressed -- so any failure reading it leaves the session unblocked and
 * silent.
 *
 * Python imports both names inside the function to keep `ai_router.session`
 * out of `discovery`'s import path at module load; here the graph runs the
 * other way and one direction only, so a plain import says the same thing
 * with less machinery.
 */
function discoveryWarnings(): string[] {
  try {
    return freshnessWarnings(loadConfig());
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

export function acquireLockWithTimeout(
  sessionsDir: string,
  workerId?: string,
  timeoutSeconds = 30,
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
  readonly sessionNumber?: number | null;
  readonly totalSessions?: number | null;
}

export function start(sessionsDir: string, options: StartOptions): number {
  if (!isDirectory(sessionsDir)) {
    writeErr(`start: not a directory: ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  try {
    resolveOrchestratorIdentity(
      buildOrchestratorBlock(
        options.engine,
        options.provider,
        options.model,
        options.effort,
      ),
    );
  } catch (error) {
    if (!(error instanceof IdentityResolutionError)) throw error;
    writeErr(`start: refused -- ${error.message}\n`);
    return EXIT_USAGE;
  }

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

    // A cancelled session is settled work, not a hole in the sequence: the
    // next session steps over it, and "next" is the first one still
    // available to run rather than one past the highest closed number.
    const nextAvailable = (after: number): number => {
      let candidate = after;
      while (cancelled.has(candidate)) candidate += 1;
      return candidate;
    };

    let requested = options.sessionNumber ?? null;
    if (requested === null) {
      requested =
        current !== null
          ? current
          : nextAvailable(completed.length > 0 ? Math.max(...completed) + 1 : 1);
    }

    // The boundary triad.
    if (current !== null && requested !== current) {
      writeErr(
        `start: refused -- session ${sessionDisplayNumber(current)} is still in ` +
          `flight (completedSessions=[${completed.join(", ")}]). Close session ` +
          `${sessionDisplayNumber(current)} before starting session ` +
          `${sessionDisplayNumber(requested)}.\n`,
      );
      return EXIT_BOUNDARY;
    }
    if (completed.includes(requested)) {
      writeErr(
        `start: refused -- session ${sessionDisplayNumber(requested)} is already ` +
          `closed (completedSessions=[${completed.join(", ")}]). Sessions are ` +
          "never re-opened.\n",
      );
      return EXIT_BOUNDARY;
    }
    if (cancelled.has(requested)) {
      writeErr(
        `start: refused -- session ${sessionDisplayNumber(requested)} is ` +
          "cancelled. Starting it would erase the cancellation and the reason " +
          `for it; restore it first: dabbler session restore ${requested}\n`,
      );
      return EXIT_BOUNDARY;
    }
    if (current === null) {
      const expected = nextAvailable(
        completed.length > 0 ? Math.max(...completed) + 1 : 1,
      );
      if (requested !== expected) {
        writeErr(
          `start: refused -- session ${sessionDisplayNumber(requested)} is not ` +
            `the next sequential session (expected ${expected}; ` +
            `completedSessions=[${completed.join(", ")}]). Close the intervening ` +
            "sessions first.\n",
        );
        return EXIT_BOUNDARY;
      }
    }

    registerSessionStart(sessionsDir, requested, {
      engine: options.engine,
      provider: options.provider,
      model: options.model,
      effort: options.effort,
      totalSessions: options.totalSessions,
    });
    writeOut(
      `start: session ${sessionDisplayNumber(requested)} of ` +
        `${basename(sessionsDir)} registered (${options.engine}).\n`,
    );
    for (const line of discoveryWarnings()) writeOut(`${line}\n`);
    // Raised before the work, so the question is standing before the session
    // that would trip over it begins. Idempotent, and best-effort: a
    // registration must not fail because a brief could not be written.
    try {
      const raised = raiseSuiteDecisionIfOwed(sessionsDir, requested);
      if (raised !== null) {
        writeOut(
          `start: raised owed decision '${String(raised["id"])}' -- ` +
            "`dabbler owed list` reads it. The work is not blocked; the close " +
            "is, until it is answered.\n",
        );
      }
    } catch {
      // Deliberately silent: see above.
    }
    if (readTaskDeclaration(sessionsDir, requested) === null) {
      // Step (a) of the lifecycle. Said here because the declaration has to
      // precede the work to mean anything -- a session that declares itself
      // releasable after building is a model deciding in hindsight what may
      // be published.
      writeOut(
        "This session has not declared its task list. Before the edits:\n" +
          `  dabbler session declare --sessions-dir ${sessionsDir} \\\n` +
          '      --task "<what this session will do>" --releasable|--not-releasable\n',
      );
    }
    writeOut(
      "Next, once the edits are made:\n" +
        `  dabbler affected --sessions-dir ${sessionsDir}\n` +
        "It prints the tests this change makes necessary and the exact command " +
        "to run. The complete suite is not accepted before verification -- it " +
        "is the run of record, and it comes after the final verified tree.\n",
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

export interface DeclareCliOptions {
  readonly task?: string | null;
  readonly taskFile?: string | null;
  readonly releasable: boolean;
  readonly sessionNumber?: number | null;
}

/** Declare the session's task list and whether it may publish. */
export function declare(sessionsDir: string, options: DeclareCliOptions): number {
  if (!isDirectory(sessionsDir)) {
    writeErr(`declare: not a directory: ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  const target = resolveTargetSession(sessionsDir, options.sessionNumber);
  if (target === null) {
    writeErr(
      `declare: refused -- no session has been started under ${sessionsDir}. ` +
        "Run `session start` first.\n",
    );
    return EXIT_BOUNDARY;
  }
  let text: string;
  try {
    text = readBody(options.task, options.taskFile);
  } catch (error) {
    if (error instanceof SanctionedWriteError) {
      writeErr(`declare: refused -- ${error.message}\n`);
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
  try {
    lock = acquireLockWithTimeout(sessionsDir, `declare/${process.pid}`);
  } catch (error) {
    if (!(error instanceof LockContentionError)) throw error;
    writeErr(`declare: refused -- lifecycle lock contention: ${error.message}\n`);
    return EXIT_LOCK_CONTENTION;
  }
  try {
    declareSessionTask(sessionsDir, {
      sessionNumber: target,
      task: text,
      releasable: options.releasable,
    });
  } catch (error) {
    if (!(error instanceof SanctionedWriteError)) throw error;
    writeErr(`declare: refused -- ${error.message}\n`);
    return EXIT_USAGE;
  } finally {
    releaseLock(lock);
  }
  writeOut(
    `declare: session ${sessionDisplayNumber(target)} declared; releasable=` +
      `${options.releasable ? "yes" : "no"}.\n`,
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
export function report(sessionsDir: string, options: ReportCliOptions): number {
  if (!isDirectory(sessionsDir)) {
    writeErr(`report: not a directory: ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  const target = resolveTargetSession(sessionsDir, options.sessionNumber);
  if (target === null) {
    writeErr(
      `report: refused -- no session has been started under ${sessionsDir}. ` +
        "Run `session start` first.\n",
    );
    return EXIT_BOUNDARY;
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
        files: options.files ?? [],
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
      summary =
        `work plan (${plan.steps.length} step(s), releasable=${plan.releasable ? "yes" : "no"}) ` +
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
  requestInterrupt(repoRoot, target, reason, nowIso(), stop);
  writeOut(
    waitsBehind
      ? stop
        ? `interrupt: session ${number} has already stopped (${waitsBehind.kind}); the request is held, and ` +
            "stopping a stopped loop changes nothing.\n"
        : `interrupt: held for session ${number}, which stopped (${waitsBehind.kind}); nothing is running to ` +
            "end, and the next `session next` hands it to the engine with the instruction.\n"
      : stop
        ? `interrupt: stop requested for session ${number} (instruction ${run.seq}); the driver ends the ` +
            "running invocation and halts -- the session stays in flight, and `session drive` re-runs it.\n"
        : `interrupt: requested for session ${number} (instruction ${run.seq}); the driver ends the ` +
            "running invocation and re-invokes the engine with the reason.\n",
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
  readonly stepId: string;
  readonly files: readonly string[] | null;
  /** A JSON file holding the step's checks, whole: `[{"argv": [...]}]`. */
  readonly checksFile: string | null;
  readonly reason: string;
  readonly approver: string;
  readonly sessionNumber?: number | null;
}

/**
 * Amend what one not-yet-accepted step of the driven plan is measured
 * against, with the reason and the approver on the record.
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
        stepId: options.stepId,
        files: options.files,
        checks,
        reason: options.reason,
        approver: options.approver,
      },
      run?.accepted_steps ?? [],
      nowIso(),
    );
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    writeErr(`plan amend: refused -- ${error.message}\n`);
    return EXIT_BOUNDARY;
  }
  writeOut(
    `plan amend: step '${options.stepId}' of session ${sessionDisplayNumber(target)} amended by ` +
      `${options.approver.trim()}; the next instruction for it is measured against the new ` +
      "step, and what changed is on the record.\n",
  );
  return EXIT_OK;
}

// --- close -------------------------------------------------------------------

function localOnly(repoRoot: string): boolean {
  return isFile(join(repoRoot, ".dabbler", "local-only"));
}

export interface CloseCliOptions {
  readonly dryRun?: boolean;
  readonly forced?: boolean;
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
  let lock: string;
  try {
    lock = acquireLock(sessionsDir, `close_session/${process.pid}`);
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

    // Refreshed against the tree the session actually produced, not the one
    // it started with. A repository that had no build files at `start` and
    // grew them during the session is the greenfield transition this whole
    // mechanism exists for -- raising only at registration would miss the
    // first code-writing session every time.
    try {
      raiseSuiteDecisionIfOwed(sessionsDir, current as number);
    } catch {
      // A close must not fail because a brief could not be written; the gate
      // below reads whatever is on disk.
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
    const results = runGates(sessionsDir, { forced });
    const width = Math.max(...results.map((row) => row.name.length));
    for (const row of results) {
      // Three marks, not two. A gate that could not see its own precondition
      // reports SKIP: it does not block, and it does not claim to have proved
      // anything either.
      const mark = row.inapplicable ? "SKIP" : row.passed ? "PASS" : "FAIL";
      let line = `  ${row.name.padEnd(width)}  ${mark}`;
      if (row.remediation) line += `  ${row.remediation}`;
      writeOut(`${line}\n`);
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
      if (row) verdict = row["verdict"] ?? null;
    }

    flipStateToClosed(sessionsDir, {
      verdict: verdict === null || verdict === undefined ? null : String(verdict),
      forced,
    });
    writeOut(
      `close: session ${sessionDisplayNumber(current)} of ` +
        `${basename(sessionsDir)} closed` +
        (verdict ? ` (${String(verdict)})` : "") +
        ".\n",
    );

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
export function cancel(
  sessionsDir: string,
  sessionNumber: number,
  options: { readonly reason: string; readonly force?: boolean },
): number {
  if (!isDirectory(sessionsDir)) {
    writeErr(`cancel: not a directory: ${sessionsDir}\n`);
    return EXIT_USAGE;
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
    const prior = canonicalizeStatus(record["status"]);
    if (prior === STATUS_CANCELLED) {
      writeErr(
        `cancel: session ${sessionDisplayNumber(sessionNumber)} is ` +
          "already cancelled\n",
      );
      return EXIT_BOUNDARY;
    }
    if (prior === STATUS_IN_PROGRESS && options.force !== true) {
      writeErr(
        `cancel: refused -- session ${sessionDisplayNumber(sessionNumber)} ` +
          "is in flight. Close it first, or pass --force.\n",
      );
      return EXIT_BOUNDARY;
    }
    if (RESTORABLE_STATUSES.includes(prior)) record["preCancelStatus"] = prior;
    record["status"] = STATUS_CANCELLED;
    record["cancelledReason"] = options.reason;
    record["cancelledAt"] = nowIsoSeconds();
    try {
      validateAndWriteState(sessionsDir, state);
    } catch (error) {
      if (!(error instanceof SessionStateInvariantError)) throw error;
      writeErr(`cancel: refused -- ${error.message}\n`);
      return EXIT_GATE_FAILED;
    }
    writeOut(`${dumps({ session: sessionNumber, status: STATUS_CANCELLED })}\n`);
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
    if (canonicalizeStatus(record["status"]) !== STATUS_CANCELLED) {
      writeErr(
        "restore: refused -- session " +
          `${sessionDisplayNumber(sessionNumber)} is not ` +
          "cancelled; there is nothing to restore.\n",
      );
      return EXIT_BOUNDARY;
    }
    let prior: unknown = record["preCancelStatus"] ?? null;
    delete record["preCancelStatus"];
    if (!RESTORABLE_STATUSES.includes(prior)) prior = STATUS_NOT_STARTED;
    record["status"] = prior;
    delete record["cancelledReason"];
    delete record["cancelledAt"];
    if (reason) record["restoredReason"] = reason;
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

export { DECIDERS, SESSION_PLAN_FILENAME };

/**
 * Raise the suite-declaration question when this repository owes it.
 *
 * The two facts it needs come from opposite places on purpose: what the
 * repository BUILDS is read from its build files, and what it DECLARES is read
 * from its configuration. A question is owed only when those disagree -- there
 * is code here and no way to test it -- which is why a repository of documents
 * is never asked.
 */
function raiseSuiteDecisionIfOwed(
  sessionsDir: string,
  sessionNumber: number,
): Row | null {
  const root = repoRootFor(sessionsDir);
  if (root === null) return null;
  const loaded = loadSuitesChecked(governingConfig(sessionsDir));
  // A malformed declaration is `test_run_fresh`'s to refuse, not a gap to
  // ask about: the operator declared something, and telling them they
  // declared nothing would be wrong.
  if (!loaded.ok) return null;
  const ecosystems = detectEcosystems(root);
  return refreshOwedDecisions(root, {
    ecosystems: ecosystems.map((eco) => eco.key),
    hasExpensiveSuite: loaded.suites.some((suite) => suite.expensive),
    configFilename: PROJECT_CONFIG_FILENAME,
    // Whether the repository has grown somewhere for tests to live. The
    // detected roots are the ecosystem's conventional ones, so this asks the
    // question in the ecosystem's own terms rather than guessing at a name.
    hasTestRoot: ecosystems.some((eco) =>
      eco.testRoots.some((relative) => existsSync(join(root, relative))),
    ),
    sessionNumber,
  });
}
