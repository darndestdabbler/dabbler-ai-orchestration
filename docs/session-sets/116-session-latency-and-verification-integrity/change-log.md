# Set 116 — Session latency, and the verification integrity behind it

## What this set was for

The operator named it critical: *"this must be fixed or developers won't
use the tool."* Median session duration had roughly tripled — 0.67h for
sets 60–69, 1.93h for sets 100+ — and the set was authored from
measurement rather than opinion, at commit `9277e104`:

- The test suite cost **845.76s serial** when `-n auto` did the same work
  in **234.55s**, with identical results. A 3.61x tax paid by every run.
- The published timings were wrong by up to 30x. `CONTRIBUTING.md` said
  Layer 1 was *"~30s"* and Layer 3 *"~90s for ~10 scenarios"*; the truth
  was ~14 min and ~9.6 min. Every "just run the tests" judgement in this
  repo had been made against those figures.
- The framework could not see its own test cost: `test-runs.jsonl`
  recorded a free-text `detail` that *sometimes* mentioned minutes.
- The verification cap was bypassed. `close_backstop` resolved a round
  with **no bounds at all** while `verify_session` enforced them, and
  router metrics show backstop rounds **5–10**, **5–12** and **5–7**.
- Recording the final test run **staled the verification that had just
  passed**, so the operator's own proposed ordering made things worse.
- `test_run_fresh` did not govern pytest at all.
- And the doctrine's test ordering was self-contradictory: Step 5 said
  expensive suites run *"fully once, after the last code change"* — but
  Step 7 remediation **is** a code change.

Two decisions were locked before any session ran, and neither was
reopened. **No test-pruning campaign** (measured at 0.4% payoff — Set 112
deleted 233 tests and saved 3.64s against a 957s suite, while one flag
saved ~610s, a ~170:1 difference). **No risk-ordered execution** (in a
blocking loop, ordering saves zero wall-clock).

## What shipped

### Session 1 — make the suite cheap, and make its cost visible

`pytest-xdist` is the documented default, wired once into `pytest.ini`'s
`addopts` so local runs, CI, and the run of record cannot disagree about
what "the suite" means. Parity was proven rather than assumed: **3,813
passed / 5 skipped both ways**, serial 647.01s vs parallel 240.56s, and
all four runs (full and `-m e2e`, serial and parallel) share **one
`surfaceDigest`** — `fb69075938a4` — which is what makes "the same tree"
a claim rather than an assertion. The raw transcripts are checked in as
`s1-e2e-parity-benchmark.txt` and `s1-full-suite-parity-benchmark.txt`.

`CONTRIBUTING.md`'s figures were corrected to the measured ones and cite
the evidence. The sweep for the same stale strings deliberately left
historical specs, changelogs, and the benchmark script alone — those are
records, and the script quotes the old numbers as its own motivation.

`test-runs.jsonl` gained a structured `durationSeconds`, and it is
**required** at the writer, not optional. That was a verifier finding
worth keeping: an optional field at a write boundary never gets
populated, which is exactly the "sometimes there is no measurement"
condition the field existed to end.

**The session's own loop is the best evidence for Sessions 2 and 3.** It
ran four verification rounds, hit the enforced 2-cycle bound, needed an
operator authorization to pass it, and closed on an attested
`checklist_posted` waiver for eleven missed transitions.

### Session 2 — close the two holes in the verification loop

**Hole 1: the cap the workflow documented did not exist on the path that
runs at every close.** `close_backstop` now evaluates the *same* bound
through the *same* function (`evaluate_phase_bound`) before any metered
call. Carrying no `--phase`, a backstop round is a classic round and
consumes the classic budget — no second allowance was invented, because
a separate backstop allowance would be the same hole with a number
written next to it. At the cap it refuses deterministically
(`round_bound_reached`) and the close **blocks**, naming the two exits
that already existed rather than inventing a third.

The ordering is load-bearing: the check sits **after** the
settling-evidence skip, so a session that ran a long loop and then
verified clean still closes.

**Hole 2: rounds nobody could audit.** Every backstop round is now
appended to `sN-rounds.jsonl`, tagged `source: "close_session_backstop"`
— reusing the existing stamp vocabulary rather than minting a second
one. The ledger is declared as mid-close bookkeeping on **both** the run
path and the rerun-after-a-later-gate-failure path, so it cannot trip
`working_tree_clean`.

A self-inflicted regression was found and fixed in the same pass: a
mid-close ledger write would have become a `checklist_posted` transition
whose "post after this" window opens *after* the last moment the
orchestrator could post into it — failing every backstop-verified close
on an impossible obligation.

The staleness regression is pinned at the level the bug actually bit: a
passed round plus a recorded final test run still settles the close with
zero fresh metered rounds. That fix is what makes Session 3's reordering
possible at all.

### Session 3 — ten checks to three, plus two, plus five

The operator ruled on 2026-08-10 and **re-attested the ruling at the
moment of implementation**, which is the only way it could ship:
reducing verification sits inside the decision-rights hard carve-out, and
`decision_journal` refuses to write it under AI authority.
`operator-notes.md` carried the direction; `decisions.jsonl` carries the
attestation.

- **Three gates**, which refuse a close: `verification_integrity`,
  `uat_walk_recorded`, `test_run_fresh`.
- **Two transactional preconditions**, which also refuse but for a
  different reason: `working_tree_clean` and `pushed_to_remote` protect
  the *write*. A close computed against a dirty or unpushed tree records
  something that was never true. Classifying them as gates is what made
  "ten gates" sound like ten pieces of ceremony when two of them are
  data integrity.
- **Five advisory checks**, which run, print, and cannot refuse:
  `activity_log_entry`, `next_orchestrator_present`, `change_log_fresh`,
  `checklist_posted`, `verification_method_vocabulary`.

`gate_checks.ADVISORY_CHECKS` is the executable form of that table and
`is_blocking_check()` is the single predicate every consumer asks — so
re-arming a check is a one-line edit, not a hunt through the places that
spell `not passed`. `session_state.mark_session_complete` is the second
consumer and asks the same question, because a check demoted on one
close path and not the other is worse than one that was never demoted.

**Nothing was deleted.** Every advisory check keeps its predicate, its
message, and its tests, and the tests assert that. `checklist_posted` was
originally ruled for deletion and revised to demotion once it emerged
that Set 114 S1 had shipped it *that same morning*; deletion stays
available in a later set **on evidence**, and six hours of hindsight is
not evidence.

`test_run_fresh` — gate (c), and broken. `expensive` is the flag that
decides whether the gate has an *opinion*, not a claim about the clock,
and `pytest` and `mocha` carried `False`. All three layers now carry
`True`. The path-level scoping the operator asked for already existed, so
a docs-only session still owes nothing, which is what makes the widening
affordable.

And the full run moved from **Step 5 to Step 8**, after remediation. The
old instruction was unsatisfiable rather than merely ignored, and Set 112
S3 obeyed it into 15 test runs and 186 minutes — 59% of the session.

## The three things the tests caught that reading did not

This is the part worth carrying forward, because in all three cases the
code read correctly and was wrong.

1. **Removing the backstop's vocabulary early-out was a mistake.** The
   demotion falsified the *reason* that skip gave ("the vocabulary gate
   refuses this close anyway") but not its *conclusion*:
   `verification_method` selects the corroboration path, so a token with
   no path still cannot reach a passing close. Deleting the skip would
   have bought a metered round for a close that could not succeed. It
   was restored with corrected reasoning — the fix was to the comment,
   not the code.

2. **Demoting `change_log_fresh` turned a clean refusal into a crash.**
   `_flip_state_to_closed` required `change-log.md` to be **present**
   before it would judge a session the last one — a belt-and-suspenders
   mirror of the gate, unreachable while the gate refused first. The
   moment the gate became a warning, a final session without a change log
   passed the whole gate chain, reached the writer, was judged mid-set,
   and wrote `status: in-progress` over a `sessions[]` in which every
   session was complete. The writer's own invariant validator rejected
   that, and `close_session` **raised** instead of closing. The redundant
   condition is gone, and the regression test asserts the resulting
   *state* rather than merely that the close succeeded — "succeeded"
   alone does not catch a writer producing a valid-looking outcome.

   The generalisation: **demoting a gate is not a local change.** Other
   code keys on the same condition the gate enforced, and while the gate
   blocked, those siblings were unreachable and therefore untested. This
   is L-069-1 read backwards — not "fix every sibling of the bug" but
   "find every sibling of the *guarantee* you are removing."

3. **An illegal `verification_method` still cannot pass on an ordinary
   repo.** It falls through to the zero-budget arm and is refused there.
   The demotion bites only under `--manual-verify` and on a repo that has
   declared the zero-budget tier and written the same non-standard token
   into `budget.yaml`. That boundary is now asserted from both sides, so
   a future reader cannot mistake the demotion for a reopened incident.

## What round-1 verification found, and why it was fixed anyway

Session 3's discovery round returned **VERIFIED from both lenses with
zero Critical/Major** — a non-blocking round that opens no remediation
loop. It raised five nits, and all five were fixed, because three of them
were places where a document written *in this session* said something
false about the code beside it, and this set's entire subject is making
the doctrine true.

Two lenses converged independently on the two that mattered most:

- **"A docs-only session owes nothing" is false under `ai_router/`.**
  `covers` is a path prefix, not a file type, so editing
  `ai_router/docs/close-out.md` — which this session did — owes a pytest
  run. Narrowing `covers` to exempt docs folders was considered and
  rejected: it would make the gate skippable by putting code in a
  docs-named folder. The wording was corrected instead, and **both**
  sides of the boundary are now pinned by tests.
- **`--force` was never covered by "every close".** It runs
  `verification_integrity` alone and no other predicate. Correct, and
  older than this ruling; the documentation now says so.

Full per-nit dispositions: [`s3-nit-dispositions.md`](s3-nit-dispositions.md).

## What this set deliberately did NOT do

- **No test deletion.** The ruling deletes no gate, so no gate's tests go
  with it. This set delivers **zero** reduction in the ~3,800 tests —
  consistent with its own finding that test count is not where the time
  is.
- **No new gates.** A set about removing ceremony that added ceremony
  would have failed.
- **No test-selection tooling.** At ~4 minutes, `testmon`-style impact
  analysis buys little and risks shipping a regression.
- **No session-splitting.** The operator's constraint was explicit:
  shorter sessions, not more of them.
- **No claim about the 20-minute goal.** This set removes ~10 minutes of
  suite time per run and an unbounded loop. Whether a session then fits
  in 20 minutes is a separate question and should be re-measured, not
  assumed.

## Named residuals

- **Three adjudicated-minor findings from Session 2**, journaled rather
  than fixed: a backstop attempt that fails in transport is never
  ledgered (correct as designed — only a round producing a verdict
  consumes budget, and the attempt is still audited in
  `router-metrics.jsonl`); round *numbering* still comes from artifacts
  on disk rather than the ledger (pre-existing Set 111 S1 behaviour); and
  an unquoted set-dir interpolated into a copy-pasteable command, which
  is a pre-existing **class** across three sites — fixing only the new
  one would have left the class alive while reading as closed.
- **No close-time enforcement of the `verification_method` vocabulary**,
  per the attested ruling. Data hygiene, not a verification hole; see
  the boundary asserted above.
- **The `-n auto` default versus the operator's interim 8-worker cap.**
  On 2026-08-10 the operator capped parallelism at 8 pending a Set 117
  fix for an OS-resource bug. `pytest.ini` still declares `-n auto`;
  runs during this session used `-n 8` explicitly. **Set 117 should
  reconcile the declared default with whatever it fixes** — the two
  should not be left disagreeing.

## Where the canonical detail lives

| Topic | Canonical |
|---|---|
| Which checks block, which warn, and why | `ai_router/docs/close-out.md` → step 7; `gate_checks.ADVISORY_CHECKS` |
| The test-run policy and Step 8 ordering | [`docs/planning/session-set-authoring-guide.md`](../../planning/session-set-authoring-guide.md) → *The test-run policy* |
| The session happy path | [`docs/session-constitution.md`](../../session-constitution.md) |
| Measured suite timings and their evidence | [`CONTRIBUTING.md`](../../../CONTRIBUTING.md); `s1-*-parity-benchmark.txt` |
| The round budget and the backstop's place in it | `ai_router/close_backstop.py`; `docs/session-constitution.md` → *Recovery and escalation* |
| Every judgment call this set made | `decisions.jsonl` in this directory |
| The operator's per-gate ruling and its rationale | [`operator-notes.md`](operator-notes.md) |
| Release state of both packages | [`docs/repository-reference.md`](../../repository-reference.md) → *Current release status* |
