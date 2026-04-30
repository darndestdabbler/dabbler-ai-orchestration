import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { SessionSet } from "../types";
import { PLAYWRIGHT_REL_DEFAULT } from "../utils/fileSystem";

interface SetItem extends vscode.TreeItem {
  set: SessionSet;
}

function openIfExists(filePath: string | undefined, label: string): void {
  if (!filePath || !fs.existsSync(filePath)) {
    vscode.window.showInformationMessage(
      `${label} does not exist yet: ${filePath ? path.basename(filePath) : "<unknown>"}`
    );
    return;
  }
  vscode.commands.executeCommand("vscode.open", vscode.Uri.file(filePath));
}

function findPlaywrightTests(set: SessionSet): string[] {
  const cfg = vscode.workspace.getConfiguration("dabblerSessionSets");
  const testDirRel = cfg.get<string>("e2e.testDirectory", PLAYWRIGHT_REL_DEFAULT) || PLAYWRIGHT_REL_DEFAULT;
  const playwrightDir = path.join(set.root, testDirRel);
  if (!fs.existsSync(playwrightDir)) return [];

  const slugTokens = set.name.split("-").filter((s) => s.length >= 3);
  const testRefs = set.uatSummary?.e2eRefs ?? [];
  const candidates = new Set<string>();

  const walk = (dir: string, depth: number) => {
    if (depth > 4) return;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "bin" || e.name === "obj" || e.name === "node_modules") continue;
        walk(p, depth + 1);
        continue;
      }
      if (!/\.(cs|ts|js)$/.test(e.name)) continue;
      const lowerName = e.name.toLowerCase();
      if (slugTokens.some((t) => lowerName.includes(t.toLowerCase()))) {
        candidates.add(p);
        continue;
      }
      if (testRefs.length > 0) {
        try {
          const txt = fs.readFileSync(p, "utf8");
          for (const ref of testRefs) {
            const short = String(ref).split(".").pop();
            if (short && txt.includes(short)) { candidates.add(p); break; }
          }
        } catch { /* ignore */ }
      }
    }
  };
  walk(playwrightDir, 0);
  return Array.from(candidates).sort();
}

export function registerOpenFileCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("dabblerSessionSets.openSpec", (item: SetItem) =>
      openIfExists(item?.set?.specPath, "Spec")
    ),
    vscode.commands.registerCommand("dabblerSessionSets.openActivityLog", (item: SetItem) =>
      openIfExists(item?.set?.activityPath, "Activity log")
    ),
    vscode.commands.registerCommand("dabblerSessionSets.openChangeLog", (item: SetItem) =>
      openIfExists(item?.set?.changeLogPath, "Change log")
    ),
    vscode.commands.registerCommand("dabblerSessionSets.openAiAssignment", (item: SetItem) =>
      openIfExists(item?.set?.aiAssignmentPath, "AI assignment")
    ),
    vscode.commands.registerCommand("dabblerSessionSets.openUatChecklist", (item: SetItem) =>
      openIfExists(item?.set?.uatChecklistPath, "UAT checklist")
    ),
    vscode.commands.registerCommand("dabblerSessionSets.openFolder", (item: SetItem) => {
      if (!item?.set) return;
      vscode.commands.executeCommand("revealInExplorer", vscode.Uri.file(item.set.dir));
    }),
    vscode.commands.registerCommand(
      "dabblerSessionSets.revealPlaywrightTests",
      async (item: SetItem) => {
        if (!item?.set) return;
        const tests = findPlaywrightTests(item.set);
        if (tests.length === 0) {
          const cfg = vscode.workspace.getConfiguration("dabblerSessionSets");
          const dir = cfg.get<string>("e2e.testDirectory", PLAYWRIGHT_REL_DEFAULT);
          vscode.window.showInformationMessage(
            `No Playwright tests found for "${item.set.name}". Search root: ${dir}`
          );
          return;
        }
        if (tests.length === 1) {
          vscode.commands.executeCommand("vscode.open", vscode.Uri.file(tests[0]));
          return;
        }
        const picked = await vscode.window.showQuickPick(
          tests.map((p) => ({
            label: path.basename(p),
            description: path.relative(item.set.root, p),
            absolute: p,
          })),
          { placeHolder: `Playwright tests matching "${item.set.name}"` }
        );
        if (picked) {
          vscode.commands.executeCommand("vscode.open", vscode.Uri.file((picked as { absolute: string }).absolute));
        }
      }
    )
  );
}
