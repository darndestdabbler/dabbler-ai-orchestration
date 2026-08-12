# Session 2 — remediation, round 3 (remediation-review, cycle 1)

Five fix verdicts accepted, zero rejected. One **new in-hunk** Major, which
is a genuine consequence of the round-1 fix rather than a restatement of it.

---

## I-123-S2-6 — disabling a keyless provider did not remove it from selection

**Finding.** Round 1's fix disables a provider whose key is absent, and the
stderr note says such a provider is "removed from selection." It was not.
`models.pick_model()` consults each **model's** `is_enabled` and the
caller's `exclude_providers`, and never looks at `providers.<name>.enabled`
at all — so the disabling was cosmetic where it mattered most.

**The failure the verifier named is worse than the one I fixed**, and it is
in the *satisfied* case, not the degraded one: an Anthropic orchestrator
with Anthropic and Google keys but no OpenAI key has a perfectly good
cross-provider verifier available, so the precondition reports `satisfied`
and the degraded branch (which is what adds unreachable-provider
exclusions) never runs. The shipped session-verification pin is OpenAI, so
`pick_model` selects the keyless pinned model and dispatch dies on the
missing key — with a usable Google verifier sitting right there.

**Accepted without reservation.** This is a partial-key `DIRECT_API` setup,
which the round-1 fix explicitly made supportable, so the population that
hits it is the population that fix was written for.

**Fix** (`ai_router/config.py::validate_provider_api_keys`): disabling a
keyless provider now also sets `is_enabled: False` on **every model of that
provider**, which is what `pick_model` actually reads. The existing
fallback behaviour then does the rest — `TestPinnedOverrideRespectsIsEnabled`
already locks in that a disabled pin, a disabled tier assignment, and a
disabled escalation target are each skipped rather than selected.

**Verified against the verifier's own criterion** (a pinned OpenAI verifier
with no OpenAI key, Anthropic excluded as the orchestrator):

```
[dabbler] NOTE: disabled provider(s) openai (no O); dispatching with anthropic, google. ...
PASS: keyless pinned verifier is no longer selected; chose google-verifier
```

**Falsifier.** Folded into
`test_a_single_key_machine_loads_instead_of_dying` rather than added as a
new function: it is the same claim as that test's existing one ("the
degraded machine loads with the unusable providers out of the way"), and
the round-1 version simply asserted the weaker half. It now asserts the
model-level flag too — `config["models"]["gpt"]["is_enabled"] is False`
while the reachable provider's model is untouched — so the cosmetic version
of the fix fails the test.

---

## Fix verdicts from this round

All five round-1/round-2 findings accepted:

| finding | verdict |
| :--- | :--- |
| I-123-S2-1 — `_init()` died before the precondition | fix-accepted |
| I-123-S2-2 — the CLI re-imposed the lifted exclusion | fix-accepted |
| I-123-S2-3 — qualification dropped by the metrics writer | fix-accepted |
| I-123-S2-4 — degraded path unreachable end to end | fix-accepted |
| I-123-S2-5 — disposition JSON Schema rejected the field | fix-accepted |
