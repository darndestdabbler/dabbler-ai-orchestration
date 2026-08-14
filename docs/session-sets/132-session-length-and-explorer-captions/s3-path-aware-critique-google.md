<!-- routed: task_type=code-review, exclude_providers=['anthropic', 'openai']; served by gemini-3.1-pro-preview / gemini-3.1-pro-preview, truncated=False, 220s. Raw, never edited. -->

VERDICT: ISSUES_FOUND

I read the changed files, particularly `s3-causality-and-compaction.md`, `s3_probe_overhead.py`, `s3_probe_tail.py`, `docs/ai-led-session-workflow.md`, `ai_router/changelog.d/0150-set-132-s3-why-long-sessions-are-long.md`, and `ai_router/__init__.py`. I verified the document's claims about the attribution logic against the probe loops, tracked the source of the `F` estimate back to its boundary timestamps, and checked the transport implementation for the claimed dropped parameter. I found two blocking flaws in the measurement claims where the evidence on disk contradicts the document's confidence.

### Findings

- **Severity:** Major
- **Category:** False confidence
- **Location:** `docs/session-sets/132-session-length-and-explorer-captions/s3-causality-and-compaction.md`:215 (and `ai_router/changelog.d/0150-set-132-s3-why-long-sessions-are-long.md`:25)
- **Evidence paths:** `s3-causality-and-compaction.md`, `s3_probe_overhead.py`, `s2-measurement.md`
- **Description:** 
  1. **Violation:** The document and changelog claim that the two estimates of `F` (39 min regression intercept and 41.1 min observed ceremony) "share no arithmetic" and are independent.
  2. **Impact:** False confidence. The operator is led to believe two separate measures independently validated the ~40m fixed overhead, when both estimates carry the exact same measurement artifact (defect D3).
  3. **Evidence:** `s3_probe_overhead.py` calculates the first `delta` from `startedAt` and adds the `tail` up to `completedAt`. The sum of all gaps is strictly `completedAt - startedAt`, which is exactly the `elapsed` duration used in Session 2's regression. Both metrics rest on the same boundary writes and inherit the identical confound.
  - **Fix:** Remove the claim that they "share no arithmetic" / are independent. Explicitly state that both estimates inherit the same `startedAt`/`completedAt` boundary-write confound. Update the changelog fragment to remove the false claim.

- **Severity:** Major
- **Category:** Correctness / False confidence
- **Location:** `docs/session-sets/132-session-length-and-explorer-captions/s3-causality-and-compaction.md`:197
- **Evidence paths:** `s3-causality-and-compaction.md`, `s3_probe_overhead.py`
- **Description:** 
  1. **Violation:** The document claims the attribution rule is "robust to BATCH LOGGING within a role" because "when an orchestrator logs steps 3-8 in the same second... every member of the batch has the same role".
  2. **Impact:** It misleads the operator about the accuracy of `w-bar` and `F`. A batch of steps 3-8 crosses the WORK / CEREMONY boundary. The script charges all elapsed time to the *first* logged step of the batch. If work and ceremony steps are batched together, ceremony time is incorrectly assigned to work time, inflating `w-bar` and deflating `F`.
  3. **Evidence:** In `s3_probe_overhead.py`, the loop `for when, step_no in marks` assigns the entire `delta` to `roles[step_no - 1]`. For a batch sharing the same `when`, only the first step gets the elapsed time. The 4-step ceremony skeleton ensures steps 3-8 do not all share the same role.
  - **Fix:** Correct the document to state that batch logging across role boundaries (e.g. final work step + closing ceremony) misattributes ceremony time to work, and that the attribution rule is *not* robust to such batches.

### NITS

- **Nit:** `s3_probe_tail.py`:108 appends `tail_gap` to `cer_min` regardless of the `mappable` flag. This doesn't corrupt the output because `cer_min` is correctly discarded if `not mappable` when building the dict on line 127, but it is internally inconsistent and confusing and `if mappable: cer_min += tail_gap` would be safer.