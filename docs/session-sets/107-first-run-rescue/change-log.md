# Change log — Set 107: first-run rescue

**Outcome:** Staff called the previous hello-world tutorial *"way too
complicated"* and some abandoned it. Four review rounds across two engines
diagnosed **first-run cognitive load, not raw git**: no path through the product
reached *"an AI session wrote my code"* without first teaching branch
protection, worktrees, CI and pull requests. This set built that path — a
`Dabbler: Try a sample project` command that renders a hostless local sample, a
new **144-line** `hello-world.md` in place of the 448-line one, and the
relocation of the old tutorial to `adopt-dabbler.md`.

**The acceptance test is the deliverable, and it passed.** The operator walked
the new tutorial on a second machine, on a clean VS Code profile, with the
**published** `0.47.0` from the Marketplace, driven by **GitHub Copilot**:
**under 15 minutes** from `Ctrl+Shift+P` to `HELLO, WORLD!`, and **no git
command, no YAML, no host configuration and no Dabbler setting** typed. Both
halves of the criterion met.

Three sessions, all VERIFIED. Extension `0.47.0` published mid-set; the pending
template-link fix stays `[Unreleased]` by operator decision.

## Session 1 — `Dabbler: Try a sample project` and the canonical sample bundle

- **One command, seven steps, each failing loudly and recoverably**: refuse a
  non-empty folder by name, render the versioned bundle, `git init` + baseline
  commit, write the sanctioned `.dabbler/local-only` marker, create the `.venv`
  and install `dabbler-ai-router`, open the folder, surface the sample set's
  **existing** start affordance.
- **Resumable by construction (v3 §12.3).** Step 5 fails *after* steps 3–4 have
  already created a repo, so a naive retry would hit step 1's refusal and reject
  the project it just made. An incomplete-sample marker records the next step;
  re-running the command on the same folder offers **Resume** or **Start Over**,
  and Start Over's removal list is *derived from the bundle*, never hand-listed.
  Proven by a test that forces step 5 to fail and re-runs.
- **A machine with no git identity still works.** The baseline commit uses a
  **repository-local** identity; global git config is never touched.
- **Step 5's failure text is a first-run experience, not a traceback
  (v3 §12.4).** The toast leads with the reassurance — the folder is fine,
  nothing was lost — names only the install as having failed, and points at the
  resume; the output channel carries the exact commands with real absolute
  paths, plus the proxy/VPN hint.
- **The canonical sample bundle** (`docs/templates/sample-project/bundle.json`)
  is one source of truth for three consumers: the command, the tutorial, and the
  smoke test. Every contract field in it is read by a test.
- `azure-pipelines.yml.template` shipped alongside the other consumer-bootstrap
  templates, matching the YAML the tutorial prints.
- Extension bumped to **0.47.0**.

## Session 2 — the new `hello-world.md`, and relocating the old one

- **The new tutorial is 144 lines and four steps**: run the command, watch a
  test fail, paste one line into the AI agent you already have open, watch it
  pass. No git command, no YAML, no host configuration, no branch/PR/CI/worktree
  or teammate content, no governance settings — one sanctioned exception, the
  closing sentence naming Full-tier cross-provider verification.
- **The prose was routed; the literals were bound.** Authoring went to a
  different provider, then every command, path, message and output was
  substituted by the orchestrator from `bundle.json` and the shipped string
  constants. A tutorial's literals are the one thing a reader cannot recover
  from.
- **The 448-line tutorial moved to `adopt-dabbler.md`** with its nine video
  scripts (`docs/tutorials/video/` → `adopt-dabbler-video/`), reframed as what
  comes *after* the first run, carrying one labelled note that it still holds
  the team workflow. Every inbound link repaired.
- **A scope correction against the spec's own expectation.** The spec predicted
  the shipped `getting-started.md.template` link would need no change because
  the new document keeps the old filename. That confirmation **failed**: both
  shipped templates describe the *adoption* content by name, so a resolving link
  is not the test. Both were repointed and the cold-start goldens regenerated.
- **`ai_router/scripts/tutorial_gate.py`** — the successor to Set 106's
  in-folder script, which was referenced by no CI job, no pytest test and no npm
  script (an artifact, not a gate). The new one lives at repo level with **83
  tests** and a CI step beside `drift_guard`. Falsifying it before trusting it
  immediately caught a real weakness, and Round 1 caught eight more escapes —
  an allowlist that let `git diff`/`log`/`show`/`reset` through, YAML detection
  that only saw *labelled* fences while every fence in the tutorial is
  unlabelled, case-sensitive patterns, and inputs that failed **open**.
- **Git was an undeclared prerequisite** — the command runs `git init` and the
  agent commits, the shipped code even has a `GIT_MISSING_MESSAGE`, yet the
  tutorial listed four prerequisites without it while `README.md` promised "no
  git commands". A reader could satisfy every stated prerequisite and still not
  finish. The corrected claim ("no git commands **for you to type**") was
  propagated to all five echoes in one pass.

## Session 3 — the stopwatch walk, remediation, close-out

- **The walk, and the number.** Under 15 minutes in-window; four no's on
  git/YAML/host/settings. Recorded honestly as the **operator's estimate rather
  than a stopwatch reading** — the walk preceded the final checklist, so no
  clock mark was written down. A precise-looking number nobody measured would be
  worse evidence than an honest approximate one.
- **The finding that is not in the number.** The dominant cost of the sitting
  was **prerequisite, not tutorial**: getting VS Code running while logged into
  GitHub Enterprise the right way — a Windows account linked to GHE, a `runas`
  launch script, a dedicated profile, and **three separate logins** that remain.
  The spec excludes setup time precisely so this is not mistaken for tutorial
  complexity, and the exclusion earned its keep: the sample is **hostless** and
  never contacts a host, so the GHE login is what makes *Copilot* work, not what
  makes *Dabbler* work. Triaged to a follow-on set — host and identity
  onboarding is an explicit non-goal for `hello-world.md`, and adding it would
  rebuild the cognitive load this set exists to remove.
- **The published build was proven walk-valid before the walk.** `0.47.0`'s tag
  landed on S1's commit, so `git diff vsix-v0.47.0..HEAD` was run over the
  shipped extension: two consumer-bootstrap templates differ, neither on the
  walk path. No new tag and no new publish were needed to measure the right
  product.
- **The checklist was cut from nine items to four, on operator instruction** —
  the nine-item version was *"daunting and tedious"*. Human-facing text
  15,149 → 2,588 characters; six clock marks → two. UAT confirms the most
  important things and lets the human volunteer what annoyed them; it does not
  interrogate them item by item about a document they just read. The standing
  UAT bar governs **ambiguity**; this adds a companion rule about **volume**.
- **The literal binding caught the routed checklist twice** — it promised "a new
  VS Code window opens" (the command reloads the current one), and the builder's
  own first scoping pulled `SAMPLE_STEP_PHRASE` instead of `SAMPLE_PROGRESS`,
  briefly quoting five stage labels no reader would ever see.
- **Verification found three real defects in this session's own work**: the
  checklist builder hardcoded one machine's absolute path, `ai-assignment.md`
  described a six-mark timing protocol that never ran, and the transcription
  step had appended the walk's verdict into the checklist's *instructions*. All
  three accepted, none disputed, fixed and re-reviewed → VERIFIED.
- **Layer 3 characterised.** All 28 Playwright specs fail locally at Electron
  launch — a residual known since S1. Four hypotheses were tested and ruled out
  (including the `ELECTRON_RUN_AS_NODE=1` this shell inherits, which is real but
  already defended against); one remains named and **unproven** (local Node
  25.8.1 vs CI's pinned Node 20). CI runs the suite green on all three OS legs.

## What this set deliberately did not do

- **No `Start work` / `Send for review` commands, and no one-form module
  creation.** Increment B.
- **No `team-workflow.md` split** — `adopt-dabbler.md` carries the team content
  as a labelled intermediate state.
- **No new Hello World video scene** — deferred until the tutorial survived the
  stopwatch. It now has.
- **No host/identity onboarding in the first run**, per the walk's triage above.
- **No Marketplace publish authored by the framework.** `0.47.0` published on
  the operator's own tag push; the template-link fix stays `[Unreleased]` by
  their decision, folded into the next release rather than cutting `0.48.0` for
  a link description.

## Owed after this set

1. **Organisation onboarding for GHE-linked Windows accounts** — private
   instructions for the operator's staff first, then a genericised/sanitised
   version, linked from `adopt-dabbler.md` where hosts and accounts already
   live. Draws on Copilot seat capacity. Blocks nothing.
2. **The `adopt-dabbler.md` walk**, still never performed (Set 106 was cancelled
   with that debt open).
3. **Increment B** — the `Start work` / `Send for review` commands.
4. **Layer 3 runnable locally** — pin the local Node major to CI's, or have
   `launchVSCode` say *"Electron did not start — environment, not regression"*
   instead of 28 timeouts that read like broken features.
