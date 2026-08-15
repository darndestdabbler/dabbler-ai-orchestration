# AI assignment log — Set 121

Per-session orchestrator assignment and the next-session recommendation.
The recommendation below is **routed**, not self-authored: the analysis
was sent through `route()` and the reply is reproduced verbatim.

---

## Session 1 — Encode what earns its keep; drop what does not

**Orchestrator:** `github-copilot` / `anthropic` / `claude-opus-5`,
effort `high` (Copilot CLI transport — this seat carries no provider API
keys by design, and their absence is not an error).

**Verification:** routed to `gpt-5.5`; `anthropic` was excluded by the
router as the orchestrator's registry-resolved effective provider, so the
cross-provider requirement held on every one of the four rounds.

**The spec's numbers had expired, and both discrepancies were resolved
rather than reported.** Step 2 re-derived all three measurements. The
preload table was stale in the direction the spec predicted: ceilings had
been raised under the standing operator authorization and the corpus had
grown, so the spec's "144 tokens of headroom" was actually **−141** — the
total ceiling was already breached at session start. The named five
active lessons were a *different* five: `L-075-1` had been archived by
Set 125 Step 9 and `L-125-1` admitted in its place, and `L-069-1` did not
return to the active tier. Both are findings about the **spec**.

The third discrepancy was a finding about the **query**, and it is the
more interesting one. The spec claimed 0 of 581 findings cited
`evidencePaths` across "Sets 057–117". Keyed on set number that is false —
sets 115 and 118 cite paths. Keyed on **execution time** it is exactly
right: before Set 119 S1 landed (2026-08-10T19:39) **0 of 572** findings
cite paths; on or after, **85 of 85** do. Sets 115 and 118 were *executed*
after 119; set numbers are allocation order, not execution order. The
spec's substantive claim survives on a sample 6.5× larger than it had.

**Doc-only findings remain 0 of 85 — the cap has still never fired** —
and mixed doc+code citations are now 38 of 85 (45%), up from 5 of 13
(38%). That strengthens the failure mode Session 4 is chartered to
measure.

**The encode-or-drop rule produced one new gate, two archivals and three
one-liners.** `L-064-9` and `L-125-1` were found already enforced by
shipped code with *true* falsifiers — tests that go red when the guard is
deleted, not tests that observe it exists — so admission-test criterion 4
disqualified them and they archived behind `encoded-in` pointers.
`L-079-1` was a journaled **deviation** from proposal §5.2's "code": its
data-loss half is already encoded, and its subprocess half is 29 sites
whose correct fix is not uniform, so a lint would have shipped either
red or vacuously green. `L-064-8` had no plausible mechanical corpus.

`L-112-1` split. §5.2's meta-gate over every pattern gate is not
buildable — the gates have no registry to enumerate, and a meta-gate
blind to its own population *is* the defect the lesson names. But its
empty-corpus bullet is enumerable by shape, so that half became
`ai_router/corpus_scan_guard.py`.

**Verification found six Majors, every one of them real, and every one
the same mistake.** The guard was calibrated against the corpus that
exists today — so its false negatives were invisible by construction.
Non-transitive helper resolution (a shape *this session created* while
fixing an offender), generator truthiness accepted as proof of
non-emptiness, local `Path(__file__)` roots, fixture injection including
the `conftest.py` case, and laziness that did not cross a call boundary.
Committing `L-112-1`'s own error while encoding `L-112-1` is the most
useful thing this session learned, and it is recorded in the round
sidecars rather than smoothed over.

**The generated acceptance criteria were unrunnable** — a shell-escaping
defect in the verifier's `python -c "exec('...')"` one-liners makes them
raise `SyntaxError` before evaluating anything, so the harness reported
"still failing" on substance it never tested. The artifacts were not
edited. Each criterion's intent was reproduced as a runnable equivalent
and executed against both trees, with pre-fix trees taken from the git
index and from the harness's own recorded round-2 tree. All seven fail
pre-fix and pass post-fix, with every paired look-alike silent on both.

### Next-session recommendation (routed, verbatim)

```
CODE: continue-current-trajectory
ENGINE: github-copilot
PROVIDER: anthropic
MODEL: claude-opus-5
EFFORT: high
SPECIFICS: Session 2 requires careful multi-file refactoring of an
existing metadata module and its call sites, plus sanctioned-writer and
file-locking discipline - exactly the kind of precise, context-heavy
Python work where claude-opus-5 at high effort performed well in Session
1. The ring-buffer ledger design and retention-rule derivation also
demand sustained reasoning across config, code, and docs simultaneously.
Switch to a different model only if Session 2 hits a context-window
blocker or a measurable cost ceiling that high-effort opus cannot
justify.
```

### What Session 2 inherits

- **Headroom, deliberately unspent.** `lessons-learned.md` is at 2,229 /
  2,504 and the preload total is back under its ceiling. The ceiling was
  **not** ratcheted down (journaled): Session 4 promotes from the
  candidate queue into exactly this headroom, and ratcheting now would
  force an operator-authorized raise to undo it.
- **`AGENTS.md` is still 177 tokens over its 2,031 ceiling.**
  Pre-existing, outside this session's Touches, and covered by the
  standing authorization that Session 4 Step 3 retires.
- **A named residual:** 29 production `subprocess` call sites pass
  `text=True` with no `encoding=`. Owned by a future Windows-encoding
  set, not by this one.
- **Three lessons are now one-liners** (`L-079-1`, `L-064-8`,
  `L-112-1`), which is the shape Session 2's instruction-line retention
  rule has to govern.

---

## Session 2 — The retention mechanism, so it cannot re-bloat

**Orchestrator:** `github-copilot` / `anthropic` / `claude-opus-5`,
effort `high` (Copilot CLI transport — this seat carries no provider API
keys by design, and their absence is not an error).

**Verification:** routed to `gpt-5.5`; `anthropic` was excluded by the
router as the orchestrator's registry-resolved effective provider, so the
cross-provider requirement held on all four rounds.

**The spec's premise measurement had expired the same way Session 1's
did.** The spec sizes the inline bookkeeping at *"six trailers, 594
bytes, ~148 tokens"*. After Session 1 archived two lessons and condensed
three, the actual figure is **three trailers, 300 bytes, ~75 tokens**
(plus five `lesson-pointer` comments at 225 bytes). A finding about the
spec, and the second time in this set that re-measuring beat inheriting.

**Usage accounting left the preload corpus.**
`docs/planning/guidance-usage.json` holds one record per guidance item,
keyed by id and agnostic about which document it lives in, each with a
bounded ring of its last ten `<set>-<session>` **string** labels. The
scalar it replaces could not tell *used once, ten sets ago* from *used in
every one of the last ten* — the two cases that warrant opposite pruning
decisions.

**It was backfilled from history rather than started empty.**
`close_session` has recorded `disposition.lessons_cited` into
`session-events.jsonl` since Set 064, so 167 per-session citation events
across 65 sets replayed straight into real recency rings. That backfill
is also the dataset the numbers were derived from.

**The close-mandated exemption got strictly stricter.** The two preload
documents used to carry a surgical exemption so the close could bump one
trailer field inside them. Nothing writes them at close any more, so they
lost the exemption entirely and now bind the freshness digest byte for
byte; only the bookkeeping JSON is exempt, whole-file.

**N and the cap were derived, and one of them honestly could not be.**
30 active sessions is the p99 of 694 measured intra-lesson citation gaps
— which is ~10.4 sets at this repo's 2.88 sessions/set, so §5.3's *"N =
10 sets"* survives measurement once the unit is corrected to the one the
operator mandated. The cap of 22 is the peak concurrent working set over
345 sessions. The check window had **no fire history to derive it from at
all**, so it is declared an honest default reusing the operator-set
`disuse_window_sets` rather than a fabricated derivation. The cap's
blind spot — `project-guidance.md` has no ids yet — is recorded along
with Session 3's obligation to re-derive rather than inherit it.

**Verification found eight Majors. Seven were real; the eighth was
not, and the difference was evidenced rather than asserted.** The real
ones: live ids absent from the ledger were invisible to both the report
and the cap (twice, one root cause); the canonical workflow doc still
taught the retired rule; the corpus scan used a heading-bound parser
against a file whose entries are bullets, so it would have returned zero
ids *silently*; a mistyped id became a permanent ghost in a ledger with
no eviction path; `--session` defaulted to 1 silently; and — the sharpest
— an encoded check **inherited its prose-era citations as fires**, which
is the exact failure the citation/fire split exists to prevent, committed
in the session that wrote the split. The rejected one claimed a shipped
label contradicted the close events; set 122 session 2 does cite
`L-064-12` and session 3 does not, and the ring's ordering was
independently re-verified as strictly descending by execution time.

**L-069-1 fired twice in one session.** Round 3 correctly rejected the
project-guidance fix: I had made the corpus scan and the citation path
document-agnostic and left the *validator* heading-bound and blind to the
file, so the gate that must catch a malformed or duplicate id would have
reported success having inspected none of them.

**The generated acceptance criterion was unrunnable again**, in a new
way: `expectedOutputContains` carried stray literal quote characters that
no output can contain. The artifact was not edited; the criterion's
intent was reproduced and run against both trees — and running the
verifier's own command exposed a real over-correction of mine, where
exiting non-zero on unregistered ids would have failed every fresh
consumer repo on day one.

### Next-session recommendation (routed, verbatim)

```
CODE: reduce-effort
ENGINE: github-copilot
PROVIDER: anthropic
MODEL: claude-sonnet-4.6
EFFORT: medium
SPECIFICS: Session 3 is predominantly mechanical work: assigning IDs to
~24 bullet entries, encoding two already-specified lessons with known
token deltas, and re-deriving a cap against an enlarged corpus using an
established derivation method. None of these tasks require deep reasoning
or synthesis - they follow explicit rules laid out by Session 2. Claude
Sonnet 4.6 at medium effort handles structured, well-scoped mechanical
tasks reliably without burning Opus-5/high-effort budget. The one
non-trivial step (cap re-derivation) is a quantitative calculation with a
clear method, not a judgment call. Reserve Opus-5/high for Session 4
where the deferred judgment-heavy triage lands.
```

### What Session 3 inherits

- **The mechanism is ready for its ids, and now genuinely so.** Markers
  are found anywhere in a document (not only under an `##` heading),
  `cite_lessons` searches `project-guidance.md`, `ID_RE` accepts the
  two-segment handle (`C-003`, `G-001`), and
  `validate_guidance_meta` validates that file by default — including in
  the cross-file id-uniqueness check, which matters because
  project-guidance is the **sink** lessons are promoted into.
- **An obligation, not a suggestion: re-derive `instruction_line_cap`.**
  22 was measured against a corpus that contained none of the ~24 entries
  Session 3 admits. Inheriting it would repeat exactly what this session
  refused to do with §5.3's 20.
- **Unregistered live ids are surfaced but do not fail the report.** A
  freshly-idded entry shows as `unregistered` and counts against the cap;
  it is not an error, because a repo that has not cited anything yet has
  no ledger at all.
- **Still open from Session 1:** `AGENTS.md` is 177 tokens over its
  2,031 ceiling (retired by Session 4 Step 3), and 29 production
  `subprocess` call sites pass `text=True` with no `encoding=`.

---

## Session 4 — Admit the queue, and measure whether the cap fired

**Assigned:** github-copilot / anthropic / claude-opus-5 / high, per Session 3's
routed next-orchestrator recommendation (gpt-5.5, tier-0, 2026-08-15), which
called Session 4 the deferred judgment-heavy session and returned it to the
S1/S2 profile after Session 3's mechanical Sonnet/medium exception. Accepted
unchanged.

**Verdict:** VERIFIED on round 3 (`remediation-review`), 3 fix verdicts accepted,
0 rejected. Three blocking Majors across two discovery passes, all accepted and
fixed, none disputed.

### Next-SET recommendation (routed, verbatim)

```
RECOMMENDED_SET: set-115-sessions-1-3
CONFIDENCE: high
WHY: The sequencing note's standing order explicitly places Set 115 S1-3 next,
and nothing in Set 121's output changes that. The operator has confirmed context
menus and click-to-open-spec are in daily use - that is a value signal, not a
guess. Set 115 is fully independent of everything else, requires no new
instrument, and its Session 4 re-author decision is now unblocked because Set 120
is complete. The new guidance ledger and guard-accrual evidence produced by Set
121 make Set 118 *cheaper than before*, but Set 118 S1 still needs to run before
S2-S3 can be confirmed - it does not leapfrog Set 115.
RUNNER_UP: set-118-s1-only - The guidance ledger's fired/cited tracking is
exactly the instrument Set 118's guard-accrual half was missing; running S1 now
would let the operator decide S2-S3 while the ledger evidence is fresh. It
becomes first if the operator weights infrastructure health over UX wins.
DO_NOT_RUN_YET: extension-carve - Still depends on Set 120's projection work
being fully digested and the ~1,200-1,500 TypeScript lines being confirmed ready
for deletion; running it before Set 115 also violates the sequencing note's
explicit ordering rationale.
```

### What the next set inherits

- **The preload corpus is inside every ceiling, with none to spare and none
  wasted.** 11,644 tokens against 11,644, each file at its own measurement. The
  standing authorization to exceed the ceilings is deleted, not merely marked
  retired, so the next session that needs room removes prose or asks the
  operator.
- **The manifest's engine entry is `GEMINI.md`, not `AGENTS.md`.** The three
  bootstrap files were trimmed in lockstep and GEMINI is now the largest. Anyone
  editing them must keep all three in step and repoint the manifest in the same
  change if the ordering flips again.
- **The instruction cap is 22 with a live corpus of 21** — one free slot, held
  open deliberately. A test asserts the cap equals the measured historical peak,
  so a future session that re-derives it from its own corpus size has to move the
  documented constant and say why.
- **The doc-only cap has an evidence-backed verdict: it has never fired**, and
  `python -m ai_router.measure_doc_only_cap <set-dir>` re-runs the measurement on
  any set. Prose-heavy work does not produce doc-only findings, so no future set
  should budget for the cap to shorten its loop.
- **An open operator question, sized and unacted:** 13 of 23 findings were mixed
  doc-and-code citations, and 6 of 11 blocking round artifacts carried only mixed
  blockers. Widening the cap to cover them is a verification reduction and needs
  a fresh ruling. The argument against is recorded beside the number.
- **A cautionary residual: the set shipped 151 net new test functions against a
  declared cap of 40.** Operator ruled it recorded rather than remediated. A
  future set that declares a budget should check it at each session close, not at
  the terminal one, where every option but recording it has expired.
