Set 050 Session 5 (5 of 5) close-out — final session.

S5 shipped consumer rollout, docs, and the dual version bumps, and
performed the cross-provider verification of the S2-S5 deferred work
that prior sessions deferred here per the established per-set pattern.

Deliverables:
- docs/cross-repo-migration-guard-notice.md — paste-in for consumer
  CLAUDE.md (install the SessionStart drift guard via the extension
  command or a router-less manual fallback; raise the >=0.10.0 pin; use
  raw GitHub URLs; inline the schemaVersion:4 stamp; adopt NNN-
  prefixes) + a 2026-05-29 adoption-status table.
- Harvester first-adopter confirmed: all 49 sets at v4, pin >=0.10.0,
  CLAUDE.md stamped (done ahead of this set); the remaining hook install
  is a one-time operator action against the shared global
  ~/.claude/settings.json, which covers every repo on the machine.
- Version bumps: dabbler-ai-router 0.11.0 -> 0.12.0; extension
  0.24.1 -> 0.25.0 (publishes the held 0.24.1 Copy-Slug fix). Both
  CHANGELOGs, the CLAUDE.md version walk, and a set-level change-log.md.

Verification: cross-provider IV&V by gemini-pro (google) — different
provider from the Claude orchestrator. Verdict VERIFIED: 0 critical;
2 important (both noted risks, not defects — migrator idempotency
reliance, already a documented/test-asserted invariant; and Python/TS
resolver dual-impl drift, acknowledged with a convention-lint as a
future-set candidate); 1 nice-to-have (the 2 pre-existing Set-026 TS
stub-harness failures, out of scope). The verifier explicitly confirmed
the empirically-corrected THREE-migrator bulk chain (vs the S1 verdict's
two) as sound and called release discipline sound. No in-flight fix
required. Record at s5-verification.md. Cost $0.0053 -> cumulative routed
$0.2882 of $10 NTE (2.9%).

Tests: full Python suite 1025 passed / 1 skipped / 0 regressions after
the version bumps. No TS source changed in S5 (version + CHANGELOG only);
S4 already confirmed tsc --noEmit and esbuild clean.

Release discipline: publishes HELD for operator-initiated tag-push
(vsix-v0.25.0 for Marketplace via publish-vscode.yml; v0.12.0 for PyPI
via release.yml). NOTE: VSCE_PAT was expired 2026-05-28 — confirm PAT
freshness before pushing the vsix tag.

This is the final session; close_session flips the set's top-level status
to complete.
