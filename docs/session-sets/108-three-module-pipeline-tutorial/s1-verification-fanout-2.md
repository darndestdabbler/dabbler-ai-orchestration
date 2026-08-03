ISSUES FOUND

### Issue 1: Exact test counts are invalid finish-line criteria for independently generated implementations
- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** A typical reader follows the tutorial and receives a correct AI-generated implementation with a different test decomposition. Their tests pass and the HTTP behavior is correct, but they cannot satisfy “31 tests,” “24 tests,” or “74 tests,” so the tutorial declares a valid implementation unfinished. This is probable because the outline explicitly acknowledges that reader-generated code will differ from the answer key.
- **Details:**
  - **Violation:** Part A requires “**31 tests green**,” Part B “**24 tests green**,” and Part C “**74 tests green** overall,” while the same section says the reader’s AI session “will not produce the answer key’s code, and that is fine.”
  - **Impact:** Session 2 will encode answer-key-specific implementation counts as universal acceptance criteria, undermining the tutorial’s central goal of independently built modules conforming through behavior rather than identical implementation.
  - **Evidence:** `s1-walk-outline.md` §2 uses exact counts as each part’s formal finish line, not merely as observations from the reference solution.
  - **Fix:** Define finish lines behaviorally: all implementation tests pass, the named contract scenarios are covered, and the stated live probe succeeds. Present the reference solution’s counts only as non-normative observed results.

### Issue 2: The prerequisite ruling still omits that the happy path is Windows-only
- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** A normal macOS or Linux .NET/VS Code reader starts the tutorial with the listed prerequisites and discovers at Part B that SQL Server LocalDB cannot be installed on their platform. They must abandon the advertised happy path and reconstruct the appendix’s container alternative mid-course. This is probable because neither the tutorial audience nor R8a restricts readers to Windows, while .NET, VS Code, Python, and Dabbler are otherwise presented without a Windows restriction.
- **Details:**
  - **Violation:** R8b calls “.NET 10 SDK” plus “SQL Server LocalDB” the “honest build prerequisite list,” and the handover requires a “two-install build list.” The routed analysis itself identifies LocalDB as Windows-only, but the ruling does not include Windows as a prerequisite or direct non-Windows readers to an upfront alternative.
  - **Impact:** Session 2 will reproduce another incomplete prerequisite block and stall a substantial class of readers on the main path—the same failure R8b was intended to prevent.
  - **Evidence:** `s1-ai-assignment-analysis.json` states that LocalDB “is Windows-only.” `s1-walk-outline.md` R8b lists only two installs, and §3 relegates containers to the appendix.
  - **Fix:** State Windows 10/11 as a happy-path prerequisite. Before Part A, explicitly route macOS/Linux readers to a supported container/SQL Server path, or scope the tutorial itself to Windows.

### Issue 3: Part C’s declared independence contradicts its own finish line
- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** Session 2 follows the settled table and tells readers that Part C does not require Parts A or B to be finished. A reader or team member acting on the tutorial’s “nobody waits” premise completes the stubbed phase, then cannot reach Part C’s required end-to-end finish line because no runnable `converter` or `persistence` exists. The contradiction is likely to propagate because Session 2 is explicitly told to treat these rulings as settled rather than re-derive them.
- **Details:**
  - **Violation:** Part C says it “**Depends on both contracts — not on Parts A and B being finished**,” but Phase B requires “Both services started,” and its finish line requires “a real CSV’s rows in a database.”
  - **Impact:** The outline gives Session 2 mutually incompatible instructions about sequencing and stoppability, making the promised independent finish line unactionable.
  - **Evidence:** All three statements occur in `s1-walk-outline.md` §2, Part C.
  - **Fix:** Split the dependency statement by phase: Phase A depends only on the contracts; Phase B and Part C’s overall finish line require runnable `converter` and `persistence` implementations, whether supplied by Parts A/B, a teammate, or an explicitly documented reference setup.

### Issue 4: The new POC still does not verify the four UI findings against the running product
- **Category:** Completeness
- **Severity:** Major
- **Failure scenario:** Session 2 treats flat rows, grouping depth, and ordering as verified UI behavior and writes the tutorial around them, while the actual webview renderer may sort, nest, filter, or otherwise transform the payload. Discovery is then deferred to Session 4, after the tutorial has already been written. This is precisely the late-failure scenario the explicit running-product verification step was intended to prevent.
- **Details:**
  - **Violation:** The task requires confirming the findings “**against the running product, not just the model functions**.” The test directly imports and invokes `classifyModulesManifest`, `readSessionSets`, `computeVisibleModules`, and `buildVisibleModulePayloads`; it never starts the extension/webview or renders and inspects the resulting DOM.
  - **Impact:** The test improves disk/parser coverage but does not establish claims phrased as “renders as nine flat sibling rows” or “grouping is exactly one level deep.” A reasonable merge decision cannot treat Session 1’s explicit acceptance step as complete.
  - **Evidence:** `poc-nine-modules-ondisk.ts` ends at `buildVisibleModulePayloads`. Its grouping test infers UI depth from payload object shape, and its ordering test checks payload-array order rather than rendered row order.
  - **Fix:** Exercise the actual renderer and assert its displayed module rows/order and absence of a member tier, using the supported webview/fixture integration path or an equivalent renderer DOM test.

## NITS

- **Nit:** Part D’s evidence proves the `converter` switch but does not document an equivalent falsifier for `persistence`. R6 starts and kills only converters, while Part D’s finish line requires repointing both services. Either record the `5202` persistence startup and make `5102` unavailable, or narrow the “Part D proven” claim.

- **Nit:** The selected naming convention is `{owner}-{service}`, but `poc-nine-modules-ondisk.ts` implements its `"person"` scheme as `${service}-${member}`. The test therefore does not pin the convention R1 actually selected, despite `ai-assignment.md` claiming the correction is pinned against drift.

- **Nit:** R1 says owner-in-slug is unique “with no allocation step at all,” but ordinary personal names are not unique and can normalize to the same slug. Use a repository-unique owner identifier or VCS handle and document the normalization rule.

- **Nit:** R2 overstates convention as enforcement: a directory layout does not make it impossible for one contributor to edit another contributor’s path. It creates non-overlapping assigned roots; CODEOWNERS/review policy supplies enforcement.

- **Nit:** The malformed-JSON ASP.NET exception dump is environment- and implementation-specific, not a portable service-contract body. Independent `persistence` implementations are likely to return different malformed-input bodies. Contractually require the relevant `4xx` classification and describe the captured dump only as reference-solution behavior.

- **Nit:** The capture appendix is not fully reproducible as claimed. It omits commands or fixture construction for the unknown schema, invalid persistence batch, malformed JSON, `GET /batches/{id}`, header capture, second service ports, and the complete watcher/Part D sequence.

- **Nit:** The evidence table says “The outline does not duplicate procedure,” but the routed review found that R4 currently duplicates `adopt-dabbler.md`. The intended future transfer may be correct, but the evidence row should say that duplication is temporary and scheduled for removal in Session 3.

- **Nit:** Adding `tools/dabbler-ai-orchestration/src/test/poc-nine-modules-ondisk.ts` contradicts the session plan’s literal “Touches: nothing outside this set directory.” The rationale may justify the deviation, but disclosure does not make the plan statement true.