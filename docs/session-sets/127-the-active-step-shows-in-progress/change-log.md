# Change log — Set 127: the active step shows In Progress

**Set:** `127-the-active-step-shows-in-progress` (3 sessions, all VERIFIED)
**Source of record:** [`docs/planning/work-explorer-in-progress-step-icon.md`](../../planning/work-explorer-in-progress-step-icon.md)
— now moved from *diagnosed, not fixed* to **fixed**.

---

## What was wrong

The operator, looking at the Work Explorer during Set 124 S2: *"I'm not
seeing the In Progress icon on the active step."* The Explorer could not
distinguish *"step 5 has not been started"* from *"step 5 has been running
for forty minutes"* — the exact question the in-progress icon exists to
answer.

The renderer was fine. `STATUS_GLYPHS` / `STATUS_BOXES` already mapped every
reasonable spelling of in-progress to the right glyph. **The state was simply
never on disk:** `log_step` writes *after* a step finishes and
`start_session` seeds the plan as `pending`, so the two writers between them
only ever produced `pending` and `complete`. `in-progress` was ~1.4% of every
step status ever written and appeared in no current set.

The same question — *where is this session right now* — was failing on a
third surface for a structurally identical reason: the step checklist's post
at a verification-round boundary depended on an orchestrator remembering
during a machine-driven sequence no human watches.

## The choice, and why

Three options were on the table in the source-of-record note. The set picked
**option 2 — derive it**, and the two rejected options were rejected on the
note's own reasoning:

| option | why not |
| :--- | :--- |
| 1. log `in_progress` on entering a step | doubles every `log_step` call and rests on a convention this repo keeps having to replace with a gate |
| 3. `start_session` stamps step 1 | option 1 with extra steps, and wrong from step 2 onward |

Deriving requires **no writer change and no orchestrator discipline**, cannot
drift out of sync because it is computed from the same rows the tree already
reads, and fixes **every historical set retroactively** — which options 1
and 3 cannot do at all.

## Session 1 — The record can say a step is in flight

`ai_router/session_checklist.py`'s `build_rows()` — *the one Python
derivation of a session's step rows* — gained two derived facts:

- **Which step is active:** the lowest-numbered seeded `plan-step` row with
  nothing logged against it, in a session `session-state.json` says is in
  flight.
- **When each started row started:** the previous step's completion, or the
  session's `startedAt` for the first step. There is no recorded start time
  on disk and this set does not add one — an entry's `dateTime` is that
  step's *completion*, so the start is a wall-clock proxy that includes any
  gap between steps. That is the honest and useful reading of "how long is
  this taking".

`session_projection` serializes the derived fields rather than recomputing
them, keeping one derivation.

Three operator rulings were taken at authoring and journalled here: **start
time only** (a finished step's end is the next row's start), **no date
handling** (the next row's hour being *smaller* says the day rolled over,
free), and **no time at all on a row that has not started** (a seeded row's
`dateTime` is *registration* time; rendering it would be a fresh wrong signal
of exactly the kind this set exists to remove).

## Session 2 — The Explorer shows it

The mirror, in `tools/dabbler-ai-orchestration/src/providers/sessionStepModel.ts`:
`sessionFlightFacts`, `activeStepIndex`, `deriveProgress`,
`effectiveStatusOf`, a `RowEvidence` type and two new `StepRow` fields. A fix
in one language and not the other is not a fix — the CLI checklist and the
tree would then *disagree* about which step is running, which is worse than
the silence it replaced.

The real work was the echo pass (`L-069-1`): `stepDescriptor` has **two**
consumers of a row's status, and the tooltip's planned branch would have
called the running step *"planned — not started"* in prose while the icon
beside it showed it running. Both now read `effectiveStatusOf`.

The start time renders `12:06-` in VS Code's dimmed `description` slot — the
slot the retired `<- here` marker used to occupy, so nothing is displaced.

The cross-language parity corpus grew 14 → 23 cases and now models
`sessionState` and per-entry `dateTime`, so `DERIVED_ROW_FIELDS` is gone and
all seven row fields are compared in both languages again.

**Round-1 verification caught this session's own defect** and it was a Major:
`readSessionSets` infers an in-memory `in-progress` state when
`session-state.json` is absent — a supported path — and the session had wired
that inferred object into `sessionFlightFacts`, so the tree would have
derived an active step where Python derives none. Fixed by arming the
derivation only from a state file really on disk.

## Session 3 — The round sequence posts its own checklist

`check_checklist_posted` enforces the cadence positionally: for transitions
t₁ < t₂ < … < tₖ, each tᵢ needs a post in `[tᵢ, tᵢ₊₁)`. One transition type
could not realistically be met. A blocking discovery round forces
`discovery → supplementary → remediate → remediation-review` in immediate
succession — minutes apart, machine-driven, orchestrator mid-remediation,
nobody at the terminal:

```
12:08:17  ROUND 2 (discovery)      <- window closed at 12:21:17, unmet
12:21:17  ROUND 3 (supplementary)  <- window closed at 12:27:20, unmet
12:27:20  ROUND 4 (remediation-review)
12:27:37  POST                     <- could only be spent on round 4
```

That is Set 126 S2, and it was not the first. A miss cannot be repaired, so
the only exit is an operator-attested waiver — a recurring, structurally
predictable omission landing on the operator's desk as paperwork.

**The fix is removal, not more discipline.** `verify_session` renders the
checklist itself at the end of every round that *completed*, through the
existing `record_post` path, so the record still means *a render happened*
and the round output becomes more informative rather than less.

Only a completed round posts: a round refused past its bound, a failed routed
call, `--dry-run`, and a **close-backstop** round record nothing. Both
failure modes fail open and are **named** on stderr (`L-079-1`) — bookkeeping
must never cost the operator a round they have already paid for.

**What the gate loses is a failure mode, not a check.** The positional
windows, the waiver path, and every other transition type (test-run recorded,
operator stop, last logged step) bind exactly as they did — and those are the
ones a human can actually hit.

**This was not self-authorized.** Reducing what a close-time gate can catch
is the decision-rights hard carve-out; the operator ratified auto-render at
Session 3 registration, before any implementation, with both rejected options
and their consequences on the record (`decisions.jsonl`, `authority: "human"`,
`verification_effect: "reduces"`).

## Falsifiers were proven to bite, not merely observed green

`L-112-1`: a gate that only ever passes is indistinguishable from one that
checks nothing. Every session planted defects against its own finished suite:

| session | planted | caught |
| :--- | ---: | ---: |
| S2 | 8 | 8 |
| S3 | 7 | 7 |

S3's seven were: the round-boundary call deleted; posting *before* the round
exists (so `--dry-run` and a failed route post too); the **ledger writer**
posting, so a close-backstop round posts too; the gate *excusing* round
transitions instead of the tool posting; the positional window widened to
"any later post covers it"; the render happening but never recorded; and the
fail-open skip made silent.

## Verification

| round | phase | verdict |
| :--- | :--- | :--- |
| S1 1–2 | discovery ×2 (fan-out 2) | VERIFIED; one adjudicated-minor residual passed to S2 with an owner |
| S2 1 | discovery (fan-out 2) | ISSUES_FOUND, 1 Major — the session's own inferred-state defect |
| S2 2 | supplementary | VERIFIED, nothing new |
| S2 3 | remediation-review | VERIFIED, fix accepted |
| S3 1 | discovery (fan-out 2, gpt-5.5 ×2) | **VERIFIED, 0 findings** |

Every round excluded the orchestrator's own effective provider (anthropic).

## Runs of record

| suite | result |
| :--- | :--- |
| pytest (S3, after the last code change) | **4101 passed, 9 skipped** in 574s |
| pytest (S2, after the round-1 remediation) | 4092 passed, 9 skipped in 752s |
| Layer 3 `npm run test:playwright` (S2) | 31 passed in 257s |
| Layer 2 `npm run test:unit` (S2) | 1516 passing, 2 pending |

Layer 2 and Layer 3 were **not owed by Session 3**: `covers` is by path, and
S3 touched only `ai_router/` and docs — no Explorer rendering surface, no
listed state-file writer, no extension manifest, no fixture harness.

## What did not change, on purpose

- **No new writer, and no orchestrator convention.** The whole point.
- **No change to `session-state.json`, its schema, or its writers.** This set
  *reads* which session is in flight; it never writes it.
- **The glyph map.** Nothing about the reported defect was in the renderer.
- **The CLI checklist's text shape.** The start time is derived onto the
  shared row model in both languages so the two cannot disagree, but only the
  tree *renders* it — the checklist is a what-is-left list, not a timeline.
- **The checklist gate's positional windows, its waiver path, and its
  advisory status.** Re-arming it as blocking was a considered option and the
  operator rejected it; the Set 116 S3 demotion stands.
- **The five legacy prose-in-`status` activity-log entries are NOT
  backfilled.** They pre-date Set 120 S1's strict writer, nothing new can
  land that way, and rewriting historical records to flatter a renderer is
  the wrong direction. The obligation they create is the opposite one and it
  *was* met: the derivation does not trust the status field blindly.

## Deferred, with a named home

`docs/planning/session-step-skeleton-and-verification-cost.md` — Session 2
ran its full suites *before* verification, which is the wrong order, and both
had to be re-run after the remediation. Cause, cost, and a proposed
structural fix (a fixed step skeleton enforced by `spec_admission`) are
written up there for Set 128 rather than bolted onto Session 3.
