// Cross-vendor review of a step: who reads it, and what survives reading.

import { writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { parseVerificationResponse } from "../src/verdict.ts";
import { makeTempDir, removeTempDirs } from "./support/fixtures.ts";

afterAll(removeTempDirs);

/**
 * The router, replaced.
 *
 * `stepreview` imports `route` by name, so the fake has to be installed at
 * the module boundary rather than assigned onto an object. `vi.hoisted` puts
 * the shared state above the hoisted `vi.mock` factory, which is the only
 * order that works.
 */
const state = vi.hoisted(() => ({
  replies: [] as Array<readonly [string, string]>,
  honourExclusion: true,
  simulated: false,
  calls: [] as Array<{ content: string; exclude: string[]; role: string }>,
}));

vi.mock("../src/route.ts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/route.ts")>();
  return {
    ...actual,
    route: (content: string, options: Record<string, unknown> = {}) => {
      const exclude = (options.excludeProviders as string[]) ?? [];
      state.calls.push({
        content,
        exclude: [...exclude],
        role: String(options.role),
      });
      const next = state.replies.shift();
      if (next === undefined) throw new Error("the fake router ran out of replies");
      const [provider, body] = next;
      if (state.honourExclusion && exclude.includes(provider)) {
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
        metadata: state.simulated ? { simulated: true } : {},
      });
    },
  };
});

const {
  buildPrompt,
  digestText,
  MAX_ARTIFACT_CHARS,
  review,
  reviewBlocked,
  reviewFindings,
  reviewSimulated,
  reviewVerdict,
} = await import("../src/stepreview.ts");

const CLEAN = "VERIFIED\nI checked the boundaries and the error paths.";

const ISSUES = `ISSUES FOUND

- Severity: Major
  Category: correctness
  A row with a trailing comma yields a field the model cannot hold.
`;

const NIT = `ISSUES FOUND

NITS

- Severity: Minor
  Category: style
  The header casing is inconsistent.
`;

const ARTIFACT_TEXT = "# The plan\n\nRead a CSV into a flat model.\n";

function artifact(): string {
  const path = join(makeTempDir(), "plan.md");
  writeFileSync(path, ARTIFACT_TEXT, "utf8");
  return path;
}

beforeEach(() => {
  state.replies = [];
  state.honourExclusion = true;
  state.simulated = false;
  state.calls = [];
});

async function runReview(
  replies: Array<readonly [string, string]>,
  path: string,
  options: {
    honourExclusion?: boolean;
    simulated?: boolean;
    authorProvider?: string | null;
  } = {},
) {
  state.replies = [...replies];
  state.honourExclusion = options.honourExclusion ?? true;
  state.simulated = options.simulated ?? false;
  return review({
    target: "csv-demo",
    step: "plan",
    artifactPaths: [path],
    authorProvider: options.authorProvider ?? null,
  });
}

describe("what is reviewed", () => {
  it("refuses a missing artifact", async () => {
    await expect(
      review({
        target: "t",
        step: "plan",
        artifactPaths: [join(makeTempDir(), "gone.md")],
      }),
    ).rejects.toThrow(/no artifact at/);
  });

  it("refuses naming nothing", async () => {
    await expect(
      review({ target: "t", step: "plan", artifactPaths: [] }),
    ).rejects.toThrow(/at least one artifact/);
  });

  it("refuses an oversize artifact rather than truncating it", async () => {
    const big = join(makeTempDir(), "big.md");
    writeFileSync(big, "x".repeat(MAX_ARTIFACT_CHARS + 1), "utf8");
    await expect(
      review({ target: "t", step: "plan", artifactPaths: [big] }),
    ).rejects.toThrow(/over the/);
  });

  it("demands the shape the parser reads", () => {
    // The prompt and `verdict.ts` are one contract. When they drifted, two
    // real reviews came back as unparseable blobs with no severity.
    const prompt = buildPrompt("csv-demo", "plan", [[artifact(), ARTIFACT_TEXT]]);
    const block = /^```\n(- \*\*Issue 1:[\s\S]*?)^```$/m.exec(prompt)?.[1];
    expect(block).toBeDefined();
    const reply =
      "ISSUES FOUND\n\n" +
      (block as string)
        .replace("Correctness / Completeness / Ambiguity", "Correctness")
        .replace("Critical / Major", "Major");
    const [parsed, findings] = parseVerificationResponse(reply);
    expect(parsed).toBe("ISSUES_FOUND");
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity?.toLowerCase()).toBe("major");
  });

  it("states what the step owes", () => {
    const prompt = buildPrompt("csv-demo", "decompose", [
      [artifact(), ARTIFACT_TEXT],
    ]);
    expect(prompt).toContain("More than one candidate decomposition");
    expect(prompt).toContain("Read a CSV into a flat model.");
  });
});

describe("who reviews", () => {
  it("never lets the second reviewer share the first vendor", async () => {
    await runReview(
      [
        ["anthropic", CLEAN],
        ["openai", CLEAN],
      ],
      artifact(),
    );
    expect(state.calls[1]?.exclude).toContain("anthropic");
  });

  it("excludes the author's provider from every reader", async () => {
    await runReview(
      [
        ["openai", CLEAN],
        ["google", CLEAN],
      ],
      artifact(),
      { authorProvider: "anthropic" },
    );
    expect(state.calls.every((c) => c.exclude.includes("anthropic"))).toBe(true);
  });

  it("treats no second vendor as an error, not a verdict", async () => {
    await expect(
      runReview(
        [
          ["openai", CLEAN],
          ["openai", CLEAN],
        ],
        artifact(),
      ),
    ).rejects.toThrow(/Cross-vendor review needs/);
  });
});

// `route()` builds the offline candidate without consulting the exclusion, so
// the cross-vendor guarantee has to be checked here too.
describe("the scripted transport", () => {
  it("marks a scripted round as one", async () => {
    const [outcome] = await runReview(
      [
        ["offline", CLEAN],
        ["offline", CLEAN],
      ],
      artifact(),
      { honourExclusion: false, simulated: true },
    );
    expect(reviewSimulated(outcome)).toBe(true);
  });

  it("refuses one vendor answering twice rather than recording it", async () => {
    await expect(
      runReview(
        [
          ["openai", CLEAN],
          ["openai", CLEAN],
        ],
        artifact(),
        { honourExclusion: false },
      ),
    ).rejects.toThrow(/despite being excluded/);
  });
});

describe("what survives", () => {
  it("blocks when either reviewer blocks", async () => {
    const [outcome] = await runReview(
      [
        ["anthropic", CLEAN],
        ["openai", ISSUES],
      ],
      artifact(),
    );
    expect(reviewBlocked(outcome)).toBe(true);
    expect(reviewVerdict(outcome)).toBe("blocked");
  });

  it("keeps every finding and names who raised it", async () => {
    const [outcome] = await runReview(
      [
        ["anthropic", CLEAN],
        ["openai", NIT],
      ],
      artifact(),
    );
    expect(reviewBlocked(outcome)).toBe(false);
    const findings = reviewFindings(outcome);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.reviewer).toBe("openai-model/openai");
  });

  it("returns each reply verbatim for filing", async () => {
    const [, raws] = await runReview(
      [
        ["anthropic", CLEAN],
        ["openai", ISSUES],
      ],
      artifact(),
    );
    expect(raws).toEqual([CLEAN, ISSUES]);
  });

  it("records what each artifact contained", async () => {
    // A later round decides whether a finding was answered by checking
    // whether what it cited has changed since. That comparison is against the
    // text the reviewers were actually sent, not against whatever the file
    // says by the time anyone looks.
    const path = artifact();
    const [outcome] = await runReview(
      [
        ["anthropic", CLEAN],
        ["openai", ISSUES],
      ],
      path,
    );
    expect(outcome.artifactDigests).toEqual({ [path]: digestText(ARTIFACT_TEXT) });
  });

  it("asks for the citation the loop checks", () => {
    // A finding that cites nothing names no site to check, so it can never be
    // shown fixed and its session can only end unresolved. The prompt has to
    // ask for the field, in the shape the parser reads.
    const path = artifact();
    const prompt = buildPrompt("csv-demo", "plan", [[path, ARTIFACT_TEXT]]);
    expect(prompt).toContain("Evidence paths:");
    const [, findings] = parseVerificationResponse(
      "ISSUES FOUND\n\n- **Issue 1:** the boundary is wrong\n" +
        "  - **Severity:** Major\n" +
        `  - **Evidence paths:** ${path}\n`,
    );
    expect(findings[0]?.evidencePaths).toEqual([path.split("\\").join("/")]);
  });
});
