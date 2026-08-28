// The copyable prompt commands.
//
// Four commands write a prompt to the clipboard:
//
//   dabbler.copyStartNextSessionPrompt  (a repository with work left)
//   dabbler.copySessionRunPrompt        (the one next-runnable session row)
//   dabbler.copySendBackPrompt          (a session that stopped at the cap)
//   dabbler.respecifySession            (the same, plus the plan at its block)
//
// Prompts reference file paths from the repository root and NEVER embed
// file contents — the artifacts under review are read by the engine that
// receives the prompt, not pasted into it. The two planning-time prompts
// hand the engine the exact lifecycle commands that already exist for the
// work they name; neither invents a verb the router does not have.

import * as path from "path";
import * as vscode from "vscode";
import { SessionRecord, SessionsRepository } from "../types";
import {
  START_NEXT_SESSION_PROMPT,
  sessionNeedsReading,
  sessionOffersRunPrompt,
} from "../providers/rowMenuHelpers";
import { asRepositoryNode, asSessionNode } from "./workExplorerTreeCommands";

/**
 * The run prompt for a SESSION row, or `null` when that row must not
 * offer one.
 *
 * The text is the repository-level phrase unchanged — deliberately the
 * SAME string, because it is the framework's documented trigger and this
 * mints no new vocabulary. What is session-scoped is the GATE:
 * `sessionOffersRunPrompt` allows exactly the row that phrase resolves
 * to, so the prompt on a row always starts that row's session.
 *
 * The toast names the session number rather than echoing the phrase, so
 * the operator can see at a glance that the row they clicked is the one
 * that will run.
 */
export function planSessionRunPrompt(
  repository: SessionsRepository,
  session: SessionRecord,
): { text: string; toast: string } | null {
  if (!sessionOffersRunPrompt(repository, session)) return null;
  return {
    text: START_NEXT_SESSION_PROMPT,
    toast: `Copied: start session ${session.number} of ${repository.label}`,
  };
}

/**
 * The send-back prompt for a session that stopped at the cap, or `null`
 * for a row that has nothing to send back.
 *
 * "Send it back" hands the record to an engine — it is the engine that
 * remediates, re-runs the affected tests and re-runs `ai_router.verify`,
 * which at the cap records whichever terminal state the tree then says
 * it is. The prompt names the ledger by path and never quotes it: the
 * findings are read from the record by the engine that acts on them, so
 * what it acts on is what the verifier wrote and not a paraphrase.
 *
 * Three shapes, because the three states ask for different work. An
 * unresolved session needs its outstanding findings fixed; a session
 * remediated at the cap needs its unreviewed fix reviewed before anything
 * builds on it; a loop still open simply has findings to answer.
 */
export function planSendBackPrompt(
  repository: SessionsRepository,
  session: SessionRecord,
): { text: string; toast: string } | null {
  const view = session.verification;
  if (!view || !sessionNeedsReading(session)) return null;
  const n = session.number;
  const record = `.dabbler/runs/s${n}/rounds.jsonl`;
  const outstanding = view.findings.filter((f) => f.blocking).length;
  const round = view.stoppedAtRound ?? view.rounds;
  let text: string;
  if (view.terminal === "REMEDIATED_AT_CAP") {
    // No command re-opens review on a closed session: rounds are
    // append-only per session and a terminal row closes them. The review
    // is therefore the NEXT session's declared work, through the three
    // commands that exist — start, declare, verify — and the prompt says
    // plainly what those do and do not cover.
    const paths = view.fixPaths.length > 0 ? view.fixPaths.join(", ") : "its cited paths";
    text =
      `Session ${n} landed remediated at the cap: its fix to ` +
      `${view.fixPaths.length} path(s) answered round ${round}'s ` +
      `blocking finding(s) and no verifier reviewed it. No command ` +
      `re-opens review on a closed session, so the review is the next ` +
      `session's declared work. Run ${startCommand(repository)}, then ` +
      `python -m ai_router.session declare --task "Review session ${n}'s ` +
      `unreviewed remediation of ${paths} against ${record}" ` +
      `--not-releasable. Read ${record}, correct what the review finds, ` +
      `and python -m ai_router.verify then reviews that correction as ` +
      `this session's own round.`;
  } else if (view.terminal === "ISSUES_FOUND") {
    text =
      `Session ${n} is unresolved at the cap: round ${round} left ` +
      `${outstanding} blocking finding(s) standing. Read ${record}, ` +
      `remediate each finding at the path it cites, run the affected ` +
      `tests (python -m ai_router.affected prints them), record them ` +
      `with python -m ai_router.test_evidence record, then run ` +
      `python -m ai_router.verify — at the cap that records the terminal ` +
      `state the tree says it is.`;
  } else {
    text =
      `Session ${n} has ${outstanding} blocking finding(s) outstanding ` +
      `after round ${round}. Read ${record}, remediate each at the path ` +
      `it cites, run the affected tests, then run python -m ai_router.verify.`;
  }
  return { text, toast: `Copied: send session ${n} back to the engine` };
}

/** `session start` with the engine and vendor the repository already runs on. */
function startCommand(repository: SessionsRepository): string {
  const o = repository.orchestrator;
  const engine = o?.engine ?? "<engine>";
  const provider = o?.provider ?? "<vendor>";
  return `python -m ai_router.session start --engine ${engine} --provider ${provider}`;
}

/**
 * The respecify prompt: the exact lifecycle commands that rewrite a
 * session's specification and register the rewrite as a session.
 *
 * Sessions are numbered once and never re-opened, and a rounds ledger is
 * append-only per number — so a respecified session is a NEW number with
 * a new ledger, not the old one restored. For a session unresolved at the
 * cap that means cancelling it first (with `--force`, because it cannot
 * close), writing the new block in the plan, and `session start`
 * registering the next number. A session remediated at the cap is
 * already closed and needs no cancel. The prompt is copied beside opening
 * the plan at the old block, which is where the rewrite is written.
 */
export function planRespecifyPrompt(
  repository: SessionsRepository,
  session: SessionRecord,
): { text: string; toast: string } | null {
  const view = session.verification;
  if (!view || !sessionNeedsReading(session)) return null;
  const n = session.number;
  const next = repository.totalSessions !== null ? String(repository.totalSessions + 1) : "<next number>";
  // The plan the projection reads its `### Session N:` headings from —
  // the scan's own path for it, never a filename typed here. It is the
  // one hand-written file in the sessions root; the two prose files
  // beside it are folded from the activity log and are never edited.
  const plan = path
    .relative(repository.root, repository.planPath)
    .split(path.sep)
    .join("/");
  const steps: string[] = [];
  if (view.terminal === "ISSUES_FOUND") {
    steps.push(
      `python -m ai_router.session cancel ${n} --reason "respecified as ` +
        `session ${next}" --force — an unresolved session cannot close, so ` +
        `it is cancelled with the reason on record`,
    );
  }
  steps.push(
    `rewrite the specification as a new entry, \`### Session ${next} of ` +
      `${next}: <title>\`, in ${plan}, answering the findings in ` +
      `.dabbler/runs/s${n}/rounds.jsonl — a new number, because a session ` +
      `number is registered once and its rounds ledger is append-only, so ` +
      `session ${n} cannot be re-registered and its block stays as the ` +
      `record of what was tried`,
    `${startCommand(repository)} registers session ${next}; declare its ` +
      `task list before editing anything`,
  );
  const state = view.terminal === "ISSUES_FOUND" ? "unresolved at the cap" : view.headline;
  const text =
    `Session ${n} is ${state} and its specification is being rewritten. ` +
    `In order: ` +
    steps.map((s, i) => `(${i + 1}) ${s}`).join("; ") +
    ".";
  return { text, toast: `Copied: respecify session ${n} as session ${next}` };
}

async function copyToClipboard(text: string, statusMessage: string): Promise<void> {
  try {
    await vscode.env.clipboard.writeText(text);
    vscode.window.setStatusBarMessage(statusMessage, 4000);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    vscode.window.showWarningMessage(`Failed to copy to clipboard: ${detail}`);
  }
}

export function registerCopyPromptCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabbler.copyStartNextSessionPrompt",
      async (arg: unknown) => {
        const node = asRepositoryNode(arg);
        if (!node) return;
        await copyToClipboard(
          START_NEXT_SESSION_PROMPT,
          `Copied: ${START_NEXT_SESSION_PROMPT}`,
        );
      },
    ),
    // The session row's sibling. It re-checks the gate on dispatch
    // rather than trusting the menu — `contextValue` is computed at
    // render time, so a row that has been on screen since before a
    // session closed would otherwise still copy a prompt for work that
    // has moved on. A refused invocation is silent: the entry the
    // operator clicked simply should not have been there.
    vscode.commands.registerCommand(
      "dabbler.copySessionRunPrompt",
      async (arg: unknown) => {
        const node = asSessionNode(arg);
        if (!node) return;
        const plan = planSessionRunPrompt(node.repository, node.session);
        if (!plan) return;
        await copyToClipboard(plan.text, plan.toast);
      },
    ),
    vscode.commands.registerCommand(
      "dabbler.copySendBackPrompt",
      async (arg: unknown) => {
        const node = asSessionNode(arg);
        if (!node) return;
        const plan = planSendBackPrompt(node.repository, node.session);
        if (!plan) return;
        await copyToClipboard(plan.text, plan.toast);
      },
    ),
    // Respecify is the left-click's dual action for a stopped session:
    // the plan opens at the session's own block, and the commands that
    // register the rewrite go to the clipboard for the engine.
    vscode.commands.registerCommand(
      "dabbler.respecifySession",
      async (arg: unknown) => {
        const node = asSessionNode(arg);
        if (!node) return;
        const plan = planRespecifyPrompt(node.repository, node.session);
        if (!plan) return;
        await vscode.commands.executeCommand("dabblerSessionSets.openSpec", node);
        await copyToClipboard(plan.text, plan.toast);
      },
    ),
  );
}
