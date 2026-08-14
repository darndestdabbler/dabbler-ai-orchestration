# Conventions for this round (read before reporting findings)

## What this session is

Set 132 Session 3 of 3, "Why the tail, what N should be, and where compaction
fires" — the **set-terminal** session. It is a **research and policy** session:
it reasons, it recommends, and it stops to the operator. It ships **no
production code**.

Its declared surface is:

- `docs/session-sets/132-.../s3-causality-and-compaction.md` (new, the main
  deliverable), `change-log.md` (new, set-terminal), two committed probe
  scripts, and the raw panel artifacts.
- `docs/ai-led-session-workflow.md` — the rotation section gains the
  every-boundary prohibition and the N/threshold coupling.
- `docs/planning/session-set-authoring-guide.md` — the cap section gains what
  the cap is competing against; *Other sizing signals* gains the
  consequence-test application point.
- `ai_router/changelog.d/0150-set-132-s3-*.md` (new).

## By-design exclusions — please do not report these as findings

- **No production code changes, no tests added.** This is a documentation and
  measurement session by design. `ai_router/` is touched only by a changelog
  fragment.
- **`WORK_STEP_BUDGET` is unchanged at 3.** The spec's non-goal is explicit:
  N moves only on the operator's word. §7 is a *brief*, and "the number did
  not change" is the intended outcome, not an omission.
- **No compaction implementation.** Set 131 declared "no automatic compaction
  trigger" a non-goal and this set inherits it. The trigger's *shape* and
  *coupling* are the deliverable; a writer that flushes a transcript is a
  later set.
- **The experiment is DESIGNED, not RUN.** The spec says so
  ("I'm not saying that we need to do this experiment in this set"), and the
  operator additionally ruled it out on cost mid-session.
- **`docs/planning/project-guidance.md` was deliberately NOT edited.** The
  spec made that touch conditional — "only if the rubric genuinely extends" —
  and §6 argues the rule does not change, only its application point. A first
  draft that did edit it breached the file's preload ceiling by 126 tokens,
  which is corroborating evidence rather than the reason.
- **No new lesson was added to `lessons-learned.md`.** It sits at 100% of its
  preload ceiling (2,493 / 2,504 tokens), and the transport finding is already
  the class L-125-1 names. L-125-1 is cited instead.

## Known pre-existing state, so it is not re-reported

- **`guidance_report --check` fails on `AGENTS.md`: +177 tokens over its
  2,031-token ceiling.** This session did not touch `AGENTS.md` (confirm via
  `git diff --stat`). It is pre-existing and is picked up by the Step 9
  reorganization review, which is this session's job.
- **The `vsix-first-run-walkthrough` Layer 3 spec is a chronic, documented
  flake** under load (R2 in the spec; disclosed as a composite by both S1 and
  S2). If the Layer 3 run of record is again recorded as a disclosed
  composite, that is the standing practice, journalled each time.

## The one thing most likely to be mis-reviewed

**This session's headline finding contradicts the premise of its own set.**
The set exists to reason about the step budget `N`; §3 concludes `N` is the
wrong lever, because measured fixed overhead (`F` ≈ 39–41 min) is 5–7× a
measured work step (`w̄` ≈ 6–9 min). Please attack that, specifically:

- **Two independent estimates of `F` agreeing is the load-bearing claim.** One
  is a regression intercept over 199–225 sessions (Set 132 S2 §4); the other
  is observed clock time in ceremony steps over 97 sessions (this session).
  They share no arithmetic. If you think they share a *confound* — and there
  is one candidate, that both inherit the same `startedAt`/`completedAt`
  boundary-write semantics D3 named — that is a legitimate and useful finding.
- **The attribution rule** is: walk each session's logged marks in time order;
  the interval ending at a `complete` mark is charged to that mark's step.
  This is defended as robust to *batch logging within a role* (steps 3–8
  logged in one second all land on the first, but they share a role, so
  per-role totals survive). Per-step figures are deliberately not reported.
  If you think per-role totals do **not** survive batching across a role
  boundary, say so.
- **`corr(N, w̄) ≤ 0` is claimed as a conservative bound, not a null result.**
  The argument is in §3.3 and it is a bias-direction argument: the composition
  artifact inflates `w̄` at high N, so the true curve falls at least as fast.
  Attack the direction if you think it runs the other way.

## What is already disclosed, so it need not be discovered

The document states its own limits in §8. Reporting them back is not a
finding — but arguing a limit is *understated* is:

- Nothing here is causal; the author still chooses N knowing the work.
- The skeleton-era cut (n = 22) validates `F` and **cannot** estimate the N
  slope, because every skeleton-era session has N ≤ 3 — the cap removed the
  variance. This is stated in §3.3 in exactly those terms.
- The tail discriminators are unmodelled correlations with an era control and
  no multivariate control. "+0.767 vs +0.228" is a ranking, not an effect
  size, and the direction of the arrow is explicitly not claimed.
- `F` is measured on 97 sessions, not 225 — those with both a parseable plan
  and logged marks.

## Suite baseline

- `python -m ai_router.changelog check` → **round trip OK** (router and
  extension).
- `python -m ai_router.spec_admission --spec <this set>` → **[ok] 6 (N=2),
  7 (N=3), 7 (N=3)** — the spec's own declared N, now confirmed by the
  instrument Session 2 fixed.
- All three suites are owed (the changelog fragment lands under `ai_router/`,
  which `mocha` and `playwright` both declare; `pytest` also covers
  `docs/session-sets/`). They run at step 6, **after** this round, per A2 — no
  full suite before a cross-provider stage. Their result is not yet in
  evidence; if you need it to judge a finding, say so and it will be supplied
  rather than guessed at.
- No test was deleted, weakened, skipped or marked pending. None was added.

## Severity rubric for this round

Grade by **consequence**: probability the stated failure scenario hits a real
user × impact (L-095-1). Low probability **or** low impact is Minor; no
nameable failure scenario is a nit. For a policy document the "user" is the
next orchestrator or spec author who acts on it, so the sharpest question is:
**would a reader be misled into a wrong decision by this text?**
