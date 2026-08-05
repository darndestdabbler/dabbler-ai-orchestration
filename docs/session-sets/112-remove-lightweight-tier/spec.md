# Remove the Lightweight Tier Spec

> **Purpose:** Delete the Lightweight tier — the product-facing
> `tier: lightweight` switch and everything that exists only to serve it —
> leaving one tier whose cross-provider verification story is true without
> asterisks. The reservation record, evidence basis, and kill/keep lists are
> canonical in
> [`docs/proposals/2026-08-05-set-112-reservation-remove-lightweight-tier.md`](../../proposals/2026-08-05-set-112-reservation-remove-lightweight-tier.md)
> — **read it before Session 1; this spec executes it.** The tier model
> being removed is documented in [`docs/concepts/tier-model.md`](../../concepts/tier-model.md).
> **Created:** 2026-08-05
> **Prerequisites:** Sets 110 AND 111 complete — both are real gates.
> **Session Set:** `docs/session-sets/112-remove-lightweight-tier/`
> **Workflow:** Orchestrator → AI Router → Cross-provider verification
>
> **Evidence basis (measured 2026-08-05, the gate that cleared this set):**
> the operator probed their **enterprise** Copilot seat (same tenant as
> staff): `11/18 models confirmed, providers=['anthropic', 'google',
> 'openai']`. Three families ⇒ the Copilot-seat profile carries the full
> exclusion guarantee for staff; every known user is covered by the Full
> tier (keyed or seat-profile). The probe lockfile is preserved at
> `D:\copilot-catalog.lock` — **Session 1 copies it into this set's folder
> as `probe-evidence-copilot-catalog.lock` before anything is deleted.**

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: true         # The Getting Started form loses its tier fork — an onboarding surface judged by eyes; and the fail-loud migration error message is judged by whether a stranded reader knows what to do next.
requiresE2E: true         # The Getting Started webview surface changes; Set 108 proved static gates stay green while a view is broken.
uatStyle: ad-hoc
uatScope: per-set
prerequisites:
  - slug: 110-work-explorer-native-treeview
    condition: complete
  - slug: 111-verification-loop-and-ceremony-simplification
    condition: complete
```

> **Why 111 is a prerequisite:** this set runs under 111's leaner loop
> (enforced bounds, acceptance criteria, guided-look UAT), and it is a
> breaking release — the last thing it should inherit is the old
> round-grinding ceremony. **Why 110:** the extension surfaces this set
> touches (Getting Started, the Explorer container) must be in their final
> native-tree shape first.

---

## Decisions already made — do not reopen

1. **The tier goes.** The evidence gate is passed (see header). Do not
   re-run the seat probe as a blocker; do not resurrect a "maybe keep
   Mode B" debate. If a *new* fact emerges (e.g. a staff seat that fails
   auth-preflight in the field), stop to the operator with an
   education-mode brief — that is the only reopening path.
2. **`--no-router` survives as a test affordance.** The CLI flag and
   `DABBLER_NO_ROUTER` env var stay for CI/hermetic use. What is deleted is
   the *product tier*: `tier:` spec-field resolution (`runtime_mode.py`
   precedence step 3) and the two Lightweight verification modes.
3. **Fail loud, never convert silently.** The spec loader errors on
   `tier: lightweight` with a one-line migration message (flip to `full`,
   add router config — or the Getting Started Copilot-seat path). Archived
   Lightweight session sets remain readable as history.
4. **This is a major-version breaking release** of `dabbler-ai-router`
   (a routable Lightweight spec no longer loads). The release and the
   consumer-repo migration notice are **operator-held** decisions
   (decision-rights rubric: external, hard to reverse).

## Kill list (the complete inventory — verify against a fresh grep, not from memory)

- Mode A verification: `out-of-band-or-none`, `external-verification.md`
  flow, `pending_verification.py`, `external_verification.py`.
- Mode B verification: `dedicated-sessions` typed-session flow,
  `dedicated_verification.py`, its bounded re-verification loop and
  content-aware close gate.
- `change_verification_mode.py` (A→B writer) and
  `migrate_lightweight_to_canonical_v4.py`.
- `verificationMode` in `docs/spec-md-schema.md` and everywhere it is read.
- Lightweight branches in `close_session.py`, `gate_checks.py`,
  `close_backstop.py`, `narration.py` (grep for the full list).
- `runtime_mode.py` precedence step 3 (`tier:` from spec.md).
- Fixture trees: `test-fixtures/cold-start/lightweight/`,
  `tools/dabbler-ai-orchestration/test-fixtures/uat-matrix/hello-world-lightweight/`.
- The Getting Started form's tier fork (extension).
- Dual-tier narratives across teaching docs; `docs/concepts/tier-model.md`
  shrinks to a historical note; the tier-drift-guard banned-phrase scan in
  `ai_router/scripts/drift_guard.py` retires with the tier it defended.

## Non-goals

- **No verification-loop changes.** That was 111.
- **No seat-profile changes.** Sets 078/079/084/086/104 shipped it; it is
  the replacement, not part of the removal.
- **No consumer-repo edits from this repo.** The migration notice tells
  consumers what to do; doing it for them is their own repos' work.
- **No opportunistic refactors** of files touched only to delete branches.
  A removal set earns trust by removing.

---

## Sessions

### Session 1 of 3: Router-side removal

**Steps:**

1. Register. Copy `D:\copilot-catalog.lock` into this set's folder as
   `probe-evidence-copilot-catalog.lock`. Read the reservation doc.
2. **Grep-inventory first**: enumerate every live (non-archive) reference
   to the tier and both modes; record the list as `s1-kill-inventory.md`.
   The kill list above is the starting map, not the boundary — the
   inventory is the boundary.
3. **Delete the Mode A and Mode B machinery**, the A→B writer, the v4
   Lightweight migrator, `verificationMode` schema handling, and the
   Lightweight branches in close-out/gates/narration.
4. **`runtime_mode.py`**: remove precedence step 3; keep flag + env var;
   the resolver's log line now names only those two sources.
5. **Fail-loud loader**: `tier: lightweight` in a spec errors with the
   migration one-liner. Test asserts the exact message.
6. **Delete the Lightweight fixture trees**; update the pytest/CI matrix;
   record the before/after test-count and CI-minutes numbers.
7. Full pytest suite once at close, after freeze (49 min — background it,
   never pipe through `tail`).
8. Verify, close.

**Creates:** `s1-kill-inventory.md`, the loader failure test, before/after matrix numbers
**Touches:** `ai_router/` (deletions per inventory), `test-fixtures/cold-start/`, CI workflow
**Ends with:** the router has one tier; `tier: lightweight` fails loud with a helpful message; the test matrix is measurably smaller and green.
**Progress keys:** `probeEvidenceArchived`, `killInventory`, `modesDeleted`, `runtimeModeTrimmed`, `failLoudLoader`, `fixturesDeleted`

---

### Session 2 of 3: Extension and docs

**Steps:**

1. Register. Read S1's kill inventory for the extension/docs remainder.
2. **Getting Started form**: remove the tier fork; the form's first question
   becomes provider access (keys vs. Copilot seat), not tier. Layer 3 spec
   updated to assert the fork is gone.
3. **Docs collapse**: every teaching doc tells the one-tier story;
   `tier-model.md` shrinks to a historical note pointing at this set;
   retire the tier drift guard from `drift_guard.py` and its CI hook;
   `uat-matrix/hello-world-lightweight` fixture goes.
4. **Consumer migration notice**: author
   `docs/cross-repo-lightweight-removal-notice.md` — what breaks, the
   one-line fix, the seat-profile alternative. **Sending it is the
   operator's** (decision-rights: outward-facing).
5. Full Layer 3 once at close, after freeze (~13 min; this session touches
   the Getting Started rendering surface, so it pays its own Layer 3).
6. Verify, close.

**Creates:** the migration notice, updated Layer 3 specs
**Touches:** extension `src/` (Getting Started), `docs/` broadly, `drift_guard.py`
**Ends with:** one story everywhere; the form asks no tier question; a ready-to-send consumer notice awaiting the operator.
**Progress keys:** `tierForkRemoved`, `docsCollapsed`, `driftGuardRetired`, `migrationNoticeReady`

---

### Session 3 of 3: The grep gate, the walk, the release

**Steps:**

1. Register.
2. **The executable acceptance gate** (capability-scaling: testimonial
   claims don't count): a script/test asserting **zero live references** to
   `tier: lightweight`, `verificationMode`, or either mode outside
   `docs/session-sets/` archives, this set's folder, and the historical
   note. Wire it into CI so the tier cannot resurrect silently.
3. **Full matrix once** against the final build: pytest + Layer 2 + Layer 3
   (the release-boundary run under the canonical test policy).
4. **Guided-look UAT walk** (111's format, staged by the walk stager):
   Look — the form shows no tier question; a `tier: lightweight` spec fails
   with the message; docs read as one story. Decide — any journal-tagged
   wording/placement calls. Ten minutes.
5. **Release staging**: major version bump of `dabbler-ai-router`,
   CHANGELOG with the breaking-change notice, extension version if its
   surface changed. **Publish, tag, and the consumer notice send are
   operator-gated — stop with an education-mode brief.**
6. Verify, close. `change-log.md`, Step 9 review, advisory path-aware
   critique.

**Creates:** the anti-resurrection grep gate (CI-wired), the walk, `change-log.md`
**Touches:** version/CHANGELOG files, CI workflow
**Ends with:** an executable proof the tier is gone, a walked onboarding surface, and a staged major release awaiting the operator's click.
**Progress keys:** `grepGateWired`, `fullMatrixGreen`, `guidedWalkDone`, `releaseStaged`

---

## End-of-set deliverables

- One tier. Modes A/B, the A→B writer, the Lightweight migrator,
  `verificationMode`, the spec-field tier switch, both Lightweight fixture
  trees, the Getting Started tier fork, and the tier drift guard: deleted.
- `--no-router` flag + env var retained as CI/test affordances.
- Fail-loud `tier: lightweight` loader error with a migration one-liner;
  archives readable.
- A CI-wired anti-resurrection grep gate; measured test-matrix shrinkage.
- `docs/cross-repo-lightweight-removal-notice.md` ready; send
  operator-gated.
- A staged major-version router release (+ extension if touched); publish
  operator-gated.
- `probe-evidence-copilot-catalog.lock` archived in this folder.

## Risks this set should expect

- **The inventory is bigger than the kill list.** ~616 files mention the
  tier; most are archives. The discipline is the S1 grep inventory plus the
  S3 gate — not memory, not this spec.
- **A consumer repo may hold a live Lightweight set.** The loader failure
  is deliberate and the notice is the remedy; do not soften it to a silent
  conversion under remediation pressure.
- **Deleting Mode B touches close-out paths shared with Full.** The
  close-out machinery is load-bearing (see `ai_router/docs/close-out.md`);
  every branch removal there needs its surviving-path test to stay green.
- **The drift guard retirement must not take unrelated guards with it** —
  `drift_guard.py` may host more than the tier scan; retire the tier
  patterns, keep the mechanism if anything else uses it.
- **Copilot-seat orchestration**: if run from the office seat, run
  `python -m ai_router.copilot_preflight` before S1; provider exclusion
  applies against the seat catalog (three families confirmed 2026-08-05).
