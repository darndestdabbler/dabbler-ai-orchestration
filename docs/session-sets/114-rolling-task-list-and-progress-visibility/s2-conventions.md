Set 114 Session 2 — conventions for this round

Suite baseline (both suites run AFTER the last code change, per the
repo's freeze rule):

- `python -m pytest`: **3752 passed, 0 failed, 9 skipped** (16m43s).
  The 9 skips are the standing environment-conditional skips this repo
  has carried for many sets; none is a tracked failure.
- `npm run test:playwright` (Layer 3): **33 passed, 0 failed** (10.2m).
  Run because `project-guidance.md` names **state-file writers** as a
  trigger and `start_session` is one by the constitution's own words;
  it now also writes to `activity-log.json`, which the extension
  watches.
- Both runs are recorded in `test-runs.jsonl` for session 2.

Release contract: nothing is published in this session. The router
package version stays `1.0.0` (staged, publish operator-gated and
deferred until Set 114 completes — see `ai_router/CHANGELOG.md`). No
tag, no PyPI run, no Marketplace push. A finding that this session
"should have bumped the version" is out of contract.

By-design exclusions:

- **The extension is untouched.** Session 3 of this set owns the Work
  Explorer expansion; `is_planned` exists on `ChecklistRow` for that
  session's benefit and is deliberately unused by the CLI renderer.
  "The tree does not show plan steps yet" is the spec's sequencing,
  not a defect.
- **`change-log.md` is not authored here.** It is a Session 3 (set-
  terminal) deliverable per the spec.
- **Set 113's files are dirty in `git status`.** Another orchestrator is
  working `docs/session-sets/113-narrated-video-walkthroughs/`
  concurrently in this same checkout. Those files are NOT part of this
  session's change set, are deliberately unstaged, and are excluded
  from `disposition.files_changed`.

Severity rubric for this round — grade by CONSEQUENCE: probability the
stated failure scenario reaches a real user, times impact. Low
probability **or** low impact is Minor. A finding with no nameable
failure scenario is a nit, not a Major.

What this session changed, and the two decisions worth reviewing hardest:

1. **`start_session` now seeds the session's spec steps into
   `activity-log.json`** as `pending` entries with `kind: "plan-step"`.
   This is spec-directed (Session 2 step 2) and is the *permitted* way
   to reverse Set 111 S4's "never synthesize plan rows at render time":
   the plan goes into the record, so the renderer keeps one rule.
2. **Seeded entries are excluded from two gates** —
   `check_activity_log_entry` (which would otherwise pass for every
   session at registration, before any work exists) and
   `_checklist_transitions`' "last logged step". Both exclusions have
   planted falsifiers in `test_plan_seeding.py::TestThePlanIsNotWork`.

Known limits this session states rather than hides:

- The plan is seeded **once** and never re-seeded, so a spec edited
  mid-session does not retro-update the ledger. That is deliberate
  (`decisions.jsonl`, record 2 of 3 for session 2): re-seeding would
  write to the activity log mid-session, which is the freshness risk
  the spec's Risks section names.
- Reconciliation matches a logged step to a planned one by
  `stepNumber`, then `stepKey`. An orchestrator that numbers its
  `log_step` calls independently of the spec's steps will see doubled
  rows. The convention was already universal in this repo; the
  constitution's Step 4 now states it explicitly.
- A post proves a render, not a reader (inherited from S1, unchanged).
