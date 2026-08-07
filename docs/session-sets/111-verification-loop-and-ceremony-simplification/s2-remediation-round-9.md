# Session 2 — remediation round 1

Settlement assertion for the 8 blocking findings of discovery round 1
(K=2, both lenses) and supplementary round 2. **All 6 distinct defects
are fixed** (two finding pairs were cross-lens rediscoveries of the same
defect). Every fix carries a named test; the three tests the verifier's
own executable criteria call for exist under exactly those names, so the
harness can dogfood itself on this remediation.

> An earlier revision of this file was a mid-flight handoff note, written
> when the working window ended with the remediation part-done. It is
> superseded by this settlement assertion; the honest interim record of
> what was and was not fixed is in the git history of this path.

## The merged findings and their disposition

### 1. First-run criterion edits were undetected — FIXED

*(round 1 #0 `spec-conformance` and #4 `failure-scenario` — independent
rediscovery of one defect)*

The invalidation guard compared the envelope's contract hash only against
a **previous** harness artifact, so on the first run — the normal path —
there was nothing to compare with and an edited criterion could auto-close
an unfixed finding. The verifier is right, and it named the root cause
correctly: the envelope is **not an authoritative record**. It is a
derived artifact the orchestrator is explicitly invited to annotate (the
advisory `resolution_*` fields), so "unchanged" cannot be established by
comparing it with itself.

**Fix.** `raw_artifact_criteria()` re-parses the criteria from the
immutable raw `sN-verification*.md` artifacts (call 1 plus any
`-fanout-<k>` siblings) into `{(call, index_within_call): contract_hash}`,
in the same per-call order `verify_session` merges them; `collect_criteria()`
now carries each blocking finding's `callKey`, counted over **every**
envelope issue (the raw artifact's parsed list is not severity-filtered),
so the coordinate survives the trip. `evaluate_criterion()` compares
against that map and never against a previous run. Two new fail-closed
outcomes: a mismatch is `criterion-changed`; an unreadable raw artifact or
a finding with no criterion in it is `criterion-unbound` — the harness
refuses to auto-close on the envelope's word alone. The artifact records
`criteriaBoundToRawArtifact`.

**Tests.** `test_first_run_criterion_edit_invalidates` (the verifier's own
criterion name) asserts the edit is caught with **no prior artifact on
disk**; `test_criteria_are_unbound_without_a_raw_artifact`;
`test_edited_criterion_invalidates_the_result` and
`test_weakened_expectation_also_invalidates` now leave the raw artifact
untouched, which is the actual attack.

### 2. Broad test-runner criteria bypassed test-asset invalidation — FIXED

*(round 1 #1 and #3 — the same cross-lens rediscovery)*

`python -m pytest` names no test file yet depends on every one of them, so
`referenced_paths()` found nothing to compare and a remediator could edit
tests instead of fixing product code and still get `auto-closed`.
`python -m pytest ai_router/tests` failed the same way, a directory not
being `is_test_asset`.

**Fix.** A criterion's **scope** is now what it *runs*, not what it
*names*: `is_test_runner()` recognises the runners, `criterion_scopes()`
returns each path token's subtree (or `[""]`, the whole repo, for a runner
with no path), `changed_paths_between()` takes a tree-to-tree
`git diff --name-only`, and `modified_test_assets_in_scope()` invalidates
on prefix match. This strictly subsumes the old per-path check.

**Test.** `test_modified_test_assets_invalidate_directory_and_implicit_runner`
(the verifier's own criterion name) covers both the bare runner and the
directory-scoped one, plus unit tests for each helper.

### 3. Criteria contaminated each other through a shared worktree — FIXED

*(round 1 #2, with a working reproduction)*

`run_harness()` created one baseline and one fixed worktree and reused
both for every criterion, so a criterion that writes into its checkout
mutated the tree the next criterion was judged against — enough to
manufacture fails-before/passes-after for a finding nothing fixed.

**Fix.** `CriterionWorktrees` wraps each captured tree in a commit **once**
(`git commit-tree` is the only step needing the object database) and hands
out a **fresh pair of worktrees per criterion** via a context manager, so
cleanup stays finally-bound. `DisposableWorktree` now takes a commit
rather than a tree, which also removes a redundant commit-per-entry.

**Test.** `test_per_criterion_worktree_isolation` (the verifier's own
criterion name) reproduces the reported attack: criterion 1 deletes a
sentinel present in both clean trees, criterion 2 checks that sentinel and
must come back `not-discriminating` — vacuous, as it truly is — rather
than auto-closed.

### 4. `.venv/Scripts/python.exe` criteria could not run — FIXED

*(round 2 #0)*

The disposable worktree is a checkout of a git tree and `.venv/` is
gitignored, so the interpreter spelling this repo's own docs prescribe
does not exist there: the normal criterion recorded a spawn `error`
instead of executing, which made the session's headline path unusable on
the documented Windows form.

**Fix.** `resolve_interpreter()` rewrites a venv or bare `python` `argv[0]`
to the harness's own interpreter, wired into `tokenize_command()` and
recorded as `interpreterSubstituted` on the result so a reader can see the
criterion did not run the literal path it named.

**Residual, now disclosed rather than left to be discovered** (module
docstring, workflow doc, schema doc, and the template itself): that
interpreter has `ai_router` installed **editable against the main
checkout**, so a criterion that *imports* the installed package measures
the main tree, not the disposable one. Criteria must exercise the checkout
**by path**. This bounds what any pass proves, and saying so is the fix —
building a per-worktree virtualenv is not warranted for this.

**Tests.** `test_bare_python_is_rewritten_to_this_interpreter`,
`test_a_non_interpreter_program_is_left_alone`.

### 5. Output evidence missing from the review block — FIXED

*(round 2 #1)*

When a criterion discriminates on `expectedOutputContains` — both runs
exit 0, only the substring differs — `assemble_acceptance_block()`
rendered `exit 0 -- FAILED` / `exit 0 -- PASSED`, which reads as a
contradiction and gave the reviewer nothing to audit, while the JSON
artifact is excluded from the evidence bundle.

**Fix.** The block now names the expected substring, reports
`expected output present: true/false` per run, and includes a bounded tail
of each run's output whenever the verdict turned on output rather than
exit code.

**Found while fixing it, and worth recording:** the expectation parser
truncated a quoted substring at the first inner apostrophe, so
`output contains "VALUE = 'fixed'"` round-tripped to a *different*
contract hash and the new raw-artifact binding reported an honest
criterion as edited. The parser now matches the closing quote of whichever
style opened. This is exactly the class the binding exists to catch, and
it was caught by the binding's own tests — a fix that broke an adjacent
behaviour, which is what the retained holistic review is for.
`test_expectation_substring_may_contain_the_other_quote` pins it.

### 6. "No network and no credentials" was over-claimed — FIXED

*(round 2 #2)*

`verification.md` told the verifier its criterion runs with "no network
and no credentials". Neither was enforced: `run_criterion_in()` is a plain
`subprocess.run` with normal network access, and `child_environment()`
only filters `os.environ` — on Windows a child can still read User-scope
environment variables, which is exactly where this repo stores provider
keys. This is the L-064-8 class (a claim of current behaviour the code
does not implement) sitting in a **security** sentence.

**Fix, in both directions.**

- *Reduce the risk:* `_REFUSED_PROGRAMS` — a shell (`bash`, `powershell`,
  `pwsh`, `cmd`, …) or a fetch tool (`curl`, `wget`, `nc`, `ssh`, …) as
  `argv[0]` is refused outright, closing the cheapest escapes from the
  no-shell rule.
- *Stop over-claiming:* the template, the module docstring, the workflow
  doc and the schema doc now state what is actually true — a throwaway
  checkout, no shell, refused shell/fetch programs, a credential-stripped
  **process** environment, a timeout — and say plainly that this is
  **containment, not a sandbox**: the network is not blocked and OS-level
  credential stores remain reachable, so criteria are code to be read.

A denylist is not containment, and pretending otherwise would repeat the
finding. Changing the template minted **`session-verification-v5`** with
its new pinned hash (v4 was minted earlier this session for the acceptance
lines).

**Tests.** `test_shells_and_fetch_tools_are_refused` (6 parametrised
cases).

## Suite

`test_acceptance_harness.py` → **66 passed**. The full run of record after
the last code change is recorded in `s2-conventions.md` and
`disposition.json`.

## Remediation-review round 3 — one fix rejected, and the fix for it

The retained holistic review accepted six of the eight ledger entries
(L5 as a duplicate of L1) and **rejected L4**, correctly:

> `python -m pytest tests/test_widget.py` scopes to that file only, but
> pytest also loads `tests/conftest.py` and fixtures alongside it. The
> remediator can leave the product broken, change only the conftest, and
> the targeted test passes — so the ruler still moves.

The reviewer reproduced it (`baselinePassed: false`, `fixedPassed: true`,
`auto-closed`). This is the same defect class as findings #1/#3 — *a
criterion's scope is what it RUNS, not what it NAMES* — one level deeper
than the first fix reached: I had generalised from "the command names no
path" to "the command names a directory", and stopped before "the command
names a file whose runner loads its neighbours".

**Fix.** `modified_test_assets_in_scope()` takes a `runner` flag. For a
test-runner criterion, two further things count: the **directory
containing** a named test file (its siblings and fixtures load with it),
and any `conftest.py` / fixture asset in an **ancestor** directory, which
pytest loads implicitly to the root. `is_loader_asset()` classifies the
implicitly-loaded assets. A non-runner criterion is unchanged — it is
still judged only on what it names, so a probe over product code is not
invalidated by unrelated test edits.

**Tests.** `test_conftest_edit_invalidates_a_file_scoped_pytest_criterion`
reproduces the reviewer's scenario end to end (product left broken, only
the conftest moved → `test-asset-modified`, not `auto-closed`);
`test_a_runner_scope_covers_what_it_loads_not_just_what_it_names` and
`test_loader_asset_classification` pin the rule and its boundaries.

## Remediation-review round 4 (cycle 2 of 2) — the bound is reached

Seven of nine ledger entries accepted (L5 duplicate-of L1). **L4 rejected
again**, and again correctly, one level narrower:

> `criterion_scopes(["python","-m","pytest","./"])` returned `["."]`.
> Only `""` was treated as the whole-repo scope, so the literal `"."`
> matched nothing and an edited test could still auto-close.

**Fix.** `_normalize_scope()` — `.`, `./`, `.\`, and trailing slashes all
normalize, so a token meaning "here" at the repo root becomes the
whole-repo scope `""`. Pinned by
`test_a_root_path_token_is_the_whole_repo_scope` (three spellings) and
`test_root_scoped_runner_invalidates_on_any_test_edit` (end to end:
product left broken, only the test moved → `test-asset-modified`).

**The loop is now at its enforced bound: 2 of 2 remediation-review
cycles.** A third is refused without the operator's recorded
`--operator-authorized-round` attestation, and the orchestrator does not
hold that authority. The session therefore **stops to the operator** with
this record rather than grinding another round.

**The shape of the rejections is itself the evidence for adjudication.**
Each cycle's rejection was strictly narrower than the last, on one defect
class — *a criterion's scope is what it RUNS, not what it NAMES*:

| Cycle | Rejected because | Kind of gap |
|---|---|---|
| 1 (round 3) | `pytest tests/test_widget.py` ignored `tests/conftest.py` | design: implicit loading |
| 2 (round 4) | `pytest ./` scoped to the literal `"."` | mechanical: string normalization |

Both are now fixed, each with an end-to-end reproduction of the exact
scenario the reviewer described. The residual risk is that the class has
another spelling nobody has named yet — which is precisely what a bound
exists to stop us from chasing one round at a time.

## Close-backstop rounds 5–7 — the class removed, not patched again

The close gate's own independent corroboration rounds (`gpt-5.5`,
anthropic excluded; not `verify_session` rounds, so the enforced bound
does not apply to them) refused the close three times, each with a new
spelling of the same class:

- **Round 5:** `pytest tests/sub/test_widget.py` loads
  `tests/fixtures/sample.json` through the **ancestor** directory `tests`,
  so the asset's own directory is not itself an ancestor. *(It supplied
  an executable criterion — a `runpy` probe driving the function by path,
  exactly the by-path form the template asks for.)*
- **Round 6:** `go test ./...` — a different language, a different path
  spelling, and `*_test.go` was not even recognised as a test asset.
- **Round 7:** colocated **snapshot** files (`__snapshots__/`, `.snap`) —
  another ecosystem's way of storing a ruler beside its test.
- **Round 8:** the containment wording itself, *again* — my own corrected
  text still said "a criterion cannot damage your working tree", but the
  disposable checkout is the child's **working directory**, not a
  filesystem confinement: an absolute-path write, or a reach through the
  shared git directory, is not prevented. Corrected in every echo
  (module docstring, workflow doc, CHANGELOG, and the test's name and
  docstring) to the narrow truth — *ordinary **relative** reads and writes
  land in a throwaway checkout* — and nothing stronger. That this same
  class recurred on my own remediation of it is the sharpest possible
  argument for the L-064-8 discipline: a claim about current behaviour is
  a defect unless the code makes it true.
- **Round 9 (fixed on operator instruction, "only if Major"):** **stale
  acceptance evidence** — a NEW class, not another spelling.
  `assemble_acceptance_block()` rendered a finding as criteria-closed
  straight from `sN-acceptance-round-*.json` without checking the
  artifact's `fixedTree` was still the tree under review. Graded Major
  and fixed, because the stale condition was not hypothetical — it was
  **the actual state of this session's own artifacts** (rounds 1 and 2
  ran against trees several fixes ago), the flow that produces it
  (harness → more edits → review) is the normal one, and the consequence
  is the precise false-closure the whole session exists to prevent: a
  blocking finding accepted as settled on evidence about a tree that no
  longer exists.

  `acceptance_evidence_is_stale()` compares the recorded tree with a fresh
  snapshot and fails **closed** — an unavailable snapshot, an unusable
  recorded tree or an unreadable diff all count as stale, and a stale
  result moves out of the criteria-closed section into "judge these
  normally" with the staleness named. One subtlety made raw sha equality
  the wrong test: the harness **writes its own artifact into the session
  set** after snapshotting, so the trees always differ by at least that
  file. The comparison therefore ignores exactly the per-set loop
  bookkeeping the verification stamp's freshness binding already ignores
  (`WORK_DIFF_SET_BOOKKEEPING`), and treats any *substantive* path change
  as stale. `test_stale_acceptance_evidence_never_renders_as_closed`
  covers fresh-then-stale end to end;
  `test_unavailable_snapshot_is_treated_as_stale` covers the fail-closed
  edge.

**Six spellings, one class, across six rounds:**

| Round | Missed spelling | Kind |
|---|---|---|
| 1 discovery | `pytest` with no path at all | implicit collection |
| 3 review c1 | a targeted file vs its own `conftest.py` | implicit loading |
| 4 review c2 | `pytest ./` vs the literal `"."` | path normalization |
| 5 backstop | `tests/fixtures/` under an ancestor, not AT one | prefix vs equality |
| 6 backstop | `go test ./...`, `*_test.go` unrecognised | another language |
| 7 backstop | colocated snapshots | another convention |

Every fix was correct. Every one was followed by another spelling —
because *"what a runner collects"* and *"what counts as a test asset"* are
**both open-ended classification problems**, and no enumeration of either
will ever be complete.

**So the rule was removed rather than extended a seventh time.** A
criterion that invokes a **test runner is never attributable and never
auto-closes**, whatever the run does: its result depends on the union of
the product code and every asset it collects, and the harness can
determine neither. It is not even executed — there is nothing a run could
establish. This deleted the whole scope/ancestor/loader apparatus the
previous rounds had accreted, and it costs nothing measurable: **every
runner criterion this machinery has ever seen was invalidated anyway.**

Criteria that drive **product** code by path keep precise scoping and
remain the auto-closable path — `test_a_product_probe_still_closes` pins
that the good path survives, including while test assets churn around it.
The template (now `session-verification-v7`) tells verifiers plainly to
write that kind of criterion and not to use a test runner at all, so the
guidance now matches what the machinery can actually honour.

**The honest reading of this sequence**, and the thing worth carrying into
Session 4: what ended it was not another round but a **design change of a
different kind** — stop enumerating cases, remove the category. *A loop
that keeps finding real defects is not necessarily converging.* Five of
the six were found after the operator had already adjudicated the stop,
which is exactly what the close backstop is for; but it is also why the
backstop, unlike `verify_session`, has no bound — a fact Session 4 should
weigh deliberately rather than inherit.

## Dogfood: what the harness actually returned on these very findings

Run for real, both rounds, and recorded honestly because it is the first
live measurement of Proposal B's yield (proposal §10 Q4 — *"if
`remediation-review` is retained, how much does B actually save?"*).

**0 of 8 findings auto-closed.** Not one. The breakdown is the point:

| Round | Finding | Criterion form | Outcome |
|---|---|---|---|
| 1 | #0 first-run edit | judgment | `judgment` |
| 1 | #1 test-runner bypass | judgment | `judgment` |
| 1 | #2 worktree contamination | executable | `test-asset-modified` |
| 1 | #3 test-asset invalidation | executable | `test-asset-modified` |
| 1 | #4 first-run edit (dup) | executable | `test-asset-modified` |
| 2 | #0 `.venv` interpreter | judgment | `judgment` |
| 2 | #1 output evidence | judgment | `judgment` |
| 2 | #2 containment over-claim | judgment | `judgment` |

Both causes are the machinery behaving **correctly**, not failing:

1. **Five of eight criteria were judgment-form** — the verifier's own
   call, and the right one for "stop claiming a boundary you do not
   enforce" or "show the output evidence", neither of which a command can
   settle. Judgment criteria are never executed and never auto-close, by
   design.
2. **All three executable criteria named
   `ai_router/tests/test_acceptance_harness.py -k <a test that did not
   exist yet>`.** The remediation had to *write* those tests — so the
   remediator authored both the fix and the ruler, and the
   `test-asset-modified` guard refused the auto-close. That is precisely
   the gaming path finding #2/#3 exist to close, and it fired on its own
   author. The template already warns against this ("prefer a check over
   the product code over one that depends on a test file the fix is
   expected to add or change"); the verifier wrote them anyway.

**What this is evidence FOR, and what it is not.** It is not evidence that
B is worthless: the criteria still did real work — they made every finding
a closed question, they told the remediation exactly what "done" meant,
and three of them are now permanent regression tests under the names the
verifier chose. It *is* evidence that the **auto-close rate on a session
whose deliverable is test-shaped will be near zero**, because the honest
criterion for "you fixed the harness" is usually "a new harness test
passes", and that criterion is self-marking by construction. Sessions
whose deliverable is product-shaped — where a probe can drive an existing
public entrypoint — should fare better.

**Recorded for Session 4's ceremony pass** (which owns the
artifact-necessity and loop-shape decisions): if the auto-close rate stays
near zero across sessions, B's value is convergence and clarity rather
than round-count reduction, and the honest thing is to say so rather than
to loosen the guards that produced this result. Do **not** loosen
`test-asset-modified` to raise the number — the guard is the reason the
number is trustworthy.

## Note on the loop itself, for Set 111's own purposes

The K=2 differently-framed fan-out had **both lenses independently find
the same two defects** — the first-run edit hole and the test-runner
bypass — which is convergence rather than added coverage, the same pattern
Session 1 recorded. The **supplementary** pass again produced the findings
no discovery lens reached (the unusable `.venv` interpreter, the missing
output evidence, the over-claimed containment), and those three most
changed the deliverable. That is two sessions running where the
completeness-critic pass, not the fan-out, carried the round — evidence
Session 4's ceremony pass should weigh when it decides what the loop keeps.
