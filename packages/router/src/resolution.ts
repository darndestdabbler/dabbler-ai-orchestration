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
 * The version a repository's own build files say they produce.
 *
 * Read from the producer's manifest, which is where it is authored, rather
 * than from a feed: asking a feed is a network call, and the question worth
 * answering here -- "is this consumer behind the producer?" -- is answered by
 * the two files that are already open.
 *
 * Null when the manifest reaches its version through something only the build
 * tool resolves. Unknown is reported as unknown; a false "you are behind" is
 * worse than a missing one, because someone upgrades on it.
 */
export function publishedVersion(memberRoot: string): string | null {
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
    const version = childText(elements, project, "Version") ?? childText(elements, project, "version");
    if (version && !/\$[({]/.test(version)) return version;
    // A .csproj states its version inside a PropertyGroup rather than on the
    // Project element, which is one level further in.
    for (const group of elements) {
      if (group.name !== "PropertyGroup") continue;
      const inner = childText(elements, group, "Version");
      if (inner && !/\$[({]/.test(inner)) return inner;
    }
  }
  return null;
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
 * Every package source this machine has configured, nearest first.
 *
 * Read from the repository outward and then from the user profile, which is
 * NuGet's own precedence. Reading is not writing: the user-level file is
 * inspected so the framework can tell the operator what is already there,
 * and it is never edited.
 */
export function configuredFeeds(repoRoot: string, home?: string): Feed[] {
  const files: string[] = [];
  let at = resolve(repoRoot);
  for (;;) {
    for (const name of [NUGET_CONFIG_FILENAME, "nuget.config", "NuGet.Config"]) {
      const path = join(at, name);
      if (existsSync(path) && !files.includes(path)) files.push(path);
    }
    const up = dirname(at);
    if (up === at) break;
    at = up;
  }
  const profile = home ?? process.env["APPDATA"] ?? "";
  if (profile) {
    for (const name of ["NuGet.Config", "NuGet.config"]) {
      const path = join(profile, "NuGet", name);
      if (existsSync(path) && !files.includes(path)) files.push(path);
    }
  }

  const feeds: Feed[] = [];
  const disabled = new Set<string>();
  for (const file of files) {
    let elements;
    try {
      elements = readXmlElements(readText(file));
    } catch {
      // A configuration file that does not parse is reported through the
      // reconciliation, not thrown here: a broken NuGet.config elsewhere on
      // the machine must not stop a dependency check.
      feeds.push({
        key: "(unreadable)",
        value: file,
        enabled: false,
        file,
        unusable: `${file} is not readable as XML`,
      });
      continue;
    }
    for (const element of elements) {
      if (element.name !== "add") continue;
      const key = element.attributes["key"];
      const value = element.attributes["value"];
      if (!key || value === undefined) continue;
      if (element.path.includes("disabledPackageSources")) {
        disabled.add(key);
        continue;
      }
      if (!element.path.includes("packageSources")) continue;
      if (feeds.some((feed) => feed.key === key)) continue;
      feeds.push({ key, value, enabled: true, file, unusable: "" });
    }
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

// --- The two reconciliations this session adds --------------------------------

/**
 * Where the pin is behind the producer, and where a named feed serves nothing.
 *
 * Both cost the same kind of time and neither is derivable from one
 * repository: the first needs the producer's manifest, the second needs this
 * machine's configuration. Reported, never repaired -- a pin held back
 * deliberately is a legitimate reading of the first, and the second is
 * answered by a decision, not by a tool editing configuration on a guess.
 */
export function reconcileResolution(
  members: readonly SolutionMember[],
  feeds: readonly Feed[],
): Reconciliation[] {
  const out: Reconciliation[] = [];
  const self = members[0];
  const publishedBy = new Map<string, string>();
  for (const member of members.slice(1)) {
    if (member.root === null || member.duplicateOf !== null) continue;
    const version = publishedVersion(member.root);
    if (version !== null) publishedBy.set(member.id, version);
  }

  for (const edge of self?.deps?.consumes ?? []) {
    const published = publishedBy.get(edge.producedBy.id);
    const pins = (self?.refs ?? []).filter(
      (ref) => ref.id === edge.id && ref.version !== null,
    );
    for (const ref of pins) {
      if (published === undefined || ref.version === null) continue;
      const order = comparePins(ref.version, published);
      if (order === null || order >= 0) continue;
      out.push({
        kind: "behind-producer",
        id: edge.id,
        detail:
          `${ref.file} pins ${edge.id} at ${ref.version}, and ` +
          `${edge.producedBy.id} builds ${published}. Either the upgrade has ` +
          "not been done or the pin is held back on purpose; which of those " +
          "is true is not derivable from here.",
      });
    }

    if (edge.resolve === "source" || !edge.feed) continue;
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
): string | null {
  if (repoRoot === null) return null;
  const swaps = sourceModeActive(repoRoot);
  return swaps.length === 0 ? null : sourceModeRefusal(swaps, what);
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
 * The original element is recorded BEFORE the file is touched, together with
 * the digest of the file it came out of. That ordering is the whole safety
 * property: a crash between the record and the write leaves a record of a
 * swap that did not happen, which the restore reports and corrects, whereas
 * the other order would leave an edited file nothing knows about.
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
  const original = found.element;
  const relPath = relative(repoRoot, found.path).replace(/\\/g, "/");
  const swap: SourceSwap = {
    packageId: options.packageId,
    file: relPath,
    originalElement: original,
    originalDigest: digestOf(found.text),
    producerProject: project.path,
    switchedAt: nowIso("microseconds"),
    restoredAt: null,
  };
  appendSwap(repoRoot, swap);

  const target = relative(dirname(found.path), project.path).replace(/\//g, "\\");
  const replacement = `<ProjectReference Include="${target}" />`;
  writeText(found.path, found.text.replace(original, replacement));
  return swap;
}

/**
 * Put the reference back exactly, and say so only if it IS exact.
 *
 * The check is the point. A restore that reported success on a file it had
 * half-repaired would leave a repository building against a sibling checkout
 * while every gate believed it was not, which is the one state this whole
 * mechanism exists to make impossible.
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
  if (text.includes(swap.originalElement)) {
    const closed = { ...swap, restoredAt: nowIso("microseconds") };
    appendSwap(repoRoot, closed);
    return closed;
  }
  const swapped = /<ProjectReference\s[^>]*\/>/g;
  let restored: string | null = null;
  for (const match of text.matchAll(swapped)) {
    const candidate = text.replace(match[0], swap.originalElement);
    if (digestOf(candidate) === swap.originalDigest) {
      restored = candidate;
      break;
    }
  }
  if (restored === null) {
    throw new ResolutionError(
      `${swap.file} has changed since ${packageId} was switched to source, so ` +
        "putting the original reference back would not restore the file " +
        `exactly. It was: ${swap.originalElement}`,
    );
  }
  writeText(path, restored);
  const closed = { ...swap, restoredAt: nowIso("microseconds") };
  appendSwap(repoRoot, closed);
  return closed;
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
