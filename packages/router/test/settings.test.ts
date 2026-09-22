// The checkout's own settings file: read by the router, written by the
// router, and shared with every other extension the operator has configured.
//
// What is proved here is mostly about what a write LEAVES: the file is not
// this framework's, and a control that charged an operator their comments
// and their unrelated settings for being used is a control they would stop
// using.

import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";

import {
  SETTINGS_RELPATH,
  SETTING_REVIEWER_TRANSPORT,
  SETTING_TRANSPORT,
  SettingsError,
  readSettings,
  settingValue,
  writeSettings,
} from "../src/settings.ts";
import { tempDir } from "./support/answers.ts";

/** A checkout whose settings file says exactly this. */
function checkout(text: string | null): string {
  const root = tempDir("settings-");
  if (text !== null) {
    const path = join(root, SETTINGS_RELPATH);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
  }
  return root;
}

describe("what a checkout says it is run with", () => {
  it("reads the dabbler keys and nothing else, comments and all", () => {
    // JSONC, because that is what VS Code writes: comments and a trailing
    // comma are ordinary in this file, and a reader that choked on them
    // would refuse the file the editor itself produced.
    const root = checkout(
      [
        "{",
        "  // why this repository needs the seat",
        '  "dabbler.transport": "copilot-cli",',
        '  "editor.tabSize": 2,',
        "}",
        "",
      ].join("\n"),
    );
    const reading = readSettings(root);
    assert.equal(reading.malformed, null);
    assert.deepEqual(reading.values, { [SETTING_TRANSPORT]: "copilot-cli" });
    assert.equal(settingValue(root, SETTING_TRANSPORT), "copilot-cli");
    assert.equal(settingValue(root, SETTING_REVIEWER_TRANSPORT), null);
  });

  it("keeps every comment and unrelated setting through a write", () => {
    const root = checkout(
      [
        "{",
        "  // The operator's own note about this checkout.",
        '  "editor.tabSize": 4,',
        '  "dabbler.transport": "api",',
        "}",
        "",
      ].join("\n"),
    );
    const written = writeSettings(root, {
      [SETTING_TRANSPORT]: "copilot-cli",
      [SETTING_REVIEWER_TRANSPORT]: "api",
    });
    assert.equal(written.changed.length, 2);
    const text = readFileSync(join(root, SETTINGS_RELPATH), "utf8");
    assert.ok(text.includes("The operator's own note"), text);
    assert.ok(text.includes('"editor.tabSize": 4'), text);
    assert.deepEqual(readSettings(root).values, {
      [SETTING_TRANSPORT]: "copilot-cli",
      [SETTING_REVIEWER_TRANSPORT]: "api",
    });
  });

  it("removes a key rather than storing an empty value", () => {
    // "I want no setting here" is a thing an operator means, and a stored
    // empty string is a setting that reads as one and resolves to nothing.
    const root = checkout('{ "dabbler.transport": "copilot-cli" }\n');
    writeSettings(root, { [SETTING_TRANSPORT]: "" });
    assert.deepEqual(readSettings(root).values, {});
  });

  it("refuses a file it cannot read, and leaves it exactly as it is", () => {
    // The alternative -- generating a fresh document over it -- would take
    // an operator who mistyped one comma and delete every other extension's
    // settings with it.
    const text = '{ "dabbler.transport": "api"  "editor.tabSize": 2 }\n';
    const root = checkout(text);
    const reading = readSettings(root);
    assert.notEqual(reading.malformed, null);
    assert.deepEqual(reading.values, {}, "a half-typed file is not a reading");
    assert.throws(
      () => writeSettings(root, { [SETTING_TRANSPORT]: "copilot-cli" }),
      SettingsError,
    );
    assert.equal(readFileSync(join(root, SETTINGS_RELPATH), "utf8"), text);
  });

  it("is silence where there is no file, and writes one when asked", () => {
    const root = checkout(null);
    assert.equal(readSettings(root).present, false);
    assert.deepEqual(readSettings(root).values, {});
    writeSettings(root, { [SETTING_TRANSPORT]: "api" });
    assert.equal(readSettings(root).values[SETTING_TRANSPORT], "api");
  });
});
