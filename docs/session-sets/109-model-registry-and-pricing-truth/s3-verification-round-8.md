ISSUES FOUND

- **Issue 1: Periodic OpenAI reviews propose deleting an already-encoded long-context tier**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** An operator follows the tool’s documented instruction for an OpenAI model—“add a `pricing:` row with an explicit `max_input_tokens`”—and records both short- and long-context rates. On every subsequent `--fetch`, `parse_openai()` places only the short-context rate in `rows` and the long-context rate in non-writable `observations`. `build_proposal()` therefore compares the valid tiered declaration against a proposed flat declaration and emits an `update`. Accepting it removes the tier and silently restores long-context underbilling; rejecting it leaves the model without a sanctioned path to refresh `confirmed_on`. This is probable because it is the workflow the changelog and proposal observation explicitly tell operators to use.
  - **Details:**
    - **Violation:** The task requires the scraper to “emit a **diff against the config**” while the schema and cost computation preserve context-tiered pricing. The implementation also says the OpenAI observation exists “for a human to encode with an explicit `max_input_tokens`.” The next scrape must not classify that sanctioned encoding as a change back to flat pricing.
    - **Impact:** The normal periodic review either deletes a real long-context tier—causing materially understated costs—or forces the operator to reject the proposal forever, preventing confirmation refresh. That directly recreates the silent under-reporting this session is intended to eliminate.
    - **Evidence:** `parse_openai()` always sets:
      ```python
      rows=[{"input_cost_per_1m": short_in, "output_cost_per_1m": short_out}]
      ```
      and stores `long_in`/`long_out` only in `observations`. `_proposed_declaration(found.rows)` consequently produces flat fields. `_normalized(current) != _normalized(proposed)` for any correctly tiered current declaration, so `build_proposal()` emits an `update`. If accepted, `apply_changes()` removes `pricing` and writes those flat fields.
    - **Location:** `ai_router/pricing_proposal.py` — `parse_openai()`, `build_proposal()`, `_proposed_declaration()`, and `apply_changes()`.
    - **Fix:** When the current declaration already contains a compatible OpenAI context-tier structure, preserve its human-supplied boundary and compare/propose the parsed short and long rates against the corresponding rows. If the structure cannot be bound unambiguously, emit a non-destructive review item or refuse proposal generation; never propose flattening the schedule.

#### NITS

- **Nit:** `validate_model_rates()` treats explicit `pricing: null` as absence because it uses `entry.get(PRICING_KEY)`. This contradicts the fail-closed validation claim and can resolve an accidentally blank declaration to zero. Detect `PRICING_KEY in entry` and reject null.
- **Nit:** `--apply` checks alias and `model_id`, but not provider or whether the live declaration still equals the proposal’s recorded `current`. A same-model edit between fetch and apply can be overwritten or freshly stamped without matching the reviewed evidence.
- **Nit:** A proposal has no freshness limit. An old accepted proposal can be applied much later and stamped with the application date rather than the scrape date.
