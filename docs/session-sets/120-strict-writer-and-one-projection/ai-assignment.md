# AI assignment log — Set 120

Per-session orchestrator assignment and the next-session recommendation.
Under the temporary verification-only routing policy (2026-08-05), the
active orchestrator records these directly rather than routing the
analysis; only `session-verification` goes through `route()`.

---

## Session 1 — The writer refuses what it cannot mean

**Orchestrator:** `copilot` / `anthropic` / `claude-opus-5`, effort `high`
(Copilot CLI transport — this seat carries no provider API keys by design,
and their absence is not an error).

**Verification:** routes to a non-anthropic effective provider, as the
cross-provider rule requires.

**The measurement was reproduced, not inherited.** The spec's token counts
came from a one-off query on 2026-08-11; this session re-ran the count over
every `activity-log.json` before drawing the vocabulary from it. The
canonical five are confirmed (`complete` 2,417 / `pending` 55 /
`in-progress` 31 / `blocked` 3 / `skipped` 1) and nothing was invented. The
drift totals moved slightly against the spec — `complete` 2,417 vs 2,412,
`pending` 55 vs 45, nine prose blobs vs "~6" — because Set 119 kept writing
after the spec was authored and this session's own registration seeded five
plan rows. **Session 2 owns the precise inventory and must say whether a
discrepancy is a fact about the query or about the spec**; this session
only needed the *set* of canonical tokens, which is stable under those
deltas.

**The sibling audit found four bypass writers, and all four were routed.**
`contract_gate`, `path_aware_critique`, `dual_surface_verify` and
`suggestion_disposition` each do their own read-modify-write of
`activity-log.json` rather than going through `SessionLog`. Every one
already hard-coded `"complete"`, so none could drift at runtime today —
but an allowlist at one entry point is worthless if another path writes
the file directly (`L-069-1`), and "it happens to be a literal right now"
is not a guarantee. Each now spells the token from the shared
`STEP_STATUS_COMPLETE` constant and passes it through
`require_step_status`, so a future edit that parameterises the status
fails closed instead of quietly widening the vocabulary. A structural AST
scan over every production module enforces the same rule for a writer
nobody has written yet.

**Two doc files outside the spec's Touches list were updated, and why it
is not scope creep.** `docs/repository-reference.md` described
`session_log.py` as a *"legacy compatibility helper for older scripts"* —
which was tolerable prose while the module accepted anything, and is
actively wrong now that it is the strict writer and the home of the
vocabulary (`L-064-8`). `docs/ai-led-session-workflow.md` is where an
orchestrator learns to call `log_step`; a doc that shows the call without
naming the closed vocabulary guarantees the next session discovers the
constraint by crashing mid-flight. Both are one-paragraph corrections to
the surfaces that would otherwise teach the retired contract.

**Readers were not touched**, per standing decision 1, and one falsifier
asserts it: `session_checklist.STATUS_BOXES` still renders `done` as
`[x]`, still renders `completed` as `[?]`, and still refuses to crash on a
1,000-character prose status. History stays readable.

**What Session 2 inherits:**

1. **The strict writer does not fix the ~281 entries already on disk** —
   it only stops new ones. Session 2's ruling is still live and the
   inventory command is still owed. Note that the drift is concentrated:
   `completed` appears in 18 sets, `done` in 5, and eight of the nine
   prose blobs are in Set 110 alone (the ninth, 111 characters, is in
   Set 068).
2. **Absence is deliberately still allowed through `append_entry`.** A
   status-less bookkeeping entry is accepted, because "no status
   recorded" is a different defect from "a status no reader can name",
   and Session 3 owns it explicitly (`unknown` / `stale` /
   `unreadable`). Four such entries exist on disk, all in Set 028. If
   Session 3 wants absence refused at the writer too, that is a
   vocabulary decision to make on purpose, not a gap to patch quietly.
3. **The plan seeder swallows `ValueError`.** `session_checklist`'s
   `seed_plan_steps` wraps its `append_entry` loop in
   `except (OSError, ValueError, KeyError, TypeError, ImportError):
   return []`, and `InvalidStepStatusError` is a `ValueError`. The
   status it writes is a module constant that the vocabulary test locks,
   so there is no runtime path to a silent failure today — but a future
   change that makes the seeded status dynamic would fail open. Named
   here so it is a decision, not an oversight.
4. **Near-miss spellings are refused, not normalised.** `"Complete"` and
   `" complete"` raise, and the message names the token they meant. If
   Session 2's ruling turns out to want a normalising writer, that
   reverses a deliberate choice made here and should be journaled as
   such.

**Test budget:** the set's irony budget is 40 new test functions across
all three sessions. This session shipped **19** (50 parametrised cases) in
one module, `ai_router/tests/test_step_status_vocabulary.py`, leaving 21
for Sessions 2 and 3.

---

## Session 2 — What to do about the history already on disk

**Orchestrator:** `copilot` / `anthropic` / `claude-opus-5`, effort `high`
(Copilot CLI transport — this seat carries no provider API keys by design,
and their absence is not an error).

**Verification:** routed to `gpt-5.5` across all three rounds, as the
cross-provider rule requires (anthropic excluded by model-registry
lookup).

**The spec asked whether the inventory would contradict it. It did not —
and saying so precisely is the answer.** The command measures 109
activity logs, 2,805 entries, 286 drifted (10.2%) across 24 files, split
271 lossless and 15 loaded. That is the spec's *amended* table exactly.
The spec has been wrong here once, and S1 already corrected it (the
pre-amendment "roughly a hundred session-set directories" against a real
24), so the remaining question was whether the amendment itself held. It
does. What the original one-off query missed was not a count but two
facts about its own reach: a **110th** activity log exists outside
`docs/session-sets` — the pinned UAT fixture, with 2 further `completed`
— and the logs are not uniformly formatted.

**The formatting fact changed the implementation, not just a comment.**
108 of 109 logs are CRLF, 39 carry a trailing newline and 69 do not, and
Set 028's was written `ensure_ascii=False` so it holds a literal `→` that
a default `json.dump` would escape. The obvious migration —
parse, mutate, dump — would therefore have rewritten bytes in files it
was asked not to touch, and would have made the ruling's own acceptance
condition ("the 15 loaded entries are byte-identical") impossible to
evaluate, because everything would have moved. The migrator locates each
`"status"` member as a **raw-text span** instead, cross-checks those
spans against what the JSON parser sees, and rewrites only the ruled
ones.

**The premise was falsified on three signals, and the negative result is
worth what the net was.** Owning-session-never-completed: 0 hits.
Same-step-re-logged-non-terminal: 0 hits. Description-asserts-
non-completion: 1 hit. The description signal first ran word-level
(`failed` / `failure` / `blocked` / `deferred`) and produced **38** hits;
all 38 were read in full and every one was incidental text — `0 failed`
inside a suite count, `test_failure_injection.py` inside a file list,
`deferred to Set 062` as a scope note. Narrowing to phrase-level left one
real hit: Set 061 S4 `deferral-close`, where *"cut short"* describes the
**set** (the operator moved Set 061's UAT and 0.30.0 release into Set
062) while the step's own job — record the deferral, write
`change-log.md` — was done, and the session closed complete with a
VERIFIED verdict. That reading is recorded in-module as an adjudication,
so `--check-premise` exits 0 today and still exits 2 the day a new
counter-example appears. A check that stays permanently red is a check
nobody reads.

**Both verification findings were the same defect class, and both were
right: intent documented, not enforced.** Round 1 (spec-conformance)
found `--check-premise` and `--migrate` were independent CLI branches —
so a consumer repo, *invited by my own changelog entry*, could run
`--migrate --in-place` on history that had never been through the check.
Round 2 (supplementary) found the identical shape one layer over: I
journaled the UAT-fixture exclusion and wrote "deliberately out of scope"
in the docstring, then implemented it as **nothing at all** — it held
only because the *default* scan root avoided it, and `--scan` is a
supported flag. I had encoded both rules as my own discipline and then
shipped them as promises. The fixes make them behaviour: the premise
check is an enforced precondition at both entry points with no `--force`
(the way past a flag is to read it and record the reading), and
`EXCLUDED_PATH_SEGMENTS` matches on path segments so `--scan .` cannot
reach a fixture tree. Round 3 remediation-review: VERIFIED, 2
fix-accepted, 0 findings.

**The result was checked independently of the tool that produced it.**
Beyond the migrator's own two internal assertions, `git diff` across the
21 migrated files is exactly 271 removed `"status"` lines and 271 added
and nothing else; re-running `--in-place` changes 0 files; and the
post-migration inventory reports drift down from 286 (10.2%) to exactly
the 15 preserved entries (0.5%).

**What Session 3 inherits:**

1. **The 15 preserved entries are S3's headline test case** — 4 absent
   statuses (Set 028), 8 prose blobs (Set 110) and 1 JSON array (Set
   068), 1 `skipped` (Set 009), 1 `complete-with-known-failures` (Set
   014). They were preserved precisely so S3's explicit `unknown` /
   `stale` / `unreadable` states have something true to render.
2. **The absent-status four are the open decision S1 named.** Whether
   absence should be refused at the writer is still a decision to make
   on purpose, and these four are the concrete case.
3. **Any remaining `[?]` in a rendered ledger is now a TRUE signal.**
   With the mechanical drift gone, the parity proof measures something
   real rather than noise.
4. **Test budget: 7 remaining.** The cap is 40 across the set; S1 spent
   19 and S2 spent 14 (17 cases). S3 has four progress keys, so the
   coverage has to be chosen rather than accumulated.

**Test budget:** **14** test functions / 17 cases in
`ai_router/tests/test_step_status_drift.py`. Both verification findings
are planted rather than merely fixed, both directions of the raw scan
are planted as a look-alike pair, and two mutation checks confirm the
suite falsifies: a `json.dump` re-serialize fails 5 cases, and widening
the ruled scope to swallow `skipped` and `complete-with-known-failures`
fails 6.

---

## Session 3 — Compute the projection once

**Orchestrator:** `copilot` / `anthropic` / `claude-opus-5`, effort `high`
(Copilot CLI transport — this seat carries no provider API keys by design,
and their absence is not an error).

**Verification:** routes to a non-anthropic effective provider, as the
cross-provider rule requires.

**The projection reuses the derivation rather than shipping a third one.**
The spec's Touches line named `ai_router/progress.py`, but that module is
the set-level `session-state.json` normalizer and knows nothing about
steps. The projection went to a new `ai_router/session_projection.py`
which calls `session_checklist.build_rows` instead of reimplementing it —
because a set whose entire premise is *"the derivation exists twice"*
answering it with a third implementation would have been the joke writing
itself. That makes "computed once" **structural**: there is no second
Python answer that could drift, and it makes the parity proof
non-tautological, since the real check is that the *serialized file*
reproduces the renderer, which is the property a later set needs before
it can delete the TypeScript half.

**Two decisions were journaled before any code was written**, both
orchestrator-authority scoping calls: where the projection lives, and how
to remove the `<- here` marker without touching `tools/`. The second was
the session's only real design tension. The operator ruled the marker out;
removing `ChecklistRow.is_here` removes a field the **shared** Python/
TypeScript parity corpus pins in all 34 of its expected rows, and
`sessionStepModel.test.ts` `deepStrictEqual`s against it. Editing the
corpus would have broken the extension suite — a `tools/` change standing
decision 3 forbids and `requiresE2E: false` does not carry. So the
corpus's `cases` stay byte-identical, the Python half compares the five
fields both implementations still produce, and the divergence is declared
in the corpus's `_readme`. Two new guards keep that honest:
`SHARED_ROW_FIELDS` is asserted against `ChecklistRow`'s own dataclass
fields, and a second test refuses a cleanup that strips `isHere` from the
corpus — because that field is now the *only* coverage the extension's
marker has.

**A fourth absence turned up that the spec did not name.** Steps 3's list
was `unknown` / `stale` / `unreadable`. Measuring found that Set 028's
four absent-`status` entries — the population Set 2 preserved and flagged
as S3's headline case — never reach any reader at all: they carry no
`sessionNumber`, so `build_rows` drops them in both languages and nothing
has ever said so. That is the same defect class the spec named, so the
projection reports `orphanEntries` as a top-level **count**. A count and
not rows, deliberately: inventing rows for entries that name no session
would put the projection at odds with the renderer it must reproduce, and
the parity proof would have been the thing that broke.

**The suite was checked for vacuity, not just for green.** Three mutations,
one per property: healing an unknown token to `complete` fails
`test_an_unnameable_token_projects_as_unknown_without_being_healed`;
disabling staleness detection fails
`test_a_touched_input_makes_the_projection_stale`; re-inserting the literal
`<- here` into `render` fails
`test_no_rendered_surface_carries_a_here_marker`. The last one matters
most: deleting a constant is invisible if something writes the string back,
so the falsifier asserts on rendered TEXT rather than on the absence of a
name.

**One pre-existing test was tightened rather than deleted.**
`test_the_guidance_files_are_never_wholly_exempt` asserted
`close_mandated_excludes(...) == []` — a proxy that held only while
`cite_lessons` was the sole declaring module, and that failed the moment a
legitimately whole-file artifact was declared. Its docstring is about the
two guidance files, so it now asserts that, which is both stricter about
what it claims and correct under the change.

**Test budget: 6 net** against the 7 the set had left (7 new functions in
`test_session_projection.py`, 2 in `test_step_row_parity.py`, minus 3
marker tests removed from `test_session_checklist.py`). Set total: 39 of
the 40-function cap.

**What the next set inherits:**

1. **The extension carve is now unblocked** and is the natural next set.
   `session-progress.json` is the one computed answer §6.5 was waiting on;
   `sessionStepModel.ts` (~1,830 lines), its 110 tests, `test_step_row_parity.py`
   and the shared corpus can all go in the same pass that teaches the
   Explorer to read the projection.
2. **`skipped` gets substantially cheaper the moment that carve lands.**
   The spec predicted this: teaching a new token was a two-language change,
   and after the carve it is a one-place change. It is still a decision, not
   an automatic consequence.
3. **The absent-`status` four are still an open writer decision.** Whether
   absence should be refused at the writer was named by S1, inherited by S2,
   and is not answered here — S3 made the four *visible* (`orphanEntries`)
   rather than deciding their fate, which is the honest split.
4. **Nothing consumes the projection yet.** It is written at close and
   checkable with `--check`; the Work Explorer still derives its own rows.
   That is standing decision 3 working as intended, not an omission.

**Verification: round 1 VERIFIED on both lenses, 0 blocking findings, 4
nits — adjudicated as follows.**

- *`_collapse_by_step_key`'s docstring still explains itself in terms of
  the removed marker* — **accepted and fixed.** A stale echo of exactly
  the class L-065-1 names; the reason for collapsing is now stated as the
  stale `[~]` box, which is the fact that survived the marker.
- *"It renders logged steps, not planned ones" contradicts the seeded-plan
  behaviour* — **accepted and fixed.** Pre-existing (Set 114 S2 added the
  forward half below it without amending the claim above it), and exactly
  L-064-8: prose that was true in the old context reads authoritative in
  the new one. The section now says it renders the ledger and only the
  ledger, which is the rule that is actually true in both halves.
- *The extension's comments still say `markHere` mirrors
  `session_checklist._mark_here`* — **accepted as a named residual, not
  fixed.** Correcting it is a `tools/` edit, which standing decision 3
  forbids in this set and `requiresE2E: false` does not carry. Owner: the
  extension carve, which deletes both the comment and the code it
  describes. The divergence is already declared in the shared corpus's
  `_readme` and in the target-state proposal, so the residual is a
  decision rather than an oversight (L-069-1).
- *"the staged diff is net +7 test functions, not +6"* — **dismissed,
  measured.** Counting `def test_*` across the staged diff per file:
  `test_session_projection.py` +7, `test_step_row_parity.py` +2,
  `test_session_checklist.py` −3, everything else ±0. Net **+6**. The
  lens most likely counted the additions and not the three marker tests
  removed from `test_session_checklist.py`.
