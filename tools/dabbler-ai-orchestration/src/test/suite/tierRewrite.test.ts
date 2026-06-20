import * as assert from "assert";
import {
  ROUTER_CONFIG_REL,
  rewriteSpecTier,
  switchToFullWarnings,
} from "../../utils/tierRewrite";

// Set 061 Session 3 (spec D4): the pure spec-rewrite helper matrix +
// the switch-to-full guardrail predicate. The session-3 step list pins
// the matrix shape: present / absent / commented `tier:` variants, and
// non-config `tier` strings elsewhere in the spec staying untouched.

function spec(blockBody: string, opts?: { pre?: string; post?: string }): string {
  // NB: the default prose deliberately avoids the literal `tier: <value>`
  // shape — several tests build their expected output with
  // `input.replace(...)`, which substitutes the FIRST occurrence. The
  // dedicated outside-the-block test supplies its own pre/post.
  const pre = opts?.pre ?? "# Some Spec\n\n> intro prose mentioning the Full tier casually\n\n";
  const post =
    opts?.post ??
    "\n\n## Sessions\n\nProse about the lightweight tier and `tier: lightweight` in code.\n";
  return `${pre}## Session Set Configuration\n\n\`\`\`yaml\n${blockBody}\`\`\`${post}`;
}

suite("tierRewrite — rewriteSpecTier (D4 matrix)", () => {
  test("present unquoted value is rewritten in place, all other bytes preserved", () => {
    const input = spec("totalSessions: 4\ntier: full\nrequiresUAT: false\n");
    const result = rewriteSpecTier(input, "lightweight");
    assert.strictEqual(result.changed, true);
    assert.strictEqual(result.outcome, "rewritten");
    assert.strictEqual(result.previousTier, "full");
    assert.strictEqual(
      result.text,
      input.replace("tier: full", "tier: lightweight"),
      "only the tier value may change",
    );
  });

  test("round-trips: switching back restores the original text byte-for-byte", () => {
    const input = spec("tier: full\nrequiresUAT: false\n");
    const there = rewriteSpecTier(input, "lightweight");
    const back = rewriteSpecTier(there.text, "full");
    assert.strictEqual(back.text, input);
  });

  test("double-quoted value keeps its quote style", () => {
    const input = spec('tier: "lightweight"\nrequiresUAT: false\n');
    const result = rewriteSpecTier(input, "full");
    assert.strictEqual(result.previousTier, "lightweight");
    assert.ok(result.text.includes('tier: "full"'), "double quotes preserved");
    assert.ok(!result.text.includes('tier: "lightweight"'));
  });

  test("single-quoted value keeps its quote style", () => {
    const input = spec("tier: 'full'\nrequiresUAT: false\n");
    const result = rewriteSpecTier(input, "lightweight");
    assert.ok(result.text.includes("tier: 'lightweight'"), "single quotes preserved");
  });

  test("trailing YAML comment and indentation survive the rewrite", () => {
    const input = spec("  tier:  full   # chosen at scaffold time\n");
    const result = rewriteSpecTier(input, "lightweight");
    assert.ok(
      result.text.includes("  tier:  lightweight   # chosen at scaffold time"),
      `comment/spacing must be preserved; got: ${result.text}`,
    );
  });

  test("CRLF specs stay CRLF and only the value changes", () => {
    const input = spec("totalSessions: 4\ntier: full\n").replace(/\n/g, "\r\n");
    const result = rewriteSpecTier(input, "lightweight");
    assert.strictEqual(result.changed, true);
    assert.strictEqual(
      result.text,
      input.replace("tier: full", "tier: lightweight"),
      "CRLF document must be byte-identical outside the value",
    );
  });

  test("already on the target tier → no-op, text unchanged", () => {
    const input = spec("tier: lightweight\n");
    const result = rewriteSpecTier(input, "lightweight");
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.outcome, "already-target");
    assert.strictEqual(result.text, input);
  });

  test("absent tier key + target full → already-target (parser default is full)", () => {
    const input = spec("totalSessions: 4\nrequiresUAT: false\n");
    const result = rewriteSpecTier(input, "full");
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.outcome, "already-target");
    assert.strictEqual(result.previousTier, "full");
  });

  test("absent tier key + target lightweight → explicit declaration inserted at block top", () => {
    const input = spec("totalSessions: 4\nrequiresUAT: false\n");
    const result = rewriteSpecTier(input, "lightweight");
    assert.strictEqual(result.changed, true);
    assert.ok(
      result.text.includes("```yaml\ntier: lightweight\ntotalSessions: 4\n"),
      `tier line should be inserted first in the block; got: ${result.text}`,
    );
    // Everything outside the insertion is preserved.
    assert.strictEqual(result.text.replace("tier: lightweight\n", ""), input);
  });

  test("absent key insertion uses CRLF on a CRLF document", () => {
    const input = spec("totalSessions: 4\n").replace(/\n/g, "\r\n");
    const result = rewriteSpecTier(input, "lightweight");
    assert.ok(result.text.includes("tier: lightweight\r\ntotalSessions: 4"));
  });

  test("commented-out tier line does not match — treated as absent", () => {
    const input = spec("totalSessions: 4\n# tier: lightweight\n");
    const result = rewriteSpecTier(input, "lightweight");
    assert.strictEqual(result.changed, true);
    assert.ok(
      result.text.includes("# tier: lightweight"),
      "the commented line must survive untouched",
    );
    assert.ok(
      result.text.includes("```yaml\ntier: lightweight\ntotalSessions: 4"),
      "an explicit declaration is inserted instead of editing the comment",
    );
  });

  test("tier strings OUTSIDE the configuration block are never touched", () => {
    const pre = "# Spec\n\ntier: lightweight\n\n";
    const post = "\n\n## Notes\n\ntier: full\n";
    const input = spec("tier: full\n", { pre, post });
    const result = rewriteSpecTier(input, "lightweight");
    assert.ok(result.text.startsWith(pre), "prose before the block untouched");
    assert.ok(result.text.endsWith(post), "prose after the block untouched");
    const occurrences = result.text.match(/tier: lightweight/g) ?? [];
    assert.strictEqual(occurrences.length, 2, "only the block's value flips (plus the pre-existing prose one)");
  });

  test("unknown scalar (typo) parses as effective full and is repaired to the target", () => {
    const input = spec("tier: ful\n");
    const toLightweight = rewriteSpecTier(input, "lightweight");
    assert.strictEqual(toLightweight.previousTier, "full");
    assert.ok(toLightweight.text.includes("tier: lightweight"));
    assert.ok(!toLightweight.text.includes("tier: ful\n"), "typo'd scalar replaced, not stacked");
  });

  test("typo'd scalar + same-tier target still rewrites — the repair path (S061-S3-V1-002)", () => {
    // `tier: ful` parses as effective "full"; picking Full again must
    // repair the malformed scalar rather than no-op (the command defers
    // the decision to the helper instead of comparing parsed tiers).
    const input = spec("tier: ful\n");
    const result = rewriteSpecTier(input, "full");
    assert.strictEqual(result.changed, true);
    assert.strictEqual(result.outcome, "rewritten");
    assert.strictEqual(result.previousTier, "full");
    assert.ok(result.text.includes("tier: full\n"));
  });

  test("case-variant valid scalar is already-target (parser lowercases too)", () => {
    // parseSessionSetConfig lowercases before validating, so
    // `tier: LIGHTWEIGHT` is effectively lightweight — switching to
    // lightweight is a no-op, matching the parser's read.
    const input = spec("tier: LIGHTWEIGHT\n");
    const result = rewriteSpecTier(input, "lightweight");
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.outcome, "already-target");
    assert.strictEqual(result.previousTier, "lightweight");
  });

  test("no Session Set Configuration block → no-config-block, text unchanged", () => {
    const input = "# Spec with no config\n\ntier: full\n\n## Sessions\n";
    const result = rewriteSpecTier(input, "lightweight");
    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.outcome, "no-config-block");
    assert.strictEqual(result.text, input);
  });
});

suite("tierRewrite — switchToFullWarnings (D4 guardrails)", () => {
  const KEYED = { DABBLER_ANTHROPIC_API_KEY: "sk-test" };

  test("no warnings when a provider key is visible and router config exists", () => {
    assert.deepStrictEqual(switchToFullWarnings(true, KEYED), []);
  });

  test("missing provider key warns (any one of the three suffices)", () => {
    const warnings = switchToFullWarnings(true, {});
    assert.strictEqual(warnings.length, 1);
    assert.ok(/provider API key/i.test(warnings[0]));
    for (const env of [
      { DABBLER_ANTHROPIC_API_KEY: "a" },
      { DABBLER_OPENAI_API_KEY: "b" },
      { DABBLER_GEMINI_API_KEY: "c" },
    ]) {
      assert.deepStrictEqual(switchToFullWarnings(true, env), [], JSON.stringify(env));
    }
  });

  test("whitespace-only key counts as absent (same posture as providerKeyPresent)", () => {
    const warnings = switchToFullWarnings(true, { DABBLER_ANTHROPIC_API_KEY: "   " });
    assert.strictEqual(warnings.length, 1);
  });

  test("missing router config warns and points at Dabbler: Install ai-router", () => {
    const warnings = switchToFullWarnings(false, KEYED);
    assert.strictEqual(warnings.length, 1);
    assert.ok(warnings[0].includes(ROUTER_CONFIG_REL.split("/")[1] ?? "router-config.yaml"));
    assert.ok(warnings[0].includes("Install ai-router"));
  });

  test("both conditions missing → both warnings, key warning first", () => {
    const warnings = switchToFullWarnings(false, {});
    assert.strictEqual(warnings.length, 2);
    assert.ok(/provider API key/i.test(warnings[0]));
    assert.ok(warnings[1].includes("Install ai-router"));
  });
});
