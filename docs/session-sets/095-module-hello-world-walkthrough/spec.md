# Module Hello World Walkthrough Spec (re-homed Set 087 Session 4)

> **Purpose:** Deliver the **three-person-team Hello World walkthrough**
> and the **reusable AI feedback prompt** — the remaining scope of the
> retired Set 087 (its Session 4), re-cut so both document the **new
> module-first Work Explorer UX** shipped by Sets 091–094 (per the
> operator-confirmed verdict: this work lands after Set D). The
> walkthrough drives the redesigned flow end-to-end — scaffold → Define
> modules (D6 decomposition prompt) → per-module row actions (`AI Plan` /
> `Import Plan` / `AI Sets`) → worktrees → CODEOWNERS/monorepo CI → tags
> and rollback — and the feedback prompt is dogfooded against a
> planted-violation scratch repo. This set also closes out the human
> sign-off the retired 087 S3 UAT walk would have provided, on the
> surfaces that survived the redesign.
> **Created:** 2026-07-11
> **Session Set:** `docs/session-sets/095-module-hello-world-walkthrough/`
> **Prerequisite:** `094-getting-started-shrink-and-manifest-lifecycle` (complete)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: suggested    # The natural human gate here is the operator executing the walkthrough verbatim in a clean environment — arm it as the ad-hoc checklist (Set 078/087-S3 instruction bar) if the operator opts in.
requiresE2E: false        # Doc deliverables; the UI behavior it exercises shipped (with its own gates) in Sets 092–094.
uatStyle: ad-hoc
uatScope: per-set
pathAwareCritique: none   # Docs-only set; no cross-surface code seam.
prerequisites:
  - slug: 094-getting-started-shrink-and-manifest-lifecycle
    condition: complete
```

> Rationale: single-session set — the work is atomic (two documents + a
> dogfood run + links), matching the shape 087 S4 had. `requiresUAT:
> suggested` because the walkthrough's whole point is human executability;
> the operator decides at session start whether to arm the formal gate or
> treat their tutorial run as the review.

---

## Project Overview

### Lineage and authority

- Retired **Set 087**'s S4 scope
  ([`087-…/spec.md`](../087-module-organized-projects-foundations/spec.md)
  Session 4) is re-homed here per the operator instruction of 2026-07-11;
  the design narrative it teaches is unchanged
  (`docs/planning/module-organized-projects-recommendation.md` + primer),
  but every UI touchpoint is re-cut against the redesigned UX of
  [`verdict.md`](../../proposals/2026-07-11-work-explorer-module-first-ux/verdict.md).
- The retired 087 S3 UAT checklist
  (`087-…/087-module-organized-projects-foundations-uat-checklist.json`)
  is **superseded**: Sets 092–094 carried their own UAT on the redesigned
  surfaces; this set's walkthrough (and its optional armed checklist)
  covers the surviving module-authoring journey end-to-end.

### Invariants the tutorial must teach

Globally-unique set names; `module` is a grouping attribute, never
identity; unstamped work stays visible (`Default`/`Unassigned`); the tree
is the checklist.

---

## Sessions

### Session 1 of 1: Walkthrough, AI feedback prompt, dogfood & set close

**Steps:**
1. Register; read this spec, the verdict, the recommendation + primer, and
   the Sets 091–094 change-logs.
2. Author `docs/tutorials/module-team-hello-world.md` — copy-pasteable,
   runnable, three-person team (Priya → `greeter`, Sam → `clock`, Alex →
   `integration` with `touches: [greeter, clock]`), exercising the NEW
   flow end-to-end: init trunk → Build project structure → Define modules
   via the D6 decomposition prompt (save the file) → confirm the Work
   Explorer module tree with persistent `Plan`/`Session sets` nodes →
   per-module `AI Plan`/`Import Plan` → `AI Sets` decomposition
   (module-stamped, globally-unique) → worktrees
   (`python -m ai_router.worktree open <slug>`) → CODEOWNERS + path-scoped
   /all-module CI → small PRs to `main` → the integration set reviewed by
   both owners → tag (`v0.1.0`) → rollback-to-tag + branch-from-tag
   hotfix. End with a "what to observe" self-check checklist. Reuse the
   primer's Priya/Sam narrative; add Alex.
3. Author `docs/tutorials/module-team-hello-world-review-prompt.md` — the
   reusable AI feedback prompt (inputs to gather; per-principle scoring
   with cited evidence: trunk hygiene, name uniqueness + `module:`
   correctness, directory discipline vs `codeRoots`, integration `touches`
   + owner review, CODEOWNERS coverage, tag correctness /
   production-as-a-tag, integration-bomb symptoms; coaching-tone
   structured output). Runnable via `route(task_type="analysis")` or
   pasted into any engine.
4. Dogfood: execute the walkthrough once against a scratch repo with a
   deliberately-planted violation (e.g. a `greeter` set editing
   `services/clock/`); run the review prompt via `route`; confirm it flags
   the violation with a correct citation and actionable coaching.
5. Doc pass: link both tutorials from the Getting Started surface /
   quick-start and the consumer-bootstrap docs.
6. Build + full suite (docs/link checks + any touched extension tests);
   verify (mandatory); UAT per the upfront prompt (if armed, author the
   checklist to the Set 078/087-S3 bar: literal copy-pasteable
   HumanAction, literal-string Expectation, walks in the UI's natural
   order, per-walk "where you are" preamble + order map); author
   `disposition.json`; commit + push; `close_session`; notify; Step 9
   guidance/reorg review; end-of-set `change-log.md`.

**Creates:** `docs/tutorials/module-team-hello-world.md`,
`docs/tutorials/module-team-hello-world-review-prompt.md`,
`change-log.md` (+ the optional armed UAT checklist).
**Touches:** Getting Started / quick-start links; consumer-bootstrap docs.
**Ends with:** a three-person team can follow the walkthrough end-to-end
on the shipped module-first UX and get cited, actionable coaching from the
review prompt (proven by the planted-violation dogfood); tutorials linked
from onboarding; suite green; cross-provider VERIFIED (or Minor-only);
pushed; `close_session` succeeded; Step 9 review done.
**Progress keys:** walkthrough-authored, review-prompt-authored,
prompt-dogfooded-on-planted-violation, tutorials-linked-from-onboarding,
set-closed

---

## End-of-set deliverables

- The new-UX three-person Hello World walkthrough.
- The reusable AI feedback prompt, dogfooded against a planted violation.
- Onboarding links; `change-log.md`; standard per-session artifacts;
  the 087-S3-superseding human sign-off on the module-authoring journey.
