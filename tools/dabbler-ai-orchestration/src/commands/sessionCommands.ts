// Start, Stop, Consult, Close -- the engine stays in the person's own CLI.
//
// Start registers the session and opens a terminal running the engine's own
// CLI, interactively, at the repository root, with the one sentence a session
// needs: ask for an instruction once with `dabbler session next`, and start
// each `answer_command` in the background, because what that prints is the
// next instruction. No framework process is started and none waits for the
// AI: every answer moves the session on, so nothing deterministic is left for
// the person or the AI to type, and nothing is pasted anywhere: they keep
// their own spinner, their own scrollback, their own chat and their own
// interrupt key, which is what the staff already trust.
//
// Beside it is the *Dabbler* terminal: what the framework is doing while
// they type. Two terminals is the arrangement, not one -- Start shows
// both, and shows them without taking the caret. WHERE the pair opens is
// `dabbler.terminalLocation`: two editor tabs side by side by default, or
// split in the bottom panel as session 62 built it. A terminal cannot be
// moved after it is created, so the setting is read when each one opens
// and never after.
//
// The driver is a child process rather than an in-process call, and the
// reason is stated once in `router/driveProcess.ts`.

import * as vscode from "vscode";
import {
  COMMIT_CHANGES_FLAG,
  ENUMERATION_CLI_ALIASES,
  MERGE_ORIGIN_FLAG,
  UNDO_CHANGES_FLAG,
  preflightRefusedModel,
  type Router,
} from "dabbler-ai-router";
import { SESSIONS_REL, type SessionsRepository } from "../utils/fileSystem";
import { productionRouter, solutionConfiguration } from "../router/host";
import { launchDriver } from "../router/driveProcess";
import { resolveRouterCli } from "../router/terminalShim";
import { ensureDabblerTerminal, terminalLocation } from "../router/dabblerTerminal";
import { asRepositoryNode, asSessionNode } from "./workExplorerTreeCommands";
import { modelItems } from "./configurationCommands";
import type { ConfigurationModel, ConfigurationRole } from "../providers/solutionTreeModel";

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
 * - `copilot`: `Usage: copilot [options] [command]` -- no positional, but
 *   `-i, --interactive <prompt>` is "Start interactive mode and automatically
 *   execute this prompt" (measured on 1.0.83, 2026-09-15). `-p, --prompt` is
 *   the non-interactive one and is not what Start wants. The sentence used to
 *   be typed at the prompt and left for the person's Enter, which is a
 *   deterministic keypress on every Copilot start.
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
  Record<string, { program: string; promptArgs: ((sentence: string) => string[]) | null; modelFlag: string | null }>
> = {
  "claude-code": { program: "claude", promptArgs: (sentence) => [sentence], modelFlag: "--model" },
  copilot: { program: "copilot", promptArgs: (sentence) => ["-i", sentence], modelFlag: "--model" },
  codex: { program: "codex", promptArgs: null, modelFlag: null },
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
  /** Added to the terminal's environment. */
  readonly env?: Readonly<Record<string, string>>;
}

/**
 * The whole instruction an engine needs, as the guide states it.
 *
 * Start has already registered the session, so the sentence carries no
 * identity and asks for no `start`. It asks for one `next`, and never for
 * another: each `answer_command` chains, so an AI that answers has asked.
 * The answer runs in the background so the chat stays free for the person.
 * The sessions root is repository-relative because the terminal opens at the
 * repository root.
 */
export function openingSentence(): string {
  const dir = SESSIONS_REL.replace(/\\/g, "/");
  return (
    `Run \`dabbler session next --sessions-dir ${dir}\` once. Do what the instruction's \`ask\` says, then start ` +
    "its `answer_command` as a background command, so this chat stays free: what it prints when it exits is " +
    "your next instruction. Stop when one says `done`."
  );
}

/** Registers a session through the bundled router and waits for it: its exit code and what it printed. */
export type SessionRegistrar = (
  root: string,
  args: readonly string[],
) => Promise<{ readonly code: number | null; readonly output: string }>;

/** `dabbler session start` on the editor's own Node, waited for. */
export function defaultSessionRegistrar(cli: string | null = resolveRouterCli()): SessionRegistrar {
  return async (root, args) => {
    if (cli === null) {
      return { code: null, output: "The bundled `dabbler` command was not found beside the extension." };
    }
    const lines: string[] = [];
    const handle = launchDriver({ execPath: process.execPath, cli, cwd: root, args }, (line) => lines.push(line));
    return { code: await handle.exited, output: lines.join("\n") };
  };
}

/** The `session start` arguments for a choice: the identity, recorded by the framework rather than typed by anyone. */
export function startArguments(choice: EngineChoice, model: string): string[] {
  const args = [
    "session",
    "start",
    "--sessions-dir",
    SESSIONS_REL.replace(/\\/g, "/"),
    "--engine",
    choice.engine,
    "--provider",
    choice.provider,
  ];
  if (model.trim() !== "") args.push("--model", model.trim());
  return args;
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
export async function engineRefusesModel(
  ui: Pick<SessionRunUi, "engineKnowsModel">,
  choice: EngineChoice,
  model: string,
): Promise<string | null> {
  const refused = await Promise.resolve(ui.engineKnowsModel(choice, model)).catch(() => null);
  if (refused === null) return null;
  return (
    `${choice.label} does not know '${refused}'. Its own bundled catalog is ` +
    "what decides that, so a model your machine has read about can still be " +
    "one this build of the CLI has never heard of -- and it exits 0 when it " +
    "refuses one, prints a line and carries on with something else. Nothing " +
    "was launched. `dabbler configuration options` lists what may be chosen, " +
    "and updating the CLI is the other way this changes."
  );
}

/**
 * The authoring list read for the engine ABOUT to be launched, not for
 * whatever the ledger or the preference names: an operator starting a
 * Copilot session from a window whose last session ran Claude Code would
 * otherwise be held to, and offered, the wrong CLI's list.
 */
function engineAuthoringReading(root: string, engine: string): ConfigurationRole | undefined {
  const configuration = solutionConfiguration(root, { engine }) as { authoring?: ConfigurationRole } | null;
  return configuration?.authoring;
}

/** The Primary Reviewer the operator chose, with its provider, or null where none is chosen or listed. */
function chosenPrimaryReviewer(root: string, engine: string): ConfigurationModel | null {
  const configuration = solutionConfiguration(root, { engine }) as { primaryReviewer?: ConfigurationRole } | null;
  const reviewer = configuration?.primaryReviewer;
  return reviewer?.candidates.find((row) => row.model === reviewer.selected) ?? null;
}

/** The ids a reading lists, blanks dropped. */
function listedModels(authoring: ConfigurationRole | undefined): ConfigurationModel[] {
  return (authoring?.candidates ?? []).filter((row) => String(row.model ?? "") !== "");
}

export function engineModelRefusal(
  repository: SessionsRepository,
  choice: EngineChoice,
  model: string,
): string | null {
  const wanted = model.trim();
  if (wanted === "") return null;
  const authoring = engineAuthoringReading(repository.root, choice.engine);
  // The floor is the CLI's own always-accepted names on a machine that could
  // enumerate nothing. Holding a choice to three names there would refuse
  // every operator whose machine has no key for their engine's vendor.
  if (authoring?.enumeration === ENUMERATION_CLI_ALIASES) return null;
  const offered = listedModels(authoring).map((row) => row.model);
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

/** One row of the model question; `model` undefined is the row that opens the text box. */
export type ModelPickItem = vscode.QuickPickItem & { model?: string };

export const ENTER_MODEL_ID = "Enter a model id…";

/**
 * The model question as a list: the engine's candidates, what this checkout
 * chose first, the engine's own default where the engine has one, and a way
 * to type an id the CLI knows before this machine's list does.
 *
 * Null where there is no list to offer -- nothing read, or only the alias
 * floor -- because an empty pick is a broken pane and three aliases offered
 * as the whole choice would hide every other id the CLI accepts.
 */
export function modelPickItems(root: string, choice: EngineChoice, chosen: string): ModelPickItem[] | null {
  const authoring = engineAuthoringReading(root, choice.engine);
  const listed = listedModels(authoring);
  if (authoring?.enumeration === ENUMERATION_CLI_ALIASES || listed.length === 0) return null;
  const ordered = [...listed.filter((row) => row.model === chosen), ...listed.filter((row) => row.model !== chosen)];
  // Review is cross-vendor: an authoring model from the chosen Primary
  // Reviewer's vendor is marked, and stays pickable -- the start refusal decides.
  const reviewer = chosenPrimaryReviewer(root, choice.engine);
  const items: ModelPickItem[] = modelItems(ordered, authoring?.provider, chosen).map((item, index) => ({
    ...item,
    model: item.label,
    ...(reviewer !== null && ordered[index]?.provider === reviewer.provider
      ? {
          description: [
            item.description,
            `same vendor as your Primary Reviewer (${reviewer.model}); this session would not start`,
          ]
            .filter((part) => part)
            .join(" · "),
        }
      : {}),
  }));
  if (!choice.modelRequired) {
    items.push({ label: "The engine's default", description: "no `--model` is passed", model: "" });
  }
  items.push({ label: ENTER_MODEL_ID, description: "for an id the CLI knows that this list does not" });
  return items;
}

/** The terminal Start opens for a choice, or the refusal when a seat has no model. */
export function engineTerminalFor(
  repository: SessionsRepository,
  choice: EngineChoice,
  model: string,
  sentence: string = openingSentence(),
  name: string = choice.label,
): EngineTerminal | string {
  const cli = ENGINE_CLI[choice.engine];
  if (!cli) return `${choice.label} has no known CLI to open; nothing was launched.`;
  if (choice.modelRequired && model.trim() === "") {
    return `${choice.label} is a seat and needs a model; nothing was launched.`;
  }
  // The value the operator chose, spelled as they chose it. NOT normalised:
  // `normalizeModelToken` drops the date suffix, and the date suffix is what
  // makes a pin a pin -- a launch that quietly generalised `claude-opus-5-
  // 20260901` to `claude-opus-5` would be answering with a model nobody
  // named. The CLI is the authority on whether it knows the id, and it says
  // so plainly when it does not.
  const wanted = model.trim();
  const modelArgs = cli.modelFlag !== null && wanted !== "" ? [cli.modelFlag, wanted] : [];
  return {
    name,
    cwd: repository.root,
    program: cli.program,
    // The flag first and the prompt last: `claude`'s prompt is a POSITIONAL,
    // so anything after it is read as part of it.
    args: [...modelArgs, ...(cli.promptArgs !== null ? cli.promptArgs(sentence) : [])],
    typed: cli.promptArgs !== null ? null : sentence,
    // Inherited by every command the AI spawns, so the router can tell an
    // engine from a person whichever engine this is and whatever its vendor
    // names its own variables. Set here and on no other terminal.
    env: { DABBLER_ENGINE_TERMINAL: "1" },
  };
}

/** How the engine and model boxes are titled for a consult. */
export const CONSULT_PURPOSE = "Consult with AI";

/**
 * What an AI opened to consult is asked first: read the brief, then the
 * operator. It names no waiter, because a consult drives nothing.
 */
export function consultSentence(session?: number): string {
  const dir = SESSIONS_REL.replace(/\\/g, "/");
  const about = session === undefined ? "" : ` --session ${session}`;
  return (
    `Run \`dabbler consult --sessions-dir ${dir}${about}\` and read what it prints before anything else. ` +
    "Then ask me what I need."
  );
}

/** The CLI Consult with AI opens: Start's construction, the consult sentence, and a name of its own. */
export function consultTerminalFor(
  repository: SessionsRepository,
  choice: EngineChoice,
  model: string,
  session?: number,
): EngineTerminal | string {
  const about = session === undefined ? "" : ` (session ${session})`;
  return engineTerminalFor(
    repository,
    choice,
    model,
    consultSentence(session),
    `Consult — ${choice.label} — ${repository.label}${about}`,
  );
}

export interface SessionRunUi {
  /**
   * What this repository's Configuration starts a session with, or the
   * sentence saying what it does not name. `configuredStart` in production;
   * a seam because the reading is this machine's, and a suite that read it
   * would be testing the developer's own preferences.
   */
  configured?: (repoRoot: string) => { picked: EngineChoice; model: string } | string;
  /** Put the Solution Explorer, where the Configuration is, in front of the person. */
  openConfiguration?: () => void;
  /** `purpose` titles the pick; Start's when omitted. */
  pickEngine: (purpose?: string) => Thenable<EngineChoice | undefined>;
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
  askModel: (root: string, choice: EngineChoice, chosen: string, purpose?: string) => Thenable<string | undefined>;
  /** A yes-or-no the person answers, modally; true only for the named action. */
  confirm: (message: string, action: string) => Thenable<boolean>;
  /** A modal question with named answers; the one picked, or undefined for Cancel. */
  choose: (message: string, actions: readonly string[]) => Thenable<string | undefined>;
  report: (title: string, body: string) => void;
  showErrorMessage: (message: string) => unknown;
  showInformationMessage: (message: string) => unknown;
  /** Open the person's own CLI, interactively, and show it. */
  openTerminal: (terminal: EngineTerminal) => unknown;
  /**
   * Ask the installed CLI whether it knows this model. Answers the model it
   * refused, or null for "it did not refuse" -- which covers no CLI, no
   * answer, and an engine with no pre-flight.
   *
   * It is on this interface for the same reason `openTerminal` is: it runs a
   * process on the machine, and a suite must be able to stand in for every
   * one of those. Without the seam this suite would spawn the developer's
   * own `claude` on every flow test, which is the one thing a test must
   * never do -- it would pass here and mean nothing anywhere else.
   */
  engineKnowsModel: (choice: EngineChoice, model: string) => Thenable<string | null>;
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

function channel(): vscode.OutputChannel {
  return vscode.window.createOutputChannel(CHANNEL_NAME);
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
    // The view the Configuration lives in. A view's own `focus` command is the
    // editor's, named after the view's id.
    openConfiguration: () => void vscode.commands.executeCommand("dabblerSolutionTree.focus"),
    // The one editor-side effect here that is a PROCESS: it asks the
    // installed CLI, which is the only thing that actually knows whether it
    // will run on a model, and it bills nothing doing it.
    engineKnowsModel: (choice, model) => preflightRefusedModel(choice.engine, model),
    pickEngine: (purpose = "Start session") =>
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
            title: `${purpose} — which engine runs it?`,
            placeHolder:
              purpose === CONSULT_PURPOSE
                ? "This engine reads the consult brief and answers you; nothing is driven."
                : "The framework drives; this engine answers each step.",
            ignoreFocusOut: true,
          },
        )
        .then((picked) => picked?.entry),
    askModel: async (root, choice, chosen, purpose = "Start session") => {
      const title = `${purpose} — model for ${choice.label}`;
      const items = modelPickItems(root, choice, chosen);
      if (items !== null) {
        const picked = await vscode.window.showQuickPick(items, { title, ignoreFocusOut: true });
        if (picked === undefined) return undefined;
        if (picked.model !== undefined) return picked.model;
      }
      // On the floor the aliases are what the CLI always accepts, so they are
      // the example worth showing.
      const aliases =
        items === null
          ? listedModels(engineAuthoringReading(root, choice.engine)).map((row) => row.model)
          : [];
      return vscode.window.showInputBox({
        title,
        prompt: choice.modelRequired
          ? purpose === CONSULT_PURPOSE
            ? "Required: the seat's model. It is passed to the CLI; nothing is recorded."
            : "Required: the seat's model. It is passed to the CLI and recorded on the ledger."
          : "Optional: leave empty for the engine's default. It is passed to the CLI as `--model`.",
        placeHolder:
          aliases.length > 0 ? `e.g. ${aliases.join(", ")}` : choice.modelRequired ? "e.g. gpt-5-6-luna" : "e.g. haiku",
        // What the Configuration section already chose, so the pane and this
        // box are one answer rather than two.
        value: chosen,
        ignoreFocusOut: true,
      });
    },
    confirm: (message, action) =>
      vscode.window.showWarningMessage(message, { modal: true }, action).then((picked) => picked === action),
    choose: (message, actions) => vscode.window.showWarningMessage(message, { modal: true }, ...actions),
    report: (title, body) => {
      const out = channel();
      out.appendLine(`--- ${title} ---`);
      out.appendLine(body.trimEnd());
      out.show(true);
    },
    showErrorMessage: (m) => vscode.window.showErrorMessage(m),
    showInformationMessage: (m) => vscode.window.showInformationMessage(m),
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
        ...(spec.env ? { env: { ...spec.env } } : {}),
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

/**
 * Stop Session: the person asking for the machine back, on the row of the
 * session in flight.
 *
 * It is `dabbler session interrupt --stop` and nothing else -- the verb the
 * framework already has, which writes the request the framework reads. It is
 * honoured inside a job as well as between phases, so a verification round or
 * a suite ends rather than running on for a person who asked it to stop;
 * `interrupted` lands on `run.json` with their reason and the session stays
 * in flight. The way back is said to the AI: `dabbler session next`.
 */
export async function runStopSession(
  repository: SessionsRepository,
  ui: SessionRunUi,
  router: Router = productionRouter(),
  promptReason: (prompt: string, placeHolder: string) => Thenable<string | undefined> = (
    prompt,
    placeHolder,
  ) => vscode.window.showInputBox({ prompt, placeHolder, ignoreFocusOut: true }),
): Promise<boolean> {
  const session = repository.currentSession;
  if (session === null) {
    ui.showInformationMessage(`Nothing is in flight in ${repository.label}; there is nothing to stop.`);
    return false;
  }
  const number = String(session).padStart(3, "0");
  // Dismissing the box aborts, as it does everywhere else a reason is
  // asked for: a stop nobody typed a reason into is a stop nobody meant.
  const reason = await promptReason(
    `Why stop session ${number}? The reason is recorded on the stop.`,
    "e.g. I need the machine back",
  );
  if (reason === undefined) return false;
  const result = await router.session.interrupt({
    repoRoot: repository.root,
    sessionNumber: session,
    reason: reason.trim() === "" ? "the operator stopped the session" : reason.trim(),
    stop: true,
  });
  if (!result.ok) {
    ui.showErrorMessage(
      `Stopping session ${number} refused — ${result.message.trim() || `exit ${result.exitCode}`}`,
    );
    return false;
  }
  ui.showInformationMessage(
    `Session ${number} will stop: the framework records the stop the next time it moves, and gives the AI no ` +
      "further instruction. To carry on, ask your AI to run `dabbler session next`.",
  );
  return true;
}

/**
 * What this repository's Configuration starts a session with: the engine and
 * the model it names, or the sentence saying what it does not name.
 *
 * Read and never asked. The engine and the model were each a pick list at
 * every Start, offering back what the Configuration already showed -- so a
 * person answered twice, and the second answer was written nowhere.
 */
export function configuredStart(repoRoot: string): { picked: EngineChoice; model: string } | string {
  const configuration = solutionConfiguration(repoRoot) as { engines?: { chosen?: string | null } } | null;
  const engine = configuration?.engines?.chosen ?? null;
  const picked = ENGINES.find((choice) => choice.engine === engine);
  if (picked === undefined) {
    return (
      "This repository's Configuration names no engine to start a session with, so nothing was started. " +
      "Choose one on the Authoring AI's Vehicle row in the Configuration, which is now in front of you: " +
      "it is saved to this repository, and Start Session then asks nothing."
    );
  }
  const model = chosenAuthoringModel(repoRoot);
  if (picked.modelRequired && model === "") {
    return (
      `${picked.label} needs a model and this repository's Configuration names none, so nothing was started. ` +
      "Choose one on the Authoring AI's Model row in the Configuration, which is now in front of you: " +
      "it is saved to this repository, and Start Session then asks nothing."
    );
  }
  return { picked, model };
}

/**
 * Start is the launch, and what it launches is the person's own CLI.
 *
 * It asks nothing about who authors: the engine and its model are this
 * repository's Configuration, which is where a person chooses them. `ask` is
 * the other command -- *Start Session with Different Models* -- which asks
 * for both, for this one session, and writes neither down. Everything after
 * the launch belongs to the person: their terminal, their chat, their Esc.
 */
export async function runStartSession(
  repository: SessionsRepository,
  ui: SessionRunUi,
  register: SessionRegistrar = defaultSessionRegistrar(),
  ask = false,
): Promise<boolean> {
  const configured = ask ? null : (ui.configured ?? configuredStart)(repository.root);
  if (typeof configured === "string") {
    // To the Configuration and never to a pick list of Start's own: a choice
    // made there is SAVED, so the next Start asks nothing, where one made
    // here would be written nowhere and this message would meet the person
    // again at every Start. The other command is the one that asks.
    ui.showErrorMessage(configured);
    ui.openConfiguration?.();
    return false;
  }
  // A cancelled pick cancels the command, which is what cancelling a decision should do.
  const picked = configured === null ? await ui.pickEngine("Start session with different models") : configured.picked;
  if (!picked) return false;
  const model =
    configured === null
      ? await ui.askModel(repository.root, picked, chosenAuthoringModel(repository.root))
      : configured.model;
  if (model === undefined) return false;
  // Two questions, and they are different questions. One asks what this
  // machine has READ for this engine; the other asks the INSTALLED CLI, which
  // is the only thing that actually knows and says so when it refuses.
  const impossible =
    engineModelRefusal(repository, picked, model) ??
    (await engineRefusesModel(ui, picked, model));
  if (impossible !== null) {
    ui.showErrorMessage(impossible);
    return false;
  }
  const terminal = engineTerminalFor(repository, picked, model);
  if (typeof terminal === "string") {
    ui.showErrorMessage(terminal);
    return false;
  }
  // Registering is the framework's, not the AI's: the identity is on the
  // record before anything opens, and a refusal opens nothing.
  const args = startArguments(picked, model);
  let registered = await register(repository.root, args);
  // Uncommitted changes: committing them or undoing them is the framework's
  // to do, once the person has said which.
  if (registered.code !== 0 && registered.output.includes(COMMIT_CHANGES_FLAG)) {
    const refusal = registered.output.split("\n").find((line) => line.startsWith("start: refused -- ")) ?? "";
    const commit = "Commit and Push";
    const undo = "Undo the Changes";
    const answer = await ui.choose(
      `${refusal.replace(/^start: refused -- /, "")}\n\n${commit} commits these files and pushes them. ` +
        `${undo} restores the changed files and removes the new ones, keeping a copy of each ` +
        "outside the repository, in this machine's per-user dabbler data folder.",
      [commit, undo],
    );
    if (answer !== commit && answer !== undo) return false;
    registered = await register(repository.root, [...args, answer === commit ? COMMIT_CHANGES_FLAG : UNDO_CHANGES_FLAG]);
  }
  // Origin holds files this checkout has never had, on a history it does not
  // share: whether they belong in this branch is the person's to say.
  if (registered.code !== 0 && registered.output.includes(MERGE_ORIGIN_FLAG)) {
    const said = registered.output.trim().split("\n").filter((line) => line.includes(MERGE_ORIGIN_FLAG)).join(" ");
    if (!(await ui.confirm(said.replace(/^start: refused -- /, ""), "Merge and Start"))) return false;
    registered = await register(repository.root, [...args, MERGE_ORIGIN_FLAG]);
  }
  if (registered.code !== 0) {
    const said = registered.output.trim();
    ui.showErrorMessage(`The session was not registered, so nothing was opened.${said === "" ? "" : ` ${said}`}`);
    return false;
  }
  // No framework process is started here: the AI's one request, and then each
  // of its answers, is what moves the session on.
  const opened = ui.openTerminal(terminal);
  // The framework's own terminal, beside the CLI. Both, or the person is
  // watching their engine work with no sight of what the framework is
  // doing -- which is the arrangement this session exists to build.
  ui.showFrameworkTerminal(repository.root, opened);
  return true;
}

/**
 * Consult with AI: the person's own CLI, opened to read the consult brief.
 *
 * The same engine and model questions as Start, and the same two refusals,
 * so a model Start would refuse is refused here too. Nothing is registered
 * and no loop is started: a consult drives no session.
 */
export async function runConsultWithAi(
  repository: SessionsRepository,
  ui: SessionRunUi,
  session?: number,
): Promise<boolean> {
  const purpose = CONSULT_PURPOSE;
  const picked = await ui.pickEngine(purpose);
  if (!picked) return false;
  const model = await ui.askModel(repository.root, picked, chosenAuthoringModel(repository.root), purpose);
  if (model === undefined) return false;
  const impossible =
    engineModelRefusal(repository, picked, model) ??
    (await engineRefusesModel(ui, picked, model));
  if (impossible !== null) {
    ui.showErrorMessage(impossible);
    return false;
  }
  const terminal = consultTerminalFor(repository, picked, model, session);
  if (typeof terminal === "string") {
    ui.showErrorMessage(terminal);
    return false;
  }
  ui.openTerminal(terminal);
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

export function registerSessionCommands(
  context: vscode.ExtensionContext,
  router: Router = productionRouter(),
  ui: SessionRunUi = defaultSessionRunUi(),
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabblerSessionSets.startSession", async (arg: unknown) => {
      const repository = repositoryOf(arg);
      if (!repository) return;
      // No channel is shown: the engine is in the terminal that just
      // opened, and the framework's own work goes to the Dabbler
      // terminal rather than here.
      await runStartSession(repository, ui);
    }),
    // The same start, asked: an engine and a model for this one session,
    // written nowhere, so the repository's Configuration is as it was.
    vscode.commands.registerCommand("dabblerSessionSets.startSessionWithDifferentModels", async (arg: unknown) => {
      const repository = repositoryOf(arg);
      if (!repository) return;
      await runStartSession(repository, ui, undefined, true);
    }),
    vscode.commands.registerCommand("dabblerSessionSets.stopSession", async (arg: unknown) => {
      const repository = repositoryOf(arg);
      if (!repository) return;
      await runStopSession(repository, ui, router);
    }),
    vscode.commands.registerCommand("dabbler.consultWithAi", async (arg: unknown) => {
      const repository = repositoryOf(arg);
      if (!repository) return;
      await runConsultWithAi(repository, ui, asSessionNode(arg)?.session.number);
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
}
