// What the tests need to have on disk, and nothing they assert about.
//
// Not a test file: the suite's glob is `*.test.ts`, so nothing here is
// collected. It exists because `config` discovers a project through git --
// the same discovery the gates use -- so a test of the layering needs a real
// repository rather than a bare directory.

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { stringify as stringifyYaml } from "yaml";
import { vi } from "vitest";

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

/**
 * The three provider keys `BASE_CONFIG` names.
 *
 * Selection refuses a provider whose key does not resolve, so a test about
 * ordering that forgot to set them would be testing reachability instead --
 * quietly, and with the right-looking answer for the wrong reason.
 */
export const PROVIDER_KEYS = [
  "TEST_ANTHROPIC_KEY",
  "TEST_GOOGLE_KEY",
  "TEST_OPENAI_KEY",
] as const;

export function setProviderKeys(): void {
  for (const name of PROVIDER_KEYS) process.env[name] = "test-key";
}

export function clearProviderKeys(): void {
  for (const name of PROVIDER_KEYS) delete process.env[name];
}

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

/** Identity and signing pinned, so a commit here needs no host configuration. */
export function git(repo: string, ...args: string[]): void {
  execFileSync("git", args, {
    cwd: repo,
    stdio: "ignore",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.invalid",
      GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.invalid",
      GIT_CONFIG_NOSYSTEM: "1",
    },
  });
}

/**
 * A repository with one committed file.
 *
 * The tree-snapshot, digest and provenance rules are all answers git gives,
 * so they need a checkout rather than a directory -- and a seed commit,
 * because several of them are about what changes against HEAD.
 */
export function makeSeededRepo(
  files: Record<string, string> = { "a.txt": "one\n" },
): string {
  const repo = makeTempDir();
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "commit.gpgsign", "false");
  for (const [rel, text] of Object.entries(files)) {
    const path = join(repo, ...rel.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
  }
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "seed", "--no-gpg-sign");
  return repo;
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

/**
 * A repository shaped the way the lifecycle expects one: a committed
 * session plan, a `dabbler.yaml` declaring one expensive suite, a source
 * file and its test, and a bare `origin` the branch tracks.
 *
 * The gates ask git four different questions -- what is uncommitted, what
 * the upstream holds, what the round anchored and what the suite covers --
 * so a fixture that was a bare directory would answer none of them, and one
 * with no remote would waive the push gate rather than exercise it.
 */
export function makeSandboxRepo(): { repo: string; sessionsDir: string } {
  const target = makeTempDir();
  const repo = join(target, "repo");
  const remote = join(target, "remote.git");
  for (const [rel, text] of Object.entries(SANDBOX_SEED)) {
    const path = join(repo, ...rel.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
  }
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "core.autocrlf", "false");
  git(repo, "config", "commit.gpgsign", "false");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "seed");
  git(target, "init", "-q", "--bare", remote);
  git(repo, "remote", "add", "origin", "../remote.git");
  git(repo, "push", "-q", "-u", "origin", "main");
  return { repo, sessionsDir: join(repo, "docs", "sessions") };
}

const SANDBOX_SEED: Record<string, string> = {
  "docs/sessions/session-plan.md":
    "### Session 1 of 2: First things\n1. Register.\n2. **Build the widget.** Make it real.\n" +
    "3. Cross-provider verification.\n4. Close-out.\n\n" +
    "### Session 2 of 2: Second things\n1. Register.\n2. Polish it.\n",
  "dabbler.yaml":
    "schema_version: 1\n\ntesting:\n  suites:\n    - name: unit\n" +
    "      command: python -m pytest\n      expensive: true\n" +
    "      covers:\n        - src/\n        - tests/\n" +
    "      test_roots:\n        - tests\n      test_glob: \"test_*.py\"\n\n" +
    "  selection:\n    repo_wide:\n      - dabbler.yaml\n" +
    "    smoke:\n      - tests/test_widget.py\n    rules:\n" +
    "      - when: src/widget.py\n        select:\n          - tests/test_widget.py\n",
  "src/widget.py": "def widget():\n    return 1\n",
  "tests/test_widget.py": "def test_widget():\n    assert True\n",
  ".gitignore": ".dabbler/\n",
};

/**
 * One verb run, with everything it printed.
 *
 * A verb writes through `cli/output.ts` rather than returning text, so a test
 * of what a person reads has to intercept the stream. `vi.restoreAllMocks`
 * runs in the `finally` so a throwing verb does not leave the suite's own
 * reporter writing into an array.
 */
export async function captured(
  run: () => Promise<number>,
): Promise<{ code: number; out: string; err: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const collect = (sink: string[]) => (chunk: unknown) => {
    sink.push(String(chunk));
    return true;
  };
  vi.spyOn(process.stdout, "write").mockImplementation(collect(out));
  vi.spyOn(process.stderr, "write").mockImplementation(collect(err));
  try {
    return { code: await run(), out: out.join(""), err: err.join("") };
  } finally {
    vi.restoreAllMocks();
  }
}
