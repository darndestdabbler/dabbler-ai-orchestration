// Recorded git answers through the `journal.runGit` seam, and a temp
// directory for records that live on disk without a repository.
//
// A test that asks the framework a question whose answer comes from git
// declares what git would have said and asserts the decision made from it:
// no process, no checkout. An unfed question throws with its argv, so a
// missing answer names itself rather than passing for the wrong reason.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { setGitSource, type RunGitOptions } from "../../src/journal.ts";
import { NoCandidateError, setRouteSource, type RouteOptions, type RouteResult } from "../../src/route.ts";
import { SANDBOX_SEED } from "./repo.ts";

const ROOT = join(tmpdir(), "dabbler-router-tests");

/** A fresh directory under the suite's one temp root. */
export function tempDir(prefix = "t-"): string {
  mkdirSync(ROOT, { recursive: true });
  return mkdtempSync(join(ROOT, prefix));
}

/** Write files under `root`, creating directories as needed. */
export function seed(root: string, files: Record<string, string>): void {
  for (const [rel, text] of Object.entries(files)) {
    const path = join(root, ...rel.split("/"));
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text, "utf8");
  }
}

export type ArgsPattern =
  | readonly string[]
  | ((args: readonly string[], repoRoot: string) => boolean);

export interface Answer {
  readonly code?: number;
  readonly stdout?: string;
  readonly bytes?: Buffer;
  readonly stderr?: string;
}

export type AnswerRow = readonly [ArgsPattern, Answer | ((args: readonly string[], repoRoot: string) => Answer)];

function matches(pattern: ArgsPattern, args: readonly string[], repoRoot: string): boolean {
  if (typeof pattern === "function") return pattern(args, repoRoot);
  return pattern.length <= args.length && pattern.every((token, index) => token === args[index]);
}

/**
 * Install a table of answers; first matching row wins. Returns the function
 * that restores the real git, which a test calls when it is done (or never,
 * for a file that answers the same way throughout).
 */
export function gitAnswers(table: ReadonlyArray<AnswerRow>): () => void {
  return setGitSource(
    (repoRoot: string, args: readonly string[], _options: RunGitOptions, encoding: "utf8" | "buffer") => {
      for (const [pattern, answer] of table) {
        if (!matches(pattern, args, repoRoot)) continue;
        const resolved = typeof answer === "function" ? answer(args, repoRoot) : answer;
        const stdout =
          encoding === "buffer"
            ? (resolved.bytes ?? Buffer.from(resolved.stdout ?? "", "utf8"))
            : (resolved.stdout ?? "");
        return { code: resolved.code ?? 0, stdout, stderr: resolved.stderr ?? "" };
      }
      throw new Error(`no recorded git answer for: git ${args.join(" ")} (in ${repoRoot})`);
    },
  );
}

/** One scripted reply from the router: which provider answers, and what it says. */
export type Reply = readonly [provider: string, body: string];

export interface RoutedCall {
  readonly content: string;
  readonly role: string;
  readonly exclude: string[];
}

/**
 * Script the router: each call takes the next reply in order. A reply from
 * an excluded provider throws the router's own no-candidate refusal unless
 * `honourExclusion` is off, which is how a test proves the caller checks
 * exclusion itself. Records every call. Returns the restore function.
 */
export function routeAnswers(
  replies: readonly Reply[],
  options: { honourExclusion?: boolean; simulated?: boolean; transport?: string; calls?: RoutedCall[] } = {},
): () => void {
  const queue = [...replies];
  const calls = options.calls ?? [];
  return setRouteSource((content: string, routeOptions: RouteOptions) => {
    const exclude = [...(routeOptions.excludeProviders ?? [])];
    calls.push({ content, role: String(routeOptions.role), exclude });
    const next = queue.shift();
    if (next === undefined) throw new Error("the scripted router ran out of replies");
    const [provider, body] = next;
    if ((options.honourExclusion ?? true) && exclude.includes(provider)) {
      throw new NoCandidateError(`${provider} is excluded`);
    }
    const result: RouteResult = {
      content: body,
      model_name: `${provider}-model`,
      model_id: "x",
      provider,
      input_tokens: 1,
      output_tokens: 1,
      escalated: false,
      escalation_history: [],
      elapsed_seconds: 0.1,
      transport: options.transport ?? "offline",
      truncated: false,
      transport_session_id: null,
      served_model_id: null,
      metadata: options.simulated ? { simulated: true } : {},
    };
    return Promise.resolve(result);
  });
}

/** A schema-valid router config, deep-copied, with top-level keys replaced. */
export function makeConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const provider = {
    rate_limit: { requests_per_minute: 1000, tokens_per_minute: 1000000 },
    timeout_seconds: 30,
    retry: { max_retries: 1, backoff_base_seconds: 0 },
  };
  return {
    providers: {
      anthropic: { api_key_env: "TEST_ANTHROPIC_KEY", base_url: "https://fake.anthropic.test/v1/messages", ...provider },
      google: { api_key_env: "TEST_GOOGLE_KEY", base_url: "https://fake.google.test/v1beta", ...provider },
      openai: { api_key_env: "TEST_OPENAI_KEY", base_url: "https://fake.openai.test/v1", ...provider },
    },
    models: {
      flash: { provider: "google", model_id: "g-flash", max_context_tokens: 1000000, max_output_tokens: 65536 },
      pro: { provider: "google", model_id: "g-pro", max_context_tokens: 1000000, max_output_tokens: 65536 },
      sonnet: { provider: "anthropic", model_id: "a-sonnet", max_context_tokens: 200000, max_output_tokens: 16000 },
      opus: { provider: "anthropic", model_id: "a-opus", max_context_tokens: 200000, max_output_tokens: 32000 },
      gpt: { provider: "openai", model_id: "o-gpt", max_context_tokens: 272000, max_output_tokens: 32000 },
    },
    roles: {
      generator: { prefer: ["g-flash", "g-pro", "a-opus"], require_provider_in: ["anthropic", "openai", "google"] },
      verifier: { prefer: ["o-gpt", "a-sonnet"], require_provider_in: ["anthropic", "openai", "google"] },
    },
    escalation: {
      enabled: true,
      max_escalations: 2,
      triggers: { empty_response: true, max_tokens_hit: true, min_output_tokens: 30, refusal_detection: true },
      refusal_phrases: ["i can't help with", "i'm unable to"],
    },
    transports: { "copilot-cli": { lockfile: "copilot-catalog.lock" } },
    metrics: { enabled: true },
    ...overrides,
  };
}

/** The three provider keys `makeConfig` names, set so selection does not refuse reachability. */
export function setProviderKeys(): void {
  for (const name of ["TEST_ANTHROPIC_KEY", "TEST_GOOGLE_KEY", "TEST_OPENAI_KEY"]) process.env[name] = "test-key";
}

/** The answers a state directory's writers ask for: the root, and a clean tree. */
export function cleanRepoAnswers(repo: string): () => void {
  return gitAnswers([
    [["rev-parse", "--show-toplevel"], { stdout: repo.split("\\").join("/") }],
    [["status", "--porcelain", "-uall"], { stdout: "" }],
    [["status", "--porcelain"], { stdout: "" }],
    [(args) => args[0] === "cat-file" && args[1] === "-e", { code: 0 }],
    [["commit-tree"], { stdout: "c".repeat(40) }],
    [["update-ref"], { code: 0 }],
  ]);
}

// --- A checkout that answers, without a repository ----------------------------

const HEAD_COMMIT = "a1b2c3d4".repeat(5);
const ANCHOR_COMMIT = "c".repeat(40);

/**
 * `git init` in a directory: the one thing about it a test can see is the
 * `.git/` it leaves, so the answer leaves one. The framework places a
 * repository beside this one this way, and what the tests then read is the
 * declaration written into it.
 */
export const GIT_INIT: AnswerRow = [
  ["init"],
  (_args, repoRoot) => {
    mkdirSync(join(repoRoot, ".git"), { recursive: true });
    return { code: 0 };
  },
];

/**
 * A directory that answers git's questions the way a clean, pushed checkout
 * of `main` with an `origin` would, and the handles a test uses to say
 * otherwise. `calls` is every argv asked, in order.
 */
export interface AnsweredRepo {
  readonly repo: string;
  readonly calls: string[][];
  readonly restore: () => void;
  /** What `git status --porcelain` prints; "" is a clean tree. */
  status(text: string): void;
  /** Commits ahead of the upstream; 0 is pushed. */
  ahead(count: number): void;
}

/** The same, seeded with the sandbox and naming where its sessions live. */
export interface AnsweredSandbox extends AnsweredRepo {
  readonly sessionsDir: string;
}

/** The paths under `root` that a tree of it would list, in git's spelling. */
function treeListing(root: string, prefix = ""): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (prefix === "" && (entry.name === ".git" || entry.name === ".dabbler")) continue;
    const rel = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) paths.push(...treeListing(join(root, entry.name), rel));
    else paths.push(rel);
  }
  return paths.sort();
}

/**
 * What `write-tree` answers: a digest over the files on disk, so a tree
 * that changed answers differently and one that did not answers the same
 * -- which is the one property of a tree id the framework relies on.
 */
function diskTree(root: string): string {
  const hash = createHash("sha1");
  for (const path of treeListing(root)) {
    hash.update(path).update("\0").update(readFileSync(join(root, ...path.split("/")))).update("\0");
  }
  return hash.digest("hex");
}

/**
 * `files` on disk, a `.git/` so the checks that look for a repository on
 * disk find one, and git answering from a table: HEAD holds the tree the
 * files made, the worktree snapshots to whatever is on disk now, the tree
 * is clean until a test says otherwise through the setters, and when
 * `origin` is asked for the branch tracks one and is pushed. The table is
 * installed for the process until `restore` is called, or until the next
 * one replaces it, which is what a file of independent tests wants.
 */
export function makeAnsweredRepo(
  files: Record<string, string>,
  options: { origin?: boolean } = {},
): AnsweredRepo {
  const target = tempDir("answered-");
  const repo = join(target, "repo");
  seed(repo, files);
  mkdirSync(join(repo, ".git"), { recursive: true });
  const posixRepo = repo.split("\\").join("/");
  const withOrigin = options.origin === true;
  const state = { status: "", ahead: 0, headTree: diskTree(repo) };
  const config = new Map<string, string[]>(
    withOrigin
      ? [
          ["remote.origin.url", ["../remote.git"]],
          ["remote.origin.fetch", ["+refs/heads/*:refs/remotes/origin/*"]],
          ["branch.main.remote", ["origin"]],
          ["branch.main.merge", ["refs/heads/main"]],
        ]
      : [],
  );
  const calls: string[][] = [];
  const restore = gitAnswers([
    // Records every question and answers none of them.
    [(args) => { calls.push([...args]); return false; }, {}],
    [["rev-parse", "--show-toplevel"], { stdout: posixRepo }],
    [["rev-parse", "--verify", "HEAD"], { stdout: HEAD_COMMIT }],
    [["rev-parse", "--short", "HEAD"], { stdout: HEAD_COMMIT.slice(0, 7) }],
    [
      ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"],
      withOrigin ? { stdout: "origin/main" } : { code: 128, stderr: "fatal: no upstream configured for branch 'main'" },
    ],
    [["rev-parse", "HEAD"], { stdout: HEAD_COMMIT }],
    [(args) => args[0] === "rev-parse" && String(args[1]).endsWith("^{tree}"), () => ({ stdout: state.headTree })],
    [(args) => args[0] === "symbolic-ref", { stdout: "main" }],
    [["status"], () => ({ stdout: state.status })],
    [
      ["remote", "get-url"],
      (args) => (withOrigin && args[2] === "origin" ? { stdout: "../remote.git" } : { code: 2 }),
    ],
    [["remote"], { stdout: withOrigin ? "origin" : "" }],
    [
      ["rev-list", "--count", "@{u}..HEAD"],
      () => (withOrigin ? { stdout: String(state.ahead) } : { code: 128, stderr: "fatal: no upstream configured" }),
    ],
    [["push"], { code: 0 }],
    [["read-tree"], { code: 0 }],
    [["add"], { code: 0 }],
    [["rm", "--cached"], { code: 0 }],
    [["write-tree"], () => ({ stdout: diskTree(repo) })],
    [["commit-tree"], { stdout: ANCHOR_COMMIT }],
    [["update-ref"], { code: 0 }],
    [["commit"], { code: 0 }],
    [(args) => args[0] === "cat-file" && args[1] === "-e", { code: 0 }],
    [
      (args) => args[0] === "cat-file" && args[1] === "blob",
      (args) => {
        const path = join(repo, ...String(args[2]).slice(41).split("/"));
        return existsSync(path) ? { bytes: readFileSync(path) } : { code: 128 };
      },
    ],
    [["ls-tree", "-r", "--name-only", "-z"], () => ({ stdout: treeListing(repo).join("\0") })],
    [
      (args) => args[0] === "config" && (args[1] === "--get-all" || args[1] === "--get"),
      (args) => {
        const values = config.get(String(args[2]));
        return values === undefined ? { code: 1 } : { stdout: values.join("\n") };
      },
    ],
    [
      ["config", "--add"],
      (args) => {
        const key = String(args[2]);
        config.set(key, [...(config.get(key) ?? []), String(args[3])]);
        return { code: 0 };
      },
    ],
    [["for-each-ref"], { stdout: "" }],
    [["diff", "--cached", "--quiet"], { code: 1 }],
    // Two trees differ by nothing when they are the same tree; a diff
    // between two different ones is a fact the test has to state.
    [
      ["diff", "--name-only", "-z", "--no-ext-diff"],
      (args) => {
        if (args[4] === args[5]) return { stdout: "" };
        throw new Error(`no recorded git answer for a diff between two trees: git ${args.join(" ")}`);
      },
    ],
    GIT_INIT,
  ]);
  return {
    repo,
    calls,
    restore,
    status: (text) => { state.status = text; },
    ahead: (count) => { state.ahead = count; },
  };
}

/**
 * The sandbox seed with `extra` over it, answering as above, and where its
 * sessions live. A test that only needed a sessions directory takes `repo`
 * and `sessionsDir` and ignores the rest.
 */
export function makeAnsweredSandbox(extra: Record<string, string> = {}): AnsweredSandbox {
  const answered = makeAnsweredRepo({ ...SANDBOX_SEED, ...extra }, { origin: true });
  return { ...answered, sessionsDir: join(answered.repo, "docs", "sessions") };
}
