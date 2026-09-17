// The per-provider key rows, driven in a running editor.
//
// **The state worth seeing is the one that fails.** A machine whose
// environment variables are all set draws three rows that say so and ask
// nothing of anybody, and a walk that only saw that would have proved the
// rows exist. So this launch arranges the state an operator actually gets
// stuck in: one provider whose variable is gone and whose committed setting
// names a credential this machine does not hold.
//
// Nothing here touches the operator's own store. The credential index, the
// catalog and the preferences are all files under this test's temp root,
// named through the router's own seams.
//
// What it cannot claim is judgement: it asserts what a row SAYS and what a
// right-click OFFERS, and a person reading
// `docs/uat/uat-credential-store-walk.md` judges whether that is right.

import * as fs from "fs";
import * as path from "path";
import { test, expect } from "@playwright/test";
import {
  LaunchedVSCode,
  cleanupTmpDir,
  closeVSCode,
  expandAllRows,
  launchVSCode,
  makeTmpDir,
  rowContextMenuText,
  rowTexts,
  solutionExplorerPane,
  treeRow,
  writeSessionsRoot,
} from "./electronLaunch";

test.describe.configure({ mode: "serial" });

let workspace: string;
let state: string;
let vscode: LaunchedVSCode;
let pane: Awaited<ReturnType<typeof solutionExplorerPane>>;

test.beforeAll(async () => {
  workspace = makeTmpDir("dabbler-pw-keys");
  state = makeTmpDir("dabbler-pw-keys-state");
  const catalogPath = path.join(state, "ai-model-catalog.json");
  const preferencesPath = path.join(state, "preferences.json");
  const credentialsPath = path.join(state, "credentials.json");

  writeSessionsRoot(workspace, [
    { number: 1, title: "Ship the thing", status: "complete", verificationVerdict: "VERIFIED" },
  ]);
  fs.mkdirSync(path.join(workspace, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, "docs", "modules.yaml"),
    "modules:\n  - slug: model\n    title: Model\n",
    "utf8",
  );
  // The committed policy: this solution names a credential for each of two
  // providers. One of them this machine holds; the other it does not, which
  // is the ordinary state of a repository configured for a team.
  fs.mkdirSync(path.join(workspace, ".vscode"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, ".vscode", "settings.json"),
    JSON.stringify(
      {
        "dabbler.transport": "api",
        "dabbler.credentials.anthropic": "walk-held",
        "dabbler.credentials.openai": "walk-missing",
      },
      null,
      2,
    ),
    "utf8",
  );
  // An index as a machine that had stored one would have left it. The pane
  // reads WHETHER a credential is held and never its value, so a blob that
  // will not decrypt is the right fixture: if a row ever rendered a value,
  // this is where it would show up as gibberish.
  fs.writeFileSync(
    credentialsPath,
    JSON.stringify({
      schema_version: 1,
      written_by: "the credential-rows walk",
      entries: {
        "walk-held": {
          provider: "anthropic",
          stored_at: "2026-09-12T00:00:00.000Z",
          sealed: "01000000d08c9ddf",
        },
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    catalogPath,
    JSON.stringify({
      schema_version: 1,
      written_by: "the credential-rows walk",
      written_at: "2026-09-12T00:00:00Z",
      transports: {
        api: {
          refreshed_at: "2026-09-12T00:00:00Z",
          source: "vendor-enumeration",
          scope: { providers: ["anthropic", "google", "openai"] },
          models: [],
          retired: [],
        },
      },
    }),
    "utf8",
  );
  fs.writeFileSync(
    preferencesPath,
    JSON.stringify({
      schema_version: 1,
      written_by: "the credential-rows walk",
      written_at: "2026-09-12T00:00:00Z",
      engine: "claude-code",
    }),
    "utf8",
  );

  vscode = await launchVSCode(workspace, [], {
    DABBLER_CATALOG_PATH: catalogPath,
    DABBLER_PREFERENCES_PATH: preferencesPath,
    DABBLER_CREDENTIALS_PATH: credentialsPath,
    // Anthropic and Google run on their variables, which is what every
    // machine does today and what must keep working untouched. OpenAI's is
    // empty, so its committed reference is the layer that decides -- and it
    // names something this machine does not hold.
    DABBLER_ANTHROPIC_API_KEY: "walk",
    DABBLER_OPENAI_API_KEY: "",
    DABBLER_GEMINI_API_KEY: "walk",
  });
  pane = await solutionExplorerPane(vscode.page);
  await pane.locator(".monaco-list-row").first().waitFor({ state: "visible", timeout: 60_000 });
  await expandAllRows(pane);
});

test.afterAll(async () => {
  if (vscode) await closeVSCode(vscode);
  for (const dir of [workspace, state]) if (dir) cleanupTmpDir(dir);
});

test("draws one key row per provider, and none of them carries a value", async () => {
  const texts = await rowTexts(pane);
  const joined = texts.join(" | ");
  for (const label of ["Anthropic key", "Google key", "OpenAI key"]) {
    expect(joined).toContain(label);
  }
  // The environment is the layer above every reference, so a provider whose
  // variable is set says so -- and an operator running on variables today
  // is told nothing has changed.
  expect(joined).toContain("DABBLER_ANTHROPIC_API_KEY is set");
  expect(joined).toContain("DABBLER_GEMINI_API_KEY is set");
  // And the one the solution names, which this machine cannot answer.
  expect(joined).toContain("walk-missing");
  expect(joined).toContain("not on this machine");
  // Nothing that could be a key. The stored blob is the only secret-shaped
  // string in the fixture, and no row may carry it or any part of it.
  expect(joined).not.toContain("01000000");
  expect(joined).not.toContain("sealed");
});

test("left-clicking opens a terminal, and asks for nothing in this window", async () => {
  // The whole design of the row: an input box's contents live in the
  // editor's own buffers and its undo history, so the key is asked for in a
  // terminal with the echo off and never here.
  //
  // It runs before the right-click reading on purpose. A tree fires a row's
  // command on a CHANGE of selection, and a right-click selects the row --
  // so the other order left this click landing on an already-selected row
  // and firing nothing, which looks exactly like the defect it rules out.
  //
  // What it asserts is that a terminal appears and that nothing in this
  // window asks for a value. WHICH verb that terminal runs is asserted in
  // the unit suite, where the argv is readable; an xterm renders to a
  // canvas and Playwright cannot read a word of it.
  const before = await vscode.page.locator(".xterm").count();
  await treeRow(pane, "OpenAI key").click();
  await expect
    .poll(async () => vscode.page.locator(".xterm").count(), { timeout: 30_000 })
    .toBeGreaterThan(before);

  // No modal and no input box. A value typed into either would live in the
  // editor's own buffers, which is the one thing this row may not do -- and
  // a modal here also blocks the window it is drawn over, which is how this
  // reading found the confirmation that used to be in front of it.
  expect(await vscode.page.locator(".monaco-dialog-box").count()).toBe(0);
  expect(await vscode.page.locator(".quick-input-widget:visible").count()).toBe(0);
});

test("right-clicking a key row offers the one thing to do about it", async () => {
  const menu = await rowContextMenuText(vscode.page, treeRow(pane, "OpenAI key"));
  expect(menu).toContain("Store a Key on This Machine");
});
