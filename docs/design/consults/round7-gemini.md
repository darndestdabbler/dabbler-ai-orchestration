model_name: gemini-3-1-pro
model_id: gemini-3.1-pro-preview
provider: google
tokens: 3786 in / 1880 out
elapsed: 70.025s  truncated: false
---
### Q1 — Is "reads" the right thing to bound?

**Soundness:** The $6,000 cost cited is tokens in context. The reads that matter are out-of-module *source* bytes injected into the context. However, **ASSUMPTION:** the majority of the $6,000 was spent on the engine thrashing, re-reading the module it *was* working on via shell commands (`Bash 137, Edit 57, Write 10, Read 6`), not just reading siblings. A skilled human developer keeps an AI assistant focused by opening a sub-folder as the workspace root, implicitly hiding the rest of the disk from relative paths. 
**Risk:** Measuring reads requires parsing engine-specific transcripts (e.g., extracting `cat` and `grep` from `command` JSON payloads), which the appendix confirms are internal and volatile.
**Recommendation:** Bound by disk visibility, not read counts. Measure tokens spent per session, but enforce boundaries via the filesystem.

### Q2 — The layers, ranked

**Soundness:** The appendix proves engines rely heavily on Bash. Path-scoped read rules fail for Copilot, Codex, and Gemini, and fail for Node/Python sub-processes in Claude. 
**Ranked by effect on tokens per ceremony cost (Rules a-e):**
1.  **Nothing to read on disk (1)** — The ultimate, universal wall. If it is not on disk, `cat`, `grep`, and `Read` all fail equally across all engines. 
2.  **Something better to read instead (2)** — Replaces the *need* to read siblings. Generates tiny token footprints. Fits human practice (Go To Definition).
3.  **The verifier refuses, not counts (4)** — Simple to implement in `packages/router/src/agency.ts` to stop the framework's own out-of-scope reads.
4.  **Measure what was read anyway (3)** — Pure theatre. Transcript formats change, shell commands are opaque, and reporting *after* the token budget is spent does not recover the money.

**The Fifth Option:** Launch the engine with its working directory set strictly to `modules/<slug>/`. Claude Code restricts reads outside this directory (`permissions.blockReadsOutsideWorkingDirectories`), and relative shell paths naturally stay contained.
**Recommendation:** Implement (1) and (2). A sparse worktree + generated contracts guarantees the boundary regardless of the engine used.

### Q3 — The contract surface

**Soundness:** `packages/router/src/contractdoc.ts` exists and was waiting to be repointed. 
**Risk:** Method signatures without behavioral constraints cause AIs to hallucinate implementations or misuse the contract.
**Recommendation:** The artifact must carry signatures *plus* XML/JavaDoc comments. Repoint `contractdoc.ts` to generate these files on demand at the solution level (`docs/contracts/<slug>.md` or `modules/<slug>/contract/PublicAPI.txt`). Generate and commit them at the land. This serves as the AI's sibling reference and gives human reviewers an explicit API-drift diff in the pull request.

### Q4 — Does the package need to be on disk at all?

**Soundness:** A sparse checkout removes sibling source. The compiler still needs the DLL/JAR. The follow-up notes `csv-model` is ~5 KB.
**Risk:** A gitignored local feed requires a build/restore step before the compiler can run in the sparse worktree. 
**Recommendation:** Commit the package to a local folder feed in the repository. To a .NET team lead: *“We commit the 5KB NuGet packages so that checking out a single sparse module guarantees a perfectly compiling state with zero restore time, zero external feeds, and zero auth configuration.”*

### Q5 — Separate repositories, reconsidered

**Soundness:** The mechanisms exist (`solution-dependencies.json`, `packages/router/src/drive.ts` ~1624, `dabbler workspace`). 
**Risk:** Atomic commits. A contract change in Module A that requires a consumer update in Module B cannot be merged atomically across two repositories. 
**Recommendation:** N repositories is an over-correction. Multi-repo pull request orchestration is vastly more complex (and expensive in human developer time) than a monorepo sparse worktree. Do not revert to N repositories. 

### Q6 — The exception

**Soundness:** Some work requires changing a contract and its consumer simultaneously. 
**Risk:** If cross-module scope is easy to trigger, the engine will prompt for it to "save time", making the $6,000 token bleed the default again.
**Recommendation:** Declare it in the solution plan as `modules: [moduleA, moduleB]`. When the framework reads an array instead of a string, it generates a worktree with *both* sparse paths included. Enforce a hard token/read budget multiplier when this mode is active to penalize its use. 

### Q7 — Measurement across engines

**Soundness:** The appendix confirms only Claude Code has a currently auditable transcript. Copilot and Gemini hide this.
**Risk:** Building an audit parser for one engine's internal `~/.claude/projects/` JSONL format tightly couples the framework to an undocumented surface.
**Recommendation:** Do not build the engine audit. Measure only what all engines expose: the tree they changed and the files listed in the plan (judged via `judgeReportFiles` in `drive.ts`). Rely entirely on the sparse worktree to enforce the read wall. 

---

### 8. Recommended Design (The .NET Team Lead Slides)

*   **Monorepo with Sparse Worktrees:** Modules live in `modules/<slug>/`. The AI operates in a framework-generated sparse worktree where sibling source code literally does not exist.
*   **Committed Contract Docs:** `contractdoc` generates interface + XML comment stubs for each module. The AI reads these tiny files instead of sibling source code.
*   **Committed Local Packages:** Compiled binaries (NuGet/JAR) are committed. A sparse checkout compiles instantly with zero external dependencies.
*   **Strict Working Directories:** AI engines are launched with `cwd` pinned to the module root. 
*   **Explicit Cross-Module Sessions:** Modifying multiple modules requires an explicit `modules: [A, B]` array in the plan, isolating high-cost contract changes.

### 9. The Change to Round 6's Session List

*Original: 1 plan, 2 config, 3 scoped sessions, 4 packages, 5 drift, 6 workspace, 7 gate, 8 Maven.*

**Updated Order and Changes:**
1.  **Solution plan + manifest** (Unchanged).
2.  **Module-aware config** (Unchanged).
3.  **Contract generation** (*Added:* Repoint `contractdoc` to run pre-session so the AI has generated sibling APIs to read).
4.  **Immutable local packages** (*Reordered:* Must be committed before a sparse worktree can compile).
5.  **Module-scoped sessions via Sparse Worktree** (*Amended:* Replaces soft-scope with a physical `git sparse-checkout` wall).
6.  **Focused workspace** (Natural consequence of the sparse worktree).
7.  **Drift and restore** (*Moved:* Applies after the session modifies the worktree).
8.  **Local-byte gate + bundle recording** (`release/<bundle>/bundle.yaml`, verifier refuses via `agency.ts`).
9.  **Maven parity + secondary mode** (Unchanged).

### 10. The Disagreement

*   **Where Round 6 Synthesis was wrong:** Relying on `.slnf` (Gemini's Round 6 stance) was fundamentally flawed. AI engines read via `bash` (e.g., `cat`, `grep`), which entirely ignores IDE-level solution filters. Sparse checkout is not an over-correction; it is the *only* OS-level wall that works against shell commands.
*   **Where the Operator is right:** Artifacts serve the compiler, not the reader. If sibling source is on the disk, the AI will use `bash` to read it regardless of IDE configurations or local package feeds. 
*   **Where the other reviewer will be wrong:** The other model will likely fixate on Claude Code's `permissions.deny` or `permissions.blockReadsOutsideWorkingDirectories` because it is specifically detailed in the appendix. They will recommend building complex rule generators. This is a trap, as it completely fails for Copilot, Codex, and Gemini, and fails against Claude's own Node/Python sub-processes. The only universal truth is the disk state.