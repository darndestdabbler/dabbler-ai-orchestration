# Set 013 — Adoption Bootstrap Prompt (Change Log)

**Status:** complete · 2 of 2 sessions verified
**Started:** 2026-05-04 · **Completed:** 2026-05-04
**Orchestrator:** claude-code (Anthropic, claude-opus-4-7, high) — both sessions
**Verifier:** gpt-5-4 (cross-provider, both sessions)

This set delivers the user-facing entry point for adopting the Dabbler
AI-led workflow. **One** command — `Dabbler: Copy adoption bootstrap
prompt` — copies a short, engine-agnostic prompt to the clipboard.
The human pastes it into a fresh Claude Code / Gemini Code Assist /
GPT chat; the AI then fetches the canonical online instructions and
runs an interactive 9-step bootstrap flow with the human, ending in a
batch-approved checklist of writes / configs / scaffolding actions.
Adoption friction drops to "click → paste → talk to the AI." No
multiple entry points, no autonomous fire-and-forget mode, no
per-write confirmation prompts — instead, "AI gathers all decisions
in dialog → presents a numbered list → human batch-approves → AI
executes; human can interrupt at any time."

Mode selection is **budget-driven**: the AI asks the human for a
concrete dollar outsourcing/API budget, saves it as a threshold file
(`ai_router/budget.yaml`), and recommends a verification mode based
on four tiers (zero / less than ~$20 / $20–$99 / $100+, mapping to
manual-via-other-engine or skipped through `outsource-last` with
spend-monitoring through `outsource-first` with full API automation).
The zero-budget tier carries two operator-authorized sub-options: (a)
manual verification via a *different* AI assistant per session, or
(b) skip verification with the decision logged in each session's
`change-log.md`. Option (b) is the single explicit exception to
workflow Rule 2 ("Never skip verification"), documented in the new
"Cost-budgeted verification modes" section of
`docs/ai-led-session-workflow.md` as a *complement* to Rule 2 — the
rule itself stays unchanged.

## Summary of changes

### Session 1 — Canonical doc + workflow-doc Cost-budgeted-modes section

**Goal:** Land the canonical online instructions doc plus the new
workflow-doc section that documents the four-tier budget mapping and
the operator-authorized exception to Rule 2.

- **`docs/adoption-bootstrap.md`** (new, ~360 lines) — the runtime
  instruction set an arbitrary AI reads when a human pastes the
  bootstrap prompt into a fresh chat. Engine-agnostic by construction:
  describes tools in capability terms ("fetch a URL," "list files
  matching a pattern," "read a file," "write a file," "run a shell
  command"), no Claude-specific tool function names. Internal
  structure (no user-facing branch labels): Step 1 detect VS Code
  context (workspace open vs. no workspace open with three sub-paths
  — design here / existing local elsewhere / clone remote); Step 2
  fast-path detection of an existing `docs/planning/project-plan.md`;
  Step 3 confirm understanding (workspace or explicit target path);
  Step 4 brief in-flow education on session sets; Step 5
  budget-threshold dialog with four tiers + zero-tier sub-options
  (a)/(b); Step 6 plan-alignment dialog; Step 7 build the
  numbered action checklist (the load-bearing gate — no writes until
  the human batch-approves); Step 8 execute the approved checklist;
  Step 9 closing pointers (budget monitoring, cost dashboard,
  more-info links, next-session trigger phrase). The doc embeds the
  `ai_router/budget.yaml` schema reference with explicit missing-field
  compatibility defaults for forward-evolution.
- **`docs/ai-led-session-workflow.md`** — new "Cost-budgeted
  verification modes" section inserted after Overview / before Key
  Concepts. Documents the four-tier mapping, the
  manual-via-other-engine workflow for zero-budget option (a), the
  Rule 2 exception for zero-budget option (b), and how `budget.yaml`
  declares the choice. Cross-linked from the bootstrap doc's Step 5
  and Step 9.
- **Cross-provider verification:** routed to gpt-5-4 across **four**
  rounds (cost $0.5898 total: $0.1512 + $0.1995 + $0.1759 + $0.0632).
  R1 raised 1 Critical (clone path violated checklist gate) + 4 Major
  + 1 Minor. R2 fixed the Critical and most enum drift but raised 3
  Major + 1 Minor. R3 closed those but raised 1 Major
  (`verification_method` missing-field default) + 3 Minor. R4
  returned VERIFIED. 13 issues total, all fixed and recorded in
  `issue-logs/session-001.json`.
- **Cost overrun explanation:** projected $0.15–$0.40 / two rounds;
  actual $0.59 / four rounds. Driver: doc-as-runtime-instruction-set
  verification surface is much denser than projected — every field
  of the embedded budget.yaml schema, every cross-link, every step's
  flow logic, every edge-case guard becomes a verification target.
  Logged in `ai-assignment.md` Session 1 actuals as a candidate
  `lessons-learned.md` note.

### Session 2 — Extension command + READMEs + 0.12.1 VSIX build + smoke test

**Goal:** Wire up the `Dabbler: Copy adoption bootstrap prompt`
command pointing at the now-live canonical URL, ship it in a 0.12.1
VSIX, and update the surrounding Marketplace surfaces.

- **`tools/dabbler-ai-orchestration/src/commands/copyAdoptionBootstrapPrompt.ts`**
  (new, 21 lines) — exports `registerCopyAdoptionBootstrapPromptCommand`,
  which registers the `dabbler.copyAdoptionBootstrapPrompt` command.
  The handler copies a constant `ADOPTION_BOOTSTRAP_PROMPT` string to
  the clipboard via `vscode.env.clipboard.writeText` and shows an
  info message ("Copied. Paste into any AI chat (Claude Code /
  Gemini / GPT) and the AI will take over."). The clipboard string
  is byte-identical to the spec sketch — verified by round-trip
  extraction from the source TS and direct comparison.
- **`tools/dabbler-ai-orchestration/src/extension.ts`** — imports and
  registers the new command alongside the existing
  `registerXxxCommand` calls.
- **`tools/dabbler-ai-orchestration/package.json`** — version bumped
  0.12.0 → 0.12.1 (patch — additive new command, no breaking
  changes); description extended to mention the bootstrap entry
  point; keywords appended with `adoption`, `bootstrap`,
  `onboarding` for Marketplace search;
  `contributes.commands` gained the new entry with command id
  `dabbler.copyAdoptionBootstrapPrompt` and title
  `Copy adoption bootstrap prompt`.
- **`tools/dabbler-ai-orchestration/CHANGELOG.md`** — new v0.12.1
  entry covering the new command, the four-tier budget-driven mode
  philosophy, the canonical doc URL, and explicit `### Notes` on
  patch-vs-minor rationale and the deferred automated-enforcement
  scope.
- **`tools/dabbler-ai-orchestration/README.md`** — new "Adoption
  bootstrap" subsection at the top of Features, one-paragraph form
  with the canonical raw URL.
- **`README.md`** (repo-root) — new "For new projects: adoption
  bootstrap" top-level section inserted between "Installing the VS
  Code extension" and "Adopting `ai_router` in a project", with both
  relative and absolute links to the canonical doc and a cross-link
  to `docs/ai-led-session-workflow.md#cost-budgeted-verification-modes`.
  Entry added to the table of contents.
- **VSIX build:** `npm run compile && npx vsce package` produced
  `dabbler-ai-orchestration-0.12.1.vsix` (18 files, 331 KB) cleanly.
  First attempt missed the recompile step (`npx vsce package` alone
  doesn't run the `compile` npm script) — caught when the bundled
  `dist/extension.js` didn't include the new command source, fixed
  with explicit `npm run compile && npx vsce package`. Lesson worth
  filing: the VSIX-build chain assumes you call the package npm
  script (`npm run package`), not vsce directly.
- **Smoke test:** VSIX manifest version=0.12.1, description includes
  "adoption-bootstrap entry point", keywords include the three new
  search terms; the new command id appears in `contributes.commands`
  with the right title and category; bundled `dist/extension.js`
  (285 KB) contains the `copyAdoptionBootstrapPrompt.ts` source with
  the registration call and the URL string; round-trip-extracted
  `ADOPTION_BOOTSTRAP_PROMPT` literal byte-matches the spec sketch
  (`MATCH`); canonical URL returns HTTP 200 (28879 bytes).
- **VSIX commit decision:** the spec instructed "the 0.12.1 VSIX is
  committed alongside the source for sideload availability, matching
  the existing `dabbler-ai-orchestration-0.12.0.vsix` artifact
  pattern." However, `.gitignore` blocks `*.vsix` and **no** VSIX has
  ever been tracked in git history despite the repo-root README
  directing users to "Pull this repo so you have the VSIX file
  locally." The orchestrator chose to skip committing the VSIX
  rather than `git add -f` it, and surfaced the discrepancy in the
  commit message as a follow-up for the operator: either carve a
  `tools/dabbler-ai-orchestration/*.vsix` exception in `.gitignore`
  (matching the README's promise + the spec's intent), or update the
  README to direct users to build the VSIX locally. This is the
  honest reading of the conflict and the right escalation point.
- **Cross-provider verification:** routed to gpt-5-4, R1 returned
  VERIFIED with empty issues array on the first round, no fix rounds
  required — matching the spec's "Round 1 typically passes for this
  category of mechanical work" projection.
- **Cost:** $0.1296 across two routed `session-verification` calls
  via gpt-5-4 ($0.0898 + $0.0398). The first call returned a verdict
  but the orchestrator's Python wrapper crashed reading a wrong
  `RouteResult` attribute name (`.model` vs the actual `.model_name`)
  before the verdict was captured to a file; the re-run on the
  corrected attribute name returned `VERIFIED`. Both calls were
  logged to metrics.jsonl per the append-only contract — the cost is
  real spend, not a duplicate write. Candidate `lessons-learned.md`
  note: when invoking `ai_router.route()` inline from Python, use
  the actual `RouteResult` dataclass field names (`model_name`,
  `model_id`) rather than guessing `.model`, and prefer printing the
  result to a file before any field access to prevent
  read-then-crash double-spend.

## Cumulative cost

- **Session 1:** $0.5898 (4 rounds session-verification via gpt-5-4)
- **Session 2:** $0.1296 (2 routed calls — see Session 2 cost note above)
- **Set total:** $0.7194 (vs. spec projection $0.20–$0.55; ~31% over,
  driven entirely by Session 1's broader-than-projected verification
  surface)

## Files committed in this set

**New:**

- `docs/adoption-bootstrap.md`
- `docs/session-sets/013-adoption-bootstrap-prompt/spec.md`
- `docs/session-sets/013-adoption-bootstrap-prompt/ai-assignment.md`
- `docs/session-sets/013-adoption-bootstrap-prompt/disposition.json`
- `docs/session-sets/013-adoption-bootstrap-prompt/session-state.json`
- `docs/session-sets/013-adoption-bootstrap-prompt/activity-log.json`
- `docs/session-sets/013-adoption-bootstrap-prompt/session-events.jsonl`
- `docs/session-sets/013-adoption-bootstrap-prompt/session-reviews/session-001-prompt.md` (+ r2/r3/r4)
- `docs/session-sets/013-adoption-bootstrap-prompt/session-reviews/session-001.md`
- `docs/session-sets/013-adoption-bootstrap-prompt/session-reviews/session-002-prompt.md`
- `docs/session-sets/013-adoption-bootstrap-prompt/session-reviews/session-002.md`
- `docs/session-sets/013-adoption-bootstrap-prompt/issue-logs/session-001.json`
- `docs/session-sets/013-adoption-bootstrap-prompt/change-log.md` (this file)
- `tools/dabbler-ai-orchestration/src/commands/copyAdoptionBootstrapPrompt.ts`

**Modified:**

- `docs/ai-led-session-workflow.md` (new "Cost-budgeted verification modes" section)
- `README.md` (new "For new projects" top-level section + TOC entry)
- `tools/dabbler-ai-orchestration/src/extension.ts` (registration)
- `tools/dabbler-ai-orchestration/package.json` (version + keywords + description + commands)
- `tools/dabbler-ai-orchestration/package-lock.json` (version sync)
- `tools/dabbler-ai-orchestration/CHANGELOG.md` (v0.12.1 entry)
- `tools/dabbler-ai-orchestration/README.md` (Adoption bootstrap subsection)
- `tools/dabbler-ai-orchestration/dist/extension.js` (rebuilt)
- `tools/dabbler-ai-orchestration/dist/extension.js.map` (rebuilt)

## Residual notes / follow-ups for next set

1. **VSIX gitignore vs. README promise.** The repo-root README tells
   users to "Pull this repo so you have the VSIX file locally," but
   `.gitignore` blocks `*.vsix` and no VSIX has ever been tracked.
   Either carve an exception or change the README. Flagged in the
   Session 2 commit message.
2. **`lessons-learned.md` candidates.** Two: (a) doc-as-instruction-set
   verification cost density (Session 1's four-round surface);
   (b) `RouteResult` field-name discipline + result-to-file pattern
   (Session 2's read-then-crash double-spend). Worth promoting if a
   future set hits either pattern again.
3. **Set 012 Sessions 2–3 follow-up.** The operator-paused Set 012
   Session 2 (Marketplace publish) is the natural next step. After
   it ships, Set 012 Session 3 (README shrink) can incorporate the
   adoption-bootstrap entry point as the recommended starting point
   in the trimmed adoption flow.
4. **Automated budget-threshold enforcement.** The schema is shipped
   in this set; pre-call warnings + spend monitoring + block-on-exceed
   logic are deferred to a follow-up set per spec non-goals. The
   bootstrap doc tells humans monitoring is currently manual.
