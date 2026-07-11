import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  ModulePickUi,
  modulePlanRelPath,
  pickModuleForAuthoring,
} from "../utils/moduleAuthoring";
import { ModuleManifestEntry } from "../types";

/** Repo-level plan destination (forward-slashed, repo-relative). */
const PLAN_DEST_POSIX = "docs/planning/project-plan.md";

/**
 * Build the plan-authoring prompt (Set 087 S3, ruling Q4: module-aware).
 * A repo-level render (``module: null``) is byte-identical to the
 * pre-087 prompt; a module-targeted render names the module and its
 * plan path. Pure, so the suite pins both shapes.
 */
export function buildPlanningPrompt(
  module: ModuleManifestEntry | null,
  destPosix: string,
): string {
  const subject = module
    ? `the "${module.title}" module (\`${module.slug}\`) of my software project`
    : "my software project";
  const moduleNote = module
    ? `\nThis plan covers ONLY the ${module.slug} module (its scope is declared in
docs/modules.yaml); the project's other modules have their own plans.\n`
    : "";
  return `You are a project planning assistant for an AI-led development workflow.

Help me create a project plan in Markdown format for ${subject}.
${moduleNote}
The plan should include:
1. Project overview (2-3 sentences)
2. Goals and success criteria
3. High-level phases or feature areas
4. For each phase: a brief description and the key deliverables

Keep it concise and focused — this plan will be used to generate AI session sets, so each
distinct feature area or phase should be something that can be implemented in 2-6 focused AI
sessions.

Format as a clean Markdown document I can save as ${destPosix}.`;
}

// Set 060 S2: the two halves of the old QuickPick command are exported
// individually so the Getting Started form's two step-2 buttons
// ("Import project-plan.md…" / "Copy prompt for planning") drive each
// path directly without the intermediate picker. The `dabbler.importPlan`
// command keeps the QuickPick and delegates to the same functions.
//
// `ui` is the injectable VS Code surface (the showQuickPick-injection
// pattern from CustomSessionSetsView.showContextMenu) so the handlers
// are unit-testable under the vscode stub.

export interface PlanImportUi {
  showOpenDialog: typeof vscode.window.showOpenDialog;
  showWarningMessage: typeof vscode.window.showWarningMessage;
  showInformationMessage: typeof vscode.window.showInformationMessage;
  showErrorMessage: typeof vscode.window.showErrorMessage;
  /** Set 087 S3 (ruling Q4): the module picker's QuickPick surface. */
  showQuickPick: ModulePickUi["showQuickPick"];
  writeClipboard: (text: string) => Thenable<void>;
  executeCommand: (command: string, ...args: unknown[]) => Thenable<unknown>;
  workspaceRoot: () => string | undefined;
}

function defaultUi(): PlanImportUi {
  return {
    showOpenDialog: vscode.window.showOpenDialog,
    showWarningMessage: vscode.window.showWarningMessage,
    showInformationMessage: vscode.window.showInformationMessage,
    showErrorMessage: vscode.window.showErrorMessage,
    showQuickPick: (items, opts) => vscode.window.showQuickPick(items, opts),
    writeClipboard: (text) => vscode.env.clipboard.writeText(text),
    executeCommand: (command, ...args) => vscode.commands.executeCommand(command, ...args),
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  };
}

/**
 * Resolve which plan this flow targets (Set 087 S3, ruling Q4): the
 * picked module's plan when ``docs/modules.yaml`` names modules (one
 * module auto-selects with a notice; Esc on the picker cancels the whole
 * flow), the repo-level plan otherwise. ``null`` = cancelled.
 */
async function resolvePlanTarget(
  root: string | undefined,
  ui: PlanImportUi,
): Promise<{ entry: ModuleManifestEntry | null; destPosix: string } | null> {
  if (!root) return { entry: null, destPosix: PLAN_DEST_POSIX };
  const pick = await pickModuleForAuthoring(root, {
    showQuickPick: ui.showQuickPick,
    showInformationMessage: ui.showInformationMessage,
    showErrorMessage: ui.showErrorMessage,
  });
  // S3 verification R1: invalid-manifest aborts like a cancel (the picker
  // already showed the error) — never the silent repo-level fallback.
  if (pick.kind === "cancelled" || pick.kind === "invalid-manifest") return null;
  return {
    entry: pick.entry,
    destPosix: pick.entry ? modulePlanRelPath(pick.entry) : PLAN_DEST_POSIX,
  };
}

/** Copy the plan-authoring prompt to the clipboard (step-2 "OR" path). */
export async function copyPlanningPrompt(ui: PlanImportUi = defaultUi()): Promise<void> {
  const target = await resolvePlanTarget(ui.workspaceRoot(), ui);
  if (!target) return; // module picker cancelled
  await ui.writeClipboard(buildPlanningPrompt(target.entry, target.destPosix));
  void ui.showInformationMessage(
    `Plan-authoring prompt copied to clipboard. Paste it into your AI assistant, ` +
    `then save the result as ${target.destPosix} — or import it with ` +
    `'Import project-plan.md'.`
  );
}

/**
 * File-picker import into the targeted plan path (the repo-level
 * ``docs/planning/project-plan.md``, or the picked module's plan — Set
 * 087 S3, ruling Q4). Returns true when a plan was written (so callers
 * can refresh live state), false on cancel / error.
 */
export async function importPlanFromFile(ui: PlanImportUi = defaultUi()): Promise<boolean> {
  // The module pick needs a root; the no-root ERROR stays after the file
  // dialog (pre-087 order) so a cancelled dialog is a quiet false, never
  // an error toast.
  const root = ui.workspaceRoot();
  const target = await resolvePlanTarget(root, ui);
  if (!target) return false; // module picker cancelled

  const picked = await ui.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { "Markdown": ["md"] },
    openLabel: "Import Plan",
  });
  if (!picked?.[0]) return false;

  if (!root) {
    void ui.showErrorMessage("No workspace folder is open.");
    return false;
  }

  const destPath = path.join(root, ...target.destPosix.split("/"));
  // S3 verification R2 (Major): the destination derives from
  // repository-controlled configuration (a manifest planPath), so refuse
  // any resolved path that escapes the workspace BEFORE any filesystem
  // access. modulePlanRelPath already degrades unsafe manifest values to
  // the in-workspace default; this is the write-time backstop (e.g. a
  // hostile slug composed into that default).
  const containment = path.relative(path.resolve(root), path.resolve(destPath));
  if (
    containment === "" ||
    containment.startsWith("..") ||
    path.isAbsolute(containment)
  ) {
    void ui.showErrorMessage(
      `Refusing to write outside the workspace: ${target.destPosix}`,
    );
    return false;
  }
  const destDir = path.dirname(destPath);
  try {
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
  } catch (err) {
    void ui.showErrorMessage(
      `Failed to create ${destDir}: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }

  if (fs.existsSync(destPath)) {
    const overwrite = await ui.showWarningMessage(
      `${target.destPosix} already exists. Overwrite it?`,
      { modal: true },
      "Overwrite"
    );
    if (overwrite !== "Overwrite") return false;
  }

  try {
    fs.copyFileSync(picked[0].fsPath, destPath);
  } catch (err) {
    void ui.showErrorMessage(
      `Failed to write ${target.destPosix}: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
  void ui.executeCommand("vscode.open", vscode.Uri.file(destPath));
  void ui.showInformationMessage(
    `Plan imported to ${target.destPosix}. Run 'Dabbler: Generate Session-Set Prompt' to translate it into session sets.`
  );
  return true;
}

export function registerPlanImportCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.importPlan", async () => {
      const action = await vscode.window.showQuickPick(
        [
          { label: "$(file) Import existing plan from file", value: "file" },
          { label: "$(clippy) Get a prompt to create a plan with AI", value: "prompt" },
        ],
        { placeHolder: "How would you like to add a project plan?" }
      );
      if (!action) return;

      if (action.value === "prompt") {
        await copyPlanningPrompt();
        return;
      }
      await importPlanFromFile();
    })
  );
}
