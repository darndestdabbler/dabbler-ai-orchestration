# Quick start

Prerequisites: Python 3.11+, git, `pip install dabbler-ai-router`, and at
least two provider API keys in env vars (`DABBLER_ANTHROPIC_API_KEY`,
`DABBLER_OPENAI_API_KEY`, `DABBLER_GEMINI_API_KEY`) — verification needs
a second provider. A GitHub Copilot seat with the Copilot CLI works as an
alternative transport (`DABBLER_TRANSPORT=copilot-cli`).

## 1. Bootstrap a project

From your project root:

```
python -m ai_router.bootstrap --project-dir .
```

This writes a fenced managed block into `AGENTS.md` and `CLAUDE.md` —
the orchestrator instructions every engine reads (Claude Code reads
`CLAUDE.md`; Codex, Copilot, and Gemini read `AGENTS.md`; same body).
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
