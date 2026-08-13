# Set 122 Session 2 — verification conventions

Read this before the work. It states the baseline, the contract, and the
by-design exclusions, so Round 1 spends its findings on real defects rather
than on the agreed starting position.

## What this session shipped

Session 1 shipped `python -m ai_router.modules create | rename | delete |
assign-sets`. **This session makes the extension use it, and deletes the
TypeScript implementation it replaces.**

New:

- `tools/dabbler-ai-orchestration/src/utils/routerCli.ts` — the one way the
  extension runs a router CLI that mutates the workspace: resolves the
  interpreter, **echoes the exact command before spawning**, decodes output
  streaming-safe, classifies the result by exit code.
- `.../src/utils/moduleLifecycleCli.ts` — the `ai_router.modules` argv
  contracts and result messages.
- `.../src/utils/sessionLifecycleCli.ts` — the same for
  `ai_router.session_lifecycle`.
- `.../src/test/suite/moduleCliFixture.ts` — a CLI-backed fixture builder for
  the Layer-2 suite.
- `ai_router/session_lifecycle.py` gains a `cancel` / `restore` CLI.

Deleted:

- The module lifecycle writers in `moduleAuthoring.ts` (**2,601 → 608
  lines**).
- The `session-state.json` writer half of `cancelLifecycle.ts` (**549 → 142
  lines**), and `sessionStateV4Writers.test.ts`'s cancel/restore suites.

## Suite baseline (test-run policy A1/A2 — read this before flagging it)

- **Layer 2 is green: 1409 passing, 2 pending** (`npm run test:unit`).
- **`npx tsc --noEmit` is clean; `eslint` reports only pre-existing
  warnings** (`ROUTER_CONFIG_REL` in `gitScaffold.ts`, `SAMPLE_PROGRESS` in
  `trySampleProject.ts`, and the `no-explicit-any` set in `fileSystem.ts` /
  `progress.ts` — all present before this session and confirmed so by
  stashing the change).
- **Targeted pytest is green**: `test_modules_lifecycle.py` (42),
  `test_plan_seeding.py` + `test_start_session.py` +
  `test_session_checklist.py` + `test_checklist_posts.py` (206).
- **The full pytest suite and the full Playwright suite have NOT been run
  yet, deliberately.** Policy A2 forbids a FULL suite before any
  cross-provider stage, because Step 7 remediation is a code change that
  invalidates it. Both are owed at Step 6, after verification. **Their
  absence is not a finding.**
- `package.json` is the extension MANIFEST, so `L-064-12` applies and the
  full `npm run test:playwright` is owed here — it is scheduled, not skipped.

## Release contract

- Changelog entries are under `## [Unreleased]` in **both** `ai_router/
  CHANGELOG.md` and `tools/dabbler-ai-orchestration/CHANGELOG.md`. **No
  version bump is owed by this session** — the release walk happens at the
  end of the set.
- `tools/dabbler-ai-orchestration/dist/` is a committed build artifact that
  a `npm run compile` refreshed. It is excluded from this evidence bundle by
  the verifier's default excludes; it is not hand-written source.

## By-design exclusions — decided by the spec or by the operator

These are **not open** in this round:

1. **Cancel / Restore and every module command now require a working Python
   interpreter with `ai_router` installed.** That is the intended
   consequence of removing the TypeScript implementations. **Session 4 of
   this set owns the provisioning guarantee** (a declared version floor, an
   upgrade-capable install, and a post-install capability probe), and the
   operator publishes only after it lands. "This could fail when the venv is
   missing" is therefore a known, owned, scheduled gap — not a finding
   against this session.
2. **Removing the TypeScript `session-state.json` writer entirely** — rather
   than only severing the module-delete path the spec step names — is an
   **operator decision of 2026-08-13**, journalled in the set's
   `decisions.jsonl` with authority `human`. Do not re-litigate the scope.
3. **`ensureModulesManifest` stays in TypeScript.** It creates the *empty*
   manifest template during repo bootstrap and never writes an entry, so it
   is not part of the lifecycle the router owns.
4. **No command id changed.** Renaming one would break keybindings,
   `when`-clauses and Layer 3 fixtures. Titles and behaviour changed;
   identifiers did not.
5. **`start_session` now ticks its own `register` step.** This is an
   operator-directed fix made during this session (a release blocker in the
   operator's judgement), not scope creep discovered by the orchestrator.

## Severity rubric for this round

Grade by **consequence**: probability the stated failure scenario reaches a
real user, times impact. Low probability **or** low impact is Minor. A
finding with no nameable failure scenario is a nit, not a finding.

The highest-consequence classes here, in order:

1. **A lifecycle capability silently lost in the port.** A TypeScript
   behaviour that had no CLI equivalent and is now simply gone — this is
   the failure mode that cost Session 1 two rounds, and the launchers are
   where it would recur.
2. **A launcher that misreads the CLI's contract** — treating a refusal
   (exit 3, nothing written) as a write failure or vice versa, or telling a
   developer to reconcile from git for a call that wrote nothing.
3. **A surviving TypeScript writer of `session-state.json`**, anywhere.
4. **An echoed command that differs from the one that ran** — wrong
   interpreter, wrong quoting, or a path where the echo is skipped.
5. **A menu/manifest regression** — a changed command id, a lost `when`
   clause, or a contributed command with no registration.

## Where to look hardest

- `routerCli.ts`: the echo happens **before** the spawn and before the
  interpreter pre-check, so a failure to start is still visible. Confirm no
  path returns without echoing. Confirm `classify()` cannot report `ok` on a
  non-zero exit.
- **Argv vs echo**: `buildCommandLine` and `buildArgv` share their inputs.
  Check that `quoteForDisplay` cannot produce a line that, pasted into a
  shell, would run something *different* from the argv actually spawned.
- **The `rename` flag contract**: `--new-slug` / `--new-title` are omitted
  when unchanged, because the CLI reads an absent flag as "leave alone". A
  title-only rename must not become a slug rename to the same slug.
- **What `moduleAuthoring.ts` kept.** The deletion was large. Verify nothing
  still-referenced was removed, and nothing now-unreachable was kept.
- **`gitScaffold.ts` ordering**: `scaffoldDefaultModuleAndLifecycleSets` is
  now async and runs after the router install inside the same Build. Confirm
  the `await` is actually awaited into the summary note.
- **`complete_register_step`**: it must tick `register` and nothing else, at
  the planned step's own number, exactly once across a re-registration.
