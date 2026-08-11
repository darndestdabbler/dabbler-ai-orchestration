# Step-ledger findings — recorded before this set runs

> **Status:** findings, 2026-08-11. **Not a ruling and not a re-scope.**
> Sessions 1–3 are unaffected and can proceed as authored. **Session 4
> should not run as written** — §5 records a contradiction in it, and §2
> records a data defect that would make anything it builds render wrong.
>
> **Why this exists:** the operator observed the step ledger rendering
> incorrectly *live*, and asked whether a Work Explorer implementation
> could be more efficient than the chat rolling checklist. Investigating
> that produced a root cause the set's own `operator-notes.md` predates.

## 1. What was observed

A screenshot of the Explorer during Set 119 Session 2, in flight:

- `Register` rendered **not-started** with the `<- here` marker on it, while the session was demonstrably past it
- Steps 2–4 rendered not-started
- Step 5 (`Full pytest at close after freeze`) rendered **in-progress**
- One step title rendered as `Build python m ai router close` — from a spec line reading ``Build `python -m ai_router.close_preflight`.``

Three of these match `operator-notes.md`'s existing defect list. **All
four have a single cause, and it is not the renderer.**

## 2. Root cause — the step-status field has no vocabulary

Every distinct value of `status` across every `activity-log.json` in the
repo:

| token | count | |
| :--- | ---: | :--- |
| `complete` | 2,412 | canonical |
| **`completed`** | **229** | drift |
| `pending` | 45 | canonical |
| **`done`** | **42** | drift |
| `in-progress` | 31 | canonical |
| `None` | 4 | drift |
| `blocked` | 3 | |
| `skipped` | 1 | |
| **`complete-with-known-failures`** | 1 | drift |
| **multi-paragraph prose narratives** | ~6 | **a 1,000-word essay, and a JSON array of routing costs, written into a status field** |

`SessionLog.log_step` accepts arbitrary strings
(`ai_router/session_log.py:165`). **"Done" is spelled four ways.**

Set 119 Session 1 wrote `complete` and rendered correctly. Session 2
wrote `completed` and rendered as not-started. **Roughly 10% of all step
entries are mis-rendered for this reason alone.**

**The title mangling is the same class:** markdown/punctuation stripping
turns `` `python -m ai_router.close_preflight` `` into
`python m ai router close`. Uncontrolled input, no validation at the
boundary.

## 3. `<- here` is not a bug

`session_checklist.py:393` selects **the first non-terminal row**, falling
back to the last. With steps 1–4 carrying an unrecognised token, step 1
*is* the first non-terminal row. **The marker behaved exactly as designed,
on corrupt data.** Both surfaces would do this.

It is nevertheless *inferred, not observed*. Either record explicit
step-start / step-complete transitions, or rename it honestly — "next
unresolved recorded step."

## 4. The tree hides what the CLI shows

| surface | unknown status renders as |
| :--- | :--- |
| Python (`session_checklist.py:145`) | `[?]` — **visibly wrong** |
| Tree (`sessionStepModel.ts:94`) | `not-started` — **confidently wrong** |

The TypeScript comment claims this "matches `UNKNOWN_BOX`'s posture." **It
does not.** One surfaces a data-quality error; the other conceals it.

This is decisive against treating the tree as the more trustworthy
surface, and it is corroborated by `operator-notes.md`'s own record that
Set 116 S3 *"typed the bad status token itself, saw the `[?]` in the CLI
output, and moved on."* The CLI reported it. The tree would not have.

## 5. Session 4 contains a contradiction — resolve before authoring

Independent review (GPT-5.6 Sol, 2026-08-11) found that Session 4
requires two things that cannot both hold:

- show outstanding lifecycle phases, **and**
- render only what is recorded, never what is planned.

Before verification, disposition, remediation or close has happened, **no
record necessarily exists**. Absence cannot distinguish *pending* from
*not applicable* from *not yet knowable* from *missing or corrupt
evidence*. So Session 4 cannot guarantee "fully ticked means actually
finished" without synthesising expected obligations from policy — the one
thing it forbids itself.

Related: an unreadable or absent ledger currently renders as no children
and an unexpandable row (`workExplorerTreeModel.ts:215`), so **"no work"
and "cannot read evidence" look identical.**

**Sol's six preconditions before Session 4 is committed**, recorded
verbatim in substance:

1. A canonical lifecycle/applicability state machine.
2. Validated status vocabulary at the writer (§7.1).
3. Explicit semantics for absent, corrupt, contradictory and stale ledgers.
4. No acceptance criterion that can be satisfied by a false "complete".
5. An audited prototype comparing files, Python output and tree output.
6. **Evidence that operators actually keep the session node expanded and act on it.**

That last one is not rhetorical. The tree is lazy, invisible until the
view is open, and session rows are **collapsed by default** — so
"persistent" does not establish that it is *watched at the transition
where intervention matters*. Gemini put the same point more bluntly: a
4-session lifecycle to fix a rendering map is *"a bulldozer to plant a
daisy."*

## 5a. The tree-vs-chat question, and why the obvious answer is wrong

This set exists partly on the premise that the tree is the better place
for progress. Both reviewers rejected the strongest form of that claim.

**The tree is not an independent authority.** This is the finding that
matters most, and it was missed until Sol named it: **both surfaces read
the same two files.** The chat checklist renders from
`activity-log.json` / `session-state.json`
(`ai_router/session_checklist.py:435`); the tree renders the same ledger
through a **separate TypeScript implementation**
(`sessionStepModel.ts:499`). A sanctioned writer proves *provenance and
shape* — **not semantic truth.** The state files are still the
orchestrator's own claims.

So "the tree is evidence, chat is self-report" is a category error. The
tree is a *second parser over identical self-reported data*, which adds
divergence surface (§4) rather than authority.

**And bug-count comparisons are invalid in both directions.** The tree
has more *observed* defects because it is watched; that establishes
"comparative correctness is unknown," **not** that either surface is
better. Both reviewers flagged the contrary inference as motivated
reasoning. Gemini drew the sharper distinction: Set 111 S4's single post
across many hours was a **procedural omission** — invisible, but not a
lie — whereas the tree took correct underlying data and **rendered a
false reality**. Overlapping, not identical, failure classes.

**The forcing-function argument for chat is unproven, not disproven.**
Re-emitting five unchanged rows does not make a model re-derive anything —
Python computes the rows and the orchestrator largely copies them. A
material forcing function would require reconciling *recorded state,
intended next action, unresolved blockers, and stale or contradictory
evidence*. Measure sequencing mistakes and stale-state corrections, **not
checklist-post counts.**

**The synthesis both reviewers converged on** — and it is better than
"put it in the tree" or "put it in chat":

- one **validated canonical state model**, both surfaces projected from it;
- a **full snapshot** at session start and after any context reset;
- a **machine-generated delta** at transitions (current / next / blockers / source timestamp) rather than a full re-render;
- the tree as the **human dashboard**, not the authority;
- explicit `unknown` / `stale` / `unreadable` states throughout;
- and the delta should carry **close-preflight obligations**, not merely implementation steps — because those are what closes actually fail on.

Note also that `checklist-posts.jsonl` records **renderer metadata, not
delivery** — it does not prove the chat content was emitted or read. The
epistemic gap between the two surfaces is narrower than it appears from
either direction.

## 6. The architecture finding — compute once, render twice

The same derivation exists in two languages:

| | lines |
| :--- | ---: |
| Python — `progress.py` 814 + `session_checklist.py` 866 | **1,680** |
| TypeScript — `progress.ts` 668 + `sessionStepModel.ts` 525 + `workExplorerTreeModel.ts` 637 | **1,830** |
| TS tests guarding the mirror — 44 + 19 + 47 | **110** |

Plus `test_step_row_parity.py`, which exists *only* to check the two
implementations agree. **A parity test is a tax on duplication.**

The §4 divergence is a direct consequence: two implementations, two
answers for an unknown token.

**Operator's proposal, 2026-08-11: make the checklist data-driven and let
the AI read the data.** This resolves the objection that a TreeView is
invisible to the orchestrator — the AI cannot see pixels, but it can read
a file.

Shape: compute the projection **once, in Python**, serialise it, and have
both the tree and the orchestrator read the same bytes.

- **JSON, not YAML** — the repo's existing convention is JSON for machine-written state (`session-state.json`, `activity-log.json`) and YAML for human-authored config (`router-config.yaml`, `modules.yaml`, `budget.yaml`). TypeScript parses JSON natively; YAML's type coercion is a poor target for a writer that must not silently corrupt state.
- **Mark it derived and regenerable** — a cache, never a source, so it cannot go stale against its own inputs.
- **Carry explicit `unknown` / `stale` / `unreadable` states**, per §5.

This would delete most of the 1,830 TS lines and most of the 110 tests —
removing a **defect class**, not merely fixing an instance.

## 7. Prerequisites, in order

1. **A status allowlist at the writer.** `log_step()` must fail closed against an exact vocabulary, exactly as `session_state.validate_verification_verdict` does for verdict tokens (Set 086 S1: *"readers stay lenient; the writer is strict"*). **This is a router change, not a Work Explorer change, and is out of this set's scope** — but nothing here renders correctly until it lands. A projection computed from four spellings of "done" is a faster way to be wrong.
2. **Decide the projection architecture** (§6). It reshapes what Session 4 builds, and possibly shrinks it to a renderer.
3. **Resolve the Session 4 contradiction** (§5) — or drop Session 4 and keep 1–3.

## 8. What this does not touch

**Sessions 1–3 stand as authored.** Titles, click-to-plan navigation, and
the menu are independent of the step ledger, and the operator has since
confirmed both the context menus and click-to-open-spec are in daily use
and valuable. Judge them on their own merits; their value does not
validate Session 4, and Session 4's problems do not condemn them.

**Neither surface is the lever for close-out reliability.** Both reviewers
independently concluded that the 41%-of-closes-fail figure is not a
rendering problem — it needs the close predicates evaluated up front,
which is `ai_router/close_preflight.py`, shipped by Set 119 Session 2. A
step marker says nothing about test freshness, disposition, UAT, tree
cleanliness, push state or verification evidence.

**And that 41% needs rebaselining before anyone cites it again** (Sol):
64 of the 212 historical check-failures belong to checks Set 116 S3
demoted, and `close_preflight` did not exist for any of the corpus. The
honest denominator is 148 still-blocking failures, against which Session
2 measured its preflight at 150.

## 9. Provenance

The root cause (§2), the title mangling, `markHere` (§3) and the
duplication measurements (§6) were derived by inspecting the tree on
2026-08-11.

§4, §5, §5a and the rebaselining note in §8 come substantially from an
independent cross-provider review commissioned the same day —
`gemini-3.1-pro-preview` (96s) and `gpt-5.6-sol` (203s), given an
identical prompt, read access to this repo, no knowledge of each other,
and an explicit instruction to attack the design rather than validate it.
Both were told not to run the test suite.

Their line citations were checked against the tree and are accurate. Where
they disagreed with the position that prompted the review — that the tree
is the more trustworthy surface — **they were right and it was wrong**,
for the reason in §5a: it is not an independent source.
