# Remediation — Set 133 Session 2, rounds 1 and 2 merged

Five Major findings across the two discovery passes. **Two accepted, three
rejected as false positives on deterministic evidence.** No finding was
rejected on the orchestrator's own reasoning (C-003) — each rejection below
names a command whose output settles it, and each is re-runnable by anyone.

The session ships no product code (spec Non-goals), so where a finding points
at framework behaviour the remedy is a recorded residual with a named owner,
not a fix.

---

## ACCEPTED — R2 Issue 2: no step-checklist post for step 3

**Criterion:** *`checklist-posts.jsonl` contains at least one entry whose
`inProgressStepKeys` includes a key for step 3
(`journal-the-deletion-cost-ruling`).*

**The finding is correct.** The posts for session 2 are:

```
13:16:04  ['confirm-both-registries-are-live-and']
13:29:12  ['cross-provider-verification']
13:41:31  ['cross-provider-verification']
13:44:04  ['cross-provider-verification']
```

Step 2 to step 4, with nothing in between. The cadence calls for a post at
each named transition; this session posted at start and before the
long-running verification command, and did step 3 in between without one.

**It is not retroactively fixable, and it is not being faked.** The checklist
renders the session's *current* state. Step 3 is complete, so any render now
shows step 4. Producing an entry that shows a finished step as in-progress
would mean writing a false record into a git-tracked audit ledger in order to
satisfy the gate that ledger exists to feed — a strictly worse outcome than
the missing post, and the exact inversion of what this set is about.

**Disposition:** accepted; the *finding* is recorded rather than remediated,
and the distinction matters because round 3 read the note as a promise to
freeze the file. It is not one. `checklist-posts.jsonl` is an **append-only
ledger that keeps receiving posts** at every later transition in this session
— before the long verification run, before remediation, before close — so it
legitimately grows after this note was written, and those entries are for
step 4 and beyond. What is refused is narrower and specific: **manufacturing a
step-3 entry**. Nothing that can be appended now would carry a step-3
in-progress state truthfully, because step 3 is finished.

The work step 3 covers is evidenced twice independently — `activity-log.json`
carries it as complete, and `decisions.jsonl` carries the ruling it produced.
Recorded in `change-log.md` under *Two findings this session accepted against
itself*.

---

## ACCEPTED (as to the fact) — R2 Issue 3: dirty tracked build artifact

**Criterion:** *The modification to
`tools/dabbler-ai-orchestration/dist/extension.js.map` is reverted, or the
session records contain a justification and evidence the change is benign.*

The file was indeed modified. **This session did not modify it**, and as of
round 3 it is no longer modified at all — see the revised disposition below.

Evidence, all re-derivable:

| Fact | Command | Value |
|---|---|---|
| Map file last written | `stat` | `2026-08-15 10:42:34` |
| `dist/extension.js` last written | `stat` | `2026-08-15 10:42:34` |
| Session 2 registered | `session-state.json` | `2026-08-15T13:15:46` |
| `dist/extension.js` vs HEAD | `git status --short` | **unmodified** |

The artifact predates this session by two and a half hours, from a rebuild run
after Session 1 closed at 10:34. The emitted bundle `extension.js` carries the
same timestamp and is byte-identical to the committed one — so the build
reproduced the shipped code exactly and only the sourcemap text differed,
which is ordinary bundler non-determinism, not a code change.

**Disposition — REVISED after round 3, and the file is now REVERTED.** The
first disposition left it uncommitted and justified in `change-log.md`, which
satisfies the criterion's second branch. Round 3 rejected that fix and
re-raised the finding, and on reflection the stronger branch was always
available: `git checkout -- tools/dabbler-ai-orchestration/dist/extension.js.map`
restores the committed bytes, and `git status --short
tools/dabbler-ai-orchestration/` now returns nothing.

Reverting is safe here on evidence rather than assumption. The emitted bundle
`dist/extension.js` was already byte-identical to the committed one, so the
10:42 rebuild reproduced the shipped code exactly and only the sourcemap text
differed — ordinary bundler non-determinism. The checked-in `dist/` is not
what ships either: the VSIX is rebuilt from source in CI, which is what
produced the published `0.51.0`. And the change is reversible by rebuilding.

**Root cause confirmed after the fact, and it matters for the residual.** The
file reappeared as modified immediately after the Layer 3 run, because
`npm run test:playwright` begins with `npm run compile`. So the sourcemap is
**non-deterministic across builds** while the emitted `extension.js` is
stable — which is exactly why it was already dirty when this session started,
and why it will keep reappearing for anyone who builds. It was reverted a
second time after the suites, so the commit is clean. The durable fix is a
build-reproducibility question or a `.gitignore` decision about checked-in
`dist/`, and it belongs to a follow-on set rather than a release-records one.

This is the benchmark G-004 names — what a skilled developer would do without
thinking twice on finding a stray sourcemap diff whose code output is
identical. The earlier hesitation (that reverting discards uncommitted state
the session did not create) applied to authored work; it does not apply to a
regenerable build artifact.

---

## REJECTED — R1 Issue 1: "unplanned work outside the declared scope"

Three sub-claims, each false, each settled by a command.

### (a) `ai-assignment.md` is not in the spec's `Touches`

Appending to `ai-assignment.md` is **Step 3.5 of the session constitution**,
run by every session: *"append this session's `ai-assignment.md` block and the
next-orchestrator / next-set recommendations via routed analysis — never
self-opine."* A spec's `Touches` names the session's deliverables, not the
framework bookkeeping every session writes — by the same logic
`activity-log.json`, `session-state.json`, `session-events.jsonl`,
`checklist-posts.jsonl` and `test-runs.jsonl` are all absent from `Touches`
and all written every time.

**Precedent, not argument:** Session 1's `Touches` (spec.md line 116) omits
`ai-assignment.md` identically, S1's `disposition.json` lists
`docs/session-sets/133-release-and-listing-truth/ai-assignment.md` in
`files_changed`, and that session passed four verification rounds and a close
on exactly this shape.

### (b) Three `decisions.jsonl` entries where the spec named one

The spec's `Creates` names the entry it **requires** (the deletion-cost
ruling); it does not cap the journal. The constitution requires the opposite
of a cap: *"Journal every call to the per-set `decisions.jsonl`."* The two
additional entries record the verifier-fallback decisions this session was
forced into by a provider outage — journaling them is compliance.

The criterion's alternative branch — *"the two unplanned decision records are
removed"* — would delete an audit trail to make a plan look accurate. That is
the wrong direction on a set whose entire subject is records telling the
truth.

### (c) This session created `docs/session-sets/134-ceremony-cost-and-what-to-cut/`

**False, decisively.**

| File | mtime |
|---|---|
| `134-…/spec.md` | `2026-08-15 07:16:15` |
| `134-…/session-state.json` | `2026-08-15 07:16:21` |
| — Session 2 registered | `2026-08-15 13:15:46` |
| — Session **1** registered | `2026-08-15 07:21:41` |

The directory predates this session by six hours and predates *Session 1* by
five minutes. It is untracked, authored out-of-band, and **will not be
committed by this session**. It appeared in the evidence bundle because
`git status --short` reports untracked paths and its `spec.md` was inlined by
the untracked-content collector — a reasonable misreading by the verifier, and
the reason it is called out explicitly here rather than left implicit.

**Residual raised by this, not a defect in the work:** an untracked directory
belonging to a *future* set is indistinguishable, inside an evidence bundle,
from work the session under review just produced.

---

## REJECTED — R2 Issue 1: "unplanned decision records document failures"

The same ground as R1 Issue 1(b) under a different framing, and rejected for
the same reason: journaling every decision is mandatory, and the remedy on
offer (remove the records, or retro-fit the spec to what happened) trades an
accurate record for a tidy-looking plan.

**The kernel of the finding is nonetheless right and has been acted on.** The
reviewer's actual concern is that a reader of the plan would not learn the
session hit real operational turbulence. That belongs in the narrative
deliverable, and `change-log.md` now carries a section — *What this session
cost to verify, and what that turned up* — stating the outage, the tier-2
fallback and its consequence, and the two tool gaps, in plain terms. This is
the finding improving the work without the criterion's remedy being applied.

---

## REJECTED — R1 Issue 2: "`change-log.md` contents withheld from review"

**Factually false: the file was inlined in full.** Re-running the same
assembly the round used:

```
$ assemble_evidence(Path('docs/session-sets/133-release-and-listing-truth'), 2, 'HEAD', DEFAULT_DIFF_EXCLUDES)
INCLUDED (content inlined):
    docs/session-sets/133-release-and-listing-truth/change-log.md   11217 chars
```

The verifier had all 11,217 characters and reported it as absent.

**What is real, and it is the tooling's:** the pre-close framing at
`ai_router/verify_session.py:2823-2826` tells the verifier that
`change-log.md` and the other close-out artifacts *"do not exist yet"* — an
assertion about the tree rather than a statement that their absence would not
be a defect. A terminal session is supposed to write `change-log.md` before
verification, because the spec lists it as a deliverable and it should be
reviewed. So the bundle asserted the file's absence while inlining its
contents, and the verifier correctly reported a self-contradiction — then drew
the wrong conclusion from it.

**Residual, product code, not fixed here:** the sentence should say the
absence of close-out artifacts is not a defect, without asserting they are
absent.

---

## Residuals leaving this session, with owners

| # | Residual | Owner |
|---|---|---|
| 1 | `verify_session` hardcodes `exclude_providers` to the orchestrator's provider (`verify_session.py:3345`); the ladder rung it prints has no mechanism | follow-on router set |
| 2 | `providers.<id>.enabled: false` is on the local-override allow-list and does not affect model selection — a control that appears to work and does not | follow-on router set |
| 3 | Pre-close framing asserts close-out artifacts "do not exist yet" (`verify_session.py:2823-2826`) instead of scoping their absence | follow-on router set |
| 4 | An untracked directory belonging to a future set is indistinguishable in the evidence bundle from the session's own new work | follow-on router set |
| 5 | Missing step-3 checklist post; not retroactively fixable without falsifying the ledger | recorded, no owner needed |
| 6 | `dist/extension.js.map` is regenerated non-deterministically by `npm run compile`, so any build dirties it while `extension.js` stays stable. Reverted twice here and the commit is clean; the durable fix (build reproducibility, or a decision about checked-in `dist/`) is owed | follow-on set |
