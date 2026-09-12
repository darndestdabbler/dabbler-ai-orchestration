// Start, Stop, Send, Close -- the engine stays in the person's own CLI.
//
// Start opens a terminal running the engine's own CLI, interactively, at
// the repository root, and gives it the one sentence a session needs: call
// `dabbler session next` and do what it says until it says `done`. Nothing
// is spawned on the person's behalf and nothing is pasted anywhere: they
// keep their own spinner, their own scrollback, their own chat and their
// own interrupt key, which is what the staff already trust.
//
// Beside it is the *Dabbler* terminal: what the framework is doing while
// they type. Two terminals is the arrangement, not one -- Start shows
// both, and shows them without taking the caret. WHERE the pair opens is
// `dabbler.terminalLocation`: two editor tabs side by side by default, or
// split in the bottom panel as session 62 built it. A terminal cannot be
// moved after it is created, so the setting is read when each one opens
// and never after.
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

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { ENUMERATION_CLI_ALIASES, type Router } from "dabbler-ai-router";
import { SESSIONS_REL, type SessionsRepository } from "../utils/fileSystem";
import { productionRouter, solutionConfiguration } from "../router/host";
import { routerOutputChannel } from "../router/commandLog";
import { type DriveHandle, launchDriver } from "../router/driveProcess";
import { resolveRouterCli } from "../router/terminalShim";
import { ensureDabblerTerminal, terminalLocation } from "../router/dabblerTerminal";
import { clonePathIn } from "./openModule";
import { asRepositoryNode, asSessionNode } from "./workExplorerTreeCommands";

/**
 * The repository a clicked row belongs to, whichever row kind it is.
 *
 * Start Session is offered on the repository row and on the row for the
 * session that would be registered next, and both rows carry the same
 * repository. Narrowing to one node kind is what made the second offer do
 * nothing at all when it was clicked: the menu appeared, the handler failed
 * to recognise its argument, and the command returned silently.
 */
export function repositoryOf(arg: unknown): SessionsRepository | undefined {
  return (asRepositoryNode(arg) ?? asSessionNode(arg))?.repository;
}

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
  // Codex is not here, and `--engine codex` still registers and records
  // (D268, D269). The distinction is what this list IS: not a set of names
  // the ledger accepts, but a set of CLIs Start Session will LAUNCH. Every
  // row below was measured against its own `--help`; codex never was --
  // ENGINE_CLI's comment says so in as many words -- so offering the row
  // would put an unmeasured launch in front of a person at the one command
  // that starts their work, and the two UAT walkthroughs would transcribe
  // a choice no walk has ever taken. Typing `dabbler session next` in a
  // terminal is the documented loop and takes the name as it always did.
  {
    label: "GitHub Copilot",
    engine: "copilot",
    provider: "openai",
    description: "openai — a seat also needs a model",
    modelRequired: true,
  },
];

/**
 * The engines to offer, with the operator's default first.
 *
 * First and not only: the pane sets what the NEXT session is offered, and a
 * list that hid the others would turn a default into a decision nobody can
 * revisit at the moment they are being asked to make it.
 */
export function engineOrder(preferred: string | null): readonly EngineChoice[] {
  if (preferred === null) return ENGINES;
  const chosen = ENGINES.filter((entry) => entry.engine === preferred);
  return [...chosen, ...ENGINES.filter((entry) => entry.engine !== preferred)];
}

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
 *   the person, and the sentence costs them one keypress instead. The
 *   entry stays because a session already registered under the name is
 *   still resumable; ENGINES no longer offers it, which is the difference
 *   between resuming what exists and proposing it to someone new.
 *
 * **`modelFlag` is how the chosen model reaches the engine**, and it was
 * missing entirely. `args` was `carriesPrompt ? [sentence] : []`, so the
 * `--model` an operator typed was an argument to `dabbler session start` --
 * which records identity on the ledger -- and never reached the CLI: a seat
 * was RECORDED on one model while `copilot` ran on `auto`, and under Claude
 * Code no model was asked for, recorded or passed at all. The router's own
 * unattended driver has always done this correctly (`engineShape`); only the
 * interactive launch was missing it. Both flags were measured on 2026-09-12:
 * `claude --model` accepted 14 of 14 ids offered, and `copilot --model`
 * refuses an unknown id with exit 1 before any billed call. `codex` carries
 * null for the same reason its prompt slot is null -- its help has never been
 * read here, and a flag a CLI may not take is a launch that fails in front of
 * the person.
 */
const ENGINE_CLI: Readonly<
  Record<string, { program: string; carriesPrompt: boolean; modelFlag: string | null }>
> = {
  "claude-code": { program: "claude", carriesPrompt: true, modelFlag: "--model" },
  copilot: { program: "copilot", carriesPrompt: false, modelFlag: "--model" },
  codex: { program: "codex", carriesPrompt: false, modelFlag: null },
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
  const dir = SESSIONS_REL.replace(/\\/g, "/");
  // Two commands, and the identity is on the FIRST one only. One line
  // carrying `--engine` on `next` is what an engine re-runs after `done`,
  // and until session 90 that registered and started the next session
  // unasked. `next` refuses it now; the sentence must not ask for it.
  return (
    `Run \`dabbler session start --sessions-dir ${dir} ` +
    `--engine ${choice.engine} --provider ${choice.provider}${seat}\` once, ` +
    `then call \`dabbler session next --sessions-dir ${dir}\` ` +
    "and do what it says until it says `done`."
  );
}

/**
 * What this checkout already chose for the authoring model, or "".
 *
 * Read through the router at the moment it is asked for, exactly as the pane
 * reads it: the answer is derived from a setting in this checkout and from
 * this operator's own preferences, and a copy held anywhere in this window
 * would be the stale one. A reading that cannot be taken is "" -- nobody
 * chose -- because a Start box that refused to open over an unreadable
 * preference would be refusing the one command that starts the work.
 */
export function chosenAuthoringModel(repoRoot: string): string {
  const configuration = solutionConfiguration(repoRoot) as {
    authoring?: {
      declaredAtStart?: boolean;
      chosen?: { model?: string } | null;
    };
  } | null;
  const authoring = configuration?.authoring;
  // A session in flight REPORTS its own model here; offering it back as the
  // value for the next one would put a finished session's identity into a
  // box that starts another.
  if (!authoring || authoring.declaredAtStart) return "";
  return authoring.chosen?.model ?? "";
}

/**
 * Why this engine will not run on this model, or null.
 *
 * **The launch is the other door, and it was open.** `session start`
 * revalidates a configured model before anything is billed, but the Start box
 * takes free text and the terminal it opens belongs to the PERSON -- nothing
 * here can read what their CLI prints, by design. So an operator who typed a
 * stale id, a seat id under Claude Code, or a simple typo got a CLI that
 * printed one warning line and carried on with a model nobody chose, while
 * the ledger recorded the one they named.
 *
 * The check is the same rule at the same list: what the ENGINE's own record
 * names, which is what the pane offers and what `dabbler configure` accepts.
 *
 * **It refuses on knowledge and never on the absence of it.** An empty list
 * is a machine that has not read its catalog, and the alias floor is a
 * reading that says in as many words that it does not know what the CLI
 * accepts. Neither may stop an operator who is otherwise ready to work.
 *
 * **What it cannot close, and the record says so:** Claude Code validates
 * against its own BUNDLED catalog, so a model a vendor serves and this
 * machine has read can still be one the installed CLI does not know. Only
 * the launch can find that out, and only by spending a turn.
 */
export function engineModelRefusal(
  repository: SessionsRepository,
  choice: EngineChoice,
  model: string,
): string | null {
  const wanted = model.trim();
  if (wanted === "") return null;
  // Read for the engine ABOUT to be launched, not for whatever the ledger or
  // the preference names: an operator starting a Copilot session from a
  // window whose last session ran Claude Code would otherwise be held to the
  // wrong CLI's list.
  const configuration = solutionConfiguration(repository.root, {
    engine: choice.engine,
  }) as {
    authoring?: {
      enumeration?: string;
      candidates?: Array<{ model?: string }>;
    };
  } | null;
  const authoring = configuration?.authoring;
  // The floor is the CLI's own always-accepted names on a machine that could
  // enumerate nothing. Holding a choice to three names there would refuse
  // every operator whose machine has no key for their engine's vendor.
  if (authoring?.enumeration === ENUMERATION_CLI_ALIASES) return null;
  const offered = (authoring?.candidates ?? [])
    .map((row) => String(row.model ?? ""))
    .filter((id) => id !== "");
  if (offered.length === 0 || offered.includes(wanted)) return null;
  return (
    `${choice.label} has no '${wanted}' in the list this machine has read for ` +
    `it. It offers ${offered.length}: ${offered.slice(0, 8).join(", ")}` +
    `${offered.length > 8 ? ", and more" : ""}. Nothing was launched. The CLI ` +
    "validates against its own bundled catalog and is the final authority, " +
    "so a model it refuses is a session that starts on something nobody " +
    "chose -- which is why this is checked before the terminal opens rather " +
    "than read out of it afterwards."
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
  // The value the operator chose, spelled as they chose it. NOT normalised:
  // `normalizeModelToken` drops the date suffix, and the date suffix is what
  // makes a pin a pin -- a launch that quietly generalised `claude-opus-5-
  // 20260901` to `claude-opus-5` would be answering with a model nobody
  // named. The CLI is the authority on whether it knows the id, and it says
  // so plainly when it does not.
  const wanted = model.trim();
  const modelArgs = cli.modelFlag !== null && wanted !== "" ? [cli.modelFlag, wanted] : [];
  return {
    name: choice.label,
    cwd: repository.root,
    program: cli.program,
    // The flag first and the prompt last: `claude`'s prompt is a POSITIONAL,
    // so anything after it is read as part of it.
    args: [...modelArgs, ...(cli.carriesPrompt ? [sentence] : [])],
    typed: cli.carriesPrompt ? null : sentence,
  };
}

export interface SessionRunUi {
  pickEngine: () => Thenable<EngineChoice | undefined>;
  /**
   * The model to drive with; empty for the engine's default; undefined when
   * the box was dismissed.
   *
   * `chosen` is what this checkout already chose -- what the Configuration
   * section's *Set the Authoring Model* wrote -- offered as the value
   * already in the box. An operator who set one in the pane and was then
   * asked to retype it here would have two places saying what the next
   * session authors with and no reason to believe either.
   */
  askModel: (choice: EngineChoice, chosen: string) => Thenable<string | undefined>;
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
  openTerminal: (terminal: EngineTerminal) => unknown;
  /** Show an open terminal carrying one of these names; false when none is. */
  showTerminalNamed: (names: readonly string[]) => boolean;
  /** Open `path` in a new window, keeping this one. */
  openFolder: (path: string) => Thenable<unknown>;
  /**
   * Show the framework's own terminal for this repository, split off the
   * one just opened.
   *
   * Start's whole arrangement is the two of them side by side -- the chat
   * on one side, what the framework is doing on the other -- and a
   * terminal that existed but was never shown left the operator with only
   * half of it.
   */
  showFrameworkTerminal: (repoRoot: string, beside: unknown) => void;
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

/**
 * The Start Session pick.
 *
 * `chosen` is a THUNK for the engine this machine chose, read from the
 * projection by the caller rather than from an editor setting here -- a
 * thunk because this factory runs once at registration and the projection
 * moves every time a declaration does. It is read from
 * the caller rather than from an editor setting here: the choice lives in
 * the user-level preferences beside the catalog so that `dabbler session
 * start` typed in a terminal reads the same answer this pane does. Null
 * where nobody has chosen, which is the first-run case and is not a default.
 */
export function defaultSessionRunUi(
  chosen: () => string | null = () => null,
): SessionRunUi {
  return {
    pickEngine: () =>
      vscode.window
        .showQuickPick(
          // The default the Configuration section set, first in the list and
          // saying that it is the default. It is offered rather than
          // applied: identity is recorded per session at `session start`,
          // and a start that skipped the question would be choosing on the
          // operator's behalf at the one moment they are being asked.
          engineOrder(chosen()).map((entry) => ({
            label: entry.label,
            description:
              entry.engine === chosen()
                ? `${entry.description} — your default`
                : entry.description,
            entry,
          })),
          {
            title: "Start session — which engine runs it?",
            placeHolder: "The framework drives; this engine answers each step.",
            ignoreFocusOut: true,
          },
        )
        .then((picked) => picked?.entry),
    askModel: (choice, chosen) =>
      vscode.window.showInputBox({
        title: `Start session — model for ${choice.label}`,
        prompt: choice.modelRequired
          ? "Required: the seat's model. It is passed to the CLI and recorded on the ledger."
          : "Optional: leave empty for the engine's default. It is passed to the CLI as `--model`.",
        placeHolder: choice.modelRequired ? "e.g. gpt-5-6-luna" : "e.g. haiku",
        // What the Configuration section already chose, so the pane and this
        // box are one answer rather than two.
        value: chosen,
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
      // The first editor column under `editor`, so that the framework's
      // terminal -- which asks for `Beside` -- lands in the second and the
      // pair reads left to right.
      //
      // Under `panel` the panel is asked for BY NAME rather than left
      // unsaid. Saying nothing means "wherever terminals open", and where
      // terminals open is `terminal.integrated.defaultLocation` -- which
      // an operator may well have set to `editor`. A setting called
      // `panel` that puts the pair in the editor area because of another
      // setting is a promise the name does not keep.
      const location = {
        location:
          terminalLocation() === "editor"
            ? { viewColumn: vscode.ViewColumn.One }
            : vscode.TerminalLocation.Panel,
      };
      const terminal = vscode.window.createTerminal({
        name: spec.name,
        cwd: spec.cwd,
        shellPath: spec.program,
        shellArgs: [...spec.args],
        ...location,
      });
      terminal.show();
      // Typed, never sent: the person reads it and presses Enter. Whether a
      // CLI that is still starting keeps what it was handed is a thing to
      // watch on the walk -- the pty takes it either way, and the sentence
      // is one line to retype if it does not.
      if (spec.typed !== null) terminal.sendText(spec.typed, false);
      return terminal;
    },
    showTerminalNamed: (names) => {
      const open = (vscode.window.terminals ?? []).find((terminal) => names.includes(terminal.name));
      if (!open) return false;
      open.show();
      return true;
    },
    openFolder: (folder) => vscode.commands.executeCommand("vscode.openFolder", vscode.Uri.file(folder), true),
    showFrameworkTerminal: (repoRoot, beside) =>
      ensureDabblerTerminal(repoRoot, beside as vscode.Terminal | undefined),
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

// --- The focused start: one click opens the module's window with its AI in it ---

/** Where a focused start leaves its choices for the window that opens on the clone. */
export const START_REQUEST_REL = path.join(".dabbler", "start-request.json");
/** A request older than this was written for a window that never came; it is dropped. */
export const START_REQUEST_FRESH_MS = 10 * 60 * 1000;

/** The choices a person made in the repository's window, carried to the module's. */
export interface StartRequest {
  readonly engine: string;
  readonly provider: string;
  readonly model: string;
  readonly unattended: boolean;
  readonly writtenAt: string;
}

export function writeStartRequest(root: string, request: StartRequest): void {
  const file = path.join(root, START_REQUEST_REL);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(request, null, 2)}\n`, "utf8");
}

/**
 * Consume the request in `root`: read it and delete it, whatever it says.
 * Null when there is none, when it cannot be read, or when it is stale --
 * a window that opens on a request written ten minutes ago is not the
 * window that request was for, and starting a session nobody is sitting
 * in front of is the one thing this must never do.
 */
export function takeStartRequest(root: string, now: number = Date.now()): StartRequest | null {
  const file = path.join(root, START_REQUEST_REL);
  if (!fs.existsSync(file)) return null;
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    parsed = null;
  }
  try {
    fs.rmSync(file, { force: true });
  } catch {
    // Consumed either way: a request that cannot be deleted is still read once.
  }
  if (parsed === null || typeof parsed !== "object") return null;
  const record = parsed as Partial<StartRequest>;
  if (typeof record.engine !== "string" || typeof record.provider !== "string" || typeof record.writtenAt !== "string") {
    return null;
  }
  const age = now - Date.parse(record.writtenAt);
  if (!Number.isFinite(age) || age < 0 || age > START_REQUEST_FRESH_MS) return null;
  return {
    engine: record.engine,
    provider: record.provider,
    model: typeof record.model === "string" ? record.model : "",
    unattended: record.unattended === true,
    writtenAt: record.writtenAt,
  };
}

/**
 * The next session's module when the plan says it is focused, else null.
 * Read from the projection's row, which carries what the plan's section
 * says; nothing here reads the plan.
 */
export function nextFocusedModule(repository: SessionsRepository): string | null {
  const next = repository.sessions.find((session) => session.number === repository.nextSession);
  return next?.kind === "focused" && typeof next.module === "string" && next.module !== "" ? next.module : null;
}

/**
 * Whether Start, pressed in THIS window, opens the module's window instead:
 * the next session is focused and this is the repository, not the module's
 * folder. In the module's own folder the same button opens the AI here.
 */
function opensModuleWindow(repository: SessionsRepository): string | null {
  return repository.checkoutModule === null ? nextFocusedModule(repository) : null;
}

/** The same UI with the engine and the model already decided: the request's. */
export function presetChoices(ui: SessionRunUi, request: StartRequest): SessionRunUi {
  const choice =
    ENGINES.find((entry) => entry.engine === request.engine && entry.provider === request.provider) ??
    ENGINES.find((entry) => entry.engine === request.engine);
  return { ...ui, pickEngine: async () => choice, askModel: async () => request.model };
}

/**
 * Start Focused Session: the engine and the model are asked here, the
 * module's folder is opened (or refreshed) by the router in-process, the
 * choices are written into it, and its window opens. Nothing is typed in
 * this window: the window that opens on the folder reads the request and
 * opens the AI's terminal there, with the sentence typed.
 */
export async function runStartFocusedSession(
  repository: SessionsRepository,
  slug: string,
  ui: SessionRunUi,
  router: Pick<Router, "module">,
  unattended = false,
): Promise<boolean> {
  const picked = await ui.pickEngine();
  if (!picked) return false;
  const model = await ui.askModel(picked, chosenAuthoringModel(repository.root));
  if (model === undefined) return false;
  if (picked.modelRequired && model.trim() === "") {
    ui.showErrorMessage(`${picked.label} is a seat and needs a model; nothing was opened.`);
    return false;
  }
  // The same check the repository's own window makes: this path writes the
  // choice into a module's folder for another window to launch from, so a
  // model refused there would be refused one window later, after a clone.
  const impossible = engineModelRefusal(repository, picked, model);
  if (impossible !== null) {
    ui.showErrorMessage(impossible);
    return false;
  }
  const result = await router.module.open({ workspaceRoot: repository.root, slug });
  if (!result.ok) {
    ui.showErrorMessage((result.message ?? result.outcome).trim() || "Dabbler refused that.");
    return false;
  }
  const clone = clonePathIn(result.value.stdout ?? "");
  if (clone === null) {
    ui.showErrorMessage((result.value.stdout ?? "").trim() || "The router answered without a folder to open.");
    return false;
  }
  writeStartRequest(clone, {
    engine: picked.engine,
    provider: picked.provider,
    model: model.trim(),
    unattended,
    writtenAt: new Date().toISOString(),
  });
  await ui.openFolder(clone);
  return true;
}

/**
 * A window activating on a folder that holds a fresh request starts the
 * session it asked for, with the choices it carries; a stale request is
 * dropped. Returns whether a start was made.
 */
export async function startFromRequest(
  repository: SessionsRepository,
  ui: SessionRunUi,
  launcher: DriveLauncher,
  drives: Drives,
): Promise<boolean> {
  const request = takeStartRequest(repository.root);
  if (request === null) return false;
  const preset = presetChoices(ui, request);
  return request.unattended
    ? runStartUnattendedSession(repository, preset, launcher, drives)
    : runStartSession(repository, preset);
}

/**
 * Resume Session: the AI's terminal back, for a session in flight. The
 * engine's own terminal when it is still open, by its name; otherwise a
 * terminal named for the session running `dabbler session run`, which
 * drives the rest with the identity the record holds.
 */
export async function runResumeSession(
  repository: SessionsRepository,
  ui: SessionRunUi,
  cli: string | null = resolveRouterCli(),
): Promise<boolean> {
  if (repository.currentSession === null) {
    ui.showInformationMessage(`Nothing is in flight in ${repository.label}; Start Session is the way in.`);
    return false;
  }
  if (ui.showTerminalNamed(ENGINES.map((entry) => entry.label))) return true;
  if (cli === null) {
    ui.showErrorMessage("The bundled `dabbler` command was not found beside the extension; nothing was resumed.");
    return false;
  }
  const opened = ui.openTerminal({
    name: `Session ${String(repository.currentSession).padStart(3, "0")}`,
    cwd: repository.root,
    program: process.execPath,
    args: [cli, "session", "run", "--sessions-dir", SESSIONS_REL.replace(/\\/g, "/")],
    typed: null,
  });
  ui.showFrameworkTerminal(repository.root, opened);
  return true;
}

/**
 * Start is the launch, and what it launches is the person's own CLI.
 *
 * The engine is the decision -- asked as one, in a pick -- and everything
 * after it belongs to the person: their terminal, their chat, their Esc.
 * A cancelled pick cancels the command, which is what cancelling a
 * decision should do. When the next session is focused and this is the
 * repository's window, the launch is the module's window instead.
 */
export async function runStartSession(
  repository: SessionsRepository,
  ui: SessionRunUi,
  router: Pick<Router, "module"> | null = null,
): Promise<boolean> {
  const focused = opensModuleWindow(repository);
  if (focused !== null) return runStartFocusedSession(repository, focused, ui, router ?? productionRouter());
  const picked = await ui.pickEngine();
  if (!picked) return false;
  const model = await ui.askModel(picked, chosenAuthoringModel(repository.root));
  if (model === undefined) return false;
  const impossible = engineModelRefusal(repository, picked, model);
  if (impossible !== null) {
    ui.showErrorMessage(impossible);
    return false;
  }
  const terminal = engineTerminalFor(repository, picked, model);
  if (typeof terminal === "string") {
    ui.showErrorMessage(terminal);
    return false;
  }
  const opened = ui.openTerminal(terminal);
  // The framework's own terminal, beside it. Both, or the person is
  // watching their engine work with no sight of what the framework is
  // doing -- which is the arrangement this session exists to build.
  ui.showFrameworkTerminal(repository.root, opened);
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
  router: Pick<Router, "module"> | null = null,
): Promise<boolean> {
  if (drives.running(repository.root)) {
    ui.showErrorMessage(
      `A session is already being driven in ${repository.label} — Stop it before starting another.`,
    );
    return false;
  }
  const focused = opensModuleWindow(repository);
  if (focused !== null) return runStartFocusedSession(repository, focused, ui, router ?? productionRouter(), true);
  const picked = await ui.pickEngine();
  if (!picked) return false;
  const model = await ui.askModel(picked, chosenAuthoringModel(repository.root));
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
        const repository = repositoryOf(arg);
        if (!repository) return;
        // No channel is shown: the engine is in the terminal that just
        // opened, and the framework's own work goes to the Dabbler
        // terminal rather than here.
        await runStartSession(repository, ui, router);
      },
    ),
    vscode.commands.registerCommand(
      "dabbler.startUnattendedSession",
      async (arg: unknown) => {
        const node = asRepositoryNode(arg);
        if (!node) return;
        if (await runStartUnattendedSession(node.repository, ui, launcher, drives, router)) {
          engineOutputChannel().show(true);
        }
      },
    ),
    vscode.commands.registerCommand("dabblerSessionSets.resumeSession", async (arg: unknown) => {
      const repository = repositoryOf(arg);
      if (!repository) return;
      await runResumeSession(repository, ui);
    }),
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
