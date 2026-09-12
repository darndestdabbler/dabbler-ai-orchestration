// The configuration layer: which files the three layers come from, what the
// merge of them is allowed to say, and the two small rules that ride beside
// it -- the no-router mode and the secret lookup.
//
// Where the layers LIVE is a decision over facts (`chooseConfigSources`), and
// what git contributes is one thin reader the loader composes; everything the
// loader then decides is reachable from named files (`loadConfigFrom`), so
// only one test here needs a project root at all, and none needs a checkout.
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { stringify } from "yaml";

import {
  CRITIQUE_ENFORCE_SET,
  DEFAULT_VERIFICATION_ROUNDS,
  LOCAL_OVERRIDES_FILENAME,
  PROJECT_CONFIG_FILENAME,
  TRANSPORT_ENV_VAR,
  chooseConfigSources,
  loadConfig,
  loadConfigFrom,
  resetProjectRootCache,
  resolveGenerationParams,
  explainReviewingTransport,
  resolveTransport,
  runRoundCap,
  splitSections,
  truthy,
  verificationRoundCap,
  type ConfigSources,
  type RouterConfig,
} from "../src/config.ts";
import { ASSET_DIR } from "../src/paths.ts";
import {
  ENV_VAR_NAME as NO_ROUTER_ENV_VAR,
  isNoRouterMode,
  resetForTests,
  resolveNoRouterMode,
} from "../src/runtimeMode.ts";
import { registerBackend, resolveSecret } from "../src/secretResolver.ts";
import { gitAnswers, makeConfig, seed, tempDir } from "./support/answers.ts";
import { writePreferences } from "../src/preferences.ts";
import {
  SETTINGS_RELPATH,
  SETTING_REVIEWER_TRANSPORT,
  SETTING_TRANSPORT,
  writeSettings,
} from "../src/settings.ts";

/** The published default: package data, and the base every layer merges over. */
const BUNDLED = join(ASSET_DIR, "router-config.yaml");

interface Layers {
  readonly base?: unknown;
  readonly project?: unknown;
  readonly overrides?: unknown;
}

/** Write the named layers into one directory and address them. */
function sources(layers: Layers = {}): ConfigSources {
  const directory = tempDir("config-");
  const write = (name: string, body: unknown): string => {
    seed(directory, { [name]: stringify(body) });
    return join(directory, name);
  };
  return {
    base:
      layers.base === undefined ? BUNDLED : write("router-config.yaml", layers.base),
    project:
      layers.project === undefined
        ? null
        : write(PROJECT_CONFIG_FILENAME, layers.project),
    overrides:
      layers.overrides === undefined
        ? null
        : write(LOCAL_OVERRIDES_FILENAME, layers.overrides),
  };
}

function block(config: RouterConfig, name: string): Record<string, unknown> {
  return config[name] as Record<string, unknown>;
}

function nested(config: RouterConfig, name: string): Record<string, Record<string, unknown>> {
  return config[name] as Record<string, Record<string, unknown>>;
}

function refusal(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  assert.fail("expected the config to be refused");
}

/**
 * The retired transport variable, out of the way for a whole describe.
 *
 * It decides nothing now, and that is what one test below proves -- so it
 * has to be able to SET it, and every other test in the describe has to
 * start from a machine that is not carrying the operator's own. A suite that
 * read the shell passed everywhere until this machine persisted
 * `DABBLER_TRANSPORT=api`, at which point the complete run failed on the one
 * host that runs it while every targeted check stayed green. The run of
 * record inherits the shell by design, which is why a suite may not read one.
 */
function withoutTransportEnv(): void {
  const saved = process.env[TRANSPORT_ENV_VAR];
  beforeEach(() => {
    delete process.env[TRANSPORT_ENV_VAR];
  });
  afterEach(() => {
    if (saved === undefined) delete process.env[TRANSPORT_ENV_VAR];
    else process.env[TRANSPORT_ENV_VAR] = saved;
  });
}

describe("where the three layers come from", () => {
  withoutTransportEnv();
  const NONE: ReadonlySet<string> = new Set();
  const BOTH: ReadonlySet<string> = new Set([
    PROJECT_CONFIG_FILENAME,
    LOCAL_OVERRIDES_FILENAME,
  ]);

  it("takes the bundled default and both layers when nothing is named", () => {
    const chosen = chooseConfigSources(undefined, undefined, "/repo", BOTH);
    assert.equal(chosen.base, BUNDLED);
    assert.equal(chosen.project, join("/repo", PROJECT_CONFIG_FILENAME));
    assert.equal(chosen.overrides, join("/repo", LOCAL_OVERRIDES_FILENAME));
  });

  it("takes no layer for a config the caller named", () => {
    // A caller that names a file means that file: layering it would merge a
    // machine's overlay into a config nobody asked to be overlaid.
    const chosen = chooseConfigSources("/named.yaml", undefined, "/repo", BOTH);
    assert.deepEqual(chosen, { base: "/named.yaml", project: null, overrides: null });
  });

  it("takes no layer for a config the env var names", () => {
    // AI_ROUTER_CONFIG is not the door a foreign repository declares itself
    // through -- that door is dabbler.yaml, and it opens onto three blocks
    // rather than onto the provider list.
    const chosen = chooseConfigSources(undefined, "/env.yaml", "/repo", BOTH);
    assert.deepEqual(chosen, { base: "/env.yaml", project: null, overrides: null });
  });

  it("names only the layer files the root actually holds", () => {
    const chosen = chooseConfigSources(
      undefined,
      undefined,
      "/repo",
      new Set([LOCAL_OVERRIDES_FILENAME]),
    );
    assert.equal(chosen.project, null);
    assert.equal(chosen.overrides, join("/repo", LOCAL_OVERRIDES_FILENAME));
  });

  it("takes no layer outside a repository", () => {
    const chosen = chooseConfigSources(undefined, undefined, null, BOTH);
    assert.deepEqual(chosen, { base: BUNDLED, project: null, overrides: null });
  });

  it("takes no layer from an empty root", () => {
    assert.equal(chooseConfigSources(undefined, undefined, "/repo", NONE).project, null);
  });

  it("composes the git reader with the decision", () => {
    // The one test that needs a project root: git says where it is, the
    // reader says what is there, and the loader merges what that names.
    const root = tempDir("project-");
    // Not `transport.profile`: that key in an overlay is refused now, and
    // what this test is about is which FILES a root resolves to.
    seed(root, {
      [LOCAL_OVERRIDES_FILENAME]: stringify({ escalation: { max_escalations: 1 } }),
    });
    const restore = gitAnswers([
      [["rev-parse", "--show-toplevel"], { stdout: root.split("\\").join("/") }],
    ]);
    resetProjectRootCache();
    try {
      const config = loadConfig(undefined, root);
      assert.equal(block(config, "escalation")["max_escalations"], 1);
      assert.match(String(config["_local_overrides_path"]), /local-overrides\.yaml$/);
      assert.equal(config["_project_config_path"], null);
    } finally {
      restore();
      resetProjectRootCache();
    }
  });
});

describe("loading a config", () => {
  it("loads the bundled default", () => {
    const config = loadConfigFrom(sources());
    assert.ok(config["provider_defaults"]);
    assert.match(String(config["_config_path"]), /router-config\.yaml$/);
  });

  it("names the file it could not find", () => {
    const missing = join(tempDir("absent-"), "nope.yaml");
    assert.match(refusal(() => loadConfigFrom({ base: missing, project: null, overrides: null })), /nope\.yaml/);
  });

  it("refuses a config with no providers", () => {
    const base = makeConfig();
    delete base["providers"];
    assert.match(refusal(() => loadConfigFrom(sources({ base }))), /schema validation/);
  });

  it("refuses a routable provider that declares no rate limit", () => {
    const base = makeConfig();
    delete (base["providers"] as Record<string, Record<string, unknown>>)["anthropic"]["rate_limit"];
    assert.match(refusal(() => loadConfigFrom(sources({ base }))), /schema validation/);
  });

  // Two accounts of what step (f) does, in one block. The runtime reader
  // refuses it, and so must the schema: a consumer that validates and gets
  // a pass is told the declaration is good when it is the one shape the
  // record cannot describe.
  it("refuses a packaging block that declares both a tag release and a pack/push pair", () => {
    const base = makeConfig();
    base["packaging"] = {
      release: "tag",
      pack: { argv: ["dotnet", "pack", "-o", "{output}"] },
      push: { argv: ["dotnet", "nuget", "push", "{artifact}", "--source", "{feed}"], feed: "https://f/" },
    };
    assert.match(refusal(() => loadConfigFrom(sources({ base }))), /schema validation/);
  });

  it("accepts a packaging block that declares a tag release alone", () => {
    const base = makeConfig();
    base["packaging"] = { release: "tag" };
    const config = loadConfigFrom(sources({ base }));
    assert.deepEqual(config["packaging"], { release: "tag" });
  });

  it("refuses an unknown key in a role", () => {
    // A typo'd role key would silently drop the declaration it meant.
    const base = makeConfig();
    (base["roles"] as Record<string, Record<string, unknown>>)["reviewer"]["require_provider"] = ["openai"];
    assert.match(refusal(() => loadConfigFrom(sources({ base }))), /schema validation/);
  });

  it("accepts a preference that names no model", () => {
    // Ordering only: a stale name costs a slightly older model, never a
    // candidate, so it must not refuse the load.
    const base = makeConfig();
    (base["roles"] as Record<string, Record<string, unknown>>)["reviewer"]["prefer"] = ["retired-last-year"];
    assert.ok(loadConfigFrom(sources({ base }))["roles"]);
  });

  it("refuses seat timeouts that cannot all fire", () => {
    const base = makeConfig();
    (base["transports"] as Record<string, Record<string, unknown>>)["copilot-cli"]["timeouts"] = {
      spawn_seconds: 100,
      first_byte_seconds: 5,
    };
    assert.match(refusal(() => loadConfigFrom(sources({ base }))), /spawn_seconds </);
  });

  it("fills the run-core blocks so every reader sees one shape", () => {
    const config = loadConfigFrom(sources({ base: makeConfig() }));
    assert.equal(block(config, "run_policy")["default"], "fast");
    assert.equal(block(config, "git")["remote"], "origin");
    // Declared as none, never as absent: nothing has to ask whether a
    // repository that said nothing means "none" or means "unknown".
    assert.deepEqual(block(config, "paths")["sensitive_paths"], []);
  });

  it("refuses a run with no dispatch ceiling", () => {
    // No transport reports a dollar figure to cap, so the dispatch count is
    // the only thing bounding framework model calls.
    const base = makeConfig({ run_policy: { budgets: { model_dispatches: null } } });
    assert.match(refusal(() => loadConfigFrom(sources({ base }))), /model_dispatches/);
  });
});

describe("the machine-local overlay", () => {
  withoutTransportEnv();

  it("merges over the base, partially", () => {
    const config = loadConfigFrom(
      sources({ overrides: { escalation: { max_escalations: 1 } } }),
    );
    assert.equal(block(config, "escalation")["max_escalations"], 1);
    assert.ok(config["provider_defaults"]);
    assert.match(String(config["_local_overrides_path"]), /local-overrides\.yaml$/);
  });

  it("refuses a typo in the seat transport block", () => {
    // The block a seat-only machine most needs to override: a dropped
    // `timeotus` would leave the bundled ceilings quietly in force.
    const layers = sources({
      overrides: { transports: { "copilot-cli": { timeotus: { total_seconds: 60 } } } },
    });
    assert.match(refusal(() => loadConfigFrom(layers)), /copilot-cli\.timeotus/);
  });

  it("accepts keys inside a block the schema leaves open", () => {
    // `metrics` is deliberately unstructured; refusing there would refuse
    // overrides the schema never described.
    const config = loadConfigFrom(sources({ overrides: { metrics: { sink: "stdout" } } }));
    assert.equal(block(config, "metrics")["sink"], "stdout");
    assert.equal(block(config, "metrics")["enabled"], true);
  });

  it("keeps the base when the overlay names one key of a block", () => {
    const config = loadConfigFrom(
      sources({ overrides: { transports: { "copilot-cli": { binary: "copilot-next" } } } }),
    );
    assert.equal(nested(config, "transports")["copilot-cli"]["binary"], "copilot-next");
    assert.ok(config["roles"]);
  });

  it("validates the merged result", () => {
    const layers = sources({ overrides: { transport: { profile: "carrier-pigeon" } } });
    assert.match(refusal(() => loadConfigFrom(layers)), /schema validation/);
  });

  for (const owned of ["testing", "packaging", "paths", "driver"]) {
    it(`refuses an overlay claiming ${owned}, which the repository owns`, () => {
      // Deep merge would have let a gitignored machine file replace a suite
      // command or a packaging feed, and the run of record would then
      // attribute to the repository a command it never declared.
      const layers = sources({ overrides: { [owned]: {} } });
      assert.match(refusal(() => loadConfigFrom(layers)), /which the repository owns/);
    });
  }
});

describe("the tracked project config", () => {
  withoutTransportEnv();

  it("lets the repository declare its own suites", () => {
    const config = loadConfigFrom(
      sources({
        project: {
          schema_version: 1,
          testing: { suites: [{ name: "mvn", command: "mvn -q test", covers: ["src/"] }] },
        },
      }),
    );
    const testing = config["testing"] as { suites: Array<{ command: string }> };
    assert.equal(testing.suites[0].command, "mvn -q test");
    assert.match(String(config["_project_config_path"]), /dabbler\.yaml$/);
    // Providers, their dispatch settings and roles stay distribution facts:
    // a repository declaring how to run its tests must not have to fork them.
    assert.ok(config["provider_defaults"] && config["roles"]);
  });

  it("lets the machine override the distribution and not the repository", () => {
    const config = loadConfigFrom(
      sources({
        project: { schema_version: 1, paths: { sensitive_paths: ["infra/"] } },
        overrides: { escalation: { max_escalations: 1 } },
      }),
    );
    assert.deepEqual(block(config, "paths")["sensitive_paths"], ["infra/"]);
    assert.equal(block(config, "escalation")["max_escalations"], 1);
  });

  it("refuses a file that states no schema_version", () => {
    // A repository set up under a later shape is refused with its version
    // named, not read as a pile of unknown keys.
    const layers = sources({ project: { testing: { suites: [] } } });
    assert.match(refusal(() => loadConfigFrom(layers)), /schema_version/);
  });

  it("refuses a repository declaring a distribution fact", () => {
    const layers = sources({ project: { schema_version: 1, providers: {} } });
    assert.match(refusal(() => loadConfigFrom(layers)), /schema validation/);
  });

  it("refuses an empty declaration rather than reading it as nothing", () => {
    assert.match(refusal(() => loadConfigFrom(sources({ project: null }))), /is empty/);
  });
});

describe("resolving the transport", () => {
  withoutTransportEnv();

  /**
   * A checkout with no settings file, named explicitly.
   *
   * Every call below passes a root rather than letting the reading fall back
   * to the working directory: the settings layer is per-CHECKOUT, so a test
   * that did not name one would be asking what this repository is configured
   * with -- which is a reading of the machine the suite runs on, and the one
   * thing a suite may never do.
   */
  const bare = (): string => tempDir("transport-");

  it("defaults to the API", () => {
    assert.equal(resolveTransport(makeConfig(), null, bare()), "api");
  });

  it("takes the config profile over the default", () => {
    assert.equal(
      resolveTransport(makeConfig({ transport: { profile: "copilot-cli" } }), null, bare()),
      "copilot-cli",
    );
  });

  it("takes this person's default over the config, and the checkout over both", () => {
    // The order the operator settled: what the solution COMMITTED outranks
    // what one person prefers, because a repository that needs the seat
    // needs it for everyone who opens it; and a personal default still
    // outranks what the distribution ships, because that is the answer
    // nobody on this machine chose.
    const config = makeConfig({ transport: { profile: "offline" } });
    writePreferences({ transport: "api" });
    const root = bare();
    assert.equal(resolveTransport(config, null, root), "api");
    writeSettings(root, { [SETTING_TRANSPORT]: "copilot-cli" });
    assert.equal(resolveTransport(config, null, root), "copilot-cli");
    // And a checkout that says nothing leaves the personal default standing:
    // silence in the higher layer is not a value in it.
    assert.equal(resolveTransport(config, null, bare()), "api");
    writePreferences({ transport: "" });
  });

  it("stops on the overlay's retired transport key, and names the command", () => {
    // The fifth input, and a fifth input is the whole problem: the replaced
    // `bootstrap --transport` and `configure --transport` wrote exactly this
    // key, so every checkout made before this session carries one -- now
    // sitting BELOW the user-level preferences, where a personal default
    // would silently override the checkout file somebody deliberately wrote.
    // Nothing may choose between two readings on their behalf.
    const root = tempDir("overlay-");
    seed(root, {
      "local-overrides.yaml": stringify({ transport: { profile: "copilot-cli" } }),
    });
    const ungit = gitAnswers([
      [["rev-parse", "--show-toplevel"], { stdout: root.split("\\").join("/") }],
    ]);
    resetProjectRootCache();
    try {
      const message = refusal(() => resolveTransport(makeConfig(), null, root));
      assert.match(message, /local-overrides\.yaml/);
      assert.match(message, /dabbler configure --transport copilot-cli/);
    } finally {
      ungit();
      resetProjectRootCache();
    }
  });

  it("ignores the environment variable entirely, whatever it says", () => {
    // It is not a layer and cannot become one. `bootstrap` persisted it at
    // USER scope, so one repository's detection decided how every repository
    // on the machine routed, for every later run, with nothing able to show
    // it -- and the pane came to save a preference the next session ignored.
    // Every layer that remains is a file a surface can show and a verb can
    // write.
    process.env[TRANSPORT_ENV_VAR] = "copilot-cli";
    const config = makeConfig({ transport: { profile: "offline" } });
    assert.equal(resolveTransport(config, null, bare()), "offline");
    // Including a value that is not even a transport: a layer nothing reads
    // cannot fail a call either.
    process.env[TRANSPORT_ENV_VAR] = "carrier-pigeon";
    assert.equal(resolveTransport(config, null, bare()), "offline");
  });

  it("takes the flag over every file", () => {
    const root = bare();
    writeSettings(root, { [SETTING_TRANSPORT]: "api" });
    assert.equal(resolveTransport(makeConfig(), "copilot-cli", root), "copilot-cli");
  });

  it("names the level an unknown value came from", () => {
    const root = bare();
    writeSettings(root, { [SETTING_TRANSPORT]: "carrier-pigeon" });
    assert.match(refusal(() => resolveTransport(makeConfig(), null, root)), /settings\.json/);
  });

  it("stops on a settings file it cannot read, and leaves the bytes alone", () => {
    // A half-typed file is a file somebody is in the middle of editing, and
    // a recovered parse of it would resolve a session onto whatever survived
    // the syntax error. Falling THROUGH it is no better: a setting the
    // operator can plainly see, ignored while a lower layer decides, is the
    // same invisibility the environment variable was deleted for.
    const root = bare();
    const path = join(root, SETTINGS_RELPATH);
    mkdirSync(dirname(path), { recursive: true });
    const text = '{ "dabbler.transport": "copilot-cli"  "x": 1 }';
    writeFileSync(path, text, "utf8");
    assert.match(
      refusal(() => resolveTransport(makeConfig(), null, root)),
      /settings\.json could not be read/,
    );
    assert.equal(readFileSync(path, "utf8"), text);
  });
});

describe("the one reviewing vehicle", () => {
  withoutTransportEnv();
  const bare = (): string => tempDir("reviewing-");

  it("carries both reviewers, and an auxiliary key that agrees is simply ignored", () => {
    // They differ in what they may not BE, and not in how they are reached.
    // An auxiliary key repeating the same value is a document that has not
    // been tidied yet, which is not a reason to stop anybody's session.
    const config = makeConfig({
      transport: { profile: "offline" },
      roles: {
        reviewer: { transport: "api" },
        "auxiliary-reviewer": { transport: "api" },
      },
    });
    const reading = explainReviewingTransport(config, null, bare());
    assert.equal(reading.transport, "api");
    assert.equal(reading.decidedBy, "roles.reviewer.transport");
  });

  it("refuses to choose between two live values, and names both keys", () => {
    // Collapsing by picking one is how state stops matching the record: the
    // round would be dispatched over a vehicle the document does not say,
    // and nothing would ever say which.
    const config = makeConfig({
      roles: {
        reviewer: { transport: "api" },
        "auxiliary-reviewer": { transport: "copilot-cli" },
      },
    });
    const message = refusal(() => explainReviewingTransport(config, null, bare()));
    assert.match(message, /roles\.auxiliary-reviewer\.transport/);
    assert.match(message, /roles\.reviewer\.transport/);
  });

  it("takes this checkout's setting over the configured reviewing vehicle", () => {
    const root = bare();
    writeSettings(root, { [SETTING_REVIEWER_TRANSPORT]: "copilot-cli" });
    const config = makeConfig({ roles: { reviewer: { transport: "api" } } });
    const reading = explainReviewingTransport(config, null, root);
    assert.equal(reading.transport, "copilot-cli");
    assert.equal(reading.decidedBy, SETTING_REVIEWER_TRANSPORT);
  });
});

describe("the round caps", () => {
  it("uses the configured bound", () => {
    // One resolver for every loop that opens rounds: two loops reading the
    // same setting through two code paths disagree about it eventually.
    assert.equal(verificationRoundCap({ verification: { settings: { max_rounds: 5 } } }), 5);
  });

  for (const settings of [{ max_rounds: 0 }, { max_rounds: -1 }, { max_rounds: "soon" }, {}, null]) {
    it(`falls back rather than switching off on ${JSON.stringify(settings)}`, () => {
      // A cap an unparseable, absent or non-positive setting turns into no
      // cap at all is not a cap.
      assert.equal(
        verificationRoundCap({ verification: { settings } }),
        DEFAULT_VERIFICATION_ROUNDS,
      );
    });
  }

  it("meters the test phase separately", () => {
    // One number serving both loops would tune each against the other's cost.
    const config = { verification: { settings: { max_rounds: 2, max_test_rounds: 9 } } };
    assert.deepEqual([verificationRoundCap(config), runRoundCap(config)], [2, 9]);
  });
});

describe("the critique pipeline", () => {
  it("is off when the block is absent", () => {
    assert.equal(block(loadConfigFrom(sources()), "critique")["pipeline"], "off");
  });

  it("accepts shadow, which records without deciding", () => {
    const config = loadConfigFrom(sources({ overrides: { critique: { pipeline: "shadow" } } }));
    assert.equal(block(config, "critique")["pipeline"], "shadow");
  });

  it("refuses enforce, naming the set that would implement it", () => {
    // Downgrading it silently to shadow would leave an operator believing
    // their work is gated when it is not.
    const layers = sources({ overrides: { critique: { pipeline: "enforce" } } });
    assert.match(refusal(() => loadConfigFrom(layers)), new RegExp(CRITIQUE_ENFORCE_SET));
  });
});

describe("generation params", () => {
  it("deep-merges a task override over the provider's defaults", () => {
    // Both halves are keyed by PROVIDER: `effort` and `thinking` are
    // Anthropic's vocabulary rather than any one model's, and a block with no
    // model names in it cannot go stale when a vendor ships a new model.
    const config = makeConfig();
    (config["provider_defaults"] as Record<string, Record<string, unknown>>)["anthropic"][
      "generation_params"
    ] = { effort: "medium", thinking: { enabled: true, type: "adaptive" } };
    config["task_type_params"] = {
      formatting: { anthropic: { effort: "low", thinking: { enabled: false } } },
    };
    const params = resolveGenerationParams("anthropic", "formatting", config);
    assert.equal(params["effort"], "low");
    assert.deepEqual(params["thinking"], { enabled: false, type: "adaptive" });
  });

  it("returns the provider's defaults when nothing overrides them", () => {
    const config = makeConfig();
    (config["provider_defaults"] as Record<string, Record<string, unknown>>)["anthropic"][
      "generation_params"
    ] = { effort: "high" };
    assert.deepEqual(resolveGenerationParams("anthropic", "x", config), { effort: "high" });
  });
});

describe("prompt templates", () => {
  it("resolves the bundled templates", () => {
    const config = loadConfigFrom(sources());
    assert.ok(Object.hasOwn(config["_task_templates"] as object, "code-review"));
    assert.ok(config["_verification_template"]);
    // The system prompt file is split by PROVIDER and always was -- one H2
    // section per provider slug, named identically by every model entry that
    // used to carry it.
    assert.ok(nested(config, "provider_defaults")["anthropic"]["_system_prompt"]);
  });

  it("falls back to the default when the named file is absent", () => {
    const base = makeConfig();
    (base["provider_defaults"] as Record<string, Record<string, unknown>>)["google"][
      "system_prompt_file"
    ] = "absent.md";
    const config = loadConfigFrom(sources({ base }));
    assert.match(
      String(nested(config, "provider_defaults")["google"]["_system_prompt"]),
      /expert software engineer/,
    );
  });
});

describe("splitting a template file into sections", () => {
  it("splits on exactly the given level and slugs the heading", () => {
    const sections = splitSections(
      "preamble\n# alpha\nbody a\n## nested\ndeep\n# Beta Two\nbody b\n",
      1,
    );
    assert.equal(sections["alpha"], "body a\n## nested\ndeep");
    assert.equal(sections["beta-two"], "body b");
  });
});

describe("the truthiness of a config value", () => {
  it("is Python's, over the scalars a loaded config holds", () => {
    // `enabled: false`, `enabled: 0`, `enabled:` (null) and an absent key
    // are all off, and the words are already booleans: the YAML is parsed as
    // 1.1, where an unquoted `off` is false rather than the string "off".
    assert.deepEqual([true, "x", 1].map(truthy), [true, true, true]);
    assert.deepEqual([false, 0, "", null, undefined].map(truthy), [
      false,
      false,
      false,
      false,
      false,
    ]);
  });

  it("calls an empty container true, so a flag position holding one is loud", () => {
    // Python calls `[]` and `{}` falsy; quietly agreeing here would decide
    // what the operator meant by a container in a flag's place.
    assert.deepEqual([[], {}].map(truthy), [true, true]);
  });
});

describe("resolving --no-router", () => {
  const saved = process.env[NO_ROUTER_ENV_VAR];
  beforeEach(() => {
    resetForTests();
    delete process.env[NO_ROUTER_ENV_VAR];
  });
  afterEach(() => {
    resetForTests();
    if (saved === undefined) delete process.env[NO_ROUTER_ENV_VAR];
    else process.env[NO_ROUTER_ENV_VAR] = saved;
  });

  it("takes the flag, then the env var, then leaves the router enabled", () => {
    assert.equal(resolveNoRouterMode(true), true);
    resetForTests();
    process.env[NO_ROUTER_ENV_VAR] = "on";
    assert.equal(resolveNoRouterMode(false), true);
    resetForTests();
    delete process.env[NO_ROUTER_ENV_VAR];
    assert.equal(resolveNoRouterMode(false), false);
  });

  it("is idempotent, because an entry point may resolve twice", () => {
    // A silent cache overwrite is a footgun for a process with two entries.
    assert.equal(resolveNoRouterMode(true), true);
    assert.equal(resolveNoRouterMode(false), true);
  });

  it("falls back to the env var alone before anything has resolved", () => {
    process.env[NO_ROUTER_ENV_VAR] = "yes";
    assert.equal(isNoRouterMode(), true);
    // ...and does not cache that answer, so a later resolve still decides.
    delete process.env[NO_ROUTER_ENV_VAR];
    assert.equal(isNoRouterMode(), false);
  });
});

describe("resolving a secret", () => {
  const NAME = "DABBLER_TEST_SECRET";
  afterEach(() => {
    delete process.env[NAME];
  });

  it("reads the env backend, and normalizes an empty value to nothing", () => {
    // Truthiness is enough at every call site because of the second half.
    process.env[NAME] = "value";
    assert.equal(resolveSecret(NAME), "value");
    process.env[NAME] = "";
    assert.equal(resolveSecret(NAME), null);
    delete process.env[NAME];
    assert.equal(resolveSecret(NAME), null);
  });

  it("refuses a backend nobody registered", () => {
    assert.match(refusal(() => resolveSecret(NAME, "keyring")), /Unknown secret backend/);
  });

  it("reaches a registered backend without touching its callers", () => {
    registerBackend("test-backend", (name) => `from-${name}`);
    assert.equal(resolveSecret(NAME, "test-backend"), `from-${NAME}`);
  });
});
