# S2 lessons triage — operator decision sheet

Two inputs feed this sheet: the routed classifier proposal
(`s2-lessons-triage-proposal.md`, opus, raw at
`s2-lessons-triage-raw.txt`) and the Set 085 F3 **admission test**
(`docs/guidance-lifecycle.md`), which the routed pass did not apply
strictly — it kept 17 lessons active (projected ~8,849 tokens, 442% of
the 2,000-token target). This sheet applies the admission test to each
routed verdict: a lesson stays preload-active **only if** it has recent
recurrence AND high miss cost AND weak automated detectability AND no
executable-gate equivalent AND is expressible in ≤150 tokens.

Nothing is deleted. Every archived lesson moves **full-text** to
`lessons-archive.md` (grep-able via `guidance_search --archive`,
reactivatable via `cite_lessons`). Kept lessons are **condensed to
≤150 tokens** in the active tier with their full text archived — the
same pattern Set 073 used for promoted lessons.

## Keep active (condensed to ≤150 tokens each)

| id | why it passes the admission test |
|---|---|
| L-064-3 + L-079-1 (**merged**) | One cp1252 class: bytes at every Windows subprocess boundary, persist routed output to disk before printing. Recurred 083/084; miss cost is lost paid output / silent fail-open scaffolds; no cheap deterministic detector. |
| L-064-7 | gpt-5-4 wording-only re-verifies need `max_tier` pinned (and substantive re-verifies must never pin below the R1 tier). Recurred 081/082/083; miss cost is an unbudgeted cross-provider escalation; behavioral, not automatable. |
| L-064-8 | A replacement doc inherits the retired doc's claims at its peril. Recurred 084; miss cost is verified-wrong canonical docs; no automation. |
| L-064-9 | `git diff` evidence omits untracked files — `git add` first or include `git status`. Recurred 085 (this set); miss cost is a wasted verification round; behavioral. |
| L-065-1 | Propagate a consistency fix to every echo before re-verifying. Recurred 084; miss cost is 1–2 extra rounds; judgment, not automatable. |
| L-075-1 | A pin bump is not enablement until the target venv is upgraded and the entrypoint confirmed. Recurred 084; miss cost is a mid-session failure on an expensive path; no gate. |
| L-078-1 | A rollback recipe naming a version must confirm the registry actually serves it. Recurred 084; miss cost is a broken escape hatch during a live incident; no gate. |
| L-064-12 (repo-specific) | Sessions touching Explorer-rendering / state-writer / fixture surfaces must run Layer 3 locally before close. Recurred 081; miss cost is invisible default-branch rot; CI alone cannot catch it before close. |

## Gate-and-archive (executable check exists — prose archives with `encoded-in`)

| id | executable equivalent |
|---|---|
| L-064-1 (truncation) | `ai_router/utils.py::detect_truncation` — the check ships; the one-line "call it" reminder does not need 260 tokens of preload. |
| L-064-2 (cost guard) | `verification.max_cost_multiplier` in `router-config.yaml` — the router enforces it with no orchestrator action. |
| L-069-2 (strongest framing) | Encoded in the shipped reviewer templates (`verification.md`, `path-aware-critique.md` both carry the strong framing); the A/B methodology history is archive material. |
| L-071-1 (materiality/blocking) | `ai_router.verification.is_blocking_verdict` / `classify_blocking` + the workflow Step-6 loop discipline; the constitution now states the principle (Minor-only is non-blocking; ledger prevents resurrection). |

## Archive (fails recurrence or is on-demand/situational)

| id | reason |
|---|---|
| L-064-6 | Duplicate of an already-preloaded rule: `project-guidance.md` → Workflow Expectations ("never self-opine") and the constitution Step 3.5 both state it. |
| L-072-1 | A/B-instrument methodology; last used 075; consult when designing an experiment, not every session. |
| L-073-1 | Replication-claim methodology; last used 075; same trigger moment as L-072-1. |
| L-079-2 | Spec-authoring rule (gate words need config-block flags); its trigger moment is spec authoring — belongs with the authoring guide, which is now on-demand. One pointer line added to the authoring guide instead. |
| L-067-1 (repo-specific) | Resolved by the Set 068 budget-aware forced verdict; the corrected action ("over-probe control belongs to the adapter") is encoded in `PullCaps` + the forced-verdict mechanism. |

## Drop

Nothing. (The routed pass's two `drop` rows are the section headings
`Portable Lessons` / `Repo-Specific Lessons`, which are structure, not
lessons — they stay.)

## Header slimming

The authoring/lifecycle rules block at the top of `lessons-learned.md`
(~600 tokens) duplicates `docs/guidance-lifecycle.md` (the canonical
lifecycle reference, on-demand). It shrinks to a ~4-line pointer: trailer
format, cite-at-close command, never-delete-only-archive, ceiling
pointer.

## Projected result

Header ~150 + promoted-pointer table ~200 + 8 condensed keeps ~1,100 +
4+5 archive pointer rows ~250 + structure ~100 ≈ **~1,800–2,000 tokens**
(vs 9,797 today), inside the 2,000-token manifest ceiling S2 declares.
