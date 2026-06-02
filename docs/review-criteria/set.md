<!--
  Repo-specific review criteria for a FULLY-COMPLETED session set.

  This file is read by the Dabbler extension's `Copy: Set-
  accomplishments review prompt` command and embedded into the
  clipboard payload under "Operator review criteria (from
  docs/review-criteria/set.md)".

  - Edit the bullets below to teach reviewers what THIS repo cares
    about most when stepping back to judge a whole set.
  - Keep it short (≤ ~30 lines).
  - Delete this file to fall back to the extension's default English
    set-review instructions.
-->

When reviewing a fully-completed session set, weight the following:

- **Scope vs. delivery.** Does the change-log reconcile to the spec's
  §1 "what this set ships" bullets? Flag any spec deliverable that
  ended up deferred without a memory or follow-on session-set stub.
- **Carry-forward to memory.** Surprising or non-obvious lessons the
  set surfaced should land in
  `C:\Users\denmi\.claude\projects\.../memory/` as
  `feedback_*` or `project_*` notes. A set that finishes without any
  memory updates is suspicious unless the work was purely mechanical.
- **Version-bump correctness.** If the set ships a Marketplace or
  PyPI release, `docs/repository-reference.md`'s release-status /
  version-walk section and the relevant change-log entries should both
  name the new version, and the tag-driven GitHub Actions workflow
  should be quoted (per `reference_publish_via_github_actions`).
- **Round-A in-flight discipline at the set level.** Was every
  verifier finding either addressed or explicitly deferred with a
  named follow-on set?
- **Cross-repo notice.** Sets that change consumer-facing surfaces
  (router CLI, extension commands, spec.md schema) should ship a
  cross-repo notice under `docs/cross-repo-*.md` so consumer repos
  can adopt the change without reverse-engineering the diff.
- **Cumulative budget.** Total routed-API spend should be reported
  against the NTE budget. Budget overshoots should be called out
  with a one-line cause.
