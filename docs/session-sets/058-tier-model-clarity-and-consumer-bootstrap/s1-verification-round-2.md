# Session 1 cross-provider verification — ROUND 2 (Set 058)

- Verifier model: gpt-5-4 (gpt-5.4)
- Tier: 3
- Cost (this call): $0.1146
- Total cost (incl. any auto-verify): $0.1146
- Escalated: False
- Truncated: False

---

VERDICT: ISSUES_FOUND

## Findings

1. **Major**
   - **Issue:** Repo-level tier framing regresses the set-scoped model. The tails say **“When this repo is on Full tier”**, but the SSoT correctly says tier is a property of the **session set**, not the repo. A single repo may contain both Full and Lightweight sets side by side.
   - **Location:** `docs/templates/consumer-bootstrap/engine-file.agents-tail.md`, `docs/templates/consumer-bootstrap/engine-file.gemini-tail.md`
   - **Fix:** Replace repo-scoped wording with active-set wording, e.g. **“When the active set is `tier: full`...”** or **“For Full-tier sets...”**.

2. **Minor**
   - **Issue:** The template-bundle README says rendered artifacts link to the SSoT via a **raw GitHub URL**, but the templates actually use standard GitHub **blob** URLs. This is an avoidable internal inconsistency in the canonical bundle docs.
   - **Location:** `docs/templates/consumer-bootstrap/README.md`
   - **Fix:** Change **“raw GitHub URL”** to **“GitHub URL”** / **“GitHub blob URL”**, or switch the templates to raw URLs consistently.

## Confirmed resolved

- **Repo-level `{{TIER}}` banner in `start-here.md`**
  - **Location:** `docs/templates/consumer-bootstrap/start-here.md.template`
  - **Status:** Resolved. Tier is now explicitly read from the **active set’s** `spec.md`, not treated as repo-wide.

- **Surfaces paraphrasing the tier model instead of pointing to the SSoT**
  - **Location:** `docs/templates/consumer-bootstrap/spec.md.template`, `docs/templates/consumer-bootstrap/engine-file.shared-body.md`
  - **Status:** Resolved. Both now reduce to thin pointers plus only local operational context.

- **`{{TOTAL_SESSIONS}}` repetition inconsistency**
  - **Location:** `docs/templates/consumer-bootstrap/README.md`
  - **Status:** Resolved. The repeated-unit contract for both `spec.md.template` and `session-state.json.template` is now explicit and machine-checkable.

- **Anti-restatement guidance self-contradiction**
  - **Location:** `docs/templates/consumer-bootstrap/README.md`
  - **Status:** Resolved. The rule now correctly allows local operational deltas while delegating tier meaning to the SSoT.

- **Dismissed Critical: spec template missing `schemaVersion: 4`**
  - **Location:** `docs/templates/consumer-bootstrap/spec.md.template`, `docs/templates/consumer-bootstrap/session-state.json.template`
  - **Status:** Correctly dismissed. `schemaVersion: 4` belongs in the **companion `session-state.json`**, not in the spec configuration block; the state template correctly sets it to `4`. Adding it to the spec would create a non-canonical spec shape.