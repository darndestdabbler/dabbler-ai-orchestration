# Change log — Set 128: session step skeleton and test ordering

**Set:** `128-session-step-skeleton-and-test-ordering` (3 sessions, all VERIFIED)
**Source of record:** [`docs/planning/session-step-skeleton-and-verification-cost.md`](../../planning/session-step-skeleton-and-verification-cost.md)
— now moved from *diagnosed, not fixed* to **fixed**, with A5 open and owned
by Set 129.

---

## What was wrong

The canonical order is **targeted tests → verify → remediate → full suites
→ close**. Set 116 S3 established it after Set 112 S3 obeyed the old
ordering into 15 runs and 186 minutes. Then Set 127 Session 2 did it again,
and the operator caught it mid-session: *"Why is cross-provider
verification happening after the full test run. I thought that we fixed
that. Only targeted runs before verification."*

The policy was never in doubt. **The shape a spec is allowed to declare its
steps in** is what let a retired ordering be re-encoded where nothing could
check it:

```
5. Full pytest and the Layer 3 run recorded as runs of record; verify; close.
```

Three canonical stages, one numbered step, wrong internal order — and an
orchestrator that followed the spec's letter over the policy that outranks
it. Cost when it fired: a 752-second pytest run and a 350-second Playwright
run, both taken before a verification round that returned a blocking
finding, so both were staled by the remediation that followed.

Session 1 of the same spec got it *right*. This was never a
misunderstanding of the policy; it was compression into a place prose lives
and parsers do not.

## The decomposition, and why B shipped before A

| component | what it is |
| :--- | :--- |
| **B — the composition** | which steps every session declares, and which are baked in |
| **A — the rules** | what runs when, relative to verification (A1–A4) |

**B first.** A is prose until there is a shape it cannot be compressed out
of. `spec_admission` already parsed every step text to enforce the *count*;
a **shape** check beside the **count** check was the cheapest possible home
for it. Set 127's own spec argued that an unenforced convention is the
thing this repo keeps replacing with a gate — and then shipped a session
plan that proved it.

## Session 1 — A spec cannot compress verification and the full suite into one step

**Two operator ratifications first**, journalled before anything was
implemented: the work-step budget `N = 3` (rejecting the operator's own
opening suggestion of 4 as a deliberate loosening rather than a re-count),
and the gating — **blocking for unstarted sets, an informational note
otherwise**, because those specs were authored under a different approach
at a different time and nothing about them is wrong.

`check_step_shape` landed in `ai_router/spec_admission.py`. It recognises
the four ceremony steps by **intent, not prose** — "Close out" must not
fail on a hyphen — asserts the positional tail, and reports a compression
finding when one tail step names more than one stage in either internal
order.

The falsifiers plant the malformation rather than reading the regex
(`L-112-1`): step 3 shipped **12 functions / 19 cases**, and
verification's four accepted fixes took the file to **20 functions** by
the session's close. FIRES on the Set 127 S2 step verbatim, the same
compression reversed, a tail out of order, a missing tail step, work
after close-out, a session that never registers. DOES NOT FIRE on a
conforming spec at the budget, a declared `sessionSizeException`, a tail
in non-canonical prose, or a work step that merely *describes* the
ceremony. A mutation probe gutting the check failed 12 of the 19 cases,
then was reverted byte-for-byte.

The budget was **re-baselined, not re-counted**:
`authoring.max_steps_per_session` went 5 → 7, derived as
`CEREMONY_STEPS + WORK_STEP_BUDGET` rather than typed. The authoring guide
carries the Set 111 S4 table with the re-reading beside it, so an author
compares **N to 3** and never 7 to 5.

Cross-provider verification (gpt-5.5) returned four blocking Majors across
three rounds — among them a `FULL_SUITE` recogniser that missed *"full
suites"* and *"all tests"*, and a `resolve_set_status` that bypassed
`progress.canonicalize_status`, so a `completed` alias would have demanded
restructuring of a **finished** set.

## Session 2 — The rules the shape protects

A1–A3 went into `docs/session-constitution.md` and the authoring guide.
A2 is the load-bearing one and it is **stricter than the old text**: no
full suite before **any** cross-verification stage, with the path-aware
critique named as such a stage rather than sitting inside close beside the
suite. A3 keeps a targeted spec at any layer legitimate — including Layer 3
before a UAT walk — and puts *"required portion"* on `covers`.

**A4 was contradicted by the machinery, not merely unwritten.** This is the
finding that reshaped the session. The operator ruled that a post-suite fix
to **tests only** owes no re-verification (A4.1) and one to **shipped
code** owes a targeted remediation-review, not an open one (A4.2). But any
post-verification edit moved `work_diff_sha256`, so a one-line test fix
staled the stamped row and `close_session`'s backstop bought a full metered
round. Writing A4 as prose would have shipped a rule the code actively
defeated.

That was surfaced as an education-mode brief before any implementation. The
operator was inclined to exclude test paths from the work-diff digest,
asked for the risks, and switched on reading them — time-blindness,
invisible test **deletion**, denylist fail-open, no audit trail, and A4.2
left unmechanized.

What shipped instead: `ai_router/post_round_delta.py`, which classifies the
delta since the recorded round as `no-change` / `test-only` /
`shipped-code` / `unknown`, with `unknown` owing a review exactly as
shipped code does. **Neither half of the question is invented** — "what
changed" is a tree-to-tree diff under the freshness exclusions, and "what
is a test" is `run_of_record`'s new per-suite `tests` allowlist beside
`covers` (`test-fixtures/` and `scripts/` are deliberately *not* test
surfaces, because they stage what Layer 3 asserts).

Verification found four Majors across five rounds. Round 1's two lenses
independently found that A4.2 was only *reported*, not implemented — the
verifiers were right and the scope-back reasoning was wrong. Round 2, run
**before** remediating, found the more valuable one: `classify_delta`
reused `work_diff_binding_paths`, which unions all currently-untracked
files, so an unchanged untracked file captured in the anchor tree was
re-reported as a post-round change — denying A4.1 to precisely the sessions
that create a new file. Rounds 3 and 4 were the same **class** twice: the
backstop mirrored the CLI's remediation-review phase piece by piece. At the
bound the operator authorized one round for the class fix rather than the
instance, and `build_phase_round_inputs` now assembles the phase once for
both callers, with a structural assertion that fails on any second
spelling.

**The set dogfooded its own rule live.** The full pytest run returned one
failure, caused by the class fix legitimately moving a constant. The fix
was test-only, and `post_round_delta` classified it as exactly that — A4.1,
owes no re-verification — on the session that shipped the rule. A4.1
exempts re-verification, not suite freshness, so pytest was re-run in full.

## Session 3 — The unstarted corpus, re-authored under the new rules

Session 1's check is **blocking for unstarted sets**, and four were
unstarted and non-conforming — 113, 118, 121 and 122, fourteen sessions
between them. The operator widened this session to cover all four rather
than adding a restructuring session to each set, on the decisive point that
**adding a session is itself a spec edit, and the restructuring is the same
edit, strictly smaller**.

**Set 118 was re-authored substantively.** Its measurements were **re-read,
not restated** — and the counters were validated first by reproducing the
2026-08-10 row exactly at that commit, so the columns are comparable:

| metric | 2026-08-10 | 2026-08-13 |
| :--- | ---: | ---: |
| test functions | 3,345 | 3,513 |
| test LOC | 60,188 | 67,182 |
| test / production ratio | 0.97 | 0.99 |
| collected | ~3,829 | 4,171 |

Two of 118's three findings strengthened; **one did not reproduce**. Under
the detector 118 names in prose the coupling figure is 43 files / 1,294
tests at its own commit, not the stated 47 / 1,485; relaxing one clause
gives 48 / 1,497. The stated number sits *between* two readings of the same
sentence, so it was always detector-dependent and the detector was never
written down. 118's Step 4 now chases a **named discrepancy** instead of
hoping for a match.

**The A4.1 collision.** `run_of_record.classify_changed_paths` decides "is
this a test" by path alone: it does not distinguish an edited test from a
**deleted** one. So a test file deleted after the full suite classifies as
`test-only` and `post_round_delta` reports that nothing is owed — while
118's own Session 2 rules, under the constitution's hard carve-out, that
retiring a test **is a verification reduction**. Both statements are
correct in their own frame, and together they describe a hole exactly the
shape of 118's deliverable. 118 now carries a hard ordering constraint **in
its attested record**: the retirement pass lands before verification, never
after the full suite, and one discovered late is deferred rather than
slipped in.

This is a constraint on 118, not a defect against 128 — A4.1 is sound for
the case it was written for, and 118 is simply the first set whose
*product* is deletion.

**113, 121 and 122 took the mechanical edit**, and the spec's prediction
was re-measured rather than trusted. Thirteen of fourteen sessions landed
at exactly 7 steps / `N = 3`. **One did not:** 121 Session 2 genuinely
carries four work steps, because its step 5 derives the *parameters*
(`N` and the cap) that steps 3 and 4's *rules* consume, the sequencing note
flags both as proposed-not-measured, and it owns its own progress key.
Folding it would have buried a named deliverable in prose — the exact
failure mode this set exists to prevent — so it declares a
`sessionSizeException` with its reason, and the set's own claim that "no
exception is owed anywhere" is corrected rather than defended.

**The dogfood:** `spec_admission --all --check` now reports **0 unstarted
specs requiring restructuring**, across four specs this set did not author.

## What changed, in one list

- `ai_router/spec_admission.py` — the step-shape check beside the count check
- `ai_router/post_round_delta.py` — the A4 delta classifier
- `ai_router/run_of_record.py` — per-suite `tests` allowlist, path classification
- `ai_router/verify_session.py` — `worktreeTreeAtCompletion` on every round; `build_phase_round_inputs`
- `ai_router/verification_stamp.py`, `ai_router/close_backstop.py` — the A4.1 exemption and its ledger row
- `ai_router/router-config.yaml` — `max_steps_per_session` 5 → 7, derived
- `docs/session-constitution.md` — A1–A4 in Steps 5 and 8
- `docs/planning/session-set-authoring-guide.md` — the step skeleton, the re-baselined cap, the A1–A4 policy
- `docs/guidance-lifecycle.md` — the standing ceiling authorization and its three conditions
- `docs/session-sets/{113,118,121,122}/spec.md` — restructured; 118 re-authored
- `docs/planning/session-step-skeleton-and-verification-cost.md` — retired to *fixed*

## What is still owed

- **A5 — how "the required portion" resolves per module.** Out of scope
  here by design. Owner: **Set 129**, scheduled by the operator during
  Session 2.
- **The standing guidance-ceiling authorization of 2026-08-12 is ACTIVE
  and must be retired.** Owner: Set 121 Session 4, Step 3, where it is
  written as an explicit obligation. An accommodation nobody retires is
  how a temporary one becomes the norm.
- **The A4.2 delta-scoped backstop round has never fired in production.**
  Covered by four falsifiers and a structural assertion, but every one
  exercises it through the harness rather than a live close.
