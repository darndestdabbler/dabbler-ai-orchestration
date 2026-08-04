ISSUES FOUND

Fix verdict: L1 matching rates can receive confirmation stamps -- fix-accepted  
Fix verdict: L2 failed refresh quarantines the previous proposal -- fix-accepted  
Fix verdict: L3 partially unparseable Google price cells still fail open -- fix-rejected  
Fix verdict: L4 -- duplicate-of L1  
Fix verdict: L5 rollup waits until every priced model is stamped -- fix-accepted  
Fix verdict: L6 apply rejects proposals after model-id repointing -- fix-accepted  
Fix verdict: L7 -- duplicate-of L3  
Fix verdict: L8 configured unreadable Google models abort proposal generation -- fix-accepted  
Fix verdict: L9 wholly unparseable price cells are treated as fatal -- fix-accepted

- **Issue 1: Partially unparseable multi-rate cells can still produce plausible Google rates**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** Google adds or reformats one tier in both input and output cells using notation `parse_money()` does not recognize while leaving the other tiers recognizable. `_priced_lines()` silently removes only the unreadable tier; if the remaining input and output counts and bounds agree, `_google_section_rates()` returns a structurally valid, incomplete tier schedule. A configured model therefore receives an applicable proposal instead of aborting. This is probable because provider-page and tier-format evolution is the expected operating condition of this scraper, and the resulting reduced schedule contains plausible published numbers that an operator may accept.
  - **Details:**
    - **Violation:** The task requires, “A parse failure must produce *no proposal*, loudly — never a silent partial.” It also contradicts the Round 1 L3/L7 remediation claim that Google’s plausible-price fail-open paths were removed.
    - **Impact:** A missing intermediate or upper tier can cause materially incorrect cost computation after acceptance, defeating the session’s objective of accurately honoring context-tiered pricing. This should block merge because the scraper can still transform a parse failure into a valid-looking proposal.
    - **Evidence:** `_priced_lines()` constructs tuples and then unconditionally discards every line whose parsed value is `None`:
      ```python
      priced = [(parse_upper_bound(ln), parse_money(ln), ln) for ln in lines]
      priced = [(b, v, ln) for b, v, ln in priced if v is not None]
      ```
      It never compares the surviving count with `lines`. For example, three raw tiers on each side can become two surviving tiers with matching bounds and one unbounded row. That passes every subsequent check, produces nonempty `PageRates.rows`, and therefore bypasses `build_proposal()`’s fatal unreadable branch. This explicitly challenges the Round 1 L3/L7 remediation with evidence from the remediation helper itself.
  - **Location:** `ai_router/pricing_proposal.py`, `_priced_lines()` and `_google_section_rates()`.
  - **Fix:** Make an unparseable nonblank line in an Input/Output price cell produce the unreadable marker rather than silently dropping it, unless the parser explicitly recognizes that line as a harmless annotation. Add a configured-model test where only one tier on each side is unparseable and assert that proposal generation aborts and quarantines any previous proposal.