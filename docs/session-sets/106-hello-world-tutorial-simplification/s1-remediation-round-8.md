# S1 remediation sidecar — close-backstop round 8, and the stop

Round 8 raised two Majors. **Neither can be closed by another verification
round**, and the session stops here for operator adjudication rather than
continuing to pay ~$0.35 a round. Verification spend to date: **~$3.6**.

## R8-1 — "Four AI-led lifecycle sets still run in the primary checkout"

**Kernel accepted, remedy disputed.**

The kernel is a real contradiction **in my own prose**: Part 4 introduced the
worktree by claiming *"Each work set runs on its own branch in its own folder, so
an AI session never edits your `main` checkout"* — while Parts 4 and 5 run four
doc-writing sessions in the primary checkout on an `authoring/*` branch. A branch
is not a separate checkout, and the verifier is right that the sentence
over-claims. **Fixed by narrowing the claim** to what is actually true and
actually load-bearing:

> Implementation sets write code, and they get their own folder as well as their
> own branch — so your main checkout stays on `main`, usable, while the AI works.
> (The doc-only plan and decomposition sets above are short and were fine on a
> branch in place; the isolation matters once a session is changing code.)

**The remedy — putting all four lifecycle sets in worktrees — is disputed**,
because the binding cut list specifies the opposite. `authoring-cut-consult-gpt56.md`
§E gives the seven-step replacement flow verbatim, and only its final step uses a
worktree:

> 1. Scaffold the repository. 2. Rename **Default**… 4. Adapt `001-default-plan`…
> 5. Run the plan set and decomposition set as real work. 6. Keep the generated
> plan and implementation set. **7. Run the implementation set in a worktree.**

§F likewise caps the worktree teaching at *"only three actions"*. Wrapping four
additional sessions in worktrees re-adds the ceremony this set exists to remove.
Recorded as a disagreement and proceeding, per the spec's instruction.

## R8-2 — "The flagship tutorial materially exceeds its explicit size criterion"

**Accepted as fact; not fixable by this session.** This is the deviation
disclosed since [`s1-remediation-round-2.md`](s1-remediation-round-2.md) and
carried in every conventions block since.

| | lines |
| --- | --- |
| Spec target | ~240 |
| Spec Ends-with ceiling | ≤ ~260 |
| First draft, pre-verification | 269 |
| **Now** | **344** |

Every line above 269 was added by a **verifier-demanded correctness fix** in
rounds 1–7 — the Node/winget install path, the Copilot-CLI-is-the-session-surface
explanation, the ADO self-approval vote, the authoring-branch steps on both the
solo and team paths, the `-m` invocations. Reversing any of them re-opens a
finding this same verifier rated Major. The two goals are in direct conflict, and
the conflict is **not** the orchestrator's to resolve unilaterally.

### For the operator — three options

1. **Accept 344 and re-baseline the criterion.** The set's actual objective is
   still met by a wide margin: **1,968 lines across three documents → 499 across
   two** (344 + 154 + a 1-line stub), a **75% reduction**, with the drift
   discipline retired. Recommended: the ~240 figure was set against a document
   that had never been reader-tested, and thirteen blocking gaps at first contact
   say the estimate was optimistic for a tutorial that also carries an ADO
   variant and a direct-API variant.
2. **Cut scope to hit the number.** Roughly 25 lines are ADO equivalents and ~6
   are the direct-API variant. Moving the ADO notes to a separate short host-notes
   page would land ~315 — still over 260, and it re-opens the round-3 argument
   about ADO completeness.
3. **Let S4 cut it.** The live operator walk shows which lines nobody needed. This
   is the cheapest real reduction available and needs no decision now.

## Why the session stops here

Blocking findings per round: **11 → 2 → 3 → 1 → 1 → 2 → 1 → 2**. Rounds 5–7 were
one defect class chased through its echoes and did converge. Round 8 is different
in kind: one finding is governed by the binding cut list (disputed, kernel fixed)
and the other is a spec-target conflict created by the verifier's own earlier
demands. The constitution is explicit that an **unfixed or disputed
Critical/Major goes to the human — never another round**, and that persisting past
a bound requires a material finding, which a re-run cannot produce here.

`close_session` will keep refusing while its backstop reports blocking findings.
That is correct behavior and the gate should **not** be forced. The work is
committed and pushed; the operator's options are above.
