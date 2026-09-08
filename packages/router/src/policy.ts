// The policy: what a module session may touch, stated once.
//
// A module session runs in the regular checkout, and the wall between the
// engine and a sibling's implementation is a permission the framework
// states and the CLI's own hooks evaluate. This is the statement: the
// scope `moduleScope` already derives for the verifier, rendered into one
// compact JSON file under the session's run directory -- which the machine
// owns -- so a hook script can read it without starting Node. It is
// derived, never declared: nothing in it is typed by a person. A one-module
// solution gets no file, because the repository is the module and there is
// no sibling to wall off.
//
// Five members carry the rules. `allowed` is the scope: what the session
// may read and change. `protected` is what it may not write whatever the
// scope says -- the ledger pair lives under the sessions directory, which
// the scope includes because the verifier must read it, so write
// protection is a list of its own. `writable` is carved out of both: the
// one place under the machine's directory where the framework tells the
// engine to write its answers. `siblings` names every other module
// with its roots and its contract folder, so a denial can say whose
// implementation a path is and where its contract is instead.
// `destructive` is the short list of commands no session runs, each as one
// regular expression that is the same string in TypeScript, in PowerShell's
// `-match` and in `grep -E` -- a literal space for a blank, no `\s`, no
// lookaround -- because the hook's shell script and the decision here must
// never disagree.

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, posix as posixPath, relative, resolve } from "node:path";

import { inScope, moduleScope } from "./agency.ts";
import { contractDir } from "./checkout.ts";
import { loadConfig } from "./config.ts";
import { ACTIVITY_LOG_FILENAME, STATE_FILENAME } from "./evidence.ts";
import { MACHINE_DIRNAME, atomicWriteJson, nowIso } from "./journal.ts";
import { sessionRunDir } from "./ledger.ts";
import { MANIFEST_RELPATH, type ModuleEntry, type SolutionShape, moduleConfigs } from "./modules.ts";

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
  /** The repository root, absolute with forward slashes: what a tool's absolute path is placed against. */
  readonly root: string;
  readonly writtenAt: string;
  /** Repository-relative; a directory covers what is under it. */
  readonly allowed: readonly string[];
  /** Never written, whatever `allowed` says. */
  readonly protected: readonly string[];
  /** Written whatever `protected` and `allowed` say: where the engine's answers go. */
  readonly writable: readonly string[];
  readonly siblings: readonly PolicySibling[];
  /** Regular expressions over a shell command; a match is a denial. */
  readonly destructive: readonly string[];
}

/**
 * The commands no session runs, whatever its scope: the ones that rewrite
 * the remote, throw away the working tree, or delete the root. Each is one
 * expression in the dialect every reader shares, and is matched
 * case-insensitively, which is what PowerShell's `-match` does by default
 * and what `grep -Ei` does. The dialect: a blank is a literal space in a
 * bracket, `[ ]`, never `[ \t]` -- a POSIX bracket expression reads `\t`
 * as a backslash and a `t`, so the same string matched `.\bin` in grep and
 * not in .NET; no `\s`, no `\b`, no lookaround, and a backslash outside a
 * bracket is written `\\`. Every pattern was run through all three readers
 * over the same command list when it was written.
 */
export const DESTRUCTIVE_COMMANDS: readonly string[] = [
  // git push --force, -f, --force-with-lease; anywhere after the verb.
  "git[ ]+push[ ]+([^ ]+[ ]+)*(--force|--force-with-lease|-f)([ ]|$)",
  // git reset --hard, with or without options before it.
  "git[ ]+reset[ ]+(-[^ ]+[ ]+)*--hard([ ]|$)",
  // git checkout -- . / git checkout . / git restore . : the whole tree discarded.
  "git[ ]+(checkout|restore)[ ]+(--[ ]+)?\\.([ ]|$)",
  // git clean -f in any spelling (-fd, -df, -xdf, --force): untracked files gone.
  "git[ ]+clean[ ]+(-[^ ]*[fF][^ ]*|--force)([ ]|$)",
  // rm -r of ., ./, / or *: the root, or everything in it.
  "rm([ ]+-[A-Za-z]+)*[ ]+-[A-Za-z]*[rR][A-Za-z]*([ ]+-[A-Za-z]+)*[ ]+(\\.|\\./|/|\\*)([ ]|$)",
  // Remove-Item . -Recurse, in either order the target and the switch come.
  "Remove-Item([ ]+-[A-Za-z]+)*[ ]+(-Path[ ]+)?(\\.|\\.\\\\|\\./|\\*)([ ]+-[A-Za-z]+)*[ ]+-Recurse",
  "Remove-Item([ ]+-[A-Za-z]+)*[ ]+-Recurse([ ]+-[A-Za-z]+)*[ ]+(-Path[ ]+)?(\\.|\\.\\\\|\\./|\\*)([ ]|$)",
];

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
 * What no session writes whatever its scope says: the ledger pair, the
 * module manifest, and everything under the machine's directory -- the
 * run record, the projection, the markers -- except what `WRITABLE_PATHS`
 * carves out.
 */
export function protectedPaths(root: string, sessionsDir: string): string[] {
  const setRel = posix(relative(resolve(root), resolve(sessionsDir)));
  return [
    `${setRel}/${STATE_FILENAME}`,
    `${setRel}/${ACTIVITY_LOG_FILENAME}`,
    posix(MANIFEST_RELPATH),
    MACHINE_DIRNAME,
  ].sort();
}

/**
 * Carved out of the protected machine directory: `.dabbler/scratch` is
 * where the plan instruction tells the engine to write its answers, and a
 * wall in front of the answer is an impasse. Carried in the policy file
 * rather than known to the code, so the hook's shell script reads the
 * same exception this function does.
 */
export const WRITABLE_PATHS: readonly string[] = [`${MACHINE_DIRNAME}/scratch`];

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
    protected: protectedPaths(root, sessionsDir),
    writable: [...WRITABLE_PATHS],
    siblings: shape.modules
      .filter((entry) => !named.includes(entry.slug))
      .map((entry) => ({ slug: entry.slug, roots: rootsOf(entry), contract: contractDir(entry.slug) })),
    destructive: [...DESTRUCTIVE_COMMANDS],
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
 * Whole, or nothing: a policy with one member the decision cannot read is
 * no policy, and a session with no policy is allowed, unobserved -- never
 * a decision that throws halfway through a sibling read.
 */
function isPolicy(value: unknown): value is ModulePolicy {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    record["schema_version"] === 1 &&
    typeof record["root"] === "string" &&
    isStringList(record["allowed"]) &&
    isStringList(record["protected"]) &&
    isStringList(record["writable"]) &&
    isStringList(record["destructive"]) &&
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
    // cannot read it answers as if there were none -- allow, unobserved.
  }
  return null;
}

// --- The decision --------------------------------------------------------------
//
// One pure function, so the hook's shell script and the transcript scan
// can never disagree with each other about what the policy says. Three
// rules and no fourth: a write to a protected path or outside the scope
// is denied -- it could never pass the close anyway; a destructive command
// is denied; a read of a sibling's implementation is denied softly, with
// the contract folder to use instead and the verb that grants the read
// when the contract is not enough. Everything else is allowed. And every
// input the function cannot read -- no policy, a tool it does not class, a
// call with nothing to judge, a path outside the repository -- is ALLOWED
// and marked unobserved: the operator would rather the black box fail than
// the engine stop.

/** What a tool does, as far as the wall cares. */
export type ToolClass = "write" | "command" | "read";

/**
 * Both CLIs' names, lower-cased: Copilot's `edit`, `create`, `bash`,
 * `powershell`, `view`, `glob`, `grep`; Claude Code's `Edit`, `Write`,
 * `MultiEdit`, `Bash`, `Read`, `Grep`, `Glob`. A name outside the table is
 * unobserved, never denied.
 */
const TOOL_CLASSES: ReadonlyMap<string, ToolClass> = new Map<string, ToolClass>([
  ["edit", "write"],
  ["create", "write"],
  ["write", "write"],
  ["multiedit", "write"],
  ["notebookedit", "write"],
  ["bash", "command"],
  ["powershell", "command"],
  ["shell", "command"],
  ["view", "read"],
  ["read", "read"],
  ["glob", "read"],
  ["grep", "read"],
  ["list", "read"],
  ["search", "read"],
]);

export interface ToolCall {
  readonly tool: string;
  /** For a read or a write: the path the tool is given. */
  readonly path?: string | null;
  /** For a command: the command line as the tool is given it. */
  readonly command?: string | null;
}

export type DenialRule = "protected-path" | "write-outside-scope" | "destructive-command" | "sibling-read";

export interface Decision {
  readonly allow: boolean;
  readonly rule: DenialRule | null;
  /** Whether the policy could see the call at all. False is the fail-open side, and it is recorded as such. */
  readonly observed: boolean;
  readonly reason: string;
  /** The repository-relative path judged, where there was one. */
  readonly path?: string;
  /** On a sibling read: whose implementation it is, and where its contract is. */
  readonly module?: string;
  readonly contract?: string;
}

/** The verb a denial points at: the engine grants itself the read, with a reason, and no human is asked. */
export const SELF_GRANT_VERB = "dabbler session self-grant-read";
/** The verb that prints the scope on demand. */
export const SCOPE_VERB = "dabbler session scope";

function unobserved(reason: string): Decision {
  return { allow: true, rule: null, observed: false, reason: `unobserved: ${reason}` };
}

/** Whether `entry` -- a file, a directory, or `.` for the whole tree -- covers `rel`. */
function covers(entry: string, rel: string): boolean {
  return entry === "." || inScope([entry], rel);
}

/**
 * The call's path as the policy reads it: repository-relative, forward
 * slashes, `./` and `..` collapsed, an absolute path placed against the
 * root. Null when it does not resolve inside the repository -- a temp
 * file, another checkout -- which the policy says nothing about.
 */
export function relativeToPolicyRoot(policy: ModulePolicy, path: unknown): string | null {
  const raw = posix(String(path)).trim();
  if (raw === "") return null;
  const root = policy.root.replace(/\/+$/, "");
  let rel: string;
  if (/^([A-Za-z]:)?\//.test(raw)) {
    // Drive letters compare without case: `d:/` and `D:/` are one root.
    const lower = raw.toLowerCase();
    const rootLower = root.toLowerCase();
    if (lower === rootLower) return ".";
    if (!lower.startsWith(`${rootLower}/`)) return null;
    rel = raw.slice(root.length + 1);
  } else {
    rel = raw;
  }
  const normalised = posixPath.normalize(rel).replace(/^(\.\/)+/, "").replace(/\/+$/, "");
  if (normalised === "" || normalised === ".") return ".";
  if (normalised === ".." || normalised.startsWith("../")) return null;
  return normalised;
}

/**
 * Allow or deny one call against the policy, with the reason. A decision
 * that cannot be reached -- a member the reader let through, a value that
 * is not what its type says -- is allow, unobserved, and says why: the
 * function fails open by construction and not only by its cases.
 */
export function decide(policy: ModulePolicy | null, call: ToolCall): Decision {
  try {
    return judge(policy, call);
  } catch (error) {
    return unobserved(`the decision could not be made: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function judge(policy: ModulePolicy | null, call: ToolCall): Decision {
  if (policy === null) return unobserved("this session has no policy");
  const tool = String(call?.tool ?? "").trim().toLowerCase();
  const kind = TOOL_CLASSES.get(tool);
  if (kind === undefined) return unobserved(`the tool '${tool}' is not one the policy classes`);

  if (kind === "command") {
    const command = typeof call.command === "string" ? call.command : "";
    if (command.trim() === "") return unobserved("the call carries no command");
    for (const pattern of policy.destructive) {
      let expression: RegExp;
      try {
        expression = new RegExp(pattern, "i");
      } catch {
        // A pattern this dialect cannot compile guards nothing here, and
        // says so rather than denying everything.
        return unobserved(`the destructive pattern ${JSON.stringify(pattern)} does not compile`);
      }
      if (expression.test(command)) {
        return {
          allow: false,
          rule: "destructive-command",
          observed: true,
          reason:
            `the command matches the destructive pattern ${JSON.stringify(pattern)}: it rewrites ` +
            "the remote, discards the working tree or deletes the root, and no session runs it",
        };
      }
    }
    return { allow: true, rule: null, observed: true, reason: "the command matches no destructive pattern" };
  }

  if (call.path === null || call.path === undefined) return unobserved("the call names no path");
  const rel = relativeToPolicyRoot(policy, call.path);
  if (rel === null) return unobserved(`${posix(String(call.path))} is not inside the repository`);

  if (kind === "write") {
    if (policy.writable.some((entry) => covers(entry, rel))) {
      return { allow: true, rule: null, observed: true, reason: `${rel} is where the engine's answers go`, path: rel };
    }
    const guarded = policy.protected.find((entry) => covers(entry, rel));
    if (guarded !== undefined) {
      return {
        allow: false,
        rule: "protected-path",
        observed: true,
        reason: `${rel} is under ${guarded}, the framework's own record: the router writes it, and nothing else does`,
        path: rel,
      };
    }
    if (!inScope(policy.allowed, rel)) {
      return {
        allow: false,
        rule: "write-outside-scope",
        observed: true,
        reason:
          `${rel} is outside this session's scope (${policy.allowed.join(", ")}); \`${SCOPE_VERB}\` prints it. ` +
          "A step that cannot be done inside the scope is reported blocked: the plan is wrong, not the wall",
        path: rel,
      };
    }
    return { allow: true, rule: null, observed: true, reason: `${rel} is in scope`, path: rel };
  }

  if (inScope(policy.allowed, rel)) {
    return { allow: true, rule: null, observed: true, reason: `${rel} is in scope`, path: rel };
  }
  const sibling = policy.siblings.find(
    (entry) => entry.roots.some((root) => covers(root, rel)) && !covers(entry.contract, rel),
  );
  if (sibling === undefined) {
    return { allow: true, rule: null, observed: true, reason: `${rel} is nobody's implementation`, path: rel };
  }
  return {
    allow: false,
    rule: "sibling-read",
    observed: true,
    reason:
      `${rel} is implementation owned by module ${sibling.slug}; use ${sibling.contract} first; ` +
      `if the implementation is still needed, run ${SELF_GRANT_VERB} --path ${rel} ` +
      '--reason "<why the contract is not enough>" and retry',
    path: rel,
    module: sibling.slug,
    contract: sibling.contract,
  };
}
