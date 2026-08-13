# Set 122 Session 1 — remediation, round 1

## Finding (Major, Correctness): title-only `rename` bypassed the running-session refusal

**Accepted.** The finding is correct and the failure scenario is realistic:
`--new-title` is a first-class CLI option, and `rename_module` gated the
`has_running_session` check inside `if slug_changing`, so a title-only rename
wrote `docs/modules.yaml` while a session set for that module was mid-flight.

The TypeScript original (`moduleAuthoring.ts:1811`) gates the same check on
`slugChanging`, so this was faithful-to-the-port behaviour — but the spec's
Session 1 step 3 is unqualified: *"`delete` and `rename` must refuse a module
with a **running session**."* Goal over letter of the port: the rule exists so
a mutation does not land under a session in flight, and a manifest write is a
mutation whichever field it changes.

### Fix

`ai_router/modules.py` — the affected-set scan and the running-session refusal
now run for **every** rename mode, before any write is computed. The
undeclared-slug collision check stays gated on a slug change, because a title
rename cannot merge histories.

### Coverage

`test_every_rename_mode_refuses_a_running_session` — parameterized over
slug-only, title-only, and slug+title, each asserting exit 3 and a
byte-identical `docs/modules.yaml`. The pre-existing
`test_rename_refuses_while_an_affected_set_has_a_running_session` (top-level
and per-session `in-progress`) and
`test_rename_refuses_a_legacy_in_progress_set_with_no_state_file` are retained.

### Acceptance criterion

> A title-only rename of a module with any affected running session exits as a
> refusal with no manifest change, and the same running-session refusal is
> covered for slug-only, title-only, and slug+title rename paths.

Satisfied by the parameterized test above.
