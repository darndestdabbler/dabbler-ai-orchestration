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

import * as vscode from "vscode";
import type { ReleaseMode, Router } from "dabbler-ai-router";

import { resolveRouterCli } from "../router/terminalShim";

import {
  ENUMERATION_WORDS,
  providerRelationWord,
  REVIEWER_HELP,
} from "../providers/solutionTreeModel";
import type {
  ConfigRoleName,
  ConfigurationModel,
  Projection,
  SolutionNode,
} from "../providers/solutionTreeModel";

/**
 * The engine the next session is offered, as the router projects it.
 *
 * It lived in a VS Code setting until this read replaced it. A setting is
 * invisible to `dabbler session start` typed in a terminal, so half a
 * machine own configuration could not be seen by the one command that needs
 * it; the choice is a file beside the catalog now, and both surfaces read it
 * through the router.
 */
export function chosenEngineIn(projection: Projection | null | undefined): string | null {
  const chosen = projection?.configuration?.engines?.chosen;
  return chosen === undefined || chosen === null || chosen === "" ? null : chosen;
}

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

const NEXT_SESSION = "This is the default for the NEXT session; a session in flight keeps what its record says.";

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
export function modelItems(
  models: readonly ConfigurationModel[],
  /** The provider the work is authored by, so each option can be labelled against it. */
  authorProvider: string | null | undefined,
  selected: string | null | undefined = null,
): vscode.QuickPickItem[] {
  return models.map((model) => ({
    label: model.model,
    // The row's own words, not a second set: one vocabulary means the pick
    // and the row cannot come to say different things about one model.
    description: [
      model.provider,
      // Derived from the author's provider and this one, which is what the
      // row does too -- the comparison is not a field on the model.
      authorProvider ? providerRelationWord(authorProvider, model.provider) : null,
      // What the source said it costs, in the source's own word, and
      // nothing at all where the source said nothing.
      model.priceCategory ? `${model.priceCategory} price` : null,
      // The router's words for a reviewer from today's authoring vendor:
      // still choosable, because the author is chosen at each Start.
      model.conflict ?? null,
    ]
      .filter((part) => part !== null && part !== "")
      .join(" · "),
    // Which one they already chose, so the list is a place to CHANGE a
    // choice rather than a place to make one over again.
    detail: model.model === selected ? "what you chose" : undefined,
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
  router: Pick<Router, "configure">,
  target: ConfigurationTarget,
  launchable: readonly string[],
  refreshed: () => void,
  ui: ConfigurationUi = defaultConfigurationUi(),
): Promise<void> {
  const root = ui.workspaceRoot();
  if (!root) return;
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
  // Through the ROUTER, into the user-level preferences beside the catalog.
  // It was an editor setting, which `dabbler session start` typed in a
  // terminal could not read -- so a machine could be configured in a way the
  // one command that needs it could not see.
  await write(router, root, { engine: picked.label }, ui, refreshed);
}

/** One router write, with whatever it said handed straight back. */
async function write(
  router: Pick<Router, "configure">,
  root: string,
  choice: {
    engine?: string;
    transport?: string;
    reviewerTransport?: string;
    authoringModel?: string;
    reviewerModel?: string;
    auxiliaryModel?: string;
    release?: ReleaseMode;
    /** Keep it as this person's default rather than this checkout's. */
    mine?: boolean;
  },
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

/**
 * The Reviewing AI's vehicle: the one the row SHOWS, which is the Primary
 * Reviewer's. Writing the machine's `dabbler.transport` from here left the
 * row unchanged whenever `dabbler.reviewerTransport` outranked it -- a toast
 * that said "written" over a row that said what it said before. The
 * machine's own vehicle is `dabbler configure --transport`, and no row sets it.
 */
export async function setReviewerTransport(
  router: Pick<Router, "configure">,
  target: ConfigurationTarget,
  refreshed: () => void,
  ui: ConfigurationUi = defaultConfigurationUi(),
): Promise<void> {
  const root = ui.workspaceRoot();
  if (!root) return;
  const vehicle = target.projection?.configuration?.primaryReviewer?.vehicle;
  const options = vehicle?.options ?? [];
  if (options.length === 0) {
    ui.showWarningMessage(
      "Nothing on this machine can carry the Primary Reviewer, so there is no vehicle to choose.",
    );
    return;
  }
  const picked = await ui.pick(
    options.map((option) => ({
      label: option.id,
      description: option.means,
      detail: option.id === vehicle?.chosen ? "what carries it now" : undefined,
    })),
    {
      title: "What carries the Reviewing AI?",
      placeHolder: vehicle?.decidedBy
        ? `${vehicle.chosen ?? "nothing"} now, decided by ${vehicle.decidedBy}. ${NEXT_SESSION}`
        : NEXT_SESSION,
    },
  );
  if (!picked) return;
  await write(router, root, { reviewerTransport: picked.label }, ui, refreshed);
}

/**
 * Ship by Default or Release on Request, from the solution row: when this
 * solution's sessions publish, written to the checkout's settings by the
 * router, which is where the publish phase reads it.
 */
export async function setRelease(
  router: Pick<Router, "configure">,
  release: ReleaseMode,
  refreshed: () => void,
  ui: ConfigurationUi = defaultConfigurationUi(),
): Promise<void> {
  const root = ui.workspaceRoot();
  if (!root) return;
  await write(router, root, { release }, ui, refreshed);
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
  const root = ui.workspaceRoot();
  if (!root) return;
  // The Configuration node's own action now, because there is ONE catalog
  // and a row for it under the participants would have been a row named
  // after the mechanism again. The record is still the router's: what it is
  // called, what re-reads it and what that costs are read off the projection
  // rather than spelled here.
  const row = (target.projection?.configuration?.records ?? [])[0];
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
  const code = await ui.runVerb(`Dabbler: ${row.record}`, root, args);
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
 * repository that names none falls back to. This makes the row's current
 * value that default, and nothing else: the repository's own choice is as it
 * was. Offered on every row that holds a choice -- both Vehicle rows, the
 * authoring Model row and both reviewers' -- because the rule is one rule.
 *
 * The confirmation says what it reaches: every repository on this machine
 * that names no choice of its own, and nobody else's machine.
 */
export async function setAsMyDefault(
  router: Pick<Router, "configure">,
  target: ConfigurationTarget,
  refreshed: () => void,
  ui: ConfigurationUi = defaultConfigurationUi(),
): Promise<void> {
  const root = ui.workspaceRoot();
  if (!root) return;
  const node = target.node;
  if (!node) return;
  const configuration = target.projection?.configuration;
  const kept = ((): readonly [string, string | null, Record<string, string>] | null => {
    if (node.kind === "configVehicle") {
      return node.who === "authoring"
        ? ["the engine", configuration?.engines?.chosen ?? null, { engine: "" }]
        : ["the reviewing vehicle", configuration?.primaryReviewer?.vehicle?.chosen ?? null, { reviewerTransport: "" }];
    }
    if (node.kind !== "configRole") return null;
    if (node.role === "authoring") {
      return ["the authoring model", configuration?.authoring?.chosen?.model ?? null, { authoringModel: "" }];
    }
    return node.role === "primaryReviewer"
      ? ["the Primary Reviewer's model", configuration?.primaryReviewer?.chosen?.model ?? null, { reviewerModel: "" }]
      : ["the Auxiliary Reviewer's model", configuration?.auxiliaryReviewer?.chosen?.model ?? null, { auxiliaryModel: "" }];
  })();
  const value = kept?.[1] ?? null;
  if (kept === null || value === null || value === "") {
    ui.showWarningMessage(
      "There is nothing on this row to keep: choose a value first, and then keep it as the machine's default.",
    );
    return;
  }
  const agreed = await ui.confirm(
    [
      `Keep '${value}' as this machine's default for ${kept[0]}?`,
      "",
      "It is written to this machine's own preferences, beside your model catalog, and applies in " +
        "every repository here that names no choice of its own -- including one you open for the " +
        "first time. This repository's own choice is left as it is. It is not committed and reaches " +
        "nobody else.",
    ].join("\n"),
    KEEP_AS_MACHINE_DEFAULT,
  );
  if (!agreed) return;
  // The machine's default and only that, for every row alike: without `mine`
  // the same write is this repository's, which is what the row's own control does.
  const [key] = Object.keys(kept[2]) as [string];
  await write(router, root, { [key]: value, mine: true }, ui, refreshed);
}

/** The control's name, which is also the button that confirms it. */
export const KEEP_AS_MACHINE_DEFAULT = "Keep as Machine Default";

/**
 * The model the engine's own CLI is launched on.
 *
 * It answered with a sentence telling the operator to go and type a command,
 * because `dabbler configure` had no `--authoring-model` and never had --
 * a control that reports nothing and changes nothing, on the one row an
 * operator most expects to be able to set. The verb exists now and this
 * calls it.
 *
 * **A session in flight is REPORTED, never offered.** `session start`
 * records the identity and the ledger carries it from that moment, so
 * offering to change it would be offering something the record will not
 * honour. The refusal says which session declared it and that a change
 * reaches the next one.
 */
export async function setAuthoringModel(
  router: Pick<Router, "configure">,
  target: ConfigurationTarget,
  refreshed: () => void,
  ui: ConfigurationUi = defaultConfigurationUi(),
): Promise<void> {
  const root = ui.workspaceRoot();
  if (!root) return;
  const role = target.projection?.configuration?.authoring;
  if (role?.declaredAtStart) {
    ui.showWarningMessage(
      `The session in flight declared '${role.chosen?.model ?? "its model"}' at ` +
        "`session start`, and the ledger has carried it since. This row reports " +
        "that. Close the session to choose what the next one authors with.",
    );
    return;
  }
  const items = modelItems(
    role?.candidates ?? [],
    role?.provider,
    role?.chosen?.model,
  );
  if (items.length === 0) {
    // The same three-part answer the reviewing rows give: which record was
    // read, and why it offered nothing. "No model qualifies" alone is what a
    // seat with eighteen working models was once told.
    const read = role?.enumeration
      ? `The list was read from the ${ENUMERATION_WORDS[role.enumeration] ?? role.enumeration}. `
      : "";
    ui.showWarningMessage(
      `No model is offered for the authoring AI here. ${read}${
        role?.unavailable
          ? `${role.unavailable}.`
          : "The engine's own list could not be read on this machine."
      }`,
    );
    return;
  }
  const picked = await ui.pick(items, {
    title: "Which model authors the next session?",
    // The router's own sentence about the list, not a second one written
    // here: what a list IS -- a reading, against a CLI that is the authority
    // -- is the reading's fact, and two statements of it drift.
    placeHolder: `${role?.note ? `${role.note} ` : ""}${NEXT_SESSION}`,
  });
  if (!picked) return;
  await write(router, root, { authoringModel: picked.label }, ui, refreshed);
}

/**
 * Which model fills one role in the next session.
 *
 * The candidates offered are the ones the router already resolved, and the
 * refusals still come from the router: a list is an offer, and the rule is
 * what decides.
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
  const root = ui.workspaceRoot();
  if (!root) return;
  if (which === "authoring") {
    await setAuthoringModel(router, target, refreshed, ui);
    return;
  }
  const primary = which === "primaryReviewer";
  const role = target.projection?.configuration?.[which];
  // No vehicle question here: the Reviewing AI's Vehicle row is the one
  // control for that, and the models offered are the ones read for whatever
  // it decided.
  const items = modelItems(
    role?.candidates ?? [],
    target.projection?.configuration?.authoring?.provider,
    role?.selected,
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
          : role?.enumeration === "seat-catalog"
            ? "The seat's catalog lists no model for this role."
            : "A provider with no key resolves to no candidate at all."
      }`,
    );
    return;
  }
  const picked = await ui.pick(items, {
    title: primary
      ? "Which model reviews the next session?"
      : "Which model adjudicates a disputed finding?",
    placeHolder:
      (primary
        ? REVIEWER_HELP
        : "It is reached only at an impasse, and never from a provider that has already reviewed the session.") +
      " " +
      NEXT_SESSION,
  });
  if (!picked) return;
  await write(
    router,
    root,
    primary ? { reviewerModel: picked.label } : { auxiliaryModel: picked.label },
    ui,
    refreshed,
  );
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
  const root = ui.workspaceRoot();
  if (!root) return;
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
  const code = await ui.runVerb(`Dabbler: ${label} key`, root, [
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
