# Set 121 — Guidance becomes executable

## What this set was for

The framework's always-loaded guidance had run out of room, and the cost
was invisible. Measured 2026-08-11:

- **The preload corpus had 144 tokens of headroom** — roughly four lines —
  across four files each sitting at 98–100% of a ceiling that ratchets
  down only.
- **148 of those tokens were spent on bookkeeping.** The per-lesson usage
  trailers lived *inside* `lessons-learned.md`, which is preload, so every
  session paid to read the accounting that decides what to prune. The
  accounting cost more than the headroom that was left.
- **Three decided pieces of guidance could not be admitted at all.**
  C-001, C-002 and C-003 sat in `guidance-candidates.md` blocked purely on
  space, and nothing recorded what else had been silently not-written.
- **`project-guidance.md` had no ids**, so nothing could cite it, and no
  usage evidence about its 24 entries existed or could be reconstructed
  later.
- **The doc-only severity cap had never fired**, and nobody could say
  whether that was because it worked or because it never applied.

The operator's standing rule of 2026-08-10 governed the whole set: *a
lesson must become executable code or a single instruction line, or it is
dropped.*

## What shipped

### Session 1 — encode what earns its keep, drop what does not

Applied encode-or-drop to every active lesson. Encoded the routed-output
half of L-079-1 into `cli_transport` (bytes end-to-end, one explicit
decode). Shipped `corpus_scan_guard.py`, which parses every `test_*`
function and refuses one that walks the checked-out repo without
asserting the walk matched anything — it found five such tests on the day
it shipped. Archived the lessons already enforced by shipped code with
true falsifiers, and condensed the survivors to one instruction line
each.

### Session 2 — the retention mechanism, so it cannot re-bloat

Moved usage accounting out of the preload corpus into
`docs/planning/guidance-usage.json`, read only at prune time. Split
retention by artifact type, because one *"unused in N sets → drop"* rule
cannot govern both prose and preventive gates: **a use is a citation for
an instruction and a FIRE for a check**, enforced by the writer rather
than by convention. Derived the numbers from 345 recorded active sessions
instead of inheriting the proposal's: `instruction_window_sessions: 30`
(p99 of 694 intra-lesson citation gaps), and an honest default for
`check_window_sets` with the absence of fire history stated rather than
papered over.

### Session 3 — make `project-guidance.md` addressable, and pay for it

Assigned G-001..G-024 to every entry, so usage evidence begins accruing.
Encoded two more lessons into executable tests (`cli_glyph_guard.py` for
the cp1252 glyph class, and the already-shipping
`test_contract_gate_schema.py` for validator parity). Re-derived the
instruction cap against the enlarged corpus rather than inheriting 22,
ratcheted ceilings down, and retired the standing operator authorization
to exceed them.

### Session 4 — admit the queue, and measure whether the cap fired

**The queue is empty of everything that could leave it.** C-003 and C-002
were promoted into `project-guidance.md`. C-001 remains queued on its own
stated prerequisites — an enforcement lint and a recall check — which is
now a merit blocker rather than a space one.

**The promotions were funded by collapse, not by an exception.** Six
entries (G-009, G-011, G-014, G-016, G-017, G-021) restated
`session-constitution.md`. Both files are preload, so each duplicate was
read on every session and bought nothing. Full text is archived, with a
table naming where each rule is live. `project-guidance.md` measures
**3,394 tokens, down from 3,645 — net of both admissions.**

**Every ceiling is back at its measurement**, and the last accommodation
is gone. Total 12,234 → **11,644**; constitution 4,200 → 4,059;
`project-guidance.md` 3,645 → 3,394; the standing-authorization section is
deleted from both `guidance-lifecycle.md` and `router-config.yaml`.

**The manifest's engine entry moved from `AGENTS.md` to `GEMINI.md`.** The
lockstep trim of the three bootstrap files left `GEMINI.md` largest, and
the manifest must count the largest or it under-states what a session
really reads. The rule existed; this is the first time it fired, and
`guidance-lifecycle.md` now carries it as a worked example.

**The instruction cap is evidence-backed again: 25 → 22.** S3 was forced
to set cap = corpus = 25, which can only fire on the very next entry and
therefore measures nothing. The collapse left the corpus at 21, back under
the measured historical peak, so the real number is usable — with one slot
of genuine headroom.

## The answer the set was asked for

**The doc-only cap did not fire. Not once, in any round, in any of the
four sessions.** Full report: `s4-doc-only-cap.md`; the measurement ships
as `ai_router/measure_doc_only_cap.py` so it can be re-run rather than
re-derived.

- **23 of 23 findings cited `evidencePaths`** — 100%, holding the jump
  Set 119 produced from 0 of 581.
- **Zero were doc-only. 13 of 23 (57%) were mixed** doc-and-code, up from
  the 38% measured while the spec was being written. Session 4's own
  findings are the sharpest case: all of them mixed, on a session that
  changed almost nothing but documentation.
- **Rounds did not move.** Netting out the phased `supplementary` round —
  a harvest, not a re-round — sessions 1–3 ran 5, 4 and 3: a median of
  exactly the pre-cap **4.0**. The cap can be neither credited nor blamed
  for a number it never touched.

Mixed citation is not reviewer error; it is the honest citation for prose
that documents code. **A finding that the cap did not fire was a declared
successful outcome of this step**, and it sizes the deferred
`project-guidance` triage: plan that work at full pre-cap round cost.

The obvious follow-on — widen the cap to mixed citations — was measured
and **deliberately not taken**. It is a verification reduction, reserved
to the operator by spec decision 5 and by the constitution's hard
carve-out. The set records the argument against it too, because a
measurement presented alone reads as advocacy: those rounds found real
defects, not wording. Session 4's own round 1 found a false number in this
session's headline deliverable — the round counter was counting
operator-authorization ledger rows as verification rounds — and cited the
module, the ledger and the report together. **A widened cap would have
suppressed the finding that corrected this document.**

## Named residuals

- **The set is far over its declared test budget.** The spec capped it at
  **40 new test functions across all four sessions**; the measured figure
  is **151 net**. S1's `corpus_scan_guard` suite (53) and S2's
  `guidance_ledger` suite (76) account for most of it. Sessions 1–3 are
  closed and cross-provider VERIFIED, and their test files were not in
  Session 4's scope, so Session 4 recorded the number and surfaced it
  rather than unwinding closed work or passing it silently. **Operator
  ruling, 2026-08-15: record as a named residual and close.** The spec's
  own warning stands and is the thing to weigh next time — *"a guidance
  mechanism that needs more tests than the guidance it replaces has not
  reduced anything."*
- **C-001 stays queued** pending its enforcement lint and recall check.
- **29 production `subprocess` call sites** still pass `text=True` with no
  `encoding=` — the open half of the standing Windows cp1252 bug class,
  owned by a future Windows-encoding set. The fix is not uniform: git and
  podman children emit UTF-8, the powershell/tasklist children emit the
  console codepage.
- **Severity is still degenerate** (91% Major historically). Named out of
  scope at the start and unchanged.

## What it leaves behind

Every future session in this repo carries a smaller preload — 12,234 →
11,644 tokens, on top of Session 3's reduction — and that cost is paid on
every session, so it compounds. More durably, guidance in this repo is now
*addressable* (ids), *accountable* (a usage ledger that distinguishes a
cited instruction from a check that actually caught something), and
*bounded* by two gates that are measurements rather than opinions.

The one thing that could not be recovered later, and now cannot be lost:
**usage evidence only accrues from the moment ids exist.**
