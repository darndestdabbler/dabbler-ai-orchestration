// The copyable run-prompt commands.
//
// Two commands write the framework's trigger phrase to the clipboard:
//
//   dabbler.copyStartNextSessionPrompt  (a repository with work left)
//   dabbler.copySessionRunPrompt        (the one next-runnable session row)
//
// Prompts reference file paths from the repository root and NEVER embed
// file contents — the artifacts under review are read by the engine that
// receives the prompt, not pasted into it.

import * as vscode from "vscode";
import { SessionRecord, SessionsRepository } from "../types";
import {
  START_NEXT_SESSION_PROMPT,
  sessionOffersRunPrompt,
} from "../providers/rowMenuHelpers";
import { asRepositoryNode, asSessionNode } from "./workExplorerTreeCommands";

/**
 * The run prompt for a SESSION row, or `null` when that row must not
 * offer one.
 *
 * The text is the repository-level phrase unchanged — deliberately the
 * SAME string, because it is the framework's documented trigger and this
 * mints no new vocabulary. What is session-scoped is the GATE:
 * `sessionOffersRunPrompt` allows exactly the row that phrase resolves
 * to, so the prompt on a row always starts that row's session.
 *
 * The toast names the session number rather than echoing the phrase, so
 * the operator can see at a glance that the row they clicked is the one
 * that will run.
 */
export function planSessionRunPrompt(
  repository: SessionsRepository,
  session: SessionRecord,
): { text: string; toast: string } | null {
  if (!sessionOffersRunPrompt(repository, session)) return null;
  return {
    text: START_NEXT_SESSION_PROMPT,
    toast: `Copied: start session ${session.number} of ${repository.label}`,
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
      async (arg: unknown) => {
        const node = asRepositoryNode(arg);
        if (!node) return;
        await copyToClipboard(
          START_NEXT_SESSION_PROMPT,
          `Copied: ${START_NEXT_SESSION_PROMPT}`,
        );
      },
    ),
    // The session row's sibling. It re-checks the gate on dispatch
    // rather than trusting the menu — `contextValue` is computed at
    // render time, so a row that has been on screen since before a
    // session closed would otherwise still copy a prompt for work that
    // has moved on. A refused invocation is silent: the entry the
    // operator clicked simply should not have been there.
    vscode.commands.registerCommand(
      "dabbler.copySessionRunPrompt",
      async (arg: unknown) => {
        const node = asSessionNode(arg);
        if (!node) return;
        const plan = planSessionRunPrompt(node.repository, node.session);
        if (!plan) return;
        await copyToClipboard(plan.text, plan.toast);
      },
    ),
  );
}
