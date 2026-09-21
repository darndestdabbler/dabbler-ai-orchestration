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
import { writePreferences } from "../src/preferences.ts";
import { configurationNode } from "../src/projection.ts";
import { ROLE_AUXILIARY_REVIEWER, ROLE_PRIMARY_REVIEWER } from "../src/selection.ts";
import { SETTING_REVIEWER_TRANSPORT, SETTING_TRANSPORT, writeSettings } from "../src/settings.ts";
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
    writePreferences({ engine: "" });
    setSeatIdentity(null);
    ungit();
    resetProjectRootCache();
    for (const [name, value] of held) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  };
}

function clearSelections(): void {
  writePreferences({ role: ROLE_PRIMARY_REVIEWER, selected: "" });
  writePreferences({ role: ROLE_AUXILIARY_REVIEWER, selected: "" });
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
                clearSelections();
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
