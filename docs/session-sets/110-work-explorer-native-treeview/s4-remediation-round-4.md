# Session 4 — remediation of the close backstop's round 4

> **Round 4 was the close backstop's own in-process verification** (Set 084):
> `gpt-5.5`, anthropic excluded, diff base `aec367e2`. It returned
> **ISSUES_FOUND** with one blocking Major and **refused the close**. Raw
> artifact: `s4-verification-round-4.md`.
>
> Accepted in full. This is the second set running where the backstop caught
> something the three preceding rounds did not.

---

## The finding

> **The tracked, packaged router config was left in a seat-local `copilot-cli`
> transport profile.** *Severity: Major. Category: Correctness.*

**Correct, and it is a defect aimed at people who are not in this room.**
`ai_router/router-config.yaml` is package data — `pyproject.toml` lists it
explicitly under `[tool.setuptools.package-data]` — so it ships inside the
`dabbler-ai-router` wheel. Session 4 registered at step 1 by setting
`transport.profile: copilot-cli`, which is the correct profile *for this
machine* and the wrong value for *the artifact*.

The consequence chain the verifier laid out is real and was confirmed in the
source:

- `config.py` **skips provider API-key validation entirely** under
  `copilot-cli` — that profile's whole point is a seat with no keys.
- `_validate_transport` then requires a `transports.copilot-cli` block, and
  `ai_router.__init__` requires the catalog at `ai_router/copilot-catalog.lock`.
- `.gitignore` ignores that lockfile **on purpose** — it is probed per seat and
  must never be shared as project truth.

So a fresh clone or wheel install with provider API keys and no Copilot seat
would have had its keys silently unvalidated and then failed on a lockfile that
does not exist and cannot exist for them. The router would be unusable for the
normal case, out of the box.

## Why it happened, which is the part worth fixing

Not carelessness — **there was nowhere else to put it.** The transport profile
is a per-*seat* fact, but the only file that could express it was the shared,
packaged one. `_LOCAL_OVERRIDE_ALLOWED` did not include `transport.profile`,
and there is no environment-variable escape hatch. `docs/clone-setup.md` even
instructed the operator to "set `transport.profile: copilot-cli` only as an
intentional project configuration change" — i.e. the documentation pointed at
the tracked file, because that was the only option.

Reverting alone would therefore have re-created the pressure that produced the
bug, and on this machine it would also have been unworkable: **there are no
provider API keys here at all** (all three `DABBLER_*_API_KEY` variables are
unset in the Windows user environment), so `api` cannot route.

The verifier's own remediation named both options — "keep the tracked config on
`api`, **or** add a supported local override path". Both were taken, because
one is the fix and the other is the cause.

## The fix

1. **`ai_router/router-config.yaml` back to `profile: api`**, with a comment
   saying why it must stay there and where the seat choice goes instead. The
   Set 110–112 policy edits in the same file (`outsourcing_mode:
   verification-only` and the one-entry `delegation.always_route_task_types`)
   are legitimate shared policy and are **kept** — the finding was scoped to
   the transport profile and so is this fix.
2. **`transport.profile` is now a supported `local-overrides.yaml` key**
   (`config.py`). Merged in the existing pre-validation position, so selecting
   `copilot-cli` locally still has to satisfy the `transports.copilot-cli`
   block check — a local override buys a different default, not a way around
   validation. Only `profile` is permitted; any other `transport.*` key raises
   the same Appendix B error as every other disallowed path.
3. **`ai_router/local-overrides.yaml`** (gitignored) now carries this machine's
   `copilot-cli` selection, so the seat keeps working with nothing seat-shaped
   in shared data.
4. **`docs/clone-setup.md`** — the instruction that caused this is rewritten to
   point at `local-overrides.yaml`, with an explicit "do not put it in
   `router-config.yaml`" and the reason.
5. **`ai_router/CHANGELOG.md`** — the new override is a public behaviour change
   in a PyPI-released package, so it is recorded under Unreleased, and the
   heading now includes Set 110.

### Three tests, one of which is the regression itself

Appended to `ai_router/tests/test_local_overrides_merge.py`:

| test | what it pins |
| --- | --- |
| `test_local_transport_profile_overrides_shared` | A seat can select `copilot-cli` locally with **no API key set**, which only works if the merge precedes validation. |
| `test_local_transport_unknown_key_is_rejected` | The allow-list is a *key*, not a whole section — `transport.some_other_knob` raises. |
| `test_shipped_router_config_is_on_the_api_profile` | The tracked, packaged file must read `api`. This is the defect, as a gate. |

Falsified rather than assumed: seeding `profile: copilot-cli` back into the
tracked file makes the third test fail with `- api / + copilot-cli`, and the
file restores clean afterwards.

`package-data` needs no change — it names `router-config.yaml` literally rather
than globbing, so `local-overrides.yaml` can never be packaged.

---

## Something the defect was hiding

Running the full router suite after the revert surfaced **16 failures out of
3,462** (3,446 passed, 10 skipped, 30 minutes). None of them is caused by this
change, and the measurement that settles it is direct: with
`ai_router/local-overrides.yaml` moved aside and provider keys present — i.e.
**the configuration the wheel actually ships** — the five worst-affected files
run **372 passed / 3 skipped / 0 failed**.

The failures are an artifact of running the suite *on a keyless Copilot seat*:

- `test_drift_guard.py` asserts on a drift detail, but
  `check_model_registry_matches_providers` degrades to "the model-inventory
  check could not run" when provider keys are absent. This machine has none.
- The routing/verifier families (`test_pull_verifier.py`,
  `test_routing_exclusion_integrity.py`, `test_orchestrator_identity.py`,
  `test_disposition.py`, …) monkeypatch `ai_router.call_model` — the **API**
  dispatch seam — and then assert something was dispatched. Under a
  `copilot-cli` profile the call never reaches that seam, so nothing is
  captured.

This was equally true before the fix, when the *tracked* config said
`copilot-cli`; the change relocated where the seat profile is declared, not
whether it applies. What is new is only that it is now visible, because the
wrong shared value had been masking the keyless drift-guard case by skipping the
key check outright.

**Recorded, not fixed here.** The router's own suite is not seat-aware, and
making it so is a change to the verification machinery in the middle of a set
that is using that machinery to verify itself — the exact taint Session 3's
operator note warns about. It goes to Step 9 with a concrete shape: tests that
patch the API dispatch seam should either pin `transport.profile: api` in their
own fixture config or skip under a seat profile, and the drift guard's keyless
degradation should be a skip or a declared precondition rather than a passing
assertion about a different string.

---

## Suite state

| gate | result |
| --- | --- |
| `test_local_overrides_merge.py` + `test_transport_profile_config.py` | **17 passed** (14 + the 3 new) |
| affected router files, **shipped `api` profile with keys** | **372 passed / 3 skipped / 0 failed** |
| `ai_router/tests` full, **on this keyless Copilot-seat machine** | 3,446 passed / 16 failed / 10 skipped — all 16 are the seat/keyless artifact above |
| extension Layer 2 / Layer 3 / VSIX | **unchanged** — this round touched no TypeScript and no packaged extension asset, so the staged `0.49.0` artifact and its 33/33 run of record still stand |
