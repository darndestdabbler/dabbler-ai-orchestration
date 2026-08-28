ISSUES FOUND

- **Issue 1:** Withdrawn disputes are rendered again in every later round because no adjudication state is tracked or inferred.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/verify.py, ai_router/schemas/disputes.schema.json`
  - **Failure scenario:** Round 1 produces a disputed finding; round 2 withdraws it but raises or retains another blocker; round 3 again receives the round-1 finding marked `DISPUTED` and is instructed to UPHOLD or WITHDRAW it. Multi-finding, multi-round remediation is an ordinary use of this verification loop, so this can repeatedly resurrect an already settled finding and consume the limited verification rounds.
  - **Acceptance criterion:** `JUDGMENT - In a three-round flow where round 2 withdraws a round-1 disputed finding while reporting another blocker, the round-1 finding is absent from round 3's pending prior findings and does not count as unresolved.`
  - **Details:** **Violation:** The task requires, “A withdrawn finding no longer counts as unresolved.” **Impact:** The channel does not reliably converge; a settled scope dispute can be adjudicated repeatedly and potentially block or exhaust the session, which should prevent merge. **Evidence:** `_prior_findings_block` builds a permanent map of every dispute and marks the corresponding historical finding on every invocation. `run_round` passes all disputes and all prior rounds each time, without examining any intervening round for withdrawal. Neither the dispute schema nor the rendering logic records or derives adjudication. **Fix:** After the first round that adjudicates a dispute, suppress the original disputed finding from later prompts; if upheld, rely on or persist its re-raised finding, and if withdrawn, keep it resolved.

- **Issue 2:** Evidence rendering arbitrarily drops content after the first 16 KiB rather than including the cited file’s relevant content.
  - **Category:** Completeness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/verify.py`
  - **Failure scenario:** An operator cites a normal long specification, source file, or test file whose relevant scope statement occurs after character 16,384. The next verifier sees only the unrelated prefix and a truncation marker, so it cannot address the actual cited evidence and may incorrectly uphold the finding. Files exceeding this size are common, and the CLI provides no line/range selector, making this probable for real repositories.
  - **Acceptance criterion:** `JUDGMENT - When the rebuttal-relevant passage of a cited UTF-8 file occurs after character 16,384, that passage is still included in the next-round verifier prompt through a complete rendering, explicit range, or relevance-preserving extraction.`
  - **Details:** **Violation:** The task requires “the cited files' relevant content” directly beside the rebuttal. **Impact:** The central evidence-backed nature of the dispute channel fails for common large files, materially undermining adjudication and merge confidence. **Evidence:** `_cited_evidence_lines` always uses `text[:_DISPUTE_EVIDENCE_INLINE_CAP]`; it performs no relevance selection, and `--evidence` accepts only a path with no range mechanism. **Fix:** Support explicit line/range citations or implement extraction that guarantees the rebuttal-relevant passage is included rather than blindly taking the file prefix.

## NITS

- **Nit:** Relative evidence paths are not resolved and checked for repository containment. A path such as `../private-notes.txt` is accepted if it exists and is then embedded in the verifier prompt, despite the requirement that evidence name a repo path. Absolute paths receive the containment check, making the relative-path behavior inconsistent.