# Module reorganization and legacy migration

> **When to read this:** you already have a project running and now want
> to **rename**, **delete**, **add**, **split**, or **merge** modules — or
> you have an older repo that predates modules and want to adopt them. For
> the concepts behind modules, read the
> [Module-Organized Projects Primer](planning/module-organized-projects-primer.md);
> for a hands-on team setup, the
> [three-person Hello World walkthrough](tutorials/module-team-hello-world.md).

A **module** is a unit of work owned by one developer at a time, declared
in `docs/modules.yaml` (`slug`, `title`, `codeRoots`, `planPath`,
`touches`). The Work Explorer groups session sets by their `module: <slug>`
stamp. Session-set **names** are globally unique across all modules;
`module` is only a grouping attribute, never part of a set's identity —
which is what makes re-homing a set cheap and lossless.

The built-in Work Explorer actions cover the common **1:1** operations
(rename one module, delete one module, add one module). The **N:M**
operations (split, merge, move specific sets) have no single button by
design — you ask your AI agent, which is both more flexible and safer to
review. Everything below is reversible or recoverable; none of it destroys
completed history.

---

## Renaming or deleting the scaffolded `Default` module

A fresh **Build project structure** scaffolds a real `default` module with
two starter sets (`001-default-plan`, `002-default-decomposition`) — the
Visual Studio `Class1` pattern: a working starting point, not a template
to study. Once you know your project's real module names, dispose of it
from its row in the Work Explorer — but pick the right action:

- **Rename** `Default` into your first real module when you have already
  **run its sets** (the decomposition set writes work sets stamped
  `module: default`). Rename **re-homes** every one of them to the new
  slug — nothing is lost.
- **Delete** `Default` only when you have **not** invested work in it yet
  (its sets are still the unstarted starter scaffolds, which delete removes
  cleanly), or when you genuinely want to discard it. Delete **cancels**
  any non-terminal set stamped `module: default` — recoverable, but not
  what you want for work you mean to keep. To turn one Default into
  *several* real modules, rename it into the first and **Add** the rest —
  then, if some of Default's sets belong under those other modules, move
  them with the split/merge path below (rename alone re-homes *every* set to
  the first module).

On a fresh scaffold every set is born stamped, so you never have to think
about the pseudo-module (below) at all.

---

## Rename a module

Use the **Rename Module…** action on the module's row in the Work Explorer
(declared modules only), or the `Dabbler: Rename Module` command. The
rename is **transactional** — all-or-nothing, with rollback on any failure:

1. Rewrites the module's `slug` and/or `title` in `docs/modules.yaml`,
   preserving the file's formatting.
2. If the `slug` changed, restamps `module: <old>` → `module: <new>` in the
   `spec.md` of **every** set that belongs to the module — zero orphans. A
   title-only rename skips the restamp entirely.

The rename **refuses** (nothing is touched) when:

- the new slug is invalid or already belongs to another declared module;
- the new slug collides with an **undeclared** slug that already carries
  stamped sets (the silent history-merge hazard); or
- any affected set has a **running** session.

## Delete a module

Use the **Delete Module…** action on the module's row (declared modules
only), or the `Dabbler: Delete Module` command. Delete never destroys
completed history or in-flight work — worst case it *cancels* (recoverable):

1. Removes the module's entry from `docs/modules.yaml`.
2. Handles each set stamped `module: <slug>` by state:
   - **Complete or already-cancelled** sets are left untouched — their
     history is preserved.
   - An **unstarted, clean lifecycle scaffold** (a `plan`/`decomposition`
     set with no work done) is removed outright — it was only a starter.
   - **Any other non-terminal** set (real work in flight) is **cancelled**
     via the normal cancel writer, reason auto-noted `module <slug>
     deleted` — never hard-deleted.
3. Refuses while any affected set has a **running** session.

## Add a module

Use the **Add Module…** action on any module's row (the row is just a
convenient reach — Add always creates a brand-new module, never one tied to
that row), or the `Dabbler: New Module` command:

1. Prompts for a `slug` (kebab-case) and a display `title`.
2. Appends a `docs/modules.yaml` entry with `codeRoots: []` and
   `touches: []`.
3. Creates a plan stub at `docs/modules/<slug>/project-plan.md`.
4. Scaffolds the module's two lifecycle sets — `NNN-<slug>-plan` and
   `NNN-<slug>-decomposition`.

Add does **not** capture `codeRoots` or `touches` — hand-edit those into
`docs/modules.yaml` afterward (an integration module that only composes
others declares `codeRoots: []` and lists its `touches`).

## Split, merge, or move sets — ask the AI

Rename and Delete are 1:1. Splitting one module into two, merging two into
one, or moving specific sets between existing modules has **no single UI
action** — describe the outcome to your AI agent instead:

> "Split the `platform` module into `platform-api` and `platform-web`, and
> move the sets about the web UI to `platform-web`."

The agent edits `docs/modules.yaml` (add/remove/modify entries), restamps
the affected sets' `module:` keys, and moves code roots as needed. You
**review the diff before committing**. Because a set's name is globally
unique and independent of its module, re-homing a set is just a `module:`
stamp change plus (if code moves) a `codeRoots` edit — no set is renamed
and no history is lost. Do reorgs as their own small PR; for anything
non-trivial, have the AI author a short **session set** for the reorg so it
runs through the normal verified pipeline.

## Adopting modules in a legacy repo (optional)

There is **no forced migration** — no modal, no auto-stamping, no deadline.
A repo with no `docs/modules.yaml` (or an empty `modules: []`) keeps working
unchanged forever: its sets render under a single pseudo-module labelled
**Default**. Adopt modules only when you want to, at your own pace:

1. **Declare your modules** in `docs/modules.yaml` — via **Open
   modules.yaml** + **Copy AI decomposition prompt** in the Getting Started
   form, **Add Module…** per module from the tree, or by hand.
2. **Stamp existing sets** into their modules with the pseudo-module row's
   **Assign legacy sets to module…** action (or `Dabbler: Assign Legacy
   Sets to Module`): pick a target declared module, then one-or-more
   currently-unstamped ("legacy") sets, and each gets `module: <slug>`
   written into its `spec.md`. **No files move** — only the stamp changes.
3. **Adopt the lifecycle going forward** for new work. **Add Module…** and a
   fresh Build's `default` module scaffold a module's `plan` +
   `decomposition` starter sets automatically — but a module you declared via
   the AI decomposition prompt or by hand does **not** get them, so pick
   whichever of these fits (never forced, and you never retrofit finished
   work either way):
   - **Adopt the lifecycle sets — manual or AI.** Give the module the same
     two starter sets a scaffolded module has: author a `kind: plan` set and
     a `kind: decomposition` set for it (the decomposition set's
     `prerequisites:` points at the plan set). The quickest path is to ask
     your AI agent — *"scaffold plan and decomposition lifecycle sets for the
     `<slug>` module, mirroring the default module's `001-default-plan` /
     `002-default-decomposition`"* — or copy those two `spec.md` files, renumber
     them, and restamp `module: <slug>`. Then run the plan set, then the
     decomposition set, exactly like a fresh scaffold.
   - **Or author work sets directly** with **`Dabbler: Generate Session-Set
     Prompt`** (pick the module) — a complete alternative if you don't want
     the plan/decomposition ceremony for this module.
   Completed sets stay exactly as they are.

> **Labelling note (Set 091):** if you declare a literal `default` slug,
> the pseudo-module for still-unstamped sets labels itself **Unassigned**
> (not "Default") to avoid confusion with your declared `default` module.
> If you ever see **Unassigned**, some set is missing its `module:` stamp.
