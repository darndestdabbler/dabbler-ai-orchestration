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
import {
  CHOSEN_VEHICLE_LAYERS,
  explainAuthoringModel,
  explainReviewingTransport,
  explainTransport,
  loadConfig,
} from "./config.ts";
import {
  configuredCredentialRefusal,
  configuredVehicleRefusal,
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
  driverDir,
  planPath,
  readInstruction,
  readRun,
  recordRepair,
  reportPath,
  requestInterrupt,
  shapeReport,
  stampAnswer,
  writeDispositions,
  writeReport,
  writeWorkPlan,
  appendSupervision,
  judgeModulesForShape,
} from "./driver.ts";
import { ManifestError, type SolutionShape, solutionShape } from "./modules.ts";
import { moduleScope } from "./agency.ts";
import {
  ENUMERATION_CLI_ALIASES,
  configurationNode,
  tryWriteProjection,
} from "./projection.ts";
import { CheckoutError, openModule, readCloneMarker, writeModuleSessionMarker } from "./checkout.ts";
import { writeExposure } from "./exposure.ts";
import { readPolicy, sharedFilesOf, writePolicy } from "./policy.ts";
import { candidatePathsAsWritten, readCandidateRecord } from "./impact.ts";
import { isFrameworkInstalledPath, materialPaths } from "./checks.ts";
import {
  SET_BOOKKEEPING_COMMIT_BASENAMES,
  governingConfig,
  readWorktreeStatus,
  renderGateRow,
  runGates,
} from "./gates.ts";
import { refuseIfResolvingFromSource } from "./resolution.ts";
import { detectEcosystems } from "./bootstrap/detect.ts";
import { removeStopGate } from "./bootstrap/index.ts";
import { PROJECT_CONFIG_FILENAME } from "./config.ts";
import {
  CLASS_ACCOUNTABILITY_SIGNOFF,
  raiseOwed,
  reaskSessionScopedSignoffs,
  refreshOwedDecisions,
} from "./owedDecisions.ts";
import { isSessionBookkeeping, loadSuitesChecked } from "./testEvidence.ts";
import { VERSION } from "./version.ts";
import { nowIso, platformNewlines, repoRootFor, runGit } from "./journal.ts";
import {
  LedgerError,
  OUTCOME_PUBLISHED,
  RUNS_DIRNAME,
  type Row,
  appendWithdrawal,
  latestRound,
  readPackaging,
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
  checkoutModuleOf,
  plannedKindOf,
  type PlannedSessionKind,
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
  recordSessionCheckout,
  registerSessionStart,
  releasabilityOf,
  validateAndWriteState,
} from "./writers.ts";
import { writeErr, writeOut } from "./output.ts";

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
  readonly sessionNumber?: number | null;
  readonly totalSessions?: number | null;
  /** The module the session works in: registered in its focused clone. Multi-module only. */
  readonly module?: string | null;
  /** `--focused` / `--global`: overrides the kind the plan states. Null derives it. */
  readonly kind?: SessionKind | null;
}

/** Where a session runs: one module's own folder, or the repository itself. */
export type SessionKind = "focused" | "global";

/** What `judgeSessionKind` reads. Every member is a fact already on disk or on the command line. */
export interface SessionKindFacts {
  readonly session: number;
  readonly shape: SolutionShape;
  /** What the plan's section says under the session's heading, or null where it says nothing. */
  readonly planned: PlannedSessionKind | null;
  /** `--focused` / `--global`, or null. */
  readonly flag: SessionKind | null;
  /** `--module`, or null. */
  readonly module: string | null;
  /** The module whose focused folder this checkout is, or null in the repository itself. */
  readonly cloneModule: string | null;
}

export type SessionKindRuling =
  | { readonly kind: "global"; readonly module: null }
  | { readonly kind: "focused"; readonly module: string };

/**
 * Which kind of session this start registers, and in which module.
 *
 * The plan says which: focused when the solution is multi-module and the
 * session's section names exactly one module, global otherwise. The two
 * flags override that, and `--module` is accepted where it agrees with the
 * plan. Every refusal is one plain sentence, because the person reading it
 * is standing in a folder and the sentence has to say which folder to be
 * in instead. A single-module solution has nothing to focus on: its
 * repository is its module, and a `--module` there is refused further down
 * by the clone, in the words it always used.
 */
export function judgeSessionKind(facts: SessionKindFacts): SessionKindRuling | string {
  const number = sessionDisplayNumber(facts.session);
  const typed = facts.module?.trim() ?? "";
  if (!facts.shape.multi) {
    if (facts.flag === "focused") {
      return (
        "this repository is a single-module solution: the repository is the module, so there " +
        "is nothing to focus on; start without --focused"
      );
    }
    return typed !== "" ? { kind: "focused", module: typed } : { kind: "global", module: null };
  }
  const planModule = facts.planned?.kind === "focused" ? facts.planned.module : null;
  if (typed !== "" && planModule !== null && typed !== planModule) {
    return (
      `session ${number}'s plan says \`Module: ${planModule}\` under its heading and --module ` +
      `names '${typed}'; the plan and the flag must agree -- change the plan, or start without --module`
    );
  }
  // A plan that says global is a plan: --module alone does not overturn it,
  // only --focused does, and then the two flags together say so out loud.
  if (typed !== "" && facts.planned?.kind === "global" && facts.flag !== "focused") {
    return (
      `session ${number}'s plan says \`Scope: whole repository\` under its heading and --module ` +
      `names '${typed}'; the plan and the flag must agree -- change the plan, or pass --focused ` +
      "with --module to override it"
    );
  }
  const chosen = typed !== "" ? typed : planModule;
  const kind: SessionKind = facts.flag ?? (chosen !== null ? "focused" : "global");
  if (kind === "focused" && chosen === null) {
    return (
      `session ${number} is global by its plan (no \`Module: <slug>\` line under its heading) and ` +
      "no --module was given, so there is nothing to focus on: add the line, or pass --module"
    );
  }
  if (facts.cloneModule !== null) {
    if (kind === "global") {
      return (
        `this checkout is module '${facts.cloneModule}'s focused folder and session ${number} is ` +
        `global (${facts.flag === "global" ? "--global" : "its plan names no module"}): a global ` +
        "session starts in the repository itself"
      );
    }
    if (chosen !== facts.cloneModule) {
      return (
        `this checkout is module '${facts.cloneModule}'s focused folder and session ${number}'s plan ` +
        `names module '${chosen}': start it in ${chosen}'s own folder, or from the repository, which opens it`
      );
    }
  }
  return kind === "focused" ? { kind, module: chosen as string } : { kind, module: null };
}

/** Where a module session is registered: the clone, and the clone's sessions root. */
interface ModuleStart {
  readonly slug: string;
  readonly root: string;
  readonly sessionsDir: string;
  readonly shape: SolutionShape;
  /** True when `start` stood in the full checkout and made the clone; false inside the clone itself. */
  readonly fullCheckout: boolean;
}

/**
 * The focused clone a `start --module` registers in.
 *
 * Inside a clone that already is the module's, the session registers here.
 * In the full checkout the clone is made from the origin, so the checkout
 * must have nothing the origin lacks: a dirty tree or unpushed commits are
 * refused by name rather than silently left out of the session's base.
 */
function prepareModuleStart(sessionsDir: string, slug: string): ModuleStart {
  const repoRoot = repoRootFromSessionsDir(sessionsDir);
  const shape = solutionShape(repoRoot);
  if (!shape.multi) {
    throw new CheckoutError(
      "this repository is a single-module solution: the repository is the module, so " +
        "start without --module",
    );
  }
  if (!shape.modules.some((entry) => entry.slug === slug)) {
    throw new CheckoutError(`docs/modules.yaml declares no module '${slug}'`);
  }
  const marker = readCloneMarker(repoRoot);
  if (marker !== null) {
    if (marker.slug !== slug) {
      throw new CheckoutError(
        `this checkout is module '${marker.slug}'s focused clone; a session on '${slug}' ` +
          "starts from the full checkout, which makes its own clone",
      );
    }
    return { slug, root: repoRoot, sessionsDir, shape, fullCheckout: false };
  }
  // Material changes only: the lifecycle lock this start holds, the run
  // ledger and an engine's own install are machine state, not work.
  const status = readWorktreeStatus(repoRoot);
  const setRel = relative(repoRoot, resolve(sessionsDir)).split("\\").join("/");
  const material = status.error === "" ? materialPaths(status.text, setRel, { beforeWork: true }) : [];
  if (material.length > 0) {
    throw new CheckoutError(
      `the working tree carries ${material.length} change(s) (${material.slice(0, 3).join(", ")}); ` +
        "the module's clone is made from the origin, so commit and push them (or stash them) " +
        "before starting the session",
    );
  }
  const ahead = runGit(repoRoot, ["rev-list", "--count", "@{upstream}..HEAD"]);
  if (ahead.code === 0 && Number.parseInt(ahead.stdout.trim(), 10) > 0) {
    throw new CheckoutError(
      `HEAD is ${ahead.stdout.trim()} commit(s) ahead of its upstream; the module's clone ` +
        "is made from the origin, so push first",
    );
  }
  const opened = openModule(repoRoot, shape, slug, { config: loadConfig(undefined, repoRoot) });
  const cloneSessionsDir = join(opened.path, relative(repoRoot, resolve(sessionsDir)));
  return {
    slug,
    root: opened.path,
    sessionsDir: cloneSessionsDir,
    shape: solutionShape(opened.path),
    fullCheckout: true,
  };
}

/** The module scope of a session's row, for the exposure manifest; null where the session names no module. */
function moduleScopeOfSession(
  repoRoot: string,
  sessionsDir: string,
  shape: SolutionShape,
  modules: readonly string[],
): string[] {
  return moduleScope(repoRoot, sessionsDir, shape, modules, sharedFilesOf(repoRoot, shape));
}

/**
 * The policy of a module session, written at the moment its modules reach
 * the record. Best-effort, like every derived record beside the ledger: a
 * declaration must not fail because a file nobody types could not be
 * written, and a session with no policy is walled by nothing -- allowed,
 * unobserved -- which is the side the operator chose.
 */
function writeDeclaredPolicy(sessionsDir: string, session: number, modules: readonly string[]): void {
  try {
    const repoRoot = repoRootFromSessionsDir(sessionsDir);
    writePolicy(repoRoot, sessionsDir, solutionShape(repoRoot), session, modules);
  } catch {
    // Deliberately silent: see above.
  }
}

/**
 * The Solution Explorer's projection, rewritten where a session's modules
 * come into or out of play: the module rows mark the session in flight,
 * and the start and the close are the two moments that changes. For a
 * multi-module shape only, and best-effort -- a registration or a close
 * must not fail because a rendering could not be written.
 */
function reprojectSolution(root: string): void {
  try {
    if (solutionShape(root).multi) tryWriteProjection(root);
  } catch {
    // Deliberately silent: see above.
  }
}

/** The first line of a git error, for a one-line message. */
function firstLine(text: string): string {
  return text.split("\n").find((line) => line.trim() !== "")?.trim() ?? "no reason given";
}

/**
 * A registration pulls its checkout forward first, when there is an
 * upstream to pull from and a clean tree to pull onto, so a session starts
 * on what the server has and not on what this folder last saw. One line
 * either way; a pull that fails is said and the start goes on, because the
 * refusal for a tree that cannot take the session belongs to the start
 * itself, not to a courtesy before it.
 */
function pullBeforeStart(repoRoot: string, sessionsDir: string): string | null {
  const upstream = runGit(repoRoot, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (upstream.code !== 0 || upstream.stdout.trim() === "") return null;
  const status = readWorktreeStatus(repoRoot);
  if (status.error !== "") return null;
  const setRel = relative(repoRoot, resolve(sessionsDir)).split("\\").join("/");
  if (materialPaths(status.text, setRel, { beforeWork: true }).length > 0) return null;
  const pulled = runGit(repoRoot, ["pull", "--ff-only", "-q"]);
  return pulled.code === 0
    ? `start: pulled from ${upstream.stdout.trim()} (git pull --ff-only) before registering.`
    : `start: not pulled from ${upstream.stdout.trim()} (${firstLine(pulled.stderr)}); registering on ` +
        "what is here -- run `git pull --ff-only` yourself when it can.";
}

/**
 * A close run in a module's folder pulls the repository it was opened from
 * forward, after its own push, so the repository's window sees the session
 * closed without anyone remembering to pull. Only onto a clean tree, and
 * never a refusal: the close has already pushed, and what is left is one
 * line saying it was done or naming the command the person runs.
 */
export function pullRepositoryForward(cloneRoot: string, sessionsDir: string): string | null {
  const marker = readCloneMarker(cloneRoot);
  const repository = marker?.repository?.trim() ?? "";
  if (repository === "") return null;
  const command = `git -C "${repository}" pull --ff-only`;
  if (!isDirectory(repository)) return `close: ${repository} is not there to pull forward; run: ${command}`;
  const status = readWorktreeStatus(repository);
  if (status.error !== "") return `close: ${repository} was not pulled forward (${status.error}); run: ${command}`;
  const setRel = relative(cloneRoot, resolve(sessionsDir)).split("\\").join("/");
  const material = materialPaths(status.text, setRel, { beforeWork: true });
  if (material.length > 0) {
    return (
      `close: ${repository} holds ${material.length} change(s) (${material.slice(0, 3).join(", ")}), so it ` +
      `was not pulled forward; commit or stash them, then run: ${command}`
    );
  }
  const pulled = runGit(repository, ["pull", "--ff-only", "-q"]);
  return pulled.code === 0
    ? `close: pulled ${repository} forward (git pull --ff-only), so its window sees this session closed.`
    : `close: ${repository} was not pulled forward (${firstLine(pulled.stderr)}); run: ${command}`;
}

/**
 * The exposure manifest at the close of a module session: what the clone
 * held of its siblings, and what the session changed outside its scope.
 * Best-effort, like every other record the close adds beside the gates: a
 * close must not fail because a manifest could not be written.
 */
function writeCloseExposure(sessionsDir: string, repoRoot: string, current: number): void {
  try {
    // The checkout on the row is the authority for what the session is
    // scoped to, and the only thing that makes it a focused session: a
    // global session has no checkout, no wall, and no manifest to write,
    // whatever modules its declaration named.
    const checkoutModule = checkoutModuleOf(sessionsDir, current);
    if (checkoutModule === null) return;
    const modules = [checkoutModule];
    const shape = solutionShape(repoRoot);
    if (!shape.multi) return;
    const run = readRun(repoRoot, current);
    const baseline = run?.baseline_tree ?? null;
    // The session's own changes: not the candidate the framework packed (its
    // paths as written, by digest), not the engine's settings the
    // registration installed, and not the session's bookkeeping -- none of
    // those is work the session was scoped to or could have been.
    const candidate = candidatePathsAsWritten(repoRoot, readCandidateRecord(repoRoot, current));
    const setRel = relative(repoRoot, resolve(sessionsDir)).split("\\").join("/");
    const changed = (baseline === null ? [] : (changedPathsBetween(repoRoot, String(baseline), "HEAD") ?? [])).filter(
      (path) => {
        const rel = path.split("\\").join("/");
        return !candidate.has(rel) && !isFrameworkInstalledPath(rel) && !isSessionBookkeeping(rel, setRel);
      },
    );
    writeExposure(repoRoot, shape, current, {
      modules,
      phase: "close",
      scope: moduleScopeOfSession(repoRoot, sessionsDir, shape, modules),
      changedPaths: changed,
    });
  } catch {
    // Deliberately silent: see above.
  }
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
    if (candidates.length === 0 || candidates.includes(chosen)) return null;
    return (
      `${what} is set to '${chosen}', which is not one it can be. ` +
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
  const authoringRefusal =
    authoring?.["declaredAtStart"] === true
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

export async function start(sessionsDir: string, options: StartOptions): Promise<number> {
  if (!isDirectory(sessionsDir)) {
    writeErr(`start: not a directory: ${sessionsDir}\n`);
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
    // **A vehicle a PERSON put in force and this machine cannot reach is a
    // stop, here, before the session exists and before anything is billed.**
    //
    // Only one somebody chose -- typed, committed in this checkout, or set
    // as their own default. A first-run machine with no seat and no keys is
    // not refused: refusing it would refuse the setup that fixes it. The
    // refusal names the LAYER, because a committed setting and a personal
    // default are fixed in different files by different people.
    const chosenLayers = CHOSEN_VEHICLE_LAYERS;
    try {
      const config = loadConfig(undefined, checkout);
      const unreachable =
        configuredVehicleRefusal(config, explainTransport(config, null, checkout), chosenLayers) ??
        configuredVehicleRefusal(
          config,
          explainReviewingTransport(config, null, checkout),
          chosenLayers,
        );
      if (unreachable !== null) {
        writeErr(`start: refused -- ${unreachable}\n`);
        return EXIT_USAGE;
      }
      // **And a CREDENTIAL somebody named that this machine does not hold.**
      //
      // A reference is an explicit act with a layer behind it, so a dangling
      // one is a stop rather than a quiet fall back to the environment:
      // which key answers decides which account is billed.
      const danglingKey = configuredCredentialRefusal(config);
      if (danglingKey !== null) {
        writeErr(`start: refused -- ${danglingKey}\n`);
        return EXIT_USAGE;
      }
      // **And a MODEL somebody chose that its role cannot actually be.**
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
            "already done was done under it. Continue with the same identity " +
            "(or with none, which is what `dabbler session next` sends once a " +
            "session is in flight), or close this session before starting one " +
            "under another.\n",
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
    try {
      resolveOrchestratorIdentity(
        buildOrchestratorBlock(
          identity.engine,
          identity.provider,
          identity.model,
          identity.effort,
        ),
      );
    } catch (error) {
      if (!(error instanceof IdentityResolutionError)) throw error;
      writeErr(`start: refused -- ${error.message}\n`);
      return EXIT_USAGE;
    }
    // A module session is registered in the module's focused clone, made
    // here from the origin when `start` stands in the full checkout. The
    // clone's sessions root is the session's from now on; the full checkout
    // keeps only a marker saying where the work went.
    // A fresh registration only: re-registering the session in flight is a
    // continuation, and moving the tree under a session's own work is not.
    if (current === null || requested !== current) {
      const pulled = pullBeforeStart(repoRootFromSessionsDir(sessionsDir), sessionsDir);
      if (pulled !== null) writeOut(`${pulled}\n`);
    }
    let moduleStart: ModuleStart | null = null;
    let shape: SolutionShape;
    try {
      shape = solutionShape(repoRootFromSessionsDir(sessionsDir));
    } catch (error) {
      if (!(error instanceof ManifestError)) throw error;
      writeErr(`start: refused -- ${error.message}\n`);
      return EXIT_USAGE;
    }
    const ruling = judgeSessionKind({
      session: requested,
      shape,
      planned: plannedKindOf(sessionsDir, requested),
      flag: options.kind ?? null,
      module: options.module ?? null,
      cloneModule: readCloneMarker(repoRootFromSessionsDir(sessionsDir))?.slug ?? null,
    });
    if (typeof ruling === "string") {
      writeErr(`start: refused -- ${ruling}\n`);
      return EXIT_USAGE;
    }
    if (ruling.kind === "focused") {
      try {
        moduleStart = prepareModuleStart(sessionsDir, ruling.module);
      } catch (error) {
        if (error instanceof CheckoutError || error instanceof ManifestError) {
          writeErr(`start: refused -- ${error.message}\n`);
          return EXIT_USAGE;
        }
        throw error;
      }
    }
    // Free, and before the session exists: what the roles may resolve to is
    // established while there is still nothing whose review it could change.
    for (const line of await refreshDiscovery()) writeOut(`${line}\n`);
    const registerIn = moduleStart === null ? sessionsDir : moduleStart.sessionsDir;
    registerSessionStart(registerIn, requested, {
      engine: identity.engine,
      provider: identity.provider,
      model: identity.model,
      effort: identity.effort,
      totalSessions: options.totalSessions,
    });
    if (moduleStart !== null) {
      recordSessionCheckout(registerIn, requested, { module: moduleStart.slug, path: moduleStart.root });
      writeExposure(moduleStart.root, moduleStart.shape, requested, {
        modules: [moduleStart.slug],
        phase: "start",
        scope: moduleScopeOfSession(moduleStart.root, registerIn, moduleStart.shape, [moduleStart.slug]),
      });
      writeDeclaredPolicy(registerIn, requested, [moduleStart.slug]);
      if (moduleStart.fullCheckout) {
        writeModuleSessionMarker(repoRootFromSessionsDir(sessionsDir), {
          session: requested,
          module: moduleStart.slug,
          path: moduleStart.root,
          sessionsDir: registerIn,
          startedAt: nowIso("seconds"),
        });
      }
      writeOut(
        `start: session ${sessionDisplayNumber(requested)} of ${basename(registerIn)} registered ` +
          `(${options.engine}) in module '${moduleStart.slug}'s focused checkout at ` +
          `${moduleStart.root}; the exposure manifest is written there.\n`,
      );
    } else {
      // A global session in a multi-module solution is the repository with
      // no wall: it says so here, once, so nobody waits for a manifest or a
      // gate that will not come.
      writeOut(
        `start: session ${sessionDisplayNumber(requested)} of ` +
          `${basename(sessionsDir)} registered (${options.engine})` +
          `${shape.multi ? "; global -- no wall: the whole repository, no exposure manifest, no exposure gate" : ""}.\n`,
      );
    }
    for (const line of discoveryWarnings()) writeOut(`${line}\n`);
    // The Stop hook the framework used to install for this engine is taken
    // out here, where the engine is known: a hook whose verb no longer
    // exists would block every end of turn. Idempotent, and best-effort: a
    // registration must not fail because a settings file could not be
    // written.
    if (identity.engine === "claude-code") {
      try {
        const unhooked = removeStopGate(repoRootFromSessionsDir(registerIn));
        if (unhooked !== null) {
          // On the row, so the declaration gate exempts this edit and no
          // other change to the file.
          recordHookRemoved(registerIn, requested);
          writeOut(
            `start: removed the stop gate from ${unhooked} -- the framework's own ` +
              "edit, committed with this session's work; no step needs to name it.\n",
          );
        }
      } catch {
        // Deliberately silent: see above.
      }
    }
    // Raised before the work, so the question is standing before the session
    // that would trip over it begins. Idempotent, and best-effort: a
    // registration must not fail because a brief could not be written.
    try {
      // Not for a module session registered from the full checkout: the
      // governing configuration is read where the command stands, and the
      // clone is not where it stands, so the question would be asked of a
      // declaration nobody read. The close asks it again, in the clone.
      const raised = moduleStart === null ? raiseSuiteDecisionIfOwed(registerIn, requested) : null;
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
    // The one thing true under both flows. This used to print the typed
    // lifecycle's recipe -- `session declare`, then `dabbler affected` --
    // which contradicted the managed body the engine had just read, and
    // four sessions of one test repository were told to run verbs the pull
    // forbids. The declaration is the plan step's answer; the tests are the
    // framework's.
    writeOut(`Next: dabbler session next --sessions-dir ${registerIn}\n`);
    // The modules in play changed: where the session registered, and the
    // repository a focused session was opened from, which holds the marker.
    reprojectSolution(repoRootFromSessionsDir(registerIn));
    if (moduleStart?.fullCheckout) reprojectSolution(repoRootFromSessionsDir(sessionsDir));
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
  /** The module(s) the session works in; given only for a multi-module solution. */
  readonly modules?: readonly string[] | null;
  /** Why the session must change more than one module; required with two or more. */
  readonly reason?: string | null;
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

  // The typed path is held to the solution's shape by the same judge the
  // driven plan meets at acceptance, so neither can persist a module the
  // other would refuse: an undeclared slug, two modules with no reason, a
  // module named in a single-module repository.
  const declaredShape = solutionShape(repoRootFromSessionsDir(sessionsDir));
  const shapeReasons = judgeModulesForShape(
    options.modules ?? [],
    options.reason ?? null,
    declaredShape,
    "the declaration",
    // A global session -- multi-module, and no checkout on its row -- is the
    // whole repository: it names any declared modules or none.
    declaredShape.multi && checkoutModuleOf(sessionsDir, target) === null,
  );
  if (shapeReasons.length > 0) {
    writeErr(`declare: refused -- ${shapeReasons.join("; ")}\n`);
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
      modules: options.modules ?? null,
    });
  } catch (error) {
    if (!(error instanceof SanctionedWriteError)) throw error;
    writeErr(`declare: refused -- ${error.message}\n`);
    return EXIT_USAGE;
  } finally {
    releaseLock(lock);
  }
  const modules = (options.modules ?? []).filter((slug) => slug.trim() !== "");
  if (modules.length > 0) writeDeclaredPolicy(sessionsDir, target, modules);
  writeOut(
    `declare: session ${sessionDisplayNumber(target)} declared; releasable=` +
      `${options.releasable ? "yes" : "no"}` +
      `${modules.length > 0 ? `; modules=${modules.join(",")}` : ""}.\n`,
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
    writeErr(
      `report: refused -- the outstanding instruction is ${instruction.seq} ` +
        `and this report answers ${options.seq}. A stale attempt does not ` +
        "advance the run; call `dabbler session next` and answer what it says.\n",
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
 * `repairs.jsonl`, and an `accountability-signoff` decision says a person
 * put work in outside a step. What it does NOT do is weaken any judgement
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
 * or the machine's directory, not the engine's settings the registration
 * edited, and not the candidate the framework packed -- so a two-file
 * repair lists two paths.
 */
export function repairedPaths(
  repoRoot: string,
  sessionsDir: string,
  session: number,
  changed: readonly string[],
): string[] {
  const candidate = candidatePathsAsWritten(repoRoot, readCandidateRecord(repoRoot, session));
  const setRel = relative(repoRoot, resolve(sessionsDir)).split("\\").join("/");
  return changed.filter((path) => {
    const rel = path.split("\\").join("/");
    return (
      rel !== ".dabbler" &&
      !rel.startsWith(".dabbler/") &&
      !candidate.has(rel) &&
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
    target,
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

  // The decision is the point as much as the row is: a machine cannot judge
  // whether a repair made outside a step was the right one, and the class
  // for "somebody did this and owns it" is what accountability-signoff is.
  // It does not block a close -- moving a baseline is not a verification
  // reduction, and the gates that would notice one still run.
  raiseOwed(repoRoot, {
    id: `repair-outside-a-step-${target}`,
    decisionClass: CLASS_ACCOUNTABILITY_SIGNOFF,
    question:
      `Session ${number} had work put into its tree outside any step, while the run was ` +
      `stopped (${run.stop.kind}). Does that stand as part of this session?`,
    determined:
      `${by} reported it as: ${reason}. ` +
      (paths.length > 0
        ? `It absorbed ${paths.length} path(s): ${paths.slice(0, 5).join(", ")}` +
          (paths.length > 5 ? ", ..." : "")
        : "The tree had not moved since the last baseline, so it absorbed nothing."),
    options: [
      {
        label: "It stands",
        consequence:
          "The repair is part of this session's diff and is reviewed with it: the " +
          "verification round and the run of record both bind to the tree it made.",
      },
      {
        label: "It does not",
        consequence:
          "The repair is taken back out of the tree before the session continues, and " +
          "the baseline moves again when it is.",
      },
    ],
    sessionNumber: target,
  });

  writeOut(
    `rebaseline: session ${number}'s baseline moved to ${tree.slice(0, 12)}; ` +
      `${paths.length} path(s) recorded as repaired outside a step, and an ` +
      "accountability-signoff decision raised. The stop is untouched -- re-run to " +
      "carry on from it.\n" +
      `${dumps({ paths: row["paths"], reason })}\n`,
  );
  return EXIT_OK;
}

// --- withdraw-release ---------------------------------------------------------

export interface WithdrawReleaseCliOptions {
  readonly reason: string;
  readonly approver: string;
  readonly sessionNumber?: number | null;
}

/**
 * Withdraw a session's declared releasability, on the record.
 *
 * **The state this leaves is the one that had no exit.** Releasability is
 * declared at step (a), before the work; `published_when_releasable` is an
 * EVIDENCE gate, so `close --force` cannot answer it; and there is no
 * re-declaration, because a session that could decide afterwards whether it
 * was supposed to ship could always decide it had not been. A releasable
 * session that must not ship after all was therefore closable only by
 * `cancel`, which throws away work that verified and landed. Session 137
 * would have had nowhere to go if the Marketplace had refused it.
 *
 * So it is a row, and every property of the row is about keeping it a
 * withdrawal rather than a bypass. It carries a reason and an approver
 * forever. It is immutable and there is one per session. It does not touch
 * the declaration, which stands beside it -- the close REPORTS both, so the
 * record of a session that was supposed to ship and did not is different
 * from the record of one that never was. And it buys nothing else: no gate
 * but this one reads it, and a withdrawn session is verified or not on
 * exactly the evidence it would have been.
 */
export function withdrawRelease(
  sessionsDir: string,
  options: WithdrawReleaseCliOptions,
): number {
  if (!isDirectory(sessionsDir)) {
    writeErr(`withdraw-release: not a directory: ${sessionsDir}\n`);
    return EXIT_USAGE;
  }
  const reason = options.reason.trim();
  const approver = options.approver.trim();
  if (reason === "" || approver === "") {
    writeErr(
      "withdraw-release: refused -- a withdrawal carries a reason and an approver. " +
        "An artifact that was declared and then not shipped, by nobody, for no stated " +
        "reason, is the silent skip this row exists to replace.\n",
    );
    return EXIT_USAGE;
  }
  const target = resolveTargetSession(sessionsDir, options.sessionNumber ?? null);
  if (target === null) {
    writeErr(`withdraw-release: refused -- no session has been started under ${sessionsDir}.\n`);
    return EXIT_BOUNDARY;
  }
  const repoRoot = repoRootFromSessionsDir(sessionsDir);
  const number = sessionDisplayNumber(target);

  // Not declared releasable is not a state to withdraw from: there would be
  // nothing on the record for the row to stand beside, and a withdrawal
  // that could be written against any session would be a note rather than
  // an act.
  const releasability = releasabilityOf(sessionsDir, target);
  if (!releasability.declared) {
    writeErr(
      `withdraw-release: refused -- session ${number} did not declare itself releasable, ` +
        "so it publishes nothing and there is nothing to withdraw. Releasability is " +
        "declared at step (a), and a session that never declared it is already the " +
        "session this verb would make it.\n",
    );
    return EXIT_BOUNDARY;
  }

  // Nothing published can be un-published, and a row saying an artifact
  // will not ship, filed after it shipped, is a record that contradicts
  // itself: the close would then report "nothing was published" over a
  // packaging record that says a version reached the feed. A Marketplace
  // version slot is never reusable, so this is not a state the framework
  // may describe two ways. The predicate is packaging's own, so what counts
  // as published is still stated once.
  let published = false;
  try {
    published = readPackaging(repoRoot, target).some(
      (row) => row["outcome"] === OUTCOME_PUBLISHED,
    );
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    writeErr(
      `withdraw-release: refused -- session ${number}'s packaging record could not be ` +
        `read, so whether it has already shipped cannot be established: ${error.message}\n`,
    );
    return EXIT_BOUNDARY;
  }
  if (published) {
    writeErr(
      `withdraw-release: refused -- session ${number} has already published. A version ` +
        "that reached the feed is public from that moment and a Marketplace version slot " +
        "is never reusable, so there is nothing left to withdraw and a row saying " +
        "otherwise would make the close report the opposite of the packaging record. " +
        "What follows a release that should not have gone out is another release, not a " +
        "withdrawal.\n",
    );
    return EXIT_BOUNDARY;
  }

  const record: Row = {
    schema_version: 1,
    session_number: target,
    reason,
    approver,
    recorded_at: nowIso(),
    framework_version: VERSION,
  };
  const tree = snapshotWorktreeTree(repoRoot);
  if (tree !== null) record["tree_at_withdrawal"] = tree;

  try {
    appendWithdrawal(repoRoot, target, record);
  } catch (error) {
    if (!(error instanceof LedgerError)) throw error;
    writeErr(`withdraw-release: refused -- ${error.message}\n`);
    return EXIT_BOUNDARY;
  }

  writeOut(
    `withdraw-release: session ${number} will publish nothing.\n` +
      `  Approved by: ${approver}\n` +
      `  Reason: ${reason}\n` +
      "\nThe declaration stands on the record and this stands beside it, so the close " +
      "reports a session that was declared releasable and did not ship, rather than one " +
      "that never was. Nothing else moves: the verification round, the run of record and " +
      "every other gate judge this session exactly as they would have.\n",
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

  // The round cap is the one amendable thing that belongs to the RUN rather
  // than to a step: it is not a bar a step is measured against, it is how
  // many reviews the tree may still have. Same verb, same reason and same
  // approver, because it is the same kind of change -- and no gate reads
  // either one.
  if (options.maxRounds !== null) {
    try {
      const run = amendRoundCap(
        repoRoot,
        target,
        {
          cap: options.maxRounds,
          reason: options.reason,
          approver: options.approver,
        },
        nowIso(),
      );
      writeOut(
        `plan amend: the verification round cap for session ${sessionDisplayNumber(target)} is ` +
          `now ${run.verification?.max_rounds}, amended by ${options.approver.trim()}; the ` +
          "claim is on the record with the rounds already run, and no gate reads it.\n",
      );
      return EXIT_OK;
    } catch (error) {
      if (!(error instanceof LedgerError)) throw error;
      writeErr(`plan amend: refused -- ${error.message}\n`);
      return EXIT_BOUNDARY;
    }
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
    // The closing exposure manifest, before the gates: what the clone held
    // of its siblings at the end and what the session changed outside its
    // scope is the evidence `exposure_within_ceiling` reads, so it is the
    // tree being closed that it describes.
    {
      const root = repoRootFor(sessionsDir);
      if (root) writeCloseExposure(sessionsDir, root, current as number);
    }
    const results = runGates(sessionsDir, { forced });
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

    // After the flip and not before it: what the re-ask says is that the
    // session HAS closed, and saying so while it might still be refused
    // would be the framework asserting an outcome it had not reached.
    if (repoRoot) {
      try {
        const reasked = reaskSessionScopedSignoffs(repoRoot, current as number);
        for (const row of reasked) {
          writeOut(
            `close: '${String(row["id"])}' is still open and is asked again for a ` +
              "session that has ended; `dabbler owed list` has it.\n",
          );
        }
      } catch {
        // A close must not fail because a brief could not be rewritten. The
        // standing question is still on the record either way.
      }
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
        // In a module's folder, the repository it was opened from comes
        // forward too: the push is what made that possible, and this is
        // the moment the operator used to have to remember.
        const pulled = pullRepositoryForward(repoRoot, sessionsDir);
        if (pulled !== null) writeOut(`${pulled}\n`);
      }
      // The session is out of play: its module's row stops saying so.
      reprojectSolution(repoRoot);
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
 * A session already cancelled is settled, and one in flight is work
 * somebody is doing: cancelling it without saying so is how a run
 * disappears from under the person running it.
 */
export function judgeCancellation(
  record: Record<string, unknown>,
  sessionNumber: number,
  force: boolean,
): BoundaryRuling {
  const prior = canonicalizeStatus(record["status"]);
  if (prior === STATUS_CANCELLED) {
    return {
      refusal: `session ${sessionDisplayNumber(sessionNumber)} is already cancelled`,
      exitCode: EXIT_BOUNDARY,
    };
  }
  if (prior === STATUS_IN_PROGRESS && !force) {
    return {
      refusal:
        `refused -- session ${sessionDisplayNumber(sessionNumber)} is in flight. ` +
        "Close it first, or pass --force.",
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
 * Whether the caller is an engine rather than a person at a terminal: a
 * driver job says so with `DABBLER_DRIVEN`, and a Claude Code turn with
 * `CLAUDECODE`. A person's shell has neither, and the extension's
 * in-process calls are a person's clicks.
 */
export function callerIsEngine(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env["DABBLER_DRIVEN"]) || Boolean(env["CLAUDECODE"]);
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
      "cancel: refused -- `session cancel --force` is a person's verb, never the engine's: it " +
        "ends a session in flight, and that judgement is not the engine's to make. Report the " +
        "step blocked and say why; a person cancels from the Work Explorer (Cancel Session) or " +
        "their own terminal.\n",
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
    const ruling = judgeCancellation(record, sessionNumber, options.force === true);
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

// --- the session in flight, for the verbs that read the ledger alone ----------

/** The number of the session in progress under `sessionsDir`, or null -- an unreadable ledger is nothing in flight. */
function sessionInFlight(sessionsDir: string): number | null {
  try {
    const state = readRawSessionState(sessionsDir);
    const sessions = Array.isArray(state?.["sessions"])
      ? (state?.["sessions"] as Array<Record<string, unknown>>)
      : [];
    const inFlight = sessions.find((row) => row["status"] === "in-progress");
    if (inFlight === undefined) return null;
    const number = Number(inFlight["number"]);
    return Number.isFinite(number) ? number : null;
  } catch {
    return null;
  }
}

// --- scope: what the session in flight may touch ------------------------------

/**
 * `dabbler session scope`: the module scope of the session in flight, one
 * repository-relative path per line -- the policy's allowed list, as the
 * first step instruction carried it, for an engine that wants it again or
 * a person who wants to see it. A session with no policy has no module
 * scope and says so on one line: the repository is the module, or nothing
 * is in flight. Exit 0 either way: this prints, it never judges.
 */
export function sessionScope(sessionsDir: string): number {
  const sessionNumber = sessionInFlight(sessionsDir);
  if (sessionNumber === null) {
    writeOut("scope: no session is in flight, so there is no module scope\n");
    return EXIT_OK;
  }
  const policy = readPolicy(repoRootFromSessionsDir(sessionsDir), sessionNumber);
  if (policy === null) {
    writeOut(
      `scope: session ${sessionDisplayNumber(sessionNumber)} has no module scope -- the ` +
        "repository is the module, and the session may touch all of it\n",
    );
    return EXIT_OK;
  }
  writeOut(`${policy.allowed.join("\n")}\n`);
  return EXIT_OK;
}
