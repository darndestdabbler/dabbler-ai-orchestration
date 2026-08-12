# Change log — Set 126: verify-type setup finishes itself

**Set:** `126-verify-type-setup-finishes-itself` (2 sessions, both VERIFIED)
**Source of record:** [`docs/planning/verify-type-env-var-setup-gap.md`](../../planning/verify-type-env-var-setup-gap.md)
— now moved from *diagnosed, not fixed* to **fixed**.

---

## What was wrong

`verify_type` stated its own bar — *setup is finished when BOTH
`$AI_ORCHESTRATION_VERIFY_TYPE` is set and `project-verify-type.txt` exists
carrying the same value* — and shipped half of it. One half was a command.
The other half was a sentence, and nothing checked whether the sentence had
been obeyed. Three defects, diagnosed during Set 124 S2 and deferred so a
pytest run of record and a verification stamp were not invalidated
mid-session:

1. **The printed instruction did not persist.** Step 2 printed `set
   AI_ORCHESTRATION_VERIFY_TYPE=<VALUE>`. Copy-pasted — which is what a setup
   instruction invites — `set` is process-scoped on Windows: it works in that
   terminal and is gone tomorrow.
2. **Nothing reported a missing or disagreeing environment half.** Branch 1
   captured `env_value` from the day it was written and never compared it, so
   a project with no environment half and one whose environment half
   *contradicted* the file both printed the same confident `[x]`.
3. **The remaining work was manual, with no shipped helper.**

## Session 1 — Setup reports its own second half

`VerifyTypeResolution.env_agreement` is the comparison the record never made:
`agrees` / `missing` / `disagrees`, plus `not-applicable` on branches 2 and 3,
where the project file has not answered and a disagreement would have to be
invented from a single value. Published on `to_dict()` for `--json` consumers
and reported by `describe()` — a disagreement naming **both** values and
stating that dispatch uses the file, because an operator who cannot see which
side won cannot tell whether to fix the file or the environment.

Narration only, by authoring decision: the file still wins silently,
`resolved` still means "the project file answered", and **no exit code
moved** — pinned explicitly, because exit-code drift was the one way a
display change could break a caller. 8 falsifiers (the session's whole irony
budget), both directions.

## Session 2 — One command finishes setup, and the instructions stop lying

**`python -m ai_router.verify_type --set-env`.** It derives the value from
`project-verify-type.txt` — never asking again, which is what makes drift
*impossible* rather than merely *reported* — and branches by OS, because what
a helper can honestly do differs by platform:

- **Windows:** persists at **USER** scope through the registry API under
  `HKEY_CURRENT_USER\Environment`, preferred over `setx` (which truncates past
  1024 characters and cannot tell the calling process). The value is also
  published into the running process, so the command's own next line of
  narration does not report the half it just finished as missing. A
  best-effort `WM_SETTINGCHANGE` broadcast notifies running programs; a
  failure there is a **named** warning, never a failed setup.
- **POSIX:** writes **nothing at all** and prints the exact `export` line.
  There is no OS-level user environment on Unix, so a helper that exited 0
  having persisted nothing would be defect 1 wearing a success message.

**Machine scope is refused, not merely unused** — a Copilot seat is licensed
per GitHub identity, not per box. The writer raises on any scope but `user`
**before** `winreg` is imported, which is what makes that guarantee provable
on the ubuntu and macOS runners the CI matrix already pays for. 12 falsifiers
(the session's whole irony budget), including a byte-identical-tree assertion
for the POSIX no-write path.

**The instruction surface was re-derived, not trusted** (`L-069-1`). The spec
named four surfaces and warned that the list was not complete. It was not:

- the extension README's claim that the project file is *"committed …
  project configuration, not machine state"* — the precise inverse of Set
  124's ruling (known at authoring);
- **`docs/quick-start.md` and `docs/adoption-bootstrap.md`, both telling the
  operator to *commit* what verifies the project** (not in the list);
- and, found by cross-provider verification round 2 as a **Major**, five
  surfaces still instructing Copilot-only users to set
  `transport.profile: copilot-cli` in `ai_router/local-overrides.yaml` — a
  key Set 124 S2 retired and `config.py` now **refuses at load**, including
  the *shipped* `LIGHTWEIGHT_REMOVED_MESSAGE` that a stranded reader sees.
  That one did not merely mislead; it walked its exact target population into
  a guaranteed loader error.

All corrected in one pass, with the `spec_config` test now pinning both the
replacement and the negatives so the old wording cannot creep back.

## Verification

| round | phase | verdict |
| ---: | :--- | :--- |
| S1 1–2 | discovery ×2 | VERIFIED (2 docstring nits, one fixed in flight, two deferred to S2 with an owner) |
| S2 1 | discovery (fan-out 2) | VERIFIED, 2 nits — both fixed |
| S2 2 | discovery (fan-out 2) | ISSUES_FOUND, 1 Major — accepted and remediated |
| S2 3 | supplementary | VERIFIED, nothing new |
| S2 4 | remediation-review | VERIFIED, fix accepted |

Session 1's adjudicated-minor residual (two pre-existing docstring
imprecisions, owner named as Session 2) was cleared here.

## Runs of record

| suite | result |
| :--- | :--- |
| pytest (S2, after the last code change) | **4029 passed, 9 skipped** in 955s |
| Layer 2 `npm run test:unit` | 1462 passing, clean after regenerating the cold-start golden |

Layer 3 was not owed: nothing under its `covers` was touched.

## What did not change, on purpose

- **The three-branch resolution rule**, the confirm-once step, and
  `derive_transport_profile` (settled in Sets 123/124).
- **Enforcement.** A half-configured project still exits 0. Making the BOTH
  bar *enforceable* is a separate, breaking decision owned by whoever can
  survey the callers of exit 3.
- **Shell profiles.** On POSIX the helper prints; it does not edit
  `~/.bashrc`.
- **`--set`'s scope.** The environment write stays opt-in; `--set <VALUE>
  --set-env` composes for anyone who wants one command.
