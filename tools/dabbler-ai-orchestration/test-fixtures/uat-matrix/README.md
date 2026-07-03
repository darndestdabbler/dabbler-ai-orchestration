# UAT fixture matrix (Set 062 D6)

Two trivial hello-world consumer projects whose `docs/session-sets/`
cover every Session Set Explorer marker/action state shipped by
Sets 061 + 062. The matrix exists so operator UAT never requires
hand-built sample projects: run `npm run make-uat-workspace` from the
extension package to copy this tree into a disposable folder outside
the repo, then open the printed `.code-workspace` in VS Code. When the
checkout has a repo-root `.venv`, the generated (never the committed)
workspace file pins `dabblerSessionSets.pythonPath` to it so the
python-backed row actions work without setup.

**Everything in here is synthetic fixture data.** The state files were
hand-authored to pin specific derived states; they are NOT real session
sets and the writer-discipline rules do not apply to them (the
cold-start fixtures under the repo-root `test-fixtures/cold-start/` are
the precedent). The one-active-set drift guard only scans the repo-root
`docs/session-sets/`, so the multiple in-progress fixture sets below do
not trip it; the generated copy lives outside the repo entirely.

These fixtures are pinned by
`src/test/suite/uatMatrixFixtures.test.ts`, which derives every row
through the real `readSessionSets` scan and asserts the expected
marker/state signals. If a schema or predicate change breaks a row,
that test fails — update the fixture AND the test together, then
re-walk any affected UAT checklist rows.

## Row inventory

### `hello-world-full/` — Full-tier control + tier-agnostic rows

| Set | State on disk | Demonstrates |
|---|---|---|
| `001-hello-page` | Full tier, session 2 of 3 in flight | Control row: fraction `1/3` with in-flight annotation; NO `lw` marker, NO `v?`/`v+`, no `+` suffix |
| `002-style-the-greeting` | not-started; `prerequisites:` names `001-hello-page` (in-progress) | Blocked chain marker (⛓︎) with a REAL pending prerequisite; tooltip names the slug + its current state |
| `003-publish-the-page` | not-started; `prerequisites:` names `099-cdn-rollout` (does not exist) | Blocked chain marker via an UNKNOWN slug — typos block, never silently unblock |
| `004-legacy-greeting-notes` | complete; `session-state.json` is schema v3 | Needs-migration asterisk (`*`) + "Ran under schema v3" tooltip + the `Migrate to v4 schema` row action |

### `hello-world-lightweight/` — every Lightweight marker state

| Set | State on disk | Demonstrates |
|---|---|---|
| `001-greet-the-world` | Mode A (`out-of-band-or-none`), not-started, no activity log | `lw` marker; `Switch Tier…` eligible; `Set Up Dedicated Verification…` eligible in BOTH directions (no durable record yet) |
| `002-greet-quietly` | Mode A, complete, no `external-verification.md` | `v?` marker + its tooltip; `Open External Verification Note` row action; completed-set `Set Up Dedicated Verification…` (blessed-writer path) |
| `003-greet-with-note` | Mode A, complete, `external-verification.md` present | Marker suppressed — the out-of-band record exists, quiet is success |
| `004-add-a-farewell` | Mode B (`dedicated-sessions`), session 2 of 2 in flight | `1/2+` fraction (denominator can still grow); no `v+` yet (work still open) |
| `005-shout-the-greeting` | Mode B, both work sessions complete, no typed session yet (top-level still in-progress; counts come from `session-events.jsonl`) | `2/2+` AND `v+` together — the actionable "verification owed" moment; `Verification Kickoff` copy action |
| `006-whisper-mode` | Mode B, complete with an appended `type: verification` session (verdict `VERIFIED`) | No marker (quiet is success); fraction `3/3` shows the runtime-grown count; fraction tooltip carries "Verification: VERIFIED (session 3)" |
| `007-echo-the-greeting` | Mode B, both work sessions complete, verification session 3 complete (`ISSUES_FOUND`, one open finding in `s3-issues.json`), remediation session 4 in flight (Set 077) | Row description reads `remediation owed` in words; `Start Next Session` copy action reroutes to the remediation hand-off prompt (the status-bar message names the reroute); fraction `3/4` with no `+` — a typed session already grew the count |

## Refreshing the matrix

1. Edit the fixture files here (keep `sessionSetName` equal to each
   directory name, and keep spec headings in the
   `### Session K of N: Title` shape).
2. Run the pinning test:
   `npm run test:unit -- --grep "uat-matrix"` from
   `tools/dabbler-ai-orchestration/`.
3. Run the repo drift guard (`python ai_router/scripts/drift_guard.py`)
   — fixture markdown is live-scanned by the stale-framing check, so
   fixture prose must not use the banned tier phrasings.
4. Regenerate any open UAT workspace (`npm run make-uat-workspace`) —
   the generator copies whatever is committed here.
