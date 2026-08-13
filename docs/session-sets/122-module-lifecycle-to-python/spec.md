# Module Lifecycle Moves To Python Spec

**Operator priority, 2026-08-11:** *"the next most important thing that my
staff will want solid"* — to run immediately after Set 115.

**This set implements decisions already taken.** It does not re-open the
architecture. Everything below traces to
[`proposals/2026-08-11-multi-module-architecture/verdict.md`](../proposals/2026-08-11-multi-module-architecture/verdict.md),
which two providers reached independently, plus the operator's
confirmation of all seven points on 2026-08-11.

> **Before starting this set, read
> [`feature-candidates.md`](feature-candidates.md).** The operator supplied
> module-UX and initial-planning design intent on 2026-08-12 (clean-project
> first run, a module context menu with **View Help**, and a baked-in
> `000-initial-plan-and-design` set whose interactive activities cover
> plan import/creation, module-design consideration, and decomposition
> into sets). Some of it lands inside Sessions 1–2 as specified; some is
> new scope. That file records the intent, the seams, and four tensions to
> resolve — including an unresolved *steps vs sessions* ambiguity — and is
> **not** a change to the three sessions below.

> **Authoring correction, recorded because it nearly cost the set its
> point.** A first draft of this spec made the Python lifecycle CLI a
> **non-goal**, on the grounds that it is a large port no developer can
> see. That was wrong: verdict §4 **adopts** the CLI, and the operator
> re-confirmed it. The port is not cleanup deferred for taste — it
> **restores an invariant the project believes it already has**
> (`src/utils/cancelLifecycle.ts:296` writes `session-state.json` from
> TypeScript today, reached through the `deleteModule` path; verified
> still present 2026-08-11). The draft's one durable finding is kept
> below: most of the *menu surface* already exists, so Session 2 replaces
> implementations rather than adding commands.

## Session Set Configuration

```yaml
requiresUAT: false        # The deliverables are a CLI judged by tests, thin launchers judged by the existing menu-parity test, and a partitioning script judged by a concatenation round-trip. No new rendering surface.
requiresE2E: false        # Set-wide default. Session 2 edits package.json, which is the extension MANIFEST, so L-064-12 applies and that session runs the full Playwright suite at its close — declared in the session, not here.
uatStyle: ad-hoc
prerequisites:
  - slug: 115-work-explorer-session-node-ux
    condition: complete
```

> **Amended 2026-08-13 (after Session 1 closed): this set has FOUR sessions.**
> Session 4 was added by operator decision — journaled in `decisions.jsonl`,
> authority `human`, rubric line `external-consequence`. The configuration
> block above is unchanged and stays immutable; only the session plan grew.
> `totalSessions` moves 3 → 4 through the sanctioned writer, by passing
> `--total-sessions 4` to `start_session` at Session 2's registration — never
> by hand-editing `session-state.json`.
>
> **Why.** Session 2 makes the extension depend on `python -m
> ai_router.modules`. Live PyPI is `0.34.0`; this repo stages `1.0.0`. The
> setup flow's install path is a plain `pip install dabbler-ai-router`
> (`aiRouterInstall.ts:431` — only the *update* mode passes `--upgrade`),
> which pip reports as already-satisfied against an existing `0.34.0` venv.
> So every **existing** project would take the Marketplace update and then
> fail every module command with `No module named ai_router.modules`. The
> operator publishes both registries immediately after this set lands, which
> makes the guarantee a release blocker rather than a follow-up.
>
> **Amended again 2026-08-13 (after Session 2 closed): the two remaining
> sessions SWAPPED NUMBERS.** The router guarantee is now **Session 3**;
> the append-file partitioning is now **Session 4**. The content of both
> is unchanged — only the numbers moved.
>
> **Why.** Session 2's close journaled an operator decision to *"run
> Session 4 next, before Session 3."* `start_session` **refuses to skip
> ahead** (`start_session.py:948`, exit 3): contiguous closure is a
> structural assumption of the extension's in-flight predicate and of
> `compute_effective_completed_sessions`, so a gap is not a shape the
> protocol models. Renumbering is therefore the only way to express the
> operator's ordering through the sanctioned writer. Operator-confirmed
> 2026-08-13 and journaled in `decisions.jsonl`.
>
> **Reading the older records.** Session 2's `disposition.json` and the
> 2026-08-13 decision entry both say *"Session 4"* where they mean the
> router guarantee, and residual **`S122-S2-R3`** names its owner as
> *"Set 122 Session 4"* for the same reason. Those artifacts are raw
> records and are **not** rewritten; read them as naming the router
> guarantee, which is the session numbered **3** from here on. The
> partitioning session inherited the number 4 and none of that history.

---

## What is already decided (verdict §8, operator-confirmed)

1. **One repo, one worktree per active session.** Not one shared working
   directory — that distinction is the entire ruling.
2. **`modules.yaml` committed, one developer per module**, before
   concurrent work begins.
3. **Reserve set numbers in chat before scaffolding** — the collision is
   real, and `resolve_set.py` treats it as a bug.
4. **Freeze shared config; route cross-module changes through one owner.**
5. **Small PRs daily; one merge captain who tests the merge result** —
   individually green is not jointly green.
6. **Build no new tooling** for the next-week protocol. It is process.
7. **Python CLI for all module operations**, launched from the context
   menu, **with the command echoed so developers see what is executed.**

Points 1–6 are **process and need no code.** This set exists for point 7,
plus the two follow-on items the verdict names (§7 partitioning, §9).

## What the tree already provides

Measured 2026-08-11, and it changes Session 2's shape:

| | state |
| :--- | :--- |
| Module commands contributed | **7** |
| Already on `view/item/context` | **5** — new, rename, delete, open plan, assign sets |
| `copyModuleDecompositionPrompt` | exists but is **palette-only** |
| `moduleAuthoring.ts` | **2,601 lines**, scaffolds directories and appends to `docs/modules.yaml` |

So Session 2 is mostly **replacing the implementation behind commands
that already exist**, not adding a menu. That is why it is one session
rather than three.

## Decisions already made — do not reopen

1. **Transactional mutation goes through Python; prompts are for creative
   content.** Verdict §8.3. Create / rename / delete / assign-sets need
   deterministic validation, rollback, numbering and running-session
   refusal — an LLM executing a copied prompt cannot promise any of them.
2. **Dabbler runs the command it derived.** From
   [`git-transparency-proposal.md`](../planning/git-transparency-proposal.md):
   *"if Dabbler can derive the command, Dabbler itself should run it;
   telling the LLM to free-form shell out is weaker than the current
   confirm-and-run pattern."* Transparency means **showing** the command,
   not delegating it.
3. **SIMPLE is binding.** A change that makes the developer-facing flow
   harder to explain fails, however much cleaner it is underneath.
4. **Manual git stays manual.** Developers have said they will run the
   commands; do not build git automation on their behalf.

## Non-goals

- **Not the extension carve.** Separate item, later, §4a preconditions.
- **Not enforcing module boundaries.** Verdict §9 notes they are
  descriptive; the enforcement lint belongs with guidance candidate
  C-001.
- **Not re-engineering `lessons-learned.md`** in the Session 4
  partitioning. Verdict §7 exempts it explicitly — it is already headed
  for deletion under the executable-or-drop rule.
- **Not building anything for the next-week protocol.** Verdict §6.

---

## Sessions

### Session 1 of 4: The lifecycle CLI

`python -m ai_router.modules create | rename | delete | assign-sets`.
Verdict §4's adopted surface: validation, rollback, numbering,
running-session refusal, sanctioned cancellation.

**Steps:**

1. Register.
2. **Ship the four subcommands** against the existing `docs/modules.yaml`
   contract — read the shape `moduleAuthoring.ts` writes today and match
   it; this is a port, and a format change here would strand every repo
   that already has a manifest.
3. **Make the dangerous paths refuse.** `delete` and `rename` must refuse
   a module with a **running session**, and must route any
   `session-state.json` mutation through the sanctioned writer rather than
   touching the file. This is the invariant the set exists to restore.
4. **Rollback on partial failure.** A create that scaffolds a directory
   and then fails to append the manifest entry must leave neither behind.
   Ship a falsifier that injects the failure and asserts nothing is
   stranded — `L-112-1`: a gate that only ever passes proves nothing.
5. **Cross-provider verification.**
6. **Required portion of the full test suite.**
7. **Close-out.**

**Creates:** `ai_router/modules.py` and its tests
**Touches:** `ai_router/`, `ai_router/tests/`
**Ends with:** every module lifecycle operation is available from Python, with the refusals and rollback the extension never had.
**Progress keys:** `cliShipped`, `refusalsEnforced`, `rollbackFalsified`

---

### Session 2 of 4: Thin launchers, and the command made visible

The commands already exist and are already on the menu. This session
changes **what happens behind them** and **what the developer sees**.

**Steps:**

1. Register.
2. **Point the five existing context-menu commands at the CLI**, passing
   an explicit repo root and slug, showing output and refreshing the tree
   (verdict §4). **Invoke the resolved workspace-venv interpreter, never a
   bare `python`** — the launcher must run the same interpreter the install
   flow targets (`venvPython(...)` / the `dabblerSessionSets.pythonPath`
   setting), because a bare `python` on `PATH` is the documented cause of
   the `No module named ai_router` mis-diagnosis
   (`describeAiRouterImportFailure`, and the constitution's own warning).
   Branch on the CLI's exit codes: `3` = refused, nothing written; `4` =
   write failure. Then **delete the lifecycle logic from
   `moduleAuthoring.ts`** rather than leaving two implementations — the
   duplication is the defect Set 120 spent a session removing elsewhere.
   **This reaches `gitScaffold.ts` whether or not it is named here:**
   `scaffoldDefaultModuleAndLifecycleSets` calls `scaffoldNewModule`, so
   the default-module scaffold becomes Python-backed in this session.
   **Do not change any command id:** renaming one breaks keybindings,
   `when`-clauses and Layer 3 fixtures, and the 2026-08-11 menu trim
   deliberately renamed titles only, verified against all 52 ids.
   Fold in residual **`S122-S1-R1`** while here (Session 1's
   `disposition.json`): `_existing_lifecycle_slug` matches a module's
   lifecycle sets by basename suffix, so creating module `api` reuses
   `payment-api`'s sets; the identity test should be that the name, minus
   its numeric prefix, equals `<slug>-<kind>` exactly.
3. **Echo the command before running it** (operator, 2026-08-11:
   *"echoed... so developers know what commands are being executed"*).
   Show the exact `python -m ai_router.modules …` line the extension is
   about to run, in a surface the developer can read and copy, then run it
   with deterministic code per standing decision 2. A developer who wants
   to run it by hand should be able to copy what they just saw and get the
   same result.
4. **Fix `src/utils/cancelLifecycle.ts:296`** — it calls
   `atomicWriteFile(statePath, JSON.stringify(state, null, 2) + "\n")`,
   so **TypeScript writes `session-state.json` today**, reached via
   `deleteModule`. Verified still present 2026-08-11. It is the concrete
   violation that justified this whole set. Also put
   **`copyModuleDecompositionPrompt` on the context menu**; it works and
   is palette-only, and it is the operator's *"copy-prompt context menu
   items for modules"* one manifest entry away. Use the `Copy X` label
   convention, no colon.
5. **Cross-provider verification.**
6. **Required portion of the full test suite.** `package.json` is the
   extension MANIFEST, so **`L-064-12` applies**: the full
   `npm run test:playwright` is owed here alongside pytest, run after the
   last edit and never before.
7. **Close-out.**

**Creates:** thin launchers, the visible-command surface, the module copy-prompt menu entry
**Touches:** `tools/dabbler-ai-orchestration/src/utils/moduleAuthoring.ts`, `src/commands/`, `src/commands/gitScaffold.ts`, `package.json`
**Ends with:** one implementation of module lifecycle, in Python, invoked through the resolved workspace-venv interpreter, and a developer who can see and reproduce every command the extension runs.
**Progress keys:** `launchersWired`, `commandEchoed`, `tsWriterRemoved`, `copyPromptOnMenu`

---

### Session 3 of 4: Guarantee the router the launchers require

Session 2 made the extension depend on a Python module. Nothing yet
guarantees that module is *there*, or is new enough. This session closes
that gap, and it is the **release gate**: the operator publishes
`dabbler-ai-router` to PyPI and the extension to the Marketplace
immediately after this set lands, so a set that lands without this ships a
known regression to every existing project.

**The failure this prevents, concretely.** A developer's `.venv` holds
`dabbler-ai-router==0.34.0`. They update the extension. Every module
command now shells out to `python -m ai_router.modules`, which that wheel
does not contain. Re-running **Dabbler: Set Up New Project** does not help:
its install path is a plain `pip install`, which pip reports as
already-satisfied.

**Steps:**

1. Register.
2. **Declare the floor, and make the install satisfy it.** Define the
   minimum router the extension requires (`dabbler-ai-router>=1.0.0` if
   `ai_router.modules` ships in the staged `1.0.0`) in ONE place both the
   install path and the precondition read — two independently-maintained
   version constants is the drift defect this repo keeps re-finding
   (L-069-1). The setup install must **upgrade an existing older
   installation** rather than accept it: today only `mode: "update"` passes
   `--upgrade` (`aiRouterInstall.ts:431`), and `mode: "install"` does not.
   Prefer widening the existing install path over adding a third mode.
3. **Probe the capability, and refuse to proceed without it.** After
   installing, probe **the same venv interpreter the launcher will use** by
   importing `ai_router.modules` — never infer success from pip's exit code
   alone (L-125-1: compare what the transport CAN DO, not what it returns;
   L-079-3: provisioning is exactly where silent fail-open paths hide). On
   failure, do **not** run Python-backed default-module creation; report it
   and leave a supported retry path — `describeAiRouterImportFailure` is
   already the right message and the Copilot-seat gate
   (`skip-install-incomplete`, `gitScaffold.ts:638`) is already the right
   pattern. Then **fix retryability**: `gitScaffold.ts:530` gates
   default-module creation on the manifest having been created *in that
   call*, so a second setup attempt after a failed install can never
   produce the default module — the user's only recovery is deleting a
   `docs/modules.yaml` nobody told them about. Gate on the module being
   absent, not on who created the manifest.
4. **Dogfood the true cold start, and the upgrade.** L-079-3 is binding
   for any set shipping provisioning: at least one walk must begin from a
   **fresh empty folder** with no pre-seeded config and assert the
   provisioned artifacts exist. Two scenarios, both automated — the set
   declares `requiresUAT: false` and that flag is immutable, so this is a
   scripted/Layer 3 dogfood, **not** an operator walk: (a) a clean project
   with no `.venv` finishes setup with `ai_router.modules` importable from
   the created venv and the default module present; (b) a project whose
   `.venv` holds `dabbler-ai-router==0.34.0` is upgraded to a compatible
   release by setup. Assert the failure path too: an unavailable install
   attempts no Python-backed module mutation, and re-running setup after
   that failure succeeds **without** deleting the already-created
   `docs/modules.yaml`.
5. **Cross-provider verification.**
6. **Required portion of the full test suite.** This session touches the
   scaffold and install surfaces the Explorer renders from; if it edits
   `package.json`, **`L-064-12` applies** and the full
   `npm run test:playwright` is owed alongside pytest, run after the last
   edit and never before.
7. **Close-out.**

**Creates:** the version floor, the capability precondition, the cold-start and upgrade dogfoods
**Touches:** `tools/dabbler-ai-orchestration/src/utils/aiRouterInstall.ts`, `src/commands/gitScaffold.ts`, `test-fixtures/cold-start/`
**Ends with:** a project that finishes setup can run every module command, an older installation is upgraded rather than accepted, a failed install never half-creates a module, and re-running setup recovers — each proven from a fresh empty folder.
**Progress keys:** `floorDeclared`, `installUpgrades`, `capabilityProbed`, `setupRetryable`, `coldStartDogfooded`

> **Release ordering (operator-executed, not automated by this set).**
> Publish `dabbler-ai-router` first, confirm the wheel is live on PyPI,
> then publish the extension — so a newly installed extension can never
> request Python functionality the registry does not yet provide.
> Publishing is operator-only authority in every case.

---

### Session 4 of 4: Remove the guaranteed merge conflicts

Verdict §7, adopted. The one genuine conflict Option A has, with a fix
that needs no architecture change.

**Steps:**

1. Register.
2. **Partition the append-only files.** Instead of every session appending
   to one file, sessions write their own (`changelogs/121.md`,
   `metrics/121.json`), and a small script concatenates on demand. This is
   the same shape as Set 120's projection — **partitioned sources, one
   computed view** — and it removes a guaranteed conflict from every
   concurrent session. **`lessons-learned.md` is exempt** (verdict §7).
3. **Keep the concatenated view byte-identical** to what the unpartitioned
   file produced for the same inputs, and ship a falsifier proving the
   round trip. A partitioning that quietly reorders history is worse than
   the conflict it removes.
4. **Refuse a duplicate set number at scaffold time.** The protocol
   currently asks developers to reserve numbers in chat (verdict §6.4); a
   check that refuses the collision is worth more than a convention nobody
   remembers, and is far smaller than a reservation system. `resolve_set.py`
   already treats the collision as a bug — surface it before the work
   starts, not after.
5. **Cross-provider verification.**
6. **Required portion of the full test suite.**
7. **Close-out.**

**Creates:** the partitioned layout, the concatenation script, the collision refusal
**Touches:** `ai_router/`, `ai_router/tests/`, `docs/`
**Ends with:** two developers running concurrent sessions no longer collide on an append-only file or a set number.
**Progress keys:** `filesPartitioned`, `roundTripFalsified`, `collisionRefused`

---

> **Irony budget: 30 new test functions across all three sessions.**
> Below Set 120's 40 because Session 2 is mostly replacement behind
> existing commands, already covered by the menu-parity test. Session 1
> should take most of it — the refusals and rollback are where the risk
> is. If the design cannot be covered in 30, simplify the design.
>
> **Actual, recorded 2026-08-13: Session 1 shipped 41 test functions —
> already over the whole set's budget.** Recorded rather than quietly
> re-baselined, because the overrun is the interesting part. Roughly half
> is the budget being wrong rather than the design being complex: the
> spec's own steps mandate falsifiers ("ship a falsifier that injects the
> failure"), each refusal is parameterized across the shapes a running
> session can take, and verification then added a whole capability
> (lifecycle-set scaffolding + numbering) the budget never priced. Sessions
> 2–4 should **not** try to claw the overrun back by under-testing;
> Session 3 in particular ships provisioning, where L-079-3 requires a
> cold-start walk. Carry this to the Step 9 review as evidence that a
> per-set count is the wrong unit — the cap the authoring guide actually
> enforces is session SIZE, and Session 1 met that.

---

## What this set does NOT unblock

**Developers are not blocked on it.** Verdict §6 is explicit that the
next-week protocol is *process, not tooling*, and points 1–6 need no
code. Staff can start on one repo, one worktree per session, one developer
per module, reserving set numbers in chat — today.

What this set buys is that when they do, module operations are
transactional rather than best-effort, the framework stops violating its
own writer invariant, and the two files most likely to conflict no longer
do.
