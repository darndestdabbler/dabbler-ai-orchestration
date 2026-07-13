# Remediation notes — Set 099 S2, verification round 1

Discovery round 1 (fanned out 2/2, gpt-5-6) returned 3 Major findings.
Investigated all three against concrete, checkable evidence rather than
mechanically applying a code change. Disposition: **advisory-disagreement**
on all three — no code change made. Evidence below; final adjudication
belongs to the operator per this repo's "a disagreement always surfaces to
a human" rule (`ai_router/dedicated_verification.py`'s
`advisory-disagreement` framing).

## Finding 1 + 2 (both fan-out calls): watcher-inventory line numbers "should be 206/242, not 207/243"

**Disagreed — the verifier's own claimed-correct values are the stale,
already-broken numbers, not mine.**

Checked directly:

```
$ git show HEAD:tools/dabbler-ai-orchestration/src/extension.ts | grep -n createFileSystemWatcher
206:      const watcher = vscode.workspace.createFileSystemWatcher(pattern);
242:      const gsWatcher = vscode.workspace.createFileSystemWatcher(gsPattern);
```

The pre-existing `WATCHER_ALLOWLIST` (before this session touched
anything) declared `line: 205` / `line: 241` — **already one line stale**,
a latent drift from a prior session that predates this one. Confirmed by
stashing this session's changes and running the exact test on bare `HEAD`:
it fails with "Unallowlisted callsites: extension.ts:206 ... extension.ts:242"
— i.e. the test was ALREADY red on master before this session started,
for a reason unrelated to this session's work.

This session's diff to `extension.ts` adds exactly one line before both
watcher callsites (the `deleteModule` command import, `@@ -26,6 +26,7`);
the three-line command registration lands at `@@ -322,6 +323,9`, well
*after* both callsites, so it cannot and does not shift them. Net effect:
+1 from the already-broken 206/242 baseline → **207/243**, which is what
this session set the allowlist to.

Directly verified: `npx mocha ... watcherInventory.test.ts` passes with
`207`/`243` in the allowlist, and the full unit suite (`npm run test:unit`)
is green at 1587/1587 with these exact values. Changing them to 206/242 (the
verifier's suggestion) would make the suite fail again — the opposite of the
requested fix. Fix rejected on direct, reproducible evidence; the pre-existing
one-line drift this session's edit incidentally corrected is out of this
session's scope.

## Finding 3: "only one modal confirmation, not the required two-step confirmation"

**Disagreed — "two-step confirm" in this repo's idiom is one modal with an
affirmative-click second step, not two sequential dialogs, and this is what
the spec explicitly asked to mirror.**

The spec's own words: "Two-step confirmation on both commands, **mirroring
the cancel writer's modal posture**." Checked the cancel writer's actual
modal posture (`src/commands/cancelLifecycleCommands.ts`): a SINGLE
`vscode.window.showWarningMessage(..., { modal: true, detail }, ...)` call —
one modal, confirmed only by clicking the named button. `dabbler.deleteModule`
implements exactly this pattern (`runDeleteModuleFlow` → `ui.confirm` →
one `showWarningMessage({modal:true}, "Delete Module")`), identical in shape
to `dabbler.renameModule`'s own confirm (Set 099 S1, already cross-provider
VERIFIED with this exact one-modal shape under the same "two-step confirm"
spec phrase). Session 1's own disposition.json records this same
adjudication verbatim: "'two-step confirm' == the affirmative-click modal,
matching the cancel command's own 'two-step prompt' idiom." Re-litigating
the identical phrase differently for S2 than S1 within the same spec would
be inconsistent, not more correct. No code change made.

## Disposition

All three findings are **advisory-disagreement** — reviewed with concrete,
reproducible evidence (a passing full suite at the disputed line numbers,
plus the codebase's own precedent for the confirm-modal shape). No fix
applied. Per the framework's disagreement-always-surfaces-to-a-human rule,
this is not self-closed; the operator makes the final call.
