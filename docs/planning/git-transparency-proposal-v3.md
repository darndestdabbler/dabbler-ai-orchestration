# Proposal v3 — executable contracts for the first-run rescue

> **Status:** PROPOSAL, not accepted. Written 2026-07-30.
> **Supersedes:** [v2](git-transparency-proposal-v2.md), which supersedes
> [v1](git-transparency-proposal.md). Audit trail kept intact:
> [v1 GPT](git-transparency-proposal-gpt.md) · [v1 Gemini](git-transparency-proposal-gemini.md) ·
> [synthesis](git-transparency-synthesis.md) ·
> [v2 GPT](git-transparency-proposal-gpt-v2.md) · [v2 Gemini](git-transparency-proposal-gemini-v2.md)
> **Why v3 exists:** the v2 review's verdict was *"directionally approve, but do
> not author increment A from this proposal yet"*, and asked for **one more
> revision focused on executable contracts rather than another architecture
> round.** This is that revision.

---

## 0. How to evaluate this

The strategy is settled and both v2 reviewers endorsed it. **Do not re-evaluate
the direction.** Three things need attack:

1. **§3 — my resolution of the commit/push ownership collision.** The v2 review
   called this Critical and prescribed a lifecycle-contract change as a
   prerequisite to everything. I think the collision **dissolves once the two
   flows are separated**, and that no contract change is needed. If I am wrong,
   increment A grows a hard prerequisite and the budget picture changes
   materially. **This is the single highest-value thing to check in this
   document.**
2. **§5 — the sample-project command contract.** Seven steps, each of which can
   fail on a real machine. Is any step missing, and is each failure handled?
3. **§8 — the acceptance definition.** Is it actually executable by a human with
   a stopwatch, and does it measure the right thing?

Everything else in this document is transcribed from review consensus and is not
worth your round.

---

## 1. Corrections accepted from the v2 review

All accepted without argument. v2 overstated three things.

| v2 claimed | Correction | Evidence |
| --- | --- | --- |
| "no credential setup" | Lightweight removes **Dabbler router** credentials — provider keys, seat probe, budget, routed spend. It does **not** provide the AI. An authenticated AI coding agent remains a prerequisite. | — |
| "no network" | Both tiers create a `.venv` and pip-install `dabbler-ai-router` (`installRouter` in [`gitScaffold.ts`](../../tools/dabbler-ai-orchestration/src/commands/gitScaffold.ts)). Package network access is required; so is the AI agent's. | verified |
| increment A "can be docs-only" | It cannot. A local sample command is a real extension feature (§5), and the video relocation (§6) is mandatory in the same increment. | — |

**The honest starting line for Hello World:**

> **Prerequisites:** VS Code, Python, the Dabbler extension, and an AI coding
> agent you already use and are signed into.
>
> The 15-minute clock starts here.

What the local sample **can** truthfully promise: no git host account, no remote
repository, no provider keys or budget, and **no git commands typed by the
developer**.

## 2. Settled — carried forward without change

Endorsed by both v2 reviewers; recorded so they are not re-litigated.

- **Two outcome-shaped actions** — *Start work*, *Send for review* — not six
  git-shaped commands.
- **Lightweight tier for the first run.** The v2 review confirmed the path is
  technically sound, citing
  [`test_cold_start_acceptance.py`](../../ai_router/tests/test_cold_start_acceptance.py),
  and noted that test stubs the gate chain, so final acceptance must be a real
  un-stubbed walk.
- **`Dabbler: Try a sample project`** as the sample mechanism — no host account,
  no remote, no git typed. A GitHub template makes GitHub an accidental
  prerequisite; a clone puts raw git back on the path.
- **Four documents split by reader stage, safe if each concept has one owner**
  (§7).
- **A before B before C.** First success precedes production git automation.
- **The new short document keeps the filename `hello-world.md`**, so the link
  shipped inside the extension via
  [`getting-started.md.template`](../templates/consumer-bootstrap/getting-started.md.template)
  stays correct and no template change, fixture regeneration or version bump is
  needed.

## 3. The commit/push collision — and why I believe it dissolves

**This is the section to attack.**

### The collision, as the v2 review stated it

The session constitution assigns commit **and push** to the AI agent, then
`close_session`; the close gate enforces that the push landed
(`check_pushed_to_remote` in [`gate_checks.py`](../../ai_router/gate_checks.py) —
observed live in this repo's own close-out as `[PASS] pushed_to_remote`). So if
*Send for review* is the human action that pushes, either the AI still pushes and
the action is partly redundant, or the AI stops before pushing and
`close_session` **fails before the human can act**.

The review's remedy: a new durable *Ready for review* state, with push and close
moving into *Send for review* — *"a lifecycle contract change, not only an
extension command"*, and a prerequisite to increments A and B.

### Why I think no contract change is needed

The collision assumes one flow. There are **two**, and they need different things.

| | **Flow 1 — AI session work** | **Flow 2 — human edits** |
| --- | --- | --- |
| Branch | `session-set/<slug>` (or an authoring branch a session runs on) | `authoring/<slug>` |
| Who writes the content | An AI session | The developer, by hand |
| Who commits and pushes | **The AI already does**, and `close_session` enforces it | **Nobody.** This is the actual gap. |
| Does `close_session` run? | Yes | **No — it is not a session** |
| Does the developer type git today? | **No** | **Yes — every command in the tutorial** |

Concretely, in the current tutorial: Part 4's plan and decomposition sessions run
on `authoring/greeter-lifecycle`, commit their own work, and must have pushed it —
otherwise their `close_session` would have failed the push gate. The developer's
`git add -A && git commit` at Part 4 step 3 is for stragglers, which is why the
tutorial now says `git status --short` "is usually empty here".

But **Part 5 steps 2–5 run no session at all.** Declaring the `app` module,
editing `docs/modules.yaml`, uncommenting CODEOWNERS — that is pure human editing,
and it is where every one of `git switch -c`, `git add -A`, `git commit` is
genuinely required today.

### The consequence

*Send for review* commits and pushes **only in flow 2, where nothing else does
and no `close_session` is involved.** In flow 1 it does not commit or push at
all — it creates or updates the PR and arms auto-complete, which is what
`Dabbler: Open PR for this set` already does.

**No new lifecycle state. No change to who owns close-out. No prerequisite
blocking increment A.**

The v2 review's own fallback — *"retain AI-owned commit/push for now and narrow
the action"* — is not a compromise under this reading; it is the correct design,
because in flow 1 the AI committing and pushing is not a limitation. It is the
reason the developer already types nothing there.

One caveat the review was right about and this does not dismiss: with AI-owned
push in flow 1, **git has not disappeared from the system** — only from the
developer's hands. That is the operator's stated requirement (*"no reason why my
folks should ever have to manually commit, push, or merge"*), and this satisfies
it. Claiming more would be false.

### What to check

- Is there a third flow? Specifically, a human edit made **inside** a worktree
  during a session, which the AI's commit may or may not sweep up.
- Does any session type close **without** pushing, such that flow 1's assumption
  fails?
- Does `Send for review` in flow 2 need to interact with session state at all, or
  is it purely a git/PR action on a branch?

## 4. Concept ownership — one owner per procedure

Adopted from the v2 review, with the two extra overlaps it identified.

| Concept | Canonical owner | Everyone else |
| --- | --- | --- |
| First successful local session | `hello-world.md` | — |
| Installing into a real repository, guardrails | `adopt-dabbler.md` | link |
| Plan/decomposition, dependencies, ownership, parallel work | `team-workflow.md` | link |
| Recovery, raw git, custom hosts, failure states | reference / [`release-and-recovery.md`](../tutorials/release-and-recovery.md) | link |
| **The AI session loop** | `hello-world.md` shows it once concretely; `team-workflow.md` owns the explanation | link |
| **Module declaration** | `adopt-dabbler.md` | link |
| **Send for review** | `adopt-dabbler.md` | link |

A second explanation of any of these is the drift tax returning and should be
rejected in review. **Add a link/duplication check to the review checklist.**

Accepted intermediate state: until increment C runs, `adopt-dabbler.md` still
contains the team workflow. That is fine **if labelled as such** — but it means
the four-document architecture does not exist after increment A, and the proposal
should not claim it does.

## 5. Contract — `Dabbler: Try a sample project`

The v2 review's seven steps, with the failure handling each needs. **This is a
real extension feature.**

| # | Step | Must handle |
| --- | --- | --- |
| 1 | Select or create an empty folder | Non-empty folder → refuse with a named reason, offer another |
| 2 | Render the versioned sample bundle (§6) with one already-authored implementation set | Bundle version mismatch against the installed extension |
| 3 | `git init` + baseline commit | Git absent from PATH; existing repo at that path |
| 4 | Write the sanctioned `.dabbler/local-only` marker | — (verified to exist: [`gate_checks.py`](../../ai_router/gate_checks.py) waives **only** the push gate and preserves the rest) |
| 5 | Create the `.venv` and install `dabbler-ai-router` | **No network / slow index — the most likely real-world failure.** Must report progress and fail with a resumable message, not a stack trace |
| 6 | Open the folder | — |
| 7 | Put the sample set's **Start work** action in view | — |

The developer types no git, but the product must still establish the repository
invariants the session lifecycle depends on. **Step 5 is the one that will break
on a corporate network**, and its error text is a first-run experience in its own
right.

## 6. Contract — the canonical sample bundle

One source of truth, consumed by three things:

1. `Dabbler: Try a sample project`
2. `hello-world.md`'s exact expected files and output
3. An automated smoke test that renders the bundle, starts the Lightweight
   lifecycle, runs the sample's tests, and asserts the expected program output

**Do not copy an existing test fixture into a second hand-maintained tree.** The
repo's cold-start and UAT fixtures are test artifacts, not a user-facing sample
contract. Tests may render or snapshot the bundle; they must not become its
source of truth.

## 7. Contract — reconciliation and consent

v2 said cleanup happens "automatically on activation". The v2 review pushed back:
activation is not an operator action, and pulling trunk, deleting branches or
removing worktrees because VS Code opened can trigger auth prompts or surprise
someone investigating an old checkout. Accepted.

- **On activation: read-only reconciliation.** Compare local, worktree and remote
  PR state. Mutate nothing.
- **Then one of:** clean only Dabbler-created resources, only when every safety
  precondition passes, and only after a **one-time project-level consent**; or
  surface a single outcome-shaped notification — **"Review merged — finish
  cleanup"**.
- **Always fail closed** on a dirty tree, detached HEAD, missing authentication,
  failed fast-forward, or unknown branch provenance.

## 8. Contract — executable acceptance

Replacing the prose criterion with something a human can run against a stopwatch:

> Starting with VS Code, Python, the extension, and an authenticated AI coding
> agent, a new developer creates the local sample, starts one Lightweight
> session, sees the AI change code, runs green tests, and runs the changed
> program **in 15 minutes**, without typing git, YAML, host configuration, or
> Dabbler governance settings.

Method, from the v2 review:

- Use a **clean VS Code profile** and a **released VSIX**. Not this repository's
  editable Python install, not an already-created venv.
- **Record install time separately from interaction time**, so a slow package
  index is not mistaken for tutorial complexity.
- The cold-start acceptance test stubs the gate chain and the state flip, so this
  walk must be **real and un-stubbed**.

End Hello World with **one sentence** noting that Full tier adds independent
cross-provider verification, linked to the adoption guide. Configuring it is not
part of first success.

## 9. Increment A — actual scope

Not docs-only. Naming it honestly so it can be estimated.

1. `Dabbler: Try a sample project` — command, UI entry point, the seven-step
   contract in §5
2. The canonical sample bundle (§6) and its drift tests
3. New short `hello-world.md` against the §8 acceptance definition
4. Relocate the current 419-line tutorial to `adopt-dabbler.md`
5. **Move `docs/tutorials/video/` with it** — all nine files describe the current
   tutorial's parts; leaving them behind makes the shipped tutorial and its video
   surface contradictory. Update the README, scene links, and inbound links.
   Either add one short Hello World scene or **explicitly defer it**, without
   presenting the old six-scene set as the new tutorial's video
6. Repair the seven inbound links (§2)
7. A real fresh-profile acceptance walk (§8)

**Deliberately not in A:** *Start work* / *Send for review*, one-form module
creation, reconciliation, the `team-workflow.md` split. All of those are B or C.

## 10. Decisions for the operator

1. **Set 106 Session 4.** Both v2 reviewers who addressed it say defer; Gemini is
   explicit — *"Do not waste 2 hours walking staff through a tutorial that you
   already know is going to be replaced."* Its acceptance test arguably already
   ran informally and failed. **Recommendation: defer** until the short
   `hello-world.md` exists, then walk that in ~15 minutes. This changes Set 106's
   scope, so it is the operator's call.
2. **Is §3 right?** If the flow decomposition holds, increment A has no
   lifecycle-contract prerequisite and can start immediately. If not, the
   contract work comes first and A is bigger. **This is the budget question.**
3. **`azure-pipelines.yml`.** Still unwritten; ADO teams still hit a dead end at
   the adoption guide's CI step. Small, self-contained, unblocks a whole host.
   No reviewer has addressed it across four rounds.
4. **Does the Hello World scene script ship in A, or is it deferred?** §9 item 5
   allows either, but the choice must be explicit rather than discovered.

## 11. Already shipped — do not re-propose

- **Host branching is structural**, not trailing italic asides: seven
  `▸ Your host — do ONE of these` blocks plus a banner stating the either/or rule
  once. This was the defect that made ADO staff abandon the tutorial.
- **The ADO CI dead end is named**, with an explicit stopping point.

## 12. Cost of analysis

One routed GPT-5.4 architecture consult (**$0.49**) plus four operator-run
evaluation rounds outside the router. All verification of code claims in this
document was done locally at no cost.
