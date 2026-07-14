# Set 101 Session 2 — Remediation round 1

Merged Critical/Major findings from discovery round 1 (`s2-issues.json`, 4)
and the supplementary pass round 2 (`s2-issues-round-2.json`, 1). Two of the
four discovery findings are the same screenshot claim (duplicated across the
two fan-out calls). Net distinct findings: **4** — three fixed, one disputed
(false-positive) with concrete evidence.

## F1 (Major, Correctness) — modules.yaml pointer to a guide absent in consumer repos — **FIXED**

**Finding:** the pointer I added to `MODULES_YAML_HEADER_COMMENTS`
(`moduleAuthoring.ts`) used the repo-relative path
`docs/module-reorganization.md`. That file exists in THIS repo but is **not**
scaffolded into consumer projects, so a consumer reading their generated
`docs/modules.yaml` would follow a dead pointer.

**Fix:** changed the header comment to the full GitHub URL
(`https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/module-reorganization.md`),
matching how every other consumer-facing pointer in the scaffolded bundle
(getting-started template, start-here template) links out. Recompiled;
`moduleAuthoring.test.ts` / `copyModuleDecompositionPrompt.test.ts` green
(the header's pinned substrings — "Copy Module Decomposition Prompt", the
"grouping attribute, never" phrase — are unchanged).

## F2 (Major, Completeness) — legacy migration recipe runs lifecycle sets its declaration paths never create — **FIXED**

**Finding:** `module-reorganization.md`'s "Adopting modules in a legacy repo"
step 3 said "run each module's `plan` then `decomposition` set" as if every
declared module has them, but only **Add Module…** (and Build's `default`
module) scaffold lifecycle sets — the recommended AI-decomposition-prompt and
by-hand declaration paths do not.

**Fix:** reworded step 3 to state that only Add Module / the Build default
scaffold create the `plan`+`decomposition` starter sets, and that a module
declared another way authors its work directly with
`Dabbler: Generate Session-Set Prompt`. Removes the false implication.

## F3 (Major, Correctness — supplementary) — deleting Default after decomposition cancels the generated work — **FIXED**

**Finding:** the main onboarding sequence offered **rename or delete** Default
interchangeably after the decomposition set has created real work sets stamped
`module: default`. Delete *cancels* non-terminal sets, so a user who ran the
decomposition and then deleted Default would have their just-generated work
cancelled.

**Fix:** distinguished the two actions everywhere the sequence appears —
**rename** re-homes the work sets (use it once you've run the starter sets);
**delete** removes only unstarted scaffolds and *cancels* real work (use it
before you've invested work, or to discard). Applied to
`module-reorganization.md` (the canonical "Renaming or deleting the scaffolded
Default module" section), the `getting-started.md.template` Section 3, the
repo `quick-start.md`, the extension README, and the tutorial's Part 3 delete
note (which already deletes *before* any work, and now says so explicitly and
points to rename for the work-exists case). Cold-start goldens regenerated.

## F4 (Major, Completeness) — "affected screenshots not retaken" — **DISPUTED (false positive), no change**

**Finding (both fan-out calls):** the rewritten tutorial's Set 095 screenshots
still depict the pre-Set-100 form/tree/retired-actions and now contradict the
prose.

**Evidence it does not hold:**
- **The tutorial embeds zero screenshots.** `grep -nE '!\[|\.png|\.svg'
  docs/tutorials/module-team-hello-world.md` → no matches. The rewritten
  Parts 2–5 are prose-only; there are no images in it to be stale.
- **The scaffolded `getting-started.md.template` embeds zero screenshots**
  (same grep, no matches).
- **The two README screenshots both depict the shipped 0.44.0 UI:**
  - `media/getting-started.png` shows the **two-section** Getting Started
    form (Build project structure + Define modules) — unchanged by Sets
    098–101; still accurate.
  - `media/work-explorer-modules.png` shows a module (Auth Service) with the
    status buckets **IN PROGRESS / NOT STARTED / COMPLETE as direct children**
    and set rows beneath them — i.e. exactly the Set 100 *flattened* tree
    (module → bucket → row), with **no** retired `Plan` / `Session sets`
    intermediate nodes and no strip (strips are hover-revealed, absent from a
    static shot). It is accurate for the shipped flow.
- `docs/planning/getting-started-instructions.svg` is an internal *planning*
  asset; it is not embedded in any shipping doc (README/getting-started), so
  it is not a user-facing screenshot contradiction.

**Conclusion:** there is no affected shipping screenshot depicting changed UI,
so the spec's "retake affected screenshots" is satisfied by inspection (no
retake needed). Recorded as advisory-disagreement per the constitution's
"verifiers flag, humans adjudicate" rule; presented for remediation-review /
operator adjudication. (If the operator nonetheless wants the module-tree
shot refreshed against 0.44.0 branding, that is a live-VS-Code, operator-run
pre-publish step — the 0.42.0-precedent screenshot deferral — not a
code/doc-content defect of this session.)

## Suite after remediation

Extension unit **1618/1618**; `tsc` clean; cold-start goldens regenerated
(both tiers) and byte-match; Playwright Layer 3 28/28 (pre-remediation run;
no rendering surface changed in remediation — only doc text + one consumer
manifest-comment URL); Python cold-start acceptance 2/2.
