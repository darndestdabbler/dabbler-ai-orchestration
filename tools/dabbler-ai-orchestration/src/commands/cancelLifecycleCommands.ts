import * as path from "path";
import * as vscode from "vscode";
import type { RollbackFacts, Router } from "dabbler-ai-router";
import {
  ROLLBACK_REASON,
  RouterUnavailableError,
  cancelConfirmation,
  cancelReason,
  hasStandingStop,
  restoreConfirmation,
  restoreReason,
  rollbackConfirmation,
  rollbackDetail,
  sessionCannotClose,
  sessionRowLabel,
} from "dabbler-ai-router";
import { RouterRefusal, productionRouter } from "../router/host";
import { asSessionNode } from "./workExplorerTreeCommands";
import { openReport, type ReportStopActions } from "./sessionCommands";

/** What a row must carry for these flows: where to spawn, and which
 * session. A repository has sessions, not sets of them. */
export interface CancellableSession {
  root: string;
  number: number;
  name: string;
  /**
   * Pass `--force`: the session is in flight and unresolved at the cap,
   * so it cannot close and cancel is its one exit. Read off the record,
   * never asked of the operator.
   */
  force?: boolean;
  /**
   * A stop the framework recorded stands over this session, the one in
   * flight: the rollback offers to report it first, because the rollback
   * moves aside the run record the report is read from.
   */
  stopStands?: boolean;
}

/**
 * Read a session tree node into the shape the flows take. The node
 * carries the repository (the spawn cwd) and the session record (the
 * number and the name shown in the prompts); anything else is refused
 * rather than guessed at.
 */
export function cancellableSessionOf(arg: unknown): CancellableSession | undefined {
  const node = asSessionNode(arg);
  if (!node) return undefined;
  return {
    root: node.repository.root,
    number: node.session.number,
    name: sessionRowLabel(node.session),
    force: sessionCannotClose(node.session),
    stopStands: hasStandingStop(node.repository, node.session),
  };
}

interface RegisterDeps {
  refreshView: () => void;
}

export interface CancelLifecycleUi {
  /** A modal with its choices in order; dismissing it answers undefined. */
  confirm(summary: string, detail: string, ...choices: string[]): Thenable<string | undefined>;
  /** The offer made once a report is open, as Report this stop makes it. */
  choose(message: string, items: readonly string[]): Thenable<string | undefined>;
  promptReason(prompt: string, placeHolder: string): Thenable<string | undefined>;
  showInformationMessage(message: string): unknown;
  showErrorMessage(message: string): unknown;
}

function defaultUi(): CancelLifecycleUi {
  return {
    confirm: (summary, detail, ...choices) =>
      vscode.window.showInformationMessage(summary, { modal: true, detail }, ...choices),
    choose: (message, items) => vscode.window.showWarningMessage(message, { modal: true }, ...items),
    promptReason: (prompt, placeHolder) =>
      vscode.window.showInputBox({ prompt, placeHolder, ignoreFocusOut: true }),
    showInformationMessage: (m) => vscode.window.showInformationMessage(m),
    showErrorMessage: (m) => vscode.window.showErrorMessage(m),
  };
}

/**
 * The failure sentence.
 *
 * `refused` is stated as "nothing was written" because that is the
 * router's guarantee for a refusal — restoring a session that was never
 * cancelled reaches this path, and telling the operator to reconcile
 * from git for a call that wrote nothing would be actively misleading.
 */
export function describeLifecycleFailure(
  verb: string,
  label: string,
  result: RouterRefusal,
): string {
  const detail = result.message.trim() || `exit ${result.exitCode}`;
  if (result.outcome === "refused") {
    return `${verb} "${label}" refused — ${detail} Nothing was written.`;
  }
  return `Failed to ${verb.toLowerCase()} "${label}": ${detail} Re-run the command to finish.`;
}

/**
 * Both flows go through the router's `session` verb rather than a
 * TypeScript writer of the state file: the state file has one set of
 * sanctioned writers and a second implementation here would drift from
 * them. `session.root` is the repository the router stands in, and it
 * derives its one sessions root from there.
 *
 * Returns true when the tree should refresh.
 */
export async function runCancelSessionFlow(
  session: CancellableSession,
  ui: CancelLifecycleUi = defaultUi(),
  router: Router = productionRouter(),
): Promise<boolean> {
  // Two-step prompt: a confirmation dialog with explicit "Cancel Session"
  // / "Keep" buttons so the (destructive-ish) action requires an
  // affirmative click. Dismissing the dialog returns undefined and aborts.
  // The words are the router's, the one copy every interface asks with.
  const words = cancelConfirmation(session.number, session.name, session.force === true);
  const choice = await ui.confirm(words.title, words.detail ?? "", words.accept, words.keep ?? "Keep");
  if (choice !== words.accept) return false;

  // The reason prompt returns undefined when dismissed with Esc; an empty
  // reason is valid. Both are treated the same, which matches the CLI's
  // own contract.
  const asked = cancelReason(session.name);
  const reason = await ui.promptReason(asked.prompt, asked.placeholder);

  const result = await call(ui, () =>
    router.session.cancel({
      repoRoot: session.root,
      sessionNumber: session.number,
      reason: reason ?? "",
      force: session.force === true,
    }),
  );
  if (!result || !result.ok) {
    if (result) {
      ui.showErrorMessage(
        describeLifecycleFailure("Cancelling", session.name, result),
      );
    }
    return false;
  }
  ui.showInformationMessage(`Cancelled session ${session.number}.`);
  return true;
}

/**
 * Run one router call, reporting an unreachable router and answering
 * `null` for it. An unreachable router is not a refusal — nothing
 * decided anything — so it is reported in the router's own words and
 * never dressed up as a verdict.
 */
async function call<T>(
  ui: CancelLifecycleUi,
  invoke: () => Promise<T>,
): Promise<T | null> {
  try {
    return await invoke();
  } catch (err) {
    ui.showErrorMessage(
      err instanceof RouterUnavailableError ? err.message : String(err),
    );
    return null;
  }
}

export async function runRestoreSessionFlow(
  session: CancellableSession,
  ui: CancelLifecycleUi = defaultUi(),
  router: Router = productionRouter(),
): Promise<boolean> {
  const words = restoreConfirmation(session.number, session.name);
  const choice = await ui.confirm(words.title, words.detail ?? "", words.accept, words.keep ?? "Keep Cancelled");
  if (choice !== words.accept) return false;

  const asked = restoreReason(session.name);
  const reason = await ui.promptReason(asked.prompt, asked.placeholder);

  const result = await call(ui, () =>
    router.session.restore({
      repoRoot: session.root,
      sessionNumber: session.number,
      reason: reason ?? "",
    }),
  );
  if (!result || !result.ok) {
    if (result) {
      ui.showErrorMessage(
        describeLifecycleFailure("Restoring", session.name, result),
      );
    }
    return false;
  }
  ui.showInformationMessage(`Restored session ${session.number}.`);
  return true;
}

// The dialog's detail is the router's, from the dry run's facts; the suite
// holds its words where it always has.
export { rollbackDetail };

const REPORT_FIRST = "Report, Then Roll Back";

/**
 * The third way to end a session, for an implementation that went wrong
 * or a problem that spans several: back to where this session started, it
 * and every session after it discarded. One dialog: the router's dry run
 * supplies the facts, the modal states them and asks once, and nothing is
 * asked after it -- a second box after the modal is where two clicks were
 * lost. The confirm is bound to the facts: the verb is given the HEAD they
 * were read at and refuses a repository that moved while the dialog was
 * open. A dry run the router refuses (a release in the span, a row that is
 * no longer what it was) is shown in the router's words and asks nothing.
 *
 * Where a stop stands, the same dialog offers to report it first: once the
 * rollback has moved its run record aside, nothing can. The report writes
 * only under `.dabbler/`, so the HEAD the facts were read at still holds.
 */
export async function runRollbackSessionFlow(
  session: CancellableSession,
  ui: CancelLifecycleUi = defaultUi(),
  router: Router = productionRouter(),
  actions?: ReportStopActions,
): Promise<boolean> {
  const preview = await call(ui, () =>
    router.session.rollback({
      repoRoot: session.root,
      sessionNumber: session.number,
      reason: ROLLBACK_REASON,
      dryRun: true,
    }),
  );
  if (!preview || !preview.ok) {
    if (preview) {
      ui.showErrorMessage(describeLifecycleFailure("Rolling back", session.name, preview));
    }
    return false;
  }
  let facts: RollbackFacts;
  try {
    facts = JSON.parse(preview.value.stdout) as RollbackFacts;
  } catch {
    ui.showErrorMessage(`Rolling back "${session.name}": the router's answer could not be read. Nothing was written.`);
    return false;
  }

  const words = rollbackConfirmation(session.number, session.name);
  const keep = words.keep ?? "Keep";
  const choice = session.stopStands
    ? await ui.confirm(
        words.title,
        `${rollbackDetail(facts)} ${REPORT_FIRST} writes a report of the stop first, for you to read and send to ` +
          "Dabbler's maintainers if you choose: one provider call, and nothing is sent.",
        REPORT_FIRST,
        words.accept,
        keep,
      )
    : await ui.confirm(words.title, rollbackDetail(facts), words.accept, keep);
  if (choice !== words.accept && choice !== REPORT_FIRST) return false;

  let report: { file: string; said: string } | null = null;
  if (choice === REPORT_FIRST) {
    const written = await call(ui, () => router.session.defectReport({ repoRoot: session.root, rollingBack: true }));
    const file = written?.ok ? /written to (\S+)/.exec(written.value.stdout)?.[1] : undefined;
    if (written?.ok && file !== undefined) {
      report = { file: path.join(session.root, file), said: written.value.stdout };
    } else {
      // Asked once, and the default keeps the session: rolling back is what
      // makes the report impossible. An unreachable router has said its own
      // words already.
      const words =
        written === null
          ? "the router could not be reached."
          : written.ok
            ? written.value.stdout.trim()
            : written.message.trim() || `exit ${written.exitCode}`;
      const anyway = await ui.confirm(
        `No report was written for session ${session.number}'s stop — ${words}`,
        "Once it is rolled back, this stop cannot be reported. Roll back anyway?",
        "Roll Back Anyway",
        "Keep",
      );
      if (anyway !== "Roll Back Anyway") return false;
    }
  }

  const result = await call(ui, () =>
    router.session.rollback({
      repoRoot: session.root,
      sessionNumber: session.number,
      reason: ROLLBACK_REASON,
      asOf: facts.head,
    }),
  );
  const rolledBack = result !== null && result.ok;
  if (result && !result.ok) {
    ui.showErrorMessage(describeLifecycleFailure("Rolling back", session.name, result));
  }
  if (rolledBack) {
    ui.showInformationMessage(
      `Rolled back to the start of session ${session.number}; amend the plan, then Start Session.`,
    );
  }
  // Written is written: the report opens whether or not the rollback went through.
  if (report !== null) await openReport(report.file, report.said, (message, items) => ui.choose(message, items), actions);
  return rolledBack;
}

export function registerCancelLifecycleCommands(
  context: vscode.ExtensionContext,
  deps: RegisterDeps,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabblerSessionSets.cancel",
      async (arg: unknown) => {
        const session = cancellableSessionOf(arg);
        if (!session) return;
        if (await runCancelSessionFlow(session)) deps.refreshView();
      },
    ),
    vscode.commands.registerCommand(
      "dabblerSessionSets.restore",
      async (arg: unknown) => {
        const session = cancellableSessionOf(arg);
        if (!session) return;
        if (await runRestoreSessionFlow(session)) deps.refreshView();
      },
    ),
    vscode.commands.registerCommand(
      "dabblerSessionSets.rollback",
      async (arg: unknown) => {
        const session = cancellableSessionOf(arg);
        if (!session) return;
        if (await runRollbackSessionFlow(session)) deps.refreshView();
      },
    ),
  );
}
