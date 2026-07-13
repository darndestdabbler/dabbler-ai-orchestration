// Set 099 Session 1 (verdict decision 1): the `Rename Module…` flow — pick a
// declared module, enter a new slug and/or title (validated live), confirm the
// exact disposition (which N sets get restamped), then run the transactional
// `renameModule` writer in utils/moduleAuthoring.ts. Palette-only here
// (`dabbler.renameModule`); the module-row management action is Set 100's.
//
// `ui` is the injectable VS Code surface (the assignLegacySets.ts /
// newModule.ts pattern) so the flow is unit-testable under the vscode stub.
// The writer's preflights are authoritative — this flow only gathers the
// target + new values and reports; a refusal leaves every file untouched.

import * as vscode from "vscode";
import {
  MODULES_MANIFEST_DISPLAY,
  INVALID_MANIFEST_MESSAGE,
  classifyModulesManifest,
  renameModule,
  unknownModuleMessage,
  validateNewModuleSlug,
} from "../utils/moduleAuthoring";
import { readAllSessionSets } from "../utils/fileSystem";
import { ModuleManifestEntry, SessionSet } from "../types";

export interface RenameModuleUi {
  /** Pick the module to rename (a QuickPick of declared modules). */
  pickModule(entries: ModuleManifestEntry[]): Thenable<ModuleManifestEntry | undefined>;
  /** Prompt for the new slug (prefilled with the current slug); `validate`
   * returns an error string or undefined and drives live input validation. */
  promptNewSlug(
    currentSlug: string,
    validate: (value: string) => string | undefined,
  ): Thenable<string | undefined>;
  /** Prompt for the new title (prefilled with the current title). */
  promptNewTitle(currentTitle: string): Thenable<string | undefined>;
  /** Two-step confirm (modal). Returns true only on the affirmative click. */
  confirm(summary: string, detail: string): Thenable<boolean>;
  showInformationMessage(message: string): unknown;
  showErrorMessage(message: string): unknown;
  workspaceRoot(): string | undefined;
  readSets(): SessionSet[];
}

function defaultUi(): RenameModuleUi {
  return {
    pickModule: async (entries) => {
      const picked = await vscode.window.showQuickPick(
        entries.map((e) => ({
          label: e.title,
          description: e.slug,
          entry: e,
        })),
        { placeHolder: "Which module do you want to rename?", ignoreFocusOut: true },
      );
      return picked?.entry;
    },
    promptNewSlug: (currentSlug, validate) =>
      vscode.window.showInputBox({
        prompt: "New module slug (kebab-case) — leave unchanged to keep it",
        value: currentSlug,
        ignoreFocusOut: true,
        validateInput: (v) => validate(v) ?? null,
      }),
    promptNewTitle: (currentTitle) =>
      vscode.window.showInputBox({
        prompt: "New module title (display name) — leave unchanged to keep it",
        value: currentTitle,
        ignoreFocusOut: true,
      }),
    confirm: async (summary, detail) => {
      const choice = await vscode.window.showWarningMessage(
        summary,
        { modal: true, detail },
        "Rename Module",
      );
      return choice === "Rename Module";
    },
    showInformationMessage: (m) => vscode.window.showInformationMessage(m),
    showErrorMessage: (m) => vscode.window.showErrorMessage(m),
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    readSets: () => readAllSessionSets(),
  };
}

/**
 * Set 100 Session 2 (explicit-target seam): a row/context invocation
 * already carries its module, so the QuickPick is skipped entirely — a
 * slug that no longer resolves (a stale row) fails LOUD rather than
 * falling back to the picker. Absent → today's interactive behavior (the
 * palette command keeps its QuickPick for keyboard-driven use).
 */
export interface RenameModuleOptions {
  preselectedSlug?: string;
}

/**
 * Run the rename-module flow. Returns true when the writer changed at least
 * one file (so callers refresh the Explorer). Gathers a declared module, the
 * new slug and/or title, and an affirmative confirm that names the sets that
 * will be restamped; the writer owns every preflight and the transaction.
 */
export async function runRenameModuleFlow(
  ui: RenameModuleUi = defaultUi(),
  opts?: RenameModuleOptions,
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
        `"Dabbler: New Module" to declare one.`,
    );
    return false;
  }

  let target: ModuleManifestEntry | undefined;
  if (opts && opts.preselectedSlug !== undefined) {
    target = entries.find((e) => e.slug === opts.preselectedSlug);
    if (!target) {
      ui.showErrorMessage(unknownModuleMessage(opts.preselectedSlug));
      return false;
    }
  } else {
    target = await ui.pickModule(entries);
    if (!target) return false; // cancelled
  }

  // Live slug validation: shape + uniqueness among the OTHER declared slugs
  // (keeping the current slug is allowed and means "no slug change").
  const otherSlugs = entries.map((e) => e.slug).filter((s) => s !== target.slug);
  const rawSlug = await ui.promptNewSlug(target.slug, (value) => {
    const v = (value ?? "").trim();
    if (v === target.slug) return undefined; // unchanged — allowed
    return validateNewModuleSlug(v, otherSlugs) ?? undefined;
  });
  if (rawSlug === undefined) return false; // cancelled

  const rawTitle = await ui.promptNewTitle(target.title);
  if (rawTitle === undefined) return false; // cancelled

  const newSlug = rawSlug.trim();
  const newTitle = rawTitle.trim();
  const slugChanging = newSlug !== "" && newSlug !== target.slug;
  const titleChanging = newTitle !== "" && newTitle !== target.title;
  if (!slugChanging && !titleChanging) {
    ui.showInformationMessage(
      `Nothing to change — the slug and title are unchanged for "${target.slug}".`,
    );
    return false;
  }

  // Affected sets (only restamped when the slug changes) — read from the
  // primary root, the manifest the writer validates against.
  const affected = slugChanging
    ? ui
        .readSets()
        .filter((s) => s.root === root && s.config?.module === target.slug)
        .map((s) => s.name)
        .sort()
    : [];

  const changeLines: string[] = [];
  if (slugChanging) changeLines.push(`slug: ${target.slug} → ${newSlug}`);
  if (titleChanging) changeLines.push(`title: "${target.title}" → "${newTitle}"`);
  const restampNote = slugChanging
    ? affected.length > 0
      ? `Restamps module: in ${affected.length} set(s): ${affected.join(", ")}.`
      : `No session sets are stamped module: ${target.slug} — only the manifest changes.`
    : "Title-only change — no session sets are touched.";
  const confirmed = await ui.confirm(
    `Rename module "${target.slug}"?`,
    `${changeLines.join("\n")}\n\n${restampNote}\n\nEvery file is rewritten ` +
      `transactionally; any failure rolls the whole change back.`,
  );
  if (!confirmed) return false;

  const report = renameModule(root, target.slug, {
    newSlug: slugChanging ? newSlug : undefined,
    newTitle: titleChanging ? newTitle : undefined,
  });

  if (report.refused) {
    ui.showErrorMessage(
      `Rename refused — ${report.refused.reason} Every file was left untouched.`,
    );
    return false;
  }
  if (report.writeFailed) {
    const wf = report.writeFailed;
    ui.showErrorMessage(
      wf.rolledBack
        ? `Rename failed: ${wf.reason}. All changes were rolled back — the ` +
            `workspace is unchanged.`
        : `Rename failed: ${wf.reason}. Rollback ALSO failed — reconcile ` +
            `docs/modules.yaml and the affected spec.md files from git.`,
    );
    return false;
  }

  const parts: string[] = [];
  if (report.slugChanged) parts.push(`slug → ${report.newSlug}`);
  if (report.titleChanged) parts.push(`title → "${report.newTitle}"`);
  const restampSummary = report.restamped.length
    ? ` Restamped ${report.restamped.length} set(s): ${report.restamped.join(", ")}.`
    : "";
  ui.showInformationMessage(
    `Renamed module (${parts.join(", ")}).${restampSummary}`,
  );
  return true;
}

export function registerRenameModuleCommand(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.renameModule", async () => {
      await runRenameModuleFlow();
    }),
  );
}
