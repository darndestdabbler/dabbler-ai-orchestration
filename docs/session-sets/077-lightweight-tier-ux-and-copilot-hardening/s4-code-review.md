## Code Review — Set 077 Session 4

### Critical

**Issue:** Possible `UnboundLocalError` on the fresh-start path.
**Location:** `ai_router/session_state.py` `register_session_start`, new re-open guard (~line 646).
```python
    if isinstance(existing, dict):
        prior_completed = compute_effective_completed_sessions(session_set)

    if session_number in prior_completed:   # <-- outer indent
        raise SessionStateInvariantError(4, ...)
```
`prior_completed` is only assigned **inside** the `if isinstance(existing, dict):` block, but the new guard reads it at function-body indent. For a fresh set (`existing is None`) `prior_completed` is unbound and `session_number in prior_completed` raises `UnboundLocalError`, breaking the most common path (starting the first session).
**Fix:** Initialize unconditionally before the guard (confirm it isn't already defaulted above):
```python
prior_completed: List[int] = []
if isinstance(existing, dict):
    prior_completed = compute_effective_completed_sessions(session_set)
if session_number in prior_completed:
    raise SessionStateInvariantError(4, ...)
```

---

### Major

**Issue:** Read path now hard-fails on transient `PermissionError` while the write path was specifically hardened to *retry* it — asymmetric and regression-prone on the exact Windows locking scenario this set is addressing.
**Location:** `ai_router/session_state.py` `read_raw_session_state` (~line 2007) vs `_atomic_write_json` retry (~line 2089).
```python
except (FileNotFoundError, json.JSONDecodeError, UnicodeError):
    return None
# PermissionError now propagates
```
A status/Explorer read hitting a momentarily locked file (editor/AV holding the handle) will now raise out of a previously total function. Any caller that assumed `None`-on-failure can crash. The write side treats the identical `PermissionError` as transient and retries; reads should be at least as tolerant.
**Fix:** Either audit every `read_raw_session_state` caller for exception handling, or apply the same bounded retry-then-propagate for `PermissionError` here so a transient lock returns the prior/None state rather than crashing a read-only path.

---

### Minor

**Issue:** `main()` and `run()` resolve Lightweight mode through **different** code, contradicting the stated "resolver caches, so they agree" rationale. `main()` calls `resolve_no_router_mode` (cache, full precedence chain incl. its logging); `run()`'s `_resolve_no_router_for_run` deliberately bypasses the cache and recomputes only `env OR spec-tier`. If the resolver consults any source beyond env+spec, or applies different precedence, the logged decision and the enforced decision diverge.
**Location:** `ai_router/close_session.py` `_resolve_no_router_for_run` (~1345) and `main()` comment (~2281).
**Fix:** Have `_resolve_no_router_for_run` delegate to the same precedence primitive `resolve_no_router_mode` uses (with cache disabled / per-set arg), or correct the comment and add a note that the two must be kept in lockstep manually.

---

**Issue:** `max(sessions)` assumes contiguous 1-based, integer session numbers.
**Location:** `ai_router/session_state.py` `_finalize_total_sessions_from_entries` (~1914).
```python
data["totalSessions"] = max(sessions)
```
A single corrupt/outlier `sessionNumber` (e.g. `99`) now inflates `totalSessions` to 99; string-typed numbers would compare lexicographically. `len` under-counted, `max` over-counts on bad data — neither is robust.
**Fix:** Coerce and bound: `data["totalSessions"] = max(int(n) for n in sessions)` and consider validating against `len(sessions)` to detect gaps rather than trusting the max blindly.

---

**Issue:** Return-value contract change may misreport upstream.
**Location:** `ai_router/session_state.py` `backfill_session_state_files` (~2606).
Returns `written` (files actually created) instead of `len(paths)` (files planned). Any caller/log asserting "planned == returned" now sees fewer on a TOCTOU skip.
**Fix:** Intentional, but verify callers/tests treat the return as "written," and consider returning both planned and written if callers need the distinction.

---

**Issue:** `loadTemplateBundle` will hard-throw if the new template file is missing from a packaged bundle, taking down all bootstrap rendering (not just the new doc).
**Location:** `tools/dabbler-ai-orchestration/src/utils/consumerBootstrap.ts` `loadTemplateBundle` (~150) + `BUNDLE_FILES`.
`renderConsumerBootstrap` / `renderStructureBootstrap` now reference `crossProviderVerificationTemplate`; a bundle shipped without `cross-provider-verification.md.template` breaks existing scaffolding paths (only `ensureCrossProviderVerificationDoc` swallows the error).
**Fix:** Confirm the `.template` is in the extension's packaged `docs/templates/consumer-bootstrap/` (vsce `files`/`.vscodeignore`); add a packaging test asserting every `BUNDLE_FILES` entry is present in the built VSIX.

---

**Issue:** WAIVED continuation-reason lookup stops at the first non-empty line.
**Location:** `ai_router/external_verification.py` `_parse_round_body` (~follow loop).
If a `WAIVED` line is followed by any non-empty prose line that isn't `Reason:` before the real `Reason:` line, the reason is lost and the verdict silently degrades to unrecognized. Consistent with "fail louder," but the strictness is undocumented at the call boundary and easy to trip.
**Fix:** Acceptable as designed; document in the extension's `cross-provider-verification.md` template that `Reason:` must immediately follow `WAIVED` (or be on the same line), so authored artifacts match the parser.

---

### Suggestion

**Issue:** `close_session` re-implements file read + parse instead of using `read_external_verification`, risking drift from the "one parser, two readers" invariant.
**Location:** `ai_router/close_session.py` soft-gate block (~1770) vs `external_verification.read_external_verification`.
**Fix:** If the distinct "missing vs unreadable vs no-verdict" messaging is required, keep the manual read but factor the classification into the module (e.g. return the result plus a `source_problem` enum) so both readers share it.

**Issue:** `ensureCrossProviderVerificationDoc` writes to the consumer's working tree as a side effect of a **copy-to-clipboard** command, on every invocation.
**Location:** `copyPromptCommands.ts` command handlers (~355–390).
This can dirty git status unexpectedly for a read-only-feeling action. It is idempotent (content-compare before write), so churn is limited, but the side effect is surprising.
**Fix:** Keep, but surface it (status-bar/notification on first write per session), or gate behind a settings flag.

**Issue:** `no_router` is resolved before the `--repair` short-circuit, wasting a spec/env read on the repair path.
**Location:** `ai_router/close_session.py` `run` (~1449).
**Fix:** Move the `_resolve_no_router_for_run` call below the repair branch (it's only consumed by the gate/attestation flow).

---

### Verified clean
- Full-tier path: soft-gate block is fully behind `if no_router:`; `close_is_terminal` compute-once yields the same value the per-gate calls produced — no Full-tier behavior change beyond the intended shared keying.
- Exit-code map addition (`aborted_at_soft_gate: 4`) and TOCTOU in-lock idempotency re-check are correct (early `return` inside the lock `try` releases via `finally`).
- Parser: case-sensitive token enforcement post-`IGNORECASE`-match, `PENDING` non-recognition, latest-round-wins (`None` superseded by any numbered round, `>=` last-wins on ties), and template round-header/verdict grammar all agree with `cross-provider-verification.md.template` and the seeded `external-verification.md`.

---
**Verification (gpt-5-4, openai):** ISSUES_FOUND

**Issue 1** [Completeness / Major]: ** Missed a real cross-file logic bug: the spec-review prompt now writes the same artifact the close-out gate accepts.
  - **Category:** Completeness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The original task required review for "Bugs and logic errors" and "cross-file consistency." The response declared the parser/template integration clean but did not flag that `buildSpecReviewPrompt()` now includes both `verificationPointerOpener()` and `verificationArtifactClose(set)`.
    - **Impact:** A pre-work spec review can write a recognizable verdict into `external-verification.md`, and `close_session` will treat that as satisfying the Lightweight soft gate later. That weakens the gate from "verify delivered work" to "any prior recognizable verdict exists," which is merge-blocking.
    - **Evidence:** In `tools/dabbler-ai-orchestration/src/commands/copyPromptCommands.ts`, `buildSpecReviewPrompt()` now appends the same `verificationArtifactClose(set)` used by the session/set review prompts, which instructs the reviewing engine to write to `docs/session-sets/<slug>/external-verification.md`. In `ai_router/close_session.py`, the soft gate only checks whether that file has a recognizable verdict; it does not distinguish spec review from session/set verification. The canonical doc it points to (`cross-provider-verification.md.template`) is also accomplishment-review oriented (`activity-log.json`, `change-log.md`, git diff), not spec-review oriented.
    - **Correct answer:** The response should have flagged this as **Major** and recommended either keeping spec review out of `external-verification.md` entirely or marking review kind so `close_session` ignores spec-only rounds.

-
**Issue 2** [False Positive / Major]: ** The review's `UnboundLocalError` blocker is not substantiated by the diff shown.
  - **Category:** False Positive
  - **Severity:** Major
  - **Details:**
    - **Violation:** The instructions require blocker findings to be proven from "what is actually in front of you." The response states a **Critical** fresh-start crash as fact from a partial excerpt.
    - **Impact:** A false blocker changes the merge decision for no proven reason.
    - **Evidence:** The cited hunk in `register_session_start` does not show the earlier part of the function. From the diff alone, you cannot prove `prior_completed` was not already initialized above the hunk. The response presents certainty (`UnboundLocalError` on the fresh-start path) without full-function evidence.
    - **Correct answer:** This should have been omitted or explicitly qualified as "needs full-function confirmation," not reported as Critical.

-
**Issue 3** [False Positive / Major]: ** The review's `PermissionError` regression claim is speculative, not demonstrated.
  - **Category:** False Positive
  - **Severity:** Major
  - **Details:**
    - **Violation:** Blockers must identify an actual broken contract and provide evidence. The response labels the narrowed `read_raw_session_state()` exception handling a **Major** defect without showing a failing caller or violated API contract.
    - **Impact:** It wrongly turns an intentional safety hardening into a merge-blocking objection.
    - **Evidence:** The code comment in `ai_router/session_state.py` explicitly explains why `PermissionError` now propagates: silently treating an unreadable-but-present file as absent could let writers clobber real state. The response offers only hypotheticals ("Any caller that assumed None-on-failure can crash") and no actual call path, stack, or contract proving that behavior is broken.
    - **Correct answer:** At most this is a request for caller audit/test coverage, not a Major issue on the evidence shown.
