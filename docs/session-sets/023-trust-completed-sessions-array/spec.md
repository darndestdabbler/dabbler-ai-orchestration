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
totalSessions: 2
requiresUAT: false
requiresE2E: false
uatStyle: ad-hoc
uatScope: none
effort: low
outsourceMode: first
```

> Rationale: two narrowly-scoped fixes (one Python, one TypeScript) with
> well-defined unit-test surfaces. No UI flow changes; no UAT. Each
> session ships one release artifact.

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

### Session 2 of 2: Extension reader fix
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
   - Else fall through to the existing events-ledger check
     unchanged.
2. The `JSON.parse` shape needs to be extended to include
   `completedSessions?: number[]`. Keep the read defensive (other
   types are treated as absent; the existing `catch { return false }`
   already covers parse failures).
3. Update the docstring above `isMidSetComplete` to reflect the new
   semantics: the guard now downgrades only when both authoritative
   signals (array and ledger) disagree with the snapshot's `status`.
4. Tests:
   - In `tools/dabbler-ai-orchestration/src/test/suite/fileSystem.test.ts`,
     add fixtures for `isMidSetComplete`:
     - Snapshot has `completedSessions: [1, 2, 3]`, currentSession 3,
       no events ledger or incomplete ledger → returns `false` (the
       array satisfies the guard).
     - Snapshot has `completedSessions: [1, 2]`, currentSession 3,
       no ledger closeout for session 3 → returns `true` (array
       disagrees; falls through to ledger check; ledger also
       disagrees → downgrade).
     - Snapshot has no `completedSessions` field, currentSession 3,
       ledger has closeout for session 3 → returns `false` (legacy
       path unchanged).
     - Snapshot has no `completedSessions` field, currentSession 3,
       ledger has no closeout for session 3 → returns `true` (legacy
       drift case unchanged).
5. Update `docs/session-state-schema.md` "Parser cheat-sheet"
   bucketing section to note that the mid-set-complete guard now
   consults `completedSessions[]` as an alternative signal to the
   events ledger.
6. Bump extension to v0.13.13 (`package.json` + `package-lock.json` +
   `CHANGELOG.md` + `CLAUDE.md`).
7. Compile + smoke-test against a real session set. Set 006 on this
   repo is the natural test: after the fix, removing the synthetic
   session-3 closeout event from `006-docs-fresh-turn-and-alignment-audit/session-events.jsonl`
   should leave Set 006 still bucketed as Done in the tree view
   (smoke test only; do not actually remove the event — the test is
   "what would happen if the operator had not run --repair --apply").
8. Cross-provider verification.

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

**Progress keys:** `session-002/guard-consults-array`,
`session-002/tests`, `session-002/schema-doc`,
`session-002/version-bump`, `session-002/smoke-test`,
`session-002/verification`

**Release:** VS Code Marketplace `DarndestDabbler.dabbler-ai-orchestration`
v0.13.13 via the existing tag-driven workflow
(`git tag vsix-v0.13.13 && git push --tags`; approve the
`marketplace` deployment in the GitHub Actions UI per
`docs/planning/marketplace-release-process.md`).

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

- **No release-order coupling.** Sessions 1 and 2 are independent.
  Sessions 1 ships ai_router 0.2.4 and Session 2 ships extension
  v0.13.13; consumers can adopt either independently. A consumer on
  the new extension + old ai_router still benefits from the reader
  fix; a consumer on the new ai_router + old extension benefits from
  the writer fix. There is no compatibility flag to coordinate.

---

## Routing notes

- **Effort-low** for orchestrators: both fixes are surgical and the
  test surface is small. The risk is invariant misreading, not
  algorithmic complexity. Cross-provider verification at end of
  each session catches edge cases.
- **Session 1** (ai_router Python): Claude or GPT-5.4 — both have
  the context for the repair code path.
- **Session 2** (extension TypeScript): Claude or GPT-5.4 — the
  `fileSystem.ts` change is a five-line addition.

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
