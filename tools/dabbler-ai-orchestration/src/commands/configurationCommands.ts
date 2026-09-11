// The Configuration section's controls: what the NEXT session is run with.
//
// Two settings and two controls, deliberately. `--engine` names who
// orchestrates and the transport names how a provider is reached; they have
// overridden each other here once already, at the level of an environment
// variable, and a single "Copilot or Claude" switch would reproduce that one
// level up where it is harder to see.
//
// They are set in different places because they LIVE in different places.
// The transport and the two models are router configuration, so the router
// writes them -- this file never touches a config file, for the same reason
// the trees never read a manifest. The engine is an argument to `session
// start`, so its default belongs to the surface that offers to start one,
// which is this extension's own setting.
//
// Nothing here changes a session in flight, and every row says so: engine
// identity is recorded per session at `session start` and is on the record
// from that moment, so a control that appeared to change one would be
// offering something the ledger will not honour.

import * as vscode from "vscode";
import { VALID_TRANSPORTS, type Router } from "dabbler-ai-router";

import { resolveRouterCli } from "../router/terminalShim";

import { ENUMERATION_WORDS, FIDELITY_WORDS } from "../providers/solutionTreeModel";
import type {
  ConfigurationModel,
  Projection,
  SolutionNode,
} from "../providers/solutionTreeModel";

/** The setting the Start pick reads for its default; the pane writes it. */
export const ENGINE_SETTING = "dabbler.engine";

/** What a control needs of the editor, so the suite can drive one. */
export interface ConfigurationUi {
  /** The one confirmation this section asks for. */
  confirm: (message: string, action: string) => Thenable<boolean>;
  /** Run one router verb where the operator can watch it. */
  runVerb: (title: string, cwd: string, args: readonly string[]) => void;
  pick: (
    items: readonly vscode.QuickPickItem[],
    options: vscode.QuickPickOptions,
  ) => Thenable<vscode.QuickPickItem | undefined>;
  showInformationMessage: (message: string) => unknown;
  showWarningMessage: (message: string) => unknown;
  workspaceRoot: () => string | undefined;
  /** Where the engine default is remembered, which is not a config file. */
  setEngine: (engine: string) => Thenable<void>;
  /** Open a file for reading, wherever on the machine it lives. */
  openFile: (path: string) => Thenable<unknown>;
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
        return;
      }
      const terminal = vscode.window.createTerminal({
        name: title,
        cwd,
        shellPath: process.execPath,
        shellArgs: [cli, ...args],
        env: { ELECTRON_RUN_AS_NODE: "1" },
      });
      terminal.show();
    },
    pick: (items, options) => vscode.window.showQuickPick(items, options),
    showInformationMessage: (m) => vscode.window.showInformationMessage(m),
    showWarningMessage: (m) => vscode.window.showWarningMessage(m),
    workspaceRoot: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    setEngine: (engine) =>
      vscode.workspace
        .getConfiguration()
        .update(ENGINE_SETTING, engine, vscode.ConfigurationTarget.Global),
    openFile: (path) =>
      vscode.workspace.openTextDocument(vscode.Uri.file(path)).then(
        (document) => vscode.window.showTextDocument(document, { preview: true }),
        () =>
          vscode.window.showWarningMessage(
            `There is nothing at ${path} yet. Update the catalog to read one -- it costs nothing.`,
          ),
      ),
  };
}

/** The engine the next session is offered, or null when nobody has chosen. */
export function chosenEngine(): string | null {
  const declared = vscode.workspace.getConfiguration().get<string>(ENGINE_SETTING);
  return declared === undefined || declared === "" ? null : declared;
}

const NEXT_SESSION = "This is the default for the NEXT session; a session in flight keeps what its record says.";

/** What each transport costs, which is the half of the choice that matters. */
const TRANSPORT_MEANS: Record<string, string> = {
  api: "the provider's own endpoint, billed in tokens",
  "copilot-cli": "a Copilot seat, billed in premium requests",
  offline: "scripted answers from disk: no network, no spend",
};

/**
 * The engines a row may offer, with what the machine found beside each.
 *
 * `launchable` is what Start Session can actually open, and an engine
 * outside it is not offered here. The pane sets the default Start Session
 * is given, so persisting a name Start Session has no launch for would be a
 * setting that silently does nothing -- which is worse than the machine
 * simply not being able to run that engine yet. `codex` is the live case:
 * the router recognises it and its CLI's argv has never been measured, so
 * Start Session does not offer it and neither does this.
 */
function engineItems(
  projection: Projection | null,
  launchable: readonly string[],
): vscode.QuickPickItem[] {
  const installed = projection?.configuration?.engines?.installed ?? [];
  return installed
    .filter((entry) => launchable.includes(entry.engine))
    .map((entry) => ({
      label: entry.engine,
      description: entry.path === null ? `\`${entry.program}\` is not on PATH` : entry.program,
      detail: entry.path ?? undefined,
    }));
}

/**
 * The models to offer, each carrying what the record says about it.
 *
 * The list is where the choice is actually made, so it is where the answer
 * has to be: offering a model the record says nothing about beside one a
 * provider has vouched for, with nothing to tell them apart, is the promise
 * session 144 exists to stop this surface making. The wording is the row's
 * own -- one vocabulary, so the pick and the row cannot come to disagree.
 */
function modelItems(
  models: readonly ConfigurationModel[],
  transport: string | undefined,
): vscode.QuickPickItem[] {
  return models.map((model) => ({
    label: model.model,
    description:
      model.fidelity === undefined
        ? model.provider
        : `${model.provider} · ${FIDELITY_WORDS[model.fidelity]}${
            transport ? ` on ${transport}` : ""
          }`,
    detail: model.alias,
  }));
}

export interface ConfigurationTarget {
  readonly node?: SolutionNode;
  readonly projection?: Projection | null;
}

/**
 * Which engine the next session is offered.
 *
 * A CLI that is not installed is still offered, and says it is not: a
 * machine that is about to have Codex on it is a normal thing, and hiding
 * the row would make the pane's list a claim about what may be chosen rather
 * than a report of what is here.
 */
export async function setEngine(
  target: ConfigurationTarget,
  launchable: readonly string[],
  ui: ConfigurationUi = defaultConfigurationUi(),
): Promise<void> {
  const items = engineItems(target.projection ?? null, launchable);
  if (items.length === 0) {
    ui.showWarningMessage(
      "There is no engine here that Start Session can open. It offers the CLIs whose launch has been measured, and this machine has none of them on PATH.",
    );
    return;
  }
  const picked = await ui.pick(items, {
    title: "Which engine runs the next session?",
    placeHolder: NEXT_SESSION,
  });
  if (!picked) return;
  await ui.setEngine(picked.label);
  ui.showInformationMessage(`${picked.label} is the engine the next session is offered. ${NEXT_SESSION}`);
}

/** One router write, with whatever it said handed straight back. */
async function write(
  router: Pick<Router, "configure">,
  root: string,
  choice: { transport?: string; authoringModel?: string; verifyingModel?: string },
  ui: ConfigurationUi,
  refreshed: () => void,
): Promise<void> {
  const result = await router.configure({ repoRoot: root, ...choice });
  if (!result.ok) {
    // The router's own words. A refusal reworded here would be a second
    // statement of a rule selection owns -- and the rule is the reason the
    // refusal is worth reading.
    ui.showWarningMessage((result.message ?? result.outcome).trim() || "Dabbler refused that.");
    return;
  }
  ui.showInformationMessage((result.value.stdout ?? "").trim() || "Written.");
  refreshed();
}

export async function setTransport(
  router: Pick<Router, "configure">,
  target: ConfigurationTarget,
  refreshed: () => void,
  ui: ConfigurationUi = defaultConfigurationUi(),
): Promise<void> {
  const root = ui.workspaceRoot();
  if (!root) return;
  const transport = target.projection?.configuration?.transport;
  const picked = await ui.pick(
    // The names come from the router: one home for the vocabulary, so a
    // transport added there is offered here without anybody remembering to
    // add it twice.
    VALID_TRANSPORTS.map((name) => ({
      label: name,
      description: TRANSPORT_MEANS[name] ?? "",
    })),
    {
      title: "How is a provider reached for the next session?",
      placeHolder: transport?.decidedBy
        ? `${transport.effective} now, decided by ${transport.decidedBy}. ${NEXT_SESSION}`
        : NEXT_SESSION,
    },
  );
  if (!picked) return;
  await write(router, root, { transport: picked.label }, ui, refreshed);
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
  ui: ConfigurationUi = defaultConfigurationUi(),
): Promise<void> {
  const root = ui.workspaceRoot();
  if (!root) return;
  if (!target.node || target.node.kind !== "configRecord") return;
  const named = target.node.record;
  const row = (target.projection?.configuration?.records ?? []).find(
    (record) => record.record === named,
  );
  if (!row) return;
  const argv = row.command.trim().split(/\s+/);
  // The router's own line, with its program name dropped: what is left is
  // the verb and its arguments, which is what the bundled router is handed.
  const args = argv[0] === "dabbler" ? argv.slice(1) : argv;
  const agreed = await ui.confirm(
    [
      `Refresh ${row.record}?`,
      "",
      row.cost ?? "",
      "",
      `It runs \`${row.command}\` in a terminal, where you can watch it.`,
    ].join("\n"),
    "Refresh",
  );
  if (!agreed) return;
  ui.runVerb(`Dabbler: ${row.record}`, root, args);
}

/**
 * Open the catalog this machine reads, so an operator can see what it says.
 *
 * The path is the router's, off the same row: where a machine keeps its
 * catalog is a per-platform fact the discovery module already resolves, and
 * a second resolution here is the one that would disagree with it.
 */
export async function viewRecord(
  target: ConfigurationTarget,
  ui: ConfigurationUi = defaultConfigurationUi(),
): Promise<void> {
  if (!target.node || target.node.kind !== "configRecord") return;
  const named = target.node.record;
  const row = (target.projection?.configuration?.records ?? []).find(
    (record) => record.record === named,
  );
  if (!row) return;
  await ui.openFile(row.path);
}

/**
 * Which model authors, and which one verifies.
 *
 * The candidates offered are the ones the router already resolved for that
 * role -- for the verifier, the list left after the authoring model's own
 * provider is excluded. The refusals still come from the router: a list is
 * an offer, and the rule is what decides.
 */
export async function setRoleModel(
  router: Pick<Router, "configure">,
  target: ConfigurationTarget,
  refreshed: () => void,
  ui: ConfigurationUi = defaultConfigurationUi(),
): Promise<void> {
  const root = ui.workspaceRoot();
  if (!root) return;
  if (!target.node || target.node.kind !== "configRole") return;
  const authoring = target.node.role === "authoring";
  const role = authoring
    ? target.projection?.configuration?.authoring
    : target.projection?.configuration?.verifying;
  const items = modelItems(
    role?.candidates ?? [],
    target.projection?.configuration?.fidelityTransport,
  );
  if (items.length === 0) {
    // Which record was read, and why it offered nothing. "No model
    // qualifies" on its own is what a Copilot seat with eighteen working
    // models was told while the pane read the direct-API registry.
    const read = role?.enumeration
      ? `The list was read from the ${ENUMERATION_WORDS[role.enumeration] ?? role.enumeration}. `
      : "";
    ui.showWarningMessage(
      `No model qualifies for that role here. ${read}${
        role?.unavailable
          ? `${role.unavailable}.`
          : "A provider with no key resolves to no candidate at all."
      }`,
    );
    return;
  }
  const picked = await ui.pick(items, {
    title: authoring ? "Which model authors the next session's calls?" : "Which model verifies it?",
    placeHolder:
      !authoring && (role?.excludes ?? []).length > 0
        ? `From another provider than the authoring model's (${(role?.excludes ?? []).join(", ")}). ${NEXT_SESSION}`
        : NEXT_SESSION,
  });
  if (!picked) return;
  await write(
    router,
    root,
    authoring ? { authoringModel: picked.label } : { verifyingModel: picked.label },
    ui,
    refreshed,
  );
}
