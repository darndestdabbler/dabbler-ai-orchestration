# Change Log — Set 101: Default Module Scaffold and Docs

> **Set complete: 2026-07-13** (2 sessions). The FOURTH and final set of the
> module-lifecycle-simplification bundle (Sets 098-101): a fresh Build now
> declares a real `default` module with its two lifecycle sets (Session 1),
> and the onboarding/teaching docs + changelogs are re-cut to the shipped
> flow (Session 2). **This set closes the bundle's single release
> boundary** — extension `0.44.0` is publish-ready; Marketplace/Open VSX
> publish (tag `vsix-v0.44.0`) is operator-gated.

## Session 1 of 2 — Scaffold the real Default module

- **`Build project structure` now scaffolds a real `default` module.** A
  Build call that just created `docs/modules.yaml` also appends the
  `default` entry (slug `default`, title `Default`, `codeRoots: []`,
  `planPath: docs/modules/default/project-plan.md`) via the Set 087
  `scaffoldNewModule` writer and scaffolds its two lifecycle sets
  (`001-default-plan`, `002-default-decomposition`) via the Set 098
  `scaffoldModuleLifecycleSets` writer — both reused verbatim. The Visual
  Studio `Class1` pattern: a working starting point, rename-or-delete one
  action away.
- **Idempotent + legacy-safe.** `scaffoldDefaultModuleAndLifecycleSets`
  refuses (returns a note, never throws) when `docs/session-sets/` already
  has content — the invariant lives on the scaffold function itself, so a
  Build re-run and a legacy repo (with or without a manifest) are left
  byte-for-byte untouched. Never undoes an already-landed manifest write
  ("module without sets beats half-written sets").
- **Scaffold copy.** The Default-is-Class1 paragraph added to both
  consumer-bootstrap templates (`getting-started` / `start-here`); cold-start
  golden fixtures regenerated; Python cold-start acceptance green both tiers.
- **Verification (6 rounds, 3 remediation cycles, 1 operator intervention):**
  discovery found the original gate trusted "manifest just created" as proof
  of a fresh repo (a legacy repo with pre-existing sets but no manifest would
  have been wrongly seeded) — fixed with the direct `listSessionSetDirNames`
  refusal + real-fs/wiring tests. The close backstop held the line on the
  literal "walk Default -> rename -> delete -> re-add against the built VSIX"
  demand; the session's own "infeasible" judgment (seconded by a third
  opinion) was WRONG, and `vsix-first-run-walkthrough.spec.ts` ultimately
  drove a real VS Code Electron instance through the whole first-run UI.
  Closed VERIFIED (round 6, 0 blocking). Suites green: unit 1618, Playwright
  Layer 3 28/28, `ai_router` pytest 3030/6 unchanged.

## Session 2 of 2 — Docs, guidance, and the release gate

- **Onboarding/teaching docs re-cut to the shipped flow.** Build now
  scaffolds `default` + two sets, which flips the Work Explorer from the
  Getting Started form to the tree; the Set 093 `Plan`/`Session sets` child
  nodes and the `AI Plan`/`Import Plan`/`AI Sets` strip actions retired in
  Set 100 (palette flows survive). Updated: the three-person
  `module-team-hello-world.md` tutorial (Build scaffolds default + flips to
  tree; delete the Class1 Default then declare the 3 real modules; flattened
  tree description + `Open Plan`/`Add`/`Rename`/`Delete Module` strip; AI
  Plan/AI Sets self-serve replaced by the surviving palette commands),
  `quick-start.md`, the extension README, and the scaffolded
  `getting-started.md.template` Sections 2-3 (whose "form is still up"
  premise the Session 1 default scaffold had made false).
- **New `docs/module-reorganization.md` guide** (routed documentation draft,
  refined against shipped code): rename/delete/add UI ops (Set 099/100
  semantics), the ask-the-AI split/merge path, and the optional never-forced
  legacy-repo migration recipe (declare -> Assign legacy sets to module ->
  adopt lifecycle). Linked from the tutorial, quick-start, getting-started
  template, README, and the scaffolded `docs/modules.yaml` header comment.
- **Changelogs + version walk.** Extension CHANGELOG gained the `0.44.0`
  entry for the 098-101 bundle (Added/Changed/Removed); `package.json`
  bumped `0.43.0` -> `0.44.0`. Router untouched at `0.33.0` (zero
  `ai_router/` changes accrued across 098-101 -> no `ai_router/CHANGELOG`
  entry). Only non-doc code change: a comment-only reorg-guide pointer in
  `MODULES_YAML_HEADER_COMMENTS` (routed to the full GitHub URL after
  verification caught the repo-relative path would 404 in consumer repos)
  and one in-place test copy-pin update.
- **Verification (phased, gpt-5-6, anthropic excluded, 3 rounds, ~$0.58):**
  discovery + supplementary surfaced three real doc bugs — the consumer
  modules.yaml pointer to a repo-only path, a migration recipe that assumed
  lifecycle sets exist after declaration paths that never scaffold them, and
  a primary sequence that offered "delete Default" after decomposition had
  created real work (delete would cancel it). All fixed (rename-vs-delete
  nuance propagated across five docs; the two-path lifecycle-vs-direct model
  clarified). A duplicated "screenshots not retaken" completeness claim was
  DISPUTED as a false positive with concrete evidence (the tutorial and
  getting-started template embed zero screenshots; the README's two
  screenshots already depict the shipped 0.44.0 UI, the module-tree shot
  showing the Set-100 flattened structure) and accepted as settled at
  remediation-review. Remediation-review R3: VERIFIED. The close-out
  **backstop** (R4, full-session diff) then blocked with 3 more Major: a
  migration-recipe over-correction + a consumer `modules.yaml` pointer that
  would 404 in consumer repos (F1); the tutorial not *executing* the lifecycle
  flow the spec required it to teach (F2); and "suite green" asserted without a
  current full-pytest run (F3). F1/F3 fixed directly (recipe now gives both the
  manual/AI lifecycle-adoption path and direct authoring; header pointer →
  GitHub URL; **full `pytest` run: 3030 passed / 6 skipped**). **F2 escalated
  to the operator**, who directed a rewrite and asked how much of the
  tutorial's manual git could be automated — routed GPT + Gemini twice; both
  agreed the tutorial must execute the lifecycle flow, and (after the
  operator's reframing) that the framework should **automate the tedious git**
  while keeping human judgment, moving the raw commands to an **appendix** — as
  a **feature follow-on**, not a release-blocking doc edit. Operator decision:
  *close now + feature follow-on.* Part 3 now genuinely walks running
  `001-default-plan` then `002-default-decomposition` (a hands-on lifecycle
  practice run) then resets to declare the team's modules, with a
  forward-looking "git automation is coming" callout. Remediation-review R5:
  **VERIFIED**, 0 blocking, 6 accepted + 1 accepted-with-modification. Suites
  green: unit 1618/1618, tsc clean, cold-start goldens regenerated, Playwright
  Layer 3 28/28, Python pytest 3030/6.

## End state

Fresh Build produces a real `default` module with two runnable lifecycle
sets (the Class1 starter), legacy repos untouched; the onboarding tutorial,
quick-start, getting-started template, and README teach the shipped flow with
no references to retired UI; `docs/module-reorganization.md` documents the
reorg/migration paths and is linked from every relevant surface. The
module-lifecycle-simplification bundle (Sets 098-101) is complete and ships
together as extension **0.44.0** — the single release boundary is reached and
publish is the operator's click.

A **git-workflow-automation follow-on set** was authored this session (per the
operator's "close now + feature follow-on" decision and the GPT+Gemini
consensus): confirm-gated one-click / AI-driven commands for the mechanical
git (open PR, sync-and-clean-up after merge, cut a release tag), keeping human
judgment (review/approval, branch-protection policy, release/rollback
decisions), followed by an automation-first re-cut of the hello-world tutorial
with the raw git commands moved to a reference appendix. This directly answers
the operator's concern that operators juggling multiple concurrent
projects/modules should not be forced into manual git tedium.

## Step 9 — reorganization review (`project-guidance.md` / `lessons-learned.md`)

Scanned both guidance files against this session's experience. Nothing
reached the "at least two different contexts" promotion bar, and nothing
surfaced as an archival/staleness candidate. Lessons instrumentally applied
this session (cited in `disposition.lessons_cited`, `cite_lessons` run in the
final commit): **L-064-8** (grepped the shipped form-vs-tree / rename / delete
/ add-module code before making any doc claim — this is what surfaced the
"form is still up" contradiction the default scaffold introduced),
**L-064-9** (`git add`-ed the untracked `module-reorganization.md` + `s2-*`
artifacts before verification so the diff evidence was complete — the reason
the verifier could see the new doc at all), **L-064-12** (ran Playwright Layer
3 because the cold-start fixtures changed), and **L-095-1** (carried the
CONSEQUENCE severity rubric in the up-front conventions block and stopped the
loop on the Minor-only remediation-review round rather than grinding).

> No reorganization changes recommended for `project-guidance.md` or
> `lessons-learned.md`.

One observed-but-not-yet-promoted pattern, recorded for future recurrence
tracking (single occurrence this session, below the recurrence bar): **a
scaffold/provisioning change silently invalidates a *premise* stated in the
shipping onboarding docs.** Session 1's real-`default` scaffold made the
"the Getting Started form is still up after Build" premise false across the
getting-started template, README, and tutorial — a contradiction no code test
catches, adjacent to but distinct from L-064-8 (which covers a *replacement
doc* inheriting a *retired doc's* claims). If a future set changes what a
scaffold/provisioning step produces and a doc-premise goes stale as a result,
this is a promotion candidate — provisionally "sweep the docs that describe a
scaffold's context whenever you change what the scaffold produces."
