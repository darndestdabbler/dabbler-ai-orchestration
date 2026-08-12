# Work Explorer: no In Progress icon on the active step

> **Reported by the operator, 2026-08-12**, during Set 124 Session 2:
> *"I'm not seeing the In Progress icon on the active step in the Work
> Explorer."*
>
> **Status: FIXED by Set 127** (`docs/session-sets/127-the-active-step-shows-in-progress/`).
> Option 2 below — *derive it* — was the one scheduled, and it shipped in
> both implementations of the row model:
>
> - **Session 1** — `ai_router/session_checklist.py`: `build_rows()` derives
>   the active step (the lowest-numbered seeded `plan-step` row with nothing
>   logged against it, in a session `session-state.json` says is in flight)
>   and each started row's start time. `session_projection` serializes the
>   derived fields rather than recomputing them.
> - **Session 2** — `sessionStepModel.ts`, the mirror the Work Explorer
>   reads, with a cross-language parity fixture that fails when the two
>   implementations drift. The start time renders `12:06-` in the dimmed
>   `description` slot; the operator who reported this attested the walk.
> - **Session 3** — the same question on the third surface: the step
>   checklist's post at a verification-round boundary, which
>   `verify_session` now renders itself rather than depending on an
>   orchestrator remembering during a machine-driven sequence.
>
> No writer was added and no orchestrator convention was introduced, so
> **every historical set is fixed retroactively** — which is exactly what
> options 1 and 3 could not do.
>
> **The secondary finding below was deliberately NOT backfilled.** The five
> prose-in-`status` entries pre-date Set 120 S1's strict writer, nothing new
> can land that way, and rewriting historical records to flatter a renderer
> is the wrong direction. The obligation they create is the opposite one and
> it *was* met: the derivation does not trust the status field blindly — it
> reads whether an entry EXISTS, not what its status says (Set 127 S2's
> journaled decision, pinned by the corpus case
> `the-start-time-chain-does-not-read-the-status-vocabulary`).
>
> *Originally captured as a durable note (diagnosed, not fixed) because it
> surfaced mid-session in another set.*

## Diagnosis: the renderer is fine — nothing ever writes the state

This is almost certainly **not** a rendering bug. The extension already maps
every reasonable spelling to the right glyph
(`src/providers/sessionStepModel.ts`):

```ts
const STATUS_GLYPHS: Record<string, StepGlyphStatus> = {
  complete: "complete",   done: "complete",
  "in-progress": "in-progress",  in_progress: "in-progress",  started: "in-progress",
  pending: "not-started",        "not-started": "not-started",
  blocked: "cancelled",          failed: "cancelled",
};
```

The problem is upstream: **a step is never `in-progress` on disk.** The two
writers between them only ever produce two states:

| writer | when | status written |
| :--- | :--- | :--- |
| `start_session` → `seed_session_plan` | at registration | `pending` (one row per spec step, `kind: "plan-step"`) |
| orchestrator → `SessionLog.log_step` | **after** the step is done | `complete` |

Nothing writes the state in between, so the tree goes `not-started` →
`complete` with no intermediate frame. The active step renders as
**not-started** for its entire duration.

## Evidence

Every step status ever written, across **all** session sets:

| count | status |
| ---: | :--- |
| 2,755 | `complete` |
| 116 | `pending` |
| **40** | `in-progress` |
| 3 | `blocked` |
| 1 each | `skipped`, `complete-with-known-failures`, + 5 prose strings (see below) |

`in-progress` is ~1.4% of writes and appears in no current set. The live sets
at the time of the report:

```
124  s1 steps1-5 pending (plan-step) -> steps1-5 complete   # no in-progress
124  s2 steps1-5 pending (plan-step) -> steps1-4 complete   # step 5 ACTIVE, still `pending`
125  s1 steps1-5 pending (plan-step) -> steps1-5 complete   # no in-progress
```

Set 124 Session 2 step 5 was the genuinely active step when the operator
looked, and its only on-disk row said `pending`.

## Why it is a real defect and not just cosmetics

The step checklist and the Explorer are the operator's window into *where a
session is*. Set 114 S2 added the seeded plan precisely so the tree shows what
is **coming**, not only what is done. Without an in-progress state the tree
cannot distinguish "step 5 has not been started" from "step 5 has been running
for forty minutes" — which is exactly the question the icon exists to answer,
and the one an operator asks when a session goes quiet.

## Options for whoever owns the fix

1. **Orchestrator writes it** — log `in_progress` on entering a step and
   `complete` on leaving. Truthful and needs no new machinery, but it doubles
   `log_step` calls and depends on orchestrator discipline, which is exactly
   the kind of unenforced convention this repo keeps having to replace with a
   gate.
2. **Derive it** — the active step is the lowest-numbered seeded `plan-step`
   with no `complete` row, in the session that `session-state.json` says is
   in-progress. Requires **no writer change and no orchestrator discipline**,
   and it cannot drift out of sync because it is computed from the same rows
   the tree already reads. *Recommended;* it is the same
   partitioned-sources/one-computed-view shape as Set 120's projection.
3. **`start_session` marks step 1 in-progress** — cheap, but wrong after the
   first step and would need every later step re-stamped, which is option 1
   with extra steps.

Option 2 also fixes the display for every **historical** set retroactively,
where options 1 and 3 only help future sessions.

## Secondary finding, same query

Five activity-log entries carry **prose in the `status` field** — full
paragraphs of remediation narrative where a token belongs. They pre-date Set
120 S1's strict writer (`require_step_status`), so nothing new can land that
way, but `glyphStatusOf` maps each of them to `not-started` via its `??`
fallback. Harmless today; worth a one-off backfill if anyone touches this
area, and a reason not to make the derived-state logic trust the field
blindly.

## Related work

- `tools/dabbler-ai-orchestration/src/providers/sessionStepModel.ts` — glyph
  mapping and `isLoggedStep`.
- Set 114 S2 — seeded the plan into `activity-log.json` so the tree shows what
  is coming.
- Set 115 — Work Explorer session-node UX.
- Set 120 S1 — the strict step-status writer; S3 — the one computed
  projection, whose shape option 2 mirrors.
- **Set 127 — the set that closed this note.** S1 derived the state and the
  start time in Python; S2 mirrored both in TypeScript and rendered them; S3
  closed the same gap on the step checklist's round-boundary post.
