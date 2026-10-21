# Design consult, round 13: Sol on humans at the edges -- what the sample found in 2.5.0, and the smallest block that answers it

model_name: gpt-5-6-sol
model_id: gpt-5.6-sol
provider: openai
tokens: 3339 in / 5915 out
elapsed: 99.982s  truncated: false (stop_reason: end_turn)

---

## Q1. “Humans at the edges”

Sound as the default, but not literally absolute while `verification-reduction` can block close. It is the only owed decision whose answer demonstrably changes framework behavior and should survive unless the releasability declaration at `start` already determines it (`packages/router/src/owedDecisions.ts`, `BLOCKING_CLASSES`).

The others do not survive:

- `accountability-signoff`: record it; do not ask.
- `value-tradeoff`: `next` reruns regardless, so the answer changes nothing (`packages/router/src/drive.ts` ~1427).
- `external-consequence`: no behavioral consequence is established in the supplied source; retain as a record row at most (`packages/router/src/owedDecisions.ts`).

I would keep none of the proposed deletions. In particular, `rebaseline` already has its durable fact in `repairs.jsonl`, and `--approver` proves nothing (`packages/router/src/session.ts` ~2156; `packages/router/src/cli/session.ts` 185, 219–222; `packages/router/src/drive.ts` 2630).

## Q2. Stop decision

Print the adviser’s proposal in the stop text; let the engine use `plan amend`; create no owed row. The present answer does not control rerun behavior, while the actionable proposal remains visible (`packages/router/src/drive.ts` ~1427).

## Q3. Missing brief

Use the template sentence plus an honest `blocked` report (`packages/router/src/bootstrap/templates.ts` 341).

A `start` check cannot reliably distinguish “the prompt already says the solution” from an inadequate prompt without adding semantic machinery. **ASSUMPTION:** `start` has no existing deterministic adequacy check.

## Q4. CPM

Choose **(a)**: establish CPM when `modules create --contract package` creates the module, before projects are generated (`packages/router/src/ecosystem.ts` 660).

With `ManagePackageVersionsCentrally=true`, existing `PackageReference Version="…"` attributes cause NU1008; versions must instead be represented centrally as `PackageVersion` items. Creating CPM first avoids a risky migration. Option (b) is repair machinery; (c) does not establish central package management (`packages/router/src/ecosystem.ts` 363).

## Q5. The 23 entries

1. **KEEP, narrowed** — report any invalid stored model generically during `bootstrap`/`configure`; do not add an ID-specific alias (`preferences.json`; brief entry 1).
2. **SMALLER** — delete the obsolete `DABBLER_TRANSPORT` warning; retain only the existing sentence saying to unset it (brief entry 2; path not supplied).
3. **KEEP** — replace the question with prompt/path guidance and `blocked` when neither exists (`packages/router/src/bootstrap/templates.ts` 341).
4. **KEEP** — emit `dabbler.cmd` beside the generated `sh` wrapper (brief entry 4; writer path not supplied).
5. **KEEP** — run the known tree check at `start` and classify it as tree state, not engine failure (`packages/router/src/session.ts`; exact check path not supplied).
6. **KEEP** — preserve/regenerate the header, add `--package none`, and document manual placeholder removal; no removal verb (brief entry 6; path not supplied).
7. **KEEP** — one `AGENTS.md` sentence that router-owned session files are committed at close (`AGENTS.md`; `docs/sessions/*`).
8. **CUT** — cosmetic help duplication alone does not impede a session (brief entry 8).
9. **KEEP** — use `Session N: <sessions.json title>` as subject and put the task paragraph in the body (`sessions.json`; brief entry 9).
10. **KEEP** — log `no suite declared; nothing to run` rather than an unexplained dash/N/A (brief entry 10).
11. **CUT** — `invocations=0` is accurate for pull mode; no defect is established (brief entry 11).
12. **KEEP** — ignore an older report sequence, reprint the outstanding instruction, and spend no refusal (`packages/router/src/drive.ts`, `judgeReportShape`).
13. **KEEP** — name `plan amend` in the ask and delete the non-authorizing `--approver` claim (`packages/router/src/cli/session.ts` 185, 219–222; `packages/router/src/drive.ts` 2630).
14. **CUT** — same cosmetic help issue as 8 (brief entry 14).
15. **CUT** — do not impose `* text=auto eol=lf` on the customer’s entire repository merely because generated files currently contain LF (brief entry 15).
16. **KEEP** — packaging and candidate jobs create a missing folder feed they require (brief entry 16; path not supplied).
17. **KEEP** — copy amendments into committed `activity-log.json`; the gitignored driver journal is not pushed (`.dabbler/runs/s<N>/driver/amendments.jsonl`; `activity-log.json`).
18. **KEEP** — state the actual effect of `unowned` on suite selection both in documentation and on the impact-plan line (brief entry 18; path not supplied).
19. **KEEP** — make dry-run wording non-refusal wording and omit credentials for a folder feed (brief entry 19; path not supplied).
20. **SMALLER** — suppress the manual-test advice inside driven/pulled sessions; do not replace it with “nothing to do” (`packages/router/src/affected.ts` 279).
21. **KEEP** — scaffold the package-contract README during `modules create --contract package` (`packages/router/src/cli/module.ts` 699).
22. **KEEP** — choose (a): create CPM before projects, using the existing `writeIfAbsent` seam (`packages/router/src/ecosystem.ts` 363, 660).
23. **KEEP** — derive framework-job outputs from job provenance and subtract them from step paths; do not add basename exemptions (`packages/router/src/drive.ts`, `stepChangedPaths`; `packages/router/src/gates.ts` 95).

## Q6. Mechanisms versus sentences

- **Delete rather than explain:** entry 20’s in-session advice; entry 2’s obsolete warning.
- **Do nothing:** entries 8, 11, 14 and 15. In particular, a repository-wide `.gitattributes` policy is disproportionate to entry 15.
- **Sentences are sufficient:** entries 3, 7, 10 and 18.
- Entry 23 must be provenance-based subtraction, not another exemption list (`packages/router/src/gates.ts` 95).
- The close summary should report amendments, rebaselines and waivers, but should not create another state or ledger; use the records already produced (`repairs.jsonl`, `activity-log.json`).
- The built-VSIX sample walk is warranted as release verification, not a new framework mechanism.
