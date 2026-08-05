# Session 3 verification conventions

> Up-front conventions block for the S3 verification prompt (repo rule,
> promoted from L-064-10). State the baseline, the release contract and the
> by-design exclusions BEFORE the work to be reviewed, so Round 1 spends its
> findings on real defects instead of re-deriving the agreed starting point.

## Severity rubric (L-095-1 — carry until it ships in the template)

Grade by **CONSEQUENCE**: probability the stated failure scenario
materialises for a real user × impact on the deliverable's objectives. Low
probability **OR** low impact is **Minor**, even when technically correct.
**No plausible failure scenario ⇒ Minor by definition.** State the scenario
concretely; a finding that cannot name one is a nit.

## Suite baseline

| layer | command | result |
| --- | --- | --- |
| Layer 2 (unit) | `npm run test:unit` (mocha + ts-node + vscode-stub) | **1866 passing, 0 failing** |
| Layer 3 (Playwright) | `npx playwright test` | full suite run once at close — count in `disposition.json` |
| typecheck | `npx tsc --noEmit -p .` | clean |
| build | `npm run compile` | clean |

**The Layer 2 count went DOWN, 1900 → 1866, and that is intended.** This
session deletes a renderer, so it deletes the tests that existed only to
describe it. Every deletion is triaged in `s3-implementation-notes.md` §6
and `s3-deletion-review.json`; several were *migrated* to stronger
assertions rather than dropped. A finding that reports the count drop as a
regression without naming a specific lost behaviour is not a finding.

**`npm test` (Layer 2 via @vscode/test-electron) does not launch** on VS
Code 1.128+ (`bad option: --no-sandbox`) — a standing environment failure
recorded before this set. The `ts-node` + `vscode-stub` path above is the
sanctioned way to run the same suite and is what the baseline reports.

**Lint** carries the same pre-existing 7 errors / 61 warnings as Session 2,
all `no-var-requires` / `no-regex-spaces` in files this session does not
touch. Findings that re-report them are not findings.

## Release contract

- **Nothing is released this session.** No version bump, no CHANGELOG entry,
  no vsix. Session 4 owns the release; publishing and tagging are
  operator-gated regardless.
- `dist/extension.js` is rebuilt and committed because the repo tracks it.
  It is a build artifact, not hand-authored.

## By-design exclusions — do not report these as defects

1. **`contributes.viewsWelcome` is NOT contributed**, though the spec names
   it. Reasoning in `s3-implementation-notes.md` §3: it would fire in
   exactly one case (no folder open) that the webview already covers more
   richly, so contributing it stacks two competing empty states. The routed
   architecture call reached the same conclusion independently. This is a
   recorded spec deviation raised at Step 9, not an omission.
2. **The invalid-manifest fault ships in ONE channel** (`TreeView.message`),
   against the routed architecture call's "both" recommendation. Reasoning
   in §4. Asserted end to end in `system-status.spec.ts`.
3. **The payload builders are knowingly left orphaned**, with a named owner
   (Session 4) and the routed deletion review as evidence — §7. Deleting
   them without first re-expressing 22 Layer 2 assertions against
   `VisibleModule` would delete coverage rather than migrate it. Reporting
   the orphan is fair; reporting it as *unnoticed* is not.
4. **No performance claim is made.** Session 1 withdrew the performance
   pitch in writing. Session 4 owns the sub-second startup gate. Nothing in
   this session measured startup, and nothing here should be read as
   predicting it.
5. **`media/session-sets-tree/` is now a misnomer** — no tree lives in it.
   Left deliberately (many references, low value, high churn), recorded in
   §8.6.
6. **Two README screenshots are stale** (`work-explorer-modules.png`,
   `getting-started.png`). They need a running build to retake, which S4 has
   and S3 did not; recorded in §8.5. The three *unreferenced* stale assets
   were deleted this session.
7. **ARIA / keyboard-navigation coverage was ceded to the platform.** VS
   Code emits the tree semantics now; asserting them would test VS Code. The
   dropped assertions are enumerated per-file in each rewritten spec's
   header comment.

## What is genuinely new and deserves the review's attention

- `providers/systemStatus.ts` — the `when`-gate predicate, and the
  `createRequire` seam that loads the webview's own fault rules into the
  host to avoid a dual implementation. **Fails toward visible** at every
  failure point; the failing path is covered by inspection, not by a test.
- `WorkExplorerTreeProvider.onDiagnostic` → `TreeView.message`, including
  the clear-on-repair behaviour.
- `overlay-click-swallow.spec.ts` — a falsifier that must FAIL when seeded
  and PASS when not. Both halves ran green (see the activity log); the test
  fails loudly if the seed stops breaking the click, because an
  unfalsifiable guard reads as coverage.
- The Layer 2 repair triage in §6: retargeted / deleted / migrated, one
  decision per suite rather than a batch fix.
