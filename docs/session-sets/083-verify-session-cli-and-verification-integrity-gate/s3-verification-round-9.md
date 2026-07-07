**ISSUES FOUND**

- **Issue 1:** The extension changelog deletes the existing `0.38.0` release heading and folds already-shipped notes into `Unreleased`
  - **Category:** Correctness
  - **Severity:** Major
  - **Details:**
    - **Violation** — `tools/dabbler-ai-orchestration/CHANGELOG.md` says, **"Format follows Keep a Changelog"**, and the governing instruction for this round is that the current set's changes stay in **`[Unreleased]`** because the releases moved to Set 084. That permits adding a new unreleased section; it does **not** permit rewriting an already-versioned release as unreleased.
    - **Impact** — This corrupts the extension's release history and would taint the deferred Set 084 release notes. The current `Unreleased` section now contains both the real Set 083 scaffold changes **and** the previously released 0.38.0 notes, including obsolete routed-gate-era wording. A reasonable reviewer should block on a changelog that misstates what is already shipped vs. still unreleased.
    - **Evidence** — In the diff for `tools/dabbler-ai-orchestration/CHANGELOG.md`, these lines are removed:
      - `## [Unreleased]`
      - `## [0.38.0] — 2026-07-06 (Set 082 — omit verificationMode from Full-tier scaffolds)`
      
      and replaced with only:
      - `## [Unreleased] (Set 083 — mandatory Full-tier verification in the scaffold bundle)`
      
      The old 0.38.0 body beginning `Extension-only release: dabbler-ai-router stays at 0.28.0...` remains immediately below, so it now sits under `Unreleased`.
    - **Location** — `tools/dabbler-ai-orchestration/CHANGELOG.md`
    - **Correct answer** — Restore the `## [0.38.0] — 2026-07-06 ...` heading beneath the new Set 083 `## [Unreleased]` section so only Set 083 changes are unreleased and the shipped 0.38.0 notes remain versioned.

#### NITS

- **Nit:** `docs/templates/consumer-bootstrap/getting-started.md.template`, its dist copy, and the regenerated cold-start fixtures still say **"the Step 6 verification command"** even though the scaffold now puts `verify_session` in **Step 5** and `close_session` in **Step 6`.