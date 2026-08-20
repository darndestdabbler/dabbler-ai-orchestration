# Session Process Capture: 144-01

**Session under study:** `144-the-approved-plan`, session 1, "The artifact,
hashed and machine-owned"

This document reconstructs the process from the trace available in this
checkout. It does not treat the set specification as evidence that an action
occurred.

## 1. Input inventory

| Input | Availability | Use and limitation |
| --- | --- | --- |
| Session specification | Available: `docs/session-sets/144-the-approved-plan/spec.md` | Governing intent and planned steps. It does not establish execution. |
| Session state | Available: `docs/session-sets/144-the-approved-plan/session-state.json` | Supplies start/end times, asserted orchestrator identity, final verdict, transport, final verifier, and four recorded ledger rows. |
| Activity log | Available: `docs/session-sets/144-the-approved-plan/activity-log.json` | Supplies nine seeded session-1 rows and the completed registration row. It contains no session-1 completion rows for steps 2-9. |
| Change log | Available: `docs/session-sets/144-the-approved-plan/change-log.md` | Supplies the adjudication outcome, provider exclusions, disputed finding summary, and raw-run location. |
| Work commit | Available: `1fc6b6c6feeb528a80c1739ac1ef6ba222f7f539` | Supplies the final implementation/test delta, commit message, author time, test-count statement, and verification summary. It does not expose intermediate working trees. |
| Close commit | Available: `51b039afa8f4a8c52bfd0a8ceb609df01cee01ce` | Supplies the state transition commit and close time. |
| Agent instructions in force | Reconstructable at `1fc6b6c6^:AGENTS.md` | Supplies the required lifecycle: register, work, affected tests, verification, final full suite, commit/push, close. |
| Framework code in force | Reconstructable at parent `9b5b8e393cc9b4428b96371ab5efc735bdcba772` | Supplies pre-verification evidence refusal, three-round cap, dispute/adjudication rules, five close gates, and close commit/push behavior. |
| Session transcript | Missing. Local session-store searches by repository, set slug, and the session time window returned no rows. | Weakens actor-level reconstruction of implementation order, exact commands, reasons, intermediate findings, and remediation dialogue. |
| Raw verification outputs | Missing from this checkout. The cited `.dabbler/runs/144-the-approved-plan/s1/` directory is absent. | Weakens round-by-round finding and response reconstruction. |
| `rounds.jsonl` and `disputes.jsonl` | Missing with the run directory. | The row count and terminal result survive in state/change-log; exact timestamps, trees, findings, grounds, and costs do not. |
| `test-runs.jsonl` | Missing with the run directory. | Accepted targeted and final-full evidence can be inferred from executable gates, but commands, selected tests, durations, and digests are unavailable. |
| Session-1 `approved-plan.json` and write ledger | Not present in this checkout. | The trace does not show that session 144-01 was itself governed by the artifact it implemented. |
| v4 protocol document | Not present in the workspace or supplied as an attachment. | Protocol-to-trace comparison is limited to the set spec, `AGENTS.md`, and executable code. |
| Relevant extension/daemon trace | No daemon exists in the supplied tree; no extension file changed in the session commit. | No extension or daemon activity enters the catalog. |
| Incident-log entries | No incident-log artifact was found. | No incident-specific process element can be recorded. |

## 2. Session overview

- Goal: add a schema-validated, machine-written, approval-hashed plan and one authored slug identity for sessions and steps.
- Outcome: implementation committed in `1fc6b6c6`; session closed in `51b039af` with `VERIFIED` after terminal adjudication.
- Orchestrator: Copilot using asserted `claude-opus-5` / Anthropic identity.
- Review actors: OpenAI for the three capped verification rounds; `gpt-5.5` is identified for round 3; `gemini-3.1-pro-preview` / Google adjudicated.
- Measured trace: 02:08:38-03:17:34 EDT; three verification iterations plus one adjudication row; commit reports 30 new tests and a 476-to-506 count change.

## 3. Element catalog

The capture uses four constructs. An **activity** is one actor performing one
unit of work. A **decision** is an evaluated condition that selected an
observed alternative. A **loop** is a repeated group with an observed count
and exit. A **wait/handoff** transfers work or evidence between actors and
identifies what resumed the process.

### Activities

| ID | Name | Actor | Inputs consumed | Outputs produced | Provenance |
| --- | --- | --- | --- | --- | --- |
| A-01 | Register session 144-01 | Framework (`ai_router.session`), invoked under the Copilot session | Set spec; engine/provider/model declaration | In-progress session-state row; completed `register` activity row; start time `2026-08-20T02:08:38.236625-04:00` | `[observed]` `session-state.json`; `activity-log.json` |
| A-02 | Seed the session plan rows | Framework (`seed_session_plan`) | Session 1 ordered list in `spec.md` | Nine pending plan rows, including lifecycle rows | `[observed]` `activity-log.json`; governing parser at `1fc6b6c6^:ai_router/writers.py` |
| A-03 | Implement the approved-plan artifact | Copilot / `claude-opus-5` (asserted Anthropic identity) | Session-1 steps 2, 4, 5, and 6; pre-session code | `ai_router/approved_plan.py`; `ai_router/schemas/approved-plan.schema.json` | `[observed]` commit `1fc6b6c6`; actor identity in `session-state.json` |
| A-04 | Implement authored session and step slugs | Copilot / `claude-opus-5` | Session-1 step 3; existing session plan parser/writer | Slug parsing, malformed/duplicate refusal, authored-key seeding in `ai_router/session.py` and `ai_router/writers.py` | `[observed]` commit `1fc6b6c6` |
| A-05 | Add deterministic tests | Copilot / `claude-opus-5` | Implemented plan and slug behavior | `tests/test_approved_plan.py`; additions to `tests/test_session.py`; commit reports 30 new tests and 476 -> 506 | `[observed]` commit `1fc6b6c6` and its message |
| A-06 | Evaluate targeted evidence before dispatch | Framework `preverify_gate` | Current working tree; accepted `preverify-targeted` records; test-selection declarations | Gate acceptance for each of three dispatched rounds | `[inferred]` Each round could dispatch only after this executable check accepted evidence at `1fc6b6c6^:ai_router/verify.py`; the records and whether they were reused are missing. |
| A-07 | Review verification round 1 | OpenAI verifier; model not shown in surviving trace | Full session diff, spec excerpt, G0 facts, targeted evidence | Round-1 ledger row; verdict and findings unavailable | `[inferred]` Three ordinary rounds precede adjudication and the excluded-provider list includes OpenAI. `session-state.json`; `change-log.md`. |
| A-08 | Initiate verification round 2 | Copilot / `claude-opus-5` | Round-1 output and current tree | Second verification invocation | `[inferred]` Round 2 exists. The trace does not show whether the orchestrator changed code before invoking it. |
| A-09 | Review verification round 2 | OpenAI verifier; model not shown | Prior completion tree, current tree, prior findings | Round-2 ledger row; verdict and findings unavailable | `[inferred]` Three ordinary rounds precede adjudication and the excluded-provider list includes OpenAI. |
| A-10 | Initiate verification round 3 | Copilot / `claude-opus-5` | Round-2 output and current tree | Third verification invocation | `[inferred]` Round 3 exists. The trace does not show whether the orchestrator changed code before invoking it. |
| A-11 | Review verification round 3 | `gpt-5.5` / OpenAI | Round-2 completion tree, fix delta, prior findings | `ISSUES_FOUND`; one remaining finding about unclosed slug fallback; round cap reached | `[observed]` commit `1fc6b6c6` message; `change-log.md`; cap from governing verification code |
| A-12 | Implement the unclosed-slug refusal and regression test | Copilot / `claude-opus-5` | Round-3 finding 0 and/or earlier review feedback; exact trigger time unavailable | `_SLUG_OPEN_RE` refusal path and regression test in the final tree | `[observed]` final delta and commit `1fc6b6c6` message say the remaining finding was fixed before adjudication. The trace does not establish whether this code first existed before or after round 3. |
| A-13 | Record an evidence-backed dispute | Copilot / `claude-opus-5` | Round-3 finding 0; implemented `_SLUG_OPEN_RE` behavior; regression tests | Dispute row for round 3 finding 0 | `[observed]` `change-log.md` identifies the dispute and evidence subject. Exact grounds and citations are unavailable. |
| A-14 | Adjudicate the dispute | `gemini-3.1-pro-preview` / Google over `copilot-cli` | Round-3 finding, dispute, cited evidence, current fix delta | Terminal adjudication row; finding 0 `OVERRULED`; session verdict `VERIFIED` | `[observed]` `change-log.md`; `session-state.json` |
| A-15 | Run and record the full suite | Framework test recorder, invoked by the orchestrator | Final adjudicated tree; configured full-suite command | Passing `final-full` test evidence bound to the final tree | `[inferred]` `test_run_fresh` had to pass for close, and only `final-full` records satisfy it in `1fc6b6c6^:ai_router/test_evidence.py`. Command, count, and duration are missing. |
| A-16 | Commit the verified work | Git author `adm.dennis.mitchell`; commit co-authors Copilot | Final code, tests, and session artifacts | Work commit `1fc6b6c6feeb528a80c1739ac1ef6ba222f7f539` at `2026-08-20T03:17:11-04:00` | `[observed]` commit `1fc6b6c6` |
| A-17 | Push the work commit | Git client, invoked during the session | Work commit `1fc6b6c6`; tracked experiment branch | Work commit present on `origin/experiment/verification-pipeline-v3` before close | `[inferred]` `pushed_to_remote` had to pass before `session close`; remote branch contains the commit. |
| A-18 | Evaluate the five close gates | Framework (`ai_router.gates`) | Adjudication row, tree snapshot, git status/upstream, final-full evidence, verdict token | Five passing gate results | `[inferred]` Close commit exists; `session.close` refuses and does not flip state when any gate fails. |
| A-19 | Close, commit, and push session state | Framework (`ai_router.session close`) | Passing gates; terminal `VERIFIED` row | Session status `complete`; close commit `51b039afa8f4a8c52bfd0a8ceb609df01cee01ce` at `2026-08-20T03:17:34-04:00`; pushed branch | `[observed]` close commit and `session-state.json`; push is `[inferred]` from close implementation and remote containment. |

The trace does not establish the internal chronological order of A-03, A-04,
and A-05. They first become jointly visible in one work commit.

### Decisions

| ID | Name | Actor/evaluator | Condition and information actually evaluated | Observed result and alternatives | Provenance |
| --- | --- | --- | --- | --- | --- |
| D-01 | Admit each verification dispatch | Framework `preverify_gate` | Whether accepted targeted evidence matched the current tree and whether deterministic red facts existed | Admitted all three dispatched rounds. Alternatives: refuse for missing/stale/violating evidence, or return red facts before model spend. | `[inferred]` Three model rounds exist; governing `verify.py` checks these conditions before dispatch. |
| D-02 | Apply the round cap | Framework | Latest ordinary round number `3`, configured cap `3`, latest row blocking | Ordinary round 4 refused; dispute/adjudication exit used. Alternatives named by code: close if no blocking finding, dispute, then adjudicate. | `[observed]` commit `1fc6b6c6` says cap reached at 3; governing `verify.py`. |
| D-03 | Contest round-3 finding 0 | Copilot / `claude-opus-5` | Finding claimed unclosed slug fallback persisted; tree contained `_SLUG_OPEN_RE` refusal and regression tests | Dispute recorded. Alternative available in governing process: accept/remediate rather than dispute; the trace does not show why dispute was selected. | `[observed]` `change-log.md`; alternatives from governing `verify.py`. |
| D-04 | Judge disputed finding 0 | `gemini-3.1-pro-preview` / Google | Stored finding, dispute, cited evidence, fix delta | `OVERRULED`; all disputed findings overruled; terminal `VERIFIED`. Alternative: `UPHELD`, which would have left close blocked. | `[observed]` `change-log.md`; `session-state.json` |
| D-05 | Permit close | Framework, five gate predicates | Verification clean, tree clean, pushed, test run fresh, verdict vocabulary valid | All passed; state flipped. Alternative: any failed row refuses close. | `[inferred]` close commit exists and governing `session.close` cannot produce it after failed gates. |

### Loops

| ID | Name | Actor(s) | Inputs/outputs | Iterations and actual exit | Provenance |
| --- | --- | --- | --- | --- | --- |
| L-01 | Verification loop | OpenAI verifier, Copilot orchestrator, framework | Full diff on iteration 1; tree-to-tree deltas and prior findings thereafter; targeted-evidence gate before dispatch | Three ordinary iterations. The outcomes and findings of iterations 1 and 2 are unavailable. Iteration 3 was blocking. Exit was the configured round cap followed by dispute/adjudication, not an ordinary non-blocking round. | `[observed]` `session-state.json` records four rows total and terminal Google adjudication; commit `1fc6b6c6` states round-3 `ISSUES_FOUND` and cap. |

### Waits and handoffs

| ID | Name | What paused | What resumed it | Provenance |
| --- | --- | --- | --- | --- |
| W-01 | Orchestrator-to-verifier handoff | Local orchestration paused with a rendered review request | OpenAI verifier response resumed framework parsing; occurred three times | `[inferred]` Three ordinary verification rows and cross-provider exclusion rules. |
| W-02 | Verifier-to-orchestrator handoff | Verification invocation paused for a response | Copilot received the result and later initiated the next invocation; occurred after all three rounds | `[inferred]` Three ordinary rounds and a later dispute exist. The trace does not expose the first two responses or intervening actions. |
| W-03 | Dispute-to-adjudicator handoff | Capped session could not open another ordinary round | Google adjudicator returned one judgment | `[observed]` `change-log.md`; `session-state.json` |
| W-04 | Adjudication-to-close handoff | Close remained blocked while the latest row was blocking | Terminal all-overruled adjudication row made verification clean | `[inferred]` Governing gate reads the latest ledger row; close followed adjudication. |
| W-05 | Push-to-close handoff | Close gate could not pass while the work commit was ahead of upstream | Work commit became present upstream | `[inferred]` `pushed_to_remote` semantics and successful close. |

## 4. Control-flow trace

Canonical as-run sequence:

```text
A-01 -> A-02
  -> {A-03, A-04, A-05; internal order not recoverable}
  -> A-06
    -> L-01 iteration 1:
      W-01 -> A-07 -> W-02 -> A-08 -> A-06
    -> L-01 iteration 2:
      W-01 -> A-09 -> W-02 -> A-10 -> A-06
    -> L-01 iteration 3:
      W-01 -> A-11 -> W-02
    -> A-12 (known before adjudication; exact placement relative to round 3
      is not recoverable)
    -> D-02(cap reached) -> D-03(dispute) -> A-13 -> W-03
    -> A-14 -> D-04(overruled) -> W-04
    -> A-15 -> A-16 -> A-17 -> W-05
    -> A-18 -> D-05(pass) -> A-19
```

The trace does not show whether additional targeted tests ran during A-03 to
A-05 before the three records required by A-06.

## 5. Artifact registry

| Artifact | Producer | Consumers | Format and location | Provenance |
| --- | --- | --- | --- | --- |
| Session specification | Pre-session authoring | A-01, A-02, A-03, A-04, verifier prompt construction | Markdown: `docs/session-sets/144-the-approved-plan/spec.md` | `[observed]` file and governing code |
| Agent instructions | Bootstrap/prior repository work | Copilot orchestrator | Markdown reconstructed as `1fc6b6c6^:AGENTS.md` | `[observed]` Git object |
| Session state, in progress then complete | A-01; A-14; A-19 | Verification, gates, projection, close | JSON: `docs/session-sets/144-the-approved-plan/session-state.json` | `[observed]` file and commits `1fc6b6c6`, `51b039af` |
| Activity log | A-02 and A-01 | Progress projection and human readers | JSON: `docs/session-sets/144-the-approved-plan/activity-log.json` | `[observed]` file |
| Approved-plan implementation | A-03 | Tests and future sessions | Python: `ai_router/approved_plan.py` | `[observed]` commit `1fc6b6c6` |
| Approved-plan schema | A-03 | `approved_plan._validate_schema`; tests | JSON Schema: `ai_router/schemas/approved-plan.schema.json` | `[observed]` commit `1fc6b6c6` |
| Slug parser/writer changes | A-04 | Plan parsing, plan-row seeding, tests | Python: `ai_router/session.py`, `ai_router/writers.py` | `[observed]` commit `1fc6b6c6` |
| Approved-plan tests | A-05 | Targeted/full test runners | Python/pytest: `tests/test_approved_plan.py` | `[observed]` commit `1fc6b6c6` |
| Session parser/writer tests | A-05 | Targeted/full test runners | Python/pytest additions: `tests/test_session.py` | `[observed]` commit `1fc6b6c6` |
| Targeted test records | A-06 | D-01, G0 facts | JSONL: `.dabbler/runs/144-the-approved-plan/test-runs.jsonl` | `[inferred]` required by executable preverify gate; file absent in this checkout |
| Ordinary verification rounds | A-07, A-09, A-11 | Later rounds, D-04, A-13, gates | JSONL: `.dabbler/runs/144-the-approved-plan/s1/rounds.jsonl` | `[inferred]` exact rows absent; row count/outcome survives in state and summaries |
| Raw verifier outputs | A-07, A-09, A-11 | Operator/orchestrator, later reconstruction | Markdown under `.dabbler/runs/144-the-approved-plan/s1/` | `[inferred]` governing writer and change-log link; files absent |
| Dispute record | A-13 | A-14 | JSONL: `.dabbler/runs/144-the-approved-plan/s1/disputes.jsonl` | `[inferred]` required adjudication precondition; summary observed in `change-log.md` |
| Adjudication output and row | A-14 | D-04, A-18, A-19 | Raw Markdown plus terminal row in session run directory | `[inferred]` files absent; result observed in state/change-log |
| Final-full test record | A-15 | `test_run_fresh` in A-18 | JSONL: `.dabbler/runs/144-the-approved-plan/test-runs.jsonl` | `[inferred]` successful close under governing gate; file absent |
| Change-log adjudication block | A-14 | Human readers | Markdown: `docs/session-sets/144-the-approved-plan/change-log.md` | `[observed]` file and commit `1fc6b6c6` |
| Work commit | A-16 | Remote branch, close gates, later sets | Git commit `1fc6b6c6` | `[observed]` Git history |
| Close commit | A-19 | Remote branch, later sessions | Git commit `51b039af` | `[observed]` Git history |

## 6. Divergence ledger

Classifications below are suggestions; the operator retains the decision.

| ID | Governing specification/code | As-run trace | Suggested classification |
| --- | --- | --- | --- |
| V-01 | The set header names child branch `verification-v3/set-144-approved-plan` (`spec.md`). | Commits `1fc6b6c6` and `51b039af` are contained by `origin/experiment/verification-pipeline-v3`; no supplied trace shows the named child branch. | `divergence` |
| V-02 | Session 1 declares steps 2-9, and the instructions in `AGENTS.md` require progress logging. `session log` resolves and records seeded steps. | `activity-log.json` contains only the completed session-1 registration row; steps 2-9 remain represented only by their initial pending rows even though implementation, verification, full testing, and close occurred. | `divergence` |
| V-03 | Session 1 estimates eight Python tests (`spec.md`). | Commit `1fc6b6c6` reports 30 new Python tests and a 476 -> 506 count change. | `divergence` |
| V-04 | The ordinary verification cap is three; adjudication is a separate terminal row (`1fc6b6c6^:ai_router/verify.py`, rounds schema). | `session-state.json` reports `verification.rounds: 4` and the final verifier as Gemini, while the work commit says the round cap was reached at 3. | `ambiguous`: the field appears to count ledger rows, not ordinary verification rounds, but its name does not state that distinction. |
| V-05 | Adjudication code records `UPHELD` or `OVERRULED` outcomes for findings; the change log says the disputed finding was `OVERRULED`. | Commit `1fc6b6c6` says the fix was upheld and Google "OVERRULED the dispute." | `ambiguous`: the commit wording reverses the grammatical object while the terminal `VERIFIED` outcome indicates the finding was overruled. |
| V-06 | The set's purpose is proof locked before code, but Session 1 explicitly creates the artifact and Set 144 says execution comes later in Set 145. | No session-1 `approved-plan.json` or write ledger is supplied, and the implementation did not exist at session start. | `unspecified`: the session that built the mechanism is not shown self-hosting it. |

## 7. Construct glossary and inventory

| Construct | Definition used here | Count |
| --- | --- | ---: |
| Activity (`A-*`) | One named actor performing one unit of work with identifiable inputs and outputs. | 19 |
| Decision (`D-*`) | An actor or executable predicate evaluating trace-visible information and selecting an observed alternative. | 5 |
| Loop (`L-*`) | A repeated group with an observed iteration count and actual exit condition. | 1 |
| Wait/handoff (`W-*`) | A transfer after which one actor or process paused until another supplied work, evidence, or state. | 5 |

## 8. Coverage notes

### Documented regions not exercised or not demonstrably exercised

- `[observed]` Plan review, auto-bounce, premium escalation, and amendment
  handling belong to Sessions 2 and 3, not 144-01 (`spec.md`, Sessions 2-3).
- `[observed]` Step execution, envelope enforcement, and framework-owned
  per-step commits are explicitly deferred to Set 145 (`spec.md`, "No
  execution").
- `[observed]` No waiver path was used; adjudication overruled every disputed
  finding (`change-log.md`).
- `[observed]` No no-candidate or transport-unavailable path appears in the
  surviving state or summaries.
- `[observed]` No approved-plan amendment is visible; amendment behavior was
  only implemented later in 144-03.
- `[observed]` The supplied trace does not demonstrate that an actual
  `approved-plan.json` governed 144-01.

### Trace regions not explainable by a supplied document or code artifact

- `[observed]` The exact findings and remediation changes in rounds 1 and 2
  are absent with the raw run directory.
- `[observed]` The exact text, evidence paths, and filing time of the round-3
  dispute are absent.
- `[observed]` The targeted and full-suite commands, selected tests,
  durations, and tree digests are absent with `test-runs.jsonl`.
- `[observed]` The reason session-1 implementation steps were not logged is
  not present in any supplied artifact.
- `[observed]` The reason the test count grew by 30 against an estimate of 8
  is not narrated in a session-1 artifact.
- `[observed]` The transcript-level division of labor between the asserted
  orchestrator and the Git author is not available.

## 9. Open questions

1. What were the exact findings, severities, evidence paths, models, and
   timestamps in ordinary rounds 1-3? Answerable from
   `.dabbler/runs/144-the-approved-plan/s1/rounds.jsonl` and the three raw
   verifier-output files from the execution machine.
2. What exact changes followed rounds 1 and 2? Answerable from the session
   transcript or checkpoints containing the pre-round tree snapshots.
3. What grounds and citations supported the round-3 dispute? Answerable from
   `.dabbler/runs/144-the-approved-plan/s1/disputes.jsonl`.
4. Which targeted tests ran before each round, with what durations and tree
   digests? Answerable from `.dabbler/runs/144-the-approved-plan/test-runs.jsonl`.
5. What full-suite command and result formed the run of record? Answerable
   from the same `test-runs.jsonl` and terminal transcript.
6. Was an `approved-plan.json` created for session 144-01 after the writer
   existed, or was the session governed only by its spec? Answerable from the
   execution machine's `.dabbler/runs/144-the-approved-plan/s1/` directory.
7. Why were session-1 steps 2-9 never logged complete? Answerable by the
   session transcript or an operator statement.
8. Was work performed directly on the experiment branch by explicit operator
   authorization despite the set header naming a child branch? Answerable by
   the operator or a transcript turn carrying that authorization.
9. Is `verification.rounds` intended to count adjudication rows as rounds?
   Answerable by the owner of the session-state projection contract.
