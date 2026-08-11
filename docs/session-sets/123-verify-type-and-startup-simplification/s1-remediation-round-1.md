# Remediation — Set 123 Session 1, Round 1 (discovery, both lenses)

**Verdict: ACCEPTED, all five. Two distinct defects, each found twice.**

Round 1 fanned out two lenses over the same evidence and returned five
Major findings, which merge to **three claims** — and the supplementary
round (round 2) turned out to be the third claim's mirror image, so all
six are remediated by one coherent change to where the project file is
read and what a resolution is allowed to claim.

| # | Lens / call | Claim | Disposition |
| :--- | :--- | :--- | :--- |
| 1 | spec-conformance (1) | The environment branch reports a `transport_profile` `load_config` will not use | ACCEPTED (defect A) |
| 3 | failure-scenario (2) | Same claim, independently | ACCEPTED (duplicate of 1) |
| 2 | spec-conformance (1) | `--confirm` / `--set` write to the invocation directory, not the project root | ACCEPTED (defect B) |
| 4 | failure-scenario (2) | Same claim, with an executable criterion | ACCEPTED (duplicate of 2) |
| 5 | failure-scenario (2) | `load_config(path)` searches only from cwd, so an explicit-path load ignores the project file beside that config | ACCEPTED (defect C) |

## Defect A — a record that could disagree with dispatch

This one lands on a decision I journaled deliberately
(`decisions.jsonl`: the environment variable feeds the confirm-once
branch and never the derivation), and the verifier did **not** overturn
the decision — it found that I had implemented it *incompletely*. The
decision keeps an unconfirmed machine default out of dispatch; the
`VerifyTypeResolution` record then went on to advertise
`transport_profile = "copilot-cli"` for exactly that unconfirmed value.
So the session shipped the split-brain it exists to remove, one layer up:
`resolve_verify_type()` said one thing, `load_config()` did another.

The verifier's acceptance criterion offered both exits — derive from the
environment branch, or stop calling it resolved. **Taking the second one
keeps the journaled decision and closes the hole**, and it is the more
honest surface either way:

- `transport_profile` is now the profile **dispatch will use**, so it is
  `None` until the answer is committed.
- `suggested_transport_profile` carries the would-be value for narration.
- `committed` is the new load-bearing predicate; `resolved` means it,
  which matches the design doc's own bar ("setup is not finished until
  both are true").
- The CLI therefore exits `3` (setup required), not `0`, on an
  unconfirmed default — it *is* setup-required.

The invariant is now structural rather than promised: whenever
`transport_profile` is not `None`, a project file exists, and the same
file is what `derive_transport_profile` read.

## Defect B — a write that reported success and configured nothing

`main()` passed `Path.cwd()` straight to `write_project_verify_type`, so
`python -m ai_router.verify_type --confirm` run from `repo/a/b` wrote
`repo/a/b/project-verify-type.txt` and exited 0. Every later resolution
from anywhere else in the project still found nothing. This is worse than
failing, because the operator has been told setup succeeded.

`_resolve_write_root()` now writes to the **project root** (the first
ancestor holding a `.git` entry) unless `--project-root` declares one
explicitly, and **refuses** — naming `git init` and `--project-root` —
when there is no repository at all, rather than guessing at cwd.

## Defect C — a config loaded from outside its project

`load_config(path)` derived from cwd only, so automation that passes an
explicit path (or `AI_ROUTER_CONFIG`) while running elsewhere silently
ignored the project's committed answer. `load_config` now passes the
config file's own directory as a fallback anchor, so the project that
*owns the config* is consulted when the working directory has no answer
of its own. Ordered, one hit wins — a fallback in the same chain, not a
second mechanism.

## The falsifiers (L-112-1)

Three new/reshaped tests, each of which fails against the pre-fix tree:

- `test_the_resolver_and_the_config_can_never_disagree` walks **all three
  branches** and asserts that a claimed profile always equals
  `load_config`'s. Pre-fix, branch 2 claimed `copilot-cli` against a
  loaded `api` and the test fails there.
- `test_a_write_from_a_nested_directory_lands_at_the_project_root` drives
  the real CLI from `repo/a/b` and asserts the file lands at `repo/` and
  **not** in the nested directory.
- `test_a_config_loaded_from_outside_its_project_still_honours_it` loads
  an explicit config path from an unrelated cwd.
- `test_a_write_outside_any_repository_is_refused_not_guessed` proves the
  refusal is a refusal, not a fallback.

## Acceptance-harness result (round 1) — and why finding #4 did not close

`python -m ai_router.acceptance_harness --round 1` auto-closed **#3**
(defect B: baseline discrimination holds — the criterion fails on the
pre-fix tree and passes on the fixed one). The three judgment criteria are
never executed by design.

**#4 is reported "still failing", and the cause is the harness's
interpreter, not the fix.** The verifier's criterion runs bare `python`,
which on this seat resolves to the Windows Store shim
(`AppData\Local\Microsoft\WindowsApps\python.exe`) with no PyYAML:

```
=== bare python (what the criterion ran) ===
  File "ai_router\config.py", line 13, in <module>
    import yaml
ModuleNotFoundError: No module named 'yaml'
exit=1
=== venv python ===
PROFILE: copilot-cli
exit=0
```

So the criterion fails **on every tree**, pre-fix and fixed alike, which
is precisely why it earned no baseline discrimination and why the harness
was right to refuse the auto-close. Its sibling #3 passed on the same seat
because `verify_type.py` is stdlib-only and needs no venv — a neat
accidental control.

The claim itself **is** satisfied, proved two ways under the workspace
venv: the criterion's own script verbatim (above, exit 0, `copilot-cli`),
and `test_a_config_loaded_from_outside_its_project_still_honours_it`,
which asserts the same property inside the suite where it cannot rot.
This is the standing rule that a router CLI runs through
`.venv/Scripts/python.exe`, hitting a generated criterion that had no way
to know it.
