# Reclamation ledger — session 1

The entry gate for sets 141–145. Every row is a test deleted in session 1,
with the behavior it asserted and the cover that remains. The audit that
produced these rows ran against the suite at 475 before any deletion.

**Result:** 475 → 444. Thirty-one slots reclaimed, 36 free against the 480
ceiling. Set 141's own allocation is 11, so the set proceeds inside the
existing ceiling; the ceiling was not raised.

## What "reclaimed" required

A row qualifies only if the test was superseded or duplicative **and** the
behavior it covered is still covered by a named test or mechanism. A test
whose behavior would lose its last cover was not reclaimable and does not
appear here. Parameterization was not used: collected cases count against
the ceiling, so every row below is an outright deletion.

One candidate was rejected during the audit as circular — two bootstrap
tests each cited the other as residual cover, so deleting both would have
dropped all coverage of `_manual_persist_hint` being produced and printed.
`TestBootstrapReporting::test_failure_prints_the_unelevated_command` was
kept for that reason.

## The shortfall, and what was decided

The spec's gate asked for ≥43 reclaimed against the 48 that sets 141–145
allocate. A two-round audit of all 475 tests — a pairwise pass, then a
cluster pass over shared production branches — found 31 defensible slots
and no more. The files are less redundant than their growth history
suggested; the auditors' rejections are recorded in the session activity
log.

Rather than raise the ceiling or delete coverage that is still load-bearing,
the operator elected to proceed under 480 and defer the 142–145 allocation
until this set closes. Set 141 needs 11 of the 36 free slots. The tail of
the experiment remains 12 short and must be re-scoped downward, or reclaim
further, before set 144 begins. That decision is deliberately not made here.

## Reclaimed tests

### tests/test_transport_copilot.py (7)

| Test | Behavior | Category | Residual cover |
| --- | --- | --- | --- |
| `TestRoutedCallIsolation::test_the_handoff_branch_disables_them_too` | `--no-custom-instructions` present in handoff argv | duplicate | `test_argv_is_otherwise_identical_on_both_branches` + `TestRoutedCallIsolation::test_argv_disables_workspace_custom_instructions` imply it for every flag, not just this one |
| `TestHandoffAcknowledgement::test_handoff_incomplete_is_never_retryable` | Handoff-incomplete result is not retryable | falsifier-twin | `TestDispatch::test_nonzero_exit_classifies_stderr` asserts non-retryable across four error paths sharing the one `_error_result` expression; `RETRYABLE_ERROR_CLASSES` is empty |
| `TestArgvCeiling::test_other_spawn_errors_stay_generic` | Non-size `OSError` classifies as `generic-unknown` | duplicate | `TestDispatch::test_spawner_exception_is_classified_not_raised` drives the identical `except Exception` branch with an equivalent input |
| `TestCatalog::test_unknown_live_version_skips_drift_check` | Pinned catalog passes when live version is `None` | duplicate | `TestCatalog::test_validate_passes_on_diverse_confirmed_catalog` calls `validate_catalog` with `live_cli_version` defaulting to `None`; the pin is only read inside the skipped block |
| `TestHandoffCleanup::test_payload_deleted_after_spawn_failure` | Payload deleted when the spawner raises | cluster-duplicate | `test_payload_deleted_after_success` covers the same unconditional `finally`; `TestDispatch::test_spawner_exception_is_classified_not_raised` covers the error class |
| `TestHandoffCleanup::test_payload_deleted_after_first_byte_timeout` | Payload deleted on first-byte timeout | cluster-duplicate | `test_payload_deleted_after_success` covers cleanup; `TestDispatch::test_first_byte_timeout` covers the error class |
| `TestHandoffCleanup::test_payload_deleted_after_total_timeout` | Payload deleted on total timeout | cluster-duplicate | `test_payload_deleted_after_success` covers cleanup; `TestDispatch::test_total_timeout_after_first_byte` covers the error class |

The cleanup `finally` in `_run_handoff` has two outcomes, delete and retain.
Five tests covered the delete path; one is enough. The retain branch
(`test_diagnostics_toggle_retains_the_payload`) and the unique
`handoff: True` assertion in `test_payload_deleted_after_malformed_output`
are untouched.

### tests/test_bootstrap.py (4)

| Test | Behavior | Category | Residual cover |
| --- | --- | --- | --- |
| `TestPrompts::test_plan_prompt_shape` | Two literal substrings of `PLAN_PROMPT` | source-text assertion | `TestScaffoldBootstrapSets::test_fresh_project_gets_both_sets_with_parseable_specs` covers the structural path; no production code parses `PLAN_PROMPT` |
| `TestPrompts::test_decomposition_prompt_hard_rules` | Three prose substrings of `DECOMPOSITION_PROMPT` | source-text assertion | `TestWriters::test_register_writes_v4_shape` and `TestResolveSet` enforce the rules the prose describes |
| `TestBootstrapReporting::test_a_machine_scope_downgrade_is_announced` | Prose of the scope-downgrade stdout message | exact human-readable output | `TestPersistenceScope::test_unelevated_machine_request_falls_back_to_user_scope` covers the decision; `test_success_names_the_scope_that_landed` covers reporting |
| `TestPersistenceScope::test_manual_hint_never_requires_an_account_the_operator_lacks` | Hint string omits `admin`/`sudo` | source-text assertion | `TestBootstrapReporting::test_failure_prints_the_unelevated_command`, retained, proves the hint is produced and reaches stderr |

`TestPrompts` held only these two tests and was removed with them.

### tests/test_verdict.py (4)

| Test | Behavior | Category | Residual cover |
| --- | --- | --- | --- |
| `TestSeverityAndBlocking::test_classify_all_minor_is_non_blocking` | All-minor findings are non-blocking | duplicate | `test_minor_does_not_block` pins the predicate; `test_classify_partitions` pins the `nit_issues` bucket |
| `TestVerdictParsing::test_prose_mention_of_issue_is_not_a_block` | Prose mention of an issue does not create a block | duplicate | `test_issues_found_with_no_blocks_synthesizes_one` hits the same branch with the same assertions |
| `TestSeverityAndBlocking::test_missing_severity_blocks` | Missing severity is treated as blocking | cluster-duplicate | `test_unrecognized_severity_blocks` is the harder representative of the single `not in ("minor",)` expression |
| `TestSessionVerdictVocabulary::test_invented_tokens_refused[ISSUES_FOUNDATION]` | Prefix look-alike verdict token refused | cluster-duplicate | `test_invented_tokens_refused[VERIFIED_NOT_REALLY]` covers the same set-membership branch; the incident token and five other cases remain |

The verdict vocabulary itself is unchanged: `critical | major | minor` and
`VERIFIED | ISSUES_FOUND | WAIVED` keep their tests.

### tests/test_config.py (3)

| Test | Behavior | Category | Residual cover |
| --- | --- | --- | --- |
| `TestSplitSections::test_deeper_headers_stay_inside_sections` | Deeper markdown headers stay within their section | duplicate / test-infrastructure | `test_exact_level_split_and_slugging` covers the same `_split_sections` path and is the only cover of slug formation, so it stays |
| `TestLocalOverrides::test_unknown_nested_key_is_refused_not_dropped` | Depth-1 unknown overlay key refused | cluster-duplicate | `test_typo_in_the_seat_transport_block_is_refused` |
| `TestLocalOverrides::test_unknown_top_level_key_is_refused_not_dropped` | Depth-0 unknown overlay key refused | cluster-duplicate | `test_typo_in_the_seat_transport_block_is_refused` |

`_reject_unknown_overlay_keys` has one generic raise site (`config.py`
lines 133–138) building `".".join(trail + (str(key),))`; there is no
depth-specific branch. The surviving depth-2 test exercises the recursion
and the raise together, so the rule set 139 established — an unknown key is
refused at load, not ignored — keeps a named test.

### tests/test_escalation.py (2)

| Test | Behavior | Category | Residual cover |
| --- | --- | --- | --- |
| `TestDetectTruncation::test_clean_prose_passes` | Clean prose is not truncation | falsifier-twin | `test_prose_about_braces_that_ends_cleanly_is_not_truncation` is a strictly harder negative covering every path this one hits |
| `TestDetectTruncation::test_empty_content_is_not_truncation` | Empty content is not truncation | duplicate | Same harder negative; empty content is caught earlier by `should_escalate` as `empty_response` |

### tests/test_pricing.py (2)

| Test | Behavior | Category | Residual cover |
| --- | --- | --- | --- |
| `TestValidateModelRates::test_period_with_two_unbounded_rows_rejected` | Two unbounded rows raise `PricingError` | falsifier-twin | `test_period_without_unbounded_row_rejected` hits the same `!= 1` check; there is no per-value branch |
| `TestValidateModelRates::test_pricing_null_on_routable_entry_is_rejected` | `pricing: null` on a routable entry is rejected | duplicate | `test_routable_entry_without_rates_is_rejected` drives the identical not-declared branch |

### One each

| Test | Behavior | Category | Residual cover |
| --- | --- | --- | --- |
| `tests/test_gates.py::TestDriver::test_results_are_typed_rows` | `run_gates` returns `GateResult` rows | tautological type assertion | Every other test in the file reads `.passed`/`.remediation` on those rows; `GateResult` is the only type `run_gates` appends |
| `tests/test_ledger.py::TestTamperRefusal::test_hand_written_severity_refused_on_read` | Hand-written invalid severity refused on read | cluster-duplicate | `test_invented_verdict_refused_on_read` drives the identical `_validate` → `jsonschema.validate` → `LedgerError` path; no per-field branch |
| `tests/test_progress.py::TestProjectionOverCorpus::test_force_closed_historical_set` | Force-closed historical set reads back complete | cluster-duplicate | `TestWriters::test_flip_forced_promotes_and_marks` covers the write side, `test_v4_complete_set` the read side; `normalize_to_v4_shape` has no `forceClosed` branch |
| `tests/test_selection.py::TestNextEscalationModel::test_disabled_assignment_falls_to_cheapest_survivor` | Disabled tier assignment falls to cheapest survivor | cluster-duplicate | `test_excluded_assignment_falls_to_cheapest_survivor` reaches the identical return; `TestSurvivingCandidates::test_disabled_model_never_survives` covers the pre-filter |
| `tests/test_identity.py::TestModelResolution::test_normalized_token_dots_to_hyphens` | Dotted model token normalizes to hyphens | duplicate | `TestModelResolution::test_exact_registry_key` covers registry resolution |
| `tests/test_route.py::TestPromptSizeRefusal::test_a_prompt_within_budget_is_returned_intact` | In-budget prompt returned intact | falsifier-twin | Exists to show the refusal test could pass; the refusal test pins the behavior |
| `tests/test_transport_api.py::TestAnthropic::test_served_model_mismatch_warns` | Served-model mismatch prints a stderr notice | exact human-readable output | `tests/test_metrics.py::TestRecordCall::test_mismatch_is_tri_state` pins the contract that a mismatch is detected and recorded |
| `tests/test_evidence_protocol.py::TestTreeSnapshots::test_snapshot_excludes_machine_state_already_committed` | `.dabbler/` excluded even when previously committed | migration-path test | `test_snapshot_excludes_machine_state_when_not_ignored` drives the same `rm --cached --ignore-unmatch` step; production has no branch between the two arrival paths |
| `tests/test_modules.py::test_an_entry_written_by_the_old_writer_stays_valid` | Legacy `touches` manifest still loads | migration-path test | `test_an_unknown_entry_key_is_rejected_not_ignored` guards the schema in both directions; `test_create_writes_the_scope_fields` covers current shapes |

## Verification

`.venv/Scripts/python -m pytest` — 444 passed. Collection dropped from 475
to 444, matching the 31 rows above exactly. Four imports orphaned by the
deletions (`PLAN_PROMPT`, `DECOMPOSITION_PROMPT`, `copy`, `GateResult`) were
removed with them.
