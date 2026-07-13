// Set 097 (S1 discovery supplementary Major): a standalone command that
// re-runs the Copilot seat probe + confirmation-gated transport.profile
// write OUTSIDE the Getting Started form's Build action.
//
// The gap this closes: the persistent "chose Copilot but unconfirmed"
// System Status note (copilotSeatSetup.ts's
// deriveCopilotSeatChosenUnconfirmed) told the operator to re-run
// `python -m ai_router.copilot_catalog --refresh ...` — but that bare CLI
// invocation only refreshes the seat-scoped lockfile; it never invokes
// performCopilotSeatSetup, so router-config.yaml's transport.profile is
// NEVER promoted and the note NEVER clears. Worse, the Build action (the
// only OTHER path to performCopilotSeatSetup) only renders while the
// Getting Started form is showing — once the workspace has any session
// sets, the form is gone and there was NO way left to re-confirm at all.
//
// This command reuses runCopilotSeatSetupWithProgress UNCHANGED (same
// progress notification, same cancellation/teardown hygiene, same
// per-outcome honest messaging) against an ALREADY-scaffolded workspace's
// existing `.venv` — no re-scaffold, matching the toast's own promise.

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { runCopilotSeatSetupWithProgress } from "./gitScaffold";
import { writeCopilotSeatStatusMarker } from "../utils/copilotSeatSetup";
import { makeFileOps } from "./installAiRouterCommands";

export function registerCopilotSeatSetupCommand(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabblerSessionSets.setUpCopilotSeat",
      () => runSetUpCopilotSeat(context),
    ),
  );
}

async function runSetUpCopilotSeat(
  context: vscode.ExtensionContext,
): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    vscode.window.showErrorMessage(
      "Open a workspace folder before running Dabbler: Set Up Copilot Seat.",
    );
    return;
  }
  const venvPath = path.join(root, ".venv");
  if (!fs.existsSync(venvPath)) {
    vscode.window.showErrorMessage(
      "No .venv found in this workspace — run \"Build project structure\" " +
        "(Getting Started form) or \"Dabbler: Install ai-router\" first, " +
        "then re-run this command.",
    );
    return;
  }
  // The operator is explicitly re-engaging Copilot right now — record it
  // durably BEFORE the attempt, same contract as the Build action's
  // recordSeatChoice(dir, true). If this attempt also fails to confirm,
  // the persistent note stays accurate; if it confirms, transport.profile
  // flips to copilot-cli and the note suppresses regardless of the marker.
  writeCopilotSeatStatusMarker(root, makeFileOps());
  await runCopilotSeatSetupWithProgress(context, root, venvPath);
}
