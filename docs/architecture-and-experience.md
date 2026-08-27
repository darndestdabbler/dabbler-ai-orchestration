# Dabbler — architecture and developer experience

**Purpose of this document.** It describes one architecture in enough detail to
build from, and shows what a person actually sees while using it. It is written
to be turned into a slide deck: every numbered section is a slide or a short
run of slides, and every wireframe is a mockup waiting to be drawn.

**Status:** proposed. Nothing here is built. The framework underneath it —
routing, the six-step model, contracts, cross-vendor review, the append-only
record — exists and has been run end to end.

---

## Note for the deck author

Sections 1–3 are the architecture story: what it is, what the boxes are, how it
installs. Section 4 is the vocabulary a viewer needs before any screen makes
sense — do not skip it, the mockups are unreadable without it. Sections 5–8 are
the mockups. Sections 9–11 close.

The wireframes use fixed-width boxes because that is the honest way to write a
layout in text. When drawing them, keep the **information hierarchy** and the
**position of the decision** — what the eye hits first, and where the button
that commits a human to something lives. Do not preserve the ASCII.

Three visual rules run through every screen and are worth carrying into the
design:

1. **The decision is always in the same place** — bottom right of the main
   panel, never in a toolbar, never duplicated.
2. **Machine facts and model claims never share a visual treatment.** Anything
   the framework observed (a test result, a file digest, an exit code) is
   plain and unadorned. Anything a model said is in a quoted block with the
   vendor's name on it. A viewer must never have to ask which kind of thing
   they are reading.
3. **Nothing is ever hidden because it is inconvenient.** Findings that were
   overruled stay visible, marked as overruled.

---

## 1. The whole thing in one paragraph

Dabbler runs on your own machine. You keep your project in a normal Windows
folder and edit it in whatever you already use — Visual Studio, Rider,
IntelliJ, VS Code, MuseScore, Word. One web page shows you what the AI is
doing, what it produced, and what needs a decision from you. When an AI writes
code, Dabbler copies the project into a temporary sandbox, runs your tests
there, asks a second AI vendor to review the result, and shows you a summary.
Nothing reaches your real project folder until you approve it. When you
approve, Dabbler writes the change, records the decision permanently, and moves
to the next piece of work.

---

## 2. The architecture

### 2.1 The slide

```text
   ┌──────────────────────────────────────────────────────────────┐
   │  WHAT YOU USE                                                │
   │                                                              │
   │   Your editor                    The Dabbler page            │
   │   VS / Rider / IntelliJ          one browser tab             │
   │   VS Code / MuseScore            (or inside VS Code)         │
   │                                                              │
   │   C:\Work\my-project  ◄── a normal Windows folder            │
   └───────────────┬──────────────────────────────────────────────┘
                   │  localhost
                   ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  DABBLER  —  the control plane (runs natively on Windows)    │
   │                                                              │
   │  serves the page · decides what happens next · calls the     │
   │  AI vendors · holds the record · writes files · runs git     │
   │                                                              │
   │  NEVER runs project code.                                    │
   └──────────┬─────────────────────────────────┬─────────────────┘
              │ snapshot in / result out        │ HTTPS
              ▼                                 ▼
   ┌──────────────────────────┐     ┌───────────────────────────┐
   │  THE SANDBOX             │     │  AI VENDORS               │
   │  one per job, deleted    │     │  Anthropic · OpenAI ·     │
   │  after                   │     │  Google · Copilot         │
   │                          │     └───────────────────────────┘
   │  builds, tests, renders  │
   │  no keys · no git · no   │
   │  record · no network     │
   └──────────────────────────┘
```

**Four boxes. Three of them you never think about.**

### 2.2 What each piece is

| Piece | What it does | What it can reach | What it must never reach |
| --- | --- | --- | --- |
| **The page** | Shows work, collects decisions | Dabbler, over localhost | Files, git, vendors |
| **Dabbler** | Sequences work, calls vendors, owns the record, writes files, runs git | The project folder, the record, the vendors, the sandbox | Project code as something to *execute* |
| **The sandbox** | Runs builds, tests, linters, renderers | Its own copy of the source; package registries during one restore phase | API keys, git credentials, the record, your home directory, the network during test execution |
| **Vendors** | Generate and review | Only what Dabbler sends | Everything else |

### 2.3 Why each boundary exists

Every boundary here is answering a specific failure, not a category of concern.

**Dabbler never executes project code.** Today the framework runs check
commands with the full parent environment inherited, which means AI-written
tests execute with three live vendor API keys readable in `os.environ`
(`checks.py::_spawn`). The boundary makes that structurally impossible rather
than a thing to remember.

**The sandbox has no network during test execution.** Dependency restore is a
separate, earlier phase with its own narrow permission. This is what makes
"isolated" mean something — an isolated environment with unrestricted network
access can send anything anywhere.

**The sandbox never sees the record.** The append-only journal is the evidence
that work happened and was reviewed. Code written by a model must not be able
to edit its own receipts.

**Only Dabbler pushes.** A job that goes wrong costs you a deleted sandbox, not
a rewritten history.

### 2.4 What crosses each boundary

```text
  page  ──►  Dabbler     a decision: approve / send back / cancel,
                         carrying the digest of exactly what was reviewed

  Dabbler ──► sandbox    an input snapshot (source only — no .git,
                         no .dabbler, no credentials) + the command to run

  sandbox ──► Dabbler    exit code, output log, and a file diff limited
                         to a declared path envelope

  Dabbler ──► vendor     a prompt built from the record, a contract, and
                         a bounded slice of source

  vendor  ──► Dabbler    a typed result: verdict, findings, severities,
                         evidence paths — parsed, never trusted as prose
```

### 2.5 What is deliberately *not* here

- **No container for Dabbler itself.** It runs natively so that your editor,
  your files, and your git credentials stay native and fast.
- **No API proxy container.** Since the control plane no longer runs project
  code, a separate process to hold keys buys a port, a token protocol, and an
  authentication path in exchange for very little.
- **No approvals from a chat interface.** A model that can be prompted by
  repository text must not be able to exercise human authority.
- **No plugins for Visual Studio, Eclipse, or IntelliJ.** The page plus a deep
  link into your editor reaches every editor, including the ones with no plugin
  story — MuseScore, Word.

---

## 3. Install and upgrade

### 3.1 Install

Dabbler ships **inside the VS Code extension**, as a frozen binary. There is no
Python to install, no virtual environment, no `pip`.

*Measured, not estimated: the frozen framework is 10.7 MB zipped against a
40 MB marketplace limit, and starts in 199 ms.*

```text
1.  Install the "Dabbler" extension from the Marketplace.
2.  Command palette → "Dabbler: Set up".
3.  Paste an API key for each vendor you use. Stored in Windows
    Credential Manager, never in a file.
4.  Command palette → "Dabbler: Open" — the page opens.
```

For someone who does not want VS Code at all, the same binary is downloadable
directly and `dabbler open` does step 4. The extension is a convenience, not a
dependency.

**The sandbox is fetched on first use, not at install.** The first job pulls a
worker image; the page says so and shows progress. Nobody waits for a
multi-gigabyte download before seeing the product work.

### 3.2 Upgrade

The extension auto-updates. Because the framework is inside it, **the UI, the
framework, the guidance documents, the review prompts, and the sandbox image
digests all move together.** There is no version skew to manage because there
is only one version.

### 3.3 The trade this makes

A frozen binary means Dabbler becomes the patch channel for its own
dependencies. Three things keep that honest:

- dependency updates watched automatically, with a security advisory
  triggering a rebuild and republish;
- dependencies pinned explicitly in the build;
- **TLS trust taken from the Windows certificate store, not a bundled CA
  list**, so the root store updates through Windows Update instead of going
  stale.

---

## 4. The vocabulary a viewer needs

*This section is a slide. The mockups do not make sense without it.*

**A solution is broken into components. Each component is a black box with a
written contract.** One component is the **integration** — the thing that wires
the others together. The rest are **libraries** — the black boxes.

**Work moves through six steps:**

| | Step | What it means in plain words |
| --- | --- | --- |
| 1 | **Plan and design** | What is this for, and what is out of scope |
| 2 | **Break it into components** | What the black boxes are |
| 3 | **Write down the promises** | Each box's contract |
| 4 | **Build stand-ins** | Fake versions of every box that behave correctly |
| 5 | **Build the whole thing on stand-ins** | The integration works, end to end, on fakes |
| 6 | **Replace the stand-ins for real** | One black box at a time |

**Steps 1 and 2 need your approval. The rest do not.** That is the whole human
contract: you decide what is being built and how it is divided. After that the
contracts decide, and you are asked only when something is disputed.

**Why build on fakes first (step 5).** Because the integration is where designs
are proven wrong, and finding that out while the parts are still cheap to
change is the entire point. By step 6, every black box has a contract that was
tested against a working whole. This is the same practice as a film composer's
MIDI mockup: the piece is proven before the orchestra is booked.

---

## 5. The page

### 5.1 Shape

```text
┌────────────────────────────────────────────────────────────────────────┐
│  Dabbler        my-project ▾                          ● 2 need you     │
├──────────────┬─────────────────────────────────────────────────────────┤
│              │                                                         │
│  INBOX   (2) │   [ the main panel — one thing at a time ]              │
│              │                                                         │
│  Solution    │                                                         │
│   ├ Plan     │                                                         │
│   ├ Map      │                                                         │
│   └ Contracts│                                                         │
│              │                                                         │
│  Components  │                                                         │
│   ● csv-app  │                                                         │
│   ○ csv-parse│                                                         │
│   ○ csv-model│                                                         │
│              │                                                         │
│  History     │                                                         │
│              │                                                         │
└──────────────┴─────────────────────────────────────────────────────────┘
```

**The inbox is the home page, not a badge.** Opening Dabbler answers one
question immediately: *does anything need me?* If the answer is no, the page
says so and gets out of the way.

### 5.2 Navigation

Every noun is a URL: a solution, a component, a contract, a run, a finding, a
decision. That is what makes a link in a notification land on the exact thing
that needs you, already scoped.

### 5.3 The four states of a component

```text
   ○  idle          nothing running
   ◐  working       an AI is producing something (with elapsed time)
   ◑  checking      building / testing / being reviewed
   ●  needs you     a decision is waiting
   ✓  done          this step is complete
```

---

## 6. Mockup A — Planning

*Steps 1–3. This is where the human does most of their work, and it is
deliberately front-loaded: the two approval gates are both here.*

### 6.1 Starting

```text
┌────────────────────────────────────────────────────────────────────────┐
│  New solution                                                          │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   What are you building?                                               │
│   ┌──────────────────────────────────────────────────────────────┐    │
│   │ A service that reads lab result files from the state HL7     │    │
│   │ feed and turns them into records our reporting system can    │    │
│   │ use. Needs to handle the malformed messages we actually get, │    │
│   │ not the ones the spec describes.                             │    │
│   └──────────────────────────────────────────────────────────────┘    │
│                                                                        │
│   Kind    ( ) Software   ( ) Document / policy   ( ) Score             │
│   Folder  C:\Work\elr-ingest                          [ Browse ]       │
│                                                                        │
│                                                     [ Start planning ] │
└────────────────────────────────────────────────────────────────────────┘
```

That is the entire input. Everything else is derived and then shown to you for
correction.

### 6.2 The plan comes back for approval

```text
┌────────────────────────────────────────────────────────────────────────┐
│  Step 1 of 6 — Plan and design                     ● waiting on you    │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  THE PLAN                                          drafted by Claude   │
│                                                                        │
│   Purpose    Convert inbound HL7 v2 ORU messages into validated        │
│              lab-result records for the reporting store.               │
│                                                                        │
│   Must do    · Accept ORU^R01, versions 2.3 through 2.5.1              │
│              · Reject and report, never silently drop                  │
│              · Every rejection names the segment and field             │
│                                                                        │
│   Out of     · Outbound acknowledgements                               │
│   scope      · Anything that is not ORU                                │
│              · Character sets beyond UTF-8 and ASCII                   │
│                                                                        │
│  ──────────────────────────────────────────────────────────────────    │
│  TWO OTHER VENDORS READ THIS                                           │
│                                                                        │
│   ⚠ Major   GPT-5.6 — "Out of scope excludes acknowledgements, but     │
│             the purpose says 'inbound feed'. A sender that gets no     │
│             ACK will retransmit. Silence here becomes a duplicate      │
│             problem later."                                            │
│                                                                        │
│   ⚠ Major   Gemini — "'Versions 2.3 through 2.5.1' is four versions    │
│             with incompatible field positions. Is one of them the      │
│             real one? A plan that says four will build for four."      │
│                                                                        │
│   · Minor   Gemini — wording of the rejection requirement              │
│                                                                        │
│  ──────────────────────────────────────────────────────────────────    │
│                                                                        │
│   [ Edit the plan ]   [ Send back with a note ]    [ Approve → ]      │
│                                                                        │
│   Approving over 2 unresolved Major findings will be recorded.         │
└────────────────────────────────────────────────────────────────────────┘
```

**The three things this screen is doing, and they are the point of the whole
product:**

1. **The findings are from vendors that did not write the plan.** They are
   labelled with who said them.
2. **You can approve over objections.** A prose document has no bottom — five
   real rounds on one plan produced four new Major findings every time. If
   unresolved findings blocked, work would never move. So the human gate
   outranks the block, **and the override is recorded.**
3. **The line at the bottom is not a warning, it is a receipt.** It tells you
   what the record will say.

### 6.3 Decomposition, the second and last approval gate

```text
┌────────────────────────────────────────────────────────────────────────┐
│  Step 2 of 6 — Break it into components            ● waiting on you    │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│         ┌─────────────┐                                                │
│         │  elr-app    │  integration — the whole thing                 │
│         └──────┬──────┘                                                │
│           ┌────┴────┬─────────────┐                                    │
│           ▼         ▼             ▼                                    │
│    ┌───────────┐ ┌────────┐ ┌────────────┐                            │
│    │ hl7-parse │ │ result │ │ reject-log │    black boxes              │
│    └───────────┘ └────────┘ └────────────┘                            │
│                                                                        │
│  ──────────────────────────────────────────────────────────────────    │
│   hl7-parse    Segments and fields. Knows HL7. Knows nothing           │
│                about lab results.                                      │
│   result       What a lab result is. Knows nothing about HL7.          │
│   reject-log   Why something was refused, and where.                   │
│  ──────────────────────────────────────────────────────────────────    │
│                                                                        │
│   Each box will get a written contract before anything is built.       │
│                                                                        │
│   [ Change the split ]   [ Send back ]              [ Approve → ]     │
└────────────────────────────────────────────────────────────────────────┘
```

**Why this is a gate.** The division decides what every later contract can say.
Getting it wrong is expensive in a way that nothing after it is. It is also the
last time a human is required until something is disputed.

### 6.4 Contracts (step 3, no gate)

```text
┌────────────────────────────────────────────────────────────────────────┐
│  hl7-parse — contract v1.0.0                              ◑ reviewing  │
├────────────────────────────────────────────────────────────────────────┤
│  PROMISES                                                              │
│   parse(text) → segments, rejections                                   │
│     Always returns both. An empty rejection list is a real answer,      │
│     not an absent one.                                                 │
│     Rejections carry the segment, the field, and one sentence.          │
│     segments + rejections == every line that was not blank.             │
│                                                                        │
│  WILL NOT PROMISE                                                      │
│   · Any message type other than ORU^R01                                │
│   · That rejection wording stays the same between versions             │
│                                                                        │
│  IF THIS CHANGES                                                       │
│   Skip-and-report is retained. A bad segment never fails the            │
│   message. Changing it silently changes what every caller gets.        │
└────────────────────────────────────────────────────────────────────────┘
```

**The `will not promise` section is load-bearing.** Most integration failures
are a caller depending on something that was never promised. Writing the
non-promises down is what makes a black box actually black.

---

## 7. Mockup B — Building the integration on stand-ins

*Steps 4–5. No approvals. This is where the developer watches a design get
proven or broken while it is still cheap.*

### 7.1 The screen while it works

```text
┌────────────────────────────────────────────────────────────────────────┐
│  elr-app — Step 5 of 6 — Build the whole thing on stand-ins            │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   Stand-ins in use                                                     │
│     hl7-parse   ▨ stand-in    honours contract v1.0.0                  │
│     result      ▨ stand-in    honours contract v1.0.0                  │
│     reject-log  ▨ stand-in    honours contract v1.0.0                  │
│                                                                        │
│   ◑  Writing the integration            Claude · 47s                   │
│      ├ ✓ reads a file end to end                                       │
│      ├ ✓ routes rejections to reject-log                               │
│      └ ◐ handling a message with no OBX segment                        │
│                                                                        │
│  ──────────────────────────────────────────────────────────────────    │
│   Sandbox   ▣ running  ·  dotnet test  ·  14s                          │
│                                                                        │
│      12 passed   1 failed                                              │
│      ✗ EmptyObxProducesRejectionNotCrash                                │
│                                                                        │
│  ──────────────────────────────────────────────────────────────────    │
│   [ Open in Rider ]  [ See the log ]              [ Stop this run ]    │
└────────────────────────────────────────────────────────────────────────┘
```

**"Open in Rider" is the whole editor story.** The page knows the file and the
line; the button hands it to whatever editor that person configured — Rider,
Visual Studio, IntelliJ, VS Code. One feature, in one place, instead of four
plugins.

### 7.2 When the integration disproves a contract

This is the most valuable screen in the product, because it is the moment the
method pays for itself.

```text
┌────────────────────────────────────────────────────────────────────────┐
│  A contract does not survive the integration            ● waiting on you│
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│   Building elr-app on stand-ins found this:                            │
│                                                                        │
│   hl7-parse promises  "segments + rejections == every non-blank line"   │
│                                                                        │
│   But a real ORU message continues one logical segment across          │
│   several physical lines. Under this promise, a continued segment      │
│   is counted twice — once as a segment, once as a rejection.           │
│                                                                        │
│   Nothing is built yet. The stand-in obeyed the contract exactly,      │
│   which is how this surfaced now instead of in step 6.                 │
│                                                                        │
│   Proposed change to hl7-parse v1.1.0:                                 │
│     - segments + rejections == every non-blank line                    │
│     + segments + rejections == every logical segment; continuation     │
│     + lines belong to the segment they continue                        │
│                                                                        │
│   Affects   result (no change)   reject-log (line numbers now          │
│             point at the first physical line of the segment)           │
│                                                                        │
│   [ Look at it ]   [ Send back ]              [ Accept the change → ]  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Mockup C — Building one black box

*Step 6, repeated once per component. The stand-in is replaced by the real
thing, and the contract is the specification.*

### 8.1 The component screen

```text
┌────────────────────────────────────────────────────────────────────────┐
│  hl7-parse — Step 6 of 6 — Replace the stand-in for real   ● needs you │
├──────────────────────────────┬─────────────────────────────────────────┤
│  THE CONTRACT (v1.1.0)       │  WHAT WAS BUILT                         │
│                              │                                         │
│  parse(text)                 │   Hl7Parser.cs           +214           │
│    → segments, rejections    │   SegmentReader.cs       +96            │
│                              │   Hl7ParserTests.cs      +180           │
│  · always returns both       │                                         │
│  · rejections name the       │   ┌───────────────────────────────┐    │
│    segment and the field     │   │ + if (line.StartsWith("  "))  │    │
│  · segments + rejections     │   │ +     current.Continue(line); │    │
│    == every logical segment  │   │ +     continue;               │    │
│  · skip-and-report:          │   └───────────────────────────────┘    │
│    a bad segment never       │                                         │
│    fails the message         │                                         │
│                              │                                         │
│  WILL NOT PROMISE            │                                         │
│  · message types besides     │                                         │
│    ORU^R01                   │                                         │
├──────────────────────────────┴─────────────────────────────────────────┤
│  CHECKS — run in the sandbox                                           │
│    ✓  dotnet build              4.1s                                   │
│    ✓  dotnet test               31 passed          8.7s                │
│    ✓  every promise has a test that fails without it                   │
│                                                                        │
│  REVIEW — by vendors that did not write this                           │
│    ✓  GPT-5.6      clear                                               │
│    ⚠  Gemini       1 Minor — a rejection sentence reads awkwardly      │
│                                                                        │
│  ──────────────────────────────────────────────────────────────────    │
│  [ Open in Rider ]  [ Full diff ]  [ Send back ]      [ Approve → ]   │
└────────────────────────────────────────────────────────────────────────┘
```

**The layout is the argument.** Contract on the left, what was built on the
right, machine facts below, model opinions below that, decision bottom right.
A reviewer reads left to right and asks one question: *does the right side keep
the promises on the left?*

**Notice what is not on this screen.** No token stream, no model chatter, no
terminal. The developer is being asked to judge a result, not to watch a
process.

### 8.2 Sending it back

```text
┌────────────────────────────────────────────────────────────────────────┐
│  Send hl7-parse back                                                   │
├────────────────────────────────────────────────────────────────────────┤
│   What is wrong?                                                       │
│   ┌──────────────────────────────────────────────────────────────┐    │
│   │ Continuation handling is right, but a continued segment that │    │
│   │ is itself malformed should report the line where the segment │    │
│   │ started, not where the error was found.                      │    │
│   └──────────────────────────────────────────────────────────────┘    │
│                                                                        │
│   ( ) Fix the build       the contract is right                        │
│   (•) Fix the contract    the promise is wrong — go back to step 3     │
│                                                                        │
│                                              [ Send back ]             │
└────────────────────────────────────────────────────────────────────────┘
```

**That radio button is a real decision and the framework needs the answer.**
Fixing the build is a retry. Fixing the contract sends the component back to
step 3 and re-checks every consumer. Conflating them is how a codebase drifts
away from its own documentation.

---

## 9. What the developer never sees

Worth an explicit slide, because the count of hidden things is the measure of
whether this is simple.

- Containers, images, volumes — the sandbox is created and destroyed per job.
- Git worktrees, snapshots, digests, promotion.
- Which vendor to ask, and the rule that the reviewer must not be the author.
- The append-only record. It is rendered as history, never edited.
- API keys, after the one time they are pasted.
- Prompt templates and review instructions, versioned with the release.

**Four concepts remain:** the project, the inbox, a run, and a decision.

---

## 10. The same architecture, three kinds of work

Objective: this must serve more than software. It does, because Dabbler never
knows what a compiler is — it runs a declared command and reads an exit code.

| | **A .NET service** | **A policy suite** | **A score** |
| --- | --- | --- | --- |
| Components are | projects | defined terms, obligations | movements, parts |
| A contract says | operations, pre/post | what a term means, who it binds | instrumentation, ranges, motifs |
| Stand-ins are | fakes honouring the contract | placeholder sections, terms fixed | piano reduction / MIDI mockup |
| The check is | `dotnet test` | cross-reference and term-usage lint | notation and range validation |
| A failure is | a failing test | a fact pattern with a contradictory outcome | an unplayable passage |

**One honest limit.** Aesthetic findings cannot carry a failure case, so they
are recorded and never block — and the human decides taste. A prose document
has no bottom and an aesthetic review has no floor, which is why the round cap
matters more in those domains, not less.

---

## 11. Build order

1. **Take the credentials away from executed code, and give the sandbox a
   real boundary.** Small, and everything else assumes it.
2. **Fix what the record believes.** Legal step order enforced; a scripted
   review must not satisfy a real one; a reviewer must not be able to exempt
   its own finding. Containment cannot repair a framework that accepts
   invalid transitions.
3. **Freeze the framework into the extension.** Deletes the interpreter hunt,
   the virtual environment, and the second update channel.
4. **The page, read-only.** Inbox, solution map, components, contracts,
   history. Run a real day through it before it can decide anything.
5. **Decisions.** Approve, send back, cancel — bound to the digest of exactly
   what was reviewed.
6. **The sandbox.** Snapshot in, result out, promotion by the control plane.
7. **Deep links, and the second domain.** Prove the domain claim on a policy
   suite, which needs no compiler and has a verifier already.

**Steps 1 and 2 are worth doing whatever else is decided.** They are defects in
running code, not features of a proposal.
