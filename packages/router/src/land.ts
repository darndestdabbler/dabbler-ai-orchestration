// The atomic land: the bytes the run of record tested are the bytes that
// land, and nothing else does.
//
// Every judgment here is pure -- facts in, a refusal or a record out -- so
// the land, the close's gates and the tests read one rule each. The land
// asks three things of the tree it is about to commit: that every suite it
// owes has a green run of record taken against exactly this tree; that a
// changed module's package was built from exactly this source and this
// contract; and that nothing it owes went stale. The close asks two more:
// that every consumer is on the candidate's pin and pins nowhere else, and
// that the checkout exposed nothing of a sibling that nobody signed for.
// A releasable application session records what it ships as a bundle, and
// a bundle names released packages only.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { type PackageReferenceFact, fileStem, packageIdOfStem } from "./ecosystem.ts";
import type { ExposureManifest } from "./exposure.ts";
import { type Deployable, type ModuleEntry, type SolutionShape, dependenciesOf } from "./modules.ts";

// The pure parsers of the .NET pin and reference files live on the seam;
// the judges here take their facts and know no ecosystem.
export { type PackageReferenceFact, centralPinsOfProps as centralPins, packageReferencesOf } from "./ecosystem.ts";

/**
 * A correspondence record as the judges need it: structural, so the
 * packages module -- which reaches the packaging flow, which reaches the
 * gates -- stays downstream of the judges the gates read.
 */
export interface CorrespondenceLike {
  readonly package: string;
  readonly version: string;
  readonly sourceDigest: string;
  readonly contractDigest: string | null;
  readonly session: number | null;
}

export class LandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LandError";
  }
}

// --- Tested bytes are the landed bytes ------------------------------------------

/** One suite the land owes, with its latest run of record and its surface now. */
export interface LandSuiteFact {
  readonly name: string;
  readonly latest: {
    readonly outcome: string;
    readonly treeDigest: string;
    readonly surfaceDigest: string;
    readonly recordedAt: string;
  } | null;
  /** The digest of the suite's covered surfaces now; null when it could not be taken. */
  readonly surfaceNow: string | null;
}

/** One changed module with a package, beside the record its candidate left. */
export interface LandModuleFact {
  readonly slug: string;
  readonly package: string;
  readonly record: {
    readonly version: string;
    readonly sourceDigest: string;
    readonly contractDigest: string | null;
  } | null;
  readonly sourceDigestNow: string | null;
  readonly contractDigestNow: string | null;
}

export interface LandFacts {
  /** The whole tree's digest now; null when it could not be taken. */
  readonly treeNow: string | null;
  readonly suites: readonly LandSuiteFact[];
  /**
   * The paths that moved since the verified tree, the candidate's own
   * writes set aside; null when the diff could not be taken. Named in the
   * refusal, never judged: the digests judge.
   */
  readonly moved: readonly string[] | null;
  readonly modules: readonly LandModuleFact[];
}

/**
 * Why the land must not happen, or null. Every reason is given, joined,
 * because a land refused for one reason and refused again for the next is
 * two trips for one fact.
 */
export function judgeLandReadiness(facts: LandFacts): string | null {
  const reasons: string[] = [];
  if (facts.treeNow === null) {
    return "the tree could not be digested (failing closed)";
  }
  const movedText =
    facts.moved === null
      ? "the paths that moved could not be measured"
      : facts.moved.length === 0
        ? "no path could be named"
        : facts.moved.slice(0, 8).join(", ") + (facts.moved.length > 8 ? ` (+${facts.moved.length - 8} more)` : "");
  for (const suite of facts.suites) {
    if (suite.latest === null) {
      reasons.push(`${suite.name} has no run of record`);
      continue;
    }
    if (suite.latest.outcome !== "passed") {
      reasons.push(`${suite.name}'s run of record is ${suite.latest.outcome}, not green`);
      continue;
    }
    if (suite.surfaceNow !== null && suite.latest.surfaceDigest !== suite.surfaceNow) {
      reasons.push(`${suite.name} is stale: its covered surfaces changed after its run of record`);
      continue;
    }
    if (suite.latest.treeDigest !== facts.treeNow) {
      reasons.push(
        `the tree moved after ${suite.name}'s run of record (recorded ${suite.latest.recordedAt || "at an unknown time"}): ${movedText}`,
      );
    }
  }
  for (const module of facts.modules) {
    if (module.record === null) {
      reasons.push(
        `module '${module.slug}' changed and no candidate of ${module.package} was recorded for this session`,
      );
      continue;
    }
    if (module.sourceDigestNow !== null && module.record.sourceDigest !== module.sourceDigestNow) {
      reasons.push(
        `${module.package} ${module.record.version} was built from a source of module '${module.slug}' that moved since`,
      );
    }
    if (
      module.record.contractDigest !== null &&
      module.contractDigestNow !== null &&
      module.record.contractDigest !== module.contractDigestNow
    ) {
      reasons.push(
        `${module.package} ${module.record.version} was built against a contract of module '${module.slug}' that moved since`,
      );
    }
  }
  return reasons.length === 0 ? null : reasons.join("; ");
}

/** What the gate receipt carries: each package this session packed, and the record that binds it. */
export interface ReceiptCorrespondence {
  readonly package: string;
  readonly version: string;
  readonly sourceDigest: string;
  readonly contractDigest: string | null;
  readonly record: string;
}

export function receiptCorrespondence(
  records: readonly CorrespondenceLike[],
  session: number,
): ReceiptCorrespondence[] {
  return records
    .filter((record) => record.session === session)
    .map((record) => ({
      package: record.package,
      version: record.version,
      sourceDigest: record.sourceDigest,
      contractDigest: record.contractDigest,
      record: `packages/${fileStem(record.package)}.${record.version}.json`,
    }));
}

// --- pins_current -----------------------------------------------------------------

export interface PinFacts {
  /** The packages this session packed, with the version each record names. */
  readonly candidates: readonly { readonly package: string; readonly version: string }[];
  /** The central pins, by package id, as the root declares them (the seam reads them). */
  readonly pins: ReadonlyMap<string, string>;
  readonly references: readonly PackageReferenceFact[];
}

/**
 * Every consumer on the candidate's pin, and pinning nowhere else. The
 * central pin must name the candidate's version -- a consumer left on an
 * older pin is drift -- and a reference carrying its own version is a pin
 * outside the one place pins live.
 */
export function judgePins(facts: PinFacts): string | null {
  const reasons: string[] = [];
  for (const candidate of facts.candidates) {
    const pin = facts.pins.get(candidate.package);
    if (pin === undefined) {
      reasons.push(`${candidate.package} has no central pin, and its candidate is ${candidate.version}`);
    } else if (pin !== candidate.version) {
      reasons.push(`${candidate.package} is pinned at ${pin}, and its candidate is ${candidate.version}`);
    }
    for (const reference of facts.references) {
      if (reference.packageId === candidate.package && reference.ownVersion !== null) {
        reasons.push(
          `${reference.project} references ${candidate.package} with its own version ${reference.ownVersion}; ` +
            "the one pin is the central one",
        );
      }
    }
  }
  return reasons.length === 0 ? null : reasons.join("; ");
}

/**
 * The packages a session packed, from the paths its candidate record names:
 * each `packages/<Package>.<version>.json` correspondence record it wrote.
 * The version begins at the first dot-digit run, so a dotted package id
 * (`Dabbler.Csv.Model`) keeps its dots.
 */
export function candidatesFromRecord(paths: readonly string[]): { package: string; version: string }[] {
  const out: { package: string; version: string }[] = [];
  for (const path of paths) {
    const match = /^packages\/(.+?)\.(\d+\.\d+\.\d+[^/]*)\.json$/.exec(path.split("\\").join("/"));
    if (match !== null) out.push({ package: packageIdOfStem(match[1] as string), version: match[2] as string });
  }
  return out;
}

// --- exposure_within_ceiling -------------------------------------------------------

/**
 * Nothing of a sibling that nobody signed for, and nothing changed outside
 * the scope. A sibling with bytes under no grant in force is the wall
 * leaking; a path outside the scope is work the session was not scoped to.
 */
export function judgeExposure(manifest: ExposureManifest): string | null {
  const granted = new Set(manifest.grants.map((grant) => grant.sibling));
  const reasons: string[] = [];
  for (const sibling of manifest.siblings) {
    if (sibling.bytes > 0 && !granted.has(sibling.slug)) {
      reasons.push(
        `module '${sibling.slug}' has ${sibling.bytes} byte(s) of implementation in this checkout under no recorded grant`,
      );
    }
  }
  if (manifest.outsideScope.length > 0) {
    reasons.push(
      `${manifest.outsideScope.length} path(s) changed outside the session's scope: ` +
        manifest.outsideScope.slice(0, 5).join(", ") +
        (manifest.outsideScope.length > 5 ? ` (+${manifest.outsideScope.length - 5} more)` : ""),
    );
  }
  return reasons.length === 0 ? null : reasons.join("; ");
}

// --- The bundle record ----------------------------------------------------------------

export interface BundleDependency {
  readonly module: string;
  readonly package: string;
  readonly version: string;
  readonly digest: string | null;
}

export interface BundleRecord {
  /** The deployable's slug: what ships, which is not always one module. */
  readonly bundle: string;
  /**
   * The application modules it was built from, in the order the deployable
   * names them. A record written before deployables existed carries none,
   * and reads back as an empty list.
   */
  readonly from: readonly string[];
  readonly version: string;
  /**
   * `HEAD` when the record was made: the commit the bundle was built ON,
   * never the one that lands it, which does not exist until the land. The
   * gate receipt maps the landed commit to this record, as it does to each
   * correspondence record.
   */
  readonly baseCommit: string | null;
  readonly date: string;
  readonly session: number | null;
  readonly dependencies: readonly BundleDependency[];
}

export function bundlePath(root: string, slug: string): string {
  return join(root, "release", slug, "bundle.yaml");
}

export interface BundleOptions {
  readonly session?: number | null;
  /** `HEAD` at record time; the landed commit is the receipt's to name. */
  readonly baseCommit?: string | null;
  readonly now?: Date;
  /** The application's project file text; read from the first project under its roots otherwise. */
  readonly projectText?: string | null;
}

/**
 * What a deployable ships, from the pins: for every application module it
 * is built `from`, each transitive dependency's package at the version the
 * solution pins centrally, with the source digest that version's
 * correspondence record carries. Refused while any pin is a dev version,
 * because a bundle names released packages; recorded, never executed.
 *
 * The union over `from` is safe because the pins are central: a package has
 * exactly one pin in the solution, so two applications in one deployable
 * cannot disagree about the version of something they share. Their own
 * versions can disagree, and that is refused rather than guessed at.
 *
 * `versionOf` reads a module's base version -- the ecosystem's question,
 * asked by the caller that knows which ecosystem the module is.
 */
export function bundleRecord(
  shape: SolutionShape,
  deployable: Deployable,
  pins: ReadonlyMap<string, string>,
  records: readonly CorrespondenceLike[],
  versionOf: (module: ModuleEntry) => string,
  options: BundleOptions = {},
): BundleRecord {
  if (deployable.from.length === 0) {
    throw new LandError(
      `deployable '${deployable.slug}' names no module in 'from'; nothing ships it yet, so there is ` +
        "nothing to record",
    );
  }
  const shipped: ModuleEntry[] = [];
  for (const slug of deployable.from) {
    const entry = shape.modules.find((module) => module.slug === slug);
    if (entry === undefined) {
      throw new LandError(`deployable '${deployable.slug}' ships module '${slug}', which the manifest does not declare`);
    }
    if (entry.kind !== "application") {
      throw new LandError(`module '${slug}' is a ${entry.kind}; a bundle is what an application ships`);
    }
    shipped.push(entry);
  }
  // One version for the deployable: every application it ships declares it,
  // and two that disagree is a question only the developer can answer.
  const versions = new Map(shipped.map((entry) => [entry.slug, versionOf(entry)] as const));
  const distinct = new Set(versions.values());
  if (distinct.size > 1) {
    throw new LandError(
      `deployable '${deployable.slug}' ships modules at different versions (` +
        [...versions].map(([slug, version]) => `${slug} ${version}`).join(", ") +
        "); one artefact carries one version, so settle it in their build files",
    );
  }
  const dependencies: BundleDependency[] = [];
  const named = new Set<string>();
  for (const entry of shipped) {
    for (const slug of dependenciesOf(shape.modules, entry.slug)) {
      if (named.has(slug)) continue;
      const dependency = shape.modules.find((module) => module.slug === slug);
      if (dependency === undefined || dependency.package === null) continue;
      const version = pins.get(dependency.package);
      if (version === undefined) {
        throw new LandError(`${dependency.package} (module '${slug}') has no central pin to bundle`);
      }
      if (/-dev\./.test(version)) {
        throw new LandError(
          `${dependency.package} is pinned at ${version}, a dev version; a bundle names released packages, ` +
            "so release the module first",
        );
      }
      named.add(slug);
      const record = records.find((row) => row.package === dependency.package && row.version === version);
      dependencies.push({ module: slug, package: dependency.package, version, digest: record?.sourceDigest ?? null });
    }
  }
  return {
    bundle: deployable.slug,
    from: shipped.map((entry) => entry.slug),
    version: [...distinct][0] ?? "0.1.0",
    baseCommit: options.baseCommit ?? null,
    date: (options.now ?? new Date()).toISOString().slice(0, 10),
    session: options.session ?? null,
    dependencies,
  };
}

/** What the gate receipt carries of a bundle: the record the landed commit is mapped to. */
export interface ReceiptBundle {
  readonly bundle: string;
  readonly version: string;
  readonly baseCommit: string | null;
  readonly record: string;
}

export function receiptBundles(records: readonly BundleRecord[], session: number): ReceiptBundle[] {
  return records
    .filter((record) => record.session === session)
    .map((record) => ({
      bundle: record.bundle,
      version: record.version,
      baseCommit: record.baseCommit,
      record: `release/${record.bundle}/bundle.yaml`,
    }));
}

/** Write the record as `release/<slug>/bundle.yaml` and return its repository-relative path. */
export function writeBundleRecord(root: string, record: BundleRecord): string {
  const path = bundlePath(root, record.bundle);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, stringifyYaml(record), "utf8");
  return `release/${record.bundle}/bundle.yaml`;
}

export function readBundleRecord(root: string, slug: string): BundleRecord | null {
  const path = bundlePath(root, slug);
  if (!existsSync(path)) return null;
  try {
    const parsed: unknown = parseYaml(readFileSync(path, "utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const dependencies = Array.isArray(record["dependencies"]) ? record["dependencies"] : [];
    const from = Array.isArray(record["from"]) ? record["from"] : [];
    return {
      bundle: String(record["bundle"] ?? slug),
      // A record written before deployables existed names no module; the
      // deployable was the application module it is named after.
      from: from.filter((name): name is string => typeof name === "string"),
      version: String(record["version"] ?? ""),
      baseCommit: typeof record["baseCommit"] === "string" ? record["baseCommit"] : null,
      date: String(record["date"] ?? ""),
      session: typeof record["session"] === "number" ? record["session"] : null,
      dependencies: dependencies
        .filter((entry): entry is Record<string, unknown> => entry !== null && typeof entry === "object")
        .map((entry) => ({
          module: String(entry["module"] ?? ""),
          package: String(entry["package"] ?? ""),
          version: String(entry["version"] ?? ""),
          digest: typeof entry["digest"] === "string" ? entry["digest"] : null,
        })),
    };
  } catch {
    return null;
  }
}

/** Every bundle record under `release/`, by bundle name. */
export function readBundleRecords(root: string): BundleRecord[] {
  const dir = join(root, "release");
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const out: BundleRecord[] = [];
  for (const name of names.sort()) {
    const record = readBundleRecord(root, name);
    if (record !== null) out.push(record);
  }
  return out;
}
