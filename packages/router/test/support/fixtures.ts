// What the tests need to have on disk, and nothing they assert about.
//
// Not a test file: the suite's glob is `*.test.ts`, so nothing here is
// collected. It exists because `config` discovers a project through git --
// the same discovery the gates use -- so a test of the layering needs a real
// repository rather than a bare directory.
//
// Every git spawn costs a process, and on Windows a process costs the
// operator their keyboard: creation, antivirus inspection and a console
// host, thousands of times over, is what made the suite unusable rather than
// merely slow. Two rules keep the count down without faking git (the loop is
// trust machinery, and a fake that diverged from git's tree hashing would be
// the failure that matters most and shows least):
//
// - The suite runs under ONE pinned git configuration, set in this worker's
//   environment before any test runs. Identity, default branch, line
//   endings, signing and gc are decided once, so no repository pays four
//   `git config` spawns for its own, and the framework's own `runGit` --
//   which carries the ambient environment into the driver's land phase --
//   commits under the same identity on a bare CI runner as here.
// - A repository is built ONCE per distinct seed and every test gets a
//   directory copy. A git repository is a directory; the remote is named by
//   a relative path, so a copied pair points at its own remote.
//
// These are the rules the Python suite ran under; the port lost them.

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
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

// --- The temp root ----------------------------------------------------------
//
// One folder under the system temp dir holds everything this suite writes, so
// a Defender exclusion can name one path, a killed run's leftovers are found
// by the next run rather than accumulating for weeks, and nothing is ever
// created inside a git checkout -- a temp directory inside this repository
// would make `git -C <dir>` answer for THIS repository until the fixture had
// run `git init`, which is the wrong repository to commit into by accident.

const TEMP_ROOT = join(tmpdir(), "dabbler-router-tests");
const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

function scavengeStaleRuns(): void {
  mkdirSync(TEMP_ROOT, { recursive: true });
  const now = Date.now();
  for (const name of readdirSync(TEMP_ROOT)) {
    const path = join(TEMP_ROOT, name);
    try {
      if (now - statSync(path).mtimeMs < STALE_AFTER_MS) continue;
      rmSync(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    } catch {
      // Another worker is scavenging the same entry, or something still
      // holds it. The next run gets another chance.
    }
  }
}

/** A temporary directory that removes itself when the test file is done. */
export function makeTempDir(): string {
  const path = mkdtempSync(join(TEMP_ROOT, "t-"));
  TEMP_DIRS.push(path);
  return path;
}

const TEMP_DIRS: string[] = [];

export function removeTempDirs(): void {
  while (TEMP_DIRS.length > 0) {
    const path = TEMP_DIRS.pop() as string;
    try {
      rmSync(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    } catch {
      // A directory something still holds. On Windows a process's working
      // directory cannot be removed, and this suite starts detached
      // children that outlive the test that started them by a moment
      // (`jobs.ts`). Leaving a temp directory behind is untidy; failing the
      // whole file in `afterAll` -- every test in it green -- is a red run
      // of record for a housekeeping race, which is worse. The stale sweep
      // at the next run's start is what collects it.
    }
  }
}

// --- One git configuration for the whole worker ------------------------------

const GIT_CONFIG =
  "[user]\n\tname = Dabbler Test\n\temail = test@example.invalid\n" +
  "[init]\n\tdefaultBranch = main\n" +
  "[core]\n\tautocrlf = false\n\tfsmonitor = false\n" +
  "[commit]\n\tgpgsign = false\n" +
  "[gc]\n\tauto = 0\n";

/**
 * Pin git for this process and everything it spawns. Runs at import, before
 * the first test: the framework under test reads `process.env` when it
 * spawns git, so the pin reaches its commits and pushes, not only the
 * fixtures' own calls.
 */
function pinGitEnvironment(): string {
  const dir = join(TEMP_ROOT, `git-env-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  const config = join(dir, "gitconfig");
  writeFileSync(config, GIT_CONFIG, "utf8");
  process.env["GIT_CONFIG_GLOBAL"] = config;
  process.env["GIT_CONFIG_NOSYSTEM"] = "1";
  return dir;
}

scavengeStaleRuns();
const WORKER_DIR = pinGitEnvironment();
process.on("exit", () => {
  try {
    rmSync(WORKER_DIR, { recursive: true, force: true });
  } catch {
    // The stale sweep collects it later.
  }
});

/** A git call under the pinned configuration. */
export function git(repo: string, ...args: string[]): void {
  execFileSync("git", args, { cwd: repo, stdio: "ignore", windowsHide: true });
}

// --- Templates: built once per seed, copied per test --------------------------

const TEMPLATES = new Map<string, string>();
let templateCount = 0;

function writeFiles(root: string, files: Record<string, string>): void {
  for (const [rel, text] of Object.entries(files)) {
    const path = join(root, ...rel.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
  }
}

/**
 * The directory a template lives in: `repo` inside it, and `remote.git`
 * beside it when the seed wants an upstream. Built on first use for a
 * distinct (files, remote) pair and reused for the rest of the worker's life.
 */
function templateFor(files: Record<string, string>, withRemote: boolean): string {
  const key = JSON.stringify([withRemote, files]);
  const known = TEMPLATES.get(key);
  if (known !== undefined) return known;
  templateCount += 1;
  const target = join(WORKER_DIR, `template-${templateCount}`);
  const repo = join(target, "repo");
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "-q");
  if (Object.keys(files).length > 0) {
    writeFiles(repo, files);
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "seed");
  }
  if (withRemote) {
    git(target, "init", "-q", "--bare", join(target, "remote.git"));
    git(repo, "remote", "add", "origin", "../remote.git");
    git(repo, "push", "-q", "-u", "origin", "main");
  }
  TEMPLATES.set(key, target);
  return target;
}

/** A private copy of a template's `repo` (and `remote.git`, when it has one). */
function copyTemplate(template: string, target: string): void {
  for (const name of ["repo", "remote.git"]) {
    const source = join(template, name);
    if (existsSync(source)) cpSync(source, join(target, name), { recursive: true });
  }
}

/** A real git repository, because that is how a project is discovered. */
export function makeProject(): string {
  const target = makeTempDir();
  copyTemplate(templateFor({}, false), target);
  return join(target, "repo");
}

/**
 * `git init` at `repo`. With the configuration pinned for the worker, a
 * plain init and an init `-b main` are the same repository, so both are a
 * copy of the empty template; any other flag runs the real command.
 */
export function initRepo(repo: string, ...initArgs: string[]): string {
  const plain = initArgs.length === 0 || initArgs.join(" ") === "-b main";
  if (plain) {
    mkdirSync(dirname(repo), { recursive: true });
    cpSync(join(templateFor({}, false), "repo"), repo, { recursive: true });
    return repo;
  }
  mkdirSync(repo, { recursive: true });
  git(repo, "init", "-q", ...initArgs);
  return repo;
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
  const target = makeTempDir();
  copyTemplate(templateFor(files, false), target);
  return join(target, "repo");
}

/**
 * A committed repository and the bare `origin` its branch tracks, as a
 * private pair under one temp directory.
 */
export function makeRepoPair(files: Record<string, string>): { repo: string; sessionsDir: string } {
  const target = makeTempDir();
  copyTemplate(templateFor(files, true), target);
  const repo = join(target, "repo");
  return { repo, sessionsDir: join(repo, "docs", "sessions") };
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
  return makeRepoPair(SANDBOX_SEED);
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
