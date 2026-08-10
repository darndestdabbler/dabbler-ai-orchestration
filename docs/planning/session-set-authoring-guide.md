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
of artifacts (`spec.md`, `session-state.json`, `session-events.jsonl`,
`activity-log.json`, `ai-assignment.md`, `disposition.json`, per-session
root files such as `sN-verification.md` and `sN-close-reason.md`,
`sN-issues.json` when a verification round finds issues (the structured
findings artifact; see [`docs/session-issues-schema.md`](../session-issues-schema.md)),
an end-of-set `change-log.md`, and — when the set's configuration
requires it — a `<slug>-uat-checklist.json`). Legacy `session-reviews/`
and `issue-logs/` directories may still appear when older helpers run,
but they are retired and not part of the current required layout —
structured findings now live in the root-level `sN-issues.json`.

For the runtime mechanics of how a session executes — the 10-step
procedure, cross-provider verification, the verifier-disagreement
adjudication path, the reorganization review, the delegation rules —
see `docs/ai-led-session-workflow.md`.

---

## Slug naming

The slug is the directory name and the identifier the trigger phrase
references ("Start the next session of `<slug>`." — or, with the
Set-050 number handle, "Start the next session of `50`."). Conventions:

- **A monotonic `NNN-` sequence prefix**, then a kebab-case descriptive
  body: `050-schema-drift-detection-and-migration-guard`. The prefix is
  the set's creation-order sequence number, zero-padded to at least three
  digits, and it is **required for newly-created sets** in this canonical
  repo and in any scaffolder output. The number gives every set a short,
  stable handle (`Set 50`) and makes the Work Explorer sort in
  creation order instead of alphabetically. See **Numbering** below for
  how the next number is chosen.

  > The prefix is a *sequence* number, not a *semantic* one — it carries
  > no meaning beyond "created after 049, before 051." This is the
  > distinction the next bullet draws.

- **kebab-case**, lowercase, no leading underscore. (Underscore is
  reserved for `_archived/`.)
- The descriptive body is **descriptive of feature or initiative, not a
  semantic date / phase / session count.** A monotonic creation-order
  `NNN-` prefix is fine (encouraged, above); a *semantic* number is not —
  `050-role-administration-foundations` is a good slug;
  `phase-3-week-2` / `sprint-7` / `2026-q2-cleanup` are not. The test:
  the leading `NNN-` answers "which set is this" (an opaque handle); a
  banned semantic name tries to answer "where in some external schedule
  does this fall" (drifts, collides, ages badly).
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

Pick a descriptive body that will still make sense six months later. If
you find yourself appending the date or session count to the *body* to
disambiguate, the underlying initiative is probably too broad — split it.
(The `NNN-` prefix is the exception that proves the rule: it disambiguates
by creation order, which never ages or drifts.)

### Numbering

The `NNN-` prefix is a per-repo monotonic counter:

- **Next number = `max(existing numeric prefix) + 1`.** Slugs without a
  numeric prefix (legacy bare names like `harvester-cli-distribution`) are
  ignored when finding the max. A repo with no numbered sets starts at
  `001`.
- **Zero-pad width = `max(3, widest existing prefix)`** — three digits by
  default, wider once a repo grows past `999`. Resolve the next value with
  the shipped helper rather than counting by hand:

  ```bash
  python -m ai_router.resolve_set --next          # prints e.g. 051
  python -m ai_router.resolve_set 50              # prints the full slug for Set 50
  ```

  (`next_session_set_number(scan_root)` is the underlying function; it
  returns both the integer and the zero-padded string.)
- **Forward-only — never mass-rename.** A retroactive renumber would break
  every `prerequisites:` slug reference, each state file's
  `sessionSetName`, the on-disk artifact names, and git history. New sets
  get a prefix; existing dirs are left alone.

**Authority by repo:**

- **This canonical repo and any scaffolder output** — the `NNN-` prefix is
  **required**. Soft adoption leaves addressing spotty and reintroduces the
  alphabetical-sort confusion the prefix exists to fix.
- **Consumer repos** (`dabbler-access-harvester`, `dabbler-platform`,
  `dabbler-homehealthcare-accessdb`, …) — the prefix is
  **recommended and forward-only**. Adopt it for new sets; do not rename
  the existing bare-named sets. The number→slug resolver works per-repo, so
  a consumer that has adopted the prefix gets `Set N` addressing
  immediately; one that has not keeps using full slugs until it does.

> **Why number handles at all?** Without a sequence prefix, referring to a
> set in conversation means typing or pasting a long slug, and the Explorer
> sorts alphabetically so "what's the latest set" is not obvious. A
> monotonic prefix plus the `Set N`→slug resolver fixes both. (Set 050
> itself is a small illustration: its slug,
> `050-schema-drift-detection-and-migration-guard`, under-describes the
> broadened scope — but `Set 50` addresses it unambiguously regardless.)

---

## Sizing a session set

Each session is one orchestrator conversation.

### The session-size cap (Set 111 S4)

**The operator target is 15–20 minutes of work per session**, plus 5–20
minutes of verification scaled to risk. Sets 047–074 already met it
(24 min work median), so this is a **regression to fix, not a stretch
goal** — by Sets 106–110 the median session had reached 115 minutes.

**A session declares at most 5 top-level steps.** That number is
measured, not asserted. Across the 172 schema-v4 sessions in this repo
carrying both a parseable spec plan and start/complete timestamps:

| declared steps | n | median | p90 | ran > 2 h |
| :--- | ---: | ---: | ---: | ---: |
| 1–5 steps | 106 | **42 min** | 110 min | 10% |
| 6–8 steps | 64 | **84 min** | 386 min | 28% |
| 9–11 steps | 2 | 86 min | 114 min | 0% |

Crossing from 5 steps to 6 **doubles** the median, triples the p90, and
nearly triples the share of sessions that run past two hours.

Check it before the set starts — the whole point is that an oversized
session is split at authoring, not discovered at hour three:

```bash
python -m ai_router.spec_admission --spec docs/session-sets/<slug>/spec.md
python -m ai_router.spec_admission --all --check   # every spec, CI-friendly
```

**What the cap does not promise.** Step count predicts the **median**,
not the **tail**. The longest sessions on record (591, 562, 544, 509 min)
all declared 5–8 steps — within or barely over the cap. A green result is
a floor on obvious oversizing, not a promise of a short session.

**Declaring an exception.** When a session genuinely must exceed the cap,
say so *in the spec* so the justification survives review:

```
sessionSizeException: 4 - terminal ceremony session; the steps are
independent and none can move to a later session because there is none.
```

An exception with no stated reason is not honoured — it is
indistinguishable from a typo. The cap itself lives in
`ai_router/router-config.yaml` under `authoring.max_steps_per_session`.

### Other sizing signals

- A session that runs out of context budget mid-step is too big. Move
  steps to the next session or split the set.
- Overhead per session (registration, guidance reads, verification,
  notify, commit) is fixed, so a session with a single trivial step is
  dominated by overhead. That is an argument for *merging tiny steps*,
  not for padding a session toward the cap.

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

> **For novel / high-variance efforts, consider a multi-orchestrator planning
> pass before committing the decomposition.** The plan → decompose boundary is the
> highest-leverage place to spend independent-perspective effort: several engines
> each propose an architecture (or, when sequencing is the hard part, a
> decomposition), then adversarially cross-critique and synthesize, with the
> operator confirming. Gate it on *variance/novelty*, not importance — skip it for
> routine increments. See
> [`orchestration-strategy.md`](orchestration-strategy.md).

---

## The Session Set Configuration block

**Every spec must include this block at the top, immediately after the
purpose-and-prerequisites preamble.** It tells the orchestrator (and
external tooling) which gates apply to this set.

```yaml
## Session Set Configuration

requiresUAT: false       # true | false | "suggested" — human UAT review required before set closes
requiresE2E: false       # true | false | "suggested" — E2E test coverage required before notifying
uatStyle: ad-hoc         # dsl | ad-hoc (only meaningful when requiresUAT: true; default ad-hoc)
uatScope: per-session    # per-session | per-set | none (only meaningful when requiresUAT: true)
pathAwareCritique: none  # optional (Set 066); none | advisory | required (default none). Seeds the once-at-set-start choice.
kind: plan               # optional (Set 098); plan | decomposition — scaffolder-emitted module-lifecycle identity. Hand-authored work sets omit it.
prerequisites:           # optional; sets that must complete before this one is workable
  - slug: 047-state-file-schema-v4-audit
    condition: complete
```

> **Prose cannot arm a gate (L-079-2).** The durable gate-policy record
> is captured once, at set start, **from this block**, and is immutable
> thereafter. When authoring or revising a spec, grep the prose for gate
> words ("required critique", "required UAT/E2E") and confirm each has
> the matching config-block flag — a prose-vs-block mismatch surfaces
> only at the most expensive moment (end of set).

### Field semantics

> **REMOVED (Set 112): `tier` and `verificationMode`.** Do not author
> either field. The Lightweight tier and its two per-set verification
> modes are gone; every set runs the routed cross-provider verification
> round on every session. A spec declaring `tier: lightweight` is
> **refused by the loader**, so re-introducing the field in a template or
> a generated spec would hand the consumer a set that cannot run. The
> `sessions[N].type` field those modes appended at runtime
> (`verification` / `remediation`) is retired with them — the authored
> session count is now the whole count. History:
> [`docs/concepts/tier-model.md`](../concepts/tier-model.md).

- **`pathAwareCritique`** (Set 066) — the set's path-aware critique
  policy: an
  end-of-set, **multi-provider** review that retrieves repo ground truth
  itself rather than reviewing a snippet the biased author pasted (the
  Set 065 evidence: 12 unique real defects incl. two Criticals a
  single-shot verifier missed; the 010-vs-C3 split proves a single
  provider is insufficient, so the gate requires >=2 distinct providers).
  Three levels:
  - `none` (**default**) — no gate. The feature is strictly opt-in; a set
    that declares nothing pays nothing, preserving the walk-away promise.
  - `advisory` — a critique is recommended; a missing or invalid artifact
    **warns** at close but never blocks.
  - `required` — the Set-066 close-out gate confirms a valid multi-provider
    [`path-aware-critique.json`](../path-aware-critique-schema.md) artifact
    exists at the set-terminal close (hard-block in an interactive TTY,
    soft-warn headless).

  The spec field only **seeds** the choice: the
  durable record is an `activity-log.json` entry written **once at set
  start and immutable thereafter** (a later
  `start_session --path-aware-critique …` on a started set is a no-op, so a
  mid-set downgrade cannot silently disarm a gate the set already opted
  into). The
  close-out gate itself ships in **Set 066 Session 2**; Session 1 ships the
  attribute, the saved-artifact contract, and the blast-radius predicate
  that recommends a value (`python -m ai_router.blast_radius <paths…>` —
  **advisory only; the operator confirms, it is never a hard auto-set**).
  When a set declares `advisory` or `required`, the operator runs the
  **end-of-set Path-Aware Critique stage** before the set-terminal close — a
  multi-provider, path-aware review using the reusable template
  `ai_router/prompt-templates/path-aware-critique.md`, saved as
  `path-aware-critique.json` ([`docs/path-aware-critique-schema.md`](../path-aware-critique-schema.md)).
  The stage mechanics live in `docs/ai-led-session-workflow.md` →
  *The end-of-set Path-Aware Critique stage*.

- **`kind`** (Set 098; **optional**) — the module-lifecycle set
  identity: `plan` (the set creates **or imports** — and, in a later
  set of the same kind, amends — the module's `project-plan.md`) or
  `decomposition` (the set reads the current plan plus the module's
  existing sets and authors the next batch of session sets).
  **When to use it: scaffolder output only.** The field is emitted by
  the module-lifecycle scaffold writer when a module's two lifecycle
  sets are created (Set 098 Session 2); hand-authored work sets omit
  it, and omission means ordinary work set — every pre-098 spec is
  valid unchanged. An unknown value parses as a **warning, never a
  refusal**: the row degrades to an ordinary work set. The attribute is
  deliberately minimal (module-lifecycle verdict decision 5) — its only
  sanctioned machine consumers are Set 099's delete removal rule (only
  an *unstarted* plan/decomposition set with no execution artifacts may
  be removed outright) and human/tooling legibility; it must **not**
  grow into a workflow/state schema. Set numbers stay global and carry
  no meaning — the attribute, never a magic number, is what tooling
  reads. Decomposition gating is not `kind`'s job either: the
  scaffolded decomposition set declares its sibling plan set under
  `prerequisites:` (`condition: complete`), reusing the existing
  machinery (verdict decision 6).

- **`requiresUAT: true`** — the set must produce a
  `<slug>-uat-checklist.json` and human-UAT review is a precondition
  for marking the set complete. The orchestrator will invoke
  `route(task_type="uat-plan-generation")` and (on the DSL path)
  `route(task_type="uat-coverage-review")` at the appropriate steps.
  Pending UAT blocks downstream sets unless the human explicitly
  overrides.

- **`requiresUAT: false`** — no UAT artifacts are produced; UAT-related
  workflow gates are skipped silently. The set's quality bar is build
  + tests + cross-provider AI verification.

- **`requiresUAT: "suggested"`** (Set 048+) — UAT is recommended but
  not required at spec-authoring time. When the session has UX
  scope, the AI orchestrator asks the operator at session start:
  *"E2E tests, UAT checklist, both, or neither?"* The choice is
  recorded once in `activity-log.json` as a `suggestion_disposition`
  entry and the close-out gate derives from that recorded answer.
  This replaces the originally-proposed triple-redundancy reminder
  pattern (toast + log + close-out warning) with a single upfront
  positive-confirmation prompt.

- **`requiresE2E: true`** — every functional checklist item (when UAT
  is also required AND `uatStyle: "dsl"`) must have matching E2E test
  coverage before the human is notified. When `requiresUAT: false`
  but `requiresE2E: true`, the rule degenerates to "behavioral
  changes ship with E2E tests" — the orchestrator confirms via test
  discovery before notifying.

- **`requiresE2E: false`** — no E2E coverage gate. Unit + integration
  tests are still expected (those are governed by the testing
  hierarchy, not by this flag).

- **`requiresE2E: "suggested"`** (Set 048+) — the upfront-prompt
  mechanism applies symmetrically: if the operator answers "E2E" or
  "both" at session start, the E2E gate is armed for close-out; if
  they answer "UAT only" or "neither", the gate is skipped. The
  recorded disposition lives in `activity-log.json`.

- **`uatStyle: "dsl"`** — checklist items compile to Playwright tests
  via `dabbler-uat-dsl`. **Requires `requiresE2E: true`.** The
  `uat-coverage-review` task gates handoff. Appropriate for
  web/browser UIs where every functional item maps to a Playwright
  step. **`uatStyle: "dsl"` together with `requiresE2E: false` is
  an invalid configuration** — the orchestrator rejects it at Step
  2 rather than silently downgrading to ad-hoc. Authors must either
  set `requiresE2E: true` or switch to `uatStyle: "ad-hoc"`. See
  *Choosing `uatStyle`* below.

- **`uatStyle: "ad-hoc"`** — checklist items are human-runnable steps
  without strict DSL. Each non-judgment functional item declares
  either a `ProgrammaticVerification` reference (unit/component
  test, data-layer assert, AI exploratory check) or a
  `NoProgrammaticPathReason` (one-sentence justification). The
  orchestrator validates this floor before notifying. Appropriate
  for non-web surfaces (CLI, native, Access, COM-driven apps, IDE
  plugins). See *Choosing `uatStyle`* below.

- **`uatScope`** — says WHICH sessions owe a walk, never **whether** any
  does. Only meaningful when `requiresUAT: true`:
  - `per-session` — checklist items accumulate across sessions; the
    final session compiles the cumulative checklist.
  - `per-set` — a single checklist authored at the end of the set,
    covering the whole effort. **This is what an omitted, `none`, or
    misspelled scope resolves to when `requiresUAT: true`.**
  - `none` — invalid here (use `requiresUAT: false` instead). Writing it
    anyway no longer disarms the close gate; it resolves to `per-set`.

  > **Scope cannot disarm an armed flag.** Until Set 111 S4 an omitted
  > `uatScope` collapsed to `none` and switched the close gate off
  > entirely — so `requiresUAT: true` with no scope, the likeliest
  > hand-authored shape, was exactly the spec that could close with no
  > walk and no complaint. Disarming happens where it is visible, in
  > `requiresUAT: false` or `"suggested"`.

- **`prerequisites`** — optional list of other session sets that must
  reach a particular state before this set is considered workable.
  Each entry has two fields:
  - **`slug`** — the directory name (under `docs/session-sets/`) of
    the prerequisite set.
  - **`condition`** — the required state on the prerequisite. The
    enum is `"complete"` only today; a future spec may extend it.
    Omitting `condition:` defaults to `"complete"`.

  Cross-references run after the Session Sets view builds its merged
  set list, so a prereq can target a set in a different workspace
  root. An unknown target slug (typo / missing set) keeps the
  dependent row blocked — typos do NOT silently unblock. The
  Explorer renders blocked rows with a `[BLOCKED BY PREREQS]` badge
  in the row description; the badge is suppressed on terminal-state
  rows (Complete / Cancelled) because once a set has closed, its
  dependency status is no longer actionable. Field added in Set 047
  Session 5; see [`docs/session-state-schema.md`](../session-state-schema.md)
  § Prerequisites for parser semantics and the cross-reference
  derivation rules.

### Defaults

If the configuration block is **omitted entirely**, the spec is
treated as `requiresUAT: false`, `requiresE2E: false`,
`uatStyle: ad-hoc`, `uatScope: none`. Same outcome as writing the
block with all four values spelled out as their defaults.

If the block is **present but a field is omitted**, the missing field
takes its default (`false` for boolean tri-state
flags, `"ad-hoc"` for `uatStyle`, no scope for `uatScope`, and `none`
for `pathAwareCritique`, i.e. no path-aware critique gate). An
omitted `kind` has no default value at all — the set is simply an
ordinary work set. An omitted `uatScope` matters only when
`requiresUAT: true`, where it resolves to `per-set` (see above).

**The safe default is no UAT and no E2E gate.** Authors who want UAT
or E2E coverage must opt in explicitly. This keeps every set's gates
visible in one place and lets non-UI repos use the workflow
out-of-box without touching shared files.

**Migration note for `dabbler-platform` (2026-05-11):** the
`uatStyle` field was introduced in Set 019 of
`dabbler-ai-orchestration`. Existing `dabbler-platform` UAT-enabled
specs were written for the DSL/Playwright path; they need to add
`uatStyle: "dsl"` to preserve current behavior. Without the
explicit declaration, the default `"ad-hoc"` applies and the
mechanical gate degrades from `uat-coverage-review` (Playwright
parity) to "every functional item declares
`ProgrammaticVerification` or `NoProgrammaticPathReason`." Update
each spec's Session Set Configuration block at the platform's next
UAT-touching session set.

Future flags added to the block follow the same opt-in-via-explicit-
declaration rule. Older specs continue to work without modification
when new flags are introduced.

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

### Choosing `uatStyle`

When `requiresUAT: true`, the spec author also picks `uatStyle`:

- **`uatStyle: "dsl"`** — web/browser UI changes where the checklist
  compiles to Playwright via the `dabbler-uat-dsl` repo. **Requires
  `requiresE2E: true`** (the Playwright suite is the mechanical
  floor). Appropriate when every functional item is naturally
  expressed as a browser interaction. The
  `route(task_type="uat-coverage-review")` task verifies every
  non-judgment item maps to a Playwright step before the human is
  notified.

- **`uatStyle: "ad-hoc"`** — non-web UI where Playwright is not
  applicable. CLI tools, native apps, Microsoft Access / COM-driven
  applications, IDE plugins, anything driven through a non-browser
  interface. Each non-judgment functional item declares either:
  - `ProgrammaticVerification: "<reference>"` — naming the unit
    test, component test, data-layer assert, or AI exploratory
    check that mechanically satisfies the item.
  - `NoProgrammaticPathReason: "<justification>"` — a specific
    one-sentence reason why the item genuinely cannot be verified
    programmatically.

  The orchestrator validates the floor locally before notifying;
  there is no `uat-coverage-review` route on the ad-hoc path.

- **Default when `requiresUAT: true` and `uatStyle` omitted:**
  `"ad-hoc"`. Per universal-core / gated-extensions: the
  lower-scaffolding path is the default; DSL is opted into
  explicitly. Repos with active web UAT machinery (notably
  `dabbler-platform`) must declare `uatStyle: "dsl"` on existing
  and new UAT-enabled specs — see *Migration note* in the field-
  semantics section above.

**Mixed surfaces.** A set whose work spans web and non-web should
split into sibling sessions or sibling sets — that is the cleanest
path. If splitting is genuinely impractical and the set must
combine surfaces into one checklist, declare `uatStyle: "ad-hoc"`
for the whole set. The DSL path requires Playwright parity for
every non-judgment functional item (no per-item exceptions), so a
single-`uatStyle: "dsl"` set cannot accommodate non-browser items;
the ad-hoc gate gracefully covers both surfaces in one checklist
(browser items can declare a `ProgrammaticVerification` referencing
an existing Playwright test if any, while non-browser items declare
their own programmatic-verification reference or a
`NoProgrammaticPathReason`).

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
# prerequisites:                # uncomment if this set depends on another
#   - slug: <prerequisite-slug>
#     condition: complete
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

## Sessions

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
prerequisite in **two places**:

1. **Prose** — the `**Prerequisite:**` line in the preamble at the
   top of `spec.md`. Human-readable; no machine semantics.
2. **Machine-readable** — the `prerequisites:` field in the Session
   Set Configuration block (see field semantics above). The
   Session Sets view's `[BLOCKED BY PREREQS]` badge is driven from
   this field; the prose preamble is not parsed.

The two should agree. The structured `prerequisites:` field is what
gates the Explorer's visible blocking signal — a prereq omitted
there is invisible to the tool even if the preamble names it.

For a set that consolidates outputs from multiple prior sets (a
**synthesis** set), declare every prerequisite in both surfaces.
The synthesis set's last session typically produces a
`change-log.md` that summarizes the combined effect across all
prerequisites.

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

## The test-run policy (Set 111 S4)

Canonizes the policy piloted in Set 110's operator notes. The waste
pattern being eliminated is **invalidated runs**, not full runs.

- **Every suite runs in two modes:** *targeted* — the specific tests
  covering what you just changed, any time; and *full* — **exactly once
  per suite per session, at Step 8, after every code-changing stage is
  finished.** That single full run is the run of record. Never start a
  full run you might invalidate.

  **A full suite run during the loop is not "targeted testing with a
  wide net."** Set 116 S3 briefly wrote that it was, and the close
  backstop refused the close over it, correctly: the wording relabels
  the exact behaviour this policy exists to eliminate, and the session
  that wrote it had by then run the full pytest suite **three times**.
  If you want a signal mid-loop, run the tests that cover what you
  changed — that is what *targeted* means, and it is seconds, not
  minutes. The rule bounds the runs, not merely which one is recorded.
- **Count the path-aware critique as a code-changing stage** (Set 116
  S3, learned the expensive way). On a set whose `pathAwareCritique` is
  `advisory` or `required`, the critique reads the repo and routinely
  produces remediation — and it is produced *before* the set-terminal
  close, which is *after* Step 8's run in the naive reading. Set 116 S3
  ran its Step 8 pytest, then ran the critique, then had to re-run the
  whole suite because the critique changed code. **On an armed set the
  order is: verify → remediate → critique → remediate → full run →
  close.** The full run goes last because "last" means last, not
  "last among the stages you happened to think of."
- **"After the last code change" means Step 8, not Step 5** (Set 116 S3).
  Step 7 remediation *is* a code change and verification finds something
  in nearly every session, so a full run at Step 5 is invalidated
  wherever it matters — the instruction was unsatisfiable, not merely
  ignored. Set 112 S3 obeyed it into 15 test runs and 186 minutes, 59%
  of the session. Recording a run at Step 8 does not stale the
  verification that just passed (Set 116 S2), which is what lets this be
  a last step rather than a loop.
- **All three layers are `expensive: true`** (Set 116 S3). Layer 1 was
  declared cheap while costing 14 minutes, so the gate had no opinion
  about the suite that cost the time; Layer 2 was declared cheap and
  then went unrun for two whole sessions of Set 114, which is how that
  set shipped two close-gate regressions into its own sample project.
  `expensive` is not a claim about the clock — it is the flag that
  decides whether `test_run_fresh` has an opinion.
- **Verification rounds do not each trigger suite runs.** The remediation
  sidecar's acceptance checks are the per-round evidence; the full run
  belongs to Step 8, once.
- **Non-negotiable exception:** any session touching the Explorer
  rendering surface, a state-file writer, the extension MANIFEST, or the
  fixture harness runs the full Layer 3 at its own close. Layer 2 and
  every static gate stayed green while a real rendering regression was
  live, and only Layer 3 caught it.
- **A release-boundary session runs the whole matrix once** against the
  final build.
- **CI is the push-time backstop, never the session gate.** Close
  evidence is local and in-session; do not block a close on a remote
  queue.

### The freshness check is executable, because prose was not enough

Set 110 S3 tried to close on a full run that predated three test fixes,
**disclosed it in the sidecar**, and was correctly refused by the
backstop. The orchestrator agreed with the policy and slipped anyway.
Prose does not survive end-of-session pressure, so the run of record is
now recorded and checked:

```bash
# at Step 8, after remediation, and after the suite goes green:
python -m ai_router.run_of_record record \
    --session-set-dir docs/session-sets/<slug> \
    --suite playwright --outcome passed --detail "35 passed / 0 failed" \
    --duration-seconds 210.4   # required (Set 116 S1): wall-clock, not a guess

python -m ai_router.run_of_record suites          # what is declared
python -m ai_router.run_of_record check --session-set-dir <dir> --check
```

The `test_run_fresh` close gate then refuses a close when an expensive
suite's covered surfaces changed after its run was recorded. Freshness is
a **content digest** over those surfaces, not an mtime — a checkout or a
no-op save rewrites mtimes without changing a byte, and both directions
of that error are unacceptable in a gate.

The gate is inert where it should be: a suite whose surfaces this session
did not touch is not required.

Read `covers` literally — it is a **path prefix, not a file type**. A
session that changed only documentation owes nothing *if that
documentation sits outside every suite's `covers`*. In this repo
`pytest` covers `ai_router/`, so editing `ai_router/docs/close-out.md`
owes a pytest run even though no code changed. That is deliberate: a
prefix is cheap to evaluate and impossible to argue with at close, and
it errs toward running a suite you did not need rather than skipping one
you did.
Suites are declared in `router-config.yaml` under `testing.suites`
(`name`, `command`, `covers`, `expensive`).

---

## The step-checklist cadence (Set 114 S1)

`python -m ai_router.session_checklist` renders the session's logged
steps with the current one marked `<- here`. Set 111 S4 shipped it and
told the orchestrator to post it "at every transitional boundary" —
without saying what one is. An undefined cadence cannot be followed
consistently or checked at all, so that session posted **once** in many
hours and nothing noticed.

**A transition is a moment where the answer to "where is this session?"
just changed.** Five of them, and no more — a checklist posted after
every step is scrolled past like any other banner:

| Transition | Post when | Checked? |
| :--- | :--- | :--- |
| **Session start** | Right after `start_session`, once the plan's steps are logged. | Yes |
| **A test suite's run is recorded** | After a blocking suite finishes **and its record is written** — `run_of_record record` first, then post. | Yes |
| **A verification round completes** | After `verify_session` returns and appends its `round-completed` line to `sN-rounds.jsonl`, before remediating or moving on. | Yes |
| **Before a long-running command** | Before you start one you expect to block for minutes (a full suite, a routed round). | **No** — see below |
| **An operator stop is journaled** | After `decision_journal` records the human-authority decision. | Yes |
| **Before the education-mode brief** | Immediately before you put the question to the human, so they see where the session is while they decide. | **No** — see below |
| **Before close** | After the last logged step, before `close_session`. | Yes |

> **"Checked" no longer means "blocked" (Set 116 S3).** The operator's
> 2026-08-10 gate ruling demoted `checklist_posted` to warn-not-block:
> the ledger, the cadence above, and the comparison all survive and
> still print at close, but a missed post cannot refuse the close. The
> case for keeping the signal is written into the gate's own docstring
> — Set 111 S4 posted once across dozens of transitions and nothing
> noticed, *because a close gate cannot observe a chat window*. The case
> against the veto is that its first two dogfoods, Set 114 S1 and both
> of Set 116's own earlier sessions, all ended in operator-attested
> waivers. Signal kept, veto removed; deletion stays available in a
> later set, on evidence.

### Posting is recorded by the act of posting

Rendering the checklist appends one line to `checklist-posts.jsonl` in
the session-set directory (session, timestamp, step count, which step
carried `<- here`). Nobody attests to anything: the `checklist_posted`
close gate compares that ledger against the transitions the session's
**own records** already show — `startedAt` in `session-state.json`, each
`test-runs.jsonl` record, each completed round in `sN-rounds.jsonl`,
each **human-authority** row in `decisions.jsonl` (a decision the AI may
not take alone *is* an operator stop), and the newest `activity-log.json`
entry. Each transition needs its own post before the next transition
happens, so a single post at the end does not cover a whole session.

**Order matters around a long-running command.** The transition's
timestamp is the `recordedAt` of the run-of-record line, so record the
run and *then* post. Posting before you record leaves the transition
uncovered and the close gate will say so. A verification round needs no
such care: `verify_session` writes its own `round-completed` line before
it returns, so any post after the command finishes covers it.

Three limits worth stating plainly:

- **Every "before X" moment in this table is doctrine, not a gate.**
  There is a general reason, not two special cases: this framework's
  records are all written *after* the thing they describe, so the gate
  can prove a post followed an event and can never prove one preceded
  it. Starting a command leaves no artifact, and `decisions.jsonl` gets
  its line once the decision exists — after the brief, not before it. A
  flag that let the orchestrator declare "I posted first" would be the
  self-reported attestation this set exists to avoid, and it would decay
  exactly as the prose obligation did. So the two before-posts are
  prescribed and unchecked, and the table says so rather than implying
  otherwise. Post before you start anyway: the before-post is for the
  operator staring at a silent terminal or being asked a question, which
  is the whole point of the surface.
- **A post proves a render, not a reader.** The gate can be satisfied
  mechanically. The floor it buys is that an omission becomes visible.
- **Exactly one transition can be excused**, and only by being older
  than the session's first post: the **session start**. A ledger cannot
  describe the time before it existed, so a session already in flight
  when this shipped, or one in a repo that upgraded mid-session, is not
  failed for a start it could not have recorded. Every other transition
  binds however old the ledger is, and a session with no posts at all is
  refused outright. Records older than the session's own `startedAt` are
  not its transitions at all.

### When a post was missed

You cannot post into the past, so a window that closed cannot be
re-entered. The exit is an **operator-attested waiver**, the same shape
the UAT gate uses:

```json
"checklist": {
  "status": "waived",
  "attestation": "Operator, <date>: missed the post after <transition>; waived with the omission on the record."
}
```

An unattested or blank waiver is refused by both the gate and the
disposition validator, and a waiver never excuses a session that posted
**nothing** — that is still a flat refusal.

This escape exists because Set 114 S1's own dogfood refused the session
that shipped the gate: two verification rounds went by without a post,
and with no waiver the only remaining exit was `close_session --force`,
which bypasses every *other* gate as well. A check whose sole remedy is
`--force` makes the close-out weaker, not stronger. The waiver keeps the
omission on the record with a name against it, which is the point —
silently letting a late post cover it is what the positional windows
exist to prevent.

`--no-record` renders without recording, for scripted or repeated reads.
It can only ever weaken the caller's own position at close, never
strengthen it.

The ledger is **freshness-exempt but evidence-visible**: it is named in
`verification_stamp.WORK_DIFF_SET_BOOKKEEPING`, so a post written after
a stamped round does not stale that round (which would send the close
backstop into a fresh metered round, making posting cost money and
guaranteeing the obligation decays again), and in
`EVIDENCE_VISIBLE_BOOKKEEPING`, so the verifier still reads it.

### The plan in the ledger (Set 114 S2)

The checklist also shows what is **coming**. `start_session` parses this
session's numbered steps out of `spec.md` and writes them into
`activity-log.json` as `pending` entries carrying `kind: "plan-step"`,
so an operator sees the whole session on the first post rather than one
row that grows.

This does not reopen Set 111 S4's decision that the renderer never
invents rows. It is the opposite: the plan is put **into the record**,
and the renderer keeps its one rule. What that buys, and what it costs
a spec author:

- **The step's opening phrase becomes its label.** `**Seed the plan at
  session start.** ...` renders as `Seed the plan at session start`, and
  the full prose stays behind `--verbose`. A step that opens with a bold
  lead — which this guide's template already asks for — reads well; one
  that opens mid-sentence reads badly. That is the only new authoring
  consequence.
- **Reconciliation: the plan owns each row's position, the logged step
  owns its content.** A logged step claims the planned row with the same
  `stepKey` first — identity — and only then by `stepNumber`, so keep
  `log_step`'s step numbers aligned with the spec's; the long-standing
  convention is now load-bearing. Logging out of order does not reorder
  the plan.
- **Editing the plan mid-session is safe, and costs only tidiness.** The
  ordinal half of that match is an inference — "logged step 2 is planned
  step 2" — and it stops being true the moment a step is inserted and
  later work renumbered. So it is gated: `plan_matches_spec` compares the
  seeded step texts against `spec.md` as it stands now, and an edited (or
  missing, or newly unparseable) spec withdraws ordinal matching for that
  session. The checklist then shows every original planned step still
  `[ ]` and the new work as unplanned rows, rather than quietly
  relabelling one row and losing another. Nothing is ever rendered *from*
  the spec; it answers one question, and only decides whether an
  inference can be trusted.
- **Nothing is dropped in either direction.** A step the plan did not
  predict appears, appended after the plan; a planned step nobody logged
  stays a visible `[ ]`. A close that leaves `[ ]` rows is not blocked —
  the checklist reports, the disposition explains.
- **Seeded once, never re-seeded.** The plan is a snapshot of what the
  session set out to do. A re-registration after a context reset writes
  nothing, and a spec edited mid-session shows its new work when that
  work is *logged*, as an unplanned row. Re-seeding would write to the
  activity log mid-session and let the plan mutate under an operator who
  read it an hour ago.
- **The plan is not work, and neither is writer bookkeeping.**
  `check_activity_log_entry` counts only entries with **no `kind`** —
  the seeded plan, the `pathAwareCritique` and `contractGate` policy
  records, and every other `kind`-bearing entry are written *for* a
  session at registration, not *by* it doing work. The checklist-post
  gate applies the same rule to "the work moved on". A session cannot
  close on the strength of records `start_session` wrote for it.
- **A spec the parser cannot read costs nothing.** No `spec.md`, no
  `### Session N of M:` headings, no numbered steps, or a session the
  spec does not describe: seeding is a no-op and the checklist renders
  exactly as it did before — which is what a consumer repo with older
  specs gets. The step texts come from `ai_router.spec_admission`, the
  same parser that enforces the session-size cap, so the size a spec is
  admitted at and the plan an operator is shown can never disagree.

---

## The guided-look UAT (Set 111 S4)

Canonizes the format piloted in Set 110's operator notes, adopted after
the operator named the real problem: *"We often bypass UAT. I haven't
complained because it totally sucks, but we shouldn't bypass it. It
should be a pleasurable experience."*

**A walk is a guided look, not a test script.** Two sections only, and
the whole thing fits in **ten minutes**:

- **Look (≤5 items)** — confidence glances derived from the acceptance
  criteria and from surfaces automation is blind to: rendering, theming,
  timing, feel. **Three lines maximum per item**: one line to get there,
  one line to say what to look at, one question. Every item must be
  self-contained for a reader who has not watched the work.
- **Decide (≤3 items)** — provisional calls the AI made that only the
  operator can ratify, judged while looking at the real thing. **Answers
  are choices, never essays.** Source them from the session's
  `decisions.jsonl` (the records whose `authority` is `operator`, or
  whose tiebreak reached the human). The next session opens by showing
  each call applied or reversed.

Lead with the strongest moment. End with a visible finish.

**It starts itself.** The operator stages nothing:

```bash
cd tools/dabbler-ai-orchestration
npm run walk                                   # fresh fixture workspace
npm run walk -- --walk-doc ../../docs/session-sets/<slug>/sN-uat-walk.md
```

`npm run walk` builds a disposable fixture workspace, launches the real
Extension Development Host against it with the same isolation flags the
Playwright suite uses, and opens the Dabbler view by itself. It is a
**walk, not a test**: no assertions, no exit-code verdict. The operator's
judgment is the verdict.

### No silent bypass

A `requiresUAT: true` session closes only with its walk recorded, or with
an operator-attested waiver. The `uat_walk_recorded` close gate reads
`disposition.uat`:

```json
"uat": {
  "status": "walked",
  "walkArtifact": "s4-uat-walk.md",
  "attestation": "operator walked it 2026-08-07; called the tree 'pleasurable'"
}
```

```json
"uat": {
  "status": "waived",
  "attestation": "operator declined: this set shipped no UI surface"
}
```

`walked` requires a `walkArtifact` that **exists on disk** — a recorded
walk must point at the walk actually presented. `waived` requires only
the attestation. There is deliberately no third value: "the walk just did
not happen" is the outcome this gate exists to make impossible. Skipping
becomes a visible operator decision, not an evaporation.

Scope follows the config block: `uatScope: per-set` puts the obligation
on the final session and `per-session` on every session. An omitted,
`none`, or unrecognised scope resolves to `per-set` rather than
disarming the gate — scope chooses the sessions, it never cancels the
requirement. A `requiresUAT: "suggested"` set is advisory and never
gated, and `requiresUAT: false` is the way to opt out.

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
