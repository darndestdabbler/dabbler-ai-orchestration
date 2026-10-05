import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import type { SessionsRepository } from "../utils/fileSystem";
import { locateSessionSection, SpecSectionRange } from "../providers/specSectionLocator";

/**
 * Both row kinds carry the repository; a session row carries its record
 * too, and that is what asks for a section rather than the whole file.
 */
interface RepositoryItem extends vscode.TreeItem {
  repository?: SessionsRepository;
}

function openIfExists(
  filePath: string | undefined,
  label: string,
  reveal?: SpecSectionRange,
): void {
  if (!filePath || !fs.existsSync(filePath)) {
    vscode.window.showInformationMessage(
      `${label} does not exist yet: ${filePath ? path.basename(filePath) : "<unknown>"}`,
    );
    return;
  }
  const uri = vscode.Uri.file(filePath);
  if (!reveal) {
    vscode.commands.executeCommand("vscode.open", uri);
    return;
  }
  void revealSection(uri, reveal);
}

/**
 * Open *uri* positioned at *range*. showTextDocument rather than the
 * vscode.open command because the landing has to be DELIBERATE:
 * vscode.open's selection reveal scrolls minimally, which can leave the
 * heading on the last visible row with the plan itself below the fold.
 * AtTop puts the session's own heading at the top of the viewport.
 *
 * The selection is EMPTY, anchored at the heading — selecting the whole
 * block would paint a highlight over a file the operator is about to
 * read. Every failure degrades to the plain open.
 */
async function revealSection(uri: vscode.Uri, range: SpecSectionRange): Promise<void> {
  try {
    const editor = await vscode.window.showTextDocument(uri);
    // Clamp: the file is read to find the heading and opened separately,
    // so a plan edited in between must never throw here.
    const lastLine = Math.max(editor.document.lineCount - 1, 0);
    const start = new vscode.Position(Math.min(range.startLine, lastLine), 0);
    const end = new vscode.Position(Math.min(range.endLine, lastLine), 0);
    editor.selection = new vscode.Selection(start, start);
    editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.AtTop);
  } catch (err) {
    console.warn(`[Dabbler] reveal failed for ${uri.fsPath}; opening at the top`, err);
    vscode.commands.executeCommand("vscode.open", uri);
  }
}

/**
 * The session number a command argument asks for, or undefined. FAILS
 * CLOSED: anything that is not a session node carrying a positive
 * integer yields undefined and therefore a plain open at the top.
 */
export function sessionNumberOf(item: unknown): number | undefined {
  if (item === null || typeof item !== "object") return undefined;
  const node = item as { kind?: unknown; session?: { number?: unknown } };
  if (node.kind !== "session") return undefined;
  const number = node.session?.number;
  if (typeof number !== "number" || !Number.isInteger(number) || number <= 0) {
    return undefined;
  }
  return number;
}

/**
 * Where the session plan should open for this command argument, or
 * undefined for "at the top". The read happens HERE — on activation,
 * once per click — never on the tree scan.
 */
export function specSectionTargetFor(
  planPath: string | undefined,
  sessionNumber: number | undefined,
): SpecSectionRange | undefined {
  if (!planPath || sessionNumber === undefined) return undefined;
  let text: string;
  try {
    text = fs.readFileSync(planPath, "utf-8");
  } catch {
    return undefined;
  }
  return locateSessionSection(text, sessionNumber) ?? undefined;
}

export function registerOpenFileCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    // ONE Open Session Plan, two callers: a repository row opens the
    // file at the top; a session node opens the same file positioned at
    // its own `### Session N of M:` block.
    vscode.commands.registerCommand("dabblerSessionSets.openSpec", (item: RepositoryItem) =>
      openIfExists(
        item?.repository?.planPath,
        "Session plan",
        specSectionTargetFor(item?.repository?.planPath, sessionNumberOf(item)),
      ),
    ),
    vscode.commands.registerCommand("dabblerSessionSets.openActivityLog", (item: RepositoryItem) =>
      openIfExists(item?.repository?.activityPath, "Activity log"),
    ),
    vscode.commands.registerCommand("dabblerSessionSets.openChangeLog", (item: RepositoryItem) =>
      openIfExists(item?.repository?.changeLogPath, "Change log"),
    ),
    vscode.commands.registerCommand("dabblerSessionSets.openSessionState", (item: RepositoryItem) =>
      openIfExists(item?.repository?.ledgerPath, "Sessions ledger"),
    ),
  );
}
