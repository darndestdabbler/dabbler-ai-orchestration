# S1 remediation sidecar — close-backstop round 6

Round 6 (close backstop, gpt-5.6, $0.3897) raised **two** blocking Majors, both
accepted. They share **one root cause**, so one inserted step fixes both.

## Root cause

Part 3 turns on branch protection (stage 1). Part 4 then runs the plan and
decomposition sessions — which write real files — and immediately opens a
worktree. The tutorial never said **where those two sessions run** or **how
their output reaches `main`**. Everything downstream inherited that hole.

## R6-1 — Plan and decomposition sessions were run directly on protected `main`

**Failure:** the reader finishes the plan session and cannot push; `main` has
required a pull request since Part 3. Deterministic, on the solo path.

**Fix:** Part 4 now opens with an authoring branch
(`git switch -c authoring/greeter-lifecycle`) covering steps 1–2, and a **new
step 3** lands the plan and the generated set on `main` via
**`Dabbler: Open PR for this set`**, then returns to an up-to-date trunk. Part 4
renumbers 1–10.

## R6-2 — The `app` prerequisite never reached the implementation worktree

**Failure:** in Part 5, the reader hand-edits the new set's `spec.md` to add
`prerequisites:`, then opens a worktree. The worktree is cut from `main`, so an
uncommitted edit in the main checkout is simply absent from it — the set runs
without the dependency it was supposed to wait on.

**Fix:** the prerequisite edit now happens **before landing anything**, and the
step explicitly says to land it by the same authoring-branch + Open PR route as
Part 4 step 3, "because the prerequisite has to be on `main` before the worktree
is cut, or the worktree gets a spec without it."

## Note on round economics

Rounds 5 and 6 each surfaced fresh blocking findings from the same final tree —
the salience-limited-reviewer pattern **L-095-1** describes. These were *not*
nits, though: both rounds named deterministic reader-stoppers with concrete
failure scenarios, which is the bar the constitution sets for persisting past a
bound ("persisting requires a material Critical/Major, nothing less").

If the next close attempt produces another fresh pair of blocking findings rather
than converging, that is non-convergence rather than progress, and the session
stops to the operator with the evidence instead of grinding further rounds.
