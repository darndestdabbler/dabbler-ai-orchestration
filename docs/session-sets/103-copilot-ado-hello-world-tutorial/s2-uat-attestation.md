# Session 2 — operator UAT attestation (live ADO walk)

**Set:** 103-copilot-ado-hello-world-tutorial (Full tier, `requiresUAT: true`,
`uatStyle: ad-hoc`, `uatScope: per-set`). **Date:** 2026-07-15.
**Close method:** `close_session --manual-verify` — the operator conducted the
live acceptance walk out-of-band, which is the acceptance test this UAT set was
authored around ("the live operator walk IS the acceptance test"). A
cross-provider model cannot verify a live Azure DevOps + Copilot-seat walk it
did not perform; the operator's attestation is the verification of record.

## Operator attestation (verbatim)

> "I verify that 103 is good as is. I just completed the UAT for 103."
> — session operator (darndestdabbler), 2026-07-15.

## What this covers — the operator filled the checklist per-item

The operator completed the Session-2 live walk against the set's UAT checklist
(`103-copilot-ado-hello-world-tutorial-uat-checklist.json`) and marked **all 11
functional-area walks `Passes: true`** — Walk 1 Copilot seat CLI setup, Walk 2
ADO bootstrap, Walk 3 Build + seat + auth-preflight, Walk 4 modules + branch
policies, Walk 5 Open PR on ADO (Set-102-armed), Walk 6 AI session through
Copilot, Walk 7 the first-ever live `azure-pipelines.yml` run, Walk 8 Finalize
on ADO (Set-102-armed), Walk 9 integration set + touches review, Walk 10 the
tag / hotfix / rollback release drills, and Walk 11 the no-CLI degradation
floor. That per-item pass record — filled by the operator during the walk — is
the acceptance evidence.

> **Honest scope note:** each walk carries the operator's `Passes: true` mark;
> the free-text `Result` / `Feedback` fields were left blank (the operator
> attested pass without per-item narrative notes, which the ad-hoc UAT floor
> permits). No per-item results were invented. During this close the checklist
> also carried **11 blank duplicate rows** (`Passes: false`, empty
> HumanAction/Expectation) appended by the UAT tool; those non-data rows were
> removed so the record is internally consistent (verification round 1
> correctly flagged the contradiction). The de-draft rests on the operator's
> filled per-item passes plus the verbatim attestation above.

## Actions taken on the strength of this attestation

- **De-drafted the tutorial:** `docs/tutorials/module-team-hello-world-copilot-ado.md`
  banner changed from PREVIEW to "validated end-to-end on a live ADO org +
  Copilot seat (operator walk, 2026-07-15)".
- **Activated the cross-links** that flagged the doc as a pending-walk preview:
  `docs/tutorials/module-team-hello-world.md` (2 spots), `docs/quick-start.md`,
  and `tools/dabbler-ai-orchestration/README.md`. (The README's Marketplace
  visibility rides the next extension publish, per the spec; no extension
  release is cut for this docs-only set.)

## Set 102's armed ADO UAT — discharged

Set 102 (`git-workflow-automation`) shipped with an **armed, undischarged**
Azure DevOps UAT whose discharge was assigned to this set's live walk. With the
operator's 2026-07-15 walk complete, **Set 102's armed ADO UAT is discharged**.
Set 102 is closed and its record is immutable; this cross-reference in Set 103's
artifacts is the discharge record.
