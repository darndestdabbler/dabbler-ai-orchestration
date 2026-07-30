# Review — proposal v2: fix the first run, then make git disappear

> **Reviewed:** [`git-transparency-proposal-v2.md`](git-transparency-proposal-v2.md)
> **Date:** 2026-07-30
> **Reviewer:** GitHub Copilot, without the AI router or another model

## Verdict

**Directionally approve, but do not author increment A from this proposal yet.**

v2 resolves the central problems in v1: first success is now first, the normal
product model has two outcome-shaped actions rather than six Git-shaped
commands, remote configuration is not added unnecessarily, and the short
tutorial is explicitly separated from governance.

The remaining problems are implementation contracts, not a rejection of the
direction. Four must be resolved in the proposal before increment A starts:

1. "No credential setup" and "no network" are currently overstated.
2. The local sample's Git and close-out lifecycle is unspecified.
3. **Send for review** conflicts with the AI agent's existing commit-and-push
   ownership.
4. Relocating the tutorial breaks the meaning of the existing video scripts
   unless they move in the same increment.

## Findings

### 1. Critical — Lightweight removes router credentials, not AI credentials

The proposed Lightweight path is technically sound. The committed cold-start
acceptance test proves that a `tier: lightweight` spec selects no-router mode,
registers a session through the real `start_session` entry point, and reaches
the shared close path; see
[`test_cold_start_acceptance.py`](../../ai_router/tests/test_cold_start_acceptance.py).
The no-router test suite separately covers close behavior and router
short-circuiting.

It does **not** make this statement true without qualification:

> install -> see AI write code, with no credential setup

An AI agent still needs to be installed and authenticated. Lightweight removes
the Dabbler provider keys, Copilot seat probe, budget, and routed spend. It does
not provide the AI that performs the session.

The tutorial should state its starting line honestly:

> Prerequisites: VS Code, Python, the Dabbler extension, and an AI coding agent
> you already use and are signed into.

The 10-to-15-minute clock should start after those prerequisites. If the goal
instead means a brand-new machine with no authenticated AI agent, 15 minutes is
not a defensible acceptance target.

### 2. Critical — the local sample is not "no network" under the current runtime

Both tiers create a `.venv` and install `dabbler-ai-router`; the scaffold reports
this explicitly in
[`gitScaffold.ts`](../../tools/dabbler-ai-orchestration/src/commands/gitScaffold.ts).
Unless the VSIX starts bundling an installable router artifact, a local sample
still needs package-network access. The AI agent will normally need network
access too.

The local-scaffold option can truthfully promise:

- no Git host account;
- no remote repository;
- no provider keys or Dabbler budget; and
- no Git commands typed by the developer.

It cannot promise no network with the current packaging model. Remove that
claim or explicitly add a bundled-runtime design, including its VSIX-size,
version-coupling, and patching costs.

### 3. Critical — **Send for review** conflicts with the current close-out contract

The two-action product model says **Send for review** will commit and push. The
current session constitution says the AI agent authors `disposition.json`,
commits **and pushes**, then invokes `close_session`; see
[`session-constitution.md`](../session-constitution.md). The close gate enforces
that the push already landed, as documented in
[`ai-led-session-workflow.md`](../ai-led-session-workflow.md#step-8-close-out-the-session).

As written, one of two bad outcomes follows:

- the AI still commits and pushes, making **Send for review** partly redundant;
  or
- the AI stops before pushing, and `close_session` fails before the human can
  use **Send for review**.

v2 must define the ownership transfer. The clean model is:

1. The AI completes implementation, tests, verification, disposition, and a
   local commit.
2. The set enters a durable **Ready for review** state.
3. **Send for review** shows the file/commit summary, pushes, creates or updates
   the PR, invokes the close barrier, and records the remote linkage.
4. Merge reconciliation later closes the delivery loop and cleans Dabbler-owned
   resources.

That requires a lifecycle contract change, not only an extension command. If
that change is out of budget, retain AI-owned commit/push for now and narrow the
action to **Open review**, but do not claim Git has disappeared.

### 4. High — a hostless sample still needs a defined local Git lifecycle

The session gates require a Git working tree. A deliberately remote-less repo
is already supported through `.dabbler/local-only`; with no remote configured,
that marker waives only the push gate while preserving the other gates. This is
documented in
[`ai-led-session-workflow.md`](../ai-led-session-workflow.md#step-8-close-out-the-session)
and implemented in
[`gate_checks.py`](../../ai_router/gate_checks.py).

Therefore **Dabbler: Try a sample project** should own the complete hidden setup:

1. select or create an empty folder;
2. render a versioned Lightweight sample with one implementation set;
3. initialize a local Git repository and create the baseline commit;
4. enable the sanctioned local-only marker;
5. create the venv and install the router;
6. open the folder and put the sample set's **Start work** action in view.

<!-- drift-guard:allow-begin -->
The developer should not type Git, but the product must still establish the
repository invariants the session lifecycle depends on. This makes increment A
a real extension feature, not a docs-only change.
<!-- drift-guard:allow-end -->

### 5. High — increment A omits the required video move

All nine files under [`docs/tutorials/video/`](../tutorials/video/) currently
describe parts of `hello-world.md`. If the current tutorial moves to
`adopt-dabbler.md` while a new short document takes the old filename, those
scripts immediately point at the wrong tutorial.

Section 6.4 recognizes the issue, but increment A does not include the move or
link repair. Increment A must:

- move or rename the existing video directory as the companion to
  `adopt-dabbler.md`;
- update its README, scene links, and any inbound links; and
- either add one short Hello World scene or explicitly defer it without
  presenting the old six-scene set as the new tutorial's video.

Relocating rather than rewriting the old scripts is the correct cost-saving
choice.

### 6. High — automatic mutation on extension activation needs a consent rule

Read-only reconciliation on activation is appropriate. Automatically pulling
trunk, deleting branches, or removing worktrees merely because VS Code opened
is more questionable: activation is not an operator action, and those mutations
can trigger network/authentication prompts or surprise someone investigating an
old checkout.

Keep the simple experience without making activation side-effectful:

- reconcile remote and local state read-only on activation;
- automatically clean only resources Dabbler created, only when all safety
  preconditions pass, and only after a one-time project-level consent; or
- surface one outcome-shaped notification: **Review merged — finish cleanup**.

A dirty tree, detached head, missing authentication, failed fast-forward, or
unknown branch provenance must always fail closed.

### 7. Medium — four documents do not inherently recreate Set 106's drift tax

The v2 distinction is valid. Set 106 removed host-based near-duplicates; this
proposal splits content by reader stage. Those are different structures.

The split is safe if each concept has one owner:

| Concept | Canonical owner |
| --- | --- |
| First successful local session | `hello-world.md` |
| Installing into a real repository and adding guardrails | `adopt-dabbler.md` |
| Plan/decomposition, dependencies, ownership, parallel work | `team-workflow.md` |
| Recovery and raw mechanics | reference / `release-and-recovery.md` |

Other documents should link to the owner rather than restate its procedure.
The AI session loop is not the only likely overlap: module declaration and
**Send for review** can also be duplicated between adoption and team workflow.
Name those ownership boundaries in the proposal.

There is one sequencing wrinkle: until increment C exists, the relocated
adoption guide still contains the team workflow. That is acceptable as an
intermediate state if it is clearly labeled, but it weakens the claim that the
four-document information architecture exists after increment A.

<!-- drift-guard:allow-begin -->
### 8. Medium — increment A's scope cannot be called small or docs-only
<!-- drift-guard:allow-end -->

The proposal is right to make A first. It is also right that A alone can satisfy
the time-to-value criterion. But if the local sample command is selected, A
contains:

- a new extension command and UI entry point;
- a canonical, packaged sample fixture;
- local Git initialization and local-only setup;
- venv/router installation and failure recovery;
- packaging and fixture-drift tests;
- the tutorial replacement and adoption-guide relocation;
- video relocation; and
- a real fresh-machine acceptance walk.

<!-- drift-guard:allow-begin -->
That is not a docs-only increment and may not be one small session. Estimate it
only after selecting the sample mechanism and writing its executable acceptance
contract.
<!-- drift-guard:allow-end -->

### 9. Medium — the sample source needs one canonical owner

The repository contains cold-start and UAT fixtures, but they are test
artifacts, not a user-facing sample contract. Do not copy one into a second
manually maintained tree.

Define one canonical sample bundle used by:

- **Try a sample project**;
- the short tutorial's exact expected files and output; and
- an automated smoke test that renders the bundle, starts the Lightweight
  lifecycle, runs the sample tests, and checks the expected program output.

Tests may render or snapshot that bundle, but should not become its source of
truth.

### 10. Medium — the success criterion needs an executable acceptance definition

Keep the v2 success criterion, but make it measurable:

> Starting with VS Code, Python, the extension, and an authenticated AI coding
> agent, a new developer creates the local sample, starts one Lightweight
> session, sees the AI change code, runs green tests, and runs the changed
> program in 15 minutes, without typing Git, YAML, host configuration, or
> Dabbler governance settings.

The acceptance walk should use a clean VS Code profile and a released VSIX. It
must not use this repository's editable Python install or an already-created
venv. Record install time separately from interaction time so a slow package
index does not get mistaken for tutorial complexity.

## Answers to the open questions

### 6.1 — Can Lightweight support the first run?

**Yes, with a qualified prerequisite.** Lightweight removes all Dabbler router
credentials and routed verification from the path. The user still needs an
authenticated AI coding agent. The existing automated coverage is strong
enough to justify the design, but the final acceptance must be a real
un-stubbed sample walk because the cold-start acceptance test stubs the gate
chain and state flip.

End Hello World with one sentence explaining that Full adds independent
cross-provider verification, linked to the adoption guide. Do not make that
configuration part of first success.

### 6.2 — What should produce the sample repository?

Choose **Dabbler: Try a sample project**. It best satisfies the actual adoption
goal and removes host choice from first success. Be explicit that it requires
package and AI-agent network access under the current architecture.

A GitHub template makes GitHub an accidental prerequisite. A clone command
puts raw Git back in the path. Neither is as good for this audience.

### 6.3 — Does the document split recreate drift?

**No, provided procedures have one canonical owner and other documents link.**
The split is by stage, not host. Add the ownership table above to the proposal
and include a link/duplication check in review.

### 6.4 — What happens to the video scripts?

Move them with the old tutorial during increment A. Repairing this later leaves
the shipped tutorial and its video surface contradictory.

### 6.5 — Can one-form module creation be deferred?

**Yes, from first success, but not from the adoption simplification claim.** A
prepared sample removes it from Hello World. It remains a high-value increment
B deliverable because `New Module` plus Default cleanup plus hand-edited YAML
is the first major obstacle in a real repository.

## Recommended sequencing

1. **Resolve the lifecycle contract first.** Specify sample initialization,
   local-only close-out, and ownership of commit/push/close between the AI and
   **Send for review**.
2. **Ship first-run rescue.** Add the canonical local sample command, short
   tutorial, old-tutorial/video relocation, and fresh-profile acceptance walk.
3. **Ship managed delivery.** Add **Start work**, **Send for review**, durable
   branch/worktree/PR linkage, safe reconciliation, and one-form module setup.
4. **Split team workflow only when it reduces the adoption guide.** Do not
   create the fourth document merely to satisfy the proposed information
   architecture.

The A/B/C priority remains correct: first success comes before production Git
automation. The lifecycle-contract work is a prerequisite clarification for A
and B, not a reason to reverse them.

## Final assessment

v2 is a substantial improvement and is aligned with the stated adoption goal.
Its strategic choices should be retained. The proposal now needs one more
revision focused on executable contracts rather than another architecture
round.

The most important correction is this: **Lightweight makes a credential-light
Dabbler session possible, but the sample command must still provision a real
local lifecycle, and the product must choose whether the AI or the extension
owns commit, push, and close-out.** Once those are explicit, increment A is
ready to author.