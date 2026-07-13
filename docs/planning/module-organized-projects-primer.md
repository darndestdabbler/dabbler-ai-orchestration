# Working as a Team in One Repo — A Primer

> **Who this is for:** Team members who know the basics of Git (commit,
> push, pull) but haven't had to think hard about branching strategies,
> tagging, or how teams avoid stepping on each other's work. This document
> explains the concepts first, then walks through *why* our
> module-organized workflow makes the choices it does.
>
> The companion document,
> [module-organized-projects-recommendation.md](module-organized-projects-recommendation.md),
> is the formal specification. Read this one first.

---

## Part 1 — The concepts

### 1.1 What a branch really is

A Git branch is just a **movable label pointing at a commit**. When you
"create a branch," Git doesn't copy any files — it writes a 41-byte file
that says "this label points at commit `abc123`." That's why branching is
instant and free.

The expensive part of branching is never *creating* the branch — it's
**merging it back** later. The longer a branch lives, the more the rest of
the project moves on without it, and the more painful the eventual merge.
This single fact drives almost every decision in our workflow.

### 1.2 What a merge conflict actually is

Git merges files line-by-line. A conflict happens only when **two branches
change the same lines of the same file** (or one deletes a file the other
edited). Two people editing *different files* — or different directories —
essentially never conflict.

This has a huge practical consequence:

> **Merge conflicts are a function of *overlap*, not of team size.**
> If we arrange the work so that each person's changes live in their own
> directory, conflicts mostly disappear — no clever tooling required.

Directory separation alone isn't quite enough for an AI-led workflow,
though — it prevents overlap **across** modules, not overlap **within**
one. That's why a module isn't just "a directory" here; it's **a unit of
work for one developer at a time.** A developer can own several modules
at once, but two developers should never work the *same* module
concurrently. The reason is speed: an AI agent can rewrite a substantial
slice of a module in minutes, not days, and can do it several times in
one sitting. Two people (or their AI sessions) editing the same module in
parallel isn't a rare unlucky overlap anymore — it's a near-certain,
constantly-refreshing merge conflict, because the "surface area" either
side can touch in a short window is so much larger than with manual
coding. One-developer-per-module-at-a-time is the same overlap-avoidance
idea from the callout above, just tightened to match how fast the
overlap can now happen.

Where conflicts *do* still happen, even with perfect directory separation:

- **Shared files**: API contracts, database schemas/migrations, the root
  CI configuration, shared utility packages, lock files.
- **Late merges**: a branch that lived for three weeks touches so much
  that it collides with everything.

Remember those two — our workflow has a specific countermeasure for each.

### 1.3 Branching strategies: the two schools

**GitFlow** (the old heavyweight standard): permanent `develop` and
`main` branches, plus `release/`, `hotfix/`, and `feature/` branches with
ceremonial merge rules. Designed for boxed software with infrequent,
versioned releases. Its cost: branches live a long time, so merges are big
and scary — the exact thing we want to avoid.

**Trunk-based development** (the modern default at most strong engineering
organizations): there is **one long-lived branch** (`main`, "the trunk").
Everyone works on **short-lived branches** — days, not weeks — and merges
back to `main` frequently in small pieces. `main` is protected: you can't
push to it directly; changes arrive by pull request with passing tests.

Why trunk-based wins for a small co-developing team:

| | GitFlow | Trunk-based |
|---|---|---|
| Merge size | Large, infrequent, painful | Small, frequent, boring |
| "Where is the latest code?" | Ambiguous (develop? release?) | Always `main` |
| Integration surprises | Discovered at release time | Discovered within days |
| Ceremony | High | Low |

**We use trunk-based.** Every session set gets a short-lived branch;
it merges to `main` when the set completes.

### 1.4 "But where does production live, then?"

In GitFlow, people often treat a branch as "what's in production." That's
a trap: branches *move*, so "production" becomes a moving target, and
someone eventually merges the wrong thing into it.

The modern answer: **production is a *tag*, not a branch.**

### 1.5 Tags

A tag is a **permanent, immovable label on one specific commit**. Where a
branch says "work continues here," a tag says "*this exact snapshot* is
version 1.2.0."

- We use **annotated tags** (`git tag -a billing-v1.2.0`) — they carry an
  author, date, and message, and are the kind release tooling expects.
- **Deploying** means: deploy the commit that tag points to.
- **Rolling back** means: redeploy the previous tag. No git surgery.
- **Hotfixing** means: branch *from the deployed tag* (not from `main`,
  which may have moved on and contain unfinished work), fix, **tag the
  fixed commit** as the new release (so the new tag is exactly the old
  release plus the fix), and merge the fix back to `main` so the trunk
  keeps it too.

**Semantic versioning** (semver) is the naming convention inside the tag:
`MAJOR.MINOR.PATCH` — bump PATCH for fixes, MINOR for backward-compatible
features, MAJOR for breaking changes. It's a communication device: the
version number tells consumers how scary the upgrade is.

### 1.6 Worktrees (why you don't have to stash constantly)

Normally one repo clone = one checked-out branch, so switching branches
means stashing or committing half-done work. A **git worktree** lets one
clone check out **several branches at once, each in its own folder**.

Our framework already uses this: every session set gets its own worktree
folder (`<repo>-worktrees/<slug>/`) on its own branch
(`session-set/<slug>`). You can have two sets in flight side by side, in
two editor windows, with zero stash juggling. The main checkout at
`~/source/repos/<repo>/` stays on `main` and never moves.

### 1.7 Monorepo vs multi-repo vs submodules

Three ways to organize a multi-module project:

**Multi-repo** — one Git repository per module. Sounds clean, but every
cross-module change becomes a coordination project: multiple PRs that must
land in order, publishing packages between repos, version-pinning dances.
Right choice only when modules have separate owners, separate release
schedules, and stable public interfaces. Not us.

**Git submodules** — one repo *embedded inside* another, pinned to an
exact commit. Every change in the submodule needs a commit there *plus* a
"pointer bump" commit in the parent. This is a fine tool for **vendoring**
a rarely-changing dependency; it is misery for code you actively develop
daily. (If you've heard veterans groan about submodules, this is why.)

**Monorepo** — one repository, one directory subtree per module. Each
developer works in their own subtree (near-zero conflicts, per §1.2), yet
a cross-module change is **one atomic commit** — no publishing, no
pinning, no coordinated PRs.

**We use a monorepo.** Our modules are co-developed by one small team and
must integrate with each other — that's precisely the monorepo sweet spot.

### 1.8 Making ownership real: CODEOWNERS and path-scoped CI

Directory separation only prevents conflicts if people actually stay in
their directories. Two mechanisms make that enforceable rather than
honor-system:

- **CODEOWNERS** — a file GitHub understands natively: "changes under
  `services/billing/` require review from the billing owner." A PR that
  wanders into someone else's module automatically pulls them in as a
  required reviewer. Nothing sneaks by.
- **Path-scoped CI** — the test pipeline looks at *which paths* a PR
  touches and runs that module's tests. Fast feedback for the common case.
- **All-module CI on `main`** — *but* every merge to `main` additionally
  builds and tests **everything**. This is the countermeasure to the
  "integration bomb": if your change breaks another module, you find out
  the day you merge, not the week of the release.

### 1.9 The "integration bomb" — the failure mode we're designing against

Here's how team projects go wrong, in slow motion:

1. Each developer works happily in their own module for weeks.
2. Nobody merges to `main` often, or nobody runs the *other* modules'
   tests.
3. "Integration week" arrives. The modules have quietly drifted apart —
   incompatible assumptions, conflicting schema changes, duplicated
   helpers.
4. Everything explodes at once, under deadline pressure.

Every element of our workflow is aimed at defusing this: short-lived
branches (drift can't accumulate), all-module CI on merge (breakage
surfaces immediately), explicit ownership of shared files (the conflict
magnets have adults supervising them), and a dedicated integration lane
(cross-module work is planned, not smuggled).

---

## Part 2 — Why our decisions follow from these concepts

### 2.1 Why one repo with a directory per module

From §1.2: conflicts come from overlap → give each person their own
directory. From §1.7: we need atomic cross-module changes → monorepo.
Submodules and multi-repo both re-introduce coordination overhead to solve
a problem (conflict avoidance) that directory separation already solves
for free.

### 2.2 Why `main` is the only permanent branch

From §1.3: long-lived branches = big scary merges. Session-set branches
live for the duration of one session set and then merge. There is no
`develop`, no per-person branch, no per-module branch. If you're tempted
to keep a module branch alive "until the module is ready" — that's the
integration bomb from §1.9 being assembled in real time.

### 2.3 Why production is a tag like `billing-v1.2.0`

From §1.4/§1.5: tags don't move, so "what exactly is deployed?" always
has a one-word answer, rollback is trivial, and hotfixes start from the
truth (the deployed snapshot) rather than from whatever `main` looks like
today. Tags are prefixed per module (`billing-v…`, `notifications-v…`)
because modules may ship independently; if the whole project ships as one
unit, we'd use a single `v1.2.0` series instead — that's an open decision
per project.

### 2.4 Why each module gets its own project plan and session sets

The same overlap logic (§1.2) applies to *planning files*, not just code.
If four people share one `project-plan.md`, that file becomes the
most-conflicted file in the repo. So: each module has its own plan
(`docs/modules/<slug>/project-plan.md`), and each session set declares
which module it belongs to. The Session Set Explorer then groups by
module, so each developer primarily looks at their own lane — with the
other lanes one collapse-toggle away, because awareness of neighbors is
half of integration.

### 2.5 Why session-set names stay globally unique

You might expect each module to number its own sets (`billing/001`,
`notifications/001`). We deliberately **don't** do that. The tooling
throughout the framework identifies a session set by its name alone;
making names only unique-within-a-module would force a much larger,
riskier rework for zero conflict-avoidance benefit (conflicts are about
*directories*, §1.2 — not about *numbers*). So: names stay unique across
the whole repo, and we recommend putting the module slug in the name
(`091-billing-webhook-retries`) so names read well and never collide.

If two people happen to grab the same number with different slugs
(`087-billing-x` and `087-notif-y`), nothing breaks — the names still
differ. The only casualty is typing the bare number `87` into a CLI, which
will ask you to spell out which one you meant.

### 2.6 Why there's a special "integration" module

From §1.2's list of conflict magnets: shared contracts, schemas,
migrations, root config. Someone *has* to change those, and those changes
inherently cross module boundaries. Rather than letting cross-module edits
happen ad hoc (where they collide unpredictably), we route them into a
dedicated **integration module**: its session sets are the *only* ones
sanctioned to edit multiple modules' code. That turns cross-module work
into something planned, visible in the Explorer, and reviewed by the
affected owners — instead of a surprise in somebody's diff.

Rule of thumb: if your session set needs to touch another module's code,
stop — either hand that piece to its owner, or promote the work to an
integration set.

### 2.7 Why merging often is a *requirement*, not a preference

Every section above converges here. Small, frequent merges to `main`:

- keep individual merges trivial (§1.1, §1.3),
- trigger the all-module CI safety net early and often (§1.8),
- prevent silent drift between modules (§1.9),
- and make `main` a truthful, current picture of the project — which is
  what your teammates plan *their* work against.

A good habit: when a session set completes, merge it. Don't batch
completed sets "to merge later" — later is where integration bombs live.

---

## Part 3 — A day in the life (putting it together)

Meet Priya (owns `billing`) and Sam (owns `notifications`).

1. **Morning:** Priya starts session set `091-billing-webhook-retries`.
   The tooling opens a worktree at `…-worktrees/091-billing-webhook-retries/`
   on branch `session-set/091-billing-webhook-retries`. Sam is mid-way
   through `089-notif-digest-emails` in his own worktree. They share a
   repo but touch disjoint directories — no interference.
2. **Midday:** Priya's set completes; she opens a PR. Path-scoped CI runs
   billing's tests; the billing CODEOWNERS entry (her) is satisfied; she
   merges. The merge to `main` also runs *all* modules' tests — green.
   Sam pulls `main` into his worktree the same afternoon (small pull,
   nothing scary — it's only one set's worth of change).
3. **Later:** Sam realizes notifications needs a new field in the shared
   event contract that billing emits. That's cross-module — he doesn't
   edit `services/billing/`. He raises it, and it becomes an integration
   session set with `touches: [billing, notifications]`, reviewed by both
   of them.
4. **Release day:** the team tags the current `main` commit
   `billing-v1.3.0` and deploys it. A week later a bug surfaces in
   production while `main` already contains unreleased work — the fix
   branches from the `billing-v1.3.0` tag, ships as `billing-v1.3.1`
   (tagged on the fix commit itself, so the release carries none of the
   unreleased work), and merges back to `main`. Nobody has to untangle
   anything.

That's the whole system: **short branches, disjoint directories, one
truthful trunk, immovable tags, and a designated lane for the work that
crosses the lines.**

---

## Glossary

| Term | Meaning |
|---|---|
| **Trunk / `main`** | The single permanent branch; always releasable. |
| **Trunk-based development** | Everyone merges small changes to `main` frequently via short-lived branches. |
| **Session-set branch** | Short-lived branch for one session set: `session-set/<slug>`. |
| **Worktree** | An extra folder where the same clone checks out another branch simultaneously. |
| **Tag** | Permanent label on one commit; how we mark releases. Annotated tags carry author/date/message. |
| **Semver** | `MAJOR.MINOR.PATCH` version numbering; the bump size signals the change's impact. |
| **Monorepo** | One repository holding all modules as directories. |
| **Submodule** | A repo pinned inside another repo — good for vendoring, painful for active co-development. |
| **CODEOWNERS** | GitHub file mapping paths to required reviewers. |
| **Path-scoped CI** | Tests selected by which paths a change touches. |
| **Integration module** | The designated module whose session sets may edit across module boundaries. |
| **Integration bomb** | The blow-up that happens when modules develop in isolation and merge late. |
