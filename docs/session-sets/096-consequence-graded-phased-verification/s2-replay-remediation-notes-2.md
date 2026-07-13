# Remediation notes — round 2 (supplementary finding)

- **Review cannot audit completed work after branch deletion (Major):**
  the gh pr list evidence now carries headRefName, mergedAt, and url
  (limit raised to 50) in both the runner script and the manual command
  block; Principle 3 now audits merged PRs whose headRefName names a
  session set (files resolved against the set's module: stamp on main),
  names the audited PR window, and caps only the merged-history half at
  ADVISORY when PR metadata is unavailable; the walkthrough's cleanup
  rule note now states that merged PRs are the durable audit trail.
