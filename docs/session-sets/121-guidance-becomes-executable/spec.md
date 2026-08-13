# Guidance Becomes Executable Spec

> **Staged outside the repository.** Authored 2026-08-11 while Set 120 is
> in flight. Move to
> `docs/session-sets/121-guidance-becomes-executable/` after Set 120
> Session 2 lands, and re-run
> `python -m ai_router.spec_admission --spec <path>` at that point — the
> measurements below have a shelf life, and Session 1 Step 2 is written
> to re-derive them rather than trust them.

Sequenced as item 3 in
[`docs/planning/set-sequencing.md`](../docs/planning/set-sequencing.md)
§2. Authoring preconditions in §4b were checked before writing this
spec; the one that could not be satisfied is recorded below as a
measurement, not waved through.

## Session Set Configuration

```yaml
requiresUAT: false        # No rendering surface. The deliverables are checks, a retention mechanism, and a smaller preload corpus — judged by tests, by `guidance_report --check`, and by a diff.
requiresE2E: false        # Layer 3 is neither changed nor invoked. No extension file is touched.
uatStyle: ad-hoc
prerequisites:
  - slug: 120-strict-writer-and-one-projection
    condition: complete
sessionSizeException: 2 - Eight steps, of which four are the Set 128 ceremony (register + the three-step tail), leaving N = 4 authored work steps against the ratified budget of 3. The overrun is one step and it is real, not an artifact of the skeleton: steps 3 and 4 define the retention RULES for the two artifact types and step 5 derives their PARAMETERS (N and the cap), which the sequencing note's section 4b flags as proposed-not-measured and which therefore must not be inherited silently. Folding step 5 into either rule step would bury a named deliverable (progress key `numbersDerived`) in prose, which is the exact failure mode the skeleton exists to prevent. Measured and declared by Set 128 Session 3 on 2026-08-13; the other thirteen unstarted sessions needed none.
```

> **`pathAwareCritique` is deliberately absent** — the guide's default is
> `none`, and *"a set that declares nothing pays nothing."* It cost Set
> 116 S3 roughly half of that session's $4.75 and returned a false
> positive. This set changes no gate and removes no verification control.

---

## The measurements this set acts on

Taken 2026-08-11. **Re-derive them in Session 1 before acting** — this
repo's specs have been wrong about their own numbers twice in the last
week (Set 118's coupling count, Set 120's file count), and both times the
session that re-measured caught it.

### 1. The preload corpus has no headroom

`python -m ai_router.guidance_report --check`:

| document | tokens | ceiling | |
| :--- | ---: | ---: | ---: |
| `docs/session-constitution.md` | 3,984 | 4,000 | **100%** |
| `docs/planning/project-guidance.md` | 3,499 | 3,499 | **100%** |
| `docs/planning/lessons-learned.md` | 2,379 | 2,385 | **100%** |
| `AGENTS.md` | 1,994 | 2,031 | 98% |
| **TOTAL** | **11,856** | **12,000** | **99%** |

**144 tokens of headroom — roughly four lines.** Ceilings ratchet DOWN
only; raising one is an operator-authorized config edit, never an
in-session accommodation. So the only way to admit anything is to
**remove prose first**, which is what Session 1 does.

> **Superseded in part, 2026-08-12 (Set 128 S2).** The operator issued a
> **standing authorization** to exceed the guidance ceilings until this
> set lands, precisely because the no-headroom condition above was
> taxing every unrelated set that touched a preload file. Set 128 S2
> raised `docs/session-constitution.md` to 4,200 and the total to
> 12,200 to fit the A1–A4 test-ordering rules. So the table above is a
> **floor, not the current state** — re-derive it in Session 1 as the
> spec already requires, and note that Session 4 Step 3 now owes the
> retirement of that authorization. Canonical:
> `docs/guidance-lifecycle.md` → *Standing operator authorization*.

**And 148 of those tokens are spent on bookkeeping.** The per-lesson
usage trailers live *inside* `lessons-learned.md`, which is preload —
six of them, 594 bytes, ~148 tokens. The accounting that decides what to
prune currently costs slightly more than the entire remaining headroom.
Session 2 moves it to a sidecar read only at prune time, which roughly
doubles the room available before a word of prose is cut.

### 2. Three decided items cannot be admitted

[`docs/planning/guidance-candidates.md`](../docs/planning/guidance-candidates.md)
holds C-001 (partitionable tests), C-002 (what verification is for), and
C-003 (who may dismiss a blocking finding) — all reduced to single lines,
all blocked purely on headroom. C-003 names no prerequisite; C-001 names
two (an enforcement lint and a recall check) and may legitimately stay
queued.

### 3. The doc-only cap is live, and has never fired

This is the §4b precondition, and it resolves to **"cannot confirm — and
this set is still the first real test."** The detail matters, because a
first reading of the data looks like failure and is not:

| | findings | citing `evidencePaths` |
| :--- | ---: | ---: |
| Sets 057–117 | 581 | **0** |
| Set 119 | 8 | **8** |
| Set 120 | 5 | **5** |

Set 119 S1 did not only add the cap — it made path citation **universal**,
from 0% to 100% in one set. That was the blocker identified when the cap
was first proposed (*"defer the cap until findings carry paths"*), and it
is now gone.

The cap has nonetheless never fired. Of the **13** post-change findings,
8 cite only code and 5 cite code and docs together; **none is doc-only.**
Both post-cap sets were code work, so the trigger never arose. Absence of
evidence, not evidence of absence.

**The plausible failure mode is the mixed citations** — now 5 of 13, up
from 4 of 11 a day earlier. The cap requires *every* named path to be
documentation. A reviewer examining a prose change will often cite the
doc *and* the code the doc describes, which scores as mixed and is not
capped. If that pattern dominates in this set, the cap will not fire here
either, and that is worth knowing precisely.
Session 4 measures it rather than assuming either way.

### 4. What rounds actually cost, for comparison

Median verification rounds per session, from `s*-rounds.jsonl`:

| set | 111 | 112 | 114 | 116 | 119 | 120 |
| :--- | ---: | ---: | ---: | ---: | ---: | ---: |
| median rounds | 3.5 | 4.0 | 4.0 | 4.0 | **2.0** | 3.5 *(n=2)* |

The pre-cap median is **4.0**. Set 119's 2.0 is encouraging and
underpowered — its own S2 took **six** rounds, and rounds 2–4 were all
genuine code findings, one of which (round 4) was introduced by the fix
for round 3. That is the Set 116 S3 pattern repeating in code rather than
prose, and no severity cap addresses it.

### 5. Severity is still degenerate

**539 of 592 findings are Major (91%).** A scale on which nine findings
in ten block is not a scale. This set does not fix that — it is named
here so that no session mistakes a high Major count for a signal.

---

## Decisions already made — do not reopen

1. **A lesson must become executable code or a single instruction line,
   or it is dropped.** Operator's standing rule, 2026-08-10. The code fix
   is weighed against impact × likelihood of the consequence, versus the
   work involved.
2. **Ceilings ratchet DOWN only.** An orchestrator at ceiling removes
   prose; it does not edit the number. Raising a ceiling is an
   operator-authorized config edit with a stated reason.
3. **Eviction is never automatic and never mid-session.** The specific
   defect that broke the old ceiling was an orchestrator at 100% having
   to evict prose *during* a session under time pressure — which is how
   the instruction to run the path-aware critique was deleted and became
   the next round's Major. Superseding §5.3's automatic drop at the set
   boundary, the operator ruled 2026-08-11 that pruning is a **batched
   pass the operator initiates**: usage accumulates continuously, removal
   is a deliberate review.
4. **Retention is measured in active sessions, not elapsed time**
   (operator, 2026-08-11). A dormant repository must not lose its
   guidance to the calendar.
5. **The doc-only cap's design is settled** (Set 119 S1, operator-attested
   in `decisions.jsonl`). This set may *measure* it and report; it may not
   redesign it, and it may not widen it to cover mixed citations without
   a fresh operator ruling — that would be a verification reduction.
6. **`guidance_report --check` is the arbiter of size.** Not a word count,
   not an estimate in a spec.

## Non-goals

- **Not touching `lessons-archive.md`.** It is the archive; this set
  feeds it, and never auto-loads it.
- **No extension changes, no Layer 3, no gate changes.** Nothing here
  alters what blocks a close.
- **Not fixing the 91%-Major severity scale.** Named above, out of scope.
- **Not promoting C-001 unless its two prerequisites exist.** An
  instruction with no enforcement is advice with no teeth, by its own
  entry's terms.
- **Not applying usage retention to `session-constitution.md`.** See
  below — for that document the instrument is wrong, not merely
  unnecessary.

## What this does not cover, and why

**`project-guidance.md` is handled in Session 3 of this set.** The
operator ruled 2026-08-11 that its entries get the identical treatment —
ids, ledger, encode-or-drop — and that deferring it loses something
unrecoverable: **usage evidence only accrues from the moment ids exist.**
A set that runs without them is a set whose evidence about which entries
mattered is gone for good, and no later session can reconstruct it.

What *is* deferred is the **judgment-heavy triage** of the entries that
are not plainly encodable. That separation is the point: assigning ids is
mechanical and cheap, triaging 24 prose entries is neither. Session 3
does the mechanical half plus the obvious encodings, so that the later
triage is driven by recorded usage instead of 24 fresh judgment calls.

## What this does not cover, and why

**`session-constitution.md` is a different kind of document, and the
usage ledger would mis-measure it.** Its sections are *The session,
start to stop (happy path)*, *Recovery and escalation*, and the per-step
pointer table: it is a **runbook**, not a corpus of discrete citable
rules. An orchestrator does not *cite* "step 0 — preload and keys"; it
simply does it. Citation-based retention would therefore record the
most-used content as **unused** and mark it for pruning first — the
instrument is inverted, not just imprecise.

Its size discipline comes from a structural test instead: *does each
section still describe a step someone actually takes?* Sections that
survive get demoted to on-demand pointers, which is what Session 4's
collapse already does and is a ceiling *reduction*.

**The operator's original vision for the constitution — guidance useful
across projects — is already implemented one layer down.** Lessons carry
`scope="portable"` (6 today) and the document is already split into
*Portable Lessons (all AI-led-workflow repos)* and *Repo-Specific
Lessons*. That is the right granularity: a whole constitution is not
shareable between organizations, but a single encoded check with its
rationale and falsifier is. See *Future exploration* at the end.

---

## Sessions

### Session 1 of 4: Encode what earns its keep; drop what does not

The five active lessons are `L-064-9`, `L-075-1`, `L-112-1`, `L-079-1`,
and `L-064-8`. Proposal §5.2 proposes four become code and one becomes a
line. **That table is a starting proposal, not a mandate** — it was
written before anyone applied the operator's cost rule to each lesson
individually, and at least one (`L-075-1`, a dependency-pin bump) has low
enough likelihood that encoding it may lose to simply dropping it.

**The list may not still be five.** Set 120 Session 3 carries a Step 9
decision on whether `L-069-1` returns to the active tier. Step 2 below
re-derives the list for exactly this reason; do not take the number five
from this spec.

**Steps:**

1. Register.
2. **Re-derive the measurements above** — preload sizes from
   `guidance_report --check`, the active lesson list, and the finding
   path-citation rates. **A discrepancy is a finding about the query *or*
   about this spec, and the session must say which.**
3. **Apply the operator's rule to each of the five lessons** and record a
   per-lesson disposition with its reasoning: **code**, **one line**, or
   **drop**. Weigh impact × likelihood of the consequence against the
   work to encode it. A disposition of **drop** for a lesson that §5.2
   proposed encoding is a legitimate outcome and must be journaled with
   `decision_journal` — it deviates from a written proposal, so it is
   recorded, not silent.
4. **Encode every lesson whose disposition is "code", each with a
   falsifier that proves it can fire** — `L-112-1` applies to itself, and
   a check that has never been seen to fail is exactly what it warns
   about. Then **delete the encoded and dropped lessons' prose** from
   `lessons-learned.md`, moving full text to `lessons-archive.md` where
   the archive is the right home. Report tokens freed via
   `guidance_report --check`.
5. **Cross-provider verification.**
6. **Required portion of the full test suite.**
7. **Close-out.**

**Creates:** the encoded checks and their falsifiers, the journaled dispositions, a measurably smaller `lessons-learned.md`
**Touches:** `ai_router/`, `ai_router/tests/`, `docs/planning/lessons-learned.md`, `docs/planning/lessons-archive.md`, `decisions.jsonl`
**Ends with:** no active lesson survives as prose, and the freed token count is a measured number.
**Progress keys:** `measurementsRederived`, `dispositionsJournaled`, `checksEncoded`, `tokensFreed`

---

### Session 2 of 4: The retention mechanism, so it cannot re-bloat

The operator's concern is that code and one-liners accrete exactly as
prose did. Proposal §5.3 splits retention by artifact type, because a
single "unused in N sets → drop" rule fails for preventive gates: a gate
that never fires is indistinguishable from a useless one, which *is*
`L-112-1`.

Two operator decisions of 2026-08-11 revise §5.3 and take precedence over
it: retention is counted in **active sessions, not elapsed time**, and
pruning is a **batched, operator-initiated** pass rather than an
automatic drop at each set boundary. Both are recorded under *The usage
ledger* below.

**Steps:**

1. Register.
2. **Move usage metadata out of the preload doc into a sidecar usage
   ledger** (operator design, 2026-08-11 — see *The usage ledger* below).
   Today each lesson carries its bookkeeping inline in
   `lessons-learned.md`: six trailers, 594 bytes, **~148 tokens against
   144 tokens of total remaining headroom.** The accounting costs more
   than the room that is left. A sidecar JSON read only at prune time
   costs nothing at session start, so this step roughly doubles the
   headroom before any prose is cut. `guidance_meta.parse_trailer` /
   `format_trailer` / `update_last_used` are the sites to redirect; per
   `L-069-1`, redirect **every** one, not the first found.
3. **Instruction-line retention, measured in sessions rather than time.**
   The orchestrator already cites the ids it followed at close
   (`cite_lessons`, `disposition.lessons_cited`); that citation appends
   to the ledger. Retention asks *"was this used within the last N
   **active** sessions?"* — never elapsed time. Eviction remains a
   **batch prune the operator initiates**, never automatic and never
   mid-session (standing decision 3).
4. **Check retention, split by cost — and record fires, not runs.**
   Cheap checks (<1s, deterministic, no routed call) are kept
   indefinitely; free insurance that never expires, so they need no
   usage record at all. Expensive checks (a routed call, or >10s) must
   **fire** at least once per N sets. Recording mere execution would be
   worthless — a check that runs in CI every session would look
   permanently in use — so the recorded event is that it **caught**
   something. Every check ships with a falsifier regardless.
5. **Argue N and the cap from data; do not inherit them.** §5.3 proposes
   N = 10 sets and a hard cap of 20 instruction lines, and §4b of the
   sequencing note flags both as *proposed, not measured*. Derive what
   the citation history supports. **If it supports nothing, say so** and
   pick a default with a stated reason — an honest arbitrary number beats
   a fabricated derivation.
6. **Cross-provider verification.**
7. **Required portion of the full test suite.**
8. **Close-out.**

**Creates:** the usage ledger, the retention rules for both artifact types, and a recorded basis for N and the cap
**Touches:** `ai_router/`, `ai_router/tests/`, `ai_router/router-config.yaml`, `docs/planning/lessons-learned.md`, `docs/guidance-lifecycle.md`
**Ends with:** usage accounting costs zero preload tokens, and guidance can be pruned deliberately on evidence of disuse.
**Progress keys:** `ledgerExtracted`, `lineRetention`, `checkRetention`, `numbersDerived`

#### The usage ledger

Operator design, 2026-08-11. One compact record per guidance item, with a
**bounded ring buffer of its last 10 uses**, each identified as
`<set>-<session>`:

```json
{
  "L-064-9": { "kind": "executable", "uses": ["120-02", "119-03", "119-01"] },
  "C-003":   { "kind": "instruction", "uses": ["120-01"] }
}
```

**The ledger is keyed by id and agnostic about which document an entry
lives in.** `kind` distinguishes what the entry *is*, never where it
sits. This matters because `project-guidance.md` is the **sink** that
lessons are promoted into — 15 of the active lessons name it as their
destination — so it needs the identical mechanism, and building the
ledger lesson-specific would guarantee a rewrite. Assigning ids to its
24 currently-unidentified entries and triaging them is **out of scope
here** (see *What this does not cover*), but the ledger must be ready to
accept them without change.

Four properties, each load-bearing:

- **Sessions, not timestamps.** A codebase may lie dormant for weeks or
  months; wall-clock decay would evict the whole corpus for the
  *project's* inactivity rather than the guidance's uselessness. The
  question is only ever *"used within the last N active sessions?"* The
  date of any given session is recoverable by lookup if anyone wants it,
  so storing it here would be redundant as well as misleading.
- **A bounded array, not a scalar.** The current `last-used-set="120"`
  cannot distinguish *used once, ten sets ago* from *used in every one
  of the last ten* — which warrant opposite pruning decisions. Ten
  entries capture frequency; the cap keeps the file from growing.
- **Entries are dash-separated STRINGS, never JSON numbers** — `"120-02"`,
  not `120.02`. A decimal is not merely risky to parse, it is *ambiguous
  to read*: `120.10` as a number round-trips to `120.1`, which reads back
  as **session 1** — a silent corruption of session 10 — and a human
  skimming `120.1` cannot tell which was meant. The dash (operator,
  2026-08-11) makes the non-numeric intent visible at a glance, so no
  future reader or writer is tempted to treat the field as a float, and
  it matches the `L-064-9` id convention already used throughout.
  Zero-padded, it still sorts correctly (`"099-01" < "120-02" <
  "120-10"`), since set directories are already three digits. **Ship a
  falsifier that plants `"120-10"` and asserts it survives a write/read
  cycle distinct from `"120-01"`.**
- **Pruning is batched and operator-initiated.** Not every close needs
  to evict. Accumulate usage continuously, prune deliberately — a
  review, not a reflex. This is a deliberate improvement on §5.3's
  automatic drop at the set boundary.

Two constraints inherited from the rest of the repo: the ledger is
machine-written state, so it is **JSON, and written by one sanctioned
writer** (`decisions.jsonl` and `session-events.jsonl` are the
precedents); and it must take the **same lock discipline** as other
append-only state, because two sessions closing minutes apart is not
hypothetical here — it happened twice this week.

---

### Session 3 of 4: Make `project-guidance.md` addressable, and pay for it

`project-guidance.md` is the **sink**: 15 active lessons name it as their
promotion target, and it is the tightest document in the corpus at
**3,499 / 3,499 tokens — zero headroom.** It also has **no ids at all**
(24 bullet entries, 0 trailers), so today there is no way to know which
of its entries anyone has ever used.

That last point is why this session is here rather than in a later set.
**Usage evidence begins accruing the moment ids exist and cannot be
backfilled.** Every set that runs without them permanently forfeits its
evidence about which entries mattered.

Ids are affordable because encoding pays for them. Measured 2026-08-11:

| | tokens |
| :--- | ---: |
| 24 minimal id markers (`<!-- G-001 -->`) | **+84** |
| Encoding *CLI output uses ASCII-only glyphs* | **−139** |
| Encoding *pure-Python validator parity* | **−361** |
| **net headroom gained** | **+416** |

Both of those are promoted lessons (`L-064-4`, `L-066-1`) that describe
mechanically checkable rules — a lint and a parity test. They are the
clearest cases of guidance that should have been code, and encoding just
those two funds ids for the whole document.

> **The worked example arrived while this spec was being written.** Set
> 120 Session 2 reported that `L-069-1` — *"a bug is a bug CLASS; fix
> every sibling site"* — was **instrumental twice in that session**, and
> `cite_lessons` flagged it for reconsideration into the active lesson
> tier.
>
> But `L-069-1` is not dormant: it was promoted, its lesson text was
> archived, and **the live rule is `project-guidance.md` line 133** — an
> entry with no id. So a guidance item demonstrably load-bearing twice in
> one session cannot have that fact recorded anywhere, and the citation
> machinery attributed the use to the *archived lesson* rather than to
> the live entry. That is the tracking gap this session closes, observed
> in the wild rather than argued from first principles.
>
> It also suggests the reactivation is the wrong remedy — returning
> `L-069-1` to `lessons-learned.md` would state the same rule in **two**
> preload documents that are both at 100% of ceiling. Giving the existing
> entry an id records the usage without duplicating the prose. **That is
> Set 120 Session 3's Step 9 decision to make, not this set's**; it is
> noted here only because the two decisions interact.

**Steps:**

1. Register.
2. **Encode the plainly-encodable entries, with falsifiers**, and delete
   their prose. At minimum the two named above; include any other entry
   whose disposition is unambiguously *code* under the operator's rule.
   **Do not triage the judgment-heavy remainder** — that is deferred
   deliberately, to be driven later by the usage data this session starts
   collecting. Report tokens freed.
3. **Assign a minimal id to every remaining entry** and register them in
   the ledger so accrual starts immediately. Use the short marker form —
   the full lessons-style trailer costs 468 tokens against 84 and buys
   nothing, since the ledger holds the metadata now. Record explicitly in
   the change log that usage evidence starts here and has no history.
4. **Prove the arithmetic**: `guidance_report --check` must pass with
   `project-guidance.md` measurably **under** its ceiling, and the
   ceiling should be ratcheted down to the new measured size — standing
   decision 2, and the mechanism only works if reductions are taken.
5. **Cross-provider verification.**
6. **Required portion of the full test suite.**
7. **Close-out.**

**Creates:** the encoded lints and their falsifiers, ids on all surviving entries, a lower ceiling
**Touches:** `ai_router/`, `ai_router/tests/`, `docs/planning/project-guidance.md`, `ai_router/router-config.yaml`, the usage ledger
**Ends with:** every guidance entry is addressable, usage is accruing, and the tightest document in the corpus has headroom for the first time.
**Progress keys:** `entriesEncoded`, `idsAssigned`, `ceilingLowered`

---

### Session 4 of 4: Admit the queue, and measure whether the cap fired

**Steps:**

1. Register.
2. **Promote from the queue into the freed headroom**, in the order
   C-003, C-002, then C-001 — C-003 first because it needs no new
   machinery and documents a boundary the code already enforces. Admit
   the `L-064-8` one-liner if Session 1 gave it that disposition. **C-001
   stays queued unless its enforcement lint and recall check exist.**
   Every admission is subject to Session 2's cap and must fit the
   measured headroom.
3. **Collapse `session-constitution.md` and `project-guidance.md`** to
   the extent the promotions require, per proposal step 3. Content
   demoted to on-demand reference is a ceiling *reduction*, which is
   routine. `guidance_report --check` must pass at the end, and any
   ceiling that can now ratchet down should. **Retire the standing
   operator authorization of 2026-08-12** in the same pass: ratchet
   every `ceiling_tokens` (and `total_ceiling_tokens`) back down to the
   slimmed corpus's measurement, and delete both the
   *"Standing operator authorization"* section of
   `docs/guidance-lifecycle.md` and the matching paragraph in
   `router-config.yaml`. That authorization exists because this set had
   not run yet; an accommodation nobody retires is how a temporary one
   becomes the norm.
4. **Measure the doc-only cap on this set's own verification traffic** —
   the first prose-heavy work since it shipped, now across all **four**
   sessions. Report, per round: findings raised, how many cited
   `evidencePaths`, how many were doc-only, how many were **mixed**, and
   how many the cap actually capped. Compare rounds/session against the
   pre-cap median of **4.0**. State plainly whether the cap fired, and
   whether mixed citations defeated it. **A finding that it did not fire
   is a successful outcome of this step** — it is the answer the
   sequencing note asked for, and it sizes the deferred
   `project-guidance` triage.
5. **Cross-provider verification.**
6. **Required portion of the full test suite.**
7. **Close-out.**

**Creates:** the promoted lines, a smaller preload corpus, and the cap's first real measurement
**Touches:** `docs/session-constitution.md`, `docs/planning/project-guidance.md`, `docs/planning/guidance-candidates.md`, `ai_router/router-config.yaml`
**Ends with:** the queue is empty or its remaining entries have a stated blocker, and the doc-only cap has an evidence-backed verdict.
**Progress keys:** `queuePromoted`, `corpusCollapsed`, `capMeasured`

> **Irony budget.** This set exists to make the framework smaller, and it
> pays for that in new checks. **Cap: 40 new test functions across all
> four sessions** — the same cap Set 120 accepted for three, so tighter
> per session. Set 120 spent 19 in S1 and 14 in S2, which is the shape to
> avoid: a budget consumed early leaves the last sessions unable to
> falsify their own work.
>
> Rough allocation, to be argued rather than obeyed: ~8 for the encoded
> lessons and their falsifiers (S1), ~14 for the ledger, its dash-encoding
> falsifier and the retention rules (S2), ~12 for the two lints, their
> falsifiers and the ceiling arithmetic (S3), ~6 for promotion and the cap
> measurement (S4).
>
> **If the design cannot be covered in 40, simplify the design, not the
> budget.** A guidance mechanism that needs more tests than the guidance
> it replaces has not reduced anything.

---

## A caution specific to this set

**This set edits the documents it is itself running under.** The
orchestrator's own preload is the thing being cut. Two consequences:

- A session that removes a line it is currently relying on will not
  notice. Deletions belong in Step 4 of their session, after the work
  that might depend on them — not opportunistically at the start.
- The N−1 problem applies to guidance too: an orchestrator loaded the
  corpus at session start and will not see Session 1's cuts until the
  next session begins. Do not assume mid-set that a removed line is gone
  from the running context.

## What this unblocks

Every subsequent session carries less context, which compounds — this is
the item in the sequencing note with the largest downstream effect and no
visible defect driving it. It also empties
[`guidance-candidates.md`](../docs/planning/guidance-candidates.md),
whose growth was the evidence that the ceiling was binding on real
content rather than on padding.

It does **not** unblock the extension carve — that waits on Set 120's
projection (sequencing note §4a).

---

## Future exploration — a shared guidance corpus across organizations

Operator's idea, 2026-08-11. **Not scheduled, not designed, and
deliberately not built here.** Recorded because the seam it needs is
being cut by this set, and because the idea is cheap to preserve and
expensive to reconstruct.

The thought: if other agencies adopt this framework, the valuable
artifact to share is not a whole constitution — it is the individual
**learned-executable** (or at least its design and rationale) and
**learned-instruction**. A check that catches a real class of defect is
worth more to a peer organization than any amount of narrative about how
one repo works.

**Why the seam already exists.** Portability is modelled at the lesson
level today, not the document level: `scope="portable"` appears on 6
lessons, and `lessons-learned.md` is already split into *Portable
Lessons (all AI-led-workflow repos)* and *Repo-Specific Lessons*. So the
export filter is already written; nobody has to decide later what is
shareable, because that judgement is recorded at authoring time.

**The natural shareable unit** is what this set produces anyway: the
encoded check, its rationale, and its falsifier. The falsifier is what
makes the unit trustworthy across a repository boundary — it proves the
check can fire somewhere other than where it was written, which is
exactly the property `L-112-1` exists to demand.

**What would need deciding, when and if this is ever taken up:** whether
the corpus is a registry or a package dependency; how a shared check
declares the assumptions it makes about a repo's layout; and who
adjudicates a check that is correct in one organization and wrong in
another. None of that is answerable now, and none of it needs to be for
the seam to stay open.
