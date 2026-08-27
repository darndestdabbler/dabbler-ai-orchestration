# Container architecture for AI orchestration — proposal and assessment

**Status:** proposal, for critique. Asked of GPT Sol and Gemini,
independently: attack it, do not bless it. Nothing is authorized; nothing
is built.
**Date:** 2026-08-26
**Branch:** `design/solution-decomposition`

**Relation to prior documents.** This proposes a concrete deployment
topology for the direction in `framework-white-box-direction.md`. It is a
response to the five reviews in `docs/reviews/framework-white-box-*.md`,
and specifically to the security round, which ranked "AI-authored code
shares credentials, git authority, and journal access with the framework"
as the top risk.

**The operator's constraint, stated plainly:** *"I need much greater
simplicity here or my staff will reject it."* Success criterion (b) of
`framework-white-box-direction.md` §0 — staff must want to use it — is a
gate on this document, not an aspiration. A correct architecture that
people route around has failed.

---

## 1. The operator's diagram

Three containers, each with one job.

### IDE Container

1. Provides Solution and Work Organization for projects
   - a. Provides real-time view of progress on project components
   - b. Allows human operator to initiate next steps in solution development
   - c. Allows human operator to read project documentation (e.g., `spec.md`
     and `change-log.md`)
2. Holds and Executes Python Scripts
3. Has client for API Proxy Container
   - a. **Consumer Role:** treats AI as a service that provides information,
     file creation, critical feedback, and recommendations.
   - b. **Producer Role:** treats AI as an information consumer that needs to
     "see" and "navigate" the solution file system through instructions to
     the IDE Container.
   - c. **Chronicler Role:** streams relevant output from the AI engine.
4. Has client for git integration
5. Reads, writes, and executes solution files (via mounted host folder)

### API Proxy Container

1. Exposes a generic AI API
2. Can only make calls to Copilot CLI, Claude CLI, or direct APIs
3. Keeps track of costs (via mounted host folder)
4. Keeps work logs (via mounted host folder)

### Solution Containers

1. Provide temporary isolated environments for testing

**Topology.** The IDE Container talks to the API Proxy Container and to
Solution Containers. Only the API Proxy Container reaches the outside
world, and only to the three vendors. Solution files, cost records, and
work logs live on mounted host folders.

---

## 2. What the shape gets right

**It expresses the reviewers' security conclusions as topology rather than
as policy.** Sol's security review specified a ten-step transactional job
protocol — immutable snapshot, ephemeral worker, brokered calls,
constrained restore, offline execution, effect collection, validation,
atomic promotion. Every property that protocol was protecting is present
here as a box with one job. This is the same rigour, relocated to where it
costs nothing to explain. It is the first version of this that plausibly
passes criterion (b).

**The API Proxy Container solves the top-ranked risk by construction.**
Both reviewers ranked credential co-location first, and both recommended
scrubbing `DABBLER_*` from the environment handed to child processes. The
proxy makes that fix structural: keys exist in one small container that
never runs AI-authored code. There is no patch to remember, no way to
regress it later, and nothing to explain beyond "the keys live over
there." That is strictly better than the fix both reviewers asked for.

**It removes three findings outright.**

- The repository can no longer choose the privileged interpreter.
  `pythonInterpreter.ts::explicitPythonPathSetting` honours
  `workspaceFolderValue` — a `.vscode/settings.json` inside the repo — and
  `detectWorkspaceVenvInterpreter` falls back to the repo's own `.venv`.
  Since the AI writes files in that repository, this is a path from "AI
  edits a config file" to "AI selects the binary that runs with live
  credentials." A container image has no such path.
- The two-channel install disappears. `framework-white-box-direction.md`
  §6 argues the wheel makes version skew impossible while §6 also permits a
  lagging extension; an image is genuinely one artifact.
- "Is VS Code more secure than a served UI" stops mattering, because
  nothing depends on VS Code for isolation. Both reviewers had already
  answered no.

**Every vendor call passes through one point.** That makes the
disclosure-ledger recommendation cheap rather than invasive: the proxy is
the natural place to record which content hashes went to which vendor,
which is the control the multi-vendor finding asked for and which no
container otherwise provides.

---

## 3. Three amendments

### 3.1 The IDE Container must not execute solution code

Item 5 says the IDE Container "reads, writes, and executes solution
files," and item 4 gives it the git client. That places AI-authored code
in the same container as push credentials, the record, and the framework's
own source — reintroducing the rank-1 risk the proxy had just designed
out. It also makes Solution Containers redundant, since the consequential
execution has already happened elsewhere.

**Amendment: the IDE Container orchestrates; Solution Containers execute.**
Rename them **Solution Execution Containers** and widen their stated job
from "testing" to running anything the AI wrote — build, test, lint, and
scripts alike.

### 3.2 The mechanism is the mount, not the container

**The isolation is not stronger; the blast radius is smaller.** A
container boundary protects the host from what is inside it and does
nothing to protect the contents from each other. Both containers have
identical walls. What differs is what is standing next to the code when it
runs.

In the IDE Container that is: git push credentials (arbitrary push,
force-push over history); the journal, whose machine-written integrity the
whole trust model rests on; `ai_router` itself, so a modification survives
into the next run and the thing that would detect it is the thing that was
modified; the proxy client, which can spend budget and send data to a
vendor without ever holding a key; and the projection the console renders,
so code that writes it can show the operator a green screen.

**Therefore the execution container earns its existence only with a
narrower mount** — a copy of the source and nothing else. No `.dabbler/`,
no journal, no `ai_router`, no git credentials, no proxy client. Given the
same host mount as the IDE Container, it adds a moving part and buys
almost nothing.

### 3.3 Two smaller corrections

- **The proxy owns its log and cost mounts; the IDE Container gets them
  read-only.** Cost records and work logs are evidence. A container that
  runs AI-influenced code should not be able to edit its own receipts.
- **Do not call it the IDE Container.** Its job list — progress view,
  initiate next steps, read the spec — describes a supervisor console, not
  an IDE. The name matters for adoption: "IDE container" tells staff they
  must work inside it, which triggers exactly the dev-container dread that
  kills adoption on Windows. **Console Container** or **Framework
  Container** yields the mental model "a dashboard I open."

---

## 4. The threat that actually justifies execution isolation

The adversarial case is the weakest argument for it. A model deliberately
attacking the operator is unlikely; prompt injection is plausible but not
routine. **What is routine is the boring case:** a test with a bad cleanup
path, a build script that writes outside its directory, a dependency
install hook doing something careless. Nothing hostile, and the working
tree is still left in a state someone has to reconstruct.

For that case the payoff is not containment. **It is rollback.** Run the
job against a copy and a bad outcome costs nothing — the box is deleted.
This is what makes "fail closed" mean something, and it is Sol's first
round-one blocking finding restated: today the framework can reject a
malformed return while the repository is already modified.

---

## 5. A cheaper option that must be ruled out first

**Half of this already exists in the code.** `checks.py:377`
`snapshot_worktree_tree` builds a real git tree object of the working
state through a temporary index, and deliberately drops `.dabbler/` so the
record can never appear in a snapshot; `changed_paths_between` diffs two
of them. (`evidence.py:82` carries a second copy of the same pair — noted
as a defect elsewhere, but it means the machinery is in use on both
paths.)

**A git worktree per job, plus that snapshot, delivers the rollback
benefit with no container, no image to maintain, and no Windows filesystem
penalty.** What it does not deliver is credential and record separation: a
worktree runs on the same machine, in the same environment, with the same
access to `.dabbler/`.

The two options buy different things:

| | Rollback | Record + credentials out of reach | Cost |
| --- | --- | --- | --- |
| **Worktree per job** | yes | **no** | days; uses existing machinery |
| **Execution container, narrow mount** | yes | yes | an image; a slow mount on Windows |

**Recommended sequencing: worktree first.** It addresses the failure that
actually happens, uses machinery already written and tested, and does not
ask staff to install and understand a third box on day one. Then decide
the container on evidence — adopt it where the record is evidence and a
bad push is a real incident (the government repositories), and accept a
worktree as proportionate for home projects. Sol's security review
proposed the same split by a different route: fail closed for regulated
work, an explicitly labelled unsafe profile elsewhere.

---

## 6. What this does not fix

Stated explicitly, because a change of this size invites the feeling that
everything was handled.

- **Prompt injection.** No container arrangement stops a repository file
  from instructing a model to say "approve." Ranked second of eight in the
  security review. It is answered by keeping approval authority outside
  anything a model can reach, not by topology.
- **The four integrity defects already in the code.** The verifier's
  self-exemption (`verdict.py::is_doc_only_issue` — a finding whose cited
  evidence is all `.md` never blocks, and the verifier writes that list);
  scripted reviews satisfying live transitions (`workflow.fold` never reads
  the `simulated` flag it records); three separate event logs where the
  design assumes one; and `fold` enforcing no legal transition order.
  Containers govern where code runs; these govern what the framework
  believes.
- **Vendor disclosure.** Three vendors still receive the source, and
  nothing records which files went where. The proxy makes the fix cheap,
  but it is an addition, not a consequence.

---

## 7. The two real costs

- **The mounted host folder sits on the hot path.** On Windows, containers
  reach host files through a translation layer that is slow, and every
  build crosses it. This is the recurring friction most likely to sink
  adoption, and it should be measured on a real Java or .NET build before
  anything is committed to.
- **Copilot CLI and Claude CLI inside the proxy is the fiddliest part.**
  Both authenticate interactively — device flows, seat logins, sessions
  that must persist across container restarts — and the operator's history
  already records Copilot authentication pain. Everything else here is
  straightforward; this is where the implementation time goes, and it
  should be prototyped first rather than last.

---

## 8. Where to attack

1. **Does the proxy actually contain the credential?** It holds keys and
   accepts calls from a container that runs AI-influenced code. Enumerate
   what a caller can do with an unauthenticated local API that never
   requires a key — budget exhaustion, data egress in prompt text,
   model substitution, log forgery.
2. **Is §3.2 right that the mount is the mechanism?** If two containers
   share a host folder, what remains of the boundary? Name what must be
   true of the narrow mount for the claim to hold.
3. **Is §5's sequencing correct, or is it the classic mistake** — shipping
   the cheap half, declaring the problem solved, and never building the
   part that protects the record?
4. **The Chronicler role streams AI output to the console.** Untrusted
   text rendered in a supervisor's UI, adjacent to approval controls.
   What does that enable?
5. **The Producer role lets AI "see and navigate the solution file system
   through instructions to the IDE Container."** That is a file-read
   capability driven by model output, executing in the container that holds
   the record and the credentials. Is it a path-traversal surface?
6. **Does three-boxes-one-job survive contact with implementation,** or
   does it acquire a fourth and fifth box and become the thing staff
   reject? Name what would drive box count up.
7. **Windows specifically.** Is the mounted-folder penalty a
   measure-then-decide item or a disqualifier?
8. **Criterion (b).** Judge the whole proposal against "staff want to use
   it." Which single element is most likely to be routed around?
