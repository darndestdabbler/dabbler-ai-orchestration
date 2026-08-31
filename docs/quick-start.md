# Quick start

Prerequisites: git, and the `dabbler` command.

Inside VS Code there is nothing to install: the Dabbler AI Orchestration
extension bundles the router and puts `dabbler` on the integrated
terminal's PATH, run on the editor's own Node. Everywhere else — another
editor, a bare shell, or a commit made from VS Code's Source Control panel,
whose git does not inherit the terminal's environment:

```
npm i -g dabbler-ai-router
```

Node 22.18 or newer; VS Code 1.135 or newer for the extension.

Then a way to reach models. Either a GitHub Copilot seat with the Copilot
CLI — the shipped default transport — or the direct provider APIs: put at
least two keys in env vars (`DABBLER_ANTHROPIC_API_KEY`,
`DABBLER_OPENAI_API_KEY`, `DABBLER_GEMINI_API_KEY`) — verification needs a
second provider — and select that path with `DABBLER_TRANSPORT=api`, or
`transport: profile: api` in a project-root `local-overrides.yaml` (see
below).

## 1. Bootstrap a project

From your project root:

```
dabbler bootstrap --project-dir .
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

Into a project with no session plan yet, it also scaffolds the two setup
sessions into `docs/sessions/session-plan.md`. Tell your AI agent to
**"start the next session"**: session 1 authors (or imports)
`docs/planning/project-plan.md` through the normal tracked pipeline
(register → work → cross-provider verification → close), and session 2
breaks that plan into the numbered sessions the rest of the repository
runs. Do not hand-author `sessions.json` — the first session start creates
it from the plan.

Prefer the untracked route? The same prompts are available loose:

```
dabbler bootstrap --print-plan-prompt
dabbler bootstrap --print-decomposition-prompt
```

## 2. Start a session

```
dabbler session start --engine <engine>
```

No command names a sessions root: there is one per repository and it is
derived from the working directory.
`--engine` is required (e.g. `claude-code`, `codex`, `copilot`,
`gemini`); `--provider`, `--model`, and `--effort` record the seat
identity (Copilot seats must pass `--model` — the seat label is not
trusted). The start registers the session in `sessions.json` and
seeds the spec's step list into `activity-log.json` once. It is
idempotent — safe to re-run after a context reset. It refuses to start
a session that is already in flight, re-open a completed one, or skip
ahead.

## 3. Work the steps

Follow the spec's step list for the current session: make the edits and
run the tests. **Do not commit yet** — verification reviews the working
tree, and an already-committed tree presents an empty diff.

There is nothing to log. The Work Explorer's task rows are the
lifecycle's six phases — *Register*, *Declare*, *Work*, *Verify*, *Run of
record*, *Close* — and each one is done the moment the verb that is that
phase writes its record: `session start` the first, `session declare`
the second, the pre-verification evidence record the third, a clean
`verify` round the fourth, the `final-full` record the fifth, and the
close the last. The open row is the first not done. No command moves a
row by hand, so a row that reads "in flight" is one whose record does not
exist yet, never one an engine forgot to tick.

### Executing an approved plan, one step at a time

When the session's work is pre-registered as an approved plan
(`.dabbler/runs/<set>/s<N>/approved-plan.json`), the steps are executed
through the framework rather than freehand. One step is in flight at a
time:

```
dabbler verify step open   --step <step_id>
dabbler verify step status
dabbler verify step close 
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
   dabbler verify step amend \
       --add-file <path> --reason "<why the declared envelope was wrong>"
   ```

2. **Is the deterministic evidence green?** The declared controls
   (`testing.controls`: compile, typecheck, lint, analyzer) and the tests
   the step's own changed paths select. A red required result comes back
   to you here, because an exit code has already settled what a verifier
   would be paid to notice.

**You do not commit while a step is open.** `dabbler bootstrap` installs a `pre-commit` hook that refuses a manual
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
dabbler verify
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

### If a blocking finding is contested: dispute → adjudicate

A finding you believe is wrong is not remediated by grinding rounds.
The ladder, in order — every refusal along the way prints the next
rung's exact command:

1. **Dispute** — rebut the finding on the record. Evidence is
   mandatory (at least one existing repo path, optionally with a line
   range as `path:START-END`); prose-only disputes are refused. The
   next round presents the rebuttal beside the finding and the
   verifier must UPHOLD it with reasons or WITHDRAW it.

   ```
   dabbler verify dispute \
       --round <R> --finding <F> --grounds "..." --evidence <path>
   ```

2. **Adjudicate** — at the round cap, with every blocking finding
   disputed, route the disputes to a third provider that neither
   orchestrated nor verified any round. It judges each dispute
   (UPHOLD or OVERRULE, with reasons; it may not raise new findings)
   and writes one terminal ledger row. All overruled → the session is
   clear to close; any upheld → the session is unresolved. One
   adjudication per session, ever; no verification round may open
   after it.

   ```
   dabbler verify adjudicate
   ```

There is no third rung, and no waiver: no verdict a person can type
exists anywhere in the loop. An undisputed session that reaches the cap
ends in one of two states the loop decides for itself — re-run the same
`verify` command and it records whichever the tree says it is:

- **Remediated at the cap** — every blocking finding of the last round
  was fixed (the tree has moved past the round that raised them) and the
  fix passed its own targeted tests, but the cap left it unreviewed. The
  work lands, labelled unreviewed, and the close gate says so.
- **Unresolved** — the tree has not moved, so nothing was remediated.
  Nothing lands but the record, and the close stays blocked.

Remediated-at-the-cap is not a waiver. A waiver accepted work over a
finding that still stood; here nothing stands, and what is unproved is
the repair rather than the complaint.

Then record the test run of record and commit/push the verified work:

```
dabbler test-evidence record \
    --suite <name> --outcome passed --duration-seconds <elapsed>
```

## 5. Close

```
dabbler session close
```

Five gates run: verification clean (reads the round ledger),
working tree clean, pushed to remote, test run fresh, verdict
vocabulary. All pass → the session flips state, and the close commits and
pushes its bookkeeping.

```
dabbler session close --dry-run
```

previews the gate rows read-only at any time. `--force` bypasses
bookkeeping gates only — never the evidence gates — and stamps
`forceClosed` in the state.

## Cancel and restore

```
dabbler session cancel <n> --reason "why"
dabbler session restore <n> [--reason "why"]
```

Cancel records the reason and the stamp on the session's own record and
preserves the status it had; restore returns that session — and only that
session — to it. `--force` cancels even with a session in flight.

## This repository's config (`dabbler.yaml`)

Tracked, at the project root, deep-merged over the packaged default. It
carries the three blocks a repository owns, behind a `schema_version`:

```yaml
# dabbler.yaml
schema_version: 1
testing:
  suites:
    - name: python
      command: python -m pytest
      covers: [src/, tests/]
      test_roots: [tests]
      test_glob: "test_*.py"
packaging: {}          # omit entirely if this repository publishes nothing
paths:
  sensitive_paths: []
```

- **Tracked, unlike the overlay below.** CI reads the suite command, the
  next machine reads the selection rules, and `dabbler affected`
  refuses to run without them.
- `test_roots` and `test_glob` belong to a **suite**, not the
  repository: one that is Java and .NET at once has two of each.
- Providers, models, roles and transports are not declarable here.
  `AI_ROUTER_CONFIG` is not the way round that — a named config takes
  no layer at all, so it forks the whole registry rather than adding
  to it.

## This machine's config (`local-overrides.yaml`)

The packaged `router-config.yaml` is the published default and
ships `transport: profile: copilot-cli`, because the seat is the surface
staff receive. A machine without a seat says so in a project-root
`local-overrides.yaml`, deep-merged over the packaged file:

```yaml
# local-overrides.yaml — provider API keys, no Copilot seat
transport:
  profile: api
```

- It is **never committed and never packaged**: `.gitignore` reserves
  the name and it is not listed as package data.
- It is **partial** — only the keys it changes. The merged result is
  validated against the same schema as any config, so an overlay cannot
  produce a config the router would have refused.
- A key the schema does not declare is **refused at load**, not
  ignored. An override the router silently drops is the failure this
  file exists to prevent.
- `testing`, `packaging` and `paths` are refused by name: they belong
  in `dabbler.yaml`. A suite command or a feed coming from a gitignored
  file would be attributed by the run of record to a repository that
  never declared it.
- It sits under `--transport` and `DABBLER_TRANSPORT` in the precedence
  order, so nothing that works today changes its answer.

An explicitly-named config — `--config`, or `AI_ROUTER_CONFIG` — takes
neither layer: a caller who named a file meant that file.

## Refreshing the seat catalog

On the `copilot-cli` transport, the packaged `copilot-catalog.lock` records
what this seat can dispatch: which models answered, on which CLI build,
and a one-call `probe_premium_requests` sample each. The CLI has no
`list-models` command and no provider field, so every value in it was
earned by a real billed call. Refresh it with:

```
dabbler copilot refresh [--quorum|--stale|--models a,b|--all] [--dry-run]
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
`dabbler seat-cost`.

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
AI Work Explorer view shows one row per repository in the window that
has a `docs/sessions/` ledger, its numbered sessions beneath it — `001`,
`002`, ... in ledger order, each with its status glyph — and, under the
in-flight session, its step rows. The tree is a pure renderer of

```
dabbler status --json
```

so what the extension shows is exactly what the gates read. A
repository whose projection cannot run shows no sessions and says so;
it never guesses a status from which files exist.

Row actions: the repository row opens the four sessions-root artifacts
(plan, activity log, change log, ledger), copies the start-next-session
prompt, and pre-types `session start` / `session close` into a
terminal. A session row opens the plan at its own section, and carries
cancel or restore — a cancellation is a decision about one session.
