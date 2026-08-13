# Session 3 — remediation, round 3

Round 3 (remediation-review, `gpt-5.5`) accepted 1 fix and **rejected 2**,
raising two blocking Majors. Both rejections were correct, and the first
identifies a defect the **round-1 fix itself introduced**. It was caught
before it shipped, which is the loop working as designed.

---

## Round 3, Major 1 — the launcher interpreter was resolved too early

**Accepted. Fixed.** This is a regression I introduced in round 1.

The round-1 fix passed `launcherPython: resolvePythonInterpreter(projectDir)`
as an eagerly-evaluated **string**, computed before `installAiRouter` ran.
But that function's answer *changes during the install*:

- before it, a fresh project has no `.venv`, so it returns bare `python`;
- after it, it returns the venv that was just created.

So on the **main cold-start path** — no explicit `dabblerSessionSets.pythonPath`,
no pre-existing `.venv`, i.e. the ordinary case — setup would have installed
the router into `<workspace>/.venv` and then probed bare `python`, which on
a normal machine has no router. The probe would fail, the install would be
reported failed, and default-module creation would be skipped. That is
strictly worse than the bug round 1 set out to fix: it converts the
*typical* success case into a false failure.

**Fix.** `launcherPython: string` becomes `resolveLauncherPython: () => string`
— a thunk, invoked inside `verifyRouterCapability` **after** the install has
run. Both real call sites pass `() => resolvePythonInterpreter(projectDir)`.
Late resolution is correct in both directions:

| configuration | resolves to | correct? |
|---|---|---|
| no explicit setting, fresh project | the newly-created `.venv` | yes — that is what launchers use |
| explicit non-venv interpreter | that interpreter | yes — the divergence round 1 caught |

A resolver returning nothing usable falls back to the venv interpreter
rather than probing an empty string.

`RouterCapabilityProbe` also gained `interpreter` — the interpreter that
was actually asked. "Which interpreter answered?" is the question this
whole precondition turns on, and a probe that silently asks the wrong one
looks identical to one that asks the right one unless the answer is
carried.

**Falsifier** — *"FALSIFIER: the launcher interpreter is resolved AFTER the
venv exists, not before"*. It drives the fresh-project shape (no `.venv`),
has the resolver record whether the venv existed when it was called, and
makes only the venv interpreter able to import the router. It asserts the
resolution happened post-creation, that the probe targeted the venv, and
that the cold start reports success.

**Mutation-checked.** Neutralising the resolver
(`const resolved = undefined`) fails **both** launcher falsifiers; restored,
both pass. So neither is a test that merely always passes (L-112-1).

---

## Round 3, Major 2 — the dogfood still bypassed the production handoff

**Accepted. Fixed.**

Fair, and it is why Major 1 survived round 1: the dogfood called
`installAiRouter` **without** `launcherPython` and then scaffolded the
module through an injected `resolveInterpreter: () => venvPy`. Both
substitutions quietly routed around the exact production wiring that was
broken, so the lane was green while the real cold start would have failed.

**Fix.** The dogfood now uses the production handoff verbatim:

- `realInstall` passes `resolveLauncherPython: () => resolvePythonInterpreter(projectDir)`
  — the identical thunk `buildProjectStructureNoPrompt` and the install
  command pass, so the timing is exercised, not just the value;
- the cold-start scenario asserts `capability.interpreter === venvPy`, so a
  stale bare-`python` resolution fails the lane rather than passing it;
- `realDefaultModuleScaffold` resolves through `resolvePythonInterpreter`
  and asserts it agrees with the provisioned venv, instead of injecting a
  value production would never produce.

---

## Round 2's fix — accepted

The reviewer accepted the CI host-interpreter fix (`pip install -e .` in the
`provisioning-dogfood` job plus the self-diagnosing assertion message). No
change.

---

## Suites after this remediation

- Layer 2: **1450 passing, 2 pending, 0 failing.**
- Dogfood lane: **4 passing** (real venv, real pip, production handoff).
