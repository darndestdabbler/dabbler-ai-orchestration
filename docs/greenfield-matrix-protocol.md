> **Greenfield Matrix Protocol**
>
> **Purpose**: This protocol SETS UP the greenfield finding-power pilot. The motivating question it instruments is *which provider×surface **arm** surfaces the most real defects on fresh, not-yet-verified work* — measured honestly as **relative finding yield + precision against the adjudicated union, not recall** (§1). It does NOT answer the question itself; a future canonical synthesis set will score the accumulated telemetry to produce a verdict.
>
> **Hard Constraint (L-069-2)**: The matrix varies PROVIDER, not framing. Both arms (`push` and `pull`) retain their strong adversarial (devil's-advocate) framing per `ai_router/prompt-templates/greenfield-matrix-addendum.md`.
>
> **Created**: 2026-06-20
>
> **See Also**:
> - [verification-surface-strategy.md](verification-surface-strategy.md) §8 (the matrix instrument + consumer-handoff model) and §9 (the N=2 Gemini-pull replication; finding-yield gap not refuted)
> - [design-consensus-synthesis.md](session-sets/075-greenfield-finding-power-pilot/design-consensus-synthesis.md) (the cross-provider design consult this protocol canonicalizes)
> - Sibling assets: the reusable instruction block [ai_router/prompt-templates/greenfield-matrix-addendum.md](../ai_router/prompt-templates/greenfield-matrix-addendum.md) and the fixed [greenfield-adjudication-rubric.md](greenfield-adjudication-rubric.md)

---

### Terminology (three distinct units — do not conflate)

The word "cell" is overloaded in the tooling, so this protocol fixes three terms and
uses them exactly:

- **Roster entry** — one `--cell SURFACE:PROVIDER[:MODEL]` argument to the CLI (e.g.
  `push:anthropic`, `pull:openai`). The CLI flag is spelled `--cell`, but each value is
  a roster entry, i.e. an **arm token** (a surface bound to a provider). This pilot's
  roster is `{push:anthropic, pull:openai, pull:google}`.
- **Matrix cell** — one `(push, pull)` **dual-surface run**, formed by the **push×pull
  cross-product** of the roster entries. This roster yields **two** matrix cells:
  `(push:anthropic, pull:openai)` and `(push:anthropic, pull:google)`. This is the
  Sets 072–073 sense of "cell".
- **Arm** — the **provider×surface scoring unit**: `push:anthropic`, `pull:openai`,
  `pull:google` (three arms). TP/FP credit is assigned **per arm** (§3, and the rubric's
  *Scoring Unit*).

So: the CLI takes **three roster entries**; their push×pull cross-product is **two
matrix cells** (the dual-surface runs); and findings are scored across **three arms**.
"Roster entry / arm token" is the CLI arg, "matrix cell" is a run, "arm" is the scoring
unit — never interchangeable.

### 1. Framing: Relative Yield, Not Recall

The pilot measures **relative finding yield**, not recall. Recall, defined as `TP / (TP + FN)`, is unmeasurable because the denominator (the true set of all defects, including unknown-unknowns) is unknowable.

The ground truth for this pilot is the **adjudicated union** of all findings surfaced across all verification sources for a given diff (all matrix arms + the session's standard verification pass). This adjudicated union is a practical, measurable PROXY for the true defect set. The honest claim is "relative finding yield and precision against the adjudicated union," never "recall."

### 2. D1: Timing and Invocation

The verification matrix is run at Step 6 of a build session, on the freshly-built diff, *before* any remediation edits are made. This is the only point where the full set of generated defects is present for measurement.

Artifacts are persisted immediately after the run to create the measurement snapshot.

**Canonical Invocation:**
```bash
# Run from the root of the target consumer repo
python -m ai_router.verification_only_app run \
  --target . \
  --base <session-start-ref> \
  --cell push:anthropic --cell pull:openai --cell pull:google \
  --orchestrator-provider <provider> --orchestrator-model <model> \
  --out docs/session-sets/<slug>/matrix-run/verification-matrix-report.json
```
*Note: `--head` defaults to the working tree, correctly capturing uncommitted work.
Each `--cell` argument is a **roster entry** (`SURFACE:PROVIDER[:MODEL]`, an arm token),
**not** a matrix cell — the tool takes the push×pull cross-product of the roster
entries to form the matrix cells (here: 3 roster entries → 2 dual-surface cells; see
Terminology).*

### 3. D2: Ground Truth and Per-Arm Scoring

The scoring unit is the **provider×surface arm** (`push:anthropic`, `pull:openai`,
`pull:google`) — the matrix tool's `build_remediation_report` consolidates the
2-cell run into one deduped, provenance-tagged report, and the arm is the unit that
report supports (see the rubric's *Scoring Unit* section). Each arm is scored against
the adjudicated union of all true-positive findings. The following metrics MUST be
calculated per arm:

*   **TP (True Positives):** Adjudicated-real findings surfaced by this arm.
*   **FP (False Positives):** Adjudicated-unreal findings surfaced by this arm.
*   **Precision:** `precision = TP / (TP + FP)` (undefined for a clean-verdict arm where `TP+FP=0` — report "n/a (0 findings)").
*   **Share of Adjudicated Union:** `share = (TPs from this arm) / (size of adjudicated TP union)`
*   **Unique TPs:** Count of TPs surfaced by this arm and no other arm.
*   **Cost per TP:** `cost_per_tp = arm_cost_usd / TP`.
    *   If `TP=0`, report the arm's cost and "0 TP"; do not emit `Infinity`.

### 4. D3: Artifact Freeze Discipline

The initial, pre-remediation run's artifacts are the immutable record for measurement.
*   `matrix-run/verification-matrix-report.json`
*   `matrix-run/remediation-report.json`
*   `matrix-run/remediation-report.md`

These files MUST NOT be overwritten. The orchestrator remediates from this exact `remediation-report.md`, ensuring the tokens spent on measurement also contribute direct value. Any subsequent post-remediation re-run of the matrix MUST be labeled separately (e.g., in a `post-remediation/` subdirectory) and is excluded from the primary finding-power measurement.

### 5. D4: Doc-Only Repo Exclusion

Repositories with documentation or planning diffs containing zero source code (e.g., `dabbler-access-migration-orchestrator`) MUST be excluded from the primary finding-power aggregate. Such diffs starve the snippet-fed `push` arm, poisoning the `push`-vs-`pull` comparison.

An optional, `pull`-only scrutiny sidecar run is permitted for these repos, but its telemetry MUST be tagged `diffClass=docs-only-excluded` and `includedInFindingPower=false`. (The design consult's shorthand `targetClass=docs-only` / `excludedFromFindingPower=true` is canonicalized into these two fields — see §6.)

### 6. D5: Telemetry Layout and Metadata

All session telemetry for this pilot is aggregated under a canonical, committed path. This enables the final synthesis analysis.

*   **Canonical Path:** `docs/session-sets/075-greenfield-finding-power-pilot/telemetry/<repo-name>/<session-id>/`
*   **Mechanism:** Direct file copy from the consumer repo's session workspace. No CI or Git-PAT infrastructure is required.

Each session's telemetry directory MUST contain a `metadata.json` file with the
following required fields. The values below are illustrative (the roster providers
are fixed by §8; the exact models are whatever that run resolved):

```json
{
  "targetRepo": "dabbler-platform",
  "sessionId": "access-migration-generator-consumption-s1",
  "baseRef": "<session-start-ref>",
  "headRef": "<head-or-working-tree>",
  "matrixPackageVersion": "dabbler-ai-router 0.26.0",
  "orchestratorProvider": "anthropic",
  "orchestratorModel": "claude-opus-4-8",
  "matrixArms": [
    { "surface": "push", "provider": "anthropic", "model": "claude-sonnet-4-6" },
    { "surface": "pull", "provider": "openai",    "model": "gpt-5-4" },
    { "surface": "pull", "provider": "google",    "model": "gemini-2.5-pro" }
  ],
  "diffStats": { "bytes": 60901, "lines": 1093, "files": 15, "elided": true },
  "diffClass": "source-dominated",
  "phase": "pre-remediation",
  "includedInFindingPower": true
}
```

`matrixArms` is a **list** because one matrix run scores **every** provider×surface
arm — the roster has one push arm and **two** pull arms (§8), so a single
`pullProvider` field could not name both. Each entry is the `{surface, provider,
model}` of one scored arm; this is the metadata-level mirror of the per-arm scoring
the rubric defines, and it makes per-arm attribution/costing reproducible from
`metadata.json` alone. If the roster is widened (§8), add the new arms here and note
the change. `diffClass` is the canonical stratification field and MUST be one of
`source-dominated` / `packaging-small` / `docs-only-excluded` (§7, Threat 1).

### 7. Validity Threats and Mitigations

Two primary threats to measurement validity are known and have required mitigations.

1.  **Selection Bias from Diff Mix:** The nature of a diff confounds the `push` vs. `pull` comparison. Small, self-contained packaging diffs are snippet-fittable and favor `push`. Large, cross-cutting source code changes favor `pull`.
    *   **Mitigation:** Stratify every run by `diffClass` (`source-dominated`, `packaging-small`, `docs-only-excluded`). Report metrics per stratum. Treat `dabbler-platform` (source-dominated) as the LEAD signal and `dabbler-access-harvester` (packaging-small) as a SUPPORTING-BUT-CONFOUNDED signal.

2.  **Adjudication Drift:** TP/FP judgments may vary inconsistently between orchestrators or sessions.
    *   **Mitigation:** Adjudication MUST be performed on the provider-agnostic, consolidated `remediation-report.md`. This prevents provider branding from biasing judgment. All judgments MUST follow the **fixed rubric** defined in `docs/greenfield-adjudication-rubric.md`.

### 8. Matrix Roster and Range Discipline

To maintain corpus continuity with prior results, the pilot uses the established
**2-cell** matrix: `push:anthropic` paired with each of `pull:openai` / `pull:google`
— i.e. **two `(push, pull)` cells** (the Sets 072–073 run unit), which consolidate
into **three scored provider×surface arms** (the scoring unit, §3). "Cell" names a
dual-surface run; "arm" names the scored/credited `surface:provider` unit — the two
are never interchangeable when assigning TP credit.

*   **Roster:** `push:anthropic` vs. `{pull:openai, pull:google}`

This roster includes the load-bearing `pull:google` arm to directly test the finding-yield gap noted in `verification-surface-strategy.md §9`. Changing the roster forks the telemetry corpus and must be a deliberate, justified decision recorded in the run's metadata.

Select code-focused diff ranges for measurement. A diff dominated by generated files or other golden-output is not a useful measurement target. The chosen range and its `diffClass` must be recorded in every run.

### 9. Seeding as Fast-Follow

This pilot does not include a defect-seeding or known-benchmark component. While such a component would permit a true recall estimate, it is designated as a fast-follow effort and is not a gate for the current protocol.

### 10. Pilot Cohort

| Repo / not-started set | Work type | Finding-power fit | Router pin (current -> bump to `>=0.26.0`) |
|---|---|---|---|
| `dabbler-platform` / `access-migration-generator-consumption` (2 sess) | C# generator tooling — **source-dominated** | **LEAD signal** | `>=0.1.0` |
| `dabbler-access-harvester` / `019-...-dotnet-tool-packaging` (2 sess) | `.csproj` / CI / docs — source but **small/packaging diffs** | **supporting (confounded)** | `>=0.15.0` |
| `dabbler-access-migration-orchestrator` / `009` S2 + `010` | docs/planning — **zero source diffs** | **DEFERRED** (pull-only sidecar at most) | `>=0.10.0` |

The doc-only repo starves the `push` arm; including it in the finding-power
aggregate would poison the push-vs-pull comparison (D4 / §5). It is **deferred**
from the finding-power pool — the optional pull-only sidecar is the only run it may
contribute, tagged `includedInFindingPower=false`.

### 11. Non-Goals and Scope

This protocol establishes the measurement standard. This set **does not**:
*   Execute any matrix runs on live consumer work.
*   Produce a comparative finding-power verdict. That is the job of a future synthesis set, gated on telemetry accumulation.
*   Change, version, or release `ai_router` code.
*   Implement defect seeding.
*   Alter the default pull provider or any existing keep/demote/RETIRE posture.

A future canonical **greenfield finding-power synthesis** set produces the
comparative readout from the accumulated `telemetry/` corpus — gated on enough
runs, the same data-gated pattern as the RETIRE decision.
