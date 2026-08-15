VERIFIED — I checked the release/migration instructions, Marketplace claims, folded changelogs, metadata, and post-fold test changes. No new blocking defect distinct from the already-reported cross-provider fallback issue was substantiated.

## NITS

- **Nit:** The AI assignment gives the operator the wrong release sequence.
  - **Location:** `docs/session-sets/133-release-and-listing-truth/ai-assignment.md`
  - **Fix:** Replace “tag … push the branch and tag, wait for CI” with the specified sequence: close → push branch → CI green → push tags.

- **Nit:** The folded extension changelog still refers to a nonexistent “Unreleased section above” and contains an orphaned paragraph beginning “it beside Copy Run Prompt”.
  - **Location:** `tools/dabbler-ai-orchestration/CHANGELOG.md`
  - **Fix:** Point the staged-tranche warning to the first `0.51.0` section and restore or remove the missing lead sentence for the orphaned command-removal entry.

- **Nit:** The Marketplace copy implies `python -m ai_router.report` can show “what you actually spent” for either transport, while the release notes state Copilot-seat metrics remain unpriced there and require the separate seat-cost join.
  - **Location:** `tools/dabbler-ai-orchestration/README.md`, `ai_router/CHANGELOG.md`
  - **Fix:** Scope the `report` savings ratio to priced Direct API calls, and direct Copilot-seat users to `python -m ai_router.seat_cost` for measured seat usage.