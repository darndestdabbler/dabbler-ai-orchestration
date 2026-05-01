import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

const PLAN_PATH = path.join("docs", "planning", "project-plan.md");

const PROMPT_SYSTEM = `You are a session-set architect for an AI-led software development workflow.

Given a project plan, decompose it into a sequence of session sets. Each session set is a
focused, independently deployable unit of work that one AI coding session can complete.

For each session set, produce a spec.md file with this exact structure:

\`\`\`markdown
# <slug> — <short title>

## Goal
<1–2 sentence goal>

## Deliverables
- <deliverable 1>
- <deliverable 2>

## Session Set Configuration
\`\`\`yaml
totalSessions: <estimate 1–6>
requiresUAT: <true|false>
requiresE2E: <true|false>
effort: <low|normal|high>
\`\`\`

## Context
<any background the AI needs — key files, existing patterns, constraints>
\`\`\`

Guidelines:
- Name each session set with a kebab-case slug (e.g., user-auth, product-catalog)
- Order sets so earlier ones unblock later ones
- Keep scope tight: prefer 2–4 sessions per set
- Set requiresUAT: true only for user-visible features that need manual verification
- Set requiresE2E: true only if automated browser tests are relevant
- Set effort: low for simple changes, high for complex multi-file refactors

When you scaffold each session-set folder (\`docs/session-sets/<slug>/\`)
alongside its \`spec.md\`, also create a \`session-state.json\` file with
\`status: "not-started"\`. The full not-started shape is:

\`\`\`json
{
  "schemaVersion": 2,
  "sessionSetName": "<slug>",
  "currentSession": null,
  "totalSessions": <integer from spec, or null>,
  "status": "not-started",
  "lifecycleState": null,
  "startedAt": null,
  "completedAt": null,
  "verificationVerdict": null,
  "orchestrator": null
}
\`\`\`

Every session-set folder is expected to carry a \`session-state.json\`
from creation onward. Readers consult \`status\` directly rather than
inferring state from file presence. If you forget, the workflow's
lazy-synthesis fallback will create one on first read, but creating
it up front keeps the folder self-describing.
`;

export function registerSessionGenPromptCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.generateSessionSetPrompt", async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) {
        vscode.window.showErrorMessage("No workspace folder is open.");
        return;
      }

      const planPath = path.join(root, PLAN_PATH);
      if (!fs.existsSync(planPath)) {
        const action = await vscode.window.showWarningMessage(
          `No project plan found at ${PLAN_PATH}. Import one first?`,
          "Import Plan"
        );
        if (action === "Import Plan") vscode.commands.executeCommand("dabbler.importPlan");
        return;
      }

      const planText = fs.readFileSync(planPath, "utf8");
      const prompt = `${PROMPT_SYSTEM}\n\n---\n\nProject plan:\n\n${planText}`;

      await vscode.env.clipboard.writeText(prompt);
      vscode.window.showInformationMessage(
        "Session-set generation prompt copied to clipboard. " +
        "Paste it into your AI assistant. When you receive the specs, save each one to " +
        "docs/session-sets/<slug>/spec.md.\n\n" +
        "Cost reminder: each session set typically costs $0.10–$2.00 depending on model and effort. " +
        "Review the generated specs before running all sessions.",
        { modal: false }
      );
    })
  );
}
