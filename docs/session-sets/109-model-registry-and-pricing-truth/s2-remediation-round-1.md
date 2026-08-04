# S2 remediation note — round 1 (discovery)

Round 1 returned **VERIFIED, 0 blocking findings** on both fan-out arms, so the
loop was already non-blocking and no remediation was required. Seven nits were
raised (three of them independently by both arms, which is why they were taken
seriously). All seven are addressed below rather than merely recorded: three
were **factual errors in this session's own evidence**, one was a **real code
gap**, and three were **overclaims in documentation** — none of which should
survive into the record on a "Minor, proceed" ruling.

| # | Nit | Both arms? | Disposition |
| :- | :--- | :--- | :--- |
| 1 | Exact post-fix call count documented but not asserted | **yes** | **Fixed** (code) |
| 2 | `_tiebreaker_reroute` never checks `is_enabled` | **yes** | **Fixed** (code) |
| 3 | Test counts inconsistent across documents | **yes** | **Fixed** (docs) |
| 4 | `verify_session` wrapper not directly tested | no | **Fixed** (new test) |
| 5 | Trace records dispatch, not proven transmission | no | **Fixed** (docs) |
| 6 | "requests ≥ rows" too broad — copilot rows have no trace | no | **Fixed** (docs) |
| 7 | ContextVar isolation overstated for asyncio tasks | no | **Fixed** (docs) |

## 2 — the one real code gap, and why the sweep missed it

`_tiebreaker_reroute` checked that the configured tiebreaker exists in the
registry and that its provider is not excluded, but never read
`is_enabled`. With `on_disagreement: re-route` and a disabled tiebreaker, that
model would still have been dispatched — contradicting the same
identity-only contract the session had just enforced in three other places.

The session's own sweep could not have found it. That sweep searched for the
*shape* of sites 1–3 — an `if not exclude` short-circuit sitting ahead of a
`_survives` check. The tiebreaker has no such short-circuit **because it had no
check at all**, and a grep for a defective check does not match code that omits
the check entirely. The claim "a sweep found these three and no others" was
therefore true about the pattern and false about the class; it has been
corrected in the findings doc, which now lists four sites and states this
explicitly.

Fixed by replacing the two-condition guard with a `_tiebreaker_usable()`
predicate covering all three unusable cases (absent / disabled / excluded),
all routing into the merge fallback that already existed. Covered by
`test_a_disabled_tiebreaker_also_degrades_to_merge`, which fails against
pre-fix code.

## 1 — the exact-count assertion, and what checking it revealed

Both arms asked for `len(calls) == 1`. Asserting that literally would have been
**wrong**, and finding out why improved the deliverable: the correct count
depends on tier.

- **Tier 2** — a verifier on a *permitted* provider still exists, so
  auto-verification still runs: **2 requests / 2 rows**, neither on the barred
  provider.
- **Tier 3** — no verifier survives the exclusion at all: **1 request / 1 row**,
  `verification is None`.

The single reproduction test was split into the two shapes and each now asserts
its own exact counts, which is what the spec's Ends-with ("the number of real
HTTP calls per `route()` is known and asserted") actually requires. The tier-3
test is also the one that exhibits the original defect — the tier-2 shape never
did, since its verifier was on a permitted provider either way. That is why the
tier-2 case is deliberately **not** among the tests that fail pre-fix.

Correcting this also required a harness change: the mock reported
`output_tokens: 5`, below the shipping config's `min_output_tokens: 30`, so
every traced call was silently escalating. Escalation is now an explicit knob
(`force_escalation()`), used only by the test that documents it, and the
default response is above the trigger — so a test asserting an exact count
cannot be counting an escalation without saying so.

## 3 — the test-count error

The findings doc claimed 20 tests and "6 fail, 20 pass"; the file had grown to
24 as sites were added, and to 27 after these fixes. The falsifier check was
re-run properly (reverting the three fix files to HEAD while keeping the
instrumentation, so failures indicate the defect rather than a broken harness):
**9 of 27 fail pre-fix, all 27 pass restored.** Every count in the findings doc
and the conventions doc now reads 27/9.

A note on how the stale number arose: the first falsifier run used
`git checkout <file>`, which restores from the **index** — and the work was
already staged, so it silently restored the *fixed* files and proved nothing.
The corrected run uses `git checkout HEAD -- <file>`.

## 5, 6, 7 — the documentation overclaims

- **5.** `record_http_request` fires immediately before `client.post`, so an
  entry means *dispatched*, not *transmitted*. The module docstring now says so.
  Dispatch remains the right boundary for the questions asked here — which
  provider was contacted, and how many times — and that reasoning is recorded
  rather than left implicit.
- **6.** "Requests ≥ rows" is false on a Copilot seat, whose rows exist with
  zero trace entries because that transport is deliberately not
  HTTP-instrumented. The invariant is now stated as holding *within a traced
  api-profile `route()`*, and both qualifiers are called out as load-bearing.
- **7.** An asyncio task spawned inside an active scope inherits the ContextVar
  and therefore the same list. The docstring now scopes the isolation claim to
  threads and synchronous calls, and tells a future async caller to open its
  own scope.

## 4 — the `verify_session` seam

The verification-path tests drove `route()` directly, so a regression in the
CLI wrapper that dropped its own exclusion would not have failed them — a fair
observation about what the evidence proved. Rather than narrow the claim, a
test now drives the real seam (`verify_session._default_route`, which the close
backstop also calls) and asserts both the task type and that the exclusion
reaches `route`.

## Net effect

Four documents corrected, one behaviour fixed, three tests added (27 total).
No finding was dismissed. The verdict entering this note was already
non-blocking; the note exists because "Minor, proceed" is a ruling about
whether to keep opening rounds, not a licence to leave false statements in the
record.

Full suite re-run after these fixes: **3257 passed, 6 skipped, 8 deselected, 0
failed** (23m32s) — the +3 over the pre-remediation 3254 being exactly the
three tests added here.

No further verification round was opened. Round 1 was non-blocking, so the
constitution's supplementary → remediate → remediation-review sequence never
armed; the fix delta is independently reviewed by `close_session`'s backstop,
which is that surface's designed purpose.
