ISSUES FOUND

- **Issue 1: The harness does not measure extension activation, yet the decision treats host-pipeline timing as total startup and pre-ordains that migration cannot improve it**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A typical user opens the Work Explorer, executing extension activation and view-creation work that this harness never times. Replacing a `WebviewView` with a native tree is likely to change that work, but S4 is explicitly instructed to report startup as unchanged and omit any performance claim. This can make S4 report the wrong result and mischaracterize the migration to the operator.
  - **Location:** `scripts/perf-harness.ts`; `s1-migration-decision.md` §§2, 5, and 6.
  - **Details:**
    - **Violation:** The task requires separate measurement of “**extension activation, host-side scan / model assembly, `resolveWebviewView`, and webview cold start to first paint**.” The conventions excuse the two extension-host rendering buckets, but still claim the harness measures two of four. In fact, it measures only host discovery/scan work: imports, extension activation, command/view registration, and activation-to-data-request elapsed time all occur outside any timer.
    - **Impact:** The unsupported inference drives concrete downstream instructions: “**A TreeDataProvider does not make this one millisecond faster**,” “**S4's re-measurement will show empty-startup unchanged**,” and “**S4's re-measurement must report empty-startup as unchanged**.” Finding approximately 102 ms of host work proves a host-side lower bound; it does not establish that omitted activation/rendering work is zero or that removing the webview cannot reduce total startup materially.
    - **Evidence:** Every timer in `measure()` wraps only `timeGitWorktreeList`, `discoverRootsWithFamilies`, `readSessionSets`, or `readAllSessionSetsWithDiagnostics`. The extension’s activation function is never imported or invoked. The two remaining rendering buckets are expressly unmeasured.
    - **Correct answer:** Report that the host pipeline is dominated by synchronous discovery and will remain unless separately changed. Measure activation independently, and defer any conclusion about total startup improvement until the extension-host buckets are measured. S4 must be instructed to report its observed result, not a predetermined “unchanged” outcome.
  - **Fix:** Add an activation measurement that isolates activation overhead from model assembly, or narrow the S1 conclusion to host-pipeline cost. Remove the directives requiring S4 to report unchanged startup before S4 has measured it.

## NITS

- **Nit:** The inline-action spike is not representative of the action strip it claims to validate. `extension.js` says module rows have “four inline actions live here today,” while `package.json` puts only `spike.newSession` and `spike.openSpec` in the `inline` group. The screenshot therefore cannot establish that all four actions remain usable at normal or minimum width. Test all four or narrow the conclusion to two actions. This is non-blocking because context-menu fallback exists and S2 can still validate the final layout.

- **Nit:** The laziness conclusion contradicts its own trace. `spike-laziness-trace.json` records `getChildren(root)` during “after activation, view never opened,” while `s1-migration-decision.md` says that stage requested “nothing at all” and claims nothing is requested until visibility. Nested children are shown to be lazy; root-level invisibility laziness is not.

- **Nit:** The density prototype does not implement the confirmed icon mapping literally. The worst-case row lists five markers, but assigns `in-progress.svg`—a status glyph—as the purported “single most severe marker.” It also puts the kind only in tooltip/context metadata. S2 needs an explicit mapping from each marker/severity combination to the actual `iconPath`; the current table leaves that behavior ambiguous.

- **Nit:** The rerun prompt is not retained in either routed panel artifact, so the claim that the same reconstructed question was asked cannot be independently checked. The section also calls the agreement “unprompted,” although the structured responses were directly asked for `performance_case_real`, `density_trade`, and related judgments.

- **Nit:** The documented runtime is inconsistent. `s1-migration-decision.md` says “Node 22,” while `s1-perf-measurements.json` records `v25.8.1`. Correct the environment description for reproducibility.

- **Nit:** The reported `$0.1514` spend equals the analysis and two panel calls exactly, despite `ai-assignment.md` saying that amount includes “plus verification.” Either verification cost is omitted from the total or the wording is wrong.