// Copilot CLI transport: seat-billed dispatch through the GitHub Copilot
// CLI's headless mode, plus the seat-local catalog lockfile it selects from.
//
// The CLI has no list-models command and no first-party provider field: a
// model's provider is inferable only from its name prefix, and whether a
// model is enabled on a seat is discoverable only by invoking it. The
// lockfile is therefore seat-scoped, empirically-probed truth -- the
// load-bearing record of what this seat can dispatch -- and this module is
// its only writer. A reader without a writer leaves hand-editing as the only
// remedy for a stale file, which destroys exactly the empirical signal the
// file exists to carry.
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

import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import {
  closeSync,
  fsyncSync,
  openSync,
  readFileSync,
  readSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

import { parse as parseToml } from "smol-toml";

import { isArgvTooLarge, quoteForCmd, resolveProgram, terminateTree } from "../checks.ts";
import {
  PROVENANCE_HAND_EDITED,
  PROVENANCE_UNSTAMPED,
  digestText,
  provenance as recordProvenance,
  renderDocument,
  setOrDrop,
  utcNow,
  writeDocument,
  writerId,
  type LockTable,
  type LockValue,
} from "../lockfile.ts";
import { ASSET_DIR } from "../paths.ts";
import { pythonFloatRepr } from "../pythonJson.ts";
import { resolveRole } from "../selection.ts";
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

export const DEFAULT_SPAWN_TIMEOUT_SECONDS = 10.0;
export const DEFAULT_FIRST_BYTE_TIMEOUT_SECONDS = 30.0;
export const DEFAULT_TOTAL_TIMEOUT_SECONDS = 1200.0;

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

export interface TransportTimeouts {
  readonly spawn_seconds: number;
  readonly first_byte_seconds: number;
  readonly total_seconds: number;
}

export const TIMEOUT_FIELD_DEFAULTS: ReadonlyArray<
  readonly [keyof TransportTimeouts, number]
> = [
  ["spawn_seconds", DEFAULT_SPAWN_TIMEOUT_SECONDS],
  ["first_byte_seconds", DEFAULT_FIRST_BYTE_TIMEOUT_SECONDS],
  ["total_seconds", DEFAULT_TOTAL_TIMEOUT_SECONDS],
];

export const DEFAULT_TIMEOUTS: TransportTimeouts = {
  spawn_seconds: DEFAULT_SPAWN_TIMEOUT_SECONDS,
  first_byte_seconds: DEFAULT_FIRST_BYTE_TIMEOUT_SECONDS,
  total_seconds: DEFAULT_TOTAL_TIMEOUT_SECONDS,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Python's `type(x).__name__` for the values a YAML load can produce. */
export function typeName(value: unknown): string {
  if (value === null || value === undefined) return "NoneType";
  if (typeof value === "boolean") return "bool";
  if (typeof value === "number") return Number.isInteger(value) ? "int" : "float";
  if (typeof value === "string") return "str";
  if (Array.isArray(value)) return "list";
  return "dict";
}

/**
 * Effective timeouts for a `transports.copilot-cli` block; each field falls
 * back to its shipped default.
 */
export function resolveTransportTimeouts(cliConfig: unknown): TransportTimeouts {
  const raw = isRecord(cliConfig) ? cliConfig["timeouts"] : undefined;
  const block = isRecord(raw) ? raw : {};
  const values: Record<string, number> = {};
  for (const [name, fallback] of TIMEOUT_FIELD_DEFAULTS) {
    const candidate = name in block ? block[name] : fallback;
    const parsed =
      typeof candidate === "number" && Number.isFinite(candidate)
        ? candidate
        : Number(candidate);
    values[name] = Number.isFinite(parsed) ? parsed : fallback;
  }
  return values as unknown as TransportTimeouts;
}

/**
 * Throw unless `block` is a valid `timeouts:` mapping.
 *
 * Unknown keys are rejected rather than ignored: a typo'd `total_second`
 * silently keeping the default is exactly the failure this exists to end.
 * The trio must satisfy spawn < first_byte < total, or an inner ceiling can
 * never fire and a stall is misclassified at the outer one.
 */
export function validateTransportTimeouts(block: unknown): void {
  if (block === null || block === undefined) return;
  if (!isRecord(block)) {
    throw new Error(
      `transports.copilot-cli.timeouts must be a mapping, got ${typeName(block)}`,
    );
  }
  const known = TIMEOUT_FIELD_DEFAULTS.map(([name]) => String(name));
  const unknown = Object.keys(block)
    .filter((key) => !known.includes(key))
    .sort();
  if (unknown.length > 0) {
    throw new Error(
      `transports.copilot-cli.timeouts has unknown key(s): ${render(unknown)}. ` +
        `Known: ${render([...known].sort())}`,
    );
  }
  for (const [name] of TIMEOUT_FIELD_DEFAULTS) {
    if (!(name in block)) continue;
    const value = block[name];
    // A boolean is an int in Python; `true` here is a config error, not 1s.
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new Error(
        `transports.copilot-cli.timeouts.${name} must be a number, ` +
          `got ${typeName(value)}`,
      );
    }
    if (value <= 0) {
      throw new Error(
        `transports.copilot-cli.timeouts.${name} must be > 0, got ${value}`,
      );
    }
  }
  const resolved = resolveTransportTimeouts({ timeouts: block });
  if (
    !(
      resolved.spawn_seconds < resolved.first_byte_seconds &&
      resolved.first_byte_seconds < resolved.total_seconds
    )
  ) {
    throw new Error(
      "transports.copilot-cli.timeouts must satisfy spawn_seconds < " +
        "first_byte_seconds < total_seconds; got " +
        `${resolved.spawn_seconds} / ${resolved.first_byte_seconds} / ` +
        `${resolved.total_seconds}`,
    );
  }
}

/** Python renders a list of strings as `['a', 'b']`. */
function render(items: readonly string[]): string {
  return `[${items.map((item) => `'${item}'`).join(", ")}]`;
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
  const [program, ...rest] = argv;
  const merged: NodeJS.ProcessEnv = env ? { ...process.env, ...env } : { ...process.env };
  const options: SpawnOptions = {
    stdio: ["ignore", "pipe", "pipe"],
    env: merged,
    shell: false,
    // Its own process group, so a timeout's tree kill reaches the seat and
    // not the router that spawned it. Windows gets the same reach from
    // `taskkill /T` and needs no flag.
    ...(process.platform === "win32" ? {} : { detached: true }),
  };
  const resolved = resolveProgram(String(program));
  const child = resolved.isBatch
    ? spawn(
        process.env["COMSPEC"] ?? "cmd.exe",
        ["/d", "/s", "/v:off", "/c", [resolved.path, ...rest].map(quoteForCmd).join(" ")],
        { ...options, windowsVerbatimArguments: true },
      )
    : spawn(resolved.path, rest, options);
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
 * `result.content` is kept and `detailedContent` dropped: the former is what
 * the model was shown, which is the only copy any fidelity claim can be made
 * against.
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
      entry["result"] = { content: typeof content === "string" ? content : "" };
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
    const inlineArgv = this.buildArgv(prompt, request.model_id);
    // Inline stays primary and highest-fidelity; the pull is taken only when
    // the rendered inline command line reaches the ceiling. One helper owns
    // the decision so both branches stay exercised.
    if (renderedUtf16Units(inlineArgv) < HANDOFF_THRESHOLD_UTF16_UNITS) {
      return this.run(inlineArgv, null);
    }
    return this.runHandoff(prompt, request.model_id);
  }

  /**
   * The dispatch argv. Identical on both branches except for what `-p`
   * carries: the whole prompt inline, or the handoff bootstrap.
   */
  buildArgv(promptText: string, modelId: string): string[] {
    return [
      this.binary,
      "-p", promptText,
      "--model", modelId,
      "--allow-all-tools",
      "--available-tools", READ_ONLY_TOOLS.join(","),
      "--no-custom-instructions",
      "--output-format", "json",
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
  private async runHandoff(prompt: string, modelId: string): Promise<APIResult> {
    const nonce = randomBytes(16).toString("hex");
    const payloadText = prompt + buildHandoffFooter(nonce);
    const payload = Buffer.from(payloadText, "utf8");
    const path = join(
      tmpdir(),
      `dabbler-copilot-handoff-${randomBytes(8).toString("hex")}.txt`,
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
    );
    try {
      return await this.run(argv, handoff);
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

    return this.successResult(rawStdout, rawStderr, exit, handoff);
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
  ): APIResult {
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

    // A zero exit with no parseable final message (or any malformed line) is
    // not trustworthy content -- never patch together a partial answer.
    if (finalMessage === null || malformedLines.length > 0) return failClosed();

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
        premium_requests: usage["premiumRequests"] ?? null,
        tool_calls: toolCalls(events),
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
  const outcome = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 30_000,
    ...(resolved.isBatch ? { windowsVerbatimArguments: true } : {}),
  });
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

// --- Seat catalog lockfile ---------------------------------------------------

/** The providers a seat may front. A name outside this set is not trusted. */
export const KNOWN_PROVIDERS: ReadonlySet<string> = new Set([
  "anthropic",
  "openai",
  "google",
]);

export const ENABLEMENT_CONFIRMED = "confirmed";
export const ENABLEMENT_UNCONFIRMED = "unconfirmed";

/**
 * The verb whose absence is the whole incident: with no refresh command, the
 * only remedy for a stale lockfile was hand-editing, and two people took it.
 * No message may report a stale catalog without naming the invocation that
 * resolves it -- an operator told "re-probe the seat" and given no verb does
 * the only thing left.
 *
 */
export const REFRESH_COMMAND = "dabbler copilot refresh";

/** The lock the seat catalog ships in, beside the package that reads it. */
export const CATALOG_LOCK_PATH = join(ASSET_DIR, "copilot-catalog.lock");

/**
 * v1 lockfiles spell the probe sample `premium_request_weight`; v2 renamed it
 * because "weight" reads as a rate and the value is a one-call sample. It is
 * NOT a price and never feeds selection; absent means unknown, never free.
 */
const LEGACY_PROBE_PREMIUM_KEY = "premium_request_weight";
const PROBE_PREMIUM_KEY = "probe_premium_requests";

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
 * One trivial turn is the only way to learn whether a model is enabled on a
 * seat: an invalid model name and a policy-blocked one return the identical
 * CLI error shape, so nothing may be inferred from the name.
 */
export const PROBE_PROMPT = "Reply with the single word OK and nothing else.";

/** A malformed lock file. Python raises `ValueError` at each of these. */
export class CatalogError extends Error {}

/**
 * Provider by name prefix, or `""` when the name says nothing.
 *
 * A declared heuristic: callers record `PROVIDER_SOURCE_HEURISTIC` alongside
 * it. Guessing wrong is worse than admitting ignorance, because provider is
 * what a same-provider verification exclusion turns on.
 */
export function inferProvider(modelId: string): string {
  const normalized = String(modelId).trim().toLowerCase();
  for (const [prefix, provider] of PROVIDER_PREFIXES) {
    if (normalized.startsWith(prefix)) return provider;
  }
  return "";
}

export interface ModelEntry {
  readonly id: string;
  readonly provider: string;
  readonly enablement: string;
  /**
   * A one-call sample of what this model cost, which the seat reports as an
   * integer for premium models and a fraction for sub-premium ones. Not a
   * price, never fed to selection; `null` is unknown and never free.
   */
  readonly probe_premium_requests: number | null;
  readonly echoed_model: unknown;
  readonly provider_source: string;
  readonly confirmed_at: string | null;
  readonly confirmed_on_cli_version: string | null;
  /**
   * The most recent probe that FAILED, with the failure's own error class.
   * A failed probe is not a withdrawn model, so it annotates rather than
   * replaces the confirmation above it.
   */
  readonly last_probe_error: string | null;
  readonly last_probe_at: string | null;
  /**
   * Keys this version does not model, in file order, so a writer never
   * silently drops what a future version wrote. Not compared: it is the
   * unmodelled remainder, and byte-identity is asserted on rendered text.
   */
  readonly raw: Record<string, unknown>;
}

/** A `ModelEntry` with the dataclass defaults filled in. */
export function modelEntry(
  fields: Partial<ModelEntry> & { readonly id: string },
): ModelEntry {
  return {
    provider: "",
    enablement: ENABLEMENT_UNCONFIRMED,
    probe_premium_requests: null,
    echoed_model: null,
    provider_source: "",
    confirmed_at: null,
    confirmed_on_cli_version: null,
    last_probe_error: null,
    last_probe_at: null,
    raw: {},
    ...fields,
  };
}

export interface CatalogMeta {
  readonly cli_version: string;
  readonly cli_version_pin_required: boolean;
  readonly seat_id: string;
  readonly seat_label: string;
  readonly probed_at: string | null;
  /**
   * The candidate universe lives in the file, not in code: the CLI cannot
   * enumerate its models, so this is a maintained list and adding a model
   * must be a data edit that leaves the file the whole truth about the seat.
   */
  readonly candidate_universe: readonly string[];
  /**
   * The writer stamp: what wrote the file, when, and a digest of what was
   * written. All three absent means no writer has ever touched it.
   */
  readonly written_by: string | null;
  readonly written_at: string | null;
  readonly content_digest: string | null;
  readonly raw: Record<string, unknown>;
}

export function catalogMeta(
  fields: Partial<CatalogMeta> & {
    readonly cli_version: string;
    readonly seat_id: string;
  },
): CatalogMeta {
  return {
    cli_version_pin_required: false,
    seat_label: "",
    probed_at: null,
    candidate_universe: [],
    written_by: null,
    written_at: null,
    content_digest: null,
    raw: {},
    ...fields,
  };
}

export interface Catalog {
  readonly meta: CatalogMeta;
  readonly models: readonly ModelEntry[];
}

export function confirmedModels(catalog: Catalog): ModelEntry[] {
  return catalog.models.filter((entry) => entry.enablement === ENABLEMENT_CONFIRMED);
}

/**
 * Provider of a CONFIRMED entry only. A bare, unconfirmed model id has no
 * trustworthy provenance, and this value can drive a same-provider safety
 * exclusion -- callers fail closed on `null`.
 */
export function providerOf(catalog: Catalog, modelId: string): string | null {
  for (const entry of confirmedModels(catalog)) {
    if (entry.id === modelId) return entry.provider;
  }
  return null;
}

/**
 * A string off the wire or `null`; anything else is not a string and must
 * not become one by coercion.
 */
function optionalString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * A request-count sample off the wire, or `null` for unknown.
 *
 * The seat reports `usage.premiumRequests` as `0` for included models and as
 * a FRACTION for sub-premium ones -- 0.33 measured on `claude-haiku-4.5` --
 * so a float here is a measurement, not noise, and discarding it would file
 * the cheapest models on the seat as the most uncertain. A bool, a string, a
 * list, a negative or a non-finite value is not a count, and unknown is the
 * honest answer for those -- never zero, which would read as free.
 */
function coerceProbePremiumRequests(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function readCandidateUniverse(
  metaRaw: Record<string, unknown>,
  path: string,
): string[] {
  const declared = metaRaw["candidate_universe"];
  if (declared === undefined || declared === null) return [];
  if (
    !Array.isArray(declared) ||
    !declared.every((item) => typeof item === "string" && item !== "")
  ) {
    throw new CatalogError(
      `catalog lockfile '${path}' declares a malformed ` +
        "[meta].candidate_universe: it must be an array of model id strings",
    );
  }
  return declared as string[];
}

/**
 * Read a seat catalog lockfile.
 *
 * Raw bytes, not `readText`: Python hands this file to `tomllib` in binary,
 * so a CRLF checkout is what its parser sees too.
 */
export function loadCatalog(path: string): Catalog {
  const data: unknown = parseToml(readFileSync(path, "utf8"));
  const metaRaw = isRecord(data) ? data["meta"] : undefined;
  if (!isRecord(metaRaw)) {
    throw new CatalogError(`catalog lockfile '${path}' has no [meta] table`);
  }
  for (const required of ["cli_version", "seat_id"]) {
    if (!(required in metaRaw)) {
      throw new CatalogError(
        `catalog lockfile [meta] is missing required key '${required}'`,
      );
    }
  }
  const meta: CatalogMeta = {
    cli_version: String(metaRaw["cli_version"]),
    // Default off: the seat CLI updates itself, so a pin that defaulted to
    // strict would turn every routine auto-update into a dead seat.
    cli_version_pin_required: Boolean(metaRaw["cli_version_pin_required"] ?? false),
    seat_id: String(metaRaw["seat_id"]),
    seat_label: String(metaRaw["seat_label"] ?? ""),
    probed_at: optionalString(metaRaw["probed_at"]),
    candidate_universe: readCandidateUniverse(metaRaw, path),
    written_by: optionalString(metaRaw["written_by"]),
    written_at: optionalString(metaRaw["written_at"]),
    content_digest: optionalString(metaRaw["content_digest"]),
    raw: { ...metaRaw },
  };
  const models: ModelEntry[] = [];
  const rows = isRecord(data) && Array.isArray(data["models"]) ? data["models"] : [];
  for (const row of rows) {
    if (!isRecord(row) || !("id" in row)) {
      throw new CatalogError(
        `catalog lockfile has a malformed [[models]] entry: ${JSON.stringify(row)}`,
      );
    }
    const rawProbe =
      PROBE_PREMIUM_KEY in row ? row[PROBE_PREMIUM_KEY] : row[LEGACY_PROBE_PREMIUM_KEY];
    models.push({
      id: String(row["id"]),
      provider: String(row["provider"] ?? ""),
      enablement: String(row["enablement"] ?? ENABLEMENT_UNCONFIRMED),
      probe_premium_requests: coerceProbePremiumRequests(rawProbe),
      echoed_model: row["echoed_model"] ?? null,
      provider_source: String(row["provider_source"] ?? ""),
      confirmed_at: optionalString(row["confirmed_at"]),
      confirmed_on_cli_version: optionalString(row["confirmed_on_cli_version"]),
      last_probe_error: optionalString(row["last_probe_error"]),
      last_probe_at: optionalString(row["last_probe_at"]),
      raw: { ...row },
    });
  }
  return { meta, models };
}

export interface CatalogValidationResult {
  readonly ok: boolean;
  readonly reasons: readonly string[];
  readonly warnings: readonly string[];
}

/**
 * Fail-closed catalog rules: provenance on every confirmed entry and provider
 * diversity (cross-provider verification needs >= 2 distinct providers). Never
 * throws -- callers branch on `.ok` / `.reasons`.
 *
 * CLI version drift is a WARNING, not a failure. The seat CLI auto-updates on
 * its own schedule, so a pinned lockfile goes stale with no action by the
 * operator; refusing the whole seat for that stranded two people on a working
 * seat and taught both to hand-edit the pin, which is the one outcome that
 * destroys the signal. A model that genuinely vanished from the seat fails its
 * own dispatch with a real error -- per-model and honest, rather than
 * all-or-nothing on a version string. Strict pinning remains available via
 * `cli_version_pin_required = true`.
 *
 * Every message about a stale or unstamped catalog names the exact refresh
 * invocation that resolves it. An operator told only that the file is wrong,
 * and given no verb, edits the file.
 */
export function validateCatalog(
  catalog: Catalog,
  options: { liveCliVersion?: string | null } = {},
): CatalogValidationResult {
  const liveCliVersion = options.liveCliVersion ?? null;
  const reasons: string[] = [];
  const warnings: string[] = [];

  if (liveCliVersion !== null && liveCliVersion !== catalog.meta.cli_version) {
    const drift =
      `CLI version drift: lock pinned to '${catalog.meta.cli_version}', ` +
      `live CLI reports '${liveCliVersion}'`;
    if (catalog.meta.cli_version_pin_required) {
      reasons.push(
        drift +
          " (strict pinning is on via cli_version_pin_required). " +
          `Re-date the lock with \`${REFRESH_COMMAND} --quorum\`, or turn ` +
          "strict pinning off.",
      );
    } else {
      warnings.push(
        drift +
          "; entries confirmed on the pinned version are still " +
          `trusted. Re-date the lock with \`${REFRESH_COMMAND} --quorum\` ` +
          `(or \`${REFRESH_COMMAND} --stale\` to re-confirm every entry ` +
          "earned on another build).",
      );
    }
  }

  const howItCameToBe = catalogProvenance(catalog);
  if (howItCameToBe === PROVENANCE_HAND_EDITED) {
    warnings.push(
      "hand-edited provenance: the contents do not match the digest " +
        `this file's own writer stamp records (${String(catalog.meta.written_by)} ` +
        `at ${String(catalog.meta.written_at)}). A hand edit is not evidence -- ` +
        "the values here are empirical or they are nothing. Re-establish " +
        `them with \`${REFRESH_COMMAND} --quorum\`.`,
    );
  } else if (howItCameToBe === PROVENANCE_UNSTAMPED) {
    warnings.push(
      "no writer stamp: this lockfile predates the writer, so a hand " +
        `edit cannot be ruled out. \`${REFRESH_COMMAND} --quorum\` writes ` +
        "one.",
    );
  }

  const confirmed = confirmedModels(catalog);
  for (const entry of confirmed) {
    if (!entry.provider || !KNOWN_PROVIDERS.has(entry.provider)) {
      reasons.push(
        `Missing/unknown provenance on confirmed entry '${entry.id}': ` +
          `provider='${entry.provider}'. Re-probe it with ` +
          `\`${REFRESH_COMMAND} --models ${entry.id}\`.`,
      );
    }
  }

  const distinct = new Set(
    confirmed.map((entry) => entry.provider).filter((name) => KNOWN_PROVIDERS.has(name)),
  );
  if (distinct.size < 2) {
    reasons.push(
      "Same-provider-only catalog: confirmed entries resolve to " +
        `${render([...distinct].sort())} (need >= 2 distinct providers). A quorum ` +
        "refresh only re-probes what is already confirmed, so widen it: " +
        `\`${REFRESH_COMMAND} --models <ids>\`, or \`${REFRESH_COMMAND} --all\` ` +
        "for the whole declared universe.",
    );
  }

  return { ok: reasons.length === 0, reasons, warnings };
}

// --- Seat catalog writer -----------------------------------------------------
//
// The record format itself lives in `../lockfile.ts`, because the direct-API
// enumeration writes the same shape and a second renderer would let the two
// records disagree about how a value is written or how a hand edit is
// detected.

/**
 * A value read out of a lock file, on its way back into one.
 *
 * `smol-toml` answers a date as a `Date` and a large integer as a `bigint`,
 * neither of which the flat renderer can write. They are refused here rather
 * than coerced, which is the module's own rule: a value the writer cannot
 * render must be dealt with where it arrived from, not admitted.
 */
function asLockValue(key: string, value: unknown): LockValue {
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    Array.isArray(value)
  ) {
    return value as LockValue;
  }
  throw new Error(
    `catalog key '${key}' holds a value the lockfile cannot represent: ` +
      `${String(value)}. Coerce it where it arrived from -- a value the ` +
      "writer cannot render must never reach the writer.",
  );
}

function fromRaw(raw: Record<string, unknown>): LockTable {
  const table: LockTable = {};
  for (const [key, value] of Object.entries(raw)) table[key] = asLockValue(key, value);
  return table;
}

function metaMapping(meta: CatalogMeta): LockTable {
  const out = fromRaw(meta.raw);
  out["cli_version"] = meta.cli_version;
  out["cli_version_pin_required"] = meta.cli_version_pin_required;
  out["seat_id"] = meta.seat_id;
  setOrDrop(out, "seat_label", meta.seat_label || null);
  setOrDrop(out, "probed_at", meta.probed_at);
  setOrDrop(
    out,
    "candidate_universe",
    meta.candidate_universe.length > 0 ? [...meta.candidate_universe] : null,
  );
  setOrDrop(out, "written_by", meta.written_by);
  setOrDrop(out, "written_at", meta.written_at);
  setOrDrop(out, "content_digest", meta.content_digest);
  return out;
}

function entryMapping(entry: ModelEntry): LockTable {
  // Starting from the entry as read keeps unmodelled keys, and keeps every key
  // in its original position: an untouched entry re-renders byte for byte,
  // which is what makes a partial refresh safe.
  const out = fromRaw(entry.raw);
  out["id"] = entry.id;
  setOrDrop(out, "provider", entry.provider || null);
  setOrDrop(out, "provider_source", entry.provider_source || null);
  out["enablement"] = entry.enablement;
  setOrDrop(out, "confirmed_at", entry.confirmed_at);
  setOrDrop(out, "confirmed_on_cli_version", entry.confirmed_on_cli_version);
  // Write the sample back under the name it was read under, in place, so a
  // v1-spelled entry nobody probed re-renders unchanged.
  const probeKey =
    LEGACY_PROBE_PREMIUM_KEY in out && !(PROBE_PREMIUM_KEY in out)
      ? LEGACY_PROBE_PREMIUM_KEY
      : PROBE_PREMIUM_KEY;
  delete out[
    probeKey === LEGACY_PROBE_PREMIUM_KEY ? PROBE_PREMIUM_KEY : LEGACY_PROBE_PREMIUM_KEY
  ];
  setOrDrop(out, probeKey, entry.probe_premium_requests);
  setOrDrop(out, "echoed_model", asLockValue("echoed_model", entry.echoed_model));
  setOrDrop(out, "last_probe_error", entry.last_probe_error);
  setOrDrop(out, "last_probe_at", entry.last_probe_at);
  return out;
}

/**
 * Render `catalog` back to the lockfile text the reader accepts.
 *
 * Round-trip is the contract: `loadCatalog` of this text yields an equal
 * catalog, and a catalog nothing has touched renders back to the bytes it was
 * read from.
 */
export function dumpsCatalog(catalog: Catalog): string {
  const tables: Array<readonly [string, LockTable]> = [
    ["[meta]", metaMapping(catalog.meta)],
  ];
  for (const entry of catalog.models) tables.push(["[[models]]", entryMapping(entry)]);
  return renderDocument(tables);
}

/**
 * Write the lockfile, stamped. The only writer there is -- a lockfile with no
 * writer leaves hand-editing as the sole remedy for staleness. Returns the
 * stamped catalog that was written.
 */
export function writeCatalog(
  path: string,
  catalog: Catalog,
  options: { writtenAt?: string | null } = {},
): Catalog {
  const stamped = stampCatalog(catalog, options);
  writeDocument(path, dumpsCatalog(stamped));
  return stamped;
}

// --- Writer stamp and hand-edit detection ------------------------------------
//
// The rule this repo already holds for `.dabbler/runs/` -- machine-written,
// never hand-repaired -- is checkable here instead of aspirational. The
// verdict itself is `lockfile.provenance`; what belongs to this module is only
// which fields of the seat catalog the digest covers.

/**
 * SHA-256 over the catalog rendered with the digest key itself elided.
 *
 * Elided rather than blanked, so the digest is a function of the content it
 * covers and of nothing else: the same content digests the same whether or not
 * the file has been stamped before.
 */
export function catalogDigest(catalog: Catalog): string {
  return digestText(
    dumpsCatalog({
      meta: { ...catalog.meta, content_digest: null },
      models: catalog.models,
    }),
  );
}

/** The catalog with a fresh writer stamp over its current contents. */
export function stampCatalog(
  catalog: Catalog,
  options: { writtenAt?: string | null } = {},
): Catalog {
  const meta: CatalogMeta = {
    ...catalog.meta,
    written_by: writerId("dabbler.copilot"),
    written_at: options.writtenAt ?? utcNow(),
    content_digest: null,
  };
  return {
    meta: { ...meta, content_digest: catalogDigest({ meta, models: catalog.models }) },
    models: catalog.models,
  };
}

/** How this file came to hold what it holds. */
export function catalogProvenance(catalog: Catalog): string {
  return recordProvenance({
    storedDigest: catalog.meta.content_digest,
    recomputedDigest: catalogDigest(catalog),
    writtenBy: catalog.meta.written_by,
    writtenAt: catalog.meta.written_at,
  });
}

// --- Seat catalog discovery --------------------------------------------------

/**
 * Probe each id in `modelIds` and report what the seat did.
 *
 * One billed turn per id, in the order given, with no opinion about which ids
 * are worth probing -- scope selection is the caller's policy and its cost.
 * Entries come back detached from any catalog; `mergeCatalog` decides what they
 * do to the file.
 */
export async function discoverModels(
  modelIds: readonly string[],
  options: {
    transport: Transport;
    cliVersion?: string | null;
    clock?: () => string;
  },
): Promise<ModelEntry[]> {
  const clock = options.clock ?? utcNow;
  const stamp = clock();
  const entries: ModelEntry[] = [];
  for (const modelId of modelIds) {
    const result = await options.transport.dispatch({
      model_id: modelId,
      system_prompt: "",
      user_message: PROBE_PROMPT,
    });
    const provider = inferProvider(modelId);
    if (isOk(result)) {
      entries.push(
        modelEntry({
          id: modelId,
          provider,
          provider_source: provider ? PROVIDER_SOURCE_HEURISTIC : "",
          enablement: ENABLEMENT_CONFIRMED,
          confirmed_at: stamp,
          confirmed_on_cli_version: options.cliVersion ?? null,
          echoed_model: optionalString(result.served_model_id),
          probe_premium_requests: coerceProbePremiumRequests(
            result.metadata["premium_requests"],
          ),
        }),
      );
      continue;
    }
    entries.push(
      modelEntry({
        id: modelId,
        provider,
        provider_source: provider ? PROVIDER_SOURCE_HEURISTIC : "",
        enablement: ENABLEMENT_UNCONFIRMED,
        last_probe_error: String(result.metadata["error_class"] || ERROR_CLASS_GENERIC),
        last_probe_at: stamp,
      }),
    );
  }
  return entries;
}

function mergeEntry(prior: ModelEntry, fresh: ModelEntry): ModelEntry {
  if (fresh.enablement !== ENABLEMENT_CONFIRMED) {
    // A transient CLI failure is not a withdrawn model. Demoting a confirmed
    // entry on one bad probe would discard provenance that cost a billed call
    // to earn, so the failure annotates and the confirmation stands, visibly
    // stale, until an operator says otherwise.
    return {
      ...prior,
      last_probe_error: fresh.last_probe_error,
      last_probe_at: fresh.last_probe_at,
    };
  }
  return {
    ...prior,
    provider: fresh.provider || prior.provider,
    provider_source: fresh.provider_source || prior.provider_source,
    enablement: ENABLEMENT_CONFIRMED,
    confirmed_at: fresh.confirmed_at,
    confirmed_on_cli_version: fresh.confirmed_on_cli_version,
    // A run that reported no sample leaves the previous one standing: the
    // sample is a one-call observation, and losing it would blind the cost
    // preview that keeps a refresh from being all-or-nothing.
    probe_premium_requests:
      fresh.probe_premium_requests !== null
        ? fresh.probe_premium_requests
        : prior.probe_premium_requests,
    echoed_model: fresh.echoed_model || prior.echoed_model,
    last_probe_error: null,
    last_probe_at: null,
  };
}

/**
 * Fold `probed` results into `catalog`, touching nothing else.
 *
 * A refresh that probed three models rewrites those three; every other entry,
 * including its provenance and any key this version does not model, survives
 * unchanged. That is what makes a cheap partial refresh honest -- a scoped run
 * must never present itself as a full re-probe.
 */
export function mergeCatalog(
  catalog: Catalog,
  probed: readonly ModelEntry[],
  options: { cliVersion?: string | null; probedAt?: string | null } = {},
): Catalog {
  const freshById = new Map(probed.map((entry) => [entry.id, entry]));
  const existingIds = new Set(catalog.models.map((entry) => entry.id));
  const merged = catalog.models.map((entry) => {
    const fresh = freshById.get(entry.id);
    return fresh === undefined ? entry : mergeEntry(entry, fresh);
  });
  merged.push(...probed.filter((entry) => !existingIds.has(entry.id)));
  return {
    meta: {
      ...catalog.meta,
      cli_version: options.cliVersion || catalog.meta.cli_version,
      probed_at: options.probedAt || catalog.meta.probed_at,
    },
    models: merged,
  };
}

/**
 * The lockfile `transports.copilot-cli.lockfile` names, resolved relative to
 * the config that named it.
 *
 * One resolution, in the module that owns the file: a reader and a writer that
 * disagreed about which file they mean would let a refresh spend real requests
 * updating a lockfile nothing dispatches from.
 */
export function resolveLockfilePath(config: Record<string, unknown>): string {
  const transports = isRecord(config["transports"]) ? config["transports"] : {};
  const cliConfig = transports["copilot-cli"];
  if (!isRecord(cliConfig) || !cliConfig["lockfile"]) {
    throw new CatalogError(
      "router-config.yaml has no transports.copilot-cli.lockfile, so no " +
        "seat catalog is named",
    );
  }
  const lockfile = String(cliConfig["lockfile"]);
  if (isAbsolute(lockfile)) return lockfile;
  const configPath = config["_config_path"];
  const base = configPath ? dirname(String(configPath)) : resolve(".");
  return join(base, lockfile);
}

/**
 * Ordered `[model_id, provider]` candidates for `role` on this seat.
 *
 * The seat's enumeration is the confirmed catalog -- nothing infers
 * availability from a name, so an unconfirmed entry is not a candidate. The
 * role itself is applied by `selection.resolveRole`, which is the one
 * implementation both transports resolve a role through.
 */
export function resolveRoleCandidates(
  config: RouterConfig,
  catalog: Catalog,
  role: string,
  excludeProviders: readonly string[] | null = null,
): Array<readonly [string, string]> {
  return resolveRole(
    config,
    role,
    catalog.models
      .filter(
        (entry) =>
          entry.enablement === ENABLEMENT_CONFIRMED &&
          entry.provider !== "" &&
          KNOWN_PROVIDERS.has(entry.provider),
      )
      .map((entry) => [entry.id, entry.provider] as const),
    excludeProviders,
  );
}

/** A confirmed catalog entry, reduced to what a provider lookup needs. */
export interface ConfirmedCatalogEntry {
  readonly id: string;
  readonly provider: string;
}

/**
 * The shipped catalog's CONFIRMED entries, or an empty list.
 *
 * Best-effort by design, and the only reader that is: an unreadable or
 * malformed lock resolves nothing rather than stopping identity resolution,
 * because a bare model id with no trustworthy provenance is exactly what its
 * caller must fail closed on. Everything it knows still comes from
 * `loadCatalog`, so the lock file has one parser and one set of rules about
 * what a malformed entry is.
 */
export function confirmedCatalogEntries(
  path: string = CATALOG_LOCK_PATH,
): ConfirmedCatalogEntry[] {
  try {
    return confirmedModels(loadCatalog(path));
  } catch {
    return [];
  }
}

// --- Seat catalog refresh ----------------------------------------------------
//
// Scope is the design, not a convenience. v1's refresh had exactly one mode --
// the whole universe, 39+ premium requests -- so it was run once and never
// again, and a lockfile whose only writer is too expensive to run is a
// lockfile people edit by hand. Every scope here is named, the cheap one is
// the default, and the expensive one has to be asked for.

export const SCOPE_QUORUM = "quorum";
export const SCOPE_MODELS = "models";
export const SCOPE_STALE = "stale";
export const SCOPE_ALL = "all";

/**
 * Projected premium requests above which the run asks before spending. The
 * quorum's cost on a three-provider seat sits well under it: the cheap path
 * must never acquire friction, or it stops being run for the same reason v1's
 * did.
 */
export const CONFIRM_THRESHOLD_PREMIUM_REQUESTS = 5;

/**
 * Sort key for "cheapest first". An unknown sample sorts after every known
 * one: unknown means never measured, and never measured is never free.
 */
function costOrder(entry: ModelEntry): [number, number] {
  const sample = entry.probe_premium_requests;
  return sample === null ? [1, 0] : [0, sample];
}

function compareCost(left: ModelEntry, right: ModelEntry): number {
  const [leftUnknown, leftSample] = costOrder(left);
  const [rightUnknown, rightSample] = costOrder(right);
  return leftUnknown - rightUnknown || leftSample - rightSample;
}

function sampleText(sample: number | null): string {
  return sample === null ? "unknown" : pythonNumber(sample);
}

/**
 * Python's `str()` of a sample.
 *
 * A whole number is a count and prints as one; a fraction goes through
 * CPython's own `repr`, because JavaScript switches to exponent notation at a
 * different magnitude and would print a different number for the same
 * measurement.
 */
function pythonNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : pythonFloatRepr(value);
}

/** What a refresh would probe and what the file says that costs. */
export interface RefreshPlan {
  readonly scope: string;
  /** `[model_id, recorded sample or null]` in probe order. */
  readonly samples: ReadonlyArray<readonly [string, number | null]>;
  readonly threshold: number;
}

export function planModelIds(plan: RefreshPlan): string[] {
  return plan.samples.map(([modelId]) => modelId);
}

export function knownPremiumRequests(plan: RefreshPlan): number {
  return plan.samples.reduce(
    (total, [, sample]) => total + (sample === null ? 0 : sample),
    0,
  );
}

export function unknownCostIds(plan: RefreshPlan): string[] {
  return plan.samples.filter(([, sample]) => sample === null).map(([modelId]) => modelId);
}

/**
 * An unknown-cost entry asks too. A plan that cannot bound its own spend has
 * not been priced, and an unknown that turns out to be 15 is precisely what
 * the threshold is for.
 */
export function needsConfirmation(plan: RefreshPlan): boolean {
  return (
    knownPremiumRequests(plan) > plan.threshold || unknownCostIds(plan).length > 0
  );
}

/**
 * The cheapest confirmed entry of each provider -- the smallest probe that
 * re-establishes the >=2-distinct-provider invariant and re-dates the CLI
 * version, which is what "did my seat survive the auto-update?" actually asks.
 */
function quorumIds(catalog: Catalog): string[] {
  const cheapest = new Map<string, ModelEntry>();
  for (const entry of confirmedModels(catalog)) {
    if (!KNOWN_PROVIDERS.has(entry.provider)) continue;
    const held = cheapest.get(entry.provider);
    if (held === undefined || compareCost(entry, held) < 0) {
      cheapest.set(entry.provider, entry);
    }
  }
  return [...cheapest.keys()].sort().map((provider) => cheapest.get(provider)!.id);
}

/**
 * Entries whose confirmation was earned on some other CLI build.
 *
 * An entry with no confirmation at all is not stale, it is unprobed, and
 * sweeping it in here would quietly turn a targeted re-confirmation into a
 * universe probe -- the cost blowout this whole command exists to avoid.
 */
function staleIds(catalog: Catalog, liveCliVersion: string | null): string[] {
  if (!liveCliVersion) {
    throw new CatalogError(
      "--stale needs the live CLI version to tell stale from current, " +
        "and 'copilot --version' did not answer. Name the entries with " +
        "--models instead.",
    );
  }
  return catalog.models
    .filter(
      (entry) =>
        entry.confirmed_on_cli_version &&
        entry.confirmed_on_cli_version !== liveCliVersion,
    )
    .slice()
    .sort(compareCost)
    .map((entry) => entry.id);
}

function universeIds(catalog: Catalog): string[] {
  if (catalog.meta.candidate_universe.length === 0) {
    throw new CatalogError(
      "the lockfile declares no [meta].candidate_universe and the CLI " +
        "has no list-models command to stand in for one. Add the ids to " +
        "that array: it is a maintained list, and that data edit is how " +
        "a model becomes probeable.",
    );
  }
  return [...catalog.meta.candidate_universe];
}

function namedIds(catalog: Catalog, models: readonly string[]): string[] {
  const requested: string[] = [];
  for (const raw of models) {
    for (const rawToken of String(raw).split(",")) {
      const token = rawToken.trim();
      if (token && !requested.includes(token)) requested.push(token);
    }
  }
  if (requested.length === 0) {
    throw new CatalogError("--models needs at least one model id");
  }
  const universe = new Set(catalog.meta.candidate_universe);
  const unknown =
    universe.size > 0 ? requested.filter((id) => !universe.has(id)) : [];
  if (unknown.length > 0) {
    throw new CatalogError(
      "not in the lockfile's declared candidate universe: " +
        unknown.join(", ") +
        ". Every probe costs a premium request, so a typo must not buy " +
        "one -- add the id to [meta].candidate_universe first.",
    );
  }
  return requested;
}

/**
 * Select a scope and price it from the samples already in the file.
 *
 * That is what those samples are for: a refresh that cannot estimate its own
 * cost has not read its own file, and an operator's only defence against an
 * unpriced billed run is to never run it.
 */
export function planRefresh(
  catalog: Catalog,
  options: {
    scope?: string;
    models?: readonly string[] | null;
    liveCliVersion?: string | null;
    threshold?: number;
  } = {},
): RefreshPlan {
  const scope = options.scope ?? SCOPE_QUORUM;
  let ids: string[];
  if (scope === SCOPE_QUORUM) ids = quorumIds(catalog);
  else if (scope === SCOPE_MODELS) ids = namedIds(catalog, options.models ?? []);
  else if (scope === SCOPE_STALE) ids = staleIds(catalog, options.liveCliVersion ?? null);
  else if (scope === SCOPE_ALL) ids = universeIds(catalog);
  else throw new CatalogError(`unknown refresh scope '${scope}'`);

  const byId = new Map(catalog.models.map((entry) => [entry.id, entry]));
  return {
    scope,
    samples: ids.map(
      (modelId) =>
        [modelId, byId.get(modelId)?.probe_premium_requests ?? null] as const,
    ),
    threshold: options.threshold ?? CONFIRM_THRESHOLD_PREMIUM_REQUESTS,
  };
}

export function formatPlan(plan: RefreshPlan): string {
  const lines = [
    `refresh plan: scope=${plan.scope}, ${plan.samples.length} model(s) to probe`,
  ];
  for (const [modelId, sample] of plan.samples) {
    lines.push(`  ${modelId}  (sample: ${sampleText(sample)})`);
  }
  lines.push(
    `projected cost: ${pythonNumber(knownPremiumRequests(plan))} premium ` +
      "request(s) from recorded samples",
  );
  const unknown = unknownCostIds(plan);
  if (unknown.length > 0) {
    lines.push(
      `  plus ${unknown.length} of unknown cost ` +
        `(${unknown.join(", ")}) -- unknown is not zero, so ` +
        "this projection is a floor",
    );
  }
  return lines.join("\n");
}

/**
 * What the refresh changed, in the lockfile's own terms.
 *
 * A success message would be a claim about the seat; this is the evidence for
 * one. Silence about an entry means the run did not touch it.
 */
export function diffCatalogs(before: Catalog, after: Catalog): string[] {
  const lines: string[] = [];
  if (before.meta.cli_version !== after.meta.cli_version) {
    lines.push(
      `cli version re-dated: '${before.meta.cli_version}' -> ` +
        `'${after.meta.cli_version}'`,
    );
  }
  const prior = new Map(before.models.map((entry) => [entry.id, entry]));
  for (const entry of after.models) {
    const was = prior.get(entry.id);
    if (was === undefined) {
      lines.push(`added: ${entry.id} (${entry.enablement})`);
      continue;
    }
    const confirmedNow = entry.enablement === ENABLEMENT_CONFIRMED;
    if (confirmedNow && was.enablement !== ENABLEMENT_CONFIRMED) {
      lines.push(`confirmed: ${entry.id}`);
    } else if (
      confirmedNow &&
      was.confirmed_on_cli_version !== entry.confirmed_on_cli_version
    ) {
      lines.push(
        `re-confirmed: ${entry.id} on ` +
          `${entry.confirmed_on_cli_version === null ? "None" : `'${entry.confirmed_on_cli_version}'`}`,
      );
    }
    if (entry.last_probe_error && entry.last_probe_error !== was.last_probe_error) {
      const kept =
        was.enablement === ENABLEMENT_CONFIRMED
          ? "; the prior confirmation stands, visibly stale"
          : "";
      lines.push(`probe failed: ${entry.id} (${entry.last_probe_error})${kept}`);
    }
    if (was.probe_premium_requests !== entry.probe_premium_requests) {
      lines.push(
        `sample moved: ${entry.id} ` +
          `${sampleText(was.probe_premium_requests)} -> ` +
          `${sampleText(entry.probe_premium_requests)}`,
      );
    }
  }
  return lines;
}

/** Where a refresh reports to; `process.stdout` in the command line. */
export type Sink = (text: string) => void;

/**
 * Plan, price, probe, merge, write, report. Returns a process exit code.
 *
 * The order is the point: nothing is spent before the projection is on
 * screen, and nothing is written that the diff does not account for.
 */
export async function runRefresh(options: {
  catalogPath: string;
  transport: Transport;
  liveCliVersion?: string | null;
  scope?: string;
  models?: readonly string[] | null;
  dryRun?: boolean;
  assumeYes?: boolean;
  threshold?: number;
  confirm?: (plan: RefreshPlan) => boolean;
  clock?: () => string;
  out?: Sink;
}): Promise<number> {
  const out = options.out ?? ((text: string) => process.stdout.write(text + "\n"));
  const clock = options.clock ?? utcNow;
  const before = loadCatalog(options.catalogPath);
  const plan = planRefresh(before, {
    scope: options.scope ?? SCOPE_QUORUM,
    models: options.models ?? null,
    liveCliVersion: options.liveCliVersion ?? null,
    threshold: options.threshold ?? CONFIRM_THRESHOLD_PREMIUM_REQUESTS,
  });
  out(formatPlan(plan));
  if (plan.samples.length === 0) {
    out("nothing to probe: this scope selects no entry.");
    return 0;
  }
  if (options.dryRun) {
    out("dry run: nothing probed, lockfile untouched.");
    return 0;
  }
  if (needsConfirmation(plan) && !options.assumeYes) {
    const approve = options.confirm ?? ((candidate) => promptToConfirm(candidate, out));
    if (!approve(plan)) {
      out("refresh declined: nothing probed, lockfile untouched.");
      return 1;
    }
  }

  const stamp = clock();
  const probed = await discoverModels(planModelIds(plan), {
    transport: options.transport,
    cliVersion: options.liveCliVersion ?? null,
    clock: () => stamp,
  });
  const after = mergeCatalog(before, probed, {
    cliVersion: options.liveCliVersion ?? null,
    probedAt: stamp,
  });
  writeCatalog(options.catalogPath, after, { writtenAt: stamp });

  const changes = diffCatalogs(before, after);
  if (changes.length > 0) {
    out("changed:");
    for (const line of changes) out(`  ${line}`);
  } else {
    const count = planModelIds(plan).length;
    out(
      `no change: all ${count} probed entr${count === 1 ? "y" : "ies"} answered ` +
        "exactly as the lockfile already records; provenance re-dated.",
    );
  }
  return 0;
}

/**
 * Ask before spending, and fail closed when there is nobody to ask.
 *
 * The unattended case is the one that matters and it is the one that must not
 * guess: a plan needing authorization with no terminal attached is refused,
 * not assumed-yes and not left prompting into a pipe. `--yes` is how an
 * unattended run authorizes the spend, and that is a decision on the record.
 */
function promptToConfirm(plan: RefreshPlan, out: Sink): boolean {
  if (!process.stdin.isTTY) {
    out(
      "this plan needs confirmation and stdin is not a terminal. " +
        "Re-run with --yes to authorize the spend, or --dry-run to see " +
        "the plan without spending anything.",
    );
    return false;
  }
  const unknown = unknownCostIds(plan).length > 0 ? " plus entries of unknown cost" : "";
  process.stdout.write(
    `spend ${pythonNumber(knownPremiumRequests(plan))} premium request(s)` +
      `${unknown}? [y/N] `,
  );
  return ["y", "yes"].includes(readLineFromStdin().trim().toLowerCase());
}

/**
 * One line off the terminal, read synchronously.
 *
 * Synchronous because the alternative is worse: an async prompt would make
 * every caller of a refresh async on the console, and this is the only place
 * in the router that waits for a human.
 */
function readLineFromStdin(): string {
  const chunk = Buffer.alloc(1);
  const bytes: number[] = [];
  for (;;) {
    let read: number;
    try {
      read = readSync(0, chunk, 0, 1, null);
    } catch {
      break;
    }
    if (read === 0 || chunk[0] === 0x0a) break;
    bytes.push(chunk[0]!);
  }
  return Buffer.from(bytes).toString("utf8");
}
