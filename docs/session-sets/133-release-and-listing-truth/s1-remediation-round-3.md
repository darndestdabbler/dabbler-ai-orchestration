# Remediation — Set 133 Session 1, round 3 (remediation-review cycle 1)

Round 3 **rejected** the round-1 fix. The rejection is accepted in full:
the fix disclosed the exception in the two READMEs and then left the same
unconditional claim standing on the two surfaces the finding actually
named. Restating a claim in different words is not disclosing it.

## What the reviewer got right

1. **`package.json` was re-worded, not fixed.** Round 1 replaced
   *"cross-provider verification that runs before every close"* with
   *"**independent** verification built into **every** close"*. That is
   the identical unconditional independence assurance with a different
   adjective — and it is the **Marketplace search surface**, seen by
   every visitor before they read a word of the README. On the disclosed
   `DIRECT_API` single-provider configuration the verification is
   precisely *not* independent, so the claim was false in exactly the
   case the same release documents.

2. **The changelog sentence was arguing rather than reporting.** Round 1
   wrote that a labelled weaker verdict is *"a labelled weaker verdict,
   not a substituted one."* The reviewer names that as incorrect, and it
   is: on the degraded path a cross-provider verification **is**
   substituted by a same-provider one. Labelling what happened does not
   change what happened. Release notes should say what the software does
   and let the reader judge it — defending the wording inside the notes
   is how an overclaim survives a review that was supposed to remove it.

## The fix

- **`package.json`** — the description now claims only what holds
  unconditionally: *"plus routed verification before every close,
  normally cross-provider, recorded as evidence you can check."* It
  drops "independent" and every universal-independence reading, and
  *"normally cross-provider"* is the phrasing the acceptance criterion
  itself asks for. 216 characters; valid JSON.

- **`ai_router/CHANGELOG.md`** — the `1.0.0` blockquote no longer argues
  the point. It states the story plainly (verification is *normally*
  cross-provider; the tier that substituted a hand-recorded verdict for a
  routed one is gone), then, under its own heading — ***"It is not
  cross-provider in every case, and this release does not claim it
  is"*** — describes the one configuration that produces a same-provider
  verdict, says outright that it **is** same-provider verification rather
  than an independent review of it, and confines the claim to what Set
  123 S2 actually changed: that the case is loud and labelled instead of
  silent. Scope (session verification only; `DIRECT_API` only; not a
  Copilot seat) and the one-line remedy are kept.

- **`tools/dabbler-ai-orchestration/README.md`** — the bullet header
  claimed *"A session blocks rather than passes when no
  different-provider verifier can be reached"* and then immediately
  documented the case where it does not block. The header now reads
  *"Verification is normally cross-provider, and a session never quietly
  passes without it"*, which is true as written and does not need the
  paragraph beneath it to walk it back. The disclosure itself is
  unchanged — the reviewer found it accurate.

## The contract all three surfaces now state

*Verification is normally cross-provider, chosen by excluding the
orchestrator's own provider. One disclosed configuration —
`DIRECT_API` with no usable key outside the orchestrator's provider —
produces a qualified same-provider session verdict instead: loud,
machine-labelled `verification_qualification: same-provider`, and
confined to session verification. No surface says every close is
independently or cross-provider verified.*

## Still not changed, and still for the same reason

No product code. The verifier's alternative remedy — make the runtime
block unconditionally — would delete an operator-ruled, journaled
degradation path from the artifact being tagged. That is barred by this
set's Non-goals and is not an orchestrator's decision to take.
