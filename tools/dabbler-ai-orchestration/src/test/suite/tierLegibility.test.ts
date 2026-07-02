// Set 061 Session 1 — Lightweight legibility (spec D1/D2).
//
// Covers the spec's step-4 test matrix:
//   - spec-config parsing of `verificationMode` (present / absent /
//     invalid values), alongside the already-parsed `tier`;
//   - the D1 plus-fraction predicate matrix (Full / LW Mode A /
//     LW Mode B before-and-after a typed verification session appears);
//   - the D2 "lw" tier-marker + tooltip helpers;
//   - end-to-end derivation through readSessionSets on disk fixtures.

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { SessionSet } from "../../types";
import {
  hasTypedVerificationSession,
  PLUS_FRACTION_TOOLTIP,
  shouldRenderPlusFraction,
  TIER_MARKER,
  TIER_MARKER_TOOLTIP,
  TIER_MISMATCH_MARKER,
  tierMarkerFor,
  tierMismatch,
  tierMismatchTooltipFor,
  tierTooltipFor,
} from "../../utils/tierLegibility";
import {
  fractionTooltip,
  tierMarker,
  tierTooltip,
} from "../../providers/SessionSetsModel";
import { parseSessionSetConfig, readSessionSets } from "../../utils/fileSystem";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-test-"));
}

// Minimal cast factory — the model helpers read only `config.tier` /
// `plusFraction` (same pattern as migrationMarker.test.ts).
function set(over: Partial<SessionSet>): SessionSet {
  return over as SessionSet;
}

suite("parseSessionSetConfig — verificationMode (Set 061 S1)", () => {
  test("absent field defaults to out-of-band-or-none", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    fs.writeFileSync(
      specPath,
      "## Session Set Configuration\n```yaml\ntier: lightweight\n```",
    );
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.verificationMode, "out-of-band-or-none");
    fs.rmSync(dir, { recursive: true });
  });

  test("parses verificationMode: dedicated-sessions", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    fs.writeFileSync(
      specPath,
      "## Session Set Configuration\n```yaml\ntier: lightweight\nverificationMode: dedicated-sessions\n```",
    );
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.verificationMode, "dedicated-sessions");
    fs.rmSync(dir, { recursive: true });
  });

  test("parses verificationMode: out-of-band-or-none explicitly", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    fs.writeFileSync(
      specPath,
      "## Session Set Configuration\n```yaml\nverificationMode: out-of-band-or-none\n```",
    );
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.verificationMode, "out-of-band-or-none");
    fs.rmSync(dir, { recursive: true });
  });

  test("invalid value falls back to the default (parser posture matches tier)", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    fs.writeFileSync(
      specPath,
      "## Session Set Configuration\n```yaml\nverificationMode: kitchen-sink\n```",
    );
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.verificationMode, "out-of-band-or-none");
    fs.rmSync(dir, { recursive: true });
  });

  test("inline YAML comment tolerated on the value", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    fs.writeFileSync(
      specPath,
      "## Session Set Configuration\n```yaml\nverificationMode: dedicated-sessions  # Set 057 Mode B\n```",
    );
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.verificationMode, "dedicated-sessions");
    fs.rmSync(dir, { recursive: true });
  });

  test("missing spec returns the default", () => {
    const cfg = parseSessionSetConfig("/nonexistent/spec.md");
    assert.strictEqual(cfg.verificationMode, "out-of-band-or-none");
  });

  // Verifier fix S061-S1-V1-001: YAML allows quoted scalars; the parser
  // must not silently fall back to defaults on them.
  test("double-quoted enum values parse (tier + verificationMode)", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    fs.writeFileSync(
      specPath,
      '## Session Set Configuration\n```yaml\ntier: "lightweight"\nverificationMode: "dedicated-sessions"\n```',
    );
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.tier, "lightweight");
    assert.strictEqual(cfg.verificationMode, "dedicated-sessions");
    fs.rmSync(dir, { recursive: true });
  });

  test("single-quoted enum values parse (tier + verificationMode)", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    fs.writeFileSync(
      specPath,
      "## Session Set Configuration\n```yaml\ntier: 'lightweight'\nverificationMode: 'dedicated-sessions'\n```",
    );
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.tier, "lightweight");
    assert.strictEqual(cfg.verificationMode, "dedicated-sessions");
    fs.rmSync(dir, { recursive: true });
  });

  test("quoted value with inline comment parses", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    fs.writeFileSync(
      specPath,
      '## Session Set Configuration\n```yaml\nverificationMode: "dedicated-sessions"  # Set 057 Mode B\n```',
    );
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.verificationMode, "dedicated-sessions");
    fs.rmSync(dir, { recursive: true });
  });

  test("quoted-invalid value still falls back to the default", () => {
    const dir = makeTmpDir();
    const specPath = path.join(dir, "spec.md");
    fs.writeFileSync(
      specPath,
      '## Session Set Configuration\n```yaml\ntier: "kitchen-sink"\nverificationMode: "nope"\n```',
    );
    const cfg = parseSessionSetConfig(specPath);
    assert.strictEqual(cfg.tier, "full");
    assert.strictEqual(cfg.verificationMode, "out-of-band-or-none");
    fs.rmSync(dir, { recursive: true });
  });
});

suite("shouldRenderPlusFraction — D1 predicate matrix (Set 061 S1)", () => {
  const workOnly: Array<Record<string, unknown>> = [
    { number: 1, title: "a", status: "complete" },
    { number: 2, title: "b", status: "in-progress" },
  ];
  const withVerification: Array<Record<string, unknown>> = [
    ...workOnly,
    { number: 3, title: "Verification", status: "not-started", type: "verification" },
  ];
  const withRemediationOnly: Array<Record<string, unknown>> = [
    ...workOnly,
    { number: 3, title: "Remediation", status: "not-started", type: "remediation" },
  ];

  test("Full tier never renders + (either mode, any ledger)", () => {
    assert.strictEqual(
      shouldRenderPlusFraction("full", "dedicated-sessions", workOnly),
      false,
    );
    assert.strictEqual(
      shouldRenderPlusFraction("full", "out-of-band-or-none", null),
      false,
    );
  });

  test("LW Mode A (out-of-band-or-none) never renders +", () => {
    assert.strictEqual(
      shouldRenderPlusFraction("lightweight", "out-of-band-or-none", workOnly),
      false,
    );
    assert.strictEqual(
      shouldRenderPlusFraction("lightweight", "out-of-band-or-none", null),
      false,
    );
  });

  test("LW Mode B before the typed session: renders +", () => {
    assert.strictEqual(
      shouldRenderPlusFraction("lightweight", "dedicated-sessions", workOnly),
      true,
    );
  });

  test("LW Mode B with no state file yet (null ledger): renders +", () => {
    assert.strictEqual(
      shouldRenderPlusFraction("lightweight", "dedicated-sessions", null),
      true,
    );
    assert.strictEqual(
      shouldRenderPlusFraction("lightweight", "dedicated-sessions", undefined),
      true,
    );
  });

  test("LW Mode B after the typed verification session appears: + drops", () => {
    assert.strictEqual(
      shouldRenderPlusFraction("lightweight", "dedicated-sessions", withVerification),
      false,
    );
  });

  test("a remediation-only ledger does NOT drop the + (D1 keys on type: verification)", () => {
    assert.strictEqual(
      shouldRenderPlusFraction("lightweight", "dedicated-sessions", withRemediationOnly),
      true,
    );
  });

  test("malformed ledger entries are tolerated (read as work sessions)", () => {
    const malformed = [null, 42, "x", { type: 7 }] as unknown as Array<{ type?: unknown }>;
    assert.strictEqual(hasTypedVerificationSession(malformed), false);
    assert.strictEqual(
      shouldRenderPlusFraction("lightweight", "dedicated-sessions", malformed),
      true,
    );
  });

  test("hasTypedVerificationSession detects the typed entry", () => {
    assert.strictEqual(hasTypedVerificationSession(workOnly), false);
    assert.strictEqual(hasTypedVerificationSession(withVerification), true);
  });
});

suite("tier marker + tooltips — D2 helpers (Set 061 S1)", () => {
  test("lightweight tier gets the quiet 'lw' marker + tooltip", () => {
    assert.strictEqual(tierMarkerFor("lightweight"), TIER_MARKER);
    assert.strictEqual(TIER_MARKER, "lw");
    assert.strictEqual(tierTooltipFor("lightweight"), TIER_MARKER_TOOLTIP);
    assert.ok(TIER_MARKER_TOOLTIP.includes("Lightweight tier"));
    assert.ok(TIER_MARKER_TOOLTIP.includes("verificationMode"));
  });

  test("full tier gets no marker and no tooltip", () => {
    assert.strictEqual(tierMarkerFor("full"), "");
    assert.strictEqual(tierTooltipFor("full"), "");
  });

  test("SessionSet-level wrappers read config.tier (Set 050 marker pattern)", () => {
    const lw = set({
      config: {
        requiresUAT: false,
        requiresE2E: false,
        uatScope: "none",
        tier: "lightweight",
        verificationMode: "dedicated-sessions",
      },
    });
    const full = set({
      config: {
        requiresUAT: false,
        requiresE2E: false,
        uatScope: "none",
        tier: "full",
        verificationMode: "out-of-band-or-none",
      },
    });
    assert.strictEqual(tierMarker(lw), "lw");
    assert.strictEqual(tierTooltip(lw), TIER_MARKER_TOOLTIP);
    assert.strictEqual(tierMarker(full), "");
    assert.strictEqual(tierTooltip(full), "");
    // Missing config degrades to the Full default (no marker).
    assert.strictEqual(tierMarker(set({})), "");
  });

  test("fractionTooltip is non-empty only on plus-fraction rows", () => {
    assert.strictEqual(fractionTooltip(set({ plusFraction: true })), PLUS_FRACTION_TOOLTIP);
    assert.strictEqual(fractionTooltip(set({ plusFraction: false })), "");
  });
});

// End-to-end: a Lightweight Mode-B fixture on disk derives
// plusFraction=true before the typed session and false after.
suite("readSessionSets — plusFraction derivation (Set 061 S1)", () => {
  function writeFixture(root: string, opts: { withTypedSession: boolean }): void {
    const dir = path.join(root, "docs", "session-sets", "001-lw-mode-b");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "spec.md"),
      "# LW Mode B Spec\n\n## Session Set Configuration\n```yaml\n" +
        "tier: lightweight\nverificationMode: dedicated-sessions\n" +
        "totalSessions: 2\n```\n\n### Session 1 of 2: One\n### Session 2 of 2: Two\n",
    );
    const sessions: Array<Record<string, unknown>> = [
      {
        number: 1, title: "One", status: "complete",
        startedAt: "2026-06-01T10:00:00-04:00",
        completedAt: "2026-06-01T11:00:00-04:00",
        orchestrator: { engine: "claude", provider: "anthropic" },
        verificationVerdict: null,
      },
      {
        number: 2, title: "Two", status: "complete",
        startedAt: "2026-06-01T12:00:00-04:00",
        completedAt: "2026-06-01T13:00:00-04:00",
        orchestrator: { engine: "claude", provider: "anthropic" },
        verificationVerdict: null,
      },
    ];
    let status = "complete";
    if (opts.withTypedSession) {
      sessions.push({
        number: 3, title: "Dedicated verification", status: "in-progress",
        type: "verification",
        startedAt: "2026-06-01T14:00:00-04:00", completedAt: null,
        orchestrator: { engine: "gpt-5-4", provider: "openai" },
        verificationVerdict: null,
      });
      status = "in-progress";
    }
    fs.writeFileSync(
      path.join(dir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 4,
        sessionSetName: "001-lw-mode-b",
        status,
        sessions,
      }, null, 2),
    );
  }

  test("LW Mode B set without a typed session derives plusFraction=true", () => {
    const root = makeTmpDir();
    writeFixture(root, { withTypedSession: false });
    const sets = readSessionSets(root);
    assert.strictEqual(sets.length, 1);
    assert.strictEqual(sets[0].config.tier, "lightweight");
    assert.strictEqual(sets[0].config.verificationMode, "dedicated-sessions");
    assert.strictEqual(sets[0].plusFraction, true);
    fs.rmSync(root, { recursive: true });
  });

  test("appending the typed verification session drops plusFraction", () => {
    const root = makeTmpDir();
    writeFixture(root, { withTypedSession: true });
    const sets = readSessionSets(root);
    assert.strictEqual(sets.length, 1);
    assert.strictEqual(sets[0].plusFraction, false);
    // The denominator grew with the typed session — the fraction is
    // honest now (3 ledger entries).
    assert.strictEqual(sets[0].totalSessions, 3);
    fs.rmSync(root, { recursive: true });
  });

  test("a Full-tier set on disk derives plusFraction=false", () => {
    const root = makeTmpDir();
    const dir = path.join(root, "docs", "session-sets", "002-full");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "spec.md"),
      "# Full Spec\n\n## Session Set Configuration\n```yaml\ntier: full\n```\n\n### Session 1 of 1: Only\n",
    );
    const sets = readSessionSets(root);
    assert.strictEqual(sets.length, 1);
    assert.strictEqual(sets[0].plusFraction, false);
    fs.rmSync(root, { recursive: true });
  });
});

// ---------------------------------------------------------------------------
// Set 077 Session 2 (Feature 1): the tier-mismatch advisory — the
// `.dabbler/tier` write-through marker vs. a set's declared spec tier.
// Routed test-generation (gemini-pro) drafted these; adapted to the
// shipped SessionState values and tooltip copy.
// ---------------------------------------------------------------------------

suite("tierMismatch — predicate matrix (Set 077 S2)", () => {
  const nonTerminal = ["in-progress", "not-started"] as const;
  const terminal = ["complete", "cancelled"] as const;

  test("no workspace marker ⇒ never a mismatch", () => {
    for (const state of [...nonTerminal, ...terminal]) {
      assert.strictEqual(tierMismatch("full", null, state), false);
      assert.strictEqual(tierMismatch("lightweight", null, state), false);
    }
  });

  test("agreement ⇒ no mismatch", () => {
    for (const state of nonTerminal) {
      assert.strictEqual(tierMismatch("full", "full", state), false);
      assert.strictEqual(tierMismatch("lightweight", "lightweight", state), false);
    }
  });

  test("disagreement on a non-terminal row ⇒ mismatch (both directions)", () => {
    for (const state of nonTerminal) {
      assert.strictEqual(tierMismatch("full", "lightweight", state), true);
      assert.strictEqual(tierMismatch("lightweight", "full", state), true);
    }
  });

  test("terminal rows stay quiet even on disagreement", () => {
    for (const state of terminal) {
      assert.strictEqual(tierMismatch("full", "lightweight", state), false);
      assert.strictEqual(tierMismatch("lightweight", "full", state), false);
    }
  });

  test("tooltip names both tiers, the marker file, and the remedy", () => {
    const tip = tierMismatchTooltipFor("full", "lightweight");
    assert.ok(tip.includes("tier: full"));
    assert.ok(tip.includes("lightweight"));
    assert.ok(tip.includes(".dabbler/tier"));
    assert.ok(tip.includes("Switch Tier"));
    const other = tierMismatchTooltipFor("lightweight", "full");
    assert.ok(other.includes("tier: lightweight"));
    assert.ok(other.includes("full"));
  });
});

suite("SessionSetsModel tierMarker/tierTooltip — mismatch advisory (Set 077 S2)", () => {
  test("mismatched non-terminal row renders 't!' + the mismatch tooltip", () => {
    const s = set({
      state: "not-started",
      config: { tier: "full" } as SessionSet["config"],
      workspaceTierMarker: "lightweight",
    });
    assert.strictEqual(tierMarker(s), TIER_MISMATCH_MARKER);
    assert.ok(tierTooltip(s).includes("Tier mismatch"));
  });

  test("a matching Lightweight row keeps the quiet 'lw' marker", () => {
    const s = set({
      state: "not-started",
      config: { tier: "lightweight" } as SessionSet["config"],
      workspaceTierMarker: "lightweight",
    });
    assert.strictEqual(tierMarker(s), TIER_MARKER);
    assert.strictEqual(tierTooltip(s), TIER_MARKER_TOOLTIP);
  });

  test("a mismatched Lightweight row upgrades 'lw' to the advisory", () => {
    const s = set({
      state: "in-progress",
      config: { tier: "lightweight" } as SessionSet["config"],
      workspaceTierMarker: "full",
    });
    assert.strictEqual(tierMarker(s), TIER_MISMATCH_MARKER);
  });

  test("terminal rows fall back to the quiet treatment", () => {
    const s = set({
      state: "complete",
      config: { tier: "full" } as SessionSet["config"],
      workspaceTierMarker: "lightweight",
    });
    assert.strictEqual(tierMarker(s), "");
    assert.strictEqual(tierTooltip(s), "");
  });

  test("no marker on disk (null) keeps pre-077 behavior exactly", () => {
    const full = set({
      state: "not-started",
      config: { tier: "full" } as SessionSet["config"],
      workspaceTierMarker: null,
    });
    assert.strictEqual(tierMarker(full), "");
    const lw = set({
      state: "not-started",
      config: { tier: "lightweight" } as SessionSet["config"],
      workspaceTierMarker: null,
    });
    assert.strictEqual(tierMarker(lw), TIER_MARKER);
  });
});

suite("readSessionSets — workspaceTierMarker derivation (Set 077 S2)", () => {
  function writeSpec(root: string, slug: string, tier: string): void {
    const dir = path.join(root, "docs", "session-sets", slug);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "spec.md"),
      `# Spec\n\n## Session Set Configuration\n\`\`\`yaml\ntier: ${tier}\n\`\`\`\n\n### Session 1 of 1: Only\n`,
    );
  }

  test("marker present ⇒ carried on every set from that root; mismatch renders the advisory", () => {
    const root = makeTmpDir();
    fs.mkdirSync(path.join(root, ".dabbler"), { recursive: true });
    fs.writeFileSync(path.join(root, ".dabbler", "tier"), "lightweight\n");
    writeSpec(root, "001-agrees", "lightweight");
    writeSpec(root, "002-drifted", "full");
    const sets = readSessionSets(root);
    assert.strictEqual(sets.length, 2);
    for (const s of sets) {
      assert.strictEqual(s.workspaceTierMarker, "lightweight");
    }
    const agrees = sets.find((s) => s.name === "001-agrees")!;
    const drifted = sets.find((s) => s.name === "002-drifted")!;
    assert.strictEqual(tierMarker(agrees), TIER_MARKER);
    assert.strictEqual(tierMarker(drifted), TIER_MISMATCH_MARKER);
    assert.ok(tierTooltip(drifted).includes(".dabbler/tier"));
    fs.rmSync(root, { recursive: true });
  });

  test("no marker on disk ⇒ null on every set (no advisory possible)", () => {
    const root = makeTmpDir();
    writeSpec(root, "001-plain", "full");
    const sets = readSessionSets(root);
    assert.strictEqual(sets.length, 1);
    assert.strictEqual(sets[0].workspaceTierMarker, null);
    assert.strictEqual(tierMarker(sets[0]), "");
    fs.rmSync(root, { recursive: true });
  });

  test("a corrupt marker reads as null — the Explorer never goes loud on junk", () => {
    const root = makeTmpDir();
    fs.mkdirSync(path.join(root, ".dabbler"), { recursive: true });
    fs.writeFileSync(path.join(root, ".dabbler", "tier"), "garbage\n");
    writeSpec(root, "001-plain", "full");
    const sets = readSessionSets(root);
    assert.strictEqual(sets[0].workspaceTierMarker, null);
    assert.strictEqual(tierMarker(sets[0]), "");
    fs.rmSync(root, { recursive: true });
  });
});
