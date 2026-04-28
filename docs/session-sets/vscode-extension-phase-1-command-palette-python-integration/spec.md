# Session Set: VS Code Extension Phase 1 — Command Palette + Python Script Integration

## Summary

Expand the VS Code Session Set Explorer extension with command-palette integration for Python script access. Enable users to run `ai-router.utils` commands (spend reports, cleanup-dev-orphans, API key loading) directly from the command palette with terminal output piped into VS Code, eliminating the need for manual script invocation.

**Phase 1 Scope:** Command palette entry points + terminal integration only. No settings UI, no GitHub import, no worktree wizard. Minimal new extension code, maximal value from existing scripts.

---

## Problem Statement

### Current State
- Python utility scripts (`ai-router.utils`) exist and are functional
- Users must discover and invoke them manually via PowerShell / Bash
- No discoverable entry point from within the IDE
- Colleagues unfamiliar with the Python tooling don't know these capabilities exist

### Why This Matters
- **Discoverability:** Command palette makes tools visible; manual invocation hides them
- **Accessibility:** Direct VS Code integration is easier than shell scripting for IDE-native colleagues
- **Workflow:** Terminal output stays in VS Code instead of requiring separate windows/shells
- **Validation:** "It works in the IDE" is the standard for adoption in teams

### Success Metric
After Phase 1, a colleague can:
1. Open the command palette (Ctrl+Shift+P)
2. Type "spend" → see "Dabbler: Show spend summary"
3. Run it → see live terminal output of spend-to-date across session sets
4. View the full result without switching to PowerShell

---

## Scope

### In Scope — Phase 1

#### 1. Command Palette Entries
Five new commands, all launched from command palette:
- `dabbler.spend.summary` — "Dabbler: Show spend summary (all session sets)"
- `dabbler.spend.bySessionSet` — "Dabbler: Show spend summary (by session set)"
- `dabbler.cleanup.devOrphans` — "Dabbler: Cleanup dev orphans (stale processes + build servers)"
- `dabbler.keyLoad.loadEnvKeys` — "Dabbler: Load environment keys (Windows User scope)"
- `dabbler.refresh.sessionSets` — "Dabbler: Refresh session set explorer" (existing, but good to document)

#### 2. Terminal Integration
- Create and reuse a single "Dabbler AI Tools" terminal (per workspace)
- All script output goes to that terminal
- Terminal is cleared before each command run
- User can send Ctrl+C to interrupt long-running scripts
- Exit codes are logged to the terminal for failure diagnosis

#### 3. Python Script Invocation
- Detect Python executable (assume `python` in PATH)
- Invoke as: `python -m ai_router.utils --command <cmd> --args ...`
- Routing is handled by the existing `ai-router/__init__.py` dispatcher
- No new Python code needed — only orchestration of existing functions

#### 4. Documentation
- Update `extension.js` with comments explaining command registration + terminal dispatch
- Add "Troubleshooting" section to `vscode-session-sets/README.md` (Python not found, terminal output, etc.)
- Keep Phase 2+ opportunities documented in `README.md` under "Future Phases"

### Out of Scope — Phase 1

- Settings UI / configuration panel
- GitHub import + auto-sync of orchestration files
- Worktree initialization wizard
- Spend visualization (charts, graphs)
- Interactive prompts within the extension (user passes `--yes` flag instead)
- Per-workspace or per-repo configuration of Python path (uses PATH)

---

## Detailed Implementation Plan

### Task Group 1: Wire Command Palette Commands (extension.js)

#### 1.1 Add Command Metadata
In `package.json` `contributes.commands`, add five new command entries:

```json
{
  "command": "dabbler.spend.summary",
  "title": "Dabbler: Show spend summary (all session sets)"
},
{
  "command": "dabbler.spend.bySessionSet",
  "title": "Dabbler: Show spend summary (by session set)"
},
{
  "command": "dabbler.cleanup.devOrphans",
  "title": "Dabbler: Cleanup dev orphans"
},
{
  "command": "dabbler.keyLoad.loadEnvKeys",
  "title": "Dabbler: Load environment keys (Windows User scope)"
},
```

(The refresh command already exists as `dabblerSessionSets.refresh`; no action needed.)

#### 1.2 Implement Terminal Helper
Add to `extension.js`:
```javascript
function getOrCreateTerminal(name = "Dabbler AI Tools") {
  let terminal = vscode.window.terminals.find(t => t.name === name);
  if (!terminal) {
    terminal = vscode.window.createTerminal(name);
  }
  return terminal;
}

function runDabblerCommand(command, args = []) {
  const terminal = getOrCreateTerminal();
  terminal.show(false); // Show but don't steal focus
  
  // Clear terminal before command
  terminal.sendText("Clear-Host", true); // PowerShell
  
  // Build command string
  const pythonCmd = `python -m ai_router.utils ${command}${args.length ? " " + args.join(" ") : ""}`;
  terminal.sendText(pythonCmd, true);
}
```

#### 1.3 Register Command Handlers
Add to `activate()` function:
```javascript
context.subscriptions.push(
  vscode.commands.registerCommand("dabbler.spend.summary", () => {
    runDabblerCommand("spend-summary");
  }),
  vscode.commands.registerCommand("dabbler.spend.bySessionSet", () => {
    runDabblerCommand("spend-by-session-set");
  }),
  vscode.commands.registerCommand("dabbler.cleanup.devOrphans", () => {
    runDabblerCommand("cleanup-dev-orphans", ["--match-path", "dabbler-ai-orchestration"]);
  }),
  vscode.commands.registerCommand("dabbler.keyLoad.loadEnvKeys", () => {
    runDabblerCommand("load-env-keys");
  })
);
```

#### 1.4 Test Command Discovery
- Open command palette (Ctrl+Shift+P)
- Type "dabbler:" → all five commands should appear
- Type "spend" → filters to spend-related commands
- Type "cleanup" → filters to cleanup commands

**Success:** All five commands are discoverable and appear with correct titles.

---

### Task Group 2: Validate Python Script Routing

#### 2.1 Verify ai-router Dispatcher
Inspect `ai-router/__init__.py` to confirm it accepts command-line arguments for each script category:
- `spend-summary` → routes to spend reporting
- `cleanup-dev-orphans` → routes to cleanup tool
- `load-env-keys` → routes to key-loading utility

**Expected:** Dispatcher accepts `python -m ai_router.utils <cmd> [args]` and prints results to stdout.

#### 2.2 Test Each Script Manually (Windows Bash)
```bash
cd /c/Users/denmi/source/repos/dabbler-ai-orchestration
python -m ai_router.utils spend-summary
python -m ai_router.utils cleanup-dev-orphans --dry-run
python -m ai_router.utils load-env-keys
```

**Expected:** All three commands complete successfully and output human-readable results to stdout.

#### 2.3 Verify Exit Codes
- Success: exit code 0
- User abort (Ctrl+C in cleanup prompt): exit code 130 or similar
- Failure (missing deps, API error): non-zero exit code

**Expected:** Terminal shows exit code; user can diagnose from the output.

---

### Task Group 3: Extension Testing

#### 3.1 Manual Command Palette Test (All Five Commands)
1. Open a dabbler repo workspace in VS Code (e.g., `dabbler-ai-orchestration/main`)
2. Open command palette (Ctrl+Shift+P)
3. Run each of the five commands in sequence:
   - `dabbler.spend.summary` → terminal shows spend report
   - `dabbler.spend.bySessionSet` → terminal shows spend by session set
   - `dabbler.cleanup.devOrphans` → terminal prompts y/N (user presses 'N' to abort)
   - `dabbler.keyLoad.loadEnvKeys` → terminal shows key-loading status
   - `dabbler.refresh.sessionSets` → session-set tree refreshes

**Success Criteria:**
- All five commands complete without errors
- Terminal output is readable and not truncated
- No extension crashes or console errors in the Extension Host

#### 3.2 Terminal Lifecycle Test
1. Run a command (e.g., spend-summary)
2. In the terminal, manually type a new command (e.g., `echo "test"`)
3. Run a second Dabbler command (cleanup) → should NOT clear the echo output; should append
4. Run a third command (spend-summary) → should clear the terminal before the new output

**Success Criteria:**
- Terminal reuse works without leaking output between commands
- Clear-Host (PowerShell) or equivalent works on the target shell

#### 3.3 Error Path Test
1. Modify the Python command to invoke a non-existent command (e.g., `fake-command`)
2. Run the command from the palette
3. Terminal shows the error (e.g., "Unknown command: fake-command")

**Success Criteria:**
- Errors are visible in the terminal
- Extension does not crash on Python exit code 1 or similar

---

### Task Group 4: Documentation

#### 4.1 Update extension.js Comments
Add a new "Command Palette Integration" section at the top of the file (after the existing comments) documenting:
- The five new commands and their purpose
- The terminal helper functions
- The routing to `ai-router.utils`
- No external dependencies beyond Python on PATH

#### 4.2 Update vscode-session-sets/README.md
Add new sections:
- **"Python Script Access"** — Describes the five command palette commands and when to use each
- **"Troubleshooting"** — Common issues:
  - Python not found in PATH → add Python to PATH or update script
  - Terminal output is blank → check Extension Host console for errors
  - Commands are greyed out → verify workspace has `docs/session-sets/` subdirectory
- **"Future Phases"** — Bulleted list of Phase 2–4 ideas (settings UI, GitHub import, worktree wizard, spend visualization)

#### 4.3 Update orchestration repo CLAUDE.md / AGENTS.md / GEMINI.md
Add one-line pointer under "Tools" or "Orchestration" section:
- "VS Code Session Set Explorer includes command-palette access to Python utilities (spend, cleanup, key loading). See `tools/vscode-session-sets/README.md`."

---

### Task Group 5: Build & Package Extension

#### 5.1 Build the Extension
```bash
cd /c/Users/denmi/source/repos/dabbler-ai-orchestration/tools/vscode-session-sets
npm install  # if needed
# Extension is already bundled as .js; no build step needed
```

#### 5.2 Create Release .vsix
```bash
# Using vsce (VS Code packaging tool)
npm install -g @vscode/vsce
vsce package --out dabbler-session-sets-0.9.0.vsix
```

(Bump version to 0.9.0 to reflect the new feature.)

#### 5.3 Test the .vsix
- Uninstall the existing extension (if installed)
- Install the new .vsix from the file
- Verify command palette shows the five new commands
- Run each command and verify output

---

## Risk Assessment

### Risk 1: Python Not Found in PATH
**Severity:** Medium  
**Likelihood:** Medium (especially on fresh Windows installs)  
**Mitigation:**
- Document clearly in README
- Terminal output will show "python: command not found" → user adds Python to PATH
- Phase 2 could add a "Configure Python Path" setting

### Risk 2: Terminal Flakiness (PowerShell vs. Bash)
**Severity:** Medium  
**Likelihood:** Low (VS Code terminal is stable)  
**Mitigation:**
- Test both PowerShell and Bash (Git Bash on Windows)
- Docs note that behavior may differ slightly per shell
- Phase 2 could add shell selection in settings

### Risk 3: Colleagues Inadvertently Kill Important Processes via Cleanup
**Severity:** High  
**Likelihood:** Low (cleanup already prompts y/N)  
**Mitigation:**
- Cleanup tool already has interactive prompts; extension passes `--yes` flag only when user confirms via additional VS Code dialog
- Document that cleanup must be run explicitly; no "auto-cleanup" mode
- Add warning badge or icon to the cleanup command in the palette

### Risk 4: Long-Running Scripts Block UI
**Severity:** Low  
**Likelihood:** Low (scripts typically run in seconds)  
**Mitigation:**
- Scripts are invoked in the terminal, not a modal dialog → UI remains responsive
- User can Ctrl+C to interrupt from the terminal

---

## Effort Estimate

| Task Group | Estimate | Rationale |
|-----------|----------|-----------|
| 1: Wire Commands | 1–2 hours | ~20 lines of JavaScript; mostly copy-paste + testing |
| 2: Validate Routing | 1 hour | Verify existing scripts work; no new code |
| 3: Extension Testing | 1–2 hours | Manual testing of all paths; documentation of findings |
| 4: Documentation | 1 hour | Comments + README updates |
| 5: Build & Package | 0.5 hours | Standard vsce workflow |
| **Total** | **4.5–6.5 hours** | **Realistic for ~1–2 focused sessions** |

---

## Success Criteria

Phase 1 is complete when:

1. ✅ All five commands are registered in `package.json` and appear in the command palette
2. ✅ Running each command from the palette invokes the corresponding Python utility
3. ✅ Terminal output is visible and not truncated
4. ✅ No extension crashes or unhandled exceptions
5. ✅ Documentation in README covers the new commands + troubleshooting
6. ✅ Version bumped to 0.9.0 and released as a new .vsix
7. ✅ One colleague (other than the author) can discover and run a command without external guidance

---

## Dependencies & Assumptions

- Python is installed and on PATH
- VS Code 1.70.0 or later
- `dabbler-ai-orchestration/ai-router/utils.py` is functional and contains the required command handlers
- Extension is already installed or loadable locally for testing

---

## Out-of-Band Notes

### Phase 2 Opportunity: Settings UI
Add a Settings panel for:
- Python executable path (auto-detect vs. explicit)
- Shell preference (PowerShell vs. Bash)
- Spend-report frequency (monthly, weekly, per-session)
- Terminal behavior (always show vs. show-on-output)

### Phase 3 Opportunity: Worktree Initialization Wizard
Add a command palette command that launches an interactive wizard:
1. Asks for repo URL
2. Asks for container name (e.g., `my-project`)
3. Asks for layout (bare-repo + flat-worktree vs. legacy sibling)
4. Runs the appropriate `git clone --bare` + setup steps
5. Opens the new repo in a new VS Code window

### Phase 4 Opportunity: GitHub Auto-Sync
Add a Settings entry to enable:
- Auto-pull of `orchestration/docs/` files (layout docs, workflow docs)
- Auto-pull of agent files (CLAUDE.md, AGENTS.md, GEMINI.md) from the orchestration repo
- Version tracking (which commit of orchestration is this workspace using?)

---

## Approval Checklist

- [ ] Scope is acceptable (Phase 1 only, no out-of-scope features)
- [ ] Effort estimate is realistic (4.5–6.5 hours)
- [ ] Risk assessment is adequate
- [ ] Success criteria are clear and measurable
- [ ] Ready to split into sessions and proceed

