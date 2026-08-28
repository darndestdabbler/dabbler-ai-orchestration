ISSUES FOUND

- **Issue 1:** Bare-path evidence still drops all content after 16 KiB, so the prior evidence-rendering defect persists.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `ai_router/verify.py`
  - **Failure scenario:** An operator follows the primary `--evidence <path>` contract and cites a source, specification, or test file longer than 16 KiB whose relevant passage occurs later in the file. Such files and bare-path citations are common. The dispute is accepted, but the next verifier receives only the unrelated prefix and cannot evaluate the actual cited evidence, potentially causing an incorrect uphold decision.
  - **Acceptance criterion:** `JUDGMENT - Given an accepted bare-path citation to a UTF-8 file longer than 16 KiB whose grounds identify a sentinel passage after the cap, the next-round prompt must contain that passage, or the CLI must refuse to record the bare citation and require a precise range.`
  - **Details:** **Violation:** The session requires “the cited files' relevant content” directly beside each disputed finding. **Impact:** The dispute channel can omit the evidence necessary for independent adjudication, materially undermining its core objective and blocking merge. **Evidence:** `_cited_evidence_lines` still executes `text[:_DISPUTE_EVIDENCE_INLINE_CAP]` for every accepted bare-path citation. The new range syntax only provides an optional workaround; it does not prevent ordinary accepted citations from silently omitting the relevant tail. The correct fix is to make accepted bare citations reliably carry the relevant passage or reject oversized bare citations before recording them with actionable range guidance.

**Resolved prior finding:** The repeated-adjudication defect is addressed: `_split_disputes` presents a filed dispute once and marks the originating finding settled after the next recorded round, so a withdrawn finding is no longer presented as `DISPUTED` in subsequent rounds.