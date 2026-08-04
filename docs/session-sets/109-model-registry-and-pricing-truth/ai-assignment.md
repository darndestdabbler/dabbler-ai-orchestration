# AI Assignment — 109-model-registry-and-pricing-truth

## Session 1 of 4 — Enumeration, the drift gate, and served-model truth

- Orchestrator: claude / anthropic / claude-opus-5 / high (operator-invoked).
- Routed step-3.5 analysis: `s1-ai-assignment-analysis.json` (route
  `task_type=analysis`, excl. anthropic → gemini-2.5-pro, $0.0153,
  truncation-clean).
- Routed design decision: `s1-enumeration-design.json` (route
  `task_type=architecture`, excl. anthropic → gemini-2.5-pro, $0.0798 incl.
  auto-verification, truncation-clean). The `architecture: opus` pin is a
  preference only; the no-skip anthropic exclusion outranks it, so tier-3
  Anthropic was unavailable and selection fell through to tier 2.
- Set-level facts carried from the spec (immutable at runtime): **Full tier**,
  `requiresUAT true` (**S4** walks the price-confirmation flow — S1 neither
  arms nor runs it), `requiresE2E false` (router-side Python only; no
  Explorer-rendering surface, no state writer, no fixture harness, so L-064-12
  does not arm and pytest is the executable gate), `pathAwareCritique advisory`
  (set-terminal, in S4). Not re-litigated mid-session; a wrong flag is
  surfaced at Step 9.
- Budget note: this session draws on the **`DABBLER_*` provider keys** only —
  one routed analysis, one routed architecture decision, and the mandatory
  cross-provider verification, plus a handful of sub-cent live probes. It
  spends **zero Copilot seat capacity**. The enumeration endpoints
  (`GET /models`) are unmetered.

### Routing plan

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Register; read the preload; confirm keys; read the spec. | Orchestrator direct — bootstrapping. |
| 3.5 | Assignment analysis + next-orchestrator / next-set recommendations. | **Routed** (`analysis`) — repo rule: never self-opine on model choice. |
| 2a | Probe the three list endpoints and the three completion responses live. | Orchestrator direct — **execution, not reasoning**. The wire shapes are facts; asking a model to describe them would substitute recall for evidence. |
| 2b | Settle the enumeration/gate/served-model design (six questions). | **Routed** (`architecture`) — genuine solution-variance, and the answers bind Sessions 2–4. |
| 2c–5 | Write `model_inventory.py`, patch `providers.py` / `metrics.py` / the six `record_call` sites, write the tests, edit `router-config.yaml`. | Orchestrator direct — implementation is deliberately **not** in `delegation.always_route_task_types`, and the constitution assigns file edits to the orchestrator's mechanics. |
| 6 | Suite + the two live end-to-end proofs of the Ends-with line. | Orchestrator direct — deterministic gates. |
| Verify | Phased `verify_session` for this set. | **Routed** — `session-verification`, anthropic auto-excluded per the no-skip mandate. |
| Close | `disposition.json`; commit + push; `close_session`; notify. | Orchestrator direct — mechanics. |

### Where this departs from the routed analysts, and why

Two routed artifacts advised this session. Both were adopted in substance;
five points were overridden, each on evidence gathered after the prompt was
sent or on a repo rule the analyst could not see.

**Adopted wholesale.** JSON for the lockfile rather than `copilot_catalog.py`'s
hand-rolled restricted-TOML (that format exists to avoid a TOML dependency for
an attribute table; `json` is stdlib and the payload here is three lists of
opaque strings). The `--refresh` / `--check` split, with `--check` forbidden
from touching the network. Missing lockfile is fatal, not a silent pass.
`served_model_id: Optional[str] = None` on `APIResult`, with `None` — never
`""` — for "the provider did not say". No runtime action on a mismatch beyond
recording it.

**Departure 1 — the gate is not wired into `drift_guard.py`.** The design
answer said to integrate `--check` there, contradicting its own Q1 (a packaged
`python -m ai_router.model_inventory --check`, which is what the spec's
Ends-with line names). Two facts settle it: `ai_router/scripts/drift_guard.py`
is explicitly **not** in the wheel, and `test_drift_guard.py` contains a test
asserting the **real repository passes every check**. Wiring a check the
registry currently fails would turn the committed suite red on the day it
lands, for a defect Session 4 is scheduled to fix. The gate ships standalone
and deliberately unwired; the wiring is S4's to do, after the registry is
correct.

**Departure 2 — no `is_exempt_from_inventory_check` config flag.** The design
proposed a per-entry boolean to exempt identity-only entries like
`gemini-3-pro`. Rejected under *prefer removal over addition*: an exemption
flag is precisely the mechanism that goes quiet, and this whole set exists
because a silent hole cost the repo 2× on every reported cost. It would also
pull in schema↔validator parity work for one row. Instead the gate has two
populations — routable misses fail (exit 1), identity-only misses are
**reported on every run** and counted, exit 0 — plus a `--strict` flag for
anyone who wants the stronger reading. Nothing can be exempted into silence
because nothing is exempted at all.

**Departure 3 — per-provider probe timestamps, and "never enumerated" is
fatal, not drift.** The design argued one global timestamp suffices because
`--refresh` is atomic. It is not: one absent key or one failing endpoint
partially succeeds. A provider that fails to enumerate now keeps its previous
snapshot (a partial refresh must never downgrade a good snapshot to an empty
one) and `--refresh` exits non-zero naming it. Correspondingly, `--check`
treats a provider with no snapshot as **fatal (exit 2)**, not as drift:
"we could not ask" and "the provider does not offer it" are different facts,
and conflating them would report every model of that provider as missing.

**Departure 4 — 30-day staleness, not 24 hours.** A 24-hour warning on data
that changes every few weeks is a warning that is always on, which is how a
warning stops being read. 30 days matches the registry's existing
`metadata.review_frequency_days` rather than inventing a second cadence.

**Departure 5 — two new metrics columns, snake_case, and this one changed the
deliverable.** The design proposed a single `servedModelId`. Both halves were
wrong. The metrics JSONL is snake_case throughout (`input_tokens`,
`stop_reason`, `billed_usage_unavailable`), so the claimed camelCase
"convention" does not exist in that file. More importantly, one column is not
enough: the row's existing `model` field holds the local **alias**
(`gpt-5-6`), not the id put on the wire (`gpt-5.6`), so a requested-vs-served
comparison would have required joining against a version of
`router-config.yaml` that Session 4 is about to edit. Both
`requested_model_id` and `served_model_id` are recorded, and the mismatch stays
derived rather than stored — which the live probe vindicated: OpenAI served a
plain `gpt-5.4-mini` request as `gpt-5.4-mini-2026-03-17`, so a stored
"mismatch" bit would read true on nearly every OpenAI row and mean nothing.

### What the live probes changed

The spec forbade re-deriving its OpenAI evidence, so the probes went after
what it had not established: the response field shapes. Anthropic echoes the
requested id exactly (`model: "claude-sonnet-4-6"`); Google returns a bare
`modelVersion: "gemini-2.5-pro"`; OpenAI returns a **dated snapshot**. That
last one is a finding in its own right — the substitution the spec caught on
`gpt-5.6` is not an exception on that provider, it is the norm — and it is the
reason Departure 5 exists.

The enumeration probe also turned up a **second** drifting entry the spec did
not name: `gemini-3-pro` (identity-only) is not in Google's list either, which
offers `gemini-3-pro-preview`. It is reported as a note rather than a failure
and documented in the entry itself.

### Forward-looking recommendations (routed)

- **Next orchestrator (Session 2).** claude / claude-opus-5 / high. The
  analyst's reasoning holds: S2 instruments the provider-call boundary and
  reasons about `route()`'s escalation loop and exclusion logic, which is
  control-flow archaeology across a 2,100-line module. Recorded verbatim in
  `s1-ai-assignment-analysis.json`; the `effort: 3` field there is the
  analyst's own malformed value (the schema wanted a level, not a number) and
  is read as `high`.
- **Next session set.** The analyst proposed automating lockfile refresh via a
  scheduled job that opens a PR. Noted, **not** adopted as a recommendation
  from this session: Session 3 of this very set builds a scrape-to-propose
  flow with a hard human-confirmation rule, and a bot that opens registry PRs
  on a timer is the same silent-staleness surface the spec's risk register
  already warns about. If it is wanted, it belongs after S3 has established
  what "propose" means here. `110-work-explorer-native-treeview` is already
  authored and declares this set as its prerequisite.

### One in-flight observation for Session 2

The two-metrics-row anomaly S2 must resolve has a candidate explanation
visible from this session's reading, offered as a lead and **not** as a
finding: `route()` ends with an auto-verification branch gated on
`verification.auto_verify_task_types`, and `_run_verification` performs its own
model selection. If that path does not honour the caller's
`exclude_providers`, a `route(..., exclude_providers=["anthropic"])` call
would legitimately emit a second, anthropic row. S2's spec is explicit that
the two hypotheses are distinguished only by counting HTTP requests at the
call boundary — this session did not count anything, and this note must not be
mistaken for having done so.

---

## Session 2 of 4 — Routing transparency: what actually gets called

- Orchestrator: claude / anthropic / claude-opus-5 / high (operator-invoked;
  matches S1's routed recommendation and its recorded reason).
- Routed step-3.5 analysis: `s2-ai-assignment-analysis.json` (route
  `task_type=analysis`, excl. anthropic → gemini-2.5-pro, $0.0172,
  truncation-clean, no auto-verification — `analysis` is not an
  auto-verified task type).
- Set-level facts carried from the spec (immutable at runtime): **Full tier**,
  `requiresUAT true` (**S4** walks the price-confirmation flow — S2 neither
  arms nor runs it), `requiresE2E false` (router-side Python only; no
  Explorer-rendering surface, no state writer, no fixture harness, so
  L-064-12 does not arm and pytest is the executable gate),
  `pathAwareCritique advisory` (set-terminal, in S4). Not re-litigated
  mid-session.
- Budget note: this session draws on the **`DABBLER_*` provider keys** only —
  one routed analysis, four live probe calls (two tier-2, one tier-3 pre-fix,
  one tier-3 post-fix), and the mandatory cross-provider verification. It
  spends **zero Copilot seat capacity**. The pre-fix tier-3 probe deliberately
  paid for the barred Anthropic call ($0.0472) because that payment IS the
  evidence.

### Routing plan

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Register; read the preload; confirm keys; read the spec. | Orchestrator direct — bootstrapping. |
| 3.5 | Assignment analysis + next-orchestrator / next-set recommendations. | **Routed** (`analysis`) — repo rule: never self-opine on model choice. |
| 2 | Build `call_trace.py`; wire the three provider callers. | Orchestrator direct — implementation is deliberately not in `delegation.always_route_task_types`. |
| 3 | Trace live `route()` calls; count requests; pair against rows. | Orchestrator direct — **execution, not reasoning**. The spec is explicit that the two hypotheses are settled by counting, and a model asked to describe the wire would substitute recall for evidence. |
| 4 | Read every `exclude_providers` site; check the verification path. | Orchestrator direct — control-flow archaeology over a known grep surface, with the answer machine-checkable by test. |
| 5–6 | Fix three sibling sites + the `is_enabled` pin bypass; write the tests. | Orchestrator direct — file edits are the orchestrator's mechanics. |
| 6 | Falsifier check (revert the fix, confirm the tests fail) + full suite. | Orchestrator direct — deterministic gates. |
| Verify | Phased `verify_session` for this set. | **Routed** — `session-verification`, anthropic auto-excluded per the no-skip mandate. |
| Close | `disposition.json`; commit + push; `close_session`; notify. | Orchestrator direct — mechanics. |

### Where this departs from the routed analyst, and why

The analysis was adopted in substance — the ContextVar design, the narrow fix
scope, the judgement that removing the auto-verify branch outright is too
large a change for this evidence, and the assessment that the `verify_session`
path is *likely* fine but must be **proven** rather than reasoned. Four
departures:

**Departure 1 — a third sibling site the analyst could not see.** Its
`sibling_sites` list named only `_tiebreaker_reroute`, because its context did
not include the copilot-cli profile. Grepping the sibling profile for the same
shape found `_run_verification_via_copilot_cli`, which resolved its *generator*
against the exclusion and its *verifier* against nothing. That site is **live
on a Copilot seat**, not latent like the tiebreaker, so it was the more
consequential of the two it did not name.

**Departure 2 — the instrumentation is permanent, not scaffolding.** The design
recommended contextvars partly because it is "easily removed after the
session". The spec's Ends-with requires the call count to be **asserted**, and
an assertion needs a seam that outlives the session. It ships as a module with
its own tests.

**Departure 3 — the `is_enabled` pin bypass was fixed, not deferred.** The
analyst's `what_to_defer` framing would have left it alone as unrelated to the
exclusion evidence, which is true as far as it goes: it is a different rule
being bypassed. It was fixed anyway because S1's disposition handed it over
explicitly, because it directly contradicts the identity-only contract S1
established, and because it is a two-line **removal** in the very pins Session
4 is about to rewrite. Reasoning recorded in
`s2-routing-transparency-findings.md`.

**Departure 4 — the next-session-set recommendation is not adopted.** The
analyst proposed a new `110-cost-and-latency-optimization`. `110` already
exists — `110-work-explorer-native-treeview`, authored, declaring this set as
its prerequisite — so the recommendation rests on a repo fact the analyst did
not have. The optimization idea itself is also premature: Sessions 3 and 4 have
not yet made the prices true, and budget-aware routing built on the current
figures would optimize against numbers this set exists to correct.

### What the traces changed

The analyst's assessment said verification integrity was "path-dependent and
therefore compromised", and asked that the `verify_session` path be proven
rather than assumed. Proving it inverted the emphasis: the leak is real and was
live on two profiles, **and** the verification path never touched it, because
`session-verification` is not an auto-verified task type. Both halves are now
asserted by tests rather than argued.

The traces also falsified an assertion this session tried to write — that
requests and rows correspond one-to-one. They do not: an escalation issues two
requests and records one row, by design. That is documented in the findings and
pinned as a directional invariant instead.

### Forward-looking recommendations (routed)

- **Next orchestrator (Session 3).** The analyst recommends **openai /
  gpt-5-4 / high**, on the reasoning that S3 designs a pricing schema, plans a
  scrape over three published pages, and extracts structure from unstructured
  HTML — parsing-heavy work with a strong falsifier (the fixtures either parse
  or they do not). Recorded as the routed recommendation; the engine switch is
  the operator's call. Two facts the operator should weigh alongside it: S3 is
  the session whose deliverable is a *proposal* flow with a hard
  human-confirmation rule, and this set's own evidence is that `gpt-5-4` is
  reached under an Anthropic exclusion, so it is already the de-facto verifier
  for this set's rounds.
- **Next session set.** Not adopted as recommended (Departure 4).
  `110-work-explorer-native-treeview` is already authored and declares this set
  as its prerequisite; it remains the successor.

---

## Session 3 of 4 — A pricing schema that can be true, and scrape-to-propose

- Orchestrator: claude / anthropic / claude-opus-5 / high (operator-invoked).
  This **departs from S2's routed recommendation** of openai / gpt-5-4, and the
  reason is the one S2's own analyst flagged without being able to weigh:
  `gpt-5-4` is what this set's Anthropic-excluded verification rounds fall
  through to, so orchestrating from it would have collapsed the cross-provider
  independence the set's verdicts rest on. The engine choice is the operator's
  call and the operator kept Claude.
- Routed step-3.5 analysis: `s3-ai-assignment-analysis.json` (route
  `task_type=analysis`, excl. anthropic → gemini-2.5-pro, $0.0410,
  truncation-clean).
- Routed design decisions, **split into two**: `s3-pricing-schema-design.json`
  (`architecture`, excl. anthropic+google → gpt-5-4-mini, $0.0606) and
  `s3-scraper-design.json` (`architecture`, excl. anthropic+openai →
  gemini-2.5-pro, $0.0188). Both truncation-clean, run concurrently on
  different providers so the two halves are independently sourced.
- Set-level facts carried from the spec (immutable at runtime): **Full tier**,
  `requiresUAT true` (**S4** walks the price-confirmation flow — S3 builds it
  and neither arms nor runs the walk), `requiresE2E false` (router-side Python
  only; no Explorer-rendering surface, no state writer, no fixture harness, so
  L-064-12 does not arm and pytest is the executable gate),
  `pathAwareCritique advisory` (set-terminal, in S4). Not re-litigated
  mid-session.
- Budget note: this session draws on the **`DABBLER_*` provider keys** only —
  one routed analysis, two routed architecture decisions, two abandoned
  timed-out attempts (below), and the mandatory cross-provider verification.
  It spends **zero Copilot seat capacity**. The three pricing-page fetches are
  unmetered.

### Routing plan

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Register; read the preload; confirm keys; read the spec. | Orchestrator direct — bootstrapping. |
| 3.5 | Assignment analysis + next-orchestrator / next-set recommendations. | **Routed** (`analysis`) — repo rule: never self-opine on model choice. |
| 2a | Fetch the three pricing pages and read their real markup. | Orchestrator direct — **execution, not reasoning**. The spec says the pages are "parseable"; it does not say what SHAPE, and a model asked to describe them would substitute recall for evidence. |
| 2b | Settle the schema shape (6 questions) and the scraper/acceptance design (7 questions). | **Routed** (`architecture` ×2) — the highest solution-variance decision in the set, and it binds S4 and every consumer repo. |
| 3–5 | Write `pricing.py`, `pricing_proposal.py`, wire the six consumers, write the fixtures and tests, document the schema in the YAML. | Orchestrator direct — implementation is deliberately not in `delegation.always_route_task_types`. |
| 6 | Live `--fetch` run; full suite. | Orchestrator direct — deterministic gates. |
| Verify | Phased `verify_session` for this set. | **Routed** — `session-verification`, anthropic auto-excluded per the no-skip mandate. |
| Close | `disposition.json`; commit + push; `close_session`; notify. | Orchestrator direct — mechanics. |

### A routing failure worth recording

The combined design prompt (~9k tokens, thirteen questions) **timed out on
both providers** — three attempts × 300s on gemini-pro, then the same again on
gpt-5-4 — because `providers.<name>.timeout_seconds` is 300 and a frontier
model reasoning hard over a dense prompt exceeds it. Two paid-for calls
returned nothing. Splitting the prompt in half fixed it immediately.

The lesson is not "raise the timeout": it is that a routed *design* prompt has
a size past which the transport gives out before the model does, and the
failure is expensive and reads like an outage (`RuntimeError: API call failed
after 3 attempts: The read operation timed out`). The two smaller questions
also got sharper answers. Recorded because the next orchestrator to write a
thirteen-question architecture prompt will otherwise pay the same toll.

### Where this departs from the routed designs, and why

Both were adopted in substance — a flat rate-row list rather than nested
periods, permanent coexistence of the flat fields, the worst-case sort scalar,
all-or-nothing across providers, a deliberately narrow parse scope, and
verbatim-subsetted page fixtures. Five departures:

**Departure 1 — one inclusive upper bound per row, not a `min`/`max` pair.**
The schema design proposed `min_input_tokens: 200001` beside
`max_input_tokens: 200000`. Two fields that must agree at an off-by-one
boundary is a bug waiting to be written; one inclusive `max_input_tokens` per
row, with the previous row's bound implying the floor, expresses the same
thing and matches how the providers state it ("prompts <= 200k tokens").

**Departure 2 — flat and structured are mutually exclusive, not reconciled.**
The design said to allow both on one entry and reject them when they disagree.
That still leaves two numbers a careless edit can push apart, and the
"they must match" check is itself a thing that can go quiet. An entry declares
its rates one way or the other, full stop.

**Departure 3 — the acceptance mechanism is a file, not a prompt and not a
printout.** The scraper design chose print-only with the human hand-editing
the YAML; the assignment analysis chose an interactive `[y/N]` CLI. Print-only
cannot satisfy the spec's "only acceptance writes the value and stamps
`confirmed_on`" — there is no acceptance step to hang the stamp on. The
interactive CLI needs a TTY, so it could only ever be exercised by the
operator walking it, which is the one place this set cannot afford an
unexercised path. Marking a decision in the proposal file satisfies the spec,
still forces the human to open every change, and is testable end to end.

**Departure 4 — `metadata.pricing_reviewed` is KEPT.** The spec says the
per-model `confirmed_on` replaces it. Grepping before deleting found the VS
Code extension's Cost Dashboard renders its staleness banner from that exact
field — and "no Explorer or extension work" is an explicit non-goal of this
set. Removing it would have broken a shipped surface this session is not
allowed to touch. It survives as a rollup (the oldest per-model stamp)
maintained by `--apply`, so it cannot drift from the stamps it summarises.
Flagged for Step 9 as a spec line that could not be followed as written.

**Departure 5 — OpenAI's long-context rates are read but never proposed.**
Both designs assumed the parser would either take the highest price or encode
the tier. The page publishes both rate columns and never states where the
boundary falls, so proposing a tier would mean manufacturing the one number
the page does not state. It is reported as an observation instead.

### What the live run changed

The tool found a defect the spec did not name: `gpt-5-5` is understated 2× for
a completely different reason than `gpt-5-6` (a real id whose rates were copied
from `gpt-5.4` at authoring time, so Session 1's drift gate passes it). It also
showed the spec's reconciliation figure is an order of magnitude too small —
245 `gpt-5-6` rows totalling $48.95 reported across the whole ledger, not one
session's $0.5916. Both are written up in `s3-live-proposal-evidence.md` and
owed to S4.

The first draft of that write-up overstated the `gpt-5-5` impact. Counting the
ledger before publishing the claim reduced it to one call at $0.0003.

### Forward-looking recommendations (routed)

- **Next orchestrator (Session 4).** The analyst returned
  `"Claude 3 Opus" / claude-3-opus-20240229` — a model id that exists in
  neither this registry nor at the provider. It is read as **claude-opus-5 /
  high**, which is also the right call on the merits: S4 walks a human
  confirmation flow, adjudicates model pins, and authors the UAT checklist.
  This is the **third consecutive session** in which the step-3.5 analyst has
  emitted a non-existent model id, so the routed recommendation this repo
  relies on in order not to self-opine is itself unvalidated. A `route()`-side
  fix — validate a recommended model id against the registry before returning
  it — is owed, and is now cheap, because `model_inventory` already knows what
  every provider offers.
- **Next session set.** `110-work-explorer-native-treeview` is already authored
  and declares this set as its prerequisite; it remains the successor. Session
  3 raises no competing candidate.
