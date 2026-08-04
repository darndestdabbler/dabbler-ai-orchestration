ISSUES FOUND

Fix verdict: L1 matching rates can enter the confirmation workflow -- fix-accepted  
Fix verdict: L2 stale proposals are quarantined after failed refreshes -- accepted-with-modification  
Fix verdict: L3 mismatched Google price lines no longer manufacture flat rates -- fix-accepted  
Fix verdict: L4 -- duplicate-of L1  
Fix verdict: L5 global review rollup waits for every priced model -- fix-accepted  
Fix verdict: L6 apply rejects proposals for repointed aliases -- fix-accepted  
Fix verdict: L7 -- duplicate-of L3  
Fix verdict: L8 configured Google parse failures can still yield partial proposals -- fix-rejected

**Issue 1: Empty parsed price cells still bypass the fatal configured-model path**
- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** Google changes a configured model’s input or output price cell to formatting that `parse_money()` no longer recognizes. This is probable over the scraper’s lifetime because provider-page evolution is the operating condition the fail-loud requirement addresses. The parser treats that model as absent rather than unreadable, writes a proposal for other models, and permits its application while the configured model remains unchecked and potentially stale.
- **Details:**
  - **Violation:** The requirement says, “A parse failure must produce *no proposal*, loudly — never a silent partial.”
  - **Impact:** Operators can apply an apparently valid partial proposal after a configured model’s price parsing failed, materially defeating the session’s pricing-truth objective.
  - **Evidence:** In `_google_section_rates()`, `_priced_lines()` removes every line for which `parse_money()` returns `None`; the subsequent `if not inputs or not outputs: return None` does not produce the empty-row `PageRates` marker. In `build_proposal()`, only `found is not None and not found.rows` raises `PageStructureError`. `found is None` is instead added to `unmatched_config_entries`, followed by `continue`, so proposal generation succeeds.
  - **Location:** `ai_router/pricing_proposal.py`, `_google_section_rates()` and `build_proposal()`.
  - **Fix:** Return an unreadable `PageRates` result when a discovered model section has no parseable input or output prices. Reserve `None` only for sections positively identified as irrelevant to router text pricing. Add a test where one configured Google model’s price cell contains no parseable monetary value and assert that `build_proposal()` and `--fetch` abort and quarantine any previous proposal.

## NITS

- **Nit:** If moving the old proposal to `.stale.json` raises `OSError`, the applicable proposal remains at its original path and `--apply` still accepts it; the warning is not an enforced quarantine. This is a low-probability filesystem failure, so L2 is accepted with modification rather than blocked.