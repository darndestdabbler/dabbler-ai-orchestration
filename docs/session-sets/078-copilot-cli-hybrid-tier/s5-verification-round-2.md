1. **Finding 1 — RESOLVED**
   - **Evidence:** `ai_router/CHANGELOG.md`, `0.28.0` → `### Fixed`:
     - `"A required end-of-set path-aware critique (Session 5) found one remaining gap in this fix: an assistant-message event with the \`data\` key **absent entirely** still defaulted to an empty-dict success instead of failing closed. \`data\` is now required to be present (a missing key raises the same malformed/generic-unknown classification as every other unexpected wire shape)."`
   - This now matches the shipped behavior described in the finding: absent `data` is explicitly rejected, not treated as `{}`.

2. **Finding 2 — RESOLVED**
   - **Evidence 1:** `ai_router/CHANGELOG.md`, `0.28.0` → `### Rollback`, step 3:
     - ```md
       3. To roll back the package itself, pin to the last version without the
          `copilot-cli` transport surface at all: `pip install
          dabbler-ai-router==0.27.0`. **Note:** as of this writing `0.27.0` is
          itself still publish-pending ... this step is only reachable once
          `0.27.0` has actually published. Until then, step 1
          (`transport.profile: api`) is the available escape.
       ```
   - **Evidence 2:** `docs/repository-reference.md`, `Recent version walk` for `dabbler-ai-router 0.28.0`:
     - `"Rollback recipe ... or (once \`0.27.0\` itself has published) pin \`dabbler-ai-router==0.27.0\`."`
   - Both locations now correctly qualify the rollback pin as unavailable until `0.27.0` is actually published.

3. **Finding 3 — RESOLVED**
   - **Evidence:** `docs/templates/consumer-bootstrap/engine-file.agents-tail.md`:
     - `"Want the Full-tier workflow on a Copilot-only seat, not just Lightweight Mode B?"`
     - `"an indirect Full tier with explicitly degraded guarantees (asserted, not confirmed, provider provenance; no locally meterable billing)."`
   - The overclaim is removed; the text now explicitly frames this as degraded-guarantee behavior, consistent with the rest of the docs.

4. **Finding 4 — RESOLVED**
   - **Evidence:** `docs/repository-reference.md`, `Recent version walk` for `dabbler-ai-router 0.28.0`:
     - `"No extension version bump or new extension feature work — Session 5 did recompile the extension's \`dist/templates/consumer-bootstrap\` mirror to pick up a canonical-template doc-pointer edit, but that is a build-sync fix, not an extension feature or release."`
   - This replaces the too-absolute `"No extension changes."` with wording that accurately acknowledges the extension dist-mirror rebuild.

## Overall verdict

**VERIFIED** — all 4 Round-1 findings are resolved in the current diff, and these fixes do not introduce new documentation-accuracy issues in the touched text.