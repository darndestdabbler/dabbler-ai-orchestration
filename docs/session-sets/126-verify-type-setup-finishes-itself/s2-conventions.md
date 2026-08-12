# Set 126 Session 2 — conventions for the verifier

## Delta since round 1 (round 2's actual subject)

Round 1 (phase `discovery`, fan-out 2, lenses spec-conformance and
failure-scenario) returned **VERIFIED from both calls, 0 blocking findings**,
with two nits. Both were real and both were fixed, which changed code after
the verdict and staled that stamp. The whole delta is:

1. **`--set-env --json` on an unresolved project printed setup prose to
   stdout.** A `--json` consumer piping into a parser got prose instead of
   JSON. The refusal path no longer returns early: it writes its explanation
   to **stderr** and falls through to the normal output path, so stdout keeps
   whichever shape was asked for and the exit code is unchanged (3 —
   "guided setup required" was always both the remedy and the code). This is
   a **removal**: the special-case early return and its duplicated exit are
   gone. A falsifier now pins the JSON shape on that path.
2. **"This is one command" while showing two.** The consumer-bootstrap
   template's lead-in was left stale by the `--set-env` addition. Reworded;
   the golden fixture and `dist/templates/` were regenerated from it.

No other behavior changed. Layer 2 re-run clean after regeneration
(1462 passing); `test_verify_type_resolution.py` 62 passed.

## What this session is

**Session 2 of 2 (final)** of a remediation set. Source of record:
[`docs/planning/verify-type-env-var-setup-gap.md`](../../planning/verify-type-env-var-setup-gap.md)
— three defects diagnosed during Set 124 S2 and deferred.

Session 1 (VERIFIED, closed) made the missing half of setup **visible**.
This session makes it **executable** (defect 3) and then corrects the
instructions that described the old manual step (defect 1) — in that order,
because the corrected instruction has to name the helper.

## Scope actually delivered here

- `ai_router/verify_type.py`
  - `set_env_verify_type()` — derives the value from
    `project-verify-type.txt` (never re-asked) and branches by OS:
    **Windows** persists at USER scope via `winreg` under
    `HKEY_CURRENT_USER\Environment` and publishes the value into the
    current process; **POSIX** performs **no write at all** and returns the
    `export` line for the shell profile.
  - `write_windows_user_env()` (refuses any scope but `user`),
    `broadcast_environment_change()` (best-effort `WM_SETTINGCHANGE`),
    `current_platform()`, `EnvWriteOutcome`, `SET_ENV_COMMAND`,
    `_no_value_to_derive_message()`.
  - CLI `--set-env`; `--json` gains an `env_write` block.
  - `guided_setup_instructions()` step 2 rewritten; `env_half_note()` now
    points at the helper in both the missing and the disagreeing branch.
- `ai_router/tests/test_verify_type_resolution.py` — **12 new test
  functions** (the spec's irony budget is exactly 12).
- Instruction-surface corrections (see below) + both CHANGELOGs.

## Settled decisions — a finding that re-litigates these is out of scope

Both are journalled in `decisions.jsonl` with `spec.md` cited as origin,
taken at authoring and executed by this session:

1. **The environment write is opt-in (`--set-env`), not folded into
   `--set`.** The counter-argument (one command is simpler to explain;
   SIMPLE is binding) is recorded in the journal entry. `--set <VALUE>
   --set-env` composes, so the one-command path exists without making a
   project-scoped command reach outside the project by default.
2. **No exit code moves for a half-configured project.** Exit 3 is consumed
   as "guided setup required". `--set-env` on a project whose file has not
   answered exits **3, not 2**, because the remedy *is* guided setup and
   nothing about the request was malformed — that is a new flag's own exit
   path, not a moved one.

Also settled by the spec and **not** re-derivable here: **USER scope, never
Machine** (a Copilot seat is licensed per GitHub identity, not per box), and
**Python, not PowerShell** (`SetEnvironmentVariable(..., 'User')` is a
silent no-op on Linux/macOS — a setup helper that exits 0 having persisted
nothing is the defect it was written to fix).

## Design points a reviewer should scrutinise (they were judgement calls)

- **The Windows path also sets `os.environ[ENV_VAR]` in this process.**
  `setx` cannot do this and the gap note names that as its flaw. Without
  it, the CLI's own next narration reads a stale block and reports the half
  it just finished as missing — the command would contradict itself in its
  own output. POSIX deliberately does **not** do this: nothing was
  persisted there, so a process-local claim no shell can back would be a
  lie of exactly the kind this set removes.
- **The `WM_SETTINGCHANGE` broadcast is an addition, and it is defended.**
  A bare registry write leaves Explorer (and the editor it launched)
  handing stale environments to *newly opened* terminals, which would make
  the tool's own "restart your terminal" advice one more instruction that
  does not do what it says. It runs after the value is already persisted,
  so a failure is a **named** warning (L-079-1), never a failed setup.
- **`EnvWriteOutcome.persisted` is `False` on POSIX.** The instructions are
  the whole deliverable there; reporting success for printing a line is the
  silent no-op this design refuses.
- **An unresolved project raises rather than writing.** Writing an
  environment half no file agrees with would *manufacture* the disagreement
  Session 1 taught the tool to report.
- **Three seams (`platform=`, `writer=`, `broadcaster=`)** exist so both OS
  branches are provable on the runner that is *not* the target OS. The
  `python-tests` job already runs ubuntu + macOS + windows.

## Falsifiers, and what they pin (L-112-1)

FIRES: Windows persists the **file's** value at user scope; a contradicting
environment half is **closed**, not copied (the planted defect is an env var
that already disagrees).

DOES NOT FIRE: POSIX calls no writer, leaves the project tree
**byte-identical** and `os.environ` untouched, and returns the `export`
line; no broadcast off Windows; only the persisting path publishes into the
process; an unresolved project (branch 2 *and* branch 3) is refused with no
write.

STRUCTURAL: every scope passed across a platform × value matrix is `user`;
`WINDOWS_ENV_REGISTRY_ROOT == "HKEY_CURRENT_USER"` (on Windows the hive *is*
the scope); `write_windows_user_env` **refuses** machine/process scope
**before** `winreg` is imported — which is what makes that assertion
meaningful on ubuntu and macOS, where importing `winreg` would raise
instead. Plus ASCII/cp1252 on both platforms and the CLI exit codes.

## Instruction surface — re-derived, not trusted (L-069-1)

The spec listed four surfaces "to be re-derived and not trusted as
complete". The pass found **two more**, and both were the same defect
family as the known one:

| surface | what was wrong |
| :--- | :--- |
| `ai_router/verify_type.py` | step 2 printed `set VAR=<VALUE>` — process-scoped on Windows |
| `tools/dabbler-ai-orchestration/README.md` | file described as **committed** "project configuration, not machine state" — the inverse of Set 124 (×2 sites) |
| `docs/quick-start.md` | **"commit what verifies the project"** — *not in the authoring list* |
| `docs/adoption-bootstrap.md` | **"commit what verifies it"** — *not in the authoring list* |
| `README.md`, `docs/tutorials/adopt-dabbler.md` | correct about gitignoring, but omitted the second half entirely |
| `docs/templates/consumer-bootstrap/getting-started.md.template` | never told the operator to set the variable at all |
| `test-fixtures/cold-start/full/docs/dabbler/getting-started.md`, `dist/templates/...` | generated: golden regenerated with `UPDATE_GOLDEN=1`, `dist/` rebuilt with `npm run compile` |

## Session 1's residual, cleared here

Session 1 closed with an adjudicated-minor residual naming **Session 2** as
owner: `describe()` called itself "One ASCII-only paragraph" though its
first line echoes a project path that can be non-ASCII, and
`resolve_verify_type()` said broadly that an invalid environment value
raises, which was never true on branch 1. Both docstrings are corrected in
this session.

## Live walk on this machine (the spec's recorded cold walk)

The Windows path was dogfooded for real, not only through seams: the
`HKCU\Environment` value was blanked, `python -m ai_router.verify_type
--set-env` was run, and `reg query` confirmed
`AI_ORCHESTRATION_VERIFY_TYPE REG_SZ COPILOT_CLI` restored. Exit 0, no
broadcast warning, and the half-finished note correctly disappeared from the
same command's output.

## Suite baseline

| selection | result |
| :--- | :--- |
| `test_verify_type_resolution.py` + `test_verify_type_is_gitignored.py` + `test_drift_guard.py` | 105 passed |
| Layer 2 `npm run test:unit` (clean, after regenerating the golden) | 1462 passing, 2 pending |

Full pytest is run **after** any remediation, at close, per the test-run
policy. Set 126 S1's run of record was `4014 passed, 9 skipped`.

## Release contract

Nothing is published. `ai_router/CHANGELOG.md` gains the Set 126 entries
(S1 + S2, batched here as planned) and
`tools/dabbler-ai-orchestration/CHANGELOG.md` gains the README correction
under the existing `[Unreleased]` section. No version is bumped: the
extension's Unreleased block is explicitly held for a single next
Marketplace push, and this session does not cut it.

## By-design exclusions — please do not grade as defects

- **No enforcement.** A half-configured project still exits 0. Making the
  BOTH bar enforceable is a separate, breaking decision owned by whoever can
  survey the callers of exit 3 (authoring decision 2).
- **No shell-profile editing on POSIX.** Printing the `export` line is the
  deliberate ceiling.
- **No Layer 3 run.** Nothing under Playwright's `covers` was touched: no
  `tools/dabbler-ai-orchestration/src/`, no `package.json`, no `media/`, no
  extension `test-fixtures/`, no `session_state.py` / `start_session.py`.
  The repo-root `test-fixtures/cold-start/` golden is asserted by **Layer
  2**, which was run clean above.
- **`docs/session-sets/127-the-active-step-shows-in-progress/spec.md`** is
  an untracked, out-of-band deliverable authored during this session at the
  operator's request (it schedules a different, unrelated planning note). It
  is not part of Set 126's scope and carries no code.

## Severity guidance

Grade by **consequence** (probability the stated failure reaches a real user
× impact). Low probability **or** low impact is Minor; no nameable failure
scenario is a nit.
