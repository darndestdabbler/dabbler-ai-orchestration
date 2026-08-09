// Set 060 Session 3 (spec D8): open the static Getting Started
// instructions doc in the editor pane. The interactive form (the
// Work Explorer's Getting Started surface) carries the live
// state; this doc is its static teaching companion — the operator's
// 5-step copy from the design mockup, no live checkmarks (D2).
//
// Source preference:
//   1. The WORKSPACE copy (docs/dabbler/getting-started.md) when the
//      structure scaffold has written it — the operator may have
//      customized it, and relative links resolve in-repo.
//   2. The BUNDLED copy (dist/templates/consumer-bootstrap/
//      getting-started.md.template) otherwise — the template is
//      token-free by design, so it renders correctly before any
//      scaffold has run (the no-folder and pre-build states). It is
//      materialized into globalStorage with a .md name so VS Code's
//      markdown preview picks it up.
//
// Opened as a markdown PREVIEW (the doc is for reading, not editing),
// fail-open: a missing bundle or preview failure logs a warning and
// never blocks the form.

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  GETTING_STARTED_REL_PATH,
  GETTING_STARTED_TEMPLATE_FILENAME,
  resolveBundledTemplateDir,
} from "../utils/consumerBootstrap";

/** Absolute path of the workspace copy, or undefined when absent. */
export function workspaceGettingStartedDoc(
  workspaceRoot: string | undefined,
): string | undefined {
  if (!workspaceRoot) return undefined;
  const abs = path.join(workspaceRoot, ...GETTING_STARTED_REL_PATH.split("/"));
  try {
    return fs.statSync(abs).isFile() ? abs : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Copy the bundled template into globalStorage under a `.md` name so
 * the markdown preview renders it. Re-copied on every open (cheap, and
 * keeps the storage copy current across extension updates).
 */
function materializeBundledDoc(context: vscode.ExtensionContext): string {
  const src = path.join(
    resolveBundledTemplateDir(context.extensionPath),
    GETTING_STARTED_TEMPLATE_FILENAME,
  );
  const dstDir = context.globalStorageUri.fsPath;
  fs.mkdirSync(dstDir, { recursive: true });
  const dst = path.join(dstDir, "getting-started.md");
  fs.copyFileSync(src, dst);
  return dst;
}

/**
 * Open the Getting Started instructions in a markdown preview beside
 * the form. Fail-open — never throws.
 */
export async function openGettingStartedDoc(
  context: vscode.ExtensionContext,
): Promise<void> {
  try {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const docPath =
      workspaceGettingStartedDoc(root) ?? materializeBundledDoc(context);
    await vscode.commands.executeCommand(
      "markdown.showPreview",
      vscode.Uri.file(docPath),
    );
  } catch (err) {
    console.warn("[gettingStarted] could not open the instructions doc", err);
  }
}

/**
 * Set 060 S3 (spec S3 step 4): `dabbler.getStarted` repointed. The
 * Set 021 WizardPanel webview (webview/wizard.html) is retired — the
 * Work Explorer's Getting Started form IS the interactive
 * surface now (D1), and this command converges on it: focus the
 * Explorer view (which renders the form when the workspace has no
 * session sets) and open the static instructions doc beside it (D8).
 */
export function registerGetStartedCommand(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.getStarted", async () => {
      // VS Code auto-contributes `<viewId>.focus` for every view.
      try {
        await vscode.commands.executeCommand("dabblerSessionSets.focus");
      } catch (err) {
        console.warn("[gettingStarted] could not focus the Work Explorer view", err);
      }
      await openGettingStartedDoc(context);
    }),
  );
}
