// Start and close a session — run, not pre-typed.
//
// These two used to write their command onto a terminal prompt and leave it
// there for the operator to press Enter on, with a stated reason: start
// needs the engine declared, and close runs gates, so both were "actions the
// operator should see and confirm".
//
// Survey finding F3 is that the reason only covers half of it. **Start does
// carry a decision — which engine and provider — and the keystroke is not
// that decision.** So the decision is asked as a decision, in a quick pick,
// and the framework runs the verb. **Close carries no decision at all**: it
// evaluates gates and reports rows, and pre-typing it asked the operator to
// confirm nothing while typing something.
//
// What is not lost is visibility. Every run reports into the command log the
// operator already reads, and the close prints its gate rows there, so
// "see what happened" survives; only "type it yourself" goes.

import * as vscode from "vscode";
import type { Router } from "dabbler-ai-router";
import type { SessionsRepository } from "../utils/fileSystem";
import { productionRouter } from "../router/host";
import { asRepositoryNode } from "./workExplorerTreeCommands";

const CHANNEL_NAME = "Dabbler Session";

/** Engine and provider travel together: identity resolves through the pair. */
interface EngineChoice {
  readonly label: string;
  readonly engine: string;
  readonly provider: string;
  readonly description: string;
}

const ENGINES: readonly EngineChoice[] = [
  {
    label: "Claude Code",
    engine: "claude-code",
    provider: "anthropic",
    description: "anthropic",
  },
  { label: "Codex", engine: "codex", provider: "openai", description: "openai" },
  { label: "Gemini", engine: "gemini", provider: "google", description: "google" },
  {
    label: "GitHub Copilot",
    engine: "copilot",
    provider: "openai",
    description: "openai — a seat also needs --model",
  },
];

export interface SessionRunUi {
  pickEngine: () => Thenable<EngineChoice | undefined>;
  report: (title: string, body: string) => void;
  showErrorMessage: (message: string) => unknown;
}

function channel(): vscode.OutputChannel {
  return vscode.window.createOutputChannel(CHANNEL_NAME);
}

export function defaultSessionRunUi(): SessionRunUi {
  return {
    pickEngine: () =>
      vscode.window
        .showQuickPick(
          ENGINES.map((entry) => ({
            label: entry.label,
            description: entry.description,
            entry,
          })),
          {
            title: "Start session — which engine is running it?",
            placeHolder: "The record attributes the session to this engine.",
            ignoreFocusOut: true,
          },
        )
        .then((picked) => picked?.entry),
    report: (title, body) => {
      const out = channel();
      out.appendLine(`--- ${title} ---`);
      out.appendLine(body.trimEnd());
      out.show(true);
    },
    showErrorMessage: (m) => vscode.window.showErrorMessage(m),
  };
}

/**
 * Register a session start, after asking the one thing only a person knows.
 *
 * The engine is the decision; running the verb is not. A cancelled pick
 * cancels the command, which is what cancelling a decision should do.
 */
export async function runStartSession(
  repository: SessionsRepository,
  ui: SessionRunUi,
  router: Router,
): Promise<boolean> {
  const picked = await ui.pickEngine();
  if (!picked) return false;
  const result = await router.session.start({
    repoRoot: repository.root,
    sessionsDir: repository.sessionsDir,
    engine: picked.engine,
    provider: picked.provider,
  });
  if (!result.ok) {
    ui.showErrorMessage(
      `Start session refused: ${result.message.trim() || `exit ${result.exitCode}`}`,
    );
    return false;
  }
  ui.report("session start", result.value.stdout);
  return true;
}

/**
 * Close the session, and show the gate rows.
 *
 * No decision is asked because none exists: the gates decide, and a refusal
 * is information the operator needs rather than something they authorise.
 */
export async function runCloseSession(
  repository: SessionsRepository,
  ui: SessionRunUi,
  router: Router,
): Promise<boolean> {
  const result = await router.session.close({
    repoRoot: repository.root,
    sessionsDir: repository.sessionsDir,
  });
  // A refused close is not an error to hide behind a toast: its rows say
  // which gate refused and what to do, and that is the whole value of it.
  ui.report("session close", result.ok ? result.value.stdout : result.message);
  if (!result.ok) {
    ui.showErrorMessage(
      "Close session refused — see the Dabbler Session output for the gate rows.",
    );
  }
  return result.ok;
}

export function registerSessionTerminalCommands(
  context: vscode.ExtensionContext,
  router: Router = productionRouter(),
  ui: SessionRunUi = defaultSessionRunUi(),
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabblerSessionSets.startSession",
      async (arg: unknown) => {
        const node = asRepositoryNode(arg);
        if (!node) return;
        await runStartSession(node.repository, ui, router);
      },
    ),
    vscode.commands.registerCommand(
      "dabblerSessionSets.closeSession",
      async (arg: unknown) => {
        const node = asRepositoryNode(arg);
        if (!node) return;
        await runCloseSession(node.repository, ui, router);
      },
    ),
  );
}
