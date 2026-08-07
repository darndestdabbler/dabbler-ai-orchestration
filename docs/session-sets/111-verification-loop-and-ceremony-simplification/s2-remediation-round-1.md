# Session 2 — remediation round 1 (IN PROGRESS, handed off mid-flight)

> **STATUS: INCOMPLETE.** The operator ended the working window while this
> remediation was part-done. This session is **NOT closed**: verification
> stands at **ISSUES FOUND** with 8 blocking findings (5 from discovery
> round 1's two lenses, 3 from supplementary round 2), of which **2 of 6
> distinct defects are fixed**. Everything below is an honest statement of
> where the tree actually is, so the next session resumes rather than
> re-derives. Do **not** treat this file as a settlement assertion for the
> cross-round ledger until it says every finding is addressed.

## Where the session stands

| Step | State |
| :--- | :--- |
| Implementation (spec steps 2–4) | **Done** — acceptance block, harness, disposable-worktree execution, retained single review |
| Tests (spec step 5) | **Done for the original scope**, 61 passing; 3 named tests the verifier's own criteria call for are **not yet written** (see below) |
| Suite | Full run of record was clean **before** this remediation: 3,563 passed / 0 failed / 10 skipped |
| Verification | discovery (K=2, both lenses) → supplementary. **8 blocking findings, unremediated** |
| Bounds | **2 of 2 discovery passes used.** A third would be REFUSED without operator authorization. Remediation-review cycles: **0 of 2 used** |
| Close | **Not run.** `disposition.json` currently carries `verification_verdict: ISSUES_FOUND` from the round patch |

## The merged blocking findings, and what has been done

Eight findings, six distinct defects (two pairs are cross-lens duplicates).

### 1. First-run criterion edits are undetected — **PARTIALLY FIXED**

*(round 1 findings #0 and #4, `spec-conformance` + `failure-scenario` —
independent rediscovery)*

The criterion-invalidation guard compared the envelope's contract hash
only against a **previous** harness artifact, so on the first run — the
normal path — there was nothing to compare with, and an edited criterion
could auto-close an unfixed finding. The verifier is right, and the root
cause is that the **envelope is not an authoritative record**: it is a
derived artifact the orchestrator is explicitly invited to annotate.

**Done:** `acceptance_harness.raw_artifact_criteria()` re-parses the
criteria from the **immutable raw `sN-verification*.md` artifacts** (call
1 plus `-fanout-<k>` siblings) into
`{(call_index, index_within_call): contract_hash}`, in the same per-call
order `verify_session` merges them; plus `_call_key()` to map an envelope
entry onto that key, and a new `OUTCOME_CRITERION_UNBOUND`.

**Not done:** `evaluate_criterion()` / `run_harness()` are **not yet
wired** to them. The functions are correct but currently unused, so the
defect is still live. Wiring is: look the entry's key up in the raw-artifact
map; a mismatch is `criterion-changed`; a missing map (unreadable/absent
raw artifacts) is `criterion-unbound` and must **refuse to auto-close**
rather than fall back to the envelope.

### 2. Broad test-runner criteria bypass test-asset invalidation — **FIXED**

*(round 1 findings #1 and #3 — the same cross-lens rediscovery)*

`python -m pytest` names no test file yet depends on every one of them, so
`referenced_paths()` found nothing to compare and a remediator could edit
tests instead of fixing product code and still get `auto-closed`.
`python -m pytest ai_router/tests` failed the same way (a directory is not
`is_test_asset`).

**Done:** scope-based invalidation — `is_test_runner()`,
`criterion_scopes()` (path tokens name their own subtree; a bare runner
scopes to the whole repo, `""`), `changed_paths_between()` (tree-to-tree
`git diff --name-only`), and `modified_test_assets_in_scope()` with
prefix matching. Unit-tested.

**Not done:** `evaluate_criterion()` still calls the old per-path check.
Swap it for `modified_test_assets_in_scope(changed_paths_between(...),
criterion_scopes(argv))`, and write the verifier's named test
`modified_test_assets_invalidate_directory_and_implicit_runner`.

### 3. Criteria contaminate each other through a shared worktree — **NOT FIXED**

*(round 1 finding #2)*

`run_harness()` creates **one** baseline worktree and **one** fixed
worktree and reuses both for every criterion, so a criterion that writes
into its checkout mutates the tree the next criterion is judged against —
and can manufacture baseline discrimination for it. The verifier
reproduced this. The fix is fresh worktrees **per criterion** (the commit
objects can still be created once per tree). Its named test is
`per_criterion_worktree_isolation`.

### 4. `.venv/Scripts/python.exe` criteria cannot run — **FIXED**

*(round 2 finding #0)*

The disposable worktree is a checkout of a git tree and `.venv/` is
gitignored, so the interpreter spelling this repo's own docs prescribe
does not exist there: the normal criterion recorded a spawn `error`
instead of executing.

**Done:** `resolve_interpreter()` rewrites a venv or bare `python`
`argv[0]` to the harness's own interpreter (`sys.executable`), wired into
`tokenize_command()` and unit-tested.

**Residual to disclose, not yet written down:** the venv interpreter has
`ai_router` installed **editable against the main checkout**, so a
criterion that *imports the installed package* measures the main tree, not
the disposable one. Criteria must exercise the checkout **by path**. This
needs stating in the template and `docs/session-issues-schema.md` — it is
a real limit on what baseline discrimination proves.

### 5. Output evidence missing from the review block — **NOT FIXED**

*(round 2 finding #1)*

When a criterion discriminates on `expectedOutputContains` (both runs exit
0; only the substring differs), `verify_session.assemble_acceptance_block()`
renders `exit 0 -- FAILED` / `exit 0 -- PASSED`, which reads as a
contradiction and gives the reviewer nothing to audit. The harness already
records `expectedOutputContains`, `outputContainsExpected` and output
tails — the renderer just does not show them. Fix in the renderer.

### 6. "No network and no credentials" is over-claimed — **PARTIALLY FIXED**

*(round 2 finding #2)*

`verification.md` tells the verifier its criterion runs with "no network
and no credentials". Neither is enforced: `run_criterion_in()` is a plain
`subprocess.run` with normal network access, and `child_environment()`
only filters `os.environ` — on Windows a child can still read User-scope
environment variables, which is exactly where this repo stores provider
keys. This is the L-064-8 class (a claim of current behaviour that the
code does not implement) in a **security** sentence, which is the worst
place for it.

**Done:** `_REFUSED_PROGRAMS` — `tokenize_command()` now refuses shells
(`bash`, `powershell`, `pwsh`, `cmd`, …) and fetch tools (`curl`, `wget`,
`nc`, `ssh`, …) as `argv[0]`, closing the cheapest escapes. Unit-tested.

**Not done, and this is the important half:** the **wording must stop
claiming a boundary that is not enforced.** Change `verification.md` (and
the matching docs) to state what is actually true — disposable checkout,
no shell, credential-stripped *process environment*, refused shell/fetch
programs, wall-clock timeout — and to say plainly that the harness is
**not a sandbox**: it does not block the network or OS-level credential
stores. Honesty is the fix; a denylist is not containment. Changing
`verification.md` means **minting `session-verification-v5`** in
`verification_stamp.TEMPLATE_HASHES` with its new pinned hash (v4 was
minted this session for the acceptance lines).

## Resume checklist for the next session

1. Wire findings 1 and 2 into `evaluate_criterion()` / `run_harness()`.
2. Fresh worktrees per criterion (finding 3).
3. Render output evidence in `assemble_acceptance_block()` (finding 5).
4. Reword the containment claim + mint `session-verification-v5`
   (finding 6); document the editable-install residual (finding 4).
5. Write the three tests the verifier's own executable criteria name —
   `per_criterion_worktree_isolation`,
   `modified_test_assets_invalidate_directory_and_implicit_runner`,
   `first_run_criterion_edit_invalidates` — so the criteria discriminate
   and the harness can dogfood itself on this very remediation.
6. Re-run the full suite (run of record, after the last code change).
7. `python -m ai_router.acceptance_harness --round 1` **and** `--round 2`,
   then `--phase remediation-review`. **Both discovery passes are spent**;
   remediation-review has 2 cycles.
8. Rewrite this file as a genuine settlement assertion, then close.

## Note on the loop itself

Worth recording for Set 111's own purposes: the K=2 differently-framed
fan-out (Session 1's change) had **both lenses independently find the same
two defects** — the first-run edit hole and the test-runner bypass —
which is convergence rather than added coverage, the same pattern S1
recorded. The **supplementary** pass again produced the findings no
discovery lens reached (the unusable `.venv` interpreter, the missing
output evidence, the over-claimed containment), and those are the three
that most change the deliverable. That is now two sessions in a row where
the completeness-critic pass, not the fan-out, carried the round.
