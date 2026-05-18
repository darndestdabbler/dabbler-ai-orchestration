# Set 029 Session 3 verification — Round A (writer + schema doc)

## Context

Set 029 ships an Orchestrator indicator webview view. v0.14.2 shipped
the Claude path live with a single global marker at
`~/.dabbler/current-orchestrator.json`. **Session 3** moves identity
to per-session-set markers at
`<workspace>/docs/session-sets/<slug>/.dabbler/orchestrator.json`,
fixing the cross-window contamination bug (three parallel VS Code
windows on three repos clobbered one global marker — memory
`project_consumer_repos`).

Session 3 was spec'd via the 2026-05-18 custom-tree-pivot audit
(GPT-5.4 + Gemini Pro consensus). Three operator decisions locked:
D1 packaging split (S3 identity-only + S4 custom-tree); D2 ambiguity
fail-closed (skip write when multiple in-progress sets); D3 orphan
fail-closed (no workspace-level marker on null resolution).

**Round A scope** (this round): the writer
(`scripts/write-orchestrator-marker.js`) + the marker schema doc
(`docs/orchestrator-marker-schema.md`). **Round B** (separate
script): the reader, SessionSetsModel extraction, and SessionSetsProvider
refactor. Splitting per memory `feedback_split_large_verification_bundles`
to stay under the 700 LOC bundle ceiling that gpt-5-4 timeouts at.

## What you're being asked to verify in Round A

Answer Q1–Q4 in order with **VERIFIED / MUST-FIX / SUGGEST** verdicts
plus 1–3 sentences of reasoning each.

### Q1. Walk-up resolver algorithm

`walkUpResolveSet(startCwd)` walks from cwd upward looking for a
`docs/session-sets/` directory. Inside that directory, it reads each
subdir's `session-state.json` and collects subdirs with
`status: "in-progress"`. Returns `{ workspaceRoot, slug, setDir }` on
exactly one match; returns `{ reason: ... }` otherwise.

Verify:
- Termination condition (`parent === current` after `path.dirname`)
  correctly handles Windows drive roots (`C:\`) and POSIX root (`/`).
- Existence check (`fs.statSync(candidate).isDirectory()`) correctly
  rejects a file named `session-sets` (no false positive on
  non-directory match).
- "Exactly one in-progress" enforces D2: `inProgress.length === 1` is
  the success branch; both 0 and >1 return reasons.
- The walk continues past intermediate directories that LACK
  `docs/session-sets/` (so a deeply-nested cwd still finds the
  workspace root). ✓ — confirm via the `parent = path.dirname(current)`
  loop step.

### Q2. Marker schema v3 + `sessionSetSlug` integrity field

The writer's `buildMarker()` adds `sessionSetSlug: resolution.slug`
at top level; `mergeEffort()` re-stamps the slug too.
`SCHEMA_VERSION = 3`.

Verify:
- Every write path (`session-start`, `manual`, `configured-default`,
  `user-prompt-submit` merge-effort) emits `sessionSetSlug` from the
  current resolution. ✓
- `mergeEffort()` overwrites `existing.sessionSetSlug` with the
  current `resolution.slug` rather than carrying the old one — so a
  marker that survives a cross-set boundary (operator switched
  in-progress sets mid-session) converges on the right slug. ✓
- `mergeEffort()` also bumps `schemaVersion` to `SCHEMA_VERSION`
  (3) so a marker that was somehow at v2 self-heals on the next
  effort merge. ✓
- The marker schema doc's "Field reference" table matches the
  shape `buildMarker()` actually emits.

### Q3. Fail-closed posture

On `walkUpResolveSet` returning a reason, the writer:
1. Appends a JSON entry to `~/.dabbler/orchestrator-writer.log` with
   `timestamp`, `writer`, `sessionSetSlug: null`, `proposed`, `reason`,
   `candidates` (ambiguous case), `cwd`.
2. Exits 0 — the hook chain doesn't see a non-zero return.

Verify against D2/D3:
- D2 ambiguity (`multiple-in-progress-sets`): write skipped, log
  carries `reason` + `candidates`. ✓
- D3 orphan (`no-in-progress-set` OR `no-docs-session-sets`): write
  skipped, log carries `reason`, no workspace-level orphan marker
  ever written. ✓

Confirm there is no code path where the writer could emit an orphan
marker — e.g., a workspace-level `.dabbler/` outside any session set,
or a fallback to the legacy global `~/.dabbler/current-orchestrator.json`
on resolver failure. Intent: **no orphan markers, ever.**

### Q4. `.gitignore` self-protection

The spec step 2 originally said: "Auto-patch existing repos
non-interactively on next workspace init (Gemini Pro must-fix)."
There is no `scripts/init-workflow.py` to auto-patch from — so the
implementation took two routes:

1. **Workspace-root patch (this repo only):** the canonical repo's
   `.gitignore` adds `docs/session-sets/*/.dabbler/`.
2. **Self-protecting `.gitignore` (every repo, automatic):**
   `ensurePerSetMarkerDir(perSetMarkerDir)` drops a `.gitignore`
   containing `*\n!.gitignore\n` into each per-set `.dabbler/` on
   first create. The `.gitignore` file itself IS tracked; everything
   else in the directory is ignored. Consumer repos inherit the
   protection on first marker-write without operator intervention.

Verify:
- The drop is idempotent (existence check before write). ✓
- The content `*\n!.gitignore\n` is the correct git pattern to
  ignore everything in the directory EXCEPT the .gitignore itself.
  (Git's "rule 5" — a negated pattern after a wildcard re-includes
  matched paths.) ✓
- Drop failure is non-fatal (try/catch in
  `ensurePerSetMarkerDir`) — the marker write proceeds even if the
  .gitignore drop fails.
- Does this fully satisfy the Gemini must-fix "auto-patch existing
  repos non-interactively on next workspace init"? The first
  writer fire IS the auto-patch trigger. Or is the missing
  workspace-root patch a hole that needs filling programmatically?

R9 risk: "If a workspace's `.gitignore` is not auto-patched,
per-set markers could be staged for commit by mistake." The
self-protect path eliminates that risk at the per-set directory
level. Is this sufficient mitigation in your assessment, or does
the workspace-root patch need to be added too?

---

## Final verdict (Round A)

Emit one summary line at the end:

`VERDICT: VERIFIED` if Q1–Q4 all pass without must-fix items
`VERDICT: MUST-FIX (<count>)` if any Q has a must-fix
`VERDICT: SUGGEST (<count>)` if no must-fix but ≥1 suggest items

Followed by a 2–3-sentence overall summary.
