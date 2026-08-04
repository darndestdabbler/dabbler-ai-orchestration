ISSUES FOUND

- **Issue 1: Matching prices can never be confirmed or have `confirmed_on` refreshed**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** After the initial corrections, an operator performs the normal periodic review and every published price still matches the config. `build_proposal()` emits no changes, `--apply` has nothing to accept, and none of the models receive a new `confirmed_on`. This is guaranteed on an unchanged-price review, so all stamps eventually become stale with no sanctioned way to refresh them.
  - **Details:**
    - **Violation:** The work promises a per-model “`confirmed_on` stamp” recording when a human confirmed each entry and states that S4 will stamp entries by accepting proposals.
    - **Impact:** The confirmation regime cannot support routine re-confirmation. Worse, the first partial apply advances `metadata.pricing_reviewed` using only stamped models, so the extension can report globally fresh pricing while most models remain unconfirmed.
    - **Evidence:** `build_proposal()` executes `continue` when `_normalized(current) == _normalized(proposed)`. Only entries in `changes` can be returned by `accepted_changes()` and stamped by `apply_changes()`. The rollup calculation excludes models lacking `confirmed_on` before taking `min(stamps)`.
    - **Location:** `ai_router/pricing_proposal.py` — `build_proposal()`, `accepted_changes()`, and `apply_changes()`.
    - **Fix:** Emit separately accept/reject-able confirmation records for checked models whose values match, allowing acceptance to refresh only `confirmed_on`. Do not advance the global rollup to a fresh date while any priced model remains unstamped; represent that state as unreviewed/stale.

- **Issue 2: A failed refresh leaves a stale proposal available for application**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** An operator generates and edits a proposal, later reruns `--fetch` to refresh it, and one provider fetch or parser fails. The command reports that no proposal was written, but the old accepted proposal remains at the default path. A subsequent `--apply` accepts that stale artifact and stamps its old values as confirmed today. Repeated refreshes and transient provider failures are normal for a live-page tool, making this a probable lifecycle failure.
  - **Details:**
    - **Violation:** The requirement says a parse failure must produce “**no proposal, loudly**,” and the implementation says, “No proposal was written.”
    - **Impact:** A failed scrape can still leave an apparently actionable proposal, undermining the central fail-closed guarantee and allowing stale rates to be stamped as newly confirmed.
    - **Evidence:** On `PageStructureError`, `main()` returns `EXIT_FATAL` without deleting or invalidating `proposal_path`. `--apply` subsequently loads whatever file already exists there, with no failed-refresh marker, freshness limit, or source-state validation.
    - **Location:** `ai_router/pricing_proposal.py` — `main()` fetch failure path and `load_proposal()`.
    - **Fix:** Remove or atomically invalidate the target proposal before fetching, or write each run to a generation-specific temporary path and atomically replace the canonical proposal only after all providers parse successfully. Reject stale proposals during apply.

- **Issue 3: Google parser mismatches can silently become plausible flat prices instead of failing loudly**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** Google changes a model’s Standard table so input has two context-tier lines while output has one common line, or one side gains an additional modality line. The parser silently selects the first input and output values and emits a flat rate. For a long-context call this can understate cost, and a human may accept the proposal because it appears structurally valid. Pricing-page shape evolution is expected over the lifetime of this scraper, and this is exactly the plausible-wrong-number failure the session was intended to prevent.
  - **Details:**
    - **Violation:** The requirement states, “A parse failure must produce *no proposal, loudly*,” while the module claims unfamiliar page shapes are fatal.
    - **Impact:** A changed table can generate an authoritative-looking but incorrect proposal rather than aborting, materially defeating scrape-to-propose safety.
    - **Evidence:** `_google_section_rates()` handles `len(inputs) != len(outputs)` by returning a flat `PageRates` built from `inputs[0]` and `outputs[0]`. OpenAI and Anthropic also skip malformed individual rows while succeeding if any other row parses, allowing row-local parse failures to masquerade as omitted models.
    - **Location:** `ai_router/pricing_proposal.py` — `_google_section_rates()`, plus row-skipping branches in `parse_openai()` and `parse_anthropic()`.
    - **Fix:** Raise `PageStructureError` for unequal input/output cardinality unless an explicitly validated provider shape explains it. Treat recognizable pricing rows whose required cells or money values cannot be parsed as fatal rather than silently skipping them.

#### NITS

- **Nit:** `apply_changes()` itself does not enforce decisions; passing a `pending` or `reject` change directly still writes it. The documented CLI filters through `accepted_changes()`, so this is a lower-probability API bypass. **Location:** `ai_router/pricing_proposal.py::apply_changes()`. **Fix:** Validate that every supplied change has `decision == "accept"` or make the writer private and accept a validated type.

- **Nit:** Apply has no optimistic concurrency check. It does not verify that the current alias still has the proposal’s `provider`, `model_id`, or `current` declaration, so a proposal can overwrite rates after an alias is repointed or its pricing changes. **Location:** `apply_changes()`. **Fix:** Compare proposal identity and normalized `current` against the live YAML before mutating anything.

- **Nit:** `confirmed_on` uses the application date while the rates may come from an arbitrarily old `generated_on`; `load_proposal()` does not validate or limit proposal age. This can make stale scraped evidence look newly confirmed. **Location:** `load_proposal()` and `apply_changes()`. **Fix:** Require an explicit stale-proposal override or stamp/reference the evidence date.

- **Nit:** OpenAI long-context observations disappear whenever the short-context declaration already matches because `build_proposal()` continues before recording observations. This contradicts the claim that the long-context pair is carried to the operator. **Location:** `build_proposal()`. **Fix:** Preserve observations independently of whether a rate change exists.

- **Nit:** `render_proposal()` prints “every configured rate matches” whenever `changes` is empty, even when `unmatched_config_entries` contains models whose rates were not checked. **Location:** `render_proposal()`. **Fix:** Use the success headline only when both collections are empty.

- **Nit:** `_normalized()` treats pricing-row order as significant even though resolution sorts bounds and selects periods independently of declaration order. Harmless provider row reordering can therefore create false proposals. **Location:** `_normalized()`. **Fix:** Canonically sort normalized rows by effective date and token bound.

- **Nit:** Malformed proposal shapes can cause uncaught `AttributeError`, `TypeError`, or `KeyError` rather than `ProposalError`; `load_proposal()` validates only `schema_version`. Since humans edit this file, recoverable schema mistakes should be refused cleanly. **Location:** `load_proposal()`, `accepted_changes()`, and `apply_changes()`. **Fix:** Validate the complete proposal schema before use.

- **Nit:** `test_config_load_rejects_an_unresolvable_rate_declaration` never calls `load_config()`; it directly invokes `config_mod.validate_model_rates()`. The production wiring exists, but the test does not substantiate its name or commentary. **Location:** `ai_router/tests/test_pricing_schema.py`. **Fix:** Build a minimally valid config file and assert that `load_config()` raises.

- **Nit:** `test_apply_leaves_a_rejected_entry_completely_alone` never supplies a rejected change to the apply path; it merely omits the second model. Other unit tests partly cover filtering, but this named integration case is not exercised. **Location:** `ai_router/tests/test_pricing_proposal.py`. **Fix:** Run a mixed accepted/rejected proposal through the CLI and verify only the accepted entry changes.