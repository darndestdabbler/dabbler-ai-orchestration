# Set 099 Session 1 — verification conventions (read first)

## What this session shipped (scope)
Session **1 of 2**: the **transactional module RENAME writer** only.
- `renameModule(root, oldSlug, {newSlug?, newTitle?}, io?)` in
  `src/utils/moduleAuthoring.ts` — preflighted, all-or-nothing rewrite of the
  `docs/modules.yaml` entry + a restamp of `module: <old>` → `module: <new>`
  in every affected set's `spec.md`; title-only skips the restamp.
- Supporting pure helpers (also in `moduleAuthoring.ts`):
  `restampModuleInSpecText`, `assertRestampedTextValid`,
  `rewriteManifestEntryText` (internal), `assertRenamedManifestParses`,
  `parseManifestEntriesFromText` (internal), `hasRunningSessionAt` (internal).
- `dabbler.renameModule` palette command in `src/commands/renameModule.ts`
  (injectable UI; two-step modal confirm) + wiring in `extension.ts` and a
  `package.json` command contribution.
- Tests in `src/test/suite/moduleAuthoring.test.ts` and
  `src/test/suite/renameModule.test.ts`.

## Explicitly OUT of scope (do not report as gaps)
- The **delete writer** (`deleteModule`) — that is **Session 2**.
- Module-row buttons / context-menu / tree UI — **Set 100** (this is
  **palette-only** by design).
- `planPath` files / `docs/modules/<slug>/` folders are **never moved or
  deleted** by rename — the plan doc is operator-owned content (spec non-goal).
- No Marketplace/PyPI **publish** and **no version bump** this session — a
  single release boundary lands after **Set 101**. Extension stays `0.43.0`.

## Design authority (operator-confirmed — do not re-litigate)
Per `docs/proposals/2026-07-13-module-lifecycle-simplification/verdict.md`
(decision 1): **slug stays identity** — no `moduleId`, tombstones, or slug
registry (explicitly cut as overengineering). Rename is therefore a
preflighted all-or-nothing rewrite, not an identity-remap. The spec says "do
not re-litigate at runtime."

## Suite baseline
- **Layer 2 electron harness is environment-broken here**: `@vscode/test-electron`
  fails to launch VS Code 1.128.0 (`bad option: --no-sandbox` — the installed
  Code build rejects the runner's CLI flags). This is pre-existing and
  unrelated to this change.
- The full compiled suite was therefore run via the **sanctioned vscode-stub
  path** the repo ships for exactly this case
  (`npx mocha --ui tdd --require ./src/test/vscode-stub.js "out/test/suite/**/*.test.js"`):
  **1694 passing / 27 failing**. All 27 failures are electron-runtime-dependent
  tests the stub cannot satisfy (tree `getChildren` rendering, cancelled-bucket
  mapping, force-close badges, worktree discovery, `fs.watch` allowlist, the
  aiAssignment `before all` workspace hook) — **none** touch a surface this
  session changed.
- **All 30 new rename tests pass** (24 writer/helper + 6 command-flow), plus
  the module/assign/scaffold control suites. `tsc --noEmit`, `eslint`, and the
  `esbuild` compile are clean.
- **Dogfood** (`s1-dogfood.md`): the real compiled writer renamed
  `greeter → welcomer` on a scratch multi-module repo — 2 stamped sets
  restamped, the unrelated `payments` module and an unstamped set untouched,
  **zero orphans**, comments / `codeRoots` block / sibling entry byte-preserved.

## The writer never touches session-state
The running-session preflight **reads** `session-state.json` (non-mutating);
it never writes it. The writer edits only `docs/modules.yaml` and affected
`spec.md` files. `session-state.json` mutations remain the blessed lifecycle
writers' job.

## Severity rubric (grade by CONSEQUENCE — L-095-1)
Grade each finding by the probability its stated failure scenario materializes
for a real user × its impact on the deliverable. Low-probability **or**
low-impact is **Minor** even if technically correct; a finding with no
plausible real-world failure scenario is **Minor** by definition. Only a
material **Critical/Major** continues the loop.
