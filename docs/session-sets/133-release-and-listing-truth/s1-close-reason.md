# Close reason — Set 133 Session 1

## Attestation

Operator adjudication, 2026-08-15: the close backstop's round-5 Major is a
**false positive**, dismissed on deterministic falsifying evidence, and
Session 1 closes with `--manual-verify` carrying this record.

## The finding

Round 5 (close backstop, delta-scoped remediation-review, `gpt-5-6-sol`,
anthropic excluded):

> The claimed Marketplace and changelog correction is absent from the fix
> delta.

Its acceptance criterion:

> The current Marketplace description, Marketplace README, and 1.0.0
> changelog consistently disclose that verification is normally
> cross-provider but a qualified `DIRECT_API` same-provider fallback can
> substitute when no different-provider verifier is available.

## Why it is wrong

A **delta-scoping artifact**, not a defect. The round's baseline is the
**round-4 completion anchor** `9e4871a6a318` — the tree *after* the
round-3 rejection had already been remediated. The corrections were
therefore already in the baseline, and the delta from baseline to current
tree carries only the two changelog `.baseline.json` digest re-stamps. The
verifier reasoned correctly from the bundle it was handed and then inferred
*absent from the delta* = *absent from the code*.

## The evidence, reproducible by anyone

`git show HEAD:tools/dabbler-ai-orchestration/package.json` → description:

> Organize AI-led development like work: modules, session sets and
> step-by-step session plans in a native tree — plus routed verification
> before every close, **normally cross-provider**, recorded as evidence you
> can check.

No unconditional independence claim. `git show HEAD:ai_router/CHANGELOG.md`
contains, inside the `1.0.0` section:

> **It is not cross-provider in every case, and this release does not claim
> it is.** One configuration still produces a same-provider verdict: a
> `DIRECT_API` project on a machine holding no usable API key outside the
> orchestrator's own provider. […] It is same-provider verification, not an
> independent review of it […] `verification_qualification: same-provider`
> is stamped on every record the verdict touches […] **session verification
> only** […] and **`DIRECT_API` only** — a Copilot seat keeps the
> unqualified fail-closed contract.

That is the acceptance criterion satisfied verbatim, on both named paths.

**Round 4 had already reviewed and accepted these exact edits** — fix
verdicts `1 accepted, 0 rejected, 0 accepted-with-modification`, verdict
VERIFIED, 0 findings. Round 5 did not contradict round 4; it was shown a
different, narrower thing.

## What is preserved

`s1-verification-round-5.md` and `s1-issues-round-5.json` are committed
**unedited**, as raw records. The finding stands on the ledger with this
adjudication beside it, so a later reader sees both the finding and why it
was not actioned. The substantive verdict of record for this session
remains **round 4's VERIFIED**.

## Declared honestly

This close is journaled as a **verification reduction**
(`verification_effect: reduces`, `authority: human`). The substantive
cross-provider verification did happen and did pass, but `--manual-verify`
substitutes an operator attestation for the machine-settled evidence chain
the gate would otherwise require, and that is a reduction whatever the
substance behind it.

## Two upstream defects this exposed — residuals, not fixed here

1. **`post_round_delta` and `run_of_record affected` disagree about the
   same two paths.** The delta-scoped round happened at all because
   `post_round_delta` classified `ai_router/changelog.d/.baseline.json` and
   `tools/dabbler-ai-orchestration/changelog.d/.baseline.json` as *"not
   under any declared test surface"* and therefore shipped code — while
   `run_of_record affected` lists both as **pytest** inputs (pytest covers
   `ai_router/` and `tools/dabbler-ai-orchestration/changelog.d/`).
2. **A delta-scoped review is set up to reach this conclusion.** It is
   handed a claims context describing the whole session's work and a bundle
   containing only the delta. Nothing tells it that a claim satisfied
   *before* the baseline is absent from the diff by construction, so
   *"the claim is contradicted by the presented ground truth"* is a
   conclusion the framing invites rather than a defect it found.
