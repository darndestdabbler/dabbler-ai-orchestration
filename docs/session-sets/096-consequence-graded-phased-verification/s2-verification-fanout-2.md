ISSUES FOUND

- **Issue 1: A clean supplementary pass falsely marks the overall session VERIFIED while known blockers remain unresolved**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A discovery pass reports Major findings and the required pre-remediation supplementary pass finds nothing new—an expected, normal outcome. The CLI then exits successfully and patches `disposition.json` to `VERIFIED`, even though remediation has not started. Automation or an operator relying on the exit code/disposition can proceed toward close with the original Majors unresolved. This is probable because “no additional findings” is a routine supplementary result, and lifecycle tooling conventionally relies on exit status and disposition state.
  - **Details:**
    - **Violation:** The policy says supplementary runs “BEFORE any remediation” and that the prior Critical/Major findings “still stand.” Nevertheless, `run()` unconditionally executes `patch_disposition(session_set_dir, verdict)` and then, for a clean supplementary pass, returns `EXIT_OK`.
    - **Location:** `ai_router/verify_session.py`, immediately after merged classification and in the `if phase == PHASE_SUPPLEMENTARY` non-blocking branch.
    - **Impact:** The machine-readable session state contradicts the printed next action and can authorize premature close. A close backstop cannot reliably reconstruct this phase state because a clean supplementary pass writes no issues envelope or phase marker.
    - **Evidence:** The supplied `test_clean_supplementary_still_points_at_remediation` explicitly expects `EXIT_OK`; the code patches the raw supplementary token `VERIFIED` before printing that prior findings remain.
    - **Fix:** Preserve an overall blocking loop state until a remediation-review accepts every prior blocker. A clean supplementary artifact may retain its raw `VERIFIED` token, but it must not patch the overall disposition to VERIFIED or return a success status that permits close. Persist phase state even for clean rounds, and make the close gate require a successful remediation-review after blocking discovery.

- **Issue 2: Remediation-review evidence is not “FIX DELTA ONLY”; it necessarily includes verification machinery created after the baseline**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** In the normal blocking flow, discovery/supplementary snapshots are taken before their raw outputs, issue envelopes, disposition patches, and remediation sidecars are written. The later tree-to-tree diff therefore includes those generated records as apparent remediation hunks. The verifier is expressly allowed to raise new blocking defects within every shown hunk, so it can review immutable verifier records or lifecycle metadata as product changes, creating false churn. Large discovery outputs can also consume the narrow fix-delta budget. This occurs on every ordinary blocking phased run, not an unusual configuration.
  - **Details:**
    - **Violation:** The contract says remediation-review evidence is “the FIX DELTA ONLY” and that new defects are admissible only within remediation hunks.
    - **Location:** `ai_router/verify_session.py`: `snapshot_worktree_tree()` is called before routing and before `artifact_path_k.write_text()`, `write_issues_artifact()`, and `patch_disposition()`; `assemble_fix_delta_evidence()` later diffs the complete trees without excluding phase-generated session artifacts.
    - **Impact:** The core scope-control mechanism does not isolate remediation. It can reintroduce exactly the irrelevant-review churn and excess cost the phased loop is intended to prevent.
    - **Evidence:** If supplementary is clean, its snapshot is not persisted, so remediation uses the discovery snapshot and includes both discovery and supplementary records. If supplementary has findings, its persisted snapshot still predates its own raw output/envelope, so at least those files enter the diff. The tests avoid this by manually seeding discovery artifacts before taking the baseline, which does not model the live ordering. The replay likewise explicitly excluded both session-set directories, masking the production behavior.
    - **Fix:** Build normalized snapshots that omit verification artifacts, issues envelopes, verification-only disposition mutations, and remediation sidecars, or apply exact phase-artifact path exclusions to both sides of the tree comparison. Keep sidecars solely in the ledger. Add an integration test using the real discovery → supplementary → remediation ordering and assert that only remediation files appear.

- **Issue 3: Per-finding remediation verdicts are not enforced, so rejected or omitted fixes can pass as VERIFIED**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A remediation reviewer evaluating the several findings produced by fan-out omits one verdict, emits `fix-rejected` without restating an Issue block, or returns a contradictory top-level `VERIFIED`. Such structured-output omissions are probable as finding counts grow and are especially relevant here because the entire design is motivated by reviewer salience/completeness limits. The CLI accepts the response, patches VERIFIED, and permits the loop to finish with an unresolved Major.
  - **Details:**
    - **Violation:** The task requires “per-finding verdicts `fix-accepted / fix-rejected / accepted-with-modification`” as loop machinery. The implementation explicitly makes them “observability-only.”
    - **Location:** `ai_router/verification.py::parse_fix_verdicts()` and `ai_router/verify_session.py` after parsing remediation-review results.
    - **Impact:** There is no proof that every prior blocker was adjudicated, and a parsed `fix-rejected` does not independently block. Correctness depends entirely on the model also obeying a second prose requirement to restate the finding as an Issue.
    - **Evidence:** `fix_verdicts` may be empty and the CLI merely prints “none parsed”; there is no comparison against prior ledger findings, no duplicate/missing verdict validation, and classification uses only `merged_issues`. Tests cover successful parsing and a compliant rejected response, but no missing, duplicate, contradictory, or incomplete verdict case.
    - **Fix:** Give prior blocking findings stable identifiers and require exactly one recognized verdict for each. Fail closed on missing, duplicate, or unrecognized entries. Make `fix-rejected` blocking independently of Issue restatement, and require an accepted-with-modification residual to be recorded.

- **Issue 4: The convergence replay does not substantiate the claimed lower-cost comparison against Set 095**
  - **Category:** False Positive
  - **Severity:** Major
  - **Failure scenario:** The phased loop is accepted as validated because the release notes claim a reduction from 17 rounds/$4.88 to 4 rounds/$0.85. A typical future session starts with an unremediated corpus like Set 095’s original run, but the replay started after all 39 prior Majors had already been fixed. The claimed savings may therefore reflect the much easier starting state rather than the loop design, leaving the required falsifier untested. This directly affects the merge decision because bounded, materially cheaper convergence is the set’s stated acceptance objective.
  - **Details:**
    - **Violation:** The session must provide “the Set 095 corpus replay demonstrating convergence … at materially lower cost.”
    - **Location:** `s2-convergence-replay.md`, especially “Frozen state,” “Against the Set 095 baseline,” and qualification 1; the same comparison is promoted in `ai_router/CHANGELOG.md`.
    - **Impact:** The replay demonstrates that the loop can resolve five latent findings plus one remediation defect on the final R20 tree, but it does not demonstrate that it would outperform the old loop from an equivalent starting state.
    - **Evidence:** The memo states that the replay begins at `b16dd58`, “the exact tree Set 095’s second clean rubric round (R20) verified; all 39 remediated Majors are fixed in it,” then admits “The corpora are not identical in defect content.” Comparing that run with the earlier moving-tree process is confounded. In addition, the preserved raw artifacts contain no metrics rows or CLI transcript independently supporting the stated model and cost totals.
    - **Fix:** Replay from the same pre-round-1 frozen tree and equivalent evidence base as the Set 095 baseline, preserving stamped metrics/CLI logs for costs and calls. Otherwise narrow the claim to convergence on the final remediated corpus and remove the assertion that the replay demonstrates materially lower cost versus Set 095.

#### NITS

- **Nit:** The fan-out merge is concatenation, not a deduplicated union. `merged_issues.extend(issues_k)` preserves duplicate findings even though measured pairwise overlap is nonzero and planning refers to merge/dedupe. This can duplicate ledger work; normalize equivalent findings or document that deduplication is manual.

- **Nit:** Bounded totals and phase ordering are policy text only. The CLI permits repeated supplementary/discovery calls and unlimited remediation-review cycles, and it prints the same rerun command after every blocking remediation review. Add cap-aware validation or persist/count phase rounds.

- **Nit:** The supplementary pass does not verify that it is reviewing the same work state as discovery. It reassembles current evidence and records a fresh snapshot, so accidental edits between phases silently change the corpus despite the “SAME evidence” contract.

- **Nit:** The merged verdict is fail-open for any parsed token other than exactly `ISSUES_FOUND`: `else "VERIFIED"` does not require all completed calls to have returned `VERIFIED`. Unexpected/fallback verdicts should remain invalid or blocking, and the no-phase path should preserve its original parsed token.

- **Nit:** Clean remediation reviews never persist parsed `fixVerdicts` because issues envelopes are written only when `merged_issues` is nonempty. This contradicts the replay memo’s statement that fix verdicts were parsed into “round-3/4 envelopes”; only the round-3 envelope exists.

- **Nit:** The “byte-for-byte” no-phase compatibility claim is overstated. No-phase dry-run output now adds phase and complexity lines even though routing behavior remains equivalent.