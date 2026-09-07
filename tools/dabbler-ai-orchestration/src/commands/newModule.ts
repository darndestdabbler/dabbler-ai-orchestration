// The "New module" flow — append a docs/modules.yaml entry through the
// router's `modules create` verb. `ui` is the injectable VS Code surface
// so the flow is unit-testable under the vscode stub.
//
// There is deliberately no TypeScript fallback that writes the manifest
// itself: a fallback would restore the two-implementations defect,
// silently, on exactly the machines where the router is broken.

import * as vscode from "vscode";
import type { Router } from "dabbler-ai-router";
import { RouterUnavailableError } from "dabbler-ai-router";
import { readModuleSlugs, validateNewModuleSlug } from "../utils/moduleAuthoring";
import { RouterRefusal, productionRouter } from "../router/host";

export interface NewModuleUi {
  showInputBox: typeof vscode.window.showInputBox;
  showInformationMessage: (message: string) => unknown;
  showErrorMessage: (message: string) => unknown;
  workspaceRoot: () => string | undefined;
}

function defaultUi(): NewModuleUi {
  return {
    showInputBox: vscode.window.showInputBox,
    showInformationMessage: (m) => vscode.window.showInformationMessage(m),
    showErrorMessage: (m) => vscode.window.showErrorMessage(m),
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  };
}

/** The manifest's kinds, as `dabbler modules create --kind` accepts them. */
const MODULE_KINDS = ["shared-types", "library", "application"];

/** `a, b` -> `["a", "b"]`; blanks dropped. */
function splitSlugs(text: string): string[] {
  return text
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

export function describeCreateFailure(result: RouterRefusal): string {
  const detail = result.message.trim() || `exit ${result.exitCode}`;
  return `New module failed: ${detail}`;
}

/**
 * Prompt for slug + title, create the manifest entry. Returns true when
 * a module was created (callers refresh), false on cancel / refusal.
 */
export async function runNewModuleFlow(
  ui: NewModuleUi = defaultUi(),
  router: Router = productionRouter(),
): Promise<boolean> {
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showErrorMessage("No workspace folder is open.");
    return false;
  }

  // Existing slugs for live validation; the CLI re-reads and re-validates
  // at write time (fail-loud), so a stale read here can only make the
  // input box friendlier, never corrupt the manifest.
  const existingSlugs = readModuleSlugs(root);

  const slug = await ui.showInputBox({
    title: "New module (1/2): slug",
    prompt:
      "Machine identity for the module (kebab-case). A module bounds part " +
      "of the repository's code: its roots, its spec sections, its assets.",
    placeHolder: "greeter",
    ignoreFocusOut: true,
    validateInput: (v) => validateNewModuleSlug(v, existingSlugs),
  });
  if (slug === undefined || slug.trim() === "") return false;

  const title = await ui.showInputBox({
    title: "New module (2/4): display title",
    prompt: `Human-readable name for the module. Press Enter to use "${slug.trim()}".`,
    placeHolder: slug.trim(),
    ignoreFocusOut: true,
  });
  if (title === undefined) return false; // Esc cancels; empty = default to slug

  // The module vocabulary, each with the manifest's own default: a library
  // that depends on nothing. Who depends on THIS module is derived by the
  // router from every other entry's dependsOn and is never asked for.
  const kind = await ui.showInputBox({
    title: "New module (3/4): kind",
    prompt: "shared-types, library or application. Press Enter for library.",
    placeHolder: "library",
    ignoreFocusOut: true,
    validateInput: (v) =>
      v.trim() === "" || MODULE_KINDS.includes(v.trim())
        ? null
        : `One of ${MODULE_KINDS.join(", ")}.`,
  });
  if (kind === undefined) return false;

  const dependsOn = await ui.showInputBox({
    title: "New module (4/4): depends on",
    prompt:
      "Slugs this module consumes, comma-separated. Press Enter for none." +
      (existingSlugs.length > 0 ? ` Declared: ${existingSlugs.join(", ")}.` : ""),
    placeHolder: existingSlugs.join(", "),
    ignoreFocusOut: true,
    validateInput: (v) => {
      const unknown = splitSlugs(v).filter((s) => !existingSlugs.includes(s));
      return unknown.length === 0
        ? null
        : `Not declared in docs/modules.yaml: ${unknown.join(", ")}.`;
    },
  });
  if (dependsOn === undefined) return false;

  // The workspace root is the CLI's positional argument as well as the
  // spawn cwd; `PythonSpawnRouter` passes both. A router that could not
  // be reached at all is not a refusal — it is the absence of an answer,
  // and it arrives as an exception rather than as one.
  let result;
  try {
    result = await router.modules.create({
      workspaceRoot: root,
      slug: slug.trim(),
      title: title.trim() || undefined,
      kind: kind.trim() || undefined,
      dependsOn: splitSlugs(dependsOn),
    });
  } catch (err) {
    ui.showErrorMessage(
      err instanceof RouterUnavailableError ? err.message : String(err),
    );
    return false;
  }
  if (!result.ok) {
    ui.showErrorMessage(describeCreateFailure(result));
    return false;
  }

  ui.showInformationMessage(
    `Module "${slug.trim()}" added to docs/modules.yaml.`,
  );
  return true;
}

export function registerNewModuleCommand(
  context: vscode.ExtensionContext,
  deps: { refreshView: () => void },
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.newModule", async () => {
      if (await runNewModuleFlow()) deps.refreshView();
    }),
  );
}
