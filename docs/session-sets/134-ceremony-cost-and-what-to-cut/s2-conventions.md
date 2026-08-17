# Session 2 verification — up-front conventions

Read this before the evidence. It states the baseline, the by-design
exclusions, and the severity rubric, so Round 1 spends its findings on real
defects rather than on the agreed baseline (project-guidance G-010).

## What this session is

**A measurement session with a small, surgical code change.** Deliverables:

1. `s2-severity-discrimination.md` — the measurement.
2. A closed severity vocabulary enforced at the writer, in **existing modules
   only** (`verification.py`, `verify_session.py`, `pull_verifier.py`,
   `prompt-templates/task-prompts.md`, `docs/session-issues-schema.md`) plus
   one new test module.
3. One `decisions.jsonl` record for the (a)/(b)/(c) call.

## Suite baseline

**906 tests green, 3 skipped**, across the 12 suites covering every changed
module, run after the last code change:

```
test_severity_vocabulary  test_blocking_classifier   test_verify_session
test_verify_session_phases  test_session_issues_schema  test_pull_verifier
test_doc_only_cap  test_verification_only_app  test_close_backstop
test_acceptance_harness  test_post_round_delta  test_qualified_verdict
```

**Known repo baseline, unrelated to this diff:** `mocha` carries one
pre-existing failure tracked since Set 133 S1 — `fileSystem.test.ts` *"a
symlinked artifact is digested, exactly as the Python writer does"* (Set 114
S3). It only executes on a Windows shell privileged enough to create a
symlink. Named residual with an owner; not this session's.

## By-design exclusions — do not report these as findings

1. **No new module, by set rule.** The spec's standing rule is *"No new
   module. Every deliverable is a measurement document, a deletion, a
   parameter change, or an edit to an existing file."* The severity vocabulary
   therefore lives in `ai_router/verification.py`, beside the
   `BLOCKING_SEVERITIES` it serves, rather than in a `severity.py` of its own.
   A finding that it *should* have been its own module is contrary to the
   spec. (A **test** module is not a governor and is not covered by the rule.)
2. **The measurement instruments are deliberately not in the diff.** Seven
   read-only instruments were written and run from the session workspace,
   never in the repo — same as Session 1, same reason. Their inputs are all
   committed artifacts.
3. **`_parse_issue_blocks` is deliberately left tolerant**, and so is
   `docs/session-issues.schema.json` (`severity: {"type": "string"}`). This is
   the *reader-lenient* half of the pattern and it is load-bearing: 28
   non-canonical values are already committed, and enum-constraining the
   schema would make the repo's own history invalid. Both are documented as
   deliberate in `docs/session-issues-schema.md`. A finding that the schema
   "should" carry the enum is answered there — but if you think that answer is
   *wrong*, say so, that is a real disagreement worth having.
4. **`pathAwareCritique` is deliberately absent** from the spec (default
   `none`), and the spec explains why: buying an optional multi-provider stage
   in a set about reducing ceremony would be self-refuting.
5. **`requiresUAT: false` / `requiresE2E: false`** are set-level and
   permanent. No rendering surface is touched.

## The severity rubric this round should apply

Grade by **consequence**: probability the stated failure scenario reaches a
real user × impact (project-guidance G-013). Low probability **or** low impact
is **Minor**. No nameable failure scenario is a nit, not a Major.

> **A note this session has earned the right to make.** Session 2's finding is
> that the severity field has carried one blocking value for 281 consecutive
> findings and has changed the course of one round in 413. If your review
> genuinely contains only Minor observations, **say Minor**. Round 1 of
> Session 1 was told the same thing and returned a real Major, which was
> accepted without argument — so this is not a request to go easy. It is a
> request not to make this document's own point for it by reflex.

## Where scrutiny is genuinely wanted

1. **Is the (b) call right, or is (c) the honest answer?** The document
   concedes that the findings are material (56–60% `fix-accepted` at every
   round depth) and still concludes the *gate* is a no-op. Is that distinction
   sound, or is it a rhetorical move that lets the session claim a finding
   while conceding the substance?
2. **Is the writer refusal safe *now*?** Round 1 found that it was not: the
   first draft raised, and a raise mid-round left a paid blocking finding in a
   raw-only, unledgered round the next invocation skipped. The writer now
   refuses the **token, not the round** — `canonical_severity_for_write`
   returns a canonical spelling or `None` (omit), the envelope is always
   written, and the transform is claimed to be **exactly blocking-preserving**.
   **If there is any token whose blocking decision changes across that
   transform, that is a Critical.** Check the equivalence directly, not the
   prose asserting it.
3. **Is removing `"severity": "unknown"` truly behaviour-preserving?** The
   claim is that an absent key and `"unknown"` block identically through
   `is_blocking_issue` / `classify_blocking` / the doc-only cap / the
   acceptance harness. Look for a fourth reader that distinguishes them.
4. **Is the pull-surface fix complete?** Round 1's second Major was that the
   `submit_verdict` enum is a declaration, not an enforcement, and
   `_parse_verdict` copied any string through to disk. It now canonicalizes.
   Is there a third producer path onto `path-aware-critique.json` that still
   bypasses it?
5. **Is the "all 28 are historical" claim honest?** The document argues the
   drift is a closed episode (2026-07-02 → 07-10) and that the fix is a guard,
   not a repair. A reduction-minded set arguing that its own deliverable is
   preventive should be checked for motivated reasoning in either direction.
6. **Are the measurements reproducible from committed artifacts?** Session 1's
   round-1 Major was that operative conclusions rested on a **gitignored**
   file. This session deliberately reads none. If any number here traces to
   uncommitted state, that is a Major and repeats a settled lesson.
7. **Is the authority boundary drawn correctly?** The session names (b) but
   changes no gate, on the grounds that any gate change could make the loop
   stop earlier and is therefore operator-owned. If that boundary is drawn
   wrongly in either direction — self-authorizing a reduction, or refusing
   something plainly within orchestrator authority — it is a **Major**.

## Numbers you can check against the artifacts

Every figure derives from committed files: 415 `sN-issues*.json` envelopes
(771 findings), 70 `sN-rounds.jsonl` ledgers (249 `round-completed` rows), 108
`sN-acceptance-round-*.json` files (225 results), and `git log -S` for the
dating of Set 071 S1 (2026-06-18) and Set 096 S1 (2026-07-12). The blocking
figures come from **running** `ai_router.verification`'s own predicates over
the corpus, not from re-implementing them.
