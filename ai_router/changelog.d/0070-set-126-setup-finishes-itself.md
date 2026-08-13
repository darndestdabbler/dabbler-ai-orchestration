## [Unreleased] — setup finishes itself (Set 126)

### Added

- **(Set 126 S2) `python -m ai_router.verify_type --set-env` finishes
  setup's second half, and the instructions stop lying about it.** The
  design's own bar has always been that setup is finished when BOTH
  `$AI_ORCHESTRATION_VERIFY_TYPE` is set and `project-verify-type.txt`
  carries the same value. One half was a command; the other was a sentence
  — and the sentence said `set AI_ORCHESTRATION_VERIFY_TYPE=<VALUE>`, which
  is **process-scoped** on Windows: copy-pasted, exactly as a setup
  instruction invites, it works in that terminal and is gone tomorrow.

  `set_env_verify_type()` derives the value from `project-verify-type.txt`
  — never asking again, so the two halves cannot drift — and branches by
  OS, because what a helper can honestly do differs by platform:

  - **Windows:** persists at **USER** scope through the registry API at
    `HKEY_CURRENT_USER\Environment`, preferred over `setx` (which truncates
    past 1024 characters and cannot tell the calling process). The value is
    also published into the running process, so the caller's own next
    resolution does not read a stale environment block and report the half
    just finished as missing. A best-effort `WM_SETTINGCHANGE` broadcast
    notifies other running programs; a failure there is a **named** warning,
    never a failed setup (L-079-1).
  - **POSIX:** writes **nothing at all** and prints the exact `export` line
    for `~/.bashrc` / `~/.zshenv`. There is no OS-level user environment on
    Unix — `.NET`'s `User` target is a no-op there — so a helper that exited
    0 having persisted nothing would be the defect it was written to fix,
    wearing a success message. Editing a developer's shell profile without
    consent is not this tool's business.

  **Machine scope is refused, not merely unused.** A Copilot seat is
  licensed per GitHub identity, not per box, so a machine-wide answer would
  tell every other account — service accounts included — that this project
  is verified the way one seat verifies it, which is the "one seat's answer
  imposed on everyone" failure Set 124 S1 removed from git. The writer
  raises on any scope but `user`, **before** `winreg` is imported, which is
  what makes the guarantee assertable on the ubuntu and macOS runners the
  `python-tests` matrix already pays for.

  The write is opt-in rather than folded into `--set`: writing the project
  file touches only the project, while writing the environment is a
  machine-scoped mutation outside the repo. The two compose —
  `--set <VALUE> --set-env` finishes both halves in one command. `--json`
  carries an `env_write` block; exit codes are unmoved (a project with no
  value to derive exits 3, "guided setup required", not 2).

### Fixed

- **(Set 126 S2) Every setup instruction that told the operator to persist
  the variable by hand, and two that told them to commit a gitignored
  file.** `guided_setup_instructions()` now names `--set-env` and says
  plainly that a bare `set` / `export` does not persist. The echo pass was
  re-derived rather than trusted from the authoring list (`L-069-1`), which
  turned up two sites nobody had listed: `docs/quick-start.md` and
  `docs/adoption-bootstrap.md` both said to **commit** what verifies the
  project — the precise inverse of Set 124's ruling, matching the extension
  README's own known claim that the file is *"project configuration, not
  machine state"*. Corrected in the same pass: the extension `README.md`,
  the repo `README.md`, `docs/quick-start.md`, `docs/adoption-bootstrap.md`,
  `docs/tutorials/adopt-dabbler.md`, the consumer-bootstrap
  `getting-started.md.template`, and the regenerated cold-start golden.
  `docs/planning/verify-type-env-var-setup-gap.md` moves from *diagnosed,
  not fixed* to fixed.

- **(Set 126 S2) Two docstring claims that were never quite true.**
  `describe()` called itself ASCII-only while echoing a project path that
  can carry non-ASCII, and `resolve_verify_type()` said broadly that an
  invalid environment value raises — which was never true on branch 1,
  where the file has already answered and the environment is only captured
  for `env_agreement`. Both were the adjudicated-minor residual Session 1
  left with Session 2 named as owner.

### Added

- **(Set 126 S1) A half-finished setup says so.**
  `VerifyTypeResolution.env_agreement` is the comparison branch 1 never
  made between the `env_value` it always captured and the file that decides:
  `agrees` / `missing` / `disagrees`, plus `not-applicable` on branches 2
  and 3 where the project file has not answered and a disagreement would
  have to be invented from a single value. Published on `to_dict()` for
  `--json` consumers, and reported by `describe()` — a disagreement naming
  **both** values and stating that dispatch uses the file, because an
  operator who cannot see which side won cannot tell whether to fix the file
  or the environment. An invalid environment value is reported as a
  disagreement rather than raised: `describe()` is a narration path, and
  branch 1's contract is that the environment decides nothing. Narration
  only — the file still wins silently, `resolved` still means "the project
  file answered", and **no exit code moved**.

