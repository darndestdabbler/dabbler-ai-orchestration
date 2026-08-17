**VERIFIED** — I checked the gdigrab backend, long-form harness, pointer measurement path, gate/waiver wiring, session artifacts, and test surface against the Session 8 plan. I did not find a Critical/Major defect that should block this pre-close verification.

**NITS**
- `s8-gdigrab-outcome.md` still says C7 was not waived / gate not opened, but `s8-operator-waiver.json`, `decisions.jsonl`, and `captureApproval("gdigrab")` now reflect the operator waiver.
- `s8-pointer-visibility-vscode.json` top-level reason overstates “every probed target”; the embedded check shows 1 passed probe and 5 indecisive probes.
- `captureApproval()` trusts any waiver with `waivedBy` + `attestation`; the current waiver is narrow, but the gate itself does not validate that scope.