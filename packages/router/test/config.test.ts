// The configuration layer: which files the three layers come from, what the
// merge of them is allowed to say, and the two small rules that ride beside
// it -- the no-router mode and the secret lookup.
//
// Where the layers LIVE is a decision over facts (`chooseConfigSources`), and
// what git contributes is one thin reader the loader composes; everything the
// loader then decides is reachable from named files (`loadConfigFrom`), so
// only one test here needs a project root at all, and none needs a checkout.
import assert from "node:assert/strict";
import { join } from "node:path";
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

describe("where the three layers come from", () => {
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
    seed(root, {
      [LOCAL_OVERRIDES_FILENAME]: stringify({ transport: { profile: "copilot-cli" } }),
    });
    const restore = gitAnswers([
      [["rev-parse", "--show-toplevel"], { stdout: root.split("\\").join("/") }],
    ]);
    resetProjectRootCache();
    try {
      const config = loadConfig(undefined, root);
      assert.equal(resolveTransport(config), "copilot-cli");
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
    assert.ok(config["models"]);
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

  it("refuses a model referencing a provider that does not exist", () => {
    const base = makeConfig();
    (base["models"] as Record<string, Record<string, unknown>>)["flash"]["provider"] = "mystery";
    assert.match(refusal(() => loadConfigFrom(sources({ base }))), /unknown provider/);
  });

  it("refuses an unknown key in a role", () => {
    // A typo'd role key would silently drop the declaration it meant.
    const base = makeConfig();
    (base["roles"] as Record<string, Record<string, unknown>>)["verifier"]["require_provider"] = ["openai"];
    assert.match(refusal(() => loadConfigFrom(sources({ base }))), /schema validation/);
  });

  it("accepts a preference that names no model", () => {
    // Ordering only: a stale name costs a slightly older model, never a
    // candidate, so it must not refuse the load.
    const base = makeConfig();
    (base["roles"] as Record<string, Record<string, unknown>>)["verifier"]["prefer"] = ["retired-last-year"];
    assert.ok(loadConfigFrom(sources({ base }))["roles"]);
  });

  it("refuses a seat transport block with no lockfile", () => {
    // Selecting the seat and silently falling back to a keyless API path is
    // worse than refusing to load.
    const base = makeConfig();
    delete (base["transports"] as Record<string, Record<string, unknown>>)["copilot-cli"]["lockfile"];
    assert.match(refusal(() => loadConfigFrom(sources({ base }))), /lockfile/);
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
  it("merges over the base, partially", () => {
    const config = loadConfigFrom(
      sources({ overrides: { transport: { profile: "copilot-cli" } } }),
    );
    assert.equal(resolveTransport(config), "copilot-cli");
    assert.ok(config["models"]);
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
      sources({ overrides: { transports: { "copilot-cli": { lockfile: "seat.lock" } } } }),
    );
    assert.equal(nested(config, "transports")["copilot-cli"]["lockfile"], "seat.lock");
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
    // Providers, models and roles stay distribution facts: a repository
    // declaring how to run its tests must not have to fork the registry.
    assert.ok(config["models"] && config["roles"]);
  });

  it("lets the machine override the distribution and not the repository", () => {
    const config = loadConfigFrom(
      sources({
        project: { schema_version: 1, paths: { sensitive_paths: ["infra/"] } },
        overrides: { transport: { profile: "copilot-cli" } },
      }),
    );
    assert.deepEqual(block(config, "paths")["sensitive_paths"], ["infra/"]);
    assert.equal(resolveTransport(config), "copilot-cli");
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
  const saved = process.env[TRANSPORT_ENV_VAR];
  beforeEach(() => {
    delete process.env[TRANSPORT_ENV_VAR];
  });
  afterEach(() => {
    if (saved === undefined) delete process.env[TRANSPORT_ENV_VAR];
    else process.env[TRANSPORT_ENV_VAR] = saved;
  });

  it("defaults to the API", () => {
    assert.equal(resolveTransport(makeConfig()), "api");
  });

  it("takes the config profile over the default", () => {
    assert.equal(
      resolveTransport(makeConfig({ transport: { profile: "copilot-cli" } })),
      "copilot-cli",
    );
  });

  it("takes the env var over the config", () => {
    process.env[TRANSPORT_ENV_VAR] = "api";
    assert.equal(
      resolveTransport(makeConfig({ transport: { profile: "copilot-cli" } })),
      "api",
    );
  });

  it("takes the flag over the env var", () => {
    process.env[TRANSPORT_ENV_VAR] = "api";
    assert.equal(resolveTransport(makeConfig(), "copilot-cli"), "copilot-cli");
  });

  it("names the level an unknown value came from", () => {
    process.env[TRANSPORT_ENV_VAR] = "carrier-pigeon";
    assert.match(refusal(() => resolveTransport(makeConfig())), new RegExp(TRANSPORT_ENV_VAR));
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
  it("deep-merges a task override over the model defaults", () => {
    const config = makeConfig();
    (config["models"] as Record<string, Record<string, unknown>>)["sonnet"]["generation_params"] = {
      effort: "medium",
      thinking: { enabled: true, type: "adaptive" },
    };
    config["task_type_params"] = {
      formatting: { sonnet: { effort: "low", thinking: { enabled: false } } },
    };
    const params = resolveGenerationParams("sonnet", "formatting", config);
    assert.equal(params["effort"], "low");
    assert.deepEqual(params["thinking"], { enabled: false, type: "adaptive" });
  });

  it("returns the model defaults when nothing overrides them", () => {
    const config = makeConfig();
    (config["models"] as Record<string, Record<string, unknown>>)["opus"]["generation_params"] = {
      effort: "high",
    };
    assert.deepEqual(resolveGenerationParams("opus", "x", config), { effort: "high" });
  });
});

describe("prompt templates", () => {
  it("resolves the bundled templates", () => {
    const config = loadConfigFrom(sources());
    assert.ok(Object.hasOwn(config["_task_templates"] as object, "code-review"));
    assert.ok(config["_verification_template"]);
    assert.ok(nested(config, "models")["sonnet"]["_system_prompt"]);
  });

  it("falls back to the default when the named file is absent", () => {
    const base = makeConfig();
    (base["models"] as Record<string, Record<string, unknown>>)["flash"]["system_prompt_file"] =
      "absent.md";
    const config = loadConfigFrom(sources({ base }));
    assert.match(String(nested(config, "models")["flash"]["_system_prompt"]), /expert software engineer/);
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
