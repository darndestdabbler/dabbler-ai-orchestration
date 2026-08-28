// What the tests need to have on disk, and nothing they assert about.
//
// Not a test file: the suite's glob is `*.test.ts`, so nothing here is
// collected. It exists because `config` discovers a project through git --
// the same discovery the gates use -- so a test of the layering needs a real
// repository rather than a bare directory.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { stringify as stringifyYaml } from "yaml";

/** A schema-valid config, deep-copied, with top-level keys replaced. */
export function makeConfig(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return { ...structuredClone(BASE_CONFIG), ...overrides };
}

const PROVIDER_TEMPLATE = {
  rate_limit: { requests_per_minute: 1000, tokens_per_minute: 1000000 },
  timeout_seconds: 30,
  retry: { max_retries: 1, backoff_base_seconds: 0 },
};

const BASE_CONFIG: Record<string, unknown> = {
  providers: {
    anthropic: {
      api_key_env: "TEST_ANTHROPIC_KEY",
      base_url: "https://fake.anthropic.test/v1/messages",
      ...PROVIDER_TEMPLATE,
    },
    google: {
      api_key_env: "TEST_GOOGLE_KEY",
      base_url: "https://fake.google.test/v1beta",
      ...PROVIDER_TEMPLATE,
    },
    openai: {
      api_key_env: "TEST_OPENAI_KEY",
      base_url: "https://fake.openai.test/v1",
      ...PROVIDER_TEMPLATE,
    },
  },
  models: {
    flash: {
      provider: "google", model_id: "g-flash",
      max_context_tokens: 1000000, max_output_tokens: 65536,
    },
    pro: {
      provider: "google", model_id: "g-pro",
      max_context_tokens: 1000000, max_output_tokens: 65536,
    },
    sonnet: {
      provider: "anthropic", model_id: "a-sonnet",
      max_context_tokens: 200000, max_output_tokens: 16000,
    },
    opus: {
      provider: "anthropic", model_id: "a-opus",
      max_context_tokens: 200000, max_output_tokens: 32000,
    },
    gpt: {
      provider: "openai", model_id: "o-gpt",
      max_context_tokens: 272000, max_output_tokens: 32000,
    },
  },
  roles: {
    generator: {
      prefer: ["g-flash", "g-pro", "a-opus"],
      require_provider_in: ["anthropic", "openai", "google"],
    },
    verifier: {
      prefer: ["o-gpt", "a-sonnet"],
      require_provider_in: ["anthropic", "openai", "google"],
    },
  },
  escalation: {
    enabled: true,
    max_escalations: 2,
    triggers: {
      empty_response: true,
      max_tokens_hit: true,
      min_output_tokens: 30,
      refusal_detection: true,
    },
    refusal_phrases: ["i can't help with", "i'm unable to"],
  },
  transports: { "copilot-cli": { lockfile: "copilot-catalog.lock" } },
  metrics: { enabled: true },
};

/** A temporary directory that removes itself when the test file is done. */
export function makeTempDir(): string {
  const path = mkdtempSync(join(tmpdir(), "dabbler-router-test-"));
  TEMP_DIRS.push(path);
  return path;
}

const TEMP_DIRS: string[] = [];

export function removeTempDirs(): void {
  while (TEMP_DIRS.length > 0) {
    rmSync(TEMP_DIRS.pop() as string, { recursive: true, force: true });
  }
}

/** A real git repository, because that is how a project is discovered. */
export function makeProject(): string {
  const path = makeTempDir();
  execFileSync("git", ["init", "-q"], { cwd: path, stdio: "ignore" });
  return path;
}

export function writeYaml(path: string, body: unknown): string {
  writeFileSync(path, stringifyYaml(body), "utf8");
  return path;
}

/** A config file on disk, named so `loadConfig` takes it as the whole answer. */
export function writeConfig(
  directory: string,
  config: Record<string, unknown> = makeConfig(),
): string {
  return writeYaml(join(directory, "router-config.yaml"), config);
}
