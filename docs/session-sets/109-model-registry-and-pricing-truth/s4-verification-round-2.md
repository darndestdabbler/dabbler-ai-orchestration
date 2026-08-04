ISSUES FOUND

- **Issue 1: `--fetch` still exits successfully when configured models were not checked**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A provider removes a pricing row or changes one section of its page while the rest remains parseable. The affected routable model enters `unmatched_config_entries`, but with no rate changes or held entries the command exits 0. A recurring CI or cron check therefore certifies stale pricing as clean. Provider-page changes are explicitly identified as an expected risk, making this a probable main-path failure rather than a hypothetical shape.
  - **Location:** `ai_router/pricing_proposal.py`, `main()`
  - **Details:**
    - **Violation:** The task requires the gate to distinguish *“page changed, cannot parse” (loud, no proposal)* from a clean result. The implementation also states that exit 0 must not let automation record unchecked rates as verified.
    - **Impact:** The scrape-to-propose gate can silently miss exactly the pricing drift it is intended to detect.
    - **Evidence:** `build_proposal()` populates `unmatched_config_entries`, and `render_proposal()` labels them `[x] NOT CHECKED`, but `needs_attention` only checks:
      ```python
      proposal["changes"] or proposal.get("not_comparable_entries")
      ```
      It ignores `unmatched_config_entries`.
  - **Fix:** Make unmatched routable or priced entries force a nonzero exit. Explicitly classify unpriced disabled identity-only entries as informational if they should not block, rather than treating every unmatched entry identically.

- **Issue 2: Historical correction notes apply old correction factors to newly and correctly priced rows**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A later session uses `gpt-5-5` or `gemini-3-1-pro` after the corrected registry landed, then runs `cost_report`. The report aggregates old and new rows under the same alias and multiplies the entire aggregate by the historical factor, falsely stating that correctly priced calls are understated. These aliases remain enabled and already have historical usage, so repeated use and mixed-period reports are probable.
  - **Location:** `ai_router/cost_report.py`, `historical_correction_notes()`
  - **Details:**
    - **Violation:** The implementation claims: *“It stops applying once a row is written under the corrected registry”* and the generated note says only *“rows dated before `corrected_on`”* are affected.
    - **Impact:** The new cost-truth disclosure itself produces materially false cost estimates. A sufficiently large correctly recorded `gpt-5-5` total could be presented as roughly twice its true value.
    - **Evidence:** `historical_correction_notes()` receives only aggregate `by_model` data and calculates:
      ```python
      reported = float(data.get("cost") or 0.0)
      reported * correction["factor"]
      ```
      It never reads or filters row timestamps. The JSON report uses the same helper.
  - **Fix:** Compute correction disclosures from individual metrics rows before aggregation, applying each factor only to rows before the actual registry-change cutoff. Alternatively, disclose the historical defect without calculating a report-specific “true” amount when the report cannot separate old and new rows.

- **Issue 3: The discovery pin was moved to Luna without the empirical quality evidence required by the plan’s risk control**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** Every normal verification discovery fan-out now uses Luna for both discovery calls. If the cheaper variant misses defect classes Sol finds, those findings never enter discovery synthesis or adjudication, reducing the breadth the fan-out exists to provide. This exposure occurs on every verification run, and the specification explicitly anticipated behavior changes when moving to the cheaper variant.
  - **Location:** `ai_router/router-config.yaml`, `verification.discovery.model`; `s4-walk-evidence.md`; `ai-assignment.md`; `test_discovery_model_preference.py`
  - **Details:**
    - **Violation:** The risk contract says: *“Moving the fan-out to a cheaper variant may change finding quality; that is an empirical question, and the pin should move only with evidence, not with the price list.”*
    - **Impact:** Verification integrity may be traded away without measuring it, despite the session explicitly requiring evidence before that change.
    - **Evidence:** The supplied evidence establishes routing behavior, price, and historical fan-out overlap. The cited Set 096 Jaccard figures show that repeated reads produce different findings; they do not compare Luna’s recall or finding quality with Sol’s. The tests only prove that Luna is selected and that invalid preferences fall back safely. No controlled Luna-versus-Sol evaluation or acceptance threshold is present.
  - **Fix:** Run both variants over representative historical verification bundles with known findings, compare recall and material false negatives, record an acceptance threshold, and retain Sol until Luna satisfies it.

### NITS

- **Nit:** UAT checklist item 4 is internally inconsistent. After item 3, a fresh fetch has the two rejected identity-entry proposals; marking one `accept` leaves one `pending`, but the expectation says two pending entries will be reported.

- **Nit:** The GPT-5.6 registry comment says the old alias had “245 calls and ~$49,” while the reconciliation and changelog report 254 rows and `$51.0383`.

- **Nit:** The `gpt-5-5` and `gemini-3-1-pro` notes still describe their rates as placeholders that must be confirmed, despite their new `confirmed_on` stamps and corrected pricing declarations.