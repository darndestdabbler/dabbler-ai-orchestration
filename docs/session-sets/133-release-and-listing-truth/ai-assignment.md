# AI Assignment Ledger - 133-release-and-listing-truth

> Routed analysis (Step 3.5), never self-opined. Session 1's block was
> authored by `gemini-2.5-pro` (google, tier 2, $0.0129) on 2026-08-15
> via `route(task_type="analysis")`.

> **Known analyst defect, recorded not corrected:** the routed model ids
> below (`claude-3-opus-20240229`, `gemini-1.5-pro-latest`) are not ids
> this router can call - the step-3.5 analyst has emitted non-existent
> model ids for several sets now, and the router-side fix is an owed
> follow-on. The *provider direction* it recommends is correct and is what
> the router enforces anyway: an anthropic orchestrator is verified by
> google/openai, never by itself. The recommendation is left as routed.

---

## Session 1: Say what shipped, and say it well

- **Recommended orchestrator:** `anthropic/claude-3-opus-20240229`
- **Rationale:** The session's core deliverables (Steps 2, 3, 4) involve authoring security-sensitive release notes, public-facing marketplace copy, and precise documentation corrections. This requires a model with state-of-the-art reasoning and writing capabilities, for which Claude 3 Opus is a strong candidate, consistent with the operator's specified configuration.
- **Estimated routed cost:** $2.50

| Step                                                                  | Route                  | Model                                |
| :-------------------------------------------------------------------- | :--------------------- | :----------------------------------- |
| 1. Register                                                           | `operator-execute`     |                                      |
| 2. Write the missing Set 125 changelog fragment, then fold both targets. | `orchestrator-execute` |                                      |
| 3. Rework the extension README into the Marketplace listing.          | `orchestrator-execute` |                                      |
| 4. Correct the root README's two false statements.                    | `orchestrator-execute` |                                      |
| 5. Cross-provider verification.                                       | `verifier-execute`     | `google/gemini-1.5-pro-latest`       |
| 6. Required portion of the full test suite.                           | `operator-execute`     |                                      |
| 7. Close-out.                                                         | `operator-execute`     |                                      |

- **Actuals:**
  ```yaml
  sessionID:
  orchestrator:
  cost:
  stepRuntimes:
  findings:
  ```

- **On close:** Proceed to operator-led publish. The operator must tag the `HEAD` of this session's branch, push the branch and tag, wait for CI to pass on the tag, and then run both the PyPI and VSIX publish workflows. Session 2 cannot begin until both artifacts are confirmed live in their respective registries.

---

## Session 2: Confirm and correct the record

- **Recommended orchestrator:** `google/gemini-1.5-pro-latest`
- **Rationale:** Step 3 requires capturing the precise reasoning for a formal policy ruling and recording it in a structured journal. A high-capability model is needed to ensure the legal and technical nuances are stated correctly. Gemini 1.5 Pro provides strong reasoning capabilities and introduces cross-provider diversity to the set.
- **Estimated routed cost:** $1.00

| Step                                                                  | Route                  | Model                                  |
| :-------------------------------------------------------------------- | :--------------------- | :------------------------------------- |
| 1. Register.                                                          | `operator-execute`     |                                        |
| 2. Confirm both registries are live and correct the release-status row. | `orchestrator-execute` |                                        |
| 3. Journal the deletion-cost ruling.                                  | `orchestrator-execute` |                                        |
| 4. Cross-provider verification.                                       | `verifier-execute`     | `anthropic/claude-3-opus-20240229`     |
| 5. Required portion of the full test suite.                           | `operator-execute`     |                                        |
| 6. Close-out.                                                         | `operator-execute`     |                                        |

- **Actuals:**
  ```yaml
  sessionID:
  orchestrator:
  cost:
  stepRuntimes:
  findings:
  ```

- **On close:** Proceed to the terminal session for Step 9 (reorganization review of `project-guidance.md` / `lessons-learned.md`).

---

## Set-terminal recommendation: what runs next (Step 3.5, Session 2)

> Routed analysis, never self-opined. Authored by `gemini-2.5-pro` (google,
> tier 2, $0.0059) on 2026-08-15 via `route(task_type="analysis")`.

- **Recommended next set:** `134-ceremony-cost-and-what-to-cut`
- **Goal in one line:** reduce ceremony cost per work step by simplifying
  artifacts, checklists, and the rounds a human must drive.
- **Why now:** ceremony cost per step has more than doubled, 7.1 -> 16.3
  minutes, while work per step stayed flat at ~7.1. It is the most acute
  drag on the operator and the standing guidance is to cut ceremony first.
- **Why not the others:** the `changelog.check()` post-fold gap is a
  localized correctness issue; `WORK_STEP_BUDGET` and the deletion-cost
  ruling address longer-term system health; Open VSX is a capability
  extension, not an active pain point. Ceremony cost is a workflow-wide tax
  being paid every session.
- **Sequencing risk, as stated by the analyst:** choosing ceremony first
  leaves the `changelog.check()` gap open, so a contribution folded before
  the next release set is not round-trip verified. Deferring
  `WORK_STEP_BUDGET` and the deletion-cost implementation also means scope
  and suite growth continue unconstrained in the meantime.
- **Recommended next orchestrator:** provider **anthropic**, current flagship
  family; effort medium. Rationale as routed: the work is interpreting
  process data and standing guidance and proposing strategic cuts, which is
  synthesis-shaped rather than mechanical.

> **Known analyst defect, recorded not corrected — fourth set running.** The
> prompt explicitly asked for a callable model id or, failing confidence, the
> provider and family only. The analyst answered `claude-3-opus, latest
> version`, which is neither: `claude-3-opus` is not a family this router
> can call. It did at least caveat the id rather than assert one, which is
> new. The **provider direction is actionable and is what the router
> enforces anyway** — an anthropic orchestrator is verified by google or
> openai, never by itself. The router-side fix for the step-3.5 analyst's
> model-id emissions remains an owed follow-on; it is now the longest-lived
> unaddressed defect this ledger carries.
