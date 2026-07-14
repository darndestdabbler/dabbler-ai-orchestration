# Set 101 Session 2 — Remediation round 2 (close-backstop findings)

The close-out backstop (round 4, `s2-issues-round-4.json`, verifier gpt-5-6,
diff base = pre-session `8008629`) blocked the close with 3 Major findings.
Two of them (F1, F2) trace to the treadmill L-070-1 warns about — the
remediation-review round 3 VERIFIED, then post-VERIFIED nit edits + the
backstop's fresh full-diff view surfaced new angles. All three are addressed
below; F2 was escalated to the operator and resolved with cross-provider
input.

## R4-F1 (Major, Completeness) — migration recipe dropped the manual/AI lifecycle-adoption path — **FIXED**

**Finding:** round-3's nit-1 fix over-corrected: it reframed AI/hand-declared
modules as "author work directly," dropping the spec-required "adopt lifecycle
sets going forward — manual/AI, never forced" path for two of the three
declaration routes.

**Fix:** `docs/module-reorganization.md` migration step 3 now offers **both**
— (a) *adopt the lifecycle sets manually or via AI* (author a `kind: plan` +
`kind: decomposition` set for the module, mirroring the default module's pair,
or ask the AI to scaffold them), then run them; and (b) author work sets
directly with `Dabbler: Generate Session-Set Prompt`. Restores the spec
deliverable for every declaration path. (Also fixed in the same pass: the
consumer `docs/modules.yaml` header pointer, which had used a repo-relative
`docs/module-reorganization.md` path that would 404 in consumer repos, now
uses the full GitHub URL — `moduleAuthoring.ts`.)

## R4-F2 (Major, Completeness) — the tutorial did not EXECUTE the lifecycle flow — **FIXED (operator-directed, cross-provider-informed)**

**Finding:** the spec required the tutorial to teach "Build → Default module
with Sets 001/002 → run the plan set → run the decomposition set →
rename/delete Default." The prior rewrite deleted Default and used the
decomposition-prompt palette flow, so it never *ran* a plan or decomposition
set. "Mentioning the flow is not equivalent to executing it."

**Resolution:** escalated to the operator (the fix implied either a large
tutorial re-architecture or an adjudication). The operator directed a rewrite
and asked, additionally, how much of the tutorial's heavy manual git could be
automated — and to route GPT + Gemini. Two routing rounds
(`s2-f2-cross-provider-input.json`, `s2-git-automation-reframe.json`):
- Both engines: the flagship tutorial MUST execute the lifecycle flow.
- On git: both engines (after the operator's reframing) agreed the framework
  should AUTOMATE the tedious git while keeping human judgment/approval, with
  the raw commands moved to an appendix — and that this is FEATURE work, a
  follow-on, not a doc edit that should block the 0.44.0 docs release.

**Operator decision:** *close now + feature follow-on.* So the tutorial gets a
**minimal, Part-3-only** fix now: Part 3 now has the team **run
`001-default-plan`** (authors the module plan) then **run
`002-default-decomposition`** (turns the plan into session-set specs) as an
explicit, hands-on practice run — genuinely executing the Build → plan set →
decomposition set lifecycle — then resets (delete Default + clear the practice
output) and declares the three real modules, keeping Parts 4–10's clean
per-module set names. A forward-looking callout at the end of Part 4 states
that the manual git is deliberate-for-now and that one-click / AI-driven git
automation (with the raw commands moving to an appendix) is on the roadmap.
The full automation-first tutorial re-cut + the git-automation feature are a
**follow-on set** (authored this session).

## R4-F3 (Major, Completeness) — "full suite green" asserted without running the current full Python suite — **FIXED**

**Finding:** the disposition asserted "pytest 3030/6 baseline unchanged (no
`ai_router/` touched)" by inference rather than running the suite.

**Fix:** ran the full suite now — `python -m pytest ai_router/tests/ -q` →
**3030 passed, 6 skipped** (8m13s). The claim is now substantiated by an
actual current-tree run, not a historical baseline.

## Suite after remediation

Extension unit **1618/1618**; `tsc --noEmit` clean; `npm run compile` clean
(dist + bundled templates synced); cold-start goldens byte-match; Python
**pytest 3030 passed / 6 skipped** (full run, this tree); Playwright Layer 3
28/28 (unchanged — this round touched only doc text + `moduleAuthoring.ts`'s
header-comment URL, no rendering surface).
