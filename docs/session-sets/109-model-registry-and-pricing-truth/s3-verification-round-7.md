ISSUES FOUND

- **Issue 1: Anthropic rows with missing cells still disappear into the non-fatal “absent” path**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** Anthropic changes one of Claude Sonnet 5’s two effective-date rows so it has fewer cells than the current header—for example, by omitting or spanning a cache/output column—while the sibling row remains readable. Table evolution is probable over repeated live scrapes, and Sonnet 5 already uses exceptional multi-row markup. The malformed row is silently skipped, the surviving row becomes a valid proposal, and an operator can apply an incomplete schedule.
  - **Details:**
    - **Violation:** The task requires, “A parse failure must produce *no proposal*, loudly — never a silent partial.” The changelog further claims that all three parsers record unreadable rows so absence means genuine absence.
    - **Impact:** If the future row is skipped, the introductory `$2/$10` price is proposed as a permanent flat rate. If the introductory row is skipped, the future-dated row survives alone and `resolve_rates()` applies it before 2026-09-01 through its earliest-period fallback. Either result can be accepted, written, and freshly stamped despite omitting a published pricing period.
    - **Evidence:** `parse_anthropic()` still silently discards structurally short rows:
      ```python
      if len(row) <= max(name_col, in_col, out_col) or not row[name_col]:
          continue
      ```
      Unlike unreadable monetary values, this path never populates `unreadable_reason`. A readable sibling is therefore returned normally, and `build_proposal()` sees nonempty `rows`, bypassing its fatal configured-model check.
    - **Location:** `ai_router/pricing_proposal.py` → `parse_anthropic()`.
    - **Fix:** When a row has a recognizable model label but lacks any required pricing column, poison that display-name group with an unreadable reason. If identity itself cannot be recovered from a pricing row, fail the provider parse. Add tests shortening each Sonnet 5 row in turn and assert that `build_proposal()` and `--fetch` abort and quarantine any previous proposal.

#### NITS

- **Nit:** `validate_model_rates()` treats explicit `pricing: null` as absence because it uses `entry.get(PRICING_KEY)`. A common blank YAML declaration can therefore load and resolve to zero cost. Detect `PRICING_KEY in entry` and reject null as not being a non-empty list.

- **Nit:** The documented Google residual remains: `_google_section_rates()` returns `None` when a recognized Standard table lacks the exact `Input price` or `Output price` labels, causing a per-model label change to masquerade as genuine absence. A global rename is fatal, but a localized rename still permits a partial proposal.

- **Nit:** `apply_changes()` checks alias and `model_id`, but not provider, current declaration, or proposal age. A same-model edit between fetch and apply can be overwritten or freshly stamped without matching the reviewed evidence. Add optimistic-concurrency and freshness validation.