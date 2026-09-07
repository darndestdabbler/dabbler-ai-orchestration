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
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { resolveProgram } from "./checks.ts";
import type { RouterConfig } from "./config.ts";
import { type Ecosystem, EcosystemError, PACKAGES_DIR, ecosystemOf } from "./ecosystem.ts";
import { nowIso, platformNewlines, runGit } from "./journal.ts";
import { type ModuleEntry, type SolutionShape, packagesCeiling } from "./modules.ts";
import { PLACEHOLDER_OUTPUT, PLACEHOLDER_VERSION, loadDeclaration, substitute } from "./packaging.ts";
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
  return join(root, PACKAGES_DIR, `${packageId}.${version}.json`);
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

/**
 * The release base a project declares: `<Version>` or `<VersionPrefix>`,
 * with any prerelease suffix stripped, `0.1.0` when it declares none. The
 * dev version is formed on the base, never on a dev version already there.
 */
export function baseVersionOf(projectText: string): string {
  const match =
    /<VersionPrefix>\s*([^<\s]+)\s*<\/VersionPrefix>/.exec(projectText) ??
    /<Version>\s*([^<\s]+)\s*<\/Version>/.exec(projectText);
  const raw = match ? (match[1] as string) : "0.1.0";
  return raw.split("-")[0] ?? "0.1.0";
}

// --- The pin --------------------------------------------------------------------

const PIN_RE = /<PackageVersion\s+Include="([^"]+)"([^>]*?)\/>/g;

/**
 * `Directory.Packages.props` with `id` pinned to `version`: the one
 * unconditioned `PackageVersion` for the id replaced in place and the XML
 * around it preserved, or a new entry added under the `Modules` group (or
 * a new group before `</Project>`) when there is none. An entry under a
 * `Condition` -- on the element or its item group -- or one that appears
 * twice is refused by name: a consumer must resolve one pin, and "which
 * one" is the question central management exists to remove.
 */
export function pinPackageVersion(propsText: string, id: string, version: string): string {
  const matches = [...propsText.matchAll(PIN_RE)].filter((match) => match[1] === id);
  if (matches.length > 1) {
    throw new PackagesError(
      `Directory.Packages.props pins '${id}' ${matches.length} times; a consumer must ` +
        "resolve one pin, so the duplicate is refused rather than chosen between",
    );
  }
  if (matches.length === 1) {
    const match = matches[0] as RegExpMatchArray;
    const attributes = match[2] ?? "";
    const at = match.index ?? 0;
    const groupStart = propsText.lastIndexOf("<ItemGroup", at);
    const groupTag = groupStart >= 0 ? propsText.slice(groupStart, propsText.indexOf(">", groupStart) + 1) : "";
    if (/\bCondition\s*=/.test(attributes) || /\bCondition\s*=/.test(groupTag)) {
      throw new PackagesError(
        `Directory.Packages.props pins '${id}' under a Condition; the module's pin is ` +
          "one unconditioned entry, so it is refused rather than moved",
      );
    }
    const replaced = /\bVersion="[^"]*"/.test(attributes)
      ? attributes.replace(/\bVersion="[^"]*"/, `Version="${version}"`)
      : `${attributes.replace(/\s*$/, "")} Version="${version}" `;
    return `${propsText.slice(0, at)}<PackageVersion Include="${id}"${replaced}/>${propsText.slice(at + match[0].length)}`;
  }
  const line = `    <PackageVersion Include="${id}" Version="${version}" />`;
  const modulesGroup = /<ItemGroup\s+Label="Modules"\s*>/.exec(propsText);
  if (modulesGroup) {
    const insertAt = (modulesGroup.index ?? 0) + modulesGroup[0].length;
    return `${propsText.slice(0, insertAt)}\n${line}${propsText.slice(insertAt)}`;
  }
  const end = propsText.lastIndexOf("</Project>");
  const group = `  <ItemGroup Label="Modules">\n${line}\n  </ItemGroup>\n`;
  if (end < 0) return `${propsText}\n${group}`;
  return `${propsText.slice(0, end)}${group}${propsText.slice(end)}`;
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
  /** The package ids pinned in `Directory.Packages.props`. */
  readonly pins: readonly string[];
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
  const base = baseVersionOf(readFileSync(join(root, main.project), "utf8"));
  const records = readRecords(root);
  const version = devVersion(entry.package, base, options.now ?? new Date(), sourceDigest, records);

  const outputDir = join(root, PACKAGES_DIR);
  mkdirSync(outputDir, { recursive: true });
  const runPack = options.runPack ?? runPackDefault;
  const declared = loadDeclaration(options.config ?? null, slug);
  const commands: string[][] =
    declared !== null && declared.pack.usesVersion
      ? [substitute(declared.pack.argv, { [PLACEHOLDER_OUTPUT]: outputDir, [PLACEHOLDER_VERSION]: version })]
      : targets.map((target) => ecosystem.packArgv(target.project, outputDir, version));
  for (const argv of commands) {
    const run = runPack(argv, root);
    if (run.code !== 0) {
      throw new PackagesError(
        `the pack failed (exit ${run.code}): ${argv.join(" ")}\n${run.output.trim().split("\n").slice(-12).join("\n")}`,
      );
    }
  }

  const artifacts: string[] = [];
  const producedNames = readdirSync(outputDir);
  const produced = new Map(producedNames.map((name) => [name.toLowerCase(), name] as const));
  const ceiling = packagesCeiling(options.config ?? null);
  const lfs = packagesUnderLfs(root);
  for (const target of targets) {
    const name = `${target.packageId}.${version}.nupkg`;
    const actual = produced.get(name.toLowerCase());
    if (actual === undefined) {
      throw new PackagesError(
        `the pack of ${target.project} left no ${name} in ${PACKAGES_DIR}/; nothing is pinned ` +
          "and nothing is recorded for a package that was not produced",
      );
    }
    // The ceiling: a committed package must stay small enough for the
    // repository, or go under LFS. Refused before any pin or record moves,
    // and the artifact is removed so a refused pack leaves the feed as it
    // was.
    const size = statSync(join(outputDir, actual)).size;
    if (size > ceiling && !lfs) {
      for (const stale of targets) {
        const own = produced.get(`${stale.packageId}.${version}.nupkg`.toLowerCase());
        if (own !== undefined) rmSync(join(outputDir, own), { force: true });
      }
      throw new PackagesError(
        `${PACKAGES_DIR}/${actual} is ${size} bytes, over the ceiling of ${ceiling} for a committed ` +
          "package. Two ways out: raise `modules.packages.ceilingBytes` in dabbler.yaml, or put " +
          `the feed under Git LFS by uncommenting the \`*.nupkg filter=lfs\` line in ${PACKAGES_DIR}/.gitattributes. ` +
          "Nothing was pinned or recorded.",
      );
    }
    artifacts.push(`${PACKAGES_DIR}/${actual}`);
  }

  const propsPath = join(root, "Directory.Packages.props");
  let props = existsSync(propsPath) ? readFileSync(propsPath, "utf8") : "<Project>\n  <PropertyGroup>\n    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>\n  </PropertyGroup>\n</Project>\n";
  const pins: string[] = [];
  for (const target of targets) {
    props = pinPackageVersion(props, target.packageId, version);
    pins.push(target.packageId);
  }
  writeFileSync(propsPath, props, "utf8");

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
  return { slug, version, artifacts, pins, records: written };
}

/** Whether a `packages/.gitattributes` puts the packages under LFS. */
export function packagesUnderLfs(root: string): boolean {
  const path = join(root, PACKAGES_DIR, ".gitattributes");
  if (!existsSync(path)) return false;
  return readFileSync(path, "utf8")
    .split(/\r?\n/)
    .some((line) => /^\s*\*\.nupkg\b.*filter=lfs/.test(line));
}
