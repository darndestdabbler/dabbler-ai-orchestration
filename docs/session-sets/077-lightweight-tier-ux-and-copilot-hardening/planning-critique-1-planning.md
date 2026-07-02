# Set 077 draft-spec adversarial critique (1/planning)

> Routed pre-authoring planning critique, 2026-07-02. Raw, unedited.
> model: opus (claude-opus-4-8, tier 3)
> cost_usd: 0.5234  total_cost_usd: 0.5234
> complexity: 70  escalated: False
> truncated_flag: False

---

## Devil's Advocate Review — Set 077

### Material Findings

**M1. The load-bearing Copilot fix (A6) assumes a `provider` field that the plan never confirms is persisted per session, and nothing validates the self-declared provider against the model actually used.**
- **Requirement violated:** A6 / Feature 5 — "accepts a verification session whose `orchestrator` differs from every work session by engine **or by provider**"; the locked decision "Cross-provider means provider, not IDE."
- **Impact:** If the session record stores only engine (the audit cites an *engine-set* comparison at `dedicated_verification.py:927-942`), the gate has no `provider` to compare and A6 is a data-model change, not a gate tweak — the single most important deliverable for the Copilot team. Even if `provider` is recorded, the whole property rests on the developer manually passing `--provider openai` vs `--provider anthropic` to match a model they picked in Copilot's UI. Nothing correlates the declared provider with the actual model, so "provider differs" is self-attested. For a "bulletproof, mission-critical" bar, the gate can be satisfied by a mislabeled or forgotten flag.
- **Evidence:** Audit A6 citation is to the *engine-set* comparison; the doc'd pattern (`--engine copilot --provider openai`) is manual; no session verifies `provider` is captured or cross-checked.
- **Fix:** Make S1 explicitly confirm `provider` is persisted on the orchestrator record (promote to a hard triage gate). If it is not, A6 grows to include recording it (add to S5 scope). Add a guardrail: if a `--type verification` session declares the same `(engine, provider)` as the work sessions, refuse at *start*, not only at close, and surface the sanctioned model-picker pattern inline.

**M2. Pointer prompts will dangle for the three existing consumer repos.**
- **Requirement violated:** "Prompts are pointers … Consumer repos receive the canonical instruction file via the existing consumer-bootstrap template channel"; non-goal "No consumer-repo file edits."
- **Impact:** After the 0.34.0 upgrade, the extension emits Evaluate prompts that instruct the reviewing engine to read `docs/dabbler/cross-provider-verification.md`. Existing consumers who upgrade the extension but do not re-run consumer-bootstrap will not have that file, so the pasted prompt points the engine at a nonexistent doc — the *exact* "engine forgets to write the artifact" failure A2 is meant to kill, reintroduced by indirection. The new adopter (fresh scaffold) is fine; the installed base is not.
- **Evidence:** Bootstrap-template delivery + "No consumer-repo file edits" together mean the doc only lands on (re)bootstrap; no session makes the extension ensure-write/refresh the doc before emitting a pointer.
- **Fix:** Have the extension write/refresh the canonical doc into the workspace on demand (idempotent, before emitting the pointer), or keep a minimal inline fallback in the prompt when the doc is absent. Add this to S4.

**M3. `switchTier` guardrail bug (A11) has no session home.**
- **Requirement violated:** "Audit findings this set must fix" — A11 lists `src/commands/switchTier.ts:72,88-89` ("guardrail probes `set.root` while writing `set.specPath`").
- **Impact:** A guardrail that validates one path while mutating another can pass its check and then write the wrong/absent target — a latent tier-corruption path on the exact surface (tier switching) this set is hardening. It silently ships unfixed.
- **Evidence:** No session's **Touches** list includes `src/commands/switchTier.ts` (S2–S5 enumerated; none reference it). S1 only "fix inline … <50-line mechanical items," which is discretionary, not an assignment.
- **Fix:** Add `switchTier.ts` to S2's Touches (same tier-truth family) with a Layer-2 test asserting the guardrail probes the path it writes.

**M4. S4 bundles Features 3 + 4 (~six distinct deliverables) — context-budget and deadline hazard.**
- **Requirement violated:** Session-Set Config `totalSessions: 6` against the ~2026-07-06 deadline; the implicit one-session-one-budget contract.
- **Impact:** S4 must author a new canonical doc, rewrite three prompts, template the artifact, land three gate fixes (A3/A4/A8), write a `ai_router` verdict parser + tests, and add a cross-set `start_session` banner with per-state tests on both tiers. That is the heaviest session in the set and the most likely to truncate/overrun; a partial S4 stalls S5 (which depends on the Feature-3 pointer standard) and the release.
- **Evidence:** S4 Steps 1–4 span five subsystems and two languages; its Touches list is the longest non-release list.
- **Fix:** Split the `start_session` banner (Feature 4) into its own micro-session or fold it into S5, leaving S4 focused on the self-completing artifact + gates. Given only ~4 calendar days from a 2026-07-02 spec, protect slack.

**M5. A8 (S4) and A7 (S5) answer the same question — "what is the set's true `verificationMode`?" — from potentially different sources, in the wrong order.**
- **Requirement violated:** A8 "when the set's recorded `verificationMode` is `dedicated-sessions`, the external-verification gate stands down"; A7 "prefer the durable activity-log record over the spec seed."
- **Impact:** S4 implements the A8 stand-down before S5 establishes record-over-seed precedence. If A8 keys off the spec seed while S5 later makes the Explorer key off the activity-log record, the *gate* and the *UI* can disagree after a blessed A→B transition whose seed-alignment failed (the very drift A7 exists to fix): the Explorer says "dedicated-sessions / remediation owed" while the close gate still fires the out-of-band path. Hidden cross-session dependency.
- **Evidence:** A8 lands in S4; the record-precedence helper lands in S5; A8's scope text does not state it uses record-over-seed.
- **Fix:** Build the record>seed precedence helper first (move it into S4 or S1's shared helpers) and have both the A8 gate and the A7 Explorer derivation consume it.

**M6. The "Full-first" amplifier is named in the reported symptom but remediated by no session.**
- **Requirement violated:** Purpose — "fix the Getting Started tier leak (the operator-reported 'chose Lightweight, extension still says Full')."
- **Impact:** Even with A1 fully fixed, the auto-opened static getting-started doc still leads with a prominent Full-first section regardless of the pick (`CustomSessionSetsView.ts:481-486`). The operator who chose Lightweight is still greeted with Full-first content — the perceptual half of "still says Full" survives.
- **Evidence:** The amplifier is described in Project Overview but is excluded from the A1–A11 table, and no session Touches address the `:481-486` Full-first behavior (S3 touches `CustomSessionSetsView.ts` only for payload build).
- **Fix:** Either make the auto-opened doc/section tier-aware in S3, or explicitly state in Non-goals that the static doc's Full-first framing is out of scope and why — don't leave it dangling against the Purpose.

---

### Architecture decision — steelman the opposite, then judge

**Opposite position (pre-seed one typed verification session at set creation):** Pre-seeding a single placeholder verification session would make the owed state *structural* rather than *derived*: the Explorer would have a real row/state to render (attacking A4 at the root), `start_session` would naturally encounter a pending session (A5 solved without a bespoke banner), and Defect 3's "recording the mode appends nothing / nothing nudges the next session" would vanish because recording the mode *is* the seed. The first verification round in Mode B is deterministic — you always need at least one — so seeding exactly that one carries no unknowable-count problem.

**Judgment — pre-seeding is NOT right; the plan's runtime-append + surface/auto-route is correct.** The steelman only reaches the *first* round; remediation rounds (0–2+) remain unknowable, so you either pre-seed a partial ledger (inconsistent with the append model and still needing runtime appends) or you special-case the first session (extra branching for marginal gain). More decisively, a pre-seeded session is a *phantom authored session* that violates the authored-count contract and the sessions-ledger invariant (`session-state-schema.md` § per-session `type`), and the derived `awaiting-verification` state already carries exactly the signal the UI/router need. The real defect was never "no phantom session exists" — it was "nothing reads the derived state and routes into it," which S4 (banner) and S5 (auto-route) fix directly. Keep the locked decision.

---

### Nits (brief)

- **`asTier` fail-loud regression:** an existing spec with a genuinely unknown tier value that today silently becomes `full` will now error; acceptable because the throw is on the scaffold path (early), but confirm it never fires on the *close* path.
- **Known-failing baseline vs. per-session close:** S1/S2 close with the `dist-in-sync` failure still red until S3 lands the template — confirm the close gate tolerates a documented known-baseline failure, or S1/S2 can't close clean.
- **Mode A guidance for Copilot:** Feature 5 documents the single-engine pattern for Mode B; the Mode-A canonical doc (Feature 3) should also tell the Copilot-locked operator to open a second chat and switch the model picker, or Mode A is awkward for exactly the target team.
- **No rollback note:** for mission-critical use the week of release, name the pin-back (extension 0.33.1 / router 0.26.2) as the hotfix escape hatch.
- **`VSCE_PAT`** externally gates S6 (already acknowledged); the sideload fallback is fine but means the "Marketplace" deliverable may not actually ship by the deadline.

---

### VERDICT: SOUND-WITH-CHANGES

**Top 3 changes, in priority order:**
1. **De-risk A6 (the Copilot fix):** make S1 hard-confirm `provider` is persisted per session (expand S5 if not) and add a start-time same-`(engine,provider)` guardrail — the plan currently treats an unverified data dependency and an unenforced self-declaration as a done deal. (M1)
2. **Guarantee the canonical verification doc exists before any pointer prompt references it** (extension ensure-writes/refreshes it or the prompt carries a fallback) so the three existing consumer repos don't get dangling pointers. (M2)
3. **Assign `switchTier` (A11) to a session, split S4's Feature-4 banner out, and build the record>seed precedence helper once for both A8 and A7** — closing the unassigned-fix gap, the over-scoped session, and the gate/UI drift together. (M3, M4, M5)