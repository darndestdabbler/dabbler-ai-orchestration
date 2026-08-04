# Model Registry and Pricing Truth Spec

> **Purpose:** The router's model registry has drifted away from what the
> providers actually offer, and its cost figures are wrong in a way nobody
> could see. `router-config.yaml` sends `model_id: gpt-5.6` — **an id OpenAI
> does not list** — which silently resolves to `gpt-5.6-sol` at `$5.00/$30.00`
> while the registry records `$2.50/$15.00`. **Every `gpt-5-6` cost this repo
> has ever reported is exactly half the truth.** Meanwhile `gpt-5.6-luna`
> exists at `$0.20/$1.20` — 25× cheaper — and has never been used; `opus` still
> routes to Opus 4.8 when Opus 5 costs the same; `sonnet` routes to Sonnet 4.6
> when Sonnet 5 is currently *cheaper*; Fable 5 is absent entirely; and
> `gemini-pro` is pinned to 2.5 Pro with only its ≤200k price recorded. This
> set makes the registry **provably** match the providers, and makes its prices
> **confirmed** rather than assumed.
> **Created:** 2026-08-04
> **Prerequisite:** None.
> **Session Set:** `docs/session-sets/109-model-registry-and-pricing-truth/`
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: true         # The safety property of this set is a HUMAN confirming a price diff. If that confirmation screen is unreadable, the whole design fails open and we get another silent placeholder. One short CLI walk, per-set — not a course.
requiresE2E: false        # Router-side Python only. No Explorer-rendering surface, no state writer, no fixture harness, so L-064-12 does not arm. pytest is the executable gate.
uatStyle: ad-hoc
uatScope: per-set
pathAwareCritique: advisory
```

> **Rationale for `advisory` rather than `required`.** The blast radius is wide
> — this set changes which model verifies every session and how every cost is
> computed — which argues for `required`. It is held at `advisory` because the
> *executable* gates here are unusually strong: the enumeration check is a
> falsifier that fails loud, and S2's instrumentation counts real HTTP calls.
> A required critique would add a close-out gate on top of evidence that is
> already machine-checked. Revisit if S2 finds the exclusion genuinely broken.

---

## Project Overview

### The evidence this set starts from — probed live 2026-08-04, do not re-derive

Every number below was obtained by calling the providers, not from memory.

**OpenAI exposes three GPT-5.6 variants, and no bare `gpt-5.6`:**

| requested id | served id (from the response's `model` field) |
| --- | --- |
| `gpt-5.6` | **`gpt-5.6-sol`** |
| `gpt-5.6-luna` | `gpt-5.6-luna` |
| `gpt-5.6-sol` | `gpt-5.6-sol` |
| `gpt-5.6-terra` | `gpt-5.6-terra` |

**Confirmed prices** (per 1M tokens, standard tier, from the providers' own
pricing pages):

| model | input | output |
| --- | --- | --- |
| `gpt-5.6-sol` | $5.00 | $30.00 |
| `gpt-5.6-terra` | $2.00 | $12.00 |
| `gpt-5.6-luna` | **$0.20** | **$1.20** |
| Claude Opus 5 | $5.00 | $25.00 |
| Claude Opus 4.8 | $5.00 | $25.00 |
| Claude Sonnet 5 | **$2.00 / $10.00 through 2026-08-31**, then $3.00 / $15.00 | |
| Claude Sonnet 4.6 | $3.00 | $15.00 |
| Claude Fable 5 | $10.00 | $50.00 |
| Gemini 2.5 Pro | $1.25 (≤200k) / $2.50 (>200k) | $10.00 (≤200k) / $15.00 (>200k) |

**The drift, stated exactly:**

| registry entry | `model_id` | recorded | actual | verdict |
| --- | --- | --- | --- | --- |
| `gpt-5-6` | `gpt-5.6` → **sol** | $2.50 / $15.00 | $5.00 / $30.00 | **understated 2×** |
| `opus` | `claude-opus-4-8` | $5.00 / $25.00 | correct | but Opus 5 is the same price |
| `sonnet` | `claude-sonnet-4-6` | $3.00 / $15.00 | correct | but Sonnet 5 is currently cheaper |
| `gemini-pro` | `gemini-2.5-pro` | $1.25 / $10.00 | correct **≤200k only** | tier not representable |
| `gpt-5-4-mini` | `gpt-5.4-mini` | $0.75 / $4.50 | correct | — |
| — | — | — | — | **Fable 5 absent (`grep` count 0)** |

`claude-opus-5` and `claude-sonnet-5` *do* exist in the registry but are
`is_enabled: false` and annotated *"Identity registry only"* — they exist so an
orchestrator can record what it **is**, never to route work to.

### A second, unexplained observation this set must resolve

A single `route()` call emitted **two** rows in `router-metrics.jsonl`:

```
model=gpt-5-4  provider=openai     tier=3  score=43    fallback_from=None
model=opus     provider=anthropic  tier=3  score=None  fallback_from=None
```

…despite `exclude_providers=["anthropic"]`. Reproducible with and without
`complexity_hint`. `delegation.decision_consensus.enabled` is `false`, so that
is not the cause. This matters in a specific order: **(1)** `exclude_providers`
is the mechanism that guarantees cross-provider verification, **(2)** if it is a
real second call the repo's routed spend is roughly double what it reports, and
**(3)** if it is instead a duplicate metrics row, then the metrics this repo
makes cost *and verifier-identity* claims from are unreliable.

**Do not diagnose this from the logs.** The two hypotheses are distinguished
only by counting actual HTTP requests at the provider-call boundary.

> **Not yet established:** whether `verify_session` is affected. Its five Set
> 108 S4 rounds stamped the exclusion and recorded openai verifiers correctly.
> Treat verification as *unproven*, not as *broken*.

### What this set builds

1. **Enumeration + a drift gate.** Every configured `model_id` must appear in
   its provider's live model list. `gpt-5.6` does not — so this one check,
   which is cheap, catches the entire class.
2. **Served-model recording.** Record what the provider says it *served*, not
   what we asked for. The alias resolution above is invisible otherwise.
3. **A pricing schema that can express reality** — context-tiered rates and
   effective-dated rates — because the current single-value fields cannot.
4. **Scrape-to-propose, never scrape-to-overwrite.** A parser that returns
   nothing is safe; one that returns plausible wrong numbers is worse than the
   placeholder it replaces.
5. **A corrected, deliberate registry**: Opus 5, Sonnet 5, Fable 5, the three
   5.6 variants split, and the cheap variant put where it pays.

### Non-goals

- **No new provider integrations.** OpenAI, Anthropic, Google, and the existing
  Copilot catalog only.
- **No retroactive rewriting of historical metrics rows.** The 2× understatement
  is disclosed and a correction factor is recorded; the raw rows are a ledger
  and stay as written.
- **No automatic price adoption.** A human confirms every rate change, always.
- **No Explorer or extension work.** That is Set 110, which declares this set as
  its prerequisite.
- **No re-litigating which model is "best."** This set makes cost and identity
  *true*; model preference stays the operator's call.

---

## Sessions

### Session 1 of 4: Enumeration, the drift gate, and served-model truth

**Steps:**

1. Register (`start_session`), read the spec.
2. **Build provider enumeration** for openai / anthropic / google, following
   the existing `copilot_catalog.py` + `copilot-catalog.lock` pattern rather
   than inventing a second shape. Endpoints confirmed working: OpenAI
   `GET /v1/models`; Anthropic `GET /v1/models` with `anthropic-version`;
   Google `GET /v1beta/models`.
3. **Write a lockfile** recording, per provider, the ids offered and the probe
   timestamp. It is a cache with a staleness stamp, **not** a live call on every
   session start — the operator has an open complaint about startup latency and
   this must not add three network round-trips to it.
4. **Ship the drift gate:** every `model_id` in `router-config.yaml` must appear
   in its provider's enumeration. A miss **fails loud** and names the offending
   entry. Prove it with `gpt-5.6`, which is the live specimen.
5. **Record the served model.** Capture the `model` field the provider returns
   and persist it alongside the requested id in the metrics row; flag any
   mismatch. This is what makes alias resolution visible.
6. Add tests: enumeration parsing per provider, the gate's fail-loud path, and a
   requested≠served mismatch case.
7. Verify, close.

**Creates:** the enumeration module + its lockfile, and their tests
**Touches:** `ai_router/router-config.yaml` (metadata only — no price edits this session)
**Ends with:** `python -m ai_router.<enumerator> --check` fails loud on the live `gpt-5.6` entry, and a routed call records both requested and served model ids.
**Progress keys:** `enumerationBuilt`, `lockfileWritten`, `driftGateFailsLoudOnGpt56`, `servedModelRecorded`

---

### Session 2 of 4: Routing transparency — what actually gets called

The integrity question, deliberately placed before any price is touched: there
is no point costing calls correctly if we cannot say which calls happen.

**Steps:**

1. Register.
2. **Instrument the provider-call boundary** to count real HTTP requests per
   `route()`, tagged with provider and model.
3. **Reproduce** the two-row observation with
   `task_type="architecture"`, `exclude_providers=["anthropic"]`, with and
   without `complexity_hint`. Determine which hypothesis holds: **a second real
   call**, or **a duplicate/mis-attributed metrics row**.
4. **Check whether `exclude_providers` is honoured on every path**, explicitly
   including the `verify_session` path. State the result plainly either way —
   "verification was never affected" is a valuable finding and must be recorded
   as such, not glossed.
5. **Fix what the evidence supports**, and nothing more. If it is a duplicate
   row, fix the recorder. If it is a real call, fix the router or document why
   the call is intentional.
6. Add a regression test that pins the invariant: an excluded provider never
   appears in the metrics rows for that call.
7. Verify, close.

**Creates:** `.../s2-routing-transparency-findings.md`
**Touches:** the router's call/metrics path plus its tests
**Ends with:** the number of real HTTP calls per `route()` is known and asserted, and `exclude_providers` is proven honoured (or fixed) on every path including verification.
**Progress keys:** `callBoundaryInstrumented`, `twoRowMysteryResolved`, `exclusionProvenOrFixed`, `regressionTestAdded`

---

### Session 3 of 4: A pricing schema that can be true, and scrape-to-propose

**Steps:**

1. Register.
2. **Extend the pricing schema** to express what the providers actually charge:
   - **context-tiered rates** — Gemini 2.5 Pro is $1.25/$10.00 at ≤200k and
     $2.50/$15.00 above it, and the current single-value fields silently record
     only the cheap tier;
   - **effective-dated rates** — Claude Sonnet 5 is $2.00/$10.00 **through
     2026-08-31** and $3.00/$15.00 from 2026-09-01. A scrape-once design goes
     silently wrong on that date, which is the exact failure mode this set
     exists to end;
   - a per-model **`confirmed_on`** stamp, replacing the single global
     `pricing_reviewed` date.
3. **Build the scraper as a proposal generator.** Fetch the three published
   pricing pages, parse, and emit a **diff against the config** — never a
   write. Sources: OpenAI `developers.openai.com/api/docs/pricing`, Anthropic
   `platform.claude.com/docs/en/about-claude/pricing`, Google
   `ai.google.dev/gemini-api/docs/pricing`. All three were confirmed parseable
   on 2026-08-04.
4. **A human accepts or rejects each change**, and only acceptance writes the
   value and stamps `confirmed_on`. A parse failure must produce *no proposal*,
   loudly — never a silent partial.
5. Make cost computation honour tiers and effective dates.
6. Tests: tiered selection at the boundary, effective-date selection across
   2026-08-31/09-01, parser fixtures per provider, and the fail-loud path.
7. Verify, close.

**Creates:** the scraper/proposal module, per-provider parser fixtures, tests
**Touches:** the pricing schema, the cost calculator, `router-config.yaml`
**Ends with:** the schema expresses tiered and effective-dated prices; the scraper proposes a diff and cannot write without confirmation; a parse failure yields no proposal.
**Progress keys:** `schemaSupportsTiers`, `schemaSupportsEffectiveDates`, `scraperProposesOnly`, `confirmedOnStamped`, `costHonoursTiers`

---

### Session 4 of 4: Correct the registry, put the cheap model where it pays, walk it

**Steps:**

1. Register.
2. **Re-point the aliases**, each with its reason recorded in the entry:
   - `opus` → **Opus 5** (identical price to 4.8 — a free upgrade);
   - `sonnet` → **Sonnet 5** (currently *cheaper* than 4.6, and newer);
   - add **Fable 5**, which is absent today;
   - split `gpt-5-6` into **`gpt-5-6-luna` / `-sol` / `-terra`** with explicit
     `model_id`s, and **retire the bare `gpt-5.6`** so nothing can silently
     alias again;
   - re-check `gemini-pro`, which is pinned to 2.5 Pro while 3.x is available.
     Propose, do not unilaterally switch a verifier.
3. **Put the cheap variant where it pays.** Discovery runs a two-way fan-out of
   *identical prompts* — the single most obvious place for Luna at 1/25th of
   Sol's rate. Adjudication and the pinned `session-verification` verifier are
   the deliberate exception. Record the reasoning per pin.
4. **Reconcile the cost record.** Publish the 2× correction factor for
   historical `gpt-5-6` rows (Set 108 S4 reported $0.5916; the true figure is
   ~$1.18). Do **not** rewrite the raw ledger.
5. **Walk the confirmation flow** — the UAT item. Run the scraper against live
   pages, read the proposed diff as an operator would, accept and reject at
   least one change each, and confirm the stamps. A confusing diff is a defect.
6. Author `109-model-registry-and-pricing-truth-uat-checklist.json` from that
   walk — **~4 items, derived from the acceptance criterion**, literal
   copy-pasteable `HumanAction`, literal-string `Expectation`, quality bar
   stated once in the preamble.
7. Verify, close. Author `change-log.md`, run the Step 9 review, run the
   advisory path-aware critique.

**Creates:** `.../109-model-registry-and-pricing-truth-uat-checklist.json`, `.../s4-walk-evidence.md`, `.../change-log.md`
**Touches:** `ai_router/router-config.yaml`, the task-type pins, `ai_router/CHANGELOG.md`
**Ends with:** every routed model id is enumerated and priced from a confirmed source; the discovery fan-out runs on the cheap variant; the bare `gpt-5.6` alias is gone; the historical understatement is disclosed.
**Progress keys:** `aliasesRepointed`, `fable5Added`, `fiveSixSplit`, `lunaOnFanOut`, `costRecordReconciled`, `uatChecklist`, `stepNineReview`

---

## End-of-set deliverables

- Provider enumeration + lockfile + a drift gate that fails loud on an id the provider does not offer.
- Requested-vs-served model recording, so an alias can never resolve invisibly again.
- A pricing schema expressing context tiers and effective dates, with per-model `confirmed_on`.
- A scrape-to-propose flow that cannot write a price without human acceptance.
- A corrected registry: Opus 5, Sonnet 5, Fable 5, the 5.6 variants split, Luna on the discovery fan-out.
- A resolved answer on the two-metrics-row anomaly and the state of `exclude_providers`.
- `change-log.md`, the Step 9 review, the advisory path-aware critique, and a ~4-item UAT checklist.

---

## Risks this set should expect

- **A scraper is a new silent-staleness surface.** It replaces one failure mode
  with another unless it fails loud and proposes rather than writes. The
  proposal-only rule is the mitigation and it is not negotiable.
- **The Sonnet 5 introductory price expires on 2026-08-31**, 27 days after this
  spec was written. If this set ships without effective-date support, it will be
  wrong within the month — by construction.
- **Changing the verifier model changes verification behaviour.** Set 090's
  notes record that gpt-5-4 produced false-positive Majors on small meta-work
  sets, which is why gpt-5-6 is pinned. Moving the fan-out to a cheaper variant
  may change finding quality; that is an empirical question, and the pin should
  move only with evidence, not with the price list.
- **The two-row anomaly may implicate verification integrity.** If
  `exclude_providers` turns out to be unreliable on any path used by
  `verify_session`, that is operator-escalation material, not a quiet fix.
- **Provider pages change shape.** Parser fixtures capture today's structure;
  the gate must distinguish "page changed, cannot parse" (loud, no proposal)
  from "price changed" (a proposal).
