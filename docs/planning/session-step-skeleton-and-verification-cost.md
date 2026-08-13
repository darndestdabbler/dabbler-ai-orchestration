# Test/verification ordering, and the composition of a session's steps

> **Raised by the operator, 2026-08-12**, during Set 127 Session 2, after
> that session ran the **full** pytest and Playwright suites *before*
> cross-provider verification: *"Why is cross-provider verification
> happening after the full test run. I thought that we fixed that. Only
> targeted runs before verification."*
>
> **Status: FIXED.** Closed by **Set 128** across three sessions —
> Session 1 shipped Component B (the step skeleton and the
> `spec_admission` shape check, with the budget re-baselined to
> `N = 3`), Session 2 shipped Component A (A1–A3 in
> `docs/session-constitution.md` and the authoring guide, and A4
> journalled under the verification-reduction carve-out and mechanized
> as `ai_router/post_round_delta.py`), and Session 3 re-authored the
> four unstarted specs (113, 118, 121, 122) so none is executed under
> the assumptions this note describes. **A5 remains open and is owned
> by Set 129** — see that heading below.
>
> This note is kept as the diagnosis record. Every "open question" and
> "recommendation" below carries an inline **RESOLVED** marker naming
> what settled it; the surrounding text is preserved as written on
> 2026-08-12 and is **not** a description of current behaviour. Read
> the constitution and the authoring guide for that (`L-064-8`).

The proposal has **two components**, and they are separable:

- **Component A — the rules:** what runs when, relative to verification.
- **Component B — the composition:** which steps every session declares,
  and which of them are baked in.

A is policy that already half-exists and was violated. B is the shape
that makes A checkable instead of remembered.

## What happened

The canonical order is **targeted tests → verify → remediate → full
suites → close** (`docs/session-constitution.md`, Steps 5/6/8). Set 116
S3 established it after Set 112 S3 obeyed the old ordering into 15 runs
and 186 minutes.

Set 127's Session 2 plan compressed three canonical stages into one
numbered step, in the wrong internal order:

```
5. Full pytest and the Layer 3 run recorded as runs of record; verify; close.
```

Session 1 of the same spec got it right — *"Targeted pytest for the
changed modules; verify; close"* — so this is not a misunderstanding of
the policy. It is a spec that **re-encoded** the retired ordering in
prose, and an orchestrator that followed the spec's letter over the
policy that outranks it.

Cost when it fired: a 752-second pytest run and a 350-second Playwright
run, both taken before a verification round that returned a blocking
finding — so both were staled by the remediation that followed.

## Why prose could not stop it

The failure is **compression**, not ignorance. Three stages inside one
step have their ordering stated in a sentence, where nothing can check
it. `ai_router/spec_admission.py` already parses every session's step
texts — it enforces the **count**
(`authoring.max_steps_per_session`, **5 when this note was written; 7
since Set 128 S1**) and seeds those same
texts as the plan rows the checklist renders. It does not look at their
**shape**.

---

# Component A — the rules: what runs when

### A1. Before verification: targeted runs only

Run the tests covering what changed, log the result, and stop there.
This half already exists (constitution Step 5) and is not in dispute.

### A2. No full suite before *any* cross-verification — including the path-aware critique

Operator ruling, 2026-08-12: *"the full test suite should never be run
before any cross-verification, including the path-aware critique. That
is quite wasteful and probably accounting for untold extra minutes of
processing."*

This is stricter than today's constitution, which places the path-aware
critique inside Step 8 (close) *before* the suite runs but treats the two
as one stage. Making it explicit means: **every** cross-provider stage —
session verification and the path-aware critique — completes before any
full suite starts, because both are code-changing and either one staling
a suite run costs the same wasted minutes.

### A3. Only *full* suites are pinned, and only the required portion

A targeted Layer 3 spec before a UAT walk is legitimate and should stay
legitimate. Set 127 S2 did that part right — it ran the single rendering
spec early — and then ran the *whole* Playwright suite before
verification, which is the part that was wrong. The rule has to name
"full", or it will forbid the useful case and permit the wasteful one.

"Required portion" carries the second half: `covers` is by path, and
`run_of_record check` will report *"session touched none of this suite's
surfaces"*. Not every session owes every suite, and a step that
overstates its own obligation is a step that gets improvised around.

### A4. When a post-suite fix re-opens verification, and when it does not

> **This reduces verification. It is in the constitution's hard
> carve-out and is never self-authorizable; `decision_journal` will
> refuse to write it without an operator attestation.** The operator
> gave that ruling on 2026-08-12 and it is recorded verbatim below, but
> it still needs journalling inside the owning set.

> **RESOLVED — Set 128 Session 2.** Journalled with the operator
> attestation in that set's `decisions.jsonl`, written into the
> constitution and the authoring guide, and **mechanized**:
> `ai_router/post_round_delta.py` classifies the delta since the
> session's recorded round as `no-change` / `test-only` / `shipped-code`
> / `unknown`, and the close backstop consults it. The session also
> found that the machinery *contradicted* A4.1 before the fix — any
> post-verification edit moved `work_diff_sha256`, so a one-line test
> fix staled the stamped row and bought a full metered round.

**Operator ruling, 2026-08-12:**

- **A4.1 — a post-suite fix to one or more tests only (and not to code)
  does not trigger any re-verification.**
- **A4.2 — a post-suite fix to code triggers targeted/focused
  remediation-review only, not an open re-verification.**

**This supersedes the earlier "less than two lines" formulation.** The
rule is now keyed on **what changed**, not on how large the change is —
which is both more defensible and mechanically decidable:

- A4.1 is settled by `git diff --name-only`. A fix to a test changes
  nothing that ships, so there is nothing for a verifier to re-examine.
- A4.2 maps onto machinery that already exists: `verify_session --phase
  remediation-review` reviews *only* the fix hunks against the recorded
  discovery baseline, with new defects admissible only inside those
  hunks. The choice was never "full round or nothing" — the cheap tier
  is already built.

**Why the line-count criterion was dropped.** Set 127 S2 planted eight
defects against its finished suite to prove its falsifiers bite. **Six
were two lines or fewer** — `if (false)`,
`const status = row.status`, one inverted ternary — and every one was a
real correctness bug that changed shipped behaviour. A two-line edit is
precisely the size that inverts a predicate; the Major finding that
session's own verification returned is itself a ~2-line fix. Size does
not track blast radius, and a rule keyed on size would have waved
through exactly the class of change that breaks things.

**A2 makes A4 necessary, not merely economical.** Under the old ordering
a suite failure was fixed *before* verification, so the verifier saw the
fix. Pushing every full suite after every cross-verification stage means
a late suite failure strands a stale verdict **by construction**. A
reviewer who reads A4 alone will read it as cost-cutting; it is the
other half of A2.

### A5. Open — how "the required portion" resolves per module

> **OWNED — Set 129**, assigned by the operator on 2026-08-12 during Set
> 128 Session 2, from an operator-supplied proposal reviewed
> independently by `gpt-5.6-sol` and `gemini-3.1-pro`. Both converged:
> adopt the suite-owned *input set* abstraction (which `covers` already
> nearly is), reject the contract / mock / lock apparatus as premature
> for a framework whose consumer repos have not demonstrated that
> architecture, and reject the claim that skipping an unaffected suite
> is *"provably redundant"* rather than a risk trade-off — real pytest /
> Electron / Playwright suites are not pure functions of their declared
> inputs, and `covers` is a path prefix, not a dependency graph. **Set
> 128 deliberately did not answer A5**, and Set 118 is instructed not to
> answer it in passing either.

**Unanswered today, and not owned by any set.** `run_of_record`'s
`covers` is a flat list of paths (`ai_router/`,
`tools/dabbler-ai-orchestration/src/`, …). In a repo with a declared
module tier (`docs/modules.yaml`; Sets 087, 093, 100), a session belongs
to a module, and "the required portion of the full test suite" ought to
resolve to *that module's* surfaces rather than to a repo-global path
list. Questions the owning set has to answer:

1. Does a module declare its own `covers`, or is the path list still the
   only mapping and modules merely group sets for display?
2. When a session in module X touches a shared surface, does it owe
   module X's suites, the shared suite, or both?
3. Does A4.2's "targeted/focused remediation-review" scope to the
   module, or to the diff regardless of module?

Until this is answered, the baked-in step in Component B means the
repo-global `covers` answer, which is today's behaviour and is correct
for this repo (one module in practice). It is a consumer-repo problem
first.

---

# Component B — the composition: which steps are baked in

Every session declares its steps in this shape:

| position | step | baked in? |
| :--- | :--- | :--- |
| 1 | **Register** | yes |
| 2 … N+1 | the session's actual work | no — authored per session |
| −3 | **Cross-provider verification** (session verification, plus the path-aware critique when armed) | yes |
| −2 | **Required portion of the full test suite** | yes |
| −1 | **Close-out** | yes |

Four baked-in steps, `N` authored ones.

### On the wording of the baked-in steps

**"Required portion of the full test suite"** was chosen over a more
precise label such as *"record the runs of record this session owes"*.
Per the operator: *"`full (test) suite` is often used by AI engines"* —
the legible phrase is what an engine pattern-matches on, and A4 is
carried by the word *required* rather than by re-naming the step into
something no one recognises.

### The work-step budget needs re-baselining, not just re-counting

The cap is **5 top-level steps** (Set 111 S4, measured across 172
schema-v4 sessions):

| declared steps | n | median | p90 | ran > 2 h |
| :--- | ---: | ---: | ---: | ---: |
| 1–5 | 106 | **42 min** | 110 min | 10% |
| 6–8 | 64 | **84 min** | 386 min | 28% |

That measurement was taken on specs whose 5 steps **already absorbed the
ceremony**. Set 127 S1 spent 3 of its 6 steps on register / verify /
close, so historical "5 declared" meant roughly **3–4 real work steps**.

Under Component B, `4 + N` declared steps contain only `N` work steps, so
the old bands do not transfer. The operator's opening suggestion was
`N = 4` (8 declared). **`N = 3` is the value that holds the measured
42-minute median**; 4 is defensible but is a deliberate loosening and
should be recorded as one rather than arriving as an artifact of
re-counting. `sessionSizeException` already exists for genuine overruns.
**Unresolved — the operator skipped the question.**

> **RESOLVED — Set 128 Session 1.** The operator ratified **`N = 3`**
> on 2026-08-12, explicitly rejecting their own opening suggestion of
> `N = 4` as a deliberate loosening rather than an artifact of
> re-counting. `authoring.max_steps_per_session` is now **7**
> (`CEREMONY_STEPS + WORK_STEP_BUDGET`, derived rather than typed), and
> the authoring guide carries the table above with the re-reading
> beside it so an author compares **N to 3**, never 7 to 5.
>
> Re-measured by Set 128 Session 3 on 2026-08-13 across the fourteen
> unstarted sessions it restructured: thirteen landed at exactly 7
> steps / `N = 3` with no exception owed, and **one** — Set 121 Session
> 2 — genuinely carried four work steps and declared a
> `sessionSizeException` with its reason.

### Enforcement belongs in the parser, not in prose

`spec_admission` already enforces the count; a **shape** check goes
beside it. A convention this repo has to remember is the thing it keeps
replacing with a gate — Set 127's own spec used that argument to reject
two of its three options, and then shipped a session plan that needed
exactly such a gate.

Open question for the owning set: whether the shape check **refuses** or
**warns** for existing specs, none of which conform. Advisory-first, or
new-sets-only, are both reasonable; silently grandfathering everything is
not, because that is how the check ends up proving nothing.

> **RESOLVED — Set 128 Session 1**, operator ratification of
> 2026-08-12. The shape verdict is **blocking ("requires
> restructuring") for a set that has not started** — where the fix is a
> text edit and no session has run — and an **informational note** for
> a set already started, complete, or cancelled. The note is explicitly
> *not* a warning: those specs were authored under a different approach
> at a different time and nothing about them is wrong. "Not started" is
> read from the set's `session-state.json`, the same file the repo
> already treats as the source of truth for set progress.
>
> Note the count check is unchanged and still reports historical
> sessions over the old cap; as of 2026-08-13 that is 49 sessions
> across started/complete sets, which is expected and out of scope. No
> CI job gates on `spec_admission --all --check`.

---

## Relationship to Set 118 (test retirement and coupling budget)

**Set 118 does not handle modules.** Grepping its spec for
`module|covers|targeted|remediation-review|full suite` returns one hit,
and it is *"the production modules it imports"* — the Python sense, not
the `docs/modules.yaml` tier. So A5 above is not answered there, and no
existing set owns it.

**But 118 overlaps Component A materially, and it is `not-started`, so it
can still be revised.** Its own purpose paragraph cites the ordering this
proposal tightens:

> *"Set 116 complete. Its Session 3 moves the full-suite run to Step 8
> and fixes what 'a fresh test run' means; this set changes which tests
> exist and must not race that."*

118 changes **which tests exist** and introduces a **coupling budget** —
both of which land directly on A1 (what "targeted" covers), A3 (what
"the required portion" means once tests are retired) and A4.2 (what a
focused remediation-review scopes to). Authoring 118 against the current
rules and this set against the new ones would produce two specs
legislating the same surface from different assumptions.

**Recommendation, per the operator's suggestion: fold the 118 revision
into this new set as its own session**, rather than letting 118 start
first and then be amended mid-flight. 118's sessions are all
`not-started`, so this is a spec edit, not a retrofit — the cheapest it
will ever be.

> **RESOLVED — Set 128 Session 3, and widened.** 118 was re-authored on
> 2026-08-13: all three sessions restructured to the skeleton, its
> measurements re-read rather than restated (the coupling figure did
> **not** reproduce and the spec now says so), and its retirement rule
> restated in terms of A1 and A3. The session also found a real
> collision with A4.1 — `run_of_record.classify_changed_paths` decides
> "is this a test" by path alone and cannot distinguish an edited test
> from a **deleted** one, so a post-suite retirement would classify as
> `test-only` and owe no re-verification, while retiring a test is by
> 118's own ruling a verification reduction. 118 now carries a hard
> ordering constraint in its attested record: the retirement pass lands
> **before** verification, never after the full suite.
>
> The operator widened the session on 2026-08-12 to cover **all four**
> unstarted specs — 113, 118, 121 and 122 — because Session 1's check
> is blocking for unstarted sets and 122 was next in the queue. 113,
> 121 and 122 took the mechanical restructuring only.

## Suggested shape for whoever owns this

One set, three sessions:

1. **Component B** — the skeleton, the `spec_admission` shape check, the
   re-baselined budget, and the retrofit decision.
2. **Component A** — the ordering rules (A1–A3) written into the
   constitution and the authoring guide, plus A4.1 / A4.2 journalled
   under the verification-reduction carve-out with the operator's
   attestation, keyed on the diff rather than on line count, shipped
   with falsifiers. A5 (modules) is either answered here or explicitly
   deferred with a named owner — not left silent.
3. **Set 118's revision** — re-author `118-test-retirement-and-coupling-budget`'s
   spec so its retirement rule and coupling budget are stated in terms of
   the new ordering and the new step composition.

B before A is deliberate: once the steps are fixed and checkable, A has
somewhere to live that an author cannot compress. 118 comes last because
it consumes both.

It should **not** be bolted onto Set 127 Session 3, which is already
scoped to the checklist-post gate. Compressing an unrelated change into a
session that already has one is the same mistake this note is about.

## Related work

- `docs/session-constitution.md` — Steps 5/6/8, the canonical ordering.
- `docs/planning/session-set-authoring-guide.md` — the session-size cap
  (Set 111 S4) and the test-run / run-of-record policy.
- `ai_router/spec_admission.py` — parses step texts; enforces the count
  today, and is where a shape check belongs.
- `ai_router/run_of_record.py` — `covers`-by-path and the surface
  digests a diff-keyed A5 would reuse.
- `ai_router/verify_session.py` — `--phase remediation-review`, the
  existing cheap re-verification tier.
- Set 112 S3 / Set 116 S3 — the 15-run, 186-minute incident that
  established the ordering this note is protecting.
