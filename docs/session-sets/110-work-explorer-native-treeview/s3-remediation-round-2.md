# Session 3 — the close backstop's Major, and why it was right

> **Round 4 was the close backstop's own in-process verification**
> (`gpt-5-6-sol`, anthropic excluded, $0.9959, diff base `325b658d`). It
> returned **ISSUES_FOUND** with one blocking Major and refused the close.
>
> Accepted in full. Not disputed, not adjudicated around.

---

## The finding

> **The final tree has no successful full Layer 3 run.** *Severity: Major.
> Category: Completeness.*

**Correct on the facts.** The full run of record was **32 passed / 1 failed**.
The one failure — `vsix-first-run-walkthrough` — was fixed afterwards and
re-run *targeted*. So at the moment of the first close attempt, no full suite
had ever passed against the tree being closed, while this session's Ends-with
says in the spec's own words: *"Layer 3 is green on the new view."*

**`s3-remediation-round-1.md` had already disclosed exactly this** and argued
that the operator's 2026-08-05 test-run policy justified it, since no product
code changed and re-running a 23-minute suite to re-confirm four specs just
run green is the waste that policy exists to prevent.

**The disclosure was honest and the decision was wrong.** The policy has two
halves:

- *never start a full expensive run you might invalidate*, and
- *run it once, at session close, **AFTER the last code change***.

This session used the first half to excuse skipping an obligation the second
half creates. The last change was the three test fixes; the full run belonged
after them. The policy's own non-negotiable clause names S3 specifically:
*"any session that touches the Explorer rendering surface runs the full
Layer 3 at its own close."* That clause does not have a targeted-run escape.

Recorded rather than rationalised: **an honest disclosure is not a substitute
for doing the thing.** Round 1's argument is left standing in its own sidecar
instead of being edited out, because getting it wrong is the more useful
artifact than looking as though it never happened.

## The fix

Ran the full Layer 3 suite against the final tree. No code changed to make it
pass; the run is the remediation.

### Acceptance check — the full suite, on the tree being closed

**Against the pre-fix state — FAILS:**

```
$ npx playwright test --reporter=list       # the run of record
  x  27 src\test\playwright\vsix-first-run-walkthrough.spec.ts:132:5 › REAL first-run walkthrough...
  1 failed
  32 passed (22.7m)
```

**Against the fixed state — PASSES:**

```
$ npm run compile && npx tsc --outDir out && npx playwright test --reporter=list
  33 passed (18.1m)
```

Thirty-three tests, zero failures, zero skips — including both halves of the
seeded click-swallow falsifier, the retargeted native-tree startup baseline,
and the real first-run walkthrough with its live venv and `pip install`.

## A framework gap found on the way, reported not fixed

`close_session` **crashed with an unhandled traceback** on its first
invocation:

```
ai_router.verify_session.EvidenceTooLargeError:
  assembled evidence is 627074 chars, over the 614400-char cap
```

`close_backstop.run_close_backstop` wraps `assemble_evidence` in
`except _vs.VerifySessionError`, but `EvidenceTooLargeError` does **not**
inherit from it. A guard whose whole purpose is to fail closed *gracefully*
instead takes the close gate down with a stack trace and no remediation line,
on a session whose only sin is a large diff. Every other backstop failure
path returns a `BackstopOutcome` carrying an operator-facing `remediation`
string; this one returns nothing.

**Not fixed here.** `ai_router` verification machinery is outside this set's
scope by the spec's own non-goals, and the operator's 2026-08-05 note is
explicit that changing the harness mid-set taints the set's own verification
record. The fix is one line — make `EvidenceTooLargeError` inherit
`VerifySessionError`, or catch it alongside — plus a remediation string
naming the env override the CLI already documents elsewhere. Handed to
Step 9.

**The workaround, disclosed rather than buried:** the cap is operator-tunable
by design and `verify_session`'s own error path tells the operator to set
`AI_ROUTER_VERIFY_MAX_EVIDENCE_CHARS`. The close ran with it at 768 KiB
against the 600 KiB default. The bundle was **2% over**. Nothing was reduced,
filtered, or hidden — the backstop verifier saw the entire bundle, which is
why it was able to find the Major above.

---

## Suite state at close

| gate | result |
| --- | --- |
| typecheck | clean |
| build | clean |
| Layer 2 | **1866 passing / 0 failing** |
| Layer 3 — full, on the final tree | **33 passed / 0 failed (18.1m)** |
| verification rounds | discovery ISSUES_FOUND (1 Major, fixed) → supplementary VERIFIED → remediation-review VERIFIED → **backstop round 4 ISSUES_FOUND (1 Major, fixed here)** |
| discovery passes used | 2 of 2 permitted — no third |
