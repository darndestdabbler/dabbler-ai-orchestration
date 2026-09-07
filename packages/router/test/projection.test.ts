// The projection the Solution Explorer renders: modules from the manifest,
// in dependency order, with who-uses-whom derived and never declared.

import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, it } from "node:test";

import { project, writeProjection } from "../src/projection.ts";
import { seed, tempDir } from "./support/answers.ts";

type Module = {
  slug: string;
  kind: string;
  dependsOn: string[];
  usedBy: string[];
  contractDir: string | null;
};

describe("the module projection", () => {
  it("projects the manifest in dependency order with usedBy derived, and the contract folder when the tree has it", () => {
    const root = tempDir("projection-");
    seed(root, {
      "docs/modules.yaml": [
        "modules:",
        "- slug: listener",
        "  kind: application",
        "  dependsOn: [deserializer, persister]",
        "- slug: persister",
        "  dependsOn: [model]",
        "  package: CsvPersister",
        "  contract: designed",
        "- slug: deserializer",
        "  dependsOn: [model]",
        "  package: CsvDeserializer",
        "- slug: model",
        "  kind: shared-types",
        "  package: CsvModel",
        "",
      ].join("\n"),
    });
    mkdirSync(join(root, "modules", "persister", "contract"), { recursive: true });
    const doc = project(root);
    const solution = doc.solution as { multi: boolean; implicit: boolean; moduleCount: number };
    assert.equal(solution.multi, true);
    assert.equal(solution.implicit, false);
    assert.equal(solution.moduleCount, 4);
    const modules = doc.modules as Module[];
    assert.deepEqual(modules.map((m) => m.slug), ["model", "persister", "deserializer", "listener"]);
    assert.deepEqual(modules[0]?.usedBy, ["persister", "deserializer", "listener"]);
    assert.deepEqual(modules[3]?.usedBy, []);
    // The folder is reported only where the tree has it and a seam is declared.
    assert.equal(modules[1]?.contractDir, "modules/persister/contract");
    assert.equal(modules[2]?.contractDir, null);
    assert.equal(modules[3]?.contractDir, null);
  });

  it("projects the deployables a solution declares, including one nothing ships yet, and reads a module's shipped-in from a bundle's from", () => {
    const root = tempDir("projection-");
    seed(root, {
      "docs/modules.yaml": [
        "modules:",
        "- slug: api",
        "  kind: application",
        "  dependsOn: [core]",
        "- slug: tool",
        "  kind: application",
        "- slug: core",
        "  kind: library",
        "  package: Core",
        "deployables:",
        "- slug: edge",
        "  title: Edge service",
        "  kind: service",
        "  from: [api, tool]",
        "  runtime: container",
        "  publish: acr",
        "- slug: installer",
        "  kind: cli",
        "  from: []",
        "",
      ].join("\n"),
      // Written by a releasable session's candidate: the record names the
      // modules it was built from, and the projection reads it rather than
      // recomputing what shipped.
      "release/edge/bundle.yaml": [
        "bundle: edge",
        "from:",
        "  - api",
        "  - tool",
        "version: 1.0.0",
        "baseCommit: abc123",
        "date: '2026-09-07'",
        "session: 20",
        "dependencies: []",
        "",
      ].join("\n"),
    });
    const doc = project(root);
    const deployables = doc.deployables as { slug: string; from: string[]; kind: string | null; publish: string | null; declared: boolean }[];
    assert.deepEqual(
      deployables.map((one) => [one.slug, one.from, one.kind, one.publish, one.declared]),
      [
        ["edge", ["api", "tool"], "service", "acr", true],
        ["installer", [], "cli", null, true],
      ],
    );
    // `tool` has no package and is not the bundle's name; it is shipped in
    // `edge` because the record says the bundle was built from it.
    const modules = doc.modules as { slug: string; shippedIn: string[] }[];
    assert.deepEqual(modules.find((module) => module.slug === "tool")?.shippedIn, ["edge"]);
    assert.deepEqual(modules.find((module) => module.slug === "core")?.shippedIn, []);
  });

  it("projects an absent manifest as the one implicit module, and writes where the Explorer reads", () => {
    const root = tempDir("projection-");
    const doc = project(root);
    const solution = doc.solution as { multi: boolean; implicit: boolean };
    assert.equal(solution.multi, false);
    assert.equal(solution.implicit, true);
    const modules = doc.modules as Module[];
    assert.equal(modules.length, 1);
    assert.equal(modules[0]?.slug, basename(root));
    assert.equal(modules[0]?.kind, "application");
    assert.deepEqual(modules[0]?.usedBy, []);
    const path = writeProjection(root);
    assert.equal(path, join(root, ".dabbler", "solution", "projection.json"));
    assert.ok(existsSync(path));
  });
});
