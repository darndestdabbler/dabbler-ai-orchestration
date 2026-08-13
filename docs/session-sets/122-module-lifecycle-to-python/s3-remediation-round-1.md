# Session 3 — remediation, round 1

Round 1 (discovery, fan-out 2/2, `gpt-5.5`) returned four blocking Majors
that reduce to **two distinct defect classes** — each lens found the same
pair independently, which is corroboration, not double-counting.

Both were accepted. Neither was a false positive, and neither was
cosmetic: the first would have shipped the exact regression this session
exists to prevent, wearing a green tick.

---

## Findings 1 and 3 — the probe could validate an interpreter the launchers never use

**Accepted. Fixed.**

`verifyRouterCapability` probed `venvPython(outcome.venvPath)` — the venv
the *install* wrote to. The module launchers do not use that. They use
`resolvePythonInterpreter(workspaceRoot)`, whose precedence is

1. the explicit `dabblerSessionSets.pythonPath` setting,
2. the auto-detected workspace `.venv`,
3. bare `python`.

`ensureVenv` honours `pythonPath` **only when it is venv-shaped** (it
requires a `pyvenv.cfg`). So an operator who points the setting at a base
interpreter — `C:\Python311\python.exe`, an explicitly supported
configuration — gets the router installed into `<workspace>/.venv`,
probed in `<workspace>/.venv`, and reported OK, while every module
command resolves the base interpreter and fails with
`No module named ai_router.modules`.

That is precisely the failure this session exists to prevent, and the
precondition would have certified it as healthy. The spec's own wording
asked for the right thing — *"probe the same venv interpreter the launcher
will use"* — and the implementation answered for the wrong one.

**Fix.** `InstallDeps` gains an optional `launcherPython`, and
`verifyRouterCapability` probes `deps.launcherPython ?? venvPython(...)`.
Both real call sites now supply `resolvePythonInterpreter(projectDir)` —
the same call `runRouterCli` makes — so the probe and the launchers cannot
disagree by construction. When no setting overrides the workspace venv the
two resolve identically and nothing changes.

**Falsifier** (`installAiRouter.test.ts`): *"FALSIFIER: the probe follows
the LAUNCHER interpreter when it diverges from the venv"* — a launcher
interpreter that cannot import the router must make the install report
failure. It asserts both the interpreter the probe asked (`[launcher]`,
not the venv) and the resulting `ok: false`. Reverting the one-line
`deps.launcherPython ??` fixes the test back to red.

---

## Findings 2 and 4 — the dogfood asserted the gate, not the outcome

**Accepted. Fixed.**

The cold-start scenario ran `installAiRouter`, called
`ensureModulesManifest`, and asserted
`decideDefaultModuleScaffold(...) === "scaffold"`. That is a claim about a
*pure decision function*, not about what a fresh setup produces. The
spec's scenario (a) promises the default module is **present**.

The verifier's point is sharper than "incomplete coverage": this is the
one place where findings 1/3 would have shown up as a real integration
failure, and the dogfood was structured so it could not. A lane that never
invokes the Python-backed creation cannot notice that the interpreter
handed to it is wrong.

**Fix.** Both the cold-start and the failure-path scenarios now call the
REAL `scaffoldDefaultModuleAndLifecycleSets` against the interpreter the
setup provisioned, and assert the artifacts on disk:

- `ran === true`;
- the manifest declares exactly `["default"]`;
- two lifecycle set directories exist, each with a real `spec.md`;
- re-asking the gate afterwards now returns `skip-modules-declared`.

The cold-start scenario's runtime went 38s → 51s, which is the honest
signal that it is doing the work it previously only described.

---

## Not changed, and why

Nothing in either finding disputed the version floor, the `--upgrade`
widening, or the retry gate itself. Those stand as shipped, with their
mutation-check evidence unchanged.
