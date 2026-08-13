### Changed

- **(Set 124 S3) `Dabbler: Set Up Copilot Seat` records the verify type
  instead of writing a retired config key — the previous behaviour left
  the project unable to load its own config.** On ≥2 confirmed provider
  families the command used to write `transport.profile: copilot-cli`
  into `ai_router/local-overrides.yaml`. Set 124 S2 retired that key and
  made a stale one a **hard refusal** at config load, so a *successful*
  seat setup produced a project whose every `load_config` raised. The
  command now records the answer through the one sanctioned writer —
  `python -m ai_router.verify_type --set COPILOT_CLI`, run in the
  scaffolded `.venv` — from which the router derives
  `transport.profile: copilot-cli`. One writer, so the file always carries
  the header explaining why it is machine-local.

  **The Direct API path is unchanged.** A `DIRECT_API` project keeps
  resolving exactly as before; the `"api"` seat pick was always a no-op
  here, because the seeded `router-config.yaml` default already *is* `api`.

  **`project-verify-type.txt` is now gitignored machine/project state**
  (operator ruling, 2026-08-12): the answer to "what verifies *this
  project*, on *this machine*". A Copilot seat holds no `DABBLER_*` keys
  and must resolve `COPILOT_CLI`; a teammate who installed with provider
  keys must resolve `DIRECT_API` for the same checkout — so committing it
  would force every clone onto one machine's transport.
  `verify_type --set` now adds the `.gitignore` rule itself, **before** it
  writes the file, so there is no window in which the answer is
  committable. If you already committed it, untrack it with
  `git rm --cached project-verify-type.txt`.

  **Toasts changed accordingly.** Success names the file it wrote rather
  than a config key; every failure branch names
  `python -m ai_router.verify_type --set COPILOT_CLI` as the one-command
  recovery (no re-probe needed), and a seat whose `.gitignore` could not be
  written is now told plainly that the answer is **not** git-ignored
  instead of being told it is.


  it beside Copy Run Prompt; walking the finished row, the operator
  judged one entry enough — the artifacts are a folder away, and a
  session row's menu is worth more when it offers exactly what that row
  is for. The command, its `package.json` entries and its `s<N>-*`
  discovery helpers went with it rather than being left registered and
  unreachable (it was hidden from the Command Palette by design, so the
  menu was its only door). A session the run phrase does not resolve to
  now has an empty context menu, which is the honest result.

  This also retired the two Layer 3 scenarios that drove the artifact
  click end to end — the two that were failing in CI on both platforms
  while passing locally, because a fast runner right-clicks before the
  menu's entries populate. What replaces their coverage is an ABSENCE
  assertion at both layers: no session row carries the token, and the
  live menu does not offer the label.

- **(Set 115 S4) `<- here` is gone from the step rows; the in-progress
  icon says it instead.** Operator ruling (Set 120 S3), finished here in
  the second language: the marker picked exactly one row by rule — first
  unfinished logged step, else the first pending planned row — and that
  inference is what pointed confidently at step 1 of a session whose real
  work was four steps further on, because four statuses were unreadable.

  What replaces it is a fact rather than a guess: the step whose recorded
  status **is** `in-progress` gets the in-progress glyph. Two steps can be
  in flight at once, which the single-valued marker could not represent,
  and none can — a real answer it had to fake. The description column on
  step rows is now empty; the marker was the only thing that ever went
  there.

- **(Set 115 S3) A session row offers the prompt to run it.** Right-clicking
  a session in the Work Explorer shows:

  - **Copy Run Prompt** — writes `Start the next session of \`<slug>\`.`
    to the clipboard. It appears on **one row per set**: the session that
    phrase actually runs (the in-flight one, else the first unstarted
    one). A prompt copied from a later row would have started a different
    session than the row it came from, so those rows do not offer one. An
    unrecognised session status offers nothing anywhere in the set rather
    than guessing which session is next.

  S3 also shipped **Open Session Artifacts** here; S4 removed it at the
  operator's ruling (see *Changed* above), so it never reached a
  published build.

- **(Set 115 S2) Click a session row and land on its plan.** The Work
  Explorer's session rows were labels you could not click. Activating one
  now opens the set's `spec.md` **positioned at that session's own
  `### Session N of M:` block** — the same file the framework itself
  reads, revealed at the top of the editor with the cursor on the
  heading, so the surrounding context and the Session Set Configuration
  block are still a scroll away. No sidecar file is generated and nothing
  is copied: the per-session view is a read-time slice of the one real
  spec.

  It goes through the **existing** `Open Spec` command rather than a
  parallel one, so there is still exactly one answer to "which file is
  the spec" and one message when it is missing. A spec that cannot answer
  — no session headings at all (every older consumer-repo spec), a
  malformed heading, or a ledger ahead of its spec — opens the real file
  at the top rather than erroring or doing nothing.

