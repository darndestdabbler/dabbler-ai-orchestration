ISSUES FOUND

- **Issue 1: Anthropic multi-row models can yield an incomplete effective-date proposal when one row fails to parse**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** Anthropic reformats either of Claude Sonnet 5’s two pricing rows so one rate no longer matches `parse_money()`, while the other row remains readable. Row-level pricing changes and formatting drift are probable over the lifetime of a live-page scraper, and Sonnet 5 necessarily uses multiple rows. The parser then returns the surviving row as a valid proposal instead of aborting.
  - **Details:**
    - **Violation:** The task requires: “A parse failure must produce *no proposal*, loudly — never a silent partial.”
    - **Impact:** If the future row becomes unreadable, the proposal contains only the introductory `$2/$10` row and can make that price permanent after 2026-09-01. If the introductory row becomes unreadable, the surviving future-dated row is accepted by validation, and `resolve_rates()` applies it before its effective date through its earliest-period fallback. Either result materially defeats effective-dated pricing.
    - **Evidence:** In `parse_anthropic()`, an unreadable row uses:
      ```python
      out.setdefault(display, _unreadable(...))
      ```
      while a readable sibling uses:
      ```python
      out.setdefault(display, PageRates()).rows.append(entry)
      ```
      `setdefault()` never replaces an existing value. Therefore:
      - an unreadable second row is discarded because the first row already created `PageRates`;
      - an unreadable first row remains as an observation, but the readable second row is appended to the same object, making `found.rows` nonempty and bypassing `build_proposal()`’s fatal unreadable check.
      
      In the latter case, `render_proposal()` also expects every observation to have `label` and rate fields, so the unreadable observation can raise `KeyError` after the proposal file has already been written.
    - **Location:** `ai_router/pricing_proposal.py` — `parse_anthropic()`, `build_proposal()`, and `render_proposal()`.
    - **Fix:** Track unreadability per display name independently of parsed rows. If any pricing row for a model is unreadable, return only an unreadable marker for that model and discard all sibling rows so a configured model triggers `PageStructureError`. Add tests for both the introductory and future Sonnet 5 rows becoming unreadable, asserting no proposal is written and any old proposal is quarantined.

- **Issue 2: Recognized provider structures can still disappear into the non-fatal “absent” path**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** Google renames `Input price`/`Output price` within an otherwise recognized configured model’s Standard table, or OpenAI changes one configured row’s column shape or decorates its model ID with a footnote. Such localized markup evolution is the expected operating condition for this scraper. The parser omits the model from its result, `build_proposal()` classifies it as genuinely absent, and an applicable proposal is produced for the remaining models.
  - **Details:**
    - **Violation:** The task requires no proposal after a parse failure. The changelog also claims: “all three parsers now record a row they could not read rather than skipping past it, so ‘absent’ means absent.”
    - **Impact:** Operators can accept and apply a partial review while a configured model’s pricing failed to parse, undermining the proposal’s central all-or-nothing safety guarantee.
    - **Evidence:** The current code still contains dictionary-miss paths:
      - `_google_section_rates()` returns `None` whenever either expected price row is not found:
        ```python
        if input_cell is None or output_cell is None:
            return None
        ```
        `parse_google()` then omits that recognized model section entirely, and `build_proposal()` treats `found is None` as non-fatal absence.
      - `parse_openai()` silently skips any row whose cell count is not exactly nine:
        ```python
        if len(row) != 9 or not row[0]:
            continue
        ```
      - An OpenAI footnote changes the dictionary key itself; storing `_unreadable()` “under the row’s own name” does not help because the configured bare model ID still misses that altered key.
      
      These paths directly contradict the claim that parse failures can no longer masquerade as absence.
    - **Location:** `ai_router/pricing_proposal.py` — `_google_section_rates()`, `parse_google()`, `parse_openai()`, and `build_proposal()`.
    - **Fix:** Preserve recognized model identity separately from successful rate extraction. A recognized Google model/Standard section lacking expected pricing rows should produce an unreadable marker, not `None`; unconfigured markers can still be ignored by `build_proposal()`. OpenAI malformed pricing rows should fail structurally or extract and validate a canonical API-ID token rather than silently skipping. Add configured-model tests for renamed Google row labels, altered OpenAI row cardinality, and decorated OpenAI IDs.

#### NITS

- **Nit:** `validate_model_rates()` treats explicit `pricing: null` as if the key were absent because it uses `entry.get(PRICING_KEY)`. A blank structured declaration can therefore load and resolve to zero cost. Distinguish `PRICING_KEY in entry` from absence and reject `null`.

- **Nit:** `apply_changes()` verifies only alias existence and `model_id`, not that the current provider and pricing declaration still match the proposal’s recorded `current`. An out-of-band same-model rate edit between fetch and apply can therefore be overwritten or freshly stamped without having been reviewed.

- **Nit:** When `changes` is empty but `unmatched_config_entries` is nonempty, `render_proposal()` first prints “every configured rate matches,” and `--fetch` exits zero, before later printing `NOT CHECKED`. The later warning makes this recoverable, but the success headline and exit status overstate the result.