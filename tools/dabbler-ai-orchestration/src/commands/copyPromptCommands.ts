// Copyable-review-prompt commands (Set 048 spec §3.2 + §3.3 L5).
//
// Four commands write a single path-reference prompt to the clipboard:
//
//   dabbler.copySpecReviewPrompt            (always enabled)
//   dabbler.copySessionAccomplishmentsPrompt (>=1 completed session)
//   dabbler.copySetAccomplishmentsPrompt    (set status === "complete")
//   dabbler.copyStartNextSessionPrompt      (non-terminal rows)
//
// L1: prompts MUST reference file paths from repo root, NEVER embed
// file contents. This module computes paths via `path.relative(set.root, …)`
// and lists them in the prompt body. L1 applies to the SESSION-SET
// ARTIFACTS being reviewed (spec.md, activity-log.json, change-log.md)
// — the things the reviewer evaluates.
//
// §3.9 carve-out: `docs/review-criteria/<kind>.md` is the documented
// exception. Those files are operator-authored META-INSTRUCTIONS about
// how to review (not the artifact under review). §3.9 explicitly says
// the "file's content is embedded into the prompt's 'optional review
// criteria' slot." Embedding short customizable reviewer instructions
// is the intended UX — the operator wrote the file to be spliced into
// every prompt.

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { SessionSet } from "../types";
import {
  CROSS_PROVIDER_VERIFICATION_REL_PATH,
  loadTemplateBundle,
  renderCrossProviderVerification,
  resolveBundledTemplateDir,
  structureOnlyContext,
} from "../utils/consumerBootstrap";

interface SetItem extends vscode.TreeItem {
  set: SessionSet;
}

/**
 * Idempotently write/refresh the canonical cross-provider verification
 * doc into the workspace BEFORE a pointer prompt is emitted (Set 077
 * S4, critique M2). Consumer repos bootstrapped before Set 077 get the
 * doc on first use after upgrading the extension — no re-bootstrap.
 * The doc follows the start-here.md generated-never-hand-edited
 * pattern, so refreshing a stale copy to the bundled content is
 * correct by contract. Returns true when the doc is present (written
 * or already current); false on any failure — the prompt's fallback
 * line covers that case, so failures are non-fatal by design.
 */
export function ensureCrossProviderVerificationDoc(
  extensionPath: string,
  root: string,
): boolean {
  try {
    const bundle = loadTemplateBundle(resolveBundledTemplateDir(extensionPath));
    const ctx = structureOnlyContext(
      path.basename(root),
      new Date().toISOString().slice(0, 10),
    );
    const rendered = renderCrossProviderVerification(bundle, ctx);
    const target = path.join(
      root,
      ...CROSS_PROVIDER_VERIFICATION_REL_PATH.split("/"),
    );
    let existing: string | null = null;
    try {
      existing = fs.readFileSync(target, "utf8");
    } catch {
      existing = null;
    }
    if (existing !== null && existing.replace(/\r\n/g, "\n") === rendered) {
      return true;
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, rendered, { encoding: "utf8" });
    return true;
  } catch {
    return false;
  }
}

// Defense-in-depth: a backtick inside the slug would break the
// backtick-delimited L5 template literal payload. Session-set slugs
// are filesystem directory names (Windows disallows backticks in
// filenames; POSIX permits them but it would be a weird choice), so
// the sanitize is unlikely to fire in practice — but the cost is
// trivial and the failure mode (malformed markdown) is silent.
export function sanitizeSlugForPrompt(slug: string): string {
  return slug.replace(/`/g, "'");
}

export function buildStartNextSessionPrompt(set: SessionSet): string {
  return `Start the next session of \`${sanitizeSlugForPrompt(set.name)}\`.`;
}

async function copyToClipboard(text: string, statusMessage: string): Promise<void> {
  try {
    await vscode.env.clipboard.writeText(text);
    vscode.window.setStatusBarMessage(statusMessage, 4000);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    vscode.window.showWarningMessage(`Failed to copy to clipboard: ${detail}`);
  }
}

export function registerCopyPromptCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabbler.copyStartNextSessionPrompt",
      async (item: SetItem) => {
        if (!item?.set) return;
        const prompt = buildStartNextSessionPrompt(item.set);
        await copyToClipboard(
          prompt,
          `Copied: Start the next session of ${item.set.name}`,
        );
      },
    ),
  );
}
