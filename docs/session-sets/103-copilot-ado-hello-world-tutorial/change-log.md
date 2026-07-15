# Change log — Set 103: Copilot + Azure DevOps Hello-World Tutorial

**Outcome:** the standalone Copilot + Azure DevOps hello-world tutorial is
authored and now **validated end-to-end on a live ADO org + Copilot seat**
(operator walk, 2026-07-15) and de-drafted. Set 102's armed Azure DevOps UAT is
discharged. Docs-only set — no code, no version bump, no Marketplace release.

## Session 1 — Author the tutorial (draft)

- Authored `docs/tutorials/module-team-hello-world-copilot-ado.md`: a
  standalone, linear re-cut of the flagship hello-world walkthrough for a
  GitHub-Copilot-locked team on Azure DevOps — Copilot-seat Full tier with the
  Set-086 auth-preflight, an executable ADO bootstrap (branch policies,
  auto-included reviewers, Build validation, a two-layer `azure-pipelines.yml`).
  Cross-linked from the base tutorial, quick-start, and README; sync-map
  appendix; per-set UAT checklist (11 walks, Passes=null pending the live walk).
- Cross-provider VERIFIED after the full phased loop (7 real defects found +
  remediated). Shipped the tutorial as an honest **PREVIEW** (operator override,
  noon deadline + no ADO account yet), pending the live walk. Set 102's ADO UAT
  left armed.

## Session 2 — Operator live validation walk + de-draft

- **Operator conducted the live UAT walk** (2026-07-15) on a real Azure DevOps
  org + GitHub Copilot seat and marked **all 11 checklist walks `Passes: true`**
  — ADO bootstrap, the Set-102-armed Open PR, the first-ever live
  `azure-pipelines.yml` run, the Set-102-armed Finalize, the tag/hotfix/rollback
  drills, and the rest. Attestation: `s2-uat-attestation.md`.
- **De-drafted** the tutorial (PREVIEW → validated end-to-end, 2026-07-15) and
  activated the "preview/pending walk" cross-links in the base tutorial,
  quick-start, and the extension README. (README Marketplace visibility rides
  the next extension publish; this docs-only set cuts no release.)
- **Set 102's armed Azure DevOps UAT — discharged** (Walks 5 & 8; 102 stays
  immutable, cross-referenced here).
- **Verification:** discovery (gpt-5-6, 2/2 fan-out) found 4 Major from one root
  cause — the UAT checklist carried 11 blank duplicate rows appended by the UAT
  tool, contradicting the operator's 11 real `Passes: true` walks. Remediated
  (removed the blank rows → 11 consistent passes; corrected the attestation;
  bounded the de-draft claims to the walk record). Remediation-review (gpt-5-6):
  **VERIFIED**, 3 fixes accepted. Loop converged in 2 bounded rounds.

## Deliverables

- The validated, de-drafted Copilot + ADO tutorial + activated cross-links.
- `s2-uat-attestation.md` (operator attestation + per-item pass record).
- Set 102's armed ADO UAT discharge record.

## Notes / follow-ons

- **No release boundary** (docs-only). The README's updated cross-link line will
  become visible on the Marketplace at the next extension publish (whenever one
  is cut for other reasons) — not triggered by this set.
- The interim manual catalog pin-bump (1.0.68 → 1.0.69) from the router 0.34.0
  release remains in place per operator direction; a full
  `copilot_catalog --refresh` is the proper reconciliation when convenient.
