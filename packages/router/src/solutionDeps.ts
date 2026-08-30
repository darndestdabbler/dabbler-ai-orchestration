// Which of this repository's dependencies are OURS, and what the build files
// say about them.
//
// The one fact no build file can express is where a package comes FROM. A
// `.csproj` naming `Dabbler.Csv.Model >= 1.0.0` is authoritative about the
// version and silent about which repository produces it, and that silence is
// why a solution spanning five repositories has no way to know it is one
// solution. `solution-dependencies.json` says only that missing part.
//
// **It carries no versions.** The pin is read from the `.csproj` or the POM
// on every check rather than copied, because two homes for one fact is the
// drift this repository derives `usedBy` to avoid. What this module does is
// hold the two readings side by side and report where they disagree.
//
// **Reading a manifest is not building one.** Both ecosystems declare their
// direct dependencies in XML, and reading that XML stays inside the
// declare-and-check line -- no restore, no resolution, nothing invoked. The
// price is that a version reaching the file through an MSBuild property or
// Maven dependency management cannot be read, and the answer to that is to
// say "cannot determine" rather than to guess: a false drift report costs
// more than a missing one, because someone acts on it.

import { existsSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { loadSchemaFile, schemaFailure } from "./schema/validate.ts";
import { readText } from "./textfile.ts";

export const DEPS_FILENAME = "solution-dependencies.json";

export const KIND_NUGET = "nuget";
export const KIND_MAVEN = "maven";

export const RESOLVE_FEED = "feed";
export const RESOLVE_SOURCE = "source";

export class SolutionDepsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SolutionDepsError";
  }
}

export interface Producer {
  readonly id: string;
  readonly remote: string | null;
  readonly path: string | null;
}

export interface Edge {
  readonly id: string;
  readonly kind: string;
  readonly producedBy: Producer;
  readonly resolve: string;
}

export interface SolutionDeps {
  readonly solution: string;
  readonly consumes: readonly Edge[];
}

export function depsPath(repoRoot: string): string {
  return join(repoRoot, DEPS_FILENAME);
}

export function depsExist(repoRoot: string): boolean {
  return existsSync(depsPath(repoRoot));
}

/**
 * The declaration, schema-validated.
 *
 * A file that is present and wrong is a refusal rather than an empty graph:
 * a repository that meant to declare its edges and mistyped one would
 * otherwise read as a repository with no edges, which is the same shape as
 * the answer and not the same fact.
 */
export function loadDeps(repoRoot: string): SolutionDeps | null {
  const path = depsPath(repoRoot);
  if (!existsSync(path)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readText(path));
  } catch (error) {
    throw new SolutionDepsError(
      `${DEPS_FILENAME} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
  const failure = schemaFailure(
    raw,
    loadSchemaFile("solution-dependencies.schema.json"),
    DEPS_FILENAME,
  );
  if (failure) throw new SolutionDepsError(failure);
  const doc = raw as Record<string, unknown>;
  const consumes = (Array.isArray(doc["consumes"]) ? doc["consumes"] : []).map(
    (entry) => {
      const row = entry as Record<string, unknown>;
      const producer = row["producedBy"] as Record<string, unknown>;
      return {
        id: String(row["id"]),
        kind: String(row["kind"]),
        producedBy: {
          id: String(producer["id"]),
          remote: (producer["remote"] as string | null) ?? null,
          path: (producer["path"] as string | null) ?? null,
        },
        resolve: String(row["resolve"]),
      } satisfies Edge;
    },
  );
  return { solution: String(doc["solution"]), consumes };
}

// --- What the build files say -------------------------------------------------

/**
 * One dependency a build file names, and whether its version could be read.
 *
 * `version` is null when the file reaches it through something this reader
 * deliberately does not evaluate -- an MSBuild property, a
 * `Directory.Build.props` import, Maven's `dependencyManagement`. That is
 * reported as unknown rather than resolved, because resolving it means
 * running the build, and the framework does not build.
 */
export interface BuildReference {
  readonly id: string;
  readonly version: string | null;
  readonly file: string;
  readonly kind: string;
  /** A project reference crossing out of this repository. */
  readonly fromSource: boolean;
}

/** `$(Something)` or `${something}`: a value only the build tool can resolve. */
function isUnevaluated(value: string): boolean {
  return /\$[({]/.test(value);
}

function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag);
  return match ? match[1] : null;
}

function element(xml: string, name: string): string | null {
  const match = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i").exec(xml);
  return match ? match[1].trim() : null;
}

/** Every `.csproj` and `pom.xml` under a root, excluding build output. */
export function buildFilesIn(root: string, depth = 4): string[] {
  const found: string[] = [];
  const walk = (dir: string, left: number): void => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === "node_modules" || entry === "bin" || entry === "obj") continue;
      if (entry === ".git" || entry === "target" || entry === ".dabbler") continue;
      const full = join(dir, entry);
      let isDir = false;
      try {
        isDir = statSync(full).isDirectory();
      } catch {
        continue;
      }
      if (isDir) {
        if (left > 0) walk(full, left - 1);
        continue;
      }
      if (entry.endsWith(".csproj") || entry === "pom.xml") found.push(full);
    }
  };
  walk(root, depth);
  return found.sort();
}

/**
 * The direct dependencies one build file declares.
 *
 * Direct only, and deliberately: a transitive graph needs a restore, and a
 * restore is a build. What this exists to answer is "does this repository
 * name a package our solution produces", and that is always direct.
 */
export function readBuildFile(path: string, repoRoot: string): BuildReference[] {
  let xml: string;
  try {
    xml = readText(path);
  } catch {
    return [];
  }
  const file = relative(repoRoot, path).replace(/\\/g, "/");
  const refs: BuildReference[] = [];

  if (path.endsWith(".csproj")) {
    for (const match of xml.matchAll(/<PackageReference\b[^>]*\/?>/gi)) {
      const id = attribute(match[0], "Include");
      if (!id || isUnevaluated(id)) continue;
      const version = attribute(match[0], "Version");
      refs.push({
        id,
        version: version && !isUnevaluated(version) ? version : null,
        file,
        kind: KIND_NUGET,
        fromSource: false,
      });
    }
    for (const match of xml.matchAll(/<ProjectReference\b[^>]*\/?>/gi)) {
      const include = attribute(match[0], "Include");
      if (!include) continue;
      // A project reference that climbs out of this repository is the
      // source-resolution shape, whether or not anyone declared it.
      const target = resolve(join(path, "..", include.replace(/\\/g, "/")));
      const outside = relative(repoRoot, target).startsWith("..");
      refs.push({
        id: include.replace(/\\/g, "/").split("/").pop() ?? include,
        version: null,
        file,
        kind: KIND_NUGET,
        fromSource: outside,
      });
    }
    return refs;
  }

  for (const match of xml.matchAll(/<dependency>[\s\S]*?<\/dependency>/gi)) {
    const block = match[0];
    const artifact = element(block, "artifactId");
    if (!artifact || isUnevaluated(artifact)) continue;
    const group = element(block, "groupId");
    const version = element(block, "version");
    refs.push({
      id: group && !isUnevaluated(group) ? `${group}:${artifact}` : artifact,
      version: version && !isUnevaluated(version) ? version : null,
      file,
      kind: KIND_MAVEN,
      fromSource: false,
    });
  }
  return refs;
}

/** Every direct dependency this repository's build files declare. */
export function readBuildReferences(repoRoot: string): BuildReference[] {
  return buildFilesIn(repoRoot).flatMap((path) => readBuildFile(path, repoRoot));
}

// --- Reconciliation -----------------------------------------------------------

/**
 * One disagreement between what a repository declares and what it builds.
 *
 * Reported, never repaired. Every one of these has a legitimate reading --
 * a dependency added this morning, a refactor that removed one, a pin
 * deliberately held back -- and a tool that "fixed" them would be editing
 * build files on a guess about which side was right.
 */
export interface Reconciliation {
  readonly kind:
    | "referenced-but-not-declared"
    | "declared-but-not-referenced"
    | "version-disagreement"
    | "unsanctioned-source"
    | "cannot-determine";
  readonly id: string;
  readonly detail: string;
}

/**
 * Where the declaration and the build files disagree.
 *
 * `known` is the set of package ids the SOLUTION produces, which is the
 * caller's to supply: this repository cannot know it alone, and asking it to
 * guess is how "referenced-but-not-declared" becomes noise about
 * `Newtonsoft.Json`.
 */
export function reconcile(
  deps: SolutionDeps | null,
  refs: readonly BuildReference[],
  known: ReadonlySet<string>,
): Reconciliation[] {
  const out: Reconciliation[] = [];
  const declared = new Map((deps?.consumes ?? []).map((edge) => [edge.id, edge]));
  const referenced = new Set(refs.map((ref) => ref.id));

  // The dangerous one. An edge nobody declared is a dependency on our own
  // work that the solution graph does not contain -- so nothing warns when
  // the producing repository changes it, which is the entire failure this
  // record exists to prevent.
  for (const ref of refs) {
    if (!known.has(ref.id) || declared.has(ref.id)) continue;
    out.push({
      kind: "referenced-but-not-declared",
      id: ref.id,
      detail:
        `${ref.file} references ${ref.id}, which this solution produces, and ` +
        `${DEPS_FILENAME} does not declare it. Nothing will warn you when ` +
        "the repository that builds it changes it.",
    });
  }

  for (const [id, edge] of declared) {
    if (referenced.has(id)) continue;
    out.push({
      kind: "declared-but-not-referenced",
      id,
      detail:
        `${DEPS_FILENAME} declares ${id} from ${edge.producedBy.id}, and no ` +
        "build file references it. Either a build file dropped it or the " +
        "declaration outlived the dependency.",
    });
  }

  // A version the reader could not evaluate is reported as unknown, never as
  // agreement and never as drift. Saying nothing would let a real
  // disagreement hide behind a property.
  for (const ref of refs) {
    if (!declared.has(ref.id) || ref.version !== null) continue;
    out.push({
      kind: "cannot-determine",
      id: ref.id,
      detail:
        `${ref.file} sets ${ref.id}'s version through something only the ` +
        "build tool can resolve — an MSBuild property, an import, or " +
        "dependencyManagement. Its pin is not readable here, so it is " +
        "neither agreed nor disputed.",
    });
  }

  // The same package pinned two ways inside one repository. Across
  // repositories is the assembled graph's question, not this one's.
  const byId = new Map<string, Set<string>>();
  for (const ref of refs) {
    if (ref.version === null) continue;
    const seen = byId.get(ref.id) ?? new Set<string>();
    seen.add(ref.version);
    byId.set(ref.id, seen);
  }
  for (const [id, versions] of byId) {
    if (versions.size < 2) continue;
    out.push({
      kind: "version-disagreement",
      id,
      detail:
        `${id} is pinned to ${[...versions].sort().join(" and ")} in this ` +
        "repository. One of them is what actually loads.",
    });
  }

  // Source resolution that nothing sanctioned. A green build against a
  // sibling checkout says nothing about the published package, so the
  // record has to know it happened.
  for (const ref of refs) {
    if (!ref.fromSource) continue;
    const edge = declared.get(ref.id);
    if (edge && edge.resolve === RESOLVE_SOURCE) continue;
    out.push({
      kind: "unsanctioned-source",
      id: ref.id,
      detail:
        `${ref.file} references ${ref.id} as project source from outside this ` +
        `repository, and ${DEPS_FILENAME} does not declare it as ` +
        `resolve: ${RESOLVE_SOURCE}. A build against a sibling checkout ` +
        "proves nothing about the published package.",
    });
  }

  return out;
}

/**
 * Where a producing repository actually is on this machine, or why not.
 *
 * A sibling that is absent, moved or never cloned is a REPORTED state. The
 * graph is a declaration about a solution, not about one laptop, and a
 * checkout nobody has made is not a defect in the declaration.
 */
export function locateProducer(
  repoRoot: string,
  producer: Producer,
): { readonly path: string | null; readonly reason: string } {
  if (!producer.path) {
    return {
      path: null,
      reason: `${producer.id} declares no local path; nothing to look for here.`,
    };
  }
  const candidate = resolve(join(repoRoot, producer.path));
  if (!existsSync(candidate)) {
    return {
      path: null,
      reason: `${producer.id} is declared at ${producer.path}, which is not on this machine.`,
    };
  }
  if (!existsSync(join(candidate, ".git"))) {
    return {
      path: null,
      reason: `${producer.path} exists but is not a git repository.`,
    };
  }
  return { path: candidate, reason: "" };
}
