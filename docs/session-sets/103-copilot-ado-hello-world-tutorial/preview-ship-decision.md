# Preview-ship decision (operator override, 2026-07-14)

**Context.** Session 1 (authoring) closed VERIFIED with the tutorial carrying a
DRAFT banner; the spec's Session 2 is an **operator-assisted live validation
walk** on a real Azure DevOps org + GitHub Copilot seat that would earn the doc
the right to de-draft. The operator had a **noon deadline and no ADO account set
up yet**, and directed: *"let's just update the tutorial online and we can do a
remediation session if it isn't working."*

**Decision (operator, confirmed the same session).** Ship the tutorial now as an
**honest preview** — usable by staff, clearly marked as not-yet-walked-live, with
a **"report issues" path** that becomes the trigger for the follow-on live-
validation / remediation session. Explicitly **not** presented as validated (that
would misrepresent untested ADO/pipeline/policy steps to staff and reverse the
operator's own "untested instructions can't ship" bar). The planned live walk is
**deferred**, not cancelled.

**What this session did (out-of-session operator-directed update, not the planned
Session 2 walk):**
- Reframed the tutorial banner DRAFT → **PREVIEW** (usable now; names exactly what
  is and isn't validated; invites report-issues feedback).
- Softened the cross-link wording (base tutorial, quick-start, README) from
  "draft pending live validation" to "usable preview, pending a live end-to-end
  walk".
- **Local de-risk of the never-executed pipeline logic** (no ADO needed): stood up
  the toy three-module layout and ran `azure-pipelines.yml`'s exact test commands —
  per-module count-guard + `unittest discover`, the all-modules loop (all GREEN
  with correct code; correctly RED on a failing test), the zero-test guard
  (correctly FAILS an empty module — no vacuous green), and the toy program
  (`python services/integration/app.py` prints exactly `Hello, world! It is
  12:00.`). Evidence: this session's transcript / scratch run on 2026-07-14.

**Still NOT walked live (the deferred remediation-session material — needs an ADO
org + Copilot seat):**
- Azure DevOps UI steps: project creation, branch policies, pipeline registration,
  automatically-included reviewers, Build validation.
- The pipeline's **ADO PR change-detection on a real hosted agent** (the
  fetch-ref / persistCredentials path, and the hosted parallel-jobs grant).
- **GitHub Copilot seat** setup + a real seat-driven verification round.
- Consequently, **Set 102's armed Azure DevOps UAT remains armed/undischarged**
  (the discharge was to happen in this set's live walk).

**Status of the set.** Session 2 (the live walk) is left **not-started** and held
in reserve for when the operator has ADO + Copilot access; that walk (or a fresh
remediation set triggered by staff feedback) runs the 11-walk UAT checklist,
discharges 102's armed ADO UAT, and de-drafts the doc for real. This preview ship
does not close the set.
