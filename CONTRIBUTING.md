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
cd tools/dabbler-ai-orchestration
npx tsc --noEmit && npm run test:unit
npm run test:playwright
```

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

Both registries publish from the `master` branch. The PyPI publish
needs a working `~/.pypirc` or `TWINE_*` env credentials. The
Marketplace publish needs the PAT stored at
`$env:AZURE_VSCODE_MARKETPLACE_TOKEN`.

```bash
# PyPI
python -m build
twine upload dist/dabbler-ai-router-<version>*

# VS Code Marketplace
cd tools/dabbler-ai-orchestration
npx vsce publish --pat $env:AZURE_VSCODE_MARKETPLACE_TOKEN
```

Both publishes are operator-gated on every session set's release
session — never publish on automation.

## CI

GitHub Actions runs on every push to `master` and all PRs:
[`.github/workflows/test.yml`](.github/workflows/test.yml). The
matrix covers ubuntu-latest, macos-latest, and windows-latest for
both Python (`python -m pytest`) and the Layer-3 Playwright suite
(`npm run test:playwright`; Linux uses `xvfb-run`). Layer 2 is
skipped in CI — known broken on Windows 11 + VS Code 1.120,
untested elsewhere. See `docs/implementation-summary-023-027.md`
for details.

## License

MIT. See [`LICENSE`](LICENSE).
