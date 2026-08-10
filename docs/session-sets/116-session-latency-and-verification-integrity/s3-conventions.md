# Set 116 Session 3 — verification conventions

Read this before the diff. It states the agreed baseline so a round
spends its findings on real defects rather than on the things below,
which are already known and settled.

## Suite baseline

| Suite | Result | Note |
|---|---|---|
| Layer 1 `pytest ai_router/tests` | **3,848 passed / 5 skipped**, 300.09s | Run at `-n 8`, not `-n auto` — see *Operator constraint* below. The 5 skips are the long-standing tracked skips, unchanged by this session. |
| Layer 2 `npm run test:unit` | **not run, not owed** | This session touched no TypeScript. `tools/dabbler-ai-orchestration/src/` is untouched, so the mocha suite's `covers` prefix is not hit. |
| Layer 3 `npm run test:playwright` | **owed at Step 8** | `ai_router/close_session.py` and `ai_router/session_state.py` are both on the Playwright `covers` list. |
| `npx tsc --noEmit` | **clean (exit 0)** | |
| `guidance_report --check` | **OK** — constitution 3,954/4,000, total 11,825/12,000 | |
| `validate_guidance_meta` | **OK**, 28 lesson ids across 2 files | |

**The Layer 1 result above predates four comment-only edits** (an
"Advisory since Set 116 S3" note appended to the docstrings of
`check_activity_log_entry`, `check_next_orchestrator_present`,
`check_change_log_fresh` and `check_checklist_posted`). No executable
line changed. The **run of record** is taken at Step 8, after
remediation, on the final tree — which is the ordering this very session
ships.

## By-design exclusions — please do not report these as findings

1. **The diff base is `0895d200`, deliberately.** An unrelated commit by
   the operator (`Author Set 118 spec: test retirement and coupling
   budget`) landed on `origin/master` at 13:29 — *after* this session's
   `startedAt` of 13:14, so it falls inside the naive diff window
   without being this session's work. `--diff-base 0895d200` scopes the
   evidence to this session's single commit. **`docs/session-sets/118-*`
   is not under review.**

2. **No test count reduction, by design.** The operator's ruling deletes
   nothing, so no gate's tests go with it. This set delivers **zero**
   reduction in the ~3,800 tests, which is consistent with its own
   finding that test count is not where the time is (Set 112 deleted 233
   tests and saved 3.64s against a 957s suite). "This set claims to
   simplify but removes no tests" is expected, not a defect.

3. **The demoted checks still return `(False, remediation)` for a
   failing condition.** That is deliberate and tested. The demotion
   lives in `gate_checks.ADVISORY_CHECKS`, not inside the predicates: a
   predicate that softened its own verdict would leave callers unable to
   distinguish "passed" from "was excused", and would make re-arming it
   a re-derivation rather than a one-line edit.

4. **There is no longer any close-time enforcement of the
   `verification_method` vocabulary.** This is a named, operator-attested
   residual, not an oversight — it was put to the operator in an
   education-mode brief *before* the ruling was attested
   (`decisions.jsonl`, `authority: human`,
   `rubric_line: verification-reduction`). The boundary is asserted from
   both sides in `test_verification_integrity_gate.py`. A finding that
   re-raises this as a defect is re-litigating a human-authority
   decision; a finding that the *boundary* is wrong (i.e. that an
   illegal token can pass `check_verification_integrity` on an ordinary
   repo) would be real and material.

5. **`STATUS_SKIPPED_VOCABULARY`'s string value is unchanged** even
   though its only remaining producer path is the nothing-to-police
   branch plus the restored vocabulary skip. It is a wire token in close
   output; renaming it would cost consumers and buy nothing.

6. **Release contract.** Router-side only; the extension is untouched
   and its version does not move. `ai_router/CHANGELOG.md` carries the
   entries under the **staged, unpublished `1.0.0`**. Publishing is
   operator-gated and no session may do it. `pyproject.toml` is not
   bumped by this session.

## Operator constraint recorded mid-session

At ~14:05 the operator capped parallelism at **8** pending a Set 117 fix
for an OS-resource bug. `pytest.ini` still declares `-n auto`; every run
in this session used `-n 8` explicitly. The disagreement between the
declared default and the interim cap is a **named residual for Set
117**, recorded in `change-log.md` and the disposition. It is not a
defect this session introduced and not one it should fix — Set 116 S1's
`-n auto` default was proven and verified two sessions ago.

## What would be a material finding

- The blocking/advisory classification not reaching a consumer (a code
  path that still treats `not passed` as "refuse" without asking
  `is_blocking_check`). Two consumers are known and both were updated;
  a third would be a real Major.
- A *further* sibling that keyed on a condition one of the five demoted
  checks used to guarantee. One was found this session
  (`_flip_state_to_closed` requiring `change-log.md`); the reasoning that
  found it generalises, and another instance would be material.
- `test_run_fresh` becoming un-satisfiable or over-broad in a way a real
  session would hit — e.g. a docs-only session now owing a suite.
- Any doc surface still telling a reader the full run belongs at Step 5,
  or still describing a demoted check as blocking.
