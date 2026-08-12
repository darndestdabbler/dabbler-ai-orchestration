# Set 122 — feature candidates for module UX and initial planning

> **Status:** operator-provided design intent, captured verbatim-in-substance
> on **2026-08-12**, mid-Set-125. **Not committed scope.** Set 122's `spec.md`
> is unchanged in its three sessions; this file records features the operator
> wants *considered* for the modules, some of which land inside Set 122's
> existing sessions and some of which are clearly new scope.
>
> **Why this file exists:** the request arrived while another set was mid-flight,
> and the operator asked for a durable note rather than an immediate
> implementation. Read this before authoring or starting Set 122.

---

## 1. Clean-project first run

On a **clean project**, clicking the **Dabbler AI Orchestration** Activity Bar
icon shows:

- the **Default** node, carrying a context menu, and
- the three **state-grouping** nodes: **In Progress**, **Not Started**,
  **Completed**.

### 1.1 Context menu on the Default (module) node

| item | note |
| :--- | :--- |
| **Open Module Plan** | already exists as a command (`openModulePlan`) |
| **View Help** | **new** — a brief explanation of what to do next |
| *(others)* | more items may be needed as a consequence of Set 122's work |

### 1.2 Under Not Started — one baked-in session set

```
Not Started
└── 000-initial-plan-and-design
    └── interactive-planning
        (once In Progress, these appear)
        ├── create-or-import-plan
        ├── consider-module-design
        └── decompose-module-into-sets
```

> **Open question — steps or sessions?** The tree sketch nests the three
> under `interactive-planning` as things that *"appear once In Progress"*,
> which is exactly how **plan steps** behave today (Set 114 S2 seeds a
> session's spec steps into `activity-log.json`, and the checklist/tree show
> them once the session starts). But the operator's prose calls each of them
> a **session** ("The create-or-import-plan session works interactively…").
>
> These are materially different designs — three steps of one session, versus
> three sessions in the set — and they imply different registration, close-out
> and verification cadence. **Resolve with the operator before implementing;
> do not silently pick one.**

---

## 2. What each planning activity does

### 2.1 `create-or-import-plan`

Works **interactively** with the user to either **import** an existing plan or
**create** one. The AI agent should:

- read the plan, and
- **ask clarifying questions**, explicitly including *whether there are any
  constraints on the architecture and solution tooling*.

### 2.2 `decompose-module-into-sets`

Works **interactively** with the user to break a module's plan into **sets of
sessions**.

- In some cases a set may contain **only a design session**, whose job is to
  create the other sessions.

### 2.3 `consider-module-design`

Works **interactively** to decide whether **other modules are warranted** —
for example when other developers are working at the same time.

If it will be a **multi-module project**, the design must address:

- **(a) Interface** — what interface this module exposes to other modules.
- **(b) Mocking** — whether other modules will need to mock this module's
  functionality, and if so, **what guidance** is provided for doing it.
- **(c) Where modularity is visible** — whether modularity is apparent only in
  the **development environment** (as with libraries) or **also in production**
  (as with independently deployed services).
- **(d) Integration** — how the modules will be integrated, *often via another
  module*.

**Operator's standing guidance for this activity — treat as binding design
intent, not flavour text:**

- Users will need **considerable assistance** here.
- Presume the user is an **experienced developer** who nonetheless needs
  **considerable help designing for modularity**.
- **Keep the design as simple as possible.**
- **Do not suggest extra modules unless the benefit significantly outweighs
  the cost.**

> This lines up with the repo's existing principle *"Prefer removal over
> addition when fixing"* (`project-guidance.md` → Principles) and with the
> spec's own **SIMPLE is binding** standing decision. A module-decomposition
> assistant that enthusiastically proposes modules would violate both.

### 2.4 Module creation and renaming inside `consider-module-design`

- Modules **may be created and renamed** during this activity.
- **Every newly created module gets the same `000-initial-plan-and-design`
  session set.** (So the baked-in set is a per-module template, not a
  once-per-project artifact.)

---

## 3. How this meets Set 122 as specified

Recorded so the eventual author sees the seams rather than rediscovering them.

**Fits the existing spec:**

- Creating and renaming modules from `consider-module-design` is exactly what
  Set 122 **Session 1** ships as `python -m ai_router.modules create | rename`,
  including the validation, rollback and running-session refusal an
  interactive flow would otherwise have to invent.
- Adding **View Help** to the module context menu is Set 122 **Session 2**'s
  surface (it already edits `package.json` menu contributions, and already
  owes the full Playwright run under `L-064-12`).
- Standing decision 2 (*"Dabbler runs the command it derived"*) means these
  interactive flows should **call the Python CLI and echo the command**, not
  free-form shell out.

**New scope, not in Set 122's spec today:**

- The **baked-in `000-initial-plan-and-design` session set** and its
  interactive planning activities. Set 122's three sessions are the lifecycle
  CLI, thin launchers, and append-file partitioning — none of them scaffold a
  starter set or ship interactive planning prompts.
- **View Help** content itself (the "brief explanation of what to do").

**Tensions to resolve before implementing:**

1. **The `000-` prefix is a deliberate exception to the numbering rule.** The
   authoring guide states next number = `max(existing) + 1` and *"a repo with
   no numbered sets starts at `001`"*. A baked-in `000` sorts first on purpose,
   but it is outside the documented scheme — decide whether `resolve_set`
   should special-case it, and note Set 122 **Session 3** is already touching
   set-number collision handling.
2. **The scaffolder already creates starter sets.** `docs/quick-start.md`
   records that the scaffold *"declares a `default` module with two starter
   sets already scaffolded"*. Decide whether `000-initial-plan-and-design`
   **replaces** those two, supplements them, or duplicates them — three
   starter sets on a clean project would be worse than what exists now.
3. **Interactive-by-design conflicts with the non-interactive scaffold.** The
   adopt tutorial describes `Dabbler: Set Up New Project` as *"non-interactive"*.
   These planning activities are explicitly interactive, so the interaction has
   to happen in the **session**, not the scaffold — which is consistent, but
   should be stated rather than assumed.
4. **Interactive prompts are creative content, not transactional mutation.**
   Set 122 standing decision 1 puts validation/rollback/numbering in Python and
   leaves prompts for creative work. These activities straddle that line: the
   *conversation* is creative, the *module create/rename* it produces is
   transactional. Keep the split.

---

## 4. Verbatim anchors

Preserved because paraphrase loses the bar the operator set:

> *"The AI agent should read the plan and ask clarifying questions, including
> whether there are any constraints on the architecture and solution tooling."*

> *"Presume that the user is an experienced developer, but needs considerable
> help with designing for modularity. Importantly, all things considered, the
> design should be kept as simple as possible. Do not suggest extra modules
> unless the benefit significantly outweighs the cost."*

> *"Note that when other modules are created, they will have the same
> initial-plan-and-design session set."*
