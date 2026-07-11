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
  Tier,
  resolveBundledTemplateDir,
} from "../utils/consumerBootstrap";
import { resolveDurableTier } from "../utils/tierMarkerStore";

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
 * Set 077 S3 (critique M6): the tier callout the auto-opened doc leads
 * with once the workspace carries a durable tier choice. The doc body
 * necessarily describes BOTH tiers (it teaches the choice), which is
 * exactly the "still says Full" perception on a Lightweight pick — the
 * callout names the recorded choice up front so the operator reads the
 * two-tier copy as reference, not as their configuration.
 */
export function tierCalloutMarkdown(tier: Tier): string {
  const label = tier === "lightweight" ? "Lightweight" : "Full";
  const other = tier === "lightweight" ? "Full" : "Lightweight";
  return (
    `> **Your project is set up for the ${label} tier** (recorded in ` +
    "`.dabbler/tier`). Step 1's tier descriptions below cover both " +
    `options for reference — the **${other}-tier** setup notes do not ` +
    "apply to this project. To change tiers, right-click a session set " +
    "in the Work Explorer and use **Switch Tier…**.\n"
  );
}

/**
 * Insert the tier callout directly under the doc's H1 (or at the top
 * when no H1 is found). Fence-aware (S3 code-review Minor 8): a `# `
 * shell comment inside a ``` code block must not be mistaken for the
 * heading — the doc teaches CLI usage. Pure so the Layer-2 suite pins
 * the placement and the copy without a host.
 */
export function renderTierAwareGettingStarted(
  docText: string,
  tier: Tier,
): string {
  const callout = tierCalloutMarkdown(tier);
  const lines = docText.split("\n");
  let inFence = false;
  let h1Idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && /^#\s/.test(lines[i])) {
      h1Idx = i;
      break;
    }
  }
  if (h1Idx === -1) return `${callout}\n${docText}`;
  lines.splice(h1Idx + 1, 0, "", callout.trimEnd());
  return lines.join("\n");
}

/**
 * Open the Getting Started instructions in a markdown preview beside
 * the form. Fail-open — never throws.
 *
 * Set 077 S3 (critique M6): when the workspace carries a durable tier
 * resolution (`.dabbler/tier` marker → router-config inference), the
 * preview leads with the recorded-choice callout — materialized into
 * globalStorage so neither the workspace copy nor the bundled template
 * is mutated. With no durable signal (a fresh folder, mid-choice) the
 * doc opens as-is.
 *
 * Constraints of the globalStorage materialization (S3 code-review
 * Minor 7): the doc template must stay free of RELATIVE links/assets
 * (it is — external https links only; same constraint the pre-existing
 * bundled-copy path imposes), and the single storage file is rewritten
 * on every open, so a stale copy from another window's workspace never
 * outlives the next open.
 */
export async function openGettingStartedDoc(
  context: vscode.ExtensionContext,
): Promise<void> {
  try {
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const workspaceDoc = workspaceGettingStartedDoc(root);
    const durable = root ? resolveDurableTier(root) : null;
    let docPath: string;
    if (durable) {
      const src =
        workspaceDoc ??
        path.join(
          resolveBundledTemplateDir(context.extensionPath),
          GETTING_STARTED_TEMPLATE_FILENAME,
        );
      const text = fs.readFileSync(src, "utf8");
      const dstDir = context.globalStorageUri.fsPath;
      fs.mkdirSync(dstDir, { recursive: true });
      docPath = path.join(dstDir, "getting-started.md");
      fs.writeFileSync(
        docPath,
        renderTierAwareGettingStarted(text, durable.tier),
        "utf8",
      );
    } else {
      docPath = workspaceDoc ?? materializeBundledDoc(context);
    }
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
