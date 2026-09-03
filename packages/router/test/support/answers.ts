// Recorded git answers through the `journal.runGit` seam, and a temp
// directory for records that live on disk without a repository.
//
// A test that asks the framework a question whose answer comes from git
// declares what git would have said and asserts the decision made from it:
// no process, no checkout. An unfed question throws with its argv, so a
// missing answer names itself rather than passing for the wrong reason.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { setGitSource, type RunGitOptions } from "../../src/journal.ts";
import { NoCandidateError, setRouteSource, type RouteOptions, type RouteResult } from "../../src/route.ts";

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
