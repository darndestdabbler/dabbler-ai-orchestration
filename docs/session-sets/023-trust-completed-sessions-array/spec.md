# Trust completedSessions[] as authoritative in guard + repair

> **Purpose:** Close the two sharp edges Set 022 surfaced when migrating
> pre-Set-022 sets (Set 004, Set 006 on this repo, 2026-05-15). Both
> sides of the writer/reader pair still treat the events ledger as the
> only authoritative "session N is closed" signal, even though the new
> Set 022 invariant declared `completedSessions[]` to be the
> authoritative progress ledger.
>
> **Session Set:** `docs/session-sets/023-trust-completed-sessions-array/`
> **Created:** 2026-05-15
> **Workflow:** Full
> **Prerequisite:** Set 022 shipped (ai_router 0.2.3 + extension v0.13.12,
> released to PyPI + Marketplace 2026-05-15). The behavior changes here
> presume the writers and readers from Set 022 are present.

---

## Session Set Configuration

```yaml
totalSessions: 4
requiresUAT: false
requiresE2E: false
uatStyle: ad-hoc
uatScope: none
effort: low
```

> Rationale: two narrowly-scoped fixes (one Python, one TypeScript) plus
> a cross-provider design-alignment audit between them. The audit was
> added 2026-05-15 (during Session 1) at the operator's request to make
> sure GPT 5.4 and Gemini Pro both concur with the Set 022 migration
> decisions and the Set 023 fix design before the reader-side change
> ships — the same design-round pattern that informed Set 022's
> original spec. **Session 3 added 2026-05-15 (during Session 2)** at
> the operator's request after both providers, independently, raised a
> system-wide concern that other progress-readers in the pipeline may
> still consult the events ledger directly without considering
> `completedSessions[]` (Gemini severity: critical; GPT severity:
> major; see [audit-summary.md](session-reviews/session-002-audit/audit-summary.md)).
> Session 3 is a codebase-wide audit + any reader rewrites it
> surfaces; the original Session 3 (extension reader fix) becomes
> Session 4. No UI flow changes; no UAT. Sessions 1 and 4 each ship
> one release artifact; Sessions 2 and 3 may or may not ship artifacts
> depending on what Session 3's audit finds.

---

## Problem statement

Set 022 made `completedSessions[]` the authoritative progress ledger on
both tiers, maintained on every close. The reader path
(`fileSystem.ts:readSessionSets`) consults it as the primary count
signal (extension v0.13.12). But two related pieces of code still
pre-date the invariant and treat the events ledger as the *only*
authoritative "session N is closed" signal:

### Sharp edge 1 — Reader: `isMidSetComplete` ignores `completedSessions[]`

[`tools/dabbler-ai-orchestration/src/utils/fileSystem.ts:72`](../../../tools/dabbler-ai-orchestration/src/utils/fileSystem.ts#L72)
implements the v0.13.11 mid-set-complete guard:

```ts
export function isMidSetComplete(statePath: string): boolean {
  // ...
  if (sd.currentSession < sd.totalSessions) return true;

  const eventsPath = path.join(path.dirname(statePath), "session-events.jsonl");
  if (fs.existsSync(eventsPath) &&
      !hasCloseoutEventForSession(eventsPath, sd.currentSession)) {
    return true;  // ← downgrades to In Progress
  }
  return false;
}
```

The guard correctly downgrades a set whose snapshot claims "complete"
but whose events ledger lacks a `closeout_succeeded` for the final
session — that's the mixed-mode-drift case it was designed for. But
the guard never consults `completedSessions[]`. On a clean
post-Set-022 set, the array carries the same signal as a ledger
closeout event — the guard should treat either as authoritative.

The symptom Set 022's migration revealed: hand-migrating a legacy set
by adding `completedSessions: [1..N]` to its snapshot is not enough
to clear the guard. The operator still has to run `--repair --apply`
to synthesize a ledger event the guard agrees with — which then
triggers sharp edge 2 below.

### Sharp edge 2 — Writer: `--repair --apply` overwrites a hand-authored array

[`ai_router/close_session.py`](../../../ai_router/close_session.py)'s
`_run_repair` Case 1 (state-says-closed-but-no-closeout-event)
backfills `completedSessions[]` from
`compute_effective_completed_sessions` after appending the synthetic
closeout events. The helper's read order prefers the snapshot's
existing array, but the apply path overwrites the snapshot regardless
of whether the new value is a superset or a regression.

Concrete failure shape from Set 022's migration:

- **Set 004 (before repair):** events ledger has only a forced session-3
  closeout. Snapshot has `currentSession: 4`, `status: complete`. Operator
  hand-adds `completedSessions: [1, 2, 3, 4]`. Runs `--repair --apply`
  to clear the guard.
- **What `--repair --apply` does:** appends synthetic session-4
  closeout to the ledger (good), then overwrites
  `completedSessions: [1, 2, 3, 4]` with `[3, 4]` (events-ledger
  view) — regressing the operator's intent because the ledger never
  recorded sessions 1 and 2.

The repair path should preserve the snapshot's `completedSessions[]`
when it is a **strict superset** of what the events ledger can
reconstruct. The events-ledger reconstruction remains the source of
truth when the snapshot disagrees in the other direction (snapshot
claims fewer sessions closed than the ledger has events for — drift
case 2 territory).

---

## Decisions confirmed with the human (do not re-litigate)

These came from the Set 022 migration session on 2026-05-15. Both
fixes were called out as exactly the kind of edge case Set 022's work
was meant to eliminate — but landed too late to bundle into Set 022.

1. **`completedSessions[]` is authoritative even for the reader-side
   mid-set-complete guard.** `currentSession in completedSessions[]`
   is the canonical "session N is closed" signal. A
   `closeout_succeeded` event in the ledger remains an alternative
   authoritative signal — the guard accepts either. Both presence is
   the normal post-Set-022 shape; only-one-of is migration territory
   the operator can resolve with either signal alone.

2. **Repair's array backfill is monotone-up-only.** When the
   snapshot's `completedSessions[]` is a superset of (or equal to)
   what `compute_effective_completed_sessions` would compute from
   the events ledger alone, leave the snapshot alone. When the
   snapshot is a strict subset of (or non-comparable with) the
   ledger reconstruction, the repair appends to the array to bring
   it up to ledger reality — but never removes a session number the
   operator hand-authored.

3. **Reader change does not require a writer change in
   `_flip_state_to_closed`.** The Set 022 writer already maintains
   `completedSessions[]` correctly on every close. The reader's
   guard is the only piece that hasn't caught up.

4. **No new repair drift case.** This work tightens an existing
   drift case's apply behavior; it does not add a new shape to the
   walk. The four drift cases enumerated in
   `ai_router/docs/close-out.md` Section 5 remain.

---

## Architecture

### Reader change

```
isMidSetComplete(statePath):
    sd = readSnapshot(statePath)
    if sd.currentSession < sd.totalSessions:
        return true  # genuinely mid-set; unchanged

    # NEW: completedSessions[] is an alternative authoritative signal
    if Array.isArray(sd.completedSessions) and
       sd.completedSessions.includes(sd.currentSession):
        return false  # array agrees that the final session is closed

    # Existing events-ledger check
    eventsPath = <dirname>/session-events.jsonl
    if exists(eventsPath) and
       not hasCloseoutEventForSession(eventsPath, sd.currentSession):
        return true  # ledger disagrees → drift → downgrade

    return false
```

The order matters: the array check fires *before* the ledger check.
A snapshot whose array agrees that the final session is closed is
treated as authoritative regardless of what the ledger says — that's
the migration case (Set 022 hand-edit) the guard needs to recognize.
A snapshot without the array falls through to the existing
ledger-only behavior, preserving the v0.13.11 contract for legacy
sets that haven't been migrated.

### Writer change

```
_run_repair Case 1 (state-says-closed-but-no-closeout-event for currentSession):
    1. Compute target = compute_effective_completed_sessions(dir)
       (already includes the synthetic events we're about to append,
       since the helper re-reads after the append)
    2. Read existing = snapshot.completedSessions or []
    3. Merged = sorted(set(existing) | set(target) | {currentSession})
       # NEW: preserve every session number from either source plus
       # the one we just synthesized; never drop a number the
       # snapshot had
    4. If merged != existing:
         write snapshot.completedSessions = merged
       Else:
         leave snapshot alone (idempotency)
```

The "strict superset" framing in the problem statement reduces to
"the merged set is the union" — Python's `set.union` already does
this. The behavior change is to compute the union rather than
overwriting with the ledger view alone.

---

## Sessions

### Session 1 of 2: ai_router writer fix
**Goal:** Make `close_session --repair --apply` Case 1 preserve a
hand-authored `completedSessions[]` array. Release as `ai_router 0.2.4`.

**Steps:**
1. In `ai_router/close_session.py`, locate the `_run_repair` Case 1
   apply path (the branch that backfills `completedSessions[]` after
   appending synthetic closeout events). Change the backfill to
   compute the **union** of the snapshot's existing
   `completedSessions[]` and the helper's reconstruction (plus the
   just-synthesized session number).
2. The union is sorted, unique, monotone-up (set numbers can be
   added; never removed by the repair).
3. If the merged value equals the snapshot's existing array, do not
   rewrite the snapshot — preserves idempotency under repeated
   `--repair --apply` invocations.
4. Update the messages emitted by the repair to distinguish
   "preserved" vs "backfilled" outcomes so the operator can tell at
   a glance whether the snapshot was modified.
5. Tests:
   - Extend `ai_router/tests/test_repair_detects_mixed_mode_drift.py`
     (or a sibling) with a new fixture: snapshot has
     `completedSessions: [1, 2, 3, 4]`, ledger has only session-3
     closeout. After `--repair --apply`: snapshot's array is still
     `[1, 2, 3, 4]` (preserved); ledger has synthetic session-4
     closeout added; messages report "preserved completedSessions[]
     (snapshot superset of ledger view)".
   - Add a fixture where the snapshot's array is a subset: snapshot
     has `completedSessions: [3]`, ledger has session-2 closeout.
     After repair, snapshot is `[2, 3]` (union of `[3]`, ledger
     `{2}`, and synthesized `{3}`).
   - Add an idempotency test: repeated repair on a clean shape
     produces no further snapshot writes (mtime stable).
6. Bump `ai_router` to 0.2.4 (`pyproject.toml` + `__init__.py`).
7. Cross-provider verification.

**Creates:** none

**Touches:** `ai_router/close_session.py`,
`ai_router/tests/test_repair_detects_mixed_mode_drift.py` (or related
repair test file), `pyproject.toml`, `ai_router/__init__.py`,
`ai_router/docs/close-out.md` (Section 5 drift-case-1 description
gains a note about the snapshot-preserving behavior).

**Ends with:** A pre-Set-022 set whose operator hand-authored a
complete `completedSessions[]` array can run `--repair --apply` to
heal its events ledger without losing the hand-authored count.

**Progress keys:** `session-001/preserve-snapshot-array`,
`session-001/messages-distinguish-preserved-vs-backfilled`,
`session-001/tests`, `session-001/version-bump`,
`session-001/close-out-doc-update`,
`session-001/verification`

**Release:** PyPI `dabbler-ai-router` 0.2.4 via the existing
tag-driven workflow (`git tag v0.2.4 && git push --tags`; approve
the `pypi` deployment in the GitHub Actions UI per
`docs/planning/release-process.md`).

---

### Session 2 of 3: Cross-provider design-alignment audit
**Goal:** Before the reader-side fix ships, confirm that both **GPT
5.4** and **Gemini Pro** concur with two design decisions whose
costs landed during the Set 022 close-out and Set 023 Session 1:

1. **The Set 022 hand-migration approach** for pre-Set-022 sets that
   need their snapshot brought into compliance with the new
   `completedSessions[]` invariant — specifically the path applied to
   Sets 004 and 006 on this repo (hand-add `completedSessions: [1..N]`
   plus a `--repair --apply` to synthesize the missing final-session
   ledger event).
2. **The Set 023 fixes:** writer-side union-not-overwrite (shipped in
   Session 1 as `ai_router 0.2.4`) and reader-side
   `isMidSetComplete` consulting `completedSessions[]` before falling
   through to the events ledger (planned for Session 3).

This is the same design-round pattern that informed Set 022's
original spec (Codex + Gemini Pro on 2026-05-15, both engines given
the same prompt). Where the two engines disagree, the spec records
both positions; where one raises an objection we hadn't considered,
Session 3's plan is updated before implementation lands.

**Steps:**
1. Author a structured design-review prompt covering:
   - The Set 022 invariant (the three-line state interpretation
     rule + `completedSessions[]` "always written/maintained" stance)
     in summary form.
   - The Set 022 migration cost surfaced on Sets 004 + 006 (what the
     drift looked like, what the operator did to clear it, where
     the sharp edges were).
   - The Set 023 Session 1 change (writer union-not-overwrite — the
     actual `_run_repair` diff + the test fixtures justifying it).
   - The Set 023 Session 3 plan (reader-side `isMidSetComplete`
     change — pseudo-code + the array-check-before-ledger-check
     ordering rationale).
   - Five specific questions for the reviewer to answer in JSON:
     (a) does the hand-migration approach generalize to other
     pre-Set-022 sets safely, or are there shapes it would silently
     mis-handle?
     (b) is the writer union monotone-up only (no scenario where
     it incorrectly *adds* a session that should not be marked
     closed)?
     (c) is the reader's array-check-before-ledger-check ordering
     correct, or should the two signals require mutual agreement?
     (d) does the combined design close the two sharp edges Set
     022 surfaced, or is there a third sharp edge we missed?
     (e) any other concerns (open-ended).
2. Route the prompt to GPT 5.4 with `task_type="analysis"`. Save
   the raw response under `session-reviews/session-003-audit/gpt-5-4.json`
   (note: filenames use session-003 even though this is the
   audit-session-numbered-2; matches the original Set 023 Session 3
   reader fix's review folder naming since the audit reviews work
   originally specced as Sessions 1-2). [_Edit during Session 2:
   rename folder to `session-002-audit` if cleaner._]
3. Route the same prompt to Gemini Pro with `task_type="analysis"`.
   Save under the same folder as `gemini-pro.json`.
4. Compare the two verdicts. Author
   `session-reviews/session-002-audit/audit-summary.md` documenting:
   - Each question's verdict from each provider.
   - Areas of agreement (the strong-signal subset).
   - Areas of disagreement, with the spec author's resolution
     (whichever framing is more conservative / matches the v0.13.11
     guard's contract / better fits the schema doc tone wins; same
     tie-breaker policy as the Set 022 design round).
   - Concrete updates the audit drives into the Session 3 plan
     (text edits, ordering changes, test-fixture additions).
5. If either provider raises a Critical-severity objection that
   would invalidate the writer fix already shipped in Session 1,
   stop and flag to the human before authoring Session 3's
   implementation. The fix may need a follow-on `ai_router 0.2.5`
   patch.
6. If both providers concur with the design, update this spec's
   Session 3 plan with any non-Critical refinements the audit
   surfaced (the spec is a living document up until close-out).

**Creates:**
- `docs/session-sets/023-trust-completed-sessions-array/session-reviews/session-002-audit/` directory
- The two routed-result JSON files (one per provider)
- `audit-summary.md` (the spec author's read of the combined
  verdict)

**Touches:** This `spec.md` if Session 3's plan needs refinement
based on audit findings.

**Ends with:** A written audit on disk recording both providers'
positions on the five design questions. Session 3's plan refined
(or left as-is) based on the verdict. Session 1's already-shipped
0.2.4 either confirmed sound or queued for a follow-on patch.

**Progress keys:** `session-002/design-prompt-author`,
`session-002/gpt-5-4-route`, `session-002/gemini-pro-route`,
`session-002/audit-summary`, `session-002/spec-refinement`,
`session-002/verification`

**Release:** none. This is a doc-only session; no code or
distribution artifact ships. Verification at end of session uses
the standard `task_type="session-verification"` route against a
third-provider configuration to confirm the audit-summary
accurately captures both providers' positions (the two providers
routed in steps 2-3 are the *subject* of the audit, not its
verifier).

---

### Session 3 of 4: System-wide audit of events-ledger consumers
**Goal:** Find every code path that derives "is session N closed?" from
`session-events.jsonl` or `closeout_succeeded` events directly,
without considering `completedSessions[]`. For each consumer,
classify as one of:

- **Already correct (post-Set-022)** — already consults
  `completedSessions[]` as the primary signal, with the ledger as
  fallback or parallel check.
- **Correct to ignore the array** — the consumer's job is to read
  the events ledger as a historical record (e.g., a debug/log
  dumper, a `--show-events` tool, the events-ledger reader inside
  `close_session` itself).
- **Sharp edge, needs fix** — derives progress state from the
  ledger alone, would disagree with a migrated snapshot whose
  `completedSessions[]` carries operator-attested sessions the
  ledger lacks. Each one of these becomes a fix step within this
  session.

This session was added after both GPT 5.4 and Gemini Pro raised the
same systemic concern in the Session 2 design-alignment audit
(Gemini: critical; GPT: major; see
[`audit-summary.md`](session-reviews/session-002-audit/audit-summary.md)).
The operator chose option (B) from the audit's flag-to-operator
section: pause and expand Set 023's scope to include the audit,
rather than queue it as a follow-on set.

**Steps:**
1. Mechanical grep sweep. From the repo root:
   - `grep -rn "session-events\.jsonl\|closeout_succeeded\|hasCloseoutEventForSession\|hasCloseoutEvent\|read_events\b" --include="*.py" --include="*.ts"`
   - `grep -rn "completedSessions" --include="*.py" --include="*.ts"`
   Cross-reference the two lists. Every file in the first list that
   does not also derive its decision from `completedSessions[]` is
   a candidate sharp edge.
2. For each candidate, read the surrounding 30-50 lines and
   classify it (already-correct / correct-to-ignore / sharp-edge).
   Specific known suspects to inspect by name (do not assume — read
   them):
   - `ai_router/close_session.py` gate checks (`gate_checks.py`):
     do any of the five close-out predicates read events directly
     without considering `completedSessions[]`?
   - `ai_router/reconciler.py`: does the queue-state reconciler
     derive completion solely from events?
   - `ai_router/disposition.py` and freshness checks: do they
     consult the array?
   - `ai_router/session_state.py:compute_effective_completed_sessions`:
     already known to prefer the array; double-check.
   - `ai_router/start_session.py`'s `max(closed)+1` inference: how
     does it compute the set?
   - `tools/dabbler-ai-orchestration/src/utils/fileSystem.ts`
     (all functions, not just `isMidSetComplete`): every reader
     that derives state from events.
   - Tree-view bucketing / status-line helpers in the extension.
3. Author `session-reviews/session-003-audit-findings.md`
   documenting each consumer's classification with a one-line
   rationale and a citation (`file:line`).
4. For each sharp-edge consumer found:
   - Decide minimum-surgical fix (typically: consult the array
     first, then fall back to the ledger, mirroring Session 4's
     reader-fix shape).
   - Implement and add a regression test.
   - Document in `audit-findings.md`.
5. If sharp edges were found in Python (`ai_router`), bump to
   `ai_router 0.2.5` and ship via the tag-driven release flow. If
   sharp edges were found in TypeScript (extension), bundle them
   into Session 4's `v0.13.13` release rather than shipping a
   separate version (Session 4's reader fix is the natural carrier).
6. If no sharp edges were found, document the audit result in
   `audit-findings.md` ("no additional consumers required
   modification; the two named sharp edges were the complete
   set") and proceed to Session 4 with the system-wide concern
   formally closed on disk.
7. Cross-provider verification.

**Creates:**
- `docs/session-sets/023-trust-completed-sessions-array/session-reviews/session-003-audit-findings.md`
- Possibly: regression tests for any sharp-edge consumers fixed.

**Touches:**
- This `spec.md` if the audit findings drive any Session 4 plan
  changes.
- Any files identified as sharp-edge consumers (unknown until the
  grep sweep runs).
- If `ai_router` fixes ship: `pyproject.toml`, `ai_router/__init__.py`,
  `ai_router/docs/close-out.md` if the close-out story changes.

**Ends with:** A written audit on disk classifying every
events-ledger consumer in the codebase. The system-wide concern
raised by both providers in Session 2 is either resolved (sharp
edges fixed) or formally closed (no additional sharp edges
found). Session 4 can proceed to the planned reader fix with
confidence.

**Progress keys:** `session-003/grep-sweep`,
`session-003/classify-consumers`, `session-003/audit-findings-doc`,
`session-003/sharp-edge-fixes` (no-op if none found),
`session-003/release` (no-op if no Python fixes shipped),
`session-003/verification`

**Release:** Conditional. PyPI `dabbler-ai-router` 0.2.5 only if
the audit surfaced Python-side sharp edges that needed fixing.
TypeScript-side sharp edges are deferred to Session 4's
`v0.13.13` release. If the audit finds nothing, this session is
doc-only with no distribution artifact.

---

### Session 4 of 4: Extension reader fix
**Goal:** Teach `isMidSetComplete` to treat
`currentSession in completedSessions[]` as authoritative. Update the
schema doc to reflect that the array is now consulted by the guard.
Release as extension `v0.13.13`.

**Steps:**
1. In `tools/dabbler-ai-orchestration/src/utils/fileSystem.ts`,
   modify `isMidSetComplete` to consult `completedSessions[]` before
   the events-ledger check:
   - After the `currentSession < totalSessions` early return, read
     `completedSessions` from the snapshot.
   - If `completedSessions` is an array AND
     `completedSessions.includes(currentSession)` → return `false`
     (the array agrees the final session is closed; not mid-set).
   - **Observability (Session 2 audit / GPT 5.4 caveat on (c)):**
     when the array-check branch returns `false`, also check whether
     the events ledger lacks a closeout for `currentSession`. If so,
     emit a one-line `console.warn` like
     `"[session-set <slug>] completedSessions[] overrides missing ledger closeout for session N"`.
     The override is correct; the warn surfaces the drift shape so
     the operator can run `--repair --apply` if they want the
     ledger healed too. Mirrors the v0.13.11 guard's existing
     downgrade log.
   - Else fall through to the existing events-ledger check
     unchanged.
2. The `JSON.parse` shape needs to be extended to include
   `completedSessions?: number[]`. Keep the read defensive (non-array
   values are treated as absent via `Array.isArray`; the existing
   `catch { return false }` already covers parse failures).
3. Update the docstring above `isMidSetComplete` to reflect the new
   semantics: the guard now downgrades only when both authoritative
   signals (array and ledger) disagree with the snapshot's `status`.
   Use the Session 2 audit's sharpened phrasing:
   `completedSessions[]` is authoritative for *whether* a session
   is closed; `session-events.jsonl` is authoritative for *when*
   each closeout was recorded.
4. Tests in `tools/dabbler-ai-orchestration/src/test/suite/fileSystem.test.ts`:
   - **F1** Snapshot has `completedSessions: [1, 2, 3]`, currentSession 3,
     no events ledger or incomplete ledger → returns `false` (the
     array satisfies the guard).
   - **F2** Snapshot has `completedSessions: [1, 2]`, currentSession 3,
     no ledger closeout for session 3 → returns `true` (array
     disagrees; falls through to ledger check; ledger also
     disagrees → downgrade).
   - **F3** Snapshot has no `completedSessions` field, currentSession 3,
     ledger has closeout for session 3 → returns `false` (legacy
     path unchanged).
   - **F4** Snapshot has no `completedSessions` field, currentSession 3,
     ledger has no closeout for session 3 → returns `true` (legacy
     drift case unchanged).
   - **F5** *(audit-driven, Gemini on (e))* Snapshot has
     `completedSessions: null` (or `"not-an-array"`, or
     `{not: "array"}`), currentSession 3, ledger has closeout for 3
     → returns `false` (`Array.isArray` fallback works; legacy
     path takes over).
   - **F6** *(audit-driven, both on (b) and (e))* Snapshot has
     `completedSessions: [1, 2, 99]`, totalSessions 4, currentSession 4,
     no ledger closeout for 4 → returns `false` (4 is not in the
     array, but 99's presence is irrelevant to the array-check;
     wait — re-check: `[1,2,99].includes(4)` is `false`, so this
     falls through to ledger check, which also lacks closeout for 4
     → returns `true`. Restate as: this fixture documents that a
     stray out-of-range entry doesn't accidentally satisfy
     `.includes(currentSession)` for the wrong session number).
   - **F7** *(audit-driven, GPT on (e))* Snapshot has
     `completedSessions: [1, 2]`, currentSession 3, ledger has
     closeout for session 1 but not session 3 → returns `true`
     (array disagrees on the final session, ledger also disagrees).
     Documents non-final-session-disagreement isn't relevant to the
     guard, which only checks `currentSession`.
5. Update `docs/session-state-schema.md` "Parser cheat-sheet"
   bucketing section to note that the mid-set-complete guard now
   consults `completedSessions[]` as an alternative signal to the
   events ledger. **Audit-driven (both on (e)):** sharpen the
   "authoritative" language in this doc and in
   `ai_router/docs/close-out.md` to distinguish *whether-closed*
   (`completedSessions[]`) from *when-closed* (events ledger), so
   future maintainers don't misread "both are authoritative" as
   "must agree."
6. **Audit-driven (GPT on (a)):** Add a one-line note to
   `ai_router/docs/close-out.md` Section 5 (drift case 1) that
   `completedSessions[]` is operator-attested for migrated sets
   and tool-maintained for sets that ran the close-out gate. The
   tool preserves the operator's stated truth and uses the ledger
   only to add what the operator missed.
7. Bump extension to v0.13.13 (`package.json` + `package-lock.json` +
   `CHANGELOG.md` + `CLAUDE.md`).
8. Compile + smoke-test against a real session set. Set 006 on this
   repo is the natural test: after the fix, removing the synthetic
   session-3 closeout event from `006-docs-fresh-turn-and-alignment-audit/session-events.jsonl`
   should leave Set 006 still bucketed as Done in the tree view
   (smoke test only; do not actually remove the event — the test is
   "what would happen if the operator had not run --repair --apply").
9. Cross-provider verification.

**Creates:** none

**Touches:** `tools/dabbler-ai-orchestration/src/utils/fileSystem.ts`,
`tools/dabbler-ai-orchestration/src/test/suite/fileSystem.test.ts`,
`tools/dabbler-ai-orchestration/package.json`,
`tools/dabbler-ai-orchestration/package-lock.json`,
`tools/dabbler-ai-orchestration/CHANGELOG.md`, `CLAUDE.md`,
`docs/session-state-schema.md`.

**Ends with:** A migrated pre-Set-022 set whose operator hand-added
`completedSessions[]` displays as N/N Done in the tree view without
needing to also synthesize ledger closeout events for the final
session.

**Progress keys:** `session-004/guard-consults-array`,
`session-004/observability-warn`, `session-004/tests`,
`session-004/schema-doc`, `session-004/closeout-doc-attestation-note`,
`session-004/version-bump`, `session-004/smoke-test`,
`session-004/verification`

**Release:** VS Code Marketplace `DarndestDabbler.dabbler-ai-orchestration`
v0.13.13 via the existing tag-driven workflow
(`git tag vsix-v0.13.13 && git push --tags`; approve the
`marketplace` deployment in the GitHub Actions UI per
`docs/planning/marketplace-release-process.md`). If Session 3's
audit surfaced any TypeScript-side sharp edges, they ship together
with the reader fix in this same `v0.13.13` release.

---

## Risks

- **Backward compatibility.** The reader change is strictly
  permissive: a set that would have been classified as mid-set under
  v0.13.12 might be classified as done under v0.13.13 if its
  `completedSessions[]` says so. This is the *intended* behavior —
  the migration story Set 022 promised — but operators with sets
  carrying stale/incorrect `completedSessions[]` arrays will see
  those sets jump from In Progress to Done. Mitigation: this is the
  same fix the operator would have applied by hand anyway; the
  v0.13.11 guard's strict events-ledger check was a recovery
  defense, not a normal-path requirement.

- **Writer change idempotency.** The Session 1 fix must remain
  idempotent under repeated `--repair --apply` invocations — i.e., a
  set whose snapshot is already correct should not have its
  snapshot's mtime touched on a second repair. The test fixture
  enumerated above asserts this.

- **No release-order coupling.** Sessions 1 and 4 are independent.
  Session 1 ships ai_router 0.2.4 and Session 4 ships extension
  v0.13.13; consumers can adopt either independently. A consumer on
  the new extension + old ai_router still benefits from the reader
  fix; a consumer on the new ai_router + old extension benefits from
  the writer fix. There is no compatibility flag to coordinate.
  Session 2 (design audit) and Session 3 (system audit) are
  doc-only by default; Session 3 may also ship `ai_router 0.2.5`
  if its grep sweep finds Python-side sharp edges.

- **Writer union is unguarded against out-of-range session
  numbers.** *(Audit-driven, Session 2 — GPT major / Gemini minor
  on (b).)* The Session 1 union does not clamp session numbers to
  `[1..totalSessions]`. A snapshot `[1, 2, 99]` with `totalSessions:
  4`, or a stray `closeout_succeeded(session_number=99)` in the
  ledger, gets ratcheted into the merged value. The Session 1 fix
  is not *wrong* on its own — it preserves what the operator
  typed — but a typo could cement under repeated repair.
  Mitigation: queue a follow-on `ai_router 0.2.5` patch (post-Set
  023) that clamps the union to `[1..totalSessions]` and warns on
  out-of-range entries. Session 4 fixture **F6** documents that
  the reader is robust to this writer-side gap.

- **System-wide audit deferred-to-this-set.** *(Audit-driven,
  Session 2 — both providers on (d).)* Both providers raised that
  other progress-readers in the pipeline may still consult the
  events ledger directly. Operator chose option (B) from the audit
  flag: pause Session 4 and expand Set 023's scope to include
  Session 3, a codebase-wide audit + any reader rewrites it
  surfaces. The audit's findings are written to
  `session-reviews/session-003-audit-findings.md`; if it finds
  no additional sharp edges, the concern is formally closed on
  disk.

---

## Routing notes

- **Effort-low** for orchestrators: both fixes are surgical and the
  test surface is small. The risk is invariant misreading, not
  algorithmic complexity. Cross-provider verification at end of
  each session catches edge cases.
- **Session 1** (ai_router Python): Claude or GPT-5.4 — both have
  the context for the repair code path.
- **Session 2** (design audit): Claude orchestrates the routing to
  GPT-5.4 + Gemini Pro; the audit itself has no orchestrator-author
  role.
- **Session 3** (system audit): Claude — the grep sweep is
  mechanical and the per-consumer classification is contextual
  (each consumer needs to be read in its surrounding code, which
  Claude's context window handles well).
- **Session 4** (extension TypeScript): Claude or GPT-5.4 — the
  `fileSystem.ts` change is a five-line addition plus the audit-
  driven fixtures and the observability warn.

---

## Success criteria

After this set closes:

1. A pre-Set-022 set whose operator hand-adds `completedSessions: [1..N]`
   to its snapshot displays as N/N Done in the Session Set Explorer
   on extension v0.13.13 without any other intervention (no
   `--repair --apply` needed).
2. Running `--repair --apply` on a set whose snapshot has a complete
   `completedSessions[]` array preserves the array verbatim while
   still synthesizing the missing events-ledger closeout. The
   message line distinguishes "preserved" from "backfilled."
3. Repeated `--repair --apply` on a clean set produces no further
   snapshot writes (idempotent under the new semantics).
4. The full repair test suite (`test_repair_detects_mixed_mode_drift.py`
   and siblings) plus the extension `fileSystem.test.ts` suite pass
   on both the new and the existing fixtures.
5. The two sharp edges Set 022 flagged are resolved; the v0.13.11
   defensive guards remain as recovery defense-in-depth for legacy
   sets that pre-date both Set 022 and Set 023.
