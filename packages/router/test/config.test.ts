import { join } from "node:path";

import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CONFIG_ENV_VAR,
  CRITIQUE_ENFORCE_SET,
  DEFAULT_VERIFICATION_ROUNDS,
  TRANSPORT_ENV_VAR,
  loadConfig,
  resetProjectRootCache,
  resolveGenerationParams,
  resolveTransport,
  runRoundCap,
  splitSections,
  verificationRoundCap,
} from "../src/config.ts";
import {
  makeConfig,
  makeProject,
  makeTempDir,
  removeTempDirs,
  writeConfig,
  writeYaml,
} from "./support/fixtures.ts";

afterAll(removeTempDirs);

// The layers resolve from a project directory, and `projectRoot` memoizes
// per directory; a test that reuses a path would otherwise see the answer
// from the test before it.
beforeEach(resetProjectRootCache);

// Hermetic against the shell: `bootstrap` persists DABBLER_TRANSPORT at user
// scope on a seat machine, and four of the blocks below resolve the transport,
// so the variable is cleared before every test and the shell's value put
// back after.
const savedTransport = process.env[TRANSPORT_ENV_VAR];
beforeEach(() => {
  delete process.env[TRANSPORT_ENV_VAR];
});
afterEach(() => {
  if (savedTransport === undefined) delete process.env[TRANSPORT_ENV_VAR];
  else process.env[TRANSPORT_ENV_VAR] = savedTransport;
});

const overlayIn = (project: string, body: unknown): string =>
  writeYaml(join(project, "local-overrides.yaml"), body);
const declareIn = (project: string, body: unknown): string =>
  writeYaml(join(project, "dabbler.yaml"), body);

describe("the verification round cap", () => {
  // One resolver for every loop that opens rounds. Two loops reading the
  // same setting through two code paths disagree about it eventually.
  it("uses the configured bound", () => {
    expect(verificationRoundCap({ verification: { settings: { max_rounds: 5 } } })).toBe(
      5,
    );
  });

  it.each([
    { max_rounds: 0 },
    { max_rounds: -1 },
    { max_rounds: "soon" },
    {},
    null,
  ])("falls back rather than switching off on %o", (settings) => {
    // A cap an unparseable, absent or non-positive setting turns into no cap
    // at all is not a cap: the loop it was bounding would go back to calling
    // vendors until something else stopped it.
    expect(verificationRoundCap({ verification: { settings } })).toBe(
      DEFAULT_VERIFICATION_ROUNDS,
    );
  });

  it("meters the test phase separately", () => {
    // One number serving both loops would tune each against the other's cost.
    const config = {
      verification: { settings: { max_rounds: 2, max_test_rounds: 9 } },
    };
    expect([verificationRoundCap(config), runRoundCap(config)]).toEqual([2, 9]);
  });
});

describe("loading a config", () => {
  it("loads the bundled config", () => {
    const config = loadConfig();
    expect(config["models"]).toBeTruthy();
    expect(String(config["_config_path"])).toMatch(/router-config\.yaml$/);
  });

  it("names the file it could not find", () => {
    const missing = join(makeTempDir(), "nope.yaml");
    expect(() => loadConfig(missing)).toThrow(/nope\.yaml/);
  });

  it("refuses a config with no providers", () => {
    const config = makeConfig();
    delete config["providers"];
    expect(() => loadConfig(writeConfig(makeTempDir(), config))).toThrow(
      /schema validation/,
    );
  });

  it("refuses a provider that declares no rate limit", () => {
    // A routable entry with no rate limit fails load, and has since set 109.
    const config = makeConfig();
    const providers = config["providers"] as Record<string, Record<string, unknown>>;
    delete providers["anthropic"]["rate_limit"];
    expect(() => loadConfig(writeConfig(makeTempDir(), config))).toThrow(
      /schema validation/,
    );
  });

  it("refuses a model referencing a provider that does not exist", () => {
    const config = makeConfig();
    const models = config["models"] as Record<string, Record<string, unknown>>;
    models["flash"]["provider"] = "mystery";
    expect(() => loadConfig(writeConfig(makeTempDir(), config))).toThrow(
      /unknown provider/,
    );
  });

  it("refuses an unknown key in a role", () => {
    // A typo'd role key would silently drop the declaration it meant.
    const config = makeConfig();
    const roles = config["roles"] as Record<string, Record<string, unknown>>;
    roles["verifier"]["require_provider"] = ["openai"];
    expect(() => loadConfig(writeConfig(makeTempDir(), config))).toThrow(
      /schema validation/,
    );
  });

  it("accepts a preference that names no model", () => {
    // Ordering only: a stale name costs a slightly older model, never a
    // candidate, so it must not refuse the load.
    const config = makeConfig();
    const roles = config["roles"] as Record<string, Record<string, unknown>>;
    roles["verifier"]["prefer"] = ["retired-last-year"];
    expect(loadConfig(writeConfig(makeTempDir(), config))["roles"]).toBeTruthy();
  });

  it("refuses a seat transport block with no lockfile", () => {
    const config = makeConfig();
    const transports = config["transports"] as Record<
      string,
      Record<string, unknown>
    >;
    delete transports["copilot-cli"]["lockfile"];
    expect(() => loadConfig(writeConfig(makeTempDir(), config))).toThrow(/lockfile/);
  });

  it("refuses seat timeouts that cannot all fire", () => {
    const config = makeConfig();
    const transports = config["transports"] as Record<
      string,
      Record<string, unknown>
    >;
    transports["copilot-cli"]["timeouts"] = {
      spawn_seconds: 100,
      first_byte_seconds: 5,
    };
    expect(() => loadConfig(writeConfig(makeTempDir(), config))).toThrow(
      /spawn_seconds </,
    );
  });

  it("fills the run-core blocks so every reader sees one shape", () => {
    const config = loadConfig(writeConfig(makeTempDir()));
    expect(config["run_policy"]).toMatchObject({ default: "fast" });
    expect(config["git"]).toMatchObject({ remote: "origin" });
  });
});

describe("resolving the transport", () => {
  it("defaults to the API", () => {
    expect(resolveTransport(makeConfig())).toBe("api");
  });

  it("takes the config profile over the default", () => {
    const config = makeConfig({ transport: { profile: "copilot-cli" } });
    expect(resolveTransport(config)).toBe("copilot-cli");
  });

  it("takes the env var over the config", () => {
    const config = makeConfig({ transport: { profile: "copilot-cli" } });
    process.env[TRANSPORT_ENV_VAR] = "api";
    expect(resolveTransport(config)).toBe("api");
  });

  it("takes the flag over the env var", () => {
    process.env[TRANSPORT_ENV_VAR] = "api";
    expect(resolveTransport(makeConfig(), "copilot-cli")).toBe("copilot-cli");
  });

  it("names the level an unknown value came from", () => {
    process.env[TRANSPORT_ENV_VAR] = "carrier-pigeon";
    expect(() => resolveTransport(makeConfig())).toThrow(TRANSPORT_ENV_VAR);
  });
});

describe("the machine-local overlay", () => {
  // How a machine states a fact about itself without editing the packaged
  // default every install would inherit.
  const saved = process.env[CONFIG_ENV_VAR];
  afterEach(() => {
    if (saved === undefined) delete process.env[CONFIG_ENV_VAR];
    else process.env[CONFIG_ENV_VAR] = saved;
  });

  it("merges over the bundled base, partially", () => {
    const project = makeProject();
    overlayIn(project, { transport: { profile: "copilot-cli" } });
    const config = loadConfig(undefined, project);
    expect(resolveTransport(config)).toBe("copilot-cli");
    expect(config["models"]).toBeTruthy();
    expect(String(config["_local_overrides_path"])).toMatch(
      /local-overrides\.yaml$/,
    );
  });

  it("refuses a typo in the seat transport block", () => {
    // The block a seat-only machine most needs to override: a dropped
    // `timeotus` would leave the bundled ceilings quietly in force.
    const project = makeProject();
    overlayIn(project, {
      transports: { "copilot-cli": { timeotus: { total_seconds: 60 } } },
    });
    expect(() => loadConfig(undefined, project)).toThrow(/copilot-cli\.timeotus/);
  });

  it("accepts keys inside a block the schema leaves open", () => {
    // `metrics` is deliberately unstructured; refusing there would refuse
    // overrides the schema never described.
    const project = makeProject();
    overlayIn(project, { metrics: { sink: "stdout" } });
    const config = loadConfig(undefined, project);
    expect((config["metrics"] as Record<string, unknown>)["sink"]).toBe("stdout");
    expect((config["metrics"] as Record<string, unknown>)["enabled"]).toBe(true);
  });

  it("keeps the base when the overlay names one seat key", () => {
    const project = makeProject();
    overlayIn(project, { transports: { "copilot-cli": { lockfile: "seat.lock" } } });
    const config = loadConfig(undefined, project);
    const transports = config["transports"] as Record<
      string,
      Record<string, unknown>
    >;
    expect(transports["copilot-cli"]["lockfile"]).toBe("seat.lock");
    expect(config["roles"]).toBeTruthy();
  });

  it("validates the merged result", () => {
    const project = makeProject();
    overlayIn(project, { transport: { profile: "carrier-pigeon" } });
    expect(() => loadConfig(undefined, project)).toThrow(/schema validation/);
  });

  it("takes no overlay when a config is named explicitly", () => {
    const project = makeProject();
    overlayIn(project, { transport: { profile: "copilot-cli" } });
    const config = loadConfig(writeConfig(project), project);
    expect(config["_local_overrides_path"]).toBeNull();
    expect(resolveTransport(config)).toBe("api");
  });

  it("takes no overlay when the env var names the config", () => {
    const project = makeProject();
    overlayIn(project, { transport: { profile: "copilot-cli" } });
    process.env[CONFIG_ENV_VAR] = writeConfig(project);
    const config = loadConfig(undefined, project);
    expect(config["_local_overrides_path"]).toBeNull();
    expect(resolveTransport(config)).toBe("api");
  });
});

describe("the tracked project config", () => {
  // `dabbler.yaml`: what the repository says about itself, tracked because
  // CI and the next machine read it and a gitignored file serves neither.
  it("lets the repository declare its own suites", () => {
    const project = makeProject();
    declareIn(project, {
      schema_version: 1,
      testing: {
        suites: [{ name: "mvn", command: "mvn -q test", covers: ["src/"] }],
      },
    });
    const config = loadConfig(undefined, project);
    const testing = config["testing"] as { suites: Array<{ command: string }> };
    expect(testing.suites[0].command).toBe("mvn -q test");
    expect(String(config["_project_config_path"])).toMatch(/dabbler\.yaml$/);
    // Providers, models and roles stay distribution facts: a repository
    // declaring how to run its tests must not have to fork the registry.
    expect(config["models"]).toBeTruthy();
    expect(config["roles"]).toBeTruthy();
  });

  it("lets the machine override the distribution and not the repository", () => {
    const project = makeProject();
    declareIn(project, {
      schema_version: 1,
      paths: { sensitive_paths: ["infra/"] },
    });
    overlayIn(project, { transport: { profile: "copilot-cli" } });
    const config = loadConfig(undefined, project);
    expect((config["paths"] as Record<string, unknown>)["sensitive_paths"]).toEqual([
      "infra/",
    ]);
    expect(resolveTransport(config)).toBe("copilot-cli");
  });

  it.each(["testing", "packaging", "paths"])(
    "refuses an overlay claiming %s, which the repository owns",
    (block) => {
      // Deep merge would have let a gitignored machine file replace a suite
      // command or a packaging feed, and the run of record would then
      // attribute to the repository a command it never declared.
      const project = makeProject();
      overlayIn(project, { [block]: {} });
      expect(() => loadConfig(undefined, project)).toThrow(
        /which the repository owns/,
      );
    },
  );

  it("refuses a file that states no schema_version", () => {
    // A repository set up under a later shape must be refused with its
    // version named, not read as a pile of unknown keys.
    const project = makeProject();
    declareIn(project, { testing: { suites: [] } });
    expect(() => loadConfig(undefined, project)).toThrow(/schema_version/);
  });

  it("refuses a repository declaring a distribution fact", () => {
    // `AI_ROUTER_CONFIG` is not the escape either, so this is the only door
    // -- and it opens onto three blocks, not onto the provider list.
    const project = makeProject();
    declareIn(project, { schema_version: 1, providers: {} });
    expect(() => loadConfig(undefined, project)).toThrow(/schema validation/);
  });

  it("refuses an empty declaration rather than reading it as nothing", () => {
    const project = makeProject();
    writeYaml(join(project, "dabbler.yaml"), null);
    expect(() => loadConfig(undefined, project)).toThrow(/is empty/);
  });

  it("takes neither layer when a config is named explicitly", () => {
    const project = makeProject();
    declareIn(project, {
      schema_version: 1,
      testing: { suites: [{ name: "mvn", command: "mvn -q test" }] },
    });
    const config = loadConfig(writeConfig(project), project);
    expect(config["_project_config_path"]).toBeNull();
    expect((config["testing"] as { suites?: unknown[] } | undefined)?.suites).toBeFalsy();
  });

  it("defaults sensitive paths to none rather than to absent", () => {
    // Every reader sees the same shape, so nothing has to ask whether a
    // repository that declared nothing means "none" or means "unknown".
    const project = makeProject();
    const config = loadConfig(undefined, project);
    expect((config["paths"] as Record<string, unknown>)["sensitive_paths"]).toEqual([]);
  });
});

describe("generation params", () => {
  it("deep-merges a task override over the model defaults", () => {
    const config = makeConfig();
    const models = config["models"] as Record<string, Record<string, unknown>>;
    models["sonnet"]["generation_params"] = {
      effort: "medium",
      thinking: { enabled: true, type: "adaptive" },
    };
    config["task_type_params"] = {
      formatting: { sonnet: { effort: "low", thinking: { enabled: false } } },
    };
    const params = resolveGenerationParams("sonnet", "formatting", config);
    expect(params["effort"]).toBe("low");
    expect(params["thinking"]).toEqual({ enabled: false, type: "adaptive" });
  });

  it("returns the model defaults when nothing overrides them", () => {
    const config = makeConfig();
    const models = config["models"] as Record<string, Record<string, unknown>>;
    models["opus"]["generation_params"] = { effort: "high" };
    expect(resolveGenerationParams("opus", "x", config)).toEqual({ effort: "high" });
  });
});

describe("splitting a template file into sections", () => {
  const TEXT = "preamble\n# alpha\nbody a\n## nested\ndeep\n# Beta Two\nbody b\n";

  it("splits on exactly the given level and slugs the heading", () => {
    const sections = splitSections(TEXT, 1);
    expect(sections["alpha"]).toBe("body a\n## nested\ndeep");
    expect(sections["beta-two"]).toBe("body b");
  });
});

describe("prompt templates", () => {
  it("resolves the bundled templates", () => {
    const config = loadConfig();
    expect(config["_task_templates"]).toHaveProperty("code-review");
    expect(config["_verification_template"]).toBeTruthy();
    const models = config["models"] as Record<string, Record<string, unknown>>;
    expect(models["sonnet"]["_system_prompt"]).toBeTruthy();
  });

  it("falls back to the default when the named file is absent", () => {
    const config = makeConfig();
    const models = config["models"] as Record<string, Record<string, unknown>>;
    models["flash"]["system_prompt_file"] = "absent.md";
    const loaded = loadConfig(writeConfig(makeTempDir(), config));
    const loadedModels = loaded["models"] as Record<string, Record<string, unknown>>;
    expect(String(loadedModels["flash"]["_system_prompt"])).toContain(
      "expert software engineer",
    );
  });
});

describe("the critique pipeline", () => {
  // It ships off, and the mode that would let critique artifacts decide
  // anything is refused until the code that honours it exists.
  it("is off when the block is absent", () => {
    const project = makeProject();
    const config = loadConfig(undefined, project);
    expect((config["critique"] as Record<string, unknown>)["pipeline"]).toBe("off");
  });

  it("accepts shadow", () => {
    const project = makeProject();
    overlayIn(project, { critique: { pipeline: "shadow" } });
    const config = loadConfig(undefined, project);
    expect((config["critique"] as Record<string, unknown>)["pipeline"]).toBe("shadow");
  });

  it("refuses enforce, naming the set that would implement it", () => {
    const project = makeProject();
    overlayIn(project, { critique: { pipeline: "enforce" } });
    expect(() => loadConfig(undefined, project)).toThrow(CRITIQUE_ENFORCE_SET);
  });
});
