// Set 122 Session 2: the module lifecycle's thin launchers.
//
// Every module mutation the extension performs goes through
// `python -m ai_router.modules` from here. There is deliberately no
// TypeScript fallback: a fallback would restore the two-implementations
// defect this session exists to remove, and would do it silently, on
// exactly the machines where the Python side is broken and least likely to
// be noticed.
//
// The argv contracts below are pinned as named builders rather than
// inlined at each call site, for the reason `copilotSeatSetup.ts` pins its
// own: the CLI's flags are a contract between two repositories' worth of
// code, and drift becomes a noticed decision when it has to edit a
// function with a docstring explaining why the flag is there.
//
// `--repo-root` is passed EXPLICITLY on every call rather than relying on
// the spawn cwd. `ai_router.modules` defaults `--repo-root` to the process
// cwd, and a cwd is an ambient value that a future refactor can change
// without anyone noticing the module manifest moved with it.

import {
  RouterCliResult,
  RunRouterCliDeps,
  runRouterCli,
} from "./routerCli";

/** The router module every launcher here invokes. */
export const MODULES_CLI = "ai_router.modules";

export interface CreateModuleArgs {
  slug: string;
  title?: string;
}

export interface RenameModuleArgs {
  slug: string;
  newSlug?: string;
  newTitle?: string;
}

export interface AssignSetsArgs {
  slug: string;
  setNames: string[];
}

/**
 * `create` — scaffold a module, its plan stub, and its two lifecycle sets.
 *
 * `--title` is omitted rather than passed empty when the developer accepted
 * the default: the CLI's own default is "the slug", and passing `--title ""`
 * would declare an empty title instead of taking that default.
 */
export function createArgs(root: string, args: CreateModuleArgs): string[] {
  const out = ["--repo-root", root, "--json", "create", "--slug", args.slug];
  const title = (args.title ?? "").trim();
  if (title !== "") out.push("--title", title);
  return out;
}

/**
 * `rename` — change a module's slug and/or title, restamping its sets.
 *
 * Each of `--new-slug` / `--new-title` is included ONLY when it is actually
 * changing. The CLI treats an absent flag as "leave this alone", so sending
 * an unchanged value would turn a title-only rename into a slug rename of
 * the same slug — which the running-session refusal grades differently.
 */
export function renameArgs(root: string, args: RenameModuleArgs): string[] {
  const out = ["--repo-root", root, "--json", "rename", "--slug", args.slug];
  if (args.newSlug !== undefined) out.push("--new-slug", args.newSlug);
  if (args.newTitle !== undefined) out.push("--new-title", args.newTitle);
  return out;
}

/** `delete` — cancel/remove the module's sets and drop its manifest entry. */
export function deleteArgs(root: string, slug: string): string[] {
  return ["--repo-root", root, "--json", "delete", "--slug", slug];
}

/** `assign-sets` — stamp `module: <slug>` into each named existing set. */
export function assignSetsArgs(root: string, args: AssignSetsArgs): string[] {
  const out = [
    "--repo-root",
    root,
    "--json",
    "assign-sets",
    "--slug",
    args.slug,
  ];
  for (const name of args.setNames) out.push("--set", name);
  return out;
}

function run(
  root: string,
  args: string[],
  actionLabel: string,
  deps?: RunRouterCliDeps,
): Promise<RouterCliResult> {
  return runRouterCli(
    { module: MODULES_CLI, args, cwd: root, actionLabel },
    deps,
  );
}

export function runCreateModule(
  root: string,
  args: CreateModuleArgs,
  deps?: RunRouterCliDeps,
): Promise<RouterCliResult> {
  return run(root, createArgs(root, args), "Creating a module", deps);
}

export function runRenameModule(
  root: string,
  args: RenameModuleArgs,
  deps?: RunRouterCliDeps,
): Promise<RouterCliResult> {
  return run(root, renameArgs(root, args), "Renaming a module", deps);
}

export function runDeleteModule(
  root: string,
  slug: string,
  deps?: RunRouterCliDeps,
): Promise<RouterCliResult> {
  return run(root, deleteArgs(root, slug), "Deleting a module", deps);
}

export function runAssignSets(
  root: string,
  args: AssignSetsArgs,
  deps?: RunRouterCliDeps,
): Promise<RouterCliResult> {
  return run(root, assignSetsArgs(root, args), "Assigning sets", deps);
}

// ---------- reading the result ----------

function str(payload: Record<string, unknown> | undefined, key: string): string {
  const v = payload?.[key];
  return typeof v === "string" ? v : "";
}

function bool(payload: Record<string, unknown> | undefined, key: string): boolean {
  return payload?.[key] === true;
}

function list(
  payload: Record<string, unknown> | undefined,
  key: string,
): string[] {
  const v = payload?.[key];
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/**
 * The failure sentence for a non-`ok` result.
 *
 * The three failure outcomes are said differently on purpose, because they
 * imply different next actions and different states on disk:
 *
 *  - `refused` — a preflight rejected it; the workspace is untouched, and
 *    the developer needs to change something (finish a session, pick a free
 *    slug) and retry.
 *  - `writeFailed` — the apply phase stopped. `rolledBack` decides whether
 *    that is "nothing changed" or "reconcile from git", and conflating them
 *    would send a developer to git for a change that never landed.
 *  - `unavailable` — nothing ran at all. Never phrased as a module error,
 *    because it is an interpreter/installation problem and saying otherwise
 *    is the exact mis-diagnosis `describeAiRouterImportFailure` exists to
 *    stop.
 */
export function describeFailure(
  verb: string,
  result: RouterCliResult,
): string {
  const detail = result.message.trim() || `exit ${result.exitCode}`;
  switch (result.outcome) {
    case "refused":
      return `${verb} refused — ${detail} Nothing was written.`;
    case "writeFailed": {
      const rolledBack = result.payload?.["rolledBack"];
      if (rolledBack === true) {
        return `${verb} failed: ${detail} Every touched file was rolled back — the workspace is unchanged.`;
      }
      if (rolledBack === false) {
        return `${verb} failed: ${detail} A rollback write ALSO failed — reconcile docs/modules.yaml and the affected files from git before retrying.`;
      }
      if (bool(result.payload, "stillDeclared")) {
        return `${verb} stopped partway: ${detail} The module is still declared — re-run the command to finish (already-applied steps are skipped).`;
      }
      return `${verb} failed: ${detail}`;
    }
    case "unavailable":
      return detail;
    default:
      return `${verb} failed: ${detail}`;
  }
}

/** The success sentence for `create`. */
export function describeCreate(payload: Record<string, unknown> | undefined): string {
  const slug = str(payload, "slug");
  const manifestRel = str(payload, "manifestRel");
  const planRel = str(payload, "planRel");
  const planSet = str(payload, "planSetSlug");
  const decompSet = str(payload, "decompositionSetSlug");
  return (
    `Module "${slug}" ${bool(payload, "manifestCreated") ? `declared in a new ${manifestRel}` : `appended to ${manifestRel}`}. ` +
    (bool(payload, "planCreated")
      ? `Plan stub created at ${planRel} — fill it in, then decompose it into session sets.`
      : `Existing plan at ${planRel} kept.`) +
    (planSet || decompSet
      ? ` Next steps scaffolded: ${planSet} and ${decompSet}.`
      : "")
  );
}

/** The success sentence for `rename`. */
export function describeRename(payload: Record<string, unknown> | undefined): string {
  const parts: string[] = [];
  if (bool(payload, "slugChanged")) parts.push(`slug → ${str(payload, "newSlug")}`);
  if (bool(payload, "titleChanged"))
    parts.push(`title → "${str(payload, "newTitle")}"`);
  const restamped = list(payload, "restamped");
  const tail = restamped.length
    ? ` Restamped ${restamped.length} set(s): ${restamped.join(", ")}.`
    : "";
  return `Renamed module (${parts.join(", ")}).${tail}`;
}

/** The success sentence for `delete`. */
export function describeDelete(payload: Record<string, unknown> | undefined): string {
  return (
    `Deleted module "${str(payload, "slug")}" — ` +
    `${list(payload, "cancelled").length} set(s) cancelled, ` +
    `${list(payload, "removed").length} scaffold(s) removed, ` +
    `${list(payload, "terminal").length} left untouched.`
  );
}

/** The success sentence for `assign-sets`. */
export function describeAssign(
  payload: Record<string, unknown> | undefined,
): string {
  const slug = str(payload, "slug");
  const stamped = list(payload, "stamped");
  const already = list(payload, "alreadyAssigned");
  const parts: string[] = [];
  if (stamped.length) {
    parts.push(
      `Stamped module: ${slug} into ${stamped.length} set(s) (${stamped.join(", ")})`,
    );
  }
  if (already.length) {
    parts.push(`${already.length} already assigned (${already.join(", ")})`);
  }
  return parts.length
    ? `${parts.join("; ")}.`
    : `Nothing to change — the selected sets already declare module: ${slug}.`;
}

/** True when the run stamped at least one set (drives the tree refresh). */
export function assignedAny(payload: Record<string, unknown> | undefined): boolean {
  return list(payload, "stamped").length > 0;
}
