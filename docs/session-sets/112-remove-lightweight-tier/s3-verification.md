**ISSUES FOUND**

**Issue 1:** The anti-resurrection gate misses likely TypeScript resurrections of `verificationMode` and both deleted modes.
- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** A future extension change reintroduces the removed field/type in `types.ts` or protocol code as `verificationMode?: string`, `export type VerificationMode = "out-of-band-or-none" | "dedicated-sessions"`, or an array of mode literals. That is probable because these are normal TypeScript shapes for the exact extension surface Set 112 removed, and the CI gate currently exits 0 for them.
- **Acceptance criterion:** JUDGMENT - The guard reports violations for TypeScript optional properties, PascalCase type aliases, and array/list/union declarations containing `verificationMode`, `out-of-band-or-none`, or `dedicated-sessions`, with falsifier tests for those shapes.
- **Details:** Violation: the plan requires a CI-wired script/test asserting zero live references to `verificationMode` or either mode, and the gate claims code outside comments is always declaration territory. Impact: the core anti-resurrection proof can pass while the deleted verification-mode API is restored. Evidence: `ai_router/scripts/lightweight_resurrection_guard.py:152` is lowercase/colon-or-equals oriented, and `:157` only catches mode values at line end; throwaway `.ts` probes with those declarations all returned `[ok]`.

**Issue 2:** Python non-docstring triple-quoted templates are wrongly treated as narration.
- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** A future Python helper or fixture generator adds `DEFAULT_SPEC = """\ntier: lightweight\n..."""`. That is a common way to embed spec snippets, but the guard blanks the whole string and exits 0, so a live generated Lightweight spec can re-enter silently.
- **Acceptance criterion:** JUDGMENT - The Python blanker distinguishes actual docstrings from assigned/called triple-quoted strings, and the guard fails on a triple-quoted production template containing `tier: lightweight` while still sparing real docstrings.
- **Details:** Violation: narration territory is defined as comments/docstrings, not arbitrary multiline string literals. Impact: the gate misses a real declaration-bearing template in executable Python. Evidence: `blank_python_narration` blanks every triple-quoted `tokenize.STRING` at `ai_router/scripts/lightweight_resurrection_guard.py:222-224`; a throwaway `template.py` with `DEFAULT_SPEC = """tier: lightweight..."""` returned `[ok]`.

**Issue 3:** The recorded Layer 2 run is not the canonical Layer 2 command.
- **Category:** Completeness / False Positive
- **Severity:** Major
- **Failure scenario:** The release proceeds claiming the full matrix ran under the canonical policy, but the only Session 3 run-of-record for the mocha/Layer 2 suite records `npm test`. That is probable because `ai_router/run_of_record.py:120` still defaults the suite to `npm test`, while `CONTRIBUTING.md:33` says Layer 2 is `npm run test:unit` and `CONTRIBUTING.md:40-42` explicitly says to use `test:unit` instead of `npm test` on Windows.
- **Acceptance criterion:** JUDGMENT - The final Session 3 test-runs record and run-of-record suite definition use `npm run test:unit` for Layer 2, or the canonical test policy is deliberately updated and the release-boundary evidence matches it.
- **Details:** Violation: Session 3 owes “Full matrix once against the final build” under the canonical test policy. Impact: the green matrix claim is not substantiated by the recorded evidence. Evidence: `docs/session-sets/112-remove-lightweight-tier/test-runs.jsonl:9` records `"command": "npm test"` for the final mocha run, contrary to the canonical command.

**Issue 4:** The authoritative release-status row still says router `0.33.0` is live.
- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** The operator or next orchestrator uses `docs/repository-reference.md` as the canonical release-status source and gets the wrong current PyPI baseline for the staged `1.0.0` release. That is probable because this doc is explicitly the shared release-status record.
- **Acceptance criterion:** JUDGMENT - `docs/repository-reference.md` names `0.34.0` as the live router version, includes the `0.34.0` publish details, and demotes `0.33.0` to prior lineage consistently with `ai_router/CHANGELOG.md`.
- **Details:** Violation: release staging included updating repository-reference release-status rows. Impact: the staged release documentation disagrees with the package changelog and live-version baseline. Evidence: `docs/repository-reference.md:75` says `1.0.0` staged / `0.33.0` live, while `ai_router/CHANGELOG.md:1144-1146` says `0.34.0` was published and superseded live `0.33.0`.

**NITS**

- **Nit:** `tools/dabbler-ai-orchestration/package-lock.json:3` and `:9` still say `0.49.0` while `package.json` is `0.50.0`. The release runbook keys off `package.json`, so this is tracked-metadata drift rather than a blocker.