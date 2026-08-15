# Remediation — Set 133 Session 1, round 1

One blocking finding, accepted in full and fixed. No finding was disputed.

## Finding (Major, Correctness, discovery call 2 / failure-scenario lens)

> The Marketplace surfaces promise an unconditional cross-provider block,
> while the same release documents an accepted same-provider fallback.

**Acceptance criterion (judgment):** *The Marketplace README and package
description accurately disclose the qualified `DIRECT_API` same-provider
fallback, or the release behavior is shown to block whenever no
different-provider verifier exists; the three release surfaces must state
one consistent contract.*

## Adjudication: ACCEPTED

The verifier is right, and it caught the exact defect class this session
exists to remove — a listing claim that a user could rely on and that the
shipped code does not honour unconditionally.

Confirmed against the code rather than the changelog prose:

- `ai_router/__init__.py` (~line 1301) computes `_degradation_authorized`
  and, when true, sets `_verifier_exclusion = None` and *removes* the
  orchestrator's own provider from `exclude_providers` — a same-provider
  session verification, deliberately permitted.
- `ai_router/verification.py::DirectApiPrecondition.degraded` is
  `applies and not satisfied`, and `applies` is true **only** for a
  project whose committed verify type is `DIRECT_API`. A Copilot seat and
  an uncommitted project keep the fail-closed
  `ProvenanceUnavailable` contract (Set 083/084).
- The permission is scoped to `task_type == SESSION_VERIFICATION_TASK_TYPE`
  — code review and security review still fail closed, with the in-code
  comment naming why extending it would be the hard carve-out an
  orchestrator may never self-authorize.
- It is not silent: a `[dabbler] WARNING: same-provider verification`
  goes to stderr, and `verify_session._patch_disposition` writes
  `verification_qualification: same-provider` onto the disposition (and
  removes it when a later round is unqualified, so a stale weaker claim
  cannot stand beside a fresh verdict).

So the accurate contract is *"cross-provider is enforced by exclusion,
with one narrow, loud, machine-labelled exception"* — not *"a session
always blocks"*. **Note the spec's own supported-claims list carries the
absolute phrasing** (*"a session blocks rather than passing when no
different-provider verifier exists"*). Where the spec and the code
disagree about what is true, the code wins and the copy follows the code;
goal over letter, and the goal of this session is a listing that does not
overclaim. Recorded here so Step 9 can correct the spec's phrasing rather
than have a future set inherit it.

## The fix — one pass, every echo (G-012)

The claim appeared on four surfaces. All four now state the same
contract, with the exception disclosed rather than omitted:

1. `tools/dabbler-ai-orchestration/README.md` — the lead paragraph no
   longer says every session is reviewed by a different provider full
   stop; it says *as a rule*, and points at the exception. The
   "Verification you can check" bullet keeps the blocking claim and adds
   **The one exception, stated plainly**: which projects it covers
   (`DIRECT_API` only), what the machine state has to be (no usable key
   outside the orchestrator's own provider), what happens (session
   verification proceeds, warns, and stamps
   `verification_qualification: same-provider`), what it does **not**
   cover (code review, security review, Copilot seats), and the one-line
   way to make it not arise.
2. `tools/dabbler-ai-orchestration/package.json` — `description` no
   longer advertises "cross-provider verification that runs before every
   close". It now claims what is unconditionally true: *independent
   verification built into every close, run for you and recorded as
   evidence you can check.* Marketplace search results show this string,
   so it must not carry a guarantee the README then has to qualify.
3. `README.md` (root) — the **Mandatory cross-provider verification**
   highlight keeps its claim and gains the same disclosure, attributed to
   Set 123 S2 and the operator ruling of 2026-08-11. The Highlights
   bullet higher up now points at it instead of reading as absolute.
4. `ai_router/CHANGELOG.md` — the `1.0.0` "What is in this release"
   blockquote said the workflow *"no longer has a mode in which
   cross-provider verification is substituted rather than performed"*.
   That sentence is Set 112's, written before Set 123 S2 existed. It now
   states the distinction it was relying on: a labelled weaker verdict is
   not a substituted one, and the exception's scope is named.

## What was NOT changed, and why

**No product code.** The alternative remedy the verifier offered — *"or
the release behavior is shown to block whenever no different-provider
verifier exists"* — would mean removing an operator-ruled, journaled
degradation path from the artifact being tagged. That is forbidden by
this set's Non-goals and is not an orchestrator's call in any case: the
degraded path was authorized by the operator on 2026-08-11 as a
verification-reduction decision. Disclosure was the available remedy, and
it is the one the criterion names first.
