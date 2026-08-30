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
import { basename, dirname, join, relative } from "node:path";

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
  upstreamRemote,
} from "./evidence.ts";
import { SET_BOOKKEEPING_COMMIT_BASENAMES, governingConfig, runGates } from "./gates.ts";
import { detectEcosystems } from "./bootstrap/detect.ts";
import { PROJECT_CONFIG_FILENAME } from "./config.ts";
import { refreshOwedDecisions } from "./owedDecisions.ts";
import { loadSuitesChecked } from "./testEvidence.ts";
import { nowIso, platformNewlines, repoRootFor, runGit } from "./journal.ts";
import { RUNS_DIRNAME, type Row, latestRound } from "./ledger.ts";
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
  isLoggedStep,
  isRecord,
  normalizeLegacyState,
  readActivityLog,
  readRawLegacyState,
  readRawSessionState,
  sessionDisplayNumber,
} from "./progress.ts";
import { dumps, pythonRepr, pythonStr } from "./pythonJson.ts";
import {
  DECIDERS,
  SanctionedWriteError,
  STEP_STATUSES,
  appendDecision,
  buildOrchestratorBlock,
  completedNumbers,
  cancelledNumbers,
  declareSessionTask,
  flipStateToClosed,
  logStep,
  nowIsoSeconds,
  onDiskState,
  readTaskDeclaration,
  recordProjectPlan,
  WORK_PLAN_FILENAME,
  registerSessionStart,
  seedSessionPlan,
  usePlanParser,
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

// The writers seed plan rows and must not import this module to do it: the
// grammar lives here and the write discipline lives there, and an import
// edge either way would make one depend on the other's load order.
usePlanParser({ parseSessionPlans, splitSlugMarker, DuplicateSlugError });

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

    const state = registerSessionStart(sessionsDir, requested, {
      engine: options.engine,
      provider: options.provider,
      model: options.model,
      effort: options.effort,
      totalSessions: options.totalSessions,
    });
    const seeded = seedSessionPlan(
      sessionsDir,
      requested,
      ((state["sessions"] as unknown[]) ?? []).length,
    );

    const log = readActivityLog(sessionsDir) ?? {};
    const mine = (Array.isArray(log["entries"]) ? log["entries"] : [])
      .filter(isRecord)
      .filter((entry) => entry["sessionNumber"] === requested);
    const planRows = mine.filter((entry) => entry["kind"] === "plan-step");
    const loggedKeys = new Set(
      mine.filter(isLoggedStep).map((entry) => entry["stepKey"]),
    );
    // This call IS the register step; the machine records what it did rather
    // than asking the engine to report it (and pick a key).
    const registerRow = planRows.find((row) => row["stepKey"] === "register");
    if (registerRow !== undefined && !loggedKeys.has("register")) {
      logStep(
        sessionsDir,
        requested,
        "register",
        `Registered session ${requested} (${options.engine}).`,
        "complete",
        registerRow["stepNumber"] as number | null,
      );
    }

    writeOut(
      `start: session ${sessionDisplayNumber(requested)} of ` +
        `${basename(sessionsDir)} registered (${options.engine}); ` +
        `${seeded} plan step(s) seeded.\n`,
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
    if (planRows.length > 0) {
      // The engine cannot guess these derived slugs; a step logged under any
      // other key (and no stepNumber) lands as a NEW row instead of ticking
      // the planned one.
      writeOut(
        "plan steps -- log each with this stepKey (or at least its " +
          "stepNumber) to tick the planned row:\n",
      );
      for (const row of planRows) {
        writeOut(`  ${String(row["stepNumber"])}. ${String(row["stepKey"])}\n`);
      }
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

// --- log ---------------------------------------------------------------------

function planRowsFor(
  entries: readonly Record<string, unknown>[],
  sessionNumber: number,
): Array<Record<string, unknown>> {
  return entries.filter(
    (entry) =>
      entry["sessionNumber"] === sessionNumber && entry["kind"] === "plan-step",
  );
}

/**
 * The planned row `step` addresses, by exact stepKey or by stepNumber.
 *
 * Exact only: a near-miss that resolved by similarity would tick a row the
 * caller did not mean, which is worse than refusing.
 */
function resolvePlanRow(
  step: string,
  planRows: readonly Record<string, unknown>[],
): Record<string, unknown> | null {
  const token = (step || "").trim();
  if (!token) return null;
  for (const row of planRows) {
    if (row["stepKey"] === token) return row;
  }
  if (/^\d+$/.test(token)) {
    const number = Number.parseInt(token, 10);
    for (const row of planRows) {
      if (row["stepNumber"] === number) return row;
    }
  }
  return null;
}

export interface LogOptions {
  readonly step: string;
  readonly status: string;
  readonly note?: string | null;
  readonly sessionNumber?: number | null;
}

/**
 * Record one plan step's status.
 *
 * The step must resolve against the rows `start` seeded: an unresolvable
 * key refuses rather than appending an orphan row nobody planned, and the
 * closed status vocabulary is enforced here as well as at the writer.
 */
export function log(sessionsDir: string, options: LogOptions): number {
  if (!isDirectory(sessionsDir)) {
    writeErr(`log: not a directory: ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  if (!STEP_STATUSES.includes(options.status)) {
    writeErr(
      `log: refused -- status must be one of ${STEP_STATUSES.join(", ")}; ` +
        `got '${options.status}'.\n`,
    );
    return EXIT_USAGE;
  }

  let lock: string;
  try {
    lock = acquireLockWithTimeout(sessionsDir, `log_step/${process.pid}`);
  } catch (error) {
    if (!(error instanceof LockContentionError)) throw error;
    writeErr(`log: refused -- lifecycle lock contention: ${error.message}\n`);
    return EXIT_LOCK_CONTENTION;
  }
  try {
    const raw = readRawSessionState(sessionsDir);
    const normalized = raw ? derivedView(raw) : null;
    let target = options.sessionNumber ?? null;
    if (target === null) {
      const current = (normalized?.["currentSession"] ?? null) as number | null;
      const completed = [...completedNumbers(normalized)].sort((a, b) => a - b);
      // The close-out step is logged after `close`, when nothing is in
      // flight; the last closed session is still the right home for it.
      target =
        current !== null
          ? current
          : completed.length > 0
            ? Math.max(...completed)
            : null;
    }
    if (target === null) {
      writeErr(
        `log: refused -- no session has been started under ${sessionsDir}. ` +
          "Run `session start` first.\n",
      );
      return EXIT_BOUNDARY;
    }

    const activity = readActivityLog(sessionsDir) ?? {};
    const entries = (Array.isArray(activity["entries"]) ? activity["entries"] : [])
      .filter(isRecord);
    const planRows = planRowsFor(entries, target);
    if (planRows.length === 0) {
      writeErr(
        `log: refused -- session ${sessionDisplayNumber(target)} of ` +
          `${basename(sessionsDir)} has no seeded plan rows to log against. ` +
          "Run `session start` first.\n",
      );
      return EXIT_BOUNDARY;
    }

    const row = resolvePlanRow(options.step, planRows);
    if (row === null) {
      const known = planRows
        .map((entry) => `  ${String(entry["stepNumber"])}. ${String(entry["stepKey"])}`)
        .join("\n");
      writeErr(
        `log: refused -- '${options.step}' is not a plan step of session ` +
          `${target}. Use one of these stepKeys or its number (no orphan row ` +
          `was written):\n${known}\n`,
      );
      return EXIT_USAGE;
    }

    const key = String(row["stepKey"]);
    const description = options.note
      ? options.note
      : String(row["description"] || key);
    const prior = entries.filter(
      (entry) =>
        entry["sessionNumber"] === target &&
        entry["stepKey"] === key &&
        isLoggedStep(entry),
    );
    const last = prior.length > 0 ? prior[prior.length - 1] : null;
    if (
      last !== null &&
      last["status"] === options.status &&
      (last["description"] || "") === description
    ) {
      writeOut(
        `log: step ${key} of session ${sessionDisplayNumber(target)} is already ` +
          `${options.status} (noop).\n`,
      );
      return EXIT_OK;
    }

    logStep(
      sessionsDir,
      target,
      key,
      description,
      options.status,
      row["stepNumber"] as number | null,
    );
    writeOut(
      `log: session ${sessionDisplayNumber(target)} step ` +
        `${String(row["stepNumber"])} (${key}) -> ${options.status}.\n`,
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
  // The work has begun, so a step is in flight. Nobody is asked to say so.
  const opened = openFirstOutstandingStep(sessionsDir, target);
  if (opened !== null) writeOut(`declare: step '${opened}' is in flight.\n`);
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

export { DECIDERS, STEP_STATUSES, SESSION_PLAN_FILENAME };

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

/**
 * Open the first step that is not already done, and say which.
 *
 * The framework owns the two transitions nobody should have to remember. This
 * is the first: a session that has declared its task list has begun, and the
 * step it has begun is the first one still outstanding -- which is step 2 in
 * practice, because `start` logs `register` complete itself.
 *
 * Best-effort and idempotent. A step already in flight is left alone, and a
 * declaration must not fail because a courtesy transition could not be
 * written.
 */
export function openFirstOutstandingStep(
  sessionsDir: string,
  sessionNumber: number,
): string | null {
  const log = readActivityLog(sessionsDir);
  if (log === null) return null;
  const entries = (Array.isArray(log["entries"]) ? log["entries"] : []).filter(
    isRecord,
  );
  const mine = entries.filter((entry) => entry["sessionNumber"] === sessionNumber);
  const planRows = planRowsFor(mine, sessionNumber).slice().sort(
    (left, right) => Number(left["stepNumber"]) - Number(right["stepNumber"]),
  );
  if (planRows.length === 0) return null;

  const latest = new Map<string, string>();
  for (const entry of mine) {
    if (!isLoggedStep(entry)) continue;
    const key = String(entry["stepKey"] ?? "");
    const status = String(entry["status"] ?? "");
    if (key && status) latest.set(key, status);
  }
  // Already moving: whichever step is in flight is the answer, and re-opening
  // a different one would be this function inventing progress.
  if ([...latest.values()].includes("in-progress")) return null;

  const next = planRows.find(
    (row) => latest.get(String(row["stepKey"])) !== "complete",
  );
  if (!next) return null;
  const key = String(next["stepKey"]);
  try {
    logStep(
      sessionsDir,
      sessionNumber,
      key,
      String(next["description"] ?? key),
      "in-progress",
      next["stepNumber"] as number | null,
    );
  } catch {
    return null;
  }
  return key;
}

/**
 * Close the last declared step when the run of record lands.
 *
 * The second bookend, and the last transition anyone can observe: the tasks
 * of a session are rendered while it is in flight, and the close ends that.
 * So the complete suite passing against the final tree is the moment the last
 * step is done in any sense a watcher can see.
 */
export function closeLastStep(
  sessionsDir: string,
  sessionNumber: number,
): string | null {
  const log = readActivityLog(sessionsDir);
  if (log === null) return null;
  const entries = (Array.isArray(log["entries"]) ? log["entries"] : []).filter(
    isRecord,
  );
  const planRows = planRowsFor(entries, sessionNumber).slice().sort(
    (left, right) => Number(left["stepNumber"]) - Number(right["stepNumber"]),
  );
  const last = planRows[planRows.length - 1];
  if (!last) return null;
  const key = String(last["stepKey"]);
  try {
    logStep(
      sessionsDir,
      sessionNumber,
      key,
      String(last["description"] ?? key),
      "complete",
      last["stepNumber"] as number | null,
    );
  } catch {
    return null;
  }
  return key;
}
