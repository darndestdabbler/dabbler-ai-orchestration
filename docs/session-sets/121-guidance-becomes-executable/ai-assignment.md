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
