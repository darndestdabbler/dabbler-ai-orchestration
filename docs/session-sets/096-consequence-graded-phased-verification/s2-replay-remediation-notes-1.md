# Remediation notes — round 1 (discovery, merged fan-out findings)

- **ADVISORY cap can overwrite proven failures (call 1, Major):** added a
  global "Cap semantics" rule to the review prompt (a cap is a ceiling on
  PASS for the unevidenced fact only; an evidenced FAIL is never
  suppressed) and referenced it at every cap site: Principle 4 evidence
  rule, Principle 6 production-target rule, output-format sections 4 and
  6, and the Final Rule.
- **Hotfix drill tags without integrated validation (call 2, Major):**
  Part 10 step 3 now validates the exact hotfix commit with the FULL
  integrated suite (every module's tests via the services/*/ loop plus the
  composed smoke run, mirroring the all-modules job) before tagging, and
  the surrounding prose explains why the path-scoped PR job is not enough.
- **reviewDecision treated as enforcement proof (call 2, Major):**
  Principle 4 fact 3 now accepts ONLY protection/ruleset configuration as
  enforcement evidence; reviews/reviewDecision demoted to fact-4
  completed-review evidence; the runner script and the manual command
  block both gather `gh api repos/{owner}/{repo}/branches/main/protection`
  best-effort.
- **CODEOWNERS audited without independent ownership source (call 2,
  Major):** the evidence section now gathers an independent ownership
  ground truth (owners note in modules.yaml / roster doc / caller map);
  Principle 5 gained an owner-identity rule (path coverage evidenced,
  owner identity capped ADVISORY without a source); the walkthrough's
  Part 7 now tells teams to write the module->owner mapping down outside
  CODEOWNERS.
