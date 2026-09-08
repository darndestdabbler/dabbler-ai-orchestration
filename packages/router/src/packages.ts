// Committed immutable packages: the version a module's package is given,
// the record that binds package to source and contract, and the one pin a
// consumer reads.
//
// A sibling is consumed as a PACKAGE from the committed `packages/` folder,
// never as source, so a focused checkout builds against exactly the bytes
// the sibling landed. Three things make that honest. The version is
// immutable and sortable -- `<base>-dev.<yyyymmdd>.<n>.g<digest>`, where
// `n` is a number NuGet orders and the digest names the tree, so two packs
// of one tree are one version and a moved tree is the next number. The
// correspondence record beside each package says which source and contract
// digests it was built from, so a package whose source moved is caught at
// the land. And the pin is central and single: one unconditioned
// `PackageVersion` per id in `Directory.Packages.props`, replaced in place,
// with a consumer's `PackageReference` carrying no version of its own.

import { spawnSync } from "node:child_process";
import { type Dirent, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { resolveProgram } from "./checks.ts";
import type { RouterConfig } from "./config.ts";
import {
  DOTNET_TOOLCHAIN_ENV,
  type Ecosystem,
  EcosystemError,
  PACKAGES_DIR,
  type PackTarget,
  ecosystemOf,
  fileStem,
  pinPackageVersion as pinInProps,
} from "./ecosystem.ts";
import { nowIso, platformNewlines, runGit } from "./journal.ts";
import { type ModuleEntry, type SolutionShape, packagesCeiling } from "./modules.ts";
import {
  PLACEHOLDER_OUTPUT,
  PLACEHOLDER_VERSION,
  PackagingConfigError,
  loadDeclaration,
  substitute,
} from "./packaging.ts";
import { surfaceDigest } from "./testEvidence.ts";

export class PackagesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PackagesError";
  }
}

/** What a package was built from, written beside it. */
export interface CorrespondenceRecord {
  readonly package: string;
  readonly version: string;
  /** The digest of the module's source roots at pack time. */
  readonly sourceDigest: string;
  /** The digest of `modules/<slug>/contract/` at pack time; null when the module keeps none. */
  readonly contractDigest: string | null;
  readonly session: number | null;
  /** `HEAD` at pack time: the commit the pack was made on, never the one that lands it. */
  readonly baseCommit: string | null;
  readonly recordedAt: string;
}

const RECORD_KEYS = ["package", "version", "sourceDigest", "contractDigest", "session", "baseCommit", "recordedAt"] as const;

export function recordPath(root: string, packageId: string, version: string): string {
  return join(root, PACKAGES_DIR, `${fileStem(packageId)}.${version}.json`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every correspondence record in `packages/`, unordered; a file that is not one is skipped. */
export function readRecords(root: string): CorrespondenceRecord[] {
  const dir = join(root, PACKAGES_DIR);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: CorrespondenceRecord[] = [];
  for (const name of names.sort()) {
    if (!name.endsWith(".json")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(join(dir, name), "utf8"));
    } catch {
      continue;
    }
    if (!isRecord(parsed)) continue;
    if (!RECORD_KEYS.every((key) => key in parsed)) continue;
    if (typeof parsed["package"] !== "string" || typeof parsed["version"] !== "string") continue;
    if (typeof parsed["sourceDigest"] !== "string") continue;
    out.push({
      package: parsed["package"],
      version: parsed["version"],
      sourceDigest: parsed["sourceDigest"],
      contractDigest: typeof parsed["contractDigest"] === "string" ? parsed["contractDigest"] : null,
      session: typeof parsed["session"] === "number" ? parsed["session"] : null,
      baseCommit: typeof parsed["baseCommit"] === "string" ? parsed["baseCommit"] : null,
      recordedAt: typeof parsed["recordedAt"] === "string" ? parsed["recordedAt"] : "",
    });
  }
  return out;
}

/** Write one record beside its package; the path it went to. */
export function writeRecord(root: string, record: CorrespondenceRecord): string {
  const path = recordPath(root, record.package, record.version);
  writeFileSync(path, platformNewlines(`${JSON.stringify(record, null, 2)}\n`), "utf8");
  return path;
}

export function newRecord(
  fields: Omit<CorrespondenceRecord, "recordedAt"> & { recordedAt?: string },
): CorrespondenceRecord {
  return { ...fields, recordedAt: fields.recordedAt ?? nowIso() };
}

// --- The version --------------------------------------------------------------

function yyyymmdd(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

/**
 * The immutable dev version for a module's package: `<base>-dev.<yyyymmdd>.<n>.g<digest7>`.
 *
 * The record for the same source digest under the same base answers first,
 * so packing an unchanged tree twice is one version; otherwise `n` is one
 * past the highest number already recorded for that package on that date,
 * and a moved tree sorts after its predecessor by a number NuGet orders,
 * which a bare hex digest would not.
 */
export function devVersion(
  packageId: string,
  base: string,
  date: Date,
  sourceDigest: string,
  records: readonly CorrespondenceRecord[],
): string {
  const prefix = `${base}-dev.`;
  const same = records.find(
    (record) =>
      record.package === packageId &&
      record.sourceDigest === sourceDigest &&
      record.version.startsWith(prefix),
  );
  if (same !== undefined) return same.version;
  const day = yyyymmdd(date);
  const pattern = new RegExp(`^${escapeRegExp(prefix + day)}\\.(\\d+)\\.g[0-9a-f]+$`);
  let highest = 0;
  for (const record of records) {
    if (record.package !== packageId) continue;
    const match = pattern.exec(record.version);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return `${prefix}${day}.${highest + 1}.g${sourceDigest.slice(0, 7)}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// The release base a project declares is the seam's reading; the .NET one
// keeps its name here for the callers that had it.
export { baseVersionOfProject as baseVersionOf } from "./ecosystem.ts";

// --- The pin --------------------------------------------------------------------

/**
 * `Directory.Packages.props` with `id` pinned to `version`, as the seam
 * writes it; a conditioned or duplicated pin is this module's refusal.
 */
export function pinPackageVersion(propsText: string, id: string, version: string): string {
  try {
    return pinInProps(propsText, id, version);
  } catch (error) {
    if (error instanceof EcosystemError) throw new PackagesError(error.message);
    throw error;
  }
}

// --- The pack -------------------------------------------------------------------

export interface PackOptions {
  readonly session?: number | null;
  /** The loaded configuration, for a declared pack argv. */
  readonly config?: RouterConfig | null;
  readonly now?: Date;
  /** How a pack command runs; a test hands in a scripted one. */
  readonly runPack?: (argv: readonly string[], cwd: string) => { code: number; output: string };
  /** The digest of a set of covers; a test hands in one that needs no git. */
  readonly digestOf?: (covers: readonly string[]) => string | null;
  /** `HEAD` at pack time; a test hands in one that needs no git. */
  readonly baseCommit?: string | null;
}

export interface PackResult {
  readonly slug: string;
  readonly version: string;
  /** Repository-relative paths of the packages produced, in target order. */
  readonly artifacts: readonly string[];
  /** The package ids pinned centrally. */
  readonly pins: readonly string[];
  /**
   * The central pin file the ecosystem wrote them to, repository-relative;
   * null when nothing was pinned. Asked of the seam rather than assumed:
   * .NET pins in `Directory.Packages.props` and Maven in the root `pom.xml`,
   * and a caller that names either one is wrong on the other ecosystem.
   */
  readonly pinFile: string | null;
  /**
   * Everything the pack LEFT in the feed, repository-relative and sorted --
   * a superset of `artifacts`, measured by snapshotting the folder before
   * and after rather than by asking what the package should be called.
   *
   * `mvn deploy` writes a POM and a `.md5`/`.sha1` beside every artifact and
   * a metadata file per version; only the jar is a package this framework
   * went looking for, and the rest are still bytes the run of record must
   * account for. A candidate record naming only the artifact leaves them as
   * a tree that moved after verification, which is what kept a Maven module
   * session from closing at all.
   */
  readonly left: readonly string[];
  /** The correspondence records written, repository-relative. */
  readonly records: readonly string[];
}

function runPackDefault(argv: readonly string[], cwd: string): { code: number; output: string } {
  const [program, ...args] = argv;
  const resolved = resolveProgram(String(program));
  const result = spawnSync(resolved.path, args, {
    cwd,
    encoding: "utf8",
    windowsHide: true,
    shell: resolved.isBatch,
    env: { ...process.env, ...DOTNET_TOOLCHAIN_ENV },
  });
  return {
    code: result.status ?? 1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}${result.error ? result.error.message : ""}`,
  };
}

/** Whether every one of a module's roots is on disk with something in it. */
function sourceOnDisk(root: string, entry: ModuleEntry): boolean {
  const roots = entry.codeRoots.length > 0 ? entry.codeRoots : ["."];
  return roots.every((codeRoot) => {
    const dir = join(root, codeRoot);
    try {
      return statSync(dir).isDirectory() && readdirSync(dir).length > 0;
    } catch {
      return false;
    }
  });
}

/**
 * `dabbler module pack <slug>`: the module's packages into `packages/`
 * under one immutable dev version, the pins moved, the records written.
 *
 * Refused for a single-module solution (the repository is the module, and
 * there is no sibling to pack for), for a module with no package, and for
 * a module whose source is not on disk -- which is what a sibling looks
 * like from a focused checkout, and the grant is the way to it. A declared
 * `packaging.pack` for the module runs once with `{output}` and
 * `{version}`; otherwise the ecosystem's default packs every packable
 * project. Every target must leave its package behind, or nothing is
 * pinned and nothing is recorded.
 */
export function packModule(
  root: string,
  shape: SolutionShape,
  slug: string,
  options: PackOptions = {},
): PackResult {
  if (!shape.multi) {
    throw new PackagesError(
      "this repository is a single-module solution: the repository is the module, and " +
        "there is no sibling to pack for",
    );
  }
  const entry = shape.modules.find((module) => module.slug === slug);
  if (entry === undefined) throw new PackagesError(`docs/modules.yaml declares no module '${slug}'`);
  if (entry.package === null) {
    throw new PackagesError(`module '${slug}' declares no package; give it one in docs/modules.yaml`);
  }
  if (!sourceOnDisk(root, entry)) {
    throw new PackagesError(
      `module '${slug}' is not on this disk (${entry.codeRoots.join(", ")}): in a focused ` +
        "checkout a sibling is a package, not source, and `dabbler module grant " +
        `${slug} --reason ...\` is the way to its source`,
    );
  }
  const digestOf = options.digestOf ?? ((covers: readonly string[]) => surfaceDigest(root, covers));
  const sourceDigest = digestOf(entry.codeRoots.length > 0 ? entry.codeRoots : ["."]);
  if (sourceDigest === null) {
    throw new PackagesError(`the source of module '${slug}' could not be digested (failing closed)`);
  }
  const contractDir = `modules/${slug}/contract/`;
  const contractDigest = existsSync(join(root, contractDir)) ? digestOf([contractDir]) : null;

  let ecosystem: Ecosystem;
  try {
    ecosystem = ecosystemOf(root, entry);
  } catch (error) {
    if (error instanceof EcosystemError) throw new PackagesError(error.message);
    throw error;
  }
  const targets = ecosystem.packableProjects(root, entry);
  if (targets.length === 0) {
    throw new PackagesError(`module '${slug}' has no packable project under ${entry.codeRoots.join(", ")}`);
  }
  const main = targets.find((target) => target.packageId === entry.package) ?? targets[0]!;
  const base = ecosystem.baseVersion(root, main.project);
  const records = readRecords(root);
  const version = devVersion(entry.package, base, options.now ?? new Date(), sourceDigest, records);

  const outputDir = join(root, PACKAGES_DIR);
  mkdirSync(outputDir, { recursive: true });
  const runPack = options.runPack ?? runPackDefault;
  // A declared pack is the module's own way of packing, and it runs once
  // with the version substituted; one that cannot take the version is
  // refused by name rather than passed over for the default, because a
  // declaration nobody runs is a declaration that lies.
  let declared: ReturnType<typeof loadDeclaration>;
  try {
    declared = loadDeclaration(options.config ?? null, slug);
  } catch (error) {
    if (error instanceof PackagingConfigError) throw new PackagesError(error.message);
    throw error;
  }
  if (declared !== null && !declared.pack.usesVersion) {
    throw new PackagesError(
      `the declared pack for module '${slug}' does not name ${PLACEHOLDER_VERSION}, and ` +
        "`module pack` gives every package the immutable dev version; add it to the argv " +
        "(for .NET, -p:PackageVersion={version}) or remove the declaration to take the default",
    );
  }
  // Targets built by one project (a Maven module's aggregator) share one
  // command, run once.
  const commands: string[][] =
    declared !== null
      ? [substitute(declared.pack.argv, { [PLACEHOLDER_OUTPUT]: outputDir, [PLACEHOLDER_VERSION]: version })]
      : distinct(targets.map((target) => ecosystem.packArgv(target.via ?? target.project, outputDir, version)));
  // What the feed held before the pack, so that what the pack left can be
  // measured rather than predicted: an ecosystem's own tooling writes files
  // this framework never asked for, and every one of them is a byte the run
  // of record has to account for.
  const before = feedSnapshot(outputDir);
  for (const argv of commands) {
    const run = runPack(argv, root);
    if (run.code !== 0) {
      throw new PackagesError(
        `the pack failed (exit ${run.code}): ${argv.join(" ")}\n${run.output.trim().split("\n").slice(-12).join("\n")}`,
      );
    }
  }

  const after = feedSnapshot(outputDir);
  const left = [...after]
    .filter(([path, stamp]) => before.get(path) !== stamp)
    .map(([path]) => `${PACKAGES_DIR}/${path}`)
    .sort();

  const artifacts: string[] = [];
  const ceiling = packagesCeiling(options.config ?? null);
  const lfs = packagesUnderLfs(root, ecosystem.lfsPattern);
  const producedOf = (target: PackTarget): string | null =>
    findProduced(outputDir, ecosystem.packagedArtifact(target.packageId, version));
  for (const target of targets) {
    const actual = producedOf(target);
    if (actual === null) {
      throw new PackagesError(
        `the pack of ${target.project} left no ${ecosystem.packagedArtifact(target.packageId, version)} in ` +
          `${PACKAGES_DIR}/; nothing is pinned and nothing is recorded for a package that was not produced`,
      );
    }
    // The ceiling: a committed package must stay small enough for the
    // repository, or go under LFS. Refused before any pin or record moves,
    // and the artifact is removed so a refused pack leaves the feed as it
    // was.
    const size = statSync(join(outputDir, actual)).size;
    if (size > ceiling && !lfs) {
      for (const stale of targets) {
        const own = producedOf(stale);
        if (own !== null) rmSync(join(outputDir, own), { force: true });
      }
      throw new PackagesError(
        `${PACKAGES_DIR}/${actual} is ${size} bytes, over the ceiling of ${ceiling} for a committed ` +
          "package. Two ways out: raise `modules.packages.ceilingBytes` in dabbler.yaml, or put " +
          `the feed under Git LFS by uncommenting the \`${ecosystem.lfsPattern} filter=lfs\` line in ${PACKAGES_DIR}/.gitattributes. ` +
          "Nothing was pinned or recorded.",
      );
    }
    artifacts.push(`${PACKAGES_DIR}/${actual}`);
  }

  const pins: string[] = [];
  let pinFile: string | null = null;
  try {
    for (const target of targets) {
      pinFile = ecosystem.writeCentralPin(root, target.packageId, version);
      pins.push(target.packageId);
    }
  } catch (error) {
    if (error instanceof EcosystemError) throw new PackagesError(error.message);
    throw error;
  }

  const baseCommit =
    options.baseCommit !== undefined ? options.baseCommit : (runGit(root, ["rev-parse", "HEAD"]).stdout || null);
  const written: string[] = [];
  for (const target of targets) {
    const path = writeRecord(
      root,
      newRecord({
        package: target.packageId,
        version,
        sourceDigest,
        contractDigest,
        session: options.session ?? null,
        baseCommit,
      }),
    );
    written.push(relative(root, path).split("\\").join("/"));
  }
  return { slug, version, artifacts, pins, pinFile, left, records: written };
}

/** Whether a `packages/.gitattributes` puts the packages under LFS, by the ecosystem's pattern. */
export function packagesUnderLfs(root: string, pattern: string): boolean {
  const path = join(root, PACKAGES_DIR, ".gitattributes");
  if (!existsSync(path)) return false;
  const line = new RegExp(`^\\s*${escapeRegExp(pattern)}\\b.*filter=lfs`);
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .some((text) => line.test(text));
}

/** The commands once each, in first-seen order. */
function distinct(commands: readonly string[][]): string[][] {
  const seen = new Set<string>();
  return commands.filter((argv) => {
    const key = argv.join(" ");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The produced artifact at a repository-layout path under the output
 * folder, matched segment by segment without regard to case (a pack may
 * lower-case a name), as it is actually spelled; null when absent.
 */
/**
 * Every file under the feed, by path relative to it, with a stamp that
 * changes when its bytes do (size and mtime). A folder that is not there
 * yet is an empty snapshot, which is what makes the first pack's whole
 * output new.
 */
function feedSnapshot(outputDir: string, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  let entries: Dirent[];
  try {
    entries = readdirSync(join(outputDir, prefix), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      for (const [path, stamp] of feedSnapshot(outputDir, rel)) out.set(path, stamp);
      continue;
    }
    try {
      const stat = statSync(join(outputDir, rel));
      out.set(rel, `${stat.size}:${stat.mtimeMs}`);
    } catch {
      // Gone between the listing and the stat: not something the pack left.
    }
  }
  return out;
}

function findProduced(outputDir: string, rel: string): string | null {
  const actual: string[] = [];
  let dir = outputDir;
  for (const segment of rel.split("/")) {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return null;
    }
    const found = names.find((name) => name.toLowerCase() === segment.toLowerCase());
    if (found === undefined) return null;
    actual.push(found);
    dir = join(dir, found);
  }
  return actual.join("/");
}
