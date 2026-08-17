// Workspace discovery and the session-set scan.
//
// The scan's job is assembly, not derivation: per-set display state comes
// from the Python projection (utils/projection.ts); this module discovers
// roots and set directories, parses the few spec-level grouping
// attributes the tree needs (module, kind, prerequisites), validates them
// against docs/modules.yaml, and merges cross-root duplicates (a main
// checkout and its worktrees legitimately carry copies of one set).

import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import * as YAML from "yaml";
import {
  DuplicateNameCollision,
  ModuleManifestEntry,
  SessionSet,
  SessionSetConfig,
  SessionSetKind,
  SessionSetPrerequisite,
  SessionState,
  UnsatisfiedPrerequisite,
} from "../types";
import { ProjectionCache, ProjectionResult, projectAll } from "./projection";
import { resolvePythonInterpreter } from "./pythonInterpreter";

export const SESSION_SETS_REL = path.join("docs", "session-sets");
export const MODULES_MANIFEST_REL = path.join("docs", "modules.yaml");

/**
 * Directory basenames directly under docs/session-sets, `_`-prefixed
 * dirs skipped — mirrors the Python resolver's listing rule.
 */
export function listSessionSetDirNames(root: string): string[] {
  const dir = path.join(root, SESSION_SETS_REL);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
    .map((e) => e.name)
    .sort();
}

export function listGitWorktrees(cwd: string): string[] {
  let out: string;
  try {
    out = cp.execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      timeout: 5000,
    });
  } catch {
    return [];
  }
  const paths: string[] = [];
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      const wt = line.slice("worktree ".length).trim();
      if (wt) paths.push(path.resolve(wt));
    }
  }
  return paths;
}

// Cancelled sorts lowest so a set present in two roots (one cancelled,
// one active) prefers the active copy when dedup-merging.
const STATE_RANK: Record<SessionState, number> = {
  complete: 3,
  "in-progress": 2,
  "not-started": 1,
  cancelled: 0,
};

/**
 * One discovered root plus the identity of the git repository ("family")
 * it belongs to: a workspace folder and every worktree it enumerates
 * share one familyId (the realpath of the repo's main worktree). The
 * familyId lets the duplicate-name check tell the legitimate cross-root
 * merge apart from a true collision (two different repos, one name).
 */
export interface DiscoveredRoot {
  dir: string;
  familyId: string;
}

export function discoverRootsWithFamilies(): DiscoveredRoot[] {
  const seen = new Map<string, string>();
  const order: DiscoveredRoot[] = [];
  // Dedup on the filesystem's own canonical form: realpath collapses
  // case variants only where the volume is case-insensitive, and
  // resolves symlinked duplicates as a bonus.
  const canonicalKey = (p: string): string => {
    try {
      return fs.realpathSync.native(p);
    } catch {
      return p;
    }
  };
  const add = (p: string | undefined, familyId: string) => {
    if (!p) return;
    const canonical = path.resolve(p);
    const key = canonicalKey(canonical);
    if (seen.has(key) || !fs.existsSync(canonical)) return;
    seen.set(key, canonical);
    order.push({ dir: canonical, familyId });
  };
  const folders = (vscode.workspace.workspaceFolders ?? []).map((f) => {
    const folderPath = path.resolve(f.uri.fsPath);
    const worktrees = listGitWorktrees(folderPath);
    // Main worktree first per `git worktree list` contract; a non-git
    // folder (empty list) is its own single-member family.
    const familyId = canonicalKey(
      worktrees.length > 0 ? worktrees[0] : folderPath,
    );
    return { folderPath, worktrees, familyId };
  });
  for (const f of folders) add(f.folderPath, f.familyId);
  for (const f of folders) {
    for (const wt of f.worktrees) add(wt, f.familyId);
  }
  return order;
}

export function discoverRoots(): string[] {
  return discoverRootsWithFamilies().map((r) => r.dir);
}

const QUOTED_SCALAR = (key: string) =>
  new RegExp(
    `^\\s*${key}\\s*:\\s*(?:"([\\w-]+)"|'([\\w-]+)'|([\\w-]+))\\s*(?:#.*)?$`,
    "im",
  );

/**
 * Parse the spec's `Session Set Configuration` YAML block for the two
 * grouping attributes the tree reads. Raw capture only; validation
 * against docs/modules.yaml lives in the scan.
 */
export function parseSessionSetConfig(specPath: string): SessionSetConfig {
  const config: SessionSetConfig = { module: null };
  let text: string;
  try {
    text = fs.readFileSync(specPath, "utf8");
  } catch {
    return config;
  }
  const headingMatch = text.match(
    /##\s*Session Set Configuration[\s\S]*?```ya?ml\s*([\s\S]*?)```/i,
  );
  const block = headingMatch ? headingMatch[1] : text;
  const value = (m: RegExpMatchArray | null): string | null =>
    m ? (m[1] ?? m[2] ?? m[3] ?? null) : null;
  const mod = value(block.match(QUOTED_SCALAR("module")));
  if (mod) config.module = mod;
  const kd = value(block.match(QUOTED_SCALAR("kind")));
  if (kd) config.kind = kd;
  return config;
}

/**
 * Parse the optional `prerequisites:` list from the spec's configuration
 * block. Null when absent; [] when declared empty. Entries missing a
 * slug are dropped; a present-but-unknown condition drops the entry (an
 * absent condition defaults to "complete").
 */
export function parsePrerequisites(
  specPath: string,
): SessionSetPrerequisite[] | null {
  let text: string;
  try {
    text = fs.readFileSync(specPath, "utf8");
  } catch {
    return null;
  }
  const headingMatch = text.match(
    /##\s*Session Set Configuration[\s\S]*?```ya?ml\s*([\s\S]*?)```/i,
  );
  const block = headingMatch ? headingMatch[1] : text;
  const keyRe = /^\s*prerequisites\s*:(.*)$/im;
  const keyMatch = block.match(keyRe);
  if (!keyMatch) return null;
  if (keyMatch[1].trim() === "[]") return [];
  const keyIndex = block.search(keyRe);
  if (keyIndex < 0) return null;
  const after = block.slice(keyIndex + keyMatch[0].length);
  const bodyLines: string[] = [];
  for (const line of after.split(/\r?\n/)) {
    if (line.trim() === "") {
      bodyLines.push(line);
      continue;
    }
    if (!/^\s/.test(line)) break; // next top-level key
    bodyLines.push(line);
  }
  const chunks = bodyLines.join("\n").split(/\r?\n[ \t]*-[ \t]+/);
  const out: SessionSetPrerequisite[] = [];
  // A `#` mid-value needs preceding whitespace to start a YAML comment.
  const stripComment = (s: string): string => s.replace(/\s+#.*$/, "").trim();
  for (const chunk of chunks.slice(1)) {
    const slugLine = chunk.match(/^\s*slug\s*:\s*(.+)$/im);
    if (!slugLine) continue;
    const slug = stripComment(slugLine[1]);
    if (!slug) continue;
    const condLine = chunk.match(/^\s*condition\s*:\s*(.*)$/im);
    if (condLine && stripComment(condLine[1]) !== "complete") continue;
    out.push({ slug, condition: "complete" });
  }
  return out;
}

/**
 * Read docs/modules.yaml for one root. Null when absent, unreadable, or
 * not a mapping with a `modules:` list (the single-implicit-module
 * case); a bare `modules:` key is a valid empty manifest. Entries in
 * file order — the Explorer's module display order.
 */
export function readModulesManifest(root: string): ModuleManifestEntry[] | null {
  const manifestPath = path.join(root, MODULES_MANIFEST_REL);
  let text: string;
  try {
    text = fs.readFileSync(manifestPath, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      let entryExists = false;
      try {
        fs.lstatSync(manifestPath); // succeeds for a dangling symlink
        entryExists = true;
      } catch {
        // truly absent — the designed no-manifest fallback, silent
      }
      if (!entryExists) return null;
    }
    console.warn(
      `[dabblerSessionSets] ${manifestPath} exists but could not be read — ` +
        `falling back to the single implicit module.`,
    );
    return null;
  }
  let doc: unknown;
  try {
    doc = YAML.parse(text);
  } catch {
    console.warn(
      `[dabblerSessionSets] ${manifestPath} is not valid YAML — ` +
        `falling back to the single implicit module.`,
    );
    return null;
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
    console.warn(
      `[dabblerSessionSets] ${manifestPath} is not a YAML mapping — ` +
        `falling back to the single implicit module.`,
    );
    return null;
  }
  const rawModules = (doc as Record<string, unknown>).modules;
  if (rawModules === null) return [];
  if (!Array.isArray(rawModules)) {
    console.warn(
      `[dabblerSessionSets] ${manifestPath} has no "modules:" list — ` +
        `falling back to the single implicit module.`,
    );
    return null;
  }
  const stringList = (v: unknown): string[] =>
    Array.isArray(v)
      ? v
          .filter((x): x is string => typeof x === "string" && x.trim() !== "")
          .map((s) => s.trim())
      : [];
  const out: ModuleManifestEntry[] = [];
  const seen = new Set<string>();
  for (const raw of rawModules) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const obj = raw as Record<string, unknown>;
    const slug = typeof obj.slug === "string" ? obj.slug.trim() : "";
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push({
      slug,
      title:
        typeof obj.title === "string" && obj.title.trim() !== ""
          ? obj.title.trim()
          : slug,
      codeRoots: stringList(obj.codeRoots),
      planPath:
        typeof obj.planPath === "string" && obj.planPath.trim() !== ""
          ? obj.planPath.trim()
          : null,
      touches: stringList(obj.touches),
    });
  }
  return out;
}

const KNOWN_KINDS: ReadonlySet<string> = new Set(["plan", "decomposition"]);

/** Newest artifact mtime in the set dir, for bucket ordering. */
function lastTouchedOf(setDir: string): string | null {
  let newest = 0;
  let entries: string[];
  try {
    entries = fs.readdirSync(setDir);
  } catch {
    return null;
  }
  for (const name of entries) {
    try {
      const st = fs.statSync(path.join(setDir, name));
      if (st.isFile() && st.mtimeMs > newest) newest = st.mtimeMs;
    } catch {
      /* raced deletion — skip */
    }
  }
  return newest > 0 ? new Date(newest).toISOString() : null;
}

/**
 * When the projection is unavailable (python missing, ai_router not
 * installed), bucket by file presence — the same rule progress.py
 * applies to a set with no state file. This is the ONE deliberate
 * duplication of a Python rule, taken so a workspace without the router
 * still shows its work; the scan carries the error so the tree can say
 * the rendering is degraded.
 */
export function fallbackState(setDir: string): SessionState {
  if (fs.existsSync(path.join(setDir, "CANCELLED.md"))) return "cancelled";
  if (fs.existsSync(path.join(setDir, "change-log.md"))) return "complete";
  if (fs.existsSync(path.join(setDir, "activity-log.json"))) return "in-progress";
  return "not-started";
}

function buildSessionSet(
  root: string,
  setDir: string,
  manifest: ModuleManifestEntry[] | null,
  projection: ProjectionResult,
): SessionSet {
  const name = path.basename(setDir);
  const specPath = path.join(setDir, "spec.md");
  const config = parseSessionSetConfig(specPath);

  let module: string | null = null;
  let moduleTitle: string | null = null;
  let moduleOrder: number | null = null;
  if (config.module && manifest) {
    const idx = manifest.findIndex((m) => m.slug === config.module);
    if (idx >= 0) {
      module = manifest[idx].slug;
      moduleTitle = manifest[idx].title;
      moduleOrder = idx;
    }
  }
  const kind: SessionSetKind | undefined =
    config.kind && KNOWN_KINDS.has(config.kind)
      ? (config.kind as SessionSetKind)
      : undefined;

  const p = projection.payload;
  return {
    name,
    module,
    moduleTitle,
    moduleOrder,
    ...(kind ? { kind } : {}),
    dir: setDir,
    specPath,
    activityPath: path.join(setDir, "activity-log.json"),
    changeLogPath: path.join(setDir, "change-log.md"),
    statePath: path.join(setDir, "session-state.json"),
    root,
    state: p ? p.set.status : fallbackState(setDir),
    totalSessions: p ? p.set.totalSessions : null,
    sessionsCompleted: p ? p.set.sessionsCompleted : 0,
    currentSession: p ? p.set.currentSession : null,
    verificationVerdict: p ? p.set.verificationVerdict : null,
    forceClosed: p ? p.set.forceClosed : false,
    schemaVersionOnDisk: p ? p.set.schemaVersionOnDisk : null,
    invariantViolation: p ? p.set.invariantViolation : null,
    orchestrator: p ? p.set.orchestrator : null,
    startedAt: p?.sessions.find((s) => s.inFlight)?.startedAt ?? null,
    lastTouched: lastTouchedOf(setDir),
    config,
    prerequisites: parsePrerequisites(specPath),
    blockedByPrereqs: false,
    unsatisfiedPrereqs: [],
    sessions: p ? p.sessions : [],
  };
}

export function deriveBlockedByPrereqs(sets: SessionSet[]): void {
  const setsByName = new Map<string, SessionSet>();
  for (const s of sets) setsByName.set(s.name, s);
  for (const s of sets) {
    if (!s.prerequisites || s.prerequisites.length === 0) {
      s.blockedByPrereqs = false;
      s.unsatisfiedPrereqs = [];
      continue;
    }
    const unsatisfied: UnsatisfiedPrerequisite[] = [];
    for (const prereq of s.prerequisites) {
      const target = setsByName.get(prereq.slug);
      if (!target) {
        unsatisfied.push({
          slug: prereq.slug,
          condition: prereq.condition,
          targetState: "unknown",
        });
        continue;
      }
      if (target.state !== "complete") {
        unsatisfied.push({
          slug: prereq.slug,
          condition: prereq.condition,
          targetState: target.state,
        });
      }
    }
    s.blockedByPrereqs = unsatisfied.length > 0;
    s.unsatisfiedPrereqs = unsatisfied;
  }
}

export interface ScanResult {
  sets: SessionSet[];
  collisions: DuplicateNameCollision[];
  /** One entry per set whose projection failed; feeds TreeView.message. */
  projectionErrors: Array<{ setDir: string; error: string }>;
}

interface MergeCandidate {
  set: SessionSet;
  familyId: string;
  // familyId + NUL + posix relPath. Same key = copies of one set (main
  // checkout + worktrees); different keys under one name = collision.
  identityKey: string;
}

function outranks(candidate: SessionSet, incumbent: SessionSet): boolean {
  const candRank = STATE_RANK[candidate.state] ?? -1;
  const incRank = STATE_RANK[incumbent.state] ?? -1;
  if (candRank !== incRank) return candRank > incRank;
  return (candidate.lastTouched || "") > (incumbent.lastTouched || "");
}

// One console.error per distinct collision signature; a signature that
// disappears re-arms.
const loggedCollisionSignatures = new Set<string>();

/**
 * The full workspace scan: discover roots, project every set through the
 * cache, assemble records, merge cross-root duplicates, derive prereq
 * blocking against the merged map.
 */
export async function scanAllSessionSets(
  cache: ProjectionCache,
): Promise<ScanResult> {
  const byName = new Map<string, MergeCandidate[]>();
  const projectionErrors: Array<{ setDir: string; error: string }> = [];
  for (const root of discoverRootsWithFamilies()) {
    const manifest = readModulesManifest(root.dir);
    const setDirs = listSessionSetDirNames(root.dir).map((n) =>
      path.join(root.dir, SESSION_SETS_REL, n),
    );
    if (setDirs.length === 0) continue;
    const python = resolvePythonInterpreter(root.dir);
    const projections = await projectAll(cache, python, setDirs, root.dir);
    for (const setDir of setDirs) {
      const projection = projections.get(setDir) ?? {
        payload: null,
        error: "projection did not run",
      };
      if (!projection.payload && projection.error) {
        projectionErrors.push({ setDir, error: projection.error });
      }
      const set = buildSessionSet(root.dir, setDir, manifest, projection);
      const relPath = path.relative(root.dir, setDir).split(path.sep).join("/");
      const candidate: MergeCandidate = {
        set,
        familyId: root.familyId,
        identityKey: `${root.familyId} ${relPath}`,
      };
      const bucket = byName.get(set.name);
      if (bucket) bucket.push(candidate);
      else byName.set(set.name, [candidate]);
    }
  }

  const mergedList: SessionSet[] = [];
  const collisions: DuplicateNameCollision[] = [];
  const currentSignatures = new Set<string>();
  for (const [name, candidates] of byName) {
    let winner = candidates[0];
    for (const c of candidates.slice(1)) {
      if (outranks(c.set, winner.set)) winner = c;
    }
    const distinctIdentities = new Map<string, MergeCandidate>();
    for (const c of candidates) {
      const rep = distinctIdentities.get(c.identityKey);
      if (!rep || outranks(c.set, rep.set)) {
        distinctIdentities.set(c.identityKey, c);
      }
    }
    if (distinctIdentities.size > 1) {
      // True collision: fail loud, but never blank the Explorer or drop
      // the name — one deterministic winner ships, flagged.
      const conflictingDirs = Array.from(distinctIdentities.values())
        .map((c) => c.set.dir)
        .sort();
      winner.set.duplicateNameError = { name, chosenDir: winner.set.dir, conflictingDirs };
      collisions.push({
        name,
        chosenDir: winner.set.dir,
        conflictingDirs,
        candidates: Array.from(distinctIdentities.values()).map((c) => ({
          dir: c.set.dir,
          familyId: c.familyId,
          state: c.set.state,
          lastTouched: c.set.lastTouched,
        })),
      });
      const signature = `${name} ${conflictingDirs.join("|")}`;
      currentSignatures.add(signature);
      if (!loggedCollisionSignatures.has(signature)) {
        loggedCollisionSignatures.add(signature);
        console.error(
          `[dabblerSessionSets] DUPLICATE SESSION-SET NAME "${name}": ` +
            `${conflictingDirs.length} different sets share this name ` +
            `(${conflictingDirs.join(", ")}). Rename one of them; showing ` +
            `only ${winner.set.dir}.`,
        );
      }
    }
    mergedList.push(winner.set);
  }
  for (const sig of loggedCollisionSignatures) {
    if (!currentSignatures.has(sig)) loggedCollisionSignatures.delete(sig);
  }

  deriveBlockedByPrereqs(mergedList);
  return { sets: mergedList, collisions, projectionErrors };
}
