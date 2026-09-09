import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import { ROUTER_VERSION, spawnProgram } from "dabbler-ai-router";
import { SESSIONS_REL, hasSessionsRoot } from "../utils/fileSystem";
import { RouterCommands, productionCommands, productionRouter } from "../router/host";

/**
 * A line for the operator to run by hand, asked of the router rather than
 * typed here. Every `ai_router.<x>` string this file used to carry was a
 * second statement of a fact the router already holds, and one of them
 * (`ai_router.report`) had been wrong since set 109 removed the module —
 * printed, of all places, to an operator who was already troubleshooting.
 */
function routerCommand(
  commands: RouterCommands,
  verb: string,
  args: string[],
  cwd: string | undefined,
): string {
  const line = cwd ? commands.commandLine(verb, args, cwd) : null;
  return line ?? `(no command line for \`${verb}\` here)`;
}

interface DiagItem {
  label: string;
  detail: string;
  run: (commands: RouterCommands) => void | Promise<void>;
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

/**
 * Ask the router where the sessions actually stand, and show the answer.
 *
 * Survey finding F10: this printed the command line for the operator to run
 * by hand -- a diagnostic naming a command the extension can already make,
 * to someone who is in here because something is not working. It runs it.
 *
 * The other two diagnostics below still print a line, and that is not the
 * same omission: `metrics` and `seat-cost` are not on the Router contract,
 * so there is nothing for the extension to call. A printed line for a verb
 * it cannot reach is honest; one for a verb it can is not.
 */
async function checkStateStuck(_commands: RouterCommands): Promise<void> {
  const ch = outputChannel();
  const root = workspaceRoot();
  ch.appendLine("A session's status comes from the router, never from this extension.");
  if (root) {
    const result = await productionRouter().progress({
      repoRoot: root,
      sessionsDir: path.join(root, SESSIONS_REL),
    });
    ch.appendLine(
      result.ok
        ? JSON.stringify(result.value.repository, null, 2)
        : `The router refused: ${result.message.trim() || `exit ${result.exitCode}`}`,
    );
  } else {
    ch.appendLine("No workspace folder is open, so there is no record to read.");
  }
  ch.appendLine("");
  ch.appendLine("Each session's `status` is written to docs/sessions/sessions.json by");
  ch.appendLine("`session start` and `session close`, and nothing else may write it.");
  ch.appendLine("");
  ch.appendLine(
    "Compare that with the row. A row that disagrees with it is a rendering " +
    "bug; a row that agrees means the close has not run. Open 'Activity Log' " +
    "from the context menu to inspect the raw log."
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

function checkHighCost(commands: RouterCommands): void {
  const ch = outputChannel();
  const root = workspaceRoot();
  // No dollar figures. The router carries no rate table — set 109
  // removed it — so a price printed here would be this extension's
  // invention rather than the record's answer, which is the whole class
  // of bug the projection seam exists to prevent.
  ch.appendLine("What the record actually carries is calls and tokens, by model:");
  ch.appendLine(`  ${routerCommand(commands, "metrics", [], root)}`);
  ch.appendLine("");
  ch.appendLine("A call routed through a Copilot seat is billed in premium requests,");
  ch.appendLine("not tokens. The seat's own store prices those by conversation id:");
  ch.appendLine(`  ${routerCommand(commands, "seat-cost", ["<conversation-id>"], root)}`);
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

// --- Prerequisites ---------------------------------------------------------
//
// The toolchain both UAT walkthroughs open with, run rather than listed.
//
// It belongs to the UI and not to the framework: constant, optional and
// without a fixed lifecycle moment is the UI's bucket in
// `docs/design/command-ownership.md`, and nothing in a session's lifecycle is
// the right time to ask whether Maven is installed. Both walkthroughs said in
// as many words that these are "the one diagnostic Dabbler does not run for
// you" — walk finding 6, D263 — which is the sentence this section deletes.
//
// It reports and never grades. A machine that has no JDK is a machine doing
// .NET work, so an absent tool is a fact about this project rather than a
// fault, and the reading is the operator's.

/** One prerequisite: what answers for it, and what it is needed for. */
interface Prerequisite {
  readonly name: string;
  readonly argv: readonly string[];
  readonly why: string;
}

const PREREQUISITES: readonly Prerequisite[] = [
  { name: "git", argv: ["git", "--version"], why: "every session commits, pushes and clones through it" },
  { name: "node", argv: ["node", "--version"], why: "the router is a Node program; 22 or newer" },
  { name: "dotnet", argv: ["dotnet", "--version"], why: "the .NET walkthrough's SDK" },
  { name: "java", argv: ["java", "-version"], why: "the JDK the Maven walkthrough's scaffold is pinned from" },
  { name: "mvn", argv: ["mvn", "--version"], why: "the Maven walkthrough's build; 3.9 or newer" },
  { name: "copilot", argv: ["copilot", "--version"], why: "only for a Copilot seat; part A of the walkthroughs" },
];

/**
 * The environment the walkthroughs' parts A and B split on.
 *
 * The transport is reported BY VALUE, because which one is set is the whole
 * question and a persisted `copilot-cli` is what silently bills a seat. The
 * three keys are reported PRESENT or ABSENT and never by value: this channel
 * is the one an operator pastes into an issue, and a diagnostic that prints
 * a credential has created the problem it was opened to solve.
 */
const TRANSPORT_VAR = "DABBLER_TRANSPORT";
const KEY_VARS = [
  "DABBLER_ANTHROPIC_API_KEY",
  "DABBLER_OPENAI_API_KEY",
  "DABBLER_GEMINI_API_KEY",
] as const;

/**
 * Running one prerequisite's argv, as a seam.
 *
 * The seam is what makes the report testable: with the probe injected, what
 * the lines say is a function of what was found, not of whichever toolchain
 * the machine running the suite happens to have installed.
 */
export interface ToolProbe {
  /** What the tool answered, or null when it could not be run at all. */
  probe(argv: readonly string[]): Promise<string | null>;
}

/** The first non-empty line, which is where every one of these puts its version. */
function firstLine(output: string): string {
  return output.split(/\r?\n/).map((line) => line.trim()).find((line) => line !== "") ?? "";
}

/**
 * The real probe: the router's own spawn, so a `.cmd` shim is reached the one
 * way this framework reaches one. `mvn` on Windows IS a batch shim, and a
 * probe that spawned it directly would report the tool missing on exactly the
 * machines the Maven walkthrough is written for.
 *
 * Output is taken from both streams, because `java -version` writes its
 * version to stderr; a non-zero exit is a tool that did not answer.
 */
export function defaultToolProbe(timeoutMs = 10_000): ToolProbe {
  return {
    probe: (argv) =>
      new Promise<string | null>((resolve) => {
        let output = "";
        let child: ReturnType<typeof spawnProgram>;
        try {
          child = spawnProgram(argv, { stdio: ["ignore", "pipe", "pipe"] });
        } catch {
          resolve(null);
          return;
        }
        const timer = setTimeout(() => { child.kill(); resolve(null); }, timeoutMs);
        const settle = (value: string | null): void => { clearTimeout(timer); resolve(value); };
        child.stdout?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
        child.stderr?.on("data", (chunk: Buffer) => { output += chunk.toString(); });
        child.on("error", () => settle(null));
        child.on("close", (code) => settle(code === 0 && firstLine(output) !== "" ? firstLine(output) : null));
      }),
  };
}

/**
 * What the toolchain looks like from here, as lines.
 *
 * `env` is passed rather than read so that the two things this must never do
 * — print a key, and depend on the developer's own shell — are both decided
 * by the caller and provable by the suite.
 */
export async function prerequisiteReport(
  probe: ToolProbe,
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<string[]> {
  const lines: string[] = [
    "The toolchain both UAT walkthroughs open with, as this machine answers it.",
    "An absent tool is not a fault: a project that builds no Java needs no JDK.",
    "",
  ];
  for (const item of PREREQUISITES) {
    const answer = await probe.probe(item.argv);
    lines.push(
      answer === null
        ? `  ✗ ${item.name.padEnd(8)} not found — ${item.why}`
        : `  ✓ ${item.name.padEnd(8)} ${answer}`,
    );
  }
  // Asked of the router the extension is actually running, not of a `dabbler`
  // on PATH: "dabbler: command not found" is a PATH problem in a terminal and
  // says nothing about which router this window would use.
  lines.push(`  ✓ ${"router".padEnd(8)} dabbler-ai-router ${ROUTER_VERSION} (in this extension)`);
  lines.push("");
  const transport = env[TRANSPORT_VAR];
  lines.push(
    transport === undefined || transport === ""
      ? `  ${TRANSPORT_VAR} is unset — the API transport, unless a config or a --transport flag says otherwise`
      : `  ${TRANSPORT_VAR}=${transport}`,
  );
  for (const key of KEY_VARS) {
    const value = env[key];
    lines.push(`  ${key} ${value === undefined || value === "" ? "is not set" : "is set"}`);
  }
  lines.push("");
  lines.push("Values are never printed for the three keys: this channel is one you may paste into an issue.");
  return lines;
}

async function checkPrerequisites(): Promise<void> {
  const ch = outputChannel();
  for (const line of await prerequisiteReport(defaultToolProbe())) ch.appendLine(line);
  ch.show();
}

export function registerTroubleshootCommand(
  context: vscode.ExtensionContext,
  commands: RouterCommands = productionCommands(),
): void {
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
          detail: "Show which environment variables the router expects",
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
        {
          label: "$(tools) Prerequisites / toolchain",
          detail: "Run the checks both walkthroughs open with and report what is here",
          run: checkPrerequisites,
        },
      ];

      const picked = await vscode.window.showQuickPick(
        items.map((i) => ({ label: i.label, detail: i.detail, _run: i.run })),
        { placeHolder: "Select a troubleshooting topic" }
      );
      // Awaited: one diagnostic now asks the router rather than printing a
      // line, and a floating promise there would show an empty channel.
      if (picked) {
        await (
          picked as { _run: (c: RouterCommands) => void | Promise<void> }
        )._run(commands);
      }
    })
  );
}
