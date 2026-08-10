# Set 116 S3 — remediation, round 2 (close-backstop finding)

The close backstop ran round 2 in-process at close time (verifier
`gpt-5-6-sol`, anthropic excluded, $0.4668) and returned **ISSUES_FOUND
with one Major**. It blocked the close, which is Session 2's own
machinery working: the stamp was stale because this session fixed
round-1 nits after the stamped round, so the backstop bought exactly one
bounded round rather than letting the close through unverified.

## The finding

> The implementation weakens "one applicable full run" into "one
> designated run of record," explicitly permitting unlimited earlier
> full-suite runs.
>
> **Acceptance (judgment):** The canonical workflow must distinguish
> targeted subsets from full-suite runs, require all expected
> code-changing verification and path-aware critique remediation before
> the single applicable full run, and must not relabel an earlier
> full-suite execution as "targeted testing with a wide net."

## Verdict: accepted in full. The finding is correct and its evidence is
## this session.

`test-runs.jsonl` shows Session 3 recorded **two** full pytest runs, and
`s3-conventions.md` records a **third**, preliminary one. Three full
suites in a set whose entire purpose is to stop that.

Worse, the wording it objects to was **introduced by this session, in
response to round 1**. Round 1's lens 1 offered two remedies — *"treat
pre-verification runs as targeted, **or** describe the policy as 'one
final full run after remediation'"* — and I took the first, which
relabels the behaviour instead of ending it. The backstop caught the
weaker branch. Two verifiers looking at the same policy from opposite
ends produced a better answer than either alone, which is the argument
for the phased loop existing at all.

## What changed

**1. The relabel is gone.** `session-set-authoring-guide.md` no longer
says a mid-loop full run is "targeted testing with a wide net". It says
the opposite, and names this session as the cautionary example:

> **A full suite run during the loop is not "targeted testing with a
> wide net."** … If you want a signal mid-loop, run the tests that cover
> what you changed — that is what *targeted* means, and it is seconds,
> not minutes. The rule bounds the runs, not merely which one is
> recorded.

`session-constitution.md` Step 5 now says **"Do not run a full suite
here — not even 'just to see'"**, rather than merely locating the full
run elsewhere.

**2. The path-aware critique is named as a code-changing stage.** This
is the half the finding surfaced that I had genuinely missed, and it is
the direct cause of the second recorded run: Step 8's pytest ran, *then*
the critique ran, *then* critique remediation changed code, so the run of
record was stale and had to be repeated. Both docs now state the order
for an armed set explicitly:

> verify → remediate → critique → remediate → **full run** → close

with the reason attached: *"the full run goes last because 'last' means
last, not 'last among the stages you happened to think of."*

**3. The constitution stayed under its ceiling by removing prose.** The
edit pushed it 11 tokens over 4,000. Ceilings ratchet down only, so
rather than ask for a raise, Step 8 was compressed and Step 9's
now-duplicated pointer to the critique stage was deleted — it had become
redundant the moment Step 8 named the critique itself. 4,011 → 3,954.

## What did *not* change, and why

**No suite was re-run.** Every edit above is under `docs/`, and `covers`
is a path prefix: `pytest` covers `ai_router/`, `playwright` covers the
extension surfaces plus three named router files. `docs/` is under
neither, so both runs of record remain digest-fresh —
`run_of_record check --check` exits 0 with `[ok] pytest` and `[ok]
playwright` against this tree. Re-running 5 and 12 minutes of tests to
"cover" a documentation edit is precisely the reflex this set exists to
correct, and doing it here would have refuted the change by example.

**The three runs this session already paid for are left on the record.**
`test-runs.jsonl` is append-only and `s3-conventions.md` is a raw
artifact. The honest history of "the policy was learned by violating it"
is more useful than a tidied one, and the finding's evidence should
remain checkable.
