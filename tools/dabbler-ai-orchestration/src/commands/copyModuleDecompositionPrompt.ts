// Set 094 Session 2 (spec D6 / verdict amendment 8): the module-decomposition
// copy-prompt command. A POINTER-STYLE prompt (the house copy-prompt pattern —
// copyPromptCommands.ts / sessionGenPrompt.ts) that instructs an AI agent to
// analyze THIS project, decompose it into MODULES, and write docs/modules.yaml
// honoring the invariants (globally-unique session-set names; `module` is a
// grouping attribute, never identity). The prompt REFERENCES repo-relative
// paths (the manifest + the project plan), never embeds their contents.
//
// It is the FOURTH ensure-write site (adjudication A): the flow runs
// `ensureModulesManifest(root)` FIRST — on this explicit user action only,
// never on activation / a passive refresh — so the AI has the canonical
// scaffold to fill in and the prompt's pointer to docs/modules.yaml never
// dangles. Ordering (routed ruling s2-parallel-and-d6-architecture.json Q4):
// ensure BEFORE building the prompt.
//
// DISTINCT from the Set 093 `ai-sets` module row action (decompose a PLAN into
// session SETS): this decomposes the PROJECT into MODULES and writes the
// manifest.
//
// Two entry points share ONE flow (`runCopyModuleDecompositionPromptFlow`):
//   - the Getting Started form's Define-modules "Copy AI decomposition prompt"
//     button (the `copy-decomposition-prompt` gettingStartedAction), and
//   - the `dabbler.copyModuleDecompositionPrompt` palette command (also the
//     target of the docs/modules.yaml header comment's reference).
//
// `ui` is the injectable VS Code surface (the openModulesManifest.ts pattern)
// so the flow is unit-testable against real temp roots under the vscode stub.

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  LEGACY_ROOT_PLAN_REL,
  MODULES_MANIFEST_DISPLAY,
  ensureModulesManifest,
} from "../utils/moduleAuthoring";

/**
 * Build the module-decomposition prompt (pure). Pointer-style: it names the
 * repo-relative manifest path and — when a repo-level project plan is present —
 * the plan path, and instructs the agent to read the repository directly.
 * `planPresent` gates the plan reference so the pointer never dangles at a
 * missing plan (a decomposition can proceed from the codebase alone).
 */
export function buildModuleDecompositionPrompt(planPresent: boolean): string {
  const planLine = planPresent
    ? `Read the repository directly — its folders and code, and the project ` +
      `plan at \`${LEGACY_ROOT_PLAN_REL}\` (read that file for the project's ` +
      `goals and scope). Nothing is inlined here.`
    : `Read the repository directly — its folders and code — to understand ` +
      `the project's areas of work. Nothing is inlined here (there is no ` +
      `\`${LEGACY_ROOT_PLAN_REL}\` yet).`;
  return (
    `Module-decomposition request (Dabbler module-organized project).\n` +
    `\n` +
    `Decompose THIS project into modules for the Dabbler AI-led workflow. A ` +
    `"module" groups related session sets by area of the project — a unit of ` +
    `work owned by ONE developer at a time (a developer may own several ` +
    `modules, but two developers should never work the same module ` +
    `concurrently; AI-speed changes make concurrent same-module work a ` +
    `constant merge-conflict source — size modules accordingly). ${planLine}\n` +
    `\n` +
    `Write your result into \`${MODULES_MANIFEST_DISPLAY}\` (already created ` +
    `from the canonical template): fill it in, preserving the header comments ` +
    `and the top-level \`modules:\` key, and replace the empty \`modules: []\` ` +
    `list with one block-style entry per module. Each entry:\n` +
    `  - slug:      kebab-case machine identity, GLOBALLY UNIQUE across modules.\n` +
    `  - title:     the display name the Work Explorer shows for the group.\n` +
    `  - codeRoots: the repo-relative code paths this module owns ([] for an\n` +
    `               integration module that only composes others).\n` +
    `  - planPath:  the module's project plan, repo-relative (e.g.\n` +
    `               docs/modules/<slug>/project-plan.md).\n` +
    `  - touches:   integration modules ONLY — the slugs of the modules it\n` +
    `               works across; owners of every touched module review its PRs.\n` +
    `\n` +
    `Hard invariants (do NOT violate):\n` +
    `  - Session-set NAMES stay globally unique across ALL modules. \`module\` ` +
    `is a GROUPING attribute, never part of a set's identity — never rename a ` +
    `set to encode its module.\n` +
    `  - Keep the file valid YAML matching the template's shape; do not rename ` +
    `or restructure the top-level \`modules:\` key.\n` +
    `  - Every path is repo-relative and forward-slashed.\n` +
    `\n` +
    `If the project is a single area of work, one module (or none — leave ` +
    `\`modules: []\`) is correct; do not invent modules to fill the file. Save ` +
    `\`${MODULES_MANIFEST_DISPLAY}\` when done — the Work Explorer regroups your ` +
    `session sets as soon as you save.\n`
  );
}

export interface CopyModuleDecompositionPromptUi {
  workspaceRoot: () => string | undefined;
  fileExists: (absPath: string) => boolean;
  copyToClipboard: (text: string) => Thenable<void>;
  showInformationMessage: (message: string) => unknown;
  showErrorMessage: (message: string) => unknown;
}

function defaultUi(): CopyModuleDecompositionPromptUi {
  return {
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    // fs.existsSync never throws — swallows errors, returns false.
    fileExists: (abs) => fs.existsSync(abs),
    copyToClipboard: (text) => vscode.env.clipboard.writeText(text),
    showInformationMessage: (m) => vscode.window.showInformationMessage(m),
    showErrorMessage: (m) => vscode.window.showErrorMessage(m),
  };
}

/**
 * Ensure docs/modules.yaml exists (create-if-absent, the FOURTH ensure-write
 * site — adjudication A, explicit action only), then copy the pointer-style
 * decomposition prompt to the clipboard. Returns true when a prompt was copied,
 * false when there was no workspace or the ensure-write failed (the copy never
 * runs on a failed ensure — the pointer must not dangle). A newly-created
 * manifest adds a one-line "filled in when the AI writes it, then SAVE" note to
 * the status message.
 */
export async function runCopyModuleDecompositionPromptFlow(
  ui: CopyModuleDecompositionPromptUi = defaultUi(),
): Promise<boolean> {
  const root = ui.workspaceRoot();
  if (!root) {
    ui.showErrorMessage("No workspace folder is open.");
    return false;
  }

  // (1) Ensure BEFORE building the prompt so the pointer to docs/modules.yaml
  // never dangles. This is the explicit-action ensure-write (never a passive
  // path — this function is reached only from the palette command / the form
  // button handler).
  let created: boolean;
  try {
    created = ensureModulesManifest(root).created;
  } catch (err) {
    ui.showErrorMessage(
      `Could not create ${MODULES_MANIFEST_DISPLAY}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }

  // (2) Build the pointer prompt (plan reference gated on presence).
  const planPresent = ui.fileExists(
    path.join(root, ...LEGACY_ROOT_PLAN_REL.split("/")),
  );
  const prompt = buildModuleDecompositionPrompt(planPresent);

  // (3) Copy.
  try {
    await ui.copyToClipboard(prompt);
  } catch (err) {
    ui.showErrorMessage(
      `Failed to copy to clipboard: ${err instanceof Error ? err.message : String(err)}`,
    );
    return false;
  }

  ui.showInformationMessage(
    created
      ? `Created ${MODULES_MANIFEST_DISPLAY} and copied the module-decomposition ` +
          `prompt. Paste it into your AI assistant; it fills in ` +
          `${MODULES_MANIFEST_DISPLAY} — then SAVE the file.`
      : `Copied the module-decomposition prompt. Paste it into your AI ` +
          `assistant; it fills in ${MODULES_MANIFEST_DISPLAY} — then SAVE the file.`,
  );
  return true;
}

/** Register the `dabbler.copyModuleDecompositionPrompt` palette command (D6). */
export function registerCopyModuleDecompositionPromptCommand(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabbler.copyModuleDecompositionPrompt",
      async () => {
        await runCopyModuleDecompositionPromptFlow();
      },
    ),
  );
}
