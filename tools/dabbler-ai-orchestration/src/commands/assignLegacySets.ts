// Set 093 Session 2 (verdict amendment 2): the `Assign legacy sets to
// module…` flow — pick a target module + one-or-more unstamped ("legacy")
// session sets, then stamp `module: <slug>` into each chosen set's spec.md
// via the format-preserving writer in utils/moduleAuthoring.ts. Surfaced on
// the pseudo `Unassigned` module row (strip + context menu) and as the
// `dabbler.assignLegacySetsToModule` palette command (keyboard-driven).
//
// `ui` is the injectable VS Code surface (the planImport.ts / newModule.ts
// pattern) so the flow is unit-testable under the vscode stub. The writer's
// guards are authoritative — this flow only gathers the target + sets and
// reports; a refusal leaves every file untouched.

import * as vscode from "vscode";
import {
  MODULES_MANIFEST_DISPLAY,
  INVALID_MANIFEST_MESSAGE,
  assignLegacySetsToModule,
  classifyModulesManifest,
} from "../utils/moduleAuthoring";
import { readAllSessionSets } from "../utils/fileSystem";
import { ModuleManifestEntry, SessionSet } from "../types";

export interface AssignLegacyUi {
  /** Pick the target module (a QuickPick of declared modules). */
  pickTargetModule(
    entries: ModuleManifestEntry[],
  ): Thenable<ModuleManifestEntry | undefined>;
  /** Pick one-or-more legacy sets (a canPickMany QuickPick). */
  pickSets(candidates: SessionSet[]): Thenable<SessionSet[] | undefined>;
  showInformationMessage(message: string): unknown;
  showErrorMessage(message: string): unknown;
  workspaceRoot(): string | undefined;
  readSets(): SessionSet[];
}

function defaultUi(): AssignLegacyUi {
  return {
    pickTargetModule: async (entries) => {
      const picked = await vscode.window.showQuickPick(
        entries.map((e) => ({
          label: e.title,
          description: e.slug,
          entry: e,
        })),
        {
          placeHolder: "Assign the selected sets to which module?",
          ignoreFocusOut: true,
        },
      );
      return picked?.entry;
    },
    pickSets: async (candidates) => {
      const picked = await vscode.window.showQuickPick(
        candidates.map((s) => ({ label: s.name, set: s })),
        {
          placeHolder: "Select the legacy (unassigned) sets to assign",
          canPickMany: true,
          ignoreFocusOut: true,
        },
      );
      return picked?.map((p) => p.set);
    },
    showInformationMessage: (m) => vscode.window.showInformationMessage(m),
    showErrorMessage: (m) => vscode.window.showErrorMessage(m),
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    readSets: () => readAllSessionSets(),
  };
}

/**
 * Run the assign-legacy flow. Returns true when at least one set's spec.md
 * was stamped (so callers refresh the Explorer). Candidate sets are the
 * UNSTAMPED ("legacy") sets under the primary root — those carrying no raw
 * `module:` in their config block; a set already stamped to a fallback /
 * declared module is not offered (reassigning is not a legacy stamp).
 */
export async function runAssignLegacySetsFlow(
  ui: AssignLegacyUi = defaultUi(),
): Promise<boolean> {
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showErrorMessage("No workspace folder is open.");
    return false;
  }

  const classified = classifyModulesManifest(root);
  if (classified.kind === "invalid") {
    ui.showErrorMessage(INVALID_MANIFEST_MESSAGE);
    return false;
  }
  const entries = classified.kind === "present" ? classified.entries : [];
  if (entries.length === 0) {
    ui.showInformationMessage(
      `No modules are declared in ${MODULES_MANIFEST_DISPLAY} yet. Run ` +
        `"Dabbler: New Module" to declare one, then assign sets to it.`,
    );
    return false;
  }

  // Legacy candidates: unstamped sets under the primary root (the manifest
  // we validate the target against). A set with a raw `module:` stamp —
  // declared or fallback — is not a legacy set.
  const candidates = ui
    .readSets()
    .filter((s) => s.root === root && !s.config?.module);
  if (candidates.length === 0) {
    ui.showInformationMessage(
      "No unassigned session sets to assign — every set already declares a module.",
    );
    return false;
  }

  const target = await ui.pickTargetModule(entries);
  if (!target) return false; // cancelled

  const chosen = await ui.pickSets(candidates);
  if (!chosen || chosen.length === 0) return false; // cancelled / none

  const report = assignLegacySetsToModule(
    root,
    target.slug,
    chosen.map((s) => ({ name: s.name, specAbs: s.specPath })),
  );

  if (report.refused) {
    ui.showErrorMessage(
      `No sets were assigned — ${report.refused.reason}. Every spec.md was left untouched.`,
    );
    return false;
  }
  if (report.writeFailed) {
    const wf = report.writeFailed;
    // Each write is atomic (temp → verify → rename), so the failed file is
    // ALWAYS intact — the only files that changed are those in `written`.
    const tail = wf.written.length
      ? `Already stamped before the failure: ${wf.written.join(", ")}.`
      : "No files were changed.";
    ui.showErrorMessage(
      `Assigning to "${target.title}" failed on ${wf.setName}: ${wf.reason}. ${tail}`,
    );
    return wf.written.length > 0;
  }

  const parts: string[] = [];
  if (report.stamped.length) {
    parts.push(
      `Stamped module: ${target.slug} into ${report.stamped.length} set(s) ` +
        `(${report.stamped.join(", ")})`,
    );
  }
  if (report.alreadyAssigned.length) {
    parts.push(
      `${report.alreadyAssigned.length} already assigned (${report.alreadyAssigned.join(", ")})`,
    );
  }
  ui.showInformationMessage(
    parts.length
      ? `${parts.join("; ")}.`
      : `Nothing to change — the selected sets already declare module: ${target.slug}.`,
  );
  return report.stamped.length > 0;
}

export function registerAssignLegacySetsCommand(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabbler.assignLegacySetsToModule",
      async () => {
        await runAssignLegacySetsFlow();
      },
    ),
  );
}
