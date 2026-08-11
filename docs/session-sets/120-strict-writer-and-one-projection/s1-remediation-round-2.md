# Remediation — Set 120 Session 1, Round 2 (supplementary discovery)

**Round 2 finding:** "Scope-violating extension deletion breaks the
copy-prompt surface and extension type-check." Major, Correctness /
Completeness. Evidence paths:
`tools/dabbler-ai-orchestration/src/commands/copyPromptCommands.ts`,
`tools/dabbler-ai-orchestration/package.json`,
`tools/dabbler-ai-orchestration/src/providers/ActionRegistry.ts`,
`tools/dabbler-ai-orchestration/src/test/suite/copyPromptCommands.test.ts`.

**Verdict: DISMISSED — not this session's change. Operator-confirmed,
adjudicated, and not remediated here.**

## What the verifier saw, and why it was right to flag it

The finding is **technically accurate about the tree** and the verifier
reasoned correctly from the evidence it was given. It even ran
`npx tsc -p tools/dabbler-ai-orchestration --noEmit` and observed exit 2.
Its error was not analysis; it was attribution — and the attribution error
was mine to prevent, not the verifier's to avoid.

`verify_session` assembles its evidence bundle from `git status --short`
plus the **complete working-tree diff**. The operator is concurrently
editing the Work Explorer extension in a separate chat session —
removing and renaming context-menu items — and that work is **uncommitted
and unstaged**. It therefore appears in the working-tree diff and was
handed to the verifier as though it were part of this session's change
set. The `s1-conventions.md` block for this round states *"No extension
(TypeScript) change … the extension is untouched"*, so the verifier
correctly identified a contradiction between the stated scope and the
tree it was shown, and correctly graded it blocking.

## The evidence that it is not this session's work

```
$ git diff --cached --name-only -- tools/
(empty)
```

Nothing under `tools/` is staged. This session's staged change set is
eight files under `ai_router/` and three under `docs/`, and at no point
did it open a file under `tools/`. The unstaged `tools/` modifications
belong to the concurrent extension session, which was already in flight
when this round was routed.

## Adjudication

Presented to the operator with the exact finding, the dismissal reason,
and the context the verifier saw. **Operator confirmed the `tools/`
changes are theirs and in flight.** Per the workflow's adjudication path
(verifiers flag, humans adjudicate), this is dismissed as
**out-of-scope**, not as a false positive: the defect the verifier
described was real in the tree at the moment it looked, and — usefully —
the `tsc` failure it surfaced (`copyPromptCommands.test.ts` importing
`buildSpecReviewPrompt`, `buildSessionAccomplishmentsPrompt`,
`buildSetAccomplishmentsPrompt`, `buildStartNextParallelSessionPrompt`
and `__forTests`, all deleted) was relayed to the extension session as
live feedback. That session has since begun updating those test files.

**Nothing is owed by Set 120 S1.** The residual owner is the concurrent
extension session, which carries its own full Layer 3 obligation under
`project-guidance.md` → Build and Test (`package.json` is the extension
MANIFEST, and L-064-12 puts manifest edits in the trigger list).

## The process defect this exposes, which IS worth recording

A routed verification bundles the **whole working tree**, so any
concurrent uncommitted work in the same checkout silently becomes part of
the evidence — and, worse, part of the freshness digest.
`verification_stamp.compute_work_diff_sha256` digests every file
differing from base under only `dist` / `out` / `node_modules` / `.venv` /
`__pycache__` / `*.vsix`, so `tools/**/src/**` and `package.json` bind
this session's stamp. Two consequences, neither previously written down:

1. **A concurrent editor's saves stale a verification they have nothing
   to do with**, which can fire the close backstop and spend a metered
   round to re-stamp a tree whose own work is byte-identical.
2. **A verifier will attribute that work to the session under review**,
   costing a blocking round — as it did here.

The mitigation used for the remainder of this session: the concurrent
work is stashed (`git stash -u`) until this session's close lands, then
restored. Recorded here, and carried into the Step 9 review as a
candidate lesson, because the parallel-worktree layout
(`docs/planning/repo-worktree-layout.md`) exists precisely to keep two
sessions out of one checkout and was not used.

**No code change in this round.** The round's finding required none from
this session.
