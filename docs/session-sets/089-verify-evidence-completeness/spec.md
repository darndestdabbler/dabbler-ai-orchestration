# Verification Evidence Completeness Spec

> **Purpose:** Close an **upstream evidence-completeness** gap in
> `ai_router.verify_session` that the SS1–SS3 remediation (0.32.0) did not
> cover. The loop's *decision logic* and evidence *integrity* are fixed; this
> set fixes whether the evidence the verifier sees is **complete**. Two causes,
> both observed to churn a real Full-tier session for 6 rounds: (A) generated-
> bundle excludes only match **top-level** dirs, so a **nested** bundle
> (`tools/dabbler-ai-orchestration/dist`, ~4,400 lines) floods the diff and
> truncates the real source; (B) there is **no oversized/truncated-INPUT
> guard**, so when the diff overruns the model's context the verifier reviews
> partial evidence with **no signal it is partial** and emits unrated findings
> that the anti-laundering rule (correctly) treats as blocking → garbage-in,
> garbage-out churn. Fixing (A) also **retires the per-repo `--exclude
> tools/dabbler-ai-orchestration/dist` memory workaround**. Source problem
> statement: [`docs/ss4-evidence-completeness-problem.md`](../../ss4-evidence-completeness-problem.md).
> **Created:** 2026-07-10
> **Session Set:** `docs/session-sets/089-verify-evidence-completeness/`
> **Prerequisite:** None (independent of Sets 087/088; complements 0.32.0)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false            # Internal library code (verify_session); no UI surface.
requiresE2E: false            # Unit-testable library logic; existing e2e suite still runs green.
uatScope: none
pathAwareCritique: none       # A tight, single-module fix with a pre-decided approach; the mandatory cross-provider verify_session is the review.
```

> Rationale: `tier: full` despite the source doc's "lightweight" sizing hint —
> this is **verification-integrity-adjacent** code, and the standing no-skip
> mandate plus "the builder cannot release itself" argue for real cross-provider
> review of any change to the evidence pipeline. Kept to **one tight session**
> to honor the "small, code-only" intent. UAT/E2E off (internal library);
> `pathAwareCritique: none` because the routed `verify_session` already provides
> the cross-provider review and the change is single-module.

---

## Project Overview

### Root cause 1 — excludes match TOP-LEVEL only
`DEFAULT_DIFF_EXCLUDES` (`verify_session.py:136`) holds bare names (`dist`,
`out`, `node_modules`, `.venv`, `__pycache__`, `*.vsix`); `build_diff_pathspecs`
(`:392`) wraps each as the **root-anchored** pathspec `:(exclude)<name>`, which
excludes a **top-level** `dist/` only. This repo's compiled bundle is nested at
`tools/dabbler-ai-orchestration/dist`, so it is not excluded and floods the
diff. `_collect_untracked_contents` (`:476`) shares `build_diff_pathspecs`, so
**one fix to the excludes fixes both the main diff and the untracked collector.**

### Root cause 2 — no oversized/truncated-INPUT guard
The only truncation handling (`verify_session.py:~1154`) catches a truncated
verifier **OUTPUT** (`result.truncated`). There is **no guard on the INPUT**:
when the assembled evidence overruns the model's context, the source is
truncated silently and the verifier reviews partial evidence. This is the mirror
of SS3's "untracked-omitted → explicitly uncovered" honesty, applied to the diff
itself.

### Approach (pre-decided by the source doc)
- **Fix A (primary):** make the default excludes **depth-agnostic** so a nested
  `**/dist/**` is excluded without a manual `--exclude`. **The exact git
  pathspec syntax must be proven by a test** — pathspec nesting is finicky and
  version-sensitive; do not assume it, prove it against a real `git` invocation.
  Apply the same depth-agnostic treatment to `out` / `node_modules` / `.venv` /
  `__pycache__`; confirm `*.vsix` still matches. **Keep the existing top-level
  `dist/` exclusion behavior green** (a top-level `dist/` must stay excluded).
  A depth-agnostic rule necessarily also matches a source dir named `dist`
  (e.g. `src/dist`), so make exclusion **honest** rather than narrow: report
  excluded **tracked** files as an explicit "review directly" section (the same
  treatment SS3 gave excluded *untracked* files), so a real source path is never
  *silently* dropped from review — preserving the SS3 completeness guarantee
  while extending exclusion to nested bundles.
- **Fix B (guard):** add a size guard on the assembled evidence (diff + inlined
  untracked content). Over a configurable threshold, **fail closed** with an
  actionable message ("evidence may be incomplete — exclude generated files or
  split the change"), modeled on SS3's truncation-fails-closed posture — never a
  silent pass on a diff the model will truncate. The threshold is a design
  decision for this session (a fail-closed with actionable guidance is the
  safest, most consistent choice).

### Non-goals
- **Not** the prompt-template change requiring a severity on every finding (the
  source doc's "Related, optional, NOT code" item) — a separate follow-up item.
- **Not** any change to the SS1–SS3 decision-logic / integrity code (that
  shipped in 0.32.0 and stands).
- **Not** a router version bump / publish (operator-gated; recorded at release
  time, not here).

---

## Sessions

### Session 1 of 1: Depth-agnostic excludes + oversized-input guard

**Steps:**
1. Register (`start_session`); read this spec + `docs/ss4-evidence-completeness-problem.md`.
2. **Fix A** — make `DEFAULT_DIFF_EXCLUDES` / `build_diff_pathspecs` exclude
   generated dirs at **any depth**. Empirically determine the correct
   `:(exclude,glob)` pathspec (e.g. `**/dist/**` alongside the top-level form)
   by running real `git` against a fixture — do not assume syntax.
3. **Fix A test** — a fixture repo with a **nested** tracked large
   `tools/x/dist/bundle.js` plus a real source file: `assemble_evidence(...)`'s
   diff **includes the source and excludes the nested bundle**; the existing
   **top-level `dist/` exclusion test stays green**; extend coverage to `out` /
   `node_modules` / `__pycache__` and confirm `*.vsix`.
4. **Fix B** — add an assembled-evidence size guard; over the threshold, fail
   closed (`EXIT_VERIFICATION_UNAVAILABLE`, writing nothing) with an actionable
   message. Thread it so both the CLI and `assemble_evidence`/round path honor
   it.
5. **Fix B test** — an over-threshold evidence bundle yields the guard outcome
   (fail-closed / explicit incomplete-evidence signal), not a silent pass;
   an under-threshold bundle is unaffected.
6. Build + **full pytest suite** green; mind the two CI-only conditions (run the
   drift guard; confirm no `copilot`-CLI dependence — suite green under
   no-`copilot`).
7. Verify (mandatory, routed cross-provider `verify_session`). Handle the
   verdict **by severity** (Minor-only ⇒ effectively VERIFIED; do not grind).
8. Author `disposition.json`; commit **and** push; `close_session`; notify;
   Step 9 reorg review; end-of-set `change-log.md`.

**Creates:** Fix A + Fix B test modules (or additions to the existing
`verify_session` test suite); a nested-bundle fixture; `change-log.md`.
**Touches:** `ai_router/verify_session.py` (`DEFAULT_DIFF_EXCLUDES` /
`build_diff_pathspecs`; the assembled-evidence size guard), `ai_router/CHANGELOG.md`.
**Ends with:** a **nested** generated dir (`tools/**/dist`) is excluded from the
evidence diff at any depth (proven by a test), retiring the
`--exclude tools/dabbler-ai-orchestration/dist` workaround; oversized/truncated-
input evidence **fails closed with actionable guidance** (proven by a test); the
full suite is green (incl. the no-`copilot` and drift-guard conditions);
cross-provider VERIFIED (or Minor-only); pushed; `close_session` succeeded.
**Progress keys:** nested-excludes-depth-agnostic, fix-a-test-proves-pathspec,
oversized-input-fails-closed, fix-b-test, suite-green, set-closed

---

## End-of-set deliverables

- Depth-agnostic generated-bundle excludes in `verify_session.py`, proven by a
  nested-fixture test; the top-level exclusion behavior preserved.
- An oversized/truncated-input evidence guard that fails closed with actionable
  guidance, proven by a test.
- The `--exclude tools/dabbler-ai-orchestration/dist` per-repo memory workaround
  retired (superseded by the default depth-agnostic exclude).
- Full suite green under the two CI-only conditions; `CHANGELOG.md` entry;
  `change-log.md`; the standard per-session artifacts.
