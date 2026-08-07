# Set 111 — Verification Loop & Ceremony Simplification

## What this set was for

Verification had grown **5.5×** (13 → 72 min median per session) while work
only doubled; the round bounds were printed but not enforced and were
exceeded in practice; UAT was dreaded and routinely bypassed; and the
operator was being asked to adjudicate decisions the AI held more context
on. The standing rule the whole set serves is **adoption dominates rigour**
— cut the ceremony (artifacts, checklists, rounds a human must drive), keep
the machinery (a routed call costs the developer nothing).

Set 110's `operator-notes.md` piloted every policy here in prose. This set
turned them into code and canonical docs.

## What shipped

### Session 1 — the bounds are real

`verify_session` now **refuses** a third discovery pass or a third
remediation-review cycle without an explicit
`--operator-authorized-round "<reason>"`. The K=2 discovery fan-out sends
two *differently framed* prompts (spec-conformance lens vs. failure-scenario
lens) at the same cost and position. A Minor-only round routes to close
rather than to another round.

### Session 2 — acceptance criteria with baseline discrimination

A finding auto-closes only when its **unchanged** criterion fails against
the pre-fix tree and passes against the fixed one, executed in disposable
worktrees. Criteria that pass pre-fix stay judgment-based. One holistic
`remediation-review` is retained as the final delta look.

### Session 3 — decision rights, journaled

Decisions route by **whose authority they need**, not by how much judgment
they take. Four classes stay human: external or hard-to-reverse
consequences, underivable value trade-offs, accountability sign-offs, and —
the hard carve-out — anything that reduces verification. Everything else
judgment-shaped is AI-decidable under six ordered tiebreaks.
`ai_router.decision_journal` is the blessed writer for a per-set
`decisions.jsonl`; it **refuses** to write a verification-reducing record
under AI authority. Education-mode briefs became the required format for
every operator stop.

### Session 4 — the ceremony pass

- **Session-size cap, measured not asserted** (`ai_router.spec_admission`).
  Across the 172 schema-v4 sessions carrying both a parseable spec plan and
  timestamps, crossing from 5 declared steps to 6 doubles the median session
  (42 → 84 min), triples the p90 (110 → 386 min), and nearly triples the
  share running past two hours (10% → 28%). Cap: 5. Stated limit: step count
  predicts the median, **not the tail** — the longest sessions on record
  (591/562/544/509 min) all declared 5–8 steps.
- **The test-run policy, made executable** (`ai_router.run_of_record` + the
  `test_run_fresh` close gate). Freshness is a content digest over the
  surfaces a suite covers, not an mtime.
- **UAT can no longer evaporate** (`disposition.uat` + the
  `uat_walk_recorded` close gate). A `requiresUAT` session closes with a
  recorded walk or an attested waiver — there is deliberately no third value.
- **The walk stages itself** (`npm run walk`). Six operator steps of staging
  ceremony collapse to zero.
- **CI actions SHA-pinned** — all 31 references, plus a `drift_guard` check
  and a Dependabot bump path.
- **Step-level progress checklists** (`ai_router.session_checklist`),
  operator-directed during S4.

## Decisions the operator made

Recorded in `decisions.jsonl` (16 records; 4 under operator authority).
Presented as one batched education-mode brief in `s4-uat-walk.md`:

| | question | outcome |
| :--- | :--- | :--- |
| D1 | Retire `sN-conventions.md` / `ai-assignment.md`? | **Retire nothing.** |
| D2 | Must a guidance promotion name what it displaces? | **No rule change.** |
| D3 | Bound the unbounded close backstop? | **Unchanged.** |

The orchestrator recommended retiring `sN-conventions.md` (nothing reads it)
and narrowing the backstop. The operator holds scope and declined; that is
the answer, recorded rather than argued.

## Two spec premises found already discharged

Reported rather than executed, because doing the stated work would have been
wrong:

- **`project-guidance.md` was said to be +369 tokens over its ceiling.** It
  is at exactly **3,499 / 3,499**. Commit `d3e00680` had already corrected
  it and recorded the +369 as a measurement artifact (a CRLF-inflating
  pipe). A pruning sweep would have cut real guidance to hit a target
  already met.
- **`require-green-test` was to be re-decided as a hard release gate.** Set
  110 S4 had already built exactly the shape the spec predicted:
  infrastructure failures are classified separately from test failures, with
  a per-commit operator override that requires a recorded reason and never
  tolerates a genuine test failure.

## Honest residuals

- **The preload corpus has zero headroom.** `project-guidance.md` sits at
  100% of its ceiling and the operator declined the displacement rule, so
  the next promotion hits the wall and must be resolved then.
- **The close backstop is still unbounded** and still never runs in CI, so
  its cost lands on the operator machine at close time, unmeasurable on the
  `copilot-cli` seat. Retained by explicit operator choice.
- **The Work Explorer half of the progress surface is not built.** An
  in-flight session node could expand to show its logged steps. That touches
  the rendering surface and belongs to a session that owes a full Layer 3.
- **Every session of this set exceeds the cap this set shipped** — S1–S3 at
  6 steps, S4 at 11. The check was written against its own author and says
  so.
- **A carve-out-triggered escalation that results in NO reduction cannot
  name the carve-out as its rubric line.** D3 reached the operator because
  of the verification-reduction carve-out, but the decision reached was "no
  change", and `decision_journal`'s coherence rule requires
  `rubric_line="verification-reduction"` to pair with
  `verification_effect="reduces"`. Recorded as `escalate-to-human`. The
  refusal is the S3 rule working as designed; the vocabulary gap is real and
  worth a future look.

## Release

Router changes are staged under `[Unreleased]` in `ai_router/CHANGELOG.md`.
**Publishing and release tagging remain operator-gated.**
