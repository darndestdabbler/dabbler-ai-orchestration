// Cross-vendor review of a step: who reads it, and what survives reading.
// The router is scripted through its seam; artifacts are files in a temp
// directory.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  MAX_ARTIFACT_CHARS,
  buildPrompt,
  digestText,
  review,
  reviewBlocked,
  reviewFindings,
  reviewSimulated,
  reviewVerdict,
} from "../src/stepreview.ts";
import { parseVerificationResponse } from "../src/verdict.ts";
import { routeAnswers, tempDir, type Reply, type RoutedCall } from "./support/answers.ts";

const CLEAN = "VERIFIED\nI checked the boundaries and the error paths.";
const ISSUES = "ISSUES FOUND\n\n- Severity: Major\n  Category: correctness\n  A row with a trailing comma yields a field the model cannot hold.\n";
const NIT = "ISSUES FOUND\n\nNITS\n\n- Severity: Minor\n  Category: style\n  The header casing is inconsistent.\n";
const ARTIFACT_TEXT = "# The plan\n\nRead a CSV into a flat model.\n";

function artifact(): string {
  const path = join(tempDir(), "plan.md");
  writeFileSync(path, ARTIFACT_TEXT, "utf8");
  return path;
}

async function runReview(replies: Reply[], path: string, options: { honourExclusion?: boolean; simulated?: boolean; authorProvider?: string | null; calls?: RoutedCall[] } = {}) {
  const restore = routeAnswers(replies, { honourExclusion: options.honourExclusion ?? true, simulated: options.simulated ?? false, calls: options.calls });
  try {
    return await review({ target: "csv-demo", step: "plan", artifactPaths: [path], authorProvider: options.authorProvider ?? null });
  } finally {
    restore();
  }
}

describe("what is reviewed", () => {
  it("refuses a missing artifact, naming nothing, and an oversize artifact rather than truncating it", async () => {
    await assert.rejects(review({ target: "t", step: "plan", artifactPaths: [join(tempDir(), "gone.md")] }), /no artifact at/);
    await assert.rejects(review({ target: "t", step: "plan", artifactPaths: [] }), /at least one artifact/);
    const big = join(tempDir(), "big.md");
    writeFileSync(big, "x".repeat(MAX_ARTIFACT_CHARS + 1), "utf8");
    await assert.rejects(review({ target: "t", step: "plan", artifactPaths: [big] }), /over the/);
  });

  it("demands the shape the parser reads, and states what the step owes", () => {
    // The prompt and `verdict.ts` are one contract. When they drifted, two
    // real reviews came back as unparseable blobs with no severity.
    const prompt = buildPrompt("csv-demo", "plan", [[artifact(), ARTIFACT_TEXT]]);
    const block = /^```\n(- \*\*Issue 1:[\s\S]*?)^```$/m.exec(prompt)?.[1];
    assert.ok(block !== undefined);
    const [parsed, findings] = parseVerificationResponse("ISSUES FOUND\n\n" + block.replace("Correctness / Completeness / Ambiguity", "Correctness").replace("Critical / Major", "Major"));
    assert.equal(parsed, "ISSUES_FOUND");
    assert.equal(findings[0]?.severity?.toLowerCase(), "major");
    assert.ok(prompt.includes("Evidence paths:"));
    const decompose = buildPrompt("csv-demo", "decompose", [[artifact(), ARTIFACT_TEXT]]);
    assert.ok(decompose.includes("More than one candidate decomposition") && decompose.includes("Read a CSV into a flat model."));
  });
});

describe("who reviews", () => {
  it("never lets the second reviewer share the first vendor, and excludes the author's provider from every reader", async () => {
    const calls: RoutedCall[] = [];
    await runReview([["anthropic", CLEAN], ["openai", CLEAN]], artifact(), { calls });
    assert.ok(calls[1]?.exclude.includes("anthropic"));
    const authored: RoutedCall[] = [];
    await runReview([["openai", CLEAN], ["google", CLEAN]], artifact(), { authorProvider: "anthropic", calls: authored });
    assert.ok(authored.every((call) => call.exclude.includes("anthropic")));
  });

  it("treats no second vendor as an error, not a verdict, and refuses one vendor answering twice despite exclusion", async () => {
    await assert.rejects(runReview([["openai", CLEAN], ["openai", CLEAN]], artifact()), /Cross-vendor review needs/);
    await assert.rejects(runReview([["openai", CLEAN], ["openai", CLEAN]], artifact(), { honourExclusion: false }), /despite being excluded/);
  });

  it("marks a scripted round as one", async () => {
    const [outcome] = await runReview([["offline", CLEAN], ["offline", CLEAN]], artifact(), { honourExclusion: false, simulated: true });
    assert.equal(reviewSimulated(outcome), true);
  });
});

describe("what survives", () => {
  it("blocks when either reviewer blocks, keeps every finding naming who raised it, and returns each reply verbatim", async () => {
    const [blocked, raws] = await runReview([["anthropic", CLEAN], ["openai", ISSUES]], artifact());
    assert.equal(reviewBlocked(blocked), true);
    assert.equal(reviewVerdict(blocked), "blocked");
    assert.deepEqual(raws, [CLEAN, ISSUES]);
    const [nits] = await runReview([["anthropic", CLEAN], ["openai", NIT]], artifact());
    assert.equal(reviewBlocked(nits), false);
    assert.equal(reviewFindings(nits)[0]?.reviewer, "openai-model/openai");
  });

  it("records what each artifact contained, so a later round compares against what was sent", async () => {
    const path = artifact();
    const [outcome] = await runReview([["anthropic", CLEAN], ["openai", ISSUES]], path);
    assert.deepEqual(outcome.artifactDigests, { [path]: digestText(ARTIFACT_TEXT) });
  });
});
