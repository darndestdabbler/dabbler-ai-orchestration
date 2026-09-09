# The session framework — implementation plan

**Builds:** `docs/session-framework-spec.md`.
**Date:** 2026-08-26
**Branch:** `design/solution-decomposition`

**Ordering principle: staff have a working alternative already.** They will not
adopt a half-built framework out of loyalty. So the order below is set by
*when it becomes worth switching to*, not by architectural tidiness — and
Milestone A is the smallest thing that beats what they are doing today.

**Cost basis:** one experienced engineer, days of focused work, not calendar
days. Totals are not padded and not additive across parallel work.

---

## What already exists and is reused

Worth stating first, because it changes the estimate materially.

| Already built | Where | Used for |
| --- | --- | --- |
| Copilot CLI transport with hard provider exclusion | `route.py`, `transports/copilot.py` | Cross-vendor verification on the seat |
| Seat catalog spanning three vendors | `copilot-catalog.lock` | The verifier is a different vendor |
| **One dispatch body over a Transport protocol** | `route.py` | Both transports behind one loop; the default is one line |
| **Role resolution with a preference order** | `copilot.py::resolve_role_candidates` | Spec §5.a, today seat-only |
| **Catalog staleness detection and a refresh writer** | `copilot.py::validate_catalog`, `REFRESH_COMMAND` | Spec §5.b/§5.d on the seat path |
| **Per-call token metrics, per session and per model** | `metrics.py::record_call` | Spec §7 — already recording |
| **Project-local config overlay** | `config.py` (`local-overrides.yaml`) | Spec §7 — a repo names its own keys |
| **One indirection for every secret lookup** | `secret_resolver.py` | Spec §7 — per-cost-centre keys need no new call sites |
| Check execution and exit-code reading | `checks.py::execute`, `_spawn` | The framework runs the tests |
| Tree snapshot and diff | `checks.py::snapshot_worktree_tree`, `changed_paths_between` | Session diff, path envelopes |
| Worktree-per-run | `git.worktree_per_run`, `worktree create` / `init` | Isolation, already wired |
| Verdict parsing and severity classification | `verdict.py` | Round caps, Minor-only stop |
| Sanctioned writers | `writers.py` | The framework writes the two files |
| The house review prompt | `prompt-templates/verification.md` | Gap 2, unchanged |
| Extension tree, row actions | `workExplorerTreeModel.ts` | The session view |
| **Operator-authored status icons**, light and dark | `media/light/`, `media/dark/`, resolved by `SessionSetsModel.ICON_FILES` | Not-started, in-progress, done, cancelled |

**Nothing in the spec requires a new subsystem.** It requires deletions, one
new tool surface, one new discovery path, and three loops.

---

## Milestone A — a session runs end to end, and it is worth switching to

**Target: 13 days.** At the end of this, a staff member can run a numbered
session in a library repo, get automatic cross-provider verification with a
verifier that can actually look at the code, and land the work. That is the
point at which the framework beats their current practice.

### A1 — Credential allowlist · 1 day

`checks.py::_spawn` passes no `env=` in either branch, so check commands
inherit every vendor key. Build the child environment from an allowlist of
what the toolchain needs; redirect `TEMP` and `TMP`; exclude vendor keys, feed
PATs, git tokens, proxy credentials, and `_JAVA_OPTIONS`-style option
variables. Add a sentinel test on Windows that asserts a spawned process cannot
see a planted secret.

*First because §3.f introduces the feed PAT, and because it is the one item
every review in this project has ranked first.*

### A2 — Record authority, which is the gates feature · 2 days

One `validate_transition()` used by both `workflow.append()` and
`workflow.fold()`:

- forward entry is sequential; returns may only move backward;
- an approval requires a live review and a current approval step;
- an event's step must match current state;
- **a `simulated` review does not set `reviewed`** — `fold` records the flag
  today and never reads it;
- remove the verifier's self-exemption in `verdict.py::is_doc_only_issue`, so
  a verifier cannot make its own finding non-blocking by choosing which
  evidence paths to cite.

*This is gap 3. Without it the orchestrating engine can skip whatever it likes,
which is exactly what the staff did without the framework.*

### A3 — Collapse session sets · 2 days

Sessions numbered directly in a repository. Remove the set level from the CLI,
the state files, and the extension tree. Keep the numbering convention staff
said they liked.

**Keep the operator's status icons exactly as they are.** A session row renders
`not-started.svg`, `in-progress.svg`, `done.svg`, or `cancelled.svg` from
`media/light/` and `media/dark/`, resolved by name through
`SessionSetsModel.ICON_FILES` and passed to `TreeItem.iconPath` as a
`{ light, dark }` pair. Removing the set level must not disturb that
resolution — the same four filenames, the same two directories, the same
mechanism.

**Do not "simplify" these to a single `fill:currentColor` asset.** That
refactor has already been proposed twice by different models at high
confidence, and it is wrong: a `contributes.viewsContainers` icon and a
`TreeItem.iconPath` are not rendered by the same mechanism, and the light/dark
split exists because the as-authored glyphs carried hardcoded `#ffffff` that
made `not-started` nearly invisible on a light theme. The reasoning and the
empirical evidence are in `media/status-icon-theming.md`; there is a Playwright
test that reads the computed style in a real Extension Development Host rather
than trusting documentation.

*Deletion, not construction. The risk is missed references, not design.*

### A4 — The two files, framework-written · 1 day

`project-work-plan.md` and `decisions-log.md`, written only through
`writers.py`, fixed shape. Every decision — human or AI — appends at the moment
it occurs.

*This is gap 4, and it is the cheapest item on the list relative to what it
fixes.*

### A5 — Limited agency tool surface, on the seat · 3 days

Four operations for the verifier: list with pattern, search contents with
pattern, read a file, create or modify a test file.

- writes confined to the declared test root, enforced by the framework
  applying the write rather than the model touching the filesystem;
- scope limited to the session diff plus declared dependencies;
- a per-round read budget;
- every operation logged into the round.

**Scoped to the Copilot path, because that path is already agentic.** Its
read-only tool allowlist is operations (a), (b), and (c) exactly. The
direct-API path sends no tools and would need a tool-use loop written three
times against three vendors' function-calling protocols — **that is a second
project, and Milestone A does not carry it.**

**A direct-API round therefore stamps `agency: none`** (spec §4.b), so a review
that could not look is never recorded as one that could.

*This is gap 1, and it is the only genuinely new subsystem in Milestone A.*

### A6 — Selection by role, and the death of the tier ladder · 2 days

Lift roles out of the Copilot transport block and make them the one selection
mechanism on both paths.

- the direct-API path resolves the `verifier` role against the model record
  instead of walking tiers, keeping the existing reachability and exclusion
  filters;
- **the preference order becomes ordering-only on both paths** — today the seat
  falls through to the whole confirmed catalog only when an exclusion is
  active, and this makes that unconditional;
- assert `verifier.provider != author.provider` **at dispatch**, not only as a
  selection filter;
- delete `pick_model`, `next_escalation_model`, and `estimate_complexity`;
- delete `pricing.py`'s cost arithmetic and the load-time rate check.

**A6 is a net deletion, and it is one change rather than two.** Rates are
currently the sort key for candidate ordering, so pricing cannot be removed
until a declared preference order replaces it. Do both or neither.

### A7 — Model discovery · 2 days

- enumerate each vendor's models endpoint on the direct-API path and write the
  record through the sanctioned writer, dated;
- one staleness check reading both records, warning and naming its invocation,
  **never blocking and never refreshing mid-session**;
- the §5.c drift diff: in the record and named in no role, named in a role and
  absent from the record, record age against the threshold.

**Enumeration is a metadata request and bills no tokens, on any of the three
vendors.** That is why the default cadence is 24 hours and why the knob is a
preference rather than a budget control. The seat keeps its existing
probe-based refresh, because a probe does cost premium requests.

**AI assistance is bounded to proposing.** It may suggest a reordered
preference list or candidate identifiers for the seat's universe; enumeration
or a probe confirms, and the writer records. Nothing is enabled by a name.

**At the end of A:** a session runs, a different vendor reviews it with real
access, the record is honest, the model list maintains itself, and the two
files are consistent across all three staff. **Ship this to staff and watch
what they do with it.**

**A6 and A7 are the two items that can slip to B without blocking the
switch**, because the tier ladder works today and nothing staff-facing depends
on roles. The cost of deferring is that pricing stays, the registry keeps
needing rate maintenance, and the direct-API path keeps selecting by a
mechanism the spec has already removed. **They move together or not at all.**

---

## Milestone B — the loops · 5 days

### B1 — Code review loop · 1 day

`verify → fix`, cap 3, stop early on Minor-only. At the cap the session ends
unresolved with its round history intact — nothing commits, nobody is asked.

*The cap also closes a known hole: `workflow review` has no round cap today, so
an unattended run keeps calling vendors.*

### B2 — Verifier authors tests, framework runs them · 2 days

The verifier writes test files through the A5 write path; `checks.py::execute`
runs them and reports the exit code. `test → fix`, cap 7, round count carried
into the session outcome so a six-round pass reads differently at planning time
than a two-round one.

*The framework-runs half is nearly free — that code exists. The work is the
authoring hand-off and the loop.*

### B3 — Full suite with a bounded fix loop · 2 days

The suite runs against the tree including the new tests. On failure,
`fix → re-verify → re-test`, with the envelope enforced mechanically:

- the fix round receives only failing test names, their output, and implicated
  files;
- writes are restricted to the session diff plus implicated files, using the
  existing `changed_paths_between` machinery;
- **a write outside the envelope is rejected**, not discouraged;
- no new findings are solicited; unrelated observations are recorded only.

*The envelope is the whole feature. Without it this loop invites a model to
revise anything it notices, which is what the operator specifically excluded.*

---

## Milestone C — packaging · 2 days

`pack`, then `push` to the Azure DevOps feed with the operator's PAT, resolved
through `secret_resolver` and **never placed in a child environment** (A1 makes
this real rather than intended).

Releasability is read from the task list declared at step (a). A session that
did not declare itself releasable cannot publish.

*This is the one thing staff explicitly asked the framework to do. It is
deliberately after A and B because it is worthless if the code reaching the
feed was not verified.*

---

## Milestone D — the extension · 4 days

- Sessions view without the set level, preserving the existing icons, row
  actions, and the two-inline-actions rule.
- **Project setup: two sessions** — create or import the plan, then break it
  into sessions. Both cross-provider verified, neither waiting on a signature.
- **The unresolved-session view**, read at planning time rather than as an
  interruption: what stopped, at which round, the findings with
  vendor and severity, what the verifier looked at from the agency log,
  **whether the round had agency at all**, and three actions — send it back,
  respecify it, cancel.

*Last because staff can run every one of A, B, and C from the command line. The
extension makes it pleasant; it does not make it work.*

---

## Totals

| Milestone | Days | What it delivers |
| --- | ---: | --- |
| **A** | 13 | A session worth switching to |
| **B** | 5 | The verification and test loops |
| **C** | 2 | Packaging to the feed |
| **D** | 4 | The extension |
| | **24** | |

Roughly **five working weeks** sequential. A and D are largely independent
after A3, so with the extension work running alongside, **about four weeks.**

**Deferring A6 and A7 to Milestone B returns A to 9 days** and moves the switch
point four days earlier without changing the total.

---

## Day one

Three changes, all in files that exist, none of which depend on any open
question in this plan:

1. `checks.py::_spawn` — allowlisted child environment.
2. `verdict.py::is_doc_only_issue` — remove the verifier's self-exemption.
3. `workflow.py::fold` — a `simulated` review no longer satisfies a live one.

**These are defects in running code, not features of a proposal.** They are
worth doing before this plan is approved, and they stay correct if it is
rejected.

---

## What would change this plan

- **Staff do not adopt Milestone A.** Then the problem is not features, and
  the next step is another walkthrough rather than Milestone B.
- **The seat cannot sustain the round counts.** Three review rounds plus up to
  seven test rounds per session, across three staff, is real seat consumption
  that has not been measured. Measure it during A, not after C.
- **A second repository disagrees with the first.** The whole design rests on
  one observed way of working. It should be checked against a second library
  before Milestone D hardens it into a UI.
- **A vendor changes what its models endpoint reports.** A7 depends on three
  endpoints this project does not control, and they report unequally already.
  A field that disappears must degrade to unknown, never to unsupported —
  **the drift diff is the place that failure becomes visible.**
