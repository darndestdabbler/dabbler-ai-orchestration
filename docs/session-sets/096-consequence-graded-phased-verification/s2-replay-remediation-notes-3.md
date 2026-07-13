# Remediation notes — round 3 (remediation-review cycle 1)

- **Hotfix block pushes the tag after failed validation (fix-rejected /
  new in-hunk Major):** the Part 10 validation block is now a fail-stop
  chain — the module-test loop runs in a subshell that exits nonzero on
  the first failure, and the smoke run, `git tag`, and `git push` are
  `&&`-gated on it, so a red suite can never reach the tag lines. The
  subshell keeps the failure exit from closing the reader's interactive
  shell (copy-paste safe).
- The two accepted-with-modification residuals (cap-semantics wording,
  reviewDecision demotion) carried no restated Issue and no in-hunk
  defect; recorded as nits per the round artifact.
