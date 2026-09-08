// The impact plan: what a change in a multi-module solution reaches, computed
// once and read by everything that runs tests because of a change.
//
// A change reaches the modules whose roots or shared files hold its paths.
// A changed module owes its own suites -- its unit tests and the contract
// tests its abstractions are run against -- and every transitive consumer
// owes the compatibility suite it runs against that module, because the
// candidate package the change produces is what the consumer will restore.
// A changed shared-types module reaches every transitive consumer whole: a
// type they all compile against moved, and a consumer's own suite is the
// only thing that says its code still does. What the change reaches is the
// run of record, and nothing outside it is run or demanded.
//
// A single-module solution's plan is what it always was: every suite the
// close requires. `dabbler affected`, the selector's module form, the
// run-of-record phase and the close gate all read the one plan, so no two
// of them can disagree about what a change owes.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { atomicWriteJson } from "./journal.ts";
import { sessionRunDir } from "./ledger.ts";
import { type SolutionShape, consumersOf, dependencyOrder } from "./modules.ts";

/** The shape of a freshness verdict this module needs: structural, so the evidence module stays downstream. */
export interface DemandableVerdict {
  readonly suite: string;
  readonly required: boolean;
  readonly reason: string;
}

/** Why a suite is in the plan. */
export const REACH_MODULE_CHANGED = "module-changed";
export const REACH_CONSUMER_CONTRACT = "consumer-contract";
export const REACH_SHARED_TYPES = "shared-types";
export const REACH_REQUIRED = "required";
/**
 * The suite names no module, so it answers for the repository and every
 * change reaches it. Measured on the Java walk: the suite `dabbler
 * bootstrap` scaffolds covers "." and names no module, so a module session
 * reached no suite at all, ran nothing as its run of record, and closed with
 * a freshness gate that demanded nothing. The failure direction the
 * scaffold's own comment states is the one taken here -- run a suite you did
 * not need rather than skip one you did.
 */
export const REACH_REPOSITORY_WIDE = "repository-wide";

/** What the plan needs to know of a suite; the declared spec satisfies it. */
export interface ImpactSuite {
  readonly name: string;
  /** Absent means expensive: a suite handed to the planner is one that could be the run of record. */
  readonly expensive?: boolean;
  readonly requiredForClose?: boolean;
  readonly module?: string | null;
  readonly role?: string;
  readonly against?: string | null;
}

export interface ReachedSuite {
  readonly name: string;
  readonly module: string | null;
  readonly role: string | null;
  readonly against: string | null;
  readonly reason: string;
  /** The changed module that reached it; empty for a single-module plan. */
  readonly via: string;
}

export interface ImpactPlan {
  readonly multi: boolean;
  /** The modules the change reached, in dependency order. */
  readonly changedModules: readonly string[];
  /** The suites the change owes, one entry per suite, in the order reached. */
  readonly suites: readonly ReachedSuite[];
  /** The changed modules that declare a package: their candidate is packed before the suites run. */
  readonly candidates: readonly string[];
  /** The changed paths no module's roots or shared files hold. */
  readonly unowned: readonly string[];
  /** When the plan was written beside a run; absent on a plan not yet written. */
  readonly writtenAt?: string;
}

function posix(path: string): string {
  return path.split("\\").join("/").replace(/^\.\/+/, "").replace(/\/+$/, "");
}

/** Whether `rel` is `prefix` or under it; the root prefix holds everything. */
function under(rel: string, prefix: string): boolean {
  const clean = posix(prefix);
  if (clean === "" || clean === ".") return true;
  return rel === clean || rel.startsWith(`${clean}/`);
}

/**
 * The modules a changed path belongs to: the one whose roots hold it, and
 * every one whose shared files name it. A shared file is shared -- the
 * central pins, the packages folder -- so a change to it is every naming
 * module's change.
 */
export function modulesReachedBy(
  shape: SolutionShape,
  path: string,
  sharedFiles: ReadonlyMap<string, readonly string[]> = new Map(),
): string[] {
  const rel = posix(path);
  const owners: string[] = [];
  for (const entry of shape.modules) {
    const roots = entry.codeRoots.length > 0 ? entry.codeRoots : ["."];
    const shared = sharedFiles.get(entry.slug) ?? [];
    if (roots.some((root) => under(rel, root)) || shared.some((file) => under(rel, file))) {
      owners.push(entry.slug);
    }
  }
  return owners;
}

function planned(suite: ImpactSuite): boolean {
  return suite.expensive ?? true;
}

/**
 * The suites the named changed modules reach, by the three rules, one
 * entry per suite under the first rule that reached it: a changed module's
 * own suites; each transitive consumer's consumer-contract suite against a
 * changed module; and, for a changed shared-types module, every suite of
 * every transitive consumer.
 *
 * The rules are applied in that order, so the sharper reason is the one
 * recorded: a consumer's compatibility suite against a changed shared-types
 * module reads `consumer-contract`, because that is exactly what it is, and
 * `shared-types` is the reason for the consumer's other suites -- the ones
 * only a type they all compile against could have reached.
 */
export function reachModules(
  shape: SolutionShape,
  suites: readonly ImpactSuite[],
  changedModules: readonly string[],
): ReachedSuite[] {
  const changed = new Set(changedModules);
  const ordered = dependencyOrder(shape.modules).filter((entry) => changed.has(entry.slug));
  const reached = new Map<string, ReachedSuite>();
  const reach = (suite: ImpactSuite, reason: string, via: string): void => {
    if (reached.has(suite.name)) return;
    reached.set(suite.name, {
      name: suite.name,
      module: suite.module ?? null,
      role: suite.role ?? null,
      against: suite.against ?? null,
      reason,
      via,
    });
  };
  const candidates = suites.filter(planned);
  // A suite that binds itself to no module answers for the whole
  // repository, whatever changed.
  for (const suite of candidates) {
    if ((suite.module ?? null) === null) reach(suite, REACH_REPOSITORY_WIDE, "");
  }
  for (const entry of ordered) {
    for (const suite of candidates) {
      if (suite.module === entry.slug && suite.role !== "consumer-contract") {
        reach(suite, REACH_MODULE_CHANGED, entry.slug);
      }
    }
    for (const consumer of consumersOf(shape.modules, entry.slug)) {
      for (const suite of candidates) {
        if (suite.module === consumer && suite.role === "consumer-contract" && suite.against === entry.slug) {
          reach(suite, REACH_CONSUMER_CONTRACT, entry.slug);
        }
      }
    }
    if (entry.kind === "shared-types") {
      for (const consumer of consumersOf(shape.modules, entry.slug)) {
        for (const suite of candidates) {
          if (suite.module === consumer) reach(suite, REACH_SHARED_TYPES, entry.slug);
        }
      }
    }
  }
  return [...reached.values()];
}

/**
 * The plan for a change: the modules it reached, the suites they owe, the
 * candidates to pack first, and the paths nothing owns. A single-module
 * solution's plan is every suite the close requires, unchanged by the
 * paths.
 */
export function planImpact(
  shape: SolutionShape,
  suites: readonly ImpactSuite[],
  changedPaths: readonly string[],
  sharedFiles: ReadonlyMap<string, readonly string[]> = new Map(),
): ImpactPlan {
  if (!shape.multi) {
    return {
      multi: false,
      changedModules: [],
      suites: suites
        .filter((suite) => planned(suite) && (suite.requiredForClose ?? planned(suite)))
        .map((suite) => ({
          name: suite.name,
          module: suite.module ?? null,
          role: suite.role ?? null,
          against: suite.against ?? null,
          reason: REACH_REQUIRED,
          via: "",
        })),
      candidates: [],
      unowned: [],
    };
  }
  const reachedModules = new Set<string>();
  const unowned = new Set<string>();
  for (const path of changedPaths) {
    const rel = posix(String(path));
    if (rel === "") continue;
    const owners = modulesReachedBy(shape, rel, sharedFiles);
    if (owners.length === 0) unowned.add(rel);
    for (const owner of owners) reachedModules.add(owner);
  }
  const changedModules = dependencyOrder(shape.modules)
    .map((entry) => entry.slug)
    .filter((slug) => reachedModules.has(slug));
  return {
    multi: true,
    changedModules,
    suites: reachModules(shape, suites, changedModules),
    candidates: changedModules.filter(
      (slug) => shape.modules.find((entry) => entry.slug === slug)?.package !== null,
    ),
    unowned: [...unowned].sort(),
  };
}

// --- The plan beside the run ---------------------------------------------------

export const IMPACT_FILENAME = "impact.json";

export function impactPath(root: string, session: number): string {
  return join(sessionRunDir(root, session), IMPACT_FILENAME);
}

/**
 * The plan the run of record was selected by, written beside the run once
 * per verified tree: the close gate reads it, and so does the phase itself
 * when it is re-entered, because a plan recomputed after the candidate job
 * moved the shared files it writes would reach modules the change did not.
 */
export function writeImpactPlan(root: string, session: number, plan: ImpactPlan): ImpactPlan {
  mkdirSync(sessionRunDir(root, session), { recursive: true });
  const written: ImpactPlan = { ...plan, writtenAt: new Date().toISOString() };
  atomicWriteJson(impactPath(root, session), { schema_version: 1, ...written });
  return written;
}

export function readImpactPlan(root: string, session: number): ImpactPlan | null {
  const path = impactPath(root, session);
  if (!existsSync(path)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    return {
      multi: record["multi"] === true,
      changedModules: Array.isArray(record["changedModules"]) ? record["changedModules"].map(String) : [],
      suites: Array.isArray(record["suites"]) ? (record["suites"] as ReachedSuite[]) : [],
      candidates: Array.isArray(record["candidates"]) ? record["candidates"].map(String) : [],
      unowned: Array.isArray(record["unowned"]) ? record["unowned"].map(String) : [],
      ...(typeof record["writtenAt"] === "string" ? { writtenAt: record["writtenAt"] } : {}),
    };
  } catch {
    return null;
  }
}

/** Whether a record beside the run was written after the tree was verified. */
export function standsSince(writtenAt: string | null | undefined, verifiedAt: string | null | undefined): boolean {
  if (!writtenAt || !verifiedAt) return false;
  const written = Date.parse(writtenAt);
  const verified = Date.parse(verifiedAt);
  return Number.isFinite(written) && Number.isFinite(verified) && written >= verified;
}

export const CANDIDATE_FILENAME = "candidate.json";

export function candidatePath(root: string, session: number): string {
  return join(sessionRunDir(root, session), CANDIDATE_FILENAME);
}

/** One path the candidate wrote, with the digest of the bytes it left. */
export interface CandidatePath {
  readonly path: string;
  /** Hex sha256 of the file as written; null where the path was not a file. */
  readonly sha256: string | null;
}

function digestOfFile(root: string, path: string): string | null {
  try {
    return createHash("sha256").update(readFileSync(join(root, ...path.split("/")))).digest("hex");
  } catch {
    return null;
  }
}

/**
 * The paths the candidate job wrote -- the packages, their records, the
 * central pins, the contract pages -- recorded beside the run with the
 * digest of each as written. They are the framework's derivation of the
 * verified source, made after verification and before the run of record on
 * purpose, and the gate that refuses a tree moved after verification reads
 * this to know them from a change: a path is the candidate's only while its
 * bytes are the ones the candidate left.
 */
export function writeCandidateRecord(root: string, session: number, paths: readonly string[]): void {
  mkdirSync(sessionRunDir(root, session), { recursive: true });
  atomicWriteJson(candidatePath(root, session), {
    schema_version: 1,
    writtenAt: new Date().toISOString(),
    paths: paths.map((path) => ({ path, sha256: digestOfFile(root, path) })),
  });
}

export interface CandidateRecord {
  /** When the candidate was written; null where no record stands. */
  readonly writtenAt: string | null;
  readonly paths: readonly CandidatePath[];
}

export function readCandidateRecord(root: string, session: number): CandidateRecord {
  const path = candidatePath(root, session);
  if (!existsSync(path)) return { writtenAt: null, paths: [] };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { writtenAt?: unknown; paths?: unknown };
    const paths = Array.isArray(parsed.paths)
      ? parsed.paths.map((entry): CandidatePath =>
          typeof entry === "string"
            ? { path: entry, sha256: null }
            : { path: String((entry as { path?: unknown }).path ?? ""), sha256: typeof (entry as { sha256?: unknown }).sha256 === "string" ? (entry as { sha256: string }).sha256 : null },
        )
      : [];
    return { writtenAt: typeof parsed.writtenAt === "string" ? parsed.writtenAt : null, paths };
  } catch {
    return { writtenAt: null, paths: [] };
  }
}

/**
 * The candidate's paths whose bytes are still the ones it wrote: what the
 * verification gate may set aside. A path edited since -- by a person, an
 * engine, anything -- has a different digest and is a change like any other.
 */
export function candidatePathsAsWritten(root: string, record: CandidateRecord): Set<string> {
  const out = new Set<string>();
  for (const entry of record.paths) {
    if (entry.sha256 !== null && digestOfFile(root, entry.path) === entry.sha256) out.add(entry.path);
  }
  return out;
}

/**
 * The freshness verdicts as the close demands them under a plan: a suite the
 * plan did not reach is judged but not demanded, because the run of record
 * did not run it and the plan says why it did not have to. Without a plan
 * -- a single-module solution, or a session that ran none -- every verdict
 * stands as it was.
 */
export function demandedByPlan<T extends DemandableVerdict>(
  verdicts: readonly T[],
  plan: ImpactPlan | null,
): T[] {
  if (plan === null || !plan.multi) return [...verdicts];
  const reached = new Set(plan.suites.map((suite) => suite.name));
  return verdicts.map((verdict) =>
    reached.has(verdict.suite) || !verdict.required
      ? verdict
      : {
          ...verdict,
          required: false,
          reason: `${verdict.reason} (not reached by this session's impact plan, so not demanded)`,
        },
  );
}
