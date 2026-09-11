// The projection the Solution Explorer renders: modules from the manifest,
// in dependency order, with who-uses-whom derived and never declared.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
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
import { configurationNode, project, writeProjection } from "../src/projection.ts";
import { ROLE_VERIFIER, roleDeclaration } from "../src/selection.ts";
import { seatLadder } from "../src/route.ts";
import { setSeatIdentity } from "../src/transports/copilot.ts";
import { gitAnswers, seed, tempDir } from "./support/answers.ts";
import { loadConfig, resetProjectRootCache } from "../src/config.ts";

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

/** The seat this machine is on, for a test that writes a block for it. */
const SEAT = { host: "https://github.com", login: "someone" };

/** One model, as either transport's own free reading records it. */
function catalogModelRow(id: string, provider: string): CatalogModel {
  return {
    id,
    provider,
    provider_source: "name-prefix-heuristic",
    display_name: id,
    enabled: true,
    price_category: null,
    cost: null,
    listed_at: "2026-09-11T00:00:00Z",
  };
}

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
      // What this machine read from its own seat. Nothing ships a catalog
      // any more: a seat machine's models are the ones its seat listed.
      setSeatIdentity(SEAT);
      writeBlock(TRANSPORT_SEAT, {
        refreshed_at: "2026-09-11T00:00:00Z",
        source: SOURCE_SEAT,
        scope: { seat_host: SEAT.host, seat_login: SEAT.login },
        models: [
          catalogModelRow("claude-haiku-4.5", "anthropic"),
          catalogModelRow("gpt-5.6-sol", "openai"),
          catalogModelRow("gemini-3.1-pro-preview", "google"),
        ],
        retired: [{ id: "claude-sonnet-4.6", retired_at: "2026-09-10T00:00:00Z" }],
      });
      // The engine that is running this session, and the model it declared
      // at `session start`: the authoring row REPORTS that rather than
      // resolving a role, because that is the model which authors.
      seed(root, {
        "docs/sessions/sessions.json": JSON.stringify({
          schemaVersion: 5,
          sessions: [
            {
              number: 1,
              status: "in-progress",
              orchestrator: { engine: "copilot", provider: "google", model: "gemini-3.1-pro-preview" },
            },
          ],
        }),
      });
      const configuration = configurationNode(root);
      const authoring = configuration["authoring"] as Role & { enumeration: string };
      const verifying = configuration["verifying"] as Role & { enumeration: string };

      assert.equal(authoring.enumeration, "seat-catalog");
      assert.equal(authoring.chosen?.model, "gemini-3.1-pro-preview");
      // A seat fronts every vendor it lists, so the engine narrows nothing.
      assert.ok(authoring.candidates.length > 1);
      // The verifying row draws on the same catalog, less the one model it
      // may not be. It is not resolved with the author's PROVIDER excluded
      // any more: which models of one vendor are far enough apart to review
      // each other is the developer's judgement, not this framework's.
      assert.equal(verifying.enumeration, "seat-catalog");
      assert.ok(verifying.chosen !== null);
      assert.ok(
        !verifying.candidates.some(
          (candidate) => candidate.model === (authoring.chosen as unknown as { model: string }).model,
        ),
        "the authoring model is not offered as its own verifier",
      );
      // And the archive is rendered rather than re-derived: a model the seat
      // stopped listing is named with the date it went, and is not offered.
      const offered = new Set(authoring.candidates.map((candidate) => candidate.model));
      assert.deepEqual(
        authoring.withheld.map((candidate) => [candidate.model, candidate.retired?.since]),
        [["claude-sonnet-4.6", "2026-09-10T00:00:00Z"]],
      );
      assert.ok(!offered.has("claude-sonnet-4.6"));
    } finally {
      ungit();
      restore();
    }
  });

  /** The overlay `configure` writes, removed, so each call decides afresh. */
  function withoutOverlay(root: string): void {
    rmSync(join(root, "local-overrides.yaml"), { force: true });
    resetProjectRootCache();
  }

  it("offers exactly the models `configure` accepts, on each transport", () => {
    // Defect 1, from both ends at once. The pane resolved through the one
    // reading of the catalog while `configure` walked the model registry on
    // every transport -- so on a seat, whose models were never in that
    // registry, the verb refused every model the pane had just listed. One
    // reading means the offer and the acceptance cannot disagree, and the
    // only way to prove that is to offer a list and then accept all of it.
    for (const transport of ["copilot-cli", "api"] as const) {
      const seat = transport === "copilot-cli";
      const restore = seat ? withEnv({ DABBLER_TRANSPORT: "copilot-cli" }) : withKeys();
      const root = tempDir("configuration-");
      const ungit = inRepository(root);
      try {
        if (seat) {
          setSeatIdentity(SEAT);
          writeBlock(TRANSPORT_SEAT, {
            refreshed_at: "2026-09-11T00:00:00Z",
            source: SOURCE_SEAT,
            scope: { seat_host: SEAT.host, seat_login: SEAT.login },
            // Ids the deleted registry never declared, which is the case
            // that used to be refused out of hand.
            models: [
              catalogModelRow("claude-haiku-4.5", "anthropic"),
              catalogModelRow("gpt-5.6-sol", "openai"),
              catalogModelRow("gpt-5.6-terra", "openai"),
            ],
            retired: [],
          });
        } else {
          writeBlock(TRANSPORT_API, {
            refreshed_at: "2026-09-11T00:00:00Z",
            source: SOURCE_API,
            scope: { providers: ["anthropic", "google", "openai"] },
            models: [
              catalogModelRow("claude-opus-5", "anthropic"),
              catalogModelRow("gpt-5.6-terra", "openai"),
              catalogModelRow("gemini-3.1-pro-preview", "google"),
            ],
            retired: [],
          });
        }

        const verifying = configurationNode(root)["verifying"] as Role;
        assert.ok(verifying.candidates.length > 1, `${transport} offers a choice`);
        for (const candidate of verifying.candidates) {
          withoutOverlay(root);
          const outcome = configure({ repoRoot: root, verifyingModel: candidate.model });
          assert.equal(
            outcome.refusal,
            null,
            `${transport} offered ${candidate.model} and then refused it`,
          );
        }
        // And the converse: a name the transport does not list is refused,
        // rather than written and discovered at dispatch.
        withoutOverlay(root);
        assert.match(
          String(configure({ repoRoot: root, verifyingModel: "no-such-model" }).refusal),
          /is not a model the .* transport lists/,
        );
      } finally {
        withoutOverlay(root);
        ungit();
        restore();
      }
    }
  });

  it("refuses only the authoring model itself, and accepts its provider-mate", () => {
    // The one rule, from the verb's side: two ids compared. A second model
    // from the same vendor is accepted because whether it shares the first's
    // blind spot is a judgement this framework has no data to make -- and
    // the seat below fronts two OpenAI models, which is exactly that case.
    //
    // The author is the ORCHESTRATOR's model, off the ledger, because that
    // is the model that authors. It used to be a role's resolution, and that
    // role was dispatched by nothing, so the rule was being applied to a
    // model no call would ever use.
    const restore = withEnv({ DABBLER_TRANSPORT: "copilot-cli" });
    const root = tempDir("configuration-");
    const ungit = inRepository(root);
    try {
      setSeatIdentity(SEAT);
      writeBlock(TRANSPORT_SEAT, {
        refreshed_at: "2026-09-11T00:00:00Z",
        source: SOURCE_SEAT,
        scope: { seat_host: SEAT.host, seat_login: SEAT.login },
        models: [
          catalogModelRow("gpt-5.6-terra", "openai"),
          catalogModelRow("gpt-5.6-sol", "openai"),
        ],
        retired: [],
      });
      const author = "gpt-5.6-terra";
      seed(root, {
        "docs/sessions/sessions.json": JSON.stringify({
          schemaVersion: 5,
          sessions: [
            {
              number: 1,
              status: "in-progress",
              orchestrator: { engine: "copilot", provider: "openai", model: author },
            },
          ],
        }),
      });
      assert.equal((configurationNode(root)["authoring"] as Role).chosen?.model, author);

      withoutOverlay(root);
      assert.match(
        String(configure({ repoRoot: root, verifyingModel: author }).refusal),
        /they are the same model/,
      );
      withoutOverlay(root);
      assert.equal(
        configure({ repoRoot: root, verifyingModel: "gpt-5.6-sol" }).refusal,
        null,
        "a different model on the same provider is the developer's call to make",
      );
    } finally {
      withoutOverlay(root);
      ungit();
      restore();
    }
  });

  it("writes a pin the loader accepts and the dispatch honours over its own default", () => {
    // End to end, because every half of this has been wrong on its own: the
    // verb writes it, the SCHEMA has to accept it (roles refuse an unknown
    // key, so a pin the schema did not declare would be written and then
    // rejected on the next load), and the ladder has to prefer it over the
    // exclusion it would otherwise apply.
    const restore = withEnv({ DABBLER_TRANSPORT: "copilot-cli" });
    const root = tempDir("configuration-");
    const ungit = inRepository(root);
    try {
      setSeatIdentity(SEAT);
      const models = [
        catalogModelRow("gpt-5.6-terra", "openai"),
        catalogModelRow("claude-opus-5", "anthropic"),
      ];
      writeBlock(TRANSPORT_SEAT, {
        refreshed_at: "2026-09-11T00:00:00Z",
        source: SOURCE_SEAT,
        scope: { seat_host: SEAT.host, seat_login: SEAT.login },
        models,
        retired: [],
      });
      withoutOverlay(root);
      assert.equal(configure({ repoRoot: root, verifyingModel: "claude-opus-5" }).refusal, null);

      const reloaded = loadConfig(undefined, root);
      assert.equal(roleDeclaration(reloaded, ROLE_VERIFIER).pin, "claude-opus-5");
      // Anthropic is excluded by the caller, and the pin outranks it: the
      // round reaches the model the person chose, not the next one down.
      assert.deepEqual(
        seatLadder(reloaded, models, ROLE_VERIFIER, ["anthropic"]).map((entry) => entry.model_id),
        ["claude-opus-5"],
      );
    } finally {
      withoutOverlay(root);
      ungit();
      restore();
    }
  });

  it("checks a model against the transport the same call is setting", () => {
    // Round one nit. Switching machines is one command -- set the transport
    // and name a model on it -- and the check read the transport being LEFT,
    // so it refused a seat model for being absent from the API list.
    const restore = withKeys();
    const root = tempDir("configuration-");
    const ungit = inRepository(root);
    try {
      setSeatIdentity(SEAT);
      writeBlock(TRANSPORT_SEAT, {
        refreshed_at: "2026-09-11T00:00:00Z",
        source: SOURCE_SEAT,
        scope: { seat_host: SEAT.host, seat_login: SEAT.login },
        models: [catalogModelRow("gpt-5.6-terra", "openai")],
        retired: [],
      });
      withoutOverlay(root);
      assert.equal(
        configure({ repoRoot: root, transport: "copilot-cli", verifyingModel: "gpt-5.6-terra" }).refusal,
        null,
      );
    } finally {
      withoutOverlay(root);
      ungit();
      restore();
    }
  });
  it("does not resolve the authoring list through the verifier role", () => {
    // Round one nit, and it was mine: the authoring row borrowed the
    // verifier role to mean "the whole catalog". A role is not a synonym
    // for that -- with a verifier PIN set, the authoring list collapsed to
    // the one pinned model, and the verifier own preferences and provider
    // set reordered a list they have nothing to do with.
    const restore = withEnv({ DABBLER_TRANSPORT: "copilot-cli" });
    const root = tempDir("configuration-");
    const ungit = inRepository(root);
    try {
      setSeatIdentity(SEAT);
      writeBlock(TRANSPORT_SEAT, {
        refreshed_at: "2026-09-11T00:00:00Z",
        source: SOURCE_SEAT,
        scope: { seat_host: SEAT.host, seat_login: SEAT.login },
        models: [
          catalogModelRow("claude-opus-5", "anthropic"),
          catalogModelRow("gpt-5.6-terra", "openai"),
        ],
        retired: [],
      });
      seed(root, {
        "docs/sessions/sessions.json": JSON.stringify({
          schemaVersion: 5,
          sessions: [
            {
              number: 1,
              status: "in-progress",
              orchestrator: { engine: "copilot", provider: "openai", model: "gpt-5.6-terra" },
            },
          ],
        }),
        "local-overrides.yaml": ["roles:", "  verifier:", "    pin: claude-opus-5", ""].join("\n"),
      });
      const authoring = configurationNode(root)["authoring"] as Role;
      // Two models on the seat, and the pin belongs to the other role.
      assert.deepEqual(
        authoring.candidates.map((candidate) => candidate.model).sort(),
        ["claude-opus-5", "gpt-5.6-terra"],
      );
    } finally {
      withoutOverlay(root);
      ungit();
      restore();
    }
  });
  it("offers nothing from a block another seat recorded, however fresh it is", () => {
    // Round 1's blocking finding. The scope check was the refresh's question
    // alone, so a block recorded on another account was still believed until
    // a refresh replaced it -- and a refresh that failed, or had not run yet,
    // left that account's models selectable. Re-login and profile migration
    // are ordinary operations, and this is the wrong-seat authority the whole
    // catalog exists to end.
    const restore = withEnv({ DABBLER_TRANSPORT: "copilot-cli" });
    const root = tempDir("configuration-");
    const ungit = inRepository(root);
    try {
      setSeatIdentity({ host: SEAT.host, login: "somebody-else" });
      writeBlock(TRANSPORT_SEAT, {
        refreshed_at: "2026-09-11T00:00:00Z",
        source: SOURCE_SEAT,
        scope: { seat_host: SEAT.host, seat_login: SEAT.login },
        models: [catalogModelRow("claude-haiku-4.5", "anthropic")],
        retired: [],
      });

      const authoring = configurationNode(root)["authoring"] as Role & {
        enumeration: string;
        unavailable: string | null;
      };
      assert.deepEqual(authoring.candidates, []);
      assert.equal(authoring.chosen, null);
      // And it says what it is rather than showing an empty list: this
      // machine has not read ITS seat, which one free command fixes.
      assert.match(String(authoring.unavailable), /has not read its seat/);
    } finally {
      ungit();
      restore();
    }
  });

  it("withholds a model the catalog says is no longer served, and says since when", () => {
    const restore = withKeys();
    const root = tempDir("configuration-");
    const ungit = inRepository(root);
    try {
      // What this machine read from its own vendors. Scoped to the keys this
      // test sets: a block recorded for another key set is not a reading of
      // this machine and is not believed.
      const scope = { providers: ["anthropic", "google", "openai"] };
      const served = [
        catalogModelRow("claude-sonnet-5", "anthropic"),
        catalogModelRow("gpt-5.6-terra", "openai"),
      ];
      writeBlock(TRANSPORT_API, {
        refreshed_at: "2026-09-09T00:00:00Z",
        source: SOURCE_API,
        scope,
        models: served,
        retired: [],
      });

      // The verifying row, because it is the one that RESOLVES a model:
      // the authoring row reports what the ledger says the engine declared.
      const before = configurationNode(root)["verifying"] as Role;
      const chosen = before.chosen?.model;
      assert.ok(chosen !== undefined, "the catalog's api block resolves a verifying model");
      assert.deepEqual(before.withheld, []);

      // The vendor stopped serving exactly the model the role would have
      // picked. The archive keeps an id and a date and nothing else, which
      // is enough to answer "where did that model go?" and nothing else.
      writeBlock(TRANSPORT_API, {
        refreshed_at: "2026-09-09T00:00:00Z",
        source: SOURCE_API,
        scope,
        models: served.filter((model) => model.id !== chosen),
        retired: [{ id: chosen, retired_at: "2026-09-09T00:00:00Z" }],
      });

      const after = configurationNode(root)["verifying"] as Role;
      assert.ok(!after.candidates.some((candidate) => candidate.model === chosen));
      assert.deepEqual(
        after.withheld.map((candidate) => [candidate.model, candidate.retired?.since]),
        [[chosen, "2026-09-09T00:00:00Z"]],
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
