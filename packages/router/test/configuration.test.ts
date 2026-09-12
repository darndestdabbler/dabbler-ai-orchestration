// The two verbs that read what `configure` writes.
//
// `options` answers "what could I put here" with local availability on each
// choice; `explain` answers "why is it this" by naming the layer that
// decided. Both render one reading, so what the pane shows and what a
// terminal prints cannot come apart.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { SOURCE_API, TRANSPORT_API, writeBlock, type CatalogModel } from "../src/catalog.ts";
import { configurationVerb } from "../src/cli/configuration.ts";
import { configure } from "../src/cli/configure.ts";
import { configurationNode } from "../src/projection.ts";
import { explainAuthoringModel, resetProjectRootCache } from "../src/config.ts";
import { readPreferences, writePreferences } from "../src/preferences.ts";
import {
  SETTING_AUTHORING_MODEL,
  SETTING_TRANSPORT,
  writeSettings,
} from "../src/settings.ts";
import { configuredModelRefusal, start } from "../src/session.ts";
import { gitAnswers, seed, tempDir } from "./support/answers.ts";
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

  it("names the layer of the root it was ASKED about, not the one it is standing in", async () => {
    // Found by driving the walk. `configurationNode` read the machine
    // vehicle with no root, so it fell back to the cwd's repository -- and a
    // reading taken for repository B reported repository A's vehicle and
    // named A's layer as the one that decided. That is the verb whose whole
    // job is answering "why is it this".
    const { root, restore } = machine();
    const elsewhere = tempDir("configuration-elsewhere-");
    try {
      // A second checkout, naming the other vehicle, asked about from here.
      writeSettings(elsewhere, { [SETTING_TRANSPORT]: "offline" });
      const reading = node(configurationNode(elsewhere)["transport"]);
      assert.equal(reading["effective"], "offline");
      assert.match(String(reading["decidedBy"]), /settings\.json/);
      // And this checkout still reads as its own.
      assert.equal(node(configurationNode(root)["transport"])["effective"], TRANSPORT_API);
    } finally {
      restore();
    }
  });

  it("says the authoring model was chosen, rather than that nobody chose one", async () => {
    // Two false sentences on one line, found by driving the walk: the
    // authoring role carries no `selected` and has no preference order, so
    // reading the reviewing roles' fields for it printed "nobody chose one"
    // beside the model the operator had just chosen.
    const { root, restore } = machine();
    try {
      configure({ repoRoot: root, authoringModel: "claude-opus-5" });
      const run = await capture(() => configurationVerb(["explain", "--repo-root", root]));
      assert.equal(run.value, 0, run.stderr);
      const line = run.stdout
        .split("\n")
        .find((row) => row.startsWith("Authoring AI model:")) as string;
      assert.match(line, /claude-opus-5/);
      assert.doesNotMatch(line, /nobody chose one/);
      assert.match(line, /you chose it/);
    } finally {
      writeSettings(root, { [SETTING_AUTHORING_MODEL]: "" });
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

describe("the start boundary, over a configuration that was typed into", () => {
  // `dabbler configuration options` filters a list and enforces nothing, and
  // both files a choice lives in are text. So the boundary before anything
  // is billed asks once more -- through the same reading every surface uses,
  // because a second copy of the rule is what would let the pane offer a
  // choice the start then refused.

  it("refuses an authoring model the engine's own list does not name", () => {
    const { root, restore } = machine();
    try {
      // Hand-written, exactly as an operator editing the file would leave
      // it: `configure` would have refused this, and nothing makes an
      // operator go through `configure`.
      writeSettings(root, { [SETTING_AUTHORING_MODEL]: "gpt-5.6-terra" });
      const refusal = configuredModelRefusal(root, "gpt-5.6-terra", "claude-code");
      assert.match(String(refusal), /authoring model/);
      assert.match(String(refusal), /gpt-5\.6-terra/);
      // What it offers instead, which file chose it, and the command that
      // changes it: the three things session 147 said a stop has to carry.
      assert.match(String(refusal), /claude-opus-5/);
      assert.match(String(refusal), /settings\.json/);
      assert.match(String(refusal), /dabbler configure --authoring-model/);
      // And nothing was billed, said in the refusal itself.
      assert.match(String(refusal), /nothing was billed/);
    } finally {
      writeSettings(root, { [SETTING_AUTHORING_MODEL]: "" });
      restore();
    }
  });

  it("lets through a model the engine's list does name, and a machine that chose nothing", () => {
    const { root, restore } = machine();
    try {
      assert.equal(configuredModelRefusal(root, "claude-opus-5", "claude-code"), null);
      // A first-run machine is not refused: refusing it would refuse the
      // setup that fixes it.
      assert.equal(configuredModelRefusal(root, null, "claude-code"), null);
    } finally {
      restore();
    }
  });

  it("refuses a reviewing model this machine's reviewing vehicle does not list", () => {
    const { root, restore } = machine();
    try {
      // Written straight into the preferences, which is the file a person
      // edits when a pane will not offer what they want.
      writePreferences({ role: "reviewer", selected: "not-a-model-here" });
      const refusal = configuredModelRefusal(root, "claude-opus-5", "claude-code");
      assert.match(String(refusal), /Primary Reviewer/);
      assert.match(String(refusal), /not-a-model-here/);
      assert.match(String(refusal), /preferences\.json/);
      assert.match(String(refusal), /dabbler configure --reviewer-model/);
    } finally {
      writePreferences({ role: "reviewer", selected: "" });
      restore();
    }
  });

  it("refuses a reviewer that is the author, through the rule the reading already applies", () => {
    // The one rule, and it is NOT restated at the boundary: `roleNode` keeps
    // the author out of the candidates, so a selection equal to the author
    // simply is not among them and lands with the rest. A second copy here
    // could disagree with the list the pane offered.
    const { root, restore } = machine();
    try {
      writeSettings(root, { [SETTING_AUTHORING_MODEL]: "claude-opus-5" });
      writePreferences({ role: "reviewer", selected: "claude-opus-5" });
      const refusal = configuredModelRefusal(root, "claude-opus-5", "claude-code");
      assert.match(String(refusal), /Primary Reviewer/);
      assert.match(String(refusal), /claude-opus-5/);
    } finally {
      writePreferences({ role: "reviewer", selected: "" });
      writeSettings(root, { [SETTING_AUTHORING_MODEL]: "" });
      restore();
    }
  });

  it("is WIRED into `session start`, and refuses there before a session exists", async () => {
    // A control that is written and not wired is the shape this whole block
    // of sessions exists to delete, so the rule is proved where it is spent
    // rather than only where it is stated.
    const { root, restore } = machine();
    try {
      seed(root, {
        "docs/sessions/session-plan.md":
          "### Session 1 of 1: First things\n1. Register.\n2. Build it.\n",
      });
      writeSettings(root, { [SETTING_AUTHORING_MODEL]: "gpt-5.6-terra" });
      const started = await capture(() =>
        Promise.resolve(
          start(join(root, "docs", "sessions"), {
            engine: "claude-code",
            provider: "anthropic",
          }),
        ),
      );
      assert.notEqual(started.value, 0);
      assert.match(started.stderr, /start: refused/);
      assert.match(started.stderr, /gpt-5\.6-terra/);
      // And nothing was registered: the refusal is BEFORE the session exists.
      assert.equal(existsSync(join(root, "docs", "sessions", "sessions.json")), false);
    } finally {
      writeSettings(root, { [SETTING_AUTHORING_MODEL]: "" });
      restore();
    }
  });

  it("never refuses over the alias floor, which is a reading that says it does not know", () => {
    // Where nothing could be enumerated for an engine the list is the CLI's
    // own always-accepted aliases -- three names so the pane is not empty,
    // on a machine that by definition does not know what its CLI accepts.
    // Holding a choice to that list would refuse every operator whose
    // machine cannot enumerate, which is an ordinary machine.
    const { root, restore } = machine();
    try {
      // No provider key resolves, so the Anthropic block cannot be read and
      // Claude Code's list falls to the floor.
      const held = KEYS.map((name) => [name, process.env[name]] as const);
      for (const name of KEYS) delete process.env[name];
      try {
        const authoring = node(
          node(configurationNode(root, { engine: "claude-code" }))["authoring"],
        );
        assert.deepEqual(
          (authoring["candidates"] as { model: string }[]).map((row) => row.model).sort(),
          ["haiku", "opus", "sonnet"],
        );
        assert.equal(configuredModelRefusal(root, "claude-opus-5-20260901", "claude-code"), null);
      } finally {
        for (const [name, value] of held) {
          if (value === undefined) delete process.env[name];
          else process.env[name] = value;
        }
      }
    } finally {
      restore();
    }
  });
});

describe("a choice kept as this person's rather than this checkout's", () => {
  // The difference is who else gets it. `.vscode/settings.json` is committed
  // and reaches everyone who clones; `preferences.json` is on this machine
  // and travels nowhere. A right-click that published a personal preference
  // into somebody else's repository would be a control doing more than it
  // said.

  it("writes the vehicle and the authoring model to the preferences, not the checkout", () => {
    const { root, restore } = machine();
    try {
      const outcome = configure({
        repoRoot: root,
        reviewerTransport: TRANSPORT_API,
        authoringModel: "claude-opus-5",
        mine: true,
      });
      assert.equal(outcome.refusal, null);
      // Nothing was written to the checkout at all -- not the file, not a key.
      assert.equal(outcome.path, null);
      assert.ok(
        outcome.changed.every((line) => line.includes("preferences.json")),
        outcome.changed.join(" | "),
      );
      const held = readPreferences();
      assert.equal(held.reviewer_transport, TRANSPORT_API);
      assert.equal(held.authoring_model, "claude-opus-5");
    } finally {
      writePreferences({ reviewerTransport: "", authoringModel: "" });
      restore();
    }
  });

  it("holds a personal default to the same checks, and refuses before it writes", () => {
    // The checks are identical either way; only where the value lands
    // changes. A `--mine` that skipped them would be a second door into the
    // same file with a different rule behind it.
    const { root, restore } = machine();
    try {
      const outcome = configure({
        repoRoot: root,
        authoringModel: "gpt-5.6-terra",
        mine: true,
      });
      assert.match(String(outcome.refusal), /gpt-5\.6-terra/);
      assert.equal(readPreferences().authoring_model, undefined);
    } finally {
      restore();
    }
  });

  it("is outranked by this checkout's own setting, which is what makes it a default", () => {
    const { root, restore } = machine();
    try {
      configure({ repoRoot: root, authoringModel: "claude-opus-5", mine: true });
      writeSettings(root, { [SETTING_AUTHORING_MODEL]: "gpt-5.6-terra" });
      // The committed setting decides; the personal default applies wherever
      // a checkout names none. Both are visible, which is the whole reason
      // the resolution order is a list of layers rather than one value.
      const reading = explainAuthoringModel(null, root);
      assert.equal(reading.transport, "gpt-5.6-terra");
      assert.match(String(reading.decidedBy), /settings\.json/);
      assert.equal(reading.layers.length, 2);
      assert.equal(reading.layers[1]?.value, "claude-opus-5");
    } finally {
      writeSettings(root, { [SETTING_AUTHORING_MODEL]: "" });
      writePreferences({ authoringModel: "" });
      restore();
    }
  });
});
