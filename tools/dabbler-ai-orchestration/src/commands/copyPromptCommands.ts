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

import * as vscode from "vscode";
import { SessionRecord, SessionSet } from "../types";
import { sessionOffersRunPrompt } from "../providers/rowMenuHelpers";
import { asSessionNode } from "./workExplorerTreeCommands";

interface SetItem extends vscode.TreeItem {
  set: SessionSet;
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

/**
 * The run prompt for a SESSION row, or `null` when that row must not
 * offer one (Set 115 S3).
 *
 * The text is `buildStartNextSessionPrompt` unchanged — deliberately the
 * SAME string the set row's L5 shortcut copies, because it is the
 * framework's documented trigger phrase and this session mints no new
 * vocabulary. What is session-scoped is the GATE:
 * `sessionOffersRunPrompt` allows exactly the row that phrase resolves
 * to, so the prompt on a row always starts that row's session.
 *
 * The toast names the session number rather than echoing the phrase, so
 * the operator can see at a glance that the row they clicked is the one
 * that will run.
 */
export function planSessionRunPrompt(
  set: SessionSet,
  session: SessionRecord,
): { text: string; toast: string } | null {
  if (!sessionOffersRunPrompt(set, session)) return null;
  return {
    text: buildStartNextSessionPrompt(set),
    toast: `Copied: Start session ${session.number} of ${set.name}`,
  };
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
    // Set 115 S3: the session row's sibling. It re-checks the gate on
    // dispatch rather than trusting the menu — `contextValue` is computed
    // at render time, so a row that has been on screen since before a
    // session closed would otherwise still copy a prompt for a set that
    // has moved on. A refused invocation is silent: the entry the
    // operator clicked simply should not have been there.
    vscode.commands.registerCommand(
      "dabbler.copySessionRunPrompt",
      async (arg: unknown) => {
        const node = asSessionNode(arg);
        if (!node) return;
        const plan = planSessionRunPrompt(node.set, node.session);
        if (!plan) return;
        await copyToClipboard(plan.text, plan.toast);
      },
    ),
  );
}
