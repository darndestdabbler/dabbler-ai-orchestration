# AI Assignment: Set 079 - Copilot Seat-Profile Onboarding and Verification-Mode Copy

This document specifies the recommended AI orchestrator assignments and routing decisions for each session in the set.

---

## Session 1: Copilot CLI presence probe + Full-tier sub-choice UI

### Recommended orchestrator
Claude Code claude-fable-5 @ effort=medium

### Rationale
This session extends an existing, well-precedented webview state machine
(the `tierDirty`/`verificationModeDirty` seed/dirty/reload pattern Set 077
established) with one more field and one more conditional radio group.
Claude's strength in tracking logic across TS/JS file boundaries while
following an established pattern closely (not inventing a new one) fits
this session's actual risk profile — the risk is drift from the proven
pattern, not novel design. The routed architecture critique confirmed
this part of the design as "blessed as sound."

### Estimated routed cost
Moderate

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1.   | Add Copilot CLI presence probe | `direct:edits` |
| 2.   | Add Full-tier sub-choice radio group | `direct:edits` |
| 3.   | Add the Copilot-missing step-1 warning | `direct:edits` |
| 4.   | Extend gsState/persistGsState/restoreGsState | `direct:edits` |
| 5.   | Layer-2 tests for probe, radio, persistence | `test-generation`, `code-review` |
| 5.   | Full pass; verify; close | `direct:shell`, `session-verification` |

### Actuals (filled after the session)
- Orchestrator used: Claude Code claude-fable-5 @ effort=medium (as recommended)
- Total routed cost: $0.80 (test-generation gemini-pro $0.09; code-review opus $0.33 + gpt-5-4 auto-verify $0.18; session-verification gpt-5-4 $0.19)
- Deviations from recommendation: none on routing. One code-review verifier Major was adjudicated against empirical evidence (explicit-`.cmd` probe semantics — see `s1-close-reason.md`); its comment/test substance was fixed in-session, recorded via `record_adjudication`.
- Notes for next-session calibration: Session 2 must decide how an explicit `dabblerSessionSets.copilotCliPath` reaches the refresh spawn — `copilot_catalog` exposes `--binary` (default `copilot`); mind cmd.exe argument parsing if the binary is ever a `.cmd` (BatBadBut). The `transportProfileSeed` host resolver is deliberately unwired; S2 creates the durable source alongside the `transport.profile` template write.

**Next-session orchestrator recommendation (Session 2):**
Claude Code claude-fable-5 @ effort=high
Rationale: Session 2 is where the architecture critique's CRITICAL
findings (C1 seat-identity, C2 sequencing, M4 config-write-as-replace)
land — real subprocess/ordering/config-write design, not a UI extension.
Recommend high effort given the critique already flagged this class of
work as the set's actual novelty.

---

## Session 2: Wire the happy path (sequencing, subprocess, progress, config write)

### Recommended orchestrator
Claude Code claude-fable-5 @ effort=high

### Rationale
This session implements the corrected sequencing (catalog-refresh runs
strictly after scaffold/venv/install, using the venv's own interpreter),
auto-derived seat identity, `withProgress`-based cancellable subprocess
invocation with disposal handling, and the config-write-as-template-
variable — four distinct, previously-unprecedented design points the
architecture critique specifically flagged as CRITICAL/MAJOR. High effort
reflects that this is genuinely the riskiest session in the set, now that
its scope has been narrowed to the happy path only (failure matrix moved
to Session 3).

### Estimated routed cost
High

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1.   | Hook refresh after scaffold/venv/install; venv-interpreter resolution | `direct:edits` |
| 2.   | Auto-derive seat-id/seat-label | `direct:edits` |
| 3.   | `withProgress` cancellable subprocess wrapper + disposal handler | `direct:edits`, `code-review` |
| 4.   | Parse refresh result (not exit code); config-write-as-template-variable | `direct:edits` |
| 5.   | Layer-2 tests for the full happy path; one real local run against a live seat | `test-generation`, `code-review` |
| 6.   | Full pass; verify; close | `direct:shell`, `session-verification` |

### Actuals (filled after the session)
- Orchestrator used: Claude Code claude-fable-5 @ effort=high (as recommended)
- Total routed cost: $0.98 (test-generation gemini-pro $0.08; code-review opus $0.42 + gpt-5-4 auto-verify $0.22; session-verification gpt-5-4 3 rounds $0.19 + $0.05 + $0.02)
- Deviations from recommendation: none on routing. Verification took 3 rounds on one ledger issue (S2-V-001, "integration wiring unpinned"): the fix required adding test seams to buildProjectStructureNoPrompt itself, not just extracting helpers — the verifier correctly held the finding until the REAL build path was exercised.
- Notes for next-session calibration: Session 3's failure matrix should reuse the S2 outcome union (refresh-failed / insufficient-providers / config-write-failed / cancelled) and the BuildStructureSeams / SeatSetupProgressSeams test seams rather than inventing new harness surface. Named S2 residuals assigned to S3: atomic temp+rename config write; POSIX process-tree kill (win32 already taskkill /T). The DABBLER_*-presence check for honest `api`-fallback copy is the C3 core. Induced-failure dogfood: PATH manipulation or mid-run cancel against the real CLI — the scratch-project ts-node driver from S2 (scratchpad seat_dogfood.ts pattern) is a ready template.

**Next-session orchestrator recommendation (Session 3):**
Claude Code claude-fable-5 @ effort=high
Rationale: Session 3 covers the failure matrix and the honest-failure-UX
redesign the critique's C3 finding required (the "fall back to `api`"
story was actively wrong for this feature's target audience) — this is
correctness-critical, not mechanical, and warrants the same effort level
as Session 2.

---

## Session 3: Failure matrix, honest failure UX, and E2E judgment

### Recommended orchestrator
Claude Code claude-fable-5 @ effort=high

### Rationale
Getting the failure story right (critique C3) is the single most
consequential correctness requirement in this set — the operator's own
team is the target audience, and a wrong failure UX leaves them with a
silently non-functional router. High effort plus routed code-review on
every failure branch, matching how Set 077 funded review most heavily on
its own new-semantics surfaces.

### Estimated routed cost
Moderate to High

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1.   | Implement the DABBLER_*-presence-checked, honest failure UX | `direct:edits` |
| 2.   | Cover every failure branch (CLI missing, subprocess error, <2-providers, write-fails-after-refresh-succeeds) | `direct:edits`, `code-review` |
| 3.   | Real induced-failure dogfood (PATH manipulation or mid-run cancel) | `direct:shell` |
| 4.   | requiresE2E judgment call; record decision + reasoning | `direct` |
| 5.   | Layer-2 tests for every failure branch | `test-generation`, `code-review` |
| 6.   | Full pass; verify; close | `direct:shell`, `session-verification` |

### Actuals (filled after the session)
- Orchestrator used: Claude Code claude-fable-5 @ effort=high (as recommended)
- Total routed cost: $0.95 (test-generation gemini-pro $0.05; code-review opus $0.44 + gpt-5-4 auto-verify $0.23; session-verification gpt-5-4 2 rounds $0.22)
- Deviations from recommendation: none on routing. Verification R1 (gpt-5-4) returned findings with no verdict token and no severities — handled as blocking per L-071-1's anti-laundering rule (unknown severity blocks); both findings were test-coverage gaps, fixed, R2 VERIFIED.
- Notes for next-session calibration: Session 4's grep sweep must cover the full OLD strings AND distinctive fragments ("structured verification sessions", "close-out gate", "copy a review prompt into a second AI assistant") across both READMEs, the pinning tests, and any UAT/doc quote. Nothing in S3 touched `VERIFICATION_MODE_*_TEXT` or its quoters, so S4 starts from the Set 077 state. Two S3 limitations are S5-docs material (already named in s3-close-reason.md): POSIX group-kill unit-pinned but not live-dogfooded (win32 host); atomic write scoped to process-crash, not power-loss.

**Next-session orchestrator recommendation (Session 4):**
Claude Code claude-fable-5 @ effort=medium
Rationale: Session 4 is a copy change with a repo-wide sweep for stale
quotes — mechanical breadth, not deep reasoning; medium effort with
routed code-review to catch anything the grep sweep misses is sufficient,
same profile as every prior copy/docs session in Sets 077/078.

---

## Session 4: Simplify verification-mode copy (Feature 2)

### Recommended orchestrator
Claude Code claude-fable-5 @ effort=medium

### Rationale
Low-complexity, high-breadth: the actual copy decision is small, but the
sweep for every stale quote (constants, tests, both READMEs, and anything
else the grep turns up) needs to be thorough and not miss a file the way
the Set 077 UAT-rewrite pass had to correct twice. Routed code-review is
the safety net for completeness here, not raw reasoning difficulty. This
session is deliberately independent of Sessions 1-3 (critique m6) and can
run/ship on its own schedule if Feature 1 is delayed.

### Estimated routed cost
Low

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1.   | Finalize new copy for both descriptions (verify against actual dedicated-mode behavior) | `direct` |
| 2.   | Update constants + pinning tests | `direct:edits` |
| 3.   | Repo-wide grep sweep for stale quotes; fix each hit | `direct:edits` |
| 4.   | Code-review the sweep for completeness | `code-review` |
| 5.   | Full pass; verify; close | `direct:shell`, `session-verification` |

### Actuals (filled after the session)
- Orchestrator used: Claude Code claude-fable-5 @ effort=medium (as recommended)
- Total routed cost: $0.12 (code-review sonnet $0.07 + gemini-pro auto-verify $0.01; session-verification gpt-5-4 $0.04; next-orch analysis gemini-pro <$0.01)
- Deviations from recommendation: none on routing. Code-review found 1 Major (the new pin-test comment claimed the READMEs quote the strings verbatim when they paraphrase — fixed in-session); session verification (gpt-5-4) VERIFIED in one round, bare verdict token with no summary prose (noted; not worth a wording-only re-verify round per L-071-1).
- Notes for next-session calibration: the sweep's deliberate residuals are recorded in s4-close-reason.md — S5's README pass must NOT "fix" the 077 UAT checklist's old-copy quotes (sealed attested record) and must re-ground its own UAT strings against the NEW copy (pin test: gettingStartedHtml.test.ts "pins the simplified verification-mode copy"). Incidental dist resync: the committed dist/extension.js was stale relative to S3's dispatchKill refactor (templates-only drift guard cannot see extension.js); resynced in the S4 commit — S5's release build regenerates it anyway.

**Next-session orchestrator recommendation (Session 5):**
Claude Code claude-fable-5 @ effort=high
Rationale (routed, gemini-pro, post-S4): the literal-HumanAction/Expectation
UAT bar and the required multi-provider path-aware critique demand more
precision and synthesis than routine docs/release mechanics — high effort to
land a verified outcome on the first attempt. (Supersedes the set-start
recommendation of medium, which rested on the Set 077 S6 / 078 S5 precedent;
the operator controls the final choice per Rule 7.)

---

## Session 5: Docs, UAT, and release

### Recommended orchestrator
Claude Code claude-fable-5 @ effort=medium

### Rationale
Documentation authoring plus the required multi-provider path-aware
critique — Claude's demonstrated strength across every prior set's final
session. UAT must be authored to the Set 078 bar established in Set 077
Session 6; do not regress to pre-rewrite quality. This session must also
carry forward the honesty note the architecture critique required (M3:
multi-seat/enterprise availability is unvalidated) — do not let the docs
overclaim what this set actually proved.

### Estimated routed cost
Moderate (path-aware critique + UAT-authoring review passes)

| Step | Action | Routing Decision |
|------|--------|------------------|
| 1.   | Update tier-model.md, both READMEs, getting-started doc (incl. honesty note) | `documentation` |
| 2.   | Author UAT checklist (literal HumanAction/Expectation, live-dogfooded steps) | `direct` |
| 3.   | Walk/attest UAT | `direct` |
| 4.   | Required end-of-set path-aware critique | `analysis` |
| 5.   | Confirm release scope (extension-only unless an ai_router file actually changed) | `direct` |
| 6.   | Version bump(s), CHANGELOG(s), commit, push, green Test, tag push(es) | `direct:shell`, `direct` |

### Actuals (filled after the session)
- Orchestrator used: (pending)
- Total routed cost: (pending)
- Deviations from recommendation: (pending)
- Notes for next-session calibration: (pending)

**Next-session orchestrator recommendation (Session 6):**
N/A (final session of set)
