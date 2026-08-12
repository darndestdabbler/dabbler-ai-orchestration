# Verify-Type Setup Finishes Itself Spec

> **Purpose:** `verify_type` states its own bar — *setup is finished when
> BOTH `$AI_ORCHESTRATION_VERIFY_TYPE` is set and `project-verify-type.txt`
> exists carrying the same value* — and then ships only half of it. One half
> is a command; the other half is a sentence, and nothing checks whether the
> sentence was obeyed. This set makes the missing half **visible**, then
> makes it **executable**, without either surface lying about what the other
> one did.
> **Created:** 2026-08-12
> **Session Set:** `docs/session-sets/126-verify-type-setup-finishes-itself/`
> **Prerequisite:** None (Sets 123 and 124 are already complete; this
> remediates a gap they left, it does not depend on new work from them)
> **Workflow:** Orchestrator → AI Router → Cross-provider verification

**Source of record:** [`docs/planning/verify-type-env-var-setup-gap.md`](../../planning/verify-type-env-var-setup-gap.md)
— diagnosed 2026-08-12 during Set 124 Session 2 and deliberately deferred so
a pytest run of record and a verification stamp were not invalidated
mid-session. That note is the authority for the three defects below; this
spec schedules them and does not restate their evidence.

---

## Session Set Configuration

```yaml
requiresUAT: false        # The deliverable is terminal output and a stdlib env write, judged by structural falsifiers plus one recorded live walk on this machine. No rendering surface; Set 123 S3 retired the setup webview, so there is no UI to review.
requiresE2E: false        # Nothing under the Playwright `covers` paths is touched. This is ai_router/verify_type.py, its tests, and instruction prose. The extension MANIFEST is untouched, so L-064-12 does not fire.
uatStyle: ad-hoc
uatScope: none
sessionSizeException: none
```

> Rationale: both false on a set that does touch shipping code. The change
> is confined to one stdlib-only module and the prose that describes it; the
> risk lives in *cross-OS behavior* and *not breaking existing exit-code
> consumers*, neither of which a human clicking a UI can see. Falsifiers and
> a recorded cold walk are the right instruments here, not UAT.

---

## Project Overview

### Scope

Three defects, taken smallest-first, exactly as the gap note ranks them:

1. **The printed instruction does not persist.** Step 2 of
   `guided_setup_instructions()` prints `set AI_ORCHESTRATION_VERIFY_TYPE=<VALUE>`.
   Copy-pasted — which is what a setup instruction invites — `set` is
   **process-scoped** on Windows and evaporates with the terminal. The
   operator follows the instruction exactly, watches it work, and finds
   setup unfinished tomorrow.
2. **Nothing reports a missing or disagreeing env half.**
   `resolve_verify_type()` already captures `env_value` on branch 1 and puts
   it on the record, but **nothing compares it to the file's value**.
   `resolved` means only "the project file answered", so a project with no
   env var and a project whose env var *contradicts* the file both print the
   same confident `[x]`. The data needed to say otherwise is already on the
   resolution object.
3. **The remaining work is manual with no shipped helper.** There is no
   script. The operator asking for one is how the gap note began.

### Non-goals

- **Not re-opening the three-branch resolution rule.** Branch order, the
  confirm-once step, and `derive_transport_profile` are settled (Set 123 S1,
  Set 124 S1) and are not touched.
- **Not editing anyone's shell profile.** On POSIX the helper **prints** the
  `export` line. Silently mutating `~/.bashrc` or `~/.zshenv` is not this
  tool's business, and the gap note says so.
- **Not Machine scope, ever.** See *The scope ruling* below.
- **Not reviving a setup UI.** Set 123 S3 retired the setup webview; the
  extension contributes no setup surface and gains none here.

### The scope ruling — settled, do not reopen

`AI_ORCHESTRATION_VERIFY_TYPE` is written at **User** scope, never Machine.
A Copilot seat is licensed per GitHub identity, not per box: at Machine
scope any other Windows account — including service accounts — would be told
`COPILOT_CLI` even if it holds `DABBLER_*` keys and needs `DIRECT_API`. That
is the same "one seat's answer imposed on everyone" failure Set 124 S1
removed from git by gitignoring the project file. A helper that writes
Machine scope has reintroduced the bug this framework just paid to remove.

### Why the helper is Python, not PowerShell — settled

The first draft offered in-session was PowerShell, and it was wrong:

- **Repo convention is Python.** `ai_router/scripts/*.py` are the shipped
  standalone tools; the repo holds exactly two `.ps1` files and no
  `.sh`/`.bat`/`.cmd`.
- **CI is multi-OS, and the pytest job is the widest of all of them.**
  `.github/workflows/test.yml`'s `python-tests` job runs
  `[ubuntu-latest, macos-latest, windows-latest]` — macOS was kept there
  deliberately when Layer 3 dropped it on cost grounds, so *"the router keeps
  real macOS coverage."* Falsifiers written for this change therefore execute
  on all three platforms for free, which is the whole reason the cross-platform
  claim below is testable rather than asserted.
- **`pwsh` runs cross-platform, but the API does not.**
  `[System.Environment]::SetEnvironmentVariable(name, value, 'User')`
  depends on the **Windows registry**; on Linux and macOS .NET treats the
  `User` and `Machine` targets as **no-ops**. The script would run cleanly,
  exit 0, and persist nothing. **A silent no-op is the worst possible
  outcome for a setup helper** — it is defect 1 wearing a success message.

There is no OS-level "user environment" on Unix. Persistence lives in
`~/.bashrc` / `~/.zshenv`, or `launchctl setenv` on macOS. The helper must
therefore *do* on Windows and *instruct* on POSIX, and must never blur which
of the two it just did.

---

## Decisions taken at authoring

These resolve the gap note's *"Not decided here"* so a session does not
re-litigate them mid-flight. **Both are the reversible option**, and either
is cheap for the operator to overturn before Session 1 registers.

1. **The environment write is opt-in, not folded into `--set`.** Writing
   `project-verify-type.txt` touches only the project; writing the
   environment variable is a **machine-scoped mutation outside the repo**,
   and this framework is otherwise careful to keep those explicit.
   `--set-env` (deriving its value from `project-verify-type.txt`, never
   asking again) collapses the manual step to one command without making a
   project-scoped command reach outside the project. *Argument on the other
   side, recorded so it is not lost: the bar is "BOTH", and one command
   satisfying it is simpler to explain — SIMPLE is binding. If the operator
   prefers that, Session 2 flips a default, not a design.*
2. **Reporting the missing half does not change the exit code.** A project
   with the file but no env var keeps exiting 0; the new information arrives
   as an operator-visible line, not as a failure. Exit 3 is consumed by
   callers as "guided setup required", and this repo's own seat is currently
   in exactly the half-configured state that would begin failing. Making the
   bar *enforceable* is a separate, breaking decision that belongs to
   whoever can survey the callers — it is not smuggled in behind a display
   fix.

Both decisions are journalled to `decisions.jsonl` at Session 1 registration
with this spec cited as their origin.

---

## Sessions

### Session 1 of 2: Setup reports its own second half

The cheapest of the three defects and, per the gap note, *"probably the most
valuable: it turns an invisible half-configuration into a line of output."*
Nothing here writes to the environment — this session only makes the truth
about it visible.

**Steps:**

1. Register. Journal the two authoring decisions above to `decisions.jsonl`.
2. **Name the agreement state on the resolution record.** `env_value` is
   already captured on branch 1; add the comparison the record never made,
   so a caller can distinguish *agrees*, *missing*, and *disagrees* without
   re-reading the environment itself. Put it on `to_dict()` so the `--json`
   consumers see it too. `resolved` keeps its current meaning — the project
   file answered — and the exit code is untouched (authoring decision 2).
3. **Report it in `describe()`.** A resolved project whose env half is
   missing, or whose env half contradicts the file, must say so in the
   operator's terminal instead of printing a bare `[x]`. A disagreement must
   name **both values** and state which one dispatch actually uses (the
   file), because an operator who cannot see which side won cannot tell
   whether the fix is to change the file or the environment.
4. **Falsify in both directions** (`L-112-1`). The rule fires: file-only,
   and file-vs-env-contradiction, are each reported. The rule does **not**
   fire indiscriminately: a project where both halves agree still prints the
   clean `[x]` with no nag, branch-2 and branch-3 output are unchanged, and
   **the exit code is the same in every one of these cases** — pin that
   explicitly, since exit-code drift is the one way this display change
   could break a caller.
5. Full pytest at close after the last edit; verify; close.

**Creates:** the agreement state and its falsifiers
**Touches:** `ai_router/verify_type.py`, `ai_router/tests/test_verify_type_resolution.py`
**Ends with:** a half-configured project says so out loud — the state the
design's own bar calls unfinished is no longer indistinguishable from the
finished one — and no existing caller's exit code moved.
**Progress keys:** `agreementStateOnRecord`, `disagreementReported`, `exitCodeUnmoved`

> **Irony budget: 8 new test functions.** Small because the change is one
> comparison and one branch of narration; the risk is concentrated in the
> *negative* direction (no false nag, no exit-code movement), which is where
> most of the eight should go.

---

### Session 2 of 2: One command finishes setup, and the instructions stop lying

Defects 3 and 1, together and in that order — the corrected instruction has
to name the helper, so fixing the prose first would only be undone here.

**Steps:**

1. Register.
2. **Ship the env-write helper in `verify_type`**, the same module that
   prints the instruction being corrected. Branch by OS: on **Windows**
   write the User-scope value directly, preferring the registry API over
   `setx` (which truncates past 1024 characters and does not affect the
   current process); on **POSIX** print the exact `export` line for the
   user's shell profile and change nothing on disk. **Derive the value from
   `project-verify-type.txt`** rather than asking for it again, so the two
   halves cannot drift apart — drift being the exact condition Session 1
   taught the tool to report. Both paths state plainly that already-open
   terminals keep their old environment until restarted; that surprised the
   operator's own seat during Set 124 S1, where the value was set correctly
   and read empty in the running shell.
3. **Falsify in both directions, including the OS split** (`L-112-1`). The
   rule fires: on the Windows path the User-scope write is performed with
   the value taken from the project file. The rule does not fire
   indiscriminately: **the POSIX path performs no write at all** and returns
   instructions, and **neither path ever writes Machine scope** — assert
   that structurally, not by reading the argument at one call site. Both
   must be provable on the CI runner that is *not* the target OS, or the
   cross-platform claim is untested on exactly the platforms it is about;
   the `python-tests` job already runs all three, so this costs nothing but
   the seams to inject the OS decision.
4. **Enumerate the instruction surface, then correct it** — the *writers*
   and the *echoes*, in every language, not only the module that prints
   step 2 (`L-069-1`, and the authoring guide's echo-pass anti-pattern,
   which cites Set 124 for exactly this mistake). Known at authoring, to be
   re-derived and not trusted as complete: `guided_setup_instructions()` in
   `ai_router/verify_type.py`; `tools/dabbler-ai-orchestration/README.md`;
   `test-fixtures/cold-start/full/docs/dabbler/getting-started.md`; and any
   consumer-bootstrap template that reproduces the setup steps. **A
   pre-existing lie found at authoring and in scope here:** the extension
   README still tells operators the answer is *"written to
   `project-verify-type.txt` at the repo root and **committed** — it is
   project configuration, not machine state"*, which is the precise inverse
   of Set 124's ruling and of the header the writer now stamps into the
   file. It is the same instruction surface and the same defect family; fix
   it in this pass rather than filing it.
5. Full pytest at close after the last edit; verify; close; Step 9 review,
   `change-log.md`, and `disposition.json` (this is the set's final
   session).

**Creates:** the OS-branching env-write helper and its falsifiers
**Touches:** `ai_router/verify_type.py`, `ai_router/tests/test_verify_type_resolution.py`, `tools/dabbler-ai-orchestration/README.md`, `test-fixtures/cold-start/full/docs/dabbler/getting-started.md`, `ai_router/CHANGELOG.md`
**Ends with:** an operator can finish setup with commands the tool actually
ships, on any OS the CI matrix runs, and every instruction that survives
tells the truth about what it will persist and what it will not.
**Progress keys:** `helperShipped`, `osSplitFalsified`, `instructionSurfaceCorrected`

> **Irony budget: 12 new test functions.** Larger than Session 1 because the
> OS split doubles every meaningful case and because the Machine-scope
> prohibition and the POSIX no-write guarantee each need their own structural
> pin. If it cannot be covered in 12, the design is wrong.

---

## End-of-set deliverables

- A resolution record and terminal output that distinguish a finished setup
  from a half-finished one, with no exit-code movement.
- A shipped, OS-aware helper that writes User scope on Windows, instructs on
  POSIX, never writes Machine scope, and derives its value from the project
  file so the two halves cannot drift.
- Setup instructions — in the module, the extension README, and the
  cold-start fixture — that persist when copy-pasted and that agree with Set
  124's gitignored machine/project-state ruling.
- `docs/planning/verify-type-env-var-setup-gap.md` moved from **"diagnosed,
  not fixed"** to fixed, citing the sessions that closed each defect.
- `change-log.md`, `disposition.json`, and the Step 9 guidance review.
