# Remediation report - dabbler-platform

- committed ref: 82a95ab..d66c449
- generated at: 2026-06-19T15:26:53.211414-04:00
- provenance complete: False
- NOTE: provenance is incomplete (pushUnkeyed=1, pullUnkeyed=2); a defect both surfaces caught but neither keyed appears as two separate entries.
- findings: 3

## 1. [Major] Completeness - push-only
- defect key: (unkeyed)
- surfaces: push
- (push) Verifier missed incomplete session closeout metadata \u2014 session-state.json and session-events.jsonl are inconsistent with the completion artifacts in the same changeset

- **Category:** Completeness
- **Severity:** Major

**Violation:** The response declares an unqualified "Verdict: Pass" and states "The Session 2 deliverable is valid \u2026 It satisfies the required wrapper behavior" without flagging a structural inconsistency in the committed metadata.

**Impact:** The changeset as merged leaves the repo with contradictory session-state signals. `session-state.json` reports the session as still live (`"status": "in-progress"`, `"lifecycleState": "work_in_progress"`, `"completedAt": null`, `"verificationVerdict": null`). `session-events.jsonl` contains a `work_started` event for session 2 and no matching `closeout_succeeded`. Any automation or human reader consulting these canonical state files would conclude session 2 is still in progress and act accordingly \u2014 re-running work, skipping next-session setup, or misreporting metrics. A competent reviewer seeing this would say "fix the closeout before merging."

**Evidence:** The diff adds/updates, all in the same commit:
- `session-state.json` \u2192 `"status": "in-progress"`, `"completedAt": null`, `"verificationVerdict": null`
- `session-events.jsonl` \u2192 ends with `"session_number": 2, "event_type": "work_started"`, no `closeout_succeeded`
- `session-reviews/session-002.md` (new file) \u2192 `"Verdict: Pass"`
- `router-metrics.jsonl` \u2192 adds a `session_number: 3, task_type: "analysis"` entry (the next-session recommendation routing that is only produced at closeout)
- `ai-assignment.md` \u2192 Session 2 actuals block fully filled in, past-tense narrative
- `disposition.json` \u2192 `"summary"` field describes Session 2 in the past tense as a completed deliverable, and `"specifics"` already points to Session 3

A commit cannot both contain a Pass verification review and the next-session routing while simultaneously leaving the state files showing the session is incomplete. The verifier reviewed code correctness thoroughly but did not cross-check the session lifecycle state against the other artifacts in the same diff.

---

## 2. [Major] contract-drift - pull-only
- defect key: (unkeyed)
- surfaces: pull
- (pull) Severity: Major
Category: contract-drift
Location: README.md:46, docs/platform-overview.md:671, docs/planning/project-guidance.md:28, docs/ (missing file)
Description: Violation: the repo claims "The single source of truth for the AI-led workflow is docs/ai-led-session-workflow.md" (README.md) and repeatedly tells readers to "see docs/ai-led-session-workflow.md" (for example docs/platform-overview.md and docs/planning/project-guidance.md), but the docs directory on disk does not contain that file. Impact: this changes the merge decision because contributors following the documented closeout / UAT / delegation workflow are sent to a dead link for the stated SSOT, so the repo's own operational guidance is unusable at the exact point where the docs say it is authoritative. Evidence: list_dir("docs") returns COMPATIBILITY.md, component-catalog/, getting-started.md, packaging/, planning/, platform-overview.md, reports/, scaffolding-templates/, session-sets/ and no ai-led-session-workflow.md; read_file("README.md") and read_file("docs/platform-overview.md") both contain live links and SSOT claims to that missing path; grep("ai-led-session-workflow","docs") shows many additional references. Fix: restore docs/ai-led-session-workflow.md at the documented path or update every SSOT/reference link to the real file before merge.

## 3. [Major] contract-drift - pull-only
- defect key: (unkeyed)
- surfaces: pull
- (pull) Severity: Major
Category: contract-drift
Location: docs/platform-overview.md:121, docs/platform-overview.md:122, src/Libs/Dabbler.Api.Querying/Dabbler.Api.Querying.csproj:9
Description: Violation: the external-adoption overview states "The platform ships eight consumable libraries plus one development helper," then enumerates only Components, Platform.Stubs, Reports.Core, Reports.Export, Reports.Blazor, Security, Security.Blazor, and Testing.Blazor. Impact: this changes the merge decision because the overview is the repository's stated first document for future consumers, yet it omits a library that is actually packaged (PackageId Dabbler.Api.Querying). That leaves adopters with an incomplete product surface and makes the package/docs contract internally inconsistent at release time. Evidence: read_file("docs/platform-overview.md") contains the eight-library claim and no Dabbler.Api.Querying section; list_dir("src/Libs") includes Dabbler.Api.Querying/; grep("PackageId","src/Libs") shows src/Libs/Dabbler.Api.Querying/Dabbler.Api.Querying.csproj:9:<PackageId>Dabbler.Api.Querying</PackageId>. Fix: either document Dabbler.Api.Querying in the overview and all related package-index docs, or stop shipping it as a consumable package until the public docs are updated.

