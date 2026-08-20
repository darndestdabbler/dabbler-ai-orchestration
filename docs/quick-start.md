# Quick start

Prerequisites: Python 3.11+, git, `pip install dabbler-ai-router`, and at
least two provider API keys in env vars (`DABBLER_ANTHROPIC_API_KEY`,
`DABBLER_OPENAI_API_KEY`, `DABBLER_GEMINI_API_KEY`) — verification needs
a second provider. A GitHub Copilot seat with the Copilot CLI works as an
alternative transport (`DABBLER_TRANSPORT=copilot-cli`, or
`transport: profile: copilot-cli` in a project-root
`local-overrides.yaml` — see below).

## 1. Bootstrap a project

From your project root:

```
python -m ai_router.bootstrap --project-dir .
```

This writes a fenced managed block into `AGENTS.md`, `CLAUDE.md` and
`GEMINI.md`. `AGENTS.md` carries the body; the other two carry a
one-line `@AGENTS.md` import plus their engine tail, so the instructions
exist in exactly one place. All three are written because no single
engine reads all three: Codex and Copilot read `AGENTS.md`, Claude Code
reads only `CLAUDE.md`, and Gemini CLI reads only `GEMINI.md` unless its
`context.fileName` setting is changed — while Copilot reads every one of
them and de-duplicates nothing, which is why only one may hold the body.
Claude Code and Gemini CLI both expand `@file` imports at load time.
Existing files keep their user content; only the fenced section is
refreshed. Re-run the command any time to refresh it.

It also adds `.dabbler/` to the project's `.gitignore` (once; existing
rules are preserved). That directory is the router's machine-side
record — each verification round is written there *after* the tree
snapshot it describes, so a committed ledger would present itself to the
close gate as work done after verification.

Finally it settles the transport **once**, with no question asked: if a
GitHub Copilot seat is detected and you have no existing preference, it
persists `DABBLER_TRANSPORT=copilot-cli` at **user** scope (HKCU on
Windows, a marked block in `~/.profile` on POSIX) so every new shell and
reboot inherits it. `--machine-scope` asks for the machine hive instead
(HKLM, or `/etc/profile.d/dabbler-ai-router.sh`), which needs an elevated
terminal; when it cannot be honoured the write falls back to user scope
and says so rather than landing nowhere. An existing preference is never
overridden. Force it either way with `--transport api|copilot-cli`, or
leave it untouched with `--no-transport-detect`.

Into a project with no session sets yet, it also scaffolds the two
bootstrap sets — `001-default-plan` and `002-default-decomposition` —
as ordinary spec-only sets. Tell your AI agent to **"start the next
session"**: the plan set authors (or imports)
`docs/planning/project-plan.md` through the normal tracked pipeline
(register → work → cross-provider verification → close), and the
decomposition set then turns the plan into work sets
(`docs/session-sets/<NNN-slug>/spec.md`, numbered from 003). Do not
hand-author `session-state.json` — the first session start creates it
from the spec.

Prefer the untracked route? The same prompts are available loose:

```
python -m ai_router.bootstrap --print-plan-prompt
python -m ai_router.bootstrap --print-decomposition-prompt
```

## 2. Start a session

```
python -m ai_router.session start --session-set-dir docs/session-sets/<set> --engine <engine>
```

`--session-set-dir` accepts a directory, a slug, or a bare set number.
`--engine` is required (e.g. `claude-code`, `codex`, `copilot`,
`gemini`); `--provider`, `--model`, and `--effort` record the seat
identity (Copilot seats must pass `--model` — the seat label is not
trusted). The start registers the session in `session-state.json` and
seeds the spec's step list into `activity-log.json` once. It is
idempotent — safe to re-run after a context reset. It refuses to start
a session that is already in flight, re-open a completed one, or skip
ahead.

## 3. Work the steps

Follow the spec's step list for the current session: make the edits,
run the tests, log progress. **Do not commit yet** — verification
reviews the working tree, and an already-committed tree presents an
empty diff.

Log each step against the rows the start seeded:

```
python -m ai_router.session log --session-set-dir docs/session-sets/<set> \
    --step <stepKey|stepNumber> --status <pending|in-progress|complete|blocked>
```

`start` prints the addressable `stepKey`s; either the key or its number
resolves the same row. A step that resolves to nothing is **refused**
with the valid addresses printed — it never lands as an orphan row
nobody planned. Re-logging the same status is a noop, so the command is
safe to repeat after a context reset. `--note` records your own wording
instead of the spec's; `--session-number` addresses a session other than
the one in flight (with none in flight it defaults to the last closed
one, which is where a close-out step belongs).

### Executing an approved plan, one step at a time

When the session's work is pre-registered as an approved plan
(`.dabbler/runs/<set>/s<N>/approved-plan.json`), the steps are executed
through the framework rather than freehand. One step is in flight at a
time:

```
python -m ai_router.verify step open   --session-set-dir docs/session-sets/<set> --step <step_id>
python -m ai_router.verify step status --session-set-dir docs/session-sets/<set>
python -m ai_router.verify step close  --session-set-dir docs/session-sets/<set>
```

`open` anchors the step to the current `HEAD` and prints the paths it may
touch. `close` then asks two questions, both free and both before any
model is paid anything:

1. **Did the work stay inside the declared envelope?** Git says what
   changed, the plan says what was declared, and set difference decides —
   no model is asked whether you stayed inside your own plan. A path
   outside is **refused**, as an amendment requirement rather than a
   warning. Either move the change back, or carry the widening on the
   record, where it is re-reviewed against the risk the wider envelope
   earns:

   ```
   python -m ai_router.verify step amend --session-set-dir docs/session-sets/<set> \
       --add-file <path> --reason "<why the declared envelope was wrong>"
   ```

2. **Is the deterministic evidence green?** The declared controls
   (`testing.controls`: compile, typecheck, lint, analyzer) and the tests
   the step's own changed paths select. A red required result comes back
   to you here, because an exit code has already settled what a verifier
   would be paid to notice.

**You do not commit while a step is open.** `python -m
ai_router.bootstrap` installs a `pre-commit` hook that refuses a manual
commit while a step is open and names the command that closes it. The
binding check is not the hook — `--no-verify` bypasses any hook — but
`step close` itself, which refuses when `HEAD` has moved off the commit
the step opened on.

A closed step's work therefore stays in the working tree, and the next
step opens on the same commit and sees it. That is expected: each close
records a snapshot of the tree, and the next step's change set is
measured from that snapshot rather than from the commit — so a plan's
steps close in sequence with no commit between them, and touching an
earlier step's file again is still your open step's work, refused unless
your own envelope declares it. The session's work is committed once the
last step is closed, and pushing stays a session-boundary act: once, at
close.

## 4. Verify (mandatory, before commit)
```
python -m ai_router.verify --session-set-dir docs/session-sets/<set>
```

- **Round 1** sends the full evidence: spec excerpt, `git status`, the
  complete working-tree diff, untracked file contents.
- **Rounds ≥ 2** send only the fix delta (a diff from the previous
  round's recorded tree snapshot) plus the prior unresolved findings.
- The verifier is always a **different provider** than the
  orchestrator, on either transport; one retry excludes a failed
  provider.
- Each round appends one row to
  `.dabbler/runs/<set>/s<N>/rounds.jsonl` — machine-written only, never
  edit it — with the raw verifier output saved alongside.
- On blocking findings (`critical`/`major`): remediate, then re-run the
  same command. The loop suspends at the round cap
  (`verification.settings.max_rounds`, default 3; `--max-rounds`
  overrides).

### If a blocking finding is contested: dispute → adjudicate → waive

A finding you believe is wrong is not remediated by grinding rounds.
The ladder, in order — every refusal along the way prints the next
rung's exact command:

1. **Dispute** — rebut the finding on the record. Evidence is
   mandatory (at least one existing repo path, optionally with a line
   range as `path:START-END`); prose-only disputes are refused. The
   next round presents the rebuttal beside the finding and the
   verifier must UPHOLD it with reasons or WITHDRAW it.

   ```
   python -m ai_router.verify dispute --session-set-dir <set> \
       --round <R> --finding <F> --grounds "..." --evidence <path>
   ```

2. **Adjudicate** — at the round cap, with every blocking finding
   disputed, route the disputes to a third provider that neither
   orchestrated nor verified any round. It judges each dispute
   (UPHOLD or OVERRULE, with reasons; it may not raise new findings)
   and writes one terminal ledger row. All overruled → the session is
   clear to close; any upheld → still blocked. One adjudication per
   session, ever; no verification round may open after it.

   ```
   python -m ai_router.verify adjudicate --session-set-dir <set>
   ```

3. **Waive** — the operator's last exit, permitted only when the
   machine path is exhausted: the adjudication upheld a blocking
   finding, or adjudication is unavailable (no eligible third
   provider exists). Interactive-only — the attestation is typed at a
   prompt and the command refuses when stdin is not a TTY, so an
   engine cannot invoke it. WAIVED means the session closes
   **unverified** with the operator's attestation on the record; it
   never means "verified another way".

   ```
   python -m ai_router.verify waive --session-set-dir <set>
   ```

Then record the test run of record and commit/push the verified work:

```
python -m ai_router.test_evidence record --session-set-dir docs/session-sets/<set> \
    --suite <name> --outcome passed --duration-seconds <elapsed>
```

## 5. Close

```
python -m ai_router.session close --session-set-dir docs/session-sets/<set>
```

Five gates run: verification clean (reads the round ledger),
working tree clean, pushed to remote, test run fresh, verdict
vocabulary. All pass → the session (and, on the last session, the set)
flips state, and the close commits and pushes its bookkeeping.

```
python -m ai_router.session close --session-set-dir <set> --dry-run
```

previews the gate rows read-only at any time. `--force` bypasses
bookkeeping gates only — never the evidence gates — and stamps
`forceClosed` in the state.

## Cancel and restore

```
python -m ai_router.session cancel <set> --reason "why"
python -m ai_router.session restore <set> [--reason "why"]
```

Cancel records the reason in `CANCELLED.md` and preserves the
pre-cancel status; restore returns the set to it. `--force` cancels
even with a session in flight.

## This machine's config (`local-overrides.yaml`)

The packaged `ai_router/router-config.yaml` is the published default and
keeps `transport: profile: api`, which is right for a fresh install
holding provider API keys. A machine that disagrees says so in a
project-root `local-overrides.yaml`, deep-merged over the packaged file:

```yaml
# local-overrides.yaml — a Copilot seat, no provider API keys
transport:
  profile: copilot-cli
```

- It is **never committed and never packaged**: `.gitignore` reserves
  the name and it is not listed as package data.
- It is **partial** — only the keys it changes. The merged result is
  validated against the same schema as any config, so an overlay cannot
  produce a config the router would have refused.
- A key the schema does not declare is **refused at load**, not
  ignored. An override the router silently drops is the failure this
  file exists to prevent.
- It sits under `--transport` and `DABBLER_TRANSPORT` in the precedence
  order, so nothing that works today changes its answer.

An explicitly-named config — `--config`, or `AI_ROUTER_CONFIG` — takes
no overlay: a caller who named a file meant that file.

## Refreshing the seat catalog

On the `copilot-cli` transport, `ai_router/copilot-catalog.lock` records
what this seat can dispatch: which models answered, on which CLI build,
and a one-call `probe_premium_requests` sample each. The CLI has no
`list-models` command and no provider field, so every value in it was
earned by a real billed call. Refresh it with:

```
python -m ai_router.transports.copilot refresh [--quorum|--stale|--models a,b|--all] [--dry-run]
```

The scopes exist because cost is the design constraint — a refresh that
costs 39 premium requests to answer "did my seat survive the
auto-update?" is one nobody runs, and a lockfile whose only writer is
too expensive to run is a lockfile people edit by hand:

| Scope | Probes | Premium requests (this seat) |
|---|---|---|
| `--quorum` (default) | the cheapest confirmed model of each provider | **1.33** |
| `--models a,b` | the ids you name | their recorded samples |
| `--stale` | entries confirmed on some other CLI build, cheapest first | varies |
| `--all` | the whole declared candidate universe | **39** + entries never sampled |

The quorum is exactly enough to re-establish the ≥2-distinct-provider
invariant and re-date the CLI version. `--all` must be asked for by name.

Samples are what the seat reported for one call, and the seat reports
fractions for sub-premium models — `claude-haiku-4.5` measures 0.33.
They are observations, never prices: they fund the cost preview below
and never feed model selection. Real spend is measured afterwards by
`python -m ai_router.seat_cost`.

- **Priced before it spends.** Every run prints its projected cost from
  the samples already in the file, names entries of unknown cost as
  unknown (never zero), and asks for confirmation above the threshold.
  `--dry-run` prints the plan and probes nothing. Unattended runs
  without `--yes` fail closed rather than prompting into the void.
- **Merge, never clobber.** A run that probed three models rewrites
  those three; every other entry survives byte for byte, provenance
  included. A previously-confirmed entry whose probe fails today is not
  demoted — a transient CLI failure is not a withdrawn model — so the
  failure is recorded and the prior confirmation stands, visibly stale.
- **Reports a diff, not a success message**: entries confirmed, entries
  newly failing, samples that moved, the CLI version re-dated. An
  unchanged refresh says so.
- **Stamps what wrote it.** The writer records `written_by`,
  `written_at` and a `content_digest` over what it wrote. A later load
  whose contents disagree with that digest is reported as **hand-edited
  provenance**, in the same channel as version drift. Detection, not
  enforcement: you may still edit the file, but the record will say you
  did — and the values there are empirical or they are nothing.
- Adding a model is a **data edit** to `[meta].candidate_universe`
  followed by a probe. An id outside that array is refused before it can
  buy a premium request with a typo.

CLI version drift is a warning, not a refusal: the seat CLI auto-updates
on its own schedule. Every stale-catalog message names the exact refresh
invocation that resolves it.

## The Work Explorer (VS Code)

Install the extension VSIX
(`code --install-extension dabbler-ai-orchestration-1.0.0.vsix`). The
AI Work Explorer view lists every set under `docs/session-sets/` with
its sessions and, for the in-flight session, its step rows. The tree
is a pure renderer of

```
python -m ai_router.progress --json <set-dir>
```

so what the extension shows is exactly what the gates read. Tree
actions cover opening the four artifacts, copying session prompts,
starting/closing sessions in a terminal, new module scaffolding, and
cancel/restore.
