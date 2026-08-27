# Project work plan — 148-the-session-framework

**Written by `ai_router.writers` as a fold of `activity-log.json`.**
Hand edits are overwritten by the next append. The record is the log;
this page is one view of it.

---

## The plan

Build the session framework specified in `docs/session-framework-spec.md`,
in the order set by `docs/session-framework-plan.md`, as seventeen numbered
sessions — each one developed, tested, cross-provider verified and closed
under the existing router machinery.

**Milestone A — a session runs end to end** (sessions 3–9): the credential
allowlist, record authority, these two files, the verifier's limited agency
surface, selection by role, and model discovery.

**Milestone B — the loops** (sessions 10–12): the code review loop, the
verifier authoring tests the framework runs, and the full suite with its
bounded fix loop.

**Milestone C — packaging** (session 13): pack and push to the feed, gated
on the releasability each session declares below.

**Milestone D — the extension** (sessions 14–17): collapse session sets,
then the sessions view, project setup, and the unresolved-session view.

The ordering change to know about: the plan puts "collapse session sets" at
A3; this set runs it at session 14, because A3 removes the machinery this
sequence runs on and collapsing it early would strand every session after
it.

## Sessions

| # | Session | Releasable | Declared |
| ---: | --- | --- | --- |
| 1 | Verify the design before anything is built | — | not declared |
| 2 | Verify this breakdown against that design | — | not declared |
| 3 | The credential allowlist (plan A1) | — | not declared |
| 4 | Record authority (plan A2) | — | not declared |
| 5 | The two files, framework-written (plan A4) | no | 2026-08-27 |
| 6 | The verifier's read surface (plan A5, first half) | no | 2026-08-27 |
| 7 | The test-write path (plan A5, second half) | no | 2026-08-27 |
| 8 | Selection by role, and the death of the tier ladder (plan A6) | no | 2026-08-27 |
| 9 | Model discovery (plan A7) | yes | 2026-08-27 |
| 10 | The code review loop (plan B1) | — | not declared |
| 11 | The verifier authors tests, the framework runs them (plan B2) | — | not declared |
| 12 | The full suite and its bounded fix loop (plan B3) | — | not declared |
| 13 | Packaging to the feed (plan C) | — | not declared |
| 14 | Collapse session sets (plan A3) | — | not declared |
| 15 | The sessions view (plan D1) | — | not declared |
| 16 | Project setup as two sessions (plan D2) | — | not declared |
| 17 | The unresolved-session view (plan D3) | — | not declared |

### Session 5 — The two files, framework-written (plan A4)

**Releasable: no.**

Make `project-work-plan.md` and `decisions-log.md` framework-written (plan
A4): sanctioned writers in `writers.py`, a fixed shape, and a `session`
CLI seam so a model supplies content and never structure, filename,
ordering, identity or time.

Build the §3.a task list beside the numbered session list — each session
declaring what it will do and whether it produces a releasable artifact —
because session 13 gates packaging on a declaration nothing wrote.

Backfill this set's own decisions log through the new writer, from the
hand-kept records of sessions 1 through 4.

### Session 6 — The verifier's read surface (plan A5, first half)

**Releasable: no.**

Build the read half of the verifier's agency surface on the Copilot path: list
files by pattern, search file contents by pattern, and read a file's contents.

Scope the surface to the session's changed files and their declared
dependencies, never the whole repository. Budget a fixed number of reads per
round. Log every list, search and read into the round record.

Enforce read fidelity per spec section 4.a: either the verifier reads the bytes
on disk, or the round records that a transform was applied. The secret-scrubbing
layer rewrites credential-shaped text, so a scrubbed read must be marked as
transformed rather than presented as the file. Do not weaken the scrubber.

Stamp a direct-API round as `agency: none`, so a round that could not look is
never reported as equivalent to one that could.

This session builds framework internals and publishes no package.

### Session 7 — The test-write path (plan A5, second half)

**Releasable: no.**

Build the fourth operation of the verifier's agency surface: create or modify a test file. The verifier proposes a test-file write in its response; the framework applies it. The model never touches the filesystem, and it holds no write tool on either transport. Writes are confined to the test root this repository declares under testing.selection -- a proposal naming a path outside it, or a path that is not a test filename, or a round that granted no write at all, is refused by the framework rather than discouraged by the prompt. Every proposal lands on the round's agency record with its outcome and, when refused, the reason. The write grant is off in a code-review round; the tests loop of spec section 3.c.ii turns it on.

### Session 8 — Selection by role, and the death of the tier ladder (plan A6)

**Releasable: no.**

Selection by role, and the death of the tier ladder (plan A6).

One change, not two: rates are the current sort key for candidate ordering, so
pricing cannot be removed until the declared preference order replaces it.

1. Lift `roles` out of `transports.copilot-cli` to a top-level `roles:` block and
   give both transports one role resolver. The direct-API path resolves the
   `verifier` role against the model record instead of walking tiers, keeping its
   existing reachability (provider enabled, API key resolves) and exclusion
   filters.
2. Make the preference order ordering-only on both paths: a model absent from
   `prefer` still qualifies and merely sorts after the named ones, unconditionally
   rather than only when an exclusion is active.
3. Assert `verifier.provider != author.provider` at dispatch, immediately before
   the call, not only as a selection filter.
4. Delete `pick_model`, `next_escalation_model`, `estimate_complexity`,
   `pricing.py`'s cost arithmetic, and the load-time rate check.
5. Delete the shipped pricing surfaces: per-token rate fields and `confirmed_on`
   on the model records in `router-config.yaml`, the schema keys that admit them,
   and dollar-denominated reporting in `metrics.py` and `route.py`.
6. Ship the seat as the default transport: `transport.profile: copilot-cli`, and
   follow the change through the staff-facing documentation. Precedence is
   unchanged — flag, then env, then profile — so the direct-API path stays
   reachable and merely stops being the default.
7. Affected tests as preverify; cross-provider verification; full suite as the
   `final-full` run of record; close through the gate.

Net deletion. Est. 12 Python tests, with more deleted than added.

### Session 9 — Model discovery (plan A7)

**Releasable: yes.**

# Session 9 of 148 — Model discovery (plan A7)

Build the direct-API half of §5.b/§5.c: enumeration, one staleness check over
both records, and the drift diff. The seat keeps its probe-based refresh
because a probe costs premium requests; enumeration bills no tokens.

1. **Extract the lockfile primitives.** Move the restricted-TOML renderer,
   the writer stamp, the content digest and the provenance verdict out of
   `transports/copilot.py` into `ai_router/lockfile.py`. One implementation,
   so the API record cannot drift from the seat catalog in how it is written
   or how a hand edit is detected. `copilot.py` gets smaller; the seat
   lockfile must round-trip byte for byte and keep its recorded digest.

2. **Enumerate each vendor's models endpoint** (`ai_router/discovery.py`):
   Anthropic `GET /v1/models`, OpenAI `GET /v1/models`, Google
   `GET /v1beta/models`, each paginated to exhaustion and each carrying the
   key in a header, never a query string. A metadata request bills no
   tokens, which is why the default cadence is 24 hours.

3. **Write the record through the sanctioned writer, dated.**
   `ai_router/api-models.lock` — `[meta]` plus `[[models]]`, the same shape
   the seat catalog uses, stamped and digested. One record per key set.

4. **A field a vendor stops reporting degrades to unknown, never to
   unsupported.** An absent field is written by omission; a merge never lets
   a fresh unknown overwrite a known value; a provider whose enumeration
   failed keeps its prior entries and records the failure beside them.
   Capability metadata never filters a candidate.

5. **One staleness check reading both records.** Age of the API record
   against `discovery.max_age_hours` (24) and of the seat catalog against
   `discovery.seat_max_age_hours`; both warn, both name the exact invocation
   that resolves them, neither blocks. Surfaced by `session start`.

6. **Refresh never happens inside a session.** `discovery enumerate` refuses
   while any session set has a session in flight — a session that changes
   its own verifier pool has edited the conditions of its own review.

7. **The drift diff (§5.c).** Models in a record and named in no role;
   models named in a role and absent from both records; the age of each
   record against its threshold. Reported, never closed silently.

8. Config and schema: a `discovery` block naming the record and the two
   thresholds.

9. Affected tests as preverify, cross-provider verification, the full suite
   as the run of record, close-out.

**Releasable:** yes. This is framework code with no operator-specific data
in it; the record it writes is seat/key-set local and is regenerated, not
shipped.
