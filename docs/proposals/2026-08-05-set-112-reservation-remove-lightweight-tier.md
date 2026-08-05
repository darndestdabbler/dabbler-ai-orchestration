# Set 112 — remove the Lightweight tier (RESERVED)

> **Status: number formally reserved by the operator, 2026-08-05; spec
> AUTHORED same day** at
> [`docs/session-sets/112-remove-lightweight-tier/spec.md`](../session-sets/112-remove-lightweight-tier/spec.md),
> ahead of sequence on operator instruction (provisional — may be revisited).
> This document remains the reservation record and decision basis; the spec
> executes it. **Execution still waits for Set 110 to complete and Set 111
> to land** — authoring early does not loosen the prerequisites.

## Purpose

Delete the Lightweight tier — the product-facing `tier: lightweight` switch
and everything that exists only to serve it — leaving one tier whose
cross-provider verification story is true without asterisks.

## Evidence basis (measured, not assumed)

The removal was gated on the representative-seat check that Set 078 dropped
by operator override: does a real **enterprise** Copilot seat confirm ≥2
provider families? On 2026-08-05 the operator ran the probe on their work
laptop — an enterprise seat on the **same tenant and setup as staff**:

```
python -m ai_router.copilot_catalog --refresh  →
11/18 models confirmed, providers=['anthropic', 'google', 'openai']
```

Three families: excluding any orchestrator's family still leaves two
independent verifier families, so the Copilot-seat profile carries the full
exclusion guarantee for staff. Every known user of the framework is covered
by the Full tier (keyed or seat-profile). The probe's lockfile is preserved
at **`D:\copilot-catalog.lock`** (operator, 2026-08-05); when authoring
begins, copy it into this set's folder as `probe-evidence`.

## Kill list / keep list

**Deleted** (exists only for Lightweight):

- Mode A verification (`out-of-band-or-none`, `external-verification.md`
  hand-recorded verdicts) — the framework's last sanctioned
  zero-verification path.
- Mode B verification (`dedicated-sessions`: typed sessions, bounded
  re-verification loop, content-aware close gate).
- `change_verification_mode` (A→B writer) and
  `migrate_lightweight_to_canonical_v4`.
- `verificationMode` in the spec schema; `tier:` resolution step 3 in
  `runtime_mode.py` (the spec-field source).
- Lightweight branches in `close_session` / `gate_checks`.
- Lightweight fixture trees (`test-fixtures/cold-start/lightweight/`,
  `uat-matrix/hello-world-lightweight/`).
- The Getting Started form's tier fork.
- Dual-tier narratives across teaching docs; the tier-model SSoT shrinks to
  a historical note; the anti-drift banned-phrase guard for stale tier
  framings retires with the tier it defended.

**Kept:**

- `--no-router` CLI flag and `DABBLER_NO_ROUTER` env var — legitimate
  CI/hermetic-test uses; they become test affordances, not a product tier.
- Archived Lightweight session sets remain readable as history.
- The seat profile (Sets 078/079/084/086/104) — it is the replacement.

**Fail-loud edge:** the spec loader errors on `tier: lightweight` with a
one-line migration message (flip to `full`, add router config — or the
Getting Started seat path). Never a silent conversion.

**Breaking change:** consumer repos with live Lightweight sets break at
config load. Major-version release of `dabbler-ai-router` and a
consumer-repo migration notice; the release itself is operator-gated as
always.

## Day-one application of the Set 111 principles

### 1. The capability-scaling test (applied to this set's own plan)

The deletion target *fails* the test by design — Lightweight is weak-ACCESS
scaffolding obsoleted by the seat profile, which is the point. The set's own
process must pass it:

- Acceptance is **executable, not testimonial**: a grep gate proving no live
  doc/code references the tier outside archives and this record; the test
  matrix measurably halved (fixture-tree count, CI minutes before/after);
  config-load failure on `tier: lightweight` demonstrated by test.
- Verification: deep tool-provisioned passes over the deletion diff, not
  round-grinding; the 110 operator-notes verification discipline applies
  (hard bounds, one adjudication settling the stop not the truth,
  severity-gated stop, B-lite acceptance checks).
- Test-run policy applies: targeted while working; each touched expensive
  suite fully once at session close after freeze; full matrix once at the
  release boundary.

### 2. The decision-rights rubric (decisions pre-classified)

**AI-decidable under the rubric, journaled for audit** — error-message
wording; deletion ordering; where the migration notice lives; how archives
are exempted from the grep gate; doc-restructuring choices. Tiebreaks:
goal over letter, reversible, simpler / fewer tests, defer to an existing
gate.

**Operator-held (authority, not judgment)** — the major-version release and
Marketplace/PyPI publish (external, hard to reverse); the consumer-repo
migration notice's send (outward-facing); any decision that would *reduce*
verification below the Full-tier guarantee (no-skip mandate — though this
set only strengthens it). Each such stop arrives as an education-mode
brief: where the set stands, the question in one sentence, options with
consequences, a recommendation, the default.

**UAT** follows the guided-look format: a small walk — Getting Started shows
no tier question; docs tell one story; a `tier: lightweight` spec fails
loud with a helpful message — plus any Decide items the journal accrues.
Ten minutes, staged, no bypass without an attested waiver.

## Sequencing

110 (finish S3/S4 and release) → 111 (config values and authoring-guide
paragraphs; makes every later session cheaper) → **112** (this set, a
standalone removal in 110's mold, benefiting from 111's leaner loop).
