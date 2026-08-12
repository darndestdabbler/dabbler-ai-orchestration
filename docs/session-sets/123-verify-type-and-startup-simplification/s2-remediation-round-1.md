# Session 2 — remediation, round 1 (discovery fan-out)

Four Major findings, all accepted, all correct. Their common shape is the
one this session was most exposed to: **the machinery was right and
unreachable.** Every falsifier shipped before verification exercised the
units directly, so none of them touched the path a real degraded machine
takes, and a permission that cannot be exercised is indistinguishable from
one that was never built.

---

## I-123-S2-1 / I-123-S2-4a — `_init()` killed the process before the precondition could run

**Finding.** `route()` calls `_init()`, which calls
`load_config(..., require_api_keys=True)`, which raised on the *first*
enabled provider missing a key. The target machine — a `DIRECT_API`
checkout with Anthropic/Google/OpenAI enabled but only
`DABBLER_ANTHROPIC_API_KEY` present — therefore died during config load,
long before `_direct_api_precondition()` could observe anything.

**Accepted without reservation.** This is the exact machine the operator's
ruling exists to serve, and it could not start.

**Fix** (`ai_router/config.py::validate_provider_api_keys`): a keyless
provider is now **disabled, not fatal**. A provider whose key is absent
cannot be dispatched to, so the honest repair is to remove it from
selection and say so on stderr, leaving the config's live provider set
equal to what the machine can actually reach. What still raises is the
genuinely fatal case — **no** enabled provider has a key, so a direct-API
dispatch has nowhere to go — and that message now names every missing
variable, since at that point all of them are actionable.

This also removes the second half of I-123-S2-4: with keyless providers
disabled, model selection can no longer pin a verifier the process could
never call.

## I-123-S2-2 — the CLI put back the exclusion the router had just lifted

**Finding.** `verify_session` passes `exclude_providers=[effective_provider]`
(it computes the same value for its own reporting), and `route()` **unions**
caller exclusions with its own. Setting `_verifier_exclusion = None` in the
degraded branch therefore achieved nothing through the sanctioned CLI: the
caller's copy re-imposed it, and the permission was unreachable precisely
where it is used.

**Accepted.** The unit falsifiers drove `check_direct_api_precondition`
directly and never saw this.

**Fix** (`ai_router/__init__.py`): the degraded branch now **discards** the
orchestrator's provider from the final exclusion set, whatever the caller
passed, and additionally excludes every provider the machine cannot reach.

**This does not reopen `I-084-S1-3`.** That lesson closed the hole where a
caller-supplied list *omitting* the orchestrator could buy itself a
same-provider verifier. Here no caller input is consulted: the router
decided the degraded state from the project's own committed
`project-verify-type.txt` plus the machine's real key set — a state no
caller can fabricate by passing, or not passing, anything.

## I-123-S2-3 — the qualification died between the stamp and the metrics row

**Finding.** `complete_stamp()` added `verification_qualification`, but
`metrics.record_call()` writes only the keys in `STAMP_FIELDS`. The close
gate reads the **row**, so it would have seen a same-provider verifier with
no declaration and rejected it as "not cross-provider" — rejecting exactly
the verdict this session exists to permit.

**Accepted.** The most consequential of the four: the bijection was
enforced against a field that never arrived.

**Fix.** `verification_stamp.STAMP_OPTIONAL_FIELDS` is a new named tuple
beside `STAMP_FIELDS`, and `metrics.record_call()` persists it. It cannot
simply join `STAMP_FIELDS` — `validate_stamped_row`'s presence sweep
requires every entry there to be truthy, and a cross-provider row carries
no qualification by design. Keeping it a named constant beside its sibling
rather than an ad-hoc key in `metrics.py` keeps writer and validator on one
definition (`L-069-1`).

**Acceptance-harness note (adjudicated, not waived).** The harness reports
this finding's executable criterion as `still-failing` on the fixed tree.
**The criterion never ran on either tree.** It fails identically on the
pre-fix baseline *and* the fixed tree with

```
File "<string>", line 8
  stamp = complete_stamp({...}, response_content='VERIFIED
SyntaxError: unterminated string literal (detected at line 8)
```

— the verifier wrapped its check in `python -c "exec(\"...\\n...\")"`, and
the escaped `\\n` inside `response_content='VERIFIED\\n'` collapsed to a
real newline during shell quoting, so the criterion is a Python syntax
error rather than a check. Baseline discrimination therefore cannot fire
(it requires fail-then-pass, and this is fail-then-fail *for the same
reason unrelated to the fix*).

The criterion's **intent** is satisfied, proven by running the identical
program with intact quoting:

```
PASS: the metrics row carries verification_qualification = same-provider
```

and permanently by `test_the_qualification_survives_the_metrics_writer`,
which asserts the same row field plus the `None` column on an unstamped
call. The finding is fixed; only the verifier's transport of its own check
was broken.

---

## What the remediation itself caught

The new reachability falsifier crashed on `NameError: name 'sys' is not
defined` in `ai_router/__init__.py` — the degraded branch's warning wrote
to `sys.stderr` in a module that never imported `sys`. **Every** degraded
run would have died there. No amount of reading the branch surfaced it;
driving it did (`L-112-1`). Import added.

## Falsifiers added

Three, taking the session two over the spec's 25-function irony budget
(16 + 12 = 28). The overage is deliberate and is recorded in
`disposition.json`: verification demonstrated that the pre-verification
suite tested the units and not the path, which is the specific failure the
budget's own framing ("the number is the *check*, not the goal") admits.

- `test_a_single_key_machine_loads_instead_of_dying` — the degraded machine
  loads with keyless providers disabled; the no-key-at-all machine still
  raises.
- `test_the_qualification_survives_the_metrics_writer` — the row carries the
  token, and an unstamped call still writes the column as `None`.
- `test_the_degraded_route_drops_the_callers_orchestrator_exclusion` — the
  planted caller exclusion is discarded and unreachable providers are
  barred; the undegraded look-alike keeps the exclusion untouched.
