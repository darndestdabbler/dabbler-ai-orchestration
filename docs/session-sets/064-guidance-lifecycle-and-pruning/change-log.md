# Change Log — Set 064: Guidance lifecycle & pruning

**Status:** COMPLETE (4 of 4 sessions) — 2026-06-14.
**Release:** `dabbler-ai-router` **0.19.0** (the guidance lifecycle CLIs +
citation-at-close keystone) and the VS Code extension **0.33.0** (the
consumer-bootstrap guidance-starter templates; carries Set 063 too — its
`0.32.0` was bumped but never tag-pushed). **Both publishes PENDING the
operator's `v0.19.0` / `vsix-v0.33.0` tag pushes** through the green-Test
gate. Record the publish run ids in `docs/repository-reference.md` once the
workflows succeed.

## Why this set existed

`lessons-learned.md` and `project-guidance.md` are re-read into the
orchestrator's context at the start of every session. They were append-only
with exactly one shrinking mechanism (promotion collapses a lesson to a
pointer). The result is monotonic growth whose cost is recurring and
invisible — not disk bytes but tokens-read-per-session on every session,
plus attention dilution. The cost lands in high-volume consumer repos: the
`dabbler-access-harvester` lessons file measured ~151 KB / ~38.7k tokens
against a 10k ceiling. A 2026-06-14 cross-provider consult graded the
operator's first draft "partly right": the cost is real, but the archival
trigger should be evidence-of-use / supersession / encoded-into-automation —
**not** a hard size budget and **not** "promote within N sets or archive."
Set 064 gives these files a lifecycle: measure the cost, track per-lesson
usage, archive (never delete) on evidence, keep the active tier under a
ceiling backstop — plus a one-time recipe for repos already over budget.

## What shipped

### Session 1 — audit & design-lock (VERIFIED)

- Measured per-repo overhead; audited the read path (every always-load
  instruction) and the write path (`close_session`); locked D1–D8 with
  file-level evidence and an S1 cross-provider design consult on the
  mechanics (serialization, capture path, ceiling values, D6 options).

### Session 2 — steady-state mechanism D1–D5 (VERIFIED)

- **D1** `guidance_report` (bytes + `ceil(chars/4)` token estimate per file
  and combined; read-only by default, `--write-headers` stamps the
  `<!-- guidance-overhead -->` block, `--check` gates over-ceiling).
- **D2** per-lesson metadata trailer + parser (`guidance_meta.py`) +
  `validate_guidance_meta`.
- **D3** citation-at-close keystone: `close_session` records
  `disposition.lessons_cited`; `cite_lessons --set <N> <id> …` updates
  `last-used-set` inside the pushed work; no-citation default is inert.
- **D4** active/archive split: `lessons-archive.md` (never auto-loaded;
  `guidance_search --archive`); move rule "never delete; move active →
  archive"; 10 always-load instruction sites updated to exclude the archive.
- **D5** evidence-based archive triggers (superseded / encoded-in /
  subsystem-retired / disused-AND-unreferenced) + hard ceiling backstop;
  `guidance_config.py` defaults (`active_lessons_ceiling_tokens` 10,000,
  `project_guidance_ceiling_tokens` 6,000, `disuse_window_sets` 20); the
  "promote within N sets or archive" rule deleted, promotion made orthogonal.

### Session 3 — backlog-remediation recipe D6 + harvester dogfood (VERIFIED)

- **D6** `guidance_triage.py`: routed bulk classifier (keep-active | archive |
  promote | merge | drop), byte-exact offset-slice extraction, projection vs
  ceiling, writes an operator-reviewed proposal without editing the target.
- `docs/guidance-backlog-remediation.md`: portable one-time recipe (measure →
  routed triage proposal → operator review → supersession-merge dedup → gated
  archive-bankruptcy → seed `last-used-set` → re-measure); archive ≠ delete.
- Read-only harvester dogfood: 69 blocks → 44 keep / 20 archive / 5 drop,
  ~38.7k → ~21.8k tokens (~44% cut) but **still ~2.18× over ceiling** — the
  honest finding that triage alone is insufficient for the harvester.

### Session 4 — templates, docs sweep, release, close-out (VERIFIED, 3 rounds)

- **D7** consumer-bootstrap bundle now ships three metadata-aware guidance
  starters (`lessons-learned` / `project-guidance` / `lessons-archive`),
  rendered into `docs/planning/` by both `renderConsumerBootstrap`
  (7→10 artifacts) and `renderStructureBootstrap` (5→8); esbuild + README +
  golden fixtures regenerated; count assertions across 3 test files updated.
- **D7** cross-repo notice `docs/cross-repo-guidance-lifecycle-notice.md`
  points the over-budget consumers (harvester, platform) at the D6 recipe.
- **D8** canonical engine-agnostic `docs/guidance-lifecycle.md`; docs sweep
  (CLAUDE/AGENTS/GEMINI + workflow doc + quick-start + lessons-learned +
  project-guidance now point at the canonical lifecycle doc); version bumps +
  CHANGELOG entries + `repository-reference.md` pre-push wording.
- Verification gpt-5-4, 3 rounds: R1 found 2 Major (reporter `--write-headers`
  documentation gap; a template pointing at a non-scaffolded authoring guide)
  + 1 Minor (disuse vs rare-but-critical wording), all fixed → R2 confirmed
  1+2, flagged residual wording → harmonized → R3 VERIFIED.
  Dispositions in `s4-issues.json`.

## Suite state at close

- Python: 1300 passed / 1 skipped / 0 failed.
- TS unit (`npm run test:unit`): 908 passing; 2 failing are the long-standing
  tracked Set-026 baseline (`configEditor-foundation`, `notificationsSection`),
  not introduced here.
- `drift_guard.py`: clean. `vsce ls`: all 10 bundle templates packaged.

## Lessons cited this set

L-064-1, L-064-3, L-064-4, L-064-7, L-064-9, L-064-10 (across S2–S4).

## Follow-ons

- Live execution of the D6 recipe on the harvester + platform working trees
  is a per-repo follow-on (this set dogfooded read-only).
- Next session set: **065 — verification-surface empirics** (design-locked,
  deferred until 064 closed).
