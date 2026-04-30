import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import simpleGit from "simple-git";

const SCAFFOLD_DIRS = [
  path.join("docs", "session-sets"),
  path.join("docs", "planning"),
  "ai-router",
];

async function pickDirectory(): Promise<string | undefined> {
  const picked = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Select project folder",
  });
  return picked?.[0]?.fsPath;
}

export function registerGitScaffoldCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.setupNewProject", async () => {
      // Step 1: pick folder
      const projectDir = await pickDirectory();
      if (!projectDir) return;

      // Step 2: git init (skip if already a repo)
      const git = simpleGit(projectDir);
      const isRepo = await git.checkIsRepo().catch(() => false);
      if (!isRepo) {
        const confirm = await vscode.window.showWarningMessage(
          `Initialize a new git repository in ${path.basename(projectDir)}?`,
          { modal: true },
          "Initialize"
        );
        if (confirm !== "Initialize") return;
        await git.init();
        vscode.window.showInformationMessage("Git repository initialized.");
      }

      // Step 3: create folder skeleton
      for (const rel of SCAFFOLD_DIRS) {
        const full = path.join(projectDir, rel);
        if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
      }
      vscode.window.showInformationMessage("Folder skeleton created.");

      // Step 4: worktree opt-in
      const worktreeAnswer = await vscode.window.showInformationMessage(
        "Set up git worktrees for parallel session sets? (Recommended for large projects)",
        { modal: true },
        "Yes — set up worktrees",
        "No — keep it simple"
      );

      if (worktreeAnswer === "Yes — set up worktrees") {
        try {
          // Need at least one commit before adding worktrees
          const status = await git.status();
          if (status.files.length > 0 || !(await git.log().catch(() => null))) {
            await git.commit("init", { "--allow-empty": null });
          }
          const worktreesDir = path.join(projectDir, "worktrees");
          if (!fs.existsSync(worktreesDir)) fs.mkdirSync(worktreesDir, { recursive: true });
          await git.raw(["worktree", "add", path.join(worktreesDir, "main"), "HEAD"]);
          vscode.window.showInformationMessage(
            "Worktrees set up. Work from worktrees/main/ for parallel sessions."
          );
        } catch (err) {
          vscode.window.showWarningMessage(
            `Worktree setup skipped: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      // Step 5: open folder and launch wizard
      const openFolder = await vscode.window.showInformationMessage(
        "Project scaffolded. Open the folder now?",
        "Open Folder"
      );
      if (openFolder === "Open Folder") {
        vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(projectDir));
      } else {
        vscode.commands.executeCommand("dabbler.getStarted");
      }
    })
  );
}
