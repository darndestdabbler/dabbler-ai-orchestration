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
seven tiers and nothing else.

**Full content:**
1. Modified files (in-module).
2. Direct in-module callers of the changed symbols.
3. Test files that import the modified files.

**Interface surface only** — signatures, types, contracts; no
implementation bodies:
4. Files referenced *in code* (not in comments) by the modified files.
   **One hop. No transitive closure.**

**Reference material:**
5. Spec sections mapped to the module in the manifest — *mapped*, not
   retrieved by search.
6. Manifest-declared context assets for the module: schemas, config,
   migrations.
7. Names-only path listing of the whole module. No contents.

**Everything else is excluded by default.** Not "deprioritized" —
excluded, and the exclusion is the artifact's normal state, not a
degradation to apologize for.

**One escalation channel.** The verifier may request a *named* file with
a justification. The request is approved by policy or by a human, and it
is logged. There is no second channel, no wildcard request, and no
silent widening.

**The fork is closed-with-escalation, not hard-closed.** If the diff
touches the module's **exposed API**, the answer is to route to the
**wider review tier** — not to expand this scope. Scope creep and tier
promotion are different decisions and this set keeps them different.

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
  ledger row; escalations and tier promotions are expressed as rows that
  gate already reads.
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
   content; tier 4 carries interface surface only, extracted by parsing
   rather than by asking a model, one hop, comments excluded; tiers 5–6
   come from the manifest; tier 7 is names only. Everything unmatched is
   excluded, and the scope records what it excluded and why — an
   exclusion nobody can see is indistinguishable from a bug.
4. Fold `prompting.py` into `route.py` and replace the silent
   tail-truncation with a refusal that names the overrun, the budget, and
   the module-scoping remedy. Assert in a test that no code path returns
   a silently truncated prompt.
5. Cross-provider verification through `copilot-cli`.
6. Required portion of the full test suite.
7. Close-out.

**Creates:** the manifest extension, `context_scope.py`, the truncation
refusal; `prompting.py` deleted. Est. 16–20 new Python tests.

### Session 2 of 3: Wire it into verification, with the escalation channel

1. Register.
2. Make the scope the evidence builder for module-mapped sessions:
   `verify.py` builds from `context_scope` when the set declares a module
   that resolves in the manifest, and from today's monolithic bundle when
   it does not. The round-1 / fix-delta distinction is unchanged.
3. Render the scope so the verifier knows what it was and was not given:
   each tier labelled, tier 4 visibly interface-only, tier 7 visibly
   names-only, and an explicit statement that everything else is excluded
   by default and is available by request. A verifier that does not know
   its context is bounded will confabulate the rest.
4. Add the escalation channel: the verifier requests a **named** file
   with a justification; the request is approved by policy (a manifest
   allow-rule) or by a human, and every request — granted or refused — is
   logged as a ledger row with its justification and its decider. A
   wildcard or unnamed request is refused, and the refusal says what a
   valid request looks like.
5. Cross-provider verification through `copilot-cli`.
6. Required portion of the full test suite.
7. Close-out.

**Creates:** scope-driven evidence, the rendered tier labels, the
escalation record. Est. 12–16 new Python tests.

### Session 3 of 3: The API fork, the measurement, and the docs

1. Register.
2. Implement the exposed-API fork: when the diff touches the module's
   exposed API — as declared in the manifest, not guessed — the session
   is routed to the **wider review tier** rather than having its scope
   expanded. The routing decision is a ledger row naming which API
   surface triggered it. Closed-with-escalation, never hard-closed: every
   refusal in this set names the command that resolves it.
3. Measure the thing this set exists for, on two real corpora — this repo
   and `../certs`. For a representative change in each: bundle size
   monolithic vs scoped, and whether the scoped review still catches a
   **planted cross-file defect** that only shows up when a caller and its
   callee are read together. A scope that is smaller but blind is a
   regression, and the measurement must be able to say so.
4. Documentation: `docs/quick-start.md` gains the module-mapping and
   escalation flow; `docs/schema-reference.md` documents the extended
   manifest entry, the scope artifact, and the escalation and
   tier-promotion rows.
5. Cross-provider verification through `copilot-cli`.
6. Required portion of the full test suite.
7. Close-out, and the end-of-set `change-log.md`.

**Creates:** the API fork, `s3-scope-measurement.md`, the docs. Est. 8–12
new Python tests.

---

## Acceptance criterion for the set

A module-mapped session verifies from a scope that is **materially
smaller** than its monolithic bundle — measured on this repo and on
`../certs`, recorded in `s3-scope-measurement.md` — while still catching
a planted cross-file defect that requires reading a caller and its callee
together. A verifier that asks for a file outside the scope gets it only
by named, justified, logged request; a diff touching the module's exposed
API is routed to the wider tier instead of quietly widening this one. A
repo with no `docs/modules.yaml` verifies exactly as it does today, and no
code path anywhere returns a silently truncated prompt.
