# Design Review: Container Architecture

## 1. Verdict

**Do-not-adopt.** This topology completely fails the operator's simplicity gate and must be discarded. A three-container, multi-mount orchestrator with an internal API network requires `docker-compose`, volume management, and internal DNS—which a 1-to-3-person shop will instantly reject, especially on Windows where cross-VM mounts cripple build speeds. Furthermore, the API Proxy does not solve the credential risk; it merely converts a credential-theft vulnerability into a Server-Side Request Forgery (SSRF) vulnerability. I formally withdraw my prior recommendation for Podman containment. The framework must run natively, and rollback must be achieved via git worktrees. 

This topology resolves the VS Code interpreter path risk, but fails to resolve the primary credential risk (leaving the Proxy as a confused deputy) and exacerbates deployment friction to fatal levels.

## 2. Attack the architecture

**Issue** → The API Proxy is a Confused Deputy.
**Location** → API Proxy Container & IDE Container network boundary.
**Fix** → The API Proxy holds the keys but exposes an unauthenticated local API to the IDE Container. If AI-authored code manages to execute in the IDE Container (or manipulates the orchestrator), it can simply issue HTTP requests to the Proxy to egress data within prompt text, exhaust billing budgets, or call unauthorized models. Moving the key to a separate box does nothing if the box blindly obeys the caller. 

**Issue** → The Execution Container Dependency Trap.
**Location** → Solution Containers "isolated environments".
**Fix** → Java and .NET (the mandated stacks) require dependency resolution (Maven Central, NuGet). If the Solution Container lacks network access, it cannot build. If it has network access, malicious AI code can exfiltrate data via HTTP POSTs or DNS lookups in test scripts. The architecture diagram fails to represent network egress for the Solution Containers.

**Issue** → Push Credential Exposure remains.
**Location** → IDE Container "client for git integration".
**Fix** → The IDE Container mounts the host `.git` folder and handles git operations, meaning it holds the SSH/HTTPS push credentials. If the IDE Container is compromised by malformed AI output or path traversal, the attacker controls the repository history.

## 3. Attack the assessment

**Claim:** *"The API Proxy Container solves the top-ranked risk by construction."* (§2)
**Critique:** **Overstated and dangerously wrong.** It mitigates credential *exfiltration* (the key itself cannot be stolen), but it perfectly preserves credential *abuse*. The IDE container can still exhaust the operator's Anthropics/OpenAI budget or exfiltrate source code by embedding it in the `user_message` payload sent to the proxy.

**Claim:** *"The isolation is not stronger; the blast radius is smaller... Given the same host mount as the IDE Container, it adds a moving part and buys almost nothing."* (§3.2)
**Critique:** **Factually wrong.** The mount is data isolation; the container provides process and network isolation. Sharing a mount does not negate PID namespaces, cgroups, or network namespaces. Without a container wall, a malicious test script can `kill -9` the framework process, fork-bomb the OS, bind a reverse shell to a local port, or read ambient memory. The assessment ignores compute and network abuse entirely.

**Claim:** *"A git worktree per job, plus that snapshot, delivers the rollback benefit with no container..."* (§5)
**Critique:** **Right, but misses the execution environment.** A git worktree isolates the files, but `checks.py::_spawn` still runs the process with full inheritance of `os.environ`. The assessment correctly identifies the rollback benefit but ignores that the environment variables (and thus credentials) leak identically in both paths.

**Claim:** *"It uses machinery already written and tested [checks.py::snapshot_worktree_tree]"* (§5)
**Critique:** **Too generous.** `snapshot_worktree_tree` uses `git read-tree` into a temporary index. This captures a read-only snapshot of the tree state. It does *not* create a separate working directory where a build can safely write temporary object files (`.class`, `.dll`) without mutating the original workspace. A real `git worktree add` is required for safe, parallel execution.

## 4. The eight attack points of section 8

1.  **Does the proxy actually contain the credential?** Yes, but it doesn't matter. An unauthenticated local API allows an attacker to stream the repository contents out to the vendor by requesting a translation of the source code, or exhaust the budget by spamming maximum-token requests. 
2.  **Is §3.2 right that the mount is the mechanism?** No. For the claim to hold, you must assume the only threat is file modification. A narrow mount stops file corruption, but does not stop memory exhaustion, network scanning, or process termination. 
3.  **Is §5's sequencing correct, or is it a trap?** It is a trap *if environment variables are not scrubbed*. Building the worktree solves the rollback problem (cheap half) but leaves `DABBLER_ANTHROPIC_API_KEY` in `os.environ` during `subprocess.Popen` in `checks.py::_spawn`. If you scrub the environment first, the trap is neutralized.
4.  **Chronicler role streaming to the console:** Untrusted text rendered in a supervisor's UI enables ANSI bomb attacks (terminal escape sequences that hide text or modify terminal settings) and clickable malicious links disguised as legitimate UAT output.
5.  **Producer role path-traversal:** Yes. If the AI outputs instructions to "read `../../../../../Users/operator/.ssh/id_rsa`" and the IDE Container obeys without path-jail validation, the key is read into the orchestrator's memory.
6.  **Does three-boxes-one-job survive implementation?** No. It will immediately acquire a Docker network configuration file, a persistent Volume mapping for the `.venv` to avoid reinstalling dependencies every container restart, and an auth sidecar if the proxy API requires token validation. It becomes 5 moving parts. Staff will reject it.
7.  **Windows specifically - is the mount penalty a disqualifier?** **Absolute disqualifier.** Compiling Java/.NET inside a Linux container against a mounted NTFS host folder uses the 9p/virtiofs translation layer. A 5-second native build will take 45-60 seconds. Developers will route around the framework on day one.
8.  **Criterion (b) - Route around:** The Proxy Container's requirement for interactive CLI authentication (Copilot/Claude device flows). Staff will not tolerate restarting the proxy container, attaching a TTY, and re-authenticating browser flows. They will rip the proxy out and paste a personal API key into a `.env` file instead.

## 5. The sequencing question, decided

**Worktree first.** 

The container topology must be entirely abandoned because it fails the simplicity gate (Criterion B) and the Windows filesystem performance reality. 

Implementing the git worktree solves the routine, boring failure (bad test cleanups, destructive build scripts) and gives you the rollback property. However, this is only safe to do *if* you explicitly strip credentials from the subprocess environment. 

*Evidence that would change my mind:* If the operator abandons Windows support and requires Linux natively, and if the team grows beyond 10 people where enforcing a standardized execution environment outweighs the initial onboarding friction.

## 6. What is missing

**Weight: Heavy**

*   **Network Dependency Resolution vs Containment:** The proposal completely ignores how Java and .NET build. A Solution Container with a "narrow mount" cannot resolve dependencies unless you also mount `~/.m2` (Maven) and `~/.nuget` into the container, or allow it unfettered internet access. If you give it network access, it can exfiltrate data.
*   **Host Process Polling:** `checks.py::execute` uses `subprocess.Popen` and monitors it. If you move execution to a Solution Container, the framework must now manage container lifecycles, attach to container stdout via Docker/Podman APIs, and handle container zombie processes, which drastically inflates the complexity of `checks.py`.
*   **State Reconciliation:** If an Execution Container runs against a "copy of the source" (narrow mount) and the tests pass, how are the generated binaries or lockfile updates synced back to the primary workspace? The proposal is silent on this data-sync mechanism.

## 7. Recommendations

These recommendations replace the container topology with a native, high-simplicity approach that survives the 1-3 person shop gate.

1.  **[Must] Scrub the environment before executing untrusted code.**
    *   *Changes:* `ai_router/checks.py::_spawn`. Pass a sanitized `env` dictionary that strips all `DABBLER_*` and `*_API_KEY` variables to the `subprocess.Popen` call.
    *   *Cost in setup friction:* **Zero.** Transparent to the user. Instantly secures the API keys from malicious tests without requiring a proxy container.
2.  **[Must] Implement isolated execution via Git Worktrees natively.**
    *   *Changes:* `ai_router/checks.py`. Do not use `snapshot_worktree_tree` for execution. Instead, use `git worktree add --detach <temp_dir> HEAD`, run the check in `<temp_dir>`, and `git worktree remove <temp_dir>` on completion.
    *   *Cost in setup friction:* **Zero.** Requires no Docker, no Podman, and runs natively on Windows at full NTFS/NTFS speed.
3.  **[Must] Jail file reads to the workspace root.**
    *   *Changes:* Whatever component handles the "Producer role" file navigation. Use `os.path.abspath` and verify it starts with the workspace root before returning file contents.
    *   *Cost in setup friction:* **Zero.** Pure code logic.
4.  **[Should] Abandon the 3-container topology entirely.**
    *   *Changes:* Drop the proposal. Continue running the framework as a native Python CLI (`dabbler serve`) alongside the native IDE.
    *   *Cost in setup friction:* **Massive reduction.** Saves the 1-3 person team from managing Docker daemons, cross-VM mounts, and container networking.
5.  **[Should] Implement a local verification proxy pattern natively instead of a container.**
    *   *Changes:* If vendor disclosure logging is required, add a SQLite-backed logging wrapper around `transports/api.py::call_model` to record hashes of what was sent.
    *   *Cost in setup friction:* **Zero.** Stays entirely within the single `pipx` installed artifact.