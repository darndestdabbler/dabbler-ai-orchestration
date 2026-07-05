# Session 1 close reason — Set 080 (Row-structured option layout)

Session 1 of 2 completed its full spec scope:

1. **s1.layout** — `transportProfileBlockHtml` and
   `verificationModeBlockHtml` in
   `media/session-sets-tree/gettingStartedHtml.js` now render their options
   through a shared `optionRowHtml` helper: each option is a
   `<label class="gs-option-row">` carrying the radio, a bold short name
   (the copy before the constant's first em-dash), and the description (the
   copy after it). The split is presentation-only — the four copy constants
   are untouched and remain the single source; radio `name`/`value` attrs,
   default-checked logic, the `data-gs-*` block attributes, the group label
   divs, and the Copilot warning placement are all unchanged, so client.js
   wiring and the Playwright selectors work as before.
2. **s1.css** — `tree.css` gained the `.gs-option-row` grid
   (`auto | minmax(110px, 32%) | 1fr`, so radio / name / description stay
   aligned as columns across rows at any view width), a light
   `var(--vscode-panel-border)` rule between adjacent rows, description text
   in `var(--vscode-descriptionForeground)`, and bold styling for the two
   group-label divs. Theme-variable-based only, per the spec's non-goal.
3. **s1.tests** — the Set 079 S4 copy pin and the transport-profile copy
   assertions now assert the same literal strings across the new structure
   via `assertOptionCopy` (splits the constant at its em-dash and requires
   both parts verbatim in the name/desc spans). New Set 080 S1 suite
   (6 tests): em-dash split, unchecked/no-dash fallback, escaping,
   two-rows-per-group for both groups, radio-inside-row-label, and full-form
   renders on both tiers. No placement, default-checked, warning-visibility,
   or persistence test needed a semantic edit (the spec's scope-smell
   tripwire did not fire).
4. **Suites** — Layer-2 mocha 1250 passing; esbuild compile + `tsc` clean;
   Layer-3 Playwright 18/19 with the one failure (ARIA tree bucket test) a
   command-palette-open timeout flake unrelated to this change — it passed
   clean on an isolated re-run (L-064-12 satisfied for an
   Explorer-rendering-surface session).

**Verification:** the Set 068 routed gate returned **SKIP (exit 10)** — 3
files, 1 module, no coupling triggers, no raise-only operator facts — so the
per-session routed verification was bypassed per policy (the first genuine
gate skip since the S6 cut-over). `verification_method: "skipped"` records
this honestly (no verifier ran; the api-method status fallback would have
fabricated a VERIFIED token). The set's declared judgment gate for this
surface is Session 2's operator UAT walk (`requiresUAT: true`, per-set).

**Deferred / open:** none in scope. Session 2 (UAT, screenshot, release)
remains; its `package.json` version bump will trip the routed gate, so a
cross-provider verification call is expected there.
