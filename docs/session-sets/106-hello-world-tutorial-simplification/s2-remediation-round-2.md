# S2 — Remediation note, round 1 nits

Round 1 (discovery, fan-out 2/2) returned **VERIFIED** — non-blocking, zero
blocking findings. Under the constitution's Step 7 that ends the loop, and the
correct action is to record the nits and proceed.

All three nits were nevertheless **fixed**, because each was correct, each was
a few lines, and none carried regression risk. This note exists so the fix
delta is reviewed rather than shipped unexamined; it is not a re-round on a
blocking finding.

| # | Nit (verbatim substance) | Disposition |
| --- | --- | --- |
| 1 | The scaffolded CI comment references `docs/tutorials/hello-world.md`, a path that does not exist in a consumer repo | **FIXED** — replaced with the canonical GitHub URL, the same form `getting-started.md.template` already uses. This one was more than cosmetic: a relative path that resolves to nothing in the repo the file actually lands in is the Set 086 "never hand a reader an unrunnable step" failure at comment scale. |
| 2 | Emitting a warning does not guarantee a green placeholder check is "never mistaken" for real testing | **FIXED** — the claim was an overclaim in my own prose, in two places. The template comment now says the placeholder "is visible in the job log rather than silent"; the CHANGELOG says the annotation "makes an unadapted placeholder visible rather than silent" and states plainly that it does not make it unmissable. |
| 3 | Check C of the green-on-empty proof covered bundle parity for the CI template only, while the CHANGELOG claimed all three bundled templates were byte-identical | **FIXED** — check C widened from 3 assertions to 16: all three templates against their `dist/` copies; the two untokenized templates against both cold-start goldens; and, because `getting-started.md` is rendered rather than copied, a content assertion that both goldens point at the surviving tutorial and carry neither retired URL. The proof was re-run whole on the post-fix tree: **31/31 PASS**. |

## Re-run evidence on the post-fix tree

- Goldens regenerated through the sanctioned `UPDATE_GOLDEN=1` path; `dist/`
  rebuilt via `npm run compile`.
- Layer 1 pytest: **3060 passed, 6 skipped**, 0 failed.
- Layer 2 extension unit suite: **1767 passing, 0 failing**.
- Layer 3 Playwright: re-run (the delta touches fixture-tree bytes).
- `s2-green-on-empty-proof.md`: **31/31 PASS**, regenerated whole.

Nothing else changed. The fix delta is comment text in one template, prose in
the CHANGELOG, and additional assertions in a proof script — no YAML structure,
no job name, no trigger, no rendered-output shape.
