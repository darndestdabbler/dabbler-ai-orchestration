# AI Assignment — 107-first-run-rescue

## Session 1 of 3 — `Dabbler: Try a sample project` + the canonical sample bundle

- Orchestrator: claude / anthropic / claude-opus-5 / high (operator-invoked).
- Routed step-3.5 analysis: `s1-ai-assignment-analysis.json` (route
  `task_type=analysis`, excl. anthropic → gemini-2.5-pro, tier 2, $0.0153,
  `stop_reason=end_turn`, truncation-clean).
- Set-level facts carried from the spec (immutable at runtime): **Full tier**,
  `requiresUAT true` (S3 is the stopwatch walk — S1 arms it, does not run it),
  `requiresE2E true` (step 7 lands in the Work Explorer; L-064-12 arms Layer 3
  for Explorer-rendering surfaces regardless), `pathAwareCritique advisory`
  (runs at the set-terminal close in S3, not here). Do not re-litigate
  mid-session — a wrong flag is surfaced at Step 9.
- Budget note: this session draws on the **`DABBLER_*` provider keys** only
  (routed analysis + the mandatory cross-provider verification). It spends
  **no Copilot seat capacity** and requires no seat probe — the deliverable is
  a Lightweight (`--no-router`) sample.

### Routing plan

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Register; read spec, proposal v3 §5/§6/§12, and the shipped scaffold surface (`gitScaffold.ts`, `aiRouterInstall.ts`, `consumerBootstrap.ts`, `local_only.py`, `esbuild.js`). | Orchestrator direct — read-only reconnaissance. |
| 2 | Author the canonical sample bundle (tiny Python module + failing-then-passing test surface + one already-authored Lightweight set) as a new template bundle under `docs/templates/`. | Orchestrator direct — **execution, not generation**: the bundle's shape is fixed by the existing `consumerBootstrap` renderer contract and by the exact expected output S2's tutorial and the smoke test must both assert. Solution-variance is near zero; a routed draft would add variance to a contract three consumers pin. |
| 2b | **(Added — analyst's "missing step".)** The first-run **user-facing strings**: the non-empty-folder refusal, the resume prompt, the step-5 network-failure remediation text, and the landing message. | **Routed** (`documentation`) — this is the set's actual deliverable (cognitive load), it is prose-quality reasoning, not mechanics, and `documentation` is an `always_route_task_types` entry. |
| 3 | Implement the command to the seven-step contract, reusing `scaffoldConsumerRepo` / `installAiRouter` / the `.dabbler/local-only` writer. | Orchestrator direct — spec-locked integration across a DI surface this repo already established; the contract enumerates every branch. Exceeds ~50 lines but is execution, and the mandatory cross-provider verification at Step 6 is its peer review. |
| 4 | Resumability (decision below) + the forced step-5-failure retry test. | Orchestrator direct — the mechanism is decided here; the test is a deterministic negative-path assertion against just-written code. |
| 5 | Repo-local git identity for the baseline commit (`git -c user.email=… -c user.name=…`), never global. | Orchestrator direct — mechanical. |
| 6 | Actionable step-5 failure text (no raw traceback). | Wording **routed** with 2b; the plumbing that surfaces it, direct. |
| 7 | Ship `azure-pipelines.yml.template`; register it in `esbuild.js`'s required list; rebuild `dist/`; bump version + CHANGELOG. | Orchestrator direct — mechanical file/config updates. |
| 8 | Smoke test: render the bundle, start the Lightweight lifecycle, run the sample's tests, assert the expected program output. | Orchestrator direct — deterministic assertions against the bundle authored in step 2; the *expected output* is the contract, so generating it independently would be circular. |
| Verify | Cross-provider phased `verify_session` for this set. | **Routed** — `session-verification`, orchestrator provider (anthropic) auto-excluded per the no-skip mandate. |
| Close | `disposition.json`; commit + push; `close_session`; notify. | Orchestrator direct — mechanics. |

**Where this departs from the routed analyst, and why.** The analyst recommended
routing steps 2, 3, 4 and 8 as "code generation". That reads the Delegation
Discipline rule by *size* rather than by *kind*: the repo's criterion is
reasoning-vs-execution, and a contract this tightly specified — seven enumerated
steps, each with its named failure mode, over an existing dependency-injected
surface — is execution. Set 105's precedent is the same call. The analyst's
genuinely new contribution is the **missing step** it named (user-facing string
quality), which is adopted above as 2b and is the one part of this session where
routed reasoning changes the deliverable.

### Design decision — the resumability mechanism (v3 §12.3)

**Chosen: the incomplete-sample marker, resumed in place. Not temp-dir-then-move.**

The routed analyst reached the same conclusion, and the decisive argument is
mechanical rather than stylistic: **a Python virtual environment cannot be
relocated.** `python -m venv` bakes absolute paths into `pyvenv.cfg` and into
every `Scripts/*.exe` shim, so a build-in-temp-then-move strategy either moves a
`.venv` and ships a broken interpreter, or must reorder the contract so step 5
runs after the move — at which point the move no longer protects the step that
actually fails. Windows file locking on a freshly-created venv makes the move
unreliable besides. The marker works in place, survives a VS Code reload, and
lets step 1's empty-folder refusal stay strict for every folder that is *not*
carrying our own marker.

Named risk (analyst's, accepted): the entry point now has two accept states —
empty folder, or a folder carrying a valid marker — and the resume logic must
know which step to resume from. Mitigated by recording the completed step
number in the marker and by the forced-failure retry test the spec requires.

### Next-orchestrator recommendation

Session 2 is documentation authoring against a hard negative constraint (zero
git / YAML / host / governance terminology) plus a duplicate-procedure grep
against the concept-ownership table.

The routed analyst recommended **openai / gpt-4-turbo**, which does not exist in
this repo's model registry (`ai_router/router-config.yaml` — the analyst's model
knowledge is stale). Correcting to the registry while keeping its reasoning
intact — a strong instruction-follower on long-context prose, from a provider
other than the one that authored S1's code, so S2 reads S1's output with fresh
eyes: **openai / gpt-5-6** (tier 3), effort high. Second choice if the operator
prefers continuity of context over provider diversity: claude / anthropic /
claude-opus-5. Either way the S2 verification stays cross-provider and excludes
whichever provider orchestrates it.

Budget: S2 is prose plus greps — the cheapest of the three sessions on
`DABBLER_*` spend, and again zero Copilot seat capacity.

### Next-session-set recommendation

The analyst proposed a "first guided change" set (`Dabbler: Apply one fix to
this sample`). Recorded, but **not** endorsed as next: it partly re-does what
S3's walk is about to measure, and it would add a new AI-invoking surface before
the 15-minute number exists. The stronger candidates, in order:

1. **Increment B** — `Start work` / `Send for review`, plus one-form module
   creation. This is the deferred half of proposal v3, it is already scoped in
   §12.1's three-flow table (including the dirty-session-branch case), and Set
   107 was deliberately cut down to make room for it.
2. **The owed `adopt-dabbler.md` walk** — Set 106 was cancelled with this walk
   never performed, and S2 of this set is what makes the document stable enough
   to walk. Small, and it discharges a standing debt.

Final ordering is the operator's; S3's walk result is the input that should
decide it, so this is re-stated at the set-terminal close, not fixed here.

### Actuals (filled at close)

- **Orchestrator used:** claude / anthropic / claude-opus-5 / high (operator-invoked).
- **Routing plan followed as recommended.** Implementation stayed
  orchestrator-direct as planned (spec-locked execution, not generation); the
  added step 2b routed the user-facing strings. The analyst's advice to route
  steps 2/3/4/8 as "code generation" was declined for the reason recorded
  above, and the session's own verification rounds — which found five real
  blockers in that orchestrator-direct code — are the honest counter-evidence
  worth recording: the code needed *review*, which it got, not different
  authorship.
- **Deviations:** three, all disclosed at the time.
  1. Step 5 installs `pytest`? No — the sample was switched to stdlib
     `unittest` so step 5 installs exactly one package, since
     `dabbler-ai-router` does not depend on pytest.
  2. Three in-scope fixes outside the literal plan: the `close_session` EOF
     guard (router-side, same bug class), the recursive `sample-dist-in-sync`
     drift check, and repairing the `drift-guards` CI job that was **already
     red on master** from the previous set.
  3. `docs/repository-reference.md` was corrected: it claimed extension
     `0.46.0` was staged-and-unpublished with `0.45.0` live, a day after
     `0.46.0` had actually published (verified against the workflow run, not
     assumed).
- **Sub-decisions settled:** resumability via the incomplete-sample marker
  (a `.venv` cannot be relocated, so temp-dir-then-move is unsound here);
  repository-local git identity over a command-scoped `-c` (the developer's own
  agent commits here later and must inherit a working identity).
- **Verification:** six rounds. Discovery fan-out 2/2 → supplementary →
  remediation-review ×2 → **operator-authorized** third remediation review →
  close-backstop round 6. Closed **VERIFIED**, 0 findings, on both the working
  tree and the pushed diff. Five distinct blockers found and fixed.
- **A third-provider opinion was taken** (gemini-2.5-pro, both parties
  excluded) after the loop hit its 2-cycle bound on a severity dispute. It
  ruled **against the orchestrator** and surfaced two further real defects.
  The dispute was withdrawn rather than carried.
- **Cost:** **$1.578 across 12 routed calls**, all on the `DABBLER_*` keys.
  Zero Copilot seat capacity, as forecast. Breakdown: $0.023 planning +
  strings, $1.436 verification (six rounds, incl. the operator-authorized
  extra round at $0.119 and the close backstop at $0.299), $0.012 the
  third-provider adjudication. The verification loop is ~91% of the session's
  spend — worth naming, because it also found five blockers the suites did not.
- **Outcome:** VERIFIED. Suites: pytest 3066 passed / 6 skipped; Layer 2 1810
  passing; drift guard green. Layer 3 unrun locally (environment; CI is the
  signal). Extension `0.47.0` staged, publish operator-gated.
