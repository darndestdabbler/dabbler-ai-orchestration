/**
 * The engine terminals Start opened, and which of them are finished.
 *
 * Start opens a terminal whose shell IS the engine CLI, and that process
 * idles until the terminal closes. Only terminals Start opened are
 * remembered -- never one the person opened -- each with the repository and
 * the session it was opened for. A terminal is finished once the ledger
 * shows its session `complete` or `cancelled`.
 */

import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { SESSIONS_REL } from "../utils/fileSystem";

interface Remembered {
  readonly terminal: vscode.Terminal;
  readonly repoRoot: string;
  readonly session: number;
}

/** In the order Start opened them, so the oldest is first. One list per window. */
const remembered: Remembered[] = [];

/** Remember a terminal Start opened for `session` of `repoRoot`. */
export function rememberEngineTerminal(terminal: unknown, repoRoot: string, session: number | null): void {
  if (terminal === null || typeof terminal !== "object" || session === null) return;
  remembered.push({ terminal: terminal as vscode.Terminal, repoRoot, session });
}

/**
 * The remembered terminals whose session is over, oldest first.
 *
 * A terminal the person has already closed is forgotten here, without a
 * word: there is nothing left of it to close.
 */
export function finishedEngineTerminals(): Remembered[] {
  const open = new Set<unknown>(vscode.window.terminals);
  for (let at = remembered.length - 1; at >= 0; at -= 1) {
    if (!open.has(remembered[at].terminal)) remembered.splice(at, 1);
  }
  return remembered.filter((entry) => isOver(entry.repoRoot, entry.session));
}

export const KEEP_SETTING = "keepFinishedSessionTerminals";
const CHANGE_LIMIT = "Change limit";

/**
 * Close the oldest finished terminals until at most
 * `dabbler.keepFinishedSessionTerminals` of them remain open, and say so
 * once. A terminal whose session is in flight never counts and is never
 * closed. Disposing one the person closed a moment ago does nothing.
 */
export function closeFinishedTerminals(): void {
  const finished = finishedEngineTerminals();
  const keep = Math.max(0, vscode.workspace.getConfiguration("dabbler").get<number>(KEEP_SETTING, 2));
  const closing = finished.slice(0, Math.max(0, finished.length - keep));
  if (closing.length === 0) return;
  for (const entry of closing) {
    entry.terminal.dispose();
    remembered.splice(remembered.indexOf(entry), 1);
  }
  const sessions = closing.map((entry) => entry.session);
  const message =
    closing.length === 1
      ? `Closed 1 earlier session terminal (session ${sessions[0]}) to free memory.`
      : `Closed ${closing.length} earlier session terminals (sessions ${sessions.join(", ")}) to free memory.`;
  void Promise.resolve(vscode.window.showInformationMessage(message, CHANGE_LIMIT)).then((picked) => {
    if (picked === CHANGE_LIMIT) {
      void vscode.commands.executeCommand("workbench.action.openSettings", `dabbler.${KEEP_SETTING}`);
    }
  });
}

function isOver(repoRoot: string, session: number): boolean {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(repoRoot, SESSIONS_REL, "sessions.json"), "utf8")) as {
      sessions?: ReadonlyArray<{ number?: unknown; status?: unknown }>;
    };
    const row = raw.sessions?.find((entry) => entry.number === session);
    return row?.status === "complete" || row?.status === "cancelled";
  } catch {
    return false;
  }
}
