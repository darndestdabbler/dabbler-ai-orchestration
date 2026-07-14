# Session 3 — remediation for verification round 2 (the close-backstop round)

Round 2 was the Set 084 close backstop running in-process at the first
`close_session` attempt: the post-round-1 edits (the critique-driven
detached-HEAD clarification, disposition, change-log, critique artifact)
invalidated the round-1 stamp, so the gate re-verified the full diff with a
fresh gpt-5-6 pass — **without** the round-1 up-front conventions block, which
is why the scoping context below had to be re-established through remediation
rather than assumed.

## Finding 1 (Major, completeness): "The tutorial is not an executable host-neutral main flow for Azure DevOps" — FIXED (via the verifier's own alternative fix line)

The verifier offered two acceptable fixes: (a) provide an executable Azure
DevOps path for ownership/pipelines/policies, or (b) "clearly separate the
GitHub bootstrap … while keeping the automated PR/finalize/tag loop genuinely
identical," plus the ADO source-branch-deletion point. We took (b) plus every
cheap, verifiable piece of (a):

- **New host-scope block at the top of Part 7** stating plainly: the
  guardrails walk is GitHub-concrete; the automated loop (Parts 4–10) is
  identical on both hosts; ADO admins do the policy setup from the notes and
  rejoin at Part 8; the full executable ADO bootstrap belongs to the planned
  ADO-first companion walkthrough.
- **ADO callouts upgraded from conceptual to actionable**, with exact UI
  paths and policy names: *Automatically included reviewers* with per-module
  path filters marked Required (the full CODEOWNERS equivalent — request AND
  requirement) in step 1; *Build validation* branch-policy wiring (ADO's
  required status check) in step 2; the no-separate-check-selection note in
  step 4; the Part 3 branch-policies path spelled out.
- **ADO source-branch deletion covered** (the verifier's explicit sub-point):
  Part 3's ADO note now names the PR-completion "Delete <branch> after
  merging" default — the remote-cleanup equivalent of GitHub's auto-delete —
  so finalize and the no-lingering-branches self-check work as documented on
  ADO.
- **Host-wide claims scoped**: Part 8's "the host never requests a review
  from a PR's own author" is now GitHub-scoped with the ADO analogue stated
  separately; the required-checks self-check item carries its ADO acceptance
  (Build validation policy).

**Why not a full Azure Pipelines walkthrough:** the session has no ADO
organization to validate against (that is exactly why the ADO dogfood has
been an *armed operator UAT* since Session 1), and the operator-set UAT
quality bar forbids shipping untested step-by-step instructions ("untested
instructions are not known to be followable"). An executable, validated
ADO-first walkthrough is queued as its own follow-on set (now paired with
the operator's same-day directive for a Copilot-flavored tutorial cut —
their staff is Copilot-locked and ADO-hosted). The spec's non-goals also
place one-time bootstrap outside the automation scope ("genuine one-time
bootstrap the tutorial still teaches by hand").

## Nits

1. **Part 0.5 "green" check not actionable where it appears / PAT not
   validated — FIXED.** The section now says the in-product check first
   becomes runnable in Part 4 (needs a repo, `origin`, non-trunk branch) and
   gives a real authenticated ADO read (`az repos list --organization …
   --project … --output table`) as the PAT proof instead of "the variable is
   set."
2. **Appendix "by a human (or a different agent)" contradicts the
   human-approval invariant — DISMISSED (spec citation).** The spec's
   authoritative design says verbatim: "PR **review and approval** stay on
   the git host (**a human, or a different agent, approves**)". The appendix
   matches the spec; the invariant the set enforces is that *this framework's
   commands* never approve/merge/push on their own authority, which the same
   appendix sentence states.
3. **Hotfix validation loop Bash-only — FIXED.** The block is now labeled
   "Bash / Git Bash" and a PowerShell equivalent is provided.
4. **Router changelog notation missing — FIXED.** `ai_router/CHANGELOG.md`
   now carries an explicit Set 102 notation (extension-only set; router
   stays `0.33.0`; zero entries by design), so the "update both package
   changelogs" walk has a router-side record rather than only the extension
   changelog's cross-reference.
