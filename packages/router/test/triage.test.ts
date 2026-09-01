// `dabbler triage`: who gets asked, what comes back, and what is refused.

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { CONFIG_ENV_VAR } from "../src/config.ts";
import { DRIVER_SCHEMA_VERSION, readRun, writeInstruction, writeRun } from "../src/driver.ts";
import { EXIT_OK, start } from "../src/session.ts";
import {
  clearProviderKeys,
  makeConfig,
  makeSandboxRepo,
  makeTempDir,
  removeTempDirs,
  setProviderKeys,
  writeYaml,
} from "./support/fixtures.ts";
import { join } from "node:path";

afterAll(removeTempDirs);

/**
 * The router, replaced.
 *
 * `triage` imports `route` by name, so the fake is installed at the module
 * boundary. `vi.hoisted` puts the shared state above the hoisted factory,
 * which is the only order that works.
 */
const state = vi.hoisted(() => ({
  replies: [] as Array<readonly [string, string]>,
  calls: [] as Array<{ content: string; exclude: string[]; role: string }>,
}));

vi.mock("../src/route.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/route.ts")>();
  return {
    ...actual,
    route: (content: string, options: Record<string, unknown> = {}) => {
      const exclude = (options.excludeProviders as string[]) ?? [];
      state.calls.push({ content, exclude: [...exclude], role: String(options.role) });
      const next = state.replies.shift();
      if (next === undefined) throw new Error("the fake router ran out of replies");
      const [provider, body] = next;
      if (exclude.includes(provider)) {
        throw new actual.NoCandidateError(`${provider} is excluded`);
      }
      return Promise.resolve({
        content: body,
        model_name: `${provider}-model`,
        model_id: "x",
        provider,
        input_tokens: 1,
        output_tokens: 1,
        escalated: false,
        escalation_history: [],
        elapsed_seconds: 0.1,
        transport: "offline",
        truncated: false,
        transport_session_id: null,
        served_model_id: null,
        metadata: {},
      });
    },
  };
});

const { TriageError, triage } = await import("../src/triage.ts");

const ANSWER = JSON.stringify({
  classification: "plan-defect",
  reasoning: "The step declares a file its own check forbids, so no report can satisfy both.",
  recommendation: "Amend the step's files and ask for it again.",
  amendment: {
    step_id: "widget",
    files: ["src/widget.py"],
    reason: "Dropping the file the check forbids is the smallest change that lets it pass.",
    relaxes_a_gate: false,
  },
});

/** A registered session whose run has stopped on a refused step. */
function stoppedSession(): { repo: string; sessionsDir: string } {
  const { repo, sessionsDir } = makeSandboxRepo();
  process.env[CONFIG_ENV_VAR] = writeYaml(
    join(makeTempDir(), "router-config.yaml"),
    makeConfig(),
  );
  expect(start(sessionsDir, { engine: "claude-code", provider: "anthropic" })).toBe(EXIT_OK);
  writeRun(repo, 1, {
    schema_version: DRIVER_SCHEMA_VERSION,
    session_number: 1,
    engine: "claude-code",
    phase: "steps",
    seq: 3,
    invocations: 0,
    max_invocations: 24,
    accepted_steps: [],
    baseline_tree: null,
    stop: {
      kind: "rejected-thrice",
      reason: "[files-changed-omits] files_changed omits 'src/widget.py', which the tree changed",
      at: "2026-08-31T12:00:00-04:00",
      step_id: "widget",
      class: "deadlock",
    },
    started_at: "2026-08-31T11:00:00-04:00",
    updated_at: "2026-08-31T12:00:00-04:00",
  });
  writeInstruction(repo, 1, {
    schema_version: DRIVER_SCHEMA_VERSION,
    seq: 3,
    session_number: 1,
    issued_at: "2026-08-31T12:00:00-04:00",
    kind: "rejection",
    step_id: "widget",
    ask: "Make widget() return 2.",
    reasons: [
      "[files-changed-omits] files_changed omits 'src/widget.py', which the tree changed",
    ],
    answer_schema: "driver-report.schema.json",
    answer_command: "dabbler session report --seq 3",
  });
  return { repo, sessionsDir };
}

beforeEach(() => {
  setProviderKeys();
  state.replies = [];
  state.calls = [];
});

describe("dabbler triage", () => {
  it("asks a provider that is not the working engine's, and refuses an answer that does not fit", async () => {
    const { sessionsDir } = stoppedSession();

    // The engine registered as `claude-code`/anthropic, so anthropic is
    // excluded and the adviser is somebody else.
    state.replies = [["openai", ANSWER]];
    const outcome = await triage(sessionsDir);
    expect(outcome.excluded).toEqual(["anthropic"]);
    expect(outcome.adviser.provider).toBe("openai");
    expect(outcome.answer.classification).toBe("plan-defect");
    expect(outcome.answer.amendment).toMatchObject({ step_id: "widget", relaxes_a_gate: false });
    expect(state.calls).toHaveLength(1);

    // The artifacts the adviser was given, not a summary of them: the stop
    // with its class, the refusal with its rule slug, and the rule as the
    // driver's own source states it.
    const asked = state.calls[0]?.content ?? "";
    expect(asked).toContain("class: deadlock");
    expect(asked).toContain("[files-changed-omits]");
    expect(asked).toContain("RULE.filesChangedOmits");
    expect(state.calls[0]?.exclude).toEqual(["anthropic"]);

    // A malformed answer is refused, never repaired -- once, and once more
    // when the shape is said again.
    state.calls = [];
    state.replies = [
      ["openai", "I think the plan is wrong."],
      ["openai", JSON.stringify({ classification: "nobody-s-fault", reasoning: "x", recommendation: "y" })],
    ];
    await expect(triage(sessionsDir)).rejects.toBeInstanceOf(TriageError);
    expect(state.calls).toHaveLength(2);

    clearProviderKeys();
    delete process.env[CONFIG_ENV_VAR];
  });

  it("asks nobody about a run that has not stopped", async () => {
    const { repo, sessionsDir } = stoppedSession();
    // The same run, still going. There is no stop to be a second opinion
    // about, and a provider call on a question with no subject is spent for
    // nothing.
    const run = readRun(repo, 1);
    writeRun(repo, 1, { ...run, stop: null });
    state.replies = [["openai", ANSWER]];
    await expect(triage(sessionsDir)).rejects.toThrow(/has not stopped/);
    expect(state.calls).toEqual([]);

    clearProviderKeys();
    delete process.env[CONFIG_ENV_VAR];
  });
});
