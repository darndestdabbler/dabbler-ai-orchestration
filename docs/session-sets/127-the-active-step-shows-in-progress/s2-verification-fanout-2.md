VERIFIED — I checked the TypeScript row-model mirror, scan wiring, Explorer rendering, Python parity side, and UAT fixture path. I found no Critical/Major defect against the session’s pre-close deliverables: the derived active step is gated on in-flight state, stands down when the record answers, renders via `effectiveStatusOf`, and the parity fixture now covers both derived fields.

#### NITS

- **Nit:** `tools/dabbler-ai-orchestration/CHANGELOG.md:121` says the parity corpus grew to 22 cases, while the updated tests/conventions assert 23.
- **Nit:** `CHANGELOG.md:104-105` and `README.md:267-268` overstate that the Work Explorer facts “also light up on sets that closed months ago”; `workExplorerTreeModel.ts:274-276` still only exposes step nodes for `in-progress` sessions.