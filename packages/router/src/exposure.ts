// The exposure manifest: what a module session's working directory holds of
// its siblings, and why.
//
// The focused checkout's promise is that a sibling is present as its package
// and its contract folder and never as source. This is the record that says
// whether the promise held: for every sibling, the implementation bytes
// under its `codeRoots` in the working directory (target zero); the grants
// in force, each with the reason somebody gave; and the files the session
// changed outside its own scope. Written at `session start`, so the session
// begins with a measured wall, and again at the close, so the record says
// what the session did to it. A single-module solution has no siblings and
// gets no manifest.
//
// Grants are append-only rows in `grants.jsonl` beside the manifest -- a
// request, then the operator's grant or denial, then the revoke -- and the
// grants in force are folded from them, never edited in place.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

import { inScope, moduleScope } from "./agency.ts";
import { checkoutCone, contractDir } from "./checkout.ts";
import { loadConfig } from "./config.ts";
import { EcosystemError, layDebugGrants, walkFiles } from "./ecosystem.ts";
import { sessionsDirFor } from "./evidence.ts";
import { atomicWriteJson, nowIso, runGit } from "./journal.ts";
import { sessionRunDir } from "./ledger.ts";
import { type ModuleEntry, type SolutionShape, moduleConfigs } from "./modules.ts";
import { CLASS_VALUE_TRADEOFF, EVENT_ANSWERED, foldOwed, raiseOwed, readOwed } from "./owedDecisions.ts";

export class ExposureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExposureError";
  }
}

export const EXPOSURE_FILENAME = "exposure.json";
export const GRANTS_FILENAME = "grants.jsonl";

export type GrantEvent = "requested" | "granted" | "denied" | "revoked";

/** One row of `grants.jsonl`. */
export interface GrantRow {
  readonly event: GrantEvent;
  readonly sibling: string;
  readonly reason: string;
  /** Whether the grant lays the debugging overlay (sibling as a project reference). */
  readonly debug: boolean;
  readonly at: string;
  /** The owed decision the row belongs to. */
  readonly decision: string;
}

export interface SiblingExposure {
  readonly slug: string;
  /** Implementation bytes under the sibling's roots, its contract folder excluded. */
  readonly bytes: number;
  readonly files: readonly string[];
}

export interface GrantInForce {
  readonly sibling: string;
  readonly reason: string;
  readonly debug: boolean;
  readonly grantedAt: string;
}

export type ExposurePhase = "start" | "close";

export interface ExposureManifest {
  readonly schema_version: 1;
  readonly session: number;
  readonly modules: readonly string[];
  readonly phase: ExposurePhase;
  readonly writtenAt: string;
  readonly siblings: readonly SiblingExposure[];
  readonly grants: readonly GrantInForce[];
  /** The session's changed paths that its scope does not cover. */
  readonly outsideScope: readonly string[];
}

export function exposurePath(root: string, session: number): string {
  return join(sessionRunDir(root, session), EXPOSURE_FILENAME);
}

export function grantsPath(root: string, session: number): string {
  return join(sessionRunDir(root, session), GRANTS_FILENAME);
}

/**
 * The id of the owed decision a grant of `sibling` is answered through. An
 * answered decision is settled for good, so a second request for the same
 * sibling -- after a revoke, say -- is a new question with its own number.
 */
export function grantDecisionId(sibling: string, sequence = 1): string {
  return sequence <= 1 ? `module-grant:${sibling}` : `module-grant:${sibling}:${sequence}`;
}

export const GRANT_DECISION_PREFIX = "module-grant:";
export const GRANT = "grant";
export const DENY = "deny";

function posix(path: string): string {
  return path.split("\\").join("/");
}

/** Every grant row of the session, in the order written; none where there is no file. */
export function readGrants(root: string, session: number): GrantRow[] {
  const path = grantsPath(root, session);
  if (!existsSync(path)) return [];
  const rows: GrantRow[] = [];
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (line.trim() === "") continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        rows.push(parsed as GrantRow);
      }
    } catch {
      // A torn line is not a row; the rows around it still are.
    }
  }
  return rows;
}

/** Append one row, stamped now. */
export function appendGrant(root: string, session: number, row: Omit<GrantRow, "at">): GrantRow {
  const path = grantsPath(root, session);
  mkdirSync(sessionRunDir(root, session), { recursive: true });
  const stamped: GrantRow = { ...row, at: nowIso("seconds") };
  writeFileSync(path, `${JSON.stringify(stamped)}\n`, { encoding: "utf8", flag: "a" });
  return stamped;
}

/**
 * The grants standing after every row is applied in order: a `granted` row
 * puts its sibling in force, a `revoked` row takes it out, and a request or
 * a denial changes nothing about what the checkout holds.
 */
export function grantsInForce(rows: readonly GrantRow[]): GrantInForce[] {
  const standing = new Map<string, GrantInForce>();
  for (const row of rows) {
    if (row.event === "granted") {
      standing.set(row.sibling, {
        sibling: row.sibling,
        reason: row.reason,
        debug: row.debug === true,
        grantedAt: row.at,
      });
    } else if (row.event === "revoked") {
      standing.delete(row.sibling);
    }
  }
  return [...standing.values()];
}

/**
 * For every module the session does not name, the implementation bytes its
 * roots hold in the working directory. The contract folder is a sibling's
 * promise and is meant to be there; everything else under its roots is
 * exposure. Build output is not counted, because it is not source.
 */
export function siblingBytes(
  root: string,
  shape: SolutionShape,
  slugs: readonly string[],
): SiblingExposure[] {
  const named = new Set(slugs);
  const out: SiblingExposure[] = [];
  for (const entry of shape.modules) {
    if (named.has(entry.slug)) continue;
    const contract = `${contractDir(entry.slug)}/`;
    const files = new Set<string>();
    let bytes = 0;
    for (const codeRoot of entry.codeRoots.length > 0 ? entry.codeRoots : ["."]) {
      for (const file of walkFiles(join(root, codeRoot))) {
        const rel = posix(relative(root, file));
        if (rel.startsWith(contract) || files.has(rel)) continue;
        files.add(rel);
        try {
          bytes += statSync(file).size;
        } catch {
          // Gone between the walk and the stat: not bytes on disk.
        }
      }
    }
    out.push({ slug: entry.slug, bytes, files: [...files].sort() });
  }
  return out;
}

export interface ExposureInput {
  readonly modules: readonly string[];
  readonly phase: ExposurePhase;
  /** The session's scope, as the verifier is given it. */
  readonly scope: readonly string[];
  /** The paths the session changed; empty at the start. */
  readonly changedPaths?: readonly string[];
}

/**
 * Write the manifest for a session of a multi-module solution and return it;
 * a single-module shape has no siblings, writes nothing and answers null.
 */
export function writeExposure(
  root: string,
  shape: SolutionShape,
  session: number,
  input: ExposureInput,
): ExposureManifest | null {
  if (!shape.multi) return null;
  const manifest: ExposureManifest = {
    schema_version: 1,
    session,
    modules: [...input.modules],
    phase: input.phase,
    writtenAt: nowIso("seconds"),
    siblings: siblingBytes(root, shape, input.modules),
    grants: grantsInForce(readGrants(root, session)),
    outsideScope: (input.changedPaths ?? [])
      .map(posix)
      .filter((path) => !inScope(input.scope, path))
      .sort(),
  };
  mkdirSync(sessionRunDir(root, session), { recursive: true });
  atomicWriteJson(exposurePath(root, session), manifest);
  return manifest;
}

/** The manifest as written, or null where the session has none. */
export function readExposure(root: string, session: number): ExposureManifest | null {
  const path = exposurePath(root, session);
  if (!existsSync(path)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as ExposureManifest;
    }
  } catch {
    // Unreadable is absent: the manifest is derived state, rewritten at the next phase.
  }
  return null;
}

// --- Grants --------------------------------------------------------------------

function entryOf(shape: SolutionShape, sibling: string): ModuleEntry {
  const entry = shape.modules.find((module) => module.slug === sibling);
  if (entry === undefined) throw new ExposureError(`docs/modules.yaml declares no module '${sibling}'`);
  return entry;
}

function rootsOf(entry: ModuleEntry): string[] {
  return (entry.codeRoots.length > 0 ? entry.codeRoots : ["."]).map(posix);
}

/** The session's own modules, from the manifest its start wrote. */
function modulesOfSession(root: string, session: number): string[] {
  const manifest = readExposure(root, session);
  if (manifest === null) {
    throw new ExposureError(
      `session ${session} has no exposure manifest here: a grant belongs to a session ` +
        "started with --module, in its focused checkout",
    );
  }
  return [...manifest.modules];
}

function sharedFilesOf(root: string, shape: SolutionShape): Map<string, readonly string[]> {
  return new Map(
    [...moduleConfigs(loadConfig(undefined, root), shape.modules).values()].map((module) => [
      module.slug,
      module.sharedFiles,
    ]),
  );
}

/** The manifest rewritten in place -- same modules, same phase -- after the cone moved. */
function refreshExposure(root: string, shape: SolutionShape, session: number): ExposureManifest | null {
  const existing = readExposure(root, session);
  const modules = existing?.modules ?? [];
  return writeExposure(root, shape, session, {
    modules,
    phase: existing?.phase ?? "start",
    scope: moduleScope(root, sessionsDirFor(root), shape, modules, sharedFilesOf(root, shape)),
    changedPaths: existing?.outsideScope ?? [],
  });
}

/** How a debugging grant rebuilds a sibling from source: the seam's to say, given a pack. */
export type GrantPack = (slug: string) => void;

/**
 * What the debugging grants in force do to this clone, through the seam:
 * .NET lays (or removes) the untracked overlay the tracked targets import;
 * Maven rebuilds the sibling just granted into the file repository with
 * the pack handed in, and refuses when none was.
 */
function layGrants(root: string, shape: SolutionShape, grants: readonly GrantInForce[], granted: string | null, pack: GrantPack | null): void {
  const debugging = grants.filter((grant) => grant.debug).map((grant) => entryOf(shape, grant.sibling));
  try {
    layDebugGrants(root, shape, debugging, granted === null ? null : entryOf(shape, granted), pack);
  } catch (error) {
    if (error instanceof EcosystemError) throw new ExposureError(error.message);
    throw error;
  }
}

/**
 * Ask the operator to widen the session's checkout to a sibling's source.
 *
 * An owed decision with `deny` recommended: the wall is the design, and a
 * grant is the exception somebody signs for. The request is recorded even
 * before it is answered, so the manifest can say a grant was asked for.
 */
export function raiseGrantDecision(
  root: string,
  shape: SolutionShape,
  session: number,
  sibling: string,
  reason: string,
  debug: boolean,
): string {
  entryOf(shape, sibling);
  const modules = modulesOfSession(root, session);
  if (modules.includes(sibling)) {
    throw new ExposureError(`module '${sibling}' is this session's own; its source is already here`);
  }
  if (reason.trim() === "") throw new ExposureError("a grant needs a reason (--reason); it is recorded");
  const decision = grantDecisionId(sibling, nextGrantSequence(readGrants(root, session), sibling));
  raiseOwed(root, {
    id: decision,
    decisionClass: CLASS_VALUE_TRADEOFF,
    question:
      `Widen session ${session}'s focused checkout to module '${sibling}'s source` +
      `${debug ? ", built as a project reference" : ""}?`,
    determined:
      `Session ${session} works in module ${modules.map((slug) => `'${slug}'`).join(", ")}'s focused ` +
      `checkout, where '${sibling}' is present as its package and its contract folder and never ` +
      `as source. The engine asked for its source: ${reason.trim()}. A grant fetches the sibling's ` +
      "blobs into this clone's object store, which only discarding the clone undoes; the exposure " +
      "manifest records the grant and the bytes it exposes.",
    options: [
      {
        label: GRANT,
        consequence:
          `The cone widens to ${rootsOf(entryOf(shape, sibling)).join(", ")}` +
          (debug
            ? ", and an untracked overlay makes the sibling a project reference for this clone"
            : "") +
          ". Recorded in the exposure manifest with this reason.",
      },
      {
        label: DENY,
        consequence: "The cone stays narrow; the session works against the sibling's package and contract.",
      },
    ],
    recommendation: DENY,
    confidence: "medium",
    onNoAnswer: "The cone stays narrow: the session proceeds against the sibling's package and contract.",
    sessionNumber: session,
  });
  appendGrant(root, session, { event: "requested", sibling, reason: reason.trim(), debug, decision });
  return decision;
}

/** One past the requests already made for this sibling in this session. */
export function nextGrantSequence(rows: readonly GrantRow[], sibling: string): number {
  return rows.filter((row) => row.event === "requested" && row.sibling === sibling).length + 1;
}

/**
 * Widen the clone to the sibling's roots, lay the overlay when the grant is
 * a debugging one, record the grant and rewrite the manifest. The framework
 * does this on the operator's `grant`, never on the request.
 */
export function applyGrant(
  root: string,
  shape: SolutionShape,
  session: number,
  sibling: string,
  options: { readonly reason: string; readonly debug: boolean; readonly decision: string; readonly pack?: GrantPack | null },
): GrantInForce {
  const entry = entryOf(shape, sibling);
  const widened = runGit(root, ["sparse-checkout", "add", ...rootsOf(entry)]);
  if (widened.code !== 0) {
    throw new ExposureError(`widening the cone to ${rootsOf(entry).join(", ")} failed: ${widened.stderr}`);
  }
  const row = appendGrant(root, session, {
    event: "granted",
    sibling,
    reason: options.reason,
    debug: options.debug,
    decision: options.decision,
  });
  layGrants(root, shape, grantsInForce(readGrants(root, session)), sibling, options.pack ?? null);
  refreshExposure(root, shape, session);
  return { sibling, reason: row.reason, debug: row.debug, grantedAt: row.at };
}

/**
 * Narrow the clone again: refused while the sibling's roots hold changes,
 * because a revoke discards what is on disk under them. The overlay loses
 * the sibling's block, the cone goes back to the derived one plus the other
 * grants in force, and the manifest says so.
 */
export function revokeGrant(root: string, shape: SolutionShape, session: number, sibling: string): void {
  const entry = entryOf(shape, sibling);
  const rows = readGrants(root, session);
  const standing = grantsInForce(rows).find((grant) => grant.sibling === sibling);
  if (standing === undefined) throw new ExposureError(`no grant of module '${sibling}' is in force`);
  const status = runGit(root, ["status", "--porcelain", "--", ...rootsOf(entry)]);
  if (status.code === 0 && status.stdout.trim() !== "") {
    const changed = status.stdout
      .split("\n")
      .map((line) => line.slice(3).trim())
      .filter((line) => line !== "");
    throw new ExposureError(
      `module '${sibling}'s roots hold ${changed.length} change(s) (${changed.slice(0, 3).join(", ")}); ` +
        "a revoke discards what is under them, so commit those changes in the sibling's own session " +
        "or discard them first",
    );
  }
  appendGrant(root, session, {
    event: "revoked",
    sibling,
    reason: standing.reason,
    debug: standing.debug,
    decision: rows.findLast((row) => row.event === "granted" && row.sibling === sibling)?.decision ?? "",
  });
  const remaining = grantsInForce(readGrants(root, session));
  layGrants(root, shape, remaining, null, null);
  const modules = modulesOfSession(root, session);
  const cone = new Set<string>();
  for (const slug of modules) {
    for (const dir of checkoutCone(shape, slug, sharedFilesOf(root, shape).get(slug) ?? [])) cone.add(dir);
  }
  for (const grant of remaining) for (const dir of rootsOf(entryOf(shape, grant.sibling))) cone.add(dir);
  const narrowed = runGit(root, ["sparse-checkout", "set", "--cone", ...[...cone].sort()]);
  if (narrowed.code !== 0) throw new ExposureError(`narrowing the cone failed: ${narrowed.stderr}`);
  refreshExposure(root, shape, session);
}

export interface GrantSettlement {
  readonly applied: readonly GrantInForce[];
  readonly denied: readonly string[];
  /** Decisions still waiting on the operator. */
  readonly open: readonly string[];
}

/**
 * Act on what the operator has answered since the last look: a request
 * answered `grant` is applied, one answered `deny` is recorded, and one not
 * answered yet is reported open. Idempotent: a request already settled is
 * left alone.
 */
export function settleAnsweredGrants(root: string, shape: SolutionShape, session: number, pack: GrantPack | null = null): GrantSettlement {
  const rows = readGrants(root, session);
  const decisions = foldOwed(readOwed(root));
  const settled = new Set(
    rows.filter((row) => row.event !== "requested").map((row) => row.decision),
  );
  const applied: GrantInForce[] = [];
  const denied: string[] = [];
  const open: string[] = [];
  for (const request of rows.filter((row) => row.event === "requested")) {
    if (settled.has(request.decision)) continue;
    const current = decisions.get(request.decision);
    if (current === undefined || current["event"] !== EVENT_ANSWERED) {
      open.push(request.decision);
      continue;
    }
    if (String(current["answer"] ?? "") === GRANT) {
      applied.push(
        applyGrant(root, shape, session, request.sibling, {
          reason: request.reason,
          debug: request.debug,
          decision: request.decision,
          pack,
        }),
      );
    } else {
      appendGrant(root, session, {
        event: "denied",
        sibling: request.sibling,
        reason: request.reason,
        debug: request.debug,
        decision: request.decision,
      });
      denied.push(request.decision);
    }
  }
  return { applied, denied, open };
}
