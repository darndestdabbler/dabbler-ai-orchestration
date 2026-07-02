# Set 077 spec adversarial critique (2/architecture)

> Owed second critique leg (non-Anthropic), routed 2026-07-02 in S1. Raw, unedited.
> model: gpt-5-4 (gpt-5.4)
> cost_usd: 0.3399  total_cost_usd: 0.3399
> truncated_flag: False

---

## Material findings

### M1. The three-way setup choice has no defined durable schema

- **Issue:** The spec upgrades the setup UX from a 2-way tier choice to a 3-way choice, but the only durable contract defined in the set is a one-word tier marker.
- **Location / evidence:**  
  - Feature 1 standard: “The marker is one word (`full` | `lightweight`).”  
  - Session 2 creates a “tier-marker helper.”  
  - Feature 2 says the 3-way choice is “stored in the durable tier marker channel (tier + verification-mode seed).”  
  - Session 3 threads `verificationMode` through `structureOnlyContext`, but no durable file/schema/helper is assigned to persist it.
- **Requirement violated:** Feature 2 requires the three-way choice to be durable and to seed spec generation correctly.
- **Impact:** The two Lightweight branches can collapse back into one after reload/reopen or across implementation seams between S2 and S3. That recreates the same class of bug the set is trying to eliminate: the UI remembers “Lightweight” but loses which Lightweight workflow was chosen, so generated specs can silently fall back to `out-of-band-or-none`.
- **Fix:** Define the durable setup-state contract before S2 starts. Either add a second marker (for `verificationMode`) or replace the one-word marker with a small structured setup-state file. Make S2 own the helper for both fields so S3 consumes a stable contract instead of adding a second ad hoc path.

### M2. The tier marker is positioned as truth, but nothing keeps it aligned with actual runtime truth

- **Issue:** The plan makes the workspace marker the first read source for downstream UX, but the runtime behavior is still driven elsewhere.
- **Location / evidence:**  
  - Feature 1: “Every downstream consumer of ‘the tier’ reads the marker first, then falls back to inference … then to the volatile radio.”  
  - Feature 1 only promises a “tier mismatch tree advisory.”  
  - Session 2 touches `switchTier.ts` only for the guardrail-path bug, not marker synchronization.  
  - Feature 3 explicitly moves the close gate to resolved runtime mode, not the marker.
- **Requirement violated:** Feature 1’s “tier truth chain” and the set purpose to stop the product from “still saying Full/Lightweight” when behavior disagrees.
- **Impact:** After a sanctioned tier change, a manual spec edit, or an env-driven no-router override, prompts/messages can continue trusting a stale marker while the router and gates follow spec/env. That is the same split-brain failure class, just moved from volatile state to durable stale state.
- **Fix:** Either:
  1. make the marker a write-through cache that is updated by every legitimate tier-changing path (`scaffold`, `switchTier`, spec-writing commands), and surface env overrides above it in the UI; or  
  2. demote the marker to “initial setup seed” and stop treating it as authoritative once a spec/runtime mode exists.

### M3. Feature 4 claims an `opt-out` state that the state model cannot represent

- **Issue:** The banner logic needs to distinguish “verification owed” from “we intentionally chose none,” but the spec adds no persisted way to record that distinction.
- **Location / evidence:**  
  - Feature 2 offers choice 3: “Lightweight + out-of-band / none.”  
  - Feature 4 standards require tests for `owed / in-flight / verified / opt-out`.  
  - Feature 4 also says “no new persisted state.”  
  - Feature 4’s trigger is “`verificationVerdict: null` and no recorded external verification.”
- **Requirement violated:** Feature 4’s explicit `opt-out` coverage and the setup contract that “none” is a legitimate branch.
- **Impact:** The banner will either nag forever on legitimate “none” workflows or suppress real owed verification by guessing. In a mission-critical shop, that converts the banner from signal into background noise.
- **Fix:** Add an explicit durable waiver/opt-out record for Mode A, or narrow the feature so it does not claim `opt-out` support. As written, the promised state machine is not derivable from existing readers.

### M4. The append-only verification artifact needs round semantics, but the plan only specifies presence semantics

- **Issue:** The artifact is defined as multi-round, but the parser/gate contract is only defined at the “does some verdict line exist?” level.
- **Location / evidence:**  
  - Feature 3 canonical doc: `external-verification.md` is append-only, “one dated section per round.”  
  - Feature 3 gate: “empty file or no recognizable verdict line ⇒ same soft prompt/warn as absence.”  
  - Feature 4 wants the next session to say “review and respond to `external-verification.md` round N.”
- **Requirement violated:** Feature 3’s round-based artifact design and Feature 4’s exact-next-action banner.
- **Impact:** As soon as there are multiple rounds, a simple verdict-exists parser can pass on stale history and cannot derive the actual next state for Mode A: verified vs awaiting-remediation vs awaiting-next-review. That leaves the target team manually interpreting a file the framework claims to operationalize.
- **Fix:** Define parser semantics now: latest dated round wins; the parser returns round number, verdict, and whether remediation is outstanding. Use that single parsed result for both the soft gate and the pending-verification banner.

### M5. Provider-difference Mode B is still brittle for existing or partially-flagged Copilot sets

- **Issue:** The new same-engine/different-provider allowance only works when historic work sessions already carry provider data.
- **Location / evidence:**  
  - Session 1 explicitly calls out the `provider` persistence check with an “omit-null caveat.”  
  - Feature 5 standard: “a session with no recorded provider cannot satisfy the provider-difference arm.”  
  - No session adds migration/backfill for existing null-provider work sessions.
- **Requirement violated:** Feature 5’s promise that “a Copilot-locked team can run Mode B end-to-end and pass the gate on provider difference.”
- **Impact:** Any in-progress set whose earlier work sessions were started without `--provider` can remain impossible to verify under same-engine Copilot, even after upgrade. The new start-time guardrail cannot repair historical nulls.
- **Fix:** Add a legacy-path rule. Examples: require provider data on all new sessions but fall back to engine-different-only for historical null baselines, or force a verification-baseline reset with a loud migration message. Without that, the advertised Copilot fix is only true for clean new sets.

### M6. Coordinated release across two packages has no compatibility guard

- **Issue:** The success path assumes extension and router are upgraded together, but the spec does not make unsupported mixed versions fail loudly.
- **Location / evidence:**  
  - The set deliberately ships changes across both packages.  
  - Features 3–5 split behavior between extension prompts/UI and `ai_router` gate/parser/state logic.  
  - Session 6 does coordinated tags and a local VSIX UAT, but no mixed-version compatibility check or matrix.
- **Requirement violated:** The set purpose to ship a bulletproof coordinated release for mission-critical use the week of 2026-07-06.
- **Impact:** A staggered upgrade can create false promises: extension 0.34.0 can tell a Copilot user that provider-difference is valid while router 0.26.2 still rejects it; router 0.27.0 can expect banner/parser behavior that the older extension never surfaces. This is a real field failure mode, not a theoretical one.
- **Fix:** Add a minimum-router-version check in the extension and/or a startup compatibility warning in `ai_router`, plus one explicit mixed-version UAT case so unsupported combinations fail loud instead of silently disagreeing.

### M7. “Fail before build” is underspecified relative to the new durable writes

- **Issue:** The Python prerequisite check is added after the plan has already introduced new persistent setup writes on the same path, but the ordering contract is not stated.
- **Location / evidence:**  
  - Session 2: write the durable tier marker “at scaffold time.”  
  - Session 3: add Python pre-flight in `buildProjectStructureNoPrompt`.  
  - Feature 2 requires missing Python to fail early, but does not say “before any durable write” or require rollback of partial writes.
- **Requirement violated:** Feature 2’s fail-early setup requirement and the set’s “bulletproof” setup goal.
- **Impact:** A machine without Python can still end up with persisted tier/verification-mode breadcrumbs and generated docs but no working install. Subsequent prompts, auto-opened docs, and advisory logic then operate on a half-configured workspace.
- **Fix:** Make Python resolution the first side-effect-free step in the scaffold path and add a regression test that interpreter failure leaves no marker/doc/setup artifacts behind.

## Nits

- `marker -> router-config inference -> volatile UI` would be safer as `marker -> runtime/spec truth -> volatile UI -> unknown`, not `absence of router-config => lightweight`. An empty folder is not the same thing as a lightweight workspace.
- The TS “mirror” of Python `read_verification_mode(...)` still leaves future drift risk. Add a shared fixture corpus so both implementations are exercised against the same activity-log samples.
- Pointer prompts assume the second Copilot chat can read a newly ensured repo doc immediately. Opening the canonical doc alongside the copied prompt would reduce “I pasted it but the second chat ignored the file” failures.
- `most recently completed set in the same repo` is a noisy heuristic for parallel-set repos. If retained, document the scope and consider limiting it to the immediately previous set unless explicitly overridden.
- A workspace-level tier marker can become misleading in intentionally mixed-tier repos. If mixed tiers are supported, document that the marker is only a setup default, not a repository policy.
- S5 is still the densest implementation session after the S4 de-scope. If schedule slips, land the gate/guardrail first and let Explorer wording/auto-route polish follow.

## Steelman + judgment

**Opposite position: do not preserve the soft out-of-band gate; make Mode A verification a hard contract unless `none` is explicitly recorded.**

The strongest case for the opposite architecture is straightforward:

- This set already adds the missing ingredients that made soft-gating defensible before: a canonical instruction doc, templated artifact creation, and prompts that tell the reviewing engine exactly what to write.
- The target team is explicitly mission-critical and explicitly policy-locked to Copilot. A soft warning is the easiest thing in the world to click past when people are under delivery pressure.
- Hard-blocking on “latest external-verification round contains a valid verdict” would remove the need to infer `opt-out` from absence, make the next-session banner authoritative, and stop unverified work from silently entering the ledger.

**Judgment:** I would not fully flip the set to a hard block right now. The target workflow still depends on a second Copilot chat, model-picker discipline, and path-aware file writes; a hard stop would create a new dead-end when those integrations are flaky. But the current fail-soft posture is only defensible if the spec adds the two state-model pieces it currently lacks: an explicit `none/waived` record and latest-round parsing. Without those, “fail-soft” collapses into “forever ambiguous.”

## Verdict

**SOUND-WITH-CHANGES**

The architecture is salvageable, but not yet tight enough for the stated bar. The top changes to make before implementation are:

1. **Define the durable setup-state model up front**: `tier`, `verificationMode`, sync rules, and “no writes before Python preflight.”
2. **Give Mode A a real state model**: explicit opt-out/waiver plus latest-round parser semantics, so the soft gate and banner can mean something consistent.
3. **Add compatibility handling**: legacy null-provider sets and extension/router mixed-version skew both still leave the Copilot-locked team exposed after release.