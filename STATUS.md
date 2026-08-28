# STATUS — set 148 closed: the session framework is built, and it closed its own last session

**Branch: `master`.** Trunk-based; nothing lives anywhere else.
`experiment/verification-pipeline-v3` and `design/solution-decomposition` are
merged and finished. Earlier handoff text is in `docs/status-archive.md`.

> **Draft, 2026-08-28.** Written after session 20 closed and before any
> session of the next set was registered. The acceptance evaluation below is
> read from the record; the next session should carry it into the decisions
> log through `session decision` so it is a recorded decision rather than a
> status paragraph.

## Where things are

- **Set 148 is complete: 20 of 20 sessions closed**, 2026-08-26 → 2026-08-28,
  all on `master`, all pushed. Sessions 1–14 were driven from the Copilot seat
  (claude-opus-5 orchestrator, gpt-5.4/5.5 verifier over `copilot-cli`);
  sessions 15–20 from Claude Code (claude-fable-5 orchestrator, gpt-5-6-sol
  verifier over the direct API).
- **Terminal states: 18 `VERIFIED`, 2 `REMEDIATED_AT_CAP`** (sessions 12 and
  17). The two cap sessions' final fixes are unreviewed by construction — see
  the D122 gap under *Owed*.
- **Router `dabbler-ai-router` 1.1.0** (tag `v1.1.0`); **extension 1.0.4**
  (tag `vsix-v1.0.4`). Session 13 built the packaging path; no packaging
  ledger exists in `.dabbler/runs/`, so nothing was published by the
  framework during this set.
- **Suite: 941 Python (6:26 at `-n 2`) / 153 TypeScript (0.4 s); `tsc
  --noEmit` and ESLint clean.** Python 29,286 lines over 45 modules;
  extension 5,035 lines of source, 3,102 of tests.
- **`verify.py` is 2,537 lines.** The 142–147 envelope wanted it under 1,200
  by extraction. The envelope is set aside per `docs/operator-decisions.md`,
  but the debt is real and grew during this set.

## Acceptance evaluation for set 148

The plan's criterion: **the framework can run its own next session** — could
session 20 have been specified, developed, verified, tested and closed by the
thing this set built rather than by the machinery it replaces?

**Session 20 was.** Registered and declared through `session start` /
`declare`; one targeted pre-verify run; one cross-provider round over the
API (`VERIFIED`, round 1, its own tree anchored as the first row under
`refs/dabbler/rounds/`); one `final-full` run of record at 10:05; five gates;
close committed and pushed by the router. No step ran through v1 machinery.

Three supporting checks, each answered from the record:

### 1. Every plan item appears exactly once — MET, with notes

| Plan item | Session(s) |
| --- | --- |
| A1 credential allowlist | 3 |
| A2 record authority | 4 |
| A3 collapse session sets | 14 |
| A4 the two files | 5 |
| A5 limited agency | 6 (read surface) + 7 (test-write path) |
| A6 selection by role | 8 |
| A7 model discovery | 9 |
| B1 code review loop | 10 |
| B2 verifier authors tests | 11 |
| B3 full suite, bounded fix loop | 12 |
| C packaging | 13 |
| D1 sessions view | 15 + 16 (task level) |
| D2 project setup | 18 (17 is its named precondition) |
| D3 unresolved-session view | 19 |

No item is built twice. Two items were split into halves by design (A5, D1);
session 17 is a precondition the plan did not list; sessions 1–2 verified the
design and the breakdown; **session 20 is outside the plan** — D103 promoted
the D98 root cause from an owed decision to a session. Spec sections 1–6, 8
and 9 map onto the sessions above; **§7 (cost) is built by reuse**
(`metrics.py`, `config.py` overlay, `secret_resolver.py`) exactly as the
plan's "already exists" table says, and §10 is the deliberately-not list. No
spec section is unbuilt.

### 2. No skipped lifecycle step, no foreign verdict — MET

Every session has a rounds ledger under `.dabbler/runs/s<N>/` ending in a
verdict from the verifier's vocabulary, at least one `final-full` run of
record inside its start–close window, and a `preverify-targeted` run — except
**session 2**, a prose session that changed no code, so the selector had
nothing to record. The only two rows with no verifier identity are the
framework-written cap-landing rows of sessions 12 and 17, which is what a
`REMEDIATED_AT_CAP` terminal row is.

### 3. Seat cost measured from session 3 onward — NOT MET

Measured and recorded for **four sessions only**: 1 (D38 — `costUsd: null`,
the metrics gap), 3 (D29, ~$22.48), 4 (D37, ~$8), 5 (D48, ~$10.61). Sessions
6–14 ran on the seat and recorded no measurement; sessions 15–20 ran on the
direct API and every `verification.costUsd` in `sessions.json` is `null`. The
step that owed this ("measure this session's seat cost and record it") was in
session 3's plan and was not carried into the later sessions' step lists.

**Consequence.** The next set can be planned only against the **$8–$12 per
ordinary code session** band D37 named from two samples and D48 confirmed
with a third. **The operator decided on 2026-08-28 not to back-fill** — the
sessions are closed and the figure would change nothing forward. What
carries forward is the step: every future session plan carries "measure
this session's seat cost" as a numbered step, which session 3's did and
sessions 4–20's did not.

## Owed, from the record

| Source | What is owed |
| --- | --- |
| **D122 gap** | No path by which a verifier reviews a remediated-at-the-cap fix. Sessions 12 and 17 ended that way, so their last fixes are unreviewed today. A review round against a closed session's fix delta, or a next-session round baselined on the remediation's `previous_tree`, is not planned. |
| **D116** | A targeted-run form for filter-style runners (Maven `-Dtest=`, `dotnet test --filter`) plus the audit rule that checks one. Until then a `runs_whole` suite pays its full suite at pre-verification. "A session, not a patch." |
| **D124** | Record the round cap on the round row as `verify.py` writes it; the unresolved-session view reads the live cap for a historical session. |
| **D126 nit 1** | `append_round` must refuse when the tree resolves and the anchor fails (`ledger.py`); otherwise a transient git failure recreates the unportable baseline session 20 removed. |
| **D114 nit 2** | `build_task_rows` renders a leaf, not a refusal, when `approved-plan.json` is missing while `step-execution.jsonl` carries an open step. |
| **D88** | Operator question: does the run core's projection replace the lifecycle's records, or is it retired? Two state systems coexist; `dabbler status` sees no runs in this repository. |
| **D119** | The solution level (one repository per library or service, plus an integrator) is not formalized. |
| Acceptance check 3 | The per-session seat-cost measurement step in every future session plan. Not back-filled for 148, by operator decision. |

## Carried from the archived handoff, status not re-verified

Three items from the pre-148 *Next* list were not touched by this set and
were not checked when this file was rewritten. Confirm or drop them:

- a round cap on `workflow review` (an unattended run keeps calling vendors);
- the Solution Explorer has not been screenshotted from a real VS Code;
- the CSV walkthrough is the wrong shape for a supervisor audience.

`.dabbler/runs/` is tracked now, so the archived "`.dabbler/` is git-ignored"
item is resolved.

## Next

Nothing is registered. Candidates, in the order the record argues for them:

1. **Record this evaluation as a decision** (session 21, step 2), closing
   the seat-cost question rather than leaving it owed.
2. **Fake the git seam in the loop tests.** The top 30 tests cost 3–11 s
   each and every second is process spawning (nine git calls in
   `sandbox_repo` before the loop starts). This is why `-n auto` cripples a
   host, and it is one Python session that pays off regardless of any other
   decision.
3. **D116** — the per-ecosystem targeted-command form.
4. **Operator decision pending:** whether the router is ported to TypeScript
   so the whole framework ships as one Marketplace artifact and the extension
   calls it in-process. Ground: the runtime is process spawning, file I/O,
   HTTP, JSON/YAML/TOML, hashing and one read-only SQLite query, all
   first-class in Node; the three Windows-specific items (`.cmd` shims,
   rendered-argv measurement, `node:sqlite` instead of a native binding) are
   bounded. If taken, it is its own set at a set boundary, tests first,
   transports last, with a parity harness over `.dabbler/runs/` output.
