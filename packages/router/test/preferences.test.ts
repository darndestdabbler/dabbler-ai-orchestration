// What the operator chose, beside what this machine read.
//
// The catalog and the preferences are two files for one reason: the catalog
// is defined as rebuildable for nothing, so every free refresh may replace
// it whole. The test that matters most here is therefore not about a field
// at all -- it is that a refresh does not touch a choice.

import assert from "node:assert/strict";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import { readFileSync, writeFileSync } from "node:fs";

import {
  SOURCE_API,
  TRANSPORT_API,
  currentCatalogPath,
  setCatalogPath,
  writeBlock,
} from "../src/catalog.ts";
import {
  PREFERENCES_FILENAME,
  PREFERENCES_PATH_ENV,
  chosenEngine,
  currentPreferencesPath,
  readPreferences,
  selectedModel,
  setPreferencesPath,
  writePreferences,
} from "../src/preferences.ts";
import { tempDir } from "./support/answers.ts";

// Back to the paths the suite armed at load, never to null: the arming is
// what keeps every other test in this worker off the operator's own files,
// and clearing it would leave the next one reading their machine.
const ARMED_PREFERENCES = currentPreferencesPath();
const ARMED_CATALOG = currentCatalogPath();
afterEach(() => {
  setPreferencesPath(ARMED_PREFERENCES);
  setCatalogPath(ARMED_CATALOG);
});

function inTemp(): string {
  const root = tempDir("preferences-");
  const path = join(root, PREFERENCES_FILENAME);
  setPreferencesPath(path);
  return path;
}

describe("what this machine has chosen", () => {
  it("reads nothing chosen from a machine that has never chosen, and never stops over it", () => {
    // *Nothing chosen* is the honest answer to every way of failing to read
    // this file, and it is the same answer a first-run machine gives. This
    // file sits where nothing guards it, so a framework that stopped over it
    // would be stopping over a preference it can simply ask for again.
    const path = inTemp();
    assert.equal(chosenEngine(), null);
    writeFileSync(path, "{ this is not json", "utf8");
    assert.equal(chosenEngine(), null);
    writeFileSync(path, JSON.stringify({ schema_version: 99, engine: "gemini" }), "utf8");
    assert.equal(chosenEngine(), null, "a schema this router does not know is unread");
  });

  it("keeps what it did not set, and clears a choice rather than storing an empty one", () => {
    inTemp();
    writePreferences({ engine: "claude-code" });
    assert.equal(chosenEngine(), "claude-code");
    // A caller that sets nothing changes nothing: a control that silently
    // cleared the settings beside the one it changed is a control nobody can
    // trust twice.
    writePreferences({});
    assert.equal(chosenEngine(), "claude-code");
    // "I want no default" is a thing a person can mean, and a stored empty
    // string is a choice that reads as one.
    writePreferences({ engine: "" });
    assert.equal(chosenEngine(), null);
    assert.equal(readPreferences().engine, undefined);
  });

  it("holds an authoring model beside the vehicles, and keeps the rest when one moves", () => {
    // *Keep as my default* has to write somewhere that is not a file
    // somebody else clones. It is the same shape as the two vehicles beside
    // it: a personal default that applies wherever a checkout names none.
    inTemp();
    writePreferences({ engine: "claude-code", transport: "api" });
    writePreferences({ authoringModel: "claude-opus-5" });
    const held = readPreferences();
    assert.equal(held.authoring_model, "claude-opus-5");
    assert.equal(held.engine, "claude-code");
    assert.equal(held.transport, "api");
    // A model id goes in as it was given: the date suffix is what makes a
    // pin a pin, and nothing here may generalise it away.
    writePreferences({ authoringModel: "claude-opus-5-20260901" });
    assert.equal(readPreferences().authoring_model, "claude-opus-5-20260901");
    writePreferences({ authoringModel: "" });
    assert.equal(readPreferences().authoring_model, undefined);
    assert.equal(readPreferences().engine, "claude-code");
  });

  it("survives a catalog refresh, which is the whole reason it is not in the catalog", () => {
    // A selection stored inside `ai-model-catalog.json` is a selection the
    // next free refresh wipes: that file is defined as rebuildable for
    // nothing, and a refresh replaces it whole.
    const root = tempDir("preferences-");
    setPreferencesPath(join(root, PREFERENCES_FILENAME));
    const catalog = join(root, "ai-model-catalog.json");
    setCatalogPath(catalog);
    // BOTH choices, because a model selection is the one this matters most
    // for: it names a catalog id, so it is the choice a reader would most
    // expect to find stored beside the ids -- exactly where a refresh would
    // wipe it.
    writePreferences({ engine: "claude-code" });
    writePreferences({ role: "reviewer", selected: "gpt-5.6-terra" });

    writeBlock(TRANSPORT_API, {
      refreshed_at: "2026-09-11T00:00:00Z",
      source: SOURCE_API,
      scope: { providers: ["anthropic"] },
      models: [],
      retired: [],
    });

    assert.equal(chosenEngine(), "claude-code");
    assert.equal(selectedModel("reviewer"), "gpt-5.6-terra");
    // And the two are genuinely two files: neither choice is in the one a
    // refresh rewrites.
    const written = readFileSync(catalog, "utf8");
    assert.ok(!written.includes("claude-code"));
    assert.ok(!written.includes("gpt-5.6-terra"));
  });

  it("keeps one role's selection when another role's is set or cleared", () => {
    // A control that silently cleared the choice beside the one it changed
    // is a control nobody can trust twice, and a selection is per role.
    inTemp();
    writePreferences({ role: "reviewer", selected: "gpt-5.6-terra" });
    writePreferences({ role: "auxiliary-reviewer", selected: "claude-opus-5" });
    assert.equal(selectedModel("reviewer"), "gpt-5.6-terra");
    writePreferences({ role: "auxiliary-reviewer", selected: "" });
    assert.equal(selectedModel("auxiliary-reviewer"), null);
    assert.equal(selectedModel("reviewer"), "gpt-5.6-terra");
  });

  it("refuses this machine's own file under either runner, on the catalog's rule", () => {
    // One statement of what a test run is, in catalog.ts, imported here:
    // the two records are refused together or the second one is refused by
    // whichever runner somebody remembered. The choice is the more
    // dangerous of the two to touch -- a catalog is rebuildable for
    // nothing, and an operator's engine and model selections are not.
    const armed = currentPreferencesPath();
    const namedPath = process.env[PREFERENCES_PATH_ENV];
    const testContext = process.env["NODE_TEST_CONTEXT"];
    const entry = process.argv[1];
    try {
      setPreferencesPath(null);
      delete process.env[PREFERENCES_PATH_ENV];
      assert.throws(() => currentPreferencesPath(), /setPreferencesPath/, "under node:test");

      delete process.env["NODE_TEST_CONTEXT"];
      process.argv[1] = "/repo/tools/x/node_modules/mocha/bin/mocha.js";
      assert.throws(() => currentPreferencesPath(), /setPreferencesPath/, "under mocha");

      process.env[PREFERENCES_PATH_ENV] = "/tmp/somewhere/preferences.json";
      assert.equal(currentPreferencesPath(), "/tmp/somewhere/preferences.json");
    } finally {
      if (entry === undefined) process.argv.splice(1, 1);
      else process.argv[1] = entry;
      if (testContext === undefined) delete process.env["NODE_TEST_CONTEXT"];
      else process.env["NODE_TEST_CONTEXT"] = testContext;
      if (namedPath === undefined) delete process.env[PREFERENCES_PATH_ENV];
      else process.env[PREFERENCES_PATH_ENV] = namedPath;
      setPreferencesPath(armed);
    }
  });
});
