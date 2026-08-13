# Session 3 — remediation, round 2

Round 2 (supplementary completeness pass, `gpt-5.5`) returned one
blocking Major, distinct from round 1's two classes.

---

## The dogfood's CI lane depended on untracked local Python state

**Accepted. Fixed.**

The venv-isolation scenario asserts two things: an empty venv **cannot**
import `ai_router.modules`, and the host interpreter **can**. The second
half is what makes the first a real discrimination rather than a
statement that would be true of any interpreter — so it is load-bearing,
not decoration.

But `hostPython()` returns the repo-root `.venv` interpreter *when it
exists*, and falls back to bare `python`. On a clean GitHub Actions
runner there is no repo-root `.venv`, and the new `provisioning-dogfood`
job ran only `npm ci` — it never installed this checkout's `ai_router`
into the runner's Python. So the host-import assertion would have failed
on **every** clean CI run.

The severity is right. The job was added in this session specifically so
the dogfood would not be local-only and rot silently; a job that is red
from its first run delivers the opposite, and the lane is release-gate
evidence.

**Fix.** Two halves, deliberately:

1. **Provision the premise rather than weaken the assertion.** The
   workflow gains an `Install ai_router into the host interpreter` step
   (`pip install -e .`) before the lane runs — the same step, for the same
   reason, that the `sample-project-smoke` job already carries. The
   assertion keeps its full strength.
2. **Make the failure self-diagnosing.** The assertion now carries a
   message naming both remedies by name — the repo-root `.venv` locally,
   that CI step by title — so a future failure points at its own fix
   instead of inviting someone to delete the check.

Deliberately **not** done: relaxing the assertion to "skip when the host
lacks the router". That converts a real gate into one that passes
vacuously exactly when the environment is misconfigured, which is the
L-112-1 failure mode this session has already tripped over once (the
cold-start scenario that passed in 13s against the wrong venv).

---

## Scope note

Round 2 raised nothing against the floor, the upgrade widening, the
capability probe or the retry gate, and did not re-report round 1's
findings — the do-not-re-report instruction held.
