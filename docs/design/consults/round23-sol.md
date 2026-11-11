## 1. **Is the diagnosis right?**

Yes. A framework with “zero deadlock tolerance” needs a human-authorised exit from a gate, not just more ways to retry it or abandon the plan.

Likely causes, ranked:

1. **The Mechanic is not entering the recorded workflow.** Zero log entries and zero Mechanic events are the strongest evidence available. That could mean nobody opens it, people use ordinary consultations instead, or invocation is not recorded reliably. It does not prove repeated failed repairs.
2. **Its licence excludes the important walls.** It can repair repository code, but cannot set aside an incorrect gate, change completion criteria, or repair router-owned state. Those are precisely the capabilities many stops require.
3. **Many stops concern infrastructure or framework behaviour, not editable application code.** Verification and publish account for **53 of 72 stops**. Not all are outside the repository, but ordinary file edits are often the wrong remedy.
4. **Recovery instructions are incomplete or wrong.** Yesterday’s blocked-report loop demonstrates this directly.

Forty-two of 240 runs stopped: **17.5%**. That is frequent enough that recovery must be a normal product feature, not expert folklore.

## 2. **What may be set aside, and what may never be.**

The line is **waiving an obligation versus inventing evidence**.

A person may authorise proceeding despite a failed or unmet gate. The record must retain the actual result. “No rule is sacred” does not mean “the machine may report something that did not happen.”

| Class | Permissible exception |
|---|---|
| Bookkeeping gates | Waive the specified requirement for this session. |
| Scope/file accounting | Accept named deviations; preserve the actual changed-file list. Reuse plan amendment where sufficient. |
| Step checks | Skip or accept failure of named checks; retain their results or absence. |
| Failing test | Proceed with the named failure, never label it passed. |
| Run-of-record freshness | Accept explicitly stale evidence; retain the tested revision and current revision. Never call it fresh. |
| Review verdict | Proceed despite rejection or absent verdict; never manufacture approval. |
| Review-round cap | Reuse `verify reopen`; it buys rounds, not agreement. |
| Publish | Close with publication outstanding or failed; never claim publication succeeded. |
| Record files | Only router-owned code writes them. No script or person supplies replacement verdicts or rewritten history. |

An exception cannot make an unavailable external action happen. It can honestly permit local completion without that action.

## 3. **The mechanism for an exception.**

Use **named, one-shot waivers applied by the router**, alongside ordinary Mechanic edits. Do not make arbitrary scripts the authority mechanism.

Record at least:

`rule`, `session`, `stop`, `reason`, `authorised by`

Also capture the affected gate instance, evidence revision, authorised effect and actual outcome.

Bind approval to the displayed proposal. Consume it once; changed scope or evidence must not silently inherit approval. Do not create a plan-wide exemption.

Reuse the existing human-only command boundary. An AI can draft a proposal but cannot authorise it.

If repairs need commands, show them separately. Prefer ordinary repository edits and existing router verbs. A genuinely necessary script should run with the person’s agreement, outside record paths, without ledger-writing authority. Its execution is evidence, not permission to declare success.

Support an explicitly named **framework-defect exception** for a stop whose internal rule is not yet catalogued. Otherwise the waiver catalogue becomes the next wall.

## 4. **The review ladder.**

**Cut it to one independent advisory review, then human decision.**

1. Mechanic proposes the smallest remedy.
2. Independent reviewer checks the evidence and identifies either a concrete within-rules route or the consequences of the exception.
3. The person chooses: try the route, authorise the exception, or stop.

When the reviewer identifies a plausible route, the Mechanic should normally **try it**, not litigate it—provided it is reversible and within existing permission. Spending money, publishing or changing scope still needs consent.

Keep dispute and auxiliary review available **on request**, not mandatory.

Review must be **advice, not a gate on human authority**. If the provider fails, show “independent advice unavailable” and let the person proceed. Otherwise the escape hatch has acquired its own deadlock.

No ladder guarantees an AI cannot mislead someone. Independent evidence inspection and a concrete approval screen do more than five conversational turns.

## 5. **Guarding against a lying or lazy AI.**

The reviewer must independently read:

- The current stop and relevant earlier attempts.
- The actual rule and implementation producing the block.
- Raw check, test and review results.
- The current diff, plan scope and evidence revisions.
- The proposed edits, commands and exact waiver effect.

If something is unavailable, say so; do not substitute the Mechanic’s confidence.

Give the person a one-minute approval card:

- **Blocked because:** plain-language explanation.
- **Rule:** short exact text, with a link to the full rule.
- **What you are allowing:** concrete consequence and scope.
- **Alternative:** executable within-rules route, or “none identified.”
- **Risk and disagreement:** including missing evidence.
- **Record afterwards:** the exact proposed status wording.

Show consequential commands and edits before approval. Avoid a generic “Trust the Mechanic?” button.

## 6. **What the record says afterwards.**

Use **“Completed with authorised exceptions”**, not “Passed,” and not “Failed” merely because an exception exists.

- **Ledger:** completion outcome plus exception count and links.
- **Transcript:** proposal, independent advice or its unavailability, human authorisation, execution and resulting evidence.
- **Work Explorer:** a neutral exception badge, expandable to the details.

Keep the original failure visible. Distinguish a waived test from outstanding publication; they have different consequences.

Do not use alarming colours or permanent warning banners for every exception. Honesty requires discoverability, not punishment. Later successful checks can resolve outstanding conditions without erasing the historical decision.

## 7. **“Is this a fair block?”**

**Extend `dabbler triage`.** It already reads the record, uses an independent provider and writes nothing.

Add a structured assessment:

- Is the block supported by current evidence?
- Is the advertised recovery route executable?
- Is it a framework defect, plan defect, legitimate unmet requirement, or uncertain?
- What is the smallest next action or exception?

Keep this advisory; the router records any subsequent authorisation.

Do not build another stall detector. Offer **“Check this block” at every stop**. Highlight it when the same gate stops again without relevant progress, or the printed recovery action reproduces the stop. Reuse the existing inactivity signal; inactivity alone is not proof of unfairness.

## 8. **Consumer repositories.**

The exception path must work without changing the installed package. That is its central purpose.

Router-owned waivers should let the installed version proceed honestly despite supported gate exceptions. A completely broken router may still require an update; promise an escape from policy gates, not immunity from arbitrary software failure.

Offer an **opt-in defect-report bundle** containing framework version, stop signature, rule, redacted diagnostics, triage advice, authorised exception and outcome.

Let the person preview it. Do not automatically upload source, secrets or proprietary logs. Produce a local bundle when offline, and link the eventual maintainer issue back to the exception.

## 9. **The simplest plan.**

**Session 1 — Ship the escape hatch.**

1. Define scoped waiver events and honest completion states.
2. Add human-only authorisation and router consumption.
3. Implement priority gate exceptions plus the framework-defect route.
4. Show exceptions in ledger, transcript and Work Explorer.
5. Test retry, changed evidence, engine refusal and unavailable review.

**Session 2 — Reuse diagnosis.**

1. Extend `triage` with fair-block assessment.
2. Add the approval card and optional independent review.
3. Make Mechanic proposals use existing edits and waiver requests.
4. Fix the blocked-report loop and its printed recovery instruction.
5. Test repeated-stop guidance.

**Session 3 — Close the feedback loop.**

1. Add previewable defect bundles.
2. Add repeated-stop highlighting.
3. Document consumer-repository recovery.
4. Exercise representative verification, publish and test stops.

**Delete** the mandatory dispute ladder and free-form privileged-script concept. **Reuse** triage, person-only verbs, plan amendment, review reopening and existing record writers.

If only one session is allowed, build Session 1. Advice without authority does not remove the wall.

## 10. **The one thing you would push back on**

**“If the reviewer cannot name a valid route, it must assume the Mechanic is right.”**

Failure to find an alternative is not proof that the proposed diagnosis—or script—is sound. The reviewer should say **“no within-rules route identified; here is what remains uncertain.”**

The human can authorise proceeding under uncertainty. The framework should record that honestly, rather than manufacture model agreement to make the decision feel safer.