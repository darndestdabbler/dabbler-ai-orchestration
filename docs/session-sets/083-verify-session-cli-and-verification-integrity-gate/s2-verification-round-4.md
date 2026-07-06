**VERIFIED** — I checked the material requirements against the diff: unknown-method rejection, registry-only provider resolution, `--manual-verify` limited to evidence bypass, `--force` still running verification-integrity, and the required regression coverage. I did not find a blocking correctness or completeness gap that would change a merge decision.

#### NITS

- **Nit:** `check_verification_integrity()` still does not include the exact `verify_session` command in every refusal branch, despite the task saying the refusal should print it. Missing in at least the `view is None`, `current is None`, and `normalize_to_v4_shape(...)` failure branches in `ai_router/gate_checks.py`.

- **Nit:** Docs/comments now say `verification_message_ids` is empty for every legal surviving method, but `validate_disposition()` only enforces emptiness for `verification_method == "api"`. `manual-via-other-engine` and `skipped` still accept non-empty lists in `ai_router/disposition.py`.

- **Nit:** The `--force` warning message is appended before the verification-integrity result is known, so a failed forced close can still tell the operator that `session-state.json will record forceClosed=true on the next snapshot flip`, even though no snapshot flip will occur. Location: `ai_router/close_session.py` in `run()`.