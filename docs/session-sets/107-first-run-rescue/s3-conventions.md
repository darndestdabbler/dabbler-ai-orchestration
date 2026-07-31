# S3 verification conventions — read this before Round 1

Up-front conventions block per `project-guidance.md` → Workflow Expectations
(L-064-10). Its purpose is to keep Round 1 on real defects instead of burning
findings — and re-verify rounds — on an agreed baseline.

## What this session is

Set 107 Session 3 of 3, the **terminal** session. S1 shipped the
`Dabbler: Try a sample project` command and the canonical sample bundle; S2
authored the new 15-minute `docs/tutorials/hello-world.md`, relocated the old
448-line tutorial to `adopt-dabbler.md`, and shipped a literal gate.

**This session ships no product code.** It builds the instrument for a human
acceptance walk, records the walk's outcome, and closes the set. Its entire
deliverable is *evidence plus bookkeeping*.

## The severity rubric (L-095-1) — apply it

Grade by **CONSEQUENCE**: probability the stated failure scenario materialises
for a real user × impact on the deliverable's objectives. **Low-probability OR
low-impact is Minor even when technically correct. No plausible failure scenario
⇒ Minor by definition.** A finding must name who is harmed and how.

This matters more than usual here, because most of the diff is prose about
evidence. "This sentence could be clearer" is not a Major.

## What the walk established, and how — do not re-litigate either

The criterion was **met on both halves**: under 15 minutes in-window, four no's
on git / YAML / host / settings. Walked by the operator on a second machine (a
GHE-linked Windows account), fresh VS Code profile, published `0.47.0` from the
Marketplace, GitHub Copilot as the agent.

**Two limits are already disclosed on the artifacts themselves**, in
`s3-walk-evidence.md` and on every `Result` field:

1. The Results were **transcribed by the orchestrator** from the operator's
   report, not filled in item by item during the walk.
2. The time is the **operator's estimate, not a stopwatch reading** — the walk
   preceded the streamlined checklist, so the clock marks were never written
   down.

**A finding that restates either limit is not a defect — it is the artifact
working.** The alternatives were to invent a precise number or to discard a real
first run, and both are worse. A finding is only material here if it shows the
disclosure is *insufficiently prominent* or *contradicted elsewhere* in the tree.

## Suite baseline (this tree)

| Suite | Result |
| --- | --- |
| pytest (`ai_router`) | **3149 passed / 6 skipped** (626s). Same as S2's close — this session adds no Python to the package. |
| `guidance_report --check` | **OK**, 10,895 / 12,000 tokens (91% of ceiling) |
| `tutorial_gate.py` | **OK**, exit 0 — re-run after the checklist rebuild |
| Layer 3 (Playwright) | **Red locally, green in CI.** See below. |

### Layer 3, in detail — a known residual, now characterised

All 28 specs fail locally inside `_electron.launch` before any window opens.
This is **not new**: it was recorded as an environment residual in S1's
disposition and restated in `s2-conventions.md`. What this session adds is the
diagnosis, in `s3-pre-walk-floor.md` §3 — four hypotheses tested and ruled out
(the inherited `ELECTRON_RUN_AS_NODE=1`, which is real but already defended
against by `electronLaunch.ts`'s allowlist; the VS Code version; the sandboxed
shell; the stale-bundle trap), reduced to `playwright-core` reporting *"Process
failed to launch!"*, with **one remaining hypothesis named as unproven** (local
Node 25.8.1 vs CI's pinned Node 20; no `nvm` present to falsify it).

**CI ran Layer 3 green on this session's own commits, on all three OS legs
including windows-latest.** This session changes no Explorer-rendering surface,
no state writer and no fixture — the surfaces L-064-12 arms Layer 3 for.

**A finding that Layer 3 was not run locally is not a defect of this session.**
A finding that the *follow-on* should have been fixed here is out of scope: the
session's Touches are the tutorial, S1's command, and this set's artifacts.

## Release contract

- **Extension `0.47.0` is PUBLISHED.** Its tag landed on `7f2f2f8` (S1's last
  commit), so what shipped is S1's tree. `git diff vsix-v0.47.0..HEAD` over the
  shipped extension touches exactly two consumer-bootstrap templates, neither on
  the walk path. Documented in `s3-pre-walk-floor.md` §2.
- **S2's template-link fix remains `[Unreleased]`**, by explicit operator
  decision on 2026-07-30 — folded into the next release rather than cutting
  `0.48.0` for a link description.
- **This session cuts no release and bumps no version**, because it changes no
  shipped code. Publishing is human-only per the constitution's
  irreversible-actions rule. **A finding that this session did not publish, or
  should have bumped, is out of scope.**

## By-design exclusions — please do not re-report these

1. **The GHE / `runas` prerequisite cost is triaged, not fixed.** The walk's
   dominant time sink was the operator's organisation-specific login topology
   (a Windows account linked to GHE, launched via `runas` with a dedicated VS
   Code profile; three logins remain). It is **correctly excluded from the
   number** — the sample is hostless and never contacts a host; the GHE login is
   what makes *Copilot* work. Host and identity onboarding is an explicit spec
   **non-goal** for `hello-world.md`, and adding it would rebuild the cognitive
   load this set exists to remove (`project-guidance.md`:
   removal-over-addition). Named as a follow-on set in `s3-walk-evidence.md`.
   **A finding that the tutorial should document GHE setup is a request to
   re-break the document.**
2. **The UAT checklist was deliberately cut from nine items to four**, on
   operator instruction — the nine-item version was rejected as "daunting and
   tedious". Human-facing text went 15,149 → 2,588 characters. **A finding that
   the checklist should cover more surface is contradicted by the operator's
   own direction**, which is recorded in the commit and in
   `s3-checklist-builder.py`'s module docstring. Coverage that automation
   already settles belongs in the suites, not in a human's evening.
3. **`s3-checklist-draft.json` is a raw routed artifact** — the routed model's
   unedited output, kept as the audit trail for what was authored versus what
   was bound. It is **not** the shipped checklist and its known-wrong claims
   (a "new VS Code window", the wrong progress labels) are the *reason* it is
   kept. Do not report its contents as defects.
4. **`Passes: true` on all four items is correct now** and was `false` before
   the walk. False meant NOT YET WALKED.
5. **The set's spec is immutable at runtime.** `requiresUAT: true`,
   `requiresE2E: true`, `pathAwareCritique: advisory` were recorded at set
   start. A disagreement with a flag belongs in the Step 9 review, not here.

## What a material finding would look like here

- A **factual contradiction** between artifacts — e.g. the evidence claiming
  something the checklist or the activity log denies, or a number that does not
  match across files.
- An **overclaim**: any place the attestation asserts more than the walk
  actually established, or where the estimate/transcription limits are dropped.
- A **broken or wrong reference**: a cited test name, file path, commit or CI
  job that does not exist or does not say what it is cited for.
- A **bookkeeping defect** that would mislead the next orchestrator:
  `disposition.json`, `session-state.json`, the change log, or the follow-on
  descriptions.
