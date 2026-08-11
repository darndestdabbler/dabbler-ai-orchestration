import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { SessionSet, UnsatisfiedPrerequisite } from "../types";
import { PLAYWRIGHT_REL_DEFAULT, readAllSessionSets } from "../utils/fileSystem";
import { locateSessionSection, SpecSectionRange } from "../providers/specSectionLocator";

interface SetItem extends vscode.TreeItem {
  set: SessionSet;
}

function openIfExists(
  filePath: string | undefined,
  label: string,
  reveal?: SpecSectionRange,
): void {
  if (!filePath || !fs.existsSync(filePath)) {
    vscode.window.showInformationMessage(
      `${label} does not exist yet: ${filePath ? path.basename(filePath) : "<unknown>"}`
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
 * Open *uri* positioned at *range* (Set 115 S2).
 *
 * `showTextDocument` rather than the `vscode.open` command because the
 * landing has to be DELIBERATE: `vscode.open`'s selection reveal scrolls
 * minimally, which can leave the heading on the last visible row with the
 * plan itself below the fold — technically revealed, useless in practice.
 * `AtTop` puts the session's own heading at the top of the viewport, which
 * is what "land on its plan" means.
 *
 * The selection is EMPTY, anchored at the heading. Selecting the whole
 * block would paint a 40-line highlight over a file the operator is about
 * to read, and the first keystroke would replace it.
 *
 * Every failure degrades to the plain open: the operator ends up looking
 * at the real file either way, which is the rule the whole feature is
 * built on.
 */
async function revealSection(uri: vscode.Uri, range: SpecSectionRange): Promise<void> {
  try {
    const editor = await vscode.window.showTextDocument(uri);
    // Clamp: the file is read to find the heading and opened separately,
    // so a spec edited in between must never throw here.
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
 * The session number a command argument asks for, or `undefined`.
 *
 * FAILS CLOSED, deliberately: anything that is not a session node
 * carrying a positive integer number — a set row, a palette invocation
 * with no argument, a hand-edited state file whose `number` is a string —
 * yields `undefined` and therefore a plain open at the top of `spec.md`.
 * The same posture `planLeftClickActivation` takes on an unrecognised
 * state.
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
 * Where `spec.md` should open for this command argument, or `undefined`
 * for "at the top".
 *
 * The read happens HERE — on activation, once per click — and never on
 * the tree scan. Set 115's decision 4 is explicit that title resolution
 * and the tree's fourth level must add no disk read to a hot path; a click
 * is not one of those paths, and reading the file the operator is about to
 * see is the only way to know where its sections are.
 *
 * Exported for the Layer 2 suite: this is the seam where "which session"
 * meets "which lines", and it degrades in three ways that all have to be
 * proven — no session, an unreadable spec, and a spec with no matching
 * heading.
 */
export function specSectionTargetFor(
  specPath: string | undefined,
  sessionNumber: number | undefined,
): SpecSectionRange | undefined {
  if (!specPath || sessionNumber === undefined) return undefined;
  let text: string;
  try {
    text = fs.readFileSync(specPath, "utf-8");
  } catch {
    return undefined;
  }
  return locateSessionSection(text, sessionNumber) ?? undefined;
}

/**
 * Whether *name* is one of session *sessionNumber*'s artifacts (Set 115 S3).
 *
 * The convention is `s<N>-<anything>`, which is what every artifact in
 * every set already obeys: `s1-issues.json`, `s2-verification-round-2.md`,
 * `s1-remediation-round-1.md`. Discovery by convention rather than by a
 * hardcoded list is step 4's explicit requirement — a set gains new
 * artifact shapes whenever the workflow does, and a list would silently
 * drop them.
 *
 * PURE, and exported, because the two ways this could quietly go wrong are
 * both invisible in a running host: `s3-` must not match `s30-`'s files
 * (the delimiter is what separates them, so a prefix test alone is not
 * enough), and the match is case-insensitive because the convention is
 * lowercase but the filesystem this runs on is not.
 */
export function isSessionArtifact(name: string, sessionNumber: number): boolean {
  if (!Number.isInteger(sessionNumber) || sessionNumber <= 0) return false;
  return new RegExp(`^s${sessionNumber}-.`, "i").test(name);
}

/**
 * The absolute paths of session *sessionNumber*'s artifacts in *dir*,
 * sorted by name, or `[]`.
 *
 * Files only, top level only, and every failure — an unreadable directory,
 * a `stat` that throws on a vanished entry — degrades to fewer results
 * rather than to an error. The empty array is a first-class answer: it is
 * what a session that has produced nothing yet returns, and the caller
 * says so plainly.
 *
 * The read happens on the CLICK, never on the tree scan. That is the same
 * seam Session 2 established for the spec read and the same measured
 * constraint (Set 115 decision 4) it protects.
 */
export function listSessionArtifacts(dir: string, sessionNumber: number): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && isSessionArtifact(e.name, sessionNumber))
    .map((e) => path.join(dir, e.name))
    .sort((a, b) => path.basename(a).localeCompare(path.basename(b)));
}

/**
 * Open one of a session's artifacts (Set 115 S3).
 *
 * The same three-way shape `openPrerequisiteSpec` already uses — open
 * directly when there is one, QuickPick when there are several — with the
 * empty case carrying the weight: it names the session, the set and the
 * convention, so an operator who sees it learns why nothing appeared
 * rather than suspecting the menu is broken.
 */
async function openSessionArtifacts(
  set: SessionSet,
  sessionNumber: number,
): Promise<void> {
  const artifacts = listSessionArtifacts(set.dir, sessionNumber);
  if (artifacts.length === 0) {
    vscode.window.showInformationMessage(
      `Session ${sessionNumber} of "${set.name}" has no artifacts yet — ` +
        `nothing matching s${sessionNumber}-* in ${path.basename(set.dir)}.`,
    );
    return;
  }
  if (artifacts.length === 1) {
    openIfExists(artifacts[0], path.basename(artifacts[0]));
    return;
  }
  const picked = await vscode.window.showQuickPick(
    artifacts.map((p) => ({
      label: path.basename(p),
      description: path.relative(set.root, p),
      absolute: p,
    })),
    { placeHolder: `Artifacts of session ${sessionNumber} — ${set.name}` },
  );
  if (picked) {
    const { absolute } = picked as { absolute: string };
    openIfExists(absolute, path.basename(absolute));
  }
}

// Set 061 S2 (spec D3): companion to the blocked marker. Opens the
// spec.md of the prerequisite set blocking `item.set` — directly when
// one prerequisite is unsatisfied, via QuickPick when several are.
// Unknown slugs (typos / missing sets) are listed but explained rather
// than opened; resolution reuses the same merged cross-root scan the
// blocked derivation itself runs on.async function openPrerequisiteSpec(set: SessionSet): Promise<void> {
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
    // Set 115 S2: ONE `Open Spec`, two callers. A set row opens the file
    // at the top exactly as before; a session row (`kind: "session"`)
    // opens the same file positioned at its own `### Session N of M:`
    // block. Adding a parallel command would have meant a second place
    // for "which file is the spec" to be answered.
    vscode.commands.registerCommand("dabblerSessionSets.openSpec", (item: SetItem) =>
      openIfExists(
        item?.set?.specPath,
        "Spec",
        specSectionTargetFor(item?.set?.specPath, sessionNumberOf(item)),
      )
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
    // Set 115 S3: the session row's evidence half. Hidden from the
    // Command Palette (`when: false` in package.json) because, unlike
    // `openPrerequisiteSpec`, it cannot fall back to a set-level
    // question — without a session node there is no session whose
    // artifacts to list. `sessionNumberOf` is the SAME narrowing the
    // spec reveal uses, so a non-session argument is a silent no-op
    // rather than a guess at session 1.
    vscode.commands.registerCommand(
      "dabblerSessionSets.openSessionArtifacts",
      (item: SetItem) => {
        const sessionNumber = sessionNumberOf(item);
        if (!item?.set || sessionNumber === undefined) return;
        void openSessionArtifacts(item.set, sessionNumber);
      }
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
