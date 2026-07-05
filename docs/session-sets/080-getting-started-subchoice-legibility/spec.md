# Getting Started Sub-Choice Legibility Spec

> **Purpose:** During the Set 079 UAT walk the operator found the two
> second-level radio groups in the Getting Started form hard to scan —
> "it isn't super-easy to see where the first option ends and the second
> option begins" — and requested a table-like presentation with light
> row separation for both groups: the Full tier's "Provider access (how
> routed calls run)" pair and the Lightweight tier's "Verification (per
> session set)" pair. This set restructures the *presentation* of those
> options (radio | short name | description, visually separated rows)
> without changing any value, schema, persistence contract, or the
> meaning of the copy.
> **Created:** 2026-07-05 (operator-requested during Set 079 S5 UAT;
> deferred out of the 0.35.0 release so already-attested walks did not
> need re-walking)
> **Session Set:** `docs/session-sets/080-getting-started-subchoice-legibility/`
> **Prerequisite:** 079-copilot-seat-onboarding-and-verification-copy
> (complete — this set restyles the surfaces 079 shipped)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

---

## Session Set Configuration

```yaml
totalSessions: 2
requiresUAT: true
requiresE2E: false
uatScope: per-set
pathAwareCritique: none
prerequisites:
  - slug: 079-copilot-seat-onboarding-and-verification-copy
    condition: complete
```

> Rationale: this is a small, presentation-only change to an interactive
> webview surface — exactly the class that needs a (short) human UAT
> walk, since "easier to visually distinguish" is partly a judgment
> call only the requesting operator can attest. No new logic, no async
> surface, no contract change → no E2E gate and no path-aware critique
> (declared explicitly here per the Set 079 S5 lesson: the config
> block, not prose, is what arms the critique gate).

---

## Project Overview

**Scope.** One presentation change, applied consistently to both
second-level radio groups in the Getting Started form
(`media/session-sets-tree/gettingStartedHtml.js`):

- Each option renders as a visually separated row (light rule or
  equivalent low-ink separation) with three aligned parts: the radio
  button, a short bold option name, and the description text. The
  operator's sketch: `Option Button | Direct provider API keys
  (default) | calls use your DABBLER_* provider API keys`.
- Applies to `transportProfileBlockHtml` (Full → Provider access) and
  `verificationModeBlockHtml` (Lightweight → Verification per session
  set) identically, so the two groups keep reading as the same pattern.
- The existing copy is REUSED, split at its em-dash into name/
  description parts (the Set 079 S4 simplified copy already has that
  shape: "Manual review (default) — paste a review prompt…"). Meaning,
  wording, and the "(default)" marker are unchanged; only markup and
  layout change. The Set 079 S4 literal-string pin test is updated to
  assert the same strings across the new structure.
- Refresh the extension README's `getting-started.png` screenshot,
  which predates the provider-access group entirely — one capture after
  the new layout lands covers both gaps (operator captures; the session
  stages the README reference).

**Non-goals.** No change to radio values, persistence
(seed/dirty/reload) behavior, warning placement/visibility logic, the
budget block, or any Build wiring. No color/theme work beyond what the
row separation needs (must respect VS Code theme variables). No
`ai_router/` changes (extension-only release).

---

## Sessions

### Session 1 of 2: Row-structured option layout for both sub-choice groups

**Steps:**
1. Restructure `transportProfileBlockHtml` and
   `verificationModeBlockHtml` to the shared row layout (radio | name |
   description), splitting each existing text constant at its em-dash
   for presentation only — the constants themselves stay the single
   source of the copy.
2. Add the minimal CSS (theme-variable-based row separation, alignment)
   to the form's stylesheet.
3. Update the Layer-2 render tests: the S4 copy pin asserts the same
   literal text content within the new structure; block-placement,
   default-checked, and warning-visibility tests stay green unchanged
   (they must not need semantic edits — if one does, that is a scope
   smell to stop on).
4. Full Layer-2 suite + `tsc` green.

**Creates:** row-layout markup + CSS, updated render/pin tests.
**Touches:** `media/session-sets-tree/gettingStartedHtml.js`, the form's
CSS (in `client.js` or the webview stylesheet), `gettingStartedHtml.test.ts`.
**Ends with:** both groups render the row layout on the vscode-stub with
all existing copy strings intact and the persistence suites untouched.
**Progress keys:** `s1.layout`, `s1.css`, `s1.tests`

---

### Session 2 of 2: UAT, screenshot, and release

**Steps:**
1. Author the per-set UAT checklist to the Set 078/079 bar (literal
   labels, source-re-grounded strings): one walk per group confirming
   the row separation reads clearly (the judgment item — the requesting
   operator attests) and that option selection/persistence still works.
2. Operator walk; remediate any findings.
3. Operator captures the refreshed `getting-started.png`; commit it.
4. Version bump (extension only), CHANGELOG, repository-reference,
   commit, push, green Test, operator-authorized tag push.

**Creates:** `080-getting-started-subchoice-legibility-uat-checklist.json`,
refreshed screenshot, release.
**Touches:** `tools/dabbler-ai-orchestration/CHANGELOG.md`,
`package.json`, `docs/repository-reference.md`,
`tools/dabbler-ai-orchestration/media/getting-started.png`.
**Ends with:** UAT attested (including the operator's own legibility
judgment), screenshot current, release published on operator
authorization.
**Progress keys:** `s2.uat`, `s2.screenshot`, `s2.release`

---

## Anti-patterns avoided

- **Implicit UAT** — declared `requiresUAT: true`; the whole point is an
  operator-judged legibility improvement.
- **Prose-vs-config critique mismatch** — `pathAwareCritique: none` is
  declared in the config block (Set 079 S5 lesson: the block, not prose,
  arms the gate).
- **Scope creep** — presentation only; any test that needs a *semantic*
  edit means the change leaked past presentation and the session stops.
