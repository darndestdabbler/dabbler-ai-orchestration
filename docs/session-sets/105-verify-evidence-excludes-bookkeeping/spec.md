# Verification Evidence Excludes Framework Bookkeeping Spec

> **Purpose:** Close a **verification false-positive loop** in
> `ai_router.verify_session`: lazily-synthesized `session-state.json` files
> (blessed-writer / read-triggered output) are inlined into the evidence
> bundle as if they were session deliverables, and the cross-provider
> verifier — correctly applying the repo's "state files are written by
> blessed writers, **never hand-authored**" discipline — flags them as a
> spec violation. The finding never clears (observed: 3 rounds, same
> finding, Sonnet 4.6 driving the module Hello-World tutorial) because the
> files are re-created **out of band** by any all-sets status scan, so
> deleting them between rounds does not help. This set makes
> `verify_session` render framework state/ledger bookkeeping as **expected
> output, not reviewed work**, killing the false positive without blinding
> the verifier to *deliberate* state-machinery changes.
> **Created:** 2026-07-28
> **Session Set:** `docs/session-sets/105-verify-evidence-excludes-bookkeeping/`
> **Prerequisite:** None (complements Set 089's evidence-completeness fix; independent surface within the same module)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false            # Internal library code (verify_session evidence assembly); no UI surface.
requiresE2E: false            # Unit-testable library logic against a real git fixture; existing e2e suite still runs green.
uatScope: none
pathAwareCritique: none       # A tight, single-module fix; the mandatory cross-provider verify_session is the review.
```

> Rationale: `tier: full` because this is **verification-integrity-adjacent**
> code and the standing no-skip mandate applies to any change to the evidence
> pipeline (the builder cannot release itself). Kept to **one tight session**,
> matching sibling Set 089. UAT/E2E off (internal library);
> `pathAwareCritique: none` because the routed `verify_session` already
> provides the cross-provider review and the change is single-module.

---

## Project Overview

### Root cause (precise — corrects the field diagnosis)

The field report attributed the loop to `verify_session` "auto-bootstrapping"
state files. That is **directionally right but wrong on the writer**, and the
misattribution is why the "delete before each run" workaround failed:

1. **`verify_session` never writes state.** It resolves the session through
   [`read_session_state`](../../../ai_router/session_state.py) →
   [`read_raw_session_state`](../../../ai_router/session_state.py), which is
   **read-only** and returns `None` when the file is absent.
2. **The lazy-synth writer is [`read_status`](../../../ai_router/session_state.py).**
   For any folder with a `spec.md` but no `session-state.json`, it calls
   `ensure_session_state_file`, which writes a `not-started` (or presence-
   inferred) state file — the Set 7 "every spec folder carries a state file"
   invariant. The caller that runs this across **every** set is the **Work
   Explorer refresh** (and any all-sets status scan). In the module tutorial
   there are several planned specs, so a refresh materializes a `not-started`
   `session-state.json` for each as an **untracked** working-tree file. This
   is intended framework behavior, and these files carry **no** `session-events.jsonl`
   ledger entry (they are read-triggered synth, not a blessed lifecycle write).
3. **`verify_session` then inlines them as deliverables.**
   [`_collect_untracked_contents`](../../../ai_router/verify_session.py) reads
   the CONTENT of every non-ignored untracked file and
   [`EvidenceBundle.as_response_under_review`](../../../ai_router/verify_session.py)
   renders it under "Untracked file contents (new files, absent from the
   diff)." The verifier sees `session-state.json` blobs with `status:
   not-started`, applies the repo rule
   ([`project-guidance.md`](../../planning/project-guidance.md) L186 +
   Constitution "blessed writers only"), and flags them as hand-authoring
   violations. **They are machine-written, so the finding is a false positive.**
4. **The loop is un-closable from the orchestrator seat** because the next
   Explorer refresh / status scan re-synthesizes the files out of band —
   `verify_session` itself does not, so "delete then re-verify" cannot win.

### Approach (recommended; one open sub-decision for the session)

**Primary fix — reclassify framework bookkeeping in the untracked collector.**
Framework state/ledger bookkeeping files are **loop bookkeeping, not reviewed
work** — the same category `verify_session`'s own ledger machinery already
names for the `sN-issues*.json` / remediation sidecars ("loop bookkeeping, not
reviewed work"). Partition them out of BOTH existing untracked buckets
(`included` = inlined content, and `omitted` = "review directly, do not assume
clean") into a **new, calm classification** rendered as *"Expected framework
bookkeeping (blessed-writer / lazy-synth output — not reviewed work; the
schema, close gate, and writer-discipline check own this surface)."* The set:

- `session-state.json`
- `session-events.jsonl`
- `activity-log.json`

Classification is **by filename**, so it covers the set-under-review's own
in-progress state file AND sibling sets' not-started files uniformly (both are
blessed-writer output that does not need cross-provider review). The files stay
visible in `git status --short` (honesty preserved — exclusion is never
silent).

**Deliberately NOT a `DEFAULT_DIFF_EXCLUDES` entry.** A blanket pathspec
exclude would also drop **tracked** changes to these files from the diff —
blinding the verifier to legitimate state-machinery work (schema/meta sets like
047/030, and committed test fixtures). The tracked diff is left **untouched**:
a session whose actual deliverable is a state-file change still surfaces it for
review. Only the *untracked-content inlining* is reclassified.

**Open sub-decision (settle in-session, via the mandatory cross-provider
verify and — if the orchestrator wants — decision-time consensus):**
whether to ALSO add a short verifier-facing framing line to
`ai_router/prompt-templates/verification.md` (belt-and-suspenders: tell the
verifier that a `not-started` state file matching the blessed shape is expected
framework output). The structural reclassification is the load-bearing fix;
the template line is an optional reinforcement. Prefer the smaller change if
the reclassification alone proves sufficient.

### Non-goals

- **Not** a change to the lazy-synth itself (`read_status` /
  `ensure_session_state_file`) or the Work Explorer scan. The "every spec
  folder carries a `session-state.json`" invariant (Set 7) is load-bearing —
  touching it risks the N−1/N Explorer display drift the schema doc warns
  about. The correct layer for this fix is the **verification evidence
  pipeline**, matching Set 089.
- **Not** any change to the SS1–SS3 decision-logic / integrity code, the
  Set 089 depth-agnostic excludes, or the oversized-input guard — those stand.
- **Not** excluding **tracked** state/ledger changes from the diff (see above).
- **Not** a router version bump / publish (operator-gated; recorded at release
  time, not here).

---

## Sessions

### Session 1 of 1: Reclassify framework bookkeeping in the evidence bundle

**Steps:**
1. Register (`start_session`); read this spec and the two root-cause anchors
   (`verify_session.py` `_collect_untracked_contents` / `EvidenceBundle`;
   `session_state.py` `read_status` / `ensure_session_state_file`).
2. **Fix** — introduce a `FRAMEWORK_BOOKKEEPING_FILES` set
   (`session-state.json`, `session-events.jsonl`, `activity-log.json`) and a
   third partition in `_collect_untracked_contents` (or a dedicated field on
   `EvidenceBundle`) so these untracked files are neither inlined nor placed in
   the "review directly / do not assume clean" bucket. Render them under a new
   `as_response_under_review` section framed as expected framework bookkeeping,
   not reviewed work. Keep them in `git status --short`. Leave the tracked diff
   and `build_diff_pathspecs` untouched.
3. **Fix tests** (unit, against a real `git` fixture):
   - An untracked sibling `docs/session-sets/<other>/session-state.json` with
     `status: not-started` is **NOT inlined** and **NOT** in the
     "review directly" bucket — it renders under the bookkeeping section.
   - A genuine non-bookkeeping untracked deliverable (e.g. a new source or doc
     file) is **still inlined** (no regression to SS3 coverage).
   - A **tracked** change to `session-state.json` (committed fixture / meta
     edit) **still appears in the diff** — the tracked path is not suppressed.
   - `session-events.jsonl` and `activity-log.json` are covered symmetrically.
4. **(Conditional)** If the session settles the open sub-decision toward the
   template reinforcement, add the framing line to `verification.md` and assert
   the Set 084 F3 template-pin test stays green (the canonical file's pinned
   region is unchanged / the pin is updated deliberately).
5. Build + **full pytest suite** green; mind the two CI-only conditions (run
   the drift guard; confirm no `copilot`-CLI dependence — suite green under
   no-`copilot`).
6. Verify (mandatory, routed cross-provider `verify_session`). Handle the
   verdict **by severity** (Minor-only ⇒ effectively VERIFIED; do not grind).
   This session is its own best regression witness: the round's evidence should
   render the reclassified bookkeeping section rather than flagging its own
   `session-state.json`.
7. Author `disposition.json`; commit **and** push; `close_session`; notify;
   Step 9 reorg review; end-of-set `change-log.md`. Record the corrected
   root-cause + writer-attribution as an instrumental lesson.

**Creates:** Fix test module (or additions to the existing `verify_session`
test suite) with a real-git fixture exercising the three buckets; `change-log.md`.
**Touches:** `ai_router/verify_session.py` (`_collect_untracked_contents`,
`EvidenceBundle`, `as_response_under_review`; new `FRAMEWORK_BOOKKEEPING_FILES`
constant), `ai_router/CHANGELOG.md`, and — conditionally —
`ai_router/prompt-templates/verification.md`.
**Ends with:** an untracked `not-started` `session-state.json` (own set or
sibling) renders as **expected framework bookkeeping**, never as inlined
"hand-authored" content nor as "review directly / do not assume clean" (proven
by tests); a genuine untracked deliverable is still inlined; a **tracked**
state-file change still appears in the diff; the full suite is green (incl. the
no-`copilot` and drift-guard conditions); cross-provider VERIFIED (or
Minor-only); pushed; `close_session` succeeded.
**Progress keys:** bookkeeping-reclassified, sibling-not-inlined,
real-deliverable-still-inlined, tracked-state-change-still-visible,
suite-green, set-closed

---

## End-of-set deliverables

- Framework state/ledger bookkeeping files render as an explicit
  "expected framework bookkeeping — not reviewed work" evidence section in
  `verify_session`, out of both the inlined and "review-directly" buckets,
  proven by tests; the tracked diff and untracked-deliverable inlining are
  unaffected.
- (Conditional) A verifier-facing framing line in `verification.md` if the
  session settles the open sub-decision toward reinforcement.
- Full suite green under the two CI-only conditions; `CHANGELOG.md` entry;
  `change-log.md`; the standard per-session artifacts; the corrected
  root-cause lesson cited.
