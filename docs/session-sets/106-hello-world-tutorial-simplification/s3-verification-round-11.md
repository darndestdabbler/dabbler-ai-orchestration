# ISSUES FOUND

## Issue 1: Walk 4 reintroduces an unconditional commit that normally fails

- **Category:** Correctness
- **Severity:** Major
- **Failure scenario:** On the normal path, the plan and decomposition sessions commit their own outputs. The operator then follows checklist Walk 4 step 7 literally and runs another `git commit`, which exits nonzero with “nothing to commit.” This is probable because Walk 4’s own expectation says the sessions commit, and the corrected scene script says `git status --short` is normally empty.
- **Details:**
  - **Violation:** The specification requires the checklist to provide literal, followable `HumanAction` instructions, while the checklist itself says a script action that cannot be performed as written is a defect. Walk 4 nevertheless says: `git add -A, then git commit -m "docs: greeter plan and its implementation set"` unconditionally.
  - **Impact:** The mandatory UAT walk encounters an expected command failure and must either record a false failure or improvise around the checklist. That undermines the checklist’s central purpose as a literal acceptance walk and can prevent Session 4 from passing the item without remediation.
  - **Evidence:** `docs/tutorials/video/scene-4-first-module.md`, Beat 8 correctly runs `git status --short` and commits **only if** it printed anything. `docs/tutorials/hello-world.md`, Part 4 step 3 has the same conditional rule. The UAT checklist Walk 4 step 7 omits that condition.
  - **Correct answer:** Make Walk 4 mirror the tutorial and scene: run `git status --short`; commit only if it produces output; otherwise proceed directly to `Dabbler: Open PR for this set`.

#### NITS

- **Nit:** `docs/tutorials/video/README.md` says the scripts “were dry-run end to end by a human,” while the current checklist explicitly says `NOT YET WALKED` and every item has `Passes: false`. That attestation should become true only after Session 4 succeeds.
- **Nit:** Scene 3 Beat 6 calls both GitHub templates “comment-only,” and Scene 4 Beat 16 calls its PR the workflow’s first execution. The scaffolded workflow already has an active `push`/`pull_request` trigger and `test` job and is pushed to `main` in Scene 3, so both claims are false.
- **Nit:** Walk 13 says eight of nine scripts were executed beat by beat, but scenes 1–6 plus the Azure DevOps alternate total seven executed scripts; the direct-API alternate is reviewed only, and the ninth file is the README. Scene 6 Beat 9 is also not performed by Walks 9–10.
- **Nit:** Several closing beats omit the required `Do` field entirely, including Scene 2 Beat 6, Scene 3 Beat 13, Scene 5 Beat 13, Scene 6 Beat 9, and the Azure DevOps alternate’s Beat 6.
- **Nit:** `s3-authoring-gates.md` still reports the original `98/98` and `345/345` runs. The current checklist gate adds thirteen fail-closed checks and therefore totals `358`, while later session records also describe the literal gate as `107` or `108`; the committed evidence artifact no longer describes the current gates.