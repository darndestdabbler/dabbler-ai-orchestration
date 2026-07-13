ISSUES FOUND

- **Issue 1: Malformed or unknown verifier verdicts are converted to `VERIFIED`**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A verifier returns a complete review but omits or slightly drifts the required verdict token—an ordinary LLM-formatting failure, especially with long discovery output. `parse_verification_response` returns an unknown/non-`ISSUES_FOUND` token, but the new merge logic rewrites it to `VERIFIED`; the CLI patches the disposition and permits close despite having no valid verdict. This is probable over repeated real verification sessions and defeats the existing fail-closed classification.
  - **Details:**
    - **Violation:** The response claims omitted `--phase` preserves classic behavior and that the exact verifier token is retained, but `run()` now computes:
      ```python
      verdict = (
          "ISSUES_FOUND"
          if any(t == "ISSUES_FOUND" for t in call_tokens)
          else "VERIFIED"
      )
      ```
      Any unknown, malformed, or otherwise non-`ISSUES_FOUND` token becomes `VERIFIED`.
    - **Impact:** Invalid verifier evidence can authorize a false successful disposition, changing the merge/close decision.
    - **Evidence:** The old path passed the parser’s actual `verdict` directly into `classify_blocking`; the replacement normalizes every other outcome to `VERIFIED`, including on the classic single-call path.
    - **Fix:** Preserve the single-call token exactly. For fan-out, merge only recognized `VERIFIED`/`ISSUES_FOUND` tokens and fail closed if any completed call has an unknown or missing verdict.

- **Issue 2: Phase-generated artifacts contaminate both “same evidence” supplementary review and “fix delta only” remediation review**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** On the documented main path, discovery writes raw fan-out artifacts, an issues envelope, and a disposition patch into the working tree. The subsequent supplementary invocation reassembles the working tree without excluding those files, so it does not receive the same evidence. Its snapshot is then taken before its own artifacts are written, causing those supplementary artifacts to appear as added hunks in remediation review. This happens on every blocking discovery and can make the verifier review immutable verification records as remediation, resurrect findings, or exceed the evidence cap on an already-large bundle.
  - **Details:**
    - **Violation:** The required contracts are supplementary “over the SAME evidence” and remediation evidence “the FIX DELTA ONLY.” Neither is true under the normal commands printed by the CLI.
    - **Impact:** The phase isolation that is supposed to prevent salience churn is broken on the default path. Large sessions can also fail before supplementary routing because exhaustive discovery outputs are added to an evidence bundle that was already near the cap.
    - **Evidence:** `assemble_evidence(...)` is called afresh before supplementary without phase-artifact exclusions. `snapshot_tree` is captured before routing, while `artifact_path_k.write_text(...)`, `write_issues_artifact(...)`, and `patch_disposition(...)` mutate the tree afterward. `assemble_fix_delta_evidence(...)` then diffs from that pre-call snapshot. The replay avoided this defect by explicitly excluding both session-set directories, but the documented user commands do not.
    - **Fix:** Freeze and reuse the initial discovery work-evidence state for supplementary. Exclude verification outputs, issues envelopes, disposition bookkeeping, and settlement sidecars from fix-delta pathspecs because the ledger carries settlement evidence separately. Add integration tests asserting these files never appear in supplementary work evidence or remediation hunks.

- **Issue 3: Per-finding remediation verdicts are observability-only, so incomplete or rejected fixes can pass**
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A remediation reviewer omits one of several prior findings, emits `fix-rejected` without restating an Issue block, or otherwise returns a contradictory `VERIFIED` response. Such partial structured responses are probable for free-form multi-finding LLM reviews. The CLI ignores the missing/rejected settlement and proceeds as non-blocking, leaving a prior Major unreviewed or unresolved.
  - **Details:**
    - **Violation:** The phase contract requires a verdict “For EACH prior blocking finding,” but `parse_fix_verdicts` is explicitly “observability-only”; blocking uses only the response token and re-stated Issue blocks.
    - **Impact:** The central no-resurrection/settlement machinery cannot establish that every blocker was reviewed, yet it can authorize close as though all fixes were accepted.
    - **Evidence:** There is no comparison between ledger blockers and parsed `fixVerdicts`, and no rule making a parsed `fix-rejected` block. If no Issue block is parsed, `classification` can be non-blocking. Furthermore, `write_issues_artifact` runs only when `merged_issues` is nonempty, so the usual clean remediation review does not persist its accepted verdicts at all.
    - **Fix:** Give prior blockers stable IDs, require exactly one recognized verdict for every unresolved blocker, fail closed on missing/duplicate verdicts, and make any `fix-rejected` blocking independently of whether the model restates an Issue. Persist the remediation-review result, including fix verdicts, even on a clean round.

- **Issue 4: The advertised phase bounds are not enforced and the CLI directs users past the cap**
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** The second remediation-review cycle still finds a blocker—the precise persistent-failure case for which the cap exists. The CLI prints another `--phase remediation-review` command, so a typical operator following its explicit “Next action” starts a prohibited third cycle instead of suspending for adjudication.
  - **Details:**
    - **Violation:** Policy says “at most 2 remediation-review cycles; past either bound the loop suspends to the operator,” while the implementation unconditionally tells every blocking remediation review to re-run.
    - **Impact:** The shipped machinery recreates the unbounded verification grind this set is intended to eliminate.
    - **Evidence:** The `PHASE_REMEDIATION_REVIEW` blocking branch does not count prior phase executions:
      ```python
      print("... then re-run:")
      print("... --phase remediation-review")
      ```
      The parenthetical mentions the bound but does not change the command at cycle two. Supplementary/discovery ordering and counts are likewise not validated.
    - **Fix:** Persist phase metadata for every round, count discovery and remediation-review executions, refuse prohibited phase transitions, and at the second blocking remediation-review print only the operator-adjudication path.

- **Issue 5: The convergence replay does not substantiate the claimed cost/round improvement against Set 095**
  - **Category:** False Positive
  - **Severity:** Major
  - **Failure scenario:** The release is accepted on the claim that the phased loop reduced a 17-round/$4.88 workload to 4 rounds/$0.85, but users apply it to similarly defective initial corpora and do not obtain that improvement. This is probable because the replay began only after the original loop had already found and fixed all 39 Majors, so it processed a materially smaller and different workload.
  - **Details:**
    - **Violation:** The session is supposed to provide the set’s falsifier and demonstrate convergence “at materially lower cost” against the 095 baseline.
    - **Impact:** The principal empirical justification for the workflow change is not established, which changes a reasonable release decision about whether the set’s objective was validated.
    - **Evidence:** The replay says it starts at `b16dd58`, “the exact tree Set 095’s second clean rubric round verified; all 39 remediated Majors are fixed in it.” It then compares five latent findings plus one fix-induced finding against the earlier moving-tree process that had to discover and remediate 39 findings. The memo itself concedes “The corpora are not identical in defect content,” yet still attributes the cost delta to the loop structure/template.
    - **Fix:** Replay the phased loop from the same pre-remediation starting tree/workload used by the 095 baseline, or narrow the release claims to an end-to-end machinery smoke test without asserting comparative cost or falsification.

#### NITS

- **Nit:** Fan-out findings are concatenated with `merged_issues.extend(issues_k)` and never deduplicated, despite the schema documentation calling the result a “union” and the test module claiming dedupe coverage. Given the measured 0.13–0.31 overlap, duplicate remediation entries are expected.

- **Nit:** The replay memo says `fixVerdicts` were parsed into “round-3/4 envelopes,” but no round-4 envelope exists and the implementation cannot write one for a clean response. The raw round-4 artifact supports 6/6 acceptance, but that specific machinery claim is false.

- **Nit:** Adding root fields while retaining `schemaVersion` 1/2 is not backward-compatible with prior schema validators because the root schema has `"additionalProperties": false`. Calling the change universally “additive” and reader-tolerant overstates compatibility.

- **Nit:** On a successful cross-provider supplementary call, reporting still prints the base `exclude_providers` list rather than `preferred_exclusions`, so the audit output omits the actual round-1-provider exclusion.

- **Nit:** “Byte-for-byte” classic compatibility is too strong: no-phase dry-run output now includes additional phase and complexity lines. The routing/prompt behavior may be semantically compatible, but stdout is not byte-identical.

- **Nit:** `provider_diversity: same-model` does not pin the discovery calls to one model; it merely invokes routing repeatedly with identical arguments. Availability or routing-state changes can select different models, so “same-model discovery calls” is a preference/expectation rather than an enforced invariant.