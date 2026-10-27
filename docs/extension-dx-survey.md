# The extension, surveyed against the DX principles

**Session 37 of 50.** A survey, not a refactor. Every finding below carries an
owning session; two were fixed in this session because they needed no design
decision. Nothing else here was changed.

**Scope.** `tools/dabbler-ai-orchestration/src`, 24 files, 4,029 lines, 123
tests, plus the extension manifest. Method: inventory the contributed surface,
read every operator-facing string, then walk four journeys in their empty,
loading, success and error states against the eight principles of 2026-08-30.

**The principles**, abbreviated to the letters used in the table: (a) the
framework serves the operator; (b) make it easy while keeping the operator
informed; (c) supervisor of somewhat-independent AI; (d) the SOP may need
exceptions; (e) never ask the operator to run a command the framework can run;
(f) plain language with enough context, for a human watching several projects;
(g) rules the framework can execute, the framework executes; (h) developers
should want to use it.

---

## The contributed surface

| | Count | Note |
| --- | ---: | --- |
| Commands | 18 | 5 hidden from the palette by `when: false` |
| Views | 2 | in one container |
| `viewsWelcome` | **0** | neither view has an empty state |
| `walkthroughs` | **0** | no guided entry point |
| Submenus | 2 | Open File, Copy Prompt |
| Configuration properties | **0** | nothing about the extension is settable |
| `activationEvents` | `[]` | activation is manifest-driven |
| `withProgress` call sites | **0** | no operation reports progress |

Three of those zeros are findings in their own right and appear below.

---

## Findings

Severity is what it costs the operator, not how hard it is to fix.

| # | Where | Prin. | Severity | What happens | Owner |
| --- | --- | --- | --- | --- | --- |
| F1 | `commands/bootstrapProject.ts:60` | e | **Major** | Setup ends with *"Dabbler: project set up. Open a terminal and run `dabbler session start`."* The framework wrote the files, knows the next verb, and hands the operator a keystroke. | 41 |
| F2 | `extension.ts:63-65` | b, f | **Major** | The first-run offer says setup *"creates the workspace .venv, installs the ai-router into it, and scaffolds the session plan."* Since the cutover it does none of the first two. The product's first sentence to a new operator is untrue. | 41 |
| F3 | `commands/sessionTerminalCommands.ts` | e, g | **Major** | Start and Close are **pre-typed into a terminal, not executed**. The file's own header gives the reason: start needs the engine declared, and close runs gates the operator "should see and confirm". Start carries a decision; the keystroke is not the decision. Close carries none at all. | 41 |
| F4 | `commands/copyPromptCommands.ts` | a, c | **Major** | Four commands write a prompt to the clipboard for the operator to paste into an engine. This is RACI open item 1 made concrete: the operator is the scheduler and the transport layer. **Deferred by design** — see below. | — |
| F5 | manifest, `viewsWelcome` | h, f | **Major** | Neither view has an empty state. A new project shows two blank panels and no explanation, which is `csv-model` feedback item 4 exactly. | 42 |
| F6 | manifest, `walkthroughs` | a, h | Minor | No walkthrough and no `file/newFile` contribution, so there is no discoverable way to start a project except knowing a command name. | 41 |
| F7 | `media/{light,dark}/*.svg` | h | **Major** | All eight status icons declared `width="16mm" height="16mm"` — about 60 CSS px — against a 16-unit viewBox, rendered in a 16 px row. Probable cause of `csv-model` item 1, which its session filed as unverifiable because it has no view of the UI. | **fixed here** |
| F8 | `providers/solutionTreeModel.ts`, `providers/SolutionTreeProvider.ts` | — | Minor | Both headers named `python -m ai_router.workflow` as the projection's writer. It has been TypeScript since the cutover, and the claim misled a later reader into recording the Solution Explorer as having no writer at all. | **fixed here** |
| F9 | `utils/projection.ts:104-112` | f | Minor | A projection failure reaches the operator as `projection failed: <raw error>`. It says what broke and never what to do. | 42 |
| F10 | `commands/troubleshoot.ts:9` | e | Minor | Diagnostics compose *"a line for the operator to run by hand"* rather than running it and showing the result. A copyable line is defensible in a diagnostic; running it is better. | 43 |
| F11 | `extension.ts:148` | b | Minor | A 30-second `setInterval` is the only thing that advances state between file events. Nothing anywhere says whether a session is alive, moving, or stalled. | 43 |
| F12 | no `withProgress` anywhere | b, h | Minor | No operation reports progress. Verification rounds run for minutes; the UI is indistinguishable from hung. | 43 |
| F13 | manifest, `configuration` | — | Note | The extension contributes no settings at all. Not a defect today, but session 43's stall threshold has nowhere to live, and it is the first thing that will need one. | 43 |

## The four journeys

**Open an existing project.** Works. The Work Explorer populates from the
router in-process; the Solution Explorer is empty and silent (F5).

**Create a project.** The weakest journey, and the one a new developer meets
first. There is no entry point except a command name (F6); the offer misstates
what will happen (F2); and it ends by handing over a terminal command (F1).
Three of the four Majors are on this path.

**Watch a session run.** No task rows render at all — `buildTaskRows` returns
empty because nothing writes `approved-plan.json` (session 40). Between file
events the view is up to 30 seconds stale (F11), long operations show nothing
(F12), and there is no liveness signal of any kind.

**Navigate to a related repository.** Does not exist. The Solution Explorer has
no context menu, and no command opens or reveals a repository (session 47).

## Deferred, with the reason

**F4 — the clipboard prompt commands.** Removing them means building an
executor that advances sessions on its own. That is RACI open item 1, it is the
operator's decision and not this block's, and the plan says so in its own
"does NOT do" section. **This survey's job was to measure it, and it has:** four
commands, one submenu, and one left-click handler exist to move text from the
framework to an engine through a person. Recorded, not changed.

## Amendments owed to later sessions

- **Session 41** takes F1, F2, F3 and F6. F2 in particular should be treated as
  a correctness fix, not copy: it is the only string in the extension that
  describes work the product stopped doing.
- **Session 42** takes F5 and F9.
- **Session 43** takes F10, F11, F12 and the settings question in F13.
- **Session 47** takes the missing navigation, already in its step list.

## The finding this survey did not go looking for

**`tools/` is covered by no declared suite.** `dabbler.yaml` declares one
suite, `typescript`, covering `packages/router/` and three root files. The
extension's 123 tests are not declared at all, so `dabbler affected` selected
**zero tests** for a change set containing two extension sources and eight
extension assets — and this session could have closed with every gate green
having run nothing.

That is `csv-model` feedback item 3's defect on the framework's own repository,
and it matters immediately: sessions 41, 42, 43 and 47 are all extension-heavy
and would each run zero tests under the present declaration.

**Assigned to session 39** (D242), which owns verification that reports what it
cannot see and lands before every extension-heavy session in the block. This
session did not fix it — declaring a second suite puts the extension suite in
every later selection, and that trade belongs to the session already reasoning
about suite declaration. What this session did instead was run the extension
suite by hand: **123 passing, exit 0**, reported in the close-out, because a
survey that edits ten extension files and proves nothing about them is not
worth trusting.

## One finding outside this session's scope, recorded because it changes another session's premise

`dabbler session start` **already seeds plan steps** — this session's own start
printed six of them, parsed from its step list in `session-plan.md`, with a
`stepKey` for each and `logStep` to tick them. Those rows live in the activity
log. Session 40 was planned on the premise that a session's steps do not exist
in machine-readable form and that a task-file schema must be introduced to
create them.

**That premise is half wrong.** The steps exist. What does not exist is the join
to the projection the tree renders: `buildTaskRows` folds
`.dabbler/runs/s<N>/approved-plan.json`, which has no production writer, while
the seeded rows sit in the activity log where the task level never looks.

Session 40 may therefore be substantially cheaper than planned — reading the
rows `start` already seeds rather than inventing a second way to declare them,
which is also the answer its "one implementation of any rule" constraint
prefers. **Session 40 must re-derive its own approach from the two mechanisms
before writing code**, and amend its step list on the record if it changes.
This session does not change session 40's plan text, because the choice between
the two mechanisms is that session's to make with the evidence in front of it.
