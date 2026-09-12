// The Configuration section, driven in a running editor.
//
// **This is a WALK, and it is this session's acceptance.** Session 156
// walked the same area through the projection, the verbs and the wire -- its
// own scope line says so -- and never opened the pane, so the entire
// interaction layer shipped unwalked. Three defects the operator reproduced
// against 2.2.0 all lived there: a right-click that did nothing, a refresh
// that left the pane showing the old reading, and a control that answered
// with a sentence telling them to go and type a command.
//
// The driver is this harness and not a hand, and the record says so: it
// launches the same Code binary an operator runs, loads this extension into
// it, and clicks. What it cannot claim is judgement -- it asserts what a
// menu OFFERS and what a click OPENS, and a person reading
// `docs/uat/uat-configuration-pane-walk.md` judges whether that is the right
// offer.
//
// The machine it drives is arranged, never inherited: the catalog and the
// preferences are files under this test's own temp root, named through the
// router's own seams, so nothing here reads or writes the operator's.

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
let catalogPath: string;
let preferencesPath: string;
let vscode: LaunchedVSCode;
let pane: Awaited<ReturnType<typeof solutionExplorerPane>>;

function catalogModel(id: string, provider: string): Record<string, unknown> {
  return {
    id,
    provider,
    provider_source: "vendor-endpoint",
    display_name: id,
    enabled: true,
    price_category: null,
    cost: null,
    listed_at: "2026-09-11T00:00:00Z",
  };
}

test.beforeAll(async () => {
  workspace = makeTmpDir("dabbler-pw-config");
  state = makeTmpDir("dabbler-pw-config-state");
  catalogPath = path.join(state, "ai-model-catalog.json");
  preferencesPath = path.join(state, "preferences.json");

  // A sessions root, so the first-run offer does not open a modal over the
  // pane this walk is driving. It is set-up, not a reading.
  writeSessionsRoot(workspace, [
    { number: 1, title: "Ship the thing", status: "complete", verificationVerdict: "VERIFIED" },
  ]);
  // A solution with one module, so the Solution Explorer has something to
  // draw above the Configuration node.
  fs.mkdirSync(path.join(workspace, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, "docs", "modules.yaml"),
    "modules:\n  - slug: model\n    title: Model\n",
    "utf8",
  );
  // The vehicle, committed in this checkout exactly as an operator's would
  // be -- not an environment variable, which is not how a vehicle is chosen
  // any more.
  fs.mkdirSync(path.join(workspace, ".vscode"), { recursive: true });
  fs.writeFileSync(
    path.join(workspace, ".vscode", "settings.json"),
    JSON.stringify({ "dabbler.transport": "api" }, null, 2),
    "utf8",
  );
  // A catalog this machine has "read", so the rows have models to offer.
  fs.writeFileSync(
    catalogPath,
    JSON.stringify({
      schema_version: 1,
      written_by: "the configuration-pane walk",
      written_at: "2026-09-12T00:00:00Z",
      transports: {
        api: {
          refreshed_at: "2026-09-12T00:00:00Z",
          source: "vendor-enumeration",
          scope: { providers: ["anthropic", "google", "openai"] },
          models: [
            catalogModel("claude-opus-5", "anthropic"),
            catalogModel("claude-sonnet-5", "anthropic"),
            catalogModel("gpt-5.6-terra", "openai"),
            catalogModel("gemini-3.1-pro-preview", "google"),
          ],
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
      written_by: "the configuration-pane walk",
      written_at: "2026-09-12T00:00:00Z",
      engine: "claude-code",
    }),
    "utf8",
  );

  vscode = await launchVSCode(workspace, [], {
    DABBLER_CATALOG_PATH: catalogPath,
    DABBLER_PREFERENCES_PATH: preferencesPath,
    // Every provider reachable, so `api` is a vehicle this machine has and
    // the rows are not all reporting an unreachable one.
    DABBLER_ANTHROPIC_API_KEY: "walk",
    DABBLER_OPENAI_API_KEY: "walk",
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

test("the section draws its two participants and their five leaves", async () => {
  const texts = await rowTexts(pane);
  for (const label of ["Configuration", "Authoring AI", "Reviewing AI", "Vehicle", "Model"]) {
    expect(texts.join(" | ")).toContain(label);
  }
  // **A row that says "nothing resolves" where four models resolve.** Found
  // by driving the pane: the authoring row has no preference order, so a
  // null chosen means nobody has PICKED -- and reading that as a fault is
  // the pane reporting a problem where there is a choice waiting.
  expect(texts.join(" | ")).toContain("Modelnot chosen");
});

test("right-clicking a participant row opens a menu carrying its leaves' actions", async () => {
  // THE defect. No `view/item/context` entry matched
  // `dabblerConfigParticipant;*`, a context menu with no items does not
  // open, and right-clicking either participant did nothing at all -- green
  // through a release, because the suite asserted that every menu command
  // was declared and never that every actionable row had a menu.
  const authoring = await rowContextMenuText(vscode.page, treeRow(pane, "Authoring AI"));
  expect(authoring).toContain("Set the Authoring Vehicle");
  expect(authoring).toContain("Set the Authoring Model");

  const reviewing = await rowContextMenuText(vscode.page, treeRow(pane, "Reviewing AI"));
  expect(reviewing).toContain("Set the Reviewing Vehicle");
  expect(reviewing).toContain("Set the Primary Reviewer's Model");
  expect(reviewing).toContain("Set the Auxiliary Reviewer's Model");
});

test("right-clicking each leaf offers its own action and the way to keep it", async () => {
  const rows = await rowTexts(pane);
  expect(rows.length).toBeGreaterThan(0);

  // The two Vehicle rows. Both offer the setting AND *Keep as My Default*,
  // which is the difference between this checkout's policy and this
  // person's -- who else gets it.
  const vehicles = pane.locator(".monaco-list-row").filter({ hasText: "Vehicle" });
  const vehicleCount = await vehicles.count();
  expect(vehicleCount).toBeGreaterThanOrEqual(2);
  for (let index = 0; index < vehicleCount; index += 1) {
    const menu = await rowContextMenuText(vscode.page, vehicles.nth(index));
    expect(menu).toContain("Keep as My Default");
    expect(menu).toMatch(/Set the (Authoring|Reviewing) Vehicle/);
  }

  // The Configuration node itself keeps its one action.
  const section = await rowContextMenuText(vscode.page, treeRow(pane, "Configuration"));
  expect(section).toContain("Update the Catalog");
});

test("left-clicking a Vehicle row opens the pick, which is the control doing something", async () => {
  // A row whose whole purpose is one action carries that action on the row:
  // a control that has to be discovered by right-clicking is a control most
  // people never find.
  const vehicles = pane.locator(".monaco-list-row").filter({ hasText: "Vehicle" });
  await vehicles.first().click();
  const picker = vscode.page.locator(".quick-input-widget");
  await picker.waitFor({ state: "visible", timeout: 15_000 });
  const offered = await picker.innerText();
  // The engine this machine can launch, offered by name.
  expect(offered).toContain("claude-code");
  await vscode.page.keyboard.press("Escape");
  await vscode.page.waitForTimeout(300);
});

/**
 * The AUTHORING model row, by its own text.
 *
 * NOT `filter({hasText: "Model"})`: this solution's one module is also
 * called `model`, and the first match was the module row -- whose click
 * does nothing, which looked exactly like the defect being walked for. A
 * selector that can resolve to the wrong row makes a passing assertion mean
 * nothing and a failing one mean less.
 */
function authoringModelRow(): import("@playwright/test").Locator {
  return pane.locator(".monaco-list-row").filter({ hasText: /^Model(not chosen|[a-z])/ }).first();
}

test("left-clicking a Model row offers the models this machine has read", async () => {
  await authoringModelRow().click();
  const picker = vscode.page.locator(".quick-input-widget");
  await picker.waitFor({ state: "visible", timeout: 15_000 });
  const offered = await picker.innerText();
  // The AUTHORING row, and the list is the ENGINE's: Claude Code runs
  // Anthropic models and nothing else, so the seeded openai and google ids
  // are not on it.
  expect(offered).toContain("claude-opus-5");
  expect(offered).not.toContain("gpt-5.6-terra");
  await vscode.page.keyboard.press("Escape");
  await vscode.page.waitForTimeout(300);
});

test("choosing a model writes it, and the row says so without a reload", async () => {
  // The half that was missing entirely: the pane offered to set an authoring
  // model and `dabbler configure` had no `--authoring-model` at all.
  await authoringModelRow().click();
  const picker = vscode.page.locator(".quick-input-widget");
  await picker.waitFor({ state: "visible", timeout: 15_000 });
  // The label alone. `innerText` on the row runs the label and its
  // description together, and a name with a description glued to it matches
  // nothing on disk.
  const chosen = (
    await vscode.page.locator(".quick-input-list .monaco-list-row .label-name").first().innerText()
  ).trim();
  await vscode.page.keyboard.press("Enter");
  await vscode.page.waitForTimeout(3_000);
  // Whatever the editor said back, so a failure here reads as the router's
  // own words rather than as an absent file.
  const toast = await vscode.page
    .locator(".notifications-toasts")
    .innerText()
    .catch(() => "");

  // On disk, in this checkout's own committed settings.
  const settings = JSON.parse(
    fs.readFileSync(path.join(workspace, ".vscode", "settings.json"), "utf8"),
  ) as Record<string, string>;
  expect(settings["dabbler.authoringModel"], `chose '${chosen}'; editor said: ${toast}`).toBe(
    chosen,
  );

  // And on the row, repainted by the write rather than by a reload.
  await expect
    .poll(async () => (await rowTexts(pane)).join(" | "), { timeout: 15_000 })
    .toContain(chosen);
});
