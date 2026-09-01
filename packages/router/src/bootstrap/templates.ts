// The text bootstrap writes, and nothing that decides when to write it.
//
// One canonical instruction block carries the whole session workflow; it is
// written into `AGENTS.md` (Codex, Copilot, Gemini -- every orchestrator that
// reads that convention) and `CLAUDE.md` (Claude Code), differing only in a
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
  "**The first call registers the session**, so it is the one that carries\n" +
  "who is working:\n" +
  "\n" +
  "    dabbler session next --sessions-dir docs/sessions \\\n" +
  "        --engine <claude-code|codex|gemini|copilot> --provider <anthropic|openai|google>\n" +
  "\n" +
  "A Copilot seat adds `--model` (the seat label is not trusted; identity\n" +
  "resolves through the model registry). Every later call carries none of\n" +
  "them — the session is in flight and its identity is on the record.\n" +
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
  "declaring the work, selecting and running the tests a change makes\n" +
  "necessary, cross-provider verification and its remediation rounds, the\n" +
  "complete suite as the run of record, the commit, the push, and the close.\n" +
  "None of them is yours to run, and none of them is yours to skip ahead to\n" +
  "— the instruction in hand is the whole of what is asked.\n" +
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
  "- Verification verdicts come from the verifier. A verdict token the\n" +
  "  framework did not hand you does not exist.\n" +
  "- API keys live in env vars (`DABBLER_ANTHROPIC_API_KEY`,\n" +
  "  `DABBLER_OPENAI_API_KEY`, `DABBLER_GEMINI_API_KEY`), never in files. The\n" +
  "  same rule covers a feed PAT: configuration names it and never holds it.\n" +
  "- The router is one command, `dabbler <verb>` — no interpreter, no virtual\n" +
  "  environment. A VS Code terminal has it on `PATH`; anywhere else, run\n" +
  "  `npm i -g dabbler-ai-router` once. \"dabbler: command not found\" is a\n" +
  "  PATH problem, not a missing-keys problem.\n" +
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
 * Codex and Copilot read `AGENTS.md`, the one file with the body.
 */
export const AGENTS_TAIL =
  "## Engine tail (Codex / GitHub Copilot)\n" +
  "\n" +
  "You read this `AGENTS.md` directly. `CLAUDE.md` and `GEMINI.md` import\n" +
  "it rather than repeating it, so this file is the one place the body\n" +
  "exists. GitHub Copilot loads all three files at once and de-duplicates\n" +
  "nothing, which is exactly why only this one carries the body.\n" +
  "\n" +
  "Copilot seats: declare `--model` on the first call, the one that\n" +
  "registers, and prefer `DABBLER_TRANSPORT=copilot-cli` when routing\n" +
  "through the seat. Cross-provider verification stays cross-provider on\n" +
  "every transport.\n";

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
  "You are preparing a project plan for the Dabbler session workflow.\n" +
  "\n" +
  "Create — or import — `docs/planning/project-plan.md`, the stable artifact\n" +
  "the decomposition session reads from.\n" +
  "\n" +
  "The plan's substance is the operator's, not yours. Before writing\n" +
  "anything, ask them what the project is: its purpose, what success looks\n" +
  "like, the phases or feature areas they have in mind, and whether a plan,\n" +
  "brief or notes already exist that should be imported. Ask when the\n" +
  "repository and your prompt do not already answer those questions. Do not\n" +
  "search neighbouring directories for a plan, and do not draft one from the\n" +
  "folder name — a guessed plan is decomposed by the next session into\n" +
  "sessions nobody asked for.\n" +
  "\n" +
  "- **Create:** from the operator's answers, draft the plan: overview, goals\n" +
  "  and success criteria, high-level phases or feature areas, and each\n" +
  "  phase's key deliverables. Keep it concise — the decomposition session\n" +
  "  turns each phase into numbered sessions, so scope each phase to a\n" +
  "  handful of focused AI sessions.\n" +
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
  "Read `docs/planning/project-plan.md` in this workspace (it is deliberately\n" +
  "not inlined here) and decompose it into a sequence of numbered sessions.\n" +
  "Each session is a focused unit of work that one AI coding session can\n" +
  "complete.\n" +
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
  "  steps run the affected tests, cross-provider verification, the complete\n" +
  "  suite once against the verified tree, and close-out; the middle steps are\n" +
  "  the work. Never write a step that says \"run the tests\" without saying\n" +
  "  which run it means.\n" +
  "- A session may declare `Policy: fast` or `Policy: verified` on its own\n" +
  "  line; omitting it uses the repository default.\n" +
  "- Do NOT hand-author `sessions.json`: the first `session start` bootstraps\n" +
  "  it from this plan — state files are the runtime writers' job, never\n" +
  "  authored by hand.\n" +
  "\n" +
  "Authoring guidance:\n" +
  "- Order sessions so earlier ones unblock later ones.\n" +
  "- Keep scope tight: at most ~3 work steps per session. A session whose\n" +
  "  evidence bundle a verifier cannot read is too large, and the evidence cap\n" +
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
  "### Session 1: Author or import the project plan\n" +
  "\n" +
  "1. Register.\n" +
  "2. Ask the operator what the project is — its purpose, what success looks\n" +
  "   like, the phases or feature areas they have in mind, and whether a\n" +
  "   plan, brief or notes already exist — unless the repository or your\n" +
  "   prompt already says. The plan's substance is theirs: do not search\n" +
  "   neighbouring directories for one, and do not draft one from the folder\n" +
  "   name. Then create — or import — `docs/planning/project-plan.md`:\n" +
  "   overview, goals and success criteria, high-level phases or feature\n" +
  "   areas, and each phase's key deliverables. Keep it concise — session 2\n" +
  "   turns each phase into numbered sessions, so scope each phase to a\n" +
  "   handful of focused AI sessions.\n" +
  "3. Affected tests as preverify.\n" +
  "4. Cross-provider verification.\n" +
  "5. Full test suite, recorded as the run of record.\n" +
  "6. Close-out.\n" +
  "\n" +
  "**Creates:** `docs/planning/project-plan.md`. A later revision is just\n" +
  "another plan session that amends the same file.\n" +
  "\n" +
  "### Session 2: Break the plan into numbered sessions\n" +
  "\n" +
  "1. Register.\n" +
  "2. Read `docs/planning/project-plan.md` and break it into numbered\n" +
  "   sessions appended to this file. Each session is a focused unit of work\n" +
  "   one AI coding session can complete: one\n" +
  "   `### Session <N>: <title>` heading, and its steps as a top-level\n" +
  "   ordered list. Step 1 registers the session; the last steps run the\n" +
  "   affected tests, cross-provider verification, the complete suite once\n" +
  "   against the verified tree, and close-out; the middle steps are the\n" +
  "   work. Never write a step that says \"run the tests\" without saying which\n" +
  "   run it means. Order sessions so earlier ones unblock later ones, and\n" +
  "   keep at most ~3 work steps per session.\n" +
  "3. Affected tests as preverify.\n" +
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
  "# Which tests a change makes necessary, and what proves the suite was green.\n" +
  "# Pre-verification runs the selected tests only; the complete suite is\n" +
  "# recorded once, against the final verified tree.\n" +
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
  "#               files, so there is no narrowed form of it to run.\n" +
  "#               Pre-verification runs it complete and the record says so.\n" +
  "testing:\n" +
  "  suites:\n";

export const PROJECT_CONFIG_SELECTION =
  "\n" +
  "  # Which tests answer for which path.\n" +
  "  #\n" +
  "  # A scaffolded repository has declared no mapping yet, and the framework\n" +
  "  # refuses to invent one: a path no rule covers is `selection_unknown`, and\n" +
  "  # pre-verification fails closed rather than let a green run for the mapped\n" +
  "  # half of a change read as covering the other half. So setup declares the\n" +
  "  # only honest starting mapping there is -- every path is repository-wide,\n" +
  "  # every change affects every test, and the complete suite is what\n" +
  "  # pre-verification asks for.\n" +
  "  #\n" +
  "  # It is correct and it is expensive, and it is meant to be replaced. Narrow\n" +
  "  # it as the repository takes shape: `repo_wide` for the few paths that\n" +
  "  # really do change what every test does (the test config, the lockfile),\n" +
  "  # `rules` mapping a source path to the tests that would notice it breaking,\n" +
  "  # and `smoke` for what runs when a path maps to nothing.\n" +
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
  "# to no feed today.\n" +
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
  "# Only exit {blocking} -- the guard saying \"a step is open\" -- blocks the commit.\n" +
  "# A router that is not on PATH, or an unreadable ledger, exit differently\n" +
  "# and are let through: neither is the guard's verdict, and a repository\n" +
  "# nobody can commit to is a worse failure than an unguarded one. The\n" +
  "# binding check is `verify step close`, which refuses outright when HEAD\n" +
  "# has moved off the commit the step opened on.\n" +
  "dabbler verify step guard-commit\n" +
  "if [ $? -eq {blocking} ]; then\n" +
  "  exit 1\n" +
  "fi\n" +
  "exit 0\n";
