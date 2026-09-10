// The projection the Solution Explorer renders: modules from the manifest,
// in dependency order, with who-uses-whom derived and never declared.

import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, it } from "node:test";

import { emptyRecord, mergeRecord, writeRecord } from "../src/discovery.ts";
import { configurationNode, project, writeProjection } from "../src/projection.ts";
import { gitAnswers, seed, tempDir } from "./support/answers.ts";
import { resetProjectRootCache } from "../src/config.ts";

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

  it("marks the in-flight session's module from the ledger row, and from the marker in the repository", () => {
    const manifest = "modules:\n- slug: model\n  codeRoots:\n  - modules/model\n- slug: persister\n  dependsOn: [model]\n  codeRoots:\n  - modules/persister\n";
    // In the module's folder: the ledger's in-progress row carries the checkout.
    const clone = tempDir("projection-");
    seed(clone, {
      "docs/modules.yaml": manifest,
      "docs/sessions/sessions.json": JSON.stringify({
        schemaVersion: 5,
        sessions: [{ number: 7, status: "in-progress", checkout: { module: "persister", path: clone } }],
      }),
    });
    const inClone = project(clone).modules as { slug: string; inSession: number | null }[];
    assert.deepEqual(inClone.map((m) => [m.slug, m.inSession]), [["model", null], ["persister", 7]]);
    // In the repository: no row is in flight here, and the marker says where it went.
    const repo = tempDir("projection-");
    seed(repo, {
      "docs/modules.yaml": manifest,
      ".dabbler/module-session.json": JSON.stringify({
        session: 7, module: "persister", path: clone, sessionsDir: join(clone, "docs", "sessions"), startedAt: "2026-09-08T15:00:00",
      }),
    });
    const inRepo = project(repo).modules as { slug: string; inSession: number | null }[];
    assert.deepEqual(inRepo.map((m) => [m.slug, m.inSession]), [["model", null], ["persister", 7]]);
    // Nothing in flight anywhere: no row is marked.
    const idle = tempDir("projection-");
    seed(idle, { "docs/modules.yaml": manifest });
    assert.ok((project(idle).modules as { inSession: number | null }[]).every((m) => m.inSession === null));
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

describe("what a session would be run with", () => {
  const KEYS = [
    "DABBLER_ANTHROPIC_API_KEY",
    "DABBLER_OPENAI_API_KEY",
    "DABBLER_GEMINI_API_KEY",
  ];

  /**
   * The one git call this reading makes, answered.
   *
   * `loadConfig` asks git where the project root is, and the suite traps git
   * -- correctly, since a test that shelled out would read whatever
   * repository it happened to be run in. The answer is fed through the seam
   * the suite provides, and the root is the temp directory under test.
   */
  function inRepository(root: string): () => void {
    const restore = gitAnswers([
      [["rev-parse", "--show-toplevel"], { stdout: root.split("\\").join("/") }],
    ]);
    resetProjectRootCache();
    return () => {
      restore();
      resetProjectRootCache();
    };
  }

  /**
   * The environment these readings are taken in, stated in full.
   *
   * **A suite may not read the operator's environment.** The transport is
   * resolved from `DABBLER_TRANSPORT` where one is set, and a machine that
   * has one persisted would run these against a transport the test never
   * chose -- which is exactly what happened: the run of record read a seat
   * where the developer's shell read the API. Every variable either reading
   * depends on is set here, including the ones set to nothing.
   */
  function withEnv(values: Readonly<Record<string, string | null>>): () => void {
    const names = ["DABBLER_TRANSPORT", ...KEYS];
    const held = names.map((name) => [name, process.env[name]] as const);
    for (const name of names) {
      const wanted = values[name] ?? null;
      if (wanted === null) delete process.env[name];
      else process.env[name] = wanted;
    }
    return () => {
      for (const [name, value] of held) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    };
  }

  /** Every provider reachable, on the direct-API path, and nothing inherited. */
  function withKeys(): () => void {
    return withEnv({
      DABBLER_TRANSPORT: "api",
      DABBLER_ANTHROPIC_API_KEY: "k",
      DABBLER_OPENAI_API_KEY: "k",
      DABBLER_GEMINI_API_KEY: "k",
    });
  }

  type Role = {
    chosen: { model: string } | null;
    candidates: { model: string; retired: { since: string; lastSeenAt: string | null } | null }[];
    withheld: { model: string; retired: { since: string; lastSeenAt: string | null } | null }[];
  };

  it("offers the seat's own catalog on the seat transport, with no provider key anywhere", () => {
    // 145's defect, and what held 2.1.0: both role rows enumerated the
    // direct-API registry on every transport, so a machine with a seat and
    // no `DABBLER_*_API_KEY` read "nothing resolves" while its catalog held
    // eighteen working models. The enumeration belongs to the transport.
    const restore = withEnv({ DABBLER_TRANSPORT: "copilot-cli" });
    const root = tempDir("configuration-");
    const ungit = inRepository(root);
    try {
      const configuration = configurationNode(root);
      const authoring = configuration["authoring"] as Role & { enumeration: string };
      const verifying = configuration["verifying"] as Role & { enumeration: string };

      assert.equal(authoring.enumeration, "seat-catalog");
      assert.ok(authoring.chosen !== null, "the seat's catalog resolves an authoring model");
      assert.ok(authoring.candidates.length > 1);
      // Cross-provider review still holds on this path: the verifier is
      // resolved with the authoring model's provider excluded, and the seat
      // fronts more than one provider.
      assert.equal(verifying.enumeration, "seat-catalog");
      assert.ok(verifying.chosen !== null);
      assert.notEqual(
        (verifying.chosen as unknown as { provider: string }).provider,
        (authoring.chosen as unknown as { provider: string }).provider,
      );
      // And the seat's own retirement mark is rendered rather than
      // re-derived: the shipped catalog carries models the seat stopped
      // listing, and not one of them is offered.
      const offered = new Set(authoring.candidates.map((candidate) => candidate.model));
      for (const candidate of authoring.withheld) {
        assert.ok(candidate.retired !== null);
        assert.ok(!offered.has(candidate.model));
      }
    } finally {
      ungit();
      restore();
    }
  });

  it("withholds a model the record says is no longer served, and says since when", () => {
    const restore = withKeys();
    const root = tempDir("configuration-");
    const ungit = inRepository(root);
    try {
      const before = configurationNode(root)["authoring"] as Role;
      const chosen = before.chosen?.model;
      assert.ok(chosen !== undefined, "the bundled registry resolves an authoring model");
      assert.deepEqual(before.withheld, []);

      // The vendor stopped serving exactly the model the role would have
      // picked: the record keeps the entry, marked, and the offer drops it.
      const provider = String(
        (before.candidates[0] as unknown as { provider: string }).provider,
      );
      writeRecord(
        join(root, ".dabbler", "api-models.lock"),
        mergeRecord(
          mergeRecord(
            emptyRecord(),
            [
              {
                provider,
                entries: [
                  {
                    id: chosen,
                    provider,
                    provider_source: "vendor-enumeration",
                    display_name: null,
                    created_at: null,
                    max_context_tokens: null,
                    max_output_tokens: null,
                    capabilities: [],
                    enumerated_at: null,
                    retired_at: null,
                    raw: {},
                  },
                ],
                error: null,
              },
            ],
            "2026-09-01T00:00:00Z",
          ),
          [{ provider, entries: [], error: null }],
          "2026-09-09T00:00:00Z",
        ),
      );

      const after = configurationNode(root)["authoring"] as Role;
      assert.ok(!after.candidates.some((candidate) => candidate.model === chosen));
      assert.deepEqual(
        after.withheld.map((candidate) => [candidate.model, candidate.retired?.since, candidate.retired?.lastSeenAt]),
        [[chosen, "2026-09-09T00:00:00Z", "2026-09-01T00:00:00Z"]],
      );
      // The role still resolves: withholding one model is not emptying a
      // ladder, and the registry entry that declares it is untouched.
      assert.notEqual(after.chosen?.model, chosen);
      assert.ok(after.chosen !== null);
    } finally {
      ungit();
      restore();
    }
  });
});
