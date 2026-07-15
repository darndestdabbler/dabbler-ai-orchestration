# S2 — Remediation note for verification round 1

Round 1 (discovery, gpt-5-6, 2/2 fan-out) returned **ISSUES_FOUND** with four
Major findings that share **one root cause**: the UAT checklist carried **11
blank duplicate rows** (`Passes: false`, empty `HumanAction`/`Expectation`)
appended by the UAT tool alongside the operator's 11 real, filled, `Passes:
true` walks. That made the checklist read as simultaneously passed and failed,
which in turn made the de-draft's "validated" and Set-102-discharge claims look
unsupported.

- **F1 (Correctness):** checklist reports every walk as both passed and failed.
- **F2 (Completeness):** per-item live-walk evidence appears absent.
- **F3 (Completeness/Correctness):** checklist contradictory, lacks per-item evidence.
- **F4 (False-positive framing):** public validation + 102-discharge claims exceed recorded evidence.

## Findings ACCEPTED (correct); fixes applied

The findings are correct as stated against the artifact as committed. The
remediation removes the contradiction and grounds every claim in the operator's
real per-item record:

1. **Removed the 11 blank duplicate rows** from
   `103-copilot-ado-hello-world-tutorial-uat-checklist.json` (Review: 22 → 11).
   The retained 11 are the operator's filled functional-area walks, each marked
   `Passes: true` with non-blank `HumanAction`/`Expectation`. The checklist is
   now internally consistent — no walk appears as both pass and fail. **(F1, F3)**
2. **The per-item evidence is present and now visible:** all 11 walks carry the
   operator's `Passes: true` mark (Walks 1–11, covering the Copilot seat CLI,
   ADO bootstrap, build + seat + auth-preflight, modules + branch policies, the
   Set-102-armed Open PR, the Copilot-driven session, the first-ever live
   `azure-pipelines.yml` run, the Set-102-armed Finalize, integration + touches
   review, the tag/hotfix/rollback drills, and the no-CLI floor). The free-text
   `Result`/`Feedback` were left blank — the operator attested pass without
   per-item narrative, which the ad-hoc UAT floor permits; `s2-uat-attestation.md`
   states this plainly (no per-item results were invented). **(F2)**
3. **The de-draft and Set-102-discharge claims are now bounded by the checklist
   evidence:** every step the banner names maps to a `Passes: true` walk, and
   the 102 discharge maps to Walks 5 and 8 (both passed). `s2-uat-attestation.md`
   attributes validation to the operator's dated live walk and links the
   checklist as the per-item record. **(F4)**

## Nature of the acceptance (honest framing)

This is an operator-conducted live UAT walk (Full-tier `requiresUAT`, ad-hoc
floor). The acceptance test for this docs-only set is the human walk; a
cross-provider model cannot perform a live ADO + Copilot-seat walk. The
operator's filled checklist (11/11 pass) plus the verbatim attestation are the
verification of record. The verification round reviewed the **de-draft
deliverable** (the doc/checklist changes) and correctly caught the
contradiction, which is now fixed.

## Resolution status

- **F1–F4 — fix-accepted:** checklist de-duplicated to 11 consistent
  `Passes: true` walks; attestation corrected to reflect the real per-item
  passes and the removed non-data rows; de-draft claims bounded by the walk
  record. No code change (docs-only set).
