# S2 desk check — the sample walk, and the tutorial's step preconditions

**What this is.** The routed step-3.5 analyst named a missing step: walk the new
tutorial before writing automation against it and before Session 3 spends
operator time on it. Adopted, with a narrowed shape.

**What this is NOT.** It is **not** Session 3's acceptance walk and must not be
read as evidence for it. S3's walk is defined by resources this machine does not
have: a clean VS Code profile, a released VSIX installed as a normal user, no
editable install of this repository on PATH, and a stopwatch. Nothing here
produces a number for the 15-minute criterion.

Set 106 declined this same recommendation on the grounds that the desk check
*is* the S4 walk, and then found fifteen defects whose dominant class was "a
step that cannot be performed from the state the previous step leaves behind" —
with both of its mechanical gates green the whole time. That is why the check is
adopted here, and why it is scoped to exactly that class.

---

## Part 1 — the sample bundle, actually run

Rendered `docs/templates/sample-project/files/` into an empty folder applying
the bundle's `dot-` rule, then walked the whole Lightweight lifecycle. Twelve
files rendered (eleven from the bundle plus `.dabbler/local-only`).

**The router was installed from PyPI, as a reader's would be** — not this
repository's editable install. Resolved version: **`dabbler-ai-router` 0.34.0**.
This matters: S1's `close_session` EOF fix is *not* in 0.34.0, and the walk
below therefore proves the first run works on the router a reader actually gets
today, not on an unpublished one.

| Step | Command | Observed |
| --- | --- | --- |
| Tests, before | `.venv\Scripts\python.exe -m unittest` | `Ran 2 tests in 0.000s` / `FAILED (errors=1)`, exit 1 |
| Register | `... -m ai_router.start_session --session-set-dir docs/session-sets/001-add-a-shout --engine claude --no-router` | exit 0, silent |
| The change | added `shout` to `hello/greeting.py` | — |
| Tests, after | `.venv\Scripts\python.exe -m unittest` | `Ran 2 tests in 0.000s` / `OK`, exit 0 |
| Program | `.venv\Scripts\python.exe main.py` | `Hello, world!` / `HELLO, WORLD!` |
| Close | `... -m ai_router.close_session --session-set-dir ... --no-router --accept-suggestions` | `close_session: succeeded`, exit 0; all six gates PASS |

Every literal `bundle.json` claims was reproduced exactly. The `expectedTestCount`,
`expectedProgramOutput` and `missingFunction` fields are all true of the real
sample, and the tutorial now quotes them under `tutorial_gate.py`'s enforcement.

**Two observations a reader will hit, both handled in the tutorial:**

1. The close prints a long `WARNING` that `external-verification.md` is missing
   and that no second AI reviewed the work. It is a **soft** gate and the close
   still succeeds — but it is the scariest text in the whole first run, and a
   reader who has not been warned will read it as failure. The tutorial names it
   in advance, and so does the sample's own `AGENTS.md`.
2. `python -m ai_router.close_session` emits a `RuntimeWarning` from `runpy`
   about the module being found in `sys.modules` before execution. Cosmetic, not
   an error, and the agent runs this command rather than the reader — recorded
   as a **Minor** for the operator rather than fixed here, since it is
   router-side and outside this session's scope.

## Part 2 — the tutorial's step preconditions

The question this part answers: **does each step's stated precondition hold given
the state the previous step actually leaves behind?**

| Step | Precondition it needs | Holds? |
| --- | --- | --- |
| 1 → 2 | A `.venv` exists in the opened folder | Yes. The command creates it at step 5 of seven, before it opens the folder at step 6. |
| 1 → 2 | The integrated terminal starts in the project folder | Yes. `vscode.openFolder` makes it the workspace root. |
| 1 → 3 | The starter line is still on the clipboard after the reader detours through a terminal | Yes — nothing in step 2 writes the clipboard. The tutorial also gives the Work Explorer row as an equivalent source, so a dismissed notification is not a dead end. |
| 3 | The agent can `git commit` on a machine with no configured identity | Yes. The command writes a **repository-local** identity (`git config --local`), never global — S1's v3 §12.3 fix. |
| 3 | `close_session`'s `working_tree_clean` gate can pass | Yes. `AGENTS.md` has the agent commit before closing, and the resume marker is not left behind. Verified: all six gates PASS. |
| 3 → 4 | The program is runnable once the tests are green | Yes, observed. |
| 4 | The Work Explorer shows the set as **Complete** | Yes — `close_session` flipped `session-state.json` to complete/closed, which is what the tree renders. |
| Failure path | Re-running the command on the same folder resumes rather than refusing it | By construction (the incomplete-sample marker) and covered by S1's forced-step-5-failure test. **Not re-executed here** — see below. |

## What this check does NOT establish

Named explicitly so it cannot be mistaken for more than it is:

- **No timing.** Nothing here measures the 15 minutes. That is S3's only real job.
- **Not a clean profile.** This machine has the extension's source tree, a
  configured git identity, a warm pip cache and a populated VS Code profile.
- **Not the released VSIX.** The command itself was read and reasoned about, not
  executed through an installed extension — the bundle was rendered by a script
  mirroring `utils/sampleProject.ts`'s documented rules. Dialog labels,
  notification text and the landing button are verified against the shipped
  string constants, not against pixels.
- **The forced install-failure path was not re-run here**; it is covered by S1's
  Layer-2 test and unchanged by this session.
- **Layer 3 was not run** (see the S1 residual — the local Playwright harness is
  unusable on this box; CI is the signal).
