// Copilot CLI transport: seat-billed dispatch through the GitHub Copilot
// CLI's headless mode, plus the seat-local catalog lockfile it selects from.
//
// **The seat lists its own models, for free, and this file was written as
// though it could not.** There is no `copilot models` subcommand -- true, and
// irrelevant: the list arrives in the reply to `session/new` over `copilot
// --acp`, which sends no prompt and bills nothing (`enumerateSeatModels`,
// below). The maintained `candidate_universe` array that used to be the only
// answer to "what models exist on this seat" is now written from that
// reading, and survives only as the fallback for a seat that could not be
// read. Three AI engines reasoned from the old note and its premium-request
// vocabulary and each concluded that finding out what exists is expensive;
// `docs/model-and-pricing-sources.md` is the measured answer.
//
// What the seat still does not state is a first-party provider -- inferable
// only from a name prefix, and stamped as a heuristic wherever it is used --
// or whether a model will actually answer, which one trivial turn is the only
// way to learn. So the probe is kept for ENTITLEMENT and is never an
// enumeration: it neither adds an entry nor removes one. The lockfile is
// seat-scoped truth of both kinds -- what the seat lists, and what answered
// when asked -- and this module is its only writer. A reader without a writer
// leaves hand-editing as the only remedy for a stale file, which destroys
// exactly the empirical signal the file exists to carry.
//
// Dispatch is an invocation state machine: three-tier timeouts
// (spawn < first_byte < total), JSONL event parsing, stderr-substring error
// classification, and a per-process invocation breaker. `dispatch()` never
// rejects for an operational failure -- it resolves with an `APIResult` whose
// `metadata.error_class` names the failure -- and never retries internally:
// the CLI is premium-request-billed and quota-blind, so a retry storm has
// real cost no local guard can see.
//
// Honest non-accounting: the CLI reports no dollar cost and no input tokens.
// `input_tokens` is always 0 and nothing from this transport is
// billing-authoritative; real seat spend is measured by `../seatCost.ts` via
// the conversation id in `metadata.session_id`.
//
// A routed call cannot mutate the workspace on either transport. The API path
// sends no tools; here the agentic CLI gets a read-only tool allowlist
// (`--available-tools view,grep,glob`) -- `--allow-all-tools` stays because
// it governs auto-approval, and once the tool universe is read-only, "allow
// all" allows only read-only tools. `--no-custom-instructions` is part of the
// same parity: the CLI otherwise loads the workspace's `AGENTS.md` /
// `CLAUDE.md` into the system prompt, which would hand a routed verifier the
// orchestrator's own instructions -- text the API path never sends, that
// inflates the payload, and that tells the verifier it is running the session
// it was asked to judge.
//
// Large prompts travel as a PULL, not as argv. The CLI's only non-interactive
// prompt input is `-p <text>`, so the whole composed prompt would otherwise be
// one argv element -- and Windows `CreateProcessW` caps the entire rendered
// command line at 32,767 UTF-16 code units, which a verification bundle clears
// easily. Above a threshold the payload goes to a temp file and `-p` carries
// only a short bootstrap pointing at it; an EOF nonce fails the call closed
// when the model did not read the file through.
//
// **Where Node differs from Python, and where it must not.** Python runs the
// state machine on two reader threads feeding a queue; there is one thread
// here, so the same machine is a line pump feeding the same queue and a
// deadline the reader races. What may NOT differ is the measurement: the
// handoff threshold is counted on the RENDERED command line, so
// `list2cmdline` is ported rather than approximated -- a different number
// there would put the two routers on different branches for the same prompt.

import { spawnSync, type ChildProcess } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";

import {
  COPILOT_ACP,
  acpAgent,
  type AgentClient,
  type AgentConnection,
  type StandIn,
} from "../acp.ts";
import { HANDOFF_FILE_PREFIX } from "../agency.ts";
import {
  PLATFORM_COPILOT_USAGE,
  SOURCE_SEAT,
  catalogNow,
  TRANSPORT_SEAT,
  blockFor,
  foldListing,
  isChatModelId,
  readCatalog,
  writeBlock,
  type CatalogModel,
  type CatalogScope,
  type TransportBlock,
} from "../catalog.ts";
import { isArgvTooLarge, quoteForCmd, resolveProgram, spawnProgram, terminateTree } from "../checks.ts";
import { hiddenSpawn } from "../journal.ts";
import {
} from "../seatCost.ts";
import { explainRole, type RoleResolution } from "../selection.ts";
import { truthy, type RouterConfig } from "../config.ts";
import { isOk, type APIResult, type DispatchRequest, type Transport } from "./base.ts";

// --- Error-class taxonomy. Nothing is retryable today; the set stays empty
// (not absent) so a future promotion is a one-line, deliberate change.
export const ERROR_CLASS_INVALID_MODEL = "invalid-model";
export const ERROR_CLASS_AUTH = "auth-class";
export const ERROR_CLASS_QUOTA = "quota-rate-class";
export const ERROR_CLASS_GENERIC = "generic-unknown";
export const ERROR_CLASS_SPAWN_TIMEOUT = "spawn-timeout";
export const ERROR_CLASS_FIRST_BYTE_TIMEOUT = "first-byte-timeout";
export const ERROR_CLASS_TOTAL_TIMEOUT = "total-timeout";
export const ERROR_CLASS_BREAKER = "invocation-breaker";
/**
 * The handoff payload was dispatched but the response did not carry the
 * footer's acknowledgement -- the model did not read the file through.
 */
export const ERROR_CLASS_HANDOFF_INCOMPLETE = "handoff-incomplete";
/**
 * The OS refused the spawn because the command line exceeded its ceiling.
 * The handoff exists to make this unreachable; it is named anyway, because
 * this failure spent a year wearing the generic-unknown mask. The predicate
 * that recognises it is `checks.isArgvTooLarge`, which reads the error code
 * rather than the localized message.
 */
export const ERROR_CLASS_ARGV_TOO_LARGE = "argv-too-large";

export const RETRYABLE_ERROR_CLASSES: ReadonlySet<string> = new Set<string>();

const AUTH_SUBSTRINGS = [
  "auth", "login", "credential", "unauthorized", "authentication",
  "401", "403", "not logged in",
];
const QUOTA_SUBSTRINGS = ["rate limit", "quota", "429", "too many requests"];
const INVALID_MODEL_SUBSTRING = "from --model flag is not available";

// The timeout contract lives with the shared shapes
// (`contracts/transports.ts`): config validates the block at load and this
// module enforces the ceilings, so neither side may own what both consume.
// Re-exported here so this transport's consumers keep their import.
export {
  DEFAULT_FIRST_BYTE_TIMEOUT_SECONDS,
  DEFAULT_SPAWN_TIMEOUT_SECONDS,
  DEFAULT_TIMEOUTS,
  DEFAULT_TOTAL_TIMEOUT_SECONDS,
  TIMEOUT_FIELD_DEFAULTS,
  resolveTransportTimeouts,
  typeName,
  validateTransportTimeouts,
  type TransportTimeouts,
} from "../contracts/transports.ts";
import { DEFAULT_TIMEOUTS, type TransportTimeouts } from "../contracts/transports.ts";

const NO_AUTO_UPDATE_FLAG = "--no-auto-update";
const NO_AUTO_UPDATE_ENV: Record<string, string> = { COPILOT_AUTO_UPDATE: "false" };

/** The only tools a routed call may use. Read-only by construction. */
export const READ_ONLY_TOOLS: readonly string[] = ["view", "grep", "glob"];

// --- Large-prompt file handoff -----------------------------------------------
//
// The whole composed prompt travels as ONE `-p` argv element, and Windows
// `CreateProcessW` caps the entire command line at 32,767 UTF-16 code units
// (quoting and the terminating NUL included). Linux has a per-argument limit
// too (`MAX_ARG_STRLEN`, 128 KiB); Windows just reaches it first. Above a
// conservative threshold the dispatch becomes a PULL: write the prompt to a
// per-request temp file, dispatch a short `-p` bootstrap pointing the agentic
// CLI at that file, and require an EOF nonce acknowledgement.
//
// The pull works because of two facts about the CLI, neither incidental: it
// has a file-read tool (`view`, in the read-only grant above), and the system
// temp directory is auto-allowed by default (`--disallow-temp-dir` is the
// opt-out, which this transport does not pass).

/**
 * At or above this RENDERED command-line size (UTF-16 code units), switch to
 * the handoff. Measured on the rendered argv on EVERY OS: quoting expansion
 * and astral characters are otherwise miscounted, and one uniform rule gives
 * predictable behavior plus automatic cover for the Linux per-argument limit.
 * 24,000 leaves headroom below 32,767 for the executable path, quoting
 * expansion and future flags. A module constant by design -- no config knob.
 */
export const HANDOFF_THRESHOLD_UTF16_UNITS = 24000;

/**
 * The acknowledgement line shape. The nonce itself appears ONLY in the
 * payload file, never in argv, so a model that never read to EOF cannot
 * produce it.
 */
const HANDOFF_ACK_PREFIX = "HANDOFF-ACK";

/**
 * Retaining a payload file would weaken the transport's redaction posture,
 * so deletion is unconditional except under this explicit debug toggle.
 */
const DIAGNOSTICS_ENV_VAR = "DABBLER_COPILOT_DIAGNOSTICS";
const DIAGNOSTICS_TRUTHY: ReadonlySet<string> = new Set(["1", "true", "yes", "on"]);

/**
 * True only when the diagnostics toggle is explicitly truthy -- the one
 * condition under which a payload file is retained rather than deleted.
 */
function diagnosticsRetentionEnabled(env?: NodeJS.ProcessEnv): boolean {
  const raw = (env ?? process.env)[DIAGNOSTICS_ENV_VAR];
  if (raw === undefined || raw === null) return false;
  return DIAGNOSTICS_TRUTHY.has(raw.trim().toLowerCase());
}

/**
 * Python's `subprocess.list2cmdline`: Windows' own quoting rules, applied to
 * an argv.
 *
 * Ported rather than approximated because it is a MEASUREMENT, not a
 * rendering: the handoff branch is chosen from the length of this string, so
 * a version that quoted differently would send the two routers down different
 * branches for the same prompt. The oddity in the tail -- the backslash
 * buffer flushed twice when the argument is quoted -- is Windows' rule that
 * trailing backslashes before a closing quote are doubled, and it is
 * deliberate.
 */
export function list2cmdline(argv: readonly string[]): string {
  const result: string[] = [];
  for (const argument of argv) {
    const backslashes: string[] = [];
    if (result.length > 0) result.push(" ");
    const needQuote =
      argument.includes(" ") || argument.includes("\t") || argument === "";
    if (needQuote) result.push('"');
    for (const character of argument) {
      if (character === "\\") {
        backslashes.push(character);
      } else if (character === '"') {
        result.push("\\".repeat(backslashes.length * 2));
        backslashes.length = 0;
        result.push('\\"');
      } else {
        if (backslashes.length > 0) {
          result.push(...backslashes);
          backslashes.length = 0;
        }
        result.push(character);
      }
    }
    if (backslashes.length > 0) result.push(...backslashes);
    if (needQuote) {
      result.push(...backslashes);
      result.push('"');
    }
  }
  return result.join("");
}

/**
 * UTF-16 code units in the RENDERED command line for `argv`.
 *
 * A JavaScript string's length IS its UTF-16 code-unit count, so an astral
 * character counts two here exactly as it does in Python's
 * `len(rendered.encode("utf-16-le")) // 2`. The `+ 1` is the terminating NUL
 * the OS limit includes.
 */
export function renderedUtf16Units(argv: readonly string[]): number {
  return list2cmdline(argv).length + 1;
}

/**
 * The transport-control footer appended to the payload file. Carries the
 * per-request nonce and the exact line the model must end its response with.
 */
function buildHandoffFooter(nonce: string): string {
  return (
    "\n\n" +
    "===== TRANSPORT CONTROL FOOTER -- not part of the task =============\n" +
    "You have now reached the END of the task specification file. Reaching\n" +
    "this footer is what proves you read the file completely. The FINAL\n" +
    "line of your response must be exactly the following line, with nothing\n" +
    "after it:\n" +
    `${HANDOFF_ACK_PREFIX} ${nonce}\n` +
    "===================================================================\n"
  );
}

/**
 * The short `-p` bootstrap for a handoff dispatch. Names the payload in POSIX
 * forward-slash form (models mangle backslashes), demands a complete
 * sequential read before acting, and defers the ack line to the file's footer
 * so the nonce stays out of argv. Contains NO nonce.
 */
function buildHandoffBootstrap(posixPath: string): string {
  return (
    "Your complete and authoritative task instructions for this turn are in " +
    "a UTF-8 text file. Before doing anything else, use your file-read tool " +
    "to read the ENTIRE file at the path below, from the first byte through " +
    "the end of file, reading in sequential chunks if it is large:\n" +
    `${posixPath}\n` +
    "Read it ONCE. When you have reached its footer you have the whole of " +
    "it; do not open it again afterwards, and do not re-read any part of it " +
    "to check -- every read of it is logged, and a second read proves " +
    "nothing the first did not. " +
    "Execute the file's contents as your full instructions. Do not summarize " +
    "the file back to me. The file ends with a transport-control footer that " +
    "specifies an exact acknowledgement line; obey it -- the final line of " +
    "your response must be exactly that acknowledgement line."
  );
}

/**
 * Hex sha256 of the file at `path`, or null if it cannot be read. Never
 * throws -- it runs on already-failing paths.
 */
function sha256File(path: string): string | null {
  try {
    return createHash("sha256").update(readFileSync(path)).digest("hex");
  } catch {
    return null;
  }
}

/** Delete `path`, swallowing a missing or locked file. */
function bestEffortRemove(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    /* missing or locked; the caller is already done with it */
  }
}

/**
 * State a handoff dispatch threads through `run` so the result builders can
 * validate the ack, report `payload_bytes`, and notice a payload-file
 * mutation.
 */
interface HandoffContext {
  readonly nonce: string;
  readonly payloadPath: string;
  readonly payloadBytes: number;
  readonly hashBefore: string | null;
}

/**
 * Did the payload file change between spawn and exit? An unreadable or
 * removed file counts as modified.
 */
function payloadModified(handoff: HandoffContext): boolean {
  const after = sha256File(handoff.payloadPath);
  if (after === null) return true;
  return after !== handoff.hashBefore;
}

/**
 * The additive handoff metadata. Inline dispatches carry `handoff: false` and
 * nothing else; the payload's content never appears here -- only its byte
 * length.
 */
function handoffMetadataFields(
  handoff: HandoffContext | null,
  ackOutcome: string | null,
): Record<string, unknown> {
  if (handoff === null) return { handoff: false };
  return {
    handoff: true,
    payload_bytes: handoff.payloadBytes,
    handoff_ack: ackOutcome,
    payload_file_modified: payloadModified(handoff),
  };
}

/**
 * Python's `str.splitlines()` boundaries, which are more than `\n`.
 *
 * The file/group/record separators are in the class on purpose: this splits
 * both a model's answer (where the ack must be the last line) and the CLI's
 * JSONL, and a boundary one router honours and the other does not is a
 * different set of lines for the same bytes.
 */
// eslint-disable-next-line no-control-regex -- the separators ARE the contract
const LINE_BOUNDARY = /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/;

function splitLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split(LINE_BOUNDARY);
  // Python drops the empty trailing element a terminating newline produces.
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

export interface AckValidation {
  /** The response with the ack line removed; non-null only when validated. */
  readonly stripped: string | null;
  readonly outcome: "validated" | "mismatch" | "missing";
}

/**
 * Validate the EOF acknowledgement on a handoff response.
 *
 * The ack must be the final non-blank line -- trailing blank lines are
 * tolerated, anything else after it fails closed. Honest framing: this is a
 * gross under-read detector, not proof of comprehension.
 */
export function validateAck(content: string, nonce: string): AckValidation {
  const expected = `${HANDOFF_ACK_PREFIX} ${nonce}`;
  const lines = splitLines(content);
  let index = lines.length - 1;
  while (index >= 0 && lines[index]!.trim() === "") index -= 1;
  if (index < 0) return { stripped: null, outcome: "missing" };
  const last = lines[index]!.trim();
  if (last === expected) {
    return {
      stripped: lines.slice(0, index).join("\n").replace(/\n+$/, ""),
      outcome: "validated",
    };
  }
  if (last.startsWith(HANDOFF_ACK_PREFIX)) {
    return { stripped: null, outcome: "mismatch" };
  }
  return { stripped: null, outcome: "missing" };
}

/**
 * Map raw stderr to an error class. Anything unmatched falls to
 * generic-unknown (auth-class-or-worse), never a speculative retryable
 * bucket.
 */
export function classifyStderr(stderrText: string): string {
  const lowered = stderrText.toLowerCase();
  if (lowered.includes(INVALID_MODEL_SUBSTRING)) return ERROR_CLASS_INVALID_MODEL;
  if (AUTH_SUBSTRINGS.some((substring) => lowered.includes(substring))) {
    return ERROR_CLASS_AUTH;
  }
  if (QUOTA_SUBSTRINGS.some((substring) => lowered.includes(substring))) {
    return ERROR_CLASS_QUOTA;
  }
  return ERROR_CLASS_GENERIC;
}

// --- Timeouts ----------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}


// --- Spawner seam ------------------------------------------------------------

/** The subset of a child process the state machine depends on. */
export interface ProcessHandle {
  readonly stdout: NodeJS.ReadableStream | null;
  readonly stderr: NodeJS.ReadableStream | null;
  kill(): void;
  /** Resolves with the exit code once the child is reaped. */
  wait(): Promise<number>;
}

export type Spawner = (
  argv: readonly string[],
  env: Record<string, string> | null,
) => ProcessHandle | Promise<ProcessHandle>;

/**
 * A `ChildProcess` seen through the seam.
 *
 * The kill is a TREE kill, and on Windows it has to be. Python spawns the
 * seat's executable directly, so its `proc.kill()` reaches the billed process;
 * here a batch shim means the immediate child is `cmd.exe` and the billed
 * process is its grandchild, which a plain kill would leave running after a
 * timeout. `checks.terminateTree` is the one implementation of that.
 */
function handleFor(child: ChildProcess): ProcessHandle {
  let settled: Promise<number> | null = null;
  return {
    stdout: child.stdout,
    stderr: child.stderr,
    kill: () => {
      terminateTree(child);
    },
    wait: () => {
      settled ??= new Promise<number>((resolveWait) => {
        if (child.exitCode !== null) {
          resolveWait(child.exitCode);
          return;
        }
        child.once("close", (code) => resolveWait(code ?? -1));
        child.once("error", () => resolveWait(-1));
      });
      return settled;
    },
  };
}

/**
 * The real spawner. Never `shell: true`.
 *
 * Encoding is forced to UTF-8 (JSON's own encoding) with replacement: without
 * it, a decode error mid-stream would kill the reader, the child would block
 * on a full pipe, and a local decode bug would be misclassified as a
 * total-timeout.
 *
 * `checks.resolveProgram` prefers the real executable to a batch shim, which
 * is what keeps the whole 32,767-character command line available: a shim can
 * only be interpreted by `cmd.exe`, whose line stops at 8,191, and a prompt
 * between those two numbers is below the handoff threshold and would fail
 * before Copilot ran. A seat installed through VS Code puts such a shim ahead
 * of the executable on PATH, so this is the ordinary case and not an exotic
 * one.
 *
 * **The residual, named rather than hidden.** On a machine where ONLY a shim
 * exists, `cmd.exe` is what has to run it -- a batch file IS a cmd script, and
 * parsing it to find the invocation inside would be a guess about one package
 * manager's generated file (D174). There the 8,191 ceiling is real, and it is
 * real for the Python router too: `CreateProcess` special-cases a batch file
 * by launching `cmd /c` around it, so both routers are bounded identically and
 * both would need the handoff threshold lowered to cover it. That is a change
 * to a constant both routers must agree on, so it belongs to a session that
 * can make it on both sides at once, not to this one.
 *
 * On that path each argument is quoted HERE rather than reassembled from a
 * string: `shell: true` would join the argv and let a shell re-split it, which
 * is precisely what an argv exists to avoid. The resolution and the quoting
 * are `checks`', so the router has one answer about how a program on this
 * platform is reached.
 */
export function defaultSpawner(
  argv: readonly string[],
  env: Record<string, string> | null,
): ProcessHandle {
  const merged: NodeJS.ProcessEnv = env ? { ...process.env, ...env } : { ...process.env };
  // `spawnProgram` gives the seat its own process group, so a timeout's
  // tree kill reaches the seat and not the router that spawned it.
  const child = spawnProgram(argv, { stdio: ["ignore", "pipe", "pipe"], env: merged });
  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  return handleFor(child);
}

class SpawnTimeout extends Error {}

/**
 * Call `spawner` under a deadline. If the spawner produces a real, billed
 * process after the caller has given up, it is killed and reaped rather than
 * left running with unread pipes.
 */
async function spawnWithTimeout(
  spawner: Spawner,
  argv: readonly string[],
  env: Record<string, string> | null,
  timeoutSeconds: number,
): Promise<ProcessHandle> {
  let gaveUp = false;
  const attempt = (async () => spawner(argv, env))().then(
    (handle) => {
      if (gaveUp) void killAndReap(handle);
      return { handle };
    },
    (error: unknown) => {
      if (gaveUp) return { handle: null };
      return { error };
    },
  );
  const raced = await Promise.race([
    attempt,
    sleep(timeoutSeconds * 1000).then(() => "timeout" as const),
  ]);
  if (raced === "timeout") {
    gaveUp = true;
    throw new SpawnTimeout(`spawner did not return within ${timeoutSeconds}s`);
  }
  if ("error" in raced) throw raced.error;
  return raced.handle as ProcessHandle;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((done) => {
    const timer = setTimeout(done, milliseconds);
    // The process must not be held open by a deadline nobody is waiting on.
    timer.unref?.();
  });
}

const TIMED_OUT = Symbol("timed-out");

/**
 * Python's `queue.Queue` with the reader thread's EOF sentinel, as one thread
 * can have it: lines arrive from the stream's `data` events and a waiter is
 * woken, or the deadline the caller set expires first.
 */
class LineQueue {
  private readonly lines: string[] = [];
  private ended = false;
  private wake: (() => void) | null = null;

  push(line: string): void {
    this.lines.push(line);
    this.release();
  }

  end(): void {
    this.ended = true;
    this.release();
  }

  private release(): void {
    const wake = this.wake;
    this.wake = null;
    wake?.();
  }

  /** One line, `null` at EOF, or `TIMED_OUT`. */
  async get(timeoutMilliseconds: number): Promise<string | null | typeof TIMED_OUT> {
    if (this.lines.length > 0) return this.lines.shift()!;
    if (this.ended) return null;
    if (timeoutMilliseconds <= 0) return TIMED_OUT;
    const woken = await new Promise<boolean>((done) => {
      const timer = setTimeout(() => {
        this.wake = null;
        done(false);
      }, timeoutMilliseconds);
      timer.unref?.();
      this.wake = () => {
        clearTimeout(timer);
        done(true);
      };
    });
    if (!woken) return TIMED_OUT;
    if (this.lines.length > 0) return this.lines.shift()!;
    return this.ended ? null : TIMED_OUT;
  }
}

/**
 * Feed a stream's text into a queue one line at a time, terminators kept --
 * the state machine joins them back into the raw stdout it parses, so a lost
 * newline would be a lost JSONL record boundary.
 *
 * A consequence worth naming: nothing is enqueued until a newline arrives, so
 * the first-byte deadline is really a first-complete-LINE deadline. That is
 * Python's semantics, not a shape this port chose -- its reader thread is
 * `iter(stream.readline, "")`, which also yields nothing until a line ends --
 * and the CLI's output is JSONL, where a partial line is not yet a record. A
 * child that emitted bytes but no newline within the deadline is
 * indistinguishable, to both routers, from one that emitted nothing.
 */
function pumpLines(stream: NodeJS.ReadableStream | null, queue: LineQueue): void {
  if (stream === null) {
    queue.end();
    return;
  }
  let buffer = "";
  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    if (buffer !== "") queue.push(buffer);
    buffer = "";
    queue.end();
  };
  stream.setEncoding?.("utf8");
  stream.on("data", (chunk: string | Buffer) => {
    buffer += typeof chunk === "string" ? chunk : chunk.toString("utf8");
    for (;;) {
      const index = buffer.indexOf("\n");
      if (index < 0) break;
      queue.push(buffer.slice(0, index + 1));
      buffer = buffer.slice(index + 1);
    }
  });
  stream.on("end", finish);
  stream.on("close", finish);
  stream.on("error", finish);
}

/**
 * Kill AND reap, every time -- an unkilled wait leaves a zombie on POSIX.
 * This is the single place that rule is enforced.
 */
async function killAndReap(proc: ProcessHandle): Promise<void> {
  try {
    proc.kill();
  } catch {
    /* already gone */
  }
  await Promise.race([proc.wait().catch(() => -1), sleep(15_000)]);
}

async function drainQueue(queue: LineQueue, budgetSeconds: number): Promise<string> {
  const lines: string[] = [];
  const deadline = performance.now() + budgetSeconds * 1000;
  for (;;) {
    const remaining = deadline - performance.now();
    if (remaining <= 0) break;
    const item = await queue.get(remaining);
    if (item === TIMED_OUT || item === null) break;
    lines.push(item);
  }
  return lines.join("");
}

/**
 * Parse JSONL into `[events, malformedLines]`. Blank lines are skipped; any
 * other unparseable line is recorded rather than thrown.
 */
export function parseJsonl(
  rawStdout: string,
): [Array<Record<string, unknown>>, string[]] {
  const events: Array<Record<string, unknown>> = [];
  const malformed: string[] = [];
  for (const line of splitLines(rawStdout)) {
    const stripped = line.trim();
    if (stripped === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripped);
    } catch {
      malformed.push(stripped);
      continue;
    }
    if (isRecord(parsed)) events.push(parsed);
    else malformed.push(stripped);
  }
  return [events, malformed];
}

/** The event types `successResult` reads; every other line is an echo. */
const CONSUMED_EVENT_TYPES: ReadonlySet<string> = new Set([
  "assistant.message",
  "result",
  "tool.execution_start",
  "tool.execution_complete",
]);

/**
 * The type a malformed line claims in its leading `{"type":"..."`, or null
 * when not even that can be read.
 *
 * The CLI scrubs credential-shaped text AFTER serialising each event, and the
 * rewrite can eat the backslash that escaped the next quote: a prompt that
 * quotes `"Bearer {api_key}"` comes back as an unparseable `user.message`
 * echo and an unparseable `model.messages_snapshot`, while every answer line
 * parses. Those echoes are never read, so their corruption is counted and
 * not fatal. A corrupt line of a type that IS read -- the answer, the
 * result, or a tool event the agency record is built from -- or one whose
 * type cannot be read, still fails the whole response closed: the record
 * is either complete or absent, never patched.
 */
function claimedEventType(line: string): string | null {
  const match = /^\{\s*"type"\s*:\s*"([^"\\]*)"/.exec(line);
  return match === null ? null : match[1]!;
}

function corruptionIsUnread(malformed: readonly string[]): boolean {
  return malformed.every((line) => {
    const type = claimedEventType(line);
    return type !== null && !CONSUMED_EVENT_TYPES.has(type);
  });
}

function lastEvent(
  events: ReadonlyArray<Record<string, unknown>>,
  eventType: string,
): Record<string, unknown> | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index]!;
    if (event["type"] === eventType && !truthy(event["ephemeral"])) return event;
  }
  return null;
}

const TOOL_START = "tool.execution_start";
const TOOL_COMPLETE = "tool.execution_complete";

/**
 * The tool operations the CLI actually executed, in order, paired from its own
 * start and completion events.
 *
 * The CLI is the executor, so this is the only account of what a routed model
 * looked at that the model did not write itself. It is reported whatever the
 * tools were, because the grant is policy rather than physics and a call
 * outside the read-only allowlist is the first thing a reader of the round
 * needs to see.
 *
 * Both halves of a `view` result are kept. `result.content` is the file's
 * text as the model was shown it, with no line numbers; `detailedContent`
 * is the CLI's own unified diff of the file against itself (measured on
 * 1.0.83, `docs/copilot-cli-walkthrough.md`), whose hunk header numbers
 * every line. The second is the only framing a line-for-line fidelity
 * comparison can be made from, and dropping it -- as this once did -- left
 * every read of every round graded unverified.
 */
export function toolCalls(
  events: ReadonlyArray<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const calls = new Map<string, Record<string, unknown>>();
  const order: string[] = [];
  for (const event of events) {
    const eventType = event["type"];
    if (eventType !== TOOL_START && eventType !== TOOL_COMPLETE) continue;
    const data = event["data"];
    if (!isRecord(data)) continue;
    const callId = data["toolCallId"];
    if (typeof callId !== "string" || callId === "") continue;
    if (eventType === TOOL_START) {
      if (!calls.has(callId)) order.push(callId);
      const tool = data["toolName"];
      calls.set(callId, {
        tool: typeof tool === "string" ? tool : "",
        arguments: data["arguments"] ?? null,
        success: null,
        result: null,
      });
      continue;
    }
    const entry = calls.get(callId);
    if (entry === undefined) continue;
    entry["success"] = data["success"] ?? null;
    const result = data["result"];
    if (isRecord(result)) {
      const content = result["content"];
      const detailed = result["detailedContent"];
      entry["result"] = {
        content: typeof content === "string" ? content : "",
        ...(typeof detailed === "string" ? { detailedContent: detailed } : {}),
      };
    } else if (typeof result === "string") {
      entry["result"] = { content: result };
    }
  }
  return order.map((callId) => calls.get(callId)!);
}

export interface CopilotCliTransportOptions {
  readonly binary?: string;
  readonly spawner?: Spawner;
  readonly timeouts?: TransportTimeouts;
  readonly maxInvocations?: number | null;
  readonly versionProbe?: () => string | null;
}

/**
 * Dispatches one call through the Copilot CLI's headless mode.
 *
 * `spawner` is the sole seam tests replace with a fake process, so the whole
 * state machine runs without touching a real CLI. `maxInvocations` is a
 * per-process hard circuit breaker on CLI spawns -- a safety ceiling on what
 * we DID, never a fabricated cap on what GitHub billed. The slot is reserved
 * before dispatch, so a failed dispatch still consumes it.
 */
export class CopilotCliTransport implements Transport {
  private readonly binary: string;
  private readonly spawner: Spawner;
  private readonly timeouts: TransportTimeouts;
  private readonly maxInvocations: number | null;
  private readonly versionProbe: () => string | null;
  private invocations = 0;

  constructor(options: CopilotCliTransportOptions = {}) {
    this.binary = options.binary ?? "copilot";
    this.spawner = options.spawner ?? defaultSpawner;
    this.timeouts = options.timeouts ?? DEFAULT_TIMEOUTS;
    this.maxInvocations = options.maxInvocations ?? null;
    // Cheap, unbilled --version probe run only on an auth-class failure, to
    // distinguish "the whole CLI is down" from "this call failed". Never a
    // retry of the billed dispatch.
    this.versionProbe =
      options.versionProbe ?? (() => getCliVersion({ binary: this.binary }));
  }

  get invocationCount(): number {
    return this.invocations;
  }

  /**
   * Run one non-interactive turn against `model_id`.
   *
   * The CLI has no separate system-prompt flag: system and user text join into
   * a single prompt. Below the size threshold that prompt is the `-p`
   * argument; above it, `-p` carries a bootstrap and the prompt travels as a
   * temp-file payload. `max_tokens` and `generation_params` are accepted for
   * Transport parity and ignored -- the CLI exposes neither knob.
   */
  async dispatch(request: DispatchRequest): Promise<APIResult> {
    // Reserved synchronously, before the first `await`: the breaker is a
    // count of what this process DID, and two dispatches interleaving at an
    // await would otherwise both see the same slot free.
    if (this.maxInvocations !== null && this.invocations >= this.maxInvocations) {
      return this.errorResult({
        errorClass: ERROR_CLASS_BREAKER,
        rawStdout: "",
        rawStderr:
          `max_invocations_per_session (${this.maxInvocations}) ` +
          "reached for this process; raise the config value or " +
          "restart the process to continue",
      });
    }
    this.invocations += 1;

    const prompt = request.system_prompt
      ? `${request.system_prompt}\n\n${request.user_message}`
      : request.user_message;
    // One path per dispatch, offered to whichever branch takes the call.
    // The argv is measured WITH the flag on it, so the handoff threshold
    // still describes the command line that will actually be spawned.
    const usagePath = this.usageFilePath();
    const inlineArgv = this.buildArgv(prompt, request.model_id, usagePath);
    // Inline stays primary and highest-fidelity; the pull is taken only when
    // the rendered inline command line reaches the ceiling. One helper owns
    // the decision so both branches stay exercised.
    if (renderedUtf16Units(inlineArgv) < HANDOFF_THRESHOLD_UTF16_UNITS) {
      return this.run(inlineArgv, null, usagePath);
    }
    return this.runHandoff(prompt, request.model_id, usagePath);
  }

  /**
   * A path for the CLI to write its usage statistics to, and its removal.
   *
   * Created empty-handed: the CLI writes the file, so offering a path is the
   * whole of the request. Removal is best-effort on every exit path, because
   * a temp file left behind is untidy and a dispatch refused for tidiness
   * would be worse.
   */
  usageFilePath(): string {
    return join(tmpdir(), `dabbler-copilot-usage-${randomBytes(8).toString("hex")}.json`);
  }

  /**
   * The dispatch argv. Identical on both branches except for what `-p`
   * carries: the whole prompt inline, or the handoff bootstrap.
   */
  buildArgv(promptText: string, modelId: string, usagePath: string | null = null): string[] {
    return [
      this.binary,
      "-p", promptText,
      "--model", modelId,
      "--allow-all-tools",
      "--available-tools", READ_ONLY_TOOLS.join(","),
      "--no-custom-instructions",
      "--output-format", "json",
      // The vendor's own count, asked for rather than estimated. Absent when
      // no path was offered, which is how a caller that does not want the
      // file says so.
      ...(usagePath === null ? [] : ["--usage-output-file", usagePath]),
      NO_AUTO_UPDATE_FLAG,
    ];
  }

  /**
   * Dispatch a large prompt through a temp-file pull.
   *
   * The payload is written UTF-8 with no BOM, flushed and CLOSED before spawn
   * -- an open handle blocks the child's read on Windows -- and the file is
   * deleted on every path.
   */
  private async runHandoff(
    prompt: string,
    modelId: string,
    usagePath: string | null = null,
  ): Promise<APIResult> {
    const nonce = randomBytes(16).toString("hex");
    const payloadText = prompt + buildHandoffFooter(nonce);
    const payload = Buffer.from(payloadText, "utf8");
    const path = join(
      tmpdir(),
      `${HANDOFF_FILE_PREFIX}${randomBytes(8).toString("hex")}.txt`,
    );
    try {
      const descriptor = openSync(path, "wx");
      try {
        writeSync(descriptor, payload);
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
    } catch (error: unknown) {
      bestEffortRemove(path);
      return this.errorResult({
        errorClass: ERROR_CLASS_GENERIC,
        rawStdout: "",
        rawStderr: String(error instanceof Error ? error.message : error),
      });
    }
    // Hashed before spawn so a mutation by the agent -- which holds no write
    // tools today, but the grant is policy, not physics -- is observable on
    // the result.
    const handoff: HandoffContext = {
      nonce,
      payloadPath: path,
      payloadBytes: payload.length,
      hashBefore: sha256File(path),
    };
    const argv = this.buildArgv(
      buildHandoffBootstrap(path.replace(/\\/g, "/")),
      modelId,
      usagePath,
    );
    try {
      return await this.run(argv, handoff, usagePath);
    } finally {
      // payload_file_modified is read inside `run`, before this runs, so the
      // file still exists when the result is built.
      if (diagnosticsRetentionEnabled()) {
        process.stderr.write(
          `[dabbler] Copilot handoff payload retained for diagnostics: ${path}\n`,
        );
      } else {
        bestEffortRemove(path);
      }
    }
  }

  private async run(
    argv: readonly string[],
    handoff: HandoffContext | null,
    usagePath: string | null = null,
  ): Promise<APIResult> {
    const timeouts = this.timeouts;

    let proc: ProcessHandle;
    try {
      proc = await spawnWithTimeout(
        this.spawner,
        argv,
        NO_AUTO_UPDATE_ENV,
        timeouts.spawn_seconds,
      );
    } catch (error: unknown) {
      if (error instanceof SpawnTimeout) {
        return this.errorResult({
          errorClass: ERROR_CLASS_SPAWN_TIMEOUT,
          rawStdout: "",
          rawStderr: "",
          handoff,
        });
      }
      // Any spawner failure is a classified result, never an escaping throw.
      return this.errorResult({
        errorClass: isArgvTooLarge(error)
          ? ERROR_CLASS_ARGV_TOO_LARGE
          : ERROR_CLASS_GENERIC,
        rawStdout: "",
        rawStderr: String(error instanceof Error ? error.message : error),
        handoff,
      });
    }

    // Deadlines anchor AFTER the spawn tier resolves, so first-byte and total
    // measure the live process, not wall-clock the spawn stole.
    const spawnReturned = performance.now();
    const stdoutQueue = new LineQueue();
    const stderrQueue = new LineQueue();
    pumpLines(proc.stdout, stdoutQueue);
    pumpLines(proc.stderr, stderrQueue);

    const stdoutLines: string[] = [];
    const firstByteDeadline = spawnReturned + timeouts.first_byte_seconds * 1000;
    const totalDeadline = spawnReturned + timeouts.total_seconds * 1000;
    let timedOutClass: string | null = null;
    let stdoutEof = false;

    while (!stdoutEof) {
      const deadline = stdoutLines.length === 0 ? firstByteDeadline : totalDeadline;
      const remaining = deadline - performance.now();
      if (remaining <= 0) {
        timedOutClass =
          stdoutLines.length === 0
            ? ERROR_CLASS_FIRST_BYTE_TIMEOUT
            : ERROR_CLASS_TOTAL_TIMEOUT;
        break;
      }
      const item = await stdoutQueue.get(remaining);
      if (item === TIMED_OUT) continue;
      if (item === null) {
        stdoutEof = true;
        break;
      }
      stdoutLines.push(item);
    }

    if (timedOutClass !== null) {
      await killAndReap(proc);
      return this.errorResult({
        errorClass: timedOutClass,
        rawStdout: stdoutLines.join(""),
        rawStderr: await drainQueue(stderrQueue, 5.0),
        handoff,
      });
    }

    // stdout hit EOF cleanly. Bound the exit wait by what remains of the total
    // budget so a process that closes stdout but never exits cannot hold the
    // caller past the configured ceiling.
    const remainingTotal = totalDeadline - performance.now();
    const exit =
      remainingTotal <= 0
        ? "timeout"
        : await Promise.race([
            proc.wait(),
            sleep(remainingTotal).then(() => "timeout" as const),
          ]);
    if (exit === "timeout") {
      await killAndReap(proc);
      return this.errorResult({
        errorClass: ERROR_CLASS_TOTAL_TIMEOUT,
        rawStdout: stdoutLines.join(""),
        rawStderr: await drainQueue(stderrQueue, 5.0),
        handoff,
      });
    }

    const rawStdout = stdoutLines.join("");
    const rawStderr = await drainQueue(stderrQueue, 5.0);

    if (exit !== 0) {
      const errorClass = classifyStderr(rawStderr);
      const reprobeCliVersion =
        errorClass === ERROR_CLASS_AUTH ? this.versionProbe() : null;
      return this.errorResult({
        errorClass,
        rawStdout,
        rawStderr,
        exitCode: exit,
        reprobeCliVersion,
        handoff,
      });
    }

    return this.successResult(rawStdout, rawStderr, exit, handoff, usagePath);
  }

  private errorResult(input: {
    errorClass: string;
    rawStdout: string;
    rawStderr: string;
    exitCode?: number | null;
    reprobeCliVersion?: string | null;
    handoff?: HandoffContext | null;
    handoffAckOutcome?: string | null;
  }): APIResult {
    const metadata: Record<string, unknown> = {
      error_class: input.errorClass,
      retryable: RETRYABLE_ERROR_CLASSES.has(input.errorClass),
      exit_code: input.exitCode ?? null,
      stderr_tail: input.rawStderr.slice(-2000),
      reprobe_cli_version: input.reprobeCliVersion ?? null,
      partial_output_discarded: Boolean(input.rawStdout),
      ...handoffMetadataFields(input.handoff ?? null, input.handoffAckOutcome ?? null),
    };
    return {
      content: "",
      input_tokens: 0,
      output_tokens: 0,
      stop_reason: `error:${input.errorClass}`,
      served_model_id: null,
      metadata,
    };
  }

  private successResult(
    rawStdout: string,
    rawStderr: string,
    exitCode: number,
    handoff: HandoffContext | null,
    usagePath: string | null = null,
  ): APIResult {
    const vendorUsage = readVendorUsage(usagePath);
    const [events, malformedLines] = parseJsonl(rawStdout);
    const finalMessage = lastEvent(events, "assistant.message");
    const resultEvent = lastEvent(events, "result");

    const failClosed = (): APIResult =>
      this.errorResult({
        errorClass: ERROR_CLASS_GENERIC,
        rawStdout,
        rawStderr,
        exitCode,
        handoff,
      });

    // A zero exit with no parseable final message, or a corrupt line among
    // the ones this reads, is not trustworthy content -- never patch together
    // a partial answer. Corrupt echoes are counted on the result instead.
    if (finalMessage === null || !corruptionIsUnread(malformedLines)) return failClosed();

    // Every field below came off the wire as arbitrary JSON. A well-formed
    // event with an unexpected field shape must fail closed like a missing
    // event, never escape as an uncaught type error. Message payload fields
    // are wrapped under "data"; the terminal "result" event's fields sit at
    // the envelope's top level.
    const messageData = finalMessage["data"];
    if (!isRecord(messageData)) return failClosed();
    // `?? ""` would be wrong: a `content: null` off the wire is not an empty
    // answer, and Python's type check fails it closed rather than inventing one.
    const rawContent = "content" in messageData ? messageData["content"] : "";
    if (typeof rawContent !== "string") return failClosed();
    let content: string = rawContent;
    const echoedModel = messageData["model"];
    if (echoedModel !== undefined && echoedModel !== null && typeof echoedModel !== "string") {
      return failClosed();
    }
    // `Number()` would silently take "7" or 1.5; require the raw JSON value to
    // be an integer, which is what a token count is.
    const rawOutputTokens = messageData["outputTokens"] ?? 0;
    let outputTokens: number;
    if (rawOutputTokens === null) {
      outputTokens = 0;
    } else if (typeof rawOutputTokens !== "number" || !Number.isInteger(rawOutputTokens)) {
      return failClosed();
    } else {
      outputTokens = rawOutputTokens;
    }
    const usageRaw = resultEvent !== null ? resultEvent["usage"] : null;
    if (usageRaw !== undefined && usageRaw !== null && !isRecord(usageRaw)) {
      return failClosed();
    }
    const usage = isRecord(usageRaw) ? usageRaw : {};
    const rawSessionId = resultEvent !== null ? resultEvent["sessionId"] : null;
    const sessionId = typeof rawSessionId === "string" ? rawSessionId : null;

    // Handoff integrity gate. The footer required an exact final line carrying
    // a nonce that exists only inside the payload file; without it we cannot
    // claim the model saw the whole task, so the content is discarded rather
    // than returned as if it answered the real prompt. Non-retryable: the call
    // is billed and tools may already have run.
    let ackOutcome: string | null = null;
    if (handoff !== null) {
      const validation = validateAck(content, handoff.nonce);
      ackOutcome = validation.outcome;
      if (validation.stripped === null) {
        return this.errorResult({
          errorClass: ERROR_CLASS_HANDOFF_INCOMPLETE,
          rawStdout,
          rawStderr,
          exitCode,
          handoff,
          handoffAckOutcome: ackOutcome,
        });
      }
      content = validation.stripped;
    }

    return {
      content,
      input_tokens: 0, // never reported by the CLI
      output_tokens: outputTokens,
      stop_reason: "end_turn",
      served_model_id:
        typeof echoedModel === "string" && echoedModel.trim() !== "" ? echoedModel : null,
      metadata: {
        error_class: null,
        retryable: false,
        exit_code: exitCode,
        session_id: sessionId,
        // The seat's own number, and where it came from. In-band
        // `usage.premiumRequests` is what the JSONL result event carries;
        // the usage file is what the CLI writes when asked. They agree in
        // the ordinary case, and when they do not the file is the vendor's
        // final word -- so it wins, and `premium_requests_source` says
        // which was used. An estimate presented as a measurement is what
        // made 364 requests invisible until the bill arrived.
        premium_requests: vendorUsage ?? usage["premiumRequests"] ?? null,
        premium_requests_source:
          vendorUsage !== null
            ? PREMIUM_SOURCE_USAGE_FILE
            : usage["premiumRequests"] === undefined || usage["premiumRequests"] === null
              ? null
              : PREMIUM_SOURCE_IN_BAND,
        tool_calls: toolCalls(events),
        // The CLI reports no prompt-token count at all. `input_tokens` on the
        // result must be a number, so it is 0; this says that 0 is the type's
        // floor and not a measurement, and a reader that records cost writes
        // unknown instead.
        input_tokens_reported: false,
        unread_lines_corrupt: malformedLines.length,
        ...handoffMetadataFields(handoff, ackOutcome),
      },
    };
  }
}

// --- CLI preflight -----------------------------------------------------------

/**
 * First line of `copilot --version`, or null when the CLI is absent or
 * failing. The banner's second line is an update nag.
 */
export function getCliVersion(options: { binary?: string } = {}): string | null {
  const binary = options.binary ?? "copilot";
  const resolved = resolveProgram(binary);
  const [command, args] = resolved.isBatch
    ? [
        process.env["COMSPEC"] ?? "cmd.exe",
        ["/d", "/s", "/v:off", "/c", [resolved.path, "--version"].map(quoteForCmd).join(" ")],
      ]
    : [resolved.path, ["--version"]];
  const outcome = spawnSync(command, args, hiddenSpawn({
    encoding: "utf8" as const,
    timeout: 30_000,
    ...(resolved.isBatch ? { windowsVerbatimArguments: true } : {}),
  }));
  if (outcome.error !== undefined || outcome.status !== 0) return null;
  const stripped = (outcome.stdout ?? "").trim();
  if (stripped === "") return null;
  return splitLines(stripped)[0]?.trim() || null;
}

/** CLI-on-PATH check plus a one-token probe. */
export async function preflight(
  options: { binary?: string; transport?: CopilotCliTransport } = {},
): Promise<[boolean, string]> {
  const binary = options.binary ?? "copilot";
  const version = getCliVersion({ binary });
  if (version === null) {
    return [false, `'${binary}' is not on PATH or failed --version`];
  }
  const transport = options.transport ?? new CopilotCliTransport({ binary });
  const result = await transport.dispatch({
    model_id: "claude-sonnet-4.6",
    system_prompt: "",
    user_message: "Reply with the single word OK and nothing else.",
  });
  if (!isOk(result)) {
    return [false, `probe dispatch failed: ${String(result.metadata["error_class"])}`];
  }
  return [true, version];
}

// --- The seat's own model list, free ----------------------------------------
//
// **The seat states its own models, and reading them costs nothing.** There
// is no `copilot models` subcommand, which is true and was read for years as
// "the seat cannot be enumerated"; the list is not on a subcommand. It is in
// the reply to `session/new` over `copilot --acp`, and opening a conversation
// sends no prompt, spends no token and bills no credit. Every engine that
// concluded otherwise did so from the probe's premium-request vocabulary
// further down this file.
//
// So this is the enumeration, and the prompting probe below is not. What the
// probe establishes -- that a named model ANSWERS on this seat -- is
// entitlement, and only a real turn can establish it. What it cannot
// establish is existence, and it must never be run to find out.
//
// The one invariant worth a test of its own: **this path never calls
// `session/prompt`.** A later convenience that "just asks the model to list
// itself" would undo the whole finding and would look, from the outside,
// exactly like this function.

/** How a seat enumeration was obtained. Never inferred by a reader. */
export const SEAT_ENUMERATION_SOURCE = "acp-session-new";

/** One model as the SEAT states it, in the seat's own words. */
export interface SeatModel {
  readonly id: string;
  readonly name: string;
  /** The prefix heuristic's answer, or `""` when the name says nothing. */
  readonly provider: string;
  readonly provider_source: string;
  /**
   * The seat's own cost statement, verbatim -- `"1x"`, `"0.33x"`. A LEGACY
   * request multiplier and not a price: this seat is billed in AI credits
   * per token, and what a session really cost is read by `../seatCost.ts`.
   */
  readonly usage: string | null;
  /** The seat's own word for whether this model is available to it. */
  readonly enablement: string | null;
  readonly price_category: string | null;
  /** The entry as it arrived, so a field this version does not model is kept. */
  readonly raw: Record<string, unknown>;
}

/**
 * What the seat answered when a conversation was opened.
 *
 * `known: false` is a real answer and the reason says which kind it is -- no
 * CLI on PATH, a seat that could not be reached, a reply that carried no
 * model list. An empty list would read as "this seat has no models", which
 * is a thing this framework must never conclude from a failure.
 */
export interface SeatEnumeration {
  readonly known: boolean;
  readonly models: readonly SeatModel[];
  /** The model the seat would use with nothing on the argv. */
  readonly current_model_id: string | null;
  readonly modes: readonly string[];
  readonly reasoning_efforts: readonly string[];
  readonly cli_version: string | null;
  readonly read_at: string;
  readonly source: string;
  readonly reason: string | null;
}

function seatUnknown(reason: string, cliVersion: string | null): SeatEnumeration {
  return {
    known: false,
    models: [],
    current_model_id: null,
    modes: [],
    reasoning_efforts: [],
    cli_version: cliVersion,
    read_at: catalogNow(),
    source: SEAT_ENUMERATION_SOURCE,
    reason,
  };
}

/** A mode id is a protocol URL whose fragment is the name a person uses. */
function modeName(id: unknown): string {
  const text = String(id ?? "");
  const hash = text.lastIndexOf("#");
  return hash < 0 ? text : text.slice(hash + 1);
}

/** One `availableModels` entry, as the seat put it on the wire. */
export function seatModel(entry: Record<string, unknown>): SeatModel {
  const meta = isRecord(entry["_meta"]) ? entry["_meta"] : {};
  const id = String(entry["modelId"] ?? "");
  return {
    id,
    name: typeof entry["name"] === "string" ? entry["name"] : id,
    provider: inferProvider(id),
    provider_source: PROVIDER_SOURCE_HEURISTIC,
    usage: typeof meta["copilotUsage"] === "string" ? meta["copilotUsage"] : null,
    enablement:
      typeof meta["copilotEnablement"] === "string" ? meta["copilotEnablement"] : null,
    price_category:
      typeof meta["copilotPriceCategory"] === "string" ? meta["copilotPriceCategory"] : null,
    raw: { ...entry },
  };
}

/**
 * The seat's model list, read from the protocol and never from a prompt.
 *
 * `client` and `standIn` are the seams a test speaks through; by default this
 * opens the real CLI in `--acp` mode. The conversation is opened in the
 * system temp directory rather than in the caller's tree: the ACP mode has no
 * `--no-custom-instructions`, so a repository cwd would load that repository's
 * `AGENTS.md` into a session opened only to read a list.
 *
 * Permissions are declared `deny` for the same reason a prompt is never sent:
 * there is no turn, so nothing can ask, and a policy that could say yes to
 * something is not one an enumeration should carry.
 */
export async function enumerateSeatModels(
  options: {
    readonly binary?: string;
    readonly cwd?: string;
    readonly client?: AgentClient;
    readonly standIn?: StandIn;
  } = {},
): Promise<SeatEnumeration> {
  const binary = options.binary ?? "copilot";
  const standIn = options.standIn;
  const cliVersion = standIn === undefined ? getCliVersion({ binary }) : null;
  if (standIn === undefined && options.client === undefined && cliVersion === null) {
    return seatUnknown(`'${binary}' is not on PATH or failed --version`, null);
  }
  const client =
    options.client ??
    acpAgent(standIn === undefined ? { ...COPILOT_ACP, program: binary } : COPILOT_ACP, standIn);
  let connection: AgentConnection;
  try {
    connection = await client.open({ cwd: options.cwd ?? tmpdir(), permissions: "deny" });
  } catch (error) {
    return seatUnknown(
      `the seat could not be opened over ${SEAT_ENUMERATION_SOURCE}: ` +
        (error instanceof Error ? error.message : String(error)),
      cliVersion,
    );
  }
  try {
    const models = isRecord(connection.session["models"]) ? connection.session["models"] : null;
    const available = models === null ? null : models["availableModels"];
    if (!Array.isArray(available)) {
      return seatUnknown(
        "the reply to session/new carried no models.availableModels, so what " +
          "this seat can dispatch is unknown rather than empty",
        cliVersion,
      );
    }
    const modes = isRecord(connection.session["modes"])
      ? connection.session["modes"]["availableModes"]
      : null;
    const configOptions = Array.isArray(connection.session["configOptions"])
      ? connection.session["configOptions"].map((option) =>
          isRecord(option) ? option : {},
        )
      : [];
    const effort = configOptions.find((option) => option["id"] === "reasoning_effort");
    const efforts = Array.isArray(effort?.["options"]) ? effort["options"] : [];
    return {
      known: true,
      models: available.filter(isRecord).map(seatModel),
      current_model_id:
        models !== null && typeof models["currentModelId"] === "string"
          ? models["currentModelId"]
          : null,
      modes: (Array.isArray(modes) ? modes : []).filter(isRecord).map((mode) => modeName(mode["id"])),
      reasoning_efforts: efforts
        .filter(isRecord)
        .map((option) => String(option["value"] ?? ""))
        .filter((value) => value !== ""),
      cli_version: cliVersion,
      read_at: catalogNow(),
      source: SEAT_ENUMERATION_SOURCE,
      reason: null,
    };
  } finally {
    await connection.close().catch(() => undefined);
  }
}

// --- Seat catalog lockfile ---------------------------------------------------

/** The providers a seat may front. A name outside this set is not trusted. */
export const KNOWN_PROVIDERS: ReadonlySet<string> = new Set([
  "anthropic",
  "openai",
  "google",
]);


/** The seat's own word, in `_meta.copilotEnablement`, for a model it serves. */
export const SEAT_ENABLEMENT_ENABLED = "enabled";

/**
 * The verb whose absence is the whole incident: with no refresh command, the
 * only remedy for a stale lockfile was hand-editing, and two people took it.
 * No message may report a stale catalog without naming the invocation that
 * resolves it -- an operator told "re-probe the seat" and given no verb does
 * the only thing left.
 *
 */
export const REFRESH_COMMAND = "dabbler copilot refresh";


/**
 * v1 lockfiles spell the probe sample `premium_request_weight`; v2 renamed it
 * because "weight" reads as a rate and the value is a one-call sample. It is
 * NOT a price and never feeds selection; absent means unknown, never free.
 */
/** Where a premium-request number came from. Never inferred by a reader. */
export const PREMIUM_SOURCE_USAGE_FILE = "usage-file";
export const PREMIUM_SOURCE_IN_BAND = "in-band";

/**
 * The premium-request count the CLI wrote, or null.
 *
 * Null covers every way there is no vendor number -- no path offered, no
 * file written, unreadable, not JSON, no numeric count in it -- because the
 * caller does the same thing in all of them: fall back to the in-band figure
 * and say so. A shape that is not a finite number is not a count, and
 * guessing at one is the failure this whole session is about.
 *
 * The key is read leniently across the two spellings the CLI has used, and
 * the file is removed whether or not it parsed.
 */
export function readVendorUsage(path: string | null): number | null {
  if (path === null) return null;
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return null;
  } finally {
    bestEffortRemove(path);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  for (const key of ["premiumRequests", "premium_requests"]) {
    const value = parsed[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

/**
 * Provider is inferred from the model id and nothing else, because the CLI
 * exposes no provider field. Every inference is stamped with this source so
 * the guess is never read as first-party truth.
 */
export const PROVIDER_SOURCE_HEURISTIC = "name-prefix-heuristic";
const PROVIDER_PREFIXES: ReadonlyArray<readonly [string, string]> = [
  ["claude", "anthropic"],
  ["gpt", "openai"],
  ["o1", "openai"],
  ["o3", "openai"],
  ["o4", "openai"],
  ["gemini", "google"],
];

/**
 * The provider a model id names, or `""` when the name says nothing.
 *
 * A guess, and stamped as one by `PROVIDER_SOURCE_HEURISTIC` wherever it is
 * recorded: the seat exposes no provider field, and a guess read as
 * first-party truth is how a cross-provider rule lands on a name nobody
 * placed.
 */
export function inferProvider(modelId: string): string {
  const name = modelId.trim().toLowerCase();
  for (const [prefix, provider] of PROVIDER_PREFIXES) {
    if (name.startsWith(prefix)) return provider;
  }
  return "";
}

/**
 * The seat's router alias: an entry with no `_meta` at all.
 *
 * `auto` arrives stating nothing -- no usage, no enablement, no price
 * category -- because it is the seat choosing, which is the one thing a
 * framework that has to record WHICH model answered cannot use.
 */
export function isSeatAlias(model: SeatModel): boolean {
  return model.usage === null && model.enablement === null;
}

/** Where the CLI keeps the account it is logged in as, beside its home. */
export const SEAT_CONFIG_RELPATH = ".copilot/config.json";

/** The seat this machine dispatches on: a host and a login, or neither. */
export interface SeatIdentity {
  readonly host: string;
  readonly login: string;
}

/**
 * Which seat this machine is logged in to, read from the CLI's own state.
 *
 * Free, and the only reading of a seat's identity there is: the ACP reply
 * states the models and never the account. It is read so that a block can
 * record the seat it was for -- the record this replaces carried a
 * hand-written `seat_id` that nothing ever compared against the machine
 * reading it, which is how one developer's catalog came to be authoritative
 * on every other.
 *
 * Unreadable is `null` and never a guess. A block written without an identity
 * carries a scope that does not claim one, so it will not be believed for a
 * machine whose identity can be read.
 */
let identitySource: SeatIdentity | null = null;
let identityArmed = false;

/**
 * The seam this machine's seat identity is read through.
 *
 * Armed by the suite, because an identity read from `homedir()` is a fact
 * about whoever ran the tests: a block written with a fixture seat would be
 * unreadable on the operator's machine and readable on nobody else's. Under
 * the test runner an unarmed reading answers "no seat" rather than opening
 * the operator's own CLI state, which is the neutral answer and not a guess.
 */
export function setSeatIdentity(identity: SeatIdentity | null): void {
  identitySource = identity;
  identityArmed = true;
}

export function readSeatIdentity(home: string = homedir()): SeatIdentity | null {
  if (identityArmed) return identitySource;
  if (process.env["NODE_TEST_CONTEXT"] !== undefined) return null;
  let text: string;
  try {
    text = readFileSync(join(home, ...SEAT_CONFIG_RELPATH.split("/")), "utf8");
  } catch {
    return null;
  }
  try {
    // The CLI writes `//` banner lines above the JSON it manages.
    const body = text
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//"))
      .join("\n");
    const parsed: unknown = JSON.parse(body);
    const last = isRecord(parsed) ? parsed["lastLoggedInUser"] : null;
    if (!isRecord(last)) return null;
    const host = typeof last["host"] === "string" ? last["host"] : "";
    const login = typeof last["login"] === "string" ? last["login"] : "";
    return host === "" && login === "" ? null : { host, login };
  } catch {
    return null;
  }
}

/** What a seat block was read for: the account, and the CLI that asked. */
export function seatScope(
  identity: SeatIdentity | null = readSeatIdentity(),
): CatalogScope {
  // The seat and nothing else. The CLI's version is provenance and moves on
  // its own schedule -- an upgrade is not a different seat -- so it rides
  // the block as `source_version` rather than deciding whether a reading may
  // be believed. Only what is known: an empty host is not a fact about this
  // machine, and a scope carrying one would make two readings of one seat
  // compare unequal over a field neither of them established.
  const scope: Record<string, string> = {};
  if (identity !== null && identity.host !== "") scope["seat_host"] = identity.host;
  if (identity !== null && identity.login !== "") scope["seat_login"] = identity.login;
  return scope;
}

/**
 * One model as the catalog records it, from what the seat stated for free.
 *
 * Three things arrive in `_meta` and all three are kept. The cost is the
 * seat's own statement with the platform that bills it beside the number,
 * and the price category is the seat's own token, verbatim: `low`,
 * `medium`, `high`, `very_high`. A model the seat states nothing about
 * carries nulls, because a figure invented here would be indistinguishable
 * from one the seat gave.
 */
export function seatCatalogModel(model: SeatModel, at: string): CatalogModel {
  const multiplier = seatMultiplier(model.usage);
  return {
    id: model.id,
    provider: model.provider === "" ? null : model.provider,
    provider_source: model.provider === "" ? "" : model.provider_source,
    display_name: model.name === "" ? null : model.name,
    enabled: model.enablement === SEAT_ENABLEMENT_ENABLED,
    price_category: model.price_category,
    cost:
      multiplier === null || model.usage === null
        ? null
        : {
            usage_multiplier: multiplier,
            stated_as: model.usage.trim(),
            platform: PLATFORM_COPILOT_USAGE,
          },
    listed_at: at,
  };
}

/**
 * The seat's free reading as the catalog's `copilot-cli` block, or `null`
 * when the seat said nothing.
 *
 * `known: false` is a seat that could not be read, and a block is not written
 * from one: an empty listing would retire every model this machine has.
 */
export function seatCatalogBlock(
  enumeration: SeatEnumeration,
  previous: TransportBlock | null,
  identity: SeatIdentity | null = readSeatIdentity(),
): TransportBlock | null {
  if (!enumeration.known) return null;
  const listing = enumeration.models
    .filter((model) => !isSeatAlias(model))
    .map((model) => seatCatalogModel(model, enumeration.read_at));
  const folded = foldListing(previous, listing, enumeration.read_at);
  return {
    refreshed_at: enumeration.read_at,
    source: SOURCE_SEAT,
    ...(enumeration.cli_version ? { source_version: enumeration.cli_version } : {}),
    scope: seatScope(identity),
    models: folded.models,
    retired: folded.retired,
  };
}

/**
 * Write what the seat listed into this machine's catalog.
 *
 * The previous block is read for the scope this reading was taken under, so
 * a block recorded on another seat is folded onto nothing rather than having
 * that seat's models retired into this one.
 */
export function recordSeatEnumeration(
  seat: SeatEnumeration,
  identity: SeatIdentity | null = readSeatIdentity(),
): TransportBlock | null {
  const previous = seatBlock(identity);
  const block = seatCatalogBlock(seat, previous, identity);
  if (block !== null) writeBlock(TRANSPORT_SEAT, block, { at: seat.read_at });
  return block;
}

/**
 * The seat's own multiplier as a number, or null when it says nothing.
 *
 * `"15x"`, `"0.33x"`, `"1x"` -- `copilotUsage`, kept in the catalog verbatim
 * beside it. The number is for ordering and the text is what is shown: a
 * figure invented here would be indistinguishable from one the seat gave.
 */
export function seatMultiplier(usage: string | null): number | null {
  if (usage === null) return null;
  const shaped = /^(\d+(?:\.\d+)?)x$/.exec(usage.trim());
  if (shaped === null) return null;
  const value = Number(shaped[1]);
  return Number.isFinite(value) ? value : null;
}

// --- What a role may draw on ------------------------------------------------

/** What this machine last read from its seat, or `null` for *not read yet*. */
export function seatModels(
  identity: SeatIdentity | null = readSeatIdentity(),
): readonly CatalogModel[] | null {
  return seatBlock(identity)?.models ?? null;
}

/**
 * This machine's seat block, or `null` when it has none it may believe.
 *
 * Scoped, like every reading of a block: a catalog carried over from another
 * account is not a reading of this machine, and a refresh that has not
 * happened yet -- or failed -- must not leave the other account's models
 * dispatchable in the meantime.
 */
export function seatBlock(
  identity: SeatIdentity | null = readSeatIdentity(),
): TransportBlock | null {
  return blockFor(readCatalog(), TRANSPORT_SEAT, seatScope(identity));
}

/**
 * Whether a role may draw on this entry.
 *
 * Two conditions, and each is a different question. The seat states it will
 * dispatch the model -- its own word, free on every enumeration, and the
 * only word there is now that nothing pre-buys a turn to second it. And its
 * provider is one this framework routes to, so cross-provider selection
 * cannot land on a name it could not place. A model the seat has stopped
 * listing is not here to ask about: it left `models` for `retired` when the
 * seat stopped naming it.
 */
function selectable(entry: CatalogModel): boolean {
  return (
    entry.enabled &&
    entry.provider !== null &&
    KNOWN_PROVIDERS.has(entry.provider) &&
    // A vendor lists everything it serves, and most of what it serves cannot
    // answer a prompt. The rule is over the id, because a curated list of the
    // models that may be offered is the second inventory this work deleted.
    isChatModelId(entry.id)
  );
}

/**
 * How a role resolves over the seat's catalog.
 *
 * Split from the caller rather than duplicated: the enumeration rule has one
 * home, and the caller that wants to warn about the resolution reads the
 * same list the caller that dispatches reads.
 */
export function explainRoleCandidates(
  config: RouterConfig,
  models: readonly CatalogModel[],
  role: string,
  excludeProviders: readonly string[] | null = null,
): RoleResolution<readonly [string, string]> {
  return explainRole(
    config,
    role,
    models.filter(selectable).map((entry) => [entry.id, entry.provider as string] as const),
    excludeProviders,
  );
}

export function resolveRoleCandidates(
  config: RouterConfig,
  models: readonly CatalogModel[],
  role: string,
  excludeProviders: readonly string[] | null = null,
): Array<readonly [string, string]> {
  return explainRoleCandidates(config, models, role, excludeProviders).candidates;
}

/** A catalog entry, reduced to what a provider lookup needs. */
export interface ConfirmedCatalogEntry {
  readonly id: string;
  readonly provider: string;
}

// --- Seat catalog refresh ----------------------------------------------------
//
// **A refresh is one thing now, and it cannot bill a token.** It opened a
// conversation to read the list and then spent a turn per model to confirm
// what that list had already said -- so the cheap half needed a scope of its
// own, the expensive half needed a projection, a confirmation prompt and a
// threshold, and every engine that read the record concluded that finding
// out which models exist was expensive. The turn bought one thing nothing
// enforced, and a verification round produces the same evidence for free as
// a by-product of work that was happening anyway.

/** Where a refresh reports to; `process.stdout` in the command line. */
export type Sink = (text: string) => void;

/**
 * Read what the seat lists and record it. Returns a process exit code.
 *
 * No prompt is sent, so there is nothing to project, nothing to authorize
 * and no threshold to sit under: the conversation is opened, the reply's
 * model list is taken, and the conversation is closed.
 */
export async function runRefresh(options: {
  /**
   * The seat's own list, read free. Absent is the same fact as a seat that
   * could not be read: what the catalog holds stands and the run says so.
   */
  enumerate?: () => Promise<SeatEnumeration>;
  dryRun?: boolean;
  out?: Sink;
}): Promise<number> {
  const out = options.out ?? ((text: string) => process.stdout.write(text + "\n"));
  const seat =
    options.enumerate === undefined
      ? seatUnknown("no enumeration was offered to this run", null)
      : await options.enumerate();
  if (!seat.known) {
    out(`the seat could not be read (${seat.reason ?? "no reason given"}); nothing was written.`);
    return 1;
  }
  const listed = seat.models.filter((model) => !isSeatAlias(model)).length;
  if (options.dryRun) {
    out(`the seat lists ${listed} model(s). Nothing was written.`);
    return 0;
  }
  const block = recordSeatEnumeration(seat);
  out(
    `the seat's list was recorded: ${listed} model(s) listed, ` +
      `${block?.retired.length ?? 0} retired. Nothing was spent.`,
  );
  return 0;
}

