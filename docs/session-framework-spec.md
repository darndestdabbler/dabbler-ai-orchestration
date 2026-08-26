# The session framework — specification

**Status:** specification, for build. Operator-authored design; this document
records it.
**Date:** 2026-08-26

**Where this came from.** Three staff members worked for a period without the
extension and were walked through afterward. What they built unprompted — a
narrowly scoped repository per library, integrated through packages published
to an Azure DevOps feed, with a plan file and a decision log — is the design
this specification formalizes. What their approach lacked is what the framework
supplies, and nothing else.

**The four gaps the walkthrough found**, which are the only justification this
framework needs:

1. **No path-awareness during verification.** The orchestrating model handed
   verifiers whatever it thought they needed. A verifier that cannot look
   cannot check.
2. **No cultivated review prompt.** Asking a model to review produces either
   nitpicking or approval. The house prompt was tuned across many sessions to
   sit between the two.
3. **No gates.** The orchestrating engine owned the whole flow, so it could
   ignore any part of it.
4. **No consistent record.** Three people, three models, three different sets
   of housekeeping files, with different names and different organization.
   Similar work that cannot be compared.

**The governing constraint: staff will not use ceremony.** They demonstrated
this. Every element below either closes one of those four gaps or was
explicitly asked for.

---

## 1. Transports, and what is removed

### 1.a The transport tiers

**The Copilot CLI seat is the default. Direct API access stays supported and
stops being visible.** Three tiers, and the difference between the second and
the third is the whole point: what is unsurfaced still works, what is removed
does not exist.

| Tier | What | Where it appears |
| --- | --- | --- |
| **Default** | Copilot CLI seat | The extension, the staff documentation, the shipped configuration |
| **Supported, unsurfaced** | Direct API (`--transport api`, `DABBLER_TRANSPORT`) | The command line only |
| **Removed** | The tier ladder, escalation between tiers, complexity estimation, pricing | Nowhere |

**The direct-API path is the operator's path and the development path**, not a
staff-facing product feature. It is not documented for staff, not selectable in
the extension, and not the default anywhere. It is also not deleted, because
deleting it would make the framework unusable by anyone without a seat.

### 1.b What is removed outright

- **Session sets.** A repository scoped to one library does not need a level
  above sessions. Sessions are numbered directly.
- **The tier ladder, escalation, and complexity estimation.** Selection is by
  role (§5), which does not need a cost-ordered ladder to walk.
- **Pricing.** Rate tables, rate confirmation dates, and the load-time check
  that refuses a routable model with no declared rate all go (§7).
- **`spec.md`, `activity-log.json`, `session-state.json`, `change-log.md`** as
  the staff-facing file set.

**Cross-provider verification is not removed and is not weakened.** The seat
catalog spans `claude-*`, `gpt-*`, and `gemini-*`, and both transports already
honour a hard provider exclusion, failing closed when it leaves no candidate.
Verification stays mandatory and stays cross-vendor on either transport.

---

## 2. The two files

The **framework** writes both. The model supplies content; it never chooses
structure, filename, or organization. This is the entire answer to gap 4.

| File | Contents |
| --- | --- |
| `project-work-plan.md` | The plan for this repository, and the numbered session list derived from it |
| `decisions-log.md` | Every decision, human or AI, in order, with who made it and what it was |

An entry in `decisions-log.md` is appended by a sanctioned writer at the moment
the decision occurs. No model writes to either file directly.

---

## 3. The session lifecycle

Sessions are numbered. One session is one bounded piece of work.

```text
  (a) Task list          →  what this session will do; releasable? yes/no
  (b) Develop            →  the author engine writes code
  (c) Verification       →  a different vendor, with limited agency
        c.i   code review loop      ≤ 3 rounds
        c.ii  tests: verifier authors, framework runs   ≤ 7 rounds
  (d) Full suite         →  plus a scope-bounded fix loop
  (e) Commit and push
  (f) Package            →  only if (a) declared this session releasable
```

**The framework enforces this order.** A step cannot be skipped, re-entered out
of order, or satisfied by an event that does not prove what it claims. This is
gap 3, and it is a property of the state machine, not an instruction in a
prompt.

### 3.a Task list

The session declares what it will do and **whether it produces a releasable
artifact**. That declaration is made here, before any code exists, because
otherwise a model decides when to publish a package.

### 3.b Develop

The author engine works. Nothing else in this specification constrains it.

**The author engine is not routed and does not need a transport.** Claude Code,
Codex, or a seat drives the mechanics and calls the framework; the framework
does not dispatch it. This is why direct-API authorship costs the framework
nothing to support.

### 3.c Verification

**The verifier is a different vendor than the author**, selected by role (§5)
with the author's provider excluded as a hard constraint.

**The exclusion is asserted at dispatch, not only filtered during selection.**
The author's effective provider is derived by `identity`, never trusted from a
label, and the resolved verifier's provider is compared against it immediately
before the call. A filter can be bypassed by a future preference path; an
assertion at the call site cannot, and this is the invariant the whole
framework rests on.

**The house review prompt is used unchanged.** It is tuned infrastructure, not
a message to be regenerated per session, and it is versioned with the release.

#### c.i — Code review loop

`verify(verifier)` → `fix(author)`, repeating.

- **Cap: 3 rounds.** At the cap the session **ends unresolved**. Nothing is
  committed, nothing is pushed, nothing is packaged.
- **Stop early when only Minor findings remain.** A prose review has no bottom;
  grinding rounds against wording is the failure mode this prevents.
- **No one is asked anything.** The session terminates with its rounds and
  findings recorded, and the framework moves on. A failed session is cheap —
  the code did not land, and the record says why.

#### c.ii — Tests

**The verifier authors the tests. The framework runs them.**

The split matters and is not negotiable in either direction:

- The verifier authors them **because it did not write the code**. Tests
  written by the author of a solution inherit that solution's blind spots.
- The framework runs them **because "tests pass" must be an observation, not
  a claim**. A verifier that both writes and reports on tests is scoring its
  own work, and the result is no longer an honest field the framework can
  branch on.

`test(framework runs) → fix(author)`, repeating.

- **Cap: 7 rounds.** At the cap the session ends unresolved, on the same terms
  as c.i.
- **Record the round count in the outcome.** Needing more than three attempts
  to pass usually means the design is wrong rather than the code, and a session
  that took six rounds to go green is worth different treatment at the next
  planning session than one that took two. The record carries the number; no
  one is interrupted with it.

### 3.d Full suite, with a bounded fix loop

The complete suite runs against the tree including the verifier's new tests.

On failure: `fix → re-verify → re-test`, **scoped**.

**The scope limit is mechanical, not advisory.** A model asked to fix failing
tests will otherwise revise whatever it notices. Therefore:

- The fix round receives **only** the failing test names, their output, and
  the files implicated by the failures.
- The fix may write **only** to a path envelope: files already in the session's
  diff, plus the files implicated by the failures.
- **A change outside the envelope is rejected by the framework**, not requested
  against by the prompt.
- **No new findings are solicited during a fix round.** The round's job is the
  named failure. Unrelated observations are recorded, never acted on.

Same cap and same ending as c.ii.

### 3.e Commit and push

Push once, at the end.

### 3.f Package

Only when (a) declared it. `pack`, then `push` to the Azure DevOps feed using
the operator's PAT.

**The PAT is never present in the environment of any process that runs
AI-authored code.** See §6.

---

## 4. Limited agency — the verifier's tool surface

The verifier gets four operations and no others:

| | Operation | Notes |
| --- | --- | --- |
| a | **List files**, with pattern matching | |
| b | **Search file contents**, with pattern matching | |
| c | **Read a file's contents** | |
| d | **Create or modify a test file** | The only write |

**The verifier is read-only except for tests.** Writes are confined to the
declared test root; a write outside it is refused by the framework. The
framework applies the write — the model does not touch the filesystem.

**Three limits, all cheap and all mechanical:**

- **Scope** — the session's changed files and their declared dependencies, not
  the whole repository.
- **Budget** — a fixed number of read operations per round.
- **Log** — every list, search, and read is recorded in the round.

The log is the important one. A verifier that chooses what to look at can reach
a blocking finding by not looking at the counterevidence, and this cannot be
prevented cheaply. Recording what was requested makes the bias visible
afterward, which is the difference between a suspicion and something checkable.

### 4.a Agency is not available on both transports, and the record says which

**The seat has this surface already; the direct-API path does not.** The
Copilot CLI is agentic and takes a read-only tool allowlist that is operations
(a), (b), and (c) exactly. The direct-API path sends no tools at all, and
giving it this surface means a tool-use loop written three times against three
vendors' function-calling protocols.

**So a direct-API round records `agency: none`, and is never reported as
equivalent to a round that could look.** A verifier without path-awareness is
gap 1 re-opened. That is acceptable as a fallback and unacceptable as a silent
one — the round carries which kind of review it was, and the unresolved-session
view shows it.

---

## 5. Model discovery and verifier selection

**The verifier is chosen by role, and a role never depends on the model names
it happens to list.** A list of model IDs is stale the day a vendor ships. The
role declares what a verifier may be, the discovery record says what currently
exists, and the framework takes the first survivor after excluding the author's
provider.

### 5.a The role

A role declares two things:

| | Declares | Enforcement |
| --- | --- | --- |
| a | **The provider set it may draw from** | Hard filter |
| b | **A preference order** | Ordering only |

**The preference order can reorder candidates; it can never exclude one.** This
is the whole fix for staleness. A model absent from the preference list still
qualifies — it simply sorts after the named ones — so an outdated list costs a
slightly older verifier and never costs a verifier at all.

**This is already how the seat path behaves under an exclusion**, and
cross-provider verification always excludes. The change is to make that
fallthrough unconditional rather than exclusion-only, and to give the
direct-API path the same resolver instead of a tier ladder.

**Capability metadata ranks; it does not filter.** Vendors report unequally —
one returns a full capability tree with a context window and an output cap,
another reports token limits and generation methods, a third reports little
beyond an identifier and a creation date. **A hard capability filter would
disqualify every model from the quietest vendor and end cross-vendor
verification by accident**, so what a vendor does not report is recorded as
unknown and never as unsupported.

### 5.b Two discovery mechanisms, one record shape

| Path | Mechanism | Cost | Cadence |
| --- | --- | --- | --- |
| Direct API | **Enumeration** — each vendor's models endpoint | **None.** Metadata request; no tokens are billed | Automatic; default **24 hours**, configurable |
| Copilot seat | **Empirical probe** | Premium requests | Operator-invoked; staleness warned, never blocked |

**The seat cannot enumerate, and that is a fact about the CLI rather than a gap
in the framework.** It has no list-models command, so its catalog is a
maintained candidate universe whose entries are confirmed by probe. Nothing
infers availability from a name.

**The API path can enumerate, so it should, and daily is free.** The response
carries the identifier, the display name, the creation date, the context
window, the output cap, and the capability tree — more than a hand-maintained
table ever held. **Because it costs nothing, the cadence is a freshness
decision rather than a budget one**: the default is 24 hours, and the knob
exists for anyone who disagrees.

**Both write the same record: what exists, what was confirmed, and when.** One
record per seat or key set, machine-written through the sanctioned writer,
dated. That date is the input to every staleness check — nothing infers
freshness from a version number inside a name.

### 5.c Drift is reported as a diff, and that is where AI assistance belongs

**The framework reports the gap between the record and the roles; it does not
close it silently.** Discovery keeps the record fresh on its own, but ranking
one model above another is a judgment metadata cannot make: newest is not most
capable, and no reported field separates a flagship from a mini.

So the check produces a diff and names the invocation that acts on it:

- models present in the record and named in no role;
- models named in a role and absent from the record;
- the age of the record against the threshold.

**AI assistance proposes; the probe or the enumeration confirms; the writer
records.** A model may propose a reordered preference list, or candidate
identifiers to add to the seat's universe. **It may never confirm that a model
exists or works** — asking a model which models exist is the least reliable
available source, and the record's standing doctrine is that nothing is enabled
by a name alone.

### 5.d Refresh never happens inside a session

**A session that changes its own verifier pool while running has edited the
conditions of its own review.** Discovery runs between sessions.

**A stale record warns and names the command; it does not block.** A stale
record with confirmed entries still verifies correctly, and turning a
maintenance signal into an outage is how maintenance signals get suppressed.

---

## 6. Credentials

**The environment handed to any process running AI-authored code is an
allowlist, not a blacklist.**

A blacklist that strips `DABBLER_*` and `*_API_KEY` fails the moment a feed PAT
is added — which §3.f adds. An empty environment breaks `dotnet` and Java,
which need `PATH`, `SystemRoot`, and `JAVA_HOME`. So the child environment is
constructed from a list of what the toolchain requires, with `TEMP` and `TMP`
redirected.

**Honest scope of this guarantee:** it prevents inherited environment
credentials reaching check processes. It does not make code running as the
Windows user unable to read credentials stored elsewhere in that user's
profile. Without a sandbox, that is the true statement, and it is the one to
put in the release notes.

---

## 7. Cost, and cost centers

**Tokens are recorded. Dollars are not computed. Reconciliation happens out of
band, against the vendor's own console.**

| | What the framework does |
| --- | --- |
| **Records** | Input and output tokens, per call, per model, per session, on both transports |
| **Does not record** | Dollar cost, rate tables, rate confirmation dates |
| **Does not pretend** | Seat spend is not attributable per session, and is not estimated |

**A repository names its own API key per provider, which is what makes a
repository a cost center.** The provider block already names an environment
variable rather than holding a value, and a project-local overlay may change
that name. So a repo scoped to one library points at its own key, the vendor's
console reports that key's spend, and the join between the framework's tokens
and the vendor's dollars is the key itself.

**Seat cost is constant and unattributable, and that is accepted rather than
worked around.** The CLI reports no billing-authoritative usage. Inventing a
per-session figure from token counts would produce a number nobody could check.

---

## 8. Setting up a project

The extension makes this easy, and it is two sessions:

- **Session 1 — the project plan.** Created or imported, then cross-provider
  verified.
- **Session 2 — the breakdown.** The plan becomes the remaining numbered
  sessions, cross-provider verified.

Later work is more sessions. There is no other project-level concept.

**These two are the human approval gates**, and that is not a coincidence
worth designing away: the two moments a person must sign off are the two
moments that determine what everything after them will build.

---

## 9. Where the human is, and where they are not

**The human is in the planning sessions. Nowhere else.**

Sessions 1 and 2 of a project set what gets built and how it is divided, and
both are approved by a person. Later planning sessions do the same for new
work. That is the entire human contract.

**No running session ever waits for anyone.** There is no queue, no inbox, no
approval that holds an engine open, and no decision that has to be made before
other work can continue. A session either completes or ends unresolved, and
either way the framework moves on.

**Unresolved sessions are planning input, not interruptions.** When a session
ends at a cap, the record carries what stopped it, at which round, the findings
with their vendor and severity, and what the verifier looked at from the agency
log. That material is read at the *next planning session*, where a person is
already engaged and can decide what it means — respecify the work, split it,
accept it as it stands, or drop it.

**This is also where an override belongs, and only here.** The reason a human
must be able to approve over unresolved findings is that a prose document has
no bottom: five real rounds on one plan produced four new Major findings every
time. That problem is specific to reviewing *prose*, which is what planning
sessions review. Code sessions do not need the escape hatch, because a failed
code session is cheap — nothing landed, and the next session can try again with
better instructions.

**Model-list maintenance is the one other thing a person is asked for, and it
is never urgent.** The §5.c diff is read between sessions, it never blocks one,
and acting on it is optional — because a stale preference order cannot break
selection.

---

## 10. Deliberately not in this specification

Named so that their absence is a decision rather than an oversight:

- No sandbox or container. AI-authored code runs on the host.
- No browser surface. The extension is the UI.
- No session sets, no tier ladder, no escalation, no pricing, and no
  staff-facing transport choice. **Direct API access remains supported on the
  command line** (§1.a) — unsurfaced is not removed.
- No dollar-denominated cost tracking, and no per-session attribution of seat
  spend (§7).
- No automatic refresh of the model record inside a running session (§5.d), and
  no model-authored confirmation that a model exists (§5.c).
- No referenced-component manifest and no API extraction. **A package
  reference is the black-box boundary** — already versioned, already pinned,
  already read-only, already surfaced by the IDE.
- No transactional promotion. Changes land in the working tree.
