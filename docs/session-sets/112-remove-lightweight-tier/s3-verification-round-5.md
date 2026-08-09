**ISSUES FOUND**

- **Issue 1:** The auto-loaded engine bootstrap files still teach that the session-state schema applies to “both Full and Lightweight tiers.”
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** Every future Claude/Copilot/Gemini session in this repo auto-loads one of these files and receives stale tier guidance at session start. That is probable because these files are the bootstrap entrypoints, not obscure archives.
  - **Acceptance criterion:** `python -c "exec(__import__('base64').b64decode('CmZyb20gcGF0aGxpYiBpbXBvcnQgUGF0aApzdGFsZSA9IFtdCmZvciByZWwgaW4gKCJBR0VOVFMubWQiLCAiQ0xBVURFLm1kIiwgIkdFTUlOSS5tZCIpOgogICAgdGV4dCA9IFBhdGgocmVsKS5yZWFkX3RleHQoZW5jb2Rpbmc9InV0Zi04IikKICAgIGlmICJGdWxsIGFuZCBMaWdodHdlaWdodCB0aWVycyIgaW4gdGV4dCBvciAiYm90aCBGdWxsIGFuZCBMaWdodHdlaWdodCIgaW4gdGV4dDoKICAgICAgICBzdGFsZS5hcHBlbmQocmVsKQpyYWlzZSBTeXN0ZW1FeGl0KDEgaWYgc3RhbGUgZWxzZSAwKQo='))"`
  - **Acceptance expectation:** exit 0
  - **Details:** Violation: the set’s end-state is “One tier” and “docs read as one story.” Impact: the highest-frequency orchestrator guidance contradicts the removal and can steer future agents to preserve or reason about a tier that no longer exists. Evidence: `AGENTS.md:64-66`, `CLAUDE.md:63-65`, and `GEMINI.md:63-65` all still say the v4 state shape is “on both Full and Lightweight tiers.”

- **Issue 2:** The anti-resurrection guard still misses ordinary declaration-territory live references to the removed field/modes.
  - **Category:** Correctness
  - **Severity:** Major
  - **Failure scenario:** A future config/schema helper reintroduces `verificationMode` as a key constant or allowed-field list entry, or returns a deleted mode literal from code. Those are normal implementation shapes for config compatibility code, so the gate can pass while the removed API is back.
  - **Acceptance criterion:** `python -c "exec(__import__('base64').b64decode('CmltcG9ydCBwYXRobGliLCBzdWJwcm9jZXNzLCBzeXMsIHRlbXBmaWxlCnJvb3QgPSBwYXRobGliLlBhdGgodGVtcGZpbGUubWtkdGVtcCgpKQoocm9vdCAvICJkeW5hbWljX2tleS50cyIpLndyaXRlX3RleHQoJ2NvbnN0IExFR0FDWV9LRVkgPSAidmVyaWZpY2F0aW9uTW9kZSI7XG5pZiAoTEVHQUNZX0tFWSBpbiBzcGVjKSB7IGVuYWJsZUxlZ2FjeSgpOyB9XG4nLCBlbmNvZGluZz0idXRmLTgiKQoocm9vdCAvICJmaWVsZF9hcnJheS5weSIpLndyaXRlX3RleHQoJ0FMTE9XRURfU1BFQ19GSUVMRFMgPSAoInJlcXVpcmVzVUFUIiwgInZlcmlmaWNhdGlvbk1vZGUiKVxuJywgZW5jb2Rpbmc9InV0Zi04IikKKHJvb3QgLyAibW9kZV9yZXR1cm4udHMiKS53cml0ZV90ZXh0KCdmdW5jdGlvbiBkZWZhdWx0VmVyaWZpY2F0aW9uTW9kZSgpIHsgcmV0dXJuICJkZWRpY2F0ZWQtc2Vzc2lvbnMiOyB9XG4nLCBlbmNvZGluZz0idXRmLTgiKQpwcm9jID0gc3VicHJvY2Vzcy5ydW4oW3N5cy5leGVjdXRhYmxlLCAiYWlfcm91dGVyL3NjcmlwdHMvbGlnaHR3ZWlnaHRfcmVzdXJyZWN0aW9uX2d1YXJkLnB5IiwgIi0tcmVwby1yb290Iiwgc3RyKHJvb3QpXSwgdGV4dD1UcnVlLCBjYXB0dXJlX291dHB1dD1UcnVlKQpvdXQgPSBwcm9jLnN0ZG91dCArIHByb2Muc3RkZXJyCm5lZWRlZCA9IFsiZHluYW1pY19rZXkudHMiLCAiZmllbGRfYXJyYXkucHkiLCAibW9kZV9yZXR1cm4udHMiXQpyYWlzZSBTeXN0ZW1FeGl0KDAgaWYgcHJvYy5yZXR1cm5jb2RlICE9IDAgYW5kIGFsbChuYW1lIGluIG91dCBmb3IgbmFtZSBpbiBuZWVkZWQpIGVsc2UgMSkK'))"`
  - **Acceptance expectation:** exit 0
  - **Details:** Violation: Session 3 promised a CI-wired gate asserting zero live references/declarations of `verificationMode` or either removed mode outside archives. Impact: the central executable proof is still false for common code shapes. Evidence: current `lightweight_resurrection_guard.py` exits 0 for `const LEGACY_KEY = "verificationMode"`, `ALLOWED_SPEC_FIELDS = (..., "verificationMode")`, and `return "dedicated-sessions"` in declaration territory, even though it reports the real repo clean.

**NITS**

- **Nit:** `tools/dabbler-ai-orchestration/package-lock.json:3` and `:9` still say `0.49.0` while `package.json` stages `0.50.0`; publish checks key off `package.json`, so this is metadata drift rather than a blocker.
- **Nit:** Additional low-traffic live prose/comments still use stale tier framing, e.g. `docs/path-aware-critique-schema.md:60/64`, `docs/verification-surface-strategy.md:312-314`, and `tools/dabbler-ai-orchestration/src/utils/sampleProject.ts:459-468`.