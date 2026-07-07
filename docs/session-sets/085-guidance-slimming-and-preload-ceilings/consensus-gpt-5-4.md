# Raw consult response — gpt-5-4 (2026-07-07)

> Captured verbatim from `ai_router.query("gpt-5-4", …,
> task_type="analysis")` console output. Prompt: see
> `consensus-synthesis.md` (neutral framing, measured facts, invitation
> to disagree). Transcription note: the capturing console was cp1252;
> some Unicode punctuation (em dashes, curly quotes) in the original
> response was lost in transit and appears as `�` below. Content is
> otherwise unedited.

## Bottom line

Yes, **~65k tokens of always-loaded process prose is a real cost**. In your setup, it is **past the point of diminishing returns**.

The reason is not just token price or latency. The bigger problem is **behavioral shaping**: you are telling the model, at high volume and every session, that process compliance is as important as or more important than task progress. The observed �wheel-spinning� is exactly what I would expect from that design.

Given that you already have **strong executable controls**�CLI gates, schema validation, writer-discipline checks, automated tests, and mandatory second-engine verification�you are likely **overpaying in prose to prevent mistakes that your system can already catch cheaply**.

My judgment:

- **Keep a short always-loaded �constitution.�**
- **Move most specifics into gates or retrieval.**
- **Default to allowing cheap mistakes that are caught fast and repaired idempotently.**
- **Target ~8k�12k always-loaded tokens**, with **15k as a hard ceiling**.

---

## 1. Is ~65k tokens of always-loaded process context a real cost?

### Judgment

**Yes. It is a meaningful cost to reasoning quality, not negligible.**

Not because the model literally �runs out of intelligence,� but because large always-loaded process context creates several concrete failure modes.

### Mechanisms

#### 1. Attention competition

Even in large-context models, 65k tokens is not free. It competes with:

- repo code
- diffs
- logs
- failing tests
- task-specific instructions
- intermediate findings

The model has to decide what matters. If a huge block of normative process text is always present, it becomes a strong attractor for attention.

#### 2. Objective distortion

Always-loaded prose does more than inform; it **defines what the model thinks success looks like**.

If the prompt environment repeatedly says:

- follow this workflow
- respect these state rules
- close out exactly this way
- capture lessons
- verify against these process constraints

then the model learns that **being procedurally defensible** is a primary objective. That can crowd out:

- fast hypothesis generation
- direct repo inspection
- decisive implementation
- accepting a small correctable miss and moving on

This is likely the main cause of �spinning its wheels.�

#### 3. Reduced working headroom for task material

If your context window is 128k or 200k, 65k is still a large fixed reservation. That reduces room for:

- larger code excerpts
- broader architectural context
- longer tool outputs
- iterative debugging traces

The effect is worse on tasks that require broad repo reasoning or long debugging chains.

#### 4. Lost-in-the-middle / salience problems

Long contexts are not uniformly handled. Important task details can become less salient when surrounded by large amounts of policy prose. This is especially bad when:

- the task is ambiguous
- the model must compare multiple sources
- the key repo fact is buried in the middle of the total context

#### 5. Redundant prevention layers create hesitation

You already have machine-enforced controls:

- close-out CLI
- schema validation
- writer-discipline checks
- automated tests
- second-engine verification

If prose also tries to prevent the same failures, the model gets a double message:

- �Do not make this mistake�
- �Also there is a gate if you do�

That often produces overchecking, not better output.

#### 6. Verification-loop amplification

The biggest drain may not be the 65k by itself. It may be the combination of:

- large compliance-heavy preload
- mandatory second-engine verification
- repeated corrective rounds

That system teaches the orchestrating model that **avoiding verifier criticism** is central. A recent 10-round close is a strong sign that the process has become a partial end in itself.

### How big is the cost?

I would call it a **moderate-to-large quality tax**, not a trivial one.

I would expect the tax to show up as:

- slower time to first substantive action
- more meta-reasoning before task work
- more hedging
- more verification churn
- less efficient use of tool outputs
- worse performance on ambiguous/debugging tasks than on routine tasks

I would **not** try to assign a fake precision number like �23% less reasoning.� But I would treat this as a **first-order operational problem**, not a rounding error.

### Important nuance

If someone says �65k in a large context window should be fine,� I disagree. The issue is **not merely whether it fits**. The issue is:

- what the model attends to
- how the model ranks goals
- what it spends early turns doing
- how much task context it can keep salient

Fit is not the same as negligible.

---

## 2. What should decide always-loaded vs gate vs on-demand vs delete?

Use a strict admission test. A rule should earn always-loaded space only if it is:

1. **High impact if missed**
2. **Hard to detect automatically**
3. **Hard or expensive to repair later**
4. **Needed before any meaningful action**
5. **Applicable to most sessions**
6. **Short enough to express compactly**
7. **Backed by recent evidence, not just historical anxiety**

If it fails those tests, demote it.

### Decision framework

| Destination | Put a rule here when� | Typical examples |
|---|---|---|
| **Always-loaded context** | Missing it causes expensive harm; detection is weak; repair is hard; it applies almost every session; it must shape behavior before action | irreversible-action approvals, source-of-truth rules, escalation rules, �never bypass state writer,� repo invariants not machine-checkable |
| **Executable gate** | It is objective, machine-checkable, and cheap to validate repeatedly | schema conformance, required fields, close-out conditions, formatting, test passing, state-write discipline |
| **On-demand reference** | It is long, detailed, stage-specific, rare, or example-heavy | authoring guide details, full schema docs, rare close-out cases, archived lessons |
| **Delete** | It duplicates another control, is stale, prevents only cheap errors, or has no demonstrated value | old lessons with no recent hits, prose restating gate logic, low-frequency ceremonial instructions |

### Concrete criteria

#### A rule belongs in always-loaded context only if most of these are true

- Applies to **>50% of sessions**
- Violation is **not already caught reliably** by existing automation
- Post-hoc repair cost is **high**
- Error can cause **silent corruption, unsafe action, or operator confusion**
- The rule can be stated in **<=150 tokens**
- There is a **recent measured failure mode** it addresses

If not, it should not live in the preload.

#### A rule should become a gate if

- A machine can check it deterministically
- The failure signal can be surfaced immediately
- The fix is mechanical or at least local
- It recurs often enough to justify automation

#### A rule should move to on-demand retrieval if

- It is only relevant in specific phases
- It requires examples or extended explanation
- It is rare but still useful
- The model only needs it after it has already identified the applicable case

#### A rule should be deleted if

- It duplicates another rule or tool
- It is solving a problem that no longer occurs
- The read tax exceeds the repair cost
- Nobody can point to a recent incident it prevented

### Apply this especially hard to lessons-learned

Your lifecycle controls are good, but they are not enough if the active lesson set still consumes thousands of always-loaded tokens.

A lesson should not stay hot just because it once mattered. It should have to re-earn preload status with:

- recent recurrence
- meaningful harm
- poor detectability
- inability to encode as a gate

Otherwise it belongs in searchable archive or should be deleted.

---

## 3. Is �allow easily-detected, easily-corrected mistakes� sound?

### Judgment

**Yes. In AI-led workflows, it should be the default engineering principle.**

This is how good software systems are usually built:

- compilers catch syntax errors
- linters catch style and hygiene issues
- tests catch regressions
- type systems catch interface mismatches
- transactions and idempotence make recovery cheap

AI agents should be treated similarly. Do **not** force the model to perfectly remember every preventable rule in prose if a tool can catch it more reliably.

### Why this works

A model is stochastic and memoryless across sessions. Prose prevention is brittle. Fast feedback loops are stronger than instruction repetition.

If a mistake is:

- cheap
- obvious
- isolated
- mechanically recoverable

then it is usually better to let the system catch it than to spend permanent context budget trying to prevent it every time.

### Where this principle is strong

Use it aggressively for:

- formatting and structure mistakes
- schema violations
- close-out sequencing
- missing required metadata
- incorrect file-write path
- tests not run yet
- state-file authoring mistakes
- template compliance
- routine documentation conventions

These are exactly the kinds of failures that gates and tooling should own.

### Limits

Do **not** rely on �we�ll catch it later� when the failure is:

#### 1. Irreversible or externally visible

- destructive commands
- deployments
- data migrations
- sending messages externally
- publishing artifacts
- deleting or overwriting important state

#### 2. Security, privacy, or compliance sensitive

- secrets exposure
- access control mistakes
- policy/regulatory breaches

#### 3. Silently corrupting

- incorrect state that still validates
- misleading summaries
- wrong-but-plausible conclusions
- architecture misunderstandings that propagate downstream

#### 4. Expensive to unwind

- broad refactors based on wrong assumptions
- cascading edits
- operator trust damage
- multi-round verifier disputes

#### 5. Poorly detectable

If detection is probabilistic, subjective, or delayed, then accepting the mistake is not cheap.

### Important correction to the principle

The principle is not:

> �Let the model make mistakes.�

It is:

> �Use the cheapest reliable control at the latest safe point.�

Sometimes that is a gate.
Sometimes that is a hard precondition.
Sometimes that is a short always-loaded warning.

### One more limit: repeated cheap mistakes

If the same �cheap� mistake happens constantly and burns verifier rounds every day, stop treating it as harmless noise.

Then the right fix is usually:

- add or improve a gate, or
- add a **one-line** always-loaded reminder

The wrong fix is a 900-token lesson.

---

## 4. What I would cut first, what I would never cut, and target size

## What I would cut first

### 1. Close-out reference (~8.5k) � cut aggressively

You already have:

- a close-out CLI
- gate checks
- idempotent writes

That means the long prose reference is mostly redundant as preload.

**Keep:** a short checklist:

- when to run the CLI
- what failures mean
- how to recover
- when to escalate

**Move the rest:** on-demand.

---

### 2. State-file schema (~9k) � remove from always-loaded

Raw schema docs should not live in preload if you already have:

- JSON schema validation
- writer-discipline checks
- a sanctioned writer path

**Keep in preload:** only semantic rules the model must understand before acting, such as:

- never bypass the writer
- understand what the state file is for
- know which fields matter conceptually

**Do not preload:** full structural detail.

That belongs to tools and retrieval.

---

### 3. Authoring guide (~6.5k) � demote to on-demand/templates

Long authoring guidance is rarely worth global preload unless every session produces the same artifact format.

**Keep:** very short universal style constraints, if any.

**Move:** examples, detailed formatting, specialized artifact rules, edge cases.

Better yet, encode them into:

- templates
- generators
- validators
- reviewer prompts

---

### 4. Lessons-learned (~7.5k) � cut to a small active set

This is the most obvious place to overfit to historical pain.

Your lifecycle discipline is good, but the active preload is still too large.

**Keep only:**

- lessons tied to recent repeated failures
- lessons for high-cost, hard-to-detect errors
- lessons that cannot be turned into gates

**Target:** **~1k�2k max** of active lessons.
Everything else should be searchable or archived.

---

### 5. Workflow procedure (~27k) � compress into an operational checklist

A human-readable full procedure is not the same thing as a good model preload.

The model should not read a full manual every session. It should read a short operational version.

**Keep in preload:** phase order, decision points, escalation rules, completion rules.

**Move out:** narrative explanation, examples, rationale, rare branches, historical context.

**Target preload form:** **~2k�4k**, not 27k.

---

### 6. Project guidance (~2.5k) � probably keep most, but compress if fluffy

This is the category I would cut least aggressively if it contains repo-specific facts not inferable from code.

Still, it should be sharp and compact.

---

## What I would never cut

From the **always-loaded prose**, I would preserve a small core:

### 1. Source-of-truth and conflict-resolution rules

The model needs to know:

- what to trust when docs and repo disagree
- when to inspect reality instead of relying on prose
- when to ask the operator

This is foundational and not fully machine-checkable.

### 2. State-mutation discipline principle

Even if the schema is removed from preload, the model should always know:

- sanctioned write path only
- no manual bypass
- how state changes are supposed to happen conceptually

This matters before action.

### 3. Irreversible-action approval rules

Anything involving:

- destructive operations
- external side effects
- risky state changes
- publication/deployment equivalents

should stay explicit and short.

### 4. Definition of done

The model should always know:

- what constitutes a completed session
- when to stop
- when to escalate
- what minimum evidence is required

### 5. A few repo-specific invariants

Only those that are:

- genuinely important
- not obvious from code
- not easily testable

### 6. Recovery/escalation rules

The model needs a short answer to:

- what to do when a gate fails
- what to do when instructions conflict
- when repeated retries should stop

---

## Rough target size

**Target always-loaded corpus: 8k�12k tokens.**
**Hard ceiling: 15k.**

That is enough for a compact operating constitution without turning every session into a policy recitation.

A reasonable split:

- **2k�3k**: workflow constitution / phase checklist
- **1k�2k**: repo-specific invariants and project guidance
- **1k�2k**: active lessons only
- **0.5k�1k**: close-out checklist
- **0.5k�1k**: recovery / escalation rules
- **0.5k�1k**: tool usage summary / critical constraints

Given your existing gates, I would push toward the low end.

---

## Concrete recommendations

### 1. Replace the preload corpus with a two-tier design

#### Always-loaded
A compact constitution only:

- priorities
- invariants
- approvals
- completion contract
- recovery rules

#### On-demand
Everything else:

- full workflow manual
- full schema docs
- full authoring guide
- archived lessons
- long close-out reference

---

### 2. Stop preloading prose that duplicates executable enforcement

If a rule is already enforced by:

- CLI
- schema validator
- writer-discipline checker
- tests

then the preload should mention it only at a principle level, if at all.

---

### 3. Make lessons compete for scarce preload space

Add a rule: a lesson remains always-loaded only if it has:

- recent recurrence
- high cost
- weak detectability
- no better tooling equivalent

Everything else moves out.

---

### 4. Shorten verifier-facing process expectations too

If the second AI verifier is also inheriting too much prose, it will produce process-heavy critiques and prolong closure.

The verifier should focus on:

- diff quality
- test evidence
- objective gate outcomes
- actual task fulfillment

not full re-litigation of the manual.

---

### 5. Measure before and after

Do not argue this abstractly. Run an A/B.

Track:

- time to first substantive repo action
- total tokens before first task output
- verification rounds per session
- gate failures per session
- operator interventions
- post-close regressions
- session completion time

Alternate:

- current 65k preload
- slim 8k�12k preload

for a fixed sample.

If slim context reduces wheel-spinning and verifier rounds without materially increasing expensive failures, the case is settled.

---

## Final judgment

Your framework likely has **too much always-loaded prose for the amount of executable control it already has**.

The current design is optimized too heavily for **preventing remembered mistakes through repeated instruction**, when your tooling already supports a better model: **allow cheap, detectable, repairable mistakes and catch them mechanically**.

That principle is sound here, with the standard limits around:

- irreversibility
- security/compliance
- silent corruption
- expensive rework
- poor detectability

If I had to act immediately, I would:

1. cut close-out reference from preload
2. remove raw schema docs from preload
3. demote most authoring guidance
4. reduce active lessons to a strict small set
5. compress the workflow manual into a short constitution

And I would aim for **~10k tokens always loaded**, not 65k.
