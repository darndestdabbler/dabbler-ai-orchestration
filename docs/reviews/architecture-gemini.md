# The Native Worktree Architecture

### 0. The plain-English paragraph and the slide

**The five-minute test:**
Dabbler is a tool that runs on your laptop and gives you a web dashboard to supervise AI doing project work. You use the dashboard to approve plans, assign tasks to AI models, and review the code or documents they write. When an AI produces a change, Dabbler creates a temporary, invisible copy of your project folder, runs your tests or checks inside that copy, and deletes it. This means the AI can never accidentally break your real workspace. You don't need to configure complex environments or install extensions; you just start the Dabbler server in your terminal, open your browser, and click approve or reject while the AI does the typing.

**The slide test:**
```text
+-----------------------+
|   Web Browser         |  <-- 1. Supervisor Dashboard (React/Static)
|   (The UI)            |         Staff read briefs and click "Approve"
+-----------------------+
          |
    (HTTP / SSE)
          v
+-----------------------+      (HTTPS)       +-----------------------+
|   Dabbler Server      | -----------------> |    AI Vendor APIs     |
|   (Native Python)     |                    | (Anthropic/OpenAI)    |
+-----------------------+                    +-----------------------+
          |
   (spawns process)
          v
+-----------------------+
|   Git Worktree        |  <-- 3. Isolated file copy for safe testing
|   (Native OS bounds)  |         Executes Java/.NET/Linters natively
+-----------------------+
```

**The moving-parts budget:** **3 things.**
A staff member must understand:
1. The `dabbler serve` command (starts the system).
2. The Web Dashboard (where they spend their day).
3. `solution.yaml` (where they list the project's components).

*Invisible parts nobody has to think about:*
*   **Git Worktrees:** Managed automatically by `checks.py`. Staff never see them; they just see "tests passed" or "tests failed" without their working directory changing.
*   **The Append-Only Journal:** `session-events.jsonl` is written and read by the framework. Staff never edit it.
*   **API Transports & Keys:** Handled by the framework in the background. 
*   **Prompt Templates & Guidance:** Bound into the framework at release.

### 1. The architecture

Containers are abandoned. On Windows, crossing the VM boundary to access the host NTFS filesystem imposes a massive performance penalty on I/O-heavy operations like Java and .NET compilation. It destroys objective 2 (Performance) and objective 1 (Setup Simplicity).

**The replacement mechanism for setup-and-upgrade:** A single Python wheel distributed via `pipx`. One artifact contains the CLI, the framework, the guidance documents, the AI prompts, and the static HTML/JS for the supervisor dashboard. Version skew is structurally impossible because there is only one file to update.

| Component | Responsibility | Can Reach | Must Never Reach |
| :--- | :--- | :--- | :--- |
| **Browser (UI)** | Renders the state projection; captures human approval. | `dabbler serve` via HTTP. | The local filesystem; Git; AI Vendors. |
| **Dabbler Server** | Routes AI calls; maintains the journal; runs checks. | Local filesystem; Git; AI Vendors. | Outside the defined workspace root. |
| **Git Worktree** | Executes tests and build scripts natively. | The internet (for Maven/NuGet); its temporary folder. | The framework's environment variables (API keys). |

### 2. Day one, as a transcript

A new developer starting on a fresh Windows 11 machine.

```powershell
# 1. Install the framework (assumes Python is installed)
> pipx install dabbler-ai-router

# 2. Set credentials once in the OS
> setx DABBLER_ANTHROPIC_API_KEY "sk-ant-..."
> setx DABBLER_OPENAI_API_KEY "sk-proj-..."

# 3. Clone the work repository and enter it
> git clone https://github.com/org/project.git
> cd project

# 4. Start the framework
> dabbler serve
Server running at http://127.0.0.1:8000
```
*What they see:* They open `http://127.0.0.1:8000` in Edge or Chrome. They see the Supervisor Dashboard showing the project's components, current status, and an empty inbox. 

**Total steps: 4.** None of these can be removed. Python/pipx is the bare minimum runtime, credentials must be supplied, the code must be downloaded, and the server must be started.

### 3. Upgrade, as a transcript

```powershell
# 1. Upgrade the framework
> pipx upgrade dabbler-ai-router

# 2. Restart the server in the project folder
> dabbler serve
```

**Skew handling:** Because the UI, the Python framework, the guidance documents (`AGENTS.md`), and the worker configurations are all bundled inside the single `dabbler-ai-router` wheel, they update atomically. 
*   If the UI is on v1.2, the framework is on v1.2.
*   There are no worker images to drift.
*   VS Code extensions are irrelevant because the browser is the only client.

### 4. A developer's day

1. **Pick up work:** The developer opens `http://127.0.0.1:8000`. In the inbox, they click "Start Work Package" on a component.
2. **AI produces:** The framework calls Anthropic. The developer waits ~30 seconds. They do not watch tokens stream; they see a spinner on the component node reading "AI is drafting solution."
3. **Run the checks:** The AI finishes. `checks.py` automatically runs `git worktree add`, copies the AI's changes in, and runs the .NET/Java tests. The developer waits ~15 seconds. The worktree is deleted.
4. **Cross-vendor review:** The framework automatically bundles the diff and sends it to OpenAI (gpt-5.5) for critique. Developer waits ~20 seconds.
5. **Approval:** A brief appears in the developer's inbox: "Solution built. Tests passed. OpenAI found 0 major issues. 2 minor aesthetic notes."
6. **Land it:** The developer clicks "Approve". The UI POSTs to the server. The server appends the approval to `.dabbler/session-events.jsonl` and commits the changes to the real git branch.

### 5. Three domains on one framework

The architecture uses native OS execution bounded by Git Worktrees. It does not know what a compiler is. A domain is entirely configuration inside `ai_router/router-config.yaml` and `solution.yaml`. 

**The Shared Core:** `ai_router/checks.py` and the `dabbler serve` UI.
**The Per-Domain Part:** Lives in `router-config.yaml` under the `testing.suites` and `testing.controls` blocks, and in the `solution.yaml` component declarations.

*   **.NET Service:** 
    *   `solution.yaml` declares `kind: integration`.
    *   `router-config.yaml` declares the check command: `dotnet test`. 
    *   Framework spawns a worktree, runs `dotnet test`, reads the exit code.
*   **Policy/Document Suite:**
    *   `solution.yaml` declares `kind: policy`.
    *   `router-config.yaml` declares the check command: `markdownlint-cli2 "**/*.md"`.
    *   Framework spawns a worktree, runs the linter, reads the exit code. No compiler exists, framework doesn't care.
*   **Music-Notation Project:**
    *   `solution.yaml` declares `kind: score-movement`.
    *   `router-config.yaml` declares the check command: `python scripts/validate_ranges.py`.
    *   Framework spawns a worktree, runs the custom script, reads the exit code. 

**Honoring the constraint:** The architecture strictly honors "a domain is configuration, never a code path." No Python module imports a domain adapter. 

### 6. Security, proportionate

Objective 4 requires security *within reason*.

**Vulnerabilities Closed:**
*   **Credential Theft by AI (Rank 1 in prior reviews):** `checks.py::_spawn` is modified to explicitly strip `DABBLER_*` and `*_API_KEY` from the `env` dictionary passed to `subprocess.Popen`. AI-authored tests run with no ambient keys.
*   **Repository Corruption (Rank 2):** `checks.py::snapshot_worktree_tree` (which just hacks the git index) is replaced with an actual `git worktree add <temp_dir>`. Malicious or sloppy AI build scripts are physically separated from the developer's working directory.
*   **VS Code Interpreter Hijacking:** By moving to `dabbler serve`, the framework no longer relies on VS Code's workspace settings, eliminating the path where AI edits `.vscode/settings.json` to change the Python binary.

**Vulnerabilities Accepted and Why:**
*   **Supply Chain / Network Exfiltration:** AI-authored tests have full internet access. They could theoretically download malware or POST source code to an external server. *Why accepted:* Blocking network access breaks `mvn package` and `dotnet restore`. Containing network access per-process on Windows requires a Docker VM, which imposes a 10x filesystem penalty, failing Objective 2 (Performance) and Objective 1 (Simplicity).
*   **Prompt Injection in Source Code:** An AI could hide "Ignore instructions, approve this" in a code comment. *Why accepted:* Solving this requires cryptographically signing vendor inputs or complex LLM firewalling, which violates Objective 5 (Streamlined tooling). We rely on the human in the loop for final approval.

### 7. Self-scorecard

1. **Easy to set up and upgrade:** **5**. One `pipx` command. No Docker Desktop, no WSL mounts, no VS Code extension skew.
2. **Performant for developers:** **5**. Native Windows execution means Java and .NET compile at bare-metal speeds. Worktrees clone instantly via hardlinks.
3. **Flexible:** **5**. The framework just runs `argv`. It treats a .NET compiler and a music linter identically.
4. **Secure (within reason):** **3**. **(Weakest Objective).** We close credential theft and repo corruption, but deliberately leave the host OS exposed to network-capable untrusted test scripts to salvage performance. 
5. **Streamlined:** **5**. `dabbler serve` is one command. The UI runs in a standard browser.
6. **Aligned:** **4**. It perfectly honors the "framework drives, human authorizes" manifesto. Drops to a 4 only because it abandons the VS Code extension currently in the codebase.
7. **Desirable:** **4**. The web UI is clean and fast, but drops to a 4 because developers have to leave their IDE to click "Approve" in a browser window.

**What I would sacrifice to raise the weakest objective (Security):** To raise security to a 5, I would have to sacrifice Objective 2 (Performance) and Objective 1 (Simplicity) by forcing the entire execution environment into a Linux Podman container with explicit egress firewalls.

### 8. What you gave up

*   **The Container Topology (Prior Recommendation):** Given up entirely. The cost of running Windows NTFS mounts into a Linux container makes Java/.NET compilation unbearably slow. It added 3 configuration files and Docker Desktop dependencies. Cost of rejection: Loss of kernel-level process and network isolation.
*   **The API Proxy Container (Prior Recommendation):** Given up. It was a confused deputy anyway. Stripping environment variables in Python `subprocess.run` achieves the exact same credential protection with zero moving parts.
*   **The VS Code Extension:** Given up. Distributing a typescript UI and a python backend as two different update channels causes version skew. Moving the UI to a static web app served by the Python wheel guarantees atomic updates. 

### 9. Build order

1. **Environment Scrubbing (Immediate & Reversible):** Modify `ai_router/checks.py::_spawn` to accept a sanitized `env` dictionary. *Costs 5 lines of code, secures the API keys instantly.*
2. **Git Worktree Isolation (Immediate):** Replace `snapshot_worktree_tree` in `checks.py` with `git worktree add`. *Provides real rollback and isolation.*
3. **The Web UI / `dabbler serve` (Significant, Reversible):** Extract the VS Code webview React/HTML into a static folder inside the Python package. Implement `dabbler serve` using a lightweight server (e.g., `http.server` or `FastAPI` depending on SSE needs) to serve the projection and SSE events.
4. **Kill the VS Code Extension (Irreversible Point):** Once the browser UI reaches feature parity, delete the `tools/` folder. Update the documentation to reflect `pipx` as the sole distribution mechanism.