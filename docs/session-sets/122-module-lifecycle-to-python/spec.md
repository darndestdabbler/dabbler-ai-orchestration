# Module Lifecycle Moves To Python Spec

**Operator priority, 2026-08-11:** *"the next most important thing that my
staff will want solid"* — to run immediately after Set 115.

**This set implements decisions already taken.** It does not re-open the
architecture. Everything below traces to
[`proposals/2026-08-11-multi-module-architecture/verdict.md`](../proposals/2026-08-11-multi-module-architecture/verdict.md),
which two providers reached independently, plus the operator's
confirmation of all seven points on 2026-08-11.

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
- **Not re-engineering `lessons-learned.md`** in the Session 3
  partitioning. Verdict §7 exempts it explicitly — it is already headed
  for deletion under the executable-or-drop rule.
- **Not building anything for the next-week protocol.** Verdict §6.

---

## Sessions

### Session 1 of 3: The lifecycle CLI

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
5. Full pytest at close after freeze; verify, close.

**Creates:** `ai_router/modules.py` and its tests
**Touches:** `ai_router/`, `ai_router/tests/`
**Ends with:** every module lifecycle operation is available from Python, with the refusals and rollback the extension never had.
**Progress keys:** `cliShipped`, `refusalsEnforced`, `rollbackFalsified`

---

### Session 2 of 3: Thin launchers, and the command made visible

The commands already exist and are already on the menu. This session
changes **what happens behind them** and **what the developer sees**.

**Steps:**

1. Register.
2. **Point the five existing context-menu commands at the CLI**, passing
   an explicit repo root and slug, showing output and refreshing the tree
   (verdict §4). Then **delete the lifecycle logic from
   `moduleAuthoring.ts`** rather than leaving two implementations — the
   duplication is the defect Set 120 spent a session removing elsewhere.
   **Do not change any command id:** renaming one breaks keybindings,
   `when`-clauses and Layer 3 fixtures, and the 2026-08-11 menu trim
   deliberately renamed titles only, verified against all 52 ids.
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
5. `package.json` is the extension MANIFEST, so **`L-064-12` applies**:
   run the full `npm run test:playwright` after the last edit, not before.
   Then full pytest, verify, close.

**Creates:** thin launchers, the visible-command surface, the module copy-prompt menu entry
**Touches:** `tools/dabbler-ai-orchestration/src/utils/moduleAuthoring.ts`, `src/commands/`, `package.json`
**Ends with:** one implementation of module lifecycle, in Python, and a developer who can see and reproduce every command the extension runs.
**Progress keys:** `launchersWired`, `commandEchoed`, `tsWriterRemoved`, `copyPromptOnMenu`

---

### Session 3 of 3: Remove the guaranteed merge conflicts

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
5. Full pytest at close after freeze; verify, close.

**Creates:** the partitioned layout, the concatenation script, the collision refusal
**Touches:** `ai_router/`, `ai_router/tests/`, `docs/`
**Ends with:** two developers running concurrent sessions no longer collide on an append-only file or a set number.
**Progress keys:** `filesPartitioned`, `roundTripFalsified`, `collisionRefused`

> **Irony budget: 30 new test functions across all three sessions.**
> Below Set 120's 40 because Session 2 is mostly replacement behind
> existing commands, already covered by the menu-parity test. Session 1
> should take most of it — the refusals and rollback are where the risk
> is. If the design cannot be covered in 30, simplify the design.

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
