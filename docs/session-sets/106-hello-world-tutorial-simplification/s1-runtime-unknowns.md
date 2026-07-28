# S1 — Runtime-unknowns findings

> **Why this artifact exists.** The spec names two things the tutorial may
> not assume (spec → *Two named runtime unknowns*). The **Set 086 principle**
> is load-bearing: never hand a reader a step that cannot run. Both were
> resolved against **shipped code and live behavior** before the affected
> tutorial steps were written. Method, evidence, and the resulting
> tutorial decision are below.
>
> **Resolved:** 2026-07-28, Set 106 S1.

---

## Unknown 1 — What `Dabbler: Rename Module` does to the starter sets

### Method

Not code-reading alone. `src/utils/moduleAuthoring.ts` was bundled with the
extension's own `esbuild` and driven through the **shipped writers** against a
throwaway fixture built by the **real scaffolder path** — the same calls
`Build project structure` makes
(`gitScaffold.ts::scaffoldDefaultModuleAndLifecycleSets` →
`scaffoldNewModule("default","Default")` + `scaffoldModuleLifecycleSets`).
No hand-authored fixture, so the starting state is genuinely what a reader
gets.

### Observed — rename in place (`default` → `greeter` / `Greeter`)

`renameModule()` returned:

```json
{ "oldSlug": "default", "newSlug": "greeter", "newTitle": "Greeter",
  "slugChanged": true, "titleChanged": true,
  "restamped": ["001-default-plan", "002-default-decomposition"] }
```

| Artifact | Follows the rename? | Observed after |
| --- | --- | --- |
| `docs/modules.yaml` → `slug:` | **Yes** | `slug: greeter` |
| `docs/modules.yaml` → `title:` | **Yes** | `title: "Greeter"` |
| Starter specs' `module:` stamp | **Yes** | both specs now `module: greeter` |
| Session-set **folder names** | **No** | still `001-default-plan`, `002-default-decomposition` |
| `docs/modules.yaml` → `planPath:` | **No** | still `docs/modules/default/project-plan.md` |
| The plan file on disk | **No** | still `docs/modules/default/project-plan.md` |
| `docs/modules.yaml` → `codeRoots:` | **No** | still `[]`, comment still reads `e.g. [src/default]` |

This matches the writer's source: `rewriteManifestEntryText()` edits **only**
the `slug:` and `title:` scalars of the target entry, and the set-scan
restamps `module:` in `spec.md`. Nothing else is in scope by design.

### Observed — the spec's named fallback (`New Module` + `Delete Module`)

```
scaffoldNewModule("greeter") -> planRel: docs/modules/greeter/project-plan.md
scaffoldModuleLifecycleSets  -> 003-greeter-plan, 004-greeter-decomposition
await deleteModule(root, "default")
  -> { "cancelled": [], "removed": ["001-default-plan","002-default-decomposition"], "terminal": [] }
```

Resulting manifest — one entry, correct paths, correct placeholder comment:

```yaml
modules:
  - slug: greeter
    title: "Greeter"
    codeRoots: []                # TODO: the code paths this module owns, e.g. [src/greeter]
    planPath: docs/modules/greeter/project-plan.md
```

`Delete Module` removed both starter scaffolds **outright** (they are
unstarted `kind: plan|decomposition` sets with no execution artifacts — the
documented `remove` disposition), so nothing is cancelled and no tombstone
appears in the Explorer. One residue: the now-orphaned
`docs/modules/default/` plan-stub folder is **not** deleted.

### Decision for Part 3 — take the fallback

The spec pre-authorized this branch: *"If the observed behavior makes
rename-in-place awkward, the fallback is `Dabbler: New Module` for `greeter`
plus `Delete Module` on `Default`."* It is awkward, and the count is against
it:

| | Rename in place | New + Delete |
| --- | --- | --- |
| Commands | 1 | 2 |
| Manual manifest repairs | 2 (`codeRoots`, `planPath`) | 1 (`codeRoots`) |
| Filesystem repairs | 1 (move the plan folder) | 1 (drop the orphaned stub folder) |
| Reader sees | `001-default-plan` under **Greeter**, plan at `docs/modules/default/` | `003-greeter-plan`, plan at `docs/modules/greeter/` |

Rename-in-place leaves a reader's `greeter` module with a plan living under
`docs/modules/default/` and two sets named `…-default-…` — a "why does it
still say default?" that a ~240-line tutorial cannot afford to answer, and
that S4's live operator walk would pay for in real minutes. Neither path
runs a throwaway AI session, which is what the routed verdict actually
condemned (item **E**).

Both paths still require one hand edit of `codeRoots:` — `New Module` never
prompts for it. The tutorial states that plainly rather than implying the
command finishes the job.

**Not a defect, not a follow-on.** Both writers do exactly what their Set 099
contracts say. `Rename Module` remains the right tool for its actual job
(renaming a module you have already been working in, where the sets'
historical names are *supposed* to be stable — set names are identity,
`module:` is a grouping attribute).

---

## Unknown 2 — The Copilot CLI version pin and the `--model` alias

### The alias — confirmed, twice

- **In the lockfile** (`ai_router/copilot-catalog.lock`): `claude-sonnet-4.6`
  is present with `enablement = "confirmed"`, `provider = "anthropic"`,
  `premium_request_weight = 1`.
- **Live on the operator's seat**, running the tutorial's literal Part 1
  smoke test verbatim:

  ```
  copilot -p "Write PI to 10 decimal places" --model claude-sonnet-4.6
  → π = **3.1415926536**
  → exit 0
  ```

  So the command the tutorial ships is runnable as written on today's CLI.
  (The CLI's completion footer now reports `AI Credits`, not a premium-request
  count — the tutorial does not quote that line, so nothing depends on it.)

### The version pin — live drift found, again

| | Value |
| --- | --- |
| Lockfile pin (`meta.cli_version`) | `GitHub Copilot CLI 1.0.69.` |
| Live CLI (`copilot --version`, first line) | `GitHub Copilot CLI 1.0.75.` |
| `validate_catalog(...).ok` | **False** |
| Reason | `CLI version drift: lock pinned to 'GitHub Copilot CLI 1.0.69.', live CLI reports 'GitHub Copilot CLI 1.0.75.'` |

This is the **Set 104 S2 failure class recurring** (that one was 1.0.68 vs
1.0.69; the seat has since auto-updated twice more). `cli_version_pin_required
= true`, so under `transport.profile: copilot-cli` this **fails closed** in
`route()` before any model call — by design.

Three consequences, each acted on:

1. **The tutorial must tell the reader what to do when their version differs.**
   The spec required exactly this ("in one sentence, at the point of the
   version check"). The remedy is the one `route()`'s own error text names:
   re-probe and re-pin with
   `python -m ai_router.copilot_catalog --refresh --seat-id <id> --seat-label <label>`.
   Because the reader's CLI will essentially **never** match a version pinned
   in someone else's lockfile, the tutorial teaches the refresh as the normal
   one-time seat step, not as an error path.
2. **This repo is unaffected today.** `router-config.yaml` has
   `transport.profile: api`, so the drift blocks nothing in this session.
3. **The reconciliation is still owed and has drifted further.** The
   lockfile's own `manual_pin_bump_note` records that Set 104 S2 hand-bumped
   the pin without re-probing per-model entries, and that a full `--refresh`
   remains owed. That is unchanged and now two versions staler. **Out of scope
   here** — this set ships no router change (spec → Non-goals) — and it is
   flagged to the operator rather than fixed in a docs session.

---

## What the tutorial takes from this

- Part 3 uses **`Dabbler: New Module` → `Dabbler: Delete Module`**, and says
  out loud that `codeRoots:` is a hand edit.
- Part 1's version check carries the **one-sentence refresh remedy**, phrased
  as expected-and-normal rather than as a failure.
- Every command title, prompt string, and expected string written into the
  tutorial was read out of `package.json` / the command sources rather than
  carried over from the retired tutorials (the **L-064-8** replacement-doc
  discipline — a superseded doc's claims are not evidence).
