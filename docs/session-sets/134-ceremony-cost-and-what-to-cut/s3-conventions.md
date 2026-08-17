# Session 3 verification conventions (up-front block, G-010)

Read this before the diff. It states the baseline, the contract, and the
by-design exclusions, so Round 1 spends its findings on real defects rather
than on things already agreed.

## What this session is

Set 134 Session 3 of 3, **re-scoped by an operator-directed Revision 1** from
"cut minutes" to **"cut context"**. The minutes premise (a claimed 2.3× rise in
ceremony cost) was tested in Session 1 and **did not reproduce**; the spec
strikes it through rather than deleting it. Session 3 therefore cuts the
**always-read preload corpus** and documents caps on the artifacts a session
writes every time.

**This session ships no product code.** The diff is Markdown documentation plus
one YAML data change (`ai_router/router-config.yaml`: the `guidance.preload`
ceiling numbers and their provenance comments). No Python module was added,
changed, or deleted. That is not an oversight — the set's governing rule is
**"no new module"**, and its stated rationale is that this repo's
characteristic failure is answering a problem with a new governor over the old
mechanism.

## Suite baseline

- **Targeted (A1), run after the last edit:** `pytest
  ai_router/tests/test_guidance_preload_manifest.py test_guidance_report.py
  test_guidance_meta.py test_config.py test_guidance_ledger.py`
  → **212 passed, 1 skipped**. These are the suites whose declared inputs
  intersect this session's change set (the preload manifest, the ceiling
  reporter, the lesson-marker validator, config loading).
- **`python -m ai_router.guidance_report --check` → exit 0**, every file and
  the total at exactly 100% of its (newly lowered) ceiling.
- **`python -m ai_router.validate_guidance_meta` → OK, 49 lesson ids across 3
  files** — identical to the pre-session baseline. The 20 `missing added-set`
  warnings on `project-guidance.md` are **pre-existing** and untouched here.
- **Full suites are deliberately NOT yet run** (A2): no full suite may precede
  a cross-provider stage, because remediation is a change that would invalidate
  it. The required portion runs at Step 6, after this verification concludes.

## Release contract

Nothing is bumped and nothing is published. No PyPI release, no Marketplace
release, no tag. `ai_router/router-config.yaml` is repo configuration, not
package API.

## By-design exclusions — please do not report these as defects

1. **Ceilings were ratcheted to exact measurement, leaving zero headroom.**
   Deliberate, journaled in `decisions.jsonl`, and required by the spec
   ("ceilings ratchet down only; lowering one after a cut is the point"). It
   preserves the manifest's token-neutral anti-rebloat property. Leaving slack
   was considered and rejected as an orchestrator unilaterally weakening a live
   gate.
2. **`lessons-learned.md` lost five sections.** They were **archived, not
   deleted** — moved whole to `lessons-archive.md` under *Archived by Set 134
   S3*, which is the sanctioned route and keeps every id greppable via
   `guidance_search --archive`. Verify the text is present there before
   reporting loss. No lesson id was removed: `validate_guidance_meta` counts
   the same 49 before and after.
3. **The three engine files lost five sections in lockstep.** Each removed
   section was a **pure pointer that `session-constitution.md` already carries
   inside the same preload** — so it was paid twice and bought once. The
   precedent is Set 121 S4, which collapsed six `project-guidance.md` entries
   on identical reasoning. `AGENTS.md` / `CLAUDE.md` / `GEMINI.md` shared
   bodies are byte-identical after the change, and `GEMINI.md` is still the
   largest (6,626 vs 6,542 vs 6,060 bytes), so the manifest's representative
   entry correctly did not move.
4. **The caps are conventions, not validators.** No enforcement code exists and
   none should. "There is no gate enforcing the 40-word cap" is the design, and
   a finding recommending one is recommending the exact anti-pattern the set's
   rule forbids. Session 2 independently established the hazard: a refusal is
   only cheap where the caller can retry for free.
5. **The net line count is POSITIVE (+294) and this is reported as a FAILURE**
   in `change-log.md`, not concealed. The spec required a net-positive count to
   be stated as a failed outcome; it is, in a section titled *The failure,
   stated as one*. A finding that the set added lines is correct but already
   self-reported — please grade it accordingly.
6. **`sN-conventions.md` and `disposition.json` were exempted from capping.**
   This is deliberate: capping the conventions block would shorten what a paid
   verifier reads and is therefore a **verification reduction**, a hard
   operator carve-out this set may not self-authorize.

## What IS in scope, and where to look hardest

- **Did any rule actually get lost?** The whole cut rests on "these pointers are
  duplicated elsewhere in the preload." If any removed sentence carried a rule
  that is *not* recoverable from `session-constitution.md`,
  `project-guidance.md` or `lessons-archive.md`, that is a real Major. This is
  L-064-8's failure mode (a successor doc inheriting claims) inverted.
- **Are the numbers right?** Every figure in `change-log.md` and the authoring
  guide is re-derivable from committed artifacts. Three of this repo's last
  four sets published a number that did not survive re-derivation, and Session 1
  of this very set refuted its own spec.
- **Broken cross-references.** Sections were removed that other docs may link
  to by heading anchor.
- **G-012 (propagate a consistency fix to every echo).** If a claim was changed
  in one file, every echo of it should have moved too.

## Severity rubric for this round (G-013)

Grade by **consequence**: probability the stated failure scenario reaches a real
user or a future session × impact. Low probability **or** low impact is Minor.
No nameable failure scenario is a nit. "A future orchestrator would not know
X" is only Major if X is genuinely unrecoverable from the preload plus the
on-demand references.
