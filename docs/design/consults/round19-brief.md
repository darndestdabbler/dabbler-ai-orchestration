# Consult round 19 — how a disputed finding ends

2026-09-20. You are advising on one design choice in an AI-led
coding-session framework. Answer in the fixed shape at the end. Be concrete
and brief; do not restate the brief.

## The framework, in one paragraph

A session is driven by a deterministic loop. An **authoring AI** writes code
step by step. When the steps are done, a **Primary Reviewer** -- a model from
a different vendor, which reads the diff but never writes or runs anything --
reviews it and returns findings, each with a severity and a blocking flag.
The author answers each finding: fix it, or **dispute** it with grounds and
cited evidence from the repository (prose alone is refused). The next round
shows the primary each dispute beside its finding, and the primary must
UPHOLD or WITHDRAW. Rounds repeat up to a cap (default 7). A round with only
minor findings ends the loop as verified.

## How an impasse ends today

Only at the cap, and only when every remaining blocking finding is disputed,
the framework calls the **Auxiliary Reviewer** -- a third vendor, not the
author's and not the primary's. It sees each finding, the dispute, the
evidence and the diff of fixes, and rules UPHOLD or OVERRULE per dispute. It
may raise nothing new. One adjudication per session, ever.

- Every dispute OVERRULED: the session is VERIFIED and closes.
- Any dispute UPHELD: the session can never close. No further round may
  open. The fix is left to a follow-up session, and a person has to sort out
  the stuck one.

## What is already planned (session 216)

An upheld finding becomes "a finding to fix": the author fixes it and gets
exactly one more review round. The operator has now confirmed they want the
dispute resolved inside the session, not deferred.

## The operator's new proposal

> When there is an unresolved dispute, require the Verifying AI (the Primary
> Reviewer) to provide an alternative method for resolving the issue, and
> then have the Auxiliary model choose one method of resolution or the
> other. If that works, perhaps it prevents prolonged sessions.

So instead of UPHOLD/OVERRULE on a finding, the Auxiliary chooses between
two concrete resolutions: the author's (which may be "no change, for these
reasons" or a specific fix) and the primary's stated alternative. This is
close to final-offer arbitration. The framework then has the author carry
out the chosen resolution.

## Constraints that are not up for change

- The operator's goal: a person is bothered mid-session only at planning,
  when an AI service is down, or by their own choice. No dead ends.
- Do not over-engineer. Adoption beats rigour. Fewer moving parts wins.
- The reviewers never write code or run anything. A "resolution" from a
  reviewer is a description, and the author implements it.
- No hand-written verdicts; the framework records every ruling.
- Reviewer calls cost real money; sessions that run seven rounds cost both
  money and the operator's patience.

## Questions

1. Is choosing between two concrete resolutions better than UPHOLD/OVERRULE
   plus "fix it and take one more round"? Name the failure modes of each.
2. WHEN should the Auxiliary be called? Today it is only at the cap of 7.
   An alternative: as soon as the primary UPHOLDS a finding the author has
   disputed -- that is already an impasse, at round 2 or 3.
3. Should the Auxiliary have a third option (neither resolution is right;
   here is what to do instead), or does a strict two-way choice work better?
4. After the chosen resolution is carried out, what confirms it and ends the
   session? One round by the primary scoped to that fix? The Auxiliary? Only
   the tests? What stops this from reopening the argument?
5. When does the primary state its alternative -- with every finding, or
   only when it upholds a disputed one?
6. What is the simplest version of this that you would ship?

## Answer shape

```
VERDICT: adopt | adopt with changes | do not adopt
1. ... (at most 5 sentences per question)
2. ...
3. ...
4. ...
5. ...
6. ...
BIGGEST RISK: one sentence
```
