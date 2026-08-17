# Conventions for Set 113 Session 1 verification

## What this session was asked to do

Spec Session 1 of 4, "Truthful UAT accounting". Four progress keys:
`recordSchema`, `inventoryGate`, `gateTests`, `decisionJournaled`.

Set 111 S4 shipped a **binary** `disposition.uat.status` of
`walked | waived`, enforced by the `uat_walk_recorded` close gate. The
operator retired that binary on 2026-08-10
(`operator-notes.md`), on the grounds that *"`requiresUAT` is not really
a requirement if it can be bypassed — and it always can be, and always
should be, to prevent impasses."* This session replaces it with a
per-component **accounting** and makes the close gate check the spec's
declared component inventory.

## Suite baseline

- **Targeted run of record for this session:** `pytest -n 8` over
  `-k "spec_config or disposition or gate or close or uat or modules or
  checklist or lightweight or preflight"` — **1389 passed, 0 failed**
  (131.6s). This is the intersection of the change set with the pytest
  suite's declared inputs.
- **No known failing tests** are being carried, and nothing is being
  skipped or xfailed by this session.
- The **full** suite has deliberately **not** been run yet. The repo's
  test-run policy (A2) forbids a full expensive run before a
  cross-provider stage, because any remediation invalidates it. It runs
  once at Step 8, after the last code change.
- **Layer 2 / Layer 3 are not owed.** `run_of_record`'s `covers` is by
  path; this session touched no extension `src/` or webview surface. The
  one extension file touched, `scripts/stage-walk.js`, changes three
  lines of **console output** — the closing hint that told the operator
  to record `status 'walked' + walkArtifact`, a shape that no longer
  exists.

## Release contract

- **Router-side only, `[Unreleased]`.** Fragment
  `ai_router/changelog.d/0010-set-113-s1-uat-accounting.md`. No version
  bump, no publish; publishing is operator-gated in this repo.
- **This change is BREAKING for consumer repos** and the fragment says so
  in those words, leading with the symptom, the two-part fix and worked
  before/after JSON. Set 109 set the precedent for shipping a breaking
  config/disposition change this way.

## By-design decisions — please critique the reasoning, not the absence

These are deliberate. Argue against them on the merits if you disagree,
but they are not oversights:

1. **`uat.status` is removed outright, not accepted alongside the new
   shape.** Accepting both would leave the binary alive and make the
   replacement optional. The validator refuses `status` with a message
   naming the replacement.
2. **A `requiresUAT: true` spec that declares no `uatComponents` is
   REFUSED, not defaulted to inert.** Defaulting would disarm the gate
   exactly where the author was least deliberate. `uatComponents: []` is
   the explicit way to say "nothing observable here", and it passes.
3. **Component keys and reviewer types are closed vocabularies.** The
   first keeps a self-assessed `confidence` score or a debt ledger out
   (refused by the operator and all three consult rounds); the second
   makes "an AI agent reviewed it" unrecordable (spec decision 9).
4. **Methods are not ranked in code.** They are ordered in prose only. A
   rank would be a score wearing a different hat.
5. **`method: "none"` PASSES.** Nothing blocks on how much UAT was done.
   The single refusal is a declared component with **no answer at all**.
6. **`uatComponents` is Python-only; the TypeScript
   `parseSessionSetConfig` was not updated.** The extension has no use
   for the inventory — it reads `requiresUAT` only, to decide whether to
   parse a UAT checklist. Mirroring an unused field would be accretion.
   Flag it if you think the drift is worse than the accretion.
7. **This set's own `spec.md` config block was edited mid-set** to add
   `uatComponents`, which a strict reading of "the configuration block is
   immutable at runtime" would question. Reasoning is journaled in
   `decisions.jsonl` and noted in the spec header: it arms nothing, and
   without it this set's own Session 4 could not close.
8. **`ai-assignment.md` is routed output**, authored by `gpt-5.6-luna`.
   Its content is not this orchestrator's opinion and should not be
   critiqued as such. The header records that the first dispatch resolved
   to the orchestrator's own model and was discarded and re-routed.

## Severity rubric for this round

Grade by **consequence**: probability the stated failure scenario reaches
a real user, times impact. Low probability **or** low impact is Minor. A
finding with no nameable failure scenario is a nit, not a Major.

The highest-value findings here would be:

- A path by which a declared in-scope component can still close with **no
  record** — that is the entire point of the session and a Critical.
- A shape the validator accepts that the JSON schema rejects, or vice
  versa (an existing parity test already caught one such gap this
  session).
- A legitimate authoring shape the new spec parser mis-reads — especially
  the `uatComponents` block-list scan running adjacent to
  `prerequisites:`, which is also a `- ` list.
