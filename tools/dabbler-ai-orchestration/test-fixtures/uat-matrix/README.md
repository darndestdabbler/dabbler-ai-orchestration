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

### `hello-world-full/` — the row matrix

| Set | State on disk | Demonstrates |
|---|---|---|
| `001-hello-page` | session 2 of 3 in flight | Control row: fraction `1/3` with the in-flight annotation and no markers |
| `002-style-the-greeting` | not-started; `prerequisites:` names `001-hello-page` (in-progress) | Blocked chain marker (⛓︎) with a REAL pending prerequisite; tooltip names the slug + its current state |
| `003-publish-the-page` | not-started; `prerequisites:` names `099-cdn-rollout` (does not exist) | Blocked chain marker via an UNKNOWN slug — typos block, never silently unblock |
| `004-legacy-greeting-notes` | complete; `session-state.json` is schema v3 | Needs-migration asterisk (`*`) + "Ran under schema v3" tooltip + the `Migrate to v4 schema` row action |

> **Set 112:** the second project, `hello-world-lightweight/`, is deleted.
> Its seven rows demonstrated Lightweight-only Explorer signals — the `lw`
> tier marker, the `v?`/`v+` verification-posture markers, the `N/M+`
> growable fraction, and the `Switch Tier…` / `Set Up Dedicated
> Verification…` / `Open External Verification Note` / `Verification
> Kickoff` row actions. Every one of those surfaces was removed with the
> tier, so the fixtures had nothing left to pin.

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
