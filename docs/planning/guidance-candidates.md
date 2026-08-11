# Guidance candidates — the queue the ceiling is holding back

> **Purpose:** a holding pen for guidance that has been *decided* but
> cannot be *admitted*, because the preload corpus is at its ceiling.
>
> **Why this file exists.** Every preload document currently sits at
> 98–100% of a ceiling that was set to its own measured size and
> *"ratchets DOWN only"* — `session-constitution.md` 3,978/4,000,
> `project-guidance.md` 3,499/**3,499**, `lessons-learned.md` 2,379/2,385,
> total 11,851/12,000. There is no headroom, and the standing rule is
> that an orchestrator at ceiling **removes prose rather than editing the
> number**.
>
> The consequence is invisible: guidance that should exist simply never
> gets written, and nothing records what was lost. **This file makes that
> cost visible.** A growing queue is evidence that the ceiling is binding
> on real content, not on padding.

## Admission rule

An entry leaves this queue only when it can be expressed as **executable
code** or **a single instruction line** — the operator's standing rule,
2026-08-10:

> A lesson must become a code fix or a one-sentence instruction, or it is
> dropped. The code fix is weighed against impact × likelihood of the
> consequence, versus the work involved.

An entry that cannot be reduced to one of those two forms is **dropped
from this queue**, not carried indefinitely. This file is a queue, not an
archive; `lessons-archive.md` is the archive.

---

## C-001 — Implement so tests can be partitioned

**Status:** queued 2026-08-10. Blocked on preload headroom.
**Class:** one-line instruction (for the agent writing the implementation).
**Depends on:** the preload collapse in
[`docs/proposals/2026-08-10-smaller-framework-target-state.md`](../proposals/2026-08-10-smaller-framework-target-state.md) §5.1.

### The candidate instruction

> *Write implementations so their tests partition: a test file imports one
> module cluster, builds its fixtures in `tmp_path`, and reads the real
> repository only when the repository is the thing under test.*

### Why it is worth a line

Module-scoped test selection — run a cluster's tests when that cluster
changes, skip them otherwise — is only **sound** if the boundaries are
real. It is not `testmon`-style inference (ruled out in Set 116 and
unchanged since); it is a *declared* boundary, and `modules.yaml` already
carries `codeRoots` to declare against.

Measured 2026-08-10 against `ai_router/tests` (119 files, 3,397 test
functions):

| | files | share |
| :--- | ---: | ---: |
| Import exactly one cluster (partitionable) | 86 | **72.3%** |
| Import two or more | 33 | 27.7% |
| Enumerate the real repository tree | **5** | 1.9% of functions |

**The practice is already mostly followed.** The instruction would codify
what the suite already does and stop it regressing — which is far cheaper
than a refactor to recover it later. That is the argument for one line
now rather than a remediation set in six months.

### What it must not say

- **Not** "never read the real repository." Roughly four files exist precisely to assert over the real tree (`drift_guard`, `no_legacy_field_reads`, `packaging_hygiene`, `production_imports`). Sandboxing them would make them assert nothing.
- **Not** a target number of clusters, or a required partition scheme. Set 118's first standing decision applies by analogy: a count target converts a design question into an arithmetic exercise.

### Prerequisite before promotion

Module-scoped selection needs an **enforcement lint** — assert each test
file's imports stay inside its declared cluster — and a **recall check**
that periodically confirms scoped selection would have caught what a full
run caught. Without both, boundaries rot silently and the suite skips
tests that would have found the break. Promote this entry only alongside
that machinery, or the instruction is advice with no teeth.

---

## C-002 — What verification is for

**Status:** queued 2026-08-11. Blocked on preload headroom.
**Class:** one-line instruction.
**Source:** GPT-5.6 Sol, in the consultation recorded at
[`docs/proposals/2026-08-10-concurrent-monitoring-as-a-gate/verdict.md`](../proposals/2026-08-10-concurrent-monitoring-as-a-gate/verdict.md) §5.

### The candidate instruction

> *Tests give deterministic evidence for exercised behaviour;
> verification owns requirements, **test adequacy**, residual risk and
> plausible counterexamples. Correctness is never out of scope.*

### Why it is worth a line

The operator's instinct — verification's marginal value is *"where test
coverage is lacking"* — was right and under-specified. Two reviewers
independently rejected the sharper-sounding version of it (*"tests own
correctness"*) because tests are **finite evidence about selected
behaviour**, may be written by the same worker, and may encode the same
misunderstanding. "Test adequacy" is the phrase that keeps the instinct
without conceding the thing that matters.

Measured support: across 572 historical findings, roughly a third are
Completeness-class — *you did not cover X* — rather than correctness.
The loop is already doing this job; the line names it so a verifier
stops re-deriving the charter every round.

### What it must not say

- **Not** "verification does not review code." It reviews *whether the tests are sufficient*, which requires reading both.
- **Not** a division that lets any finding be dismissed as "the other surface's job." The standing rule in C-003 governs dismissal.

---

## C-003 — Who may dismiss a blocking finding

**Status:** queued 2026-08-11. Blocked on preload headroom.
**Class:** one-line instruction — **the code half already exists.**

### The candidate instruction

> *A rejected blocking finding requires independent verifier acceptance,
> deterministic falsifying evidence, or operator adjudication — never the
> orchestrator's own reasoning.*

### Why it is worth a line

This corrects a factual error that reached a design proposal: the claim
that `fix-accepted` / `fix-rejected` / `accepted-with-modification` let
an orchestrator dismiss findings. They do the opposite — they are
verdicts requested **from the verifier** about the orchestrator's
*fixes* (`verify_session.py:2289-2313`), and a `fix-rejected` is
**force-escalated to blocking** at `verify_session.py:3524-3535` under an
explicit anti-laundering comment.

**So the enforcement already exists in code; only the permitted exits
need stating.** Set 116 S3 is the worked example of the legitimate path:
a path-aware-critique Major was dismissed on *operator* adjudication,
citing a passing test — deterministic evidence plus human authority, not
an orchestrator's argument.

Letting the worker dismiss its own auditor by stating a reason would make
independence cosmetic, which is the whole value of `verification_integrity`.

### Prerequisite before promotion

None. Unlike C-001 and C-002 this needs no new machinery — it documents
a boundary the code already enforces, and names the two exits that are
legitimate.
