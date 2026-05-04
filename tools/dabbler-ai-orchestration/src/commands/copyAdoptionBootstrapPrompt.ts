import * as vscode from "vscode";

const ADOPTION_BOOTSTRAP_PROMPT = `Read https://raw.githubusercontent.com/darndestdabbler/dabbler-ai-orchestration/master/docs/adoption-bootstrap.md and follow it for this workspace.

Gather all decisions in dialog with me first. Don't write any files until you've shown me a numbered checklist of what you plan to do and I've approved it. I can interrupt at any time.`;

export function registerCopyAdoptionBootstrapPromptCommand(
  context: vscode.ExtensionContext,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabbler.copyAdoptionBootstrapPrompt",
      async () => {
        await vscode.env.clipboard.writeText(ADOPTION_BOOTSTRAP_PROMPT);
        vscode.window.showInformationMessage(
          "Copied. Paste into any AI chat (Claude Code / Gemini / GPT) and the AI will take over.",
        );
      },
    ),
  );
}
