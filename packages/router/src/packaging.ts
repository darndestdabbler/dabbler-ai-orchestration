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

import { childEnv, isSetBookkeeping } from "./checks.ts";
import { type RouterConfig, loadConfig } from "./config.ts";
import { GATE_PUBLISHED_WHEN_RELEASABLE, type GateResult, runGates } from "./gates.ts";
import { refuseIfResolvingFromSource } from "./resolution.ts";
import { repoRelativePath, repoRootFor, runGit, snapshotWorktreeTree } from "./journal.ts";
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
import { readText } from "./textfile.ts";
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
 * The version a module's pack is given (session 103 computes it: an
 * immutable dev version from the module's tree). A pack that names it and
 * runs where no version is known is refused rather than run with the
 * placeholder left in.
 */
export const PLACEHOLDER_VERSION = "{version}";

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
  /** The argv names `{version}`, so the caller must supply one. */
  readonly usesVersion: boolean;
}

export interface PushStep {
  readonly argv: readonly string[];
  readonly feed: string;
  readonly secret: string;
  readonly secretSource: string;
  readonly cwd: string;
  readonly timeoutSeconds: number;
}

/**
 * A repository whose release is a TAG, not a pack and a push.
 *
 * Some repositories do not publish from the session's own machine, and
 * saying so is a declaration rather than an absence. This one is the
 * example: it releases the extension to the Marketplace from
 * `.github/workflows/publish-vscode.yml`, which fires on a `vsix-v*` tag
 * and authenticates with an environment secret that is not on any
 * developer's box. A `pack`/`push` block here would have to name a
 * credential this machine cannot hold and a feed this machine never
 * reaches, and the record would say a session published when a workflow
 * did.
 *
 * **The framework's act is the tag**, and `dabbler release` is the verb
 * that makes it: it holds the version, refuses a dirty tree, and waits on
 * the operator's own `publication` decision, because a tag is the one act
 * here that cannot be taken back. The publish phase runs it and records
 * what it did. Nothing about the `published_when_releasable` gate moves --
 * it still asks for a `published` row and this still has to earn one.
 */
export interface TagRelease {
  readonly kind: "tag";
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
  /**
   * A dry run in a session that may not publish, whose packaging block
   * nonetheless loaded: the rehearsal proved the declaration and could go no
   * further. Never serialized, for the same reason as `ready`. It is the fact
   * a plan check can stand on -- "the declaration parses" is answerable
   * before the one session that publishes, and a rehearsal that exited 1 on
   * releasability alone told a check nothing it could use.
   */
  readonly declared: boolean;
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
  // Keyed on the OUTCOME for the same reason `secret_name` is keyed on the
  // feed: a published row always says what ran, and for a tag release the
  // honest answer is nothing. `dabbler release` pushed the tag, CI holds the
  // credential, and no command ran in this process -- an empty list is that
  // claim, where an omitted key is the absence of one. The schema requires
  // `steps` of every publication, so omitting it wrote a row nothing could
  // read back: session 137 published 2.0.16 and 2.0.17 to the Marketplace
  // and could record neither, because the tag path had never once reached
  // this line until the tag check stopped demanding equality with HEAD.
  if (run.steps.length > 0 || run.outcome === OUTCOME_PUBLISHED) {
    record["steps"] = run.steps.map(stepAsRow);
  }
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

/** The `packaging` block under `modules.<slug>`, or null when the slug has none. */
function moduleBlock(config: RouterConfig | null, module: string): unknown {
  const modules = asRecord((config ?? {})["modules"]);
  if (modules === null) return null;
  const entry = asRecord(modules[module]);
  if (entry === null) return null;
  const block = entry["packaging"];
  return block === undefined ? null : block;
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
/** The `release:` key of one already-parsed packaging block, validated. */
function readTagRelease(packaging: Record<string, unknown>): TagRelease | null {
  if (packaging["release"] === undefined) return null;
  if (packaging["release"] !== "tag") {
    throw new PackagingConfigError(
      'packaging.release must be "tag" -- the only release this framework ' +
        "makes without a feed of its own is an annotated tag that CI " +
        `publishes from; got ${JSON.stringify(packaging["release"])}`,
    );
  }
  // A repository releases ONE way. `release: tag` and a `pack`/`push` pair
  // are two different accounts of what step (f) does, and a block carrying
  // both would leave the record unable to say which one it describes.
  if (packaging["pack"] !== undefined || packaging["push"] !== undefined) {
    throw new PackagingConfigError(
      "packaging declares `release: tag` and a pack/push pair: a repository " +
        "releases one way, and a block that claims both leaves the record " +
        "unable to say which one it describes.",
    );
  }
  return { kind: "tag" };
}

/**
 * The tag-release declaration, where the block carries one.
 *
 * Read with the same module-then-root rule as `loadDeclaration`, because a
 * module publishes the way its own block says and the root answers
 * otherwise; the two readers are never both non-null for one block.
 */
export function loadTagRelease(
  config: RouterConfig | null,
  module: string | null = null,
): TagRelease | null {
  const perModule = module === null ? null : moduleBlock(config, module);
  const block = perModule ?? (config ?? {})["packaging"];
  if (block === undefined || block === null) return null;
  const packaging = asRecord(block);
  if (packaging === null) return null;
  return readTagRelease(packaging);
}

export function loadDeclaration(
  config: RouterConfig | null,
  module: string | null = null,
): Declaration | null {
  // A module's own block, when the root `modules:` mapping carries one for
  // its slug, answers for that module; the root block answers otherwise --
  // so a solution with one feed declares it once, and a module with its
  // own feed says so beside its slug. `moduleConfigs` (modules.ts) is what
  // holds the mapping to the manifest; here only the shape is read.
  const perModule = module === null ? null : moduleBlock(config, module);
  const block = perModule ?? (config ?? {})["packaging"];
  if (block === undefined || block === null) return null;
  const packaging = asRecord(block);
  if (packaging === null) {
    throw new PackagingConfigError(
      `${perModule === null ? "packaging" : `modules.${module}.packaging`} must be a mapping`,
    );
  }

  // A tag release declares no pack and no push, so this reader has nothing
  // to return for one. `loadTagRelease` is the reader that does, and it is
  // called here so that a malformed `release:` is refused by whichever of
  // the two a caller reaches first.
  if (readTagRelease(packaging) !== null) return null;

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
      usesVersion: packArgv.join(" ").includes(PLACEHOLDER_VERSION),
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

// --- The repository's one version, and the tag that releases it ------------
//
// These live here rather than beside `dabbler release` because they are
// facts about what this repository RELEASES, and two callers need them: the
// verb that tags, and the packaging run that records whether the tag
// happened. A copy in each is how the tag shape and the stamping rule come
// to disagree.

/** The version a workspace package declares. */
export function packageVersion(repoRoot: string, relPath: string): string | null {
  try {
    const doc = JSON.parse(readText(`${repoRoot}/${relPath}`)) as { version?: string };
    return typeof doc.version === "string" ? doc.version : null;
  } catch {
    return null;
  }
}

/**
 * What the extension declares it takes from the router, or null.
 *
 * Read from either field, because which one holds it is the manifest's
 * business and not this check's. It is a DEV dependency: esbuild takes the
 * router into `dist/dabbler.cjs` at build time and nothing under
 * `node_modules/` is loaded at runtime, so declaring it as a runtime
 * dependency made a plain `vsce package` resolve a production tree the
 * extension does not have. What this function is for is unchanged and is
 * the reason it reads both -- the bundled router must be the version being
 * released, and a manifest that names another is a build wrapping
 * something else.
 */
export function declaredRouterDependency(repoRoot: string): string | null {
  try {
    const doc = JSON.parse(
      readText(`${repoRoot}/tools/dabbler-ai-orchestration/package.json`),
    ) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    return (
      doc.dependencies?.["dabbler-ai-router"] ??
      doc.devDependencies?.["dabbler-ai-router"] ??
      null
    );
  } catch {
    return null;
  }
}

/** One version, or the sentence saying why this repository does not have one. */
export interface ReleaseVersion {
  readonly version: string | null;
  readonly reason: string;
}

/** What `version.json` declares, or null when it declares nothing usable. */
export function canonicalVersion(repoRoot: string): string | null {
  try {
    const doc = JSON.parse(readText(`${repoRoot}/version.json`)) as { version?: unknown };
    const declared = doc.version;
    return typeof declared === "string" && /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(declared)
      ? declared
      : null;
  } catch {
    return null;
  }
}

/**
 * The repository's ONE version, and whether every manifest carries it.
 *
 * The router used to carry its own number and the extension another -- an
 * install showed router 2.0.0 beside extension 2.7.0, which is two things
 * where the operator has one. `version.json` is now the source and nothing
 * else is authored: `npm run stamp:version` writes it into both manifests,
 * the extension's dependency on the router, and the lock file.
 *
 * This asks whether that stamping is current, and `dabbler release` asks it
 * before it tags -- because a stale manifest is exactly the thing that would
 * otherwise become public as two artifacts nobody can say the version of.
 * The remedy is named rather than left to be worked out: three literals
 * hand-synchronised is the state this replaced.
 */
export function releaseVersion(repoRoot: string): ReleaseVersion {
  const canonical = canonicalVersion(repoRoot);
  if (canonical === null) {
    return {
      version: null,
      reason:
        "version.json does not declare a version, and it is the one file that " +
        "does: every manifest is stamped from it by `npm run stamp:version`",
    };
  }
  const stale: string[] = [];
  const router = packageVersion(repoRoot, "packages/router/package.json");
  const extension = packageVersion(
    repoRoot,
    "tools/dabbler-ai-orchestration/package.json",
  );
  if (router !== canonical) stale.push(`packages/router/package.json declares ${router}`);
  if (extension !== canonical) {
    stale.push(`tools/dabbler-ai-orchestration/package.json declares ${extension}`);
  }
  // Exactly, and it must be there. The extension BUNDLES the router, so a
  // dependency naming any other version is a Marketplace build wrapping
  // something else -- and a range that merely contains the number ("^2.0.0"
  // for 2.8.0, or 12.8.0 for 2.8.0) is not this version being named.
  const dependency = declaredRouterDependency(repoRoot);
  if (dependency !== canonical) {
    stale.push(
      `the extension depends on dabbler-ai-router ${dependency ?? "nothing"}`,
    );
  }
  if (stale.length > 0) {
    return {
      version: null,
      reason:
        `version.json declares ${canonical}, and ${stale.join("; ")}. ` +
        "Run `npm run stamp:version` -- the manifests are stamped from that " +
        "file, never edited beside it",
    };
  }
  return { version: canonical, reason: "" };
}

/**
 * The tag an answer means. One, because there is one artifact.
 *
 * There were two until 2026-09-02, and an ORDER between them: the router to
 * npm first and the extension after, because the extension bundles the
 * router and a Marketplace version whose npm half was missing would be the
 * broken half-release. npm is retired -- the extension IS the distribution,
 * and `dist/dabbler.cjs` ships inside it -- so there is no half that can be
 * missing and nothing left to sequence.
 */
export function tagsFor(answer: string, version: string): string[] {
  if (answer === "release-candidate") return [`vsix-v${version}-rc1`];
  if (answer === "publish") return [`vsix-v${version}`];
  return [];
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
    declared: false,
  };
}

/**
 * The commit a `ls-remote --tags` answer says the tag names, or null.
 *
 * An annotated tag answers on two lines -- the tag object, and the commit
 * it peels to under `^{}` -- and the peeled line is the one that matters:
 * the tag object's own SHA is not a commit and comparing it to HEAD would
 * refuse every annotated tag ever made. A lightweight tag answers on one
 * line, which already is the commit.
 */
export function taggedCommit(lsRemote: string, tag: string): string | null {
  let plain: string | null = null;
  for (const line of lsRemote.split(/\r?\n/)) {
    const [sha, ref] = line.split("\t");
    if (!sha || !ref) continue;
    if (ref.trim() === `refs/tags/${tag}^{}`) return sha.trim();
    if (ref.trim() === `refs/tags/${tag}`) plain = sha.trim();
  }
  return plain;
}

/**
 * Step (f) where the release is a tag: the run RECORDS it, and never makes
 * it.
 *
 * The division is the point, and it is not squeamishness. A tag push
 * publishes to everyone the moment CI sees it, and `dabbler release` is
 * where that act lives precisely so it waits on the operator's own
 * `publication` decision rather than on a phase advancing. If this ran
 * `git tag` itself, a session would publish by reaching step (f), which is
 * the opposite of what the verb was built to prevent.
 *
 * So this asks one question -- is the tag for this repository's version on
 * the remote? -- and answers it as `published` or `refused`. The refusal
 * names the verb, because the operator reading it is one command away.
 * `published_when_releasable` is untouched: it still wants a `published`
 * row, and a session that was supposed to ship and did not still cannot
 * close as one that did.
 */
function tagReleaseRun(
  sessionsDir: string,
  root: string,
  sessionNumber: number,
  gates: readonly GateResult[],
  options: PackageOptions,
): PackagingRun {
  const agreed = releaseVersion(root);
  if (agreed.version === null) {
    return refusal(sessionNumber, true, `the release version is not settled: ${agreed.reason}`, gates);
  }
  const tag = tagsFor("publish", agreed.version)[0]!;
  if (options.dryRun === true) {
    return { ...refusal(sessionNumber, true, "", gates), ready: true, declared: true, feed: tag };
  }
  // On the REMOTE, not merely local. A tag that exists only here publishes
  // nothing: the workflow fires on what origin received, so a local tag
  // would let the record say published while the Marketplace served the
  // version before it.
  // BOTH patterns, and the second is not decoration: `ls-remote` matches
  // the refs its patterns name and nothing else, so asking for the tag
  // alone returns the tag OBJECT's line and never the peeled `^{}` one.
  // Session 137 shipped exactly that mistake for one publish attempt --
  // the object SHA was compared to a commit and every annotated tag was
  // refused -- and the test did not catch it, because the fake answered
  // with both lines regardless of what was asked.
  const onRemote = runGit(root, ["ls-remote", "--tags", "origin", tag, `${tag}^{}`]);
  if (onRemote.code !== 0) {
    return refusal(
      sessionNumber,
      true,
      `could not ask origin whether ${tag} exists: ${onRemote.stderr.trim()}`,
      gates,
    );
  }
  const tagged = taggedCommit(onRemote.stdout, tag);
  if (tagged === null) {
    return refusal(
      sessionNumber,
      true,
      `this repository releases by tag, and ${tag} is not on origin, so ` +
        "nothing has been published. The tag is the one act here that " +
        "cannot be taken back, so it is not made by a phase advancing: run " +
        "`dabbler release`, which states what would ship and waits for the " +
        "`publication` decision (`dabbler owed list`) before it tags. Then " +
        "resume, and this records what the tag did.",
      gates,
    );
  }
  // The NAME is not the evidence; the commit under it is. A session whose
  // version bump was missed still declares a version that was released
  // before, from an older commit -- an ordinary release mistake, not an
  // exotic one -- and matching on the name alone would file a `published`
  // row for work CI never saw, which is precisely the claim
  // `published_when_releasable` exists to make impossible. The land phase
  // has already committed and pushed this session, so the tag has to name
  // that commit.
  const head = runGit(root, ["rev-parse", "HEAD"]);
  if (head.code !== 0) {
    return refusal(sessionNumber, true, `could not read HEAD: ${head.stderr.trim()}`, gates);
  }
  const headSha = head.stdout.trim();
  if (tagged !== headSha) {
    // Not equality, and the difference is the framework's own commit.
    //
    // Equality was this check's first shape, and against round 3's finding
    // it was right: a tag matched by NAME alone would file a `published`
    // row for a release CI made from an earlier commit. But the land writes
    // the session's verification bookkeeping AFTER `dabbler release` has
    // tagged -- `release` is deliberately a person's act and not a phase
    // advancing -- so HEAD moves past the tag by a commit the framework
    // itself made, carrying nothing that ships. Session 137, 2026-09-09,
    // published 2.0.16 to the Marketplace and could then never record it:
    // eight lines of `change-log.md` and `sessions.json` stood between the
    // tag and HEAD, and the only remedy the refusal named -- bump the
    // version -- would have shipped a new number for an artifact already
    // built under the old one, after a round that would end in another
    // bookkeeping commit. A ratchet with no fixed point.
    //
    // So the question is the one the gates already ask: has anything
    // MATERIAL moved? `isSetBookkeeping` is their filter and it is reused
    // here rather than restated, because a tag check and a gate that
    // disagree about what counts as a change is the defect itself. The
    // ancestry test is what keeps round 3's finding answered: a tag off
    // this history, or ahead of it, is not an earlier state of this work.
    const ancestry = runGit(root, ["merge-base", "--is-ancestor", tagged, headSha]);
    const drift =
      ancestry.code === 0
        ? runGit(root, ["diff", "--name-only", `${tagged}..${headSha}`])
        : null;
    if (drift !== null && drift.code !== 0) {
      return refusal(
        sessionNumber,
        true,
        `could not diff ${tag} against HEAD: ${drift.stderr.trim()}`,
        gates,
      );
    }
    const setRel = repoRelativePath(root, sessionsDir);
    const material =
      drift === null
        ? null
        : drift.stdout
            .split("\n")
            .map((line) => line.trim().replace(/\\/g, "/"))
            .filter((line) => line !== "")
            .filter((line) => !isSetBookkeeping(line, setRel));
    if (material === null || material.length > 0) {
      const shown = material ?? [];
      const preview = shown.slice(0, 5).join(", ");
      const suffix = shown.length > 5 ? ` (+${shown.length - 5} more)` : "";
      return refusal(
        sessionNumber,
        true,
        `${tag} is on origin but names commit ${tagged.slice(0, 12)}, and this ` +
          `session landed ${headSha.slice(0, 12)}. ` +
          (material === null
            ? `${tag} is not an ancestor of HEAD, so it names a commit this ` +
              "work never passed through rather than an earlier state of it."
            : `${material.length} path(s) that ship changed after it: ` +
              `${preview}${suffix}.`) +
          " A tag that was made for an earlier commit released that commit, " +
          "not this one: the usual cause is a version that was not bumped, " +
          "so the manifests still name a version already published. Bump " +
          "`version.json`, run `npm run stamp:version`, and release the " +
          "version this work is.",
        gates,
      );
    }
  }
  return {
    ...refusal(sessionNumber, true, "", gates),
    outcome: OUTCOME_PUBLISHED,
    // The tag IS the artifact here: it is what a person can look up, what
    // CI consumed, and what the Marketplace version can be traced back to.
    feed: "origin",
    artifacts: [tag],
    treeDigest: snapshotWorktreeTree(root),
  };
}

export interface PackageOptions {
  readonly config?: RouterConfig | null;
  readonly dryRun?: boolean;
  /** The version substituted for `{version}`; a pack that names it is refused without one. */
  readonly version?: string | null;
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
    const refused = refusal(
      sessionNumber,
      false,
      `session ${sessionNumber} did not declare itself releasable at ` +
        "step (a), so it cannot publish. An absent declaration is a " +
        "refusal, not an unknown: declaring after the work is done is a " +
        "model deciding in hindsight what may reach a feed.",
    );
    // A rehearsal still reads the declaration, because that is the one
    // thing it can prove here: the block parses, the feed and the
    // credential's name are what they should be. A malformed block throws
    // the same way it would on the real run.
    return options.dryRun === true
      ? { ...refused, declared: loadDeclaration(config, moduleOfSession(sessionsDir, sessionNumber)) !== null }
      : refused;
  }

  const switched = refuseIfResolvingFromSource(repoRootFor(sessionsDir), "packaging");
  if (switched !== null) return refusal(sessionNumber, true, switched);

  // The session's module's own block answers for a module session, the root
  // block otherwise -- the same rule `module pack` reads by.
  const module = moduleOfSession(sessionsDir, sessionNumber);
  const tagRelease = loadTagRelease(config, module);
  const declaration = tagRelease === null ? loadDeclaration(config, module) : null;
  if (tagRelease === null && declaration === null) {
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

  // A tag release runs no pack and no push: everything below this point is
  // about a feed, a credential and an artifact on disk, and a tag has none
  // of the three. It runs AFTER the gates above, for the same reason the
  // pack does -- step (f) follows (e), and a tag naming a commit that never
  // passed them would be the release this whole phase exists to prevent.
  if (tagRelease !== null) {
    return tagReleaseRun(sessionsDir, root, sessionNumber, gates, options);
  }
  if (declaration === null) throw new PackagingError("unreachable: no declaration");

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
      declared: true,
    };
  }

  // Narrowed here rather than above: the guard proves a declared credential
  // resolved, and an undeclared one is the empty string by construction.
  return execute(root, sessionNumber, declaration, secretValue ?? "", gates, options.version ?? null);
}

/**
 * The module a session is on, from its ledger row: the focused checkout's
 * module, else the declaration's first, else none -- the same reading the
 * run of record and the land make.
 */
function moduleOfSession(sessionsDir: string, sessionNumber: number): string | null {
  const rows = readSessionState(sessionsDir)?.["sessions"];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) continue;
    const record = row as Record<string, unknown>;
    if (Number(record["number"]) !== sessionNumber) continue;
    const checkout = record["checkout"];
    if (typeof checkout === "object" && checkout !== null && !Array.isArray(checkout)) {
      const module = (checkout as Record<string, unknown>)["module"];
      if (typeof module === "string" && module.trim() !== "") return module.trim();
    }
    const modules = record["modules"];
    const first = Array.isArray(modules) ? modules.map(String).find((slug) => slug.trim() !== "") : undefined;
    return first ?? null;
  }
  return null;
}

function execute(
  root: string,
  sessionNumber: number,
  declaration: Declaration,
  secretValue: string,
  gates: readonly GateResult[],
  versionGiven: string | null = null,
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
    declared: true,
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
  const version = String(versionGiven ?? "").trim();
  if (pack.usesVersion && version === "") {
    return refusal(
      sessionNumber,
      true,
      `the pack names ${PLACEHOLDER_VERSION} and this run has no version to give it; ` +
        "a module pack supplies one, and a repository-wide publish declares a pack " +
        "that does not take it.",
      gates,
    );
  }
  const packArgv = substitute(pack.argv, {
    [PLACEHOLDER_OUTPUT]: outputDir,
    ...(version === "" ? {} : { [PLACEHOLDER_VERSION]: version }),
  });
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
