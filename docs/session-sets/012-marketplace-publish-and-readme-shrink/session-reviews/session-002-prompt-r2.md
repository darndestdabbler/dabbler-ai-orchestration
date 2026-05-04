# Cross-provider verification — Set 12 Session 2: Round 2 (delta after Round 1 fixes)

You are reviewing the same session as Round 1
(`session-002-prompt.md`). Round 1 returned `ISSUES_FOUND` with two
Major issues. Both have been fixed. This Round 2 verifies the fixes
and re-checks for any issues the fixes might have introduced. The
original prompt's other ten probes (1, 3–10, 12 from the original
list) returned no findings in Round 1; they are not re-checked here
unless the fixes plausibly affect them.

The full Round 1 verifier output is preserved at the top of
`session-002.md`; the issues that needed fixing are repeated below
in italic.

---

## Round 1 issue 1 (Major) and the fix

> *"The claimed `v*`/`vsix-v*` tag-pattern coexistence is incorrect.
> GitHub's `on.push.tags: ['v*']` also matches `vsix-v0.13.0`, so the
> PyPI `release.yml` will trigger on Marketplace tags and then fail
> its strict classify regex. The Marketplace publish can still
> succeed, but every `vsix-v*` release will produce a spurious
> failing PyPI workflow and the runbook's 'prefix prevents collision'
> statement is false."*

### Fix landed in `.github/workflows/release.yml`

```diff
 # Anything else (e.g. `v1.0.0rc1`, `v1.2`, `vfoo`) is rejected by the
 # `classify` job before any artifact build runs.
 #
 # The build job runs after `classify` so artifacts exist for inspection
 # even if the publish step is gated by environment review.
+#
+# The `!vsix-v*` negative pattern excludes Marketplace tags because
+# GitHub's tag-pattern matcher treats `v*` as a glob that also matches
+# `vsix-v0.13.0` (the leading `v` is just a literal). Without this
+# exclusion, every Marketplace tag push would trigger a spurious PyPI
+# workflow run that fails the classify job. `publish-vscode.yml` (the
+# Marketplace pipeline) is the canonical handler for `vsix-v*`; this
+# workflow only sees `v*` tags that are *not* prefixed with `vsix-`.
+# Note: `branches`/`tags` and the corresponding `*-ignore` keys cannot
+# be combined in the same `on:` block, so we use the `!pattern` form
+# inside the `tags:` list instead.

 on:
   push:
     tags:
       - 'v*'
+      - '!vsix-v*'
```

### Fix landed in `docs/planning/marketplace-release-process.md`

The `## Tag-pattern coexistence with PyPI` section now describes the
actual mechanism rather than asserting prefix-uniqueness:

```diff
 - `.github/workflows/release.yml` — PyPI / TestPyPI for `dabbler-ai-router`.
-  Triggers on `v*` tags. Filters internally to `v[0-9]+.[0-9]+.[0-9]+`
-  and `v[0-9]+.[0-9]+.[0-9]+-rcN`.
+  Triggers on `v*` **with `!vsix-v*` excluded** (`tags: ['v*',
+  '!vsix-v*']`). Filters internally to `v[0-9]+.[0-9]+.[0-9]+` and
+  `v[0-9]+.[0-9]+.[0-9]+-rcN`.
 ...
+The negative-pattern exclusion in `release.yml` is **load-bearing
+mechanism**, not just bookkeeping. GitHub's tag-pattern matcher treats
+`v*` as a glob that matches the literal `v` followed by anything —
+`vsix-v0.13.0` matches `v*` because `vsix-v0.13.0` literally starts
+with `v`. Without the `!vsix-v*` exclusion, every Marketplace tag push
+would also trigger the PyPI workflow, which would then fail its strict
+classify regex and post a noisy red-X to the GitHub Actions tab on
+every Marketplace release. The `!pattern` form is required because
+GitHub Actions does not allow combining `tags:` with `tags-ignore:` in
+the same `on:` block.
```

### Verification questions for Round 2

- Does the `!vsix-v*` negative-pattern fix actually prevent
  `release.yml` from triggering on `vsix-v0.13.0` and `vsix-v0.13.0-rc1`
  tag pushes, given GitHub Actions' documented filter-pattern
  semantics? (The relevant docs note that `!pattern` excludes matches
  from the preceding positive patterns, and that pattern order
  matters.) Confirm: for tag `vsix-v0.13.0`, does `'v*'` match it?
  Does `'!vsix-v*'` then exclude it? Is there any GitHub-side edge
  case (e.g., `!pattern` applying only when the preceding match is
  exact, or pattern ordering subtlety) that would defeat the
  exclusion?
- Does `publish-vscode.yml` (which retains its plain
  `tags: ['vsix-v*']` trigger) still receive `vsix-v*` pushes
  unaffected by changes to `release.yml`? It should — the two
  workflows are independent — but worth confirming there's no
  cross-workflow filter-state interaction.
- Is the runbook's revised section now an accurate description of
  the mechanism, or does it overstate the strength of the
  exclusion?

---

## Round 1 issue 2 (Major) and the fix

> *"The `0.13.0` CHANGELOG entry overstates Marketplace availability.
> It says this 'is the first version published' on the Marketplace
> and gives install instructions as if publication has already
> happened, but the commit only adds the workflow/runbook and bumps
> the version; the human setup and first `vsix-v0.13.0` publish are
> still operator-driven post-commit steps."*

### Fix landed in `tools/dabbler-ai-orchestration/CHANGELOG.md`

```diff
 ## [0.13.0] — 2026-05-04

 ### Added
-- VS Code Marketplace launch: this is the first version published as
-  `DarndestDabbler.dabbler-ai-orchestration` on
-  `marketplace.visualstudio.com`. Install via
-  `code --install-extension DarndestDabbler.dabbler-ai-orchestration`
-  or the VS Code Extensions UI; no more local VSIX hunt.
+- **Marketplace-publish-ready release.** This is the first VSIX
+  designated for publication to the VS Code Marketplace as
+  `DarndestDabbler.dabbler-ai-orchestration`. The publishing
+  infrastructure (workflow + runbook) lands in this commit; the
+  one-time human-driven publisher account setup + first
+  `vsix-v0.13.0` tag push are operator-driven steps that may have
+  not yet completed at the time the VSIX is built. Once the publish
+  lands, `code --install-extension
+  DarndestDabbler.dabbler-ai-orchestration` will resolve from the
+  Marketplace.
 - `.github/workflows/publish-vscode.yml` — tag-driven publish workflow
   for the VS Code Marketplace and Open VSX Registry. Triggered on
   `vsix-vX.Y.Z` (publish) and `vsix-vX.Y.Z-rcN` (build-only) tags.
-  See `docs/planning/marketplace-release-process.md` for the per-release
-  checklist.
+  See `docs/planning/marketplace-release-process.md` for one-time
+  setup, the per-release checklist, rollback paths, and the
+  failure-modes table.
```

### Verification questions for Round 2

- Does the revised entry give a reader an accurate picture of what
  shipped? Specifically: it should make clear (a) the workflow file
  + runbook + version bump landed in this VSIX, and (b) the actual
  Marketplace publish is a downstream operator-driven event that may
  or may not have happened by the time someone reads the entry.
- Is the wording "Marketplace-publish-*ready*" clear enough, or does
  the bolded heading still risk being read as "already published"?
- Is the install-command callout still useful (since it's a forward-
  looking statement), or does it tip back toward over-claiming?

---

## What to verify (Round 2 scope)

1. **Issue 1 fix correctness.** The `!vsix-v*` negative-pattern in
   `release.yml`'s `on.push.tags` list, plus the runbook's revised
   coexistence section. Is the fix correct mechanically and is the
   prose accurate? Does the documentation correctly describe the
   single failure case the unfixed version would have produced?
2. **Issue 2 fix correctness.** The CHANGELOG entry's revised
   wording. Is the entry now appropriately calibrated to "publish-
   ready, not yet published" without becoming so hedged that a
   reader can't tell what shipped?
3. **No regressions from the fixes.** Did either edit introduce a
   new issue — e.g., the runbook section's expanded prose
   accidentally contradicting `release.yml`'s actual configuration,
   or the CHANGELOG re-wording dropping a fact a reader needs?

Return your verdict in the standard JSON shape:
`{"verdict": "VERIFIED" | "ISSUES_FOUND", "issues": [...]}`.
