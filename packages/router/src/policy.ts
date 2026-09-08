// The policy: what a module session may touch, stated once.
//
// A focused session runs in its module's own folder, and the wall between
// the engine and a sibling's implementation is the disk: the folder holds
// the module's source, every sibling as its package and its contract
// folder, and nothing else. This is the statement of that scope -- the one
// `moduleScope` already derives for the verifier -- rendered into one
// compact JSON file under the session's run directory, which the machine
// owns, so anything that wants to know reads it without recomputing it.
// It is derived, never declared: nothing in it is typed by a person. A
// one-module solution gets no file, because the repository is the module
// and there is no sibling to wall off.
//
// Two members carry the answer. `allowed` is the scope: what the session
// may read and change, and what the first step instruction hands the
// engine as its `scope`. `siblings` names every other module with its
// roots and its contract folder, so a sentence can say whose
// implementation a path is and where its contract is instead. Nothing
// here decides a tool call: the folder does that by holding what it holds,
// and a sibling's source is asked for, never taken (`dabbler session next
// --request-grant <slug> --reason <why>`).

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { moduleScope } from "./agency.ts";
import { contractDir } from "./checkout.ts";
import { loadConfig } from "./config.ts";
import { atomicWriteJson, nowIso } from "./journal.ts";
import { sessionRunDir } from "./ledger.ts";
import { type ModuleEntry, type SolutionShape, moduleConfigs } from "./modules.ts";

export const POLICY_FILENAME = "policy.json";

/** A module the session does not name: whose implementation its roots hold, and where its contract is. */
export interface PolicySibling {
  readonly slug: string;
  readonly roots: readonly string[];
  readonly contract: string;
}

export interface ModulePolicy {
  readonly schema_version: 1;
  readonly session: number;
  readonly modules: readonly string[];
  /** The repository root, absolute with forward slashes. */
  readonly root: string;
  readonly writtenAt: string;
  /** Repository-relative; a directory covers what is under it. */
  readonly allowed: readonly string[];
  readonly siblings: readonly PolicySibling[];
}

/** The verb that prints the scope on demand. */
export const SCOPE_VERB = "dabbler session scope";

function posix(path: string): string {
  return path.split("\\").join("/");
}

export function policyPath(root: string, session: number): string {
  return join(sessionRunDir(root, session), POLICY_FILENAME);
}

/**
 * Each module's shared files from the configuration, keyed by slug: what
 * the scope adds beyond the manifest. Here because the policy and the
 * exposure manifest are two renderings of one scope, and the scope is
 * computed with the same shared files wherever it is computed.
 */
export function sharedFilesOf(root: string, shape: SolutionShape): Map<string, readonly string[]> {
  return new Map(
    [...moduleConfigs(loadConfig(undefined, root), shape.modules).values()].map((module) => [
      module.slug,
      module.sharedFiles,
    ]),
  );
}

/** A module's roots in the form the scope uses: forward slashes, no `./`, no trailing slash. */
function rootsOf(entry: ModuleEntry): string[] {
  return (entry.codeRoots.length > 0 ? entry.codeRoots : ["."]).map((codeRoot) => {
    const rel = posix(codeRoot).replace(/^\.\/+/, "").replace(/\/+$/, "");
    return rel === "" ? "." : rel;
  });
}

/**
 * Write the policy of a session of a multi-module solution and return it;
 * a single-module shape has no siblings, writes nothing and answers null.
 * Derived state, rewritten whole whenever the session's modules reach the
 * record.
 */
export function writePolicy(
  root: string,
  sessionsDir: string,
  shape: SolutionShape,
  session: number,
  modules: readonly string[],
): ModulePolicy | null {
  if (!shape.multi) return null;
  const named = modules.map((slug) => slug.trim()).filter((slug) => slug !== "");
  const policy: ModulePolicy = {
    schema_version: 1,
    session,
    modules: named,
    root: posix(resolve(root)),
    writtenAt: nowIso("seconds"),
    allowed: moduleScope(root, sessionsDir, shape, named, sharedFilesOf(root, shape)),
    siblings: shape.modules
      .filter((entry) => !named.includes(entry.slug))
      .map((entry) => ({ slug: entry.slug, roots: rootsOf(entry), contract: contractDir(entry.slug) })),
  };
  mkdirSync(sessionRunDir(root, session), { recursive: true });
  atomicWriteJson(policyPath(root, session), policy);
  return policy;
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function isSibling(value: unknown): value is PolicySibling {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record["slug"] === "string" && isStringList(record["roots"]) && typeof record["contract"] === "string";
}

/**
 * Whole, or nothing: a policy with one member a reader cannot read is no
 * policy, and a session with no policy has no scope to print -- never a
 * list that is half of one.
 */
function isPolicy(value: unknown): value is ModulePolicy {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record["schema_version"] === 1 &&
    typeof record["root"] === "string" &&
    isStringList(record["allowed"]) &&
    Array.isArray(record["siblings"]) &&
    record["siblings"].every(isSibling)
  );
}

/** The policy as written, or null where the session has none or it cannot be read. */
export function readPolicy(root: string, session: number): ModulePolicy | null {
  const path = policyPath(root, session);
  if (!existsSync(path)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (isPolicy(parsed)) return parsed;
  } catch {
    // Unreadable is absent: the policy is derived, and a reader that
    // cannot read it answers as if there were none.
  }
  return null;
}
