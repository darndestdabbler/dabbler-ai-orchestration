# Guidance Lifecycle

> **Purpose**: To define the lifecycle for the `lessons-learned.md` and `project-guidance.md` files, ensuring they remain high-signal and within a token budget.
>
> **Audience**: AI orchestrators (of any engine) and human operators.
>
> **Status**: Canonical reference for the guidance lifecycle shipped in Set 064. This is the single source of truth.

## Why these files have a lifecycle

The core guidance files (`docs/planning/lessons-learned.md` and `docs/planning/project-guidance.md`) are read into the AI's context at the start of every session. Historically, they were append-only, leading to monotonic growth.

This creates a recurring, invisible cost:
1.  **Token Cost**: Every session pays the price of reading an ever-growing context.
2.  **Attention Dilution**: Important, active rules lose salience when buried in low-signal, outdated content.

The lifecycle introduces mechanisms to measure cost, track usage, and archive lessons based on evidence, keeping the always-loaded "active" tier focused and under a token budget.

## The two tiers

The `lessons-learned.md` file is split into two tiers to manage its size.

| File Path | Tier | Loading Behavior |
| :--- | :--- | :--- |
| `docs/planning/lessons-learned.md` | **Active** | Always loaded into the AI context at session start. |
| `docs/planning/lessons-archive.md` | **Archive**| Never loaded automatically. Explicitly excluded. |

-   **The Archival Rule**: Never delete a lesson. Move it from the active tier to the archive tier: `active -> archive`.
-   **Searching the Archive**: The archive is not lost. Search it on demand with `python -m ai_router.guidance_search --archive`.
-   **Project Guidance**: `project-guidance.md` is smaller and higher-signal by design. It is subject to a token ceiling but is **not** split into an archive tier.

## Per-lesson metadata

Each lesson heading (`## ...`) in `lessons-learned.md` must be followed by a one-line HTML comment trailer containing its **identity**. This trailer is the ground truth for addressing a lesson; its **usage** is tracked separately, in the ledger below.

**Format:**
```html
<!-- lesson: id="L-SET-SEQ" added-set="NNN" scope="portable" -->
```

**Fields:**

| Field | Description | Required? | Example |
| :--- | :--- | :--- | :--- |
| `id` | A short, stable handle, minted once. Permanent across heading renames. | Yes | `L-064-1` |
| `added-set` | The set number when the lesson was added. | Yes | `064` |
| `status`| The lesson's current state. Omitted when `active` (the active tier is what active means). | No | `archived`, `promoted` |
| `superseded-by` | ID of the lesson that replaces this one. | No | `L-075-3` |
| `encoded-in` | Path to a test, linter, or template that automates this lesson. | No | `tests/test_foo.py` |
| `scope` | Portability of the lesson. | No | `portable`, `repo-specific` |

> **`last-used-set` was retired in Set 121 S2.** Usage lives in the
> guidance usage ledger (below), not in a preload document. A stale
> `last-used-set` in a consumer repo's trailer is reported by
> `validate_guidance_meta` as *retired*, not as an unknown key — nothing
> writes it, and its value is not read.

**Validation**:
To ensure all lessons have valid, parseable metadata, run:
```sh
python -m ai_router.validate_guidance_meta
```
The parser and formatter in `ai_router/guidance_meta.py` are designed to round-trip files, preserving human readability.

## The guidance usage ledger (Set 121 S2)

Usage accounting used to live *inside* `lessons-learned.md`, which is
preload — so every session paid to read the bookkeeping that decides what
to prune, and the accounting cost more than the headroom that was left.
It now lives in `docs/planning/guidance-usage.json`, **read only at prune
time**:

```json
{
  "schemaVersion": 1,
  "entries": {
    "L-064-9": { "kind": "executable", "cost": "cheap", "uses": [] },
    "C-003":   { "kind": "instruction", "uses": ["120-01", "119-03"] }
  }
}
```

(The executable's `uses` is empty on purpose: a check's ring is filled
only by `record_fire`, never by a citation. See *Retention, split by
artifact type* below.)

**The ledger is keyed by id and agnostic about which document an entry
lives in.** `kind` says what the entry *is*, never where it sits — which
matters because `project-guidance.md` is the **sink** that lessons are
promoted into, so it needs the identical mechanism.

Four load-bearing properties:

- **Sessions, not timestamps.** A repository may lie dormant for months;
  wall-clock decay would evict the whole corpus for the *project's*
  inactivity rather than the guidance's uselessness. The only question
  ever asked is *"used within the last N active sessions?"*
- **A bounded array, not a scalar.** `last-used-set="120"` could not
  distinguish *used once, ten sets ago* from *used in every one of the
  last ten*, which warrant opposite pruning decisions. The ring holds the
  last **10** uses; the cap keeps the file from growing without bound.
- **Entries are dash-separated STRINGS, never JSON numbers** — `"120-02"`,
  not `120.02`. A decimal is not merely risky to parse, it is *ambiguous
  to read*: `120.10` round-trips through a float to `120.1`, which reads
  back as session **1**. The reader refuses a numeric use outright.
- **Pruning is batched and operator-initiated.** `guidance_ledger` has no
  evict path and never will. Eviction was never automatic and never
  mid-session: an orchestrator at 100% of a ceiling evicting prose under
  time pressure is the specific defect that broke the old scheme.

**Ordering is APPEND order, never label order.** Set numbers are
*allocation* order, not execution order — Set 121 S1 measured sets 115
and 118 executing after 119 — so the ring and the active-session
timeline are both built from close-event timestamps.

One sanctioned writer (this module), the same lock discipline as other
append-only state (`close_lock.file_mutex`), and an atomic replace.

### Retention, split by artifact type

A single *"unused in N sets → drop"* rule fails for preventive gates: a
gate that never fires is indistinguishable from a useless one, which
**is** `L-112-1`. So the rule splits:

| kind | rule |
| :--- | :--- |
| **instruction** | Retained when cited within the last `instruction_window_sessions` **active sessions**. |
| **executable, cheap** (<1s, deterministic, no routed call) | Kept indefinitely. Free insurance that never expires; **no usage record required**. |
| **executable, expensive** (a routed call, or >10s) | Must have **fired** at least once within the last `check_window_sets` sets. |

**A use is a citation for an instruction and a FIRE for a check**, and
that is enforced by the writer rather than by convention:
`record_citation()` refuses an executable and `record_fire()` refuses an
instruction. Recording mere *execution* would be worthless — a check that
runs in CI every session would look permanently in use — so the only
event an executable records is that it **caught** something. Every check
ships with a falsifier regardless.

```sh
python -m ai_router.guidance_ledger report     # retention candidates (read-only)
python -m ai_router.guidance_ledger validate   # gate the ledger's shape
python -m ai_router.guidance_ledger fire --set 133 --session 2 K-121-1
python -m ai_router.guidance_ledger backfill   # seed from close-event history
```

### The numbers, and how they were derived

Measured over **345 recorded active sessions** and **167 per-session
citation events** (Set 121 S2). They live in `router-config.yaml` under
`guidance.retention:`.

| key | value | basis |
| :--- | ---: | :--- |
| `instruction_window_sessions` | **30** | p99 of 694 intra-lesson citation gaps (median 1, p90 5, p95 10, p99 30.2, max 51). Retains 99% of genuinely recurring guidance through its quiet stretches. At this repo's measured 2.88 sessions/set that is ~10.4 sets. |
| `check_window_sets` | **20** | **The data supports nothing here** — there is no fire history yet. An honest default rather than a fabricated derivation: it reuses the operator-set `disuse_window_sets`, so the repo carries one disuse horizon rather than two that drift. |
| `instruction_line_cap` | **22** | Peak distinct ids cited in any trailing window across the whole history (20 at W=30, 21 at W=40–51, 22 at W=60–80). |

> **The Session-2 blind spot, and how it was closed.**
> `project-guidance.md` had no ids when the cap was first measured, so its
> ~24 entries contributed nothing. Set 121 S3 admitted them, which pushed
> the corpus to 25 and forced a tautological cap of 25 — a cap equal to
> its own corpus can only fire on the very next entry, so it measures
> nothing. Set 121 S4 collapsed six duplicated entries and promoted two,
> leaving a live corpus of **21**, back under the measured peak. The cap
> is therefore the measured 22 again, with one slot of real headroom.

## Citation at close (the keystone)

Usage is the primary signal for a lesson's relevance. This signal is captured via explicit citation.

1.  When a lesson is instrumental in a session's success, the orchestrator records its `id` in the `disposition.lessons_cited` array within `disposition.json`.
2.  As part of the final commit for that session, the orchestrator runs the `cite_lessons` command. This appends a `<set>-<session>` use to the ledger.

**Command:**
```sh
python -m ai_router.cite_lessons --set <CURRENT_SET_NUMBER> --session <N> <id_1> <id_2> ...
```

In addition to the `cite_lessons` ledger write, `close_session`
records the `disposition.lessons_cited` array into the close-out event, so the
session's cited ids are preserved in the session-events ledger. That event is
also what `guidance_ledger backfill` replays, so a repo that has been citing
lessons already gets a populated ledger on day one.

This mechanism is inert by default. A lesson that is never cited simply accrues no uses. Silence does not trigger archival.

## When to archive a lesson

Archival is an operator-reviewed process based on concrete evidence. A lesson is a candidate for archival if **any** of the following are true:

-   **Superseded**: Its `superseded-by` metadata field points to a newer lesson.
-   **Automated**: Its `encoded-in` metadata field points to live automation (e.g., a test, linter rule, or template) that makes the manual guidance obsolete.
-   **Retired**: The subsystem or technology it pertains to has been removed.
-   **Disused**: It has recorded no use for the retention window (see the table above) **AND** it is not referenced by any other active guidance. Disuse only makes a lesson a *candidate* — it is never the sole reason to evict. A rare-but-critical lesson (see the next section) is explicitly spared at operator review even when it crosses the disuse window.

**Archival is never automatic.** It is a deliberate, reviewed action by the human operator. Archiving is not deleting; it is moving the content to `lessons-archive.md`.

## Promotion is orthogonal to archival

Promotion (when a proven lesson becomes a formal Convention or Principle in `project-guidance.md`) is a separate lifecycle event from archival.

-   A durable, important tactic can remain active in `lessons-learned.md` for many sets without ever being promoted.
-   A rare-but-critical lesson that is cited only once every 50 sets may cross the disuse window and surface as a candidate by the raw rule, but it is **spared at operator review** and **not** archived for disuse. Its value is in its availability when needed.
-   The old rule "promote within N sets or archive" is **deleted** and must not be used.

## Ceilings are a backstop, not a trigger

Token ceilings on guidance files act as a safety net, not the primary trigger for archival. A pure size-based trigger would force the eviction of valuable lessons simply to make room for new ones.

**The Rule**: If a guidance file is **over its token ceiling**, a pruning sweep is **required before adding new content**. This sweep must use the evidence-based archival rules described above.

**Configuration**:
These values are defined in `ai_router/guidance_config.py` and can be overridden in a repository's configuration.

| Key | Default | Description |
|:---|:---|:---|
| `active_lessons_ceiling_tokens` | `10000` | Token ceiling for `lessons-learned.md`. |
| `project_guidance_ceiling_tokens` | `6000` | Token ceiling for `project-guidance.md`. |
| `disuse_window_sets` | `20` | Number of sets a lesson can be unused before being considered for archival. |

**The Cost Reporter**:
To check the current size of guidance files against their ceilings, use the reporter tool.
```sh
python -m ai_router.guidance_report                 # read-only report (default)
python -m ai_router.guidance_report --write-headers # also stamp/refresh the in-file headers
python -m ai_router.guidance_report --check         # exit non-zero if any capped file is over ceiling
```
It is **read-only by default**: bare `guidance_report` prints bytes **and**
estimated tokens — per file and combined — against the ceilings, using the cheap
`ceil(chars / 4)` token proxy (not a billing number). Terminal output is
ASCII-only (Windows `cp1252`). Only **`--write-headers`** mutates the files,
stamping/refreshing the auto-generated `<!-- guidance-overhead: ... -->` header
at the top of each managed file (size, ceiling, status/percent, last-pruned-set,
generated date). **Do not edit that header manually** — re-run with
`--write-headers` instead. `--check` is the CI-friendly gate (non-zero exit when
over ceiling).

## The preload manifest and the ratcheting ceiling gate (Set 085)

The Set-064 ceilings above cap the two guidance *lifecycle* files. The
**preload manifest** (Set 085 F1) is a second, complementary gate that
caps the *entire* always-loaded corpus — every file the workflow
requires in context at session start, not just the two lifecycle files.
It lives in the router-config `guidance:` block:

```yaml
guidance:
  preload:
    total_ceiling_tokens: 11644
    files:
      - path: docs/session-constitution.md
        ceiling_tokens: 4059
      - path: docs/planning/project-guidance.md
        ceiling_tokens: 3394
      # ... one entry per required-reading file
```

`python -m ai_router.guidance_report --check` reports and gates every
entry (per-file **and** the combined total) and is run in CI, so a
breach fails the build. This makes the ceiling itself the anti-rebloat
mechanism: **at ceiling, adding prose requires removing prose** —
token-neutral by construction. A file the manifest lists but that is
missing on disk is also a hard failure (it catches a required-reading
doc that was moved or renamed without updating the manifest).

**Ceilings ratchet DOWN only.** Lowering a ceiling (as content is
demoted to on-demand reference or encoded into a gate) is routine.
**Raising** a ceiling — or the total — is an **operator-authorized
config edit with a stated reason**, never an in-session accommodation.
An orchestrator that finds itself at ceiling mid-session removes prose;
it does not edit the number. The `stamp: true` per-entry opt-in controls
`--write-headers` auto-editing (default false — canonical docs and the
engine bootstrap files are never machine-stamped).

### Standing operator authorization, 2026-08-12 → Set 121 (RETIRED)

The operator authorized sessions to exceed the guidance ceilings until
Set 121 landed, because the no-headroom condition was taxing every
unrelated set that touched a preload file. **That authorization is
discharged and no longer in effect.** Set 121 S3 re-slimmed
`project-guidance.md` and S4 collapsed six entries that duplicated the
constitution, promoted the queue, and ratcheted every ceiling back down
to measurement. Future ceiling raises require fresh operator
authorization per the standard ratchet rule above.

Back-compat: a repo with no `preload:` block keeps exactly the two-file
Set-064 behavior (universal core, gated extension). Only a
**workspace-resolved** `router-config.yaml` (or one explicitly pointed
at via `--repo-root` / `AI_ROUTER_CONFIG`) can declare a repo's preload
contract — the package-bundled default config is never treated as a
manifest source, so a pip-installed consumer with no config of its own
stays on the legacy behavior instead of inheriting this repo's manifest
(Set 085 S3).

**Membership follows the required-reading contract (Set 085 S2).** The
manifest bounds the per-session preload — in this repo:
`docs/session-constitution.md`, `docs/planning/project-guidance.md`,
`docs/planning/lessons-learned.md`, and **one** engine bootstrap file —
under the manifest's total. Because a session reads exactly one of
`CLAUDE.md` / `AGENTS.md` / `GEMINI.md` and the gate sums every listed
entry, the manifest counts the **largest** engine file as the
representative entry, so the total bounds every engine's session
without over-counting the alternatives. The three engine files share
one body by policy and are kept in lockstep; the gate does not watch
the two uncounted siblings, so an edit that makes a sibling the largest
must repoint the manifest entry **in the same change** — that is a
review-time discipline, and the per-file ceiling on the representative
still blocks growth of the counted path. **Set 121 S4 is the worked
example:** a lockstep trim of the shared body left `GEMINI.md` largest
(7,730 bytes vs `AGENTS.md` 7,646 and `CLAUDE.md` 7,164), so the entry
moved from `AGENTS.md` to `GEMINI.md` in the same commit. Demoted
on-demand references (the workflow doc, the schema doc, the close-out
doc, the authoring guide, `quick-start.md`) are deliberately **uncapped**,
like the archive: their size is no longer a recurring per-session tax,
and capping them would only invite ceiling-editing churn where no
preload cost exists.

## The preload admission test (Set 085)

Preload context is the scarcest resource in the workflow: every token
loaded at session start is paid on *every* session and dilutes the
salience of the rules that matter. A rule or lesson earns preload
residency **only if it satisfies all five** of the following
(GPT-5.4's formulation, adopted by the 2026-07-07 cross-provider
consult):

1. **Recent recurrence** — it has actually come up recently, not once
   long ago.
2. **High miss cost** — getting it wrong is expensive or hard to
   unwind.
3. **Weak automated detectability** — no cheap deterministic check
   reliably catches the mistake.
4. **No executable-gate equivalent** — it is not already enforced by a
   test, validator, linter, or CI check.
5. **Expressible in ≤150 tokens** — the principle fits; the full
   treatment lives on demand.

The routing that follows from the test — the **prose → gate → archive
pipeline**:

- **Machine-checkable → make it a gate.** Anything a test / validator /
  CI check can enforce becomes that check, and the prose archives with a
  pointer to the automation (`encoded-in`). The gate costs zero
  attention until it fires; the prose costs attention every session.
- **Situational → on-demand reference.** Anything that only matters at a
  specific moment moves out of the preload path to a reference doc,
  consulted at the moment of need (searchable via
  `python -m ai_router.guidance_search`). It stays authoritative for its
  domain; only its *preload residency* ends.
- **Stale → archive or drop.** Anything superseded, retired, or long
  unused archives by the evidence rules above.

`guidance_triage` produces an operator-reviewed **proposal** against
this test — it classifies each entry and projects the post-triage size,
but **never edits the target file directly**. Archival and demotion stay
operator-reviewed actions.

## Already over budget? Use the one-time backlog recipe

If a repository's guidance files are already significantly over budget, the steady-state lifecycle mechanisms are insufficient for the initial cleanup. A separate, one-time, operator-driven remediation process is required.

This process is detailed in `docs/guidance-backlog-remediation.md`.

It is supported by the `ai_router/guidance_triage.py` helper, which classifies each existing entry as `keep-active | archive | promote | merge | drop`, projects the post-remediation active-tier size against the ceiling, and writes an operator-reviewed **proposal** without ever editing the target file directly.

## Bootstrapping a consumer repo's `project-guidance.md`

A new AI-led-workflow repo starts from this repo's `project-guidance.md`
shape: a **Principles** half (durable strategic commitments — the *why* and
*what*, slow to change) and a **Conventions** half (specific rules, patterns
and code styles — the *how*, faster to change, often promoted from successful
lessons). Fill in the sections below with repo-specific content; a section
with nothing repo-specific to say should be **omitted, not stubbed**.

| Section | What to write |
| :--- | :--- |
| Principles → Architecture | Primary data store, language/runtime, key boundaries between layers. |
| Principles → Testing | Hermetic vs. integration, coverage expectations, CI/CD gating. |
| Principles → Security and Auth | Auth model and secret handling, if applicable. |
| Conventions → Code Style | Naming, formatting, nullability, async suffix, file layout. |
| Conventions → Build and Test | Build/test commands, gating rules, CI/CD expectations. E.g. `dotnet build && dotnet test` run sequentially rather than in parallel, to avoid file-lock contention on Windows. |

> **Why this list lives here and not in the file it describes.** Set 134 S3
> measured the stub headings in the always-loaded copy at **174 tokens paid by
> every session of every set** — 134 sets without one of them being filled in.
> Scaffolding for a repo that does not exist yet is not preload. This document
> is an on-demand reference and deliberately uncapped, so the template value is
> preserved at zero recurring cost.

## Commands at a glance

| Command | Purpose |
| :--- | :--- |
| `python -m ai_router.guidance_report` | Report current guidance file sizes against ceilings (read-only; add `--write-headers` to stamp, `--check` to gate). |
| `python -m ai_router.validate_guidance_meta` | Validate all `<!-- lesson: ... -->` id markers. |
| `python -m ai_router.cite_lessons --set <N> --session <M> <id>` | Record a use of a lesson in the guidance usage ledger. |
| `python -m ai_router.guidance_ledger report` | Retention candidates for the operator's batched prune review (never evicts). |
| `python -m ai_router.guidance_ledger fire --set <N> --session <M> <id>` | Record that an expensive check **caught** something. |
| `python -m ai_router.guidance_ledger validate` | Validate the usage ledger's shape. |
| `python -m ai_router.guidance_ledger backfill` | Seed the ledger from recorded close-event citation history. |
| `python -m ai_router.guidance_search --archive` | Search for content within the `lessons-archive.md` file. |
| `python -m ai_router.guidance_triage` | Assist with the one-time backlog remediation process. |
