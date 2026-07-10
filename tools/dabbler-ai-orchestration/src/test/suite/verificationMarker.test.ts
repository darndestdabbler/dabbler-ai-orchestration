// Set 062 Session 1 — verification-posture marker (spec D1).
//
// Covers the spec's step-4 test matrix:
//   - the `verificationMarkerFor` predicate matrix (Full / LW Mode A
//     pre- and post-completion / note present / LW Mode B
//     before-during-after typed sessions / cancelled);
//   - the ledger helpers (`allWorkSessionsComplete`,
//     `completedVerificationInfo`, `hasCompletedVerificationSession`);
//   - the D1 tooltip copy (exact strings — they are operator-facing
//     contract, not incidental text);
//   - the SessionSetsModel helpers (marker / tooltip / verdict-enriched
//     fraction tooltip);
//   - end-to-end derivation through readSessionSets on disk fixtures
//     (note present / absent, typed session in flight / completed);
//   - payload-carriage + rendering source scans on the shipped view and
//     webview client (the prerequisites.test.ts house pattern — the
//     renderer is not importable from the unit harness).

import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { SessionSet } from "../../types";
import {
  LedgerSessionLike,
  VERIFICATION_DEDICATED_TOOLTIP,
  VERIFICATION_MARKER_DEDICATED,
  VERIFICATION_MARKER_OUT_OF_BAND,
  VERIFICATION_OUT_OF_BAND_TOOLTIP,
  allWorkSessionsComplete,
  completedVerificationInfo,
  hasCompletedVerificationSession,
  isRecognizedVerdictToken,
  verificationMarkerFor,
  verificationMarkerTooltipFor,
} from "../../utils/tierLegibility";
import {
  verdictFractionTooltip,
  verificationMarker,
  verificationTooltip,
} from "../../providers/SessionSetsModel";
import { readSessionSets } from "../../utils/fileSystem";

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "dabbler-test-"));
}

// Minimal cast factory — the model helpers read only
// `verificationMarker` / `completedVerification` (same pattern as
// tierLegibility.test.ts).
function set(over: Partial<SessionSet>): SessionSet {
  return over as SessionSet;
}

// Ledger shorthands for the matrix.
const workDone: LedgerSessionLike[] = [
  { number: 1, status: "complete" },
  { number: 2, status: "complete" },
];
const workOpen: LedgerSessionLike[] = [
  { number: 1, status: "complete" },
  { number: 2, status: "in-progress" },
];
const verificationInFlight: LedgerSessionLike[] = [
  ...workDone,
  { number: 3, status: "in-progress", type: "verification" },
];
const verificationDone: LedgerSessionLike[] = [
  ...workDone,
  {
    number: 3,
    status: "complete",
    type: "verification",
    verificationVerdict: "VERIFIED",
  },
];
const remediationDoneOnly: LedgerSessionLike[] = [
  ...workDone,
  { number: 3, status: "complete", type: "remediation" },
];

suite("verificationMarkerFor — D1 predicate matrix (Set 062 S1)", () => {
  test("Full rows never render a marker, in any mode or state", () => {
    assert.strictEqual(
      verificationMarkerFor("full", "out-of-band-or-none", workDone, false, "complete"),
      "",
    );
    assert.strictEqual(
      verificationMarkerFor("full", "dedicated-sessions", workDone, false, "in-progress"),
      "",
    );
  });

  test("cancelled rows never render a marker, in either mode", () => {
    assert.strictEqual(
      verificationMarkerFor("lightweight", "out-of-band-or-none", workDone, false, "cancelled"),
      "",
    );
    assert.strictEqual(
      verificationMarkerFor("lightweight", "dedicated-sessions", workDone, false, "cancelled"),
      "",
    );
  });

  test("Mode A: completed set without note or typed session renders v?", () => {
    assert.strictEqual(
      verificationMarkerFor("lightweight", "out-of-band-or-none", workDone, false, "complete"),
      VERIFICATION_MARKER_OUT_OF_BAND,
    );
  });

  test("Mode A: a null ledger still renders v? on a completed row", () => {
    // A hand-maintained complete set whose ledger could not be read:
    // there is still nothing recording a review, so the marker shows.
    assert.strictEqual(
      verificationMarkerFor("lightweight", "out-of-band-or-none", null, false, "complete"),
      VERIFICATION_MARKER_OUT_OF_BAND,
    );
  });

  test("Mode A: external-verification.md suppresses v? (quiet is success)", () => {
    assert.strictEqual(
      verificationMarkerFor("lightweight", "out-of-band-or-none", workDone, true, "complete"),
      "",
    );
  });

  test("Mode A: pre-completion rows render nothing", () => {
    assert.strictEqual(
      verificationMarkerFor("lightweight", "out-of-band-or-none", workOpen, false, "in-progress"),
      "",
    );
    assert.strictEqual(
      verificationMarkerFor("lightweight", "out-of-band-or-none", null, false, "not-started"),
      "",
    );
  });

  test("Mode A: a typed verification session suppresses v? (defensive)", () => {
    assert.strictEqual(
      verificationMarkerFor(
        "lightweight", "out-of-band-or-none", verificationDone, false, "complete",
      ),
      "",
    );
  });

  test("Mode B: work complete, nothing typed yet — v+ (owed)", () => {
    assert.strictEqual(
      verificationMarkerFor("lightweight", "dedicated-sessions", workDone, false, "in-progress"),
      VERIFICATION_MARKER_DEDICATED,
    );
  });

  test("Mode B: typed verification in flight — v+ stays (in flight)", () => {
    assert.strictEqual(
      verificationMarkerFor(
        "lightweight", "dedicated-sessions", verificationInFlight, false, "in-progress",
      ),
      VERIFICATION_MARKER_DEDICATED,
    );
  });

  test("Mode B: completed remediation alone does not clear v+ (verification still owed)", () => {
    assert.strictEqual(
      verificationMarkerFor(
        "lightweight", "dedicated-sessions", remediationDoneOnly, false, "in-progress",
      ),
      VERIFICATION_MARKER_DEDICATED,
    );
  });

  test("Mode B: completed verification session suppresses the marker", () => {
    assert.strictEqual(
      verificationMarkerFor(
        "lightweight", "dedicated-sessions", verificationDone, false, "in-progress",
      ),
      "",
    );
  });

  test("Mode B: mid-work rows render nothing (the N/M+ fraction covers them)", () => {
    assert.strictEqual(
      verificationMarkerFor("lightweight", "dedicated-sessions", workOpen, false, "in-progress"),
      "",
    );
  });

  test("Mode B: terminal complete rows render nothing", () => {
    assert.strictEqual(
      verificationMarkerFor("lightweight", "dedicated-sessions", workDone, false, "complete"),
      "",
    );
  });

  test("Mode B: null / malformed ledgers render nothing (no completion evidence)", () => {
    assert.strictEqual(
      verificationMarkerFor("lightweight", "dedicated-sessions", null, false, "in-progress"),
      "",
    );
    assert.strictEqual(
      verificationMarkerFor("lightweight", "dedicated-sessions", undefined, false, "in-progress"),
      "",
    );
    const malformed = [null, "nope", 42] as unknown as LedgerSessionLike[];
    assert.strictEqual(
      verificationMarkerFor("lightweight", "dedicated-sessions", malformed, false, "in-progress"),
      "",
    );
  });
});

suite("ledger helpers (Set 062 S1)", () => {
  test("allWorkSessionsComplete: true only with ≥1 work session, all complete", () => {
    assert.strictEqual(allWorkSessionsComplete(workDone), true);
    assert.strictEqual(allWorkSessionsComplete(workOpen), false);
    assert.strictEqual(allWorkSessionsComplete([]), false);
    assert.strictEqual(allWorkSessionsComplete(null), false);
    assert.strictEqual(allWorkSessionsComplete(undefined), false);
  });

  test("allWorkSessionsComplete: typed sessions are not work — their status is ignored", () => {
    assert.strictEqual(allWorkSessionsComplete(verificationInFlight), true);
    // ...but a ledger of ONLY typed sessions has no work evidence.
    assert.strictEqual(
      allWorkSessionsComplete([{ number: 1, status: "complete", type: "verification" }]),
      false,
    );
  });

  test("allWorkSessionsComplete: explicit type 'work' counts as work", () => {
    assert.strictEqual(
      allWorkSessionsComplete([{ number: 1, status: "complete", type: "work" }]),
      true,
    );
  });

  test("allWorkSessionsComplete: malformed entries read as work-not-complete", () => {
    const malformed = [{ number: 1, status: "complete" }, null] as unknown as LedgerSessionLike[];
    assert.strictEqual(allWorkSessionsComplete(malformed), false);
  });

  test("completedVerificationInfo: none without a completed typed verification", () => {
    assert.strictEqual(completedVerificationInfo(workDone), null);
    assert.strictEqual(completedVerificationInfo(verificationInFlight), null);
    assert.strictEqual(completedVerificationInfo(remediationDoneOnly), null);
    assert.strictEqual(completedVerificationInfo(null), null);
  });

  test("completedVerificationInfo: lifts verdict + session number", () => {
    assert.deepStrictEqual(completedVerificationInfo(verificationDone), {
      sessionNumber: 3,
      verdict: "VERIFIED",
    });
    assert.strictEqual(hasCompletedVerificationSession(verificationDone), true);
  });

  test("completedVerificationInfo: multiple completed rounds — the latest wins", () => {
    const twoRounds: LedgerSessionLike[] = [
      ...workDone,
      { number: 3, status: "complete", type: "verification", verificationVerdict: "ISSUES_FOUND" },
      { number: 4, status: "complete", type: "remediation" },
      { number: 5, status: "complete", type: "verification", verificationVerdict: "VERIFIED" },
    ];
    assert.deepStrictEqual(completedVerificationInfo(twoRounds), {
      sessionNumber: 5,
      verdict: "VERIFIED",
    });
  });

  test("completedVerificationInfo: malformed metadata degrades to null fields, entry still counts", () => {
    const odd: LedgerSessionLike[] = [
      { number: "three" as unknown, status: "complete", type: "verification", verificationVerdict: 7 as unknown },
    ];
    assert.deepStrictEqual(completedVerificationInfo(odd), {
      sessionNumber: null,
      verdict: null,
    });
    // The completed session still suppresses the v+ marker even with
    // unreadable metadata.
    assert.strictEqual(hasCompletedVerificationSession(odd), true);
  });
});

suite("D1 tooltip copy (Set 062 S1)", () => {
  test("v? tooltip is the locked Mode-A copy", () => {
    assert.strictEqual(
      verificationMarkerTooltipFor(VERIFICATION_MARKER_OUT_OF_BAND),
      "Lightweight — verification is out-of-band or none. The Explorer " +
        "cannot tell whether this set was reviewed out of band. Click for " +
        "verification options.",
    );
    assert.strictEqual(
      VERIFICATION_OUT_OF_BAND_TOOLTIP.includes("unverified"),
      false,
      "copy must never say 'unverified' — Mode A is a posture, not a deficiency",
    );
  });

  test("v+ tooltip is the locked Mode-B copy", () => {
    assert.strictEqual(
      verificationMarkerTooltipFor(VERIFICATION_MARKER_DEDICATED),
      "Dedicated verification enabled — a verification/remediation " +
        "session is still owed or in flight. Click for the next step.",
    );
    assert.strictEqual(VERIFICATION_DEDICATED_TOOLTIP.includes("unverified"), false);
  });

  test("empty glyph maps to empty tooltip", () => {
    assert.strictEqual(verificationMarkerTooltipFor(""), "");
  });
});

suite("SessionSetsModel verification helpers (Set 062 S1)", () => {
  test("verificationMarker / verificationTooltip pass the derived glyph through", () => {
    const q = set({ verificationMarker: "v?" });
    const p = set({ verificationMarker: "v+" });
    const none = set({ verificationMarker: "" });
    assert.strictEqual(verificationMarker(q), "v?");
    assert.strictEqual(verificationTooltip(q), VERIFICATION_OUT_OF_BAND_TOOLTIP);
    assert.strictEqual(verificationMarker(p), "v+");
    assert.strictEqual(verificationTooltip(p), VERIFICATION_DEDICATED_TOOLTIP);
    assert.strictEqual(verificationMarker(none), "");
    assert.strictEqual(verificationTooltip(none), "");
    // Cast-factory rows without the field behave like no-marker rows.
    assert.strictEqual(verificationMarker(set({})), "");
    assert.strictEqual(verificationTooltip(set({})), "");
  });

  test("verdictFractionTooltip renders the persisted verdict + session number", () => {
    assert.strictEqual(
      verdictFractionTooltip(
        set({ completedVerification: { sessionNumber: 4, verdict: "VERIFIED" } }),
      ),
      "Verification: VERIFIED (session 4)",
    );
    assert.strictEqual(
      verdictFractionTooltip(
        set({ completedVerification: { sessionNumber: null, verdict: "ISSUES_FOUND" } }),
      ),
      "Verification: ISSUES_FOUND",
    );
  });

  test("verdictFractionTooltip is empty without a persisted verdict", () => {
    assert.strictEqual(verdictFractionTooltip(set({ completedVerification: null })), "");
    assert.strictEqual(
      verdictFractionTooltip(
        set({ completedVerification: { sessionNumber: 3, verdict: null } }),
      ),
      "",
    );
    assert.strictEqual(verdictFractionTooltip(set({})), "");
  });

  // Set 086 S2 guardrail: a confabulated / free-form non-verdict token must
  // never render as if it were a clean verdict.
  test("verdictFractionTooltip flags an unrecognized (confabulated) verdict token", () => {
    assert.strictEqual(
      verdictFractionTooltip(
        set({
          completedVerification: {
            sessionNumber: 2,
            verdict: "manual-override-development",
          },
        }),
      ),
      'Verification: "manual-override-development" is not a recognized verdict (session 2)',
    );
    // Also without a session number.
    assert.strictEqual(
      verdictFractionTooltip(
        set({ completedVerification: { sessionNumber: null, verdict: "done!" } }),
      ),
      'Verification: "done!" is not a recognized verdict',
    );
  });

  // Readers are prefix-lenient: the intentionally-shipped extension token and
  // the third canonical verdict render as clean verdicts (not flagged).
  test("verdictFractionTooltip accepts shipped extension + WAIVED tokens verbatim", () => {
    assert.strictEqual(
      verdictFractionTooltip(
        set({
          completedVerification: {
            sessionNumber: 3,
            verdict: "ISSUES_FOUND_RESOLVED_IN_FLIGHT",
          },
        }),
      ),
      "Verification: ISSUES_FOUND_RESOLVED_IN_FLIGHT (session 3)",
    );
    assert.strictEqual(
      verdictFractionTooltip(
        set({ completedVerification: { sessionNumber: 1, verdict: "WAIVED" } }),
      ),
      "Verification: WAIVED (session 1)",
    );
  });

  test("isRecognizedVerdictToken: canonical + extension prefixes vs non-verdicts", () => {
    for (const good of [
      "VERIFIED",
      "verified",
      " ISSUES_FOUND ",
      "ISSUES_FOUND_RESOLVED_IN_FLIGHT",
      "WAIVED",
    ]) {
      assert.strictEqual(isRecognizedVerdictToken(good), true, good);
    }
    for (const bad of [
      "manual-override-development",
      "done!",
      "",
      "   ",
      null,
      undefined,
    ]) {
      assert.strictEqual(isRecognizedVerdictToken(bad as string), false, String(bad));
    }
  });
});

// End-to-end: disk fixtures derive the marker + the two new inputs
// through readSessionSets (the same harness shape as the Set 061 S1
// plusFraction derivation suite).
suite("readSessionSets — verification-marker derivation (Set 062 S1)", () => {
  interface ModeAOpts {
    withNote: boolean;
  }

  function writeModeAComplete(root: string, opts: ModeAOpts): string {
    const dir = path.join(root, "docs", "session-sets", "001-lw-mode-a");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "spec.md"),
      "# LW Mode A Spec\n\n## Session Set Configuration\n```yaml\n" +
        "tier: lightweight\nverificationMode: out-of-band-or-none\n" +
        "totalSessions: 2\n```\n\n### Session 1 of 2: One\n### Session 2 of 2: Two\n",
    );
    fs.writeFileSync(
      path.join(dir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 4,
        sessionSetName: "001-lw-mode-a",
        status: "complete",
        sessions: [
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
        ],
      }, null, 2),
    );
    if (opts.withNote) {
      fs.writeFileSync(
        path.join(dir, "external-verification.md"),
        "Reviewed out of band by a second assistant on 2026-06-02. Verdict: looks good.\n",
      );
    }
    return dir;
  }

  function writeModeB(root: string, opts: { verificationStatus: "in-progress" | "complete" }): void {
    const dir = path.join(root, "docs", "session-sets", "002-lw-mode-b");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "spec.md"),
      "# LW Mode B Spec\n\n## Session Set Configuration\n```yaml\n" +
        "tier: lightweight\nverificationMode: dedicated-sessions\n" +
        "totalSessions: 2\n```\n\n### Session 1 of 2: One\n### Session 2 of 2: Two\n",
    );
    const done = opts.verificationStatus === "complete";
    fs.writeFileSync(
      path.join(dir, "session-state.json"),
      JSON.stringify({
        schemaVersion: 4,
        sessionSetName: "002-lw-mode-b",
        status: done ? "complete" : "in-progress",
        sessions: [
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
          {
            number: 3, title: "Dedicated verification",
            status: opts.verificationStatus,
            type: "verification",
            startedAt: "2026-06-01T14:00:00-04:00",
            completedAt: done ? "2026-06-01T15:00:00-04:00" : null,
            orchestrator: { engine: "gpt-5-4", provider: "openai" },
            verificationVerdict: done ? "VERIFIED" : null,
          },
        ],
      }, null, 2),
    );
  }

  test("Mode A complete without a note derives v? and noteExists=false", () => {
    const root = makeTmpDir();
    writeModeAComplete(root, { withNote: false });
    const sets = readSessionSets(root);
    assert.strictEqual(sets.length, 1);
    assert.strictEqual(sets[0].verificationMarker, "v?");
    assert.strictEqual(sets[0].externalVerificationNoteExists, false);
    assert.strictEqual(sets[0].completedVerification, null);
    fs.rmSync(root, { recursive: true });
  });

  test("Mode A complete with external-verification.md stays quiet", () => {
    const root = makeTmpDir();
    writeModeAComplete(root, { withNote: true });
    const sets = readSessionSets(root);
    assert.strictEqual(sets.length, 1);
    assert.strictEqual(sets[0].verificationMarker, "");
    assert.strictEqual(sets[0].externalVerificationNoteExists, true);
    fs.rmSync(root, { recursive: true });
  });

  test("Mode B with the typed session in flight derives v+", () => {
    const root = makeTmpDir();
    writeModeB(root, { verificationStatus: "in-progress" });
    const sets = readSessionSets(root);
    assert.strictEqual(sets.length, 1);
    assert.strictEqual(sets[0].verificationMarker, "v+");
    assert.strictEqual(sets[0].completedVerification, null);
    fs.rmSync(root, { recursive: true });
  });

  test("Mode B verified derives no marker + the persisted verdict info", () => {
    const root = makeTmpDir();
    writeModeB(root, { verificationStatus: "complete" });
    const sets = readSessionSets(root);
    assert.strictEqual(sets.length, 1);
    assert.strictEqual(sets[0].verificationMarker, "");
    assert.deepStrictEqual(sets[0].completedVerification, {
      sessionNumber: 3,
      verdict: "VERIFIED",
    });
    fs.rmSync(root, { recursive: true });
  });

  test("a Full-tier set derives no marker and no verification inputs", () => {
    const root = makeTmpDir();
    const dir = path.join(root, "docs", "session-sets", "003-full");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "spec.md"),
      "# Full Spec\n\n## Session Set Configuration\n```yaml\ntier: full\n```\n\n### Session 1 of 1: Only\n",
    );
    const sets = readSessionSets(root);
    assert.strictEqual(sets.length, 1);
    assert.strictEqual(sets[0].verificationMarker, "");
    assert.strictEqual(sets[0].externalVerificationNoteExists, false);
    assert.strictEqual(sets[0].completedVerification, null);
    fs.rmSync(root, { recursive: true });
  });
});

// Payload carriage + rendering. The webview renderer and the host's
// private toRowPayload are not importable from the unit harness, so —
// per the prerequisites.test.ts house pattern — assert the shipped
// sources carry the wiring the protocol promises.
suite("verification marker — payload + rendering source scans (Set 062 S1)", () => {
  const extRoot = path.resolve(__dirname, "..", "..", "..");

  test("host ships verificationMarker + verificationTooltip on the row payload", () => {
    const view = fs.readFileSync(
      path.join(extRoot, "src", "providers", "CustomSessionSetsView.ts"),
      "utf8",
    );
    assert.ok(view.includes("verificationMarker: verificationMarker(set)"));
    assert.ok(view.includes("verificationTooltip: verificationTooltip(set)"));
    // The non-plus fraction-tooltip slot carries the verdict enrichment.
    assert.ok(view.includes("verdictFractionTooltip(set)"));
  });

  test("webview renders the marker span and wires its click to showRowContextMenu", () => {
    const client = fs.readFileSync(
      path.join(extRoot, "media", "session-sets-tree", "client.js"),
      "utf8",
    );
    assert.ok(client.includes('class="row-verification-marker"'));
    assert.ok(client.includes("row.verificationMarker"));
    assert.ok(client.includes("row.verificationTooltip"));
    // The click handler posts the EXISTING context-menu message — the
    // marker is an action surface, never a mutation path.
    const markerWiring = client.slice(client.indexOf(".row-verification-marker\")"));
    assert.ok(markerWiring.includes('vscode.postMessage({ type: "showRowContextMenu"'));
  });

  test("the marker style ships with the quiet treatment (help cursor)", () => {
    const css = fs.readFileSync(
      path.join(extRoot, "media", "session-sets-tree", "tree.css"),
      "utf8",
    );
    const idx = css.indexOf(".row-verification-marker");
    assert.ok(idx >= 0);
    assert.ok(css.slice(idx, idx + 400).includes("cursor: help"));
  });
});
