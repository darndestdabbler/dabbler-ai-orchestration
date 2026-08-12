# The verify-type environment-variable setup gap

> **Status: FIXED by Set 126** (`docs/session-sets/126-verify-type-setup-finishes-itself/`).
> Defect 2 closed in Session 1 (the half-finished state is reported);
> defects 3 and 1 closed in Session 2 (the `--set-env` helper ships, and
> every instruction that told the operator to persist the variable by hand
> was corrected). The diagnosis below is preserved unedited as the record
> of what was wrong and why the design took the shape it did — see
> **How it was fixed** at the end for what is true now.
>
> Operator-requested durable note, 2026-08-12, raised during Set 124
> Session 2 and deliberately deferred so a full pytest run of record and a
> verification stamp were not invalidated mid-session.
>
> **Origin:** the operator asked *"should we go ahead and set my ENVIRONMENT
> VARIABLE for COPILOT_CLI? ... Or is that already handled by the extension?"*
> It was not handled, by the extension or anything else.

## The gap

`python -m ai_router.verify_type --set <VALUE>` writes
`project-verify-type.txt` and **nothing else**. Setting
`AI_ORCHESTRATION_VERIFY_TYPE` is a manual step the human is told to perform.

Verified 2026-08-12: there is no `setx`, no
`SetEnvironmentVariable`, and no other writer of that variable anywhere in
`ai_router/` or `tools/dabbler-ai-orchestration/src/`. The variable is only
ever **read** (`os.environ.get(ENV_VAR)`). Set 123 S3 retired the setup
webview, so the extension contributes no setup surface either.

That leaves the design's own bar half-automated. From
`guided_setup_instructions()`:

> Setup is finished when BOTH `$AI_ORCHESTRATION_VERIFY_TYPE` is set and
> `project-verify-type.txt` exists carrying the same value.

One half is a command. The other half is a sentence.

## Three defects, smallest first

### 1. The printed instruction does not persist on Windows

Step 2 of the guided setup prints:

```
2. set AI_ORCHESTRATION_VERIFY_TYPE=<VALUE> in this machine's user environment
```

Read as prose it is fine. Copy-pasted — which is what a setup instruction
invites — `set` is **process-scoped** on Windows and evaporates when the
terminal closes. The operator would follow the instruction exactly, see it
work in that shell, and find setup unfinished tomorrow. On POSIX the verb is
`export`, and it is equally transient without a shell profile edit.

### 2. Nothing reports a file/env disagreement, or a missing env half

`resolve_verify_type()` captures `env_value=environ.get(ENV_VAR)` on branch 1
and puts it on the record — but **nothing ever compares it to the file's
value**. `resolved` is defined purely as "the project file answered", so:

- a project with a file and **no** env var reports `[x] verify type: ...`
- a project whose env var **contradicts** the file reports the same

Both are states the stated bar calls unfinished, and the data needed to say so
is already on the resolution object. This is the cheapest of the three to fix
and probably the most valuable: it turns an invisible half-configuration into
a line of output.

### 3. The remaining work is manual with no shipped helper

There is no script. The operator asked for one, which is how this note began.

## Why the helper must be Python, not PowerShell

The first draft of the helper offered in-session was PowerShell. That was
wrong, and the operator caught the general form of it by asking whether
PowerShell works on Linux and macOS.

- **Repo convention is Python.** `ai_router/scripts/*.py` are the shipped
  standalone tools. The repo contains exactly **two** `.ps1` files
  (`scripts/benchmark-test-suite.ps1` and a historical session-set artifact)
  and no `.sh`/`.bat`/`.cmd` at all.
- **CI is multi-OS.** `.github/workflows/test.yml` runs
  `[ubuntu-latest, windows-latest]` for most jobs and
  `[ubuntu-latest, macos-latest, windows-latest]` for one.
- **`pwsh` runs cross-platform, but the API does not.** PowerShell 7+ is
  preinstalled on GitHub's ubuntu and macOS images, so `shell: pwsh` would
  execute. The blocker is deeper:
  `[System.Environment]::SetEnvironmentVariable(name, value, 'User')` depends
  on the **Windows registry**; on Linux and macOS .NET treats the `User` and
  `Machine` targets as **no-ops**. The script would run cleanly, exit 0, and
  persist nothing. A silent no-op is the worst possible outcome for a setup
  helper.

There is no OS-level "user environment" on Unix. Persistence lives in
`~/.bashrc` / `~/.zshenv`, or `launchctl setenv` on macOS.

## Recommended design

Implement in Python, inside `verify_type` — the same module that prints the
instruction being corrected — and branch by OS:

- **Windows:** write the user-scope value directly (registry / `setx`
  equivalent). Prefer the registry API over `setx`, which truncates values
  over 1024 characters and does not affect the current process.
- **POSIX:** **print** the exact `export` line for the user's shell profile.
  Do not edit `~/.bashrc` or `~/.zshenv` silently — mutating a developer's
  shell profile without consent is not this tool's business.
- **Both:** state plainly that already-open terminals keep their old
  environment until restarted. This surprised the operator's own seat during
  Set 124 S1, where the value was set correctly but read empty in the
  running shell.
- **Derive the value from `project-verify-type.txt`** rather than asking for
  it again, so the two halves cannot drift apart — drift being the exact
  condition defect 2 fails to report.

### Open design question for whoever picks this up

Should `--set` simply do both halves, or should the environment write be
opt-in (`--set-env`, or a prompt)?

Argument for both: the bar is "BOTH", and one command satisfying it is
simpler to explain — SIMPLE is binding.

Argument for opt-in: writing `project-verify-type.txt` touches only the
project, whereas the environment variable is a **machine-scoped** mutation
outside the repo, and this framework is otherwise careful to keep those
explicit.

Not decided here.

## Scope note

`AI_ORCHESTRATION_VERIFY_TYPE` should be set at **User** scope, not Machine.
A Copilot seat is licensed per GitHub identity, not per box: at Machine scope
any other Windows account — including service accounts — would be told
`COPILOT_CLI` even if it holds `DABBLER_*` keys and needs `DIRECT_API`. That
is the same "one seat's answer imposed on everyone" failure Set 124 S1 removed
from git by gitignoring the project file.

## Related

- `ai_router/verify_type.py` — `guided_setup_instructions()`, `describe()`,
  `resolve_verify_type()`, `ENV_VAR`.
- `docs/planning/verify-type-resolution.md` — the three-branch design and its
  "setup is finished when BOTH" bar.
- Set 123 S1/S3 — the resolver, and the retirement of the setup webview.
- Set 124 S1/S2 — the machine/project re-scoping, and the retirement of
  `local-overrides.yaml`'s `transport.profile`, which left this variable as
  the only half of setup still done by hand.

## How it was fixed (Set 126)

**Session 1 — defect 2.** `VerifyTypeResolution.env_agreement` is the
comparison branch 1 never made: `agrees` / `missing` / `disagrees`, plus
`not-applicable` on branches 2 and 3 where the file has not answered and a
disagreement would have to be invented from a single value. It is published
on `to_dict()` for `--json` consumers, and `describe()` reports it — a
disagreement naming **both** values and stating that dispatch uses the file.
Narration only: no exit code moved, which its falsifiers pin explicitly.

**Session 2 — defects 3 and 1, in that order** (the corrected instruction has
to name the helper, so fixing the prose first would only have been undone):

- `python -m ai_router.verify_type --set-env` ships in `verify_type` itself.
  It derives the value from `project-verify-type.txt` rather than asking
  again, writes **USER** scope on Windows through the registry API at
  `HKEY_CURRENT_USER\Environment` (and publishes it into the running process,
  which `setx` cannot do), and on POSIX **writes nothing at all** — it prints
  the `export` line for the shell profile, exactly as the *Recommended
  design* above required. Machine scope is refused by the writer, not merely
  avoided by its callers.
- The instruction surface was re-derived rather than trusted from the
  authoring list, and every echo corrected in one pass (`L-069-1`):
  `guided_setup_instructions()` (which now names `--set-env` and says
  plainly that a bare `set`/`export` does not persist), the extension
  `README.md` — including the pre-existing claim that the project file is
  *"committed ... project configuration, not machine state"*, the precise
  inverse of Set 124's ruling — the repo `README.md`, `docs/quick-start.md`,
  `docs/adoption-bootstrap.md`, `docs/tutorials/adopt-dabbler.md`, the
  consumer-bootstrap `getting-started.md.template`, and the regenerated
  cold-start golden fixture. Two further "commit what verifies the project"
  echoes were found in that pass and were not in the authoring list.

What deliberately did **not** change: the three-branch rule, the exit codes,
and the decision to keep the environment write opt-in rather than folding it
into `--set` (Set 126 authoring decision 1 — the counter-argument is recorded
in that set's `decisions.jsonl`, and reversing it is a default flip, not a
redesign).
