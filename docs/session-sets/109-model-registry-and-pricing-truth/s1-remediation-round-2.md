# Remediation — Set 109 Session 1, after the close-backstop round 4

`close_session` refused the close. Its in-process backstop verification (round
4, verifier `gpt-5-6`, anthropic excluded, diff base `ecb2e07`) returned one
blocking Major, and it is correct.

---

## "The default drift gate knowingly passes configured model IDs absent from
provider enumeration" (Major, Correctness)

**Disposition: ACCEPTED and FIXED. The finding identifies a unilateral
specification relaxation that this session had no authority to make.**

### The finding

The session plan says, without qualification:

> Ship the drift gate: **every `model_id` in `router-config.yaml` must appear
> in its provider's enumeration. A miss fails loud and names the offending
> entry.**

The shipped gate had a carve-out. `CheckResult.ok` ignored `identity_drift`,
so an `is_enabled: false` entry whose id the provider does not offer produced
a `[~] NOTE` and **exit 0**; only the optional `--strict` flag promoted it.

The failure scenario is specific and near-certain: once **Session 4** corrects
the routable `gpt-5.6` specimen, `gemini-3-pro` is still absent from Google's
enumeration, and the documented command `python -m ai_router.model_inventory
--check` would then exit **0** on a registry that still violates the invariant
the gate exists to certify. Automation reading that exit code would be told
something untrue. As the backstop put it, `--strict` cannot be required to
enforce an invariant the default command was expressly tasked to guarantee.

### Why the original design was wrong, in this session's own terms

The reasoning for leniency was that an orchestrator's identity id — what the
Gemini Code Assist surface calls itself — need not be an id the generative API
sells, so demanding its presence is a category error. That reasoning is not
worthless; it is an argument that **identity records may belong somewhere
other than the model registry**. It is not an argument for a gate that passes
while a configured id is missing.

It is also, read plainly, a **specification change made unilaterally
mid-session** — precisely what the constitution says to surface rather than
decide ("Scope doubt → surface to the operator rather than unilaterally
expanding or cutting scope"). The earlier defence, recorded in
`s1-conventions.md`, was that reporting the miss on every run keeps it from
going quiet. That defends against *invisibility*, which was never the risk the
spec named; the risk it named is a **passing exit code**, and a note under a
zero exit is exactly the shape of the hole this whole set exists to close.

### The fix

- `CheckResult.ok` is now `not (routable_drift or identity_drift or fatal)`.
  **Every** miss fails.
- **`--strict` is removed entirely**, not inverted. Leniency was the defect, so
  there is no lenient mode left for a flag to escape from — and the repo's
  *prefer removal over addition* rule says to delete the surface rather than
  add its opposite.
- The routable / identity-only distinction **survives in the report**, where it
  tells the operator how urgent a miss is, and is gone from the exit code,
  where it told automation a falsehood. The identity-only block now reads:
  *"Nothing routes to these, so they are not urgent — but the id is still
  wrong, or the record belongs somewhere other than the model registry.
  Correct it or move it; it does not get to sit here indefinitely."*
- `router-config.yaml`'s `gemini-3-pro` note is rewritten from "that is a NOTE,
  not a failure" to an explicit item **owed to Session 4**: correct the id to
  whatever Code Assist actually reports, or move identity records out of the
  model registry. The module docstring and the changelog carry the same
  correction (L-065-1 — a consistency fix is global, not point-local).

### What this costs, and why it is still right

`--check` now exits 1 on **two** entries rather than one. That changes nothing
operationally: the gate already exited 1, it is deliberately unwired from every
automatic check, and Session 4 owns the registry correction. What it buys is
that the exit code cannot become a lie the moment S4 fixes the first entry —
and it converts `gemini-3-pro` from a note S4 could scroll past into a failure
S4 must resolve.

The session's **Ends with** is unaffected: `--check` still fails loud and still
names `gpt-5-6 / model_id='gpt-5.6'`.

---

## Tests

Three tests updated to the corrected contract, two added:

- `test_an_identity_only_miss_fails_too_but_is_classified_separately` — asserts
  `not result.ok` while the finding still lands in `identity_drift`, so the
  classification is preserved without the pass.
- `test_cli_check_exits_1_on_identity_only_drift_with_no_flag_needed` — the
  regression itself, named after it.
- `test_cli_rejects_the_retired_strict_flag` — `--strict` is gone.
- `test_render_reports_both_drift_kinds_as_failures_and_names_the_kind` —
  two `[x] DRIFT` blocks, both kinds named, and no `[ ] OK` line on a failing
  run (the report must never contradict the exit code).
- `test_render_reports_ok_only_when_nothing_drifted`.

`test_model_inventory.py` + `test_served_model_recording.py`: **87 passed**
(was 85). Full-suite re-run recorded in `disposition.json`.
