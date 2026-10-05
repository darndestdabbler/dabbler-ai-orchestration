# Design consult, round 2: packaging, modularity, and how a solution is decomposed

You are consulted again on `dabbler-ai-orchestration`. **You answered a
first round on this subject; this brief supersedes that question with three
facts the first brief did not contain, and it asks you to reconsider in
light of them.** Both round-1 answers are quoted below so you can argue with
the other reviewer as well as with the operator.

You have NO tool access. **Every claim you make about this repository must
cite a path or a number from this brief. Mark any claim you cannot ground
here as ASSUMPTION.** Do not invent paths.

---

## The three facts that were missing

### 1. The governing principle

The operator's words, on the record:

> Our framework should be evaluated against **what human developers would do
> without it**, rather than the ideal system that AI can dream up.

This is the tie-breaker for everything below. A recommendation that is
theoretically superior but that no team of human developers would actually
operate is a wrong answer here, not a bold one.

### 2. The cost lesson, measured

> We have learned the hard way that unless we break solutions down into
> **blackboxed libraries or services**, AI gets overwhelmed and it ends up
> costing us lots of money. **This application has cost over $6000 in tokens
> already.** With a modular approach, it probably would have cost less.
> Have AI work on small components at a time, and you will keep costs much,
> much lower.

The repository this was learned on is the one described in round 1: a
TypeScript monorepo whose router package has 57 source modules and 324
edges, of which a strongly-connected component of 28 modules was still
mutually reachable as of session 78 (two surviving back-edges are baselined
with reasons in `packages/router/boundary-baseline.json`). Sessions 79 and
onward declared ten boundary contexts with every module a member and both
directions checked in lint.

**This reframes the entire packaging question.** Local packages are not
primarily a build-convenience feature. They are the mechanism by which a
solution is cut into pieces small enough that an AI session is cheap — the
package boundary is the context boundary. Argue about it on those terms.

### 3. What the Solution Explorer is FOR

> The main objective of the Solution Explorer is to give human operators a
> view over an entire solution that may have multiple repos involved.
>
> When a plan is decomposed into a solution strategy, that is probably the
> time to identify how the solution will be decomposed into repos. But it
> would be great if AI could help the developer refactor a solution later.
> Also, the bundling aspect should be able to be done at any time. So, we
> could add the solution breakdown into repos as an **optional component of
> Session 002**.
>
> It would be great if the Solution Explorer provided ways to **generate
> sessions** for (a) Development Modularization/Packaging and (b) Release
> Bundling. Although I am not sure whether the resulting code for (b) should
> live in a separate repository.
>
> In terms of file system organization, I am open to ideas.

Context: `dabbler bootstrap` writes two setup sessions into a new project.
Session 001 and Session 002 are those. The operator is proposing that
Session 002 optionally decide the repository decomposition.

---

## What the framework has today (unchanged from round 1, restated so you need not recall it)

- **The framework does not build.** `packages/router/src/resolution.ts`
  header: it declares and reads, and "nothing here installs, restores or
  builds; nothing here touches machine-global state; nothing here holds a
  credential."
- A repository declares what it consumes in `solution-dependencies.json`
  (`packages/router/src/solutionDeps.ts`): each edge names `id`, `kind`,
  `producedBy {id, remote, path}`, `resolve`, and an optional `feed`.
  `resolve` is `"feed"` or `"source"`.
- **Consumers are derived and never declared**
  (`tools/.../providers/solutionTreeModel.ts:53`): `A→B` declared in A and
  `B→C` declared in B are two owner-specific facts, and the reverse
  direction is computed. No repository states who consumes it.
- **Source mode is reversible or it does not happen**
  (`resolution.ts` header). Swapping `PackageReference` → `ProjectReference`
  records the original element first and restores exactly what was there.
  Every swap is recorded in `source-mode.jsonl`. And: "a green build against
  a sibling checkout says nothing about the published package, so the run of
  record, packaging and the close all refuse while any dependency is
  resolving from source."
- **Publishing is declared per repository** in `dabbler.yaml` as a
  `packaging` block with `pack.argv` and `push.argv`, substituting
  `{output}`, `{artifact}`, `{feed}`, `{secret}` per argv element at spawn
  time. `feed` is a URL in the file; `secret` names an env var and never
  holds one.
- **The evidence model**: a session closes by recording the full suite green
  against the exact working tree, with `testEvidence.surfaceDigest` hashing
  every tracked file. Verification is cross-provider, every session, no skip.
- The Solution Explorer renders drift from
  `.dabbler/solution/projection.json`: `behind` (newer version published),
  `split` (two repositories pin different versions), `feed` (feed not
  configured), `ahead` (their checkout is ahead) —
  `solutionTreeModel.ts:411`. The projection is rewritten only by
  `bootstrap`, `deps place`, the `workflow` verbs, and one call in the
  driver's plan phase.
- There is a `solution.yaml` at the root and a `dabbler workspace` verb that
  generates a VS Code workspace over every repository in the solution. There
  is **no** separate solution repository.
- **A second, unrelated six-step lifecycle exists**
  (`packages/router/src/solution.ts:33`): `plan → decompose → contracts →
  mocks → integration → build`, with its own verbs
  (`packages/router/src/cli/workflow.ts`, `workflow/commands.ts`), its own
  review prompts (`stepreview.ts`), its own test phase (`testphase.ts`) and
  its own approval gates. **Nothing in the session lifecycle advances it**,
  so a bootstrapped repository shows `1/6 Plan and design` forever. In round
  1 you were asked whether to hide it, wire it, or delete it.

---

## What the operator decided from round 1

On local packages, the operator chose **Gemini's mechanics plus Sol's one
gate**:

- A local folder feed reached through the **existing** `packaging` block —
  `push.argv`'s `{feed}` pointing at a directory. **No new `resolve` mode.**
  The consumer resolves through ordinary `feed` mode.
- The framework adds only: (i) rebuilding the local artifact when the
  producer changes, (ii) a `stale-local` drift row in the Solution Explorer,
  and (iii) **one rule** — a **releasable** session may not close against
  local bytes; it either promotes the exact tested artifact unchanged or
  re-runs against the remote feed.

Both of you independently advised **against** a framework-mandated solution
repository and **against** framework-owned composite bundling. That advice
was given without facts 1–3 above.

### Your round-1 positions, for the record

**Sol (gpt-5.6-sol)** argued `local` is a genuine third *provenance* state
needing an attestation (producer remote, commit, producer surface digest,
effective pack argv, version, artifact digest), because the operator's
proposed freshness gate — "the producer's commit is pushed" — **fails** the
case where version X is built from a dirty checkout, cached, tested green,
and later rebuilt clean for the remote feed with different bytes. Sol
recommended a three-session build (schema+attestation, consumer resolution,
promotion gates) and said: "Do not build a solution repository or
composite-package lifecycle as part of this work."

**Gemini (gemini-3.1-pro)** argued the `local` resolve mode "fundamentally
breaks the framework's evidence model" and that **no framework changes are
required at all** — configure a local feed URL in `push.argv`, let the
producer publish there through standard mechanics, let the consumer resolve
through standard `feed` mode. It called a central solution repository a
"split-brain scenario" against each repository's `solution-dependencies.json`.
Its "one thing to cut" was the entire module workflow: **delete it**, verbs,
tests and gates included, as dead weight.

---

## The questions

### Q1 — Does the cost lesson change the answer?

If the package boundary is the AI context boundary, then "how easily can a
team cut a solution into more packages" becomes a **primary** design goal
rather than a convenience. The current friction is: publishing to a real
feed on every change is slow and the operator wants a remote push to be a
consulted act; source mode is the alternative and it **refuses the run of
record, packaging and the close** (`resolution.ts`).

- Does making local packages frictionless actually cause teams to cut
  smaller components, or does it just make an existing decomposition cheaper
  to operate? Be honest about the causal claim.
- Sol: does your attestation requirement survive contact with fact 1 (what a
  human developer would do)? A human developer using a local NuGet folder
  feed records no attestation and reasons about staleness by rebuilding.
  What specifically goes wrong here that does not go wrong for them — given
  that the difference is this framework's close records a *verified* claim
  and a human's does not?
- Gemini: does "no framework changes required" survive fact 3? If the
  operator has to keep local packages fresh by hand across N repositories,
  is that the friction that stops the decomposition from happening?

### Q2 — Where does the decomposition decision live?

The operator proposes deciding the repository decomposition in **Session
002** (a bootstrap-written setup session), with later refactoring possible.

- Is a setup session the right place for a decision that is usually wrong
  the first time? What does a team do when the decomposition turns out
  wrong at month six — and what should the framework have recorded at month
  zero to make that cheap?
- The module workflow's `decompose` and `contracts` steps
  (`solution.ts:33`) are conceptually this exact activity, at component
  rather than repository granularity, with review prompts and gates already
  built. Is that machinery the right home for the decomposition decision
  (revive and repoint it), or is its granularity wrong and Gemini's "delete
  it" still correct? **Answer this concretely** — the operator has deferred
  the module workflow's fate until this question is settled.

### Q3 — Should the Solution Explorer generate sessions?

The operator wants right-click actions that generate sessions for **(a)
Development Modularization/Packaging** and **(b) Release Bundling**.

Today, sessions come from `docs/sessions/session-plan.md` and the ledger
`sessions.json`; the Work Explorer renders sessions the plan declares that
the ledger has not reached as `planned`.

- Is "a view generates work" a sound direction, or does it put authorship of
  the plan in a tree view? What is the smallest honest version — does it
  write a session into the plan, or does it draft one for a person to
  approve?
- (b) implies release bundling produces **code or configuration that must
  live somewhere**. Where? The operator is explicitly unsure.

### Q4 — Filesystem organization, on which the operator is open

Concretely: given a solution of N repositories on one developer machine,
where do the local package artifacts live, where does solution-level
documentation live, and where does bundle definition live?

Constraints that are real:
- `producedBy {remote, path}` and `searchPaths` in
  `solution-dependencies.json` already solve "where is the producing
  repository on this machine".
- The consumers-are-derived principle (`solutionTreeModel.ts:53`) must not
  be broken by a central manifest.
- `local-overrides.yaml` is machine-local and gitignored; `dabbler.yaml` is
  tracked and deliberately holds no distribution facts.

Give a concrete layout. Name directories. Say which of them are per-machine
and which are tracked, and say what breaks if a second developer clones the
solution onto a differently-shaped disk.

### Q5 — Bundling, reconsidered

Composite packages per architecture tier and target server, produced with AI
assistance, documented in the project, with each project able to answer
"what bundle am I part of". Both of you said in round 1: not a framework
feature.

- Reconsider against fact 1. A human release engineer *does* maintain a
  bundle manifest, by hand, in a repository. Is the objection actually to
  bundling, or to the framework *executing* bundling rather than *recording*
  it?
- What is the minimum the framework must know about a bundle for the
  Solution Explorer to show a person what ships together?

---

## What to answer

For Q1–Q5: **Soundness** (with a cited path or number per claim), **Risk**
(the failure you would bet on), **Recommendation** (one, concrete, small
enough to build). Then, once:

6. **A session decomposition** for this packaging work, as an ordered list of
   day-sized sessions — each ending with a green suite, cross-provider
   verification and a commit. Say which orderings are real dependencies and
   which are convenience. The preceding sessions 90–95 (already planned) fix
   the `next`-starts-sessions defect, eight mechanical bugs, the task list,
   verification cost visibility, the stop-rendering vocabulary, and an
   additive ACP client; none of them touch packaging.

7. **The disagreement.** Say plainly where you think the other round-1
   reviewer was wrong, and where the operator's own framing is wrong. That is
   the most valuable thing you can produce; agreement is not.

Be direct. The operator has asked for review, not endorsement.
