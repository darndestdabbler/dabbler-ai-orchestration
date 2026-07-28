# S1 remediation sidecar — after remediation-review (round 3)

Round 3 returned **9 accepted / 1 accepted-with-modification / 3 rejected** fix
verdicts plus 3 new blocking findings. Two are accepted and fixed. **One is
disputed** and is escalated to the operator rather than re-rounded, per the
constitution's *never re-round a disputed finding* rule.

## Accepted and fixed

| # | Finding | Fix |
| --- | --- | --- |
| R3-1 | My own compensating trim pass replaced the three literal environment-variable names with the wildcard "the three `DABBLER_*` provider keys" — which is not a variable name a reader can set | Restored `DABBLER_ANTHROPIC_API_KEY`, `DABBLER_GEMINI_API_KEY`, `DABBLER_OPENAI_API_KEY` verbatim. A fair catch: this was a regression introduced by trimming for line count, and it is exactly why the line target must never win against performability |
| R3-2 | On ADO, **Allow requestors to approve their own changes** only makes the author's vote *count* — it does not cast it, so a solo PR sits at 0-of-1 approvals and cannot merge | Part 3's ADO note now says to cast your own **Approve** vote on each solo PR; Part 5 stage 3 now explicitly says to **untick** that box so Sam's approval becomes the one that counts (previously it only said "raise 0 → 1", which has no ADO meaning) |

## Disputed — operator adjudication requested

**R3-3: "The Azure DevOps CI remediation still delegates the runnable pipeline to
the reader."** The verifier's prescribed fix is: *"Provide a valid Azure Pipelines
definition running the required installation and test commands, tell the reader
where to commit it, and give the concrete pipeline-registration and
build-validation steps."*

**The orchestrator disputes the prescribed fix, not the observation.**

The set's binding cut list — routed to a pinned `gpt-5.6` analysis *before* the
spec was committed, and operator-confirmed on 2026-07-28 — says in
[`authoring-cut-consult-gpt56.md`](authoring-cut-consult-gpt56.md) §A, verbatim:

> The entire Azure variant should be one callout: […] **Do not include Azure
> Pipelines YAML here.**

and the spec repeats it as design: *"Azure DevOps becomes **one inline equivalent
per GitHub-specific guardrail** — never a parallel walkthrough."* Shipping a
pipeline definition, its commit location, and its registration flow rebuilds a
meaningful part of the 821-line Copilot + ADO cut this very session deleted. The
spec also directs that a session disagreeing with a disposition **records the
disagreement and proceeds** rather than re-litigating the cut list at runtime.

**What was done instead** (accepted-with-modification): the finding's *impact* —
an ADO reader who believes they are following an end-to-end walk and hits a wall —
is real, and it came from the document over-promising. Part 2 now carries a
one-time scope statement:

> **On Azure DevOps, this is a GitHub walkthrough with ADO equivalents named.**
> […] Those notes assume an ADO admin who can set branch policies and whose
> organization already builds pipelines — this tutorial deliberately ships no
> `azure-pipelines.yml`. Read them as a configuration checklist, not a second walk.

That removes the false promise at the point the reader chooses their host, which
is the honest fix available inside the binding scope.

**For the operator to decide** (not for another verification round):

- **Accept** — the ADO notes stay a named-equivalents checklist. Recommended: it
  is what the cut list says, and S3 additionally authors
  `scene-2-alt-azure-devops.md` for the ADO video take.
- **Override** — if you want the tutorial to be genuinely walkable on ADO, that is
  a cut-list change, and the right vehicle is a follow-on set that adds an ADO
  host-setup doc (a pipeline + policy bootstrap), linked from the tutorial. It
  should not be smuggled into a session whose spec forbids it.

## Line count

314 lines (from 306). +8 for the two accepted fixes and the scope statement. The
disclosure and reasoning in
[`s1-remediation-round-2.md`](s1-remediation-round-2.md) stand unchanged: the
teaching surface is **1,968 → 469 lines across two documents**, a **76%**
reduction, and every line added after the first draft closed a step a reader
could not perform.
