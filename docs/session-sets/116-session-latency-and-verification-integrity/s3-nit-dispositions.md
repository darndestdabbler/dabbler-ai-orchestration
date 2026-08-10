# Set 116 Session 3 — round-1 nit dispositions

Round 1 (discovery, 2-lens fan-out, `gpt-5-6-sol` both lenses, anthropic
excluded, $0.786) returned **VERIFIED from both lenses with zero
Critical/Major**. Under the constitution that is a non-blocking round and
opens no remediation loop.

Five distinct nits were raised across the two lenses. **All five were
fixed anyway**, for one reason: three of them are places where a
document I wrote this session states something *false* about the code it
describes, and this set's whole subject is making the doctrine true. Two
lenses converged independently on nits 1 and 2, which is the strongest
signal a fan-out produces.

Fixing after a stamped round stales the verification stamp, so the close
backstop will run one bounded round. That is Set 116 S2's machinery doing
exactly what it was built for, and it is the honest cost of the fixes.

---

## 1. "A docs-only session owes nothing" is false under `ai_router/`

**Raised by both lenses.** `pytest.covers = ("ai_router/",)`, so editing
`ai_router/docs/close-out.md` — which this very session did — owes a
pytest run. The claim appeared in `docs/session-constitution.md`, the
authoring guide, `run_of_record.py`'s module docstring, and the name of
the test I added.

**Fixed, and the fix is a clarification rather than a narrowing.**
`covers` is a **path prefix, not a file type**, and that is deliberate: a
prefix is cheap to evaluate, impossible to argue with at close, and errs
toward running a suite you did not need rather than skipping one you did.
Narrowing `covers` to exclude `**/docs/` was considered and rejected — it
would make the gate skippable by putting code in a docs-named folder.

Both sides are now pinned by tests:
`test_a_session_outside_every_covers_prefix_owes_nothing` and
`test_docs_UNDER_a_covers_prefix_do_owe_that_suite`.

## 2. "Every check runs and prints on every close" omits `--force`

**Raised by both lenses.** `close_session.run` under `--force`
constructs the `verification_integrity` row alone and runs no other
predicate. So a forced close prints no advisory warnings.

**Fixed as documentation.** The behaviour is correct and predates this
ruling — `--force` bypasses bookkeeping, never evidence, and is
hard-scoped to incident recovery. Running the advisories there purely to
print them would add a code path to a recovery flow for a cosmetic gain.
`gate_checks`'s module docstring, `close-out.md` and the CHANGELOG now
say "on an ordinary close" and name the exception.

## 3. The residual was stated more broadly than the code supports

**Raised by lens 2.** The `gate_checks` overview said "a corroborated
close (or an attested `--manual-verify` close) can now persist an illegal
token", while the same module's `check_verification_integrity` docstring
and `test_an_unknown_token_still_cannot_pass_the_integrity_gate` establish
that an unknown token cannot pass ordinary corroboration at all.

**Fixed in the code documentation. The decision journal is left as
written.** The exact exceptions are `--manual-verify` and a repo that has
declared the zero-budget tier with the same non-standard token in
`budget.yaml`.

The education-mode brief that preceded the operator's attestation used
the broader phrasing. That **overstates** the exposure rather than
understating it, so the attestation covers strictly more than the code
does and needs no revisiting — and `decisions.jsonl` is an append-only
record of what was actually said at the time, not a document to be
tidied afterwards.

## 4. Comments still describing advisory checks as enforcement

**Raised by lens 1.** `check_change_log_fresh` promised a "hard fail";
`_flip_state_to_closed` and the CHANGELOG called the demoted change-log
check an "enforcement point".

**Fixed.** The predicate's failing *verdict* is unchanged; what changed
is that it reaches the close as a warning. The wording now distinguishes
the two, which is the whole point of the demotion.

## 5. This session's own preliminary full suite run vs "exactly once"

**Raised by lens 1.** The policy said a full run happens "exactly once
per session", and `s3-conventions.md` records a full 3,848-test run
before verification plus another at Step 8.

**Fixed in the policy wording, because the policy was imprecise rather
than the session disobedient.** The rule bounds the **run of record**,
not curiosity: a mid-session full run is targeted testing with a wide net
and costs only its own wall clock. What must not happen is *recording* a
run that a later code change invalidates — the Set 110 S3 defect the
mechanism exists to catch. The authoring guide now says exactly that.
