# Verification Loop & Ceremony Simplification Spec

> **Purpose:** Verification grew 5.5× (13 → 72 min median per session) while
> work only doubled; the round bounds are printed but not enforced and were
> exceeded in practice (13 calls / 379 min in one session, 9 rounds in
> 110 S1); UAT is dreaded and routinely bypassed; and the operator is asked
> to adjudicate decisions the AI holds more context on. This set makes the
> loop's bounds real, converts fix-checking from open-ended re-review into
> executable acceptance criteria, moves judgment-shaped decisions to a
> rubric with the human as auditor, and re-genres UAT into a ten-minute
> guided look. It is the codification of two operator-elevated principles —
> the **capability-scaling test** and the **decision-rights rubric** — whose
> canonical text is §11 of
> [`docs/proposals/2026-08-04-verification-loop-parallelisation-vs-acceptance-criteria.md`](../../proposals/2026-08-04-verification-loop-parallelisation-vs-acceptance-criteria.md).
> **Read that document before Session 1. It is the decision record this set
> executes; do not re-litigate what it settles.**
> **Created:** 2026-08-05
> **Prerequisite:** Set 110 complete (its operator-notes piloted the policies
> this set canonizes; its S1–S3 history is the measured evidence).
> **Session Set:** `docs/session-sets/111-verification-loop-and-ceremony-simplification/`
> **Workflow:** Orchestrator → AI Router → Cross-provider verification
> **Temporary execution policy (2026-08-05):** The active orchestrator owns
> implementation and architecture decisions. Only `session-verification` is
> outsourced, using a different effective provider. This set owns the next
> routing-policy revision as part of its verification-loop simplification.
>
> **Context for an orchestrator new to this thread:** the operator's staff
> may abandon the orchestrator for being too complicated. The standing rule
> is **adoption dominates rigour** — cut the CEREMONY (artifacts, checklists,
> rounds a human must drive), keep the MACHINERY (a routed call costs the
> developer nothing). Set 110's `operator-notes.md` (2026-08-05 sections)
> piloted every policy here in prose; this set turns them into code and
> canonical docs.

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: true         # S4 dogfoods the new guided-look UAT format on itself; the format's pleasurability is not knowable from a diff.
requiresE2E: false        # No Explorer-rendering surface is touched. Router + docs + close-out machinery only.
uatStyle: ad-hoc
uatScope: per-set
pathAwareCritique: advisory
prerequisites:
  - slug: 110-work-explorer-native-treeview
    condition: complete
```

---

## Decisions already made — do not reopen

1. **Proposal A (parallel lens wave) is dead as framed.** Its only residue:
   vary the framing of the K=2 discovery fan-out (same cost, same position).
   No experiment first — the change cannot plausibly be worse than identical
   prompts, and measuring it would be ceremony (proposal §10 Q1, resolved).
2. **Proposal B (verifier-authored acceptance criteria) proceeds, gated by
   baseline discrimination**: a criterion may auto-close a finding only if
   the harness runs it unchanged against both the pre-fix and fixed trees
   and it fails-before / passes-after. Criteria that pass pre-fix stay
   judgment-based. No adequacy checker is built — sufficiency is delegated
   to the retained final review (§10 Q2/Q3, resolved).
3. **One `remediation-review` is retained** as the final holistic delta look.
   The 109 S4 counterexample (a fix broke an adjacent deliverable no
   criterion could have anticipated) bounds B (proposal §9).
4. **The bounds fail because nothing enforces them** — verified in code:
   `count_phase_rounds` feeds only an advisory message
   (`verify_session.py`, "Next action" block). The fix is enforcement, not
   a different number (§10 Q5, resolved).
5. **Adjudication settles the stop, not the truth.** 110 S1: two MAY_CLOSE
   third-party adjudications were proven wrong by a real-host measurement
   (stub figures 10× off). A finding waived at the bound is an owed
   residual with a named owner — never argued down (110 operator-notes,
   2026-08-05).
6. **Decision routing is by authority, not judgment-load.** The rubric and
   education-mode brief format are fixed in proposal §11 (operator-directed
   bullet). Decisions that reduce verification stay human — always.
7. **The test-run policy and guided-look UAT format are as piloted** in
   110 operator-notes (2026-08-05 sections); this set canonizes, it does
   not redesign.

## Non-goals

- **No consequence-weighted budget machinery.** The enforced 2+2 bounds are
  the stop rule for now; budgets-instead-of-counts is a recorded follow-on,
  not this set.
- **No ledger/no-resurrection removal yet.** Proposal B may eventually
  replace them, but they stay until B has a few sessions of record —
  removal is a follow-on with its own evidence.
- **No Lightweight-tier work.** That is reserved Set 112
  ([reservation](../../proposals/2026-08-05-set-112-reservation-remove-lightweight-tier.md)).
- **No changes to provider exclusion or ground-truth anchoring.** Both are
  permanently exempt from simplification (capability-scaling test, §11).
- **The `dabbler-uat-checklist-editor` choice-type item is operator-owned
  work in its own repo** — coordinate the schema, do not build it here.

---

## Sessions

### Session 1 of 4: Make the bounds real

**Steps:**

1. Register. Read the proposal doc §2–§11 and 110 operator-notes in full.
2. **Enforce the phase bounds in `verify_session`**: refuse to run a third
   discovery pass or a third remediation-review cycle unless an explicit
   operator-authorization flag is passed (mirror the `--manual-verify`
   attestation pattern; record the authorization in the round artifact).
   A hard stop directs the orchestrator to the operator/adjudication path
   it already prints today.
3. **Vary the discovery framing**: the K=2 fan-out sends two *differently
   framed* prompts (e.g. spec-conformance lens vs. failure-scenario lens)
   instead of identical ones. Same K, same cost, same envelope merge.
4. **Wire severity-gated stop into the exit path**: when a round's findings
   are Minor-only, the CLI says so and directs close, not another round
   (the L-095-1 rubric already grades; make the stop structural).
5. Tests for all three: a third-cycle invocation without the flag fails
   with the operator message; framing variants are distinct and recorded;
   Minor-only rounds direct to close.
6. Verify, close. (This session's own verification runs under the newly
   enforced bounds — it is the first consumer.)

**Creates:** enforcement + framing changes in `ai_router/verify_session.py`, tests
**Touches:** `verify_session.py`, its tests, `docs/ai-led-session-workflow.md` (bounds section), `docs/session-constitution.md` (same)
**Ends with:** a third cycle is structurally impossible without recorded operator authorization; discovery K=2 uses two framings; Minor-only rounds direct to close.
**Progress keys:** `boundsEnforced`, `framingVaried`, `severityStopWired`

---

### Session 2 of 4: Acceptance criteria with baseline discrimination

**Steps:**

1. Register. Re-read proposal §5 (Proposal B), §6 (the OpenAI critique and
   its baseline-discrimination guard), §9 (the counterexample).
2. **Extend the verifier envelope**: each Critical/Major finding carries an
   `acceptance` block — an executable check (command + expected exit/output)
   where possible, one prose sentence where genuinely judgment-based.
   Prompt-template change plus envelope schema change.
3. **Build the harness runner**: after remediation, run each unchanged
   criterion against the captured pre-fix tree AND the fixed tree, in a
   **disposable worktree** checked out from the tree objects
   `verify_session` already captures (never the live working tree — this is
   the untrusted-shell containment, proposal §6). Fails-before AND
   passes-after ⇒ the finding auto-closes with both outputs recorded.
   Anything else ⇒ judgment-based, goes to remediation-review as today.
4. **Retain exactly one `remediation-review`** as the final holistic look at
   the full fix delta. Its scope note gains: criteria-closed findings are
   listed with their evidence; the reviewer's job is what the fixes *broke*
   and what the criteria *missed*, not re-litigating closed findings.
5. Tests: a vacuous criterion (passes pre-fix) cannot auto-close; an edited
   criterion or test asset invalidates the result; worktree cleanup runs on
   every path.
6. Verify, close — with this session's own remediation using the new
   criteria path (dogfood).

**Creates:** acceptance-criteria emission + harness runner + disposable-worktree execution, tests
**Touches:** `verify_session.py`, the session-verification prompt template, envelope schema docs, `docs/ai-led-session-workflow.md`
**Ends with:** fix-checking is criterion-execution plus one holistic review; the target metric is the p90/tail of verification time, not the median — record before/after expectations honestly.
**Progress keys:** `criteriaEmitted`, `baselineDiscrimination`, `worktreeExecution`, `singleFinalReview`

---

### Session 3 of 4: Decision rights and education mode

**Steps:**

1. Register. Read proposal §11's decision-rights bullet — it is the spec.
2. **Canonize the rubric** in `docs/ai-led-session-workflow.md` (replacing
   the current human-only/consensus-eligible split of decision-time
   consensus): human-required = external/hard-to-reverse consequences,
   underivable value trade-offs, accountability sign-offs, and anything
   reducing verification; everything judgment-shaped is AI-decidable via
   the ordered tiebreaks (goal over letter → reversible → simpler/fewer
   tests → defer to existing gate → cross-provider consensus → human).
3. **Build the decision journal**: a per-set `decisions.jsonl` appended by a
   small blessed writer — decision, rubric line that fired, options
   considered, reversibility. UX-preference deferrals are tagged for the
   UAT Decide section (S4 consumes this).
4. **Education-mode brief format**: a short canonical template (where the
   set stands / the question in one sentence / options with consequences /
   recommendation with confidence / default on no answer) required for any
   operator stop, documented where `AskUserQuestion`-style stops are
   described.
5. Tests: journal writer round-trips; a verification-reducing decision
   routed to the rubric is refused (must go to the operator).
6. Verify, close.

**Creates:** decision journal writer + `decisions.jsonl` artifact, rubric + education-mode sections in workflow doc
**Touches:** `docs/ai-led-session-workflow.md`, `router-config.yaml` (`delegation.decision_consensus` gates), a new small `ai_router` module
**Ends with:** judgment-shaped decisions are journaled AI calls; operator stops arrive as education-mode briefs; verification-reducing calls structurally cannot be self-authorized.
**Progress keys:** `rubricCanonized`, `decisionJournal`, `educationModeTemplate`, `verificationCarveOutEnforced`

---

### Session 4 of 4: Ceremony pass — artifacts, session size, tests, UAT

**Steps:**

1. Register.
2. **Artifact-necessity pass.** For every artifact a session is *required*
   to produce, answer: **who reads this, and what decision does it
   change?** Candidates already suspected: per-session `sN-conventions.md`,
   the `ai-assignment.md` block, `change-log.md` vs `disposition.summary`
   overlap, one-raw-artifact-per-round. Present the table to the operator
   as education-mode Decide items (batch, not one-by-one); retire what the
   operator strikes. **Do not pre-judge — the answer is the operator's.**
3. **Session-size cap at authoring time**: an authoring-guide paragraph +
   admission test — target 15–20 min of work per session; a spec step list
   that plainly exceeds it is split at authoring, not discovered at hour
   three.
4. **Canonize the test-run policy** (piloted in 110 operator-notes): cheap
   suites freely; expensive suites targeted during the session and fully
   exactly once at session close after code freeze, selected by what the
   diff touched; full matrix once at the release boundary; rendering
   sessions always pay their own Layer 3; CI is backstop, never gate.
   **Include an executable freshness check in the close gate**: the full
   run-of-record must postdate the last change to the surfaces it covers —
   a timestamp comparison, not a judgment call. Evidence basis: 110 S3
   tried to close on a full run that predated three test fixes, disclosed
   it in the sidecar, and was correctly refused by the backstop; the
   orchestrator agreed with the policy and slipped anyway. Prose does not
   survive end-of-session pressure; a check does.
5. **Canonize the guided-look UAT format** (piloted in 110 operator-notes):
   Look ≤5 + Decide ≤3, three lines per item, ten minutes, self-contained
   items, Decide sourced from the decision journal. **Close gate:** a
   `requiresUAT` session closes only with its walk or an operator-attested
   waiver recorded in the disposition — never silently.
6. **Walk stager**: one entry point that launches the real Extension
   Development Host with a fixture so a walk starts itself (reuse the
   Playwright `launchVSCode` machinery, assertions off).
7. **Dogfood:** author this set's own UAT walk in the new format and have
   the operator walk it — the walk *is* the acceptance test for
   pleasurability.
8. Router CHANGELOG under `[Unreleased]`; **publish stays operator-gated.**
9. **Guidance-doc streamlining pass, and raise the admission bar.**
   `project-guidance.md` and `lessons-learned.md` are preload — read at every
   session start — so every line in them is a tax on every future session.
   Two things to settle, both operator decisions:
   - **Streamline what is already there.** `project-guidance.md` currently sits
     **+369 tokens over its 3,499-token ceiling** (Set 110 Step 9 measured it;
     ~61 tokens of that predate Set 110). Prune, merge or demote to on-demand
     references until it is under — the lifecycle rule is that ceilings ratchet
     DOWN, so raising the number is the last resort and needs a stated reason.
   - **Raise the bar for what gets in.** Set 110 Step 9 exposed a structural
     problem the admission test does not currently catch: **promotion is
     additive into a file that is already at its ceiling.** Three lessons were
     promoted on overwhelming evidence (27, 14 and 9 citing sets) and the file
     went further over, with no mechanism forcing anything out to make room.
     Candidate rules for the operator: a promotion must name what it displaces;
     an entry must be expressible in N tokens or it is a doc, not guidance; and
     a rule with an executable gate is archived rather than carried as prose.
   Evidence basis is in `docs/session-sets/110-work-explorer-native-treeview/`
   and the Set 110 Step 9 commit.
10. **CI hygiene: pin actions to commit SHAs, and re-decide what CI is FOR.**
    Two operator-raised items from the Set 110 release attempt.
    - **Pin `uses:` to full commit SHAs, not tags.** GitHub's own hardening
      guidance: a mutable tag (`actions/checkout@v4`) can be repointed, so a
      supply-chain compromise of an action reaches every workflow that
      references it. Convert `.github/workflows/*.yml` to
      `owner/action@<40-char-sha>  # vX.Y.Z` and state how they get bumped
      (Dependabot handles SHA pins and rewrites the trailing comment). The
      current surface is 31 references across the three workflows:
      `actions/checkout@v4` ×10, `actions/setup-node@v4` ×6,
      `actions/setup-python@v4` ×5 (plus one stray `@v5` — worth converging
      while in here), `actions/download-artifact@v4` ×4,
      `actions/upload-artifact@v4` ×3, and
      `pypa/gh-action-pypi-publish@release/v1` ×2. That last one is the
      sharpest: it is a **moving branch**, not even a tag, and it is on the
      PyPI publish path.
    - **Re-decide whether `require-green-test` should be a hard release
      gate.** The operator's question, in their words: *"Do we really need to
      do CI here? We ran all the tests locally."* The Set 110 evidence cuts
      **both** ways and the set should weigh it rather than assume:
      - **For CI.** It catches a class local runs structurally cannot. The
        `drift-guards` job had been red on every commit while passing on the
        developer machine *for the same commit* — because a dev machine has
        `ai_router` installed and this repo's gitignored
        `local-overrides.yaml` selects the `copilot-cli` profile, which skips
        the API-key check the guard needs. That is exactly the fresh-clone /
        wheel-consumer path, and it is invisible locally by construction.
        macOS is the same argument: nobody here has a Mac.
      - **Against the current wiring.** Two of the three red jobs in the
        release run were GitHub infrastructure — `Failed to resolve action
        download info / Service Unavailable`, and `The hosted runner lost
        communication with the server` after 47 minutes. Neither is a defect,
        yet both blocked a release whose full suite had already run green
        locally, and the gate offers no way to say so.
      The likely shape is to keep the coverage and change the gate's failure
      semantics — distinguish an infrastructure failure from a test failure,
      or allow an operator-attested override recorded in the disposition (the
      `--manual-verify` pattern this repo already uses elsewhere) — rather
      than choosing between "hard gate" and "no CI".
11. Verify, close. Author `change-log.md`, Step 9 review, advisory
    path-aware critique.

**Creates:** authoring-guide sections (size cap, test policy, UAT format), `requiresUAT` close gate, walk stager, this set's guided-look walk, `change-log.md`
**Touches:** `docs/session-set-authoring-guide` (or its current home), `ai_router/close_session.py` / `gate_checks.py`, `docs/ai-led-session-workflow.md`, `docs/planning/project-guidance.md`, `docs/planning/lessons-learned.md`, `.github/workflows/*.yml`
**Ends with:** the required-artifact list is operator-pruned; oversized sessions are split at authoring; the test policy and UAT format are canonical; UAT cannot silently evaporate; the preload docs are back under their ceilings with a raised admission bar that makes promotion displace rather than accumulate; CI actions are SHA-pinned and the release gate distinguishes an infrastructure failure from a test failure; the operator has walked a guided-look UAT and judged it — the word to beat is "pleasurable."
**Progress keys:** `artifactTableDecided`, `sessionSizeCap`, `testPolicyCanonized`, `uatFormatCanonized`, `uatCloseGate`, `walkStager`, `dogfoodWalk`, `guidanceStreamlined`, `ciHygiene`

---

## End-of-set deliverables

- Enforced verification bounds (operator-authorized exceptions only), varied discovery framing, structural severity-gated stop.
- Verifier-emitted acceptance criteria with baseline discrimination, executed in disposable worktrees; one retained holistic remediation-review.
- The decision-rights rubric canonized; decision journal; education-mode briefs at every operator stop; verification-reduction carve-out enforced.
- Operator-pruned required-artifact list; authoring-time session-size cap; canonical test-run policy; guided-look UAT with a fail-closed close gate and a self-staging walk.
- Preload guidance docs back under their ceilings, with an admission bar that makes promotion **displace** rather than accumulate.
- Router changes staged under `[Unreleased]`; publish operator-gated.

## Risks this set should expect

- **S2 is the deep water.** Criterion quality is the known weakness
  (proposal §6): vacuous and narrow criteria are contained by baseline
  discrimination plus the retained review, but expect the first sessions
  under B to need judgment-based fallback often. That is fine — the tail,
  not the median, is the target.
- **The artifact pass (S4.2) is operator-authority territory.** Batch the
  decisions; do not trickle questions. If the operator strikes little, that
  is the answer — record it and stop.
- **Self-reference:** S1 changes the loop that verifies S1. Sequence each
  session's own verification under whatever the code was at its close; do
  not hand-patch mid-session.
- **Copilot-seat orchestration** (if this set is run from the office seat):
  provider provenance is asserted; the exclusion applies against the seat's
  catalog lockfile. The seat confirmed three provider families on
  2026-08-05, so exclusion has room — but run
  `python -m ai_router.copilot_preflight` before S1 registers.
