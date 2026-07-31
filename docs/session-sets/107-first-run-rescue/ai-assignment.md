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

---

## Session 2 of 3 — the new `hello-world.md`, and relocating the old one

- Orchestrator: claude / anthropic / claude-opus-5 / high (operator-invoked).
  **S1's disposition recommended `openai / gpt-5-6`;** the operator launched
  Claude instead. Recorded, not re-argued — the operator owns scheduling and
  engine choice, and the memory of a very limited Copilot/spend budget makes a
  provider switch a real cost, not a free one. The consequence that *does* bind
  this session: S1's code and S2's prose now share an author, so the
  fresh-eyes reading S1's disposition wanted has to come from somewhere else —
  it comes from the mandatory cross-provider verification (anthropic excluded)
  and from routing the authoring itself off-provider.
- Routed step-3.5 analysis: `s2-ai-assignment-analysis.json` (route
  `task_type=analysis`, excl. anthropic → gemini-pro, tier 2, $0.0168).
- Set-level facts carried from the spec (immutable at runtime): **Full tier**,
  `requiresUAT true` (S3 runs the stopwatch walk; **this session writes the
  document that walk executes**), `requiresE2E true`, `pathAwareCritique
  advisory` (set-terminal, in S3). Not re-litigated here.
- Budget note: this session is prose, greps and one gate — the cheapest of the
  three. It draws on the **`DABBLER_*` provider keys** only (routed authoring +
  routed semantic review + mandatory verification) and spends **zero Copilot
  seat capacity**.

### Routing plan

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Register; read S1's disposition; **run `Try a sample project` and record what a reader actually sees** (dialog labels, messages, rendered tree, the start affordance). | Orchestrator direct — reconnaissance. Its *output* is the ground truth every later step depends on, so it is written down as an artifact, not held in context. |
| 2 | Author the new `docs/tutorials/hello-world.md`. | **Routed** (`documentation`) — always-route type, and this is the set's actual deliverable: cognitive load is the product. Departure from the analyst below. |
| 2b | Bind every literal in the routed draft to `bundle.json` and to the command's real strings. | Orchestrator direct — mechanical substitution against a contract; generating literals independently would be circular (S1's step-8 precedent). |
| 3 | Relocate the 448-line tutorial to `adopt-dabbler.md` + one labelled note. | Orchestrator direct — `git mv` plus one inserted note. |
| 4 | Move `docs/tutorials/video/` with it; repoint the README, nine scene links and the traceability tables; state the new tutorial's scene is deferred. | Orchestrator direct — mechanical, but **L-065-1 applies**: every echo in one pass, then grep for the old claim. |
| 5 | Repair every inbound link. | Orchestrator direct — but see the **scope correction** below; the spec undercounts the inbound set. |
| 6 | Duplicate-procedure check against the concept-ownership table. | **Mechanical grep AND routed** (`analysis`) — the grep gathers evidence, the routed pass reads for paraphrase. Neither alone answers the question. |
| 7 | The literal gate covering both documents. | **Routed** (`test-generation`) for the assertion *design*; orchestrator-direct for wiring it into pytest + CI. Scope correction below. |
| Verify | Phased `verify_session` for this set. | **Routed** — `session-verification`, anthropic auto-excluded per the no-skip mandate. |
| Close | `disposition.json`; commit + push; `close_session`; notify. | Orchestrator direct. |

### Where this departs from the routed analyst, and why

**Adopted:** its step-2 routing, its step-6 answer (semantic, not literal — a
literal grep finds repeated *strings* and the ownership table is about repeated
*procedures*), its step-7 routing, and — most usefully — its **missing step**.

**Adopted with a change of shape (E, the missing step).** The analyst wants an
orchestrator "desk check" of the new tutorial *before* the gate is written and
before S3's human walk. That is right, and it is the same instinct
`project-guidance.md` already encodes as an operator-set bar: *any step
automation can verify must be verified before the checklist is offered to the
human*, and *untested instructions are not known to be followable*. Set 106
declined this exact recommendation on the grounds that the desk check **is** the
S4 walk — and then its verification loop found fifteen defects whose dominant
class was "a step that cannot be performed from the state the previous step
leaves behind," with both mechanical gates green the whole time. That is the
precedent, and it argues for adopting the check, not declining it again.

The change of shape: this is **not** a rehearsal of S3. S3's walk is defined by
resources this session does not have — a clean VS Code profile, a released
VSIX, no editable install, a stopwatch. Running a half version of it here would
produce partial evidence that invites S3 to be skipped, which is the failure
Set 106 correctly feared. So the check is scoped to exactly what this machine
*can* falsify and S3 should not spend human minutes discovering: **does each
step's stated precondition hold given the state the previous step leaves
behind, and does every literal match reality?** Recorded as `s2-desk-check.md`,
naming what it does *not* establish (timing, clean-profile behavior, released-
VSIX behavior) so it cannot be mistaken for the acceptance test.

**Departed from — A, step 2's authoring.** The analyst proposes: route the whole
document with `bundle.json` as context and instruct the model to derive the
literals, then route a second `analysis` pass to check them. The second half is
sound; the first half is not. A model asked to *derive* literals from a bundle
it can only read as pasted text will paraphrase some of them — and this
document's literals are the one thing S3's walk cannot recover from, because a
reader who types a command that does not exist stops. So: **route the prose,
bind the literals mechanically.** The prompt supplies the exact strings as
fixed quantities rather than asking for them to be derived, and step 2b
re-substitutes every one from `bundle.json` and the command's real source
afterwards. The routed model is being asked for the thing it is actually better
at — sequencing, framing, and holding a hard negative constraint across 150
lines of prose — and not for a job a `json.load` does perfectly.

**Departed from — the next-orchestrator effort.** The analyst says `medium`.
S3 is the set's only real acceptance test, it carries the set-terminal close,
the advisory path-aware critique and the Step 9 guidance review, and it is the
session where a wrong call costs operator walk-time. `high`.

**Recorded, not adopted — C.** The analyst's gate assertions are directionally
right but two of its five name things that do not exist (`dabbler-ai run`,
`files/tests/test_main.py`). Corrected against the real bundle below. This is
the second consecutive session where the analyst invented an identifier; treat
its *judgement* as valuable and its *literals* as unverified.

### Scope corrections this session inherits

**1. The spec's step 5 undercounts the inbound links.** It names `README.md`,
`docs/quick-start.md`, `docs/module-reorganization.md` and the two templates.
A grep finds more that are *semantically* wrong after the move, because they
point at `hello-world.md` while describing the content that becomes
`adopt-dabbler.md`: `docs/tutorials/module-team-hello-world.md` (the tombstone
redirect), `docs/tutorials/release-and-recovery.md` ("Reference for after the
Hello World tutorial"), `docs/quick-start.md:305` (which describes it as
"GitHub + GitHub Copilot"), and the nine video scripts. Under L-065-1 the fix
is one pass over every echo, and the test is not "does the link resolve" but
"does it point at the document that owns what the sentence claims."

**2. Set 106's "committed literal gate" is run by nobody.**
`s3-check-literals.py` lives in `docs/session-sets/106-.../` and is not
referenced by CI, by pytest, or by any npm script — it is a re-runnable
artifact, not a gate. Extending it in place would satisfy the spec's words and
not its purpose ("so the two tutorials cannot drift apart silently"). This
session authors its **successor** at repo level, wired into the pytest suite
and therefore into CI, the way `drift_guard.py` already is. The 106 script is
kept and left working — it is cited in that set's evidence and must not be
invalidated.

**3. The residual S1 handed over.** `bundle.json`'s own README names
`hello-world.md` as its third consumer and says the binding is "not yet bound…
the one place this contract can drift silently." Discharging that is what step
7 is *for*; the gate's assertions are therefore drawn from `bundle.json`'s
enforced-field table, not invented.

### The gate's assertions (C, corrected against the real bundle)

Every one is derived from `bundle.json`, which is already the source of truth
for the other two consumers:

1. Every `Dabbler: <Title>` string in `docs/tutorials/**` resolves to a real
   contributed command title in the extension's `package.json` (inherited from
   106 — it is the check that catches a reader typing a command that does not
   exist).
2. `bundle.json`'s `expectedProgramOutput` lines appear verbatim in
   `hello-world.md`.
3. `bundle.json`'s `expectedTestCount` and the before/after test tallies the
   tutorial prints are consistent with it.
4. Every sample file path the tutorial quotes exists in
   `docs/templates/sample-project/files/` (with the `dot-` rendering rule
   applied), and `programEntryPoint` / `sampleSetSlug` / `missingFunction`
   appear as the tutorial's literals rather than as paraphrases.
5. Every relative markdown link under `docs/tutorials/**` resolves on disk
   (inherited from 106 — this is what a two-document split breaks first).
6. The negative constraint is machine-checked: `hello-world.md` contains no
   `git <subcommand>` invocation, no YAML fence, and none of the governance
   vocabulary the spec forbids. **This is the assertion the analyst did not
   propose and the one most specific to this set** — the deliverable is defined
   by what is *absent*, and absence is exactly what a human re-reader stops
   noticing after the third pass.

### D — the step most likely to be done badly

The analyst says step 6. I disagree: step 6 has a routed reviewer and an
explicit table to check against. **The likelier failure is step 3**, the
relocation — because it is the step that *looks* mechanical. "Unchanged in
substance" is doing real work in that sentence: the old document opens by
telling the reader this is their first contact with the product, and it is
about to stop being that. A pure `git mv` leaves a document whose first
paragraph is now false, and L-064-8 is the lesson that names this exact class
(*a replacement doc inherits the retired doc's claims at its peril* — here in
its mirror form: the **relocated** doc keeps framing that was true only in the
position it just left). Mitigation: after the move, re-read `adopt-dabbler.md`'s
framing paragraphs specifically for first-contact claims, and let the routed
duplicate-procedure pass see both documents so it can catch the seam.

### Next-orchestrator recommendation

**openai / gpt-5-6, model `gpt-5.6`, effort high** — the analyst's engine, at a
raised effort. S3 is a timed human walk plus the set-terminal close; a provider
that authored neither S1's code nor S2's prose reads the tutorial the way a
stranger does, which is the whole point of the walk. Second choice if the
operator prefers continuity: claude / anthropic / claude-opus-5 / high. Either
way S3's verification excludes whichever provider orchestrates it.

Budget: S3's real cost is **operator time** (~45 minutes) plus the `DABBLER_*`
keys for verification, the advisory path-aware critique and the Step 9 review.
Zero Copilot seat capacity. The operator-supplied preconditions in the spec are
the gating input — S3 stops and reschedules if any is missing.

### Next-session-set recommendation

The analyst recommends **the owed `adopt-dabbler.md` walk**, with Increment B
as runner-up — inverting S1's ordering. Its argument is that this session
leaves `adopt-dabbler.md` relocated but never walked, and that a known-stale
user document should not be left standing while new features are added.

That is a fair reading and it matches the standing debt already recorded (Set
106 was cancelled with that walk never performed). But **the decision should
not be made here.** S3's stopwatch produces the number that decides it: if the
first run comes in at 15 minutes, the first-run problem is closed and the debt
is the right next move; if it comes in at 40, remediating the first run
outranks both candidates. Both S1 and this session therefore record the same
thing — the ordering is the operator's, taken at the set-terminal close with
S3's number in hand.

Budget note for both candidates: `DABBLER_*` keys. The `adopt-dabbler.md` walk
additionally costs **operator hours** and, because that document covers hosts
and pull requests, is the one candidate that could touch Copilot seat capacity
— name it explicitly when that set is authored.

### Actuals (filled at close)

- *(pending)*

---

## Session 3 of 3 — the stopwatch walk, remediation, close-out

- Orchestrator: claude / anthropic / claude-opus-5 / high (operator-invoked).
  **S2's disposition recommended `openai / gpt-5-6`** on the reasoning that a
  provider which authored neither S1's code nor S2's prose reads the tutorial
  the way a stranger does. The operator launched Claude again. Recorded, not
  re-argued — and the reasoning behind that recommendation is **discharged by
  something better this session**: the stranger reading the tutorial is not an
  orchestrator at all, it is **the operator, on a second machine, with a clean
  profile and a clock**. That is the whole point of S3. The orchestrator's job
  here is instrument-building and bookkeeping, not reading.
- Routed step-3.5 analysis: `s3-ai-assignment-analysis.json` (route
  `task_type=analysis`, excl. anthropic → gemini-pro, tier 2, $0.0190).
- Set-level facts carried from the spec (immutable at runtime): **Full tier**,
  `requiresUAT true` — **this session executes the walk that flag has been
  pointing at since the spec was authored** — `requiresE2E true`,
  `pathAwareCritique advisory` (set-terminal, runs here).
- Budget note: **this session spends Copilot seat capacity**, and it is the
  first in the set to do so. The operator chose GitHub Copilot as the walk's
  agent over Claude Code, which costs nothing from that budget, on the grounds
  that Copilot is what the staff who abandoned the old tutorial actually use —
  a more representative walk is worth the seat time. One sample session's worth.
  Everything else here draws on the `DABBLER_*` keys.

### The release question, answered before the walk

The operator asked whether to **push a new tag** before switching to the
Copilot machine. **No** — and the reasoning is worth recording, because the
instinct is a reasonable one:

1. The walk exercises `Dabbler: Try a sample project` and the sample bundle.
   Both shipped in **0.47.0, which is already published** to the Marketplace.
2. `git diff vsix-v0.47.0..HEAD` over the shipped extension touches exactly two
   files — `getting-started.md.template` and `monorepo-ci.yml.template`, whose
   tutorial links S2 repointed. **Neither is on the walk path**: the tutorial
   never scaffolds a repo, so no template is rendered at any point in it.
3. `package.json` is still at `0.47.0`. A new tag therefore needs a version bump
   first or the publish workflow's version check refuses it — so "just push a
   tag" is not a formality, it is **cutting 0.48.0 for a link description**,
   which is exactly the release the operator already declined on 2026-07-30 when
   the CHANGELOG entry was moved to `[Unreleased]`.

The walk machine needs the **Marketplace build and the repo's tutorial**, and
both already exist at the versions the walk should measure.

### Routing plan

| Step | Action | Routing decision |
| :--- | :--- | :--- |
| 1 | Confirm preconditions; establish that the published 0.47.0 is walk-valid by diffing it against HEAD. | Orchestrator direct — a diff and a judgement about what the tutorial touches. |
| 1b | Run the automation floor **before** the checklist reaches the human: pytest, `tutorial_gate.py`, Layer 3. | Orchestrator direct — the operator-set bar (*any step automation can verify must be verified before the checklist is offered*), not a reasoning task. |
| 2a | Author the UAT checklist's prose. | **Routed** (`documentation`, anthropic excluded) — a measuring instrument written for a reader with zero context is exactly the authoring the delegation rule sends out, and a provider that did not write the tutorial is the right one to ask *what would a stranger need told*. |
| 2b | Bind every product literal in the checklist to shipped source. | Orchestrator direct — mechanical substitution against a contract, by a builder script rather than by hand. **This caught two defects in the routed draft** (below). |
| 3 | The walk. | **Human.** Not routed, not simulated, not desk-checked. |
| 4 | Triage and remediate what the walk finds. | **Routed** where the fix needs judgement (`code-review` / `documentation`); direct for a wording change under ~50 lines. Scope rule below. |
| 5 | UAT attestation and the in-window time. | Orchestrator direct — transcription of the operator's record, with its provenance stated. |
| 6 | Verify; path-aware critique; `change-log.md`; Step 9. | **Routed** (`session-verification`, `analysis`, `documentation`); close-out direct. |

### The operator resized the instrument, and was right to

Step 2a shipped **nine items**, and the operator's verdict was *"daunting and
tedious"* — that UAT should confirm the most important things and leave the human
free to volunteer what annoyed them, rather than carry a dedicated item for every
cosmetic detail. Rebuilt to **four**: human-facing text 15,149 → 2,588
characters, preamble 4,777 → 1,313, six clock marks → two.

The failure was one of **altitude**, not of care. The nine items were answering
questions nobody had asked — a separate item for reading the prerequisite list,
one for the extension install, one for a failure path the walker was explicitly
told not to trigger — and a `TUTORIAL-QUALITY CHECK` paragraph was bolted onto
every one of them, interrogating the human where a single line in the preamble
does the same job better.

The standing UAT bar in `project-guidance.md` is about **ambiguity** (name the
exact button, quote the exact string) and this checklist still obeys it. What the
bar lacked was a companion rule about **volume**. Proposed for Step 9.

### What the literal-binding caught in the routed draft

The routed checklist read well and was wrong twice, both times about product
behaviour it had no way to know:

- It told the walker to expect **"a new VS Code window opens"**. The command
  calls `vscode.openFolder` without `forceNewWindow`, so the **current window
  reloads**. A walker told to expect a second window would have recorded a
  defect that does not exist.
- It quoted the progress notification's stages from prose rather than from the
  code. The builder's first scoping was wrong too and **pulled
  `SAMPLE_STEP_PHRASE`** — same keys, different strings, they are fragments of
  the *resume* sentence — so the checklist briefly quoted five stage labels the
  reader would never see. Same coincidence-satisfies-the-check class S1's
  third-provider opinion and S2's gate each found; caught here only because the
  builder **prints every bound literal** for inspection instead of trusting the
  substitution.

The builder additionally asserts each bound literal still appears in the
tutorial (whitespace-normalised, because the product's own strings are reflowed
across lines in the document — the false-negative S2's gate hit on the Full-tier
sentence).

### Departures from the routed analyst

**Adopted:** its `C_pre_verification` list verbatim (pytest, the gate, Layer 3),
its `E_failure_mode` — *evidence substitution*, the orchestrator quietly
standing its own desk evidence in for the human's number — and its
`F_missing_step`, a re-run of the gate and suite after any remediation.

**Departed on the timing protocol (B) — and then the protocol was overtaken by
events. Read this whole entry before citing it.** The analyst wanted the walker
to **stop the clock while the AI agent thinks** and restart it afterwards.
Rejected on two grounds. Mechanically, it asks a person to operate a stopwatch at
the exact moment their attention is on a chat window, which is where timing data
goes to die. Substantively, it answers the wrong question: a developer who waited
six minutes for their agent *waited six minutes*, and the criterion is about the
developer's experience. The first checklist therefore recorded **six clock
times** and derived four durations, so agent time was a visible subtotal inside
the headline number rather than silently subtracted from it.

**What actually happened, recorded here because the design above is not what
produced the number.** The operator rejected that checklist as *"daunting and
tedious"*, and the six-mark protocol was part of what made it so. It was cut to
**two marks** — note the time at `Ctrl+Shift+P`, note it again at
`HELLO, WORLD!` — with agent time and install time demoted to *"if you can"*.
The walk was then performed **before even that version existed**, so **no clock
mark was written down at all**; the recorded result is the operator's after-the-
fact estimate of the in-window time, and it is labelled as an estimate
everywhere it appears (`s3-walk-evidence.md`, every `Result` field, the
disposition).

**So: no six-mark protocol was ever executed, and none of the four derived
durations exist.** The reasoning above is retained because the *rejection* of
the stop-the-clock design still stands on its merits and a future set may face
the same choice — but a reader must not infer from it that the "under 15
minutes" figure carries six-mark precision. It does not. It carries the
precision of a competent person's estimate, which is what was available, and the
honest move was to say so rather than to manufacture a number or discard a real
first run.

**Departed on the walk's own setup.** The analyst's plan starts at the extension
install. A clean profile carries **no extensions at all**, including the
operator's AI agent — so the walk has a prerequisite cost the tutorial's reader
does not pay, and it must not be allowed to contaminate the measured window.
The four-item checklist keeps the exclusion and drops the bookkeeping: setup is
simply outside the two marks. **The walk proved the point emphatically** — the
operator's dominant cost was a GHE-linked Windows account, a `runas` launch
script and three separate logins, none of which the tutorial asks for and none
of which the sample needs. Had that landed inside the number, the tutorial would
have been blamed for an identity-onboarding problem.

**Departed on one instruction the analyst's shape would have produced.** A
checklist that asks the walker to confirm Git is present would have them type
`git --version` — and the criterion this walk answers is partly *did the reader
have to touch git*. The prerequisite item therefore forbids typing it and asks
instead whether the document told them enough to know. **An acceptance test must
not contaminate the thing it measures.**

### The remediation scope rule (step 4)

Sharper than the analyst's, because the analyst's boundary ("is the fix in the
tutorial or the command") does not say what to do with the case that actually
decides the set:

- **Tutorial wording, ordering, or a missing expectation** → fixed here.
  Re-run `tutorial_gate.py` and the suite after; a wording fix that breaks the
  literal binding is a worse defect than the one it fixed.
- **A defect inside `Dabbler: Try a sample project`** → fixed here, and it forces
  a version bump whose **publish stays operator-gated**. A code fix means the
  walk measured a build nobody can install, so the evidence must say which
  parts of the walk predate it.
- **Anything else** — another extension surface, the router, VS Code, Copilot —
  → recorded, named for a follow-on set, **not fixed**.
- **"Re-walk only the remediated items" may claim exactly one thing**: that the
  remediated step now works. It may **not** re-claim the headline number. The
  first walk's interaction time stands as the measurement; a second attempt is
  reported as a second attempt.

### Next-orchestrator / next-session-set recommendation

Filled at close, with the walk's number in hand — both S1 and S2 recorded that
the ordering between the owed `adopt-dabbler.md` walk and Increment B is decided
by it, and the routed analyst agrees in both directions (≤15 min → Increment B,
the first-run problem being closed; >15 min → remediating the first run
outranks both).

### Actuals (filled at close)

- *(pending)*
