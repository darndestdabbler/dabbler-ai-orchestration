# Contributing to dabbler-ai-orchestration

Thanks for your interest. This repo is the canonical source for the
Dabbler AI orchestration infrastructure: the `ai_router/` Python
package published to PyPI as `dabbler-ai-router`, and the VS Code
extension at `tools/dabbler-ai-orchestration/` published to the
Marketplace as `DarndestDabbler.dabbler-ai-orchestration`.

See [`CLAUDE.md`](CLAUDE.md) for the repo's role and the portability
rule, and [`docs/repository-reference.md`](docs/repository-reference.md)
→ *Documentation authority and release status* for the canonical
consumer-repo map and current release status.

## Test layers

Three layered test suites cover the extension end-to-end. Pick the
lowest layer that can see the regression you're guarding against —
each layer's runtime grows ~3× over the previous.

### Layer 1 — pytest end-to-end against the real CLIs

```bash
python -m pytest -m e2e
```

~30s. Covers `session-state.json`, the events ledger, the
`completedSessions[]` array, and the change-log handoff. Data
assertions belong here.

### Layer 2 — tree-provider harness

```bash
cd tools/dabbler-ai-orchestration && npm run test:unit
```

~90s. Covers `SessionSetsProvider.getChildren()` bucketing, sort
order, and file-watcher invariants. Bucketing / sort /
file-watcher logic belongs here.

> The `npm test` script (which uses `@vscode/test-electron`) is
> known broken on Windows 11 + VS Code 1.120. Use `npm run
> test:unit` instead — it exercises the same provider code through
> a vscode-stub shim.

### Layer 3 — Playwright Electron rendering smoke

```bash
cd tools/dabbler-ai-orchestration && npm run test:playwright
```

~90s for ~10 scenarios. Covers rendered-text invariants that the
operator actually sees painted on screen (bucket counts, badges,
group counts, "N/N", "in flight" annotations, signal badges,
conflict pills).

> **Rebuild trap (Set 045 lesson):** `npm run test:playwright` is
> wired to `npm run compile && npx tsc --outDir out && npx
> playwright test` so the extension bundle is always rebuilt
> before the spec runs. Do NOT skip the `npm run compile` step or
> invoke `npx playwright test` directly when iterating on
> TypeScript changes — Playwright loads the extension from
> `dist/extension.js`, and a stale bundle silently produces
> assertion failures that look like behavioral regressions but
> are really just unbuilt code. Always invoke through `npm run
> test:playwright`.

## Running everything

The canonical full-pass before any commit:

```bash
python -m pytest
python -m ai_router.guidance_report --check   # preload ceiling gate (Set 085)
cd tools/dabbler-ai-orchestration
npx tsc --noEmit && npm run test:unit
npm run test:playwright
```

`guidance_report --check` is the ratcheting preload-ceiling gate: it
fails if any required-reading file is over its per-file ceiling or the
always-loaded corpus is over its `total_ceiling_tokens` (declared in the
`guidance.preload` block of `ai_router/router-config.yaml`). At ceiling,
adding prose to a preloaded doc means removing prose elsewhere —
ceilings ratchet **down only**; raising one is an operator-authorized
config edit with a stated reason, never an in-session fix.

## UAT fixture workspace

Operator UAT of the Work Explorer never requires hand-built
sample projects. The committed fixture matrix at
[`tools/dabbler-ai-orchestration/test-fixtures/uat-matrix/`](tools/dabbler-ai-orchestration/test-fixtures/uat-matrix/)
holds a trivial hello-world consumer project whose session sets
cover the marker/action states the Explorer ships — the control row,
blocked-by-prereqs (real pending + unknown slug), and needs-migration
(schema v3 asterisk). The matrix README carries the full row inventory.

Set 112 removed the Lightweight tier, and with it the second fixture
project (`hello-world-lightweight`) and every state that existed only to
make the tier legible (`lw`, `N/M+`, `v?`, `v+`).

**A guided-look UAT walk stages itself** — `npm run walk` builds the
disposable copy, launches the real Extension Development Host against it,
and opens the Dabbler view for you (see the authoring guide). Two modes:

```bash
cd tools/dabbler-ai-orchestration
npm run walk                 # the fixture project, with session sets
npm run walk -- --empty      # a project with NO sets -- the only state
                             # that shows the Getting Started form
```

`npm run make-uat-workspace` still generates the copy without launching
anything, if you want to open it yourself.

The copy is throwaway — delete the printed folder (or just re-run the
script) when done. Walking UAT against the generated copy is safe even
for mutating actions (Migrate to v4 schema): the committed matrix is
untouched.

When this checkout has a repo-root `.venv`, the generator pins
`dabblerSessionSets.pythonPath` to it in the *generated*
`.code-workspace` (never the committed one), so the python-backed row
actions (the v4 migrator) work in the disposable workspace without any
setup.

To refresh the matrix after a schema or predicate change, edit the
fixtures and run the pinning suite
(`npm run test:unit -- --grep "uat-matrix"` — part of Layer 2), which
derives every row through the real `readSessionSets` scan. The fixtures
are synthetic by design (the cold-start fixtures are the precedent) — the
writer-discipline rules govern real sets, not these.

## Building the extension

```bash
cd tools/dabbler-ai-orchestration
npm install
npx vsce package
```

`vsce package` emits a `.vsix` next to `package.json`. The
[`tools/dabbler-ai-orchestration/LICENSE`](tools/dabbler-ai-orchestration/LICENSE)
file is a required duplicate of the root [`LICENSE`](LICENSE) —
`vsce package` expects the file alongside `package.json` and has
no flag to point elsewhere. Keep both in sync.

## Publishing

Both publishes are **GitHub-Actions tag-driven — never run `twine
upload` or `vsce publish` locally**:

- **PyPI** (`dabbler-ai-router`): push tag `v<X.Y.Z>` →
  [`release.yml`](.github/workflows/release.yml) (OIDC trusted
  publishing, no local credentials). `v<X.Y.Z>-rcN` publishes to
  TestPyPI only.
- **VS Code Marketplace + Open VSX** (extension): push tag
  `vsix-v<X.Y.Z>` →
  [`publish-vscode.yml`](.github/workflows/publish-vscode.yml)
  (`VSCE_PAT` / `OVSX_PAT` repo-environment secrets).
  `vsix-v<X.Y.Z>-rcN` builds an inspectable VSIX without publishing.

Tag pushes are operator-authorized on every session set's release
session — never push release tags on automation. Both workflows
verify the tag's version against `pyproject.toml` / `package.json`
before building.

**Release prerequisite (since 2026-06-12): the tagged commit must
have a green [`Test`](.github/workflows/test.yml) run.** Every
publish job `needs:` the shared
[`require-green-test`](.github/actions/require-green-test/action.yml)
gate, which waits while Test is still running for the commit (push
master, tag immediately — the normal flow), and fails loud on a red
or absent run. If the gate fails: get Test green for that commit
(fix forward or re-run a flaked job), then **re-run the publish
workflow run** — no tag re-push needed.

## CI

GitHub Actions runs on every push to `master` and all PRs:
[`.github/workflows/test.yml`](.github/workflows/test.yml). The
matrix covers ubuntu-latest, macos-latest, and windows-latest for
both Python (`python -m pytest`) and the Layer-3 Playwright suite
(`npm run test:playwright`; Linux uses `xvfb-run`). Layer 2 is
skipped in CI — known broken on Windows 11 + VS Code 1.120,
untested elsewhere. See `docs/implementation-summary-023-027.md`
for details. Two fast dependency-light gate jobs also run: the
tier-model `drift-guards` and the Set 085 `guidance-ceiling` job
(`python -m ai_router.guidance_report --check`).

## License

MIT. See [`LICENSE`](LICENSE).
