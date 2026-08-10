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
