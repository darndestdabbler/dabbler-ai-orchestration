# Session-Set Authoring Guide

> **Purpose:** The single source of truth for *authoring* session-set
> specs. Decisions made here govern how the orchestrator behaves at
> runtime — once a spec declares its requirements, the workflow obeys
> without re-litigating during a session.
>
> **Audience:** Anyone (human or AI) writing a new session-set spec, or
> updating the configuration of an existing one.
>
> **Companion docs:** `docs/ai-led-session-workflow.md` owns *execution*
> mechanics. This file owns *authoring* decisions. The two are
> complementary; neither duplicates the other.
>
> **Portability:** This file is repo-portable. Drop it into any sibling
> repo that uses the AI-router / session-set workflow without
> modification. UI-, UAT-, and E2E-specific conventions for a
> particular repo live in a sibling `*-platform-addendum.md` file
> (or equivalent for that repo) that consumers can omit when those
> concerns don't apply.

---

## Adapting this guide to your repo

This guide assumes a baseline that works **out-of-box** for any repo
that uses the AI-router / session-set workflow — UI-bearing or not.
Two flags in each spec's Session Set Configuration block toggle
optional gates:

- **`requiresUAT`** — when true, the set produces a UAT checklist and
  human-UAT review becomes a closeout precondition. **Default: false.**
- **`requiresE2E`** — when true, behavioral changes must ship with
  matching end-to-end test coverage before notification. **Default:
  false.**

**If you omit the configuration block entirely, the spec is treated
as if both flags are `false`.** The orchestrator then runs the
universal core of the workflow (build / test / cross-provider AI
verification) and skips every UAT- or E2E-specific gate. No file in
this guide, the workflow doc, the router config, or the VS Code
extension needs editing for a no-UI repo to work.

If your repo has UI/UAT surfaces, see your project's
`session-set-authoring-guide.platform-addendum.md` (or equivalent) for
the conventions that translate "shippable behavior" into specific UAT
checklist and E2E test requirements. The addendum lives in your repo;
this guide does not name it because each addendum is repo-specific.

Future flags added to the configuration block (e.g., a hypothetical
`requiresHumanVerification` for repos that need a non-UAT human gate)
follow the same convention: **default to false when omitted**, and
only opt-in repos pay the cost.

---

## What is a session set?

A **session set** is one bounded effort decomposed into a fixed sequence
of one or more **sessions**, each of which runs to completion in a
single orchestrator conversation. Each set lives in its own directory
under `docs/session-sets/<slug>/` and produces a small, predictable set
of artifacts (`spec.md`, `activity-log.json`, `session-state.json`,
`ai-assignment.md`, per-session `session-reviews/`, an end-of-set
`change-log.md`, and — when the set's configuration requires it — a
`<slug>-uat-checklist.json`).

For the runtime mechanics of how a session executes — the 10-step
procedure, cross-provider verification, the verifier-disagreement
adjudication path, the reorganization review, the delegation rules —
see `docs/ai-led-session-workflow.md`.

---

## Slug naming

The slug is the directory name and the identifier the trigger phrase
references ("Start the next session of `<slug>`."). Conventions:

- **kebab-case**, lowercase, no leading underscore. (Underscore is
  reserved for `_archived/`.)
- Descriptive of feature or initiative, not session number or date.
  `role-administration-foundations` is a slug; `phase-3-week-2` is not.
- **Disambiguation suffixes** when one initiative spans multiple sets:
  - `-foundations` for the structural/scaffolding set that precedes the
    behavior work.
  - `-uat` for sets whose primary deliverable is human UAT (rare; most
    UAT happens inline within a behavior set, not as its own set).
  - `-uat-remediation` for sets that fix issues surfaced by an earlier
    UAT pass.
  - `-followup-fixes` for cleanup work whose scope was explicitly
    deferred from a parent set.
  - `-discovery` for read-only investigative sets that produce a
    written deliverable but do not change shipping code.

Pick a slug that will still make sense six months later. If you find
yourself appending the date or session count to disambiguate, the
underlying initiative is probably too broad — split it.

---

## Sizing a session set

Each session is one orchestrator conversation. The cap on a session is
not strict, but two heuristics are reliable:

- A session that runs out of context budget mid-step is a sign that the
  session is too big. Either move steps to the next session or split
  the set.
- A session that finishes in under ~30 minutes is a sign the session is
  too small (overhead per session — Step 0 registration, guidance
  reads, verification, notify, commit — is fixed; very short sessions
  are dominated by overhead).

Sessions per set:

- 1 session: legitimate when the work is genuinely atomic (a single
  bug fix, a focused refactor confined to a small surface).
- 2–4 sessions: the typical band — enough for "scaffold → behavior →
  test → verify" decomposition.
- 5+ sessions: justified when the work has well-defined synthesis
  points (e.g., a multi-feature build-out). If a set is heading to
  ~8+ sessions and is not driven by a clear DAG of synthesis points,
  consider splitting into sibling sets with explicit prerequisites.

Sets that depend on each other should declare prerequisites in the
spec (see *Cross-set dependencies* below) so a session-state explorer
or human can see the DAG at a glance.

---

## The Session Set Configuration block

**Every spec must include this block at the top, immediately after the
purpose-and-prerequisites preamble.** It tells the orchestrator (and
external tooling) which gates apply to this set.

```yaml
## Session Set Configuration

requiresUAT: false       # human UAT review required before set closes
requiresE2E: false       # E2E test coverage required before notifying
uatScope: per-session    # per-session | per-set | none (only meaningful when requiresUAT: true)
```

### Field semantics

- **`requiresUAT: true`** — the set must produce a
  `<slug>-uat-checklist.json` and human-UAT review is a precondition
  for marking the set complete. The orchestrator will invoke
  `route(task_type="uat-plan-generation")` and
  `route(task_type="uat-coverage-review")` at the appropriate steps.
  Pending UAT blocks downstream sets unless the human explicitly
  overrides.

- **`requiresUAT: false`** — no UAT artifacts are produced; UAT-related
  workflow gates are skipped silently. The set's quality bar is build
  + tests + cross-provider AI verification.

- **`requiresE2E: true`** — every functional checklist item (when UAT
  is also required) must have matching E2E test coverage before the
  human is notified. When `requiresUAT: false` but `requiresE2E:
  true`, the rule degenerates to "behavioral changes ship with E2E
  tests" — the orchestrator confirms via test discovery before
  notifying.

- **`requiresE2E: false`** — no E2E coverage gate. Unit + integration
  tests are still expected (those are governed by the testing
  hierarchy, not by this flag).

- **`uatScope`** — only meaningful when `requiresUAT: true`:
  - `per-session` — checklist items accumulate across sessions; the
    final session compiles the cumulative checklist.
  - `per-set` — a single checklist authored at the end of the set,
    covering the whole effort.
  - `none` — invalid here (use `requiresUAT: false` instead).

### Defaults

If the configuration block is **omitted entirely**, the spec is
treated as `requiresUAT: false`, `requiresE2E: false`, `uatScope:
none`. Same outcome as writing the block with all three values
spelled out as their defaults.

If the block is **present but a field is omitted**, the missing field
takes its default (`false` for booleans, `none` for `uatScope`).

**The safe default is no UAT and no E2E gate.** Authors who want UAT
or E2E coverage must opt in explicitly. This keeps every set's gates
visible in one place and lets non-UI repos use the workflow
out-of-box without touching shared files.

Future flags added to the block follow the same default-false rule.
Older specs continue to work without modification when new flags are
introduced.

---

## When UAT is required (heuristic for spec authors)

A session set should declare `requiresUAT: true` when its work changes
the behavior of a UI surface or a service the UI talks to directly. In
practice, any of these triggers UAT:

- Any change to a UI page, component, navigation, form, grid, or
  dialog.
- Any change to a shell element (app bar, drawer, theme, layout) or a
  cross-page interaction pattern (role switcher, org switcher, sign-in
  flow).
- Any change to an API endpoint the UI consumes — request shape,
  response shape, error-status contract, or authorization rule.
- Any change to authorization rules (role assignments, restriction
  types, mask exemptions, loopback gates) that the UI can surface.
- Any change to a browser-visible workflow: search, filter, sort,
  paging, export, document generation, multi-step forms.

A session set should declare `requiresUAT: false` when it only touches
internal-only surfaces — pure library refactors, build or
infrastructure changes with no UI effect, router or prompt-template
edits, test-only changes, and documentation. If a session is
ambiguous (e.g., refactoring an API the UI may depend on), default to
requiring UAT.

When UAT is required, the checklist is built **during the session set
that makes the change** — not deferred to a later "UAT session set."
Deferring UAT across session sets breaks the traceability between a
change and its human sign-off.

---

## When E2E is required (heuristic for spec authors)

A session set should declare `requiresE2E: true` when:

- The set ships **user-visible behavior** that can be exercised through
  a real UI entry point (form submission, navigation, role switch,
  data export, etc.).
- The set modifies a **contract that has existing E2E coverage** —
  changing the contract without updating the tests guarantees a
  regression.
- The set fixes a **bug that escaped existing E2E coverage** — the fix
  ships with a test that would have caught the original bug.

A session set should declare `requiresE2E: false` when:

- The work is a **pure refactor** with byte-identical observable
  behavior. Existing E2E tests still pass; no new tests required.
- The work is **internal-only**: library code, API endpoints not
  reached from the UI, infrastructure, build configuration.
- The set is **doc-only**: planning, lessons-learned updates, workflow
  changes.
- The set is **tooling/infra**: ai_router changes, session-set
  scaffolding, CI configuration. (Note: changes to the *test*
  infrastructure may still require running the existing E2E suite to
  confirm green; that's covered by the testing hierarchy, not the
  E2E flag.)

When in doubt, prefer `requiresE2E: true` for any set that changes
shipping code paths.

---

## Deliverables checklist

**Every spec must list:**

- A purpose / preamble block (one paragraph).
- Prerequisite sets (if any).
- The Session Set Configuration block.
- A Project Overview / scope section (what this set will and will not
  do).
- A Session Plan: each session has a Title, ordered Steps, a Creates
  list (new files / artifacts), a Touches list (existing files
  modified), an "Ends with" line (the verifiable end-state), and
  Progress keys (markers the orchestrator updates).
- An end-of-set deliverables list.

**Conditional on the configuration block:**

- `<slug>-uat-checklist.json` — required when `requiresUAT: true`.
  Schema follows the checklist-editor contract; per-session items
  reference `E2ETestReference` (qualified test method name) when
  `requiresE2E: true`. Items whose verification is purely judgmental
  (aesthetics, copy, layout feel) are flagged `IsJudgmentItem: true`
  with a one-sentence justification — those are exempt from the
  matching-test requirement but still need a sequence-reachability
  test so the human renders judgment on a working UI.
- E2E test references — required when `requiresE2E: true`. Tests live
  in the project's standard E2E test location (see Platform-specific
  addendum) and use real UI entry points (no direct route navigation
  as a shortcut).

---

## Spec template snippet

Use this as the starting point for any new spec. Fill in `<...>`
placeholders.

````markdown
# <Set Title> Spec

> **Purpose:** <one-paragraph statement of what this set delivers and why>.
> **Created:** <YYYY-MM-DD>
> **Session Set:** `docs/session-sets/<slug>/`
> **Prerequisite:** <slug of any prerequisite set, or "None">
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
requiresUAT: false
requiresE2E: false
uatScope: none
```

> Rationale: <one or two sentences on why these flags are set this way.
> If requiresUAT or requiresE2E is true, justify the scope. If both are
> false on a set that touches shipping code, justify that too.>

---

## Project Overview

<scope, motivation, non-goals>

---

## Feature 1: <name>

### Scope

### Standards

---

## Session Plan

### Session 1 of N: <Title>

**Steps:**
1. ...
2. ...

**Creates:** `<paths>`
**Touches:** `<paths>`
**Ends with:** <verifiable end-state — a passing test, a committed file, etc.>
**Progress keys:** <markers the orchestrator updates>

---

### Session 2 of N: <Title>

...
````

---

## Cross-set dependencies

When a set depends on another set's deliverables, declare the
prerequisite in the preamble (the `**Prerequisite:**` line). The
orchestrator and the Session Set Explorer use this to show the
dependency DAG and to prevent starting a dependent set before its
prerequisite is complete.

For a set that consolidates outputs from multiple prior sets (a
**synthesis** set), declare every prerequisite. The synthesis set's
last session typically produces a `change-log.md` that summarizes the
combined effect across all prerequisites.

---

## Anti-patterns

- **Implicit UAT.** A spec that touches UI but omits the configuration
  block (or sets `requiresUAT: false`) and then expects "the human will
  catch issues during review." If UAT is the actual gate, declare it.
- **Set too broad.** A spec with 10+ sessions and no clear synthesis
  points. Split into sibling sets joined by an explicit prerequisite.
- **Set too narrow.** A spec with one ~15-minute session. Roll it into
  the parent initiative or wait until enough work accumulates.
- **UAT deferred to a later set.** "We'll do UAT in the next set."
  Breaks traceability — the human sees the changes as already-merged
  by the time UAT runs. Prefer inline UAT in the same set that makes
  the change.
- **Re-using a prior set's UAT checklist.** Each set with `requiresUAT:
  true` produces its own `<slug>-uat-checklist.json`. Re-using a prior
  checklist conflates two efforts and confuses sign-off.
- **Bypass-navigation E2E tests.** Tests that route directly to a
  page and assert on rendered content, skipping the actual UI entry
  point. Those tests pass even when the entry point is broken; they
  do not satisfy `requiresE2E: true`.

---

## Repo-specific addendum

If your repo has UI / UAT / E2E concerns, see the repo-specific
addendum file in the same directory (e.g.,
`session-set-authoring-guide.platform-addendum.md` for dabbler-platform).
The addendum names the project's E2E test directory, UAT checklist
schema, when-to-flag heuristics specific to the framework, and any
master plan that drives the next-session-set recommendation. If your
repo has no such addendum, the body of this guide is sufficient on
its own.
