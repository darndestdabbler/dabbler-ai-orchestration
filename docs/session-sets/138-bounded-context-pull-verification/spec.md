# Bounded-context pull verification

> **Purpose:** Stop pushing whole sessions at verifiers. Today
> `verify.py` builds one monolithic bundle — spec excerpt, full diff,
> untracked file contents — capped at 600 KB, and `build_prompt` silently
> chops the tail if it exceeds the model's window. Set 137 restored v1's
> argv handoff, which by its own scope note fixes *transport only*; the
> comprehension ceiling behind it is untouched. This set replaces the
> push with a **manifest-declared, strictly bounded pull**: seven tiers of
> context, everything else excluded by default, and one logged escalation
> channel when the verifier needs more.
> **Session Set:** `docs/session-sets/138-bounded-context-pull-verification/`
> **Created:** 2026-08-18
> **Workflow:** Full
> **Prerequisite:** set 137 (the seat transport must work before anything
> can be routed through it).

> **Note on rule 6:** operator-authorized exception, as sets 136 and 137.

> **Amendment, session 2, operator-authorized.** The acceptance criterion
> originally required the scoped bundle to be *materially smaller* than
> the monolithic one. Measured on a real 14-file session change, that is
> unachievable without degrading the review: today's bundle is already
> near-minimal for the change (hunks plus new-file contents), and the two
> things that would shrink it — dropping the diff, and eliding callers and
> tests to signatures — are the two things independent review by a second
> and third provider both refused. Dropping the diff leaves the verifier
> unable to separate this session's defects from pre-existing ones; eliding
> a caller's body hides exactly the argument-order class of cross-file
> defect this set's own criterion demands be caught. A bounded scope adds
> context the monolithic bundle never had, so it is *bigger* and *better*.
> The criterion is amended to the property the set can actually deliver:
> **materially better-targeted and hard-bounded.** Session 3 measures size
> honestly and is not required to report a shrink.

---

## Session Set Configuration

```yaml
requiresUAT: false
requiresE2E: true
pathAwareCritique: none
module: default
totalSessions: 3
prerequisites: []
```

---

## The incidents this set exists for

**The v1 precedent.** v1 shipped a whole family for this —
`pull_verifier.py`, `pull_critique.py`, `path_aware_critique.py`, sets
065–069 — on the finding that a reviewer with real path-aware access
catches cross-file defects (dup-key collisions, index undercounts,
cross-artifact contract drift) that a snippet-fed single-shot reviewer
*structurally cannot see*. None of it survived the v2 rebuild. This set
does not restore v1's version: v1's pull verifier was unbounded, and an
unbounded pull has the same comprehension problem as an unbounded push,
plus a tool-loop bill.

**The silent-truncation hazard, measured 2026-08-18.** `route()` calls
`build_prompt()`, which tail-chops any message past 80% of
`max_context_tokens` and appends a marker. The verify cap is 614,400
chars; a 200,000-token model's budget is 640,000. **The maximal bundle
sits at 96% of the truncation budget.** Nothing is firing today, but the
failure mode when it does is the bad one: the *tail* of the diff is
dropped, and because the handoff's nonce footer is appended by the
transport *after* prompting, `HANDOFF-ACK` still validates. A truncated
review returns a clean-looking verdict.

**The operator's own case.** `../certs`: 40.9 KB of PowerShell and docs.
Under the monolithic model that is one 40 KB push for a change that might
touch one function. It verified correctly on 2026-08-18 — the point is
that it should never have needed to send all of it.

## The bounded scope (locked — this is the specification)

Given a diff and the module it belongs to, the evidence is exactly these
seven tiers and nothing else. The module is **one** boundary, not the
only one: tiers 1–4 are bounded by the change, tiers 5–7 by the module.
A change that reaches outside the module's `codeRoots` is still reviewed
in full — `codeRoots` bounds tier 7.

**Full content:**
1. Every modified file.
2. Direct callers of the changed symbols, wherever they live.
3. Test files that import the modified files.

**Interface surface only where a real parser can say what a body is** —
signatures, types, contracts:
4. Files referenced *in code* (not in comments) by the modified files.
   **One hop. No transitive closure.** Python is reduced to its interface
   surface through `ast`. Any other language is carried **in full**: a
   hand-rolled scanner that guesses at a contract is worse than no
   extraction, because it hands the reviewer text that reads like a
   signature but is not one — the silent-truncation failure wearing a
   different hat. The bound that matters is already one hop plus the
   per-file cap and the scope budget. If measurement shows tier 4 is too
   heavy for a language, the answer is that language's own declaration
   emitter (`tsc --emitDeclarationOnly`), never a scanner.

**Reference material:**
5. Spec sections mapped to the module in the manifest — *mapped*, not
   retrieved by search.
6. Manifest-declared context assets for the module: schemas, config,
   migrations.
7. Names-only path listing of the whole module. No contents.

**Everything else is excluded by default.** Not "deprioritized" —
excluded, and the exclusion is the artifact's normal state, not a
degradation to apologize for.

**The pull has two steps, and neither has a human in it.** Within the
**domain** — the paths the scope already names — the verifier may
request a *named* file and gets it mechanically. No justification:
nothing needs to weigh a request for a file the scope already declared
eligible. Outside the domain — a path the verifier saw referenced in a
comment, or inferred — the request is an **escalation**: it names the
file and says why, and the **orchestrating engine** decides. A human
decision mid-verification stalls the session, and the orchestrator can
only *widen* context, never narrow it, so the safe direction is the only
one available. Every request and every escalation is logged with its
file, its outcome, and its decider. There is no wildcard request and no
silent widening. **A refusal is not grounds for abstaining:** the
verifier returns a verdict on the evidence it holds. A refused
escalation is neither an unverified result nor a stalemate.

## Module accounting (ground rule 1)

Add `context_scope.py`. Delete `prompting.py` by folding its 36 lines
into `route.py`, its only caller — and replace its silent tail-truncation
with a **named refusal**, because silently chopping a verification bundle
is the precise hazard this set exists to end. Net module count unchanged,
and a live defect leaves with the module.

The manifest already exists: `docs/modules.yaml`, written by
`modules.py`, entries `{slug, title, planPath?, codeRoots?, touches?}`.
Tiers 5–7 read it. This set extends the entry shape; it does not invent a
second manifest.

## What this set does NOT change (do not reopen)

- **No restoration of v1's `pull_verifier.py` tool loop.** The bound is
  the contribution. An agentic loop that can read anything is the problem
  restated, and it bills per turn.
- **No search-based retrieval.** Tier 5 is *mapped* in the manifest.
  Similarity search over a spec is how a reviewer gets confidently wrong
  context, and it makes the evidence irreproducible run to run.
- **No transitive closure at tier 4.** One hop. A second hop is how a
  bounded scope becomes the whole repo in three commits.
- **No new gate.** The existing `verification_clean` reads the latest
  ledger row; escalations are expressed as rows that gate already reads.
- **No exposed-API fork.** An earlier draft routed a diff touching the
  module's exposed API to a wider review tier. That existed to cover a
  blindness this set does not have: tiers 1–4 are bounded by the change,
  not by the module, so tier 2 pulls direct callers of a changed symbol
  wherever they live — including outside `codeRoots`. A fork would be a
  guard guarding a guard. The too-broad case is already answered by the
  scope's char-budget refusal, which names its remedy instead of quietly
  promoting the session.
- **The monolithic path stays** for sessions with no module mapping.
  A repo without `docs/modules.yaml` must verify exactly as it does today.

---

## Sessions

### Session 1 of 3: The manifest and the scope builder

1. Register.
2. Extend the `docs/modules.yaml` entry shape with the fields tiers 5–7
   need — `codeRoots`, `specSections`, `contextAssets` — additively, so
   entries written by today's `modules.py` stay valid and the extension
   keeps rendering them. Reject an unknown key rather than ignoring it.
3. Add `context_scope.py`: given a diff and a module slug, resolve the
   seven tiers and return a structured scope. Tiers 1–3 carry full
   content; tier 4 is one hop, comments excluded, reduced to its
   interface surface by a real parser where one exists (`ast` for
   Python) and carried in full otherwise — never by asking a model and
   never by a hand-rolled scanner; tiers 5–6 come from the manifest;
   tier 7 is names only. Everything unmatched is excluded, and the scope
   records what it excluded and why — an exclusion nobody can see is
   indistinguishable from a bug.
4. Fold `prompting.py` into `route.py` and replace the silent
   tail-truncation with a refusal that names the overrun, the budget, and
   the module-scoping remedy. Assert in a test that no code path returns
   a silently truncated prompt.
5. Cross-provider verification through `copilot-cli`.
6. Required portion of the full test suite.
7. Close-out.

**Creates:** the manifest extension, `context_scope.py`, the truncation
refusal; `prompting.py` deleted. Est. 16–20 new Python tests.

### Session 2 of 3: Wire it into verification, with the two-step pull

1. Register.
2. Make the scope the evidence builder for module-mapped sessions:
   `verify.py` builds from `context_scope` when the set declares a module
   that resolves in the manifest, and from today's monolithic bundle when
   it does not. The round-1 / fix-delta distinction is unchanged.
3. Render the scope so the verifier knows what it was and was not given:
   each tier labelled, tier 4 visibly marked interface-or-full, tier 7
   visibly names-only, and an explicit statement that everything else is
   excluded by default and what the domain is. A verifier that does not
   know its context is bounded will confabulate the rest.
4. Add the two-step pull. An **in-domain request** names a file the
   scope already listed and is served mechanically — no justification,
   because nothing needs to weigh it. An **escalation** names a file
   outside the domain and says why; the **orchestrating engine** decides,
   with no human in the loop, and may only widen. Both are logged as
   ledger rows naming the file, the outcome, and the decider. A wildcard
   or unnamed request is refused, and the refusal says what a valid
   request looks like. A refusal never licenses abstention: the verifier
   returns a verdict on the evidence it holds, and "my escalation was
   refused" is not a verdict.
5. Cross-provider verification through `copilot-cli`.
6. Required portion of the full test suite.
7. Close-out.

**Creates:** scope-driven evidence, the rendered tier labels, the
escalation record. Est. 12–16 new Python tests.

### Session 3 of 3: The measurement, the logging seam, and the docs

1. Register.
2. Measure the thing this set exists for, on two real corpora — this repo
   and `../certs`. For a representative change in each: bundle size
   monolithic vs scoped, and whether the scoped review still catches a
   **planted cross-file defect** that only shows up when a caller and its
   callee are read together. A scope that is smaller but blind is a
   regression, and the measurement must be able to say so.
3. Close the step-logging seam. Every other lifecycle action has a
   command; logging a plan step makes the orchestrator reach into
   `ai_router.writers` through `python -c`. Add a `log` subcommand to the
   **existing** `ai_router.session` CLI — no new module — that resolves
   the step against the seeded plan rows (a typo'd key refuses rather
   than appending an orphan row), enforces the closed status vocabulary
   at the boundary, and is idempotent. Deterministic by construction: no
   model in the bookkeeping path.
4. Documentation: `docs/quick-start.md` gains the module-mapping flow,
   the escalation flow, and the `session log` command;
   `docs/schema-reference.md` documents the extended manifest entry, the
   scope artifact, and the escalation rows.
5. Cross-provider verification through `copilot-cli`.
6. Required portion of the full test suite.
7. Close-out, and the end-of-set `change-log.md`.

**Creates:** `s3-scope-measurement.md`, the `session log` subcommand, the
docs. Est. 11–16 new Python tests.

---

## Acceptance criterion for the set

A module-mapped session verifies from a scope that is **materially
better-targeted and hard-bounded** — measured on this repo and on
`../certs`, recorded in `s3-scope-measurement.md`, with its size reported
honestly rather than required to shrink — while still catching a planted
cross-file defect that requires reading a caller and its callee
together. A verifier that wants a file the scope already listed gets it
by naming it; one outside the domain gets it only by a logged escalation
the orchestrating engine granted, and a refusal never licenses
abstention. A repo with no `docs/modules.yaml`
verifies exactly as it does today, and no code path anywhere returns a
silently truncated prompt.
