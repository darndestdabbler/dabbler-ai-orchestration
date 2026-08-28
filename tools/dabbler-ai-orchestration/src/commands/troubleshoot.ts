import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import { SESSIONS_REL, hasSessionsRoot } from "../utils/fileSystem";
import { pythonModuleFor } from "../router/pythonSpawnRouter";

/**
 * A router command line for an operator to run by hand, with the module
 * taken from the router's own verb table rather than typed here. Every
 * `ai_router.<x>` string this file used to carry was a second statement
 * of the same fact, and one of them (`ai_router.report`) had been wrong
 * since set 109 removed the module — printed to an operator who was
 * already troubleshooting.
 */
function routerCommand(verb: string, args: string): string {
  const module = pythonModuleFor(verb);
  return module === null
    ? `(\`${verb}\` has no command line)`
    : `python -m ${module}${args ? ` ${args}` : ""}`;
}

interface DiagItem {
  label: string;
  detail: string;
  run: () => void;
}

function workspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

function outputChannel(): vscode.OutputChannel {
  return vscode.window.createOutputChannel("Dabbler Diagnostics");
}

function checkActivation(): void {
  const ch = outputChannel();
  const root = workspaceRoot();
  if (!root) {
    ch.appendLine("No workspace folder is open.");
    ch.show();
    return;
  }
  const dir = path.join(root, SESSIONS_REL);
  ch.appendLine(`docs/sessions/ exists: ${fs.existsSync(dir)}`);
  ch.appendLine(`sessions.json exists: ${hasSessionsRoot(root)}`);
  ch.appendLine(`Expected path: ${dir}`);
  if (!hasSessionsRoot(root)) {
    ch.appendLine("");
    ch.appendLine(
      "The Work Explorer shows a repository once the router has written " +
      "docs/sessions/sessions.json. A plan on its own is not enough: the " +
      "ledger is the machine-written record the view reads."
    );
    ch.appendLine("Run 'Dabbler: Set Up New Project' to scaffold the folder.");
  } else {
    ch.appendLine("The view has a ledger to read. If it is still empty, try 'Dabbler: Refresh'.");
  }
  ch.show();
}

function checkStateStuck(): void {
  const ch = outputChannel();
  ch.appendLine("A session's status comes from the router, never from this extension:");
  ch.appendLine(`  ${routerCommand("progress", "--json")}`);
  ch.appendLine("");
  ch.appendLine("Each session's `status` is written to docs/sessions/sessions.json by");
  ch.appendLine("`session start` and `session close`, and nothing else may write it.");
  ch.appendLine("");
  ch.appendLine(
    "If a session appears stuck, run the command above and compare it with the " +
    "row. A row that disagrees with that output is a rendering bug; a row that " +
    "agrees means the close has not run. Open 'Activity Log' from the context " +
    "menu to inspect the raw log."
  );
  ch.show();
}

function checkWorktrees(): void {
  const ch = outputChannel();
  const root = workspaceRoot();
  if (!root) { ch.appendLine("No workspace folder open."); ch.show(); return; }
  try {
    const out = cp.execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd: root, encoding: "utf8", windowsHide: true, timeout: 5000,
    });
    ch.appendLine("git worktree list --porcelain output:");
    ch.appendLine(out || "(no output)");
    ch.appendLine("");
    ch.appendLine(
      "The extension shows one row per listed worktree that has a docs/sessions/ " +
      "ledger. Each checkout carries its own ledger, so two rows are two records."
    );
  } catch (err) {
    ch.appendLine(`git worktree list failed: ${err instanceof Error ? err.message : String(err)}`);
    ch.appendLine("Is this folder inside a git repository?");
  }
  ch.show();
}

function checkApiKeys(): void {
  const ch = outputChannel();
  ch.appendLine("The router reads API keys from environment variables at session start.");
  ch.appendLine("");
  ch.appendLine("Keys used (depending on configured providers):");
  ch.appendLine("  DABBLER_ANTHROPIC_API_KEY  — Claude (claude.ai)");
  ch.appendLine("  DABBLER_OPENAI_API_KEY     — OpenAI (GPT models)");
  ch.appendLine("  DABBLER_GEMINI_API_KEY     — Google Gemini");
  ch.appendLine("");
  ch.appendLine("Export them in your shell profile (~/.bashrc, ~/.zshrc, or $PROFILE on Windows).");
  ch.appendLine("After editing, restart VS Code or open a new terminal.");
  ch.show();
}

function checkHighCost(): void {
  const ch = outputChannel();
  // No dollar figures. The router carries no rate table — set 109
  // removed it — so a price printed here would be this extension's
  // invention rather than the record's answer, which is the whole class
  // of bug the projection seam exists to prevent.
  ch.appendLine("What the record actually carries is calls and tokens, by model:");
  ch.appendLine(`  ${routerCommand("metrics", "")}`);
  ch.appendLine("");
  ch.appendLine("A call routed through a Copilot seat is billed in premium requests,");
  ch.appendLine("not tokens. The seat's own store prices those by conversation id:");
  ch.appendLine(`  ${routerCommand("seat-cost", "<conversation-id>")}`);
  ch.appendLine("");
  ch.appendLine("Register a session with --effort low to reduce token spend, and");
  ch.appendLine("prefer a cheaper model for the verifier role in router-config.yaml.");
  ch.show();
}

function checkLayout(): void {
  const ch = outputChannel();
  const root = workspaceRoot();
  if (!root) { ch.appendLine("No workspace folder open."); ch.show(); return; }
  const dirs = [
    path.join("docs", "sessions"),
    path.join("docs", "sessions", "sessions.json"),
    path.join("docs", "sessions", "session-plan.md"),
  ];
  ch.appendLine(`Expected layout under: ${root}`);
  ch.appendLine("");
  for (const d of dirs) {
    const full = path.join(root, d);
    const exists = fs.existsSync(full);
    ch.appendLine(`  ${exists ? "✓" : "✗"} ${d}`);
  }
  ch.appendLine("");
  ch.appendLine("Missing folders? Run 'Dabbler: Set Up New Project' to scaffold them.");
  ch.show();
}

export function registerTroubleshootCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabbler.troubleshoot", async () => {
      const items: DiagItem[] = [
        {
          label: "$(warning) Extension not activating",
          detail: "Check for docs/sessions/ and the ledger the view reads",
          run: checkActivation,
        },
        {
          label: "$(sync) Session stuck in 'In Progress'",
          detail: "Show where a session's status actually comes from",
          run: checkStateStuck,
        },
        {
          label: "$(git-branch) Worktrees not showing",
          detail: "Run git worktree list and show the output",
          run: checkWorktrees,
        },
        {
          label: "$(key) API key not found",
          detail: "Show which environment variables the ai_router expects",
          run: checkApiKeys,
        },
        {
          label: "$(graph) Cost seems high",
          detail: "Show where the record reports calls, tokens and seat spend",
          run: checkHighCost,
        },
        {
          label: "$(folder) File/folder layout wrong",
          detail: "Compare expected layout vs. actual workspace state",
          run: checkLayout,
        },
      ];

      const picked = await vscode.window.showQuickPick(
        items.map((i) => ({ label: i.label, detail: i.detail, _run: i.run })),
        { placeHolder: "Select a troubleshooting topic" }
      );
      if (picked) (picked as { _run: () => void })._run();
    })
  );
}
