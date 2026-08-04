ISSUES FOUND

- **Issue 1: Unchanged rates can never receive `confirmed_on` through the confirmation workflow**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** Session 4 runs `--fetch`, reviews and accepts every generated change, then applies it. Models whose published rates already match the config never appear in `changes`, so they have no decision to accept and remain permanently unstamped. This is guaranteed for matching entries, not an edge case.
  - **Details:**
    - **Violation:** The response claims every currently unstamped model is “temporary by construction — S4 stamps them by accepting proposals,” and that `confirmed_on` records human confirmation per model.
    - **Impact:** The workflow cannot establish confirmation truth for correct existing rates, the router continues warning about them indefinitely, and the `confirmedOnStamped` objective cannot be completed through the sanctioned flow.
    - **Evidence:** In `build_proposal`, matching entries immediately `continue`:
      ```python
      if current and _normalized(current) == _normalized(proposed):
          continue
      ```
      `apply_changes` stamps only aliases present in accepted `changes`.
    - **Location:** `ai_router/pricing_proposal.py::build_proposal`, `accepted_changes`, and `apply_changes`.
    - **Fix:** Emit explicit confirmation records for matching rates, each requiring an accept/reject decision, and let acceptance stamp `confirmed_on` without changing the rate.

- **Issue 2: The retained global rollup becomes falsely fresh while most models remain unconfirmed**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** On the first normal apply, only accepted changed models receive stamps. `metadata.pricing_reviewed` is then set to the minimum of those few existing stamps—typically today—even though all matching, rejected, and unmatched priced models remain unstamped. The extension consequently reports pricing as freshly reviewed.
  - **Details:**
    - **Violation:** The response claims `metadata.pricing_reviewed` is “the oldest per-model stamp” and “cannot drift from the stamps it summarises.”
    - **Impact:** The shipped Cost Dashboard displays the exact false freshness signal that per-model confirmation was intended to eliminate. This happens on the main apply path in the current all-unstamped registry.
    - **Evidence:** `apply_changes` excludes unstamped models entirely:
      ```python
      stamps = [
          str(m.get(CONFIRMED_ON_KEY))
          for m in models.values()
          if isinstance(m, dict) and m.get(CONFIRMED_ON_KEY)
      ]
      document.setdefault("metadata", {})["pricing_reviewed"] = min(stamps)
      ```
    - **Location:** `ai_router/pricing_proposal.py::apply_changes`.
    - **Fix:** Do not advance the global rollup while any priced model lacks `confirmed_on`; only compute the minimum after all applicable models are confirmed, or preserve an explicitly stale sentinel understood by the extension.

- **Issue 3: `--apply` can apply a stale proposal to a different current model and falsely stamp it confirmed**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** An operator fetches a proposal for an alias, then repoints that alias to a corrected model ID during Session 4’s registry curation. Applying the earlier proposal writes the old model’s rates into the new model entry and stamps it with today’s `confirmed_on`. This is probable because model-ID curation and price confirmation are the next session’s explicitly coupled work.
  - **Details:**
    - **Violation:** Acceptance is supposed to mean a human confirmed “that entry’s rates against the provider’s page.”
    - **Impact:** A newly corrected model can immediately be assigned another model’s stale rates while carrying an authoritative fresh stamp.
    - **Evidence:** Proposal records contain `provider`, `model_id`, `page_key`, and `current`, but `apply_changes` checks only whether `alias` still exists. It does not verify current provider/model identity or that the current declaration still equals the proposal’s `current`. Failed fetches also leave any old proposal file intact, and proposal age is never checked.
    - **Location:** `ai_router/pricing_proposal.py::apply_changes` and `main --fetch`.
    - **Fix:** Before mutation, require provider, model ID, and normalized current pricing to match the proposal; otherwise reject and require a fresh fetch. Invalidate any existing proposal before a failed refresh can leave it appearing usable.

- **Issue 4: Google parsing has explicit fail-open paths that manufacture plausible flat prices**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** Google changes a configured model’s Standard table so input and output cells yield different line counts—for example, a modality line is added, removed, or reordered. Instead of treating the ambiguity as structural failure, the parser silently pairs the first input and output prices and emits a valid flat proposal. Provider-page evolution is the expected operating condition for this scraper, and the resulting values are plausible enough to be accepted.
  - **Details:**
    - **Violation:** The task requires “A parse failure must produce no proposal, loudly,” while the response repeatedly claims the parser avoids plausible wrong numbers.
    - **Impact:** A human can accept a fabricated flat rate, removing a real context tier and stamping the wrong value as confirmed.
    - **Evidence:** `_google_section_rates` explicitly collapses mismatched extraction to the first values:
      ```python
      if len(inputs) != len(outputs):
          return PageRates(rows=[{
              "input_cost_per_1m": inputs[0][1],
              "output_cost_per_1m": outputs[0][1],
          }])
      ```
      A single bounded row also bypasses the “exactly one unbounded row” check because that check runs only when `len(rows) > 1`; fetch can therefore write an invalid proposal rather than failing during parsing.
    - **Location:** `ai_router/pricing_proposal.py::_google_section_rates`.
    - **Fix:** Raise `PageStructureError` whenever input/output lines cannot be paired unambiguously. Validate every extracted declaration before writing any proposal, including the single-row bounded case.

#### NITS

- **Nit:** Explicit `pricing: null` bypasses validation because presence is tested with `entry.get(PRICING_KEY)`. It is treated as no pricing declaration and can resolve to zero. Detect key presence with `PRICING_KEY in entry` and reject null as not being a non-empty list.

- **Nit:** OpenAI long-context observations disappear whenever the short-context price already matches. `build_proposal` discards `found.observations` on the matching-rate `continue`, so models such as `gpt-5.4` receive no operator-visible observation despite the response claiming those rates are carried for deliberate encoding.

- **Nit:** `render_proposal` prints “every configured rate matches” whenever `changes` is empty, even if `unmatched_config_entries` contains models explicitly reported as not checked. The same run exits zero.

- **Nit:** The public `apply_changes` function ignores each change’s `decision`; callers can pass rejected or pending changes directly and they will be written. The CLI filters them, but the lower-level write API does not itself enforce the stated acceptance invariant.

- **Nit:** `test_config_load_rejects_an_unresolvable_rate_declaration` does not call `load_config`; it directly invokes `config_mod.validate_model_rates`. Its name and comment therefore overstate what the test pins. Similarly, the selection wiring test checks imported function identity rather than exercising selection behavior.