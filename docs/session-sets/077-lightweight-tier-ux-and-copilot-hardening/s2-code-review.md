[Critical] NO FINDINGS

---

[Major]

**1. Durable seed silently reverts a deliberate radio flip made after the marker exists**
`media/session-sets-tree/client.js` (~L150-158, seed block) + `src/commands/gitScaffold.ts` scaffold marker write.

- **Defect:** The seed is re-applied once per *script load* and unconditionally outranks persisted state whenever `.dabbler/tier` exists. After `build-structure` runs, `scaffoldConsumerRepo` writes the marker while the Getting Started form is still shown (no session-sets exist yet, so `mode` stays `getting-started`). The tier radio remains user-editable in that surface.
- **Failure scenario:** Operator scaffolds structure as **full** (marker=full) → changes their mind and flips the radio to **lightweight** (persisted via `persistGsState`) → hides/reloads the view → on reload the snapshot seed (`gs.tierSeed`=full from the marker) overrides the persisted `lightweight`, re-checking Full. The subsequent `build-session-sets` then resolves marker-first and also copies a **full** prompt. This silently discards the operator's changed choice — the exact "revert" class of bug Feature 1 exists to kill, now reachable in the post-structure/pre-session-sets window.
- **Fix:** Either suppress the seed once a live flip is persisted (record a `userTierDirty` flag in the persisted payload and skip seeding when set), or make the in-form radio flip write-through the marker so seed and persisted state can never disagree.

---

[Minor]

**2. `persistGsState()` replaces the entire webview state object**
`media/session-sets-tree/client.js` `persistGsState` (~L74-83).

- **Defect:** `vscode.setState({ gsState: {...} })` overwrites *all* persisted state rather than merging. It's safe today only because `bucketCollapsed` is in-memory, but any future `setState` consumer (scroll position, collapsed buckets) will be clobbered on every keystroke/radio change.
- **Fix:** `vscode.setState({ ...(vscode.getState() ?? {}), gsState: {...} })`.

**3. Router-config inference outranks a live operator radio selection**
`src/wizard/sessionGenPrompt.ts` `copySessionSetGenPrompt` (~L247-257).

- **Defect:** `tier: durable?.tier ?? options.tier` lets an *inferred* tier (no marker, but `install-method` + `router-config` present) win over `options.tier` (the radio the operator just set). The prompt then renders a hedged "inferred … full" over a live `lightweight` pick.
- **Failure scenario:** Pre-077 workspace (or one whose marker write failed) with a stale full-tier `router-config`; operator selects lightweight and triggers build-session-sets → prompt claims full "inferred from router configuration," contradicting the just-made selection. Doesn't arise in the happy path (build-structure writes the marker first) but is a truth violation when it does.
- **Fix:** Rank the explicit form radio above `inference` (marker → form radio → inference → none), or only consult inference when `options.tier` is absent.

**4. Verification-mode marker written via unchecked `as` cast**
`src/commands/gitScaffold.ts` (~L114-119).

- **Defect:** `(deps.ctx.verificationMode || "out-of-band-or-none") as VerificationMode` writes whatever truthy string `ctx.verificationMode` holds; a bad value round-trips to `null` on read (`readVerificationModeMarker`), silently discarding the S3 second dimension the marker exists to preserve.
- **Fix:** Validate/narrow before writing (mirror `asTier`'s fail-loud or default posture) rather than casting.

**5. Tier-mismatch terminal-suppression enumerates only `complete`/`cancelled`**
`src/utils/tierLegibility.ts` `tierMismatch` (~L108-116).

- **Defect:** Any `SessionState` outside `{complete, cancelled}` is treated as non-terminal and can render the loud `t!` advisory. If a closed-equivalent state exists (e.g. force-closed) that is not one of those two literals, a drifted-but-effectively-closed row goes loud, which the comment ("closed set's configuration is no longer actionable") says it should not.
- **Fix:** Suppress on the full terminal/closed state set (reuse the same predicate the blocked-marker suppression uses) rather than a two-literal check.

---

[Suggestion]

**6. `written` array mixes POSIX and native separators**
`src/commands/gitScaffold.ts` — markers pushed as `TIER_MARKER_REL` (`path.posix.join`, forward slash) while loop artifacts use native `rel`. Cosmetic on Windows reporting only; normalize for consistency.

**7. Redundant `persistGsState()` in seed block**
`client.js` seed block calls `persistGsState()` even when `gsState.tier === gs.tierSeed` (no change). Harmless, but move it inside the `!==` branch.

---
**Verification (gpt-5-4, openai):** ISSUES_FOUND

**Issue 1** [Completeness / Major]: Missed a merge-blocking false-positive path in the new `t!` advisory**
  - **Category:** Completeness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The task explicitly said to scrutinize the “**tier-mismatch advisory suppression rules and any way it could flap or mislead**.” The reviewed response never addresses that the new advisory fires on supported, intentional mixed-tier sets.
    - **Impact:** The Explorer will show a loud `t!` “Tier mismatch” warning for valid non-terminal sets whose spec tier intentionally differs from the workspace default. That makes the new advisory noisy on a supported workflow, which is a merge-blocking UX/correctness defect.
    - **Evidence:** `src/wizard/sessionGenPrompt.ts` (~L120-141) now tells planners to use the workspace tier **unless the project plan explicitly calls for a different tier on a specific set**. But `src/utils/tierLegibility.ts` (~L108-116) defines `tierMismatch()` as `workspaceTierMarker !== specTier` for every non-terminal row, and `src/providers/SessionSetsModel.ts` (~L63-75) always renders `TIER_MISMATCH_MARKER` for that case. The code comment claiming “a manual spec edit is the only way to get there” is disproved by the prompt contract itself. The response under review missed this entirely.
    - **Correct answer:** Flag `src/utils/tierLegibility.ts` / `src/providers/SessionSetsModel.ts` as a Major issue: the advisory needs narrower conditions, different copy, or suppression for sanctioned per-set overrides.

-
**Issue 2** [Completeness / Major]: Missed that the webview `asTier` caller is not “operator-visible” fail-loud**
  - **Category:** Completeness
  - **Severity:** Major
  - **Details:**
    - **Violation:** The change summary claims: “**asTier: case-insensitive, fail-loud (throws) on present-but-unknown values; call sites catch and reject operator-visibly.**” The response did not catch that one caller does not do that.
    - **Impact:** On the Getting Started webview path, a malformed `tier` is rejected with only a console warning and a `false` return; from the operator’s perspective the action can silently do nothing. That violates the stated contract for the newly introduced fail-loud boundary.
    - **Evidence:** In `src/commands/gettingStartedActions.ts` (~L82-90 and ~L119-127), both `asTier(msg.tier)` catch blocks do `console.warn(...)` and `return false`. By contrast, the scaffold command path in `src/commands/gitScaffold.ts` (~L257-264) does `vscode.window.showErrorMessage(...)`. Nothing in the shown diff adds a user-visible error for the webview path. The response under review never mentions this.
    - **Correct answer:** Flag `src/commands/gettingStartedActions.ts` as a Major contract violation and require a user-visible rejection path, not just `console.warn`.
