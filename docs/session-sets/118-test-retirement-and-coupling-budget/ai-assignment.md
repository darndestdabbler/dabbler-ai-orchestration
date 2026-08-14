# AI Assignment — Set 118

## Session 1 of 3 — Make the suite legible to itself

**Orchestrator:** GitHub Copilot CLI (`github-copilot`), Claude Opus 5
(`claude-opus-5`), effort `high`, provider `anthropic`.
**Transport:** `COPILOT_CLI` (`project-verify-type.txt`), so no provider
API keys are carried and none are required.

**Verifier:** `gpt-5.5` (openai) on every round — a different effective
provider from the orchestrator's, resolved by model-registry lookup and
enforced by the exclusion (`excluded providers: anthropic`). No
`verification_qualification` is owed.

**Rounds:** four. Discovery fan-out of 2 (lenses `spec-conformance` and
`failure-scenario`) → 2 Major, both lenses landing independently on the
*same* defect; supplementary → 1 Major; remediation-review → **both
fixes rejected** plus 2 new Major; remediation-review cycle 2 →
**VERIFIED**, 0 findings, 4 fixes accepted. Five Majors in total, all
accepted, none disputed, all fixed. No operator-authorized round was
needed.

**What the routed verification actually bought, and it was not a
rubber stamp.** Every one of the five findings was real, and every one
was in the tool's own *approximations* rather than in its arithmetic —
which is precisely the half a same-author review cannot see, because
the author already believes the approximation.

- The A1 import map read `importlib.import_module(<variable>)` as
  *imports nothing*, so `test_entry_points.py` recorded zero imports and
  `ai_router/report.py` was published **uncovered when it is not**. That
  is a false negative on the exact surface Session 3 retires against.
  The session's own conventions block had named that surface as the
  highest-consequence one in the change set; the verifier went straight
  at it and was right.
- `D4`/strong coupling was a file-level **co-occurrence** check —
  `__file__` somewhere, an enumeration token somewhere — so a file that
  built a script path from `__file__` and separately called `.iterdir()`
  on a `tmp_path` was reported as reaching into the real tree. That is
  the *same over-counting mechanism* the measurement correction was
  filed about, reproduced by the tool built to retire it.
- The first rewrite counted any argument-passing and came out
  numerically identical to `D3` — 39 files, i.e. meaningless. The second
  made `os.path.join(os.path.dirname(...))` read as an enumeration,
  which is how half the suite builds a fixture path.
- The entry-point fix returned `[]` when `tomllib` was missing, silently
  restoring the first defect on Python 3.10 — which `pyproject.toml`
  still declares as supported — with no warning anywhere. It now fails
  **closed** on a `None`-versus-`[]` distinction.

`D4` was wrong three times in three different directions and **not one
of the three was found by reading the predicate**. All four readings are
now written down, the current one is pinned by a test against a real
commit, and each narrowing ships the falsifier that broke it (L-112-1).
The generalisable shape: *a detector is worth exactly the falsifiers
planted against it* — which is the same lesson this set's spec draws
about the coupling figure it inherited, arriving one layer down.

**What the targeted run bought, separately.** The very first targeted
run refused the spec's own filename: `test_packaging_hygiene.py` asserts
every `test_*.py` under `ai_router/` lives in `ai_router/tests/`, which
is what turns the wheel's `ai_router.tests*` exclude into a *proof* that
no test module ships. `ai_router/test_inventory.py` breaks that
invariant to buy a spelling, so the module is `suite_inventory` and the
guard is untouched. The wheel was later built and inspected as
independent confirmation: `suite_inventory.py` present, zero test
modules.

## Recommendation for Session 2

**Continue with the same orchestrator** (`continue-current-trajectory`).
Session 2 rules the retirement policy and ships the `guard` marker, and
both consume this session's output directly: the guard population and
its *published limits*, the sole-cover map, and the open scope question.
Rebuilding that context is expensive; carrying it is free.

The verifier must remain a non-`anthropic` provider, as it was here.

**Three things Session 2 must not miss.**

1. **Read every `test_inventory` in the spec as `suite_inventory`.** The
   rename is journaled and stated in the module docstring, in
   `inventory-findings.md` and in `disposition.json`, but the spec
   itself still says `test_inventory` in eight places.
2. **The coupling premise is materially weaker than the spec assumed** —
   222 test functions at the spec's own commit against a spec written
   for 1,485 — which is the condition the measurement-correction note
   said would justify re-scoping the coupling half of the set. Session 1
   deliberately did **not** act on it: that is a scope decision, and it
   is handed to the operator stop Session 2 already has scheduled
   (journaled, `defer-to-existing-gate`). **Do not rule on a retirement
   policy until it is answered.**
3. **The guard heuristic is a bootstrap, not a census.** It finds guards
   that *declare* themselves and cannot see an invariant pin — the spec
   names two such files it misses, one of which
   (`test_step_row_parity.py`) is also the file the spec's own re-read
   caught *growing* while the spec sat unstarted. The marker exists to
   close that gap by declaration; a better regex will not.

**One number worth carrying.** The suite is 3,677 test functions today
against 3,513 three days ago at `ab47a3e7`. Twenty-five of that increase
is this session, spent to the exact cap of the spec's irony budget.

## One artifact left for Session 3

`changelog-fragment-draft.md` in this folder is a ready-to-file
`ai_router/changelog.d/` fragment covering Session 1, written while the
detail was fresh. It was **not** filed here on purpose:
`ai_router/changelog.d/` sits under `ai_router/`, which is in all three
suites' `covers`, so filing it would have staled three green runs for a
release artifact — and Session 2 will change `ai_router/` again anyway.
The repo files one fragment per set at the set-terminal session. Session
3 should extend this draft with Sessions 2 and 3 and move it to
`ai_router/changelog.d/0120-set-118-the-suite-as-a-query.md`.
