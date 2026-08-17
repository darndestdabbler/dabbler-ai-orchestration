// The New Module launcher. Module mutation goes through
// `python -m ai_router.modules` — there is deliberately no TypeScript
// fallback: a fallback would restore the two-implementations defect,
// silently, on exactly the machines where the Python side is broken.
//
// The workspace root is passed EXPLICITLY as the CLI's positional
// argument rather than relying on the spawn cwd: a cwd is an ambient
// value a future refactor can change without anyone noticing the module
// manifest moved with it.

import { RouterCliResult, RunRouterCliDeps, runRouterCli } from "./routerCli";

/** The router module the launcher invokes. */
export const MODULES_CLI = "ai_router.modules";

export interface CreateModuleArgs {
  slug: string;
  title?: string;
  planPath?: string;
}

/**
 * `--title` is omitted rather than passed empty when the developer
 * accepted the default: the CLI's own default is the slug, and passing
 * `--title ""` would declare an empty title instead of taking it.
 */
export function createArgs(root: string, args: CreateModuleArgs): string[] {
  const out = ["create", root, "--slug", args.slug];
  const title = (args.title ?? "").trim();
  if (title !== "") out.push("--title", title);
  const planPath = (args.planPath ?? "").trim();
  if (planPath !== "") out.push("--plan-path", planPath);
  return out;
}

export function runCreateModule(
  root: string,
  args: CreateModuleArgs,
  deps?: RunRouterCliDeps,
): Promise<RouterCliResult> {
  return runRouterCli(
    {
      module: MODULES_CLI,
      args: createArgs(root, args),
      cwd: root,
      actionLabel: "Creating a module",
    },
    deps,
  );
}
