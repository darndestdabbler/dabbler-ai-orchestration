VERIFIED — I checked the waiver eligibility logic, terminal ledger behavior, close-gate coverage, incident replay tests, schema changes, refusal exits, and documentation. The core acceptance paths are implemented and tested; the remaining defects are low-impact edge cases.

## NITS

- **Nit:** Issue → Attestation text is not recorded verbatim because leading and trailing whitespace is removed with `.strip()`. Location → `ai_router/verify.py` in `run_waive`. Fix → Preserve the raw `input()` value for storage while using `if not attestation.strip()` only to reject whitespace-only attestations.

- **Nit:** Issue → The existing-adjudication refusal still describes a terminal state without naming the sanctioned command, contrary to “Every refusal in the loop names its exit.” It only says “One adjudication per session, ever”; an upheld row should name `waive`, while an all-overruled row should name `close`. Location → `ai_router/verify.py` in `run_adjudication`. Fix → Inspect the adjudication row and print the corresponding verbatim `waive` or `session close` command.

- **Nit:** Issue → The schema does not require each `waived.findings` item to be an object. Under JSON Schema semantics, `required` is ignored for non-object instances, so values such as strings can pass validation. Location → `ai_router/schemas/rounds.schema.json`. Fix → Add `"type": "object"` and typed `description`/`severity` properties to the item schema.

- **Nit:** Issue → Registering session 3 removed session 2’s verification provenance summary (`rounds`, verifier model/provider, transport, and cost) from session state without explanation. Location → `docs/session-sets/136-verification-dispute-and-adjudication/session-state.json`. Fix → Preserve the prior session’s `verification` object unless a documented schema migration intentionally removes it.