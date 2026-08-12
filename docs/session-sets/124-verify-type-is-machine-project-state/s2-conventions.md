# Set 124 Session 2 — conventions for the verifier

## Suite baseline

Targeted pytest across every affected surface — **194 passed**
(`test_verify_type_resolution`, `test_local_overrides_merge`,
`test_transport_profile_config`, `test_config`,
`test_copilot_routing_integration`, `test_cli_transport`,
`test_routed_calls_cannot_mutate`, `test_verify_type_is_gitignored`,
`test_qualified_verdict`). No tracked failures. The full suite runs at Step 8
after the last code change, per the repo's test-run policy — its absence here
is the policy, not an omission.

## What this session is

**Session 2 of 3.** Session 1 (closed, VERIFIED) re-scoped
`project-verify-type.txt` from Set 123's *committed project configuration* to
**gitignored machine/project state**, per the operator's 2026-08-12 ruling
(*"it isn't machine state per se, it is machine/project state"*).

That created the defect this session closes. `ai_router/local-overrides.yaml`
is per-machine and lives **inside the checkout**, so it occupies the
**identical** machine/project scope as the project file. Both answered "what
verifies this project, on THIS machine", and only one could be authoritative —
the two-mechanisms-for-one-fact class `router-config.yaml:86` names as having
bitten this repo three times. `transport.profile` is retired as a local
override.

## Scope delivered

- `transport.profile` removed from `config._LOCAL_OVERRIDE_ALLOWED`; **no**
  `transport.*` key is locally overridable now.
- A targeted refusal in `_apply_local_overrides` naming
  `python -m ai_router.verify_type --set <VALUE>`, with `<VALUE>` **derived
  from the stale profile** via `VERIFY_TYPE_BY_PROFILE`.
- Both tests that pinned the retired precedence **replaced, not deleted**,
  plus a replacement-command falsifier, a still-allowed-overrides look-alike,
  and a structural assertion.
- The claim propagated to `router-config.yaml` (two comment blocks),
  `verify_type.py`'s derivation docstring, and this seat's own
  `local-overrides.yaml`.

## Refuse vs warn — decided, journaled, and worth checking

Journaled to `decisions.jsonl` under **prefer-reversible**. All three standing
tiebreaks agreed:

- **goal-over-letter** — refusing removes the second mechanism outright rather
  than leaving it readable but inert.
- **prefer-reversible (decisive)** — the deciding case is a Copilot seat with
  **no** project file. Warn-and-ignore would silently fall its profile back to
  `api`, and `validate_provider_api_keys` would then fail on a seat that has
  no provider keys **by design** — a confusing credential error a long way
  from its cause. A refusal naming one command is reversible in seconds; a
  silent transport switch is a mis-dispatch.
- **simpler-code** — refusal reuses the existing Appendix B rejection path.

## Migration dogfooded on this machine

This seat *carried the retired key*, so the migration was run for real rather
than reasoned about:

1. Before the fix: `local-overrides.yaml` held `transport.profile: copilot-cli`.
2. After the fix, `load_config()` **refused**, and the message named
   `--set COPILOT_CLI` — derived correctly from the stale value.
3. After deleting the block, `load_config()` still resolves
   `transport.profile = copilot-cli` (now from `project-verify-type.txt`
   alone) and `copilot_preflight` still authenticates a live probe.

## Falsification evidence (L-112-1)

Mutation-tested, and **two failed mutation attempts are reported here because
they are the interesting part**:

| attempt | outcome |
| :--- | :--- |
| Mutation via PowerShell `.Replace()` with a multi-line literal | **silently did not apply** (CRLF literal vs LF file) — the "mutation that didn't mutate" trap. Re-done in Python with an `assert` that the edit landed. |
| First version of `test_a_retired_seat_local_transport_profile_is_refused` | **passed under mutation**, because the branch's second, unconditional raise also names `transport.profile`. Strengthened to pin the migration guidance itself. |
| Final: disable the targeted message | **3 failed** — both refusal tests and the message test |
| Restored | **44 passed** |

## Known-and-owned, please do not spend Critical/Major here

- **Documentation still says "committed"** in `README.md`,
  `docs/quick-start.md`, `AGENTS.md` / `CLAUDE.md` / `GEMINI.md`,
  `docs/planning/verify-type-resolution.md`, `docs/tutorials/adopt-dabbler.md`,
  the consumer-bootstrap template, and `copilotSeatSetup.ts`. That propagation
  is **Session 3's entire subject**, declared in the spec with the file list.
  The partition is deliberate.
- Set 123's verification artifacts are **read-only raw records**; their
  wording is history, not a live claim.
- `ai_router/local-overrides.yaml` is gitignored, so this seat's migration
  shows in no diff. It is described above rather than reviewable.

## Severity guidance

Grade by **consequence** (probability the stated failure reaches a real user ×
impact). Low probability **or** low impact is Minor; no nameable failure
scenario is a nit.
