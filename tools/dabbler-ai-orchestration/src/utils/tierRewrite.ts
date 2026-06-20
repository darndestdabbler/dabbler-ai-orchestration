// Set 061 Session 3 (spec D4): pure spec-rewrite helper for the
// `Switch Tier…` action plus the switch-to-full guardrail predicate.
//
// `rewriteSpecTier` takes the full spec.md text and a target tier and
// rewrites ONLY the `tier:` scalar inside the Session Set Configuration
// YAML block — every other byte of the document (including the rest of
// the matched line: indentation, key spacing, quote style, trailing
// comment, CRLF terminator) is preserved verbatim. `tier` strings
// outside the configuration block are never touched, and a
// commented-out `# tier: …` line inside the block does not match.
//
// The module is intentionally VS Code-free and filesystem-free (the
// guardrail predicate takes an injected existence check) so the D4
// rewrite matrix and guardrails are unit-testable without a host.

import { Tier } from "./consumerBootstrap";
import { providerKeyPresent } from "./gettingStartedDetection";

// Mirrors the block-location regex in `parseSessionSetConfig`
// (fileSystem.ts) — the rewrite must agree with the parser about WHICH
// region of the spec is "the configuration block" — restructured into
// (prefix)(body)(closing fence) groups so the body's offset is
// computable for an in-place splice.
const CONFIG_BLOCK_RE =
  /(##\s*Session Set Configuration[\s\S]*?```ya?ml\s*)([\s\S]*?)(```)/i;

// Mirrors the parser's `stringRe("tier")` (optional single/double
// quotes around the scalar, optional trailing `# comment`) but captures
// the pieces around the value so the replacement preserves them. The
// optional `\r` keeps CRLF specs byte-identical outside the value
// (JS `m`-mode `$` matches before the `\n` only; `.` excludes `\r`).
const TIER_LINE_RE =
  /^([ \t]*tier[ \t]*:[ \t]*)(?:"([\w-]+)"|'([\w-]+)'|([\w-]+))([ \t]*(?:#[^\r\n]*)?\r?)$/im;

export type TierRewriteOutcome =
  // The value was rewritten (or the key inserted) — `text` differs.
  | "rewritten"
  // The spec already declares (or defaults to) the target tier.
  | "already-target"
  // No Session Set Configuration block — nothing safe to rewrite.
  | "no-config-block";

export interface TierRewriteResult {
  /** The rewritten document (identical to the input when !changed). */
  text: string;
  changed: boolean;
  outcome: TierRewriteOutcome;
  /** The effective tier before the rewrite ("full" when the key is absent). */
  previousTier: Tier;
}

/**
 * Rewrite the `tier:` value in `specText`'s Session Set Configuration
 * block to `target`, preserving all other content byte-for-byte.
 *
 * Key-absent specs are effectively `tier: full` (the parser default):
 * switching one to `full` is a no-op, while switching to `lightweight`
 * inserts an explicit `tier: lightweight` line at the top of the block
 * (the one case where a rewrite has no value to replace). An unknown
 * on-disk value (e.g. a typo'd `tier: ful`) also parses as `full`, so
 * the same default governs `previousTier` / `already-target` there —
 * but the malformed scalar itself is still rewritten to the canonical
 * target so the switch repairs the typo rather than stacking keys.
 */
export function rewriteSpecTier(specText: string, target: Tier): TierRewriteResult {
  const block = CONFIG_BLOCK_RE.exec(specText);
  if (!block) {
    return { text: specText, changed: false, outcome: "no-config-block", previousTier: "full" };
  }
  const bodyStart = block.index + block[1].length;
  const body = block[2];

  const line = TIER_LINE_RE.exec(body);
  if (!line) {
    // Key absent → effective tier is the parser default "full".
    if (target === "full") {
      return { text: specText, changed: false, outcome: "already-target", previousTier: "full" };
    }
    // Insert an explicit declaration as the block's first line, reusing
    // the block's own newline flavor so CRLF specs stay uniform.
    const newline = body.includes("\r\n") || (!body.includes("\n") && specText.includes("\r\n"))
      ? "\r\n"
      : "\n";
    const insertion = `tier: ${target}${newline}`;
    const text =
      specText.slice(0, bodyStart) + insertion + specText.slice(bodyStart);
    return { text, changed: true, outcome: "rewritten", previousTier: "full" };
  }

  const rawValue = (line[2] ?? line[3] ?? line[4] ?? "").toLowerCase();
  // Unknown scalars parse as "full" (parseSessionSetConfig's fallback);
  // report that as the previous tier so callers describe the effective
  // state, not the typo.
  const previousTier: Tier = rawValue === "lightweight" ? "lightweight" : "full";
  if (rawValue === target) {
    return { text: specText, changed: false, outcome: "already-target", previousTier };
  }

  // Preserve the original quote style around the replaced value.
  const quote = line[2] !== undefined ? '"' : line[3] !== undefined ? "'" : "";
  const rewrittenLine = `${line[1]}${quote}${target}${quote}${line[5]}`;
  const lineStart = bodyStart + (line.index ?? 0);
  const lineEnd = lineStart + line[0].length;
  const text =
    specText.slice(0, lineStart) + rewrittenLine + specText.slice(lineEnd);
  return { text, changed: true, outcome: "rewritten", previousTier };
}

// ---------- D4 switch-to-full guardrails ----------

/**
 * Relative path of the router config whose absence triggers the second
 * D4 warning. Matches the file `Dabbler: Install ai-router` seeds and
 * the Lightweight scaffold deliberately removes (Set 058 divergence).
 */
export const ROUTER_CONFIG_REL = "ai_router/router-config.yaml";

/**
 * Compute the D4 switch-to-full warning list. Warnings INFORM — they
 * never block the switch (the caller shows them after applying the
 * rewrite). Pure: env and the existence check are injected.
 *
 * - No provider API key visible (reuses the Set 060 D6
 *   `providerKeyPresent` predicate over the same three key vars).
 * - `ai_router/router-config.yaml` missing under the workspace root,
 *   pointing at `Dabbler: Install ai-router`.
 */
export function switchToFullWarnings(
  routerConfigExists: boolean,
  env: Record<string, string | undefined>,
): string[] {
  const warnings: string[] = [];
  if (!providerKeyPresent(env)) {
    warnings.push(
      "No provider API key (DABBLER_ANTHROPIC_API_KEY / DABBLER_OPENAI_API_KEY / DABBLER_GEMINI_API_KEY) is visible to VS Code — Full-tier routing needs at least one. Set a key, then reload the window.",
    );
  }
  if (!routerConfigExists) {
    warnings.push(
      "ai_router/router-config.yaml was not found in this workspace — run \"Dabbler: Install ai-router\" to set up the router before the first Full-tier session.",
    );
  }
  return warnings;
}
