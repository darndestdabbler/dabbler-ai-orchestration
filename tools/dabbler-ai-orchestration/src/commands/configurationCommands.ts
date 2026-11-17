// The Configuration section's controls: what the NEXT session is run with.
//
// `--engine` names who orchestrates and the transport names how a provider
// is reached; they have overridden each other here once already, at the
// level of an environment variable, and a single "Copilot or Claude" switch
// would reproduce that one level up where it is harder to see.
//
// **A vehicle belongs to a role.** The authoring model runs inside the
// engine's own CLI; a reviewer is dispatched by the router over a transport,
// and it is the reviewer's OWN transport rather than the machine's -- which
// is the case this framework has stated since the transport reading was
// written and no surface could act on. One word in front of a developer,
// two kinds underneath.
//
// They are set in different places because they LIVE in different places.
// The transports and the models are router configuration, so the router
// writes them -- this file never touches a config file, for the same reason
// the trees never read a manifest. The engine is an argument to `session
// start`, so its default belongs to the surface that offers to start one,
// which is this extension's own setting.
//
// Nothing here changes a session in flight, and every row says so: engine
// identity is recorded per session at `session start` and is on the record
// from that moment, so a control that appeared to change one would be
// offering something the ledger will not honour.

import * as os from "os";
import * as vscode from "vscode";
import {
  MACHINE_DEFAULT_MEANS,
  ROLE_COMMANDS,
  configurationSetAction,
  keepAsMachineDefaultAction,
  parseConfigureArgs,
  type Router,
} from "dabbler-ai-router";

import { resolveRouterCli } from "../router/terminalShim";

import type { ConfigRoleName, Projection, SolutionNode } from "../providers/solutionTreeModel";

// The control's name and the Mechanic's clearing choice are the router's
// words, shared with every interface that shows the same pickers.
export { KEEP_AS_MACHINE_DEFAULT, SAME_AS_AUTHORING } from "dabbler-ai-router";

/** What a control needs of the editor, so the suite can drive one. */
export interface ConfigurationUi {
  /** The one confirmation this section asks for. */
  confirm: (message: string, action: string) => Thenable<boolean>;
  /**
   * Run one router verb where the operator can watch it, and answer when it
   * ends with the code it ended on -- undefined where that cannot be known.
   *
   * Awaitable, because the caller's job is not done when the verb starts. A
   * refresh rewrites a file at the USER level, outside every glob this
   * window can watch, so the repaint after it has to be CAUSED; a command
   * that returned at the spawn left the operator watching a terminal say it
   * had re-read their catalog beside a pane still showing the old reading.
   */
  runVerb: (
    title: string,
    cwd: string,
    args: readonly string[],
  ) => Thenable<number | undefined>;
  pick: (
    items: readonly vscode.QuickPickItem[],
    options: vscode.QuickPickOptions,
  ) => Thenable<vscode.QuickPickItem | undefined>;
  showInformationMessage: (message: string) => unknown;
  showWarningMessage: (message: string) => unknown;
  workspaceRoot: () => string | undefined;
}

export function defaultConfigurationUi(): ConfigurationUi {
  return {
    confirm: (message, action) =>
      vscode.window
        .showInformationMessage(message, { modal: true }, action)
        .then((choice) => choice === action),
    // A terminal, and not the in-process router: reading three vendor
    // endpoints and opening a conversation on a seat is exactly the kind of
    // work the in-process contract says belongs in a terminal, because it
    // runs on the extension host's UI thread. It is also work an operator
    // should SEE happening, even when it is free.
    runVerb: (title, cwd, args) => {
      const cli = resolveRouterCli();
      if (cli === null) {
        void vscode.window.showWarningMessage(
          "The bundled router could not be found beside this extension, so there is nothing to run.",
        );
        return Promise.resolve(undefined);
      }
      const terminal = vscode.window.createTerminal({
        name: title,
        cwd,
        shellPath: process.execPath,
        shellArgs: [cli, ...args],
        env: { ELECTRON_RUN_AS_NODE: "1" },
      });
      terminal.show();
      // The router IS this terminal's shell, so the terminal closes when the
      // verb exits and `exitStatus` carries the code. That is the one signal
      // this window gets that a user-level file has finished moving.
      return new Promise<number | undefined>((settle) => {
        const closed = vscode.window.onDidCloseTerminal((ended) => {
          if (ended !== terminal) return;
          closed.dispose();
          settle(ended.exitStatus?.code ?? undefined);
        });
      });
    },
    pick: (items, options) => vscode.window.showQuickPick(items, options),
    showInformationMessage: (m) => vscode.window.showInformationMessage(m),
    showWarningMessage: (m) => vscode.window.showWarningMessage(m),
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
  };
}

export interface ConfigurationTarget {
  readonly node?: SolutionNode;
  readonly projection?: Projection | null;
}

/**
 * Run one `dabbler configure` command a row's choice named, through the
 * router, with whatever it said handed straight back.
 *
 * The command is the ROUTER's: which flag a choice writes, and whether it is
 * this repository's or this machine's default, is decided where the choice
 * is, for every interface alike. With no folder open it is this machine's
 * default, and the toast says in one sentence what a machine default is.
 */
async function runConfigure(
  router: Pick<Router, "configure">,
  root: string | null,
  argv: readonly string[],
  ui: ConfigurationUi,
  refreshed: () => void,
): Promise<void> {
  const options = parseConfigureArgs(argv.slice(2));
  if (typeof options === "string") {
    ui.showWarningMessage(`Dabbler refused that: ${options}.`);
    return;
  }
  const result = await router.configure(options);
  if (!result.ok) {
    // The router's own words. A refusal reworded here would be a second
    // statement of a rule selection owns -- and the rule is the reason the
    // refusal is worth reading.
    ui.showWarningMessage((result.message ?? result.outcome).trim() || "Dabbler refused that.");
    return;
  }
  const said = (result.value.stdout ?? "").trim() || "Written.";
  ui.showInformationMessage(root === null ? `${said}\n\n${MACHINE_DEFAULT_MEANS}` : said);
  refreshed();
}

/**
 * One set action, as the router offers it on its row: the list it carries,
 * or the router's words for why there is nothing to list -- then the command
 * the chosen one names.
 *
 * Nothing here decides what may be chosen. A list is the router's, read off
 * the same reading the rows were painted from, so the pick and the row
 * cannot come to say different things.
 */
async function choose(
  router: Pick<Router, "configure">,
  target: ConfigurationTarget,
  id: string,
  refreshed: () => void,
  ui: ConfigurationUi,
): Promise<void> {
  const root = ui.workspaceRoot() ?? null;
  const offered = configurationSetAction(id, root, target.projection?.configuration ?? {});
  if (offered?.unavailable) {
    ui.showWarningMessage(offered.unavailable);
    return;
  }
  const pick = offered?.pick;
  if (!pick) return;
  const picked = await ui.pick(
    pick.choices.map((choice) => ({
      label: choice.label,
      description: choice.description ?? undefined,
      detail: choice.detail ?? undefined,
    })),
    { title: pick.title, placeHolder: pick.placeholder },
  );
  if (!picked) return;
  const choice = pick.choices.find((entry) => entry.label === picked.label);
  if (!choice) return;
  await runConfigure(router, root, choice.argv, ui, refreshed);
}

/**
 * Which engine the next session is offered.
 *
 * A CLI that is not installed is still offered, and says it is not: a
 * machine that is about to have Codex on it is a normal thing, and hiding
 * the row would make the pane's list a claim about what may be chosen rather
 * than a report of what is here. Only an engine Start Session can open is
 * offered, which is the router's list.
 */
export async function setEngine(
  router: Pick<Router, "configure">,
  target: ConfigurationTarget,
  refreshed: () => void,
  ui: ConfigurationUi = defaultConfigurationUi(),
): Promise<void> {
  await choose(router, target, "dabblerSolution.setEngine", refreshed, ui);
}

/**
 * The Reviewing AI's vehicle: the one the row SHOWS, which is the Primary
 * Reviewer's. The machine's own vehicle is `dabbler configure --transport`,
 * and no row sets it.
 */
export async function setReviewerTransport(
  router: Pick<Router, "configure">,
  target: ConfigurationTarget,
  refreshed: () => void,
  ui: ConfigurationUi = defaultConfigurationUi(),
): Promise<void> {
  await choose(router, target, "dabblerSolution.setReviewerTransport", refreshed, ui);
}

/**
 * The router's own line, with its program name dropped: what is left is the
 * verb and its arguments, which is what the bundled router is handed.
 */
function verbArgs(command: string): string[] {
  const argv = command.trim().split(/\s+/);
  return argv[0] === "dabbler" ? argv.slice(1) : argv;
}

/**
 * Read, unasked, a transport this machine can reach and has never read.
 *
 * Returns the function the Configuration section calls each time it is
 * painted; it runs the refresh at most once in the window's life, and only
 * while the reading says a reachable transport is unread. It may run unasked
 * because the refresh sends no prompt and bills nothing -- and until it has
 * run, every model choice on that transport fails against an empty list. The
 * terminal is the one Update the Catalog uses, so it is seen happening. A
 * refresh that fails leaves the rows saying what they said; the terminal
 * already says why. With no folder open it runs in the home directory: the
 * catalog is the machine's, and reading it needs no repository.
 */
export function unreadCatalogReader(
  ui: ConfigurationUi = defaultConfigurationUi(),
): (projection: Projection | null | undefined, refreshed: () => void) => Promise<void> {
  let taken = false;
  return async (projection, refreshed) => {
    const row = (projection?.configuration?.records ?? [])[0];
    if (taken || !row || (projection?.configuration?.unread ?? []).length === 0) return;
    taken = true;
    await ui.runVerb(`Dabbler: ${row.record}`, ui.workspaceRoot() ?? os.homedir(), verbArgs(row.command));
    refreshed();
  };
}

/** Where installing an engine CLI is explained: the README's requirements and setup table. */
export const ENGINE_INSTALL_URL =
  "https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/tools/dabbler-ai-orchestration/README.md#requirements";

/** What the no-engine warning needs of the editor. */
export interface EngineWarningUi {
  warn: (message: string, action: string) => Thenable<string | undefined>;
  open: (url: string) => unknown;
}

/**
 * Tell a machine with no engine CLI on PATH, before a session fails for it.
 *
 * Only on a reading that SAYS so -- engines listed and none found. A reading
 * that could not be taken carries no engines and is not evidence of absence.
 * It tells and installs nothing. Answers whether it warned.
 */
export async function warnWhenNoEngine(
  reading: unknown,
  ui: EngineWarningUi = {
    warn: (message, action) => vscode.window.showWarningMessage(message, action),
    open: (url) => vscode.env.openExternal(vscode.Uri.parse(url)),
  },
): Promise<boolean> {
  const installed = (reading as Projection["configuration"] | null)?.engines?.installed ?? [];
  if (installed.length === 0 || installed.some((entry) => entry.path !== null)) return false;
  const action = "How to install";
  const picked = await ui.warn(
    "No engine CLI is on PATH, so no session can start here. Install Claude Code or the GitHub Copilot CLI " +
      "(`winget install GitHub.Copilot`), then reload the window.",
    action,
  );
  if (picked === action) ui.open(ENGINE_INSTALL_URL);
  return true;
}

/**
 * Update the catalog: re-read every transport this machine has.
 *
 * The command run is the one the ROUTER named on the row rather than one
 * spelled here: which invocation re-reads the catalog is the discovery
 * module's fact, and a copy of it in a pane is the copy that goes stale.
 *
 * It asks first, and the question carries the cost -- which is nothing, and
 * says so, because an operator who has read this repository's older words
 * has been told otherwise.
 */
export async function refreshRecord(
  target: ConfigurationTarget,
  /**
   * Invalidate the capability reading and repaint.
   *
   * This command was the ONE in this section given no callback, and it is
   * the one that needed it most: what it rewrites is the model catalog, at
   * the user level, outside every glob a workspace watcher can be built
   * from. The operator refreshed at 07:30:38Z and the pane went on showing
   * the old reading. The user-level watcher session 157 added is a second
   * chance; the repaint is caused here.
   */
  refreshed: () => void,
  ui: ConfigurationUi = defaultConfigurationUi(),
): Promise<void> {
  const root = ui.workspaceRoot() ?? null;
  // The Configuration node's own action now, because there is ONE catalog
  // and a row for it under the participants would have been a row named
  // after the mechanism again. The record is still the router's: what it is
  // called, what re-reads it and what that costs are read off the projection
  // rather than spelled here.
  const row = (target.projection?.configuration?.records ?? [])[0];
  if (!row) return;
  const args = verbArgs(row.command);
  const agreed = await ui.confirm(
    [
      `Refresh ${row.record}?`,
      "",
      row.cost ?? "",
      "",
      `It runs \`${row.command}\` in a terminal, where you can watch it.`,
      "",
      // The one condition under which the answer is no, said before the
      // click rather than in the terminal afterwards. The refusal is the
      // right one -- a session that re-reads its own verifier pool mid-run
      // has edited the conditions of its own review -- but a question that
      // promises an operation it is in no position to offer teaches the
      // reader to distrust the next question too.
      "While a session is in flight the refresh is refused, because a session that changes its own verifier pool while running has edited the conditions of its own review. Run it between sessions.",
    ].join("\n"),
    "Refresh",
  );
  if (!agreed) return;
  const code = await ui.runVerb(`Dabbler: ${row.record}`, root ?? os.homedir(), args);
  // Whatever it ended on, the reading is re-taken and the tree repainted: a
  // refresh that failed halfway still moved the file, and a pane left
  // showing the state before it would be wrong in the one direction an
  // operator cannot check.
  refreshed();
  if (code === 0 || code === undefined) {
    ui.showInformationMessage(
      `${row.record} re-read. What this machine can reach has been recomputed ` +
        "and the Configuration section is showing it.",
    );
    return;
  }
  // The router already said why, in the terminal the operator was watching.
  // Repeating its words here would be a second rendering of one refusal.
  ui.showWarningMessage(
    `${row.record} did not finish (exit ${code}). The terminal it ran in says ` +
      "why; the Configuration section is showing whatever it did manage to write.",
  );
}

/**
 * Keep this row's choice as the MACHINE's default.
 *
 * Every choice is this repository's, and the machine's is only the default a
 * repository that names none falls back to. Offered on every row that holds
 * a choice -- both Vehicle rows, the authoring Model row and both reviewers'
 * -- and the command, the confirmation and the refusal are the router's.
 */
export async function setAsMyDefault(
  router: Pick<Router, "configure">,
  target: ConfigurationTarget,
  refreshed: () => void,
  ui: ConfigurationUi = defaultConfigurationUi(),
): Promise<void> {
  const root = ui.workspaceRoot() ?? null;
  const node = target.node;
  if (!node) return;
  if (node.kind !== "configVehicle" && node.kind !== "configRole") return;
  const offered = keepAsMachineDefaultAction(node, root, target.projection?.configuration ?? {});
  if (offered.unavailable || !offered.argv) {
    ui.showWarningMessage(offered.unavailable ?? "There is nothing on this row to keep.");
    return;
  }
  const confirm = offered.confirm;
  if (confirm) {
    const agreed = await ui.confirm(
      confirm.detail ? `${confirm.title}\n\n${confirm.detail}` : confirm.title,
      confirm.accept,
    );
    if (!agreed) return;
  }
  await runConfigure(router, root, offered.argv, ui, refreshed);
}

/**
 * Which model fills one role in the next session.
 *
 * The candidates offered are the ones the router already resolved, and the
 * refusals still come from the router: a list is an offer, and the rule is
 * what decides. A session in flight is REPORTED, never offered: the router
 * says so in place of a list.
 *
 * **The role is an argument and is never read off the clicked row.** A
 * `view/item/context` entry carries no arguments, so the participant rows --
 * *Authoring AI*, *Reviewing AI* -- offer one command per model beneath
 * them; a single command asked to serve all three would have to guess which
 * model a right-click on the parent meant.
 */
export async function setRoleModel(
  router: Pick<Router, "configure">,
  target: ConfigurationTarget,
  which: ConfigRoleName,
  refreshed: () => void,
  ui: ConfigurationUi = defaultConfigurationUi(),
): Promise<void> {
  await choose(router, target, ROLE_COMMANDS[which], refreshed, ui);
}

/** Whether the framework may call in the Mechanic: `dabbler.mechanic`, this checkout's. */
export async function setMechanic(
  router: Pick<Router, "configure">,
  refreshed: () => void,
  ui: ConfigurationUi = defaultConfigurationUi(),
): Promise<void> {
  await choose(router, {}, "dabblerSolution.setMechanic", refreshed, ui);
}

/**
 * Store a key for this provider, in a terminal and never in this window.
 *
 * **The secret is not collected here, and this is the whole design of the
 * row.** An input box's contents live in the editor's own buffers, in its
 * undo history and in whatever a window's telemetry happens to carry, and
 * none of that is somewhere this framework can reach in to clear. `dabbler
 * auth set` asks in a terminal with the echo off, reads the answer on a
 * pipe, and hands it straight to the platform's store.
 *
 * What this command does is open that terminal with the right verb typed,
 * wait for it to end, and repaint -- because the file it writes is at the
 * USER level, outside every glob this window can watch, which is the same
 * reason the catalog refresh causes its own repaint rather than awaiting
 * one.
 */
export async function storeCredential(
  target: ConfigurationTarget,
  refreshed: () => void,
  ui: ConfigurationUi = defaultConfigurationUi(),
): Promise<void> {
  const root = ui.workspaceRoot() ?? null;
  const node = target.node;
  if (!node || node.kind !== "configCredential") return;
  const credential = (target.projection?.configuration?.credentials ?? []).find(
    (row) => row.provider === node.provider,
  );
  if (!credential) return;
  const label = credential.displayLabel ?? credential.provider;
  // **No confirmation, and that is the decision rather than an omission.**
  // Every other control in this section confirms because it WRITES
  // something the moment it is answered -- a committed setting, a refresh
  // of a user-level record. This one writes nothing: it opens a terminal
  // that asks, with its own question in its own words, and closing that
  // terminal is the no. A modal in front of it is two questions for one
  // answer, and the walk found the practical half of the same point -- the
  // modal blocked the window it was drawn over.
  const code = await ui.runVerb(`Dabbler: ${label} key`, root ?? os.homedir(), [
    "auth",
    "set",
    credential.provider,
    ...(credential.reference ? ["--name", credential.reference] : []),
  ]);
  // Whatever it ended on: the store is at the user level, outside every
  // glob this window can watch, so the row's reading is stale either way
  // and the repaint is CAUSED rather than awaited.
  refreshed();
  if (code === 0 || code === undefined) return;
  // The router said why in the terminal the operator was watching; a second
  // rendering of one refusal is how two accounts of it come to disagree.
  ui.showWarningMessage(
    `No ${label} key was stored (exit ${code}). The terminal it ran in says why.`,
  );
}
