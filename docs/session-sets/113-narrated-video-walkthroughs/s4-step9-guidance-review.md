# Session 4 — Step 9 guidance review

The set-terminal reorganization review of
[`project-guidance.md`](../../planning/project-guidance.md) and
[`lessons-learned.md`](../../planning/lessons-learned.md).

**Outcome: no changes recommended.** One candidate is recorded below with
its evidence rather than promoted, and the reasoning for not promoting it
is the repo's own rule rather than a shortage of enthusiasm.

## The budget this review is working inside

```
docs/session-constitution.md      ~4,059 tokens  [ceiling 4,059: 100%]
docs/planning/project-guidance.md ~3,394 tokens  [ceiling 3,394: 100%]
docs/planning/lessons-learned.md  ~2,269 tokens  [ceiling 2,269: 100%]
GEMINI.md                         ~1,922 tokens  [ceiling 1,922: 100%]
TOTAL                            ~11,644 tokens  [ceiling 11,644: 100%]
```

**Every preload file is exactly at its ceiling.** Ceilings ratchet down
only, so admitting a lesson here means demoting one — and this review found
nothing it would rather have less of.

## Candidates considered, and why each was not admitted

Set 121's rule governs: *a lesson becomes executable code or a single
instruction line, or it is dropped.* All three candidates from this session
became code.

### 1. "A constraint recorded in prose is not a constraint"

**The strongest candidate, and the one worth remembering.** This session
tried to gate an unapproved capability three times:

1. The word *"provisional"* in an outcome document, with the `npm run`
   entry still registered. Verification: *"Calling it 'provisional' in
   prose does not enforce a gate."*
2. A runtime notice that printed the FAIL verdict and then recorded anyway.
   Verification: *"leaves the operator's decision right advisory rather
   than enforced."*
3. A CLI that fails closed, reads its approval from the committed record,
   and names the two routes that would unlock it.

Only the third is a gate. The cost of learning that was two rejected fix
verdicts.

**Not admitted, because it is now encoded** — in `captureApproval()`, and
in a test that reads the *real* committed measurement rather than a
fixture, so it starts passing for the right reason the moment a genuine
`PASS` or a committed waiver exists. Criterion 4 of the admission test (no
executable-gate equivalent) disqualifies it, and criterion 1 (recent
recurrence *across sets*) is not yet met: three iterations inside one
session is a strong signal, but it is one session.

**Recorded here so a future set can promote it if it recurs.** The
one-line form, if it ever earns preload: *a rule that only a reader
enforces is documentation, not a gate — encode it or expect it to be
routed around.*

### 2. "Observe, do not predict, when another program owns the naming"

Cleanup guessed OBS's filename slug, deleted nothing, and reported success
— the worst of both. Encoded in `obs-capture.js::_removeAppeared`, which
snapshots the configuration directories before creating anything and
removes what appeared. First occurrence in this repo; no cross-set
recurrence. Not admitted.

### 3. "Assert the effect, not the acknowledgement"

OBS accepted `StartRecord`, returned success, and never started the output
— no websocket error, no line in its own log. Encoded in
`startRecording()`, which now raises rather than returning an anchor with a
20-second uncertainty. First occurrence; not admitted.

## Lessons this session leaned on, cited rather than added

- **L-112-1** (ship every pattern gate with a falsifier that plants the
  violation) — the most load-bearing lesson of the session. Every measuring
  instrument got a planted failure: the PNG decoder is driven against all
  five scanline filters, the correlation must score 1.0 on an image against
  itself *and* below threshold on an inverted one, and a blank frame must
  score **zero rather than one**. That last falsifier is why the ffmpeg
  fallback's black frame read as a failure instead of a suspiciously tidy
  pass.
- **L-079-1** (ASCII at subprocess boundaries) — applied across five new
  Windows-facing scripts.
- **G-008** (a bug is a bug class) — the cleanup-ownership defect was
  checked for a sibling in the browser recorder, which does not have it
  because it publishes each handle at creation.
- **G-004** (practicality outranks rule-perfectionism) — pytest ran at the
  operator's 8-worker cap rather than the declared `-n auto`, with the
  route journaled.
- **G-005** (prefer removal over addition) — two OBS output settings were
  removed rather than worked around, and the `npm run` entry was removed
  rather than annotated.
- **G-013** (grade severity by consequence) — carried in the conventions
  block for every round.

## One correction owed to the conventions block

The Session 4 verification conventions stated the suite baselines from
memory and got two wrong. The measured figures are **mocha 1548 passing**
(the ~1821 figure belongs to a different, whole-`src` glob, not this
suite's declared command) and **Layer 3 37 specs in 3.1 minutes** (not 28).
Neither error favoured this session — both understated the coverage that
actually ran — but a conventions block exists to stop rounds burning
findings on the agreed baseline, and one carrying wrong numbers does that
job worse. Recorded here rather than quietly fixed.
