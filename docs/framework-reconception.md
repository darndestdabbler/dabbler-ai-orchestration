# The framework, reconceived around supervisors

**Set by the operator, 2026-08-25.** This supersedes the six-step framing in
`docs/framework-and-pilot-plan.md`, which assumed the reader was building.

## Who this is for, and why it changes everything

**Staff are light supervisors of AI engines, not developers.** They have been
told so. They are heavily involved in high-level planning and much less involved
during build, test and verify.

**The framework's job is to spend a supervisor's attention only where a decision
is genuinely theirs, and to spend AI tokens everywhere else.** Both are costs.
The second is far cheaper.

**The earlier versions of the extension did the supervisor part well.** What
went wrong was the framework around it: too big, too much ceremony, and it broke
work into work-components without ever decomposing the solution first.

## The hierarchy

**A solution has a component graph and a series of work packages; a work package
owns sessions.** Sol's review killed the first version of this, which hung one
work plan under each component. Two reasons, both right: **a component lives for
the solution's lifetime while a plan has to finish**, and real work — a feature, a
contract change, a migration — routinely spans several components and cannot be
nested honestly under one.

```text
Solution
├── Component graph        durable: contracts, versions, consumers
└── Work packages          bounded: each finishes and is never reopened
    └── Sessions           Not Started · In Progress · Done · Cancelled
```

| Level | What it is | Artifact | Who leads |
| --- | --- | --- | --- |
| **Solution** | The thing being built, its plan and design | `solution.yaml` | AI **and** human |
| **Component** | A black box with a contract, a version, consumers | contract + manifest entry | AI **and** human |
| **Work package** | One bounded change objective, naming the components it affects | a session set | **AI leads** |
| **Session** | One unit of work | `session-state.json` | AI |

**A work package is a session set — the two are one object, not two.** It carries
an objective, the components it affects, acceptance criteria, and an ordered list
of sessions. **Once accepted it is never reopened;** a later contract change opens
a new package that names the one it supersedes.

**Sessions keep today's four states: Not Started, In Progress, Done, Cancelled.**
That is what the operator's four glyphs are for, and it is where they belong.

## Where the supervisor actually is

| Phase | Supervisor | Gate |
| --- | --- | --- |
| Plan and high-level design | **Heavy — works with the AI** | Approves |
| Decompose into components **and formalize their contracts** | **Heavy — works with the AI** | Approves |
| Work packages and their sessions | AI leads | **No gate** |
| Build, targeted test, verify, full suite | **Silent** | No gate |

**Contract formalization moved into the decomposition gate**, and this was the
most valuable thing Sol found. The earlier version gave contracts "a glance, no
gate" — but **a contract is executable design, and an unapproved baseline is
never caught later**, because a wrong baseline is not a *change* and so never
raises a contract-change event. Everything built afterwards inherits it.

**This widens an existing gate rather than adding a third one.** The approval
package becomes: components, their interfaces, invariants, error semantics,
versioning rules, consumers, and acceptance examples.

**The human accepts remaining findings rather than waiting for a clean review.**
Five real rounds on one plan produced four new and correct Major findings every
time; review-until-clean has no terminal state and no token ceiling.

## What breaks the silence

**Attention is an explicit event, never inferred from status.** Sol's phrase for
the failure mode is exact: inferring "waiting on you" from statuses across three
levels produces false positives and forces the supervisor to go inspecting.

**The extension shows one inbox of unresolved attention events.** Each carries the
decision being asked for, a recommended option, why automation cannot decide it,
the affected components, the evidence, and whether it blocks.

**An ordinary failed test is not a human decision.** Test failures, flakes and
environmental faults stay inside an automated retry loop. Work escalates only
when approved scope, a contract, acceptance criteria, or an architectural
decision has to change.

## The session lifecycle

**Within or across sessions there is one predictable lifecycle: build, targeted
testing, verify, full-suite testing.** It does not vary by component or by
supervisor, because a lifecycle a caller can vary is one a caller gets wrong.

## Verification, and what it costs

**Cross-provider review runs once per work package at its integration boundary,
not once per session.** Session boundaries are an operational convenience, not a
risk boundary, and per-session review re-sends invariant context to scrutinise
intermediate states that later sessions may replace.

**Deterministic checks still run after every session** — tests, type checks,
static analysis. They are nearly free and they catch a different class of thing.

**Independent review fires early only on declared risk:** a public contract
change, authentication or authorization, a data migration, an irreversible
operation, or a diff over the reviewability budget.

**A review round is bounded, and the reviewer only re-checks its own findings**
rather than opening an unrestricted new pass.

## How work leaves the supervisor's hands

**The supervisor copies a prompt from the tree and pastes it into an AI engine**,
and the extension is the only surface they use. This is the operator's decision
and it is what the earlier versions did well.

**Sol's strongest objection is against this, and it should be recorded rather
than argued away.** A person who notices completion, picks the next prompt,
pastes it, supplies missing context and restarts interrupted runs **is the
scheduler and the transport layer**, and multiplying sessions by component
multiplies those handoffs. Watching progress is supervision even when no
approval button is involved.

**The mitigation is granularity: one paste per work package, not per session.**
That is what collapsing work plan and session set into one object buys, and it
cuts handoffs by roughly the number of sessions in a package.

**Where that is not enough, the honest description is "human-operated
sessions", not "silent supervision".** An executor that advances sessions on its
own is the alternative, and it is infrastructure the operator has not asked for.

## Artifacts: one role each

**Reusing all four artifacts as active process obligations would be the ceremony
returning under a different name.** Sol is right that existing rendering and v1
compatibility do not justify four independently maintained sources of truth.
Each keeps one role and no more:

| Artifact | Role |
| --- | --- |
| `spec.md` | The objective, scope and acceptance criteria of one work package. **Must not repeat `solution.yaml` or the contracts.** |
| `session-state.json` | Minimal machine-owned operational state. **Generated, never narrated into.** |
| `activity-log.json` | Optional diagnostic output with retention limits. **Never required reading, never gate evidence.** |
| `change-log.md` | Generated from accepted work packages at release time, **not updated per session.** |

**v1 projects keep opening unmodified through a legacy renderer**, rather than by
preserving v1's workflow semantics.

## What must not come back

**The ceremony is what made the earlier framework too big**, and bringing session
sets back under components risks bringing it with them. Named so it can be
checked: close gates with five conditions, test-evidence stages, the affected-test
selector, verification stamps, per-set migration paths, and a 43-command surface.

## Still the operator's call

**Handoff granularity is the one open decision, and it is a cost trade rather
than a design flaw.** One paste per work package is proposed above. If packages
turn out to run long, the choice is between more pastes and building an executor.

**Everything else Sol raised is folded in above.** Its review is kept verbatim at
`docs/reviews/sol-on-reconception.md`, including the parts not adopted.
