import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { SessionSet } from "../types";
import { readAllSessionSets } from "../utils/fileSystem";

interface SetItem extends vscode.TreeItem {
  set: SessionSet;
}

const FILE_NAME = "external-verification.md";

async function pickSet(sets: SessionSet[]): Promise<SessionSet | undefined> {
  if (sets.length === 0) {
    vscode.window.showInformationMessage(
      "No session sets found in this workspace."
    );
    return undefined;
  }
  if (sets.length === 1) return sets[0];
  const picked = await vscode.window.showQuickPick(
    sets.map((s) => ({
      label: s.name,
      description: s.state,
      detail: s.dir,
      set: s,
    })),
    {
      placeHolder: "Pick a session set to open external-verification.md for",
    }
  );
  return picked?.set;
}

async function openOrCreate(set: SessionSet): Promise<void> {
  const filePath = path.join(set.dir, FILE_NAME);
  // Per §3.8 the file is intentionally free-form — no templated
  // header. Create-if-missing with an empty file so the editor opens
  // on an untouched canvas.
  if (!fs.existsSync(filePath)) {
    try {
      fs.writeFileSync(filePath, "", { encoding: "utf-8", flag: "wx" });
    } catch (err) {
      // EEXIST is a benign race (another process / a parallel save
      // already created it); fall through to open. Any other error is
      // surface-worthy so the operator can fix permissions etc.
      const e = err as NodeJS.ErrnoException;
      if (e?.code !== "EEXIST") {
        vscode.window.showErrorMessage(
          `Could not create ${FILE_NAME} in ${set.name}: ${e?.message ?? String(err)}`
        );
        return;
      }
    }
  }
  await vscode.commands.executeCommand(
    "vscode.open",
    vscode.Uri.file(filePath)
  );
}

export function registerExternalVerificationCommand(
  context: vscode.ExtensionContext
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "dabbler.openExternalVerificationDoc",
      async (item?: SetItem) => {
        // Item-shape invocation (right-click context, programmatic
        // callers passing a TreeItem) takes the bound set directly.
        if (item?.set) {
          await openOrCreate(item.set);
          return;
        }
        // Command Palette invocation: enumerate workspace sets and
        // pick. The picker is skipped when there's only one set so
        // the common single-set case is one click.
        const sets = readAllSessionSets();
        const picked = await pickSet(sets);
        if (picked) {
          await openOrCreate(picked);
        }
      }
    )
  );
}
