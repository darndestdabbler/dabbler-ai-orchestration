# Set 113 Session 6 — remediation, rounds 1 and 2

Five Major findings across the two discovery passes — four in round 1 (the
spec-conformance and failure-scenario lenses found the same guard defect
independently, so it is really three distinct defects), one in the
supplementary pass. **All five are real, all five are mine, and all five are
in code this session added.** Nothing was waived, nothing disputed.

Two of them are the uncomfortable kind: the round-1 verifier found that my
*fix for the false-accusation bug did not handle its own documented
reproduction*, and that the falsifier I shipped for it did not plant the shape
I claimed it planted. It was right on both counts, and I confirmed both against
the code before changing anything.

---

## F1 / F3 — the guard still convicted the honest servant on one-change-and-settle

**Round 1, both lenses, Major.** My first fix classified a mismatch by
re-deriving ground truth a second time and comparing the two *fresh*
derivations with each other: disagree → sandbox drift, agree → dishonesty.

The verifier's counterexample is exact. A tree that changes **once and then
settles** — one append to `activity-log.json`, one metrics line, one git ref —
makes both fresh derivations observe the same settled state B. They agree with
each other and disagree with the servant's honest state-A result, so the code
took the dishonesty branch and aborted the arm. That is the *production* shape,
not an exotic one, and it is the exact shape `s6-reproduction.md` documents.

Confirmed before fixing, against the then-current code:

```
#1/#3: CONFIRMED -- DeterministicServantViolation against the honest servant
```

The verifier also caught that my falsifier mutated the file on *every*
derivation, forcing `truth != again` — so it exercised a continuously-moving
tree and never the documented one-append case. And that my docstring said the
guard "re-derives twice more" when the code derived once more. Both true.

**Fixed by classifying on servant IDENTITY rather than on tree timing.**
Timing cannot distinguish the two cases — that is the lesson. Identity can, and
provably:

- `servant_is_canonical` is True only when the servant is **exactly**
  `DeterministicServant` (exact type, not `isinstance` — every bad servant in
  the tests is a subclass and stays fully guarded). Its `run` is
  `return _canonical_result(...)`, the very call the guard makes for its own
  truth, so a mismatch is a *proof* the tree moved, not evidence of anything
  else. That raises `SandboxNotQuiescent`, which the loop records and continues
  past.
- For any other servant a mismatch still raises
  `DeterministicServantViolation`, unchanged.
- The flag **defaults to False**, so a caller who forgets the keyword gets the
  strict guard. Fails closed.

The second re-derivation is gone — a removal, and one that also halves the
guard's cost on the production path.

Falsifiers rewritten to plant what they claim: the one-append-and-settle shape
at guard level *and* at loop level (the verifier's acceptance criterion, word
for word — the run must not raise and drift must stay visible), a
continuously-moving tree, the default-is-strict case, an exact-type-vs-subclass
assertion, and — the counterweight — a lying servant that still aborts the
whole run.

## F2 — arms that had already been billed vanished from the ledger when they raised

**Round 1, Major.** `_record_critique_call` ran only after `run_pull` returned.
A provider that answered several billable turns and *then* died — on a servant
violation, a verdict-schema failure, a later-turn HTTP error — contributed real
dollars and zero rows. As the verifier put it, that is the exact failure class
this session is diagnosing, so it is the spend most likely to be missing. My
own test had blessed the behaviour.

**Fixed with a trace sink.** `pull_route` takes an optional `trace_sink` list
and appends the live `PullTrace` to it the instant it exists; the trace is
mutated in place for the rest of the run, so the producer holds a reference to
the real usage even when the loop dies mid-flight. The producer's existing
`except` branch now ledgers that partial usage.

A first attempt extracted the turn loop into a helper so the whole thing could
sit under a `try`. It broke 37 tests, was reverted, and the one-line sink
replaced it — a much smaller change for the same result.

**It writes nothing when the arm billed nothing**, which is the opposite error:
an unmeasured failure must not be recorded as a measured `$0.00`.

## F4 — `BindingHTTPError` could print a live Gemini API key

**Round 1, Major, and the one I am least happy about** — it is a credential
leak in code this session added, and its docstring asserted the opposite.

I wrote that "nothing here can leak a key: the `Authorization` header is never
touched." True for anthropic and openai, and irrelevant to google, which
carries its credential in the query string:
`...:generateContent?key=<API KEY>`. The helper interpolated
`resp.request.url` verbatim, so a routine 429 would have printed a live key
into the terminal, the logs, and the session evidence.

Confirmed before fixing:

```
#4: CONFIRMED -- key leaked into the exception: True
```

**Fixed by redacting every query-parameter value**, not a denylist of
credential-looking names — a denylist is a list of the leaks someone thought
of. The host, path and status survive, which is the part a reader actually
needs. Redaction cannot raise: it runs on the failure path, and a crash inside
an error handler would be worse than the error.

## F5 — the ledger fabricated model provenance

**Round 2 (supplementary), Major.** `_record_critique_call` wrote the
*resolved* id into `model`, `requested_model_id` **and** `served_model_id`. Two
errors in one line: an alias-based critique lost what the caller asked for, and
`served_model_id` claimed an identity never obtained from any provider
response — which makes `served_model_mismatch` compute `False` and assert a
match nobody observed. That is precisely the field a drift audit trusts.

**Fixed by following `route()`'s own convention** instead of inventing one:
`model` is the name the caller asked for (the alias, when one was pinned),
`requested_model_id` is the resolved id actually put on the wire, and
`served_model_id` is **left null** — the schema's honest "not captured".

Deliberately scoped: this executor's bindings do not capture the provider's
echoed model, and wiring that through `BindingResponse` and all three
`_from_response` methods is a real change to the response path. The verifier's
acceptance criterion allows either provider-derived metadata **or** an explicit
unknown, and null is the honest half. Capturing served ids in the pull bindings
is named as a follow-on, not silently dropped.

---

## Every fix is mutation-tested

Each was reverted in turn and the matching falsifiers were confirmed to fail,
then the source was restored byte-for-byte:

| mutant | falsifiers that caught it |
| :--- | ---: |
| guard convicts the canonical servant again | 4 failed |
| the lenient reading becomes the default | 3 failed |
| URL redaction removed | 2 failed |
| paid-but-failed arms unledgered again | 1 failed |
| `served_model_id` asserted again | 1 failed |
| the caller's alias dropped | 1 failed |

---

# Round 3 (remediation-review) — one fix rejected, correctly

Fix verdicts: **3 accepted, 1 rejected, 0 accepted-with-modification.** The
rejection is F5's, and it is right.

## F5 (re-opened) — failed-arm rows could not name the model that spent the money

`_record_failed_arm` read the resolved model as
`getattr(exc, "pull_model", None) or model or "(unresolved)"`. That attribute
never existed: it was part of the loop-extraction attempt that broke 37 tests
and was reverted, and I did not notice that the getattr had outlived the thing
that set it. So the fallback chain was always the caller's pin — the caller's
**alias** for a pinned arm, and the literal string `"(unresolved)"` for an
unpinned one — written into `requested_model_id`, the field that is supposed to
be the id put on the wire.

The verifier's point that closes it: guard-raised `DeterministicServantViolation`
and a directly-constructed `BindingHTTPError` are exactly the failures this
path exists to record, and **neither has any reason to know about model
resolution**. An exception is not a reliable carrier for that identity.

**Fixed by publishing identity on the trace, which is the one object the caller
is guaranteed to hold.** `PullTrace` gains `provider` and `resolved_model`, and
`pull_route` stamps them at construction — before it drives anything — so the
`trace_sink` reference carries them out of any failure. `_record_failed_arm`
reads them from there.

A useful thing fell out of writing the falsifier: a failure during *setup*
(config or provider resolution, before the trace exists) leaves the sink empty,
and the producer then correctly writes nothing — that arm billed nothing. The
"billed nothing invents no spend" rule and this one are the same rule.

Falsifiers added: a pinned paid-failed arm keeps `model` = alias and
`requested_model_id` = resolved id with `served_model_id` still null; an
unpinned one is never `"(unresolved)"`; and a structural test drives the **real**
`pull_route` with a binding that dies on its first request, asserting the trace
was published and stamped — otherwise the first two would only be asserting a
property of the fake.

Both mutants caught (2 failed, 1 failed).
