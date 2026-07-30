# Cancellation history

Cancelled on 2026-07-30T09:45:33-04:00
Retired 2026-07-30 on operator instruction, superseded by Set 107 (first-run-rescue). Sessions 1-3 shipped, were cross-provider verified, and remain live on master; nothing is reverted and no deliverable is withdrawn. Extension 0.46.0 was published from S3's tree (tag vsix-v0.46.0 on 52d3c05), so that gate is discharged rather than abandoned.

WHY THE REMAINING SCOPE IS NOT RESUMED. S4 was a ~2-hour live operator walk of docs/tutorials/hello-world.md. Its acceptance test effectively already ran and failed: the operator's staff attempted that tutorial and abandoned it, reporting it 'way too complicated'. Four review rounds across two engines (docs/planning/git-transparency-proposal*.md) converged on first-run cognitive load as the cause, and Set 107 relocates that tutorial to adopt-dabbler.md and writes a new ~15-minute hello-world.md in front of it. Walking the old document for two hours to re-discover a known failure is the most expensive way to learn it, so the scope is re-homed rather than resumed:

- S4's first-run walk -> Set 107 Session 3, which walks the NEW hello-world.md against a stopwatch on a clean VS Code profile and a released VSIX.
- S4's governance walk (the two-person flow, branch protection staging, CI, cross-owner review) -> NOT YET HOMED, and deliberately named as owed: adopt-dabbler.md has still never been walked end to end. Author that walk as a follow-on set AFTER Set 107 Session 2 relocates the document, so the walk targets a stable file.
- S4's dry run of the nine OBS scene scripts -> travels with the governance walk above; Set 107 S2 moves docs/tutorials/video/ to accompany adopt-dabbler.md, which the scripts actually describe.

ARTIFACTS THAT SURVIVE AND STAY USABLE. Nothing here is deleted, and the follow-on walk should reuse rather than re-author: 106-hello-world-tutorial-simplification-uat-checklist.json (13 walks, fail-closed with Passes:false, gate-validated 358/358); s4-walk-priya.md, s4-walk-sam.md and s4-walk-sam-notes.md (the per-person entry cards for a two-machine walk); s3-check-literals.py and s3-check-checklist.py (free, re-runnable, no API calls). Their content is written against the tutorial that becomes adopt-dabbler.md, so the follow-on set inherits them with a filename update rather than a rewrite.

TWO DEFECTS THIS SET'S OWN FEEDBACK EXPOSED WERE FIXED BEFORE RETIREMENT, not deferred: Azure DevOps instructions presented as trailing italic asides (now symmetric '> Your host - do ONE of these' blocks with a banner stating the either/or rule once), and the ADO CI dead end (the tutorial now prints a working azure-pipelines.yml inline instead of telling ADO readers to go find one). Both were the specific reasons staff abandoned the walkthrough.

Restorable via restore_session_set if the operator prefers the set-aside posture.

