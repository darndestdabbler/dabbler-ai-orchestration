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

/**
 * The id of a dependency whose name only the build tool can resolve.
 *
 * Reported rather than dropped. A dropped reference is an edge the graph
 * does not know exists; a reported unreadable one is a question the operator
 * can answer.
 */
export const UNREADABLE_ID = "(unreadable)";

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
  let elements: XmlElement[];
  try {
    elements = readXmlElements(xml);
  } catch (error) {
    // A manifest this cannot read is one whose dependencies it must not
    // claim to know. Reported as unreadable rather than as an empty file,
    // because an empty reading produces `declared-but-not-referenced`
    // against every edge -- false drift from a parse failure.
    throw new SolutionDepsError(
      `${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const refs: BuildReference[] = [];

  if (path.endsWith(".csproj")) {
    for (const element of elements) {
      if (element.name === "PackageReference") {
        const id = element.attributes["Include"] ?? element.attributes["Update"];
        if (!id) continue;
        // An id only the build tool can resolve is REPORTED, never dropped:
        // dropping it hides the edge entirely, which is worse than saying
        // the id could not be read.
        const version = element.attributes["Version"];
        refs.push({
          id: isUnevaluated(id) ? UNREADABLE_ID : id,
          version: version && !isUnevaluated(version) ? version : null,
          file,
          kind: KIND_NUGET,
          fromSource: false,
        });
        continue;
      }
      if (element.name !== "ProjectReference") continue;
      const include = element.attributes["Include"];
      if (!include) continue;
      const target = resolve(join(path, "..", include.replace(/\\/g, "/")));
      refs.push({
        id: include.replace(/\\/g, "/").split("/").pop() ?? include,
        version: null,
        file,
        kind: KIND_NUGET,
        // A project reference that climbs out of this repository is the
        // source-resolution shape, whether or not anyone declared it.
        fromSource: relative(repoRoot, target).startsWith(".."),
      });
    }
    return refs;
  }

  for (const element of elements) {
    if (element.name !== "dependency") continue;
    // `<dependencyManagement>` states what a version WOULD be if this
    // project took the dependency. It is not a dependency, and counting it
    // as one is how a pom that manages fifty versions reports fifty edges.
    if (element.path.includes("dependencyManagement")) continue;
    const artifact = childText(elements, element.path, "dependency", "artifactId");
    const group = childText(elements, element.path, "dependency", "groupId");
    const version = childText(elements, element.path, "dependency", "version");
    if (!artifact) continue;
    const unreadable = isUnevaluated(artifact) || (group !== null && isUnevaluated(group));
    refs.push({
      // Maven identity is group AND artifact. A half-known id would join
      // against nothing and read as an undeclared edge, so an id missing
      // either half says so instead.
      id: unreadable || group === null ? UNREADABLE_ID : `${group}:${artifact}`,
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

// --- Structural reading -------------------------------------------------------

/**
 * One element of a build manifest, with the ancestry that gives it meaning.
 *
 * A regex over the whole file cannot tell a `<dependency>` under
 * `<dependencies>` from one under `<dependencyManagement>`, and those mean
 * opposite things: the first is a dependency this project takes, the second
 * is a version other poms may use if they take it. Reading the nesting is
 * the difference between a reconciliation and a false drift report.
 */
export interface XmlElement {
  readonly name: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly path: readonly string[];
  readonly text: string;
}

export class MalformedXmlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MalformedXmlError";
  }
}

const TAG = /<\s*(\/?)\s*([A-Za-z_][\w.:-]*)((?:\s+[\w.:-]+\s*=\s*"[^"]*")*)\s*(\/?)\s*>/g;
const ATTR = /([\w.:-]+)\s*=\s*"([^"]*)"/g;

/**
 * Every element in document order, each carrying its ancestor names.
 *
 * Deliberately small: build manifests are plain element trees with quoted
 * attributes, and a general parser would be more surface than the job has.
 * What it does NOT do quietly is guess -- a tag that never closes is a
 * refusal, because a manifest this cannot read is one whose dependencies it
 * must not claim to know.
 */
export function readXmlElements(xml: string): XmlElement[] {
  const cleaned = xml
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "");
  const stack: string[] = [];
  const out: XmlElement[] = [];
  const open: Array<{ element: XmlElement; textFrom: number }> = [];
  TAG.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG.exec(cleaned)) !== null) {
    const [, closing, name, rawAttrs, selfClosing] = match;
    if (closing) {
      const last = stack.pop();
      if (last !== name) {
        throw new MalformedXmlError(
          `</${name}> closes ${last ? `<${last}>` : "nothing"}`,
        );
      }
      const started = open.pop();
      if (started) {
        out.push({
          ...started.element,
          text: cleaned.slice(started.textFrom, match.index).trim(),
        });
      }
      continue;
    }
    const attributes: Record<string, string> = {};
    ATTR.lastIndex = 0;
    let attr: RegExpExecArray | null;
    while ((attr = ATTR.exec(rawAttrs ?? "")) !== null) {
      attributes[attr[1]] = attr[2];
    }
    const element: XmlElement = {
      name,
      attributes,
      path: [...stack],
      text: "",
    };
    if (selfClosing) {
      out.push(element);
      continue;
    }
    stack.push(name);
    open.push({ element, textFrom: TAG.lastIndex });
  }
  if (stack.length > 0) {
    throw new MalformedXmlError(`<${stack[stack.length - 1]}> is never closed`);
  }
  return out;
}

/** The direct child element of `parent` with this name, if there is one. */
function childText(
  elements: readonly XmlElement[],
  parentPath: readonly string[],
  parentName: string,
  child: string,
): string | null {
  const wanted = [...parentPath, parentName].join("/");
  const found = elements.find(
    (element) => element.name === child && element.path.join("/") === wanted,
  );
  return found ? found.text : null;
}

// --- The solution, assembled ---------------------------------------------------

/** One repository in the assembled graph, and whether it could be read. */
export interface SolutionMember {
  readonly id: string;
  readonly root: string | null;
  readonly deps: SolutionDeps | null;
  readonly refs: readonly BuildReference[];
  readonly reason: string;
}

/**
 * This repository and every producer it can reach, read once.
 *
 * The union is what makes the questions answerable. Alone, a repository
 * cannot tell an internal package from a third-party one -- which is why
 * `deps check` fed `reconcile` the ids it had already declared, and why
 * `referenced-but-not-declared` could never fire: a declared id is not an
 * undeclared one. The producers a declaration NAMES are what widen it.
 *
 * A member that cannot be reached is included with its reason. The graph is
 * a declaration about a solution, and a sibling nobody cloned does not make
 * the declaration wrong.
 */
export function assembleSolution(repoRoot: string): SolutionMember[] {
  const self = readMember("(this repository)", repoRoot);
  const members: SolutionMember[] = [self];
  const seen = new Set<string>();
  for (const edge of self.deps?.consumes ?? []) {
    const producer = edge.producedBy;
    if (seen.has(producer.id)) continue;
    seen.add(producer.id);
    const where = locateProducer(repoRoot, producer);
    members.push(
      where.path === null
        ? { id: producer.id, root: null, deps: null, refs: [], reason: where.reason }
        : readMember(producer.id, where.path),
    );
  }
  return members;
}

function readMember(id: string, root: string): SolutionMember {
  let deps: SolutionDeps | null = null;
  let refs: BuildReference[] = [];
  let reason = "";
  try {
    deps = loadDeps(root);
  } catch (error) {
    reason = error instanceof Error ? error.message : String(error);
  }
  try {
    refs = readBuildReferences(root);
  } catch (error) {
    reason = reason || (error instanceof Error ? error.message : String(error));
  }
  return { id, root, deps, refs, reason };
}

/**
 * The package ids this SOLUTION produces, as far as it can be established.
 *
 * A package is ours when some member declares that one of our repositories
 * builds it. That is the honest bound: it is exactly the set the operator
 * has answered the ownership question for, and nothing here infers
 * membership from a name.
 */
export function producedBySolution(members: readonly SolutionMember[]): Set<string> {
  const known = new Set<string>();
  for (const member of members) {
    for (const edge of member.deps?.consumes ?? []) known.add(edge.id);
  }
  return known;
}

/**
 * Where two repositories in one solution pin the same package differently.
 *
 * The within-repository version check cannot see this, and this is the one
 * that costs: two consumers on different versions of a package their own
 * team builds is the diamond that makes an upgrade a negotiation.
 */
export function reconcileAcrossRepositories(
  members: readonly SolutionMember[],
  known: ReadonlySet<string>,
): Reconciliation[] {
  const pins = new Map<string, Map<string, string[]>>();
  for (const member of members) {
    for (const ref of member.refs) {
      if (!known.has(ref.id) || ref.version === null) continue;
      const byVersion = pins.get(ref.id) ?? new Map<string, string[]>();
      byVersion.set(ref.version, [...(byVersion.get(ref.version) ?? []), member.id]);
      pins.set(ref.id, byVersion);
    }
  }
  const out: Reconciliation[] = [];
  for (const [id, byVersion] of pins) {
    if (byVersion.size < 2) continue;
    const where = [...byVersion.entries()]
      .sort()
      .map(([version, repos]) => `${version} in ${repos.join(", ")}`)
      .join("; ");
    out.push({
      kind: "version-disagreement",
      id,
      detail: `${id} is pinned ${where}. They are consuming different builds of the same package.`,
    });
  }
  return out;
}
