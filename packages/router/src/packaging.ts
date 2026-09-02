// Step (f) of the lifecycle: pack the session's work, then push it to the
// declared feed.
//
// A repository publishes because it said how. There is no build to infer
// from a language nobody named, so an absent `packaging` block is an answer
// rather than a gap -- and a block that cannot be run as written is refused
// at load, because a repository that declares nothing and one that declares
// something broken must never produce the same silence.
//
// The credential is named in configuration and never held there. It resolves
// at spawn into one argv element, is placed in no environment, and the
// command written to the record still carries the placeholder -- so the
// recorded command is the declared command, which is the thing anyone
// reading it wants.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";

import { childEnv } from "./checks.ts";
import { type RouterConfig, loadConfig } from "./config.ts";
import { GATE_PUBLISHED_WHEN_RELEASABLE, type GateResult, runGates } from "./gates.ts";
import { refuseIfResolvingFromSource } from "./resolution.ts";
import { repoRootFor, snapshotWorktreeTree } from "./journal.ts";
import {
  OUTCOME_FAILED,
  OUTCOME_PUBLISHED,
  OUTCOME_REFUSED,
  type Row,
  appendPackaging,
  packageOutputDir,
} from "./ledger.ts";
import { readSessionState } from "./progress.ts";
import { resolveSecret } from "./secretResolver.ts";
import { sessionIsReleasable } from "./writers.ts";

/**
 * What the framework supplies, and the only tokens it will substitute. A
 * placeholder outside this set is left alone: it is either the tool's own
 * syntax or a typo, and silently emptying it would be the worse of the two.
 */
export const PLACEHOLDER_OUTPUT = "{output}";
export const PLACEHOLDER_ARTIFACT = "{artifact}";
export const PLACEHOLDER_FEED = "{feed}";
export const PLACEHOLDER_SECRET = "{secret}";

/**
 * What stands in the record where the value was. Deliberately the
 * placeholder itself rather than a row of asterisks: the recorded command is
 * then the declared command, which is what anyone reading it wants.
 */
export const REDACTION = PLACEHOLDER_SECRET;

// The record's own vocabulary, which `ledger.ts` owns: the close's gate must
// ask whether a row says `published`, and this module borrows that gate.
// Re-exported here because this is where a reader of packaging looks for it.
export { OUTCOME_FAILED, OUTCOME_PUBLISHED, OUTCOME_REFUSED };

export const STEP_PACK = "pack";
export const STEP_PUSH = "push";

export const DEFAULT_TIMEOUT_SECONDS = 900;

/**
 * How much of a command's output the record keeps. The tail, because that is
 * where a build tool puts the reason it stopped.
 */
export const MAX_OUTPUT_CHARS = 20_000;

/**
 * Below this a scrub is refused rather than performed. A one- or two-
 * character "secret" would match everywhere in ordinary output and turn the
 * record into redaction confetti; a credential that short is a
 * misconfiguration to surface, not something to publish with.
 */
export const MIN_SECRET_CHARS = 8;

/**
 * The declaration cannot be run as written. Refused at load, because a
 * repository that declares nothing and one that declares something broken
 * must never produce the same silence.
 */
export class PackagingConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackagingConfigError";
  }
}

/**
 * Packaging could not proceed. Never an outcome: a publication that was
 * refused and one that failed at the feed are different facts, and both are
 * recorded as themselves.
 */
export class PackagingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackagingError";
  }
}

export interface PackStep {
  readonly argv: readonly string[];
  readonly cwd: string;
  readonly timeoutSeconds: number;
}

export interface PushStep {
  readonly argv: readonly string[];
  readonly feed: string;
  readonly secret: string;
  readonly secretSource: string;
  readonly cwd: string;
  readonly timeoutSeconds: number;
}

export interface Declaration {
  readonly pack: PackStep;
  readonly push: PushStep;
}

/**
 * One command that ran. `command` is what the record shows, so the secret
 * placeholder is still in it.
 */
export interface StepRun {
  readonly step: string;
  readonly command: string;
  readonly exitCode: number | null;
  readonly durationSeconds: number;
  readonly timedOut: boolean;
  readonly output: string;
  readonly artifact: string;
}

export function stepIsGreen(step: StepRun): boolean {
  return step.exitCode === 0;
}

export function stepAsRow(step: StepRun): Row {
  const row: Row = {
    step: step.step,
    command: step.command,
    exit_code: step.exitCode,
    duration_seconds: roundHalfEven(step.durationSeconds, 3),
    timed_out: step.timedOut,
    output: step.output,
  };
  if (step.artifact) row["artifact"] = step.artifact;
  return row;
}

/** What one attempt did, and why. This is the record. */
export interface PackagingRun {
  readonly outcome: string;
  readonly sessionNumber: number;
  readonly releasable: boolean;
  readonly refusal: string;
  readonly feed: string;
  readonly secretName: string;
  readonly treeDigest: string | null;
  readonly postTreeDigest: string | null;
  readonly treeMutated: boolean;
  readonly artifacts: readonly string[];
  readonly gates: readonly GateResult[];
  readonly steps: readonly StepRun[];
  readonly recordedAt: string;
  /**
   * A dry run that got all the way to the point where a real one would have
   * started packing. Never serialized and never filed: a rehearsal is not an
   * attempt, and a ledger that carried them could not be read as a history of
   * what was released.
   */
  readonly ready: boolean;
}

export function runIsPublished(run: PackagingRun): boolean {
  return run.outcome === OUTCOME_PUBLISHED;
}

export function runAsRecord(run: PackagingRun): Row {
  const record: Row = {
    outcome: run.outcome,
    session_number: run.sessionNumber,
    releasable: run.releasable,
    recorded_at: run.recordedAt || nowIso(),
  };
  if (run.refusal) record["refusal"] = run.refusal;
  if (run.feed) record["feed"] = run.feed;
  // Keyed on the FEED, not on the name. A run that reached a feed always
  // says which credential published it, and for an unauthenticated feed the
  // answer is the empty string -- which is a claim ("nothing authenticated
  // this") rather than the absence of one. Omitting it would also break the
  // schema outright: a `published` row requires `secret_name`, so a folder
  // feed would write a row nothing could read back.
  if (run.feed) record["secret_name"] = run.secretName;
  if (run.treeDigest !== null) record["tree_digest"] = run.treeDigest;
  if (run.treeMutated) {
    record["tree_mutated"] = true;
    record["post_tree_digest"] = run.postTreeDigest;
  }
  if (run.artifacts.length > 0) record["artifacts"] = [...run.artifacts];
  if (run.gates.length > 0) {
    record["gates"] = run.gates.map((gate) => ({
      name: gate.name,
      passed: gate.passed,
      remediation: gate.remediation,
    }));
  }
  if (run.steps.length > 0) record["steps"] = run.steps.map(stepAsRow);
  return record;
}

/**
 * Python's `round()` is half-to-even, and JavaScript's `Math.round` is
 * half-away-from-zero. The recorded duration is compared byte for byte
 * against the Python router's, so the tie-breaking rule is ported rather
 * than approximated.
 */
function roundHalfEven(value: number, digits: number): number {
  const factor = 10 ** digits;
  const scaled = value * factor;
  const floored = Math.floor(scaled);
  const remainder = scaled - floored;
  let rounded: number;
  if (remainder > 0.5) rounded = floored + 1;
  else if (remainder < 0.5) rounded = floored;
  else rounded = floored % 2 === 0 ? floored : floored + 1;
  return rounded / factor;
}

/**
 * `datetime.now(timezone.utc).isoformat()`.
 *
 * Three differences from what `toISOString` gives, and each one is a byte
 * in a record other tools read. The offset is `+00:00`, never `Z`. The
 * fraction is six places, not three -- JavaScript's clock stops at
 * milliseconds, so the last three are the zeros Python would print. And a
 * whole-second value prints NO fraction at all, which is what `isoformat`
 * does and what a naive six-zero pad gets wrong.
 *
 * `journal.nowIso` states the same rule for local time; this one is UTC,
 * which is what the packaging record carries.
 */
function nowIso(date: Date = new Date()): string {
  const iso = date.toISOString();
  const base = iso.slice(0, 19);
  const millis = date.getUTCMilliseconds();
  const fraction = millis === 0 ? "" : `.${String(millis).padStart(3, "0")}000`;
  return `${base}${fraction}+00:00`;
}

// --- The declaration ---------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function argvOf(block: Record<string, unknown>, label: string): string[] {
  const argv = block["argv"];
  if (!Array.isArray(argv) || argv.length === 0) {
    throw new PackagingConfigError(`${label}.argv must be a non-empty list`);
  }
  if (!argv.every((a) => typeof a === "string" && a.trim() !== "")) {
    throw new PackagingConfigError(`${label}.argv must be non-empty strings`);
  }
  return argv.map((a) => String(a));
}

function timeoutOf(block: Record<string, unknown>, label: string): number {
  const value = block["timeout_seconds"];
  if (value === undefined || value === null) return DEFAULT_TIMEOUT_SECONDS;
  // Python's `float()` takes a number or a numeric string and rejects
  // everything else; `Number()` would take `true` and the empty string, so
  // the accepted shapes are written out rather than delegated.
  const seconds =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(seconds)) {
    throw new PackagingConfigError(`${label}.timeout_seconds must be a number`);
  }
  if (seconds <= 0) {
    throw new PackagingConfigError(
      `${label}.timeout_seconds must be greater than zero`,
    );
  }
  return seconds;
}

/**
 * Whether pushing to this feed needs a credential at all.
 *
 * A folder is a NuGet source, an npm `file:` target and a Maven local
 * repository, and none of them authenticates anything -- `dotnet nuget push
 * … --api-key x` to a directory ignores the key entirely. Demanding one
 * anyway is what the csv-model trial hit: to satisfy this router the
 * operator had to declare `DABBLER_FEED_PAT` and export a placeholder value
 * for a folder on their own disk. It also had a second bite, because the
 * redactor blanks the resolved value wherever it appears in captured
 * output -- so an operator who picked a natural word watched every
 * occurrence of it disappear from the transcript.
 *
 * **It fails safe.** A value this cannot positively identify as a path on
 * disk is treated as a feed that needs a credential, so the only way to
 * lose the requirement is to name something that is unmistakably local. A
 * bare token with no scheme and no separator (`internal-feed`) is exactly
 * the ambiguous case, and it keeps the requirement -- that is the only
 * shape left ambiguous, because a network feed is named by a URL, a URL has
 * a scheme, and anything with a separator and no scheme is a directory.
 */
export function feedTakesCredential(feed: string): boolean {
  const value = feed.trim();
  if (value === "") return true;
  // `file://` is a filesystem path that happens to be spelled as a URL.
  if (/^file:\/\//i.test(value)) return false;
  // Any other scheme is a network feed: nuget.org, an Azure Artifacts URL,
  // a GitHub Packages registry.
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) return true;
  // `C:\feed`, `D:/feed`, and the drive-RELATIVE `C:feed\local`, which is
  // still unambiguously a path on disk -- it names a drive.
  if (/^[A-Za-z]:/.test(value)) return false;
  // A UNC share, and a POSIX absolute path.
  if (value.startsWith("\\\\") || value.startsWith("/")) return false;
  // Anything with a path separator and no scheme: `./feed`, `../feed`,
  // `feeds/local`, `feeds\local`. A network feed is named by a URL and a URL
  // has a scheme, which was ruled out above -- so a separator at this point
  // is a directory and not a host.
  if (/[\\/]/.test(value)) return false;
  return true;
}

function requirePlaceholders(
  argv: readonly string[],
  required: readonly string[],
  label: string,
): void {
  const joined = argv.join(" ");
  const missing = required.filter((token) => !joined.includes(token));
  if (missing.length > 0) {
    throw new PackagingConfigError(
      `${label}.argv is missing ${missing.join(", ")}. The framework ` +
        "supplies these, and a command that does not take them takes " +
        "them from somewhere the record cannot see.",
    );
  }
}

/**
 * This repository's packaging declaration, or `null` for one that declares
 * none.
 *
 * `null` is an answer, not a gap: a repository publishes because it said how,
 * and there is no build to infer from a language nobody named.
 */
export function loadDeclaration(
  config: RouterConfig | null,
): Declaration | null {
  const block = (config ?? {})["packaging"];
  if (block === undefined || block === null) return null;
  const packaging = asRecord(block);
  if (packaging === null) {
    throw new PackagingConfigError("packaging must be a mapping");
  }

  const packBlock = asRecord(packaging["pack"]);
  const pushBlock = asRecord(packaging["push"]);
  for (const [name, value] of [
    ["pack", packBlock],
    ["push", pushBlock],
  ] as const) {
    if (value === null) {
      throw new PackagingConfigError(
        `packaging.${name} must be a mapping; a packaging block ` +
          "declares both halves or neither, because a pack nobody " +
          "pushes is a build and a push with nothing to send is a " +
          "typo.",
      );
    }
  }

  const pack = packBlock as Record<string, unknown>;
  const push = pushBlock as Record<string, unknown>;

  const packArgv = argvOf(pack, "packaging.pack");
  requirePlaceholders(packArgv, [PLACEHOLDER_OUTPUT], "packaging.pack");

  const pushArgv = argvOf(push, "packaging.push");

  // The feed is read BEFORE the placeholders are required, because what the
  // feed IS decides whether one of them is required at all.
  const feed = String(push["feed"] ?? "").trim();
  if (!feed) {
    throw new PackagingConfigError(
      "packaging.push.feed must name the feed. It is substituted into " +
        "the command that runs, so the recorded destination is a fact " +
        "about what happened rather than a caption beside it.",
    );
  }
  const authenticated = feedTakesCredential(feed);
  requirePlaceholders(
    pushArgv,
    authenticated
      ? [PLACEHOLDER_ARTIFACT, PLACEHOLDER_FEED, PLACEHOLDER_SECRET]
      : [PLACEHOLDER_ARTIFACT, PLACEHOLDER_FEED],
    "packaging.push",
  );

  const secret = String(push["secret"] ?? "").trim();
  if (!secret && authenticated) {
    throw new PackagingConfigError(
      "packaging.push.secret must name the credential — the name, " +
        "never the value. Values live in the environment or a " +
        "registered secret backend, exactly as a provider's " +
        "api_key_env does.",
    );
  }

  return {
    pack: {
      argv: packArgv,
      cwd: String(pack["cwd"] ?? ""),
      timeoutSeconds: timeoutOf(pack, "packaging.pack"),
    },
    push: {
      argv: pushArgv,
      feed,
      secret,
      secretSource: String(push["secret_source"] ?? "") || "env",
      cwd: String(push["cwd"] ?? ""),
      timeoutSeconds: timeoutOf(push, "packaging.push"),
    },
  };
}

// --- Substitution, redaction, execution --------------------------------------

/**
 * Replace placeholders element by element.
 *
 * Per element and never through a shell: a credential substituted into a
 * shell string can be re-split, re-quoted, or logged by the shell itself,
 * and none of those are things the framework can take back.
 */
export function substitute(
  argv: readonly string[],
  mapping: Readonly<Record<string, string>>,
): string[] {
  return argv.map((element) => {
    let text = String(element);
    for (const [token, value] of Object.entries(mapping)) {
      if (text.includes(token)) text = replaceAll(text, token, String(value));
    }
    return text;
  });
}

/**
 * `String.prototype.replace` with a string pattern replaces the FIRST match
 * only and reads `$&` and friends in the replacement as back-references.
 * Python's `str.replace` does neither, and a feed URL or a PAT is exactly the
 * kind of value that carries a `$`.
 */
function replaceAll(text: string, needle: string, value: string): string {
  return text.split(needle).join(value);
}

/**
 * Remove the resolved value from anything about to be written down.
 *
 * A short value is left alone rather than scrubbed: it would match inside
 * ordinary words and bury the output under redactions, and a credential that
 * short is a misconfiguration the record should show plainly.
 */
export function redact(text: string, secret: string | null): string {
  if (!text || !secret || secret.length < MIN_SECRET_CHARS) return text;
  return replaceAll(text, secret, REDACTION);
}

function tail(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return "...[truncated]...\n" + text.slice(-MAX_OUTPUT_CHARS);
}

/** Python's `%g`, for the one place the timeout is written into text. */
function formatG(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value !== 0 && (Math.abs(value) < 1e-4 || Math.abs(value) >= 1e6)) {
    const [mantissa, exponent] = value.toExponential(5).split("e");
    const sign = exponent!.startsWith("-") ? "-" : "+";
    const digits = exponent!.replace(/^[+-]/, "").padStart(2, "0");
    return `${trimZeros(mantissa!)}e${sign}${digits}`;
  }
  return trimZeros(value.toPrecision(6));
}

function trimZeros(text: string): string {
  return text.includes(".") ? text.replace(/\.?0+$/, "") : text;
}

export interface RunStepOptions {
  readonly cwd: string;
  readonly timeoutSeconds: number;
  readonly secret?: string | null;
  readonly artifact?: string;
}

/**
 * Run one declared command and report what it did.
 *
 * `spawnArgv` carries the resolved credential; `recordArgv` carries the
 * placeholder, and it is the one that is written down. The environment is
 * `childEnv`, so the process inherits an allowlist rather than whatever the
 * operator's shell happened to hold.
 */
export function runStep(
  step: string,
  spawnArgv: readonly string[],
  recordArgv: readonly string[],
  options: RunStepOptions,
): StepRun {
  const command = recordArgv.join(" ");
  const started = process.hrtime.bigint();
  const secret = options.secret ?? null;
  const scratch = mkdtempSync(join(tmpdir(), "dabbler-package-"));
  let exitCode: number | null = null;
  let timedOut = false;
  let output = "";
  try {
    const [program, ...rest] = spawnArgv;
    const completed = spawnSync(program as string, rest, {
      cwd: options.cwd,
      env: childEnv(scratch),
      timeout: Math.round(options.timeoutSeconds * 1000),
      encoding: "utf8",
      windowsHide: true,
    });
    // Python merges the child's stderr into its stdout pipe. Node keeps two,
    // so they are concatenated in the order that merge would have produced
    // for a command that writes one stream and then the other.
    const merged = (completed.stdout ?? "") + (completed.stderr ?? "");
    if (completed.error !== undefined && isTimeout(completed)) {
      timedOut = true;
      output = merged + `\n[timed out after ${formatG(options.timeoutSeconds)}s]`;
    } else if (completed.error !== undefined) {
      // A command that could not start is a failed step, not a crash:
      // "dotnet is not installed on this machine" belongs in the record
      // beside the command that needed it.
      const error = completed.error as NodeJS.ErrnoException;
      output = `[could not start: ${error.code ?? error.name}: ${error.message}]`;
    } else {
      exitCode = completed.status;
      output = merged;
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  return {
    step,
    command,
    exitCode,
    durationSeconds: Number(process.hrtime.bigint() - started) / 1e9,
    timedOut,
    output: tail(redact(output, secret)),
    artifact: options.artifact ?? "",
  };
}

function isTimeout(completed: {
  error?: Error;
  signal?: NodeJS.Signals | null;
}): boolean {
  const code = (completed.error as NodeJS.ErrnoException | undefined)?.code;
  return code === "ETIMEDOUT" || completed.signal === "SIGTERM";
}

// --- The output directory ----------------------------------------------------

/**
 * An empty directory of this run's own, replacing whatever was there.
 *
 * Replacing rather than reusing is the whole guarantee: everything found in
 * it afterwards was built by the command that just ran, so no stale artifact
 * can be swept into a push.
 */
export function prepareOutputDir(
  repoRoot: string,
  sessionNumber: number,
): string {
  const target = packageOutputDir(repoRoot, sessionNumber);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  return target;
}

/**
 * Everything pack produced, named relative to the output directory and in a
 * stable order.
 */
export function artifactsIn(outputDir: string): string[] {
  try {
    if (!statSync(outputDir).isDirectory()) return [];
  } catch {
    return [];
  }
  const found: string[] = [];
  const walk = (directory: string): void => {
    let entries: string[];
    try {
      entries = readdirSync(directory);
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(directory, entry);
      let stats;
      try {
        stats = statSync(full);
      } catch {
        continue;
      }
      if (stats.isDirectory()) walk(full);
      else if (stats.isFile()) {
        found.push(relative(outputDir, full).split(sep).join("/"));
      }
    }
  };
  walk(outputDir);
  return found.sort();
}

// --- The run -----------------------------------------------------------------

function currentSession(sessionsDir: string): number | null {
  const state = readSessionState(sessionsDir);
  if (!state) return null;
  const number = state["currentSession"];
  return typeof number === "number" ? number : null;
}

function refusal(
  sessionNumber: number,
  releasable: boolean,
  reason: string,
  gates: readonly GateResult[] = [],
): PackagingRun {
  return {
    outcome: OUTCOME_REFUSED,
    sessionNumber,
    releasable,
    refusal: reason,
    feed: "",
    secretName: "",
    treeDigest: null,
    postTreeDigest: null,
    treeMutated: false,
    artifacts: [],
    gates,
    steps: [],
    recordedAt: nowIso(),
    ready: false,
  };
}

export interface PackageOptions {
  readonly config?: RouterConfig | null;
  readonly dryRun?: boolean;
}

/**
 * Run step (f) for the session in flight, or refuse and say why.
 *
 * The refusals are ordered by what they cost to discover. Releasability is
 * first because it is free and because it is the one the declaration exists
 * for; the credential resolves before `pack` runs, so a missing PAT is not
 * discovered after a build has been paid for.
 */
export function packageSession(
  sessionsDir: string,
  options: PackageOptions = {},
): PackagingRun {
  const root = repoRootFor(sessionsDir);
  if (root === null) {
    throw new PackagingError(`not inside a git repository: ${sessionsDir}`);
  }
  const sessionNumber = currentSession(sessionsDir);
  if (sessionNumber === null) {
    throw new PackagingError(`no session is in flight under ${sessionsDir}`);
  }

  // Resolved against the set's own repository, not the working directory. A
  // set in another checkout would otherwise be packaged under this one's
  // overlay -- which is where the feed and the credential's name live.
  const config =
    options.config === undefined || options.config === null
      ? loadConfig(undefined, root)
      : options.config;

  const releasable = sessionIsReleasable(sessionsDir, sessionNumber);
  if (!releasable) {
    return refusal(
      sessionNumber,
      false,
      `session ${sessionNumber} did not declare itself releasable at ` +
        "step (a), so it cannot publish. An absent declaration is a " +
        "refusal, not an unknown: declaring after the work is done is a " +
        "model deciding in hindsight what may reach a feed.",
    );
  }

  const switched = refuseIfResolvingFromSource(repoRootFor(sessionsDir), "packaging");
  if (switched !== null) return refusal(sessionNumber, true, switched);

  const declaration = loadDeclaration(config);
  if (declaration === null) {
    return refusal(
      sessionNumber,
      true,
      "this repository declares no packaging block, so it publishes " +
        "nothing. That is a declaration rather than a gap — there is no " +
        "build to infer for an ecosystem nobody named.",
    );
  }

  // The close gates, asked exactly as the close asks them: no config is
  // passed, because the close passes none. Handing them a different one is
  // how packaging and the close come to disagree about whether the same
  // session was ready.
  //
  // One is left unasked, and it is the one that is about this:
  // `published_when_releasable` fails a releasable session with no packaging
  // run on its record, and this IS that run. Asked here it answers itself
  // wrongly -- the first publication would be refused for not having
  // happened yet, and no session could ever publish. It is omitted rather
  // than passed, so no reader can mistake its absence for a question that
  // was asked and answered; the close asks it, after this has written the
  // record it looks for.
  const gates = runGates(sessionsDir, { omit: [GATE_PUBLISHED_WHEN_RELEASABLE] });
  const failed = gates.filter((gate) => !gate.passed);
  if (failed.length > 0) {
    return refusal(
      sessionNumber,
      true,
      "step (f) runs after (e), and the evidence for the earlier " +
        "steps is not there: " +
        failed.map((g) => `${g.name}: ${g.remediation}`).join("; "),
      gates,
    );
  }

  // An unauthenticated feed declares no credential, so there is none to
  // resolve and nothing to redact. The empty string travels on rather than
  // a null: `redact` already ignores anything shorter than its minimum, and
  // substitution has no `{secret}` to fill because the declaration was not
  // required to carry one.
  const secretValue = declaration.push.secret
    ? resolveSecret(declaration.push.secret, declaration.push.secretSource)
    : "";
  if (declaration.push.secret && !secretValue) {
    return refusal(
      sessionNumber,
      true,
      `the credential '${declaration.push.secret}' is not set in the ` +
        `'${declaration.push.secretSource}' backend. Resolving it ` +
        "before pack means a missing PAT costs nothing but this " +
        "message, rather than a build that cannot be sent anywhere.",
      gates,
    );
  }

  if (options.dryRun === true) {
    return {
      ...refusal(
        sessionNumber,
        true,
        "dry run: every gate passed and nothing was run.",
        gates,
      ),
      feed: declaration.push.feed,
      secretName: declaration.push.secret,
      ready: true,
    };
  }

  // Narrowed here rather than above: the guard proves a declared credential
  // resolved, and an undeclared one is the empty string by construction.
  return execute(root, sessionNumber, declaration, secretValue ?? "", gates);
}

function execute(
  root: string,
  sessionNumber: number,
  declaration: Declaration,
  secretValue: string,
  gates: readonly GateResult[],
): PackagingRun {
  const treeDigest = snapshotWorktreeTree(root);
  const outputDir = prepareOutputDir(root, sessionNumber);
  const push = declaration.push;
  const steps: StepRun[] = [];

  const outcome = (
    name: string,
    extra: {
      post?: string | null;
      mutated?: boolean;
      artifacts?: readonly string[];
    } = {},
  ): PackagingRun => ({
    outcome: name,
    sessionNumber,
    releasable: true,
    refusal: "",
    feed: push.feed,
    secretName: push.secret,
    treeDigest,
    postTreeDigest: extra.post ?? null,
    treeMutated: extra.mutated === true,
    artifacts: extra.artifacts ?? [],
    gates,
    steps: [...steps],
    recordedAt: nowIso(),
    ready: false,
  });

  /**
   * The tree id now, if a command has changed it.
   *
   * Checked after every command on the same terms `checks.execute` applies to
   * a check: a command that changed the repository while it ran has
   * invalidated its own result, whatever its exit code said. A build that
   * leaves intermediates behind has produced artifacts from a tree nobody
   * verified, and the push would put them on a feed under a record naming a
   * tree that no longer exists on disk.
   */
  const movedTheTree = (): string | null => {
    const after = snapshotWorktreeTree(root);
    return after !== treeDigest ? after : null;
  };

  const pack = declaration.pack;
  const packCwd = pack.cwd ? join(root, pack.cwd) : root;
  const packArgv = substitute(pack.argv, { [PLACEHOLDER_OUTPUT]: outputDir });
  steps.push(
    runStep(STEP_PACK, packArgv, packArgv, {
      cwd: packCwd,
      timeoutSeconds: pack.timeoutSeconds,
    }),
  );
  if (!stepIsGreen(steps[steps.length - 1] as StepRun)) {
    return outcome(OUTCOME_FAILED);
  }
  let moved = movedTheTree();
  if (moved) return outcome(OUTCOME_FAILED, { post: moved, mutated: true });

  const artifacts = artifactsIn(outputDir);
  if (artifacts.length === 0) {
    return refusal(
      sessionNumber,
      true,
      "pack succeeded and produced no file, so there is nothing to " +
        "push. An empty output directory is a broken declaration " +
        "reporting success, and pushing nothing would record a " +
        "publication that did not happen.",
      gates,
    );
  }

  const pushCwd = push.cwd ? join(root, push.cwd) : root;
  for (const artifact of artifacts) {
    const common = {
      [PLACEHOLDER_ARTIFACT]: join(outputDir, artifact),
      [PLACEHOLDER_FEED]: push.feed,
    };
    const spawnArgv = substitute(push.argv, {
      ...common,
      [PLACEHOLDER_SECRET]: secretValue,
    });
    const recordArgv = substitute(push.argv, {
      ...common,
      [PLACEHOLDER_SECRET]: REDACTION,
    });
    steps.push(
      runStep(STEP_PUSH, spawnArgv, recordArgv, {
        cwd: pushCwd,
        timeoutSeconds: push.timeoutSeconds,
        secret: secretValue,
        artifact,
      }),
    );
    if (!stepIsGreen(steps[steps.length - 1] as StepRun)) {
      // Stop at the first rejection. Pushing the rest would leave a feed
      // holding part of a release and a record claiming it published.
      return outcome(OUTCOME_FAILED, { artifacts });
    }
    moved = movedTheTree();
    if (moved) {
      return outcome(OUTCOME_FAILED, { post: moved, mutated: true, artifacts });
    }
  }

  return outcome(OUTCOME_PUBLISHED, { artifacts });
}

/** File the attempt. Machine-written, append-only, schema-validated. */
export function record(sessionsDir: string, run: PackagingRun): Row {
  if (run.ready) {
    throw new PackagingError(
      "a dry run has nothing to file: it is a rehearsal of the gates, " +
        "and a ledger carrying rehearsals cannot be read as a history of " +
        "what was released.",
    );
  }
  const root = repoRootFor(sessionsDir);
  if (root === null) {
    throw new PackagingError(`not inside a git repository: ${sessionsDir}`);
  }
  return appendPackaging(root, run.sessionNumber, runAsRecord(run));
}
