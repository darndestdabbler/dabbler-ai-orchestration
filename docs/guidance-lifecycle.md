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

Each lesson heading (`## ...`) in `lessons-learned.md` must be followed by a one-line HTML comment trailer containing its metadata. This trailer is the ground truth for tracking and automation.

**Format:**
```html
<!-- lesson: id="L-SET-SEQ" added-set="NNN" last-used-set="NNN" status="active" scope="portable" -->
```

**Fields:**

| Field | Description | Required? | Example |
| :--- | :--- | :--- | :--- |
| `id` | A short, stable handle, minted once. Permanent across heading renames. | Yes | `L-064-1` |
| `added-set` | The set number when the lesson was added. | Yes | `064` |
| `last-used-set` | The set number of the last session that cited this lesson. | Yes | `072` |
| `status`| The lesson's current state. | Yes | `active`, `archived`, `promoted` |
| `superseded-by` | ID of the lesson that replaces this one. | No | `L-075-3` |
| `encoded-in` | Path to a test, linter, or template that automates this lesson. | No | `tests/test_foo.py` |
| `scope` | Portability of the lesson. | No | `portable`, `repo-specific` |

**Validation**:
To ensure all lessons have valid, parseable metadata, run:
```sh
python -m ai_router.validate_guidance_meta
```
The parser and formatter in `ai_router/guidance_meta.py` are designed to round-trip files, preserving human readability.

## Citation at close (the keystone)

Usage is the primary signal for a lesson's relevance. This signal is captured via explicit citation.

1.  When a lesson is instrumental in a session's success, the orchestrator records its `id` in the `disposition.lessons_cited` array within `disposition.json`.
2.  As part of the final commit for that session, the operator runs the `cite_lessons` command. This updates the `last-used-set` metadata field for each cited lesson.

**Command:**
```sh
python -m ai_router.cite_lessons --set <CURRENT_SET_NUMBER> <id_1> <id_2> ...
```

In addition to the `cite_lessons` update of `last-used-set`, `close_session`
records the `disposition.lessons_cited` array into the close-out event, so the
session's cited ids are preserved in the session-events ledger.

This mechanism is inert by default. A lesson that is never cited will never have its `last-used-set` field updated. Silence does not trigger archival.

## When to archive a lesson

Archival is an operator-reviewed process based on concrete evidence. A lesson is a candidate for archival if **any** of the following are true:

-   **Superseded**: Its `superseded-by` metadata field points to a newer lesson.
-   **Automated**: Its `encoded-in` metadata field points to live automation (e.g., a test, linter rule, or template) that makes the manual guidance obsolete.
-   **Retired**: The subsystem or technology it pertains to has been removed.
-   **Disused**: It has no `last-used-set` activity for a configured window (default 20 sets) **AND** it is not referenced by any other active guidance. Disuse only makes a lesson a *candidate* — it is never the sole reason to evict. A rare-but-critical lesson (see the next section) is explicitly spared at operator review even when it crosses the disuse window.

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

## Already over budget? Use the one-time backlog recipe

If a repository's guidance files are already significantly over budget, the steady-state lifecycle mechanisms are insufficient for the initial cleanup. A separate, one-time, operator-driven remediation process is required.

This process is detailed in `docs/guidance-backlog-remediation.md`.

It is supported by the `ai_router/guidance_triage.py` helper, which classifies each existing entry as `keep-active | archive | promote | merge | drop`, projects the post-remediation active-tier size against the ceiling, and writes an operator-reviewed **proposal** without ever editing the target file directly.

## Commands at a glance

| Command | Purpose |
| :--- | :--- |
| `python -m ai_router.guidance_report` | Report current guidance file sizes against ceilings (read-only; add `--write-headers` to stamp, `--check` to gate). |
| `python -m ai_router.validate_guidance_meta` | Validate all `<!-- lesson: ... -->` metadata trailers. |
| `python -m ai_router.cite_lessons --set <N> <id>` | Update a lesson's `last-used-set` after it was cited. |
| `python -m ai_router.guidance_search --archive` | Search for content within the `lessons-archive.md` file. |
| `python -m ai_router.guidance_triage` | Assist with the one-time backlog remediation process. |
