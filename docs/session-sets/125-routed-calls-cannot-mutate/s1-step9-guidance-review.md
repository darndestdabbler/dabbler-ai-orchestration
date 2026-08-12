# Set 125 — Step 9 guidance reorganization review

**Reviewed:** `docs/planning/project-guidance.md`,
`docs/planning/lessons-learned.md` (and the preload manifest as a whole).
**Outcome:** one lesson is warranted; **it cannot be admitted without an
operator decision**, because every preload file is at its ceiling.

## Measured state (`guidance_report --check`)

| file | tokens | ceiling | headroom |
| :--- | ---: | ---: | ---: |
| `docs/session-constitution.md` | 3,984 | 4,000 | 16 |
| `docs/planning/project-guidance.md` | 3,499 | 3,499 | **0** |
| `docs/planning/lessons-learned.md` | 2,379 | 2,385 | 6 |
| `AGENTS.md` | 2,003 | 2,031 | 28 |
| **TOTAL** | **11,865** | **12,000** | 135 |

At ceiling, adding prose requires removing prose. Ceilings ratchet down only;
a raise is an operator config edit with a stated reason. Archival is likewise
operator-reviewed. So this review **recommends** rather than edits.

## The candidate lesson

> **A transport can carry capabilities the contract never promised — check
> capability parity, not just output parity.**
>
> `route()` looked like one contract with two interchangeable transports. It
> was not: `api` returns text and cannot touch the filesystem by construction,
> while `copilot-cli` dispatches an agentic CLI that held arbitrary shell plus
> file create/edit against the live working tree. Nothing in the contract, the
> tests, or the config said so — the asymmetry lived entirely in a subprocess
> flag. When two backends satisfy one interface, compare what each *can do*,
> not only what each *returns*. Corollary, learned the expensive way:
> **model refusal is not a control.** A blunt "create breach.txt" prompt was
> declined; a benign "bring this file into line with the convention" framing
> wrote immediately. The grant is the control.

**Why it meets the Set 085 admission test** — recent recurrence (this set, and
the same class sits behind Set 124's 23-file incident); high miss cost (it
silently dissolves the cross-provider verification guarantee); weak automated
detectability (it presents as a *helpful* diff, not an error); expressible
well under 150 tokens.

**Why it is not admitted here:** `lessons-learned.md` has 6 tokens of
headroom, and `project-guidance.md` has none. Admitting it requires either an
operator-approved archival of an existing active lesson, or an operator
ceiling decision. Neither is self-authorizable.

## Options for the operator

1. **Archive `L-075-1`** ("a dependency-pin bump is not enablement",
   `last-used-set=084` — 41 sets stale, the least-recently-cited active
   lesson) and admit the candidate in its place. *Recommended:* it is the only
   active-tier lesson with no citation since Set 084, and the executable
   equivalent (a missing-module failure) is loud and self-diagnosing.
2. **Admit it into `project-guidance.md` → Principles** as a durable
   architectural commitment rather than a lesson, paired with a demotion of
   comparable size.
3. **Do nothing in the preload.** The rule is already recorded canonically in
   `ai_router/CHANGELOG.md` (Security), `router-config.yaml`'s transport
   block, and this set's `change-log.md`. The cost is that a future
   orchestrator meets it only if it reads those.

## Everything else

No other reorganization is recommended. `project-guidance.md`'s Conventions
absorbed this set's other applicable rules already — "a bug is a bug CLASS"
(`L-069-1`) drove applying the grant to **both** dispatch paths rather than
the one that happened to be reachable, and it needed no restatement.
