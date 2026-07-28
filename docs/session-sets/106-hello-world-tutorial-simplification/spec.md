# Hello-World Tutorial Simplification Spec

> **Purpose:** The hello-world teaching surface has grown to **1,968 lines
> across three documents** — a 757-line flagship walkthrough, an 821-line
> near-duplicate Copilot + Azure DevOps cut held in sync by a hand-maintained
> drift discipline, and a 390-line workflow-audit prompt. The operator's
> verdict: *"way, way, way too complicated. There is no reason for them to be
> that complicated."* This set collapses all three into **one ~240-line
> walkthrough** that is solo-first, two-module, GitHub + GitHub Copilot CLI as
> its worked path, with host and transport differences as inline variant
> callouts; relocates the release/recovery material to its own short doc;
> re-cuts the scaffolded CODEOWNERS + CI templates to agree with the new
> tutorial; and authors **OBS scene scripts** so the operator can record a
> video walkthrough of it.
> **Created:** 2026-07-28
> **Session Set:** `docs/session-sets/106-hello-world-tutorial-simplification/`
> **Prerequisite:** None (Set 105 complete; no gating dependency)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: true         # S4 IS the acceptance test: the operator quality bar forbids shipping untested step-by-step instructions, and the walk needs operator-supplied resources (GitHub account, Copilot seat, throwaway repo). The video scripts are only trustworthy once someone has performed them.
requiresE2E: false        # No new or changed UI surface. S2's extension delta is scaffolded-template *content* + README/CHANGELOG text; the existing Layer 1/2 scaffolder tests already pin the copy behavior, and asserting template prose in an E2E test would pin copy, not behavior.
uatStyle: ad-hoc
uatScope: per-set
pathAwareCritique: advisory
```

> Rationale: authored on the operator's direct request (2026-07-28). The
> **cut list was not invented at authoring time** — it was routed to a pinned
> `gpt-5.6` ("Sol") analysis before this spec was committed; the raw verdict is
> [`authoring-cut-consult-gpt56.md`](authoring-cut-consult-gpt56.md) and its
> dispositions are transcribed into the authoritative design below. Two calls
> that reached past "modify the tutorials" — deleting the review prompt, and
> authoring a new release/recovery doc rather than deferring it — were put back
> to the operator and confirmed (2026-07-28). **Do not re-litigate the cut list
> at runtime**; a session that disagrees with a disposition records the
> disagreement in its verification artifacts and proceeds.

---

## Project Overview

### The problem

The flagship walkthrough tries to be seven documents at once: a quickstart, a
Work Explorer UI reference, a monorepo-governance guide, a git-host
administration manual, a release-engineering tutorial, an incident-response
drill book, and a workflow audit. A reader who wants to ship one module and
open one PR must first read a primer, invite two teammates, run two AI
sessions of deliberately throwaway work and delete it, hand-write ~100 lines of
path-filtered GitHub Actions YAML with zero-test count guards, configure
CODEOWNERS plus a separate module→owner roster, and rehearse a hotfix and a
rollback — before reaching a fifteen-item self-check. The Copilot + ADO cut
duplicates ~700 lines of that and is kept honest only by a hand-maintained
"shared spine" sync map that every future edit must honor in both files.

Three costs, all real: nobody finishes it; the drift discipline is a permanent
tax on every future edit; and it cannot be filmed — there is no six-scene video
inside a document with ten parts and two hosts.

### Authoritative design (routed cut list — do not re-litigate at runtime)

**Structure.** ONE document, `docs/tutorials/hello-world.md`, **~240 source
lines**, six parts mapping 1:1 to the six video scenes:

| Part | Title | Scene |
| --- | --- | --- |
| 1 | Install and verify the tools | 1 |
| 2 | Create and clone the GitHub repository | 2 |
| 3 | Set up Dabbler and name your first module | 3 |
| 4 | Build and ship the first module | 4 |
| 5 | Add a teammate and a composing module | 5 |
| 6 | Review, merge, and clean up | 6 |

No appendices. **Part 4 ends with an explicit "Solo repositories can stop
here."** — Parts 1–4 must read correctly for a one-person, one-module repo that
will never add a second module (operator requirement B). Parts 5–6 are the
additive "now add a teammate" half.

**Cast — two people, one composing module** (routed sub-question M):

| Person | Module | Code root | Manifest |
| --- | --- | --- | --- |
| Priya | `greeter` | `services/greeter/` | — |
| Sam | `app` | `services/app/` | `touches: [greeter]` |

`app` imports `greeter`'s greeting, adds the time, and prints
`Hello, world! It is 12:00.` Composition (rather than two independent modules)
buys module dependency, `touches:`, session `prerequisites:`, cross-owner
review, and the reason CI runs every module — for a handful of extra lines, and
without inventing a third "integration owner". **The tutorial must not claim
these two sets run in parallel** — they intentionally do not; worktrees are
introduced as *isolation*, and parallelism is named once as a later capability.

**Primary path = GitHub remote + GitHub Copilot CLI** (Full tier via
`transport.profile: copilot-cli`, Set 078). Direct provider API keys
(`DABBLER_*`) become a **three-line variant callout**, not a prerequisite.
Azure DevOps becomes **one inline equivalent per GitHub-specific guardrail** —
never a parallel walkthrough.

**Dispositions** (from the routed verdict; the "what the shrunk version is"
column is binding):

| Item | Disposition | The shrunk/moved version |
| --- | --- | --- |
| Monorepo CI (paths-filter + per-module jobs + `all-modules` + zero-test guards) | **KEEP-BUT-SHRINK** | ONE always-running aggregate job that tests every module on every PR and every push to `main`, and is the single required status check. Reached by **minimally adapting the scaffolded `monorepo-ci.yml`** (replace the `all-modules` placeholder with the real test command; let it run on PRs too) — *not* by pasting a replacement file. Must still fail when a module collects zero tests. Path filtering survives as one pointer sentence. |
| CODEOWNERS / required reviewers | **KEEP-BUT-SHRINK** | Two example lines in Part 5 only, plus one "on a real team repo, add rules so reviews route automatically" sentence. The tutorial requests Priya's review manually. DELETE: plan-folder ownership rules, the separate module→owner roster, the roster-vs-CODEOWNERS audit rationale, the author-self-review explanation, the `Require review from Code Owners` discussion. |
| Branch protection | **KEEP-BUT-SHRINK, staged** | (a) after Part 3 setup: require PR, **zero** approvals — so a solo reader can merge; (b) after CI's first run: make the single `test` job required; (c) in Part 5: raise approvals 0 → 1. One sentence on GitHub Free needing a public repo. No click-by-click settings tours. |
| Tag / deploy / hotfix / rollback (Part 10) | **MOVE** | To `docs/tutorials/release-and-recovery.md` (new, S1). One "Next: release and recovery operations" link after the tutorial's final check. |
| "Git under the hood" appendix | **MOVE** | Into the release/recovery doc where the release commands now live. Deleted from the tutorial. |
| Practice-run-then-delete (Part 3) | **CUT** | Replaced by: scaffold → **rename `Default` → `Greeter`** → set its code root → adapt `001-default-plan`'s scope → run the plan and decomposition sets as **real work whose output is kept**. Nothing is created only to be deleted, and no second hand-authored plan + separate generate-set prompt. |
| Git worktrees | **KEEP-BUT-SHRINK** | Behavior kept, lecture deleted. Justification is **isolation from `main`**, not parallelism. Three actions: open the worktree, run the session in its new window, `Dabbler: Finalize merged set` after merge. One Windows venv callout — not paired Windows/Unix blocks at every invocation. |
| 15-item self-check | **KEEP-BUT-SHRINK** | Five outcome checks (module declaration + set assignment; sets Complete in the Work Explorer; the program on `main` prints the expected line; the `test` check passed and protection held; finalize removed the worktree and synced `main`). |
| Workflow review prompt (390 lines) | **CUT** | `docs/tutorials/module-team-hello-world-review-prompt.md` deleted outright; all inbound links removed; no "graduation check" framing survives. **Operator-confirmed 2026-07-28.** |
| Copilot + ADO cut (821 lines) | **CUT** | `docs/tutorials/module-team-hello-world-copilot-ado.md` deleted. With it die the shared-spine maintenance notes in both files, the sync-map appendix, and the review prompt's drift line item — **the drift discipline is retired, not relocated**. |
| Introductory bureaucracy | **CUT** | Required primer reading, the formal-recommendation link, the graduation check, the tutorial-pair maintainer note, the cast table in the solo half, the "about half a day" claim. The tutorial must stand alone with no prerequisite architecture reading. |
| Repeated UI narration | **CUT (mostly)** | Most `Where you are` / `Expect` / `Good to know` blocks, bucket + action-strip inventories, form-appears/disappears narration, refresh and repair commands, import-plan alternatives, settings names, and the repeated "the HUMAN DECISION is to click…". Keep only observable results that tell a reader whether a major step worked. |
| Git ceremony | **CUT** | Per-artifact manual authoring branches where the starter lifecycle already produces the artifacts; repeated `switch main` / `pull` / `branch -d` sequences; the squash-vs-rebase branch-deletion warning; branch-name collision theory; remote-hygiene lectures; "deleting branches does not delete PR history". |
| Product edge cases | **CUT** | `Unassigned` behavior, missing-plan warning, detached-HEAD refusal, idempotency details, exact confirm-dialog titles, GHE custom-host settings, ADO legacy URL detection, no-CLI browser fallback internals, code-less integration modules, the one-developer-per-module conflict essay, the autonomous-local vs gated-remote taxonomy. These are reference and troubleshooting topics. |

**Load-bearing — must stay hands-on** (cutting these would teach the wrong
habit): the minimal CI gate (else the tutorial teaches merging AI-authored code
with no automated test), branch protection (else the PR is theater and a push
bypasses the whole workflow), worktree isolation (else it implicitly teaches
letting an AI write into the trunk checkout), the human-reviewed PR +
`Finalize merged set` loop demonstrated once in full, and the
plan → decomposition → implementation lifecycle run **once, on real work**.

### Two named runtime unknowns (resolve from shipped code — never teach an unrunnable step)

The **Set 086 principle is load-bearing here**: the tutorial may not hand a
reader a step that cannot run. Two things must be established against shipped
code and behavior *before* they are written down, with the observed behavior
taught rather than an assumed one:

1. **What `Dabbler: Rename Module` actually does to the starter sets.** Part 3
   renames `Default` → `Greeter` while `001-default-plan` and
   `002-default-decomposition` exist under it. Whether their slugs, folder
   names, and `module:` stamps follow the rename (Set 099 writers) decides
   whether Part 3 is three steps or five. If the observed behavior makes
   rename-in-place awkward, the fallback is `Dabbler: New Module` for `greeter`
   plus `Delete Module` on `Default` — **still without running throwaway AI
   sessions**, which is the part the routed verdict actually condemned.
2. **The Copilot CLI version pin and model alias.** Part 1's smoke test is
   `copilot -p "Write PI to 10 decimal places" --model claude-sonnet-4.6`. Both
   the alias and the CLI version must be checked against the seat-local catalog
   lockfile — Set 104 S2 hit a **live version-pin drift** (probe ran CLI
   1.0.69, catalog pinned 1.0.68, runtime failed closed). The tutorial must
   therefore tell the reader **what to do when their CLI version is not the
   pinned one**, in one sentence, at the point of the version check.

### Scope of the extension-side change (S2)

The scaffolded `CODEOWNERS.template` and `monorepo-ci.yml.template` carry the
**three-person cast as their worked example** (`greeter` / `clock` /
`integration`, `@priya-gh` / `@sam-gh` / `@alex-gh`). Left alone, the product's
own scaffolded output would contradict the new tutorial on first contact. They
are re-cut to `greeter` + `app`, and the CI template's commented path-filter
block is reduced to match the one-aggregate-job design. These templates ship in
the extension's `dist/`, so this is a real extension delta: version bump +
CHANGELOG, **publish stays operator-gated** as always.

### Non-goals

- **No product/behavior code changes.** No scaffolder logic, no new commands,
  no Work Explorer changes. S2 changes template *content* and doc text only.
- **No Marketplace or PyPI publish.** The version bump is staged; the click is
  the operator's.
- **No recording.** The operator records in OBS after S4; this set delivers the
  scripts and a validated walk, not a video file.
- **No GitLab, no GitHub Enterprise specifics, no ADO walkthrough.** ADO
  survives as inline equivalents and one alternate video scene take.
- **No replacement for the deleted review prompt.** Its seven principles are
  not being salvaged into this set (operator decision); a future set may revive
  them as a one-page advanced checklist if they prove to have independent
  value.
- **No renumbering or restructuring of the primer / recommendation docs.**

### Known consequence, accepted

Deleting the review prompt 404s a URL already scaffolded into consumer repos
(via `getting-started.md.template`, which S2 fixes going forward). Accepted on
the operator's call. The flagship tutorial is *renamed*, not deleted, so its
far more widely linked URL keeps a **one-line redirect stub** at
`docs/tutorials/module-team-hello-world.md` — the single stub in this set.
If the operator would rather take the 404 there too, S1 drops the stub.

---

## Sessions

### Session 1 of 4: Rewrite the tutorial; retire the pair; author release-and-recovery

**Steps:**
1. Register; read this spec and the routed cut list
   (`authoring-cut-consult-gpt56.md`); read the three current tutorials, the
   scaffolded templates (`docs/templates/consumer-bootstrap/`), and the shipped
   command surface (`tools/dabbler-ai-orchestration/package.json` contributed
   commands; `src/commands/gitWorkflow.ts`, `gitRelease.ts`,
   `utils/gitHost.ts`, `utils/hostCli.ts`, `utils/consumerBootstrap.ts`).
2. **Resolve the two named runtime unknowns** against shipped code and record
   the findings in a session artifact before writing the affected steps:
   `Dabbler: Rename Module`'s effect on the starter sets, and the Copilot CLI
   version pin + `--model` alias resolution. Every literal command, command
   title, and expected string written into the tutorial is verified against
   shipped code (the L-064-8 replacement-doc discipline).
3. Author `docs/tutorials/hello-world.md` to the authoritative design: six
   parts, ~240 lines, solo-first with the explicit "Solo repositories can stop
   here." at the end of Part 4, GitHub + Copilot CLI worked path, ADO and
   direct-API as inline variant callouts, staged branch protection, the
   minimally-adapted scaffolded CI, the five-item final check, no appendices.
   Each part carries its video-scene number so S3 can script against it.
4. Author `docs/tutorials/release-and-recovery.md` from the excised Part 10 and
   the "Git under the hood" appendix: `Cut release tag`, `Start hotfix from
   tag`, `Roll back to tag`, what "deploy" means here, and the raw-git listing
   for the automated commands. Trimmed, not transplanted — it is a reference
   for someone who already finished the tutorial.
5. **Delete** `docs/tutorials/module-team-hello-world-copilot-ado.md` and
   `docs/tutorials/module-team-hello-world-review-prompt.md`. Leave the
   one-line redirect stub at `module-team-hello-world.md`. Repair every inbound
   link: `docs/quick-start.md` (≈199, 305, 308, 310), `README.md` (189, 193),
   `tools/dabbler-ai-orchestration/README.md` (170, 173). Historical CHANGELOG
   entries are immutable — leave them.
6. Confirm the retirement of the drift discipline is complete: no surviving
   "shared spine", "every-echo", or sync-map obligation anywhere in
   `docs/tutorials/`.
7. Full suite; verify (mandatory phased loop, conventions block up front);
   `disposition.json` (next_orchestrator for S2); commit + push;
   `close_session`.

**Creates:** `docs/tutorials/hello-world.md`,
`docs/tutorials/release-and-recovery.md`, the runtime-unknowns findings
artifact.
**Touches:** `docs/tutorials/module-team-hello-world.md` (→ stub),
`docs/quick-start.md`, `README.md`,
`tools/dabbler-ai-orchestration/README.md`.
**Deletes:** the Copilot+ADO cut, the workflow review prompt.
**Ends with:** one tutorial ≤ ~260 lines exists with every literal command and
UI string verified against shipped code; the release/recovery doc exists; both
retired docs are gone with zero dangling inbound links in tracked non-CHANGELOG
files; suite green; cross-provider VERIFIED (or Minor-only); pushed;
`close_session` succeeded.
**Progress keys:** unknowns-resolved, tutorial-rewritten, release-doc-authored,
pair-retired, links-repaired, drift-discipline-retired, suite-green

---

### Session 2 of 4: Make the scaffolded output agree with the tutorial

**Steps:**
1. Register; read S1's disposition and the new tutorial.
2. Re-cut `docs/templates/consumer-bootstrap/CODEOWNERS.template` to the
   two-module cast: `greeter` (@priya-gh) + `app` (@sam-gh @priya-gh, composing
   greeter). Drop the plan-folder rules and the three-person `touches`
   narration to match the tutorial's two-line teaching.
3. Re-cut `docs/templates/consumer-bootstrap/monorepo-ci.yml.template` so its
   **active** job is the one always-running aggregate test job the tutorial
   adapts (running on `pull_request` and on `push` to `main`), with the
   path-filtered per-module block reduced to a short commented pointer for
   large repos. The scaffolded file must remain harmless-as-scaffolded (a
   fresh repo with no modules must not go red) — state how that is achieved and
   prove it.
4. Update `docs/templates/consumer-bootstrap/getting-started.md.template` (99,
   102) to the new tutorial URL and drop the review-prompt URL; regenerate or
   correct the two cold-start fixtures
   (`test-fixtures/cold-start/{full,lightweight}/docs/dabbler/getting-started.md`)
   by the repo's normal mechanism, not by hand-editing if a generator exists.
5. Rebuild the extension so `dist/templates/` matches source; bump the
   extension version + CHANGELOG entry (publish operator-gated — no tag, no
   publish in-session). Confirm no router-side change is needed; if none, say
   so explicitly rather than bumping `ai_router` for symmetry.
6. Full suite incl. the scaffolder tests (`consumerBootstrap.test.ts`,
   `gettingStartedActions.test.ts`, `gitScaffoldCore.test.ts`); verify;
   `disposition.json`; commit + push; `close_session`.

**Creates:** CHANGELOG entry.
**Touches:** the three consumer-bootstrap templates, the two cold-start
fixtures, `tools/dabbler-ai-orchestration/{package.json,CHANGELOG.md}`,
`dist/templates/`.
**Ends with:** a fresh scaffold's `CODEOWNERS` + `monorepo-ci.yml` +
`getting-started.md` agree with the new tutorial with zero contradictions; the
scaffolded CI is still green-on-empty-repo (proven, not asserted); suite green;
version bumped and CHANGELOGed with publish left to the operator; verified;
pushed.
**Progress keys:** codeowners-recut, ci-template-recut, getting-started-recut,
fixtures-regenerated, green-on-empty-proven, version-bumped, suite-green

---

### Session 3 of 4: OBS scene scripts + the S4 UAT checklist

**Steps:**
1. Register; read the new tutorial end to end as a reader would.
2. Author `docs/tutorials/video/` — one file per scene, 1:1 with the
   tutorial's six parts:
   - `README.md` — scene order, the variant matrix (which alternate take
     replaces which scene), total runtime estimate, and OBS setup notes
     (scenes/sources, what must be on screen, what must never be: real tokens,
     org names, private repos).
   - `scene-1-install-and-verify.md` — VS Code, the Dabbler extension, Python,
     the GitHub Copilot CLI; version checks from the VS Code terminal;
     `copilot` login vs `gh auth login`; the smoke prompt
     `copilot -p "Write PI to 10 decimal places" --model claude-sonnet-4.6`.
   - `scene-2-create-and-clone.md` — create the remote repo in the GitHub UI,
     clone it from inside VS Code.
   - `scene-3-dabbler-setup.md` — Getting Started form, Build project
     structure, rename `Default` → `Greeter`.
   - `scene-4-first-module.md` — plan → decomposition → implementation in a
     worktree; CI; PR; merge; finalize.
   - `scene-5-second-module.md` — invite Sam, add `app` with `touches`,
     prerequisites, its session.
   - `scene-6-pr-and-merge.md` — review, merge, clean up, run the composed
     program, the five-item check.
   - **Alternate takes:** `scene-2-alt-azure-devops.md` (create + clone from an
     ADO project) and `scene-1-alt-direct-api.md` (direct provider API keys
     instead of the Copilot CLI seat). Each states exactly which scene it
     replaces and where the reader rejoins.
3. Every scene file uses the same beat structure, held to the **operator's UAT
   quality bar** (literal and copy-pasteable, no paraphrase): scene goal; the
   exact repo/UI state the scene starts from; a numbered beat list where each
   beat has the **literal on-screen action**, the **spoken narration** as
   speakable prose, and the **literal expected on-screen result**; a duration
   estimate; and a "if this fails on camera" line for any beat with a known
   failure mode (Copilot CLI auth, CLI version pin drift, branch protection on
   a private GitHub Free repo).
4. Author `106-hello-world-tutorial-simplification-uat-checklist.json` for S4's
   walk to the Set 078 exemplar bar: literal `HumanAction` + literal-string
   `Expectation`, a per-walk "where you are" preamble, a checklist-level order
   map following the tutorial's natural order, and either
   `ProgrammaticVerification` or a one-sentence `NoProgrammaticPathReason` on
   every functional item. Any intentionally skipped or out-of-order step is
   flagged as intentional.
5. Full suite; verify; `disposition.json`; commit + push; `close_session`.

**Creates:** `docs/tutorials/video/` (9 files), the per-set UAT checklist.
**Touches:** `docs/tutorials/hello-world.md` (only if scripting exposes a gap).
**Ends with:** six scene scripts plus two alternate takes exist, each beat
traceable to a tutorial step and carrying literal actions and literal expected
results; the UAT checklist is authored to the 078 bar and walks the tutorial in
its natural order; suite green; verified; pushed.
**Progress keys:** scene-scripts-authored, alt-takes-authored, obs-notes,
beats-traceable, uat-checklist-authored, suite-green

---

### Session 4 of 4: Operator dry-run walk, remediation, close-out

**Steps:**
1. Register; confirm the operator-supplied preconditions (below). If any is
   missing, **stop and reschedule** rather than run degraded — a degraded walk
   re-creates the untested-instructions gap this set exists to close.
2. Walk the new tutorial with the operator against the S3 checklist, on a
   **throwaway public GitHub repo**, start to finish including the solo cutoff
   at Part 4 and the two-module half. The walk doubles as the **dry run of the
   video**: each scene script is followed as written, and any beat that cannot
   be performed as scripted is a defect in the script, not operator error.
   Record PASS/FAIL with evidence per item.
3. Remediate everything the walk catches, in the tutorial and in the scene
   scripts. Any *product* defect found is triaged: an in-scope doc workaround
   plus a named follow-on set for the code fix — **this set ships no product
   behavior change**. Re-walk only the remediated items.
4. Record the UAT attestation per the ad-hoc floor. Confirm the final line
   counts against the ~240-line target and report the actual before/after
   totals (1,968 → N across the surviving docs).
5. Full suite; verify; `disposition.json`; commit + push; `close_session`;
   end-of-set `change-log.md`; Step 9 guidance review; the advisory path-aware
   critique. Notify the operator, calling out that the extension publish
   (S2's version bump) remains gated on their click, and that recording is the
   next off-session step.

**Creates:** walk evidence + attestation, remediation deltas, `change-log.md`.
**Touches:** `docs/tutorials/hello-world.md`, `docs/tutorials/video/*`, the UAT
checklist, set artifacts.
**Ends with:** the tutorial and all six scene scripts performed end to end at
least once by a human on a real repo, with every failure remediated and
re-walked; UAT attested; before/after line counts reported; suite green;
verified; pushed; `close_session` succeeded; Step 9 + advisory critique
recorded.
**Progress keys:** preconditions-confirmed, walk-executed,
scene-scripts-dry-run, remediation-complete, uat-attested,
line-counts-reported, set-closed

---

## Operator-supplied preconditions for Session 4 (named up front)

- A **GitHub account** able to create a throwaway **public** repo (public is
  what makes branch protection available on GitHub Free — the tutorial's own
  caveat) and invite a second collaborator, or a second account/handle to play
  Sam.
- A **GitHub Copilot seat** usable from VS Code and from the Copilot CLI on the
  walk machine, authenticated before the walk starts.
- The Dabbler extension installed from a local build of S2's bump (the
  Marketplace copy will lag until the operator publishes).
- **~2 hours** of operator time — the walk is deliberately much shorter than
  the old tutorial's "about half a day".

---

## End-of-set deliverables

- `docs/tutorials/hello-world.md` — one solo-first, two-module, ~240-line
  walkthrough on GitHub + GitHub Copilot CLI, with ADO and direct-API as inline
  variants, **walked end to end by a human before it shipped**.
- `docs/tutorials/release-and-recovery.md` — the relocated tag / deploy /
  hotfix / rollback material plus the raw-git listing.
- `docs/tutorials/video/` — six OBS scene scripts 1:1 with the tutorial's six
  parts, plus the Azure DevOps and direct-API alternate takes, each beat
  carrying literal actions, speakable narration, and literal expected results.
- **Retired:** the 821-line Copilot + ADO cut, the 390-line workflow review
  prompt, and with them the shared-spine drift discipline, the sync-map
  appendix, and the every-echo maintenance tax.
- Scaffolded `CODEOWNERS` / `monorepo-ci.yml` / `getting-started.md` templates
  that agree with the tutorial on first contact, shipped in an extension
  version bump whose **publish remains operator-gated**.
- The per-set UAT checklist with the operator's attestation, and a reported
  before/after line count for the teaching surface.
