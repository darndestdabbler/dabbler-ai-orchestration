import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import {
  ICON_FILES,
  REPOSITORY_ACTIONS,
  SESSION_ACTIONS,
  actionToken,
  offeredRepositoryActions,
  offeredSessionActions,
  tokenMatcher,
} from "dabbler-ai-router";
import { REFRESH_WINDOW_MS, WorkExplorerTreeProvider } from "../../providers/WorkExplorerTreeProvider";
import { makeRepository, makeSession } from "./helpers";

suite("WorkExplorerTreeProvider: refresh", () => {
  let provider: WorkExplorerTreeProvider;
  let changes: number;
  setup(() => {
    provider = new WorkExplorerTreeProvider({} as never);
    changes = 0;
    provider.onDidChangeTreeData(() => (changes += 1));
  });
  teardown(() => provider.dispose());

  const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

  test("three refresh() calls inside the window fire one change", async () => {
    provider.refresh();
    provider.refresh();
    provider.refresh();
    assert.strictEqual(changes, 0);
    await wait(REFRESH_WINDOW_MS + 100);
    assert.strictEqual(changes, 1);
  });

  test("refresh(true) fires at once", async () => {
    provider.refresh();
    provider.refresh(true);
    assert.strictEqual(changes, 1);
    // The pending repaint it overtook does not fire a second change.
    await wait(REFRESH_WINDOW_MS + 100);
    assert.strictEqual(changes, 1);
  });
});

// The rows' actions are the router's; which menu item shows on which row is
// this extension's manifest, matched against the tokens the rows carry.
const finished = makeRepository({
  currentSession: null,
  sessions: [makeSession({ number: 1, status: "complete" })],
});
const inFlight = makeRepository({
  currentSession: 2,
  sessions: [
    makeSession({ number: 1, status: "complete" }),
    makeSession({ number: 2, status: "in-progress" }),
  ],
});

suite("WorkExplorerTreeProvider: the manifest's menus match the rows' actions", () => {
  const manifest = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "..", "..", "..", "package.json"), "utf8"),
  ) as {
    contributes: {
      commands: Array<{ command: string }>;
      menus: Record<string, Array<{ command?: string; when?: string }>>;
    };
  };
  const menuEntries = Object.values(manifest.contributes.menus).flat();

  test("every registry action has a menu contribution gated on its token", () => {
    for (const action of [...REPOSITORY_ACTIONS, ...SESSION_ACTIONS]) {
      const token = tokenMatcher(actionToken(action));
      const hit = menuEntries.some(
        (e) => e.command === action.id && (e.when ?? "").includes(token),
      );
      assert.ok(hit, `${action.id} has no menu entry matching ${token}`);
    }
  });

  test("Consult with AI is contributed on the repository row and on every session row", () => {
    const id = "dabbler.consultWithAi";
    assert.ok(offeredRepositoryActions(finished).some((a) => a.id === id));
    for (const session of inFlight.sessions) {
      assert.ok(offeredSessionActions(inFlight, session).some((a) => a.id === id), String(session.number));
    }
    const token = tokenMatcher(actionToken({ id }));
    assert.ok(menuEntries.some((e) => e.command === id && (e.when ?? "").includes(token)));
  });

  test("the Work Explorer's welcome offers two ways in with no folder and one with a folder; the Solution Explorer declares none", () => {
    // The Solution Explorer always shows the Configuration, so it is never
    // empty and a welcome there is never seen. The buttons are the Work
    // Explorer's, and say what a person has.
    const welcomes = (
      manifest.contributes as unknown as {
        viewsWelcome?: Array<{ view: string; contents: string; when?: string }>;
      }
    ).viewsWelcome ?? [];
    assert.ok(!welcomes.some((entry) => entry.view === "dabblerSolutionTree"));
    const buttons = (when: string): string[] =>
      [...(welcomes.find((entry) => entry.view === "dabblerWorkExplorerTree" && entry.when === when)?.contents ?? "")
        .matchAll(/\[([^\]]+)\]\(command:([a-zA-Z.]+)\)/g)].map((match) => `${match[1]} -> ${match[2]}`);
    assert.deepStrictEqual(buttons("workbenchState == empty"), [
      "Set Up New Project -> dabbler.setupNewProject",
      "Open Existing Folder or Repository -> dabbler.openExistingFolderOrRepository",
    ]);
    assert.deepStrictEqual(buttons("workbenchState != empty"), [
      "Set Up Dabbler in This Folder -> dabbler.setupNewProject",
    ]);
  });

  test("every act- token in package.json maps back to a registry action", () => {
    const known = new Set(
      [...REPOSITORY_ACTIONS, ...SESSION_ACTIONS].map((a) => actionToken(a)),
    );
    for (const entry of menuEntries) {
      const when = entry.when ?? "";
      for (const match of when.matchAll(/;(act-[A-Za-z-]+);/g)) {
        assert.ok(known.has(match[1]), `${match[1]} in package.json has no registry entry`);
      }
    }
  });

  test("every menu command is a declared command", () => {
    const declared = new Set(manifest.contributes.commands.map((c) => c.command));
    for (const entry of menuEntries) {
      if (entry.command) assert.ok(declared.has(entry.command), entry.command);
    }
  });

  test("no declared command hands anyone a prompt to paste", () => {
    for (const command of manifest.contributes.commands as Array<{ command: string; title: string }>) {
      assert.doesNotMatch(`${command.command} ${command.title}`, /copy|prompt|paste|respecif/i, command.command);
    }
  });

  test("at most two inline actions per row", () => {
    const inline = (manifest.contributes.menus["view/item/context"] ?? []).filter(
      (e) => ((e as { group?: string }).group ?? "").startsWith("inline"),
    );
    assert.ok(inline.length <= 2, `found ${inline.length} inline actions`);
  });
});

suite("WorkExplorerTreeProvider: the operator's status icons", () => {
  test("every status icon is sixteen PIXELS, which is what a tree row draws", () => {
    // csv-model's first feedback item: the eight SVGs declared `width="16mm"`
    // -- Inkscape's default unit -- and a tree row drew them at sixty pixels,
    // cropped to a line through the row. The unit is the whole defect, and
    // nothing downstream can notice it: the row asks for a 16px slot and the
    // renderer scales whatever it is handed.
    for (const theme of ["dark", "light"]) {
      for (const file of Object.values(ICON_FILES)) {
        const svg = fs.readFileSync(
          path.resolve(__dirname, "..", "..", "..", "media", theme, file),
          "utf8",
        );
        const width = /\bwidth="([^"]+)"/.exec(svg)?.[1];
        const height = /\bheight="([^"]+)"/.exec(svg)?.[1];
        assert.strictEqual(width, "16", `${theme}/${file} declares width="${width}"`);
        assert.strictEqual(height, "16", `${theme}/${file} declares height="${height}"`);
        assert.ok(
          /viewBox="0 0 16 16"/.test(svg),
          `${theme}/${file} has no 16x16 viewBox to scale from`,
        );
      }
    }
  });
});
