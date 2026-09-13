// The text bootstrap writes, and nothing that decides when to write it.
//
// One canonical instruction block carries the whole session workflow; it is
// written into `AGENTS.md` (Copilot, and every other orchestrator that reads
// that convention) and `CLAUDE.md` (Claude Code), differing only in a
// short engine tail. Copilot loads all three at once and de-duplicates
// nothing, which is why exactly one of them may carry the body.
//
// Every command in the body names `dabbler <verb>`. The router ships as one
// command on PATH, so an instruction naming an interpreter would be an
// instruction a consumer repository cannot follow -- there is no interpreter
// in it, and after the port there is none in the product either. The same
// goes for the commit guard: it invokes the router by name.
//
// It is written one source line per rendered line and nothing is reflowed:
// the fence lands in three files a person then reads and edits around, so a
// change to it should read as a change to the text rather than as a reflow
// of the whole block.

export const MANAGED_START = "<!-- dabbler:managed:start -->";
export const MANAGED_END = "<!-- dabbler:managed:end -->";

/** The rule bootstrap adds to a consumer project's `.gitignore`. */
export const IGNORE_RULE = ".dabbler/";

/**
 * `CLAUDE.md` and `GEMINI.md` carry this instead of the body. Both engines
 * expand `@file` at load time, so the import is a loader directive rather
 * than a request the model may decline. Neither reads `AGENTS.md` natively,
 * which is why the file cannot simply be deleted.
 */
export const IMPORT_LINE = "@AGENTS.md";

export const HOOK_MARKER = "# dabbler-ai-router: step-execution commit guard";

/**
 * The managed body every engine file that carries one shares.
 *
 * `{repo_name}` is the one substitution.
 */
export const SHARED_BODY =
  "# AI orchestrator instructions — `{repo_name}`\n" +
  "\n" +
  "> `AGENTS.md` is the single source of this managed body; `CLAUDE.md` and\n" +
  "> `GEMINI.md` import it and add only their engine tail. Do not hand-edit\n" +
  "> inside the fence; re-run `dabbler bootstrap` to refresh it.\n" +
  "\n" +
  "## Your role\n" +
  "\n" +
  "You are the **orchestrator** for `{repo_name}`, running AI-led work one\n" +
  "session at a time under the Dabbler session workflow. You do the mechanics\n" +
  "— file edits, shell, git — and the framework owns the lifecycle: it tells\n" +
  "you what to do next, one move at a time, and you do that and ask again.\n" +
  "\n" +
  "## How to run a session\n" +
  "\n" +
  "Sessions are numbered directly in this repository, under one sessions root\n" +
  "(`docs/sessions/`), so no command takes a handle to one.\n" +
  "\n" +
  "    dabbler session next --sessions-dir docs/sessions\n" +
  "\n" +
  "One call, one move: it judges whatever answer is outstanding, advances the\n" +
  "session, and prints the next instruction as JSON on stdout. Do what the\n" +
  "instruction says, run the command it names as `answer_command` — running\n" +
  "it is the answer — and call `next` again, until it says `done`. That is\n" +
  "the whole loop, and there is nothing to remember between calls: the\n" +
  "framework holds the state.\n" +
  "\n" +
  "**`start` registers the session; `next` never does.** Registering is a\n" +
  "separate verb, and it is the one that carries who is working:\n" +
  "\n" +
  "    dabbler session start --sessions-dir docs/sessions \\\n" +
  "        --engine <claude-code|gemini|copilot> --provider <anthropic|openai|google>\n" +
  "\n" +
  "A Copilot seat adds `--model` (the seat label is not trusted; identity\n" +
  "resolves through the model registry). **Every `next` call carries none of\n" +
  "them** — the session is in flight and its identity is on the record, and a\n" +
  "`next` that names an identity with nothing in flight is refused rather\n" +
  "than starting work nobody asked for.\n" +
  "\n" +
  "`next` with nothing in flight answers `done`. That is the honest end of\n" +
  "the loop, not an error: it means there is no session to advance.\n" +
  "\n" +
  "## What comes back\n" +
  "\n" +
  "Four kinds of instruction, and no fifth:\n" +
  "\n" +
  "- **`step`** — work to do. Its `ask` says what; do it, then report with\n" +
  "  the `answer_command`, naming every file you changed and nothing else.\n" +
  "- **`rejection`** — the answer was refused, and `reasons` says why. Fix\n" +
  "  it and answer again; three refusals of one step stop the session.\n" +
  "- **`wait`** — the framework is running something that outlasts a tool\n" +
  "  call. Nothing is owed but another `next`, after the seconds\n" +
  "  `retry_after_seconds` names; `log` is where the work is being written.\n" +
  "  It is a call you make later, never a sleep you hold.\n" +
  "- **`done`** — the session is over and closed. Stop.\n" +
  "\n" +
  "Everything the framework now does for itself happens inside those calls:\n" +
  "declaring the work, each step's own checks, cross-provider verification\n" +
  "and its remediation rounds, the complete suite as the run of record, the\n" +
  "commit, the push, and the close. The tests that run are each step's own\n" +
  "checks and that complete suite: the Primary Reviewer reviews without\n" +
  "writing or running one, and no other test run happens between a step and\n" +
  "the round.\n" +
  "None of them is yours to run, and none of them is yours to skip ahead to\n" +
  "— the instruction in hand is the whole of what is asked. `dabbler\n" +
  "version` says which router this is; report it when you report a problem.\n" +
  "\n" +
  "**The framework owns the clock, the state and the sequencing.** An\n" +
  "instruction that names a command is answered by running that command —\n" +
  "never by waiting on a condition that your own next call is what causes.\n" +
  "A `wait` answered by watching `run.json` for its job to clear waits\n" +
  "forever: only the `next` you did not call clears it.\n" +
  "\n" +
  "**A session that declared itself releasable also publishes**, between the\n" +
  "push and the close, and the framework does that for itself too. A session\n" +
  "that declared `--not-releasable` publishes nothing, which is most of them:\n" +
  "releasability is declared at the start, before the work, and is never\n" +
  "decided afterwards. If a releasable session reaches the close with no\n" +
  "packaging run on its record, the close refuses — a session that was\n" +
  "supposed to ship and did not must not read as one that shipped.\n" +
  "\n" +
  "## When the framework stops\n" +
  "\n" +
  "- Read the framework's own account before the scrollback: `dabbler status`,\n" +
  "  the `stop` on `.dabbler/runs/s<N>/driver/run.json` with its kind and its\n" +
  "  class, the outstanding instruction's `reasons`, and the transcripts.\n" +
  "- Where the framework is source in this tree you may fix it, and the fix\n" +
  "  rides in this session's own diff; where it is an installed package,\n" +
  "  report the step `blocked` with the diagnosis and raise an owed item.\n" +
  "- Never touch the record, a verdict or a gate to get past a stop. The whole\n" +
  "  protocol is the *When the framework stops* section of dabbler's\n" +
  "  `docs/driving-a-session.md`.\n" +
  "\n" +
  "## Hard rules\n" +
  "\n" +
  "- State files (`docs/sessions/sessions.json`) and everything under\n" +
  "  `.dabbler/runs/`\n" +
  "  are written by the router only — never by hand, never \"fixed up\".\n" +
  "- Verdicts come from the **Primary Reviewer** -- *not the author* -- and\n" +
  "  a disputed impasse from the **Auxiliary Reviewer** -- *not the author\n" +
  "  and not the primary*, so a third voice is the role's own definition. A\n" +
  "  verdict token the framework did not hand you does not exist.\n" +
  "- API keys live in env vars (`DABBLER_ANTHROPIC_API_KEY`,\n" +
  "  `DABBLER_OPENAI_API_KEY`, `DABBLER_GEMINI_API_KEY`), never in files. The\n" +
  "  same rule covers a feed PAT: configuration names it and never holds it.\n" +
  "- The router is one command, `dabbler <verb>` — nothing to install beside\n" +
  "  the extension: it ships inside the VSIX, and a VS Code terminal has it\n" +
  "  on `PATH`. Anywhere else, run `node \"<extension dir>/dist/dabbler.cjs\"\n" +
  "  <verb>`. \"dabbler: command not found\" is a PATH problem, not a keys one.\n" +
  "- In a focused session the other modules are here as packages and\n" +
  "  contract folders, not source. If the work cannot be done without a\n" +
  "  sibling's source, ask with `dabbler session next --request-grant <slug>\n" +
  "  --reason <why>` and wait for the answer; never take it. `session cancel\n" +
  "  --force` is a person's verb, never the engine's.\n" +
  "\n" +
  "## Writing files\n" +
  "\n" +
  "**Write files with your editing tools, never with a shell heredoc.** On a\n" +
  "Windows host the shell is usually Git Bash, and a heredoc there eats\n" +
  "backslashes: `\\n` arrives as a newline and `\\\\` as one backslash, so\n" +
  "JSON escapes, regular expressions and Windows paths are silently\n" +
  "corrupted on the way to disk. Nothing fails — the file is written, and\n" +
  "it is wrong. The same goes for `echo` and for `printf` with a format\n" +
  "string you did not escape twice.\n" +
  "\n" +
  "**Nothing may touch the working tree between a report and the `next`\n" +
  "that judges it.** The framework hashes the tree before and after a\n" +
  "step's checks, and an edit made while one is running refuses the report\n" +
  "— correctly, because a check run against a tree that moved under it\n" +
  "proves nothing about either version. Finish the step, report it, and\n" +
  "wait for the answer before starting the next one.\n";

/**
 * Claude Code reads `CLAUDE.md` only.
 */
export const CLAUDE_TAIL =
  "## Engine tail (Claude Code)\n" +
  "\n" +
  "You are **Claude Code**. The managed body above arrived through the\n" +
  "`@AGENTS.md` import, which Claude Code expands at load time — `AGENTS.md`\n" +
  "is the one copy, so nothing here can drift from what the other engines\n" +
  "read.\n";

/**
 * Copilot reads `AGENTS.md`, the one file with the body, and so does any
 * other engine that follows the convention.
 */
export const AGENTS_TAIL =
  "## Engine tail (GitHub Copilot)\n" +
  "\n" +
  "You read this `AGENTS.md` directly. `CLAUDE.md` and `GEMINI.md` import\n" +
  "it rather than repeating it, so this file is the one place the body\n" +
  "exists. GitHub Copilot loads all three files at once and de-duplicates\n" +
  "nothing, which is exactly why only this one carries the body.\n" +
  "\n" +
  "Copilot seats: declare `--model` on the first call, the one that\n" +
  "registers, and set the vehicle with `dabbler configure --transport\n" +
  "copilot-cli` when routing through the seat. `DABBLER_TRANSPORT` is not\n" +
  "read at all any more: a variable that outranked every file and was\n" +
  "written by nothing shadowed the very preference a later run set. Review\n" +
  "stays cross-provider on every transport.\n";

/**
 * Gemini CLI reads `GEMINI.md` unless `context.fileName` says otherwise.
 */
export const GEMINI_TAIL =
  "## Engine tail (Gemini CLI)\n" +
  "\n" +
  "You are **Gemini CLI**. The managed body above arrived through the\n" +
  "`@AGENTS.md` import, expanded by the memory import processor —\n" +
  "`AGENTS.md` is the one copy. If your seat is configured with\n" +
  "`context.fileName`, keep `AGENTS.md` in the list.\n";

/**
 * A scaffolded repository's session 1, for running the same work untracked.
 */
export const PLAN_PROMPT =
  "You are preparing the solution plan for the Dabbler session workflow.\n" +
  "\n" +
  "Create — or import — `docs/planning/solution-plan.md`, the stable artifact\n" +
  "session 2 reads from. A repository that already carries\n" +
  "`docs/planning/project-plan.md` has its plan there: amend that file in\n" +
  "place rather than writing a second one.\n" +
  "\n" +
  "The plan's substance is the operator's, not yours. Before writing\n" +
  "anything, ask them what the solution is: its purpose, who uses it, what\n" +
  "it must do and what is deliberately out of scope, what success looks\n" +
  "like, and whether a plan, brief or notes already exist that should be\n" +
  "imported. Ask when the repository and your prompt do not already answer\n" +
  "those questions. Do not search neighbouring directories for a plan, and\n" +
  "do not draft one from the folder name — a guessed plan is broken by the\n" +
  "next session into sessions nobody asked for.\n" +
  "\n" +
  "What the plan carries, in this order:\n" +
  "- **The objective**, stated so a reader can act on it: what the solution\n" +
  "  is for, who uses it, what it must do, and what is deliberately out of\n" +
  "  scope. Vagueness that would let two people build different things is\n" +
  "  the defect to look for.\n" +
  "- **The modules.** What each is responsible for, the contract each\n" +
  "  exposes to the others (what must be true going in, what is guaranteed\n" +
  "  coming out, what is kept on purpose, how it fails, and what callers\n" +
  "  must not depend on), the dependency direction, the reason for each cut,\n" +
  "  and the cuts deferred. ONE MODULE IS A FINE ANSWER, and most small\n" +
  "  solutions are one module: say so and stop. Where a cut is not obvious,\n" +
  "  give more than one candidate decomposition in plain language, recommend\n" +
  "  one and say why; modules should hide decisions likely to change rather\n" +
  "  than mirror processing steps, and a single candidate presented as the\n" +
  "  only option is a defect.\n" +
  "- **The phases or feature areas** and each one's key deliverables. Keep\n" +
  "  it concise — session 2 turns each into numbered sessions, so scope each\n" +
  "  to a handful of focused AI sessions.\n" +
  "\n" +
  "Then declare the modules in `docs/modules.yaml` through `dabbler modules\n" +
  "create` (`--kind`, `--depends-on`, `--package`, `--contract`), one entry\n" +
  "per module. The bootstrapped manifest already carries one entry naming\n" +
  "the repository as the module: leave it when one module is the answer,\n" +
  "and replace it when there are several. Who depends on a module is\n" +
  "derived from `dependsOn`, never written.\n" +
  "\n" +
  "- **Import:** if the operator points you at an existing plan (a doc, a\n" +
  "  ticket, notes), bring its content into that path in this same shape,\n" +
  "  preserving intent while conforming to the structure above.\n" +
  "\n" +
  "A later revision is just another plan session that amends the same file.\n";

/**
 * Its session 2, likewise.
 */
export const DECOMPOSITION_PROMPT =
  "You are a session architect for an AI-led development workflow (the\n" +
  "Dabbler session workflow).\n" +
  "\n" +
  "Read `docs/planning/solution-plan.md` in this workspace (or\n" +
  "`docs/planning/project-plan.md` where that is the file; it is deliberately\n" +
  "not inlined here). First CHALLENGE it: for each module, ask whether it\n" +
  "should exist at all, whether its contract is a promise something can\n" +
  "prove, and whether the dependency direction is the one that hides the\n" +
  "decisions most likely to change; where the plan deferred a cut, decide it\n" +
  "or say why it stays deferred. Record the answers in the plan's rationale\n" +
  "and, where a module changes, in `docs/modules.yaml`. Then decompose the\n" +
  "plan into a sequence of numbered sessions. Each session is a focused unit\n" +
  "of work that one AI coding session can complete, and each names ONE\n" +
  "module.\n" +
  "\n" +
  "Append the sessions to `docs/sessions/session-plan.md`, under its\n" +
  "`## Sessions` heading. There is no level above a session: no sets, no\n" +
  "slugs, no directories.\n" +
  "\n" +
  "Hard requirements (do not deviate):\n" +
  "- **Numbering:** continue from the highest session number the plan already\n" +
  "  declares. Numbers are never reused and never renumbered, including for\n" +
  "  cancelled sessions.\n" +
  "- **Layout:** one `### Session <N>: <title>` heading per session, and its\n" +
  "  steps as a top-level ordered list. Step 1 registers the session; the last\n" +
  "  steps are cross-provider verification, the complete suite once against\n" +
  "  the verified tree, and close-out; the middle steps are the work. The\n" +
  "  only tests that run before the round are each step's own checks; never\n" +
  "  write a step that says \"run the tests\" without saying which run it\n" +
  "  means.\n" +
  "- **One module per session.** Where `docs/modules.yaml` declares more than\n" +
  "  one module, the heading is followed by `Module: <slug>` on its own line,\n" +
  "  and the session's steps stay inside that module's roots. A session that\n" +
  "  must change two modules says `Modules: <a>, <b>` and the reason, and\n" +
  "  that is rare. With one module declared there is nothing to name.\n" +
  "- A session may declare `Policy: fast` or `Policy: verified` on its own\n" +
  "  line; omitting it uses the repository default.\n" +
  "- Do NOT hand-author `sessions.json`: the first `session start` bootstraps\n" +
  "  it from this plan — state files are the runtime writers' job, never\n" +
  "  authored by hand.\n" +
  "\n" +
  "Authoring guidance:\n" +
  "- Order sessions so earlier ones unblock later ones: a module before the\n" +
  "  modules that depend on it, and the module that composes the others\n" +
  "  last.\n" +
  "- Keep scope tight: at most ~3 work steps per session. A session whose\n" +
  "  evidence bundle a reviewer cannot read is too large, and the evidence cap\n" +
  "  is the measure of that — treat it as a planning signal, not a threshold\n" +
  "  to get under.\n";

/**
 * The two setup sessions, written only into a repository with no plan.
 */
export const BOOTSTRAP_PLAN =
  "# Session plan\n" +
  "\n" +
  "> **Purpose:** the numbered sessions this repository runs, in order. The\n" +
  "> first two set the project up; everything after them is the work.\n" +
  "> **Workflow:** Full\n" +
  "\n" +
  "---\n" +
  "\n" +
  "## Sessions\n" +
  "\n" +
  "### Session 1: Author or import the solution plan\n" +
  "\n" +
  "1. Register.\n" +
  "2. Ask the operator what the solution is — its purpose, who uses it, what\n" +
  "   it must do and what is out of scope, what success looks like, and\n" +
  "   whether a plan, brief or notes already exist — unless the repository or\n" +
  "   your prompt already says. The plan's substance is theirs: do not search\n" +
  "   neighbouring directories for one, and do not draft one from the folder\n" +
  "   name. Then create — or import — `docs/planning/solution-plan.md`: the\n" +
  "   objective a reader can act on; the modules, with what each is\n" +
  "   responsible for, the contract each exposes (what must be true going\n" +
  "   in, what is guaranteed coming out, how it fails), the dependency\n" +
  "   direction, the reason for each cut and the cuts deferred — one module\n" +
  "   is a fine answer, and most small solutions are one; and the phases or\n" +
  "   feature areas with their key deliverables, each scoped to a handful of\n" +
  "   focused AI sessions. A repository that already has\n" +
  "   `docs/planning/project-plan.md` amends that file instead.\n" +
  "3. Declare the modules in `docs/modules.yaml` through `dabbler modules\n" +
  "   create`. The manifest already names this repository as its one\n" +
  "   module: leave it when one module is the answer, replace it when there\n" +
  "   are several. Who depends on a module is derived, never written.\n" +
  "4. Cross-provider verification.\n" +
  "5. Full test suite, recorded as the run of record.\n" +
  "6. Close-out.\n" +
  "\n" +
  "**Creates:** `docs/planning/solution-plan.md`, and the module manifest as\n" +
  "the plan decided it. A later revision is just another plan session that\n" +
  "amends the same files.\n" +
  "\n" +
  "### Session 2: Challenge the plan, then break it into numbered sessions\n" +
  "\n" +
  "1. Register.\n" +
  "2. Read `docs/planning/solution-plan.md` (or `docs/planning/project-plan.md`\n" +
  "   where that is the file this repository keeps its plan in) and challenge\n" +
  "   its cuts: for each\n" +
  "   module, whether it should exist, whether its contract is a promise\n" +
  "   something can prove, and whether the dependency direction hides the\n" +
  "   decisions most likely to change; decide each deferred cut or say why it\n" +
  "   stays deferred. Record the answers in the plan's rationale and, where a\n" +
  "   module changes, in `docs/modules.yaml`.\n" +
  "3. Break the plan into numbered sessions appended to this file, each\n" +
  "   naming ONE module (`Module: <slug>` under the heading, where the\n" +
  "   manifest declares more than one). Each session is a focused unit of\n" +
  "   work one AI coding session can complete: one\n" +
  "   `### Session <N>: <title>` heading, and its steps as a top-level\n" +
  "   ordered list. Step 1 registers the session; the last steps are\n" +
  "   cross-provider verification, the complete suite once against the\n" +
  "   verified tree, and close-out; the middle steps are the work. Never\n" +
  "   write a step that says \"run the tests\" without saying which run it\n" +
  "   means. Order sessions so earlier ones unblock later ones — a module\n" +
  "   before the modules that depend on it — and keep at most ~3 work steps\n" +
  "   per session.\n" +
  "4. Cross-provider verification.\n" +
  "5. Full test suite, recorded as the run of record.\n" +
  "6. Close-out.\n" +
  "\n" +
  "**Creates:** the numbered session list the rest of this repository runs.\n" +
  "\n" +
  "> Do NOT hand-author `sessions.json`. The first `session start`\n" +
  "> bootstraps it from this plan — state files are the writers' job.\n";

/**
 * The scaffolded `dabbler.yaml`, in the four pieces it is assembled from.
 */
export const PROJECT_CONFIG_HEADER =
  "# dabbler.yaml -- what this repository declares about itself.\n" +
  "#\n" +
  "# Tracked, unlike local-overrides.yaml, because CI reads these facts and so\n" +
  "# does the next machine to pick up a session. Precedence is the packaged\n" +
  "# router-config.yaml, then this file, then local-overrides.yaml. Providers,\n" +
  "# models, roles and transports are deliberately absent: those are\n" +
  "# distribution facts, and a repository that restated them here would fork\n" +
  "# the model registry in order to say how to run a test suite.\n" +
  "schema_version: 1\n";

export const PROJECT_CONFIG_TESTING_HEADER =
  "\n" +
  "# Which tests answer for which path, and what proves the suite was green.\n" +
  "# Nothing runs the selected tests before verification: the tests that run\n" +
  "# are each step's own checks, and the complete suite is recorded once,\n" +
  "# against the final verified tree. The Primary Reviewer reviews without\n" +
  "# or running one. The selection is what the record NAMES as affected by a\n" +
  "# change, and what `dabbler affected` prints.\n" +
  "#\n" +
  "# One suite per ecosystem whose root build file says how its tests run, so\n" +
  "# a repository that is Java and .NET at once hands each runner its own\n" +
  "# tests. Check the command before you rely on it: it is read from what this\n" +
  "# repository already carries, and a repository can carry a runner it does\n" +
  "# not actually use. Two fields are the scaffold's, not yours to keep:\n" +
  "#\n" +
  "#   covers      claims the whole repository, because setup cannot know this\n" +
  "#               layout. The failure direction is fixed -- run a suite you\n" +
  "#               did not need rather than skip one you did -- so narrow it as\n" +
  "#               the layout settles.\n" +
  "#   runs_whole  says the runner takes a filter rather than a list of test\n" +
  "#               files, so there is no narrowed form of it to run, and a\n" +
  "#               run of it is always the complete suite.\n" +
  "#\n" +
  "# Beside the suites, `controls` are the deterministic checks that run\n" +
  "# before every verification round, one entry per kind -- compile,\n" +
  "# typecheck, lint, analyzer -- each a `command` (argv for `node`, never a\n" +
  "# shim like `npm`) whose exit code is the fact; `required: true` sends a red\n" +
  "# result back to the author instead of buying a reviewer's opinion on it:\n" +
  "#\n" +
  "#   controls:\n" +
  "#     - kind: typecheck\n" +
  "#       command: node scripts/typecheck.mjs\n" +
  "#       required: true\n" +
  "testing:\n" +
  "  suites:\n";

export const PROJECT_CONFIG_SELECTION =
  "\n" +
  "  # Which tests answer for which path.\n" +
  "  #\n" +
  "  # A scaffolded repository has declared no mapping yet, and the framework\n" +
  "  # refuses to invent one: a path no rule covers is `selection_unknown`,\n" +
  "  # and the record says so rather than let a mapping for half of a change\n" +
  "  # read as covering the other half. So setup declares the only honest\n" +
  "  # starting mapping there is -- every path is repository-wide, and every\n" +
  "  # change is recorded as affecting every test.\n" +
  "  #\n" +
  "  # It is meant to be replaced. Narrow it as the repository takes shape:\n" +
  "  # `repo_wide` for the few paths that really do change what every test\n" +
  "  # does (the test config, the lockfile), `rules` mapping a source path to\n" +
  "  # the tests that would notice it breaking, and `smoke` for what answers\n" +
  "  # when a path maps to nothing. A rule's `when` is a PATH PREFIX anchored\n" +
  "  # at the repository root -- `src/api/` covers everything under it, and a\n" +
  "  # file name covers that file -- not a glob: `*` and `**` match nothing.\n" +
  "  #\n" +
  "  #   rules:\n" +
  "  #     - when: src/api/\n" +
  "  #       select:\n" +
  "  #         - tests/api/test_routes.py\n" +
  "  selection:\n" +
  "    repo_wide:\n" +
  "      - \".\"\n";

export const PROJECT_CONFIG_NO_SUITES =
  "\n" +
  "# No suite is declared, because nothing at the root of this repository says\n" +
  "# how its tests run. Setup reads what is there -- a pytest section, a\n" +
  "# `scripts.test`, a POM, a solution -- and where none of it says how the\n" +
  "# tests run, it declares nothing rather than emitting a command that would\n" +
  "# fail on its first use. That is a declaration, not an omission.\n" +
  "#\n" +
  "# A repository whose build files live BELOW the root reaches this too: a\n" +
  "# suite declares a command and no working directory, so `service/pom.xml`\n" +
  "# has no runnable line to become. Declare the suite yourself -- a name, the\n" +
  "# command that runs it, the paths it covers, and where its tests live:\n" +
  "#\n" +
  "#   testing:\n" +
  "#     suites:\n" +
  "#       - name: python\n" +
  "#         command: python -m pytest\n" +
  "#         expensive: true\n" +
  "#         covers: [\".\"]\n" +
  "#         test_roots: [tests]\n" +
  "#         test_glob: \"test_*.py\"\n";

export const PROJECT_CONFIG_PACKAGING =
  "\n" +
  "# Step (f) of the lifecycle: pack, then push to a feed. A session that\n" +
  "# declared itself releasable publishes through these -- both argv, never\n" +
  "# shell strings, and `push` naming the credential rather than holding it.\n" +
  "# This repository declares none, and that is the declaration: it publishes\n" +
  "# to no feed today. A feed that is a folder on disk -- a drive path, a UNC\n" +
  "# path or file:// -- takes no credential: leave `secret` out, and the push\n" +
  "# runs without one. `dabbler packaging --dry-run` rehearses the block and\n" +
  "# exits 0 when it loads, in a session that may not publish too.\n" +
  "#\n" +
  "#   packaging:\n" +
  "#     pack:\n" +
  "#       argv: [\"dotnet\", \"pack\", \"-c\", \"Release\", \"-o\", \"{output}\"]\n" +
  "#     push:\n" +
  "#       argv: [\"dotnet\", \"nuget\", \"push\", \"{artifact}\",\n" +
  "#              \"--source\", \"{feed}\", \"--api-key\", \"{secret}\"]\n" +
  "#       feed: https://pkgs.dev.azure.com/<org>/_packaging/<feed>/nuget/v3/index.json\n" +
  "#       secret: DABBLER_FEED_PAT\n";

/**
 * The guard that refuses a manual commit while a plan step is open.
 *
 * `{marker}` and `{blocking}` are the substitutions. The router is invoked
 * by name and PATH resolves it: there is no interpreter to bake in, and a
 * consumer repository is not required to contain the thing that guards it.
 */
export const PRE_COMMIT_HOOK =
  "#!/bin/sh\n" +
  "{marker}\n" +
  "# The framework commits a step, and only once the step's evidence is\n" +
  "# satisfied. A commit landed mid-step leaves the step with no diff of its\n" +
  "# own to be judged by, so this refuses rather than advises.\n" +
  "#\n" +
  "# Exit {blocking} is the guard's verdict -- \"a step is open\" -- and blocks the\n" +
  "# commit in the guard's own words. A router that is not on PATH at all\n" +
  "# (exit 127) is let through: a repository nobody can commit to is a worse\n" +
  "# failure than an unguarded one, and the binding check is `verify step\n" +
  "# close`, which refuses outright when HEAD has moved off the commit the\n" +
  "# step opened on. Every other failure is a router that RAN and could not\n" +
  "# judge -- a crash, an unreadable ledger -- and that blocks too, naming the\n" +
  "# two ways on: a guard that let a crashed router through is how a broken\n" +
  "# router shipped twice with every commit landing.\n" +
  "dabbler verify step guard-commit\n" +
  "status=$?\n" +
  "if [ $status -eq 0 ] || [ $status -eq 127 ]; then\n" +
  "  exit 0\n" +
  "fi\n" +
  "if [ $status -ne {blocking} ]; then\n" +
  "  echo \"dabbler: the router ran and could not judge this commit (exit $status).\" >&2\n" +
  "  echo \"  dabbler version         to see what is wrong with the router\" >&2\n" +
  "  echo \"  git commit --no-verify  for a commit that must land\" >&2\n" +
  "fi\n" +
  "exit 1\n";
