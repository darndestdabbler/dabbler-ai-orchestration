# Implementation plan — execution isolation and record integrity

**Status:** plan, for operator approval. Nothing here is authorized.
**Date:** 2026-08-26
**Branch:** `design/solution-decomposition`

**Inputs.** `docs/container-architecture-direction.md` (the operator's
three-container diagram and its assessment), and the seven reviews in
`docs/reviews/` — two design rounds, two security rounds, and two container
rounds from GPT Sol and Gemini 3.1 Pro, each reviewing independently with
its own prior reviews and the relevant source in hand.

---

## 1. What the reviews settled, and what they did not

### 1.1 Settled — both reviewers, independently

**The diagram as drawn does not work, and both name the same reason.** The
console container still "reads, writes, and executes solution files" while
holding git integration and a writable mount of authoritative state. The
proxy removes vendor keys from that container and leaves everything else —
the repository, the record, the framework's own source — inside the blast
radius. Sol: *"the API proxy removes vendor keys from that process but
leaves the dominant privilege-co-location failure substantially intact."*

**The console should be native, not a container.** Sol names it the box
most likely to be bypassed and the one that "adds Windows/Podman friction
without providing the principal security boundary." Gemini reaches the same
place by discarding all three boxes. Under either reviewer, the console
container is the first thing to cut.

**The proxy as drawn is a confused deputy.** It holds keys and exposes an
unauthenticated local API to a caller that runs AI-influenced code. The key
cannot be stolen; it can be *used* — budget exhaustion, and exfiltration by
embedding source in the prompt text the proxy is asked to send. Hiding key
bytes is not the same as containing key authority.

**The framework's existing integrity defects are architecture-independent
and must be fixed regardless.** Sol §6.15: *"A worker that perfectly
contains code can still feed a framework that makes incorrect authority
decisions."*

**Two claims in the assessment were wrong and are corrected here:**

- **§3.2 was overstated.** Both reviewers rejected "the walls are
  identical." The correct formulation is Sol's: **the mount determines file
  blast radius; the container configuration determines process, network,
  resource, device, and root-filesystem blast radius.** A shared writable
  authoritative mount is disqualifying, but an execution container is not
  worthless because one mount is shared — it still caps CPU and memory,
  contains the process tree, removes host-home access, and can remove
  network egress entirely.
- **§5's "half of this already exists" was too generous.**
  `checks.py::snapshot_worktree_tree` builds a tree object through a
  temporary index. It captures state for diffing; it does **not** create a
  working directory a build can write into. Execution needs
  `git worktree add`, which is not written.

**One claim was unfounded.** The assessment asserted the console container
holds push credentials. The diagram says "git integration," not push
credentials. The failure applies only if it can push — which the operator
should now state explicitly, because the answer changes the design.

### 1.2 Not settled — the reviewers disagree, and it is a real disagreement

**Gemini: worktree first, containers never.** Native execution via
`git worktree add`, credentials scrubbed from the subprocess environment,
file reads path-jailed. It calls the Windows mount penalty an **absolute
disqualifier** — a five-second native build becoming 45–60 seconds — and
predicts three boxes become five. It formally withdrew its own earlier
Podman recommendation.

**Sol: both together, worktree-only never.** The first shippable unit must
be snapshot + disposable workspace + constrained worker + offline execution
+ validated promotion. It revised its own earlier re-scoped position to get
here. Its argument is not that later work might be forgotten but that
**worktree-first establishes the wrong interfaces**: commands inherit host
behavior, tests depend on host-installed tools, scripts assume host paths,
staff normalize running outside the worker, and the eventual container must
break all of those assumptions. It states that *absence of incidents during
a worktree-only pilot would not change the decision.*

**The disagreement is narrower than it looks, and one fact resolves much of
it.** Gemini benchmarked a Linux container against a mounted NTFS host
folder. Sol's §4.7 says that specific design should never be built:
*"Measuring only a `C:` bind mount would test a known poor design rather
than container viability."* Copy the snapshot into WSL ext4 or a
Podman-managed volume and most of the metadata penalty disappears. So
Gemini's disqualifier condemns a design Sol also rejects — **the two have
not measured the same thing, and nobody has measured the right thing.**

**Therefore the split is settled by evidence, not by argument, and §3 of
this plan is that measurement.**

---

## 2. Phase 0 — Work that is correct under either branch

Every item is small, sits in existing code, requires no new infrastructure,
and was ranked [must] by at least one reviewer with the other not
dissenting. **None of it depends on the container decision.** This phase
should proceed whether or not anything else in this plan is approved.

### 0.1 Scrub credentials from executed commands

`checks.py::_spawn` passes no `env=`, so every check command inherits the
full parent environment including all three `DABBLER_*_API_KEY` values. The
commands it runs are the project's test suite, which runs AI-authored code.

**Change:** construct an explicit child environment with `DABBLER_*` and
`*_API_KEY` removed. Both reviewers rank this first; both cost it at zero
friction.

**Note:** the declared-command path also uses `shell=True`. That is
deliberate — a declared shell string is repository configuration — but it
means a repository-controlled string reaches a shell. Worth an explicit
decision, not a silent one.

### 0.2 Remove the verifier's self-exemption

`verdict.py::is_doc_only_issue` returns true when every verifier-supplied
`evidencePaths` entry ends in a documentation extension, and
`is_blocking_issue` then returns false. The verifier authors that list, so
the verifier decides whether its own finding blocks. This violates the
honest-fields corollary the framework is built on, in shipped code.

**Change:** blocking status derives from severity and pre-registered
acceptance authority. Evidence paths may support a finding; they may not
decide its authority.

### 0.3 Stop simulated reviews from advancing live state

`stepreview` marks scripted rounds `simulated` and `workflow._run_review`
records the flag, but `workflow.fold` never reads it — a scripted review
sets `reviewed = True` exactly like a vendor round. The guarantee is real
at display level and absent at state-transition level.

**Change:** `fold` must not satisfy a review transition from a simulated
event.

### 0.4 Enforce legal transition order

`workflow.append` validates only that an event name is known;
`workflow.fold` applies `approved` unconditionally. `workflow approve` on a
target that was never entered or reviewed is accepted and clears
`waitingOn`. This contradicts the framework's first principle directly: it
records what it is told, in the order it is told.

**Change:** preconditions in the sanctioned command functions, a published
transition table, and a test per illegal order.

### 0.5 Derive the step-review author, do not accept it

`workflow._main` takes an optional `--author-provider`. Omitted, the first
reviewer may be the author's own vendor — two reviewer vendors, but not two
that "did not write it," which is `stepreview`'s stated contract.

**Change:** derive author identity from recorded provenance; fail closed
when it cannot be resolved.

### 0.6 Add the returned-provider postcondition to session verification

`stepreview.review` checks that the provider that actually answered
survived the exclusion. `verify.run_round` does not. `STATUS.md` records
that the offline path once ignored `exclude_providers` — the defense exists
in one pipeline and is missing from the other.

**Change:** reject a returned provider that is in the exclusion set.

### 0.7 Remove repository control of the privileged interpreter

`pythonInterpreter.ts::explicitPythonPathSetting` honours
`workspaceFolderValue` — `.vscode/settings.json` inside the repository —
and `detectWorkspaceVenvInterpreter` falls back to the repository's own
`.venv`. The AI writes files in that repository.

**Change:** the privileged interpreter is machine-scoped and outside the
repository; workspace-relative selections are refused.

### 0.8 Path-jail model-directed file reads

The Producer role lets model output direct navigation of the solution file
system. Both reviewers flag traversal. Nothing here exists yet, so this is
a constraint on what gets built, recorded now.

**Change:** resolve every requested path and require containment within the
snapshot root; enforce byte limits; return handles from a snapshot
manifest rather than model-selected paths.

### 0.9 Neutralize streamed model output in the console

The Chronicler role renders vendor output next to approval controls.
Terminal control sequences, hidden text, and disguised links are the named
risks.

**Change:** render as escaped inert text, strip terminal controls, label
provenance, and separate it visually from anything that authorizes.

**Phase 0 exit criterion:** the framework's authority decisions are sound
and no credential reaches AI-authored code. Until this holds, nothing that
the record says is worth containing.

---

## 3. Phase 1 — The measurement that settles the split

**This is a decision gate, not a build step.** Both branches are defensible
and the evidence to choose has never been gathered.

**Measure:** representative Java and .NET projects — real ones from the
government work, not toys — for cold start, dependency restore, incremental
build, full build, and test run.

**Configurations, in this order:**

1. Native Windows (the baseline staff compare against).
2. Container with the snapshot copied into a **Podman-managed volume or
   WSL ext4** — the design Sol says should be the default.
3. Container against a `C:` bind mount — included only to confirm it is as
   bad as Gemini says, so the result is not re-litigated later.

**Set the adoption threshold before measuring, not after.** A ratio against
native, agreed by the operator, above which the worker path is rejected.
Deciding the threshold after seeing the numbers is how a disqualifying
result becomes an acceptable one.

**Also measure the thing that actually predicts rejection:** how often a
pilot user runs a command from the host terminal instead of through the
framework. Sol's §4.8 names mandatory execution through a slow or
incomplete worker as the single most likely bypass, and bypass rate is
observable where "did staff complete the task" is not.

**Prototype the vendor CLI authentication in the same phase.** Copilot and
Claude CLI authenticate interactively, and sessions must survive container
restarts. Gemini's prediction for what gets abandoned first is precisely
this — staff re-authenticating device flows against a restarted proxy, then
pasting a personal key into a `.env` file instead. This is the highest
implementation risk in the whole design and it should be proven before
anything is built around it.

---

## 4. Phase 2 — Branch on the measurement

### 4.1 If the managed-volume worker meets the threshold — Sol's path

Ship as **one feature**, not as increments:

1. immutable input snapshot, bound to a tree digest;
2. disposable job workspace in managed storage, **not** a writable
   authoritative bind mount;
3. execution inside a rootless worker with no `.git`, no `.dabbler`, no
   host credentials, no proxy client;
4. dependency restore as a separate constrained phase against approved
   registries, followed by build and test with the network removed;
5. validated output collection against a path envelope — reject symlinks,
   special files, traversal, oversized output, stale bases;
6. atomic promotion by the native console, which is also the only thing
   that pushes.

**The console stays native and never runs project code.** It owns the
journal, promotion, git, and worker lifecycle. The Podman socket is exposed
to nothing.

**Staff see `dabbler run`.** If they see a Podman workflow, criterion (b)
has already failed.

### 4.2 If it does not — Gemini's path

Native execution via `git worktree add --detach`, run, `git worktree
remove`. Phase 0.1 has already removed the credentials from that
environment, which is what makes this defensible rather than a trap.

**State plainly what is not bought:** the record and the repository remain
reachable by executed code under the same OS user. Sol's objection stands
in full, and the honest form of this branch is Sol's own recommendation 12
— an explicitly non-authoritative profile whose limitation is mechanical
and visible, not a warning.

### 4.3 Either way

The console is native. The three-box diagram does not survive in its drawn
form under either branch, and the operator should decide the "can the
console push?" question explicitly, since the assessment assumed an answer
it had not established.

---

## 5. Phase 3 — Disclosure and the proxy

**The disclosure ledger does not require a container and should not wait
for one.** Three vendors receive source from state government systems and
nothing records which files went where — ranked third of eight in the
security review, and untouched by every architectural option here. A
logging wrapper at `transports/api.py` recording vendor, model, content
hashes, and the paths disclosed is zero-friction and closes the highest-
consequence gap that no container addresses.

**If the proxy is built, it is a capability broker, not a key locker:**
per-job short-lived token, quota, model allowlist, project identity, and
endpoint configuration owned by the proxy rather than accepted from the
caller. Without those, it converts credential theft into credential abuse
and calls it progress.

---

## 6. Explicitly out of scope

- **Prompt injection is not solved here.** No topology stops repository
  text from instructing a model. It is answered by keeping approval
  authority outside anything a model can reach — which is why MCP approve /
  refuse stays off the table and both reviewers said so twice.
- **The surface question is not reopened by this plan.** Read-only browser
  work may proceed; replacing the extension and moving approvals wait for a
  human pilot, per both design rounds.
- **Enterprise controls** — RBAC, SLOs, failover, multi-tenant deployment —
  are out. Sol withdrew these itself against the one-to-three-person bar.

---

## 7. Two repository notes

- **`AGENTS.md` is stale on the working branch.** It directs work to
  `experiment/verification-pipeline-v3`; `STATUS.md` says
  `design/solution-decomposition` and that the former is no longer where
  work happens. One of them should be corrected before a session runs
  against the wrong instruction.
- **The 142–147 envelope in `AGENTS.md` was written for a sequence that is
  no longer in flight.** Phase 0 is small, but Phase 2 is not, and the
  ground rules resume their original numbers when that sequence ends.
  Whether this work runs under the envelope, under the original rules, or
  under a new one is an operator decision that should be made before
  Phase 2, not discovered during it.
