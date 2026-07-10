# Follow-up problem: evidence completeness (nested-dir exclusion + oversized-input truncation)

**For:** a lightweight session set in `dabbler-ai-orchestration` (small, code-only).
**Context:** the SS1–SS3 remediation (shipped in `dabbler-ai-router` 0.32.0) fixed
the verification loop's *decision logic* and evidence *integrity*. This is a
separate, *upstream* gap in evidence **completeness** that the remediation did
not cover. It caused a real 6-round churn (below).

---

## Symptom (observed 2026-07-10)
A Full-tier session set churned for **6 rounds** of unrated "nits" (gpt-5-4
verifier; a Google third-provider attempt 429'd). Every actionable nit was fixed
in flight; the loop would not settle. Round 7 revealed the cause: the verifier
had been reviewing a diff **swamped by ~4,400 lines of generated bundle** with
the **actual source truncated**, so it kept emitting vague, unrated observations.
Adding `--exclude` for the nested bundle path made round 7 return **VERIFIED,
zero findings**. The operator had to save a memory to pass the flag in future —
a per-repo workaround this fix should retire.

**Why the severity-array didn't prevent it:** the array/severity work governs how
the loop *classifies and exits*, not whether the *evidence* is any good. The
findings were **unrated**, and SS1 deliberately treats unknown/missing severity
as **blocking** (anti-laundering — an unrated finding can't be confirmed
non-blocking). So the loop *correctly* refused to close; the root problem was that
broken evidence kept producing unrated findings. Garbage in, garbage out.

---

## Root cause 1 — generated-dir exclusions only match TOP-LEVEL
`ai_router/verify_session.py`:
- `DEFAULT_DIFF_EXCLUDES = ("dist", "out", "node_modules", ".venv", "__pycache__", "*.vsix")`
- `build_diff_pathspecs()` turns each into the git pathspec `:(exclude)<name>`.

A bare pathspec like `:(exclude)dist` is **anchored at the repo root** — it
excludes a top-level `dist/` only. This repo's compiled extension bundle is
**nested** at `tools/dabbler-ai-orchestration/dist`, so it is **not excluded** and
floods the diff.

This is the same git-pathspec-nesting limitation GPT flagged in the SS3 review
(finding #3), which was fixed only inside the SS3 untracked-content collector.
The **main diff** (and, because it shares `build_diff_pathspecs`, the SS3 collector
too) still only handles top-level. **Fixing `DEFAULT_DIFF_EXCLUDES` fixes both.**

## Root cause 2 — no oversized/truncated-INPUT detection
The only truncation handling in `verify_session` is the SS3 fix (~line 1154): it
catches when the **verifier's OUTPUT** is truncated (`result.truncated`). There is
**no guard on the INPUT** — when the diff is so large the source is truncated at
the model's context boundary, the verifier reviews partial evidence **without any
signal that it is partial**. This is the mirror of SS3's "untracked-omitted →
explicitly uncovered" honesty, but for the diff itself.

---

## Proposed fixes

### Fix A (primary, tiny): exclude generated dirs at ANY depth
Make the default excludes depth-agnostic so a nested `tools/**/dist` is excluded
without a manual `--exclude`. Intended git pathspec is a glob that matches any
depth (e.g. `:(exclude,glob)**/dist/**` alongside the existing top-level form).
**The exact pathspec syntax must be verified by a test** — git pathspec nesting is
finicky and version-sensitive; do not assume, prove it.

**Acceptance test:** a fixture repo with a **nested** `tools/x/dist/bundle.js`
(tracked, large) plus a real source file — `assemble_evidence(...)`'s diff
contains the source and **excludes** the nested bundle. Keep the existing
top-level `dist/` exclusion test green. Apply the same depth-agnostic treatment
to `out` / `node_modules` / `__pycache__` (and confirm `*.vsix` still works).

### Fix B (guard): flag oversized / likely-truncated evidence
Add a size guard on the assembled evidence (diff + inlined content). When it
exceeds a configurable threshold, **fail closed** (or at minimum surface a loud
"evidence may be incomplete — exclude generated files or split the change"
signal), rather than silently sending a diff the model will truncate. Model this
on SS3's truncation-fails-closed behavior. The threshold and warn-vs-fail-closed
policy is a design decision for the session; a fail-closed with actionable
guidance is safest and consistent with the remediation's posture.

**Acceptance test:** an evidence bundle over the threshold yields the guard
outcome (fail-closed / explicit incomplete-evidence signal), not a silent pass.

### Related (optional, NOT code — note only)
The verifier producing *unrated* findings is what our fail-closed rule turns into
blocking churn. The push verification prompt template should **require a severity
on every finding** (or route non-blocking observations through the `NITS:`
section, which `parse_nits` already treats as non-blocking). This is a
prompt-template change, likely a separate item.

---

## Scope / notes
- Small, code-only; suitable for a **lightweight** session set. Fix A is a few
  lines + a test; Fix B is a small guard + a test.
- Fixing `DEFAULT_DIFF_EXCLUDES` retires the `--exclude`-for-nested-dist memory
  workaround the churned session had to discover.
- Not an anti-fabrication regression — this is evidence *completeness*, adjacent
  to (but distinct from) the SS1–SS3 integrity work.
- Suggested branch name convention if you want parity: `fix/evidence-completeness`.

## Definition of done
- Nested generated dirs excluded from the diff at any depth, proven by a test.
- Oversized/truncated-input evidence fails closed (or loudly flags incompleteness),
  proven by a test.
- Full existing suite green (mind the two CI-only conditions: run the drift guard
  and confirm no `copilot`-CLI dependence — the suite is green under no-`copilot`).
