# Step 9 — guidance reorganization review (Set 105, final session)

**Method:** routed analysis (`task_type=analysis`, anthropic excluded →
gemini-2.5-pro, tier 2, $0.0028, truncation-clean) per the no-self-opine mandate
on guidance decisions; outcome applied below.

## Outcome

| Question | Decision |
|---|---|
| Add the corrected root-cause lesson? | **Yes** |
| Tier | **Archive** (`lessons-archive.md`) — born archived |
| `project-guidance.md` change | **None** (already at 100% ceiling; no new durable principle) |
| Reactivate L-069-1 | **No** — its rule is already promoted to `project-guidance.md` (active); reactivation would be redundant |
| Other reorg | **No changes recommended** |

## Rationale

- **L-105-1 → archive, not active.** This set shipped an **executable gate** —
  the untracked collector reclassifies `session-state.json` /
  `session-events.jsonl` / `activity-log.json` (by basename) into a bookkeeping
  partition, with a real-git regression test. The active-tier admission test
  requires *no executable-gate equivalent*; that criterion no longer holds, so
  active-tier residency is not warranted. The diagnostic wisdom ("a finding that
  re-appears on a file you delete is being re-synthesized out of band by a
  read-triggered writer — fix the evidence layer, not the file") is genuinely
  reusable but **situational**, which is exactly what the archive tier is for.
- **Ceiling discipline preserved.** `lessons-learned.md` is at 99% of its
  preload ceiling and `project-guidance.md` at 100%; adding an active lesson
  would have forced a demotion (ceilings ratchet down only). Placing L-105-1 in
  the archive adds the knowledge at **zero preload cost**.
- **L-069-1** ("fix every sibling site") was cited this session (all three
  bookkeeping filenames covered, not just `session-state.json`). Its rule lives
  in `project-guidance.md` Conventions; the `[reconsider]` line from
  `cite_lessons` is expected for a promoted lesson and needs no action.

## Applied

- Added **L-105-1** to `docs/planning/lessons-archive.md`
  (`status="archived"`, `encoded-in` = the shipped gate).
- `validate_guidance_meta`: OK (27 ids). `guidance_report --check`: OK
  (preload 91% of total ceiling, unchanged — the archive tier is not counted).
