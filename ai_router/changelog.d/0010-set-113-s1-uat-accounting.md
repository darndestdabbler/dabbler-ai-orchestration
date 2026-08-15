## [Unreleased] — the UAT gate demands an accounting, not a walk

### Changed

- **(Set 113 S1) `disposition.uat` is now a per-component accounting, and
  `uat_walk_recorded` gates on the spec's declared component inventory.
  BREAKING for consumer repos.**

  **Symptom:** a `requiresUAT: true` set fails to close with either *"this
  set declares requiresUAT: true but its spec declares no uatComponents
  inventory"* or *"uat.status was removed in Set 113 S1"*.

  **Fix, in two parts.** In `spec.md`'s Session Set Configuration block,
  declare what is in scope:

  ```yaml
  requiresUAT: true
  uatScope: per-set
  uatComponents:
    - Work Explorer tree
    - Static walkthrough index
  ```

  Then replace the binary `disposition.uat` block with one record per
  declared component. A former `walked` becomes the performed method plus
  its reviewers, with the old `walkArtifact` moved into `evidence`; a
  former `waived` becomes `method: "none"` with the waiver text as that
  component's `attestation`:

  ```json
  "uat": {
    "attestation": "operator reviewed the accounting 2026-08-15",
    "components": [
      {
        "component": "Work Explorer tree",
        "method": "manual-walkthrough",
        "reviewers": [{ "type": "developer", "count": 1 }],
        "evidence": ["s4-uat-walk.md"]
      },
      {
        "component": "Static walkthrough index",
        "method": "none",
        "attestation": "no reviewer available before the release; low risk"
      }
    ]
  }
  ```

  **Why.** Set 111 S4 shipped `status: "walked" | "waived"` to stop UAT
  evaporating. The operator retired it on 2026-08-10 on the grounds that
  *"`requiresUAT` is not really a requirement if it can be bypassed — and
  it always can be, and always should be, to prevent impasses."* The
  honest question is not whether UAT happened but how much confidence it
  bought — a continuous quantity that varies **per component**. Their
  worked example: one developer watches walkthroughs of the low-risk
  components and manually walks the high-risk ones. A single flag could
  express none of that, so the pressure was toward a blanket waiver.

  **Nothing blocks on how much UAT was done.** Method `none` and
  `not-applicable` are valid, attested, **passing** values. The one thing
  refused is a declared component with no answer at all.

  **The inventory lives in the spec on purpose.** A gate validating only
  the records a disposition happens to contain would let the closing
  session declare both the question and the answer — making an omitted
  component the new form of evaporation (consult round 3, the round
  commissioned to attack the consensus). An armed set that declares no
  inventory is therefore refused rather than defaulted to "nothing in
  scope"; `uatComponents: []` is how an author says, deliberately, that
  the set ships no human-observable surface.

  **Two closed vocabularies, both load-bearing.** Reviewer types are
  `developer` and `business-user` only — an AI agent is not a human
  reviewer and there is no spelling of one the field accepts. The
  component key set is closed to `component`, `method`, `reviewers`,
  `evidence`, `findings`, `attestation`, which is what keeps a
  self-assessed `confidence` score or a parallel debt ledger from being
  added later without anyone deciding to. Risk is what the facts imply.

  Path-shaped `evidence` entries are checked for existence on disk — a
  record naming a walk file that is not there reads as evidence and is
  not. URLs and free-text locations (a SharePoint library, a Teams
  channel) are left alone, because that is where the operator's
  convention actually puts the videos.

  `disposition.schema.json`, `docs/disposition-schema.md`,
  `docs/planning/session-set-authoring-guide.md`, `ai_router/docs/close-out.md`
  and the `npm run walk` closing hint all move together.
