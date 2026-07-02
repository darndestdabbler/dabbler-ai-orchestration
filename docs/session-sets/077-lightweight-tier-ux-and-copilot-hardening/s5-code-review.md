## Review Findings

---

### [Critical] TS ladder — `setTerminal` is always `false` for completed sets

**Location:** `fileSystem.ts`, `readSessionSets`, the `deriveWorkflowState` call

**Issue:** The third argument is `liveSession?.status ?? null`. `liveSession` is the in-flight-session tracker; it is `null` for any set whose top-level `state === "complete"`. This makes `setTerminal = (null === "complete")` = `false` for every completed set, regardless of set status.

**Violated requirement:** The Python/TS ladder must agree (REVIEW STANCE — TS/Python ladder divergence). Python `derive_state` derives `set_terminal` from the SET-level status field. TS derives it from the live-session status field, which is structurally different.

**Concrete impact:** For any completed Mode-B set whose last verification session closed without recording `VERIFIED` and without seeding an issues envelope (the blank-verdict adjudication case, e.g. the headless soft-warn close path), the TS ladder returns `"awaiting-human"` while Python returns `"closed-verified"`. The Explorer row shows "awaiting-human" text; `resolveStartNextSessionPrompt` routes to the wrong prompt; the pending-verification banner emits spurious "stopped to a human" notices for finished sets on every subsequent session start.

**Fix:** Replace `liveSession?.status ?? null` with `state` — the set-level status string already in scope in `readSessionSets` at the `workflowState` derivation site.

```typescript
// Before
workflowState = deriveWorkflowState(
    ledgerSessions as LedgerSessionLike[] | null,
    config.verificationMode,
    liveSession?.status ?? null,
    readLatestIssuesEnvelope(dir),
);

// After
workflowState = deriveWorkflowState(
    ledgerSessions as LedgerSessionLike[] | null,
    config.verificationMode,
    state,           // set-level status: "complete" | "in-progress" | …
    readLatestIssuesEnvelope(dir),
);
```

---

### [Major] Kickoff prompt regression — `--handoff --handoff-verdict ISSUES_FOUND` flags removed with no inline substitute

**Location:** `copyPromptCommands.ts`, `buildVerificationKickoffPrompt` (rewritten) and `buildRemediationHandoffPrompt` (new)

**Issue:** The old step 5 gave the exact handoff command:

```
`python -m ai_router.start_session --session-set-dir "${setDirRel}" --type remediation --handoff --handoff-verdict ISSUES_FOUND --engine <work-engine> --provider <work-provider>`
```

The rewrite removes this command from the kickoff and delegates to the workflow doc. `buildRemediationHandoffPrompt` — the replacement for `awaiting-remediation` state — also omits `--handoff --handoff-verdict ISSUES_FOUND` from its inline command, mentioning them only conditionally in prose ("if the verification session is still in flight, add …"). The inline command shown is:

```
`python -m ai_router.start_session --session-set-dir "${setDirRel}" --type remediation --engine <work-engine> --provider <work-provider>`
```

**Violated requirement:** The start-session guardrail (REVIEW STANCE — start-time guardrail) protects only against same-provider *verification* starts; it has no guard for remediation sessions. A remediation session opened without `--handoff` when the verification session is still in-flight creates two concurrent typed sessions, which the register writer fails-loud on, or worse, succeeds on a code path that does not enforce the single-in-flight invariant. An agent that reads only the prompt and not the workflow doc will follow the inline command verbatim and omit the flags.

**Fix:** In `buildRemediationHandoffPrompt`, unconditionally include `--handoff --handoff-verdict ISSUES_FOUND` in the inline command. The conditional prose ("if still in flight") is insufficient for agent-followed instructions — the handoff flags are always correct when a verification session is outstanding and always harmless when it is not (the writer handles the no-in-flight case).

```typescript
`\`python -m ai_router.start_session --session-set-dir "${setDirRel}" --type remediation --handoff --handoff-verdict ISSUES_FOUND --engine <work-engine> --provider <work-provider>\`\n` +
```

---

### [Major] TS ladder divergence — remediation with no issues envelope returns `"awaiting-human"` where Python returns a terminal state

**Location:** `tierLegibility.ts`, `deriveWorkflowState`, the `latestType === "remediation"` block

**Issue:** When `issues.length === 0` (no envelope, or envelope with empty `issues[]`) and there is no `humanStop`:

```typescript
// openIssues === [], humanStop === false → first guard does not fire
if (humanStop || openIssues.length > 0) return "awaiting-human";

const anyFixed   = issues.some(…"fixed"…);       // false (empty)
const allTerminal = issues.length > 0 && …;       // false (length guard)

if (anyFixed)    return "awaiting-verification";  // skipped
if (allTerminal) return "closed-dispositioned";   // skipped
return "awaiting-human";                          // ← emitted
```

Python `derive_state` for the same input (empty `open_issues`, `human_stop=False`) reaches the `not open_issues and not human_stop` guard before the remediation-specific block and returns `STATE_CLOSED_VERIFIED` (the "all findings terminally dispositioned at the verification boundary" short-circuit applies equally to an empty issue set).

**Concrete impact:** A remediation session that resolves all issues without a seeded round-N envelope (i.e. the original envelope from the verification round is the only one, all issues dispositioned there) presents as `"awaiting-human"` in the Explorer and gets the wrong prompt from `resolveStartNextSessionPrompt`. The Python banner and close gate see it as terminal.

**Fix:** In the `latestType === "remediation"` block, add a no-envelope early return before the `anyFixed`/`allTerminal` checks:

```typescript
if (latestType === "remediation") {
    if (humanStop || openIssues.length > 0) return "awaiting-human";
    if (issues.length === 0) return "closed-verified";   // ← add
    const anyFixed = issues.some(…);
    …
}
```

---

### [Minor] Banner emits a stale "verification owed" notice before the cross-provider refusal fires

**Location:** `start_session.py`, `_run_under_lock`, banner call placement (~line 915)

**Issue:** `_print_pending_verification_banner` fires unconditionally before `_run_typed_session`, which contains the `_refuse_same_pair_verification` gate. An operator running `start_session --type verification` with the same engine+provider on an `awaiting-verification` set sees the banner output ("verification owed — run … --engine <other-engine>") and then immediately the refusal message. The banner output describes the very thing the operator is incorrectly attempting, making it appear as though the banner is confirming the action rather than flagging a debt.

**Fix:** Move `_print_pending_verification_banner` to after the per-session-type dispatch returns successfully — or suppress it specifically when the session type is `"verification"` and the declared identity cannot satisfy the cross-provider predicate (let the refusal message own the output in that case). The simplest safe fix is to gate the banner: `if args.type != "verification" or _refuse_same_pair_verification(…) is None: _print_pending_verification_banner(…)`.

---

### [Minor] `readLatestIssuesEnvelope` — round-1 key collision if both `sN-issues.json` and `sN-issues-round-1.json` exist

**Location:** `fileSystem.ts`, `readLatestIssuesEnvelope`

**Issue:** Round-1 files with no suffix get key `[N, 1]`; a file named `sN-issues-round-1.json` also gets key `[N, 1]`. If both exist for the same session (partial migration or manual naming), whichever appears later in the `readdirSync` array wins non-deterministically.

**Fix:** Assign round-1 suffix-less files a synthetic round value of `0` (or `1`) consistently and document that `-round-1` suffix files have key `1`. Alternatively, prefer the suffix-bearing file when keys collide, since explicit round numbering is the canonical form.

```typescript
m[2] ? parseInt(m[2], 10) : 0,   // no suffix = round 0, always loses to -round-N
```

---

### No material finding on: predicate mirroring, A7 raw-seed consumers, banner infinite recursion, `cross_provider_satisfied` engine/provider arm logic

The start-time guardrail and close-gate use the same `cross_provider_satisfied` and `work_session_pairs` implementations with the same fail-closed no-baseline posture. The declared-vs-recorded identity gap is a user-error surface, not a predicate asymmetry. The A7 override correctly applies downstream of all seed-derived consumers; no consumer requires the raw seed post-override. The banner iterates siblings without recursion; completed candidates are gated on `len(notices) < MAX_NOTICES`. The most-recent pick (`completed_candidates[-1]` after ascending sort on ISO strings) is correct.

---
**Verification (gemini-pro, google):** ISSUES_FOUND

**Issue 1** [False Positive / Major]: ** The review incorrectly identifies a Python/TypeScript divergence

-   **Category:** False Positive
-   **Severity:** Major
-   **Details:** The review's third finding, "[Major] TS ladder divergence — remediation with no issues envelope...", is based on a flawed analysis of the Python source code. The review claims that for a remediation session with no issues envelope, the Python `derive_state` function returns a terminal state (`STATE_CLOSED_VERIFIED`), while the TypeScript equivalent returns `"awaiting-human"`. This is factually incorrect.
    -   **Violation:** The review's claim about the Python code's behavior is false. It asserts: "Python `derive_state` for the same input... returns `STATE_CLOSED_VERIFIED` (the 'all findings terminally dispositioned at the verification boundary' short-circuit applies...)."
    -   **Impact:** This false positive would cause the developer to modify correct TypeScript code to match a misinterpretation of the Python code, introducing a real bug where none existed. It invalidates a key part of the review's conclusion and would change the merge decision based on incorrect evidence.
    -   **Evidence:** The "short-circuit" the review refers to is explicitly scoped *only* to `SESSION_TYPE_VERIFICATION`. The control flow for `SESSION_TYPE_REMEDIATION` does not contain this logic and proceeds to the final `return STATE_AWAITING_HUMAN`, behaving identically to the TypeScript version.

        *ai\_router/dedicated\_verification.py (diff)*
        ```python
        # This block is ONLY for verification sessions
        if latest_type == SESSION_TYPE_VERIFICATION:
            # ...
            if not open_issues and not human_stop:
                # The review incorrectly assumes this applies to remediation
                return STATE_CLOSED_VERIFIED
        # ...
        # The remediation block follows separately
        if latest_type == SESSION_TYPE_REMEDIATION:
            if human_stop or open_issues: # With no issues, this is skipped
                return STATE_AWAITING_HUMAN
            # ...
            any_fixed = ...  # False
            all_terminal = ... # False
            # ...
            if any_fixed: ...
            if all_terminal: ...
            return STATE_AWAITING_HUMAN # Correct return path, same as TS
        ```
        Both implementations correctly return the "awaiting-human" state in this scenario. There is no divergence.

---
###
**Issue 2** [Incompleteness / Major]: ** The performance review for the banner scan is incomplete

-   **Category:** Incompleteness
-   **Severity:** Major
-   **Details:** The original task explicitly required a review of "The banner scan: perf/robustness on large repos (~80 sets)". The review's "No material finding" section dismisses this by only checking for infinite recursion, failing to analyze the actual performance characteristic of the implementation: disk I/O.
    -   **Violation:** The review claims to have checked banner scan performance but provides an analysis that is superficial and misses the most salient performance factor. The statement "The banner iterates siblings without recursion" is true but irrelevant to the I/O cost.
    -   **Impact:** The review provides false confidence. The change introduces a new I/O-bound operation that runs at the start of *every* session. For a large repository (e.g., 80 sets, as specified in the prompt), this involves iterating through all sibling directories and attempting to read and parse up to 80 `session-state.json` files. This linear-time I/O cost could introduce a noticeable and undesirable startup latency, which a reasonable reviewer might want addressed before merging.
    -   **Evidence:** The implementation in `ai_router/pending_verification.py` loops over all sibling directories and calls `_read_raw_state` for each one that isn't filtered out. This function opens, reads, and JSON-decodes a file from disk inside the main loop.

        *ai\_router/pending\_verification.py*
        ```python
        def pending_verification_notices(...):
            # ...
            try:
                # Iterates ALL siblings
                siblings = sorted(p for p in parent.iterdir() if p.is_dir())
            except OSError:
                siblings = []
            for sibling in siblings:
                # ...
                # File I/O and JSON parsing occurs inside the loop
                raw = _read_raw_state(sibling)
                if raw is None:
                    continue
                # ... more processing
        ```

---
