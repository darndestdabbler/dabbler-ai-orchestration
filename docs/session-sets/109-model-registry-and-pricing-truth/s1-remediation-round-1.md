# Remediation — Set 109 Session 1, after discovery round 1

Discovery round 1 (2-way fan-out, verifier `gpt-5-6`) returned **5 blocking
findings**, which are **3 distinct issues** — the two fan-out calls
independently reported the same mismatch-flag defect (#2, #5) and the same
credential-disclosure defect (#3, #4). The supplementary completeness-critic
pass (round 2) over the same evidence returned **VERIFIED, 0 findings**, so
nothing was added to the harvest. All three were fixed in one pass, below.

---

## Finding #1 — "Verifier-only models are incorrectly classified as
identity-only and can bypass the drift gate" (Major, Correctness)

**Disposition: the mechanism is REJECTED; the substance is ACCEPTED and FIXED
through a different, real mechanism found while checking it.**

### Why the stated mechanism does not hold

The finding claims an entry with `is_enabled: false` and
`is_enabled_as_verifier: true` is "a supported and probable configuration"
that would be routed to as a verifier. It cannot be. `verification.py`'s
candidate loop applies its rules in order:

```python
if not cfg.get("is_enabled", True):
    continue                                       # rule 2
if not cfg.get("is_enabled_as_verifier", True):
    continue                                       # rule 3
```

Rule 2 runs **before** rule 3, so `is_enabled: false` removes the candidate
regardless of its verifier flag. `_why_preferred_skipped` encodes the same
precedence (`not_enabled` is diagnosed before `not_enabled_as_verifier`). The
proposed fix — `routable = is_enabled or is_enabled_as_verifier` — would have
produced a hard gate failure for an entry that can never be routed to, i.e. a
false positive in the one direction a fail-loud gate can least afford.

### The real bypass, found by checking the claim

`models.pick_model` returns a `task_type_overrides` pin **without** its
`_survives()` check whenever no provider exclusion is in play:

```python
if task_type in overrides:
    override_model = overrides[task_type]
    if (config["models"][override_model]["tier"] <= max_tier
            and _survives(override_model)):        # checks is_enabled
        return override_model
    if not exclude and config["models"][override_model]["tier"] <= max_tier:
        return override_model                      # does NOT check is_enabled
```

Proved empirically on a synthetic config during this session: with
`task_type_overrides: {session-verification: disabled-pin}` and
`disabled-pin.is_enabled: false`, `pick_model(50, 3, "session-verification",
cfg)` returns `disabled-pin`; only the exclusion path filters it out. So an
`is_enabled: false` entry **can** reach the wire, and the finding's substance
— "an entry the gate files as identity-only may in fact be routable" — stands.

`tier_assignments` names models directly for the same reason.

### The fix

`check_registry` no longer equates routability with `is_enabled`. A new
`pinned_model_names(config)` collects every alias named in
`task_type_overrides` or `tier_assignments`, and:

```python
routable = bool(entry.get("is_enabled", True)) or alias in pinned
```

Both defaults now lean the same way — toward reporting — so the gate cannot
under-report. Four tests added: a pinned `is_enabled: false` entry produces
routable drift; a tier-assigned one does; `pinned_model_names` reads both
tables; and it tolerates a config with no `routing` block.

### Deferred residual, named rather than fixed (L-069-1)

**`models.pick_model` itself still honours a pin that fails `_survives()`.**
That is a live `is_enabled` bypass in model *selection*, not in this session's
gate. Fixing it changes which model the router picks, which is outside this
session's declared Touches (`router-config.yaml`, metadata only) and squarely
inside Session 2's subject — routing transparency and whether selection
constraints are honoured on every path. It is recorded here and in
`disposition.json` so it is a decision, not an oversight. The gate now covers
the exposure it creates.

---

## Findings #2 and #5 — "The requested-versus-served mismatch flag was not
implemented" (Major, Completeness — reported by both fan-out calls)

**Disposition: ACCEPTED and FIXED.**

The session plan's step 5 says, literally: *"persist it alongside the requested
id in the metrics row; **flag any mismatch**."* Recording two comparable
strings is not flagging them, and the changelog's claim that a mismatch "is
derived at read time" was unsupported — no read-time derivation existed. The
verifier was right on both counts.

The original reasoning for not storing a boolean — that OpenAI's routine
dated-snapshot pin makes "mismatch: true" the common case — was an argument
about how to *interpret* the flag, not a reason to withhold it. It is now
recorded and the interpretation is documented beside it.

**Fix:**

- `metrics.record_call` writes `served_model_mismatch`, computed at write time
  from the two ids. **Tri-state**: `True`/`False` only when both ids are
  present, `None` when either is absent — a `false` would claim the provider
  served what was asked for, which an uncaptured id does not establish.
- `metrics.served_model_mismatches(records)` groups substitutions by
  `"<requested> -> <served>"` with counts, and
  `metrics.print_served_model_mismatches` renders them; the latter is now
  called from `print_metrics_report`, so the flag has an operator-visible
  surface rather than existing only in JSONL.
- The schema comment states how to read it: a dated-snapshot pin is routine, a
  change of model **family** is the one that changes the price, and the two ids
  beside the flag are what distinguish them.

Nine tests added: true on a substitution, false on a faithful call, null for
each of the three missing-id combinations, grouping by substitution, historical
rows absent from the report, ASCII-safe output, the nothing-mismatched line,
and silence when no row carries the columns. Proved live: `gpt-5-4-mini`
recorded `served_model_mismatch: true` with
`gpt-5.4-mini -> gpt-5.4-mini-2026-03-17`, and `gemini-flash` recorded `false`.

---

## Findings #3 and #4 — "Google enumeration can disclose the API key in error
output" (Major, Correctness/security — reported by both fan-out calls)

**Disposition: ACCEPTED and FIXED, plus its sibling site.**

Correct and serious. `fetch_google` passed `{"key": api_key}` as a query
parameter; `_get_json` calls `raise_for_status()`, whose `HTTPStatusError`
renders the full request URL; `probe_provider` interpolated that exception into
`InventoryError`; and `main()` prints it to stderr. Any routine 401 / 429 / 5xx
would put a live credential into terminal history and CI logs. The module
docstring's own claim that the endpoint carries "no API key embedded" was true
of `list_endpoint` and false of the request.

**Fix:**

- `fetch_google` sends `x-goog-api-key` as a **header**; no credential is in
  the URL on any page of the pagination loop.
- `redact_secret(text, secret)` scrubs both the literal secret value and any
  credential-shaped query parameter (`key=` / `api_key=` / `access_token=`),
  and `probe_provider` runs every `httpx.HTTPError` through it before building
  the message.
- The re-raise is now `from None`, so a chained traceback cannot leak what the
  message no longer prints.

**The sibling site, fixed in the same pass (L-069-1):**
`providers._call_google` built the identical `?key=<API_KEY>` URL and calls
`raise_for_status()` inside a retry loop whose final failure is re-raised into
operator-visible output. It is pre-existing code, not introduced by this
session, and neither fan-out call named it — but it is the same defect class,
and the lesson is explicit that a point-fix at the reported site leaves the
class alive. It now sends `x-goog-api-key` as a header too.

Five tests added: the key is sent as a header and appears nowhere in the URL;
a sentinel key never appears in the failure text for any of the three providers
(parameterised) and `__cause__` is suppressed; `redact_secret` scrubs the value
while preserving other query parameters; and it scrubs a credential-shaped
parameter even when the call site does not hold the value.

**Proved live:** `--refresh` re-probed all three providers over the new header
auth — google returned its 58 ids — and a live `query(model="gemini-flash")`
returned normally, so the completion path's header change works against the
real API and is not merely type-correct.

---

## Suite after remediation

`ai_router/tests/test_model_inventory.py` + `test_served_model_recording.py`:
**85 passed** (was 66; 19 added by this remediation). Full-suite re-run below.
