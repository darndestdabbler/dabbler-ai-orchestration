# The parity control for the TypeScript port

> Designed in session 22 of `docs/sessions/session-plan.md`; built in session
> 23; run before every verification round of sessions 23–35; retired in
> session 35 at the step that deletes the Python router. The decision that
> names this document is in `docs/sessions/decisions-log.md`.

## What it is, and what it is not

The port is correct when the TypeScript router, given the same repository
and the same verb, writes **the same bytes** the Python router writes —
to the record, and for a read-only verb to stdout — and exits with the
same code. This document specifies the check that says so.

It is a **declared deterministic control** — a `testing.controls` entry in
`dabbler.yaml` with kind `analyzer` and `required: true`. `ai_router.facts`
runs declared controls before a verification round and records each one's
exit code in `.dabbler/runs/deterministic-facts.jsonl` under the closed
vocabulary `pass` / `fail` / `not_applicable` / `unknown`. A red required
control returns the change to its author before a verifier is bought.

It is not a test: a test of test infrastructure is a banned kind, and this
check proves nothing about either router alone. It is not a verifier's
judgment: a verifier cannot read 29,000 lines for drift, and the control's
answer is an exit code, not an opinion. It keeps **no golden files**: both
outputs are computed at run time from the same input, so there is nothing
checked in that could go stale or be hand-edited.

## Where it runs

- Declared once, in session 23, beside `tsc --noEmit` (kind `typecheck`)
  and ESLint (kind `lint`) — the first controls this repository declares.
- Runs on every `python -m ai_router.verify` from then on, through `facts`.
- Runs by hand as `npm run parity` (workspace root) with the same script and
  the same exit codes, so a session sees drift before it asks for a round.
- Runs on the same machine and OS for both routers. **Cross-OS parity is not
  claimed**; path separators and line endings are whatever this host's git
  and this host's Python produce, and the TypeScript side is held to that.
- Python stays installed in `.venv` until session 35 so the Python side can
  always be run. The control refuses (`unknown`, not `pass`) if either
  router cannot be executed.

## The corpus: one repository per lifecycle shape

Each shape is a real git repository with a real bare remote, built fresh at
every run into a temporary directory by a builder script that drives the
**Python** router — the reference implementation — from the same seed the
test suite already uses (`tests/conftest.py`, `_sandbox_template`: a seeded
working repository plus a bare `origin`, git configuration pinned for the
process). Nothing under the corpus is checked in as output.

> **Amended in session 23, as built.** A shape is built only when an active
> verb needs it, and its builder lands in the session that first needs it —
> the same rule the verbs follow, applied to the fixtures they run against.
> `fresh` and `in-flight` are built (they buy no model call, and session 23
> proved both end to end); `disputed`, `at-cap` and `moved-machine` need
> canned verifier text through the offline transport and land with the verbs
> that read them. A shape whose builder is missing stops the control at
> "could not run" (exit 2), never at a pass. `npm run parity -- --build
> <shape>` builds one by hand, and `npm run parity -- --self-check <shape>`
> builds it twice and compares the two copies — a builder that fails that is
> non-deterministic, and every parity run it fed would be flaky for a reason
> no diff would explain.

| Shape | What the builder does | What it exercises |
| --- | --- | --- |
| **fresh** | A repository with `dabbler.yaml`, a two-session plan, no `sessions.json`, no `.dabbler/runs/`. | Registration from nothing: the first state write, the plan seeding, the first activity-log entries. |
| **in-flight** | Session 1 started and declared; one source file edited; the selector run; a `preverify-targeted` row recorded. | The ordinary middle of a session: `affected`, `test_evidence record`, the declaration, `progress`. |
| **disputed** | Session 1 taken through round 1 with a canned `ISSUES_FOUND`; one finding disputed with a file-backed rebuttal; round 2 with a canned `WITHDRAWN`. | `rounds.jsonl`, `disputes.jsonl`, the verifier-output files, the fix-delta baseline, the round anchors. |
| **at-cap** | Session 1 taken to `max_rounds` with canned blocking findings and a remediation before the last round. | The two terminal states (`REMEDIATED_AT_CAP` / unresolved), the cap-landing row the framework writes without a verifier identity. |
| **moved-machine** | The disputed shape cloned through `origin` **without** the round refspec — an unmigrated clone — so `refs/dabbler/rounds/*` and the trees they anchor are absent from the clone's store; plus a second copy of that clone after `git fetch origin '+refs/dabbler/rounds/*:refs/dabbler/rounds/*'`, which brings the anchor commits and, with them, their trees. | On the unfetched copy: the missing-baseline message and the fetch it prints, `verify reanchor` and its refusals (only the last commit at or before the round is legal). On the fetched copy: `effective_baseline` resolving through the anchor, and `ledger.append_round`'s anchoring of the next round. |

The builder is deterministic: git author and committer identity and dates
are pinned through the environment, and the verifier is the **offline
transport** (`transports/offline`, ported in session 28) fed canned verifier
text from the corpus, so both routers see byte-identical verifier output.
Until session 28 the corpus drives only the verbs that buy no model call.

## The verbs

Every verb is run twice against two copies of the same shape — once by
`python -m ai_router.<module> …`, once by `dabbler <verb> …` — and the two
copies are compared afterwards. The list is the union of what the extension
spawns and what an engine runs by hand. Each verb enters the control in the
session that ports its module and stays in it for every later session.

| Verb | Shapes | Enters in session |
| --- | --- | --- |
| `session start` / `declare` / `log` / `decision` | fresh, in-flight | 26 (writers), full from 30 |
| `progress`, `progress --json` | all | 30 |
| `modules` (list / create / retire) | fresh | 30 |
| `affected` | in-flight | 27 |
| `test_evidence record` (both stages) | in-flight | 27 |
| `verify` (offline transport), `verify dispute`, `verify adjudicate` | disputed, at-cap | 32 |
| `verify reanchor` | moved-machine | 32 |
| `ledger` reads (`latest_round`, the unresolved view) | disputed, at-cap | 26 |
| `approved_plan`, `plan_review` | in-flight | 31 |
| `session close --dry-run`, `session close`, `cancel`, `restore` | all | 30 |
| `bootstrap` | fresh | 33 |
| `packaging --dry-run` | in-flight | 33 |
| `discovery` (lock-file read and write from a canned catalog; no enumeration) | fresh | 28 |
| `seat_cost` against a fixture `session-store.db` | — (no repository) | 29 |
| `workflow` (the six-step driver, offline) | in-flight | 34 |

`discovery enumerate` is excluded: it needs the network and its answer is
not a function of the repository.

## The files compared

After both runs, the control walks the **union** of paths under each copy
that the router is allowed to write, and compares each path byte-for-byte
after the two normalizations below. A path present in one copy and absent
from the other is drift.

Compared:

- `docs/sessions/`: `sessions.json`, `activity-log.json`,
  `decisions-log.md`, `project-work-plan.md`, `change-log.md`.
- `.dabbler/runs/`: `state-writes.jsonl`, `test-runs.jsonl`,
  `deterministic-facts.jsonl`, and under `s<N>/`: `rounds.jsonl`,
  `disputes.jsonl`, `round-<R>-verifier-output.md`,
  `baseline-reanchors.jsonl`, `step-execution.jsonl`, `audits.jsonl`,
  `packaging.jsonl`, `approved-plan.json`, `approved-plan-writes.jsonl`,
  `plan-review.jsonl`.
- `copilot-catalog.lock`.
- What `bootstrap` writes: the `AGENTS.md` / `CLAUDE.md` / `GEMINI.md`
  fence, the pre-commit hook, `.gitignore`.
- The six-step workflow's `events.jsonl` and `projection.json` (from
  session 34).
- **The round anchors**: for every `refs/dabbler/rounds/s<N>/r<R>` the
  control compares the **tree** the anchored commit points at, and requires
  it to equal the row's `completion_tree` on both sides. The commit id
  itself is not compared (see normalization 1).
- **Every verb's exit code.** A verb that refuses on one side and succeeds
  on the other is drift even when no file differs.
- **The stdout and the stderr of every invocation**, after the same two
  normalizations. Not a list of which verbs' output counts: everything a
  verb emits is compared, on every verb.

  > **Amended in session 23**, taking D137's carried nit. The design named
  > read-only verbs' stdout (`progress`, the `ledger` reads, `session close
  > --dry-run`, `packaging --dry-run`, `affected`, `seat_cost`) and the
  > stderr of selected refusals. A verifier observed in session 22 that
  > "compare everything a verb emits" is both simpler and stricter than a
  > list — and a list is a thing to forget to add to. It is the rule as
  > built. The reasoning behind the old list still holds and is why the
  > rule matters: for a read-only verb the output *is* the record, and a
  > refusal's wording is what the operator reads.

Excluded, and why:

- `router-metrics.jsonl` — gitignored per-call telemetry carrying elapsed
  seconds; it is not the record.
- `.lifecycle.lock`, `journal.lock` — transient.
- The run core's `journal.jsonl`, `heartbeat.json`, `run-projection.json` —
  retired, never ported (D88, decided in session 22).

## The two normalizations — and no third

Both outputs pass through the same two rewrites before comparison. They are
defined by the **shape of a value**, not by a list of field names, so a new
field cannot silently escape them.

1. **Timestamps.** Any ISO-8601 date or date-time string (with or without
   offset or microseconds) is replaced by `<ts>`. This covers `startedAt`,
   `recordedAt`, `dateTime`, `decidedOn`, the date in a decision heading,
   and the git dates inside an anchor commit — which is why anchor commits
   are compared by tree and not by id.
2. **Absolute paths.** Each copy's root directory, in both native and
   forward-slash spellings, is replaced by `<root>`. Repo-relative paths are
   left alone; they must match exactly.

Anything else that differs is drift, including key order in JSON,
whitespace, trailing newlines, float formatting, list order, and the
ordinal of a decision. That strictness is the point: the record is what a
reader diffs across sessions, and two routers that serialize the same facts
differently would make every future diff lie.

> **Amended in session 23, found by running it.** There is a place
> normalization 1 cannot reach as text: a **digest over content that
> carries a timestamp**. `.dabbler/runs/state-writes.jsonl` is one row per
> sanctioned write of `sessions.json`, each row the sha256 of that file's
> bytes — and `sessions.json` carries `startedAt`, so two runs can never
> agree on the digest even though the file it covers compares equal a
> directory away. The first self-check of the `in-flight` shape failed on
> exactly this. Such a ledger is therefore compared by **row count and row
> shape**: its `sha256:<hex>` values become `sha256:<digest>`, and what is
> proved is how many sanctioned writes happened and in what order, which is
> everything the ledger says that its payload does not.
>
> This is normalization 1 reaching a value it cannot reach as text — the
> same concession already made for a git commit id, compared by tree
> because a commit differs only through its dates. It is **not** a third
> rule and is not licence for one: a digest over content with no timestamp
> in it — every tree hash in the record, `completion_tree` included — is
> compared exactly, and a new digest ledger has to name itself here.

## Output and exit codes

- `0` — every compared path identical after normalization; a one-line
  summary names the shapes, verbs and path count.
- `1` — drift; stdout carries a unified diff of every differing path (after
  normalization), the shape and verb that produced it, and nothing else.
- `2` — the control could not run (a router missing, a builder failure);
  `facts` records `unknown`, never `pass`.

## Sequencing rules

- **Port order is the control's growth order.** A verb enters when its
  module is ported; nothing is compared before its TypeScript side exists,
  and nothing is dropped once it has entered.
- **The one legitimate break.** Session 35 adds `frameworkVersion` to
  session and round rows — the set's single record change. The control is
  run and recorded once more *before* that change and the Python deletion,
  and retired in the same step; it is never made to pass across the stamp.
- **A behaviour change is not a fix.** If the control fails and the honest
  repair is to change the Python side, that is a redesign, which this set
  forbids; the TypeScript side is the one that moves. The one exception is
  a Python defect found by the port, which is recorded as a decision and
  fixed on the Python side first, in its own commit, so the parity run that
  follows compares two routers with the same intended behaviour.
