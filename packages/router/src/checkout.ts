// The focused checkout: a module's disposable clone, and the cone it is
// narrowed to.
//
// A session on one module of a multi-module solution works in a clone that
// holds the module's source, the root build files, the committed packages,
// the framework's own record under `docs/` and its neighbours' CONTRACT
// folders -- and never a sibling's source. The wall is the disk: a sibling
// is a package in `packages/`, its promises are in `modules/<sibling>/
// contract/`, and its implementation is neither on disk nor in the local
// object store (`git clone --filter=blob:none` fetches a blob only when a
// path inside the cone needs it). What a verifier or an engine cannot read
// it cannot depend on, which is the module boundary made physical rather
// than asked for.
//
// The cone is DERIVED from the manifest and never declared: a declared cone
// would drift from the dependency graph the moment an edge moved. The root
// build files are not in it because cone mode delivers every root-level
// file with any cone at all -- which is also why the convenience file and
// the engine's settings can sit at the clone's root without widening it.
//
// A single-module solution has no focused checkout: the repository is the
// module, and everything here refuses that shape by name.

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { cpus, tmpdir } from "node:os";
import { dirname, isAbsolute, join, posix, resolve } from "node:path";

import { resolveProgram } from "./checks.ts";
import type { RouterConfig } from "./config.ts";
import {
  DOTNET_TOOLCHAIN_ENV,
  type Ecosystem,
  EcosystemError,
  NO_SHARED_COMPILATION,
  PACKAGES_DIR,
  ecosystemOf,
} from "./ecosystem.ts";
import { runGit } from "./journal.ts";
import {
  type ModuleEntry,
  type SolutionShape,
  checkoutParent,
  consumersOf,
  dependenciesOf,
  moduleConfigs,
} from "./modules.ts";

export class CheckoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutError";
  }
}

/**
 * The root build files a focused checkout carries whatever its cone: cone
 * mode checks out every file directly under the root, so these ride along
 * without being listed. Named here so a reader knows they are expected, and
 * so the convenience file can be written beside them.
 */
export const ROOT_BUILD_FILES: readonly string[] = [
  "global.json",
  "Directory.Build.props",
  "Directory.Build.targets",
  "Directory.Packages.props",
  "nuget.config",
];

/** A solution file at the root: `.sln`, or the XML `.slnx`. */
export const SOLUTION_FILE = /\.slnx?$/i;

/** The framework's own record: the plan, the manifest, the sessions. */
const RECORD_DIR = "docs";

/** The project-local settings file Claude Code reads and keeps out of git. */
export const CLAUDE_LOCAL_SETTINGS = ".claude/settings.local.json";

/**
 * What `module open` does with a clone that already exists when `--reset`
 * is not given. `refuse` names `--reset` as the way; `reset` treats the
 * existing clone as the persistent per-module clone and resets it; `fresh`
 * discards it and clones again.
 *
 * `fresh`, by the Windows preflight (docs/design/module-checkout-preflight.md):
 * a fresh clone costs about a second and a half and a cold toolchain about
 * five seconds more than a warm one, against a session measured in minutes;
 * and only a fresh clone restores the wall, because a grant's fetched blobs
 * stay in a reset clone's object store. A clone holding changes is still
 * refused rather than discarded, and `--reset` is the persistent path for
 * whoever wants it.
 */
export const EXISTING_CLONE: "refuse" | "reset" | "fresh" = "fresh";

/** `modules/<slug>/contract/`, as the block lays every module's contract bundle. */
export function contractDir(slug: string): string {
  return `modules/${slug}/contract`;
}

/** Forward slashes, no `./` prefix, no trailing slash: the form git's cone takes. */
function coneDirectory(path: string): string {
  let out = path.split("\\").join("/");
  while (out.startsWith("./")) out = out.slice(2);
  while (out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

function entryOf(shape: SolutionShape, slug: string): ModuleEntry {
  if (!shape.multi) {
    throw new CheckoutError(
      "this repository is a single-module solution: the repository is the module, " +
        "so open the repository itself -- there is no focused checkout to make",
    );
  }
  const entry = shape.modules.find((module) => module.slug === slug);
  if (entry === undefined) throw new CheckoutError(`docs/modules.yaml declares no module '${slug}'`);
  return entry;
}

/**
 * The sparse cone of `slug`'s focused checkout, derived from the manifest:
 * the module's own `codeRoots`; the committed feed; the framework's record
 * under `docs/`; the contract folder of every module it depends on,
 * directly or transitively, so it compiles against what they promise; the
 * contract folder of every module that consumes it, directly or
 * transitively, so their consumer-contract suites can run against it; and
 * the directory of each of its `sharedFiles`. A sibling's `codeRoots` are
 * never in it -- that is the point.
 *
 * Cone-mode directories, repository-relative, deduplicated and sorted. A
 * shared file at the root contributes nothing, because the root's files come
 * with every cone; a module whose code root is the repository root is
 * refused, because a focused checkout of everything is the full checkout.
 */
export function checkoutCone(
  shape: SolutionShape,
  slug: string,
  sharedFiles: readonly string[] = [],
): string[] {
  const entry = entryOf(shape, slug);
  const directories = new Set<string>([PACKAGES_DIR, RECORD_DIR]);
  const roots = entry.codeRoots.length > 0 ? entry.codeRoots : ["."];
  for (const codeRoot of roots) {
    const dir = coneDirectory(codeRoot);
    if (dir === "" || dir === ".") {
      throw new CheckoutError(
        `module '${slug}' declares the repository root as a code root; a focused checkout ` +
          "of everything is the full checkout, so open the repository itself",
      );
    }
    directories.add(dir);
  }
  for (const dependency of dependenciesOf(shape.modules, slug)) directories.add(contractDir(dependency));
  for (const consumer of consumersOf(shape.modules, slug)) directories.add(contractDir(consumer));
  for (const shared of sharedFiles) {
    const dir = coneDirectory(posix.dirname(coneDirectory(shared)));
    if (dir !== "" && dir !== ".") directories.add(dir);
  }
  return [...directories].sort();
}

/** Where the clone of `slug` goes by default: beside the repository, as `<repo>.<slug>`. */
export function defaultClonePath(repoRoot: string, slug: string, parent: string | null): string {
  const root = resolve(repoRoot);
  const name = `${posix.basename(root.split("\\").join("/"))}.${slug}`;
  return join(parent === null ? dirname(root) : resolve(root, parent), name);
}

/**
 * The origin as a URL git will filter from. A path -- absolute, or relative
 * to the repository, as a test's bare remote is -- becomes a `file://` URL,
 * because git IGNORES `--filter` on a local-path clone (it hardlinks the
 * object store instead) and would hand back a clone holding every sibling's
 * bytes while looking like the focused one.
 */
export function originUrl(repoRoot: string, remote: string): string {
  const trimmed = remote.trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  if (/^[^/\\]+@[^/\\:]+:/.test(trimmed)) return trimmed;
  const absolute = isAbsolute(trimmed) ? trimmed : resolve(repoRoot, trimmed);
  const forward = absolute.split("\\").join("/");
  return `file:///${forward.replace(/^\/+/, "")}`;
}

export interface OpenOptions {
  /** The session branch to check out; the trunk when absent. */
  readonly branch?: string | null;
  /** Fetch, reset to the trunk and re-narrow an existing clone. */
  readonly reset?: boolean;
  /** Where the clone goes; `modules.checkout.parent` and the default otherwise. */
  readonly clonePath?: string | null;
  /** The loaded configuration, for `modules.checkout.parent` and the module's `sharedFiles`. */
  readonly config?: RouterConfig | null;
}

export interface OpenResult {
  readonly slug: string;
  /** The clone, absolute. */
  readonly path: string;
  /** The branch checked out. */
  readonly branch: string;
  /** Origin's default branch, which the clone is reset to. */
  readonly trunk: string;
  readonly cone: readonly string[];
  /** The convenience file written at the clone's root, repository-relative; null when the ecosystem has none yet. */
  readonly convenienceFile: string | null;
  /** Whether the clone is blob-filtered: an object outside the cone is absent from the local store. */
  readonly filtered: boolean;
  /** Whether an existing clone was reset rather than made. */
  readonly reset: boolean;
  readonly notes: readonly string[];
}

function git(cwd: string, args: readonly string[], what: string): string {
  const result = runGit(cwd, args);
  if (result.code !== 0) {
    throw new CheckoutError(`${what}: git ${args.join(" ")} exited ${result.code}: ${result.stderr}`);
  }
  return result.stdout;
}

/** Origin's default branch as the clone knows it, or the one branch it has. */
function trunkOf(clone: string): string {
  const head = runGit(clone, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  if (head.code === 0 && head.stdout.startsWith("origin/")) return head.stdout.slice("origin/".length);
  const refs = git(clone, ["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin"], "listing origin's branches")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && line !== "origin/HEAD");
  if (refs.length === 1) return (refs[0] as string).slice("origin/".length);
  throw new CheckoutError(
    "origin names no default branch and has more than one; say which with --branch",
  );
}

function hasRemoteBranch(clone: string, branch: string): boolean {
  return runGit(clone, ["rev-parse", "--verify", "-q", `refs/remotes/origin/${branch}`]).code === 0;
}

/** Whether `git rev-list --missing=print` reports any object the clone does not hold. */
function isFiltered(clone: string): boolean {
  const listed = git(clone, ["rev-list", "--objects", "--missing=print", "HEAD"], "listing the clone's objects");
  return listed.split("\n").some((line) => line.startsWith("?"));
}

function isDirty(clone: string): boolean {
  return git(clone, ["status", "--porcelain"], "reading the clone's status") !== "";
}

/** Every `.claude/settings.local.json` key kept; the block set. */
function writeEngineSettings(clone: string): void {
  const path = join(clone, ...CLAUDE_LOCAL_SETTINGS.split("/"));
  let settings: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        settings = parsed as Record<string, unknown>;
      }
    } catch {
      // Unreadable is rewritten: the block is what the clone needs.
    }
  }
  const permissions = settings["permissions"];
  const merged =
    permissions !== null && typeof permissions === "object" && !Array.isArray(permissions)
      ? { ...(permissions as Record<string, unknown>) }
      : {};
  merged["blockReadsOutsideWorkingDirectories"] = true;
  settings["permissions"] = merged;
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

/** Lines in the clone's own `.git/info/exclude`, never in a tracked ignore file. */
function excludeInClone(clone: string, paths: readonly string[]): void {
  const file = join(clone, ".git", "info", "exclude");
  mkdirSync(dirname(file), { recursive: true });
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  const present = new Set(current.split(/\r?\n/).map((line) => line.trim()));
  const missing = paths.map((path) => `/${path}`).filter((line) => !present.has(line));
  if (missing.length === 0) return;
  const lead = current === "" || current.endsWith("\n") ? "" : "\n";
  writeFileSync(file, `${current}${lead}${missing.join("\n")}\n`, "utf8");
}

/**
 * `dabbler module open <slug>`: the disposable focused clone of one module.
 *
 * Refused for a single-module solution and for a slug the manifest does not
 * declare. Clones the repository's origin blob-filtered, sparse and
 * unchecked-out under `modules.checkout.parent` (beside the repository by
 * default), narrows it to the derived cone, checks out the trunk or the
 * session branch, writes the ecosystem's convenience file and the engine's
 * working-directory block at the clone's root -- both excluded in the
 * clone's own `.git/info/exclude`, so the clone stays clean -- and says
 * whether the clone is really filtered. With `reset` an existing clone is
 * fetched, reset hard to the trunk and re-narrowed instead; without it, an
 * existing clone gets what `EXISTING_CLONE` says, and one holding changes
 * is refused rather than discarded.
 */
export function openModule(
  root: string,
  shape: SolutionShape,
  slug: string,
  options: OpenOptions = {},
): OpenResult {
  const entry = entryOf(shape, slug);
  const config = options.config ?? null;
  const shared = config === null ? [] : (moduleConfigs(config, shape.modules).get(slug)?.sharedFiles ?? []);
  const cone = checkoutCone(shape, slug, shared);
  const remote = runGit(root, ["remote", "get-url", "origin"]);
  if (remote.code !== 0 || remote.stdout.trim() === "") {
    throw new CheckoutError(
      "the repository has no `origin` remote: a focused clone is made from the origin, " +
        "not from this working tree, so add one first",
    );
  }
  const url = originUrl(root, remote.stdout);
  const clone = resolve(options.clonePath ?? defaultClonePath(root, slug, checkoutParent(config)));
  const notes: string[] = [];

  let reset = false;
  if (existsSync(clone)) {
    const isClone = runGit(clone, ["rev-parse", "--is-inside-work-tree"]).code === 0;
    const ownOrigin = isClone ? runGit(clone, ["remote", "get-url", "origin"]).stdout.trim() : "";
    if (!isClone || (ownOrigin !== url && ownOrigin !== remote.stdout.trim())) {
      throw new CheckoutError(
        `${clone} exists and is not a clone of ${url}; move it aside, or point ` +
          "modules.checkout.parent elsewhere",
      );
    }
    const want = options.reset === true ? "reset" : EXISTING_CLONE;
    if (want === "refuse") {
      throw new CheckoutError(
        `${clone} already exists: pass --reset to fetch, reset it to the trunk and ` +
          "re-narrow its cone, or remove it for a fresh clone",
      );
    }
    if (options.reset !== true && isDirty(clone)) {
      throw new CheckoutError(
        `${clone} holds changes; commit or discard them, or pass --reset to discard them ` +
          "and reset the clone to the trunk",
      );
    }
    if (want === "fresh") {
      rmSync(clone, { recursive: true, force: true });
    } else {
      reset = true;
      git(clone, ["fetch", "-q", "--prune", "origin"], "fetching the clone's origin");
    }
  }

  if (!existsSync(clone)) {
    const parent = dirname(clone);
    mkdirSync(parent, { recursive: true });
    git(parent, ["clone", "-q", "--filter=blob:none", "--no-checkout", "--sparse", url, clone], "cloning the origin");
  }

  git(clone, ["sparse-checkout", "set", "--cone", ...cone], "narrowing the cone");
  const trunk = trunkOf(clone);
  const branch = options.branch?.trim() || trunk;
  if (reset) {
    // Whatever the clone was on, it comes back to the trunk's tip -- or the
    // session branch's, when the origin has one -- with the cone re-applied
    // and untracked files gone. Ignored files (build output) stay: that is
    // what a persistent clone is for.
    const target = hasRemoteBranch(clone, branch) ? `origin/${branch}` : `origin/${trunk}`;
    if (runGit(clone, ["rev-parse", "--verify", "-q", `refs/heads/${branch}`]).code === 0) {
      git(clone, ["checkout", "-q", branch], "checking out the branch");
    } else {
      git(clone, ["checkout", "-q", "-b", branch, target], "checking out the branch");
    }
    git(clone, ["reset", "-q", "--hard", target], "resetting the clone");
    git(clone, ["clean", "-q", "-fd"], "cleaning the clone");
  } else if (branch === trunk || hasRemoteBranch(clone, branch)) {
    git(clone, ["checkout", "-q", branch], "checking out the branch");
  } else {
    git(clone, ["checkout", "-q", "-b", branch, `origin/${trunk}`], "creating the session branch");
  }

  const filtered = isFiltered(clone);
  if (!filtered) {
    notes.push(
      "the clone is not blob-filtered: the origin did not honour --filter (uploadpack.allowFilter " +
        "is off), so every sibling's bytes are in the local object store even though they are " +
        "not on disk",
    );
  }

  let convenienceFile: string | null = null;
  let ecosystem: Ecosystem | null = null;
  try {
    ecosystem = ecosystemOf(clone, entry);
  } catch (error) {
    if (!(error instanceof EcosystemError)) throw error;
    notes.push(`no convenience file: ${error.message}`);
  }
  if (ecosystem !== null) {
    try {
      convenienceFile = ecosystem.convenienceFile(clone, entry, ecosystem.projectFiles(clone, entry));
    } catch (error) {
      if (!(error instanceof EcosystemError)) throw error;
      notes.push(`no convenience file: ${error.message}`);
    }
  }
  writeEngineSettings(clone);
  excludeInClone(clone, [CLAUDE_LOCAL_SETTINGS, ...(convenienceFile === null ? [] : [convenienceFile])]);

  return { slug, path: clone, branch, trunk, cone, convenienceFile, filtered, reset, notes };
}

// --- The preflight ------------------------------------------------------------

/** One toolchain command's outcome and how long it took. */
export interface TimedRun {
  readonly code: number;
  readonly output: string;
  readonly seconds: number;
}

export interface PreflightOptions {
  /** How many fresh clones to time in sequence after the first; five by default. */
  readonly clones?: number;
  readonly config?: RouterConfig | null;
  /** Where the timed clones go; a fresh temp directory, removed after, by default. */
  readonly scratch?: string | null;
  /** How a toolchain command runs; a test could hand in a scripted one. */
  readonly run?: (argv: readonly string[], cwd: string) => TimedRun;
}

/** Restore, build and test of the convenience file, each timed. */
export interface ToolchainTimings {
  readonly restoreSeconds: number;
  readonly buildSeconds: number;
  readonly testSeconds: number;
}

export interface PreflightResult {
  readonly slug: string;
  readonly convenienceFile: string;
  /** A fresh clone and sparse checkout, then the toolchain in it. */
  readonly fresh: { readonly cloneSeconds: number } & ToolchainTimings;
  /** `--reset` of that clone (fetch, reset, re-narrow), then the toolchain again with the build output still there. */
  readonly reset: { readonly openSeconds: number } & ToolchainTimings;
  /** Each further fresh clone, in sequence. */
  readonly cloneSeconds: readonly number[];
  readonly git: string;
  readonly dotnet: string | null;
  readonly cpus: number;
  readonly platform: string;
  /** Defender's real-time protection at measurement time; null where it could not be asked. */
  readonly defenderRealTime: boolean | null;
  readonly measuredAt: string;
}

function timedSpawn(argv: readonly string[], cwd: string): TimedRun {
  const [program, ...args] = argv;
  const resolved = resolveProgram(String(program));
  const started = Date.now();
  const result = spawnSync(resolved.path, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    shell: resolved.isBatch,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, ...DOTNET_TOOLCHAIN_ENV },
  });
  return {
    code: result.status ?? 1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? result.error.message : ""}`,
    seconds: (Date.now() - started) / 1000,
  };
}

function seconds(work: () => void): number {
  const started = Date.now();
  work();
  return (Date.now() - started) / 1000;
}

/** Restore, build, test -- each must pass, or the preflight says which did not. */
function toolchain(
  run: (argv: readonly string[], cwd: string) => TimedRun,
  clone: string,
  file: string,
): ToolchainTimings {
  const step = (what: string, argv: readonly string[]): number => {
    const result = run(argv, clone);
    if (result.code !== 0) {
      throw new CheckoutError(`preflight: ${what} failed in ${clone} (exit ${result.code}):\n${result.output.trim()}`);
    }
    return result.seconds;
  };
  return {
    restoreSeconds: step("dotnet restore", ["dotnet", "restore", file, "--nologo", "-v", "q"]),
    buildSeconds: step("dotnet build", ["dotnet", "build", file, "--no-restore", NO_SHARED_COMPILATION, "--nologo", "-v", "q"]),
    testSeconds: step("dotnet test", ["dotnet", "test", file, "--no-build", NO_SHARED_COMPILATION, "--nologo", "-v", "q"]),
  };
}

/** Whether Defender's real-time protection is on, asked of PowerShell; null when it cannot be asked. */
function defenderRealTime(run: (argv: readonly string[], cwd: string) => TimedRun, cwd: string): boolean | null {
  if (process.platform !== "win32") return null;
  const asked = run(
    ["powershell", "-NoProfile", "-NonInteractive", "-Command", "(Get-MpComputerStatus).RealTimeProtectionEnabled"],
    cwd,
  );
  if (asked.code !== 0) return null;
  const answer = asked.output.trim().toLowerCase();
  if (answer === "true") return true;
  if (answer === "false") return false;
  return null;
}

/** Removed, with the read-only files a git object store holds made writable first when Windows refuses. */
function removeTree(path: string): void {
  try {
    rmSync(path, { recursive: true, force: true, maxRetries: 3 });
  } catch {
    // Git's pack files are read-only on Windows and an rm that stops at
    // one is a scratch directory nobody cleans up; git itself can help.
    spawnSync("attrib", ["-R", join(path, "*"), "/S", "/D"], { windowsHide: true, shell: false });
    rmSync(path, { recursive: true, force: true, maxRetries: 3 });
  }
}

/**
 * `dabbler module preflight <slug>`: what the focused checkout costs on THIS
 * machine, with the antivirus as it is. A fresh open (clone and sparse
 * checkout) and the toolchain in it; a `--reset` of the same clone and the
 * toolchain again, with the build output still there -- the persistent
 * per-module clone's steady state; then more fresh clones in sequence, so a
 * team's morning of session starts is measured and not guessed. The
 * measurement is a recorded run, not a test: the numbers and the decision
 * they support live in docs/design/module-checkout-preflight.md.
 */
export function preflight(
  root: string,
  shape: SolutionShape,
  slug: string,
  options: PreflightOptions = {},
): PreflightResult {
  entryOf(shape, slug);
  const run = options.run ?? timedSpawn;
  const count = options.clones ?? 5;
  if (!Number.isInteger(count) || count < 0) throw new CheckoutError("preflight: --clones must be a whole number");
  const scratch = options.scratch ?? mkdtempSync(join(tmpdir(), "dabbler-preflight-"));
  try {
    const clone = join(scratch, `${slug}-preflight`);
    let opened: OpenResult | null = null;
    const cloneSeconds = seconds(() => {
      opened = openModule(root, shape, slug, { clonePath: clone, config: options.config ?? null });
    });
    const first = opened as OpenResult | null;
    if (first === null || first.convenienceFile === null) {
      throw new CheckoutError(
        `preflight: module '${slug}' has no convenience file to build (${(first?.notes ?? []).join("; ")})`,
      );
    }
    const file = first.convenienceFile;
    const freshToolchain = toolchain(run, clone, file);

    const openSeconds = seconds(() => {
      openModule(root, shape, slug, { clonePath: clone, reset: true, config: options.config ?? null });
    });
    const resetToolchain = toolchain(run, clone, file);

    const more: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const path = join(scratch, `${slug}-clone-${index + 1}`);
      more.push(seconds(() => openModule(root, shape, slug, { clonePath: path, config: options.config ?? null })));
      removeTree(path);
    }

    const gitVersion = runGit(root, ["--version"]).stdout.trim();
    const dotnet = run(["dotnet", "--version"], root);
    return {
      slug,
      convenienceFile: file,
      fresh: { cloneSeconds, ...freshToolchain },
      reset: { openSeconds, ...resetToolchain },
      cloneSeconds: more,
      git: gitVersion,
      dotnet: dotnet.code === 0 ? dotnet.output.trim() : null,
      cpus: cpus().length,
      platform: `${process.platform} ${process.arch}`,
      defenderRealTime: defenderRealTime(run, root),
      measuredAt: new Date().toISOString(),
    };
  } finally {
    if (options.scratch === undefined || options.scratch === null) removeTree(scratch);
  }
}
