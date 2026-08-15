# Session 2 — remediation, rounds 1–2

Discovery ran to its bound: round 1 (2-lens fan-out, 7 Majors) and round
2 (supplementary, 1 Major). **Seven of the eight are accepted and fixed.
One is a false positive**, and its dismissal is evidenced below rather
than asserted.

Verifier: `gpt-5.5`. `anthropic` excluded as the orchestrator's
registry-resolved effective provider on both rounds.

---

## R1-1 / R1-3 — accepted. Live ids absent from the ledger were invisible

Two findings, one root cause, and it is the sharpest one in the round.

`retention_report()` and `instruction_count()` both iterated
`ledger.entries`. A live instruction line with **no ledger entry** — a
brand-new lesson, or one of Session 3's project-guidance ids — was
therefore neither reported nor counted against `instruction_line_cap`.
The anti-rebloat gate could pass on a corpus it could not see, and the
case it misses is exactly the case it exists to govern: guidance that was
just added and has no usage yet.

**Fix.** The report now runs in both directions. `governed_ids` is the
live corpus, and a live id the ledger has never heard of is emitted as
`UNREGISTERED` and counted by `governed_instruction_ids()` /
`instruction_count()`. `guidance_ledger report` exits non-zero when any
exist.

**Falsifiers** (`TestLiveIdsAbsentFromTheLedgerAreNotInvisible`):
an unregistered live id is surfaced; it counts against the cap; the CLI
exits 1; and the look-alike — a registered *check* in the corpus — is
**not** counted as an instruction line, because counting it would inflate
the cap with the very entries encode-or-drop removed from the preload.

## R1-2 — accepted. The workflow doc still taught the retired rule

`docs/ai-led-session-workflow.md` Step 9 still instructed operators to
archive on *"no `last-used-set` activity for the disuse window (default
20 sets, `guidance.disuse_window_sets`)"*. Nothing writes that field any
more, so Step 9 — which is mandatory on every set's final session —
pointed at evidence that no longer exists.

This is L-065-1 exactly: I fixed the echoes in the two guidance files,
both templates, the fixture and the dist bundle, and missed the one in
the canonical procedure doc.

**Fix.** That bullet now describes retention in **active sessions**,
names `guidance_ledger report`, states that the report classifies and
never evicts, and points at `docs/guidance-lifecycle.md` as canonical.

## R1-4 — accepted. Not actually ready for `project-guidance.md` ids

The spec requires the ledger to "accept them without change". The
*ledger* was ready — `ENTRY_ID_RE` accepts `G-001`, with a test. The
mechanism around it was not, and the finding is right that this is the
load-bearing half:

- `cite_lessons` searched only `lessons-learned.md` and
  `lessons-archive.md`.
- `guidance_meta.ID_RE` was `^L-[A-Za-z0-9]+-\d+$`, so `C-003` was
  malformed.
- `corpus_ids()` used the **heading-bound** parser. `project-guidance.md`
  entries are bullets under level-3 sections, so it would have returned
  **zero** ids there — and returned them silently.

That last one is L-112-1's shape: a corpus scan that examines nothing
looks identical to one that finds nothing.

**Fix.** New `guidance_meta.scan_ids()` / `contains_id()` find markers
**anywhere in a document**, and both `corpus_ids()` and
`cite_lessons.cite_one()` use them; `cite_lessons` now searches
`project-guidance.md` too; `ID_RE` accepts the two-segment handle
(`C-003`, `G-001`) and the check namespace (`K-121-1`) while still
rejecting a bare word.

**Falsifiers** (`TestTheCorpusScanIsDocumentAgnostic`): a marker on a
bullet is found; **the same input through the heading-bound parser
returns `[]`**, which is the planted contrast proving the fix is
load-bearing; prose that merely quotes the marker format is not an id;
`C-003` / `G-001` / `K-121-1` validate; `banana` is still malformed. Plus
an end-to-end `cite_lessons` test that records `C-003` from
`project-guidance.md`.

## R1-5 — accepted. Typos became permanent ghost ledger entries

`main()` called `record_citation(args.ids, ...)` before checking
resolution, and `_record()` creates missing entries. So a mistyped id at
close created a syntactically valid record — and since the module
deliberately has **no eviction path**, nothing could ever remove it. The
old message even said so out loud: *"The use was still recorded in the
ledger."*

**Fix.** Only ids that resolve to a real guidance entry reach the ledger.

**Falsifiers**: an unknown id leaves the ledger file **non-existent**
(planted); a known id cited alongside an unknown one is still recorded
while the command still exits non-zero (look-alike — refusing the typo
must not refuse the real citation).

## R1-6 — accepted. `--session` defaulted to 1 silently

I made this call deliberately and got it wrong. The reasoning was that a
within-set mis-attribution cannot flip a 30-session verdict. The finding
is right that this misses the point: the *documented* invocation changed,
the old form is what every prior session used, and the failure is
**silent** — it writes `<set>-01` for a session 3 close with no error.
A ledger whose whole value is per-session granularity must not accept a
guess.

**Fix.** `--session` is `required=True`.

**Falsifier**: the old invocation form raises `SystemExit(2)`.

## R2-1 — accepted. Checks inherited citations as fire history

The sharpest finding of the two rounds, and it landed on the rule the
session is built around.

`backfill` populates `uses` from citation events; `register` then
converts an entry to `executable`, **keeping** the ring. So `L-064-9` and
`L-125-1` — encoded by Session 1 — shipped carrying 10 citation labels
each. `retention_report()` reads an executable's `uses` as **fires**. The
two shipped entries are `cheap`, so the bug could not bite today; but any
repo registering an *expensive* check over a previously-cited lesson
would retain a check that had never caught anything, on the strength of
having once been prose somebody mentioned. That is precisely the
"recording runs would be worthless" failure the split exists to prevent,
committed in the session that wrote the split.

**Fix.** A **kind change clears the ring** (`upsert_entry` returns
`reclassified`), and `backfill` never attaches citation history to an
entry registered as executable, on either the create or the update path.
The shipped ledger was regenerated: all three checks now carry `uses:
[]`. Nothing is lost — the citations remain in the close events the
backfill replays and in the archived lesson text; they simply do not
transfer, because a use of one kind is not a use of the other.

**Falsifiers** (`TestCitationHistoryIsNotFireHistory`): reclassifying
clears the ring and the entry becomes `never-used`; replaying `backfill`
over a registered check leaves it empty; the look-alike — re-registering
the **same** kind — keeps its real history; and a self-application test
asserts every executable in the **shipped** ledger carries no
citation-derived uses.

---

## R1-7 — REJECTED, false positive. Evidence below

> *"the ledger lists `L-064-12` with `122-02`; the corresponding close
> event cites only `L-112-1`, `L-069-1`, and `L-066-1`, while `L-064-12`
> appears in session 3."*

Set 122's close events, read directly:

| session | timestamp | `lessons_cited` |
| ---: | :--- | :--- |
| 1 | 2026-08-13T10:16:20Z | `L-112-1`, `L-064-9` |
| **2** | **2026-08-13T13:49:08Z** | `L-112-1`, `L-079-1`, **`L-064-12`**, `L-069-1` |
| 3 | 2026-08-13T16:03:17Z | `L-069-1`, `L-112-1`, `L-079-1`, `L-064-9` |
| 4 | 2026-08-13T18:01:57Z | `L-112-1`, `L-079-1`, `L-064-8`, `L-064-9` |

Session **2** cites `L-064-12`; session 3 does not. The label `122-02` is
correct and the sessions named in the finding are transposed. No set-122
close event contains the trio the finding quotes.

The finding's *suspicion* pointed at the riskiest part of the backfill —
ordering — so that was verified independently rather than waved off. The
head of `L-064-12`'s ring, against close timestamps:

| label | close timestamp | cites `L-064-12` |
| :--- | :--- | :--- |
| `122-02` | 2026-08-13T13:49:08 | yes |
| `127-02` | 2026-08-12T20:48:27 | yes |
| `123-03` | 2026-08-12T07:29:27 | yes |
| `115-04` | 2026-08-11T19:00:05 | yes |
| `110-03` | 2026-08-05T10:07:38 | yes |

Strictly descending by execution time, with set 122 ahead of sets 127 and
123 — which is not a defect but the **allocation-vs-execution** ordering
Session 1 measured, and the reason the ring and the timeline are built
from close timestamps rather than from sorted labels. That property has
its own falsifier
(`TestTheRingIsBoundedAndOrdered::test_the_ring_records_APPEND_order_not_label_order`
and `TestTheTimelineIsExecutionOrder`), and a mutation replacing the
timestamp sort with a label sort makes it fail.

Residual: none. The label is correct as shipped.

---

## R3-1 — accepted (the L4 fix was REJECTED, correctly)

Round 3 accepted six of seven fixes and rejected the
`project-guidance.md` readiness one. The rejection is right, and it is
the same root cause one sibling site further on.

I made `corpus_ids()` and `cite_lessons.cite_one()` document-agnostic and
stopped there. `validate_documents()` still walked the heading-bound
model, and `validate_guidance_meta._default_files()` still returned only
`lessons-learned.md` and `lessons-archive.md`. So the gate that is
supposed to catch a **malformed or duplicated** project-guidance id —
the gate Session 3's id admission depends on — would have reported
success having inspected none of them.

This is L-069-1 a second time in one session: I fixed the reported sites
and left the class alive at the validator.

**Fix.** New `guidance_meta.scan_entries()` returns `(line index, meta)`
for every marker in a document; `validate_documents()` walks that instead
of `parse_document()`, so bullet-level markers are validated and carry
correct line references. `validate_guidance_meta` now defaults to
`lessons-learned.md` + **`project-guidance.md`** + `lessons-archive.md`,
which also puts project-guidance inside the cross-file id-uniqueness
check — necessary because it is the **sink** lessons are promoted into,
so a promoted entry could otherwise collide with the lesson it came from.

**Falsifiers** (`TestTheValidationGateSeesProjectGuidance`): a malformed
bullet-level id is an error; **the same input through
`parse_document()` yields zero entries**, which is the planted contrast;
a duplicate id across the two documents is an error; the CLI picks up
project-guidance by default and fails on it. Two look-alikes: a marker
quoted inside a code span in a header block is **not** validated (every
guidance file documents the format that way, so validating it would make
each file fail on its own instructions), and the real repo corpus
validates clean.

On the real corpus the widened walk now validates **29 ids across 3
files**, where the heading-bound walk over 2 files saw 26.

`acceptance_harness --round 1` reports finding #2 as still failing. The
substance passes; the criterion's own string does not.

The generated criterion is:

```
command:                python ai_router/guidance_ledger.py --repo-root test-fixtures/cold-start/full report
expectedExitCode:       0
expectedOutputContains: "instruction lines in the live corpus: 1 / cap"
```

`expectedOutputContains` carries **stray literal double-quote
characters** around the phrase, so the harness searches stdout for
`"instruction lines in the live corpus: 1 / cap"` *with the quotes*,
which no output can ever contain. This is the same class of defect Set
121 S1 recorded (its generated criteria were unrunnable one-liners), and
the artifact was **not edited** — it is a raw record.

The criterion's intent was reproduced verbatim otherwise (same command,
same expected exit code, needle minus the stray quotes) and run against
both trees. The pre-fix tree was produced by reverting exactly the two
hunks this finding is about — the `UNREGISTERED` sweep in
`retention_report()` and the `entry is None` arm of
`governed_instruction_ids()` — and restored afterwards:

| tree | exit | contains `instruction lines in the live corpus: 1 / cap` |
| :--- | ---: | :--- |
| pre-fix | 0 | **no** (`0 / cap 22` — the live id was invisible) |
| post-fix | 0 | **yes** (`1 / cap 22`) |

Baseline discrimination holds on the criterion's substance: the
unchanged intent fails before the fix and passes after it.

**The finding also earned a real correction beyond the visibility fix.**
The first remediation made `guidance_ledger report` exit non-zero when
any live id was unregistered. Running the verifier's own command exposed
that as an over-correction: a repo that has not cited anything yet has no
ledger at all, so *every* fresh consumer repo would have failed the
report on day one — a gate that refuses everyone and guards no one. The
unregistered ids are now surfaced and counted, and the failing conditions
are a malformed ledger or an over-cap corpus. Its look-alike falsifier
(`test_an_over_cap_corpus_of_unregistered_ids_still_fails`) proves the
softened exit code did not disable the cap for exactly the entries the
cap most needs to see.

Every rule below was mutated in `guidance_ledger.py`, its test selected
and run, and the source restored:

| mutation | result |
| :--- | :--- |
| `isinstance(item, str)` check removed | test fires |
| ring cap `[:RING_CAPACITY]` removed | test fires |
| `entry.kind != kind` guard removed | test fires |
| retention window ignored (whole timeline) | test fires |
| timeline sorted by label instead of timestamp | test fires |

None was silent, so none of these tests passes by examining nothing.
