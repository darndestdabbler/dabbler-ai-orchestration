// The projection the Solution Explorer renders: modules from the manifest,
// in dependency order, with who-uses-whom derived and never declared.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
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
import { chosenEngine, writePreferences } from "../src/preferences.ts";
import {
  ROLE_AUXILIARY_REVIEWER,
  ROLE_PRIMARY_REVIEWER,
  roleDeclaration,
} from "../src/selection.ts";
import { seatLadder } from "../src/route.ts";
import { setSeatIdentity } from "../src/transports/copilot.ts";
import { gitAnswers, seed, tempDir } from "./support/answers.ts";
import { TRANSPORT_COPILOT_CLI, loadConfig, resetProjectRootCache } from "../src/config.ts";
import { SETTING_REVIEWER_TRANSPORT, SETTING_TRANSPORT, writeSettings } from "../src/settings.ts";

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
    assert.equal(path, join(root, ".dabbler", "solution", "solution.json"));
    assert.ok(existsSync(path));
  });

  it("carries no configuration block, on disk or in the document", () => {
    // Configuration was 98.4% of this file and every input it derives from
    // lives at the USER level, where nothing in a workspace can watch it --
    // so a stored copy is stale with no event able to say so. It is asked
    // for at the moment it is rendered instead, and this is what holds the
    // two apart: a reader that found it here would go on reading whatever
    // was written last.
    const root = tempDir("projection-");
    const doc = project(root);
    assert.equal("configuration" in doc, false);
    const written = JSON.parse(readFileSync(writeProjection(root), "utf8")) as Record<string, unknown>;
    assert.equal("configuration" in written, false);
    assert.ok(Array.isArray(written["modules"]));
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
   * **A suite may not read the operator's environment.** Which providers
   * resolve decides what the direct-API path can offer, and a machine with
   * keys in its shell would run these against a reachability the test never
   * chose. Every variable either reading depends on is set here, including
   * the ones set to nothing.
   *
   * The VEHICLE is not among them any more: it is a file, not a variable --
   * see `onSeat`.
   */
  function withEnv(values: Readonly<Record<string, string | null>>): () => void {
    const names = [...KEYS];
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
      DABBLER_ANTHROPIC_API_KEY: "k",
      DABBLER_OPENAI_API_KEY: "k",
      DABBLER_GEMINI_API_KEY: "k",
    });
  }

  /**
   * This machine on its seat: a CHECKOUT setting, never a variable.
   *
   * It was `DABBLER_TRANSPORT=copilot-cli`, which is not how a vehicle is
   * chosen any more -- a layer that outranked every file and was written by
   * nothing is the trap this session deleted. A test that still set it would
   * be arranging a state no operator can now reach.
   */
  function onSeat(root: string): () => void {
    return onVehicle(root, TRANSPORT_COPILOT_CLI, withEnv({}));
  }

  /** The same, for the direct-API path: every provider keyed, vehicle stated. */
  function onApi(root: string): () => void {
    return onVehicle(root, TRANSPORT_API, withKeys());
  }

  /**
   * The vehicle these readings are taken on, written where a vehicle is now
   * decided.
   *
   * Stated rather than left to fall through, because what the distribution
   * ships is `copilot-cli` -- so a test that named none would be asserting
   * against whichever vehicle the bundled config happens to prefer, which is
   * a reading of the package rather than of the test.
   */
  function onVehicle(root: string, transport: string, restore: () => void): () => void {
    writeSettings(root, { [SETTING_TRANSPORT]: transport });
    resetProjectRootCache();
    return restore;
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
    const root = tempDir("configuration-");
    const restore = onSeat(root);
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
      const primaryReviewer = configuration["primaryReviewer"] as Role & { enumeration: string };

      assert.equal(authoring.enumeration, "seat-catalog");
      assert.equal(authoring.chosen?.model, "gemini-3.1-pro-preview");
      // A seat fronts every vendor it lists, so the engine narrows nothing.
      assert.ok(authoring.candidates.length > 1);
      // The Primary Reviewer row draws on the same catalog, less the one model it
      // may not be. It is not resolved with the author's PROVIDER excluded
      // any more: which models of one vendor are far enough apart to review
      // each other is the developer's judgement, not this framework's.
      assert.equal(primaryReviewer.enumeration, "seat-catalog");
      assert.ok(primaryReviewer.chosen !== null);
      assert.ok(
        !primaryReviewer.candidates.some(
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
  /**
   * Back to a machine that has configured nothing.
   *
   * Two files now, because a choice and a machine fact live in different
   * places: the repository's overlay carries the vehicles, and this
   * machine's preferences carry what the operator SELECTED. A test that
   * cleared only the first would leave the previous test's selection
   * narrowing this one's candidate list.
   */
  function withoutOverlay(root: string): void {
    rmSync(join(root, "local-overrides.yaml"), { force: true });
    // The REVIEWER's vehicle only: the machine's is what `onSeat` / `onApi`
    // arranged, and clearing it would drop each reading back onto whatever
    // vehicle the bundled configuration happens to prefer.
    writeSettings(root, { [SETTING_REVIEWER_TRANSPORT]: "" });
    for (const role of [ROLE_PRIMARY_REVIEWER, ROLE_AUXILIARY_REVIEWER]) {
      writePreferences({ role, selected: "" });
    }
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
      const root = tempDir("configuration-");
      const restore = seat ? onSeat(root) : onApi(root);
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

        const primaryReviewer = configurationNode(root)["primaryReviewer"] as Role;
        assert.ok(primaryReviewer.candidates.length > 1, `${transport} offers a choice`);
        for (const candidate of primaryReviewer.candidates) {
          withoutOverlay(root);
          const outcome = configure({ repoRoot: root, reviewerModel: candidate.model });
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
          String(configure({ repoRoot: root, reviewerModel: "no-such-model" }).refusal),
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
    const root = tempDir("configuration-");
    const restore = onSeat(root);
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
        String(configure({ repoRoot: root, reviewerModel: author }).refusal),
        /they are the same model/,
      );
      withoutOverlay(root);
      assert.equal(
        configure({ repoRoot: root, reviewerModel: "gpt-5.6-sol" }).refusal,
        null,
        "a different model on the same provider is the developer's call to make",
      );
    } finally {
      withoutOverlay(root);
      ungit();
      restore();
    }
  });

  it("writes a selection the dispatch resolves to, and never widens past the caller's exclusion", () => {
    // End to end, because every half of this has been wrong on its own: the
    // verb writes it, the preferences file has to hold it across a reload,
    // and the ladder has to narrow to it. It NARROWS: a selection that
    // overruled the caller's exclusion let a model that reviewed round 1
    // adjudicate its own disputed finding.
    const root = tempDir("configuration-");
    const restore = onSeat(root);
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
      assert.equal(configure({ repoRoot: root, reviewerModel: "claude-opus-5" }).refusal, null);

      const reloaded = loadConfig(undefined, root);
      assert.equal(roleDeclaration(reloaded, ROLE_PRIMARY_REVIEWER).selected, "claude-opus-5");
      // Nothing excluded: the round reaches the model the person chose and
      // not the head of the preference order.
      assert.deepEqual(
        seatLadder(reloaded, models, ROLE_PRIMARY_REVIEWER, []).map((entry) => entry.model_id),
        ["claude-opus-5"],
      );
      // Its provider excluded: the selection is UNMET and nothing is
      // substituted, which is the stop the caller names.
      assert.throws(
        () => seatLadder(reloaded, models, ROLE_PRIMARY_REVIEWER, ["anthropic"]),
        /you chose 'claude-opus-5'/,
      );
    } finally {
      withoutOverlay(root);
      ungit();
      restore();
    }
  });

  it("refuses the whole call before writing any of it", () => {
    // Round 1's nit. One call may set several things, and a call that wrote
    // the acceptable half before refusing the rest would leave the
    // operator's own preferences half-changed by a command that reported
    // failure.
    const root = tempDir("configuration-");
    const restore = onSeat(root);
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
      const outcome = configure({
        repoRoot: root,
        reviewerModel: "gpt-5.6-terra",
        engine: "not-an-engine",
      });
      assert.match(String(outcome.refusal), /not an engine/);
      // The reviewer model was acceptable and is NOT written: the refusal
      // came first, so the preferences are exactly as they were.
      assert.equal(roleDeclaration(loadConfig(undefined, root), ROLE_PRIMARY_REVIEWER).selected, null);
      assert.equal(chosenEngine(), null);
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
    const root = tempDir("configuration-");
    const restore = onApi(root);
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
        configure({ repoRoot: root, transport: "copilot-cli", reviewerModel: "gpt-5.6-terra" }).refusal,
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
    // reviewer role to mean "the whole catalog". A role is not a synonym
    // for that -- with a reviewer SELECTION set, the authoring list
    // collapsed to the one selected model, and the reviewer own preference
    // order reordered a list it has nothing to do with.
    const root = tempDir("configuration-");
    const restore = onSeat(root);
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
      });
      // The reviewer's selection, in the file where a person's choices live.
      writePreferences({ role: ROLE_PRIMARY_REVIEWER, selected: "claude-opus-5" });
      const authoring = configurationNode(root)["authoring"] as Role;
      // Two models on the seat, and the selection belongs to the other role.
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
    const root = tempDir("configuration-");
    const restore = onSeat(root);
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
    const root = tempDir("configuration-");
    const restore = onApi(root);
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

      // The Primary Reviewer row, because it is the one that RESOLVES a model:
      // the authoring row reports what the ledger says the engine declared.
      const before = configurationNode(root)["primaryReviewer"] as Role;
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

      const after = configurationNode(root)["primaryReviewer"] as Role;
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

  it("carries a vehicle per role, offers only what this machine can reach, and says why the rest is not there", () => {
    // A vehicle nothing can reach is a way to fail, not a choice: this
    // machine holds provider keys and no seat block, so `api` is offered,
    // `copilot-cli` is named with the free remedy, and `offline` is named
    // with the reason it can never be reached by accident.
    const root = tempDir("configuration-");
    const restore = onApi(root);
    const ungit = inRepository(root);
    try {
      writeBlock(TRANSPORT_API, {
        refreshed_at: "2026-09-11T00:00:00Z",
        source: SOURCE_API,
        scope: { providers: ["anthropic", "google", "openai"] },
        models: [
          catalogModelRow("claude-sonnet-5", "anthropic"),
          catalogModelRow("gpt-5.6-terra", "openai"),
        ],
        retired: [],
      });
      type Vehicle = {
        kind: string;
        options: { id: string; means: string }[];
        withheld: { id: string; note: string | null }[];
        chosen: string | null;
        appliesTo: string;
      };
      const configuration = configurationNode(root);
      const reviewer = (configuration["primaryReviewer"] as Record<string, unknown>)[
        "vehicle"
      ] as Vehicle;
      assert.equal(reviewer.kind, "transport");
      assert.equal(reviewer.chosen, "api");
      assert.deepEqual(reviewer.options.map((option) => option.id), ["api"]);
      // Every absent vehicle is NAMED with why, because "not offered" with
      // no reason reads as a broken pane rather than an honest one.
      assert.deepEqual(
        reviewer.withheld.map((entry) => entry.id).sort(),
        ["copilot-cli", "offline"],
      );
      assert.ok(reviewer.withheld.every((entry) => entry.note !== null));
      // A seat's word for its own price is credits per token. Premium
      // requests are the legacy platform, and the unit travels with the
      // measurement or it does not travel.
      assert.match(
        String(reviewer.withheld.find((entry) => entry.id === "copilot-cli")?.note),
        /free/,
      );
      // The authoring vehicle is a different KIND, and it sets the next
      // session rather than the one on the record.
      const authoring = (configuration["authoring"] as Record<string, unknown>)[
        "vehicle"
      ] as Vehicle;
      assert.equal(authoring.kind, "engine");
      assert.equal(authoring.appliesTo, "next-session");
    } finally {
      ungit();
      restore();
    }
  });

  it("reads the reviewer's list from the reviewer's own vehicle, not the machine's", () => {
    // What this step is for. The machine is on the seat and the reviewer is
    // on the direct-API path, which is the case `config.ts` has described in
    // its own words since the transport reading was written -- reviewer
    // selection may use the other transport when provider independence
    // requires it -- while one global reading scoped every role.
    const root = tempDir("configuration-");
    // The machine on the seat, the reviewer on the direct API. The machine's
    // vehicle is the checkout's settings file -- `transport.profile` in an
    // overlay is refused now, because it was a fifth resolution input -- and
    // the ROLE's is the overlay, which is still where a role vehicle is
    // declared.
    // The machine is on the seat AND every provider key resolves: the
    // reviewer's own vehicle is the direct API, and a reviewer list read
    // from a machine with no keys would be empty for the wrong reason.
    const restore = onVehicle(root, TRANSPORT_COPILOT_CLI, withKeys());
    const ungit = inRepository(root);
    try {
      setSeatIdentity(SEAT);
      writeBlock(TRANSPORT_SEAT, {
        refreshed_at: "2026-09-11T00:00:00Z",
        source: SOURCE_SEAT,
        scope: { seat_host: SEAT.host, seat_login: SEAT.login },
        models: [catalogModelRow("seat-only-model", "openai")],
        retired: [],
      });
      writeBlock(TRANSPORT_API, {
        refreshed_at: "2026-09-11T00:00:00Z",
        source: SOURCE_API,
        scope: { providers: ["anthropic", "google", "openai"] },
        models: [catalogModelRow("claude-sonnet-5", "anthropic")],
        retired: [],
      });
      seed(root, {
        "local-overrides.yaml": [
          "roles:",
          "  reviewer:",
          "    transport: api",
          "",
        ].join("\n"),
      });
      const configuration = configurationNode(root);
      // The machine's vehicle is the seat; the reviewer's is its own.
      assert.equal((configuration["transport"] as { effective: string }).effective, "copilot-cli");
      const reviewer = configuration["primaryReviewer"] as Role & {
        vehicle: { chosen: string; decidedBy: string | null };
      };
      assert.equal(reviewer.vehicle.chosen, "api");
      assert.match(String(reviewer.vehicle.decidedBy), /roles\.reviewer\.transport/);
      // And the LIST follows the vehicle: the reviewer is offered what the
      // vendors listed, never the one model that exists only on the seat.
      assert.deepEqual(
        reviewer.candidates.map((candidate) => candidate.model),
        ["claude-sonnet-5"],
      );
    } finally {
      ungit();
      restore();
    }
  });

  it("offers the Auxiliary Reviewer on its own vehicle, and `configure` selects for it", () => {
    // The third voice has been dispatchable since the roles were named and
    // has had no surface at all: nothing showed what would adjudicate a
    // disputed finding and nothing could choose it. What it may be HERE is
    // the one rule that can be known between sessions -- not the author --
    // and the rest of its definition, every provider that has already
    // reviewed a round, is read from the session's own record at the
    // adjudication, which is why the list is not narrowed by it now.
    const root = tempDir("configuration-");
    const restore = onSeat(root);
    const ungit = inRepository(root);
    const author = "claude-opus-5";
    try {
      setSeatIdentity(SEAT);
      writeBlock(TRANSPORT_SEAT, {
        refreshed_at: "2026-09-11T00:00:00Z",
        source: SOURCE_SEAT,
        scope: { seat_host: SEAT.host, seat_login: SEAT.login },
        models: [
          catalogModelRow(author, "anthropic"),
          catalogModelRow("claude-haiku-4.5", "anthropic"),
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
              orchestrator: { engine: "claude-code", provider: "anthropic", model: author },
            },
          ],
        }),
      });
      withoutOverlay(root);
      const auxiliary = configurationNode(root)["auxiliaryReviewer"] as Role & {
        role: string;
        vehicle: { chosen: string };
        narrowedAtDispatch: string;
      };
      assert.equal(auxiliary.role, "auxiliary-reviewer");
      assert.equal(auxiliary.vehicle.chosen, "copilot-cli");
      // The author, and nothing else. The author's PROVIDER-mate is offered
      // like any other model, because whether two models of one vendor share
      // a blind spot is a judgement this framework has no data to make.
      assert.deepEqual(
        auxiliary.candidates.map((candidate) => candidate.model).sort(),
        ["claude-haiku-4.5", "gpt-5.6-terra"],
      );
      // And the list says what will narrow it later, rather than reading as
      // final while a round is about to exclude half of it.
      assert.match(auxiliary.narrowedAtDispatch, /already reviewed a round/);

      // The verb writes for this role by the same rule and into the same
      // preferences, under the role's own name.
      assert.equal(configure({ repoRoot: root, auxiliaryModel: "gpt-5.6-terra" }).refusal, null);
      const reloaded = loadConfig(undefined, root);
      assert.equal(roleDeclaration(reloaded, ROLE_AUXILIARY_REVIEWER).selected, "gpt-5.6-terra");
      // One role at a time: choosing a third voice is not choosing a first.
      assert.equal(roleDeclaration(reloaded, ROLE_PRIMARY_REVIEWER).selected, null);

      withoutOverlay(root);
      assert.match(
        String(configure({ repoRoot: root, auxiliaryModel: "no-such-model" }).refusal),
        /is not a model the copilot-cli transport lists/,
      );
      withoutOverlay(root);
      assert.match(
        String(configure({ repoRoot: root, auxiliaryModel: author }).refusal),
        /they are the same model/,
      );
    } finally {
      withoutOverlay(root);
      ungit();
      restore();
    }
  });

  it("lets a selection be changed, and refuses an auxiliary that is already the primary", () => {
    // **Two halves of one trap, found by walking the block before shipping
    // it.** `configure` checked each new name against a list the stored
    // selection had already collapsed to one model, so the FIRST choice was
    // accepted and every choice after it was refused -- `gpt-5.6-terra` is
    // not a model the copilot-cli transport lists. It lists: gpt-5.6-sol --
    // including an empty value, which is how a selection became unchangeable
    // from every surface the framework offers. The pane's pick list is built
    // from the same reading with the selection merely reported, and marks the
    // current model `what you chose`, so the pane offered the change and the
    // verb refused it.
    //
    // The second half is the pair that is accepted and cannot work: the
    // Auxiliary Reviewer is the third voice at an impasse, an adjudication
    // excludes every provider that has already reviewed a round, and the
    // primary reviews round 1 -- so an auxiliary pinned to the primary's own
    // model stops every adjudication it is ever asked to settle. "Not the
    // primary" is the one part of the role's definition that IS knowable
    // between sessions, and the primary's pin is in the file being written.
    const root = tempDir("configuration-");
    const restore = onSeat(root);
    const ungit = inRepository(root);
    try {
      setSeatIdentity(SEAT);
      writeBlock(TRANSPORT_SEAT, {
        refreshed_at: "2026-09-11T00:00:00Z",
        source: SOURCE_SEAT,
        scope: { seat_host: SEAT.host, seat_login: SEAT.login },
        models: [
          catalogModelRow("gpt-5.6-sol", "openai"),
          catalogModelRow("gpt-5.6-terra", "openai"),
          catalogModelRow("claude-haiku-4.5", "anthropic"),
          // Listed by the seat, and placeable by nothing here.
          { ...catalogModelRow("mai-code-1.1-flash", "openai"), provider: null },
        ],
        retired: [],
      });
      withoutOverlay(root);

      assert.equal(configure({ repoRoot: root, reviewerModel: "gpt-5.6-sol" }).refusal, null);
      // The change the verb exists for. Before this it read `'gpt-5.6-terra'
      // is not a model the copilot-cli transport lists`.
      assert.equal(configure({ repoRoot: root, reviewerModel: "gpt-5.6-terra" }).refusal, null);
      assert.equal(
        roleDeclaration(loadConfig(undefined, root), ROLE_PRIMARY_REVIEWER).selected,
        "gpt-5.6-terra",
      );

      // And the pair that would stop every adjudication is refused where the
      // operator is choosing, not at a round they will never reach.
      const same = String(configure({ repoRoot: root, auxiliaryModel: "gpt-5.6-terra" }).refusal);
      assert.match(same, /already the Primary Reviewer/);
      assert.match(same, /THIRD voice/);
      // A different model for the third voice is exactly what the role wants.
      assert.equal(configure({ repoRoot: root, auxiliaryModel: "claude-haiku-4.5" }).refusal, null);

      // A model the transport LISTS and no role may draw on is a third
      // answer, and it used to be told as the second: an operator was
      // informed that their seat does not list `mai-code-1.1-flash` while
      // their seat was listing it. Five of this machine's twenty-six seat
      // models are in that state -- every one whose vendor the name
      // heuristic cannot place -- and the reason is the framework's, not the
      // seat's, so the refusal says which.
      const unplaceable = String(
        configure({ repoRoot: root, reviewerModel: "mai-code-1.1-flash" }).refusal,
      );
      assert.match(unplaceable, /is listed by the copilot-cli transport/);
      assert.match(unplaceable, /a limit of this framework and not of your seat/);
    } finally {
      withoutOverlay(root);
      ungit();
      restore();
    }
  });

  it("refuses a vehicle this machine cannot reach, naming the layer and the way out", () => {
    // Before anything is billed, and at the moment the choice is made rather
    // than at the round that spends it. Falling to another vehicle would
    // change which account pays and make every later account of what ran
    // untrue -- which is the shadowing `DABBLER_TRANSPORT` was deleted for.
    const root = tempDir("configuration-");
    const restore = withEnv({});
    const ungit = inRepository(root);
    try {
      // A machine with no seat at all, said rather than assumed: the catalog
      // is shared across this file, so a seat another test wrote a block for
      // would make this one pass for the wrong reason.
      setSeatIdentity(null);
      // No provider key resolves and the seat has never answered, so neither
      // vehicle is reachable. The refusal has to say WHICH is wrong and what
      // reaching it would take.
      const outcome = configure({ repoRoot: root, transport: "copilot-cli" });
      assert.notEqual(outcome.refusal, null);
      assert.match(String(outcome.refusal), /copilot-cli/);
      assert.match(String(outcome.refusal), /--transport/);
      assert.deepEqual(outcome.changed, []);
    } finally {
      withoutOverlay(root);
      ungit();
      restore();
    }
  });

  it("narrows the authoring list by the engine a preference names, before any session has run", () => {
    // The authoring filter read the engine from the LEDGER alone, so a
    // repository on its first day named none and the list was not filtered at
    // all: every model the transport lists was offered as one Claude Code
    // could author with, while the Vehicle leaf directly above it read
    // `claude-code` from the same preferences this ignored. Two leaves of one
    // node, read from two places, disagreeing on exactly the machine the
    // first-run sessions were about.
    const root = tempDir("configuration-");
    const restore = onSeat(root);
    const ungit = inRepository(root);
    try {
      setSeatIdentity(SEAT);
      writeBlock(TRANSPORT_SEAT, {
        refreshed_at: "2026-09-11T00:00:00Z",
        source: SOURCE_SEAT,
        scope: { seat_host: SEAT.host, seat_login: SEAT.login },
        models: [
          catalogModelRow("claude-haiku-4.5", "anthropic"),
          catalogModelRow("claude-opus-5", "anthropic"),
          catalogModelRow("gpt-5.6-sol", "openai"),
          catalogModelRow("gemini-3.1-pro-preview", "google"),
        ],
        retired: [],
      });
      // No ledger at all: nothing has been started in this repository.
      writePreferences({ engine: "claude-code" });
      withoutOverlay(root);

      const node = configurationNode(root);
      const authoring = node["authoring"] as Role & { engine: string | null };
      assert.equal(authoring.engine, "claude-code");
      assert.deepEqual(
        authoring.candidates.map((candidate) => candidate.model).sort(),
        ["claude-haiku-4.5", "claude-opus-5"],
      );

      // And what the label the deleted rules were replaced BY is derived
      // from is on the row. Claude Code's `session start` takes no `--model`,
      // so there is no authoring model at all -- which is why the author's
      // PROVIDER is stated here rather than computed per candidate from a
      // model that does not exist. A reader compares it with each option's
      // own `provider`; the projection carries neither the comparison nor a
      // per-candidate copy of this string.
      assert.equal((authoring as unknown as { provider: string | null }).provider, "anthropic");
      const primary = node["primaryReviewer"] as {
        candidates: { model: string; provider: string }[];
      };
      const providers = new Map(
        primary.candidates.map((candidate) => [candidate.model, candidate.provider]),
      );
      assert.equal(providers.get("claude-opus-5"), "anthropic");
      assert.equal(providers.get("gpt-5.6-sol"), "openai");
    } finally {
      // The engine is a preference and `withoutOverlay` clears selections
      // only, so it is cleared here rather than left to narrow a later run.
      writePreferences({ engine: "" });
      withoutOverlay(root);
      ungit();
      restore();
    }
  });
});
