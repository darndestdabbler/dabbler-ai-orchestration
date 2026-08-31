// Start, Stop, Send, Close -- the engine stays in the person's own CLI.
//
// Start opens a terminal running the engine's own CLI, interactively, at
// the repository root, and gives it the one sentence a session needs: call
// `dabbler session next` and do what it says until it says `done`. Nothing
// is spawned on the person's behalf and nothing is pasted anywhere: they
// keep their own spinner, their own scrollback, their own chat and their
// own interrupt key, which is what the staff already trust.
//
// **Start Unattended Session is the other half** (D252): headless `session
// drive` as a child process, streaming into "Dabbler: Engine", for CI and
// overnight runs. It is the only thing Stop and Send apply to -- they are
// `session interrupt`, which ends an invocation the FRAMEWORK made, and
// under the interactive default the framework never invokes anybody. Both
// stay gated on `dabbler.driving`, which only an unattended drive sets.
//
// The driver is a child process rather than an in-process call, and the
// reason is stated once in `router/driveProcess.ts`.

import * as path from "path";
import * as vscode from "vscode";
import type { Router } from "dabbler-ai-router";
import { SESSIONS_REL, type SessionsRepository } from "../utils/fileSystem";
import { productionRouter } from "../router/host";
import { routerOutputChannel } from "../router/commandLog";
import { type DriveHandle, launchDriver } from "../router/driveProcess";
import { resolveRouterCli } from "../router/terminalShim";
import { asRepositoryNode } from "./workExplorerTreeCommands";

const CHANNEL_NAME = "Dabbler Session";
export const ENGINE_CHANNEL_NAME = "Dabbler: Engine";
/** The context key the palette entries for Stop and Send are gated on. */
export const DRIVING_CONTEXT = "dabbler.driving";
/** What Stop records when the person accepts the box as it is offered. */
export const DEFAULT_STOP_REASON = "Stopped from the Work Explorer";

/** Engine and provider travel together: identity resolves through the pair. */
export interface EngineChoice {
  readonly label: string;
  readonly engine: string;
  readonly provider: string;
  readonly description: string;
  /** A seat is nothing without one; elsewhere the engine's default stands. */
  readonly modelRequired: boolean;
}

export const ENGINES: readonly EngineChoice[] = [
  {
    label: "Claude Code",
    engine: "claude-code",
    provider: "anthropic",
    description: "anthropic",
    modelRequired: false,
  },
  { label: "Codex", engine: "codex", provider: "openai", description: "openai", modelRequired: false },
  {
    label: "GitHub Copilot",
    engine: "copilot",
    provider: "openai",
    description: "openai — a seat also needs a model",
    modelRequired: true,
  },
];

/**
 * How each engine's own CLI is launched interactively, and whether it has
 * an argv slot for the opening sentence.
 *
 * **Measured against the installed CLIs' own `--help` on 2026-08-31, not
 * assumed.**
 *
 * - `claude`: `Usage: claude [options] [command] [prompt]`, and "starts an
 *   interactive session by default, use -p/--print for non-interactive
 *   output". The positional IS the opening prompt, so it goes in argv.
 * - `copilot`: `Usage: copilot [options] [command]` -- no positional, and
 *   its `-p, --prompt <text>` is documented as "Execute a prompt in
 *   non-interactive mode", which is the opposite of what Start wants.
 * - `codex`: NOT installed on the machine this was written on, so its help
 *   was not read and nothing here claims to know it. It opens with no
 *   prompt: an argv a CLI does not take is a launch that fails in front of
 *   the person, and the sentence costs them one keypress instead.
 */
const ENGINE_CLI: Readonly<Record<string, { program: string; carriesPrompt: boolean }>> = {
  "claude-code": { program: "claude", carriesPrompt: true },
  copilot: { program: "copilot", carriesPrompt: false },
  codex: { program: "codex", carriesPrompt: false },
};

/** What Start asks the editor to open: one CLI, interactively, in one repository. */
export interface EngineTerminal {
  readonly name: string;
  readonly cwd: string;
  readonly program: string;
  readonly args: readonly string[];
  /**
   * Typed at the CLI's prompt and NOT sent, for a CLI whose argv has no
   * slot for it. The person presses Enter, which is the one keypress that
   * replaces copying and pasting a prompt.
   */
  readonly typed: string | null;
}

/**
 * The whole instruction an engine needs, as the guide states it.
 *
 * The sessions root is repository-relative because the terminal opens at
 * the repository root; the identity flags are on it because the first call
 * is the one that registers, and a seat's `--model` with it because the
 * seat label is not trusted.
 */
export function openingSentence(choice: EngineChoice, model: string): string {
  const seat = choice.modelRequired && model.trim() !== "" ? ` --model ${model.trim()}` : "";
  return (
    `Call \`dabbler session next --sessions-dir ${SESSIONS_REL.replace(/\\/g, "/")} ` +
    `--engine ${choice.engine} --provider ${choice.provider}${seat}\` ` +
    "and do what it says until it says `done`."
  );
}

/** The terminal Start opens for a choice, or the refusal when a seat has no model. */
export function engineTerminalFor(
  repository: SessionsRepository,
  choice: EngineChoice,
  model: string,
): EngineTerminal | string {
  const cli = ENGINE_CLI[choice.engine];
  if (!cli) return `${choice.label} has no known CLI to open; nothing was launched.`;
  if (choice.modelRequired && model.trim() === "") {
    return `${choice.label} is a seat and needs a model; nothing was launched.`;
  }
  const sentence = openingSentence(choice, model);
  return {
    name: choice.label,
    cwd: repository.root,
    program: cli.program,
    args: cli.carriesPrompt ? [sentence] : [],
    typed: cli.carriesPrompt ? null : sentence,
  };
}

export interface SessionRunUi {
  pickEngine: () => Thenable<EngineChoice | undefined>;
  /** The model to drive with; empty for the engine's default; undefined when the box was dismissed. */
  askModel: (choice: EngineChoice) => Thenable<string | undefined>;
  /** One line of text from the person; undefined when the box was dismissed. */
  askText: (title: string, prompt: string, value?: string) => Thenable<string | undefined>;
  /** Which of several running drives; undefined when dismissed. */
  pickDrive: (roots: readonly string[]) => Thenable<string | undefined>;
  report: (title: string, body: string) => void;
  showErrorMessage: (message: string) => unknown;
  showInformationMessage: (message: string) => unknown;
  /** One line the driver printed, shown as it arrives. */
  engineLine: (line: string) => void;
  /** Open the person's own CLI, interactively, and show it. */
  openTerminal: (terminal: EngineTerminal) => void;
  /**
   * Run something slow where the operator can see it is running.
   *
   * Survey finding F12: the extension had ZERO progress call sites, and a
   * close evaluates six gates while a verification round takes minutes. An
   * editor that shows nothing for that long is indistinguishable from one
   * that has hung, and an operator who believes it hung kills it.
   */
  withProgress: <T>(title: string, work: () => Promise<T>) => Promise<T>;
}

/** How Start reaches the driver: a process, or nothing when the bundle is not there. */
export interface DriveLauncher {
  launch(root: string, args: readonly string[], onLine: (line: string) => void): DriveHandle | null;
}

/**
 * The drives this window started, by repository root. One per repository:
 * the driver holds the session in flight, and a second would be refused by
 * the router anyway -- refusing it here says why before anything spawns.
 */
export class Drives implements vscode.Disposable {
  private readonly handles = new Map<string, DriveHandle>();
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChange = this.changed.event;

  running(root: string): DriveHandle | undefined {
    return this.handles.get(root);
  }

  roots(): string[] {
    return [...this.handles.keys()];
  }

  add(handle: DriveHandle): void {
    this.handles.set(handle.root, handle);
    this.changed.fire();
    void handle.exited.then(() => {
      if (this.handles.get(handle.root) === handle) {
        this.handles.delete(handle.root);
        this.changed.fire();
      }
    });
  }

  /** The window is going away; a driver nobody can see or stop must not outlive it. */
  dispose(): void {
    for (const handle of this.handles.values()) handle.kill();
    this.handles.clear();
    this.changed.fire();
  }
}

let shared: Drives | undefined;

/** The window's one registry: every launcher and every button read the same drives. */
export function sharedDrives(): Drives {
  if (!shared) shared = new Drives();
  return shared;
}

let engineChannel: vscode.OutputChannel | undefined;

function channel(): vscode.OutputChannel {
  return vscode.window.createOutputChannel(CHANNEL_NAME);
}

/**
 * The channel the driver streams into, under the language whose grammar
 * colours it: `dabbler [time] event` in one class, the engine's `│` lines in
 * another. A plain `OutputChannel` and not a `LogOutputChannel` -- that one
 * stamps a clock of its own beside the driver's and offers levels instead of
 * a palette, so the two line kinds would still read alike.
 */
export function engineOutputChannel(): vscode.OutputChannel {
  if (!engineChannel) engineChannel = vscode.window.createOutputChannel(ENGINE_CHANNEL_NAME, "dabbler-drive");
  return engineChannel;
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
            title: "Start session — which engine runs it?",
            placeHolder: "The framework drives; this engine answers each step.",
            ignoreFocusOut: true,
          },
        )
        .then((picked) => picked?.entry),
    askModel: (choice) =>
      vscode.window.showInputBox({
        title: `Start session — model for ${choice.label}`,
        prompt: choice.modelRequired
          ? "Required: the seat's model (identity resolves through the model registry)."
          : "Optional: leave empty for the engine's default.",
        placeHolder: choice.modelRequired ? "e.g. gpt-5-6-luna" : "e.g. haiku",
        ignoreFocusOut: true,
      }),
    askText: (title, prompt, value) =>
      vscode.window.showInputBox({ title, prompt, value, ignoreFocusOut: true }),
    pickDrive: (roots) =>
      vscode.window.showQuickPick(roots, { title: "Which driven session?", ignoreFocusOut: true }),
    report: (title, body) => {
      const out = channel();
      out.appendLine(`--- ${title} ---`);
      out.appendLine(body.trimEnd());
      out.show(true);
    },
    showErrorMessage: (m) => vscode.window.showErrorMessage(m),
    showInformationMessage: (m) => vscode.window.showInformationMessage(m),
    engineLine: (line) => engineOutputChannel().appendLine(line),
    openTerminal: (spec) => {
      const terminal = vscode.window.createTerminal({
        name: spec.name,
        cwd: spec.cwd,
        shellPath: spec.program,
        shellArgs: [...spec.args],
      });
      terminal.show();
      // Typed, never sent: the person reads it and presses Enter. Whether a
      // CLI that is still starting keeps what it was handed is a thing to
      // watch on the walk -- the pty takes it either way, and the sentence
      // is one line to retype if it does not.
      if (spec.typed !== null) terminal.sendText(spec.typed, false);
    },
    withProgress: <T,>(title: string, work: () => Promise<T>): Promise<T> =>
      Promise.resolve(
        vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title },
          () => work(),
        ),
      ),
  };
}

/** The bundled command on the editor's own Node, echoed to the command log first. */
export function defaultDriveLauncher(): DriveLauncher {
  return {
    launch: (root, args, onLine) => {
      const cli = resolveRouterCli();
      if (cli === null) return null;
      const log = routerOutputChannel();
      log.appendLine(`[${new Date().toLocaleTimeString()}] Running:`);
      log.appendLine(`dabbler ${args.join(" ")}`);
      return launchDriver({ execPath: process.execPath, cli, cwd: root, args }, onLine);
    },
  };
}

/** The `session drive` arguments for a choice, or the refusal when a seat has no model. */
export function driveArguments(choice: EngineChoice, model: string): string[] | string {
  const trimmed = model.trim();
  if (choice.modelRequired && trimmed === "") {
    return `${choice.label} is a seat and needs a model; nothing was launched.`;
  }
  const args = ["session", "drive", "--engine", choice.engine, "--provider", choice.provider];
  if (trimmed !== "") args.push("--model", trimmed);
  return args;
}

/**
 * Start is the launch, and what it launches is the person's own CLI.
 *
 * The engine is the decision -- asked as one, in a pick -- and everything
 * after it belongs to the person: their terminal, their chat, their Esc.
 * A cancelled pick cancels the command, which is what cancelling a
 * decision should do.
 */
export async function runStartSession(
  repository: SessionsRepository,
  ui: SessionRunUi,
): Promise<boolean> {
  const picked = await ui.pickEngine();
  if (!picked) return false;
  const model = await ui.askModel(picked);
  if (model === undefined) return false;
  const terminal = engineTerminalFor(repository, picked, model);
  if (typeof terminal === "string") {
    ui.showErrorMessage(terminal);
    return false;
  }
  ui.openTerminal(terminal);
  return true;
}

/**
 * The unattended half: headless `session drive`, for CI and overnight runs.
 *
 * It is the same command Start used to be, kept because a driven engine is
 * a measured capability and retiring it would leave nothing for a run
 * nobody is sitting in front of (D252). Stop and Send belong to this and
 * to nothing else.
 */
export async function runStartUnattendedSession(
  repository: SessionsRepository,
  ui: SessionRunUi,
  launcher: DriveLauncher,
  drives: Drives,
): Promise<boolean> {
  if (drives.running(repository.root)) {
    ui.showErrorMessage(
      `A session is already being driven in ${repository.label} — Stop it before starting another.`,
    );
    return false;
  }
  const picked = await ui.pickEngine();
  if (!picked) return false;
  const model = await ui.askModel(picked);
  if (model === undefined) return false;
  const args = driveArguments(picked, model);
  if (typeof args === "string") {
    ui.showErrorMessage(args);
    return false;
  }
  const handle = launcher.launch(repository.root, args, ui.engineLine);
  if (handle === null) {
    ui.showErrorMessage("The bundled `dabbler` command was not found beside the extension; nothing was launched.");
    return false;
  }
  drives.add(handle);
  ui.engineLine(`--- ${repository.label}: dabbler ${args.join(" ")} ---`);
  void handle.exited.then((code) => {
    ui.engineLine(`--- ${repository.label}: driver exited (${code === null ? "killed" : code}) ---`);
    if (code === 0) {
      ui.showInformationMessage(`${repository.label}: the driven session closed.`);
    } else if (code !== null) {
      ui.showErrorMessage(
        `${repository.label}: the driver stopped — the session's task rows say why, and Dabbler: Engine has the log.`,
      );
    }
  });
  return true;
}

async function chooseDrive(
  repository: SessionsRepository | undefined,
  ui: SessionRunUi,
  drives: Drives,
): Promise<string | undefined> {
  if (repository) {
    if (drives.running(repository.root)) return repository.root;
    ui.showInformationMessage(`Nothing is being driven in ${repository.label}.`);
    return undefined;
  }
  const roots = drives.roots();
  if (roots.length === 0) {
    ui.showInformationMessage("Nothing is being driven in this window.");
    return undefined;
  }
  return roots.length === 1 ? roots[0] : ui.pickDrive(roots);
}

async function interruptDrive(
  root: string,
  reason: string,
  stop: boolean,
  ui: SessionRunUi,
  router: Router,
): Promise<boolean> {
  const result = await router.session.interrupt({
    repoRoot: root,
    sessionsDir: sessionsDirOf(root),
    reason,
    stop,
  });
  if (!result.ok) {
    ui.showErrorMessage(`${stop ? "Stop" : "Send"} refused: ${result.message.trim() || `exit ${result.exitCode}`}`);
    return false;
  }
  ui.engineLine(`--- ${stop ? "stop" : "send"}: ${reason} ---`);
  ui.showInformationMessage(
    stop
      ? "Stop requested — it takes effect when the driver next reaches the engine; the task rows show it."
      : "Sent — the driver ends the engine's invocation and re-invokes it with your text; if nothing is running right now, the engine reads it with its next instruction.",
  );
  return true;
}

function sessionsDirOf(root: string): string {
  return path.join(root, SESSIONS_REL);
}

/**
 * Stop halts the loop: `session interrupt --stop` with the person's reason.
 * The driver ends the engine's invocation, records `interrupted` on the
 * session's run state -- which the task rows show -- and exits; the same
 * Start resumes from the phase it reached.
 */
export async function runStopDrive(
  repository: SessionsRepository | undefined,
  ui: SessionRunUi,
  router: Router,
  drives: Drives,
): Promise<boolean> {
  const root = await chooseDrive(repository, ui, drives);
  if (root === undefined) return false;
  const reason = await ui.askText(
    "Stop the driver",
    "Why? Recorded with the stop and shown on the session's task row.",
    DEFAULT_STOP_REASON,
  );
  if (reason === undefined) return false;
  return interruptDrive(root, reason.trim() === "" ? DEFAULT_STOP_REASON : reason.trim(), true, ui, router);
}

/**
 * Send redirects the engine: `session interrupt` with the person's text as
 * the reason. The driver ends the invocation and re-invokes the engine on
 * the same instruction with the text first among its reasons.
 */
export async function runSendToEngine(
  repository: SessionsRepository | undefined,
  ui: SessionRunUi,
  router: Router,
  drives: Drives,
): Promise<boolean> {
  const root = await chooseDrive(repository, ui, drives);
  if (root === undefined) return false;
  const text = await ui.askText(
    "Send to the engine",
    "The engine is interrupted and re-invoked with this as the reason.",
  );
  if (text === undefined || text.trim() === "") return false;
  return interruptDrive(root, text.trim(), false, ui, router);
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
  const result = await ui.withProgress(
    `Closing the session in ${repository.label} — running the gates`,
    () =>
      router.session.close({
        repoRoot: repository.root,
        sessionsDir: repository.sessionsDir,
      }),
  );
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

/**
 * Stop and Send as buttons: status bar items that exist while a drive runs,
 * beside one that names it and opens the engine's output.
 */
function statusBar(context: vscode.ExtensionContext, drives: Drives): void {
  const label = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 30);
  label.command = "dabbler.showEngineOutput";
  const stop = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 29);
  stop.text = "$(debug-stop) Stop";
  stop.tooltip = "Stop the driven session (session interrupt --stop)";
  stop.command = "dabbler.stopDrive";
  const send = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 28);
  send.text = "$(comment) Send to engine";
  send.tooltip = "Interrupt the engine and re-invoke it with your text (session interrupt)";
  send.command = "dabbler.sendToEngine";
  const render = (): void => {
    const roots = drives.roots();
    void vscode.commands.executeCommand("setContext", DRIVING_CONTEXT, roots.length > 0);
    if (roots.length === 0) {
      label.hide();
      stop.hide();
      send.hide();
      return;
    }
    label.text = `$(sync~spin) Driving ${roots.length === 1 ? String(roots[0]).split(/[\\/]/).pop() : `${roots.length} sessions`}`;
    label.tooltip = roots.join("\n");
    label.show();
    stop.show();
    send.show();
  };
  render();
  context.subscriptions.push(label, stop, send, drives.onDidChange(render));
}

export function registerSessionCommands(
  context: vscode.ExtensionContext,
  router: Router = productionRouter(),
  ui: SessionRunUi = defaultSessionRunUi(),
  launcher: DriveLauncher = defaultDriveLauncher(),
  drives: Drives = sharedDrives(),
): Drives {
  context.subscriptions.push(
    drives,
    vscode.commands.registerCommand(
      "dabblerSessionSets.startSession",
      async (arg: unknown) => {
        const node = asRepositoryNode(arg);
        if (!node) return;
        // No channel is shown: the engine is in the terminal that just
        // opened, and the framework's own work goes to the Dabbler
        // terminal rather than here.
        await runStartSession(node.repository, ui);
      },
    ),
    vscode.commands.registerCommand(
      "dabbler.startUnattendedSession",
      async (arg: unknown) => {
        const node = asRepositoryNode(arg);
        if (!node) return;
        if (await runStartUnattendedSession(node.repository, ui, launcher, drives)) {
          engineOutputChannel().show(true);
        }
      },
    ),
    vscode.commands.registerCommand("dabbler.stopDrive", async (arg: unknown) => {
      await runStopDrive(asRepositoryNode(arg)?.repository, ui, router, drives);
    }),
    vscode.commands.registerCommand("dabbler.sendToEngine", async (arg: unknown) => {
      await runSendToEngine(asRepositoryNode(arg)?.repository, ui, router, drives);
    }),
    vscode.commands.registerCommand("dabbler.showEngineOutput", () => {
      engineOutputChannel().show(true);
    }),
    vscode.commands.registerCommand(
      "dabblerSessionSets.closeSession",
      async (arg: unknown) => {
        const node = asRepositoryNode(arg);
        if (!node) return;
        await runCloseSession(node.repository, ui, router);
      },
    ),
  );
  statusBar(context, drives);
  return drives;
}
