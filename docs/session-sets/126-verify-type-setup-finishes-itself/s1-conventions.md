# Set 126 Session 1 — conventions for the verifier

## Delta since round 1 (round 2's actual subject)

Round 1 (phase `discovery`, fan-out 2, lenses spec-conformance and
failure-scenario) returned **VERIFIED from both calls, 0 blocking findings**.
Both raised the *same* nit independently, and it was a real one this session
had created, so it was fixed — which changed code after the verdict and
staled the stamp. The whole delta is docstrings and one test assertion:

1. **`VerifyTypeResolution.resolved`'s docstring** still opened *"True only
   when setup is finished"*. This session is precisely what makes that false:
   a project can be `resolved` and half-finished. Rewritten to say what it
   answers ("the project file answered" — the narrower question dispatch
   asks) and to point at `env_agreement` for the BOTH bar.
2. **The ASCII claim, scoped honestly.** The second nit observed that
   `describe()`'s first line echoes the project *path*, which can be
   non-ASCII on a checkout whose directory name is. True, and pre-existing.
   The guarantee this session actually ships belongs to `env_half_note()`,
   so the docstring now says so and names the path as out of scope; the
   structural falsifier asserts the *note* is ASCII and asserts the fixture
   path is ASCII by construction before its end-to-end `describe()` check.

No behavior changed between the rounds. Full pytest was run **after** this
delta: `4014 passed, 9 skipped` in 506s, recorded as the run of record.

## What this session is

**Session 1 of 2** of a remediation set. Source of record:
[`docs/planning/verify-type-env-var-setup-gap.md`](../../planning/verify-type-env-var-setup-gap.md)
— three defects diagnosed during Set 124 S2 and deliberately deferred.

`verify_type` states its own bar — *setup is finished when BOTH
`$AI_ORCHESTRATION_VERIFY_TYPE` is set and `project-verify-type.txt` exists
carrying the same value* — and ships only half of it. **This session makes the
missing half visible. It does not make it executable, and it does not enforce
it.**

## Scope actually delivered here

- `ai_router/verify_type.py`
  - Four state constants + `ENV_AGREEMENT_STATES`, and
    `VerifyTypeResolution.env_agreement` — the comparison the record never
    made, between the already-captured `env_value` and the file that decides.
    Published on `to_dict()` for `--json` consumers.
  - `env_half_note()` + a branch-1 change in `describe()`: a resolved project
    whose environment half is missing, or contradicts the file, now says so.
- `ai_router/tests/test_verify_type_resolution.py` — 8 new falsifiers
  (the spec's irony budget is exactly 8).
- `docs/planning/verify-type-resolution.md` — the canonical design doc that
  states the BOTH bar gains a paragraph naming the new reporting and the
  deliberate absence of enforcement.

## Deliberately NOT in this session — please do not grade as defects

These are **Session 2's declared scope**, named in the spec:

1. **No environment-write helper.** There is still no `--set-env`, no
   `setx`, and no registry write. Session 2 ships the OS-branching helper
   (Windows writes User scope; POSIX prints the `export` line and writes
   nothing; never Machine scope).
2. **`guided_setup_instructions()` step 2 still prints
   `set AI_ORCHESTRATION_VERIFY_TYPE=<VALUE>`, which is process-scoped on
   Windows and does not persist.** This is defect 1 in the gap note. It is
   corrected in Session 2 *after* the helper exists, because the corrected
   instruction has to name the helper — fixing the prose first would only be
   undone. The new narration in this session deliberately does **not** echo
   that instruction, so the lie is not propagated to a second surface.
3. **The extension README still says the project file is "committed".** That
   is a real pre-existing lie (it is the inverse of Set 124's ruling), and it
   is explicitly assigned to Session 2 step 4 as part of the
   instruction-surface pass.

## Two authoring decisions this session executes (already journalled)

Both are in `decisions.jsonl` with `spec.md` cited as origin. They are
**settled**; a finding that re-litigates either is out of scope.

1. The environment write will be **opt-in** (`--set-env`), not folded into
   `--set`. (The counter-argument — one command, SIMPLE is binding — is
   recorded in the journal entry.)
2. **Reporting the missing half does not change the exit code.** Exit 3 is
   consumed by callers as "guided setup required", and this repo's own seat is
   currently in exactly the half-configured state that would begin failing.
   Making the bar *enforceable* is a separate, breaking decision owned by
   whoever can survey the callers. A finding arguing that a half-configured
   project *should* exit non-zero is arguing against a settled decision, not
   reporting a defect.

## Design points a reviewer should scrutinise (they were judgement calls)

- **An invalid environment value is reported as `disagrees`, not raised.**
  `describe()` is a narration path; raising there would also break branch 1's
  contract that the environment never decides anything. `parse_verify_type`
  still raises where the value is *used* (branch 2).
- **A blank/whitespace-only variable is `missing`, not `disagrees`.** Branch 2
  already treats blank as unset (`raw_env.strip()`); classifying it as a
  contradicting *value* would make one module disagree with itself and would
  tell the operator to fix a value that is not there.
- **The comparison is case- and content-exact** (after `.strip()`). A
  lowercase `copilot_cli` is a disagreement because branch 2 would not accept
  it either.
- **`not-applicable` is a state, not a null.** On branches 2 and 3 the project
  file has not answered, so there is no pair to compare; reporting a
  disagreement there would be inventing one from a single value.
- **The environment's value is rendered through `ascii()`.** It is arbitrary
  machine state, and a non-ASCII byte would otherwise crash this print on a
  Windows `cp1252` console (L-079-1). Pinned by a falsifier that feeds it
  `"cafe\u0301 \u2014 not a verify type"` and asserts the output still
  encodes as cp1252.
- **The missing-half note names the restart caveat.** An operator who set the
  User-scope variable but is running in a terminal that predates it will
  otherwise be told, correctly but uselessly, that it is not set — the exact
  surprise recorded during Set 124 S1.

## Falsifiers, and what they pin (L-112-1)

FIRES: file-only reports HALF-FINISHED; a contradiction names **both** values
and states dispatch uses the FILE; an invalid value is a disagreement rather
than an exception.

DOES NOT FIRE: agreeing halves assert the **exact two-line output** (not
merely "no `[!]`" — a quieter nag is still a nag on every correctly configured
project); a blank variable is `missing`; branches 2 and 3 keep their `[~]` /
`[ ]` narration and `not-applicable`.

STRUCTURAL: **the exit code is identical in every agreement state** (0 for
every resolved state including the disagreeing one; 3 for both unresolved
branches), and `env_agreement` is total over `ENV_AGREEMENT_STATES`, published
on `to_dict()`, and ASCII-safe.

## Suite baseline

| selection | result |
| :--- | :--- |
| `test_verify_type_resolution.py` + `test_verify_type_is_gitignored.py` | 54 passed |

Full pytest, after the last code change (the round-1 nit fixes):
**`4014 passed, 9 skipped`** in 506s, recorded as the run of record. No
tracked failures. Set 124 S3's previous run of record was
`3976 passed, 9 skipped`.

## Release contract

Nothing is published in this session. `ai_router/CHANGELOG.md` and the
extension surfaces are **Session 2's** (the set's final session) —
deliberately batched there so one changelog entry describes the whole set.

## Severity guidance

Grade by **consequence** (probability the stated failure reaches a real user ×
impact). Low probability **or** low impact is Minor; no nameable failure
scenario is a nit. Session 2 scope, listed above, is known and owned — please
do not spend Critical/Major severity on it.
