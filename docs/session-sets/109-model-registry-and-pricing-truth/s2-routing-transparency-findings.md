# S2 — Routing transparency: what actually gets called

> Session 2 of 4, `109-model-registry-and-pricing-truth`.
> Orchestrator: claude / anthropic / claude-opus-5 / high.
> Every count below was read off a trace of real HTTPS requests. Nothing here
> is inferred from `router-metrics.jsonl`.

---

## The answer, first

**It was a real second call.** Not a duplicated row, not a mis-attributed one.

A single `route(task_type="architecture", exclude_providers=["anthropic"])`
issued **two** HTTPS POSTs, and the second went to `api.anthropic.com` — the
provider the caller had barred:

```
HTTP requests actually issued (trace): 2
    -> POST provider='openai'    model_id='gpt-5.4'
    -> POST provider='anthropic' model_id='claude-opus-4-8'
NEW metrics rows appended: 2
    -> row call_type='route'  model='gpt-5-4' provider='openai'    tier=3 score=69  cost=0.009675
    -> row call_type='verify' model='opus'    provider='anthropic' tier=3 score=None cost=0.047220
```

That is the spec's observation reproduced: same two models, same two providers,
same tiers, and the same `score=<n>` / `score=None` asymmetry that made the
second row look orphaned. (The score itself is 69 here against the spec's 43 —
the prompt differs, and the score is a property of the prompt. What matters is
that the second row carries no score *because* the verifier call is not scored,
not because a row was mangled.)

The metrics log was telling the truth the whole time: two rows, because two
calls.

The barred call was also **4.9× more expensive than the call it was
verifying** ($0.0472 against $0.0097).

### Consequences, in the order the spec put them

1. **`exclude_providers` was not honoured on every path.** Confirmed, and
   fixed at three sites (below).
2. **Routed spend is *not* roughly double what it reports.** Each call writes
   its own row carrying its own `cost_usd`, and `RouteResult.total_cost_usd`
   already summed generator + verifier. The money was always counted; what was
   not visible is *whose* money it was.
3. **The metrics rows are *not* unreliable.** The opposite: the ledger was
   accurate and the router's behaviour was wrong. This is the better of the two
   hypotheses — a defect in what we did, not in what we know.

---

## Where the exclusion was dropped

`route()` treated `exclude_providers` as a hard constraint for its own model
pick, then dropped it when dispatching the **secondary** calls it makes on the
caller's behalf. Three sites, one shape (L-069-1: a bug is a bug class):

| # | Site | Status before | Reachable? |
| :- | :--- | :--- | :--- |
| 1 | `route()` → `_run_verification` | no `exclude_providers` parameter at all | **Live** — reproduced above |
| 2 | `_route_via_copilot_cli` → `_run_verification_via_copilot_cli` → `pick_copilot_cli_verifier` | selector accepts an exclusion; call site passed none | **Live on a Copilot seat** |
| 3 | `route()` → `_tiebreaker_reroute` | reads `settings.tiebreaker_model` (default `opus`, Anthropic) with no exclusion check | Latent — no configured `on_disagreement` is `re-route` |

Site 2 is the one the routed analyst did not name; it was found by grepping the
sibling profile for the same shape rather than by reading its advice. Under the
copilot-cli profile the *generator* was resolved against the exclusion and the
*verifier* was not — the same asymmetry as the api profile, in a second body.

### Why it happened

Both verifier selectors — `pick_verifier_model` and
`pick_copilot_cli_verifier` — already accepted an `exclude_providers` argument
and already applied it correctly. Nothing was missing from the selection logic.
The constraint simply stopped at the boundary between "the call route() makes"
and "the call route() makes on your behalf", because the second was written as
a courtesy pass rather than as part of the same contract.

---

## The fixes

Each is a thread-through or a removal; no new selection logic was written.

1. **`_run_verification` takes the caller's exclusion** and seeds it into the
   `excluded_providers` accumulator the retry path already used. One mechanism
   rather than two, so a *fallback* attempt cannot re-cross the caller's
   constraint either.
2. **The copilot-cli verifier resolution receives the same exclusion**, which
   `pick_copilot_cli_verifier` unions with the generator's own provider. Nothing
   surviving yields the existing "verification unavailable" stub.
3. **The tiebreaker degrades into a branch that already existed.** Rather than
   giving it a candidate ladder, an excluded tiebreaker now takes the
   `tiebreaker_name not in _config["models"]` path — fall back to merging the
   verifier's feedback. The safe degradation was already written; it just was
   not reachable from this condition. (*Prefer removal over addition*: the fix
   removed a reachability gap instead of adding a second selector.)

### The behaviour change this introduces, stated plainly

When the exclusion leaves **no eligible verifier**, `_run_verification` returns
`None` and `route()` proceeds unverified — which it already did for "no
eligible verifier exists". On the live registry this is not hypothetical, and
it is confined to **tier 3**:

| generator | verifier, no exclusion | verifier, `anthropic` excluded |
| :--- | :--- | :--- |
| `gpt-5-4` (openai, t3) | `opus` | **none** |
| `gpt-5-6` (openai, t3) | `opus` | **none** |
| `gemini-pro` (google, t2) | `gpt-5-4-mini` | `gpt-5-4-mini` |
| `sonnet` (anthropic, t2) | `gemini-pro` | `gemini-pro` |

A tier-3 OpenAI generator has no surviving verifier because rule 1 already bars
the generator's own provider, the tier-distance rule admits only tiers 3–4, and
every other tier-3 entry is Anthropic. Tier-2 calls are unaffected. The
post-fix trace of the tier-3 call:

```
HTTP requests actually issued (trace): 1
    -> POST provider='openai' model_id='gpt-5.4'
RouteResult.verification: None
```

**Declining to auto-verify is the correct outcome here.** The auto-verify pass
is a courtesy on an ordinary routed call, and not running it is strictly safer
than running it against the one provider the caller barred. It is worth the
operator knowing that tier-3 `architecture` calls made under an Anthropic
exclusion now come back unverified rather than Anthropic-verified — that is a
registry-shape consequence, and **Session 4 changes exactly that shape.**

---

## `exclude_providers` on the verification path — the plain statement

**Verification was never affected.** Not partially, not by luck.

`verify_session` and the `close_session` backstop both route with
`task_type="session-verification"` (the backstop calls `verify_session`'s own
seam, so it is one path, not two). That task type is **not** in
`verification.auto_verify_task_types`, so neither ever entered the branch that
leaked. Traced end to end, a session-verification call issues exactly **one**
HTTPS request, on a provider that is not the excluded one.

This is recorded as a finding in its own right, per the spec. Two tests now
assert it rather than leaving it as a reading of the config:

- `session-verification` is not in `auto_verify_task_types` — so a future edit
  that adds it fails here instead of silently reopening same-provider
  verification through the back door;
- a traced `session-verification` route issues one request and writes one row,
  neither on the excluded provider.

The Set 108 S4 rounds that stamped the exclusion and recorded openai verifiers
were correct, and were correct for a structural reason rather than by accident.

---

## Two things found along the way

### Routing could send work to a model the registry disables

Handed to this session by S1's disposition, and it turned out to be **four**
sites rather than the one S1 named. Three returned a routing-table entry
**without** its `_survives()` check whenever no exclusion applied; since
`_survives` reduces to `is_enabled` when nothing is excluded, each did one
thing only — bypass `is_enabled`. The fourth never checked the flag at all:

| # | Site | Governs | Found by |
| :- | :--- | :--- | :--- |
| 1 | `models.pick_model` — the `task_type_overrides` branch | pinned task types only | S1's handover |
| 2 | `models.pick_model` — the `tier_assignments` branch, four lines below | **every non-pinned call** | pattern sweep |
| 3 | `utils.get_escalation_model` — the next-tier assignment | every escalation | pattern sweep |
| 4 | `__init__._tiebreaker_reroute` — the configured tiebreaker | every tiebreak (latent) | **this session's own verification round** |

Site 3 is the one worth pausing on: the initial pick and the escalation must
agree about what the registry permits, or **escalation becomes a way around
it** — a call that could not start on a disabled model could still end up
there.

Site 4 is worth pausing on for a different reason. The sweep that found 2 and 3
searched for the *shape* of sites 1–3 — an `if not exclude` short-circuit ahead
of a `_survives` check. The tiebreaker has no such short-circuit because it
never consulted `is_enabled` **at all**, so a pattern search could not reach it.
Both fan-out arms of this session's verification flagged it independently. The
lesson is narrow and worth stating: a grep for the shape of a bug finds
instances that share the shape, not instances that share the *consequence* —
and the site with no check whatsoever is invisible to a search for a
defective check.

That contradicts a contract S1 established: `is_enabled: false` means *identity
registry only*, the record of what an orchestrator **is**, never a destination
for work. `claude-opus-5` and `claude-sonnet-5` sit in the shipping registry on
those terms today. Sites 1–3 were reproduced on a synthetic config: pinning
`claude-opus-5`, assigning it to tier 3, and escalating into tier 3 each
returned it as the work destination.

Fixing only the reported site would have closed a quarter of a class and left
the rest live — precisely the failure L-069-1 describes.

Fixed by **deleting** the three short-circuits, and by giving the tiebreaker
the usability test it never had. One rule, one code path; a disabled entry now
falls through to the surviving-candidates search each site already had, and an
unusable tiebreaker takes the existing merge fallback. No entry in the shipping
config is affected today, so this is behaviour-neutral now and correct going
into Session 4, which rewrites exactly these tables.

*Scope note:* this is not the same defect class as the exclusion leak — a
different rule was being bypassed. It is fixed here rather than deferred
because S1 handed it over explicitly, because every fix is a removal, and
because S4 edits these very tables.

*Consistency pass (L-065-1):* three places justified S1's "treat a pinned entry
as routable" rule by citing the bypass this session removed — the
`pinned_model_names` docstring, the `check_registry` comment, and the S1
changelog entry. All three were updated in the same pass. The gate's
**behaviour** is unchanged and deliberately so: an id a routing table names is
a declared destination, an operator flipping `is_enabled` back on is a config
edit rather than a code change, and the gate's standing rule is to never
under-report.

### A metrics row is not a request, and the difference is not a fault

The obvious regression assertion — one row per request — is **false**, and
writing it is how that test earned its place. An **escalation** issues a second
request to a different provider's model and collapses both into *one* row, by
design; a **retry** does the same. Observed directly: a tier-2 `architecture`
call escalated google → openai, producing 2 requests and 1 row.

So the honest invariant is directional, and that is what the suite pins:

> Within a traced api-profile `route()`, every provider a metrics row names
> must be one the router actually called. The reverse does not hold, and
> should not.

Both qualifiers are load-bearing. *Traced* and *api-profile*, because the
copilot-cli transport spawns a CLI rather than issuing a POST and is
deliberately not HTTP-instrumented — its rows exist with **zero** trace
entries, so a blanket "requests ≥ rows" would be false on a Copilot seat.
Within the traced api path, request counts are ≥ row counts and the gap is
escalation and retry rather than mis-recording.

---

## What was deliberately *not* changed

- **`verify()` has no `exclude_providers` parameter.** Not the same defect: it
  never had an exclusion to drop, and `pick_verifier_model`'s first rule
  already bars the generator's own provider, so `verify()` is cross-provider by
  construction. Adding a caller exclusion would be a new feature, not a fix.
- **The auto-verify branch itself.** The routed analyst raised removing it
  outright as the pure-removal option. That is a genuine design question about
  whether `route()` should make courtesy calls at all, and it is far wider than
  the evidence gathered here supports. Noted for a future set; not taken.
- **The copilot-cli call boundary is not HTTP-traced.** The seat transport
  spawns a CLI rather than issuing a POST, and it already counts its own
  dispatches (`_copilot_invocation_count`, surfaced as `local_invocations` on
  every seat-profile row). Instrumenting it a second way would add a surface to
  measure something already measured.
- **Historical metrics rows.** Untouched, per the set's non-goals. Nothing in
  this session's findings changes what any past row cost — only which provider
  should have received the call.

---

## Instrumentation shipped

`ai_router/call_trace.py` — a ContextVar-scoped record of every provider HTTP
request:

```python
with trace_provider_calls() as calls:
    route(..., exclude_providers=["anthropic"])
assert [c.provider for c in calls] == ["openai"]
```

Announced **inside** each provider caller rather than in `call_model`, because
`call_model` wraps the retry loop — counting above it would undercount exactly
the requests most worth seeing. Outside a trace scope it is a ContextVar read
and a `None` test: no list, no lock, no accumulating state on the production
path.

It records the id put **on the wire**, not the local registry alias — the same
distinction S1 drew when it split `requested_model_id` out of the row's `model`
field. A trace carrying the alias could not show an alias resolving to
something else, which is half of what this set exists to make visible.

One test-harness consequence: `call_trace` was added to the conftest's
shared-module aliasing list. It holds module-level ContextVar state, so a test
opening the scope on the bare module while `providers` announced on the package
module would have seen an empty trace and read it as *no request was sent* —
the precise false negative the module exists to prevent.

---

## Evidence

All three live traces are committed as `s2-trace-evidence.json`, beside this
document — raw `call_trace` output paired with the metrics rows each call
appended. (They were originally cited from a scratchpad, which the close
backstop correctly flagged: an evidence table must name files that exist.)

| What | Where | Result |
| :--- | :--- | :--- |
| Pre-fix trace, tier-2 case | `s2-trace-evidence.json` → `tier2_prefix` | 2 requests / 2 rows, **0** to the excluded provider — the shape that never exhibited the defect |
| Pre-fix trace, tier-3 case | `s2-trace-evidence.json` → `tier3_prefix` | 2 requests / 2 rows, **1** to the excluded provider — the breach, and the spec's exact rows |
| Post-fix trace, same tier-3 call | `s2-trace-evidence.json` → `tier3_postfix` | 1 request / 1 row, **0** to the excluded provider |
| Falsifier check | — | **9** of the 27 new tests fail with the three fix files reverted to HEAD (instrumentation kept, so the failures are the defect and not a broken harness); all 27 pass restored |
| Routed step-3.5 analysis | `s2-ai-assignment-analysis.json` | gemini-2.5-pro, $0.0172, truncation-clean |
| Round-1 verification + nit adjudication | `s2-verification.md`, `s2-verification-fanout-2.md`, `s2-remediation-round-1.md` | VERIFIED, 0 blocking, 7 nits all fixed |

`ai_router/tests/test_routing_exclusion_integrity.py` — **27** tests covering
`call_trace` itself (including that a retry counts separately and that a
raising scope does not leak), the invariant end-to-end through the **real**
registry at both the tier-2 and tier-3 shapes, each of the three exclusion
sites, all four `is_enabled` sites, the `verify_session` seam, and the
verification-path statement above.

Exact call counts are asserted per scenario rather than as one number, because
the correct count differs by tier: tier 2 is **2 requests / 2 rows** (a
permitted verifier still exists, so auto-verification still runs), tier 3 is
**1 request / 1 row** with `verification is None`. Asserting a single figure
would have been wrong for one of them.

Assertions are written against the invariant ("nothing from the excluded
provider"), never against which model wins — Session 4 re-points `opus` and
`sonnet`, splits `gpt-5-6`, and adds Fable 5, and a test pinning today's winner
would fail on a registry change that is not a defect.
