// The Configuration section's rows: who authors, who reviews, the vehicle
// each is reached through, each model, the Mechanic and the keys, each with
// the layer that decided it.
//
// What is asserted is the rows an interface is handed, from a configuration
// reading the router made from files.

import assert from "node:assert";
import * as fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import * as path from "node:path";
import { afterEach, beforeEach, suite, test } from "node:test";

import { currentCatalogPath } from "../src/catalog.ts";
import { spawnProgram } from "../src/checks.ts";
import { configurationVerb } from "../src/cli/configuration.ts";
import { parseConfigureArgs, type ConfigureOptions } from "../src/cli/configure.ts";
import { viewVerb } from "../src/cli/view.ts";
import type {
  ConfigurationView,
  ConfigurationViewAction,
  ConfigurationViewRow,
} from "../src/generated/configuration-view.ts";
import { loadSchemaFile, schemaFailure } from "../src/schema/validate.ts";
import { resetProjectRootCache } from "../src/config.ts";
import { configurationNode, tryWriteProjection } from "../src/projection.ts";
import {
  configurationChildren,
  configurationDescriptor,
  configurationView,
  readConfiguration,
  settableRows,
  whoseChoice,
  type ConfigurationNode,
  type ConfigurationRole,
  type ConfigurationVehicle,
  type DecidedLayer,
  type ProjectionConfiguration,
} from "../src/views/configuration.ts";
import { cleanRepoAnswers, seed, tempDir } from "./support/answers.ts";
import "./support/repo.ts";

const ROOT: ConfigurationNode = { kind: "configuration" };

suite("configuration view: what a session is run with", () => {
  /** The reading, made unwritable: a renderer may read it and nothing else. */
  function deepFreeze<T>(value: T): T {
    if (value !== null && typeof value === "object") {
      for (const nested of Object.values(value)) deepFreeze(nested);
      Object.freeze(value);
    }
    return value;
  }

  /** A configuration reading as the router made it from files. */
  function configured(over: Partial<ProjectionConfiguration> = {}): ProjectionConfiguration {
    return {
      engines: {
        chosen: "claude-code",
        reason: "`claude` is the only engine CLI on PATH, so it is the engine the next session is offered.",
        installed: [
          { engine: "claude-code", program: "claude", path: "C:/bin/claude.cmd" },
          { engine: "copilot", program: "copilot", path: null },
        ],
      },
      transport: {
        effective: "api",
        decidedBy: "DABBLER_TRANSPORT env var",
        layers: [
          { source: "DABBLER_TRANSPORT env var", value: "api" },
          { source: "transport.profile", value: "copilot-cli" },
        ],
      },
      authoring: {
        role: "authoring",
        // The author's provider, stated once: every "same provider" /
        // "different provider" word below is derived from it.
        provider: "anthropic",
        vehicle: {
          kind: "engine",
          options: [{ id: "claude-code", means: "claude" }],
          withheld: [],
          chosen: "claude-code",
          decidedBy: "installed on PATH",
          appliesTo: "next-session",
        },
        chosen: { model: "claude-opus-5", provider: "anthropic" },
        candidates: [{ model: "claude-opus-5", provider: "anthropic" }],
        excludes: [],
        fellThrough: false,
      },
      primaryReviewer: {
        role: "reviewer",
        selected: "gpt-5.6-terra",
        vehicle: {
          kind: "transport",
          options: [{ id: "api", means: "the provider's own endpoint, billed in tokens" }],
          withheld: [
            {
              id: "copilot-cli",
              means: "a Copilot seat, billed in AI credits per token",
              note: "this machine's seat has not answered yet",
            },
          ],
          chosen: "api",
          decidedBy: "roles.reviewer.transport",
          appliesTo: "next-session",
        },
        chosen: { model: "gpt-5.6-terra", provider: "openai", priceCategory: "high" },
        candidates: [{ model: "gpt-5.6-terra", provider: "openai", priceCategory: "high" }],
        excludes: [],
        fellThrough: false,
      },
      auxiliaryReviewer: {
        role: "auxiliary-reviewer",
        chosen: { model: "gemini-3.1-pro-preview", provider: "google" },
        candidates: [{ model: "gemini-3.1-pro-preview", provider: "google" }],
        excludes: [],
        fellThrough: false,
        narrowedAtDispatch:
          "At an adjudication, every provider that has already reviewed a round is excluded as well.",
      },
      // One row, because there is one catalog.
      records: [
        {
          record: "ai-model-catalog",
          path: "C:/Users/dev/AppData/Local/dabbler/ai-model-catalog.json",
          present: true,
          datedAt: "2026-09-01T10:00:00Z",
          ageHours: 30,
          thresholdHours: 24,
          command: "dabbler discovery refresh",
          cost: "Nothing.",
          stale: true,
          notes: [],
        },
      ],
      ...over,
    };
  }

  test("the Mechanic Model reads as the Authoring Model's until one is chosen", () => {
    const row = (context = {}) =>
      configurationDescriptor({ kind: "configRole", role: "mechanic" }, configured(), context);
    assert.strictEqual(row().description, "same as Authoring Model");
    assert.strictEqual(row({ mechanicModel: "claude-sonnet-5" }).description, "claude-sonnet-5");
    assert.strictEqual(row().command, "dabblerSolution.setMechanicModel");
  });

  test("the Mechanic row says the delegation and what it means", () => {
    const row = configurationDescriptor({ kind: "configMechanic" }, configured(), { mechanic: "attended" });
    assert.strictEqual(row.description, "attended");
    assert.ok(row.tooltip?.includes("you open it"), row.tooltip);
    assert.strictEqual(row.command, "dabblerSolution.setMechanic");
    assert.strictEqual(configurationDescriptor({ kind: "configMechanic" }, configured()).description, "not read");
  });

  test("the document says which transports this machine reaches and has never read", () => {
    assert.deepStrictEqual(configurationView("R", configured({ unread: ["copilot-cli", "api"] })).unread, ["copilot-cli", "api"]);
    assert.deepStrictEqual(configurationView(null, configured()).unread, []);
  });

  test("renders every row from the dated record, and derives nothing while it does", () => {
    // The claim is not only that the rows are right: it is that drawing them
    // costs a disk read the router already did. The network is trapped for
    // the duration, so a row that enumerated a vendor fails here; and the
    // reading is FROZEN, so a row that wanted something it does not carry
    // has nowhere to put it and no way to fetch it. With no configuration
    // there are no rows at all.
    const fetched = (globalThis as { fetch?: unknown }).fetch;
    (globalThis as { fetch?: unknown }).fetch = () => {
      throw new Error("the Configuration section reached for the network");
    };
    try {
      const p = deepFreeze(configured());
      const section = configurationDescriptor(ROOT, p);
      assert.strictEqual(section.expandable, true);
      assert.ok(section.description?.includes("claude-code"));
      // The row names the engine and the reviewing vehicle; the machine's
      // vehicle decides no row beneath it, so it is not named.
      const seatMachine = configured({
        transport: { effective: "copilot-cli", decidedBy: "transport.profile", layers: [] },
      });
      assert.strictEqual(configurationDescriptor(ROOT, seatMachine).description, "claude-code · api");

      // Two participants, and seven leaves under them.
      const parents = configurationChildren(ROOT, p);
      assert.deepStrictEqual(
        parents.map((n) => configurationDescriptor(n, p).label),
        ["Authoring AI", "Reviewing AI"],
      );
      const leaves = parents.flatMap((parent) => configurationChildren(parent, p));
      const rendered = leaves.map((n) => configurationDescriptor(n, p));
      assert.deepStrictEqual(
        rendered.map((row) => row.label),
        ["Vehicle", "Authoring Model", "Mechanic Model", "Mechanic", "Vehicle", "Primary Model", "Auxiliary Model"],
      );
      // Every leaf is a leaf: the section is two deep and no deeper.
      assert.ok(leaves.every((leaf) => configurationChildren(leaf, p).length === 0));

      // The catalog's own age, where it lives, the command that re-reads it
      // and what that costs -- all before anybody asks for a refresh.
      assert.ok(section.tooltip?.includes("30h old"), section.tooltip);
      assert.ok(section.tooltip?.includes("dabbler discovery refresh"));
      assert.ok(section.tooltip?.includes("ai-model-catalog.json"));
      assert.ok(section.tooltip?.includes("Nothing."));
      assert.strictEqual(section.icon?.tone, "attention");

      // The authoring AI: what it runs inside, and the model the engine's own
      // CLI is launched on -- set here, for the NEXT session.
      const [authoringVehicle, authoringModel] = rendered;
      assert.strictEqual(authoringVehicle?.description, "claude-code");
      assert.ok(authoringVehicle?.tooltip?.includes("the engine CLI the work is authored in"));
      assert.ok(authoringModel?.description?.includes("claude-opus-5"));
      assert.ok(authoringModel?.tooltip?.includes("launched on"), authoringModel?.tooltip);
      // Set here and REPORTED while a session is in flight, which the row has
      // to distinguish: only one of the two can be changed.
      assert.strictEqual(authoringModel?.command, "dabblerSolution.setAuthoringModel");
      assert.ok(
        !authoringModel?.tooltip?.includes("`session start`, so the row reports it"),
        authoringModel?.tooltip,
      );
      const authoring = configured().authoring as ConfigurationRole;
      const inFlight = configurationDescriptor(
        { kind: "configRole", role: "authoring" },
        configured({ authoring: { ...authoring, declaredAtStart: true } }),
      );
      assert.ok(inFlight.tooltip?.includes("`session start`, so the row reports it"), inFlight.tooltip);
      // What a list IS is the ROUTER's sentence, rendered and not restated.
      const noted = configurationDescriptor(
        { kind: "configRole", role: "authoring" },
        configured({ authoring: { ...authoring, note: "the router's own sentence about this list" } }),
      );
      assert.ok(noted.tooltip?.includes("the router's own sentence about this list"), noted.tooltip);
      // **"Nobody has chosen" is not "nothing resolves".**
      const unchosen = configurationDescriptor(
        { kind: "configRole", role: "authoring" },
        configured({ authoring: { ...authoring, chosen: null } }),
      );
      assert.strictEqual(unchosen.description, "not chosen");
      const nothing = configurationDescriptor(
        { kind: "configRole", role: "authoring" },
        configured({ authoring: { ...authoring, chosen: null, candidates: [] } }),
      );
      assert.strictEqual(nothing.description, "nothing resolves");
      // A reviewing role has a preference order, so a null chosen there IS
      // nothing resolving and the word does not change.
      const reviewer = configured().primaryReviewer as ConfigurationRole;
      const reviewing = configurationDescriptor(
        { kind: "configRole", role: "primaryReviewer" },
        configured({ primaryReviewer: { ...reviewer, chosen: null } }),
      );
      assert.ok(reviewing.description?.startsWith("nothing resolves"), reviewing.description);

      // A vehicle a layer above is overriding says so.
      const reviewingVehicle = rendered[4];
      assert.ok(reviewingVehicle?.description?.includes("api"));
      assert.ok(reviewingVehicle?.tooltip?.includes("roles.reviewer.transport"));
      assert.ok(reviewingVehicle?.tooltip?.includes("copilot-cli is not offered"), reviewingVehicle?.tooltip);

      // Cross-provider is a LABEL: the row says how this reviewer stands to
      // the author, and the price its own source stated as a price.
      const primaryReviewer = rendered[5];
      assert.ok(primaryReviewer?.description?.includes("gpt-5.6-terra"));
      assert.ok(primaryReviewer?.tooltip?.includes("different provider"));
      assert.ok(primaryReviewer?.tooltip?.includes("PRICE and not a capability"));
      assert.ok(primaryReviewer?.tooltip?.includes("You chose gpt-5.6-terra"));
      assert.ok(primaryReviewer?.tooltip?.includes("nothing is substituted for it"));
      assert.notStrictEqual(primaryReviewer?.icon?.tone, "attention");

      // A chosen reviewer from today's authoring vendor takes the attention
      // tone and says the conflict in the router's words.
      const conflicting = configurationDescriptor(
        { kind: "configRole", role: "primaryReviewer" },
        configured({ primaryReviewer: { ...reviewer, conflict: "not usable while authoring is OpenAI" } }),
      );
      assert.strictEqual(conflicting.icon?.tone, "attention");
      assert.ok(conflicting.tooltip?.includes("not usable while authoring is OpenAI"), conflicting.tooltip);

      // The third voice: what it is for, and what narrows it at the round.
      const auxiliary = rendered[6];
      assert.ok(auxiliary?.description?.includes("gemini-3.1-pro-preview"));
      assert.ok(auxiliary?.tooltip?.includes("disputed"), auxiliary?.tooltip);
      assert.ok(auxiliary?.tooltip?.includes("already reviewed a round"));

      // The other half: a reading that carries nothing produces no rows.
      assert.deepStrictEqual(configurationChildren(ROOT, deepFreeze({})), []);
    } finally {
      (globalThis as { fetch?: unknown }).fetch = fetched;
    }
  });

  test("a row says whose its choice is: this repository's, or the machine's default it falls back to", () => {
    // Two windows on two repositories showed one reviewer, and a value alone
    // cannot say which of the two a person is looking at.
    const reviewer = configured().primaryReviewer as ConfigurationRole;
    const as = (decidedLayer: DecidedLayer) =>
      configurationDescriptor(
        { kind: "configRole", role: "primaryReviewer" },
        configured({ primaryReviewer: { ...reviewer, decidedLayer } }),
      );
    const here = as("checkout");
    const fallback = as("machine");
    assert.ok(here.description?.includes("gpt-5.6-terra") && fallback.description?.includes("gpt-5.6-terra"));
    assert.ok(here.description?.includes("this repository"), here.description);
    assert.ok(fallback.description?.includes("machine default"), fallback.description);
    assert.ok(here.tooltip?.includes("another window has its own"), here.tooltip);
    assert.ok(fallback.tooltip?.includes("names no choice of its own"), fallback.tooltip);
    // A choice the reviewing vehicle does not list says whose it is too.
    const unlisted = configurationDescriptor(
      { kind: "configRole", role: "primaryReviewer" },
      configured({
        primaryReviewer: { ...reviewer, selected: "gpt-5.6-terra", notListedBy: "copilot-cli", decidedLayer: "machine" },
      }),
    );
    assert.ok(unlisted.description?.includes("machine default"), unlisted.description);
    assert.ok(unlisted.description?.includes("not listed by copilot-cli"), unlisted.description);
    assert.ok(unlisted.tooltip?.includes("names no choice of its own"), unlisted.tooltip);
    // Nobody's choice says nothing of whose it is.
    assert.ok(!/this repository|machine default/.test(as("default").description ?? ""));

    // A vehicle row reads the same word the same way.
    const vehicle = configurationDescriptor(
      { kind: "configVehicle", who: "reviewing" },
      configured({
        primaryReviewer: {
          ...reviewer,
          vehicle: { kind: "transport", options: [], chosen: "api", decidedLayer: "checkout", layers: [] },
        },
      }),
    );
    assert.ok(vehicle.description?.includes("this repository"), vehicle.description);
    assert.strictEqual(whoseChoice("shipped"), "shipped default");
  });

  test("says a configuration it could not read is unreadable, rather than showing an empty one", () => {
    const p: ProjectionConfiguration = { unavailable: "local-overrides.yaml: bad key" };
    assert.deepStrictEqual(configurationChildren(ROOT, p), []);
    const row = configurationDescriptor(ROOT, p);
    assert.strictEqual(row.expandable, false);
    assert.strictEqual(row.tooltip, "local-overrides.yaml: bad key");
  });

  test("the authoring Vehicle says none is chosen when engines are installed, that no engine CLI is on PATH only when none is, and names the npm shim", () => {
    // claude and copilot both on PATH, the router declining to default
    // between them: two facts, two readings.
    const base = configured().authoring as ConfigurationRole;
    const unchosen = (installed: { engine: string; program: string; path: string | null; shim?: boolean }[]) =>
      deepFreeze(
        configured({
          authoring: { ...base, vehicle: { ...(base.vehicle as ConfigurationVehicle), chosen: null } },
          engines: { chosen: null, reason: "which one runs a session is a choice", installed },
        }),
      );
    const node = { kind: "configVehicle" as const, who: "authoring" as const };
    const two = configurationDescriptor(
      node,
      unchosen([
        { engine: "claude-code", program: "claude", path: "C:/bin/claude.cmd" },
        { engine: "copilot", program: "copilot", path: "C:/bin/copilot.cmd" },
      ]),
    );
    assert.ok(two.description?.includes("none chosen"), two.description);
    assert.ok(!two.description?.includes("no engine CLI"), two.description);
    assert.ok(!two.description?.includes("shim"), two.description);
    const none = configurationDescriptor(
      node,
      unchosen([
        { engine: "claude-code", program: "claude", path: null },
        { engine: "copilot", program: "copilot", path: null },
      ]),
    );
    assert.strictEqual(none.description, "no engine CLI on PATH");
    // The npm shim: said on the row, and the remedy in the tooltip.
    const shimmed = configurationDescriptor(
      node,
      unchosen([
        { engine: "claude-code", program: "claude", path: null },
        { engine: "copilot", program: "copilot", path: "C:/npm/copilot.cmd", shim: true },
      ]),
    );
    assert.ok(shimmed.description?.includes("npm shim"), shimmed.description);
    assert.ok(shimmed.tooltip?.includes("winget install GitHub.Copilot"), shimmed.tooltip);
    assert.ok(shimmed.tooltip?.includes("npm uninstall -g @github/copilot"), shimmed.tooltip);
  });

  test("the reviewing Vehicle row sets the reviewing vehicle, names the layers it overrides, and marks none of them", () => {
    // A repository that names its reviewing vehicle, over a machine default
    // that agrees and the shipped default beneath both.
    const base = configured().primaryReviewer as ConfigurationRole;
    const row = configurationDescriptor(
      { kind: "configVehicle", who: "reviewing" },
      deepFreeze(
        configured({
          primaryReviewer: {
            ...base,
            vehicle: {
              ...(base.vehicle as ConfigurationVehicle),
              chosen: "api",
              decidedBy: "dabbler.reviewerTransport",
              decidedLayer: "checkout",
              layers: [
                { source: "dabbler.reviewerTransport", value: "api" },
                { source: "preferences.json reviewerTransport", value: "api" },
                { source: ".vscode\\settings.json", value: "copilot-cli" },
                { source: "transport.profile", value: "copilot-cli" },
              ],
            },
          },
        }),
      ),
    );
    assert.strictEqual(row.command, "dabblerSolution.setReviewerTransport");
    assert.strictEqual(row.description, "api · this repository");
    assert.strictEqual(row.icon?.tone, undefined);
    assert.ok(row.tooltip?.includes("This is THIS REPOSITORY's choice"), row.tooltip);
    for (const line of [
      "preferences.json reviewerTransport says 'api' and is overridden by dabbler.reviewerTransport",
      "transport.profile says 'copilot-cli' and is overridden by dabbler.reviewerTransport",
    ]) {
      assert.ok(row.tooltip?.includes(line), row.tooltip);
    }
  });
});

suite("configuration view: what a configuration reading costs", () => {
  // The whole path, from the records on disk to the row on the screen. A
  // reading that enumerated a vendor would charge a window for being open,
  // once per repaint.
  const ROUND = {
    round: 1,
    verdict: "VERIFIED",
    blocking: false,
    findings: [],
    completion_tree: "0".repeat(40),
    recorded_at: "2026-09-01T10:00:00.000000-04:00",
    verifier_model: "reviewer",
    verifier_provider: "openai",
  };

  /** One model, as a vendor's own free enumeration records it. */
  const catalogRow = (id: string, provider: string): Record<string, unknown> => ({
    id,
    provider,
    provider_source: "vendor-endpoint",
    display_name: id,
    enabled: true,
    price_category: null,
    cost: null,
    listed_at: "2026-08-01T09:00:00Z",
  });

  const CONFIG = [
    "providers:",
    "  anthropic:",
    "    api_key_env: TEST_ANTHROPIC_KEY",
    "    rate_limit: { requests_per_minute: 10, tokens_per_minute: 100 }",
    "    timeout_seconds: 30",
    "    retry: { max_retries: 1, backoff_base_seconds: 0 }",
    "  openai:",
    "    api_key_env: TEST_OPENAI_KEY",
    "    rate_limit: { requests_per_minute: 10, tokens_per_minute: 100 }",
    "    timeout_seconds: 30",
    "    retry: { max_retries: 1, backoff_base_seconds: 0 }",
    "roles:",
    "  reviewer:",
    "    prefer: [o-reviewer]",
    "escalation:",
    "  enabled: false",
    "  max_escalations: 0",
    "  triggers: { empty_response: true, max_tokens_hit: true, min_output_tokens: 30, refusal_detection: true }",
    "",
  ].join("\n");

  let root = "";
  let catalogBefore: string | null = null;
  let ungit: () => void = () => undefined;
  const saved = new Map<string, string | undefined>();

  beforeEach(() => {
    root = tempDir("configuration-view-");
    // The environment is set rather than read: a suite that took the
    // operator's own would assert a different thing on their machine.
    for (const name of ["AI_ROUTER_CONFIG", "TEST_ANTHROPIC_KEY", "TEST_OPENAI_KEY"]) {
      saved.set(name, process.env[name]);
    }
    seed(root, {
      "router-config.yaml": CONFIG,
      // The engine and the model it declared when the session was
      // registered. The authoring row REPORTS this rather than resolving a
      // role, because this is the model that authors.
      "docs/sessions/sessions.json": JSON.stringify({
        schemaVersion: 5,
        sessions: [
          {
            number: 1,
            status: "in-progress",
            orchestrator: { engine: "copilot", provider: "anthropic", model: "a-author" },
          },
        ],
      }),
      // Two rounds, the two KINDS of evidence: a direct-API round and a seat
      // round.
      ".dabbler/runs/s1/rounds.jsonl":
        [
          JSON.stringify({ ...ROUND, transport: "api", requested_model: "a-author", served_model: "a-author" }),
          JSON.stringify({
            ...ROUND,
            round: 2,
            previous_tree: "0".repeat(40),
            transport: "copilot-cli",
            requested_model: "o-reviewer",
            served_model: "o-reviewer",
          }),
        ].join("\n") + "\n",
    });
    process.env["AI_ROUTER_CONFIG"] = path.join(root, "router-config.yaml");
    process.env["TEST_ANTHROPIC_KEY"] = "k";
    process.env["TEST_OPENAI_KEY"] = "k";
    ungit = cleanRepoAnswers(root);
    resetProjectRootCache();
    // What this machine's vendors listed, with a date NO refresh could
    // produce: a refresh stamps now, so the date tells a record that was
    // READ from one that was fetched. The suite's catalog is a temp file.
    const catalog = currentCatalogPath();
    catalogBefore = fs.existsSync(catalog) ? fs.readFileSync(catalog, "utf8") : null;
    fs.mkdirSync(path.dirname(catalog), { recursive: true });
    fs.writeFileSync(
      catalog,
      JSON.stringify({
        schema_version: 1,
        written_by: "test",
        written_at: "2026-08-01T09:00:00Z",
        transports: {
          api: {
            refreshed_at: "2026-08-01T09:00:00Z",
            source: "vendor-enumeration",
            // The set of providers whose keys are present.
            scope: { providers: ["anthropic", "openai"] },
            models: [
              catalogRow("a-author", "anthropic"),
              catalogRow("a-second", "anthropic"),
              catalogRow("o-reviewer", "openai"),
            ],
            retired: [],
          },
        },
      }),
      "utf8",
    );
  });

  afterEach(() => {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    const catalog = currentCatalogPath();
    if (catalogBefore === null) fs.rmSync(catalog, { force: true });
    else fs.writeFileSync(catalog, catalogBefore, "utf8");
    ungit();
    resetProjectRootCache();
  });

  /** What a verb printed, and the code it exited with. */
  async function printed(
    argv: string[],
    verb: (argv: string[]) => Promise<number> = viewVerb,
  ): Promise<{ code: number; out: string }> {
    const out: string[] = [];
    const write = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: unknown) => {
      out.push(String(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      return { code: await verb(argv), out: out.join("") };
    } finally {
      process.stdout.write = write;
    }
  }

  test("every choice on a row names a command the configure parser accepts, and options --json prints the same lists", async () => {
    // A choice is only as good as the command it names: one `configure`
    // would refuse to read is a pick that does nothing. Held for this
    // repository and for the machine alone, where every write is `--mine`.
    for (const scope of [root, null]) {
      const view = configurationView(scope, readConfiguration(scope));
      const actions: ConfigurationViewAction[] = [];
      const walk = (row: ConfigurationViewRow): void => {
        actions.push(...row.actions);
        row.children.forEach(walk);
      };
      walk(view.configuration);
      const picks = actions.flatMap((offered) => (offered.pick === null ? [] : [offered.pick]));
      assert.ok(picks.length > 0 && picks.some((pick) => pick.choices.length > 0), "no row carried a choice");
      const commands = [
        ...picks.flatMap((pick) =>
          pick.choices.flatMap((choice) => [
            { argv: choice.argv, value: choice.value, mine: scope === null },
            { argv: choice.mineArgv, value: choice.value, mine: true },
          ]),
        ),
        // Keep as Machine Default names its command outright.
        ...actions
          .filter((offered) => offered.argv !== null && offered.argv[1] === "configure")
          .map((offered) => ({ argv: offered.argv as string[], value: offered.argv?.at(-2) as string, mine: true })),
      ];
      for (const { argv, value, mine } of commands) {
        assert.strictEqual(argv[0], "dabbler", argv.join(" "));
        assert.strictEqual(argv[1], "configure", argv.join(" "));
        const options = parseConfigureArgs(argv.slice(2));
        assert.notStrictEqual(typeof options, "string", `${argv.join(" ")}: ${String(options)}`);
        const parsed = options as ConfigureOptions;
        assert.strictEqual(parsed.repoRoot, scope, argv.join(" "));
        assert.strictEqual(parsed.mine === true, mine, argv.join(" "));
        assert.ok(Object.values(parsed).includes(value), argv.join(" "));
      }

      // And `configuration options --json` prints those lists, as the view carries them.
      if (scope === null) continue;
      const { code, out } = await printed(["options", "--json", "--repo-root", scope], configurationVerb);
      assert.strictEqual(code, 0);
      assert.deepStrictEqual(JSON.parse(out), { schemaVersion: 1, rows: settableRows(view) });
    }
  });

  test("reaches no vendor and no CLI, and renders the dated record it read", async () => {
    // The router's own reading runs here, over records on disk, with the
    // network trapped: if assembling the configuration enumerated a vendor
    // this throws, and if it probed the seat the dates below would be
    // today's rather than the fixture's.
    const fetched = (globalThis as { fetch?: unknown }).fetch;
    const reached = (what: string) => () => {
      throw new Error(`the reading reached ${what} while it was being assembled`);
    };
    (globalThis as { fetch?: unknown }).fetch = reached("a vendor");
    // The other way a probe happens is a CLI, so every process creation is
    // trapped too; git is answered by the suite's stand-in and spawns
    // nothing. The trap is PROVEN ARMED before it is relied on, by calling
    // the router's own spawn and requiring the trap's error back.
    const childProcess = process.getBuiltinModule("node:child_process") as unknown as Record<string, unknown>;
    const spawners = ["spawn", "spawnSync", "execFile", "execFileSync", "exec", "execSync"];
    const original = spawners.map((name) => [name, childProcess[name]] as const);
    for (const [name] of original) {
      childProcess[name] = (...args: unknown[]) => reached(`a CLI (${String(args[0] ?? "")})`)();
    }
    syncBuiltinESMExports();
    let configuration: ProjectionConfiguration;
    try {
      assert.throws(
        () => spawnProgram(["definitely-not-a-real-program"], { stdio: "ignore" }),
        /reached a CLI/,
        "the process trap did not install, so this test proves nothing about spawning",
      );
      tryWriteProjection(root);
      configuration = configurationNode(root) as ProjectionConfiguration;
    } finally {
      for (const [name, value] of original) childProcess[name] = value;
      syncBuiltinESMExports();
      (globalThis as { fetch?: unknown }).fetch = fetched;
    }

    // One record, carrying the date the fixture wrote rather than the one a
    // refresh would have stamped.
    const records = configuration.records ?? [];
    assert.deepStrictEqual(
      records.map((row) => row.record),
      ["ai-model-catalog"],
    );
    assert.strictEqual(records[0]?.datedAt, "2026-08-01T09:00:00Z");

    // And the rows render off that record: each names the model it read, and
    // the reviewer is labelled against the AUTHOR's provider.
    const authoring = configurationDescriptor({ kind: "configRole", role: "authoring" }, configuration);
    const primaryReviewer = configurationDescriptor({ kind: "configRole", role: "primaryReviewer" }, configuration);
    assert.ok(authoring.description?.includes("a-author"), authoring.description);
    assert.ok(primaryReviewer.description?.includes("o-reviewer"), primaryReviewer.description);
    assert.ok(primaryReviewer.tooltip?.includes("different provider"));

    // And what `dabbler view configuration` prints for the same root is the
    // schema's shape.
    const { code, out } = await printed(["configuration", "--repo-root", root]);
    assert.strictEqual(code, 0);
    const view = JSON.parse(out) as ConfigurationView;
    assert.strictEqual(schemaFailure(view, loadSchemaFile("configuration-view.schema.json"), "the view"), null);
  });
});

suite("configuration view: which key a provider is reached with", () => {
  /** A reading carrying the three states a credential row can be in. */
  function withCredentials(): ProjectionConfiguration {
    return {
      credentials: [
        {
          provider: "anthropic",
          displayLabel: "Anthropic",
          variable: "DABBLER_ANTHROPIC_API_KEY",
          fromEnvironment: true,
          reference: null,
          held: false,
          stop: null,
          store: "dabbler auth set anthropic",
          choose: "dabbler configure --credential anthropic=<name>",
        },
        {
          provider: "google",
          displayLabel: "Google",
          variable: "DABBLER_GEMINI_API_KEY",
          fromEnvironment: false,
          reference: null,
          held: false,
          stop: null,
          store: "dabbler auth set google",
          choose: "dabbler configure --credential google=<name>",
        },
        {
          provider: "openai",
          displayLabel: "OpenAI",
          variable: "DABBLER_OPENAI_API_KEY",
          fromEnvironment: false,
          reference: "client-a",
          decidedBy: ".vscode/settings.json",
          held: false,
          stop: "openai is configured to use the credential 'client-a', and this machine holds no credential of that name.",
          store: "dabbler auth set openai",
          choose: "dabbler configure --credential openai=<name>",
        },
      ],
    };
  }

  test("groups one row per provider under API Keys, saying what is in force and never a value", () => {
    const p = withCredentials();
    // One collapsed node beside the participants, so changing a model does
    // not wade through keys.
    const children = configurationChildren(ROOT, p);
    assert.ok(!children.some((node) => node.kind === "configCredential"));
    const keysNode = children.find((node) => node.kind === "configKeys");
    assert.ok(keysNode);
    const keys = configurationDescriptor(keysNode, p);
    assert.strictEqual(keys.label, "API Keys");
    // Available is supplied by the variable or held on this machine.
    assert.strictEqual(keys.description, "1 of 3 available");
    // A child's stop shows on the collapsed group.
    assert.strictEqual(keys.icon?.tone, "attention");
    const rows = configurationChildren(keysNode, p).map((node) => configurationDescriptor(node, p));
    assert.deepStrictEqual(
      rows.map((row) => row.label),
      ["Anthropic key", "Google key", "OpenAI key"],
    );
    // Where nothing names a credential the variable supplies the key.
    assert.ok(rows[0]?.description?.includes("DABBLER_ANTHROPIC_API_KEY"));
    assert.strictEqual(rows[0]?.icon?.tone, undefined);
    assert.strictEqual(rows[1]?.description, "nothing resolves");
    // A reference this machine cannot answer is the one row that asks for
    // attention, and it says which credential.
    assert.ok(rows[2]?.description?.includes("client-a"));
    assert.ok(rows[2]?.description?.includes("not on this machine"));
    assert.strictEqual(rows[2]?.icon?.tone, "attention");
    // And every one of them clicks through to the terminal that asks.
    for (const row of rows) {
      assert.strictEqual(row.command, "dabblerSolution.storeCredential");
      assert.ok(row.tooltip?.includes("never typed into this window"));
    }
  });
});
