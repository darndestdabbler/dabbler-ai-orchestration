import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

const PLAN_DEST = path.join("docs", "planning", "project-plan.md");
const PLAN_AUTHORING_PROMPT = `You are a project planning assistant for an AI-led development workflow.

Help me create a project plan in Markdown format for my software project.

The plan should include:
1. Project overview (2-3 sentences)
2. Goals and success criteria
3. High-level phases or feature areas
4. For each phase: a brief description and the key deliverables

Keep it concise and focused — this plan will be used to generate AI session sets, so each
distinct feature area or phase should be something that can be implemented in 2-6 focused AI
sessions.

Format as a clean Markdown document I can save as docs/planning/project-plan.md.`;

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
    writeClipboard: (text) => vscode.env.clipboard.writeText(text),
    executeCommand: (command, ...args) => vscode.commands.executeCommand(command, ...args),
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  };
}

/** Copy the plan-authoring prompt to the clipboard (step-2 "OR" path). */
export async function copyPlanningPrompt(ui: PlanImportUi = defaultUi()): Promise<void> {
  await ui.writeClipboard(PLAN_AUTHORING_PROMPT);
  void ui.showInformationMessage(
    "Plan-authoring prompt copied to clipboard. Paste it into your AI assistant, " +
    "then save the result as docs/planning/project-plan.md — or import it with " +
    "'Import project-plan.md'."
  );
}

/**
 * File-picker import into ``docs/planning/project-plan.md``. Returns true
 * when a plan was written (so callers can refresh live state), false on
 * cancel / error.
 */
export async function importPlanFromFile(ui: PlanImportUi = defaultUi()): Promise<boolean> {
  const picked = await ui.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    filters: { "Markdown": ["md"] },
    openLabel: "Import Plan",
  });
  if (!picked?.[0]) return false;

  const root = ui.workspaceRoot();
  if (!root) {
    void ui.showErrorMessage("No workspace folder is open.");
    return false;
  }

  const destPath = path.join(root, PLAN_DEST);
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
      `${PLAN_DEST} already exists. Overwrite it?`,
      { modal: true },
      "Overwrite"
    );
    if (overwrite !== "Overwrite") return false;
  }

  try {
    fs.copyFileSync(picked[0].fsPath, destPath);
  } catch (err) {
    void ui.showErrorMessage(
      `Failed to write ${PLAN_DEST}: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
  void ui.executeCommand("vscode.open", vscode.Uri.file(destPath));
  void ui.showInformationMessage(
    `Plan imported to ${PLAN_DEST}. Run 'Dabbler: Generate Session-Set Prompt' to translate it into session sets.`
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
