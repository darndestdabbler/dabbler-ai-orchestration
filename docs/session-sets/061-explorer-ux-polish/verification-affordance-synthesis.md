# Verification affordance — three-engine synthesis (design lock for Set 062)

> **Synthesizer:** Claude Fable 5 (direct, no router), 2026-06-11.
> **Inputs:**
> 1. [`verification-affordance-fable-recommendation.md`](verification-affordance-fable-recommendation.md) (Claude Fable 5, direct)
> 2. [`verification-affordance-gemini-pro-response.md`](verification-affordance-gemini-pro-response.md) (gemini-2.5-pro via router)
> 3. [`verification-affordance-gpt-5-4-recommendation.md`](verification-affordance-gpt-5-4-recommendation.md) (GPT-5.4 via VS Code Chat)
>
> **Brief:** [`verification-affordance-design-brief.md`](verification-affordance-design-brief.md).
> **Output:** the locked design implemented by Set 062
> (`docs/session-sets/062-lightweight-verification-affordance/spec.md`).

---

## 1. Empirical corrections (fact-checked against the codebase before adjudicating)

Three facts were verified in-repo after the responses came back; each one
materially changes part of at least one recommendation.

1. **The Set 057 seven-state ladder is Python-only.**
   `ai_router/dedicated_verification.py:86-102` defines
   `work-in-progress / awaiting-verification / awaiting-remediation /
   awaiting-human / closed-verified / closed-dispositioned /
   closed-no-verification`; the Explorer renders only the four row states in
   `src/types.ts:1`. GPT-5.4's state mapping (gate markers on
   `awaiting-*` states) cannot be adopted literally without porting the
   ladder to TS — which we will **not** do. The TS side uses simple
   ledger predicates that *approximate* the ladder.

2. **Mode A has a real out-of-band artifact: `external-verification.md`.**
   `src/commands/externalVerification.ts:11` (command
   `dabbler.openExternalVerificationDoc`) creates/opens a free-form
   verdict note in the set directory, and the Set 057 spec names it as the
   Mode-A record. All three responses treated Mode A as "no machine
   record"; in fact **file presence is a derivable, no-new-state signal**
   that an out-of-band verification record exists. GPT-5.4 used the
   command as an *action*; the synthesis promotes file presence to a
   *state input* that suppresses the marker.

3. **The "immutable after first record" rule is a one-way *silent* capture
   gate — not a hard-fail.** `dedicated_verification.py:262-264` returns
   `None` if a `verification_mode` activity-log record already exists;
   later spec.md edits are **ignored by Python** but **honored by the
   Explorer** (which reads spec.md only). Consequence: a UI-only spec
   rewrite on a started set would not "trip a guard" (Fable's assumption)
   or merely need a "relaxation" (Gemini's framing) — it would create
   **silent spec-vs-record drift**, with the Explorer rendering `N/M+`
   while the durable record still says `out-of-band-or-none`. Any A→B
   flip after first record therefore needs a **new blessed writer** that
   updates the durable record, not just a spec edit.

## 2. Where all three engines agree (adopted as-is)

- **Quiet marker in the existing marker strip** — no badge, no warning
  semantics, no color, tooltip does the explaining.
- **All states derived from existing artifacts** (spec config + ledger +
  set-directory files); no new persisted session-state fields.
- **Never label Mode A "unverified."** The copy states what the system
  knows ("manual / out-of-band — the Explorer cannot attest"), not a
  verdict.
- **The affordance never creates sessions.** Typed verification sessions
  are opened only by the agent that runs them, via the blessed
  `start_session --type verification` path. The UI records intent and
  hands off a prompt.
- **Quiet is the success state** (2-1: Fable + GPT-5.4 over Gemini's `✓`
  icon): a cleanly verified set shows **no** verification marker; the
  verdict surfaces in the tooltip (the persisted `verificationVerdict`
  field makes this free).
- **Copy-prompt is the agent-handoff medium** (2-1 + factual grounding:
  Gemini's "pre-filled Dabbler AI chat panel" does not exist as a
  surface; the clipboard-prompt pattern is established extension-wide).

## 3. Adjudicated disagreements

| # | Question | Fable | Gemini | GPT-5.4 | **Decision & rationale** |
|---|---|---|---|---|---|
| 1 | Is the marker itself a click-toggle? | No — click opens row menu | Yes — click → confirm → rewrite | Click opens action sheet; mutation secondary | **Marker click opens the row QuickPick menu; never mutates directly.** Accidental-click hazard on a spec rewrite; actions belong in the menu (the `Switch Tier…` precedent). Gemini's confirmation step is kept — the menu action confirms before rewriting. |
| 2 | Marker vocabulary | `◇` glyph | Codicons `(?)`, 🧪, ✓ | Text `v?` / `v+` | **GPT-5.4's `v?` / `v+` text markers.** They match the `lw` text-marker precedent, are theme-safe in the custom webview (codicons are not free there), are self-describing, and give one consistent click target across both modes. |
| 3 | When does the Mode-A marker show? | `complete` only | in-progress + work-complete | not-started + work-complete | **`complete` only.** A marker means "actionable now"; verification is due at completion. Pre-completion display nags (Fable/GPT both scoped tighter than Gemini); not-started posture is configuration, not attention — the toggle is discoverable in the context menu there. |
| 4 | Mode-A "verified out-of-band" gap | Unknowable; factual copy | Unknowable; show nothing on complete Mode A | Unknowable; offer the note command as action | **Partially knowable — empirical correction #2.** `v?` is **suppressed when `external-verification.md` exists** in the set directory: the operator used the sanctioned out-of-band record, so quiet-success applies. This resolves Gemini's "show nothing" and Fable's "wears `◇` forever" into one honest rule. |
| 5 | A→B toggle eligibility | Any time before a typed session exists, via sanctioned Python amendment | in-progress / work-complete, relax the rule | **not-started only**; the realistic case "is a new workflow exception, and the UI should not fake one" | **Phased, per empirical correction #3.** Phase 1 (extension-only): toggle on **not-started** sets — no durable record exists yet, so a spec-seed rewrite is authoritative and safe (mirrors `Switch Tier…`). Phase 2: toggle on **complete** sets through a **new blessed Python writer** that appends a superseding `verification_mode_change` activity-log record (gated: Lightweight, current mode A, no typed sessions, no session in flight), then aligns the spec seed. GPT-5.4's objection is honored — the UI doesn't fake the exception; we build it. Gemini + Fable's additive-safety argument is why building it is legitimate: A→B retroactively changes nothing about executed work sessions. **In-progress sets are excluded entirely** (verification isn't due yet; avoids contention with an in-flight session). **B→A is never offered once any record exists.** |
| 6 | Shipping shape | 3 increments; cross-layer piece design-locked separately | One cohesive feature, ship together | Two pieces; mutation optional/second | **Four sessions in one set** (render → handoff + not-started toggle → blessed writer + complete-set toggle → UAT/release). This consult *is* the design lock; the cross-layer Phase-2 piece is its own session with its own audit step and cross-provider verification, satisfying Fable's separation without deferring the operator's realistic case to a future set. |

## 4. What each engine contributed to the locked design

- **Fable:** quiet-success (no verified badge) + verdict-in-tooltip; the
  UI-never-creates-sessions rule and its stranded-session rationale; the
  demand to verify the capture guard empirically (which surfaced
  correction #3 and reshaped the toggle); tier-vs-mode immutability
  distinction.
- **Gemini:** the explicit confirmation step before the one-way spec
  rewrite; the cleanest statement of the additive-safety argument for
  A→B; "optional upgrade, not deficiency" framing for the tooltip copy.
- **GPT-5.4:** the `v?` / `v+` marker vocabulary and three-visual-outcome
  collapse; reusing `external-verification.md` (which led to correction
  #2's suppression rule); the discipline that the UI must not fake a
  workflow exception — which became the phase split; state-specific
  (not generic) kickoff prompts.

## 5. Locked design summary

1. **Marker** (`v?` / `v+`) in the marker strip, de-emphasized, help
   cursor; click opens the row context menu. No marker on Full rows,
   terminal-cancelled rows, cleanly verified rows, or Mode-A rows with an
   `external-verification.md` present.
2. **`v?`** — Lightweight ∧ `out-of-band-or-none` ∧ set complete ∧ no
   typed verification session ∧ no `external-verification.md`. Tooltip:
   out-of-band posture, system cannot attest, click for options.
3. **`v+`** — Lightweight ∧ `dedicated-sessions` ∧ all work sessions
   complete ∧ row not terminal. Tooltip: verification owed / in flight,
   click for next step. (The existing `N/M+` fraction keeps covering the
   pre-completion arithmetic; the marker adds the action surface at the
   actionable moment.)
4. **Actions** (row QuickPick, ActionRegistry-gated):
   `Copy verification kickoff prompt` (Mode-B, no completed verification
   yet — pointer-style, typed-session + different-engine flow);
   `Set up dedicated verification…` (Mode A: not-started via spec-seed
   rewrite; complete via blessed writer; confirmation first; copies the
   kickoff prompt on success for complete sets);
   `Open external verification note` (existing command, reused on Mode-A
   complete rows).
5. **New blessed writer** (Python): sanctioned A→B
   `verification_mode_change` activity-log record, scoped gates, B→A
   refused. Extension invokes it via the established Python-invocation
   pattern; on writer failure the spec seed is **not** rewritten (no
   drift by construction).
6. **Releases:** extension 0.31.0 + ai_router 0.17.0 (the writer is
   packaged surface), both behind operator UAT on a local build and
   operator-authorized tag pushes.
