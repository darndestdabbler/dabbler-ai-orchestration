import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { SessionSet } from "../types";
import { readAllSessionSets } from "../utils/fileSystem";

interface SetItem extends vscode.TreeItem {
  set: SessionSet;
}

const FILE_NAME = "external-verification.md";

/**
 * Set 077 S4 (A2): minimal seeded header for a fresh artifact — set,
 * date, round, verdict-pending — replacing the Set 048 §3.8 empty file.
 * The reviewing engine replaces the PENDING line with its real verdict
 * (or appends later rounds). ``PENDING`` is deliberately not a token
 * the ai_router parser recognizes, so a templated-but-unfilled file
 * still soft-warns at close exactly like an empty one. The extension
 * never parses verdicts itself — ``ai_router.external_verification``
 * is the single parser.
 */
export function buildExternalVerificationTemplate(
  setName: string,
  date: string,
): string {
  return (
    `# External Verification — ${setName}\n` +
    `\n` +
    `> Out-of-band verification record for this session set. Reviewing\n` +
    `> engines append one dated round section each; the latest round wins.\n` +
    `> Instructions + verdict grammar: docs/dabbler/cross-provider-verification.md\n` +
    `\n` +
    `## Round 1 — ${date}\n` +
    `\n` +
    `Verdict: PENDING\n`
  );
}

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
  // Set 077 S4 (A2): create-if-missing seeds the minimal round header
  // instead of the Set 048 empty canvas — an empty templateless file
  // was exactly the artifact path-aware engines "forgot" to fill.
  // Existing files are never touched (append-only artifact).
  if (!fs.existsSync(filePath)) {
    const template = buildExternalVerificationTemplate(
      set.name,
      new Date().toISOString().slice(0, 10),
    );
    try {
      fs.writeFileSync(filePath, template, { encoding: "utf-8", flag: "wx" });
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
