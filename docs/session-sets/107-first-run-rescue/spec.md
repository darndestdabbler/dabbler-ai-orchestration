# First-Run Rescue Spec

> **Purpose:** Staff called the hello-world tutorial *"way too complicated"* and
> some abandoned it. Four review rounds (two engines, four documents) converged
> on one diagnosis: **first-run cognitive load, not raw git.** No path through
> this product reaches *"an AI session wrote my code"* without first teaching
> branch protection, worktrees, CI and pull requests. This set builds that path:
> a **`Dabbler: Try a sample project`** command that renders a hostless local
> sample, a **new ~15-minute `hello-world.md`** written against a stopwatch, and
> the relocation of today's 419-line tutorial to `adopt-dabbler.md` where it
> belongs.
> **Created:** 2026-07-30
> **Session Set:** `docs/session-sets/107-first-run-rescue/`
> **Prerequisite:** None. Set 106 Session 4 is **deferred, not blocking** (below).
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: true         # S3 IS the acceptance test. The deliverable is a time-boxed human experience; the only way to know a 15-minute first run takes 15 minutes is to hold a stopwatch. It also needs operator-supplied resources (a clean VS Code profile, a released VSIX, an authenticated AI agent).
requiresE2E: true         # S1 ships a new command whose final step is "put the sample set's start action in view". That outcome is Work Explorer rendering — if the tree renders wrong, the first run fails at its last step. L-064-12 arms Layer 3 for Explorer-rendering surfaces regardless.
uatStyle: ad-hoc
uatScope: per-set
pathAwareCritique: advisory
```

> **Do not re-litigate the direction at runtime.** It was settled across four
> review rounds recorded in `docs/planning/`:
> [proposal v3](../../planning/git-transparency-proposal-v3.md) is authoritative,
> and **its §12 corrections are binding on this spec**. v1, v2, the two synthesis
> documents and all six review files are the audit trail. A session that
> disagrees records the disagreement in its verification artifacts and proceeds.

---

## Project Overview

### The problem

The current [`hello-world.md`](../../tutorials/hello-world.md) fails its own
audience before any code exists. Branch protection arrives in Part 3 step 5,
worktrees in Part 4 step 4, CI in Part 4 step 6, pull requests in Part 4 step 7 —
all before the reader has seen an AI session produce anything. Set 106's spec
required Parts 1–4 to work for a solo developer, and they do, but "solo" still
carries every governance concept the product has.

Two contributing defects were **already fixed ahead of this set** and are not in
scope: host branching presented as trailing italic asides (now symmetric
`▸ Your host` blocks), and the Azure DevOps CI dead end (the tutorial now ships a
working `azure-pipelines.yml` inline).

### The success criterion — this set's only real acceptance test

> Starting with VS Code, Python, the extension, and **an authenticated AI coding
> agent**, a new developer creates the local sample, starts one Lightweight
> session, sees the AI change code, runs green tests, and runs the changed
> program **in 15 minutes**, without typing git, YAML, host configuration, or
> Dabbler governance settings.

Measured on a **clean VS Code profile** and a **released VSIX** — never this
repo's editable install or an existing `.venv` — with **install time recorded
separately from interaction time**, so a slow package index is not mistaken for
tutorial complexity.

### Authoritative design (settled — do not re-open)

**Lightweight tier is the first-run tier.** It runs `--no-router`: no provider
keys, no Copilot seat probe, no budget, no metered spend. The session is executed
by whatever AI agent the developer already has open. The honest prerequisite line
is *"VS Code, Python, the Dabbler extension, and an AI coding agent you already
use and are signed into"*, and **the 15-minute clock starts after it**.
Lightweight removes *Dabbler router* credentials; it does not provide the AI, and
the tutorial must not pretend otherwise.

**The sample is local and hostless.** No git host account, no remote repository.
It **does** require package-network access, because both tiers create a `.venv`
and install `dabbler-ai-router`. That claim must not be overstated anywhere.

**What the reader never does:** type a git command, edit YAML, configure a host,
or touch a governance setting.

**Hello World keeps its filename.** `docs/tutorials/hello-world.md` is linked
from `getting-started.md.template` — which **ships inside the extension** — plus
`monorepo-ci.yml.template`, both cold-start fixtures, `README.md`,
`docs/quick-start.md` and `docs/module-reorganization.md`. The new short document
takes that name so the shipped link stays semantically correct and **no template
change, fixture regeneration or version bump is needed for the link**. Today's
tutorial moves to `adopt-dabbler.md`.

### Concept ownership — one owner per procedure

The four-document split is safe only if nothing is explained twice. Set 106 spent
three sessions killing a drift-maintenance tax; this must not rebuild it.

| Concept | Canonical owner | Everyone else |
| --- | --- | --- |
| First successful local session | `hello-world.md` | link |
| Installing into a real repo, guardrails | `adopt-dabbler.md` | link |
| Plan/decomposition, dependencies, ownership, parallel work | `adopt-dabbler.md` (until a later set extracts `team-workflow.md`) | link |
| Recovery, raw git, custom hosts, failure states | `release-and-recovery.md` | link |
| **The AI session loop** | `hello-world.md` shows it once concretely | link |
| **Module declaration** | `adopt-dabbler.md` | link |

A second explanation of any row is the drift tax returning. **S2 greps for it.**

### Non-goals

- **No `Start work` / `Send for review` commands.** Those are the next increment.
  S1 exposes the **existing** copy-the-starter-line affordance
  (`Dabbler: Copy: Start next session` / Work Explorer left-click), not new
  branch or worktree automation — proposal v3 §12.2.
- **No one-form module creation.** A prepared sample means the reader never
  declares a module on the first run, so the four-step module dance leaves the
  critical path. It is an increment-B deliverable.
- **No reconciliation-on-activation, no auto-merge, no PR automation.**
- **No `team-workflow.md` split.** `adopt-dabbler.md` carries the team content as
  a labelled intermediate state.
- **No new Hello World video scene.** Defer until the tutorial survives the
  stopwatch (v3 §12.5). The **existing** nine scripts do move — see S2.
- **No Marketplace publish.** The version bump is staged; the click is the
  operator's.

### Set 106 Session 4 — deferred, and why

S4 is a ~2-hour live walk of the tutorial this set relocates. **Its acceptance
test has already run informally and failed**: staff attempted the tutorial and
abandoned it. Both v2/v3 reviewers that addressed it recommended deferring.
Operator decision, 2026-07-30: **deferred.** Set 106 stays open at 3/4; its S4
is re-scoped by a later set once `adopt-dabbler.md` is stable. Nothing in this
set depends on it.

---

## Sessions

### Session 1 of 3: `Dabbler: Try a sample project` + the canonical sample bundle

**Steps:**
1. Register; read this spec, proposal v3 (especially **§12**), and the shipped
   scaffold surface (`src/commands/gitScaffold.ts`,
   `installAiRouterCommands.ts`, `utils/consumerBootstrap.ts`,
   `ai_router/gate_checks.py`'s local-only path).
2. Author the **canonical sample bundle** — one source of truth, consumed by the
   command, by S2's tutorial, and by the smoke test. It contains a tiny Python
   module with a failing-then-passing test surface and **one already-authored
   Lightweight implementation set**. Do **not** copy a cold-start or UAT fixture
   into a second hand-maintained tree; those are test artifacts, not a
   user-facing contract.
3. Implement the command to the **seven-step contract**, each step failing
   loudly and recoverably:
   1. select or create an empty folder — a non-empty folder is refused by name;
   2. render the versioned bundle;
   3. `git init` + baseline commit;
   4. write the sanctioned `.dabbler/local-only` marker;
   5. create the `.venv` and install `dabbler-ai-router`;
   6. open the folder;
   7. surface the sample set's **existing** start affordance.
4. **Make it resumable (v3 §12.3).** Step 5 fails *after* steps 3–4 have created
   a repo and rendered files, so a naive retry hits step 1's refusal and rejects
   the project it just made. Build in a temporary directory and move into place
   only on success, **or** write an incomplete-sample marker and resume from it.
   Prove the retry path with a test that fails step 5 and re-runs.
5. **Handle a missing git identity (v3 §12.3).** Step 3's commit fails on a
   machine with no `user.email` — exactly the true cold start this targets. Use a
   **command-scoped or repository-local** identity. Never mutate global git config.
6. **Make step 5's failure text a first-run experience (v3 §12.4).** On a
   proxy/VPN/offline failure it must print the exact command the developer can
   run to retry or work around it — never a raw Python traceback.
7. Ship `azure-pipelines.yml` as a consumer-bootstrap template alongside
   `CODEOWNERS.template` and `monorepo-ci.yml.template`, matching the YAML the
   tutorial already prints inline. Rebuild `dist/`; bump the extension version +
   CHANGELOG (publish operator-gated).
8. The smoke test: render the bundle, start the Lightweight lifecycle, run the
   sample's tests, assert the expected program output.
9. Full suite incl. Layer 3; verify; `disposition.json`; commit + push;
   `close_session`.

**Creates:** the sample bundle, the command, `azure-pipelines.yml.template`,
the smoke test, CHANGELOG entry.
**Touches:** `package.json`, `dist/`, the consumer-bootstrap templates.
**Ends with:** a developer runs one command and lands in an opened folder with a
working Lightweight repo and a startable session set, having typed nothing; the
command survives a forced step-5 failure and a machine with no git identity;
suite green incl. Layer 3; verified; pushed; version bumped, publish gated.
**Progress keys:** bundle-authored, command-shipped, resumable-proven,
identity-handled, error-text-actionable, ado-template-shipped, smoke-test-green,
suite-green

---

### Session 2 of 3: the new `hello-world.md`, and relocating the old one

**Steps:**
1. Register; read S1's disposition and run its command yourself to see what a
   reader sees.
2. Author the **new `docs/tutorials/hello-world.md`** against the success
   criterion: prerequisites stated honestly, `Try a sample project`, one
   Lightweight session, green tests, the program running. **Zero** raw git, YAML
   editing, host configuration, branch policy, CI authoring, worktree
   terminology or teammate setup. End with **one sentence** noting that Full tier
   adds independent cross-provider verification, linked to the adoption guide —
   configuring it is not part of first success.
3. **Relocate** today's tutorial to `docs/tutorials/adopt-dabbler.md` unchanged
   in substance, with one added labelled note that it currently also carries the
   team workflow.
4. **Move `docs/tutorials/video/` with it (v3 §12.5)** — all nine files describe
   that tutorial. Update the video README, every scene link, and the traceability
   tables' document references. Do **not** present the six-scene set as the new
   Hello World's video; state that its scene is deferred.
5. Repair every inbound link: `README.md`, `docs/quick-start.md`,
   `docs/module-reorganization.md`, and the two template references. Confirm the
   shipped `getting-started.md.template` link still resolves to the **new** short
   document and therefore needs no change.
6. **Grep for duplicated procedure** against the concept-ownership table. Any
   second explanation is a finding, not a style note.
7. Extend Set 106's committed literal gate (or author its successor) to cover the
   new document set, so the two tutorials cannot drift apart silently.
8. Full suite; verify; `disposition.json`; commit + push; `close_session`.

**Creates:** the new `hello-world.md`.
**Touches:** `adopt-dabbler.md` (renamed), `docs/tutorials/video/*`, `README.md`,
`docs/quick-start.md`, `docs/module-reorganization.md`, the literal gate.
**Ends with:** two tutorials exist with one owner per concept and zero duplicated
procedure; the nine video scripts point at the document they actually describe;
every inbound link resolves; the shipped template link is unchanged and correct;
gates green; verified; pushed.
**Progress keys:** hello-world-authored, tutorial-relocated, video-moved,
links-repaired, no-duplicate-procedure, gate-extended, suite-green

---

### Session 3 of 3: the stopwatch walk, remediation, close-out

**Steps:**
1. Register; confirm the operator-supplied preconditions (below). If any is
   missing, **stop and reschedule** — a walk on a dirty profile measures the
   wrong thing.
2. **Run the acceptance walk**, timed. Clean VS Code profile, released VSIX
   (install S1's build), fresh machine state, an authenticated AI agent.
   **Record install time and interaction time separately.** Walk the new
   `hello-world.md` exactly as written.
3. Record the result against the criterion: did it take **15 minutes**, and was
   any git command, YAML edit, host configuration or governance setting typed?
   Either answer is a valid finding; a walk that takes 40 minutes and says so is
   worth more than one that reports success.
4. Remediate what the walk catches, in the tutorial and in the command. A
   *product* defect gets an in-scope fix if it is inside S1's command, or a named
   follow-on set if it is not. Re-walk only the remediated items.
5. Record the UAT attestation per the ad-hoc floor. Report the before/after
   first-run time and concept count.
6. Full suite; verify; `disposition.json`; commit + push; `close_session`;
   end-of-set `change-log.md`; Step 9 guidance review; the advisory path-aware
   critique. Notify the operator, naming that the extension publish remains
   gated on their click.

**Creates:** walk evidence + attestation, the UAT checklist, remediation deltas,
`change-log.md`.
**Touches:** `hello-world.md`, S1's command, set artifacts.
**Ends with:** the first run performed end to end on a clean profile with a
released VSIX, timed, with every failure remediated and re-walked; UAT attested;
the 15-minute criterion answered with a number rather than an opinion; suite
green; verified; pushed; `close_session` succeeded.
**Progress keys:** preconditions-confirmed, walk-timed, criterion-answered,
remediation-complete, uat-attested, set-closed

---

## Operator-supplied preconditions for Session 3

- A **clean VS Code profile** (`code --profile <new>`), with the Dabbler
  extension **not** pre-installed.
- The **released VSIX** from S1's version bump, installed as a normal user would.
- **No pre-existing `.venv`** and no editable install of this repository on the
  walk machine's path.
- An **authenticated AI coding agent** the operator already uses.
- **A stopwatch**, and ~45 minutes (the walk is 15; the rest is setup and notes).

---

## End-of-set deliverables

- **`Dabbler: Try a sample project`** — a hostless, resumable, seven-step local
  sample that survives a failed install and a machine with no git identity.
- **A new ~15-minute `docs/tutorials/hello-world.md`**, proven against a
  stopwatch on a clean profile, containing no git, YAML, host configuration or
  governance settings.
- **`docs/tutorials/adopt-dabbler.md`** — today's tutorial, relocated with its
  nine video scripts intact and pointing at it.
- **`azure-pipelines.yml.template`** shipped in the extension bundle, matching
  the YAML the tutorial already prints.
- A recorded answer to the success criterion **as a number**, and an extension
  version bump whose **publish remains operator-gated**.
