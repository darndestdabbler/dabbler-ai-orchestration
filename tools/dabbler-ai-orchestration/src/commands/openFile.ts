import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { SessionSet, UnsatisfiedPrerequisite } from "../types";
import { PLAYWRIGHT_REL_DEFAULT, readAllSessionSets } from "../utils/fileSystem";

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

// Set 061 S2 (spec D3): companion to the blocked marker. Opens the
// spec.md of the prerequisite set blocking `item.set` — directly when
// one prerequisite is unsatisfied, via QuickPick when several are.
// Unknown slugs (typos / missing sets) are listed but explained rather
// than opened; resolution reuses the same merged cross-root scan the
// blocked derivation itself runs on.
async function openPrerequisiteSpec(set: SessionSet): Promise<void> {
  const unsatisfied: UnsatisfiedPrerequisite[] = set.unsatisfiedPrereqs ?? [];
  if (unsatisfied.length === 0) {
    vscode.window.showInformationMessage(
      `"${set.name}" has no unsatisfied prerequisites.`
    );
    return;
  }
  const allSets = readAllSessionSets();
  const bySlug = new Map(allSets.map((s) => [s.name, s]));
  const openTarget = (p: UnsatisfiedPrerequisite): void => {
    if (p.targetState === "unknown") {
      vscode.window.showInformationMessage(
        `Prerequisite "${p.slug}" does not match any session set — check the slug in ${set.name}/spec.md.`
      );
      return;
    }
    openIfExists(bySlug.get(p.slug)?.specPath, `Prerequisite spec (${p.slug})`);
  };
  if (unsatisfied.length === 1) {
    openTarget(unsatisfied[0]);
    return;
  }
  const picked = await vscode.window.showQuickPick(
    unsatisfied.map((p) => ({
      label: p.slug,
      description:
        p.targetState === "unknown"
          ? "unknown set — check the slug"
          : p.targetState.replace("-", " "),
      prereq: p,
    })),
    { placeHolder: `Prerequisites blocking "${set.name}"` }
  );
  if (picked) openTarget((picked as { prereq: UnsatisfiedPrerequisite }).prereq);
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
    // Set 048 S3 (operator-locked L3): `Open AI Assignment` is fully
    // removed. The `ai-assignment.md` file on disk continues to exist
    // for any consumer that reads it directly; the menu / palette
    // entry to open it does not.
    vscode.commands.registerCommand("dabblerSessionSets.openUatChecklist", (item: SetItem) =>
      openIfExists(item?.set?.uatChecklistPath, "UAT checklist")
    ),
    vscode.commands.registerCommand("dabblerSessionSets.openSessionState", (item: SetItem) =>
      openIfExists(item?.set?.statePath, "Session state")
    ),
    // Set 061 S2 (spec D3): blocked-marker companion. Tolerates a
    // bare Command Palette invocation (no row context) with an
    // informational no-op, matching the other openFile commands.
    vscode.commands.registerCommand("dabblerSessionSets.openPrerequisiteSpec", (item: SetItem) => {
      if (!item?.set) {
        vscode.window.showInformationMessage(
          "Open Prerequisite Spec is available from a session-set row's context menu."
        );
        return;
      }
      void openPrerequisiteSpec(item.set);
    }),
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
