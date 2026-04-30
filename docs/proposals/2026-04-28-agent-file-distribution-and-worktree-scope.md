---
title: Agent-file distribution + worktree-layout scope
status: open — pending decision
date: 2026-04-28
authors: human + Claude (Opus 4.7), reviewed by Gemini Pro + GPT-5.4
applies-to: dabbler-ai-orchestration, dabbler-access-harvester, dabbler-platform, future dabbler repos
---

# Agent-file distribution + worktree-layout scope

## Executive summary

Two related architectural questions emerged during the bare-repo +
flat-worktree migration of `dabbler-access-harvester` on 2026-04-28:

1. **Should per-consumer agent files (`CLAUDE.md`, `AGENTS.md`,
   `GEMINI.md`) be reduced to ~10-line pointers to a canonical
   bootstrap in `dabbler-ai-orchestration`?** (Proposal A)
2. **Should the bare-repo + flat-worktree layout become the
   universal default for all dabbler repos?** (Proposal B)

After cross-provider review (Gemini Pro + GPT-5.4):

- **Proposal B is rejected** by both providers and by this synthesis.
  Keep the layout opt-in, applied per repo when parallel session-set
  work justifies it. Both providers warn that the layout's main
  weakness is structural (it's not what `git clone` produces, so it
  doesn't actually standardize the colleague onboarding experience —
  it just adds a custom local setup procedure).
- **Proposal A is rejected as posed** but reshaped into a stronger
  alternative: **generate consumer agent files from shared templates
  at write time, instead of pointing at canonical files at read
  time.** This eliminates the duplication problem without introducing
  a runtime dependency on the local checkout state of
  `dabbler-ai-orchestration`. GPT-5.4's reframing — *"prefer
  standardized tooling over standardized filesystem assumptions"* —
  is the durable principle to pull out of this discussion.

## Status & next actions

This proposal is **open**. The human will decide later whether to
implement, modify, or close it. Concrete next actions if accepted in
the reshaped form:

1. Author a `dabbler sync-agent-files` (or similar) generator script
   in `dabbler-ai-orchestration/tools/`, with shared template
   fragments under `dabbler-ai-orchestration/templates/` and
   per-consumer config in each consumer.
2. Run the generator against `dabbler-access-harvester` and
   `dabbler-platform` to produce their full self-contained
   agent files; commit those files in each consumer repo.
3. Add a session-set-close hook (or a documented manual step) to
   re-run the generator when canonical templates change.
4. Migrate `dabbler-platform` to the bare-repo + flat-worktree layout
   *if and when* parallel session-set work justifies it (the human
   noted this is not urgent — current serial-session approach is
   acceptable while finishing in-flight work). Use the recipe in
   `dabbler-ai-orchestration/docs/planning/repo-worktree-layout.md`.
5. Apply the same per-need rule to other personal repos.

## Background

`dabbler-ai-orchestration` is the canonical home for shared workflow
infrastructure: the `ai-router/` Python module, the
`docs/ai-led-session-workflow.md` procedure, the
`docs/planning/repo-worktree-layout.md` standard, etc. Consumer
repos (`dabbler-access-harvester`, `dabbler-platform`, future
projects) each maintain their own copies of `ai-router/` and
their own root-level `CLAUDE.md` / `AGENTS.md` / `GEMINI.md`
files customized with project-specific content.

Two pain points triggered this discussion:

- **Per-consumer agent files duplicate substantial content** —
  ~150 lines each, with most sections (API key export, ai-router
  import snippet, Delegation Discipline pointer, required-reading
  list, repo layout note, cleanup helper pointer) identical or
  near-identical across consumers. Updates have to be applied to
  three files in each repo (saved feedback memory:
  `feedback_keep_agent_instruction_files_in_sync.md`).
- **Repo layouts are inconsistent**. `dabbler-access-harvester`
  migrated to the bare-repo + flat-worktree layout on 2026-04-28
  to support parallel session sets; `dabbler-platform` remains on
  the legacy in-place layout (and currently runs session sets
  serially as a result). Other personal repos use a mix.

## Proposal A — Minimal pointer-style agent files

### What was originally proposed

Replace each consumer's ~150-line `CLAUDE.md` / `AGENTS.md` /
`GEMINI.md` with a ~10-line pointer file. The canonical content
moves to `dabbler-ai-orchestration/CLAUDE.md`. Project-specific
content (build commands, structure) moves to `README.md`.

Concrete proposed minimal `CLAUDE.md`:

```markdown
# CLAUDE.md — <repo-name>

For the AI-led session-set workflow, read these in order:

1. **`../../dabbler-ai-orchestration/CLAUDE.md`** — orchestrator bootstrap.
2. **`README.md`** — this repo's purpose, build, test, structure.
3. **`docs/planning/project-guidance.md`** + **`lessons-learned.md`** —
   this repo's principles, conventions, accumulated lessons.
4. **`docs/session-sets/`** — find the active session.
```

### Why it was attractive

- Eliminates ~140 lines × 3 files × N consumers of duplication
- Removes the manual three-file sync burden
- Aligns with the principle that session sets carry project-specific
  context; agent files are procedural bootstrap

### Why it was rejected as posed

Both reviewers flagged the same architectural smell: **the proposal
moves load-bearing instructions out of the consumer repo and into
ambient local state** (whatever commit of
`dabbler-ai-orchestration` happens to be checked out as a sibling).
GPT-5.4's framing was sharpest:

> "You lose versioned reproducibility of agent behavior. A bug
> report against `dabbler-platform` may be impossible to replay
> later because the effective instructions came from whatever
> commit of `dabbler-ai-orchestration` happened to be checked out
> locally at the time, not from anything committed in
> `dabbler-platform`."

Additional concerns both providers raised:

- Hardcoded relative paths (`../../...` vs `../...`) reintroduce
  layout-specific coupling — exactly what the proposal claimed to
  remove.
- The orchestration repo's own `CLAUDE.md` has to serve two
  audiences (curator working on orchestration vs. canonical
  bootstrap imported by consumers); these will diverge over time.
- Agent compliance with cross-repo file pointers is unreliable
  across orchestrator types, and the failure mode is silent partial
  compliance, not a clean stop.

Gemini Pro additionally flagged a **context-window exhaustion**
risk on long pointer chains, and a **security-scanner blind spot**
on the `.git`-as-text-file layout (relevant to Proposal B).

### Reshaped recommendation

Solve the duplication problem at **generation time**, not at
agent-execution time:

- Each consumer keeps its full self-contained `CLAUDE.md` /
  `AGENTS.md` / `GEMINI.md` at the repo root, committed and
  authoritative.
- The CONTENT of those files is generated by a small script
  (`dabbler sync-agent-files`) that reads shared template fragments
  from `dabbler-ai-orchestration/templates/` and per-consumer
  config (`.dabbler.toml` or similar) from each consumer.
- Re-run the generator when templates change. Output is committed
  in each consumer.

This pattern wins on:

- ✅ Versioned reproducibility (consumer at commit X has its own
  committed agent file, independent of orchestration's local state)
- ✅ No runtime cross-repo dependency
- ✅ No hardcoded relative paths
- ✅ Eliminates manual three-file sync via tooling, not via runtime
  indirection
- ✅ `git clone` continues to produce a fully-functional repo

The principle GPT-5.4 articulated, worth pulling forward as a
durable convention: **"prefer standardized tooling over standardized
filesystem assumptions."**

## Proposal B — Universalize the bare-repo + flat-worktree layout

### What was proposed

Migrate ALL of the human's repos (not just dabbler) to the
bare-repo + flat-worktree layout. Stated motivation: *"Having
separate approaches to source code management will make it harder
for my colleagues to use this."*

### Why it was rejected

Both reviewers rejected this with overlapping reasoning:

- **The layout is not produced by `git clone`.** A colleague who
  clones a "standardized" repo gets the legacy shape unless wrapper
  tooling intercepts. So the consistency goal isn't actually
  achievable by decree — you'd still be supporting two realities.
- **Cost-benefit is poor for low-activity repos.** Repos that don't
  run parallel session sets pay permanent ongoing complexity (extra
  directory hop, custom clone procedure, migration cost) for no
  parallel-worktree benefit.
- **Onboarding becomes less standard, not more.** New contributors
  know `git clone`; they don't know "clone bare into `.bare/`,
  write a `.git` file by hand, then `git worktree add main main`."
- **Migration cost is real and front-loaded** against a speculative
  benefit for repos that may never use the feature.

GPT-5.4's specific reframing for the operator-experience problem:

> "Standardize the operator experience, not the raw filesystem
> shape. Provide a small script such as `dabbler clone <repo>` /
> `dabbler open <repo>` / `dabbler new-worktree <repo> <slug>` so
> humans use one workflow even if storage layouts differ."

### Recommendation

Keep the layout **opt-in**. Apply per-need:

- **Trigger:** when a repo is about to start running parallel
  session sets, or when single-developer activity grows enough
  that long-lived feature branches become valuable.
- **Source of truth for the recipe:**
  `dabbler-ai-orchestration/docs/planning/repo-worktree-layout.md`
- **Migration cost ≈ 1-2 hours per repo** (longer if Windows file
  locks require diagnosis).

For `dabbler-platform` specifically: the human has flagged that
the project is nearly complete; serial session sets are acceptable
through completion. Migration to the new layout, if pursued, can
be deferred until either (a) a meaningful new session-set body of
work is planned, or (b) the human decides the layout consistency
across active repos is worth the migration cost.

For other personal repos: same per-need rule. A repo on the legacy
layout that never spawns a parallel branch is fine staying there
forever.

## Cross-cutting observation (from GPT-5.4)

Both proposals share the same architectural smell in different
forms — they optimize for local deduplication/consistency on one
workstation by introducing **ambient dependencies on external
local state**:

- Proposal A makes consumer behavior depend on the local checkout
  of `dabbler-ai-orchestration`.
- Proposal B makes the repo's usability depend on a non-standard
  local clone topology.

The corrective principle: **make runtime inputs local, versioned,
and explicit. Centralize via tooling (generators, wrapper scripts),
not via runtime indirection.**

## Sequencing

If both proposals (A reshaped and B applied per-need) are
eventually implemented, GPT-5.4 advised against stacking them:

> "First solve shared-distribution/versioning of workflow artifacts.
> Then, separately, decide which repos truly benefit from the
> flat-worktree container. Doing both at once makes failures harder
> to attribute and rollback harder to reason about."

Recommended order:

1. Build the agent-file generator first (small, contained, reversible).
2. Roll it out to existing consumers and validate.
3. Separately, evaluate per-repo migrations to the worktree layout
   as parallel-session-set demand justifies them.

## Open questions

1. **Where do per-consumer config values live?** A `.dabbler.toml`
   at each consumer root specifying `repo_name`, `repo_layout`
   (legacy / bare-flat-worktree), `relative_path_to_orchestration`,
   `dotnet_test_command`, etc. Or extend an existing config (e.g.,
   project-guidance.md frontmatter)?
2. **Which template engine?** Python's `string.Template` is enough
   for ~10 substitution points; Jinja2 is overkill but already
   familiar. Decision can defer until generator is sketched.
3. **How are template changes propagated?** Manual `dabbler
   sync-agent-files` invocation per consumer, or a CI job, or a
   pre-commit hook in orchestration that fans out? Likely manual to
   start, automate later if churn justifies.
4. **Should the generator also produce `docs/planning/project-guidance.md`
   shared sections?** Currently each consumer's project-guidance.md
   has both shared and project-specific content. Same generator
   pattern could apply, but scope creep risk — defer until
   agent-file generator is proven.
5. **Should orchestration's own root `CLAUDE.md` / `AGENTS.md` /
   `GEMINI.md` also be generated?** GPT-5.4 noted the dual-audience
   problem. One option: orchestration's own root files are
   hand-written for the curator role, and the generator produces a
   separate set under `templates/consumer-bootstrap/` for consumer
   use.

## Approximate cost of this review

- Gemini Pro: ~$0.013 (estimated), 30s, 6.8 KB response
- GPT-5.4: $0.1134, 123s, 11.8 KB response
- Total: ~$0.13 for cross-provider second opinion

---

## Appendix A: Gemini Pro review (verbatim)

> Saved at `C:\temp\review-gemini-pro.md` at runtime; preserved here
> for the document's self-contained record.

### Proposal A — Minimal pointer-style agent files

**Verdict:** Recommend with modifications

**Reasoning:**
This proposal correctly applies the DRY principle to reduce significant
maintenance duplication across repositories. Centralizing the bootstrap
logic into a single source of truth is a robust architectural
improvement. The risks identified are manageable with specific
modifications to harden the implementation against pathing and agent
compliance issues.

**Concerns:**

- **Major:** Agent non-compliance with file pointers. There is a risk
  that an AI orchestrator could fail to follow the indirection,
  leading to it operating with incomplete context. This failure could
  be silent, producing low-quality or incorrect work.
- **Major:** Brittle relative pathing. The proposed `../../` path
  creates a fragile coupling between the consumer repo's depth and
  the location of the orchestration repo. This will break for new
  clones in different locations, legacy-layout repos, and CI
  environments.
- **Minor:** Dual-audience responsibility. The canonical bootstrap
  file would need to serve both as an include for consumers and as
  the primary file for the orchestration repo itself, which can
  create confusion.
- **Minor:** Increased diagnostic latency. A failure in the
  bootstrap logic will be one level of indirection away, which
  could slightly slow down debugging.

**Modifications suggested:**

- **Use an environment variable** (e.g., `$AI_ORCHESTRATION_ROOT`)
  instead of a hardcoded relative path. Provide a setup script in
  the orchestration repo that clones it and exports the variable,
  making onboarding reliable.
- **Add a "read receipt" instruction** to the pointer file. Instruct
  the AI to read the canonical bootstrap file and then quote a
  specific "magic phrase" from within it to confirm it has the full
  context before proceeding.
- **Isolate the canonical include.** Create
  `dabbler-ai-orchestration/bootstrap/CLAUDE.md` (and equivalents)
  as the file to be included, and have the root
  `dabbler-ai-orchestration/CLAUDE.md` simply use that file itself.
  This separates the "library" from the "application" and clarifies
  the audience for each file.

**Failure mode flagged:**
Context window exhaustion. By chaining multiple files (pointer →
canonical bootstrap → README → session set docs), the total prompt
size could exceed an agent's context window, especially for smaller
models. This would cause the agent to silently ignore instructions
or context from the end of the chain, leading to unpredictable
behavior that the `ai-router` might not be able to catch if the
failure happens during the initial bootstrap.

### Proposal B — Universalize bare-repo + flat-worktree layout

**Verdict:** Do not recommend

**Reasoning:**
This proposal over-generalizes a niche solution to problems it doesn't
solve, creating significant friction for a questionable gain in
consistency. The cost of migration, tooling incompatibility, and
increased onboarding complexity for new developers far outweighs the
benefit of a single layout. The standard `git clone` layout is a
powerful convention, and deviating from it should only be done when
the benefits are massive and unavoidable, which is not the case here.

**Concerns:**

- **Critical:** Tooling incompatibility. Many GUIs, IDE extensions,
  CI runners, and deployment scripts assume a standard `.git`
  directory at the project root. This non-standard layout risks a
  constant stream of papercut issues and integration failures.
- **Critical:** Negative impact on onboarding. The argument that
  this simplifies things for colleagues is inverted; it forces them
  to learn a bespoke, non-standard workflow instead of the
  universal `git clone` command. This creates inconsistency with
  the entire global git ecosystem.
- **Critical:** High cost-benefit deficit. For repos that do not
  require parallel worktrees, the layout adds setup overhead and an
  extra directory level for zero functional benefit. This violates
  the YAGNI (You Ain't Gonna Need It) principle.
- **Major:** Significant migration cost. The estimated 10-20 hours
  of manual work is a substantial investment that could likely be
  used to deliver more direct value.

**Modifications suggested:**

- Instead of universal adoption, treat the bare-repo layout as a
  pattern to be applied *if and only if* a repository requires
  extensive parallel worktree usage. Document the layout and its
  setup script in the orchestration repo's
  `docs/planning/repo-worktree-layout.md` and apply it on a
  case-by-case basis. This preserves the standard, low-friction
  layout as the default.

**Failure mode flagged:**
Security scanner blind spots. Automated security and secret-scanning
tools (e.g., Dependabot, Snyk, git-secrets) often discover repos by
looking for a root `.git` directory. These tools may fail to parse
the `.git` file pointer correctly, leading them to mis-identify the
project root or skip scanning the repository entirely, creating a
security blind spot.

### Cross-cutting observations

The proposals interact on the file pathing issue. Adopting Proposal B
would change the required relative path for Proposal A, reinforcing
the need for a more robust solution like environment variables. There
is a tension between creating an internally consistent ecosystem and
maintaining compatibility with broader, established developer
standards. Proposal A is a good abstraction that improves the
internal system, while Proposal B creates an unnecessary and
potentially fragile deviation from external norms. The developer
should prioritize Proposal A and adopt the "per-need" alternative
for Proposal B.

---

## Appendix B: GPT-5.4 review (verbatim)

> Saved at `C:\temp\review-gpt-5-4.md` at runtime; preserved here
> for the document's self-contained record.

### Proposal A — Minimal pointer-style agent files

**Verdict:** Do not recommend

**Reasoning:**
The duplication problem is real, but a root agent file is the wrong
place to rely on a transitive pointer to a different repo. I would
not assume consistent compliance from Claude Code, Copilot/Codex,
and Gemini when the instruction is "go read another file first,"
especially when that file is outside the opened workspace. The
bigger architectural problem is that consumer-repo behavior becomes
dependent on mutable local state in a sibling checkout, which hurts
reproducibility, onboarding, and debugging.

**Concerns:**

- **Critical:** The proposed bootstrap depends on reading a file
  outside the consumer repo. In many agent/tooling setups, sibling
  paths are not indexed, not auto-opened, or not even accessible
  without explicit approval; the likely failure mode is not a clean
  stop, but silent partial compliance.
- **Major:** You are turning the orchestration repo checkout into
  an unversioned runtime dependency of every consumer repo. A
  consumer repo at commit `X` may behave differently depending on
  which commit the local `dabbler-ai-orchestration` repo happens to
  be on.
- **Major:** Reusing `dabbler-ai-orchestration/CLAUDE.md` for both
  "work on the orchestration repo itself" and "import this as
  consumer bootstrap" mixes two roles that will eventually diverge.
  That is a document-boundary smell, not just a wording problem.
- **Major:** Hardcoded relative paths across mixed layouts
  (`../../...` vs `../...`) create exactly the kind of
  machine/layout-specific knowledge this proposal is trying to
  remove. You are deleting duplication in prose and reintroducing
  it as path assumptions.
- **Minor:** The loss of the inline "self-test" is less important
  than the human suggests, but the failure mode gets worse: instead
  of failing immediately on missing bootstrap logic, the agent may
  proceed with incomplete instructions.
- **Minor:** A totally context-free `CLAUDE.md` is worse for
  first-open discoverability. README can carry the main
  explanation, but a 2-5 line repo summary in the agent file is
  still useful.

**Modifications suggested:**

- Do **not** make runtime bootstrap depend on a sibling repo path.
  Solve deduplication at **generation/update time**, not at
  agent-execution time.
- Keep each consumer repo's root `CLAUDE.md` / `AGENTS.md` /
  `GEMINI.md` **repo-local and authoritative**, but generate them
  from shared templates/fragments in `dabbler-ai-orchestration`.
- Split orchestration-repo docs into:
  - a **consumer bootstrap** document intended for reuse, and
  - the orchestration repo's own root agent files for working on
    that repo itself.
- Keep a minimal inline bootstrap in each consumer root file: repo
  identity, required local files to read, and a fail-closed
  preflight ("if required docs/config are missing, stop and
  report").
- If you insist on indirection, point only to files **inside the
  consumer repo**. Sync or generate those files from the
  orchestration repo instead of pointing across repos.

**Failure mode flagged:**
You lose **versioned reproducibility of agent behavior**. A bug
report against `dabbler-platform` may be impossible to replay later
because the effective instructions came from whatever commit of
`dabbler-ai-orchestration` happened to be checked out locally at the
time, not from anything committed in `dabbler-platform`.

### Proposal B — Universalize bare-repo + flat-worktree layout

**Verdict:** Do not recommend

**Reasoning:**
The flat-worktree container is a good specialized solution for repos
that regularly need many parallel worktrees; it is not a strong
default for every repo. On low-activity repos, the benefit is near
zero while the onboarding and clone-process costs are permanent.
The stated "colleagues should only learn one layout" argument is
weaker than it sounds, because this layout is not what `git clone`
produces, so without wrapper tooling you will still end up
supporting two realities.

**Concerns:**

- **Major:** The layout is a poor cost/benefit fit for quiet repos.
  You are imposing a permanent extra directory hop, a custom
  clone/init flow, and migration time on repos that do not actually
  need parallel worktree density.
- **Major:** The "universal" standard is not self-enforcing. A
  colleague who runs plain `git clone` gets the legacy shape, so
  unless you provide and mandate a wrapper/bootstrap script, you
  have not actually removed layout inconsistency.
- **Major:** The onboarding story gets less standard, not more
  standard. New contributors know normal Git; they do not know
  "clone bare into `.bare`, write a `.git` file by hand, then
  create `main/`."
- **Major:** The migration cost is real and front-loaded, while the
  benefit is speculative for repos that rarely branch in parallel.
  That is a bad trade unless you have evidence those repos will
  actually use the feature.
- **Minor:** Most Git-aware tools will handle a worktree with a
  `.git` file just fine if you open `main/`; the bigger practical
  risk is humans or scripts operating from the container root by
  mistake.
- **Minor:** The extra path depth can aggravate Windows path-length
  and tooling-path assumptions, especially in Node-heavy repos or
  deep .NET output trees.
- **Minor:** Devcontainer/Docker Compose, editor workspace files,
  and local scripts that assume the repo root is the source root
  need explicit verification before calling this a universal
  standard.

**Modifications suggested:**

- Keep the flat-worktree layout **opt-in**, triggered by actual
  need: frequent parallel session sets, long-lived feature branches,
  or many simultaneous worktrees.
- Standardize the **operator experience**, not the raw filesystem
  shape. Provide a small script such as `dabbler clone <repo>` /
  `dabbler open <repo>` / `dabbler new-worktree <repo> <slug>` so
  humans use one workflow even if storage layouts differ.
- If you want a stronger standard, pilot it on the repos that
  already show the pain (`dabbler-access-harvester`, maybe
  `dabbler-platform` once it actually needs it), then reevaluate
  with real usage data.
- Document one invariant for humans and tools: "always open/work
  from the worktree directory, never from the container root."
- Before broader rollout, test the actual tool matrix you use: VS
  Code, Visual Studio, JetBrains, devcontainers, Docker Compose,
  any custom scripts, and backup/sync tools.

**Failure mode flagged:**
Because the layout lives in the **local clone process**, not in the
repo contents, you cannot truly standardize it by decree. Unless
you build a bootstrap tool and make it the only supported entry
point, colleagues will continue creating normal clones, which means
your "one layout for everyone" goal fails and support burden
increases rather than decreases.

### Cross-cutting observations

Both proposals optimize for **local deduplication/consistency on
one workstation** by introducing **ambient dependencies on external
local state**:

- Proposal A depends on a sibling repo checkout and its current commit.
- Proposal B depends on a nonstandard local clone topology that Git
  itself does not produce by default.

That is the same architectural smell in two forms: important
behavior moves out of the consumer repo and into the surrounding
machine setup.

A better pattern for both is:

1. **Make runtime inputs local, versioned, and explicit.**
   - Consumer repo should contain the effective agent bootstrap it needs.
   - Repo clone should work with normal Git unless a wrapper
     intentionally adds extra behavior.

2. **Centralize via tooling, not via runtime indirection.**
   - Generate/sync agent files from the orchestration repo.
   - Provide repo/bootstrap scripts for creating worktree layouts
     where useful.

3. **Sequence these changes, do not stack them.**
   - First solve shared-distribution/versioning of workflow artifacts.
   - Then, separately, decide which repos truly benefit from the
     flat-worktree container.
   - Doing both at once makes failures harder to attribute and
     rollback harder to reason about.

If the human wants one principle to use across both proposals, it
should be: **prefer standardized tooling over standardized
filesystem assumptions**.

---

## Appendix C: Original review prompt

The full review prompt sent to both providers is preserved at
`C:\temp\dabbler-architectural-review-prompt.md` (temporary file —
will be cleaned up with `worktree-remediation-temp/`). Key sections
captured:

- Background on `dabbler-ai-orchestration` and its consumer repos
- How a session works (relevant to evaluating Proposal A)
- The legacy sibling-worktree layout vs. the bare-repo +
  flat-worktree layout
- Both proposals stated with current state, what's proposed,
  reasoning offered by the human, and concerns to evaluate
- Required structured output format (verdict + concerns by severity
  + modifications + missed failure modes + JSON for aggregation)
- Explicit instruction: *"The human is explicitly asking for
  criticism, not validation — they want to know if either proposal
  has a problematic failure mode they've missed."*

If a future re-evaluation is desired, regenerate the prompt from
this proposal doc plus any new context, route through `query()` to
the desired models, and append the responses as additional
appendices here.
