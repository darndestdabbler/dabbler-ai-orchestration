// Where a dependency comes from RIGHT NOW, and what it costs to change that.
//
// A declared edge says which repository produces a package. It does not say
// how this machine gets hold of it, and that is a separate fact with its own
// failure: a feed nobody registered, a pin behind what the producer has
// published, a `.csproj` left pointing at a sibling checkout after a
// debugging session that never finished.
//
// **Declaring, not orchestrating.** Feed configuration is READ wherever it
// lives and WRITTEN only into this repository, only as the execution of a
// decision the operator already answered. Nothing here installs, restores or
// builds; nothing here touches machine-global state; nothing here holds a
// credential.
//
// **Source mode is reversible or it does not happen.** Switching a
// `PackageReference` to a `ProjectReference` is how someone steps into a
// dependency's source while debugging -- the thing git submodules were being
// considered for -- and the entire reason it is safe here is that the
// original element is recorded before the edit, the restore puts back exactly
// what was there, and a crash mid-way leaves a record that says so. What it
// must never do is go unnoticed: a green build against a sibling checkout
// says nothing about the published package, so the run of record, packaging
// and the close all refuse while any dependency is resolving from source.

import { existsSync, mkdirSync, appendFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve } from "node:path";

import { RUNS_DIRNAME, nowIso, platformNewlines } from "./journal.ts";
import { dumps } from "./pythonJson.ts";
import {
  DEPS_FILENAME,
  loadDeps,
  RESOLVE_FEED,
  RESOLVE_SOURCE,
  UNREADABLE_ID,
  buildFilesIn,
  childText,
  readXmlElements,
  type Edge,
  type Reconciliation,
  type SolutionMember,
} from "./solutionDeps.ts";
import { readText } from "./textfile.ts";

/**
 * Write a build file back, keeping the checkout's line endings.
 *
 * `readText` translates to `
` so both routers parse one string. Writing
 * that translation back would rewrite every line of a CRLF checkout's
 * .csproj, which turns a one-element swap into a whole-file diff.
 */
function writeText(path: string, text: string): void {
  writeFileSync(path, platformNewlines(text), { encoding: "utf8" });
}

/** The machine-written record of every source-mode swap. Never hand-edited. */
export const SOURCE_MODE_FILENAME = "source-mode.jsonl";

/** The repository-scoped feed declaration this writes, and nothing else. */
export const NUGET_CONFIG_FILENAME = "NuGet.config";

export class ResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResolutionError";
  }
}

// --- What a producer has actually published -----------------------------------

/**
 * The versions a repository's own packaging record says it PUBLISHED.
 *
 * This is the authoritative half, and it is deliberately narrow: a push that
 * happened left a row saying so, with the artifact names it sent. Nothing
 * here queries a feed -- that is a network call this framework does not make
 * -- so a producer whose publishing happens in CI leaves no local record and
 * is reported as unknown rather than guessed at.
 */
export function publishedVersions(memberRoot: string): PublishedArtifact[] {
  const runs = join(memberRoot, ...RUNS_DIRNAME.split("/"));
  let sessions: string[];
  try {
    sessions = readdirSync(runs);
  } catch {
    return [];
  }
  const found: PublishedArtifact[] = [];
  for (const entry of sessions) {
    const path = join(runs, entry, "packaging.jsonl");
    if (!existsSync(path)) continue;
    for (const line of readText(path).split("\n")) {
      const text = line.trim();
      if (!text) continue;
      let row: Record<string, unknown>;
      try {
        row = JSON.parse(text) as Record<string, unknown>;
      } catch {
        continue;
      }
      if (row["outcome"] !== "published") continue;
      for (const artifact of (row["artifacts"] as string[] | undefined) ?? []) {
        const parsed = artifactIdentity(String(artifact));
        if (parsed !== null) found.push(parsed);
      }
    }
  }
  return found;
}

/** One artifact a packaging run reported pushing. */
export interface PublishedArtifact {
  readonly packageId: string;
  readonly version: string;
}

/**
 * The package and version an artifact name carries.
 *
 * The IDENTITY and not just the version. A repository that publishes two
 * packages leaves two artifacts, and a reader that kept only the versions
 * reports the higher one against both -- telling a consumer correctly pinned
 * to one package that it is behind a release of the other.
 */
export function artifactIdentity(name: string): PublishedArtifact | null {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? name;
  const nuget = /^(.*?)\.(\d+(?:\.\d+)*(?:-[0-9A-Za-z.-]+)?)\.(?:nupkg|snupkg)$/.exec(base);
  if (nuget) return { packageId: nuget[1], version: nuget[2] };
  const jar = /^(.*?)-(\d+(?:\.\d+)*(?:-[0-9A-Za-z.-]+)?)\.jar$/.exec(base);
  return jar ? { packageId: jar[1], version: jar[2] } : null;
}

/**
 * The version a repository's checkout WOULD build, which is not the same fact.
 *
 * A producer bumps its version while preparing a release, and the package on
 * the feed stays where it was until something pushes it. Calling this
 * "published" is how a consumer correctly pinned to the released version gets
 * told to upgrade to one that does not exist yet, so it is named for what it
 * is and reported under its own finding.
 *
 * Null when the manifest reaches its version through something only the build
 * tool resolves. Unknown is reported as unknown.
 */
export function producerBuildVersion(memberRoot: string): string | null {
  for (const path of buildFilesIn(memberRoot)) {
    let elements;
    try {
      elements = readXmlElements(readText(path));
    } catch {
      continue;
    }
    const project = elements.find(
      (element) => element.name === "Project" || element.name === "project",
    );
    if (!project) continue;
    const version =
      childText(elements, project, "Version") ?? childText(elements, project, "version");
    if (version && !isUnevaluatedValue(version)) return version;
    // A .csproj states its version inside a PropertyGroup rather than on the
    // Project element, which is one level further in.
    for (const group of elements) {
      if (group.name !== "PropertyGroup") continue;
      const inner = childText(elements, group, "Version");
      if (inner && !isUnevaluatedValue(inner)) return inner;
    }
  }
  return null;
}

function isUnevaluatedValue(value: string): boolean {
  return /\$[({]/.test(value);
}

/**
 * Order two versions, ignoring what neither of us can order.
 *
 * Numeric segments compared as numbers, and anything past the first
 * non-numeric segment is not compared at all: `1.0.0-rc.2` against `1.0.0` is
 * a question about prerelease precedence that this has no business
 * answering, so it reports them incomparable rather than guessing.
 */
export function comparePins(left: string, right: string): number | null {
  const parts = (value: string): number[] | null => {
    const out: number[] = [];
    for (const piece of value.split(".")) {
      if (!/^\d+$/.test(piece)) return null;
      out.push(Number(piece));
    }
    return out.length > 0 ? out : null;
  };
  const a = parts(left);
  const b = parts(right);
  if (a === null || b === null) return null;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
  return 0;
}

// --- Feeds, read where they live ----------------------------------------------

/** One configured package source, and whether it can serve anything. */
export interface Feed {
  readonly key: string;
  readonly value: string;
  readonly enabled: boolean;
  readonly file: string;
  /** Why a local source cannot serve, when it cannot. */
  readonly unusable: string;
}

/**
 * Every configuration file NuGet would read, nearest first.
 *
 * Repository outward, then the user's, and the user's location is different
 * on every platform: `%APPDATA%\NuGet` on Windows, `~/.nuget/NuGet` on Linux
 * and macOS, with `$XDG_CONFIG_HOME/NuGet` ahead of it when that is set. A
 * reader that knew only the Windows path would report a feed the machine has
 * as absent, ask a question nobody needed to answer, and write a duplicate
 * repository configuration on the strength of it.
 */
export function feedConfigFiles(repoRoot: string, home?: string): string[] {
  const files: string[] = [];
  const consider = (directory: string): void => {
    for (const name of [NUGET_CONFIG_FILENAME, "nuget.config", "NuGet.Config"]) {
      const path = join(directory, name);
      if (existsSync(path) && !files.some((seen) => seen.toLowerCase() === path.toLowerCase())) {
        files.push(path);
      }
    }
  };
  let at = resolve(repoRoot);
  for (;;) {
    consider(at);
    const up = dirname(at);
    if (up === at) break;
    at = up;
  }
  if (home !== undefined) {
    consider(join(home, "NuGet"));
    consider(home);
    return files;
  }
  const appData = process.env["APPDATA"];
  if (appData) consider(join(appData, "NuGet"));
  const xdg = process.env["XDG_CONFIG_HOME"];
  if (xdg) consider(join(xdg, "NuGet"));
  const profile = process.env["HOME"] ?? process.env["USERPROFILE"];
  if (profile) {
    consider(join(profile, ".nuget", "NuGet"));
    consider(join(profile, ".config", "NuGet"));
  }
  return files;
}

/**
 * Every package source this machine has configured, nearest first.
 *
 * Reading is not writing. The user-level files are inspected so the framework
 * can tell the operator what is already there, and they are never edited.
 * `<clear />` and `<remove>` are honoured because NuGet honours them: a
 * repository that clears the inherited sources has no inherited sources, and
 * reporting them anyway would say a feed is available that no restore will
 * reach.
 */
export function configuredFeeds(repoRoot: string, home?: string): Feed[] {
  const feeds: Feed[] = [];
  const disabled = new Set<string>();
  const removed = new Set<string>();
  let cleared = false;
  for (const file of feedConfigFiles(repoRoot, home)) {
    // A `<clear />` discards the sources of every file FURTHER OUT, not the
    // ones beside it: NuGet reads nearest last and clears what it inherited,
    // so a file that clears and then adds keeps what it added. Applying it
    // within its own file would drop the very sources it declares.
    if (cleared) break;
    let elements;
    try {
      elements = readXmlElements(readText(file));
    } catch {
      // A configuration file that does not parse is reported through the
      // list, not thrown: a broken NuGet.config elsewhere on the machine
      // must not stop a dependency check.
      feeds.push({
        key: "(unreadable)",
        value: file,
        enabled: false,
        file,
        unusable: `${file} is not readable as XML`,
      });
      continue;
    }
    let clearsOuter = false;
    for (const element of elements) {
      const inSources = element.path.includes("packageSources");
      if (element.name === "clear" && inSources) {
        clearsOuter = true;
        continue;
      }
      if (element.name === "remove" && inSources) {
        const key = element.attributes["key"];
        if (key) removed.add(key);
        continue;
      }
      if (element.name !== "add") continue;
      const key = element.attributes["key"];
      const value = element.attributes["value"];
      if (!key || value === undefined) continue;
      if (element.path.includes("disabledPackageSources")) {
        disabled.add(key);
        continue;
      }
      if (!inSources) continue;
      if (removed.has(key)) continue;
      if (feeds.some((feed) => feed.key === key)) continue;
      feeds.push({ key, value, enabled: true, file, unusable: "" });
    }
    if (clearsOuter) cleared = true;
  }
  return feeds.map((feed) => ({
    ...feed,
    enabled: feed.enabled && !disabled.has(feed.key),
    unusable: feed.unusable || localSourceProblem(feed.value),
  }));
}

/** Why a local directory source cannot serve, or the empty string. */
function localSourceProblem(value: string): string {
  if (/^[a-z]+:\/\//i.test(value)) return "";
  if (existsSync(value)) return "";
  return `${value} is a local source and is not on this machine`;
}

// --- The reconciliations this session adds ------------------------------------

/**
 * Where the pin trails the producer, and where a named feed serves nothing.
 *
 * Two findings and not one for the first: `behind-producer` is said only
 * against a version this machine has EVIDENCE was published, and a producer
 * checkout carrying a higher version than anything published is
 * `producer-source-ahead` -- true, worth knowing, and not an upgrade anyone
 * can do yet. Collapsing them tells a consumer correctly pinned to the
 * released version to move to one that does not exist.
 */
export function reconcileResolution(
  members: readonly SolutionMember[],
  feeds: readonly Feed[],
): Reconciliation[] {
  const out: Reconciliation[] = [];
  const self = members[0];
  // Keyed by PACKAGE, not by repository. A producer publishing two packages
  // is ordinary, and attributing one package's release to the other is a
  // finding that sends a consumer at a version of its dependency that was
  // never cut.
  const published = new Map<string, string[]>();
  const built = new Map<string, string>();
  for (const member of members.slice(1)) {
    if (member.root === null || member.duplicateOf !== null) continue;
    for (const artifact of publishedVersions(member.root)) {
      const seen = published.get(artifact.packageId) ?? [];
      seen.push(artifact.version);
      published.set(artifact.packageId, seen);
    }
    const version = producerBuildVersion(member.root);
    if (version !== null) built.set(member.id, version);
  }

  for (const edge of self?.deps?.consumes ?? []) {
    const releases = published.get(edge.id) ?? [];
    const newest = newestOf(releases);
    const building = built.get(edge.producedBy.id) ?? null;
    const pins = (self?.refs ?? []).filter(
      (ref) => ref.id === edge.id && ref.version !== null,
    );
    for (const ref of pins) {
      if (ref.version === null) continue;
      if (newest !== null && (comparePins(ref.version, newest) ?? 0) < 0) {
        out.push({
          kind: "behind-producer",
          id: edge.id,
          detail:
            `${ref.file} pins ${edge.id} at ${ref.version}, and ` +
            `${edge.producedBy.id} has published ${newest}. Either the ` +
            "upgrade has not been done or the pin is held back on purpose; " +
            "which of those is true is not derivable from here.",
        });
        continue;
      }
      if (building === null) continue;
      const ahead = comparePins(newest ?? ref.version, building) ?? 0;
      if (ahead >= 0) continue;
      out.push({
        kind: "producer-source-ahead",
        id: edge.id,
        detail:
          `${edge.producedBy.id}'s checkout builds ${building}, ahead of ` +
          `${newest === null ? `the ${ref.version} pinned in ${ref.file}` : newest}. ` +
          "Nothing here says that version was ever published -- a version " +
          "bumped while preparing a release looks exactly like this -- so it " +
          "is not an upgrade you can do yet.",
      });
    }

    if (edge.resolve === RESOLVE_SOURCE || !edge.feed) continue;
    const feed = feeds.find((candidate) => candidate.key === edge.feed);
    if (feed === undefined) {
      out.push({
        kind: "feed-not-configured",
        id: edge.id,
        detail:
          `${DEPS_FILENAME} says ${edge.id} comes from feed '${edge.feed}', ` +
          "and no package source on this machine has that name. A restore " +
          "will look in the sources that are configured and not find it.",
      });
      continue;
    }
    if (!feed.enabled || feed.unusable) {
      out.push({
        kind: "feed-not-configured",
        id: edge.id,
        detail:
          `'${edge.feed}' is configured in ${feed.file} and cannot serve ` +
          `${edge.id}: ${feed.unusable || "the source is disabled"}.`,
      });
    }
  }
  return out;
}

/** The highest of a set of versions, ignoring any pair it cannot order. */
function newestOf(versions: readonly string[]): string | null {
  let best: string | null = null;
  for (const version of versions) {
    if (best === null) {
      best = version;
      continue;
    }
    if ((comparePins(best, version) ?? 0) < 0) best = version;
  }
  return best;
}

// --- Source mode, recorded before it happens ----------------------------------

/** One swap, as the machine recorded it. */
export interface SourceSwap {
  readonly packageId: string;
  readonly file: string;
  readonly originalElement: string;
  readonly originalDigest: string;
  readonly producerProject: string;
  readonly switchedAt: string;
  readonly restoredAt: string | null;
}

export function sourceModePath(repoRoot: string): string {
  return join(repoRoot, ...RUNS_DIRNAME.split("/"), SOURCE_MODE_FILENAME);
}

/** Every swap that is still in force, folded by package and file. */
export function activeSwaps(repoRoot: string): SourceSwap[] {
  const path = sourceModePath(repoRoot);
  if (!existsSync(path)) return [];
  const byKey = new Map<string, SourceSwap>();
  for (const line of readText(path).split("\n")) {
    const text = line.trim();
    if (!text) continue;
    let row: SourceSwap;
    try {
      row = JSON.parse(text) as SourceSwap;
    } catch {
      // A record this cannot read is a record of a swap that may still be in
      // force. Refusing to read the file would let a corrupt line turn the
      // refusals off, which is exactly backwards.
      throw new ResolutionError(
        `${SOURCE_MODE_FILENAME} has a line that does not parse; a dependency ` +
          "may still be resolving from source and this cannot tell.",
      );
    }
    byKey.set(`${row.file} ${row.packageId}`, row);
  }
  return [...byKey.values()].filter((row) => row.restoredAt === null);
}

/**
 * Whether anything is resolving from source right now.
 *
 * The predicate the run of record, packaging and the close all read. It
 * throws rather than answering false when the record cannot be read: "we
 * cannot tell" must never resolve to "nothing is switched".
 */
export function sourceModeActive(repoRoot: string): SourceSwap[] {
  return activeSwaps(repoRoot);
}

/** The sentence a refusal prints, naming what is switched. */
export function sourceModeRefusal(swaps: readonly SourceSwap[], what: string): string {
  const names = swaps.map((swap) => `${swap.packageId} in ${swap.file}`).join(", ");
  return (
    `${what} is refused while a dependency resolves from source: ${names}. A ` +
    "build against a sibling checkout proves nothing about the published " +
    "package, so the record does not get to claim it did. `dabbler deps " +
    "restore` puts the reference back."
  );
}

/**
 * The one refusal, read by the run of record, packaging and the close.
 *
 * Prohibited rather than approvable, and that is the deliberate part. An
 * approval path here would be a way to accept final evidence produced against
 * a sibling checkout -- the one class of decision the framework reserves
 * absolutely -- so the answer is `dabbler deps restore`, and there is no
 * second answer. Returns the sentence to print, or null when nothing is
 * switched.
 */
export function refuseIfResolvingFromSource(
  repoRoot: string | null,
  what: string,
  options: {
    /** A run start the framework itself observed. Never a reported one. */
    readonly observedStart?: string | null;
    /** The moment the last accepted run of record was written. */
    readonly since?: string | null;
  } = {},
): string | null {
  if (repoRoot === null) return null;
  const swaps = sourceModeActive(repoRoot);
  if (swaps.length > 0) return sourceModeRefusal(swaps, what);

  // The DECLARATION, independently of the journal. `.dabbler` is machine
  // state and can be deleted; `solution-dependencies.json` is tracked. An
  // edge declaring source with no journal record behind it is a repository
  // whose machine state was lost mid-debugging, and the answer to "we cannot
  // tell whether this is switched" is never "assume it is not".
  let declared: readonly string[] = [];
  try {
    declared = (loadDeps(repoRoot)?.consumes ?? [])
      .filter((edge) => edge.resolve === RESOLVE_SOURCE)
      .map((edge) => edge.id);
  } catch {
    declared = [];
  }
  if (declared.length > 0) {
    return (
      `${what} is refused: ${DEPS_FILENAME} declares ${declared.join(", ")} as ` +
      `resolve: ${RESOLVE_SOURCE}. A build against a sibling checkout proves ` +
      "nothing about the published package, so the record does not get to " +
      "claim it did. `dabbler deps restore` puts the reference back."
    );
  }

  // Evidence produced DURING source mode and recorded after the restore. The
  // ordinary debugging sequence is switch, run, restore, record -- and a
  // check that asked only "is anything switched right now" accepts exactly
  // that run, which is the one the whole refusal exists to reject.
  //
  // A self-reported duration cannot settle it. "It took thirty seconds and I
  // am recording it now" says nothing about when those thirty seconds were:
  // restoring the reference, reading the output and then recording puts the
  // inferred start after the restore for a run that happened before it. So
  // the window is decided by a start the FRAMEWORK observed, and when there
  // is none, an unproven window is a refusal rather than a pass.
  const suspect = allSwaps(repoRoot).filter((swap) =>
    swap.restoredAt === null ? true : notBefore(swap.restoredAt, options.since),
  );
  if (suspect.length === 0) return null;
  const names = [...new Set(suspect.map((swap) => swap.packageId))].join(", ");
  const observed = options.observedStart;
  if (!observed) {
    return (
      `${what} is refused: ${names} was resolving from source since the last ` +
      "run of record, and a duration reported after the fact cannot show " +
      "this run happened after the reference was put back. Run the suite " +
      "through `dabbler test-evidence run`, which times it here, so the " +
      "window is observed rather than described."
    );
  }
  const overlapping = suspect.filter((swap) =>
    swap.restoredAt === null ? true : notBefore(swap.restoredAt, observed),
  );
  if (overlapping.length === 0) return null;
  return (
    `${what} is refused: ${[...new Set(overlapping.map((s) => s.packageId))].join(", ")} ` +
    "was resolving from source while this run was executing. Restoring the " +
    "reference afterwards does not change what the tests ran against -- run " +
    "the suite again against the restored tree."
  );
}

/**
 * Whether `when` is at or after `mark`, comparing instants and not strings.
 *
 * The record stamps local time with an offset and a caller may hand over UTC;
 * two correct spellings of one moment do not sort against each other. An
 * unparseable stamp answers true, because a timestamp this cannot read is not
 * evidence that a window is clear.
 */
function notBefore(when: string, mark: string | null | undefined): boolean {
  if (!mark) return true;
  const a = Date.parse(when);
  const b = Date.parse(mark);
  if (Number.isNaN(a) || Number.isNaN(b)) return true;
  return a >= b;
}

/** Every swap ever recorded, open and closed, folded by file and package. */
export function allSwaps(repoRoot: string): SourceSwap[] {
  const path = sourceModePath(repoRoot);
  if (!existsSync(path)) return [];
  const byKey = new Map<string, SourceSwap>();
  for (const line of readText(path).split("\n")) {
    const text = line.trim();
    if (!text) continue;
    try {
      const row = JSON.parse(text) as SourceSwap;
      byKey.set(`${row.file} ${row.packageId}`, row);
    } catch {
      throw new ResolutionError(
        `${SOURCE_MODE_FILENAME} has a line that does not parse; a dependency ` +
          "may still be resolving from source and this cannot tell.",
      );
    }
  }
  return [...byKey.values()];
}

function appendSwap(repoRoot: string, row: SourceSwap): void {
  const path = sourceModePath(repoRoot);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${dumps(row as unknown as Record<string, unknown>)}\n`, {
    encoding: "utf8",
  });
}

function digestOf(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

/**
 * The producer's project file that builds a package, or why it is not certain.
 *
 * Matched on the `PackageId` the manifest declares, and on the file name only
 * when the manifest says nothing -- a project that publishes under a name
 * other than its own file name is ordinary, and guessing there swaps in the
 * wrong project.
 */
export function producerProjectFor(
  producerRoot: string,
  packageId: string,
): { readonly path: string | null; readonly reason: string } {
  const candidates = buildFilesIn(producerRoot).filter((path) => path.endsWith(".csproj"));
  const named: string[] = [];
  for (const path of candidates) {
    let elements;
    try {
      elements = readXmlElements(readText(path));
    } catch {
      continue;
    }
    for (const group of elements) {
      if (group.name !== "PropertyGroup") continue;
      if (childText(elements, group, "PackageId") === packageId) named.push(path);
    }
  }
  if (named.length === 1) return { path: named[0], reason: "" };
  if (named.length > 1) {
    return {
      path: null,
      reason: `${named.length} projects in the producer declare PackageId ${packageId}`,
    };
  }
  const byName = candidates.filter(
    (path) => path.replace(/\\/g, "/").split("/").pop() === `${packageId}.csproj`,
  );
  if (byName.length === 1) return { path: byName[0], reason: "" };
  return {
    path: null,
    reason:
      `nothing in the producer declares PackageId ${packageId}, and no ` +
      `${packageId}.csproj identifies it by name`,
  };
}

/**
 * Point a `PackageReference` at the producer's project instead of the feed.
 *
 * TWO files move together and are recorded together: the build file, which
 * is what the compiler reads, and `solution-dependencies.json`, whose
 * `resolve` is what every reader of the declaration reads. Moving only the
 * first leaves the declaration saying `feed` while the project builds from
 * source -- the declare-and-check model disagreeing with itself on its own
 * main path -- and leaves the refusals depending entirely on machine state
 * that a `.dabbler` wipe would take with it.
 *
 * The record is written BEFORE either file is touched. That ordering is the
 * safety property: a crash between the record and a write leaves a record of
 * a swap that partly happened, which the restore reads and finishes, whereas
 * the other order would leave edited files nothing knows about.
 */
export function switchToSource(
  repoRoot: string,
  options: {
    readonly packageId: string;
    readonly producerRoot: string;
  },
): SourceSwap {
  if (activeSwaps(repoRoot).some((swap) => swap.packageId === options.packageId)) {
    throw new ResolutionError(`${options.packageId} is already resolving from source`);
  }
  const project = producerProjectFor(options.producerRoot, options.packageId);
  if (project.path === null) {
    throw new ResolutionError(
      `cannot tell which project builds ${options.packageId}: ${project.reason}`,
    );
  }
  const found = locateReference(repoRoot, options.packageId);
  const swap: SourceSwap = {
    packageId: options.packageId,
    file: relative(repoRoot, found.path).replace(/\\/g, "/"),
    originalElement: found.element,
    originalDigest: digestOf(found.text),
    producerProject: project.path,
    switchedAt: nowIso("microseconds"),
    restoredAt: null,
  };
  appendSwap(repoRoot, swap);

  const target = relative(dirname(found.path), project.path).replace(/\//g, "\\");
  writeText(found.path, found.text.replace(found.element, `<ProjectReference Include="${target}" />`));
  writeDeclaredResolve(repoRoot, options.packageId, RESOLVE_SOURCE);
  return swap;
}

/**
 * Put both files back exactly, and say so only if it IS exact.
 *
 * The check is the point. A restore that reported success on a file it had
 * half-repaired would leave a repository building against a sibling checkout
 * while every gate believed it was not, which is the one state this whole
 * mechanism exists to make impossible. The active record is cleared LAST,
 * after both files are back, so a crash part-way leaves the refusals in force
 * rather than lifting them over a repair that did not finish.
 */
export function restoreFromSource(repoRoot: string, packageId: string): SourceSwap {
  const swap = activeSwaps(repoRoot).find((row) => row.packageId === packageId);
  if (swap === undefined) {
    throw new ResolutionError(`${packageId} is not resolving from source`);
  }
  const path = join(repoRoot, ...swap.file.split("/"));
  if (!existsSync(path)) {
    throw new ResolutionError(
      `${swap.file} is gone, so the original ${packageId} reference cannot be ` +
        `put back. It was: ${swap.originalElement}`,
    );
  }
  const text = readText(path);
  // A crash between recording and writing leaves the file untouched. That is
  // a restore with nothing to do, not a failure -- and saying so is how the
  // record gets closed instead of blocking every gate forever.
  if (!text.includes(swap.originalElement)) {
    let restored: string | null = null;
    for (const match of text.matchAll(/<ProjectReference\s[^>]*\/>/g)) {
      const candidate = text.replace(match[0], swap.originalElement);
      if (digestOf(candidate) === swap.originalDigest) {
        restored = candidate;
        break;
      }
    }
    if (restored === null) {
      throw new ResolutionError(
        `${swap.file} has changed since ${packageId} was switched to source, ` +
          "so putting the original reference back would not restore the file " +
          `exactly. It was: ${swap.originalElement}`,
      );
    }
    writeText(path, restored);
  }
  // The declaration second, and by the same targeted edit that set it. A
  // whole-file snapshot restored in switch order would reintroduce
  // `resolve: source` for a dependency already put back, and leave no open
  // record able to repair it.
  writeDeclaredResolve(repoRoot, packageId, RESOLVE_FEED);
  const closed = { ...swap, restoredAt: nowIso("microseconds") };
  appendSwap(repoRoot, closed);
  return closed;
}

/**
 * Set one edge's `resolve` in the declaration, touching nothing else.
 *
 * A targeted edit rather than a reserialisation: rewriting the whole document
 * would reformat a file the operator wrote and hand a debugging session a
 * diff nobody asked for.
 */
function writeDeclaredResolve(repoRoot: string, packageId: string, mode: string): void {
  const path = join(repoRoot, DEPS_FILENAME);
  if (!existsSync(path)) return;
  const text = readText(path);
  const span = edgeSpan(text, packageId);
  if (span === null) {
    throw new ResolutionError(
      `could not find the ${packageId} edge in ${DEPS_FILENAME} to set its ` +
        "resolve mode, so the declaration and the build file would disagree.",
    );
  }
  const body = text.slice(span[0], span[1]);
  const match = /"resolve"\s*:\s*"[^"]*"/.exec(body);
  if (match === null || match.index === undefined) {
    throw new ResolutionError(
      `the ${packageId} edge in ${DEPS_FILENAME} states no resolve mode to set.`,
    );
  }
  const updated =
    text.slice(0, span[0]) +
    body.slice(0, match.index) +
    `"resolve": "${mode}"` +
    body.slice(match.index + match[0].length) +
    text.slice(span[1]);
  // Exactly one edge moved, or nothing does. A search that ran from an id to
  // the next `resolve` token mutates a LATER edge whenever a declaration
  // orders its keys the other way round.
  const before = countResolves(text, mode);
  const after = countResolves(updated, mode);
  if (after !== before + 1 && before !== after) {
    throw new ResolutionError(
      `setting resolve: ${mode} on ${packageId} would have changed ` +
        `${after - before} edges in ${DEPS_FILENAME}.`,
    );
  }
  writeText(path, updated);
}

/** The `{ ... }` bounds of the consumes entry naming this package. */
function edgeSpan(text: string, packageId: string): readonly [number, number] | null {
  const marker = new RegExp(`"id"\\s*:\\s*"${escapeForRegExp(packageId)}"`).exec(text);
  if (marker === null) return null;
  const start = text.lastIndexOf("{", marker.index);
  if (start < 0) return null;
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === "{") depth += 1;
    else if (text[index] === "}") {
      depth -= 1;
      if (depth === 0) return [start, index + 1] as const;
    }
  }
  return null;
}

function countResolves(text: string, mode: string): number {
  return (text.match(new RegExp(`"resolve"\\s*:\\s*"${mode}"`, "g")) ?? []).length;
}

/** The one `PackageReference` element for a package, and the file holding it. */
function locateReference(
  repoRoot: string,
  packageId: string,
): { readonly path: string; readonly text: string; readonly element: string } {
  const found: Array<{ path: string; text: string; element: string }> = [];
  for (const path of buildFilesIn(repoRoot)) {
    if (!path.endsWith(".csproj")) continue;
    const text = readText(path);
    for (const match of text.matchAll(/<PackageReference\s[^>]*\/>/g)) {
      if (!new RegExp(`Include\\s*=\\s*["']${escapeForRegExp(packageId)}["']`).test(match[0])) {
        continue;
      }
      found.push({ path, text, element: match[0] });
    }
  }
  if (found.length === 1) return found[0];
  if (found.length === 0) {
    throw new ResolutionError(`no build file in this repository references ${packageId}`);
  }
  throw new ResolutionError(
    `${found.length} build files reference ${packageId}; switching one and ` +
      "leaving the others would build half against source",
  );
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --- Writing a feed declaration, as the execution of an answer ------------------

/**
 * Add one package source to THIS repository's NuGet.config.
 *
 * Repository-scoped and nothing else. Machine-global configuration belongs to
 * the person whose machine it is, and a framework that edited it would be
 * changing how every other project on that machine restores. No credential is
 * written either: a source that needs one names it, and the credential stays
 * where the operator put it.
 *
 * Called only to execute an answered decision -- the caller has the answer
 * before this runs, and this does not ask.
 */
export function declareFeed(
  repoRoot: string,
  options: { readonly key: string; readonly value: string },
): string {
  const path = join(repoRoot, NUGET_CONFIG_FILENAME);
  const entry = `    <add key="${options.key}" value="${options.value}" />`;
  if (!existsSync(path)) {
    writeText(
      path,
      [
        '<?xml version="1.0" encoding="utf-8"?>',
        "<configuration>",
        "  <packageSources>",
        entry,
        "  </packageSources>",
        "</configuration>",
        "",
      ].join("\n"),
    );
    return path;
  }
  const text = readText(path);
  if (new RegExp(`key\\s*=\\s*["']${escapeForRegExp(options.key)}["']`).test(text)) {
    throw new ResolutionError(
      `${NUGET_CONFIG_FILENAME} already declares a source named '${options.key}'`,
    );
  }
  if (!text.includes("<packageSources>")) {
    throw new ResolutionError(
      `${NUGET_CONFIG_FILENAME} has no <packageSources> section to add to`,
    );
  }
  writeText(path, text.replace("<packageSources>", `<packageSources>\n${entry}`));
  return path;
}

/** Local directories beside this checkout that look like a package source. */
export function localSourceCandidates(repoRoot: string): string[] {
  const out: string[] = [];
  for (const at of [repoRoot, resolve(repoRoot, "..")]) {
    let entries: string[];
    try {
      entries = readdirSync(at);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!/packages?$|feed$|artifacts?$/i.test(entry)) continue;
      out.push(join(at, entry));
    }
  }
  return out.sort();
}

/** The edge a feed question is about, for the brief that asks it. */
export type FeedQuestion = Pick<Edge, "id" | "feed">;

export { UNREADABLE_ID };
