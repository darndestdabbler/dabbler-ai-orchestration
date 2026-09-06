// The verifier's tool surface: what it may look at, how much of it, what it
// was actually shown, and the one thing it may change.
//
// Four operations reach the verifier -- list files by pattern, search file
// contents by pattern, read a file, and create or modify a test file. The
// first three arrive on the seat path as the Copilot CLI's own `glob`, `grep`
// and `view` tools. The CLI executes them inside its own process, so this
// module cannot refuse a read; what it can do is declare the limits to the
// verifier and then measure the round against them, which is also the limit
// that matters: a verifier that reaches a blocking finding by not looking at
// the counterevidence is caught by the log, never by a refusal.
//
// The fourth is different in kind, and the difference is the point. The
// verifier holds no write tool on either transport -- it emits the file it
// wants in its answer, and the framework writes the bytes. So a write can be
// refused outright, and is: a path outside the test root this repository
// declares never reaches the filesystem. Enforcement lives here rather than in
// the prompt, because a prompt is a request and this is a boundary.
//
// Fidelity is the part that is not bookkeeping. Scope, budget and a log record
// which file was opened and never what came back from it, and those differ
// whenever anything sits between the file and the model. The CLI's scrubbing
// layer rewrites credential-shaped text, so a correct authorization header
// built from a variable is displayed as a run of asterisks -- one confident,
// specific, wrong Major finding already came from exactly that. The scrubber
// is right and stays; what was missing is the mark. The example is described
// here and in the briefing, never quoted: the scrubber also runs over the
// CLI's own serialised event stream, and a credential-shaped literal in this
// text came back as JSON the rewrite had broken (see `claimedEventType` in
// transports/copilot.ts).
//
// `view` returns its content as `N. <text>` with the file's own 1-based line
// numbers, which turns fidelity into an exact comparison instead of a guess:
// the shown line carries the number of the disk line it claims to be, so the
// two are compared directly. Only the lines actually shown are compared, so a
// truncated or ranged read is not slandered as a transform.

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative } from "node:path";

import {
  type SelectionConfig,
  type SuiteScope,
  declaresTests as selectionDeclaresTests,
  namesATest,
  scopeIsComplete,
  selectionTestRoots,
} from "./checks.ts";
import { canonicalPath } from "./journal.ts";
import { pythonRepr } from "./pythonJson.ts";

/** The round could look at the tree through tools. */
export const MODE_TOOLS = "tools";
/**
 * The round could not. The direct-API path sends no tools at all, and a round
 * that could not look is never reported as equivalent to one that could --
 * that is gap 1 re-opened, acceptable as a fallback and unacceptable as a
 * silent one.
 */
export const MODE_NONE = "none";

export const OP_LIST = "list";
export const OP_SEARCH = "search";
export const OP_READ = "read";
/**
 * The only write, and the only operation no tool performs: the verifier asks
 * for it in its answer and the framework acts, which is what makes a refusal
 * possible at all.
 */
export const OP_WRITE = "write";

/**
 * The CLI tool that performs each granted read operation. This mapping is the
 * whole read grant: a tool absent from it is not part of the surface.
 */
export const TOOL_OPERATIONS: Readonly<Record<string, string>> = {
  glob: OP_LIST,
  grep: OP_SEARCH,
  view: OP_READ,
};

export const READ_OPERATIONS: readonly string[] = [OP_LIST, OP_SEARCH, OP_READ];

/**
 * Read operations allowed per round. A ceiling, not an allowance to spend: a
 * review that needs more than this many files is reviewing more than one
 * session's change.
 */
export const DEFAULT_READ_BUDGET = 40;

/** The shown bytes matched the bytes on disk, line for line. */
export const FIDELITY_VERBATIM = "verbatim";
/** They did not. A finding resting on this read is weighable, not trustable. */
export const FIDELITY_TRANSFORMED = "transformed";
/**
 * The comparison could not be made -- the file is gone, unreadable as text, or
 * the tool returned nothing line-numbered to compare. Neither a clean bill nor
 * an accusation, and distinct from both on purpose.
 */
export const FIDELITY_UNVERIFIED = "unverified";

/** The framework wrote the bytes. */
export const WRITE_ACCEPTED = "accepted";
/**
 * It did not, and the reason is on the row. A refused write is recorded rather
 * than dropped: a boundary nobody can see being enforced is indistinguishable
 * from one that is not there.
 */
export const WRITE_REFUSED = "refused";

/** Whether the accepted write brought a file into existence or replaced one. */
export const ACTION_CREATED = "created";
export const ACTION_MODIFIED = "modified";

/**
 * The fence label each kind of round writes under. Different jobs get
 * different labels so a block lifted out of one round's transcript is not
 * honoured by another whose boundary is a different shape.
 */
export const WRITE_LABEL_TEST = "test-write";
export const WRITE_LABEL_FIX = "fix-write";

// Ledger rows are read by humans and by the unresolved-session view; an
// unbounded scope list or operation log helps neither.
const MAX_RECORDED_SCOPE = 200;
const MAX_RECORDED_OPERATIONS = 200;

const VIEW_LINE = /^\s*(\d+)\.(?: (.*))?$/;

const IMPORT_STATEMENT =
  /^[ \t]*(?:from[ \t]+(\.*)([\w.]*)[ \t]+import[ \t]+([^\n#]*)|import[ \t]+([\w.]+))/gm;

const NAME = /^[A-Za-z_]\w*/;

// --- Scope -------------------------------------------------------------------

function posix(value: unknown): string {
  const text = String(value)
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .replace(/^\.\//, "");
  return text === "." ? "" : text;
}

/**
 * The bare names an `import` clause lists, aliases and parentheses discarded.
 * `from . import ledger` names a sibling module, not the package, so the names
 * are half of what an import declares.
 */
function importedNames(names: string): string[] {
  const found: string[] = [];
  for (const part of names.replace(/\(/g, " ").replace(/\)/g, " ").split(",")) {
    const match = NAME.exec(part.trim());
    if (match) found.push(match[0]);
  }
  return found;
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * The intra-repository modules the changed Python files import.
 *
 * The import statement is the declaration; there is no second manifest to keep
 * in step with it. First-order only -- a transitive closure is the whole
 * repository again by another route, which is the thing scope exists to
 * prevent.
 */
export function declaredDependencies(
  repoRoot: string,
  relPaths: readonly string[],
): Set<string> {
  const found = new Set<string>();
  for (const rel of relPaths) {
    if (!rel.endsWith(".py")) continue;
    let source: string;
    try {
      source = readFileSync(join(repoRoot, rel), "utf8");
    } catch {
      continue;
    }
    const packagePath = posix(dirname(rel));
    for (const match of source.matchAll(IMPORT_STATEMENT)) {
      const [, dots, module, names, plain] = match;
      let stem: string;
      let submodules: string[];
      if (plain) {
        stem = plain.replace(/\./g, "/");
        submodules = [];
      } else {
        let parts: string[];
        if (!dots) {
          parts = (module ?? "").split(".").filter(Boolean);
        } else {
          // One dot means "this package"; each extra dot climbs.
          parts = packagePath ? packagePath.split("/") : [];
          for (let climb = 0; climb < dots.length - 1; climb += 1) parts.pop();
          parts.push(...(module ?? "").split(".").filter(Boolean));
        }
        stem = parts.join("/");
        submodules = importedNames(names ?? "");
      }
      stem = posix(stem);
      const stems = stem ? [stem] : [];
      for (const name of submodules) stems.push(stem ? `${stem}/${name}` : name);
      for (const candidateStem of stems) {
        for (const candidate of [`${candidateStem}.py`, `${candidateStem}/__init__.py`]) {
          if (isFile(join(repoRoot, candidate))) found.add(candidate);
        }
      }
    }
  }
  return found;
}

/**
 * What this round's verifier is scoped to: the session's changed files, the
 * modules they declare they depend on, and the session set's own directory --
 * which carries the spec the work is judged against.
 *
 * `sessionsDir` is optional: a round outside a session set has no spec
 * directory to add, and naming one that does not exist would put a path in the
 * scope that no reader could open.
 *
 * Never the whole repository. A scope that resolved to everything would make
 * the out-of-scope count structurally unreachable and the limit a decoration.
 */
export function sessionScope(
  repoRoot: string,
  sessionsDir: string | null,
  changedPaths: readonly string[] | null,
): string[] {
  const changed = (changedPaths ?? [])
    .filter((path) => String(path).trim() !== "")
    .map(posix);
  const scope = new Set(changed);
  for (const dependency of declaredDependencies(repoRoot, changed)) scope.add(dependency);
  const setRel = sessionsDir ? relativePosix(repoRoot, sessionsDir) : null;
  if (setRel) scope.add(setRel);
  return [...scope].sort();
}

/**
 * The absolute path `path` names inside the repository, or null.
 *
 * An absolute path is placed against the repository; a relative one is already
 * repository-relative, because the CLI runs with the repository as its working
 * directory. Resolving a relative tool argument against this process's own
 * directory instead would silently invent a path.
 *
 * Separators are normalised before anything else, so that a backslash is a
 * separator on every platform. It already is on Windows; on POSIX,
 * `tests\..\pkg\x.py` is a single filename here and a traversal to the caller
 * of `open`, and a boundary that decides on one reading while the filesystem
 * acts on the other fails open.
 */
function relativeToRepo(repoRoot: string, path: unknown): string | null {
  try {
    // Canonical on both sides, which for a BOUNDARY is the stricter reading
    // rather than the looser one: a symlink or junction out of the
    // repository resolves to where it actually goes, and two spellings of
    // the same directory -- the 8.3 short name Windows hands out, a mapped
    // drive -- stop reading as "outside" for a path that is inside.
    const root = canonicalPath(repoRoot);
    const raw = String(path).replace(/\\/g, "/");
    const candidate = isAbsolute(raw) ? raw : join(root, raw);
    const resolved = canonicalPath(candidate);
    const step = relative(root, resolved);
    if (step.startsWith("..") || isAbsolute(step)) return null;
    return resolved;
  } catch {
    return null;
  }
}

/** The repository-relative posix form of `path`, traversal collapsed. */
export function relativePosix(repoRoot: string, path: unknown): string | null {
  const resolved = relativeToRepo(repoRoot, path);
  if (resolved === null) return null;
  return posix(relative(canonicalPath(repoRoot), resolved));
}

/**
 * Scope entries are files or directories; a directory covers what is under it.
 * An unresolvable path is out of scope rather than exempt.
 */
export function inScope(scope: readonly string[], rel: string): boolean {
  if (!rel) return false;
  return scope.some(
    (entry) => rel === entry || rel.startsWith(`${entry.replace(/\/+$/, "")}/`),
  );
}

// --- The grant ---------------------------------------------------------------

export interface AgencyGrant {
  readonly mode: string;
  readonly scope: readonly string[];
  readonly readBudget: number;
  /**
   * Where this repository says its tests live and what it calls them, one
   * `SuiteScope` per declaring suite. Supplied by the caller from the same
   * declaration test selection reads, so the test root is defined in one
   * place.
   */
  readonly testScopes: readonly SuiteScope[];
  /**
   * Whether this round may author tests at all. A code review round may not:
   * the tests phase is a different round with a different job, and a surface
   * offered everywhere is a surface used everywhere.
   */
  readonly allowWrite: boolean;
  /**
   * The exact paths a fix round may write to. When set it replaces the
   * test-root rule outright rather than narrowing it: a fix repairs the code
   * that failed, and a round confined to an envelope is confined to that
   * envelope and nothing beside it.
   */
  readonly writeEnvelope: readonly string[];
  /**
   * The fence label this round's writes carry. Two rounds with different jobs
   * get different labels, so a block copied out of one round's transcript into
   * another's is not silently honoured.
   */
  readonly writeLabel: string;
}

/**
 * What this round could do. Reads need a transport that carries the tools; the
 * write does not, because no tool performs it -- the model describes a file
 * and the framework opens one, which works over any transport that returns
 * text.
 */
export function grantOperations(grant: AgencyGrant): string[] {
  const reads = grant.mode === MODE_TOOLS ? [...READ_OPERATIONS] : [];
  return grant.allowWrite ? [...reads, OP_WRITE] : reads;
}

export function grantSelection(grant: AgencyGrant): SelectionConfig {
  return { scopes: grant.testScopes, smoke: [], repoWide: [], rules: [] };
}

/** Every root a write could land under, across the declared suites. */
export function grantTestRoots(grant: AgencyGrant): string[] {
  return selectionTestRoots(grantSelection(grant));
}

export function grantDeclaresTests(grant: AgencyGrant): boolean {
  return selectionDeclaresTests(grantSelection(grant));
}

export interface GrantOptions {
  readonly scope?: readonly string[];
  readonly readBudget?: number;
  readonly testScopes?: readonly SuiteScope[];
  readonly allowWrite?: boolean;
  readonly writeEnvelope?: readonly string[];
  readonly writeLabel?: string;
}

/**
 * Only the seat path is agentic. Naming the transport here keeps the two paths
 * from being recorded as the same kind of review.
 *
 * **The write does not depend on the transport, and the reads do.** The tool
 * surface is the seat's, because giving it to the direct-API path means a
 * tool-use loop written three times against three vendors' function-calling
 * protocols. The write costs none of that: it is a fenced block in an ordinary
 * answer. Confining it to the seat as well would put the tests phase -- which
 * the lifecycle requires of every session -- out of reach of the configuration
 * this package ships as its default, and the round that authored without tools
 * already says so in `mode`.
 */
export function grantForTransport(
  transport: string,
  options: GrantOptions = {},
): AgencyGrant {
  const testScopes = [...(options.testScopes ?? [])];
  const allowWrite = options.allowWrite ?? false;
  const writeEnvelope = [...(options.writeEnvelope ?? [])];
  const writeLabel = options.writeLabel ?? WRITE_LABEL_TEST;
  if (transport === "copilot-cli") {
    return {
      mode: MODE_TOOLS,
      scope: [...(options.scope ?? [])],
      readBudget: options.readBudget ?? DEFAULT_READ_BUDGET,
      testScopes,
      allowWrite,
      writeEnvelope,
      writeLabel,
    };
  }
  return {
    mode: MODE_NONE,
    scope: [],
    readBudget: 0,
    testScopes,
    allowWrite,
    writeEnvelope,
    writeLabel,
  };
}

/**
 * What the verifier is told about its own surface.
 *
 * Nothing is described that was not granted: describing tools that were not
 * sent invites a model to report reads it never made, and describing a write
 * that will be refused invites a proposal that costs a call to turn away.
 */
export function briefing(grant: AgencyGrant): string {
  const parts: string[] = [];
  if (grant.mode === MODE_TOOLS) {
    parts.push(...readBriefing(grant));
  } else if (grant.allowWrite) {
    parts.push(
      "## What you can look at\n\n" +
        "**Only what is in this message.** You have no tools on this " +
        "transport — no way to list, search or open a file. Work from " +
        "the text you were given, and say so plainly where it is not " +
        "enough rather than describing a file you did not see.",
    );
  }
  if (grant.allowWrite) parts.push(writeBriefing(grant));
  return parts.join("\n\n");
}

function readBriefing(grant: AgencyGrant): string[] {
  const listed = grant.scope
    .slice(0, MAX_RECORDED_SCOPE)
    .map((path) => `- ${path}`)
    .join("\n");
  const writeNote = grant.allowWrite ? "" : " and no way to change anything";
  return [
    "## Your read surface\n\n" +
      "You may **list files** (`glob`), **search file contents** (`grep`) " +
      `and **read a file** (\`view\`). You have no other tools${writeNote}.` +
      "\n\n" +
      "**Scope** — what this round is confined to, not the " +
      `repository:\n\n${listed}\n\n` +
      `**Budget** — at most ${grant.readBudget} reads this round.\n\n` +
      "**Log** — every list, search and read is recorded on the round, " +
      "confined to the scope or not. Confine a search or a listing by " +
      "naming the scope paths you want it to cover; a pattern on its own " +
      "reaches the whole tree and is recorded as unconfined. Reading " +
      "nothing is recorded too: a finding asserted about a file you did " +
      "not open is a finding without evidence.",
    "**What you are shown may not be what is on disk.** Credential-" +
      "shaped text is rewritten before it reaches you, so a correct " +
      "authorization header built from a variable can arrive as a run of " +
      "asterisks. The framework " +
      "compares what you were shown against the bytes on disk and marks " +
      "the difference. Do not raise a hardcoded-secret finding from a " +
      "read alone.",
  ];
}

function writeBriefing(grant: AgencyGrant): string {
  if (grant.writeEnvelope.length > 0) return envelopeBriefing(grant);
  return (
    "## Your one write\n\n" +
    "You may **create or modify a test file**, and you do it by asking " +
    "rather than by acting: emit the whole file inside a block of " +
    "exactly this form, and the framework writes the bytes.\n\n" +
    "````text\n" +
    "```" +
    grant.writeLabel +
    " path=" +
    exampleTestPath(grant) +
    "\n" +
    "<the complete contents of the file>\n" +
    "```\n" +
    "````\n\n" +
    "The block carries the **whole file**, never a patch or a fragment: " +
    "what it contains is what the file will contain. Emit one block per " +
    "file.\n\n" +
    "**Writes are confined to this repository's declared test " +
    `locations** — ${declaredLocations(grant)}. A path ` +
    "outside that is refused by the framework before anything is " +
    "written, and the refusal is recorded on the round — this is a " +
    "boundary, not a request. You have no other write and no filesystem " +
    "access of any kind."
  );
}

/**
 * The write surface of a round confined to an envelope.
 *
 * The paths are listed rather than described. A rule stated in prose is a rule
 * a model reasons about; a list is a list, and the framework is holding the
 * same one.
 */
function envelopeBriefing(grant: AgencyGrant): string {
  const listed = grant.writeEnvelope
    .slice(0, MAX_RECORDED_SCOPE)
    .map((path) => `- \`${path}\``)
    .join("\n");
  return (
    "## Your one write\n\n" +
    "You may **modify a file inside the envelope below**, and you do it " +
    "by asking rather than by acting: emit the whole file inside a block " +
    "of exactly this form, and the framework writes the bytes.\n\n" +
    "````text\n" +
    "```" +
    grant.writeLabel +
    " path=" +
    grant.writeEnvelope[0] +
    "\n" +
    "<the complete contents of the file>\n" +
    "```\n" +
    "````\n\n" +
    "The block carries the **whole file**, never a patch or a fragment: " +
    "what it contains is what the file will contain. Emit one block per " +
    "file.\n\n" +
    `**The envelope — these paths, exactly:**\n\n${listed}\n\n` +
    "Anything else is refused by the framework before a file is opened, " +
    "and the refusal is recorded on the round. This is a boundary, not a " +
    "request: you have no filesystem access of any kind, so there is no " +
    "route by which a path outside this list can change."
  );
}

/**
 * Every suite's roots and glob, listed rather than summarized. One glob cannot
 * describe a repository that is Java and .NET at once, and a briefing that
 * named only the first would have the verifier write files the framework then
 * refuses.
 */
function declaredLocations(grant: AgencyGrant): string {
  const parts: string[] = [];
  for (const scope of grant.testScopes) {
    if (!scopeIsComplete(scope)) continue;
    const roots = scope.roots.map((root) => `\`${trimSlashes(root)}/\``).join(", ");
    const suite = scope.suite ? ` (suite \`${scope.suite}\`)` : "";
    parts.push(`${roots} for filenames matching \`${scope.glob}\`${suite}`);
  }
  return parts.join("; ") || "(none declared)";
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, "");
}

/**
 * A path from this repository's own declaration, so the example the verifier
 * is shown is one the framework would actually accept.
 */
function exampleTestPath(grant: AgencyGrant): string {
  const complete = grant.testScopes.filter(scopeIsComplete);
  if (complete.length === 0) return "tests/test_example.py";
  const scope = complete[0];
  return `${trimSlashes(scope.roots[0])}/${scope.glob.replace("*", "example")}`;
}

// --- What the round actually did ---------------------------------------------

export interface AgencyOperation {
  readonly kind: string;
  readonly target: string;
  readonly inScope: boolean;
  readonly fidelity: string | null;
  readonly detail: string | null;
}

export function operationRow(operation: AgencyOperation): Record<string, unknown> {
  const row: Record<string, unknown> = {
    kind: operation.kind,
    target: operation.target,
    in_scope: operation.inScope,
  };
  if (operation.fidelity) row["fidelity"] = operation.fidelity;
  if (operation.detail) row["detail"] = operation.detail;
  return row;
}

/** One proposed write and what the framework did about it. */
export interface TestWrite {
  readonly path: string;
  readonly outcome: string;
  readonly action: string | null;
  readonly bytesWritten: number;
  readonly reason: string | null;
}

export function writeAccepted(write: TestWrite): boolean {
  return write.outcome === WRITE_ACCEPTED;
}

export function writeRow(write: TestWrite): Record<string, unknown> {
  const row: Record<string, unknown> = { path: write.path, outcome: write.outcome };
  if (write.action) row["action"] = write.action;
  if (writeAccepted(write)) row["bytes"] = write.bytesWritten;
  if (write.reason) row["reason"] = write.reason;
  return row;
}

export interface AgencyRecord {
  readonly mode: string;
  readonly grant: AgencyGrant;
  readonly operations: readonly AgencyOperation[];
  /**
   * Writes are kept apart from operations on purpose: an operation is
   * something the model did and the transport reported, a write is something
   * the model asked for and the framework decided.
   */
  readonly writes: readonly TestWrite[];
}

function countKind(record: AgencyRecord, kind: string): number {
  return record.operations.filter((operation) => operation.kind === kind).length;
}

export function recordReads(record: AgencyRecord): number {
  return countKind(record, OP_READ);
}

export function recordOutOfScope(record: AgencyRecord): number {
  return record.operations.filter((operation) => !operation.inScope).length;
}

export function recordOverBudget(record: AgencyRecord): number {
  return Math.max(0, recordReads(record) - record.grant.readBudget);
}

export function recordTransformedReads(record: AgencyRecord): number {
  return record.operations.filter(
    (operation) => operation.fidelity === FIDELITY_TRANSFORMED,
  ).length;
}

export function recordWritesApplied(record: AgencyRecord): number {
  return record.writes.filter(writeAccepted).length;
}

export function recordWritesRefused(record: AgencyRecord): number {
  return record.writes.filter((write) => !writeAccepted(write)).length;
}

export function recordRow(record: AgencyRecord): Record<string, unknown> {
  const row: Record<string, unknown> = {
    mode: record.mode,
    operations_granted: grantOperations(record.grant),
    read_budget: record.grant.readBudget,
    scope: record.grant.scope.slice(0, MAX_RECORDED_SCOPE),
    scope_size: record.grant.scope.length,
    reads: recordReads(record),
    listings: countKind(record, OP_LIST),
    searches: countKind(record, OP_SEARCH),
    out_of_scope: recordOutOfScope(record),
    over_budget: recordOverBudget(record),
    transformed_reads: recordTransformedReads(record),
    operations: record.operations
      .slice(0, MAX_RECORDED_OPERATIONS)
      .map(operationRow),
    // Every write is recorded, applied or refused and never truncated: a
    // boundary is only worth having if the record shows each time it held.
    writes: record.writes.map(writeRow),
    writes_applied: recordWritesApplied(record),
    writes_refused: recordWritesRefused(record),
  };
  if (record.mode === MODE_NONE) {
    row["reason"] =
      "this transport sends no tools; the verifier could not look " +
      "at the tree and this round is not equivalent to one that " +
      "could";
  }
  return row;
}

/**
 * Which argument names the thing an operation acted on. The read tool names a
 * path; the search and list tools name a pattern, and confine it to the scope
 * only when they also name a path. A pattern on its own reaches the whole
 * working tree, so it is recorded as unconfined rather than in scope.
 */
const PATH_ARGUMENTS: readonly string[] = ["path", "paths"];
const PATTERN_ARGUMENTS: readonly string[] = ["pattern", "query"];

function isRecordValue(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `[target, namesAPath]` for one call's arguments. */
function toolTarget(argumentsValue: unknown): [string, boolean] {
  if (!isRecordValue(argumentsValue)) return ["", false];
  for (const key of PATH_ARGUMENTS) {
    const value = argumentsValue[key];
    if (typeof value === "string" && value.trim()) return [value.trim(), true];
    if (Array.isArray(value) && value.length > 0) return [String(value[0]), true];
  }
  for (const key of PATTERN_ARGUMENTS) {
    const value = argumentsValue[key];
    if (typeof value === "string" && value.trim()) return [value.trim(), false];
  }
  return ["", false];
}

/**
 * The `N. <text>` lines a `view` returned, keyed by the file line number the
 * tool claims each one is.
 */
function shownLines(result: unknown): Map<number, string> {
  const content = isRecordValue(result) ? result["content"] : result;
  const shown = new Map<number, string>();
  if (typeof content !== "string" || !content) return shown;
  for (const raw of content.replace(/\r\n/g, "\n").split("\n")) {
    const match = VIEW_LINE.exec(raw);
    if (match) shown.set(Number(match[1]), match[2] ?? "");
  }
  return shown;
}

/**
 * `[fidelity, detail]` for one read, by comparing each shown line against the
 * disk line it numbers itself as.
 */
export function readFidelity(
  repoRoot: string,
  rel: string,
  result: unknown,
): [string, string | null] {
  const shown = shownLines(result);
  if (shown.size === 0) {
    return [FIDELITY_UNVERIFIED, "the tool returned no line-numbered content"];
  }
  let disk: string[];
  try {
    disk = readFileSync(join(repoRoot, rel), "utf8").replace(/\r\n/g, "\n").split("\n");
  } catch {
    return [FIDELITY_UNVERIFIED, "the file could not be read as text here"];
  }
  for (const number of [...shown.keys()].sort((left, right) => left - right)) {
    const text = shown.get(number)!;
    if (number < 1 || number > disk.length) continue;
    if (disk[number - 1].replace(/\r+$/, "") !== text.replace(/\r+$/, "")) {
      return [
        FIDELITY_TRANSFORMED,
        `line ${number} was shown as ${pythonRepr(text.trim().slice(0, 120))}`,
      ];
    }
  }
  return [FIDELITY_VERBATIM, null];
}

function toolCalls(metadata: unknown): unknown[] {
  const calls = isRecordValue(metadata) ? metadata["tool_calls"] : null;
  return Array.isArray(calls) ? [...calls] : [];
}

/**
 * The round's agency record, built from what the transport reported.
 *
 * A granted surface with no recorded call is left visible rather than smoothed
 * over: it is the shape a round takes when the tool grant did not reach the
 * model and the model answered from invention instead.
 *
 * `writes` are the framework's own decisions from `applyWrites`, which is why
 * they are passed in rather than recovered from metadata: no transport reports
 * them, because no transport performed them.
 */
export function recordForRound(
  repoRoot: string,
  grant: AgencyGrant,
  metadata: unknown,
  writes: readonly TestWrite[] = [],
): AgencyRecord {
  if (grant.mode !== MODE_TOOLS) {
    return { mode: MODE_NONE, grant, operations: [], writes: [...writes] };
  }

  const operations: AgencyOperation[] = [];
  for (const call of toolCalls(metadata)) {
    if (!isRecordValue(call)) continue;
    const tool = String(call["tool"] ?? "");
    const kind = TOOL_OPERATIONS[tool];
    if (kind === undefined) continue;
    let argumentsValue = call["arguments"];
    if (typeof argumentsValue === "string") {
      try {
        argumentsValue = JSON.parse(argumentsValue);
      } catch {
        argumentsValue = {};
      }
    }
    const [target, namesPath] = toolTarget(argumentsValue);
    let detail: string | null = null;
    let rel: string;
    let scoped: boolean;
    if (namesPath) {
      // `||`, not `??`: Python falls back on any falsy answer, and the empty
      // string is one -- a tool that named the repository root itself would
      // otherwise be recorded as having named nothing.
      rel = relativePosix(repoRoot, target) || posix(target);
      scoped = inScope(grant.scope, rel);
    } else {
      // A pattern with no path was not confined to anything. Calling that
      // in-scope would let a repository-wide search leave the record attesting
      // to a scoped review it did not perform.
      rel = target;
      scoped = false;
      detail = `unconfined: no path limited this ${kind} to the scope`;
    }
    let fidelity: string | null = null;
    if (kind === OP_READ) {
      const [value, readDetail] = readFidelity(repoRoot, rel, call["result"]);
      fidelity = value;
      detail = readDetail ?? detail;
    }
    operations.push({
      kind,
      target: rel || target,
      inScope: scoped,
      fidelity,
      detail,
    });
  }
  return { mode: MODE_TOOLS, grant, operations, writes: [...writes] };
}

/**
 * One line for the operator, so a transformed, unlooking or refused round is
 * visible without opening the ledger.
 */
export function summaryLine(record: AgencyRecord): string {
  const parts: string[] = [];
  if (record.mode !== MODE_TOOLS) {
    parts.push("agency: none — this round's verifier could not look at the tree");
  } else {
    parts.push(
      `agency: ${recordReads(record)} read(s), ` +
        `${countKind(record, OP_SEARCH)} search(es), ` +
        `${countKind(record, OP_LIST)} listing(s)`,
    );
    if (record.operations.length === 0) {
      parts.push("the verifier looked at nothing it was granted");
    }
    if (recordTransformedReads(record)) {
      parts.push(`${recordTransformedReads(record)} read(s) were transformed`);
    }
    if (recordOutOfScope(record)) {
      parts.push(`${recordOutOfScope(record)} not confined to scope`);
    }
    if (recordOverBudget(record)) {
      parts.push(`${recordOverBudget(record)} past the read budget`);
    }
  }
  if (recordWritesApplied(record)) {
    parts.push(`${recordWritesApplied(record)} test write(s) applied`);
  }
  if (recordWritesRefused(record)) {
    parts.push(`${recordWritesRefused(record)} write(s) refused`);
  }
  return parts.join("; ");
}

// --- The write ---------------------------------------------------------------
//
// The verifier authors tests because it did not write the code, and the
// framework performs the write because "the file says this" must be an
// observation rather than a claim. Both halves of that follow from the model
// having no filesystem: it emits a block, and everything after the block is
// the framework's.

/**
 * A proposal opens with a fenced block labelled for the round's kind and
 * carrying a path. The fence may be longer than three backticks, so a test
 * file that itself contains a fence is still expressible -- the block closes
 * only on a fence at least as long as the one that opened it.
 */
const FENCE = /^(`{3,})[ \t]*(.*?)[ \t]*$/;
const WRITE_PATH = /^path[ \t]*=[ \t]*(\S+)[ \t]*$/;

interface Proposal {
  readonly path: string;
  readonly content: string;
  readonly malformed: string | null;
}

function escapeForRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The write blocks in `text` carrying `label`, in the order they appear.
 *
 * Ordinary fenced blocks are skipped whole, so a review that quotes the format
 * inside a code sample does not accidentally propose a write. A block that
 * opens and never closes, or that names no path, is returned as malformed
 * rather than dropped: a proposal that vanishes silently looks exactly like
 * one that was never made.
 *
 * A block under some other round's label is not this round's proposal and is
 * skipped in the same way an ordinary fence is.
 */
function parseProposals(text: unknown, label: string = WRITE_LABEL_TEST): Proposal[] {
  if (typeof text !== "string" || !text.includes(label)) return [];
  const marker = new RegExp(`^${escapeForRegExp(label)}\\b[ \\t]*(.*)$`);
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const proposals: Proposal[] = [];
  let index = 0;
  while (index < lines.length) {
    const opening = FENCE.exec(lines[index]);
    if (!opening) {
      index += 1;
      continue;
    }
    const [, ticks, info] = opening;
    const matched = marker.exec(info);
    const consumed = consumeBlock(lines, index + 1, ticks);
    index = consumed.indexAfter;
    if (!matched) continue;
    const pathMatch = WRITE_PATH.exec(matched[1].trim());
    if (!pathMatch) {
      proposals.push({
        path: "",
        content: "",
        malformed: "the block named no path=<file> to write",
      });
    } else if (!consumed.closed) {
      proposals.push({
        path: pathMatch[1],
        content: "",
        malformed: "the block was never closed, so its contents are incomplete",
      });
    } else {
      proposals.push({
        path: pathMatch[1],
        content: consumed.body.join("\n"),
        malformed: null,
      });
    }
  }
  return proposals;
}

/**
 * The block opened by `ticks`, which closes on a bare fence at least as long.
 */
function consumeBlock(
  lines: readonly string[],
  start: number,
  ticks: string,
): { body: string[]; closed: boolean; indexAfter: number } {
  const body: string[] = [];
  let index = start;
  while (index < lines.length) {
    const closing = FENCE.exec(lines[index]);
    if (closing && !closing[2] && closing[1].length >= ticks.length) {
      return { body, closed: true, indexAfter: index + 1 };
    }
    body.push(lines[index]);
    index += 1;
  }
  return { body, closed: false, indexAfter: index };
}

/**
 * `[rel, target, reason]` -- `reason` is null when the write may proceed, and
 * `target` is then the absolute path to open.
 *
 * The path is resolved exactly once, here, and the resolved form is what gets
 * written. Deciding about one spelling of a path and then handing another to
 * `open` is how a boundary fails open, so nothing downstream re-interprets the
 * string.
 *
 * Two boundaries, never both: a round carrying an envelope is confined to that
 * envelope, and every other round is confined to the declared test root. Which
 * one applies is a property of the grant, so no caller can combine them into a
 * wider surface than either.
 *
 * Every branch refuses before anything is written, and the order runs from the
 * widest boundary inward, so the reason recorded is the outermost one the path
 * crossed.
 */
function confine(
  repoRoot: string,
  grant: AgencyGrant,
  rawPath: string,
): [string, string | null, string | null] {
  if (!grantOperations(grant).includes(OP_WRITE)) {
    return [
      posix(rawPath),
      null,
      "this round granted no write operation; tests are authored in " +
        "the tests phase, not in a review round",
    ];
  }
  const target = relativeToRepo(repoRoot, rawPath);
  if (target === null) {
    return [posix(rawPath), null, "the path resolves outside the repository"];
  }
  const rel = posix(relative(canonicalPath(repoRoot), target));
  if (grant.writeEnvelope.length > 0) {
    if (!grant.writeEnvelope.includes(rel)) {
      return [
        rel,
        null,
        "outside the envelope: this round may write only to the " +
          "files the session already changed and the files its " +
          "failures implicate",
      ];
    }
  } else if (!grantDeclaresTests(grant)) {
    return [
      rel,
      null,
      "this repository declares no test root, so no path can be " +
        "confirmed to be a test",
    ];
  } else if (!namesATest(rel, grantSelection(grant))) {
    return [
      rel,
      null,
      "outside the declared test locations: a write must match " + declaredLocations(grant),
    ];
  }
  if (isDirectory(target)) return [rel, null, "the path is a directory"];
  return [rel, target, null];
}

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/**
 * Perform the writes `text` proposes, and report every decision.
 *
 * This is the whole of operation (d). The model never touches the filesystem:
 * it describes a file, and this function is the only thing that opens one. A
 * proposal outside the round's boundary is refused here, before any bytes are
 * written -- which is the difference between a boundary and an instruction.
 */
export function applyWrites(
  repoRoot: string,
  grant: AgencyGrant,
  text: unknown,
): TestWrite[] {
  const writes: TestWrite[] = [];
  for (const proposal of parseProposals(text, grant.writeLabel)) {
    if (proposal.malformed) {
      writes.push({
        path: posix(proposal.path),
        outcome: WRITE_REFUSED,
        action: null,
        bytesWritten: 0,
        reason: proposal.malformed,
      });
      continue;
    }
    const [rel, target, confineReason] = confine(repoRoot, grant, proposal.path);
    let reason = confineReason;
    if (reason === null && !proposal.content.trim()) {
      // An empty body against an existing file silently empties it, which is a
      // deletion wearing a write's name.
      reason = "the block carried no content";
    }
    if (reason !== null) {
      writes.push({
        path: rel,
        outcome: WRITE_REFUSED,
        action: null,
        bytesWritten: 0,
        reason,
      });
      continue;
    }
    writes.push(writeFile(rel, target!, proposal.content));
  }
  return writes;
}

function writeFile(rel: string, target: string, content: string): TestWrite {
  const existed = isFile(target);
  const body = content.endsWith("\n") ? content : `${content}\n`;
  const data = Buffer.from(body, "utf8");
  try {
    mkdirSync(dirname(target), { recursive: true });
    // Newlines are written as authored on every platform: a test file whose
    // line endings depend on which machine ran the verifier is a diff nobody
    // asked for.
    writeFileSync(target, data);
  } catch (error) {
    return {
      path: rel,
      outcome: WRITE_REFUSED,
      action: null,
      bytesWritten: 0,
      reason: `the write failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return {
    path: rel,
    outcome: WRITE_ACCEPTED,
    action: existed ? ACTION_MODIFIED : ACTION_CREATED,
    bytesWritten: data.length,
    reason: null,
  };
}
