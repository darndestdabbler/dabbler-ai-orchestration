# Greenfield finding-power pilot — telemetry

This directory is the **canonical, committed aggregation home** (protocol decision
**D5**) for the greenfield finding-power pilot. The two source-bearing pilot repos
copy their **frozen** `matrix-run/` artifacts here at the end of a build session; a
future canonical **synthesis** set scores the accumulated corpus.

> Canonical contract: [`docs/greenfield-matrix-protocol.md`](../../../greenfield-matrix-protocol.md)
> (D5 telemetry layout + the required `metadata.json` fields, D3 freeze rule).
> Adjudication: [`docs/greenfield-adjudication-rubric.md`](../../../greenfield-adjudication-rubric.md).
> The per-session producer block: [`ai_router/prompt-templates/greenfield-matrix-addendum.md`](../../../../ai_router/prompt-templates/greenfield-matrix-addendum.md).

## Layout

```
telemetry/
  <repo>/
    <session>/
      verification-matrix-report.json    # frozen, immutable (D3)
      remediation-report.json            # frozen, immutable (D3)
      remediation-report.md              # frozen, immutable (D3)
      adjudication.md                    # per-finding TP/FP/dup/unclear + per-arm credit
      metadata.json                      # the required run metadata (below)
```

- `<repo>` is the pilot repo (`dabbler-platform`, `dabbler-access-harvester`).
- `<session>` is the consumer set/session id that produced the run.
- Telemetry is **committed and reviewable**, never gitignored — the pilot's purpose
  is a later synthesis. No CI / Git-PAT transport: the repos are co-located sibling
  worktrees, so the consumer session does a plain file copy.

## Required `metadata.json` fields

The canonical list lives in the protocol's **§6 (D5)**. Each run's `metadata.json`
MUST carry:

| field | meaning |
|---|---|
| `targetRepo` | the pilot repo name |
| `sessionId` | the consumer set/session that produced the run |
| `baseRef` / `headRef` | the measured diff range (`--base` / `--head`) |
| `matrixPackageVersion` | the `dabbler-ai-router` version that ran the matrix |
| `orchestratorProvider` / `orchestratorModel` | the session's orchestrator |
| `matrixArms` | a **list** of `{surface, provider, model}` for every scored arm — one push + two pull (§8), so a single pull field cannot name both |
| `diffStats` | `{bytes, lines, files, elided}` |
| `diffClass` | `source-dominated` \| `packaging-small` \| `docs-only-excluded` |
| `phase` | `pre-remediation` (the measurement snapshot) |
| `includedInFindingPower` | `true` for the two source repos; `false` for any docs-only sidecar |

## Cohort

| repo | role | included in finding-power aggregate? |
|---|---|---|
| `dabbler-platform` | **LEAD** (source-dominated generator tooling) | yes |
| `dabbler-access-harvester` | supporting (small/packaging diffs — confounded) | yes |
| `dabbler-access-migration-orchestrator` | **deferred** (docs-only) | no — pull-only sidecar at most, `includedInFindingPower=false` |

The migration-orchestrator repo is excluded from the aggregate (D4); it has no
subdirectory here unless it ships an optional, clearly-tagged pull-only sidecar run.
