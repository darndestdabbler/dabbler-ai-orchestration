// The two verbs that read what `configure` writes.
//
// `options` answers "what could I put here" with local availability on each
// choice; `explain` answers "why is it this" by naming the layer that
// decided. Both render one reading, so what the pane shows and what a
// terminal prints cannot come apart.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { SOURCE_API, TRANSPORT_API, writeBlock, type CatalogModel } from "../src/catalog.ts";
import { configurationVerb } from "../src/cli/configuration.ts";
import { configure } from "../src/cli/configure.ts";
import { configurationNode } from "../src/projection.ts";
import { resetProjectRootCache } from "../src/config.ts";
import { writePreferences } from "../src/preferences.ts";
import { SETTING_TRANSPORT, writeSettings } from "../src/settings.ts";
import { gitAnswers, tempDir } from "./support/answers.ts";
import { capture } from "../src/output.ts";

function node(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const KEYS = [
  "DABBLER_ANTHROPIC_API_KEY",
  "DABBLER_OPENAI_API_KEY",
  "DABBLER_GEMINI_API_KEY",
] as const;

function catalogRow(id: string, provider: string): CatalogModel {
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

/**
 * A checkout on the direct-API path with two models this machine can reach.
 *
 * Every input is arranged: the keys that decide reachability, the vehicle
 * (a file now, not a variable), and the catalog. A test that left any of
 * them to the machine would be reading the developer's own setup.
 */
function machine(): { root: string; restore: () => void } {
  const root = tempDir("configuration-verb-");
  const held = KEYS.map((name) => [name, process.env[name]] as const);
  for (const name of KEYS) process.env[name] = "k";
  const ungit = gitAnswers([
    [["rev-parse", "--show-toplevel"], { stdout: root.split("\\").join("/") }],
  ]);
  resetProjectRootCache();
  writeSettings(root, { [SETTING_TRANSPORT]: TRANSPORT_API });
  writePreferences({ engine: "claude-code" });
  writeBlock(TRANSPORT_API, {
    refreshed_at: "2026-09-11T00:00:00Z",
    source: SOURCE_API,
    scope: { providers: ["anthropic", "google", "openai"] },
    models: [catalogRow("claude-opus-5", "anthropic"), catalogRow("gpt-5.6-terra", "openai")],
    retired: [],
  });
  return {
    root,
    restore: () => {
      writePreferences({ engine: "" });
      ungit();
      resetProjectRootCache();
      for (const [name, value] of held) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    },
  };
}

describe("what may be chosen, and what decided what is", () => {
  it("offers each participant's choices with whether this machine can reach them", async () => {
    const { root, restore } = machine();
    try {
      const run = await capture(() => configurationVerb(["options", "--repo-root", root]));
      assert.equal(run.value, 0, run.stderr);
      // The vehicle this machine has, and the one it does not -- NAMED, with
      // the reason. A list that silently dropped it reads as a broken pane.
      assert.match(run.stdout, /Primary Reviewer/);
      assert.match(run.stdout, /\* api/);
      assert.match(run.stdout, /x offline — not reachable here/);
      // And the authoring list is the engine's: Claude Code runs Anthropic
      // models and nothing else, so the openai id is not on that row.
      const authoring = run.stdout.slice(0, run.stdout.indexOf("Primary Reviewer"));
      assert.match(authoring, /claude-opus-5/);
      assert.ok(!authoring.includes("gpt-5.6-terra"), authoring);
    } finally {
      restore();
    }
  });

  it("names the layer that decided each value, and the ones it shadows", async () => {
    const { root, restore } = machine();
    try {
      // Two layers naming a vehicle: the checkout's file decides and the
      // person's default is shadowed. A value alone cannot tell an operator
      // that the setting they are looking at is outranked by one above it.
      writePreferences({ transport: "offline" });
      const run = await capture(() => configurationVerb(["explain", "--repo-root", root]));
      assert.equal(run.value, 0, run.stderr);
      assert.match(run.stdout, /machine vehicle: api/);
      assert.match(run.stdout, /decides: \.vscode/);
      assert.match(run.stdout, /shadowed: preferences\.json = offline/);
    } finally {
      writePreferences({ transport: "" });
      restore();
    }
  });

  it("refuses an unknown subcommand rather than guessing one", async () => {
    const run = await capture(() => configurationVerb(["explainn"]));
    assert.equal(run.value, 2);
    assert.match(run.stderr, /unknown command/);
  });
});

describe("the authoring model an operator may name", () => {
  it("accepts one this engine could author with and writes it to the checkout", () => {
    const { root, restore } = machine();
    try {
      const outcome = configure({ repoRoot: root, authoringModel: "claude-opus-5" });
      assert.equal(outcome.refusal, null);
      assert.ok(
        outcome.changed.some((line) => line.includes("claude-opus-5")),
        outcome.changed.join(" | "),
      );
      assert.match(String(outcome.path), /settings\.json/);
    } finally {
      restore();
    }
  });

  it("is what the reading reports for the next session, so the write is consumed", () => {
    // A setting no reader consumes is a control that reports success and
    // changes nothing, which is the failure this whole block exists to
    // delete. The row REPORTS while a session in flight declared a model --
    // the ledger already carries that and nothing may override it -- and
    // otherwise shows what this checkout chose for the next one.
    const { root, restore } = machine();
    try {
      const before = node(configurationNode(root)["authoring"]);
      assert.equal(node(before["chosen"])["model"], undefined);
      assert.equal(before["declaredAtStart"], false);
      configure({ repoRoot: root, authoringModel: "claude-opus-5" });
      const after = node(configurationNode(root)["authoring"]);
      assert.equal(node(after["chosen"])["model"], "claude-opus-5");
      assert.equal(after["declaredAtStart"], false, "nothing declared it at a start");
    } finally {
      restore();
    }
  });

  it("refuses one the engine's own list does not offer, and says what it offers", () => {
    // The offer and the acceptance are one list. A verb that checked the
    // whole transport instead would accept a model the launch then refuses,
    // which is session 156's first defect in the other direction.
    const { root, restore } = machine();
    try {
      const outcome = configure({ repoRoot: root, authoringModel: "gpt-5.6-terra" });
      assert.match(String(outcome.refusal), /gpt-5\.6-terra/);
      assert.match(String(outcome.refusal), /claude-opus-5/);
      assert.deepEqual(outcome.changed, []);
    } finally {
      restore();
    }
  });
});
