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

tier: full               # full | lightweight (Set 048+; pre-Set-048 specs default to "full")
requiresUAT: false       # true | false | "suggested" — human UAT review required before set closes
requiresE2E: false       # true | false | "suggested" — E2E test coverage required before notifying
uatStyle: ad-hoc         # dsl | ad-hoc (only meaningful when requiresUAT: true; default ad-hoc)
uatScope: per-session    # per-session | per-set | none (only meaningful when requiresUAT: true)
verificationMode: out-of-band-or-none  # Lightweight only (Set 057); dedicated-sessions | out-of-band-or-none (default). Seeds the once-at-set-start choice. Omit on Full-tier sets (Set 082).
pathAwareCritique: none  # tier-orthogonal (Set 066); none | advisory | required (default none). Seeds the once-at-set-start choice.
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

- **`tier: "full"`** — the set runs through the full AI router:
  cross-provider verification, automated close-out, metrics. Default
  for any spec authored before Set 048. Backwards-compatible for
  every existing spec.

- **`tier: "lightweight"`** (Set 048+) — the set runs under
  `--no-router` mode: no metered API calls, no auto-verification.
  The orchestrator follows the same write discipline as Full (same
  state-file shape, same Work Explorer UX, same model /
  effort / session identification), but verification is handled
  per-set (not per-session) via one of two `verificationMode` flows
  (see below). See `docs/ai-led-session-workflow.md` Step 6
  → "Lightweight tier — verification (per-set; two modes)" for the flow.

- **`verificationMode`** (Set 057; **Lightweight only**) — how the set's
  per-set verification runs. `out-of-band-or-none` (**default**) keeps the
  copyable-review-prompt flow: the operator pastes a prompt into a second
  assistant and records the verdict by hand in `external-verification.md`.
  `dedicated-sessions` opts in to structured **typed sessions** — a blessed
  verification session on a different engine, an optional remediation
  session when issues are found, a bounded re-verification loop (rounds 1–2
  automatic, 3+ human), and a content-aware close-out gate that confirms a
  different-engine verification ran (hard-blocks in an interactive TTY,
  soft-warns headless). The field here only **seeds** the choice; the
  durable record is an `activity-log.json` entry (`kind:
  "verification_mode"`) written **once at set start** — either from this
  seed (recorded automatically at the first `start_session` when no choice
  exists yet) or from an explicit `start_session --verification-mode …`.
  Omitting both leaves the default `out-of-band-or-none` applying
  implicitly (strictly opt-in). A set that already started under Mode A
  can still opt in later through the sanctioned blessed writer
  (`python -m ai_router.change_verification_mode <slug>`, Set 062 —
  A→B only, gated, recorded as a superseding `verification_mode_change`
  entry; see `docs/ai-led-session-workflow.md` → *Sanctioned Mode A →
  Mode B transition*). The field is inert on Full tier (which
  keeps automatic, rule-based cross-provider verification) —
  **Full-tier specs omit the field entirely** (Set 082: the scaffolder
  renders the `verificationMode:` line on Lightweight only; omission
  means the default, so never declare it on a `tier: full` set).

  **Session `type` (Set 057).** The `dedicated-sessions` flow appends
  runtime sessions to `session-state.json`'s `sessions[]` carrying a
  `type` field: `work` (default; absent on every existing and Full-tier
  entry), `verification`, or `remediation`. `type` is a **session-state**
  field, not a spec config field — spec authors never write it; the blessed
  writers (`start_session --type …` to open a typed session, and
  `start_session --type … --handoff` to chain one) do — never a freehand
  edit. See
  [`docs/session-state-schema.md`](../session-state-schema.md) for the
  per-session shape. Verification/remediation sessions are **not** authored
  in spec.md and take their step list from the workflow doc, so the
  authored session count in the spec stays fixed even as the runtime count
  grows.

- **`pathAwareCritique`** (Set 066; **tier-orthogonal** — valid on both
  Full and Lightweight) — the set's path-aware critique policy: an
  end-of-set, **multi-provider** review that retrieves repo ground truth
  itself rather than reviewing a snippet the biased author pasted (the
  Set 065 evidence: 12 unique real defects incl. two Criticals a
  single-shot verifier missed; the 010-vs-C3 split proves a single
  provider is insufficient, so the gate requires >=2 distinct providers).
  Three levels:
  - `none` (**default**) — no gate. The feature is strictly opt-in; a set
    that declares nothing pays nothing, preserving the walk-away promise on
    both tiers.
  - `advisory` — a critique is recommended; a missing or invalid artifact
    **warns** at close but never blocks.
  - `required` — the Set-066 close-out gate confirms a valid multi-provider
    [`path-aware-critique.json`](../path-aware-critique-schema.md) artifact
    exists at the set-terminal close (hard-block in an interactive TTY,
    soft-warn headless — the Set 057 Q6 fail-posture pattern).

  Like `verificationMode`, the spec field only **seeds** the choice: the
  durable record is an `activity-log.json` entry written **once at set
  start and immutable thereafter** (a later
  `start_session --path-aware-critique …` on a started set is a no-op, so a
  mid-set downgrade cannot silently disarm a gate the set already opted
  into). Unlike `verificationMode` (Lightweight-only), this attribute is
  **tier-orthogonal** — the close-out wiring is net-new on the Full-tier
  close path precisely *because* the existing `dedicated-sessions` gate is
  Lightweight-only, not because the attribute is Full-tier-specific. The
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
  positive-confirmation prompt. Applies to both Full and Lightweight
  tiers.

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

- **`uatScope`** — only meaningful when `requiresUAT: true`:
  - `per-session` — checklist items accumulate across sessions; the
    final session compiles the cumulative checklist.
  - `per-set` — a single checklist authored at the end of the set,
    covering the whole effort.
  - `none` — invalid here (use `requiresUAT: false` instead).

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
treated as `tier: full`, `requiresUAT: false`, `requiresE2E: false`,
`uatStyle: ad-hoc`, `uatScope: none`. Same outcome as writing the
block with all five values spelled out as their defaults.

If the block is **present but a field is omitted**, the missing field
takes its default (`"full"` for `tier`, `false` for boolean tri-state
flags, `"ad-hoc"` for `uatStyle`, `none` for `uatScope`, and — for the
opt-in attributes — `out-of-band-or-none` for `verificationMode` and
`none` for `pathAwareCritique`, i.e. no path-aware critique gate). An
omitted `kind` has no default value at all — the set is simply an
ordinary work set.

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

## Repo-specific addendum

If your repo has UI / UAT / E2E concerns, see the repo-specific
addendum file in the same directory (e.g.,
`session-set-authoring-guide.platform-addendum.md` for dabbler-platform).
The addendum names the project's E2E test directory, UAT checklist
schema, when-to-flag heuristics specific to the framework, and any
master plan that drives the next-session-set recommendation. If your
repo has no such addendum, the body of this guide is sufficient on
its own.
