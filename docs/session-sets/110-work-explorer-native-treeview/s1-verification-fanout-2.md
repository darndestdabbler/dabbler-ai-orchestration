ISSUES FOUND

- **Issue 1: The startup conclusion is unsupported because extension activation was never measured**
  - **Category:** Completeness / Correctness
  - **Severity:** Major
  - **Failure scenario:** The existing webview’s activation or initialization contributes substantial latency in addition to the measured ~102 ms discovery floor. The native migration then materially improves startup without eliminating that floor, but S2–S4 are instructed to treat startup as necessarily unchanged and S4 is prohibited from reporting an improvement. This is probable enough to block because the current implementation contains a substantial webview renderer, the task explicitly separated activation from model assembly, and even the GPT panel artifact says removing webview initialization may save time.
  - **Details:**
    - **Violation:** Step 3 requires separate measurement of “**extension activation, host-side scan / model assembly, `resolveWebviewView`, and webview cold start to first paint**.” The conventions excuse the latter two buckets, implying activation and host-side assembly are the two delivered buckets. However, `scripts/perf-harness.ts` measures only `discoverRootsWithFamilies()`, `readSessionSets()`, and `readAllSessionSetsWithDiagnostics()` under a VS Code stub; it never invokes or instruments extension activation.
    - **Location:** `scripts/perf-harness.ts`; `s1-migration-decision.md` §2, especially “The migration does **not** fix the symptom” and “A TreeDataProvider does not make this one millisecond faster.”
    - **Impact:** A fixed 102 ms host-side floor proves only that the migration cannot remove that portion. It does not prove that removing activation/rendering work cannot reduce total startup materially. The GO decision may still be valid on correctness grounds, but the performance disposition and downstream instructions are not established.
    - **Evidence:** The harness imports only `../src/utils/fileSystem` functions and records a single host-side pipeline. Its JSON explicitly says only host-side buckets were measured. The unmeasured end-to-end components are exactly where migration-specific savings could exist.
    - **Fix:** Measure extension activation separately, or change the conclusion to: discovery imposes an invariant ~102 ms floor, while the migration’s total startup effect remains undetermined until the extension-host buckets are measured. Do not require S4 to report startup as unchanged before that measurement.

- **Issue 2: The inline-action spike tested two actions while the decision applies it to the real four-action strip**
  - **Category:** Completeness / False Positive
  - **Severity:** Major
  - **Failure scenario:** S2 maps all four frequent module actions to `group: "inline"` based on this GO result, but at the operator’s normal or minimum sidebar width the additional icons crowd the label, overflow, or lose discoverability. This is probable because narrow Explorer widths are the normal use case, action density was explicitly identified by the panel as a no-go gate, and the spike tested only half the stated action count.
  - **Details:**
    - **Violation:** Step 4 requires determining whether inline grouping renders “**the module actions acceptably as icons**.” The decision declares that it “WORKS, and fixes the original complaint” and records the no-go condition as not firing.
    - **Location:** `s1-spike-evidence/spike-extension/package.json` under `view/item/context`; `s1-migration-decision.md` §§3(b), 4, and 6.
    - **Impact:** The operator’s GO decision and S2 mapping can produce a native row that fails the same action-over-label usability objective the migration is intended to solve.
    - **Evidence:** Only `spike.newSession` and `spike.openSpec` use `group: "inline"`. The spike source itself says “four inline actions live here today,” and the GPT panel specifically requires verifying “the four inline actions at the minimum supported view width.” The committed report leaves narrowing to minimum width as a manual checklist item rather than recording a result.
    - **Fix:** Render all four actual actions at the minimum and normal working widths, record overflow/context-menu behavior, and obtain operator acceptance before declaring this no-go condition cleared.

- **Issue 3: The density spike does not render the mapping the decision claims was confirmed**
  - **Category:** Correctness / Completeness
  - **Severity:** Major
  - **Failure scenario:** S2 implements the demonstrated generic in-progress icon for a blocked or migration-required set, leaving the actionable warning visible only on hover. Operators scanning collapsed rows then miss blocked, waived-verification, or migration-required states—the exact density regression the panel identified as a no-go condition. This is probable because the “worst-case” fixture intentionally contains those states and the mapping provides neither their icon mapping nor a precedence rule.
  - **Details:**
    - **Violation:** The session must end with an “**operator-confirmed density mapping**” and a confirmed mapping table. The table says “the single most severe marker → `iconPath`,” but the representative row does not implement that mapping.
    - **Location:** `spike-extension/extension.js`, `WORST_CASE` and the `worst.iconPath` assignment; `s1-migration-decision.md` §4 mapping table.
    - **Impact:** S2 cannot implement “single most severe marker” deterministically, and the operator’s rendered comparison did not show the proposed warning representation.
    - **Evidence:** `WORST_CASE.markers` contains schema migration, tier mismatch, prerequisite blocking, waived verification, and duplicate-name markers. The row nevertheless assigns `in-progress.svg`, a session-status asset, with the comment “single most severe marker.” No precedence table or marker-to-icon mapping identifies which warning should win.
    - **Fix:** Define the complete marker precedence and icon mapping, render the actual winning warning icon on the worst-case row, and reconfirm the density trade with the operator.

#### NITS

- **Nit:** `spike-laziness-trace.json` directly contradicts the decision’s claim that “after activation, view never opened” caused “nothing at all.” The trace already contains `getChildren(root)` at that stage. Child-level laziness remains demonstrated, but visibility-level laziness does not.
- **Nit:** `s1-migration-decision.md` says measurements used Node 22, while `s1-perf-measurements.json` records `v25.8.1`.
- **Nit:** The claim that root discovery is “run twice per refresh” is not established by the harness. The harness itself performs one standalone discovery probe and then calls the product pipeline, which performs discovery again; the second call is measurement instrumentation unless another product call site is shown.
- **Nit:** “The commit order proves” the Opus opinion preceded routed opinions is unsupported by the presented history: all artifacts appear together in the single `HEAD~1..HEAD` diff. The declared independence caveat remains useful, but the claimed proof is absent.
- **Nit:** The statement that `TreeItem.description` survives exactly when the label is not truncated is stronger than the two-width evidence. The screenshots support “absent at the operator’s working width and present when widened,” which is sufficient for the fraction decision but not a general platform rule.
- **Nit:** The “confirmed mapping table” contains bucket-row `N sets` explicitly marked “proposed, not put to the operator.” It should be separated from the confirmed table to avoid presenting a residual proposal as part of the operator-approved mapping.