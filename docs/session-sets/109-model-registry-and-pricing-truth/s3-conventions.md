# Verification conventions — Set 109, Session 3

Read this before the diff. It states the agreed baseline so a round spends its
findings on real defects rather than on the baseline itself.

## What this session was authorised to build

Session 3 of 4 of `109-model-registry-and-pricing-truth`, titled *"A pricing
schema that can be true, and scrape-to-propose"*. Its authored plan: extend the
pricing schema to express **context-tiered** rates (Gemini 2.5 Pro is
$1.25/$10.00 at ≤200k and $2.50/$15.00 above it) and **effective-dated** rates
(Sonnet 5 is $2.00/$10.00 through 2026-08-31, $3.00/$15.00 after), plus a
per-model `confirmed_on` stamp; build the scraper as a **proposal generator**
that emits a diff and never a write; make a human accept or reject each change,
with **only acceptance** writing the value and stamping `confirmed_on`; make a
parse failure produce **no proposal, loudly**; make cost computation honour
tiers and effective dates; and test tiered selection at the boundary,
effective-date selection across 2026-08-31/09-01, per-provider parser fixtures,
and the fail-loud path.

**Creates:** the scraper/proposal module, per-provider parser fixtures, tests.
**Touches:** the pricing schema, the cost calculator, `router-config.yaml`.
**Ends with:** the schema expresses tiered and effective-dated prices; the
scraper proposes a diff and cannot write without confirmation; a parse failure
yields no proposal.

All three clauses are met, and each is pinned by a test rather than asserted in
prose. The parsers additionally run against **verbatim slices of the real
pages**, so "it parses" means it parses the HTML the providers actually served
on 2026-08-04, not a hand-written approximation.

## Suite baseline

- `python -m pytest -m "not e2e"`: **3368 passed, 6 skipped, 8 deselected, 0
  failed** (23m14s). No tracked failures; the baseline is fully green.
- The prior baseline entering this session was S2's **3257 passed, 6 skipped,
  8 deselected, 0 failed**. The delta is **+111**, exactly the two new test
  files — no existing test was changed, removed, or newly skipped.
- **That full run predates four tests added afterwards** (the consumer-wiring
  section at the end of `test_pricing_schema.py`, plus the `conftest.py` alias
  they exposed the need for). Those four and their neighbours pass — the
  targeted run is 141 passed across `test_pricing_schema`,
  `test_pricing_proposal`, `test_config` and `test_metrics` — and a second full
  run is under way. Stated plainly rather than rounded up: the 3368 figure is
  from the tree one commit before the final one.
- **Falsifier checks performed**, both restored afterwards:
  1. `_calculate_cost` reverted to the pre-session flat two-field read →
     `test_calculate_cost_honours_the_context_tier` fails. The wiring is
     pinned, not just the resolver.
  2. The sort scalar flipped from worst-case to cheapest-available (the
     alternative both routed designs proposed) → two tests fail. The choice is
     pinned, not incidental.
- New tests: **115**, all passing, **none opening a socket**. The fetch path is
  driven through `httpx.MockTransport`; the parsers run over committed page
  slices; the apply path writes to a `tmp_path` copy.
- `python ai_router/scripts/drift_guard.py` — OK.
- `python ai_router/scripts/tutorial_gate.py` — OK.
- `python -m ai_router.guidance_report --check` — OK (10,895 / 12,000 tokens).
- `python -m ai_router.model_inventory --check` — still exits **1** on the
  `gpt-5-6` and `gemini-3-pro` specimens, unchanged by this session (by-design
  item 1).
- The `-m e2e` mark (git-fixture orchestrator harness) is excluded, matching
  the repo's pre-commit run. It is unaffected by this session's changes.
- No TypeScript, extension, webview, state-writer, or fixture-harness surface
  was touched, so Layers 2 and 3 do not arm (`requiresE2E: false`, and
  L-064-12's trigger conditions are not met). pytest is the executable gate.

## Release contract

- Router-side only. `ai_router/CHANGELOG.md` gains **`[Unreleased]`** entries;
  **no version bump and no PyPI publish** — publishing is operator-gated and
  recorded at release time.
- The extension is untouched; no VSIX, no Marketplace action.
- `ruamel.yaml` is **not** added as a runtime dependency. It is lazily required
  inside `--apply` only, mirroring `migrate_router_config`'s existing pattern,
  and stays in the `[migration]` optional extra it already lives in.

## By-design, and deliberately not defects

1. **No rate in `router-config.yaml` was corrected, and the repository still
   FAILS `model_inventory --check`.** Both are deliberate and both are Session
   4's job. This set's own rule is that *a human confirms every rate change,
   always*; the flow that makes that possible only exists as of this session,
   so hand-editing five rates here would have meant breaking the rule in the
   act of implementing it. A finding that "the prices are still wrong" or "the
   `gpt-5.6` alias is still there" is re-reporting the spec.

2. **Every `models:` entry is unstamped, so the load-time warning fires on
   every run.** `confirmed_on` is absent everywhere because nothing has been
   human-confirmed under this regime yet. That is the honest state and it is
   temporary by construction — S4 stamps them by accepting proposals. Absence
   is deliberately **not** a validation error: turning it into one would only
   pressure someone into stamping an unverified number.

3. **`metadata.pricing_reviewed` was KEPT, against the spec's wording.** The
   spec says `confirmed_on` replaces it. The VS Code extension's Cost Dashboard
   renders its staleness banner from that exact field
   (`docs/repository-reference.md` records this), and "no Explorer or extension
   work" is an explicit **non-goal** of this set — deleting the field would
   have broken a shipped surface this session is not permitted to touch. It
   survives as a maintained rollup (the oldest per-model stamp) written by
   `--apply`, so it cannot drift from the stamps it summarises. This is flagged
   for the Step 9 review as a spec line that could not be followed as written;
   it is not an oversight.

4. **OpenAI's long-context rates are read but never proposed.** The page
   publishes both rate columns for every model and never states where the
   short/long boundary falls — the "272K" figure lives only in a separate
   embedded payload, per-model. Proposing a tier would require manufacturing
   the one number the page does not state, which is precisely the
   plausible-wrong-number failure this module exists to prevent. The pair is
   carried as an `observations` entry with a note telling the operator how to
   encode it deliberately.

5. **Only standard per-token input/output rates are parsed.** Cached-input,
   cache-write, Anthropic's 5m/1h cache columns, Google's Batch/Flex/Priority
   sections, free tiers, storage and grounding rows are all ignored on purpose
   — the router bills none of them, and every extra column read is another way
   to bind the wrong number. On Google the exclusion is load-bearing rather
   than tidy: Batch is exactly **half** Standard, so a parser one section over
   would understate by 2×. `test_google_reads_standard_and_never_batch` pins it.

6. **Structural assertions are deliberately narrow.** Only the header and
   row-label text the extraction actually depends on. Row counts, CSS class
   names, and model-name prose are **not** asserted, because models come and go
   and sites restyle, and an assertion that fires on harmless churn trains an
   operator to ignore it. The four `*_is_fatal` tests pin the assertions that
   do exist; `test_a_changed_price_is_NOT_fatal` pins the contrast.

7. **Requests-to-rows and proposal-to-config are both intentionally
   asymmetric.** A model the page never mentions is reported as *not checked*
   rather than proposed or skipped; a page row no entry claims is listed as
   information. Neither is an error — the tool updates existing rates and does
   not add models, which is S4's curation work.

8. **`conftest.py` gained `pricing` in its shared-module aliasing list.**
   Required, not incidental, and the same mechanism S2 used for `call_trace`.
   `pricing` defines `PricingError`, and `config` — which validates every entry
   at load — is itself imported both bare and package-qualified by the suite.
   Without the alias, the exception raised by a bare-imported `config` is a
   *different class object* from `ai_router.pricing.PricingError`, so an
   `except PricingError` written against the package path silently fails to
   catch it. This session's own wiring test exposed it.

9. **Edits beyond the declared Touches.** `.gitignore` gains
   `ai_router/pricing-proposal.json` (a transient review artifact — the durable
   record is the resulting config diff plus its stamps). `CHANGELOG.md` records
   two new public modules and a behaviour change, which is what a release
   record is for. `conftest.py` is item 8. Flagged here rather than done
   quietly.

10. **The `Unreleased` changelog section is shared with Sets 105 and 107.**
    That predates this session; entries are prefixed `(Set 109 S3)` in the
    established style.

## What this session found that the spec did not know

`s3-live-proposal-evidence.md` records two discoveries from the first live run,
both owed to Session 4:

- **`gpt-5-5` is understated 2×** ($2.50/$15.00 recorded, $5.00/$30.00
  published) for a *different* reason than `gpt-5-6`: `gpt-5.5` is a real id
  OpenAI lists, so S1's drift gate passes it. Its rates were copied from
  `gpt-5.4` when the entry was added, and its own note says `PLACEHOLDER` in as
  many words. Spend impact is **negligible and that is luck** — the ledger
  holds exactly one `gpt-5-5` row at $0.0003, counted before the claim was
  published, after a first draft overstated it.
- **The spec's reconciliation figure is an order of magnitude too small.** It
  cites Set 108 S4's slice ($0.5916 → ~$1.18); the whole ledger holds **245**
  `gpt-5-6` rows totalling **$48.95** reported, so the true figure is ~$97.90.

## What was excluded from the evidence diff, and why

Declared rather than done quietly. Four files are held out of the bundle **on
top of** the framework's default exclusions. Everything held out is either
verbatim third-party markup or raw model output; **no code, no test, and no
prose this session authored is excluded.**

- `ai_router/tests/pricing_page_fixtures.py` — 41 KB of provider HTML captured
  byte-for-byte, most of it inline CSS. Reviewing it means reviewing OpenAI's
  stylesheet. Its docstring (which *is* worth reading, and states exactly which
  rows were dropped from each page) is quoted in item 6 above and in the
  module's own header. The tests that consume it are fully in the diff.
- `s3-ai-assignment-analysis.json`, `s3-pricing-schema-design.json`,
  `s3-scraper-design.json` — the three routed advisory artifacts, each a single
  enormous JSON line of raw model output. They are records of what was
  recommended, not deliverables; where they were adopted or overridden is
  written in prose in `ai-assignment.md`, which **is** in the diff.

The first attempt at this round included all four and the routed call **timed
out** (3 × 300s), returning nothing — the same transport ceiling that cost this
session two design calls earlier. Removing them cut the bundle from 243,419 to
175,802 characters.

## Severity rubric for this round (L-095-1)

Grade by **consequence**: probability the stated failure scenario materialises
for a real user × impact on this session's objectives. Low probability **or**
low impact is **Minor**, even when technically correct. A finding with no
plausible failure scenario is **Minor by definition**. Please state a concrete
failure scenario — inputs/state → wrong behaviour — for anything graded
Critical or Major.
