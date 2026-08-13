**ISSUES FOUND**

- **Issue 1:** The echoed command is prefixed with `> `, so the visible line is not the exact copy-pasteable command that ran.
  - **Category:** Correctness
  - **Severity:** Major
  - **Evidence paths:** `tools/dabbler-ai-orchestration/src/utils/routerCli.ts:207-214`
  - **Failure scenario:** Every router-backed command writes the only visible command line as `> <python> -m ...`; a developer copying what the output channel shows gets a leading shell redirection token, not the command that was spawned. This is probable because it happens on the main path for all new launchers.
  - **Acceptance criterion:** `JUDGMENT - The output channel must display a bare, copy-pasteable command line equal to the spawned command, with any prompt/label moved to a separate non-command line or removed, and a launcher test must assert the first command echo equals commandLine exactly.`
  - **Details:** Violation: the spec requires “Show the exact `python -m ai_router.modules …` line” and says a developer should be able to “copy what they just saw and get the same result.” Impact: this breaks the core visibility/reproducibility deliverable for every CLI-backed mutation. Evidence: `buildCommandLine()` builds the bare command, but `runRouterCli()` appends ``> ${commandLine}`` to the output channel.

**NITS**

- **Nit:** `quoteForDisplay` uses double-quote/backslash escaping that is not reliably copy-paste equivalent in common Windows shells for free-text args containing embedded quotes, `$`, backticks, or literal backslashes.
- **Nit:** `tools/dabbler-ai-orchestration/CHANGELOG.md` says “Open Plan” now launches the router CLI, but `openModulePlan.ts` still opens the file directly; that code behavior appears sensible because there is no `ai_router.modules open-plan` verb, but the changelog overclaims.
- **Nit:** `ai_router.modules assign-sets` joins `--set` values directly under `docs/session-sets` without validating they are basenames; the extension passes safe scanned names, but the public CLI should reject path separators/traversal explicitly.