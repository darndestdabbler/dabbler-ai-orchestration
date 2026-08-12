# Session 2 — remediation, round 2 (supplementary discovery)

One Major finding, accepted.

---

## I-123-S2-5 — the disposition JSON Schema rejected the field the code writes

**Finding.** `ai_router/schemas/disposition.schema.json` declares
`additionalProperties: false` and describes itself as mirroring
`ai_router/disposition.py::Disposition`. Session 2 taught the dataclass,
the serializer and the validator about `verification_qualification` but
left the schema alone, so any consumer validating a *qualified* disposition
against the shipped schema would deterministically fail — on exactly the
artifact this session exists to produce.

**Accepted.** This is `L-066-1` (a pure-Python validator and its JSON
Schema must hold parity in **both** directions) and `L-069-1` (a bug is a
bug CLASS) landing together. The round-1 pass had already caught the same
shape on the *envelope* schema and I fixed it there —
`docs/session-issues.schema.json` is also `additionalProperties: false` —
but I updated only the disposition's **prose** doc
(`docs/disposition-schema.md`) and not its **JSON Schema**. Two closed
schemas, one sibling swept and one missed.

**Fix.** `verification_qualification` added to
`ai_router/schemas/disposition.schema.json` with the same closed
`enum: ["same-provider"]` the envelope schema and the Python validator
carry, plus a description recording why the vocabulary fails closed here
while `verification_verdict`'s non-canonical tokens are warned-but-accepted:
a token nobody can interpret does this field's only job — letting a later
reader tell a corroborated verdict from an uncorroborated one — worse than
no token at all.

**Sibling sweep.** Both closed schemas that can carry the field now define
it, and the three surfaces that state its vocabulary
(`verification.VERDICT_QUALIFICATIONS`, the envelope schema enum, the
disposition schema enum) all read `same-provider` and nothing else.
`disposition.py` imports the vocabulary from `verification` rather than
re-spelling it, so the Python half cannot drift from itself.
