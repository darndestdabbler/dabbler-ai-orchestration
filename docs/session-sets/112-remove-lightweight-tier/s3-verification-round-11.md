**ISSUES FOUND**

- **Issue 1:** Live policy reference docs still teach the removed `verificationMode` / two-tier model.
  - **Category:** Completeness
  - **Severity:** Major
  - **Failure scenario:** A future maintainer or operator working on `contractGate` or `pathAwareCritique` consults the live reference docs and is told those current policy attributes mirror the removed `verificationMode` attribute, including behavior “on both tiers.” That is probable because these are the dedicated docs for those gates, not archived session records, and the set explicitly requires docs to tell one one-tier story.
  - **Acceptance criterion:** `python -c "exec(__import__('base64').b64decode('ZnJvbSBwYXRobGliIGltcG9ydCBQYXRoCnN0YWxlID0gW10KY2hlY2tzID0gewogICAgImRvY3MvY29udHJhY3QtZ2F0ZS5tZCI6IFsiYHZlcmlmaWNhdGlvbk1vZGVgIChTZXQgMDU3KSJdLAogICAgImRvY3MvcGF0aC1hd2FyZS1jcml0aXF1ZS1zY2hlbWEubWQiOiBbCiAgICAgICAgImV4YWN0bHkgbWlycm9yaW5nIHRoZSBgdmVyaWZpY2F0aW9uTW9kZWAgYXR0cmlidXRlIiwKICAgICAgICAiYm90aCB0aWVycyIsCiAgICBdLAp9CmZvciByZWwsIG5lZWRsZSAgaW4gY2hlY2tzLml0ZW1zKCk6CiAgICB0ZXh0ID0gUGF0aChyZWwpLnJlYWRfdGV4dChlbmNvZGluZz0idXRmLTgiKQogICAgZm9yIG5lZWRsZSBpbiBuZWVkbGVzOgogICAgICAgIGlmIG5lZWRsZSBpbiB0ZXh0OgogICAgICAgICAgICBzdGFsZS5hcHBlbmQoZiJ7cmVsfToge25lZWRsZX0iKQppZiBzdGFsZToKICAgIHByaW50KCJcbiIuam9pbihzdGFsZSkpCnJhaXNlIFN5c3RlbUV4aXQoMSBpZiBzdGFsZSBlbHNlIDApCg=='))"`
  - **Acceptance expectation:** exit 0
  - **Details:** Violation: the task requires “docs read as one story” and the end state says `verificationMode` and the two-tier model are deleted. Impact: a reasonable reviewer cannot accept the doc-collapse deliverable while current gate docs still present the deleted field/tier as live precedent. Evidence: `docs/contract-gate.md:31-33` says `contractGate` mirrors `verificationMode`; `docs/path-aware-critique-schema.md:57-64` says `pathAwareCritique` exactly mirrors `verificationMode` and preserves behavior “on both tiers.”

#### NITS

- **Nit:** `tools/dabbler-ai-orchestration/package-lock.json` still records `0.49.0` while `package.json` stages `0.50.0`; publish checks appear to key off `package.json`, but the lockfile metadata is stale.
- **Nit:** Some lower-traffic historical/comment surfaces still have stale Lightweight wording, e.g. `docs/migration-v3-dry-run.md` and `sampleProject.ts` comments. They are less user-facing than the policy docs above but still worth cleaning up.