// `dabbler configure`, judged the way the pane calls it: with `--repo-root`
// naming a checkout that is not the directory the call stands in.
//
// What the pane OFFERS is `configurationNode` for that checkout, and every
// offer must be accepted by `configure` for the same checkout. The sweep is
// kept as a test so a reading that drifts from its root fails here rather
// than at an operator's click.

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  SOURCE_API,
  SOURCE_SEAT,
  TRANSPORT_API,
  TRANSPORT_SEAT,
  writeBlock,
  type CatalogModel,
} from "../src/catalog.ts";
import { configure } from "../src/cli/configure.ts";
import { resetProjectRootCache } from "../src/config.ts";
import { readPreferences, writePreferences } from "../src/preferences.ts";
import { configurationNode } from "../src/projection.ts";
import { ROLE_AUXILIARY_REVIEWER, ROLE_PRIMARY_REVIEWER } from "../src/selection.ts";
import {
  SETTING_AUXILIARY_MODEL,
  SETTING_AUTHORING_MODEL,
  SETTING_ENGINE,
  SETTING_REVIEWER_MODEL,
  SETTING_REVIEWER_TRANSPORT,
  SETTING_TRANSPORT,
  settingValue,
  writeSettings,
} from "../src/settings.ts";
import { setSeatIdentity } from "../src/transports/copilot.ts";
import { gitAnswers, tempDir } from "./support/answers.ts";

const SEAT = { host: "https://github.com", login: "someone" };

const KEYS = [
  "DABBLER_ANTHROPIC_API_KEY",
  "DABBLER_OPENAI_API_KEY",
  "DABBLER_GEMINI_API_KEY",
] as const;

function row(id: string, provider: string): CatalogModel {
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

type Node = Record<string, unknown>;

function node(value: unknown): Node {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Node) : {};
}

function offeredIds(participant: unknown): string[] {
  const candidates = node(participant)["candidates"];
  return Array.isArray(candidates) ? candidates.map((candidate) => String(node(candidate)["model"])) : [];
}

/**
 * Both transports read, every key present, and the call standing in a
 * directory whose own settings name nothing -- so a reading that ignored the
 * named checkout would fall to the distribution's vehicle, which is exactly
 * what the pane met.
 */
function machine(): () => void {
  const held = KEYS.map((name) => [name, process.env[name]] as const);
  for (const name of KEYS) process.env[name] = "k";
  const elsewhere = tempDir("configure-elsewhere-");
  const ungit = gitAnswers([
    [["rev-parse", "--show-toplevel"], { stdout: elsewhere.split("\\").join("/") }],
  ]);
  resetProjectRootCache();
  setSeatIdentity(SEAT);
  writeBlock(TRANSPORT_SEAT, {
    refreshed_at: "2026-09-11T00:00:00Z",
    source: SOURCE_SEAT,
    scope: { seat_host: SEAT.host, seat_login: SEAT.login },
    models: [
      row("claude-haiku-4.5", "anthropic"),
      row("claude-opus-5", "anthropic"),
      row("gpt-5.6-sol", "openai"),
      row("gemini-3.1-pro-preview", "google"),
    ],
    retired: [],
  });
  writeBlock(TRANSPORT_API, {
    refreshed_at: "2026-09-11T00:00:00Z",
    source: SOURCE_API,
    scope: { providers: ["anthropic", "google", "openai"] },
    models: [
      row("claude-haiku-4-5-20251001", "anthropic"),
      row("claude-opus-5", "anthropic"),
      row("gpt-5.6-sol", "openai"),
      row("gemini-3.1-pro", "google"),
    ],
    retired: [],
  });
  return () => {
    clearSelections();
    writePreferences({ engine: "", transport: "", reviewerTransport: "", authoringModel: "" });
    setSeatIdentity(null);
    ungit();
    resetProjectRootCache();
    for (const [name, value] of held) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}

/** Nobody has selected a reviewer: not this machine, and not the checkout named. */
function clearSelections(root?: string): void {
  writePreferences({ role: ROLE_PRIMARY_REVIEWER, selected: "" });
  writePreferences({ role: ROLE_AUXILIARY_REVIEWER, selected: "" });
  if (root !== undefined) writeSettings(root, { [SETTING_REVIEWER_MODEL]: "", [SETTING_AUXILIARY_MODEL]: "" });
}

describe("configure, called for a checkout it is not standing in", () => {
  it("accepts every model the configuration offers that checkout, for every role and vehicle", () => {
    const restore = machine();
    try {
      let picks = 0;
      for (const engine of ["claude-code", "copilot"]) {
        for (const vehicle of [TRANSPORT_API, TRANSPORT_SEAT]) {
          for (const reviewing of [null, TRANSPORT_API, TRANSPORT_SEAT]) {
            const root = tempDir("configure-sweep-");
            writePreferences({ engine });
            writeSettings(root, {
              [SETTING_TRANSPORT]: vehicle,
              ...(reviewing === null ? {} : { [SETTING_REVIEWER_TRANSPORT]: reviewing }),
            });
            const configuration = configurationNode(root);
            const where = `${engine} on ${vehicle}, reviewing ${reviewing ?? "unset"}`;
            const flags = [
              ["authoring", "authoringModel"],
              ["primaryReviewer", "reviewerModel"],
              ["auxiliaryReviewer", "auxiliaryModel"],
            ] as const;
            for (const [participant, flag] of flags) {
              const offered = offeredIds(configuration[participant]);
              assert.ok(offered.length > 0, `${where}: ${participant} offers nothing`);
              for (const model of offered) {
                clearSelections(root);
                const outcome = configure({ repoRoot: root, [flag]: model });
                assert.equal(outcome.refusal, null, `${where}: ${participant} '${model}'`);
                picks += 1;
              }
            }
          }
        }
      }
      assert.ok(picks > 0);
    } finally {
      restore();
    }
  });

  it("refuses a model only the seat lists in a checkout that reviews on api, and names api", () => {
    const restore = machine();
    try {
      const root = tempDir("configure-api-");
      writePreferences({ engine: "claude-code" });
      writeSettings(root, { [SETTING_TRANSPORT]: TRANSPORT_API });
      const outcome = configure({ repoRoot: root, reviewerModel: "claude-haiku-4.5" });
      assert.match(String(outcome.refusal), /the api transport/);
      assert.deepEqual(outcome.changed, []);
    } finally {
      restore();
    }
  });
});

describe("where a choice made with configure is kept", () => {
  // Two windows on two repositories: a reviewer changed in one changed in the
  // other, because it was kept on the machine and nowhere else.
  it("is the checkout's own, and also the machine's default only where the machine had none", () => {
    const restore = machine();
    try {
      const first = tempDir("configure-first-");
      const second = tempDir("configure-second-");
      for (const root of [first, second]) writeSettings(root, { [SETTING_TRANSPORT]: TRANSPORT_API });

      // The first repository a person configures is how a machine gets defaults.
      const seeded = configure({ repoRoot: first, engine: "claude-code", reviewerModel: "gpt-5.6-sol" });
      assert.equal(seeded.refusal, null);
      assert.equal(settingValue(first, SETTING_ENGINE), "claude-code");
      assert.equal(settingValue(first, SETTING_REVIEWER_MODEL), "gpt-5.6-sol");
      assert.equal(readPreferences().engine, "claude-code");
      assert.equal(readPreferences().selected?.[ROLE_PRIMARY_REVIEWER], "gpt-5.6-sol");
      assert.ok(seeded.changed.some((line) => /this machine's default too/.test(line)), seeded.changed.join("\n"));

      // The second repository's own choice is its own: the first keeps its
      // reviewer, and the machine keeps the default it already had.
      const own = configure({ repoRoot: second, reviewerModel: "gemini-3.1-pro" });
      assert.equal(own.refusal, null);
      assert.equal(settingValue(second, SETTING_REVIEWER_MODEL), "gemini-3.1-pro");
      assert.equal(settingValue(first, SETTING_REVIEWER_MODEL), "gpt-5.6-sol");
      assert.equal(readPreferences().selected?.[ROLE_PRIMARY_REVIEWER], "gpt-5.6-sol");
      assert.ok(!own.changed.some((line) => /this machine's default too/.test(line)), own.changed.join("\n"));
    } finally {
      restore();
    }
  });

  it("makes an authoring model the machine's default only beside the engine that runs it", () => {
    // The operator's machine: Claude Code as its default engine, and then a
    // Copilot repository's model seeded beside it as its default model.
    const restore = machine();
    try {
      const copilot = tempDir("configure-other-engine-");
      const claude = tempDir("configure-same-engine-");
      writePreferences({ engine: "claude-code" });
      writeSettings(copilot, { [SETTING_TRANSPORT]: TRANSPORT_SEAT, [SETTING_ENGINE]: "copilot" });
      writeSettings(claude, { [SETTING_TRANSPORT]: TRANSPORT_API });

      const other = configure({ repoRoot: copilot, authoringModel: "gpt-5.6-sol" });
      assert.equal(other.refusal, null);
      assert.equal(settingValue(copilot, SETTING_AUTHORING_MODEL), "gpt-5.6-sol");
      assert.equal(readPreferences().authoring_model, undefined);
      assert.ok(other.changed.some((line) => /only beside the engine/.test(line)), other.changed.join("\n"));

      const same = configure({ repoRoot: claude, authoringModel: "claude-opus-5" });
      assert.equal(same.refusal, null);
      assert.equal(readPreferences().authoring_model, "claude-opus-5");
    } finally {
      restore();
    }
  });

  it("is the machine's default and nothing else with --mine, for every choice alike", () => {
    const restore = machine();
    try {
      const root = tempDir("configure-mine-");
      writeSettings(root, { [SETTING_TRANSPORT]: TRANSPORT_API });
      const kept = configure({ repoRoot: root, engine: "claude-code", reviewerModel: "gpt-5.6-sol", mine: true });
      assert.equal(kept.refusal, null);
      assert.equal(readPreferences().engine, "claude-code");
      assert.equal(readPreferences().selected?.[ROLE_PRIMARY_REVIEWER], "gpt-5.6-sol");
      // Nothing of it is this checkout's, so the next clone is told nothing.
      assert.equal(settingValue(root, SETTING_ENGINE), null);
      assert.equal(settingValue(root, SETTING_REVIEWER_MODEL), null);
    } finally {
      restore();
    }
  });
});
