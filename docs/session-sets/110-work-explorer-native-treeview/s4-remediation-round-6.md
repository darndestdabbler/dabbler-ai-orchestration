# Session 4 — remediation of verification round 6

> **Round 6** returned **ISSUES_FOUND** with two blocking Majors. Raw artifact:
> `s4-verification-round-6.md`; findings: `s4-issues-round-6.json`.
>
> Both accepted. Both are downstream of the same root cause rounds 4 and 5
> chased — a per-seat setting escaping into shared, committed state — which is
> why the loop kept finding another surface it had reached.

---

## Issue 1 — the staged VSIX was stale and still shipped the round-5 defect

*Severity: Major. Category: Completeness.*

**Correct, and independently reconfirmed before fixing.** Round 5 fixed the
extension-side seat setup in TypeScript and rebuilt `dist/`, but the `0.49.0`
VSIX on disk had been packaged before that. Measured:

```
disk   sha256: 03bbab692dce24f7  1238155 bytes
packed sha256: e26e502350db5db1  1237082 bytes
STALE -- VSIX does not match the built bundle
round-5 defect string in packed bundle: True
round-5 defect string in disk bundle:   False
```

So the artifact an operator would have published still wrote
`transport.profile: copilot-cli` into shared `ai_router/router-config.yaml`.
The source was fixed; the shipping thing was not.

### The part that matters more than the rebuild

**`verify_vsix_claims.py` reported `ALL CLAIMS VERIFIED` on that stale
archive** — because every check it makes reads the *archive*. A verifier that
only inspects the artifact cannot notice that the artifact is not the build. It
was internally consistent and completely wrong, which is the same failure shape
as round 2 (where this script asserted the bug as its expectation), reached from
a different direction.

So the fix is not "rebuild the VSIX". The fix is a fifteenth check:

```
PASS  the packaged bundle IS the current build (not a stale archive)
      [packaged bundle matches dist/extension.js]
```

Falsified by construction: run against the stale artifact it reported
**`STALE: packaged 1237082 bytes vs built 1238155 bytes -- rebuild the VSIX`**
and exited 1, while the other fourteen checks stayed green — which is precisely
the situation that shipped.

Rebuilt, then re-verified on the packaged archive:

| probe | result |
| --- | --- |
| round-5 defect: `written to ai_router/router-config.yaml` | **ABSENT** |
| round-5 defect: `path.join(deps.projectDir, ROUTER_CONFIG_REL)` | **ABSENT** |
| round-5 fix: `local-overrides.yaml` target | FOUND |
| round-6 fix: `ensureLocalOverridesIgnored` | FOUND |

`ALL ARTIFACT CLAIMS VERIFIED (15/15)`.

---

## Issue 2 — the local override was never actually protected from being committed

*Severity: Major. Category: Correctness.*

**Correct.** Round 4's whole remediation rests on
`ai_router/local-overrides.yaml` being per-machine and ignored. The
config-editor UI states it outright — the file "is in your `.gitignore`", values
there "never get pushed". But:

- `performCopilotSeatSetup` **creates** that file, and wrote no ignore rule;
- `renderConsumerBootstrap` emits no `.gitignore` at all (confirmed: the
  `consumer-bootstrap` template bundle has eighteen files and none of them is an
  ignore file, unlike `sample-project`, which ships `dot-gitignore`).

So in a scaffolded consumer repo the file appears untracked, `git check-ignore`
exits 1, and a routine `git add -A` commits this machine's Copilot seat profile.
A teammate with provider API keys then skips key validation and fails on the
deliberately-untracked catalog lockfile — **round 4's failure, re-entered
through the file that was supposed to prevent it.**

### The fix, and why it goes in the seat setup rather than the template

The template was the *evidence*, not the best repair point. A `.gitignore` in
the consumer bootstrap only helps repos created by the scaffold; the seat setup
runs in any workspace. Putting the guarantee at the moment of creation covers
both, and cannot be skipped by a repo that predates the template.

`ensureLocalOverridesIgnored(ops, projectDir)`:

- reads the repo-root `.gitignore` (absent is fine — it creates one);
- returns early if a rule already covers the file, leaving it **byte-identical**;
- otherwise appends the rule with a comment explaining why;
- never throws — a failure is returned and surfaced.

**Ordering is the invariant, not a detail.** The rule is written *before* the
file, so there is no window in which the file exists un-ignored; that window is
exactly how a `git add -A` would catch it. A dedicated test asserts the write
order rather than merely the end state.

Coverage matching is deliberately **conservative**: it recognises the five
literal patterns that unambiguously cover the file and treats everything else,
including `!`-negations and `ai_router/`, as not covering. A false negative
costs one duplicate ignore line, which git tolerates. A false positive would
leave the file committable while the UI promises otherwise — the exact defect.

And when the rule genuinely cannot be written, the setup still succeeds (the
seat is configured) but the success notice is downgraded to a **warning** naming
the rule to add by hand. The promise is either kept or withdrawn; it is never
repeated while false.

### Tests — nine, and falsified

Six unit tests on the helper (each covering pattern; each near-miss including
`!`-negation and `ai_router/`; creates when absent; appends without destroying;
idempotent no-write; reports instead of throwing) and three integration tests on
`performCopilotSeatSetup` (a repo with no `.gitignore` gets one that really
covers the file; the ignore is written **before** the file; an already-correct
ignore is neither rewritten nor warned about).

Falsified by seeding the pre-fix behaviour — replacing the
`ensureLocalOverridesIgnored` call with a no-op success:

```
102 passing, 2 failing
  AssertionError: .gitignore should have been created
```

Restored: 104 passing.

---

## Suite state at close

Run in this order, after the last code change:

| gate | result |
| --- | --- |
| typecheck (`tsc --noEmit -p .`) | clean |
| Layer 2 (`npm run test:unit`) | **1883 passing / 1 pending** (1874 + 9 new) |
| **Layer 3 full, on the final tree** | **33 passed / 0 failed (7.9m)** |
| VSIX claims, on the rebuilt artifact | **15 / 15 PASS** (63 files, 1.42 MB) |

The `< 1,000 ms` startup gate remains missed (this run: 2,943 / 3,156 / 4,237 ms
view-open→first-row at 10 / 100 / 500 sets) and remains an explicitly deferred
residual rather than a waiver.
