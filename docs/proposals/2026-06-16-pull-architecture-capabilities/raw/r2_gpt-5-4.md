# r2 -- gpt-5-4

> model_used=None cost=$0.20679 chars=13356

## Framing correction

The binary in the Round-1 set is wrong. The real decision is not:

- read-only critic, or
- arbitrary agent-authored execution.

The missing middle is **constrained evidence generation**: trusted, replayable probe templates with structured inputs. That is the narrowest lane that closes the manual/automated gap without blowing up the threat model.

## 1. Adversarial critique of all three

### Opus

- **Issue →** Overcorrects from “unsafe execution” to “this was really just a floor-authoring failure.”  
  **Location →** “both missed bugs are textbook probeable falsifier-class defects… not evidence the residual needs an execute-empowered agent.”  
  **Fix →** Treat the incident as a **dual failure**: the floor missed two probeable classes, and the automated ceiling had no safe way to generate new execution evidence. Running only existing falsifiers does not explain or close the observed manual/automated gap.

- **Issue →** The first proposed capability is too weak for the motivating bugs. Triggering only declared falsifiers or a whitelisted suite subset will still miss **novel but local** edge cases.  
  **Location →** Capabilities table, first row; prioritized list item 1.  
  **Fix →** Add a middle lane now: **operator-authored probe templates with structured args**. Example classes: malformed bytes, bad paths, permission errors, truncated artifacts, empty manifests.

- **Issue →** “Falsifier-or-it-didn’t-happen” is too absolutist for ceiling output. It is right for promotion, not for all useful findings.  
  **Location →** “The ceiling’s highest-value output is… a falsifier you should add to the floor.”  
  **Fix →** Separate:  
  1. **evidence-backed defect finding**, and  
  2. **candidate floor promotion**.  
  Not every valid executed finding deserves permanent floor admission.

- **Issue →** Re-run-on-close-out is directionally right but under-specified for stateful or flaky probes.  
  **Location →** “close-out re-runs every EXECUTED finding.”  
  **Fix →** Add replay classes:  
  - `REPLAYED_PRISTINE`  
  - `OBSERVED_NONREPLAYED`  
  - `STATIC`  
  Only the first gets highest trust. The second is diagnostic, not gating.

- **Issue →** Ratchet is necessary, but no admission control means floor bloat.  
  **Location →** Architecture section, “promotion path from ceiling findings back into the floor.”  
  **Fix →** Promotion criteria must include: stable, cheap, deterministic, owner, and clear defect-class value. Otherwise you accumulate brittle one-off tests.

---

### GPT-5.4

- **Issue →** “Allowlisted trusted commands” is safer than arbitrary shell, but the proposal overstates what that buys. Trusted entrypoints can still transitively execute untrusted plugin/config/build behavior.  
  **Location →** `run_allowlisted_cmd(cmd_id, args)` and `run_test_subset(selector)`.  
  **Fix →** Tighten eligibility: commands must run in a **known runner image**, with **env allowlist**, **secret stripping**, and where possible **plugin freezing/disablement**. If those controls do not exist, do not imply stronger containment than “trusted local command in disposable checkout.”

- **Issue →** `run_test_subset(selector)` is hand-wavy as a safe control surface. In Python, selectors, discovery, markers, and import side effects are messy.  
  **Location →** `run_test_subset(selector)` guardrail.  
  **Fix →** Start with **predeclared test IDs / manifests**, not model-supplied selector grammar. Expand later only if selector behavior is measured and stable.

- **Issue →** “changed-symbol map” is much less deterministic than the proposal implies in a dynamic language.  
  **Location →** `get_diff(base_ref, head_ref)` description.  
  **Fix →** Prefer **raw diff + changed paths + optional offline-produced import graph**. Do not present symbol mapping as authoritative.

- **Issue →** The proposal makes a cost argument about provider count without evidence.  
  **Location →** “One well-tooled provider… will outperform two read-only providers.”  
  **Fix →** Make that a hypothesis, not a design truth. Decide provider count from a **measured recall/precision benchmark**, not intuition.

- **Issue →** Missing a hard replacement bar before demoting manual verification.  
  **Location →** Prioritized additions.  
  **Fix →** Add a release policy: automated pull does not replace manual dogfood until it clears a **seeded + holdout defect benchmark** and shows stable replay integrity.

- **Issue →** “Generalize Mode-2 PULL to code generation/refactors” is scope creep relative to the actual failure.  
  **Location →** “Should Mode-2 PULL generalize beyond verification?”  
  **Fix →** Defer. First prove the verification loop is trustworthy and measurably better.

---

### Gemini-Pro

- **Issue →** `run_scratchpad(code, language)` in the current cage is unsafe. It is arbitrary code execution with a nicer API, and it violates the cage’s stated threat model.  
  **Location →** Capabilities item 3.  
  **Fix →** Do **not** ship this in the current cage. Replace it with **operator-authored probe templates** until a real OS sandbox exists.

- **Issue →** The guardrails rely on controls the described system does not currently have.  
  **Location →** `run_scratchpad` guardrail, “must have no network access.”  
  **Fix →** Distinguish present controls from desired ones. Do not base a safety case on nonexistent isolation.

- **Issue →** “The agent cannot influence the execution environment beyond providing the source code” is false. The source code is the execution environment, functionally.  
  **Location →** `run_scratchpad` guardrail.  
  **Fix →** Remove the claim. If the model authors code, you need OS isolation, not wording.

- **Issue →** Evidence tags alone are insufficient. Raw logs attached once do not prevent fabricated or non-replayable “reproductions.”  
  **Location →** “Reproduce-then-Claim” Evidence Tagging.  
  **Fix →** Require **machine-captured transcript + pristine replay** before a claim can be tagged `REPRODUCED`.

- **Issue →** No immutable-target discipline. A scratchpad or test run could mutate the checkout and then “discover” a bug it created.  
  **Location →** `run_existing_test` / `run_scratchpad`.  
  **Fix →** Fresh checkout per execution, read-only source-under-test, separate scratch area for any authored artifacts.

- **Issue →** “No major restructuring is needed” ignores the compounding failure mode. Without a promotion loop and benchmark, the system just rediscovers misses.  
  **Location →** Architecture section.  
  **Fix →** Make **ceiling→floor promotion** and **critic evaluation** first-class, not optional hygiene.

---

## 2. Real disagreements a human must decide

### A. Can model-authored code run before a real OS sandbox exists?
- **Gemini-Pro:** effectively yes.
- **Opus / GPT-5.4:** no.
- **My view:** **No.** This is the clearest hard line. The current cage is for trusted commands, not adversarial or arbitrary code.

### B. What does the 0.22.0 miss actually prove?
- **Opus:** mostly floor incompleteness.
- **GPT-5.4 / Gemini-Pro:** mostly ceiling capability starvation.
- **My view:** **Both**, but in different time horizons.  
  - Immediate cause of this release miss: **capability-starved automated ceiling**.  
  - Recurring systemic cause: **no ratchet turning reproduced probeable bugs into floor coverage**.

### C. What should the ceiling primarily produce?
- **Opus:** candidate falsifiers / floor hardening.
- **GPT-5.4:** evidence-backed findings.
- **Gemini-Pro:** critique findings with evidence tags.
- **My view:** **Evidence-backed findings first; mandatory promotion for reproduced probeable bugs second.** If you force everything to become a falsifier, you get floor bloat. If you never promote, you pay agent prices forever.

### D. What is the role of cross-provider review after execution exists?
- **GPT-5.4:** mostly audit evidence / high-severity claims.
- **Opus:** less explicit demotion.
- **Gemini-Pro:** does not really resolve it.
- **My view:** **Execution beats extra blind readers.** Use the second provider selectively: severe findings, disputed static claims, or audit of evidence interpretation.

### E. Is “run existing tests” enough as the new execution lane?
- **Opus / GPT-5.4:** mostly yes as the first step.
- **Gemini-Pro:** wants arbitrary scratchpad code.
- **My view:** **No.** Existing tests are necessary but insufficient. You need a middle lane for **new structured probes** without arbitrary code exec.

---

## 3. Missing from all three

### Missing capability: a constrained probe-template lane

All three proposals jump between:
- rerun existing trusted commands, and
- run arbitrary model-authored code.

That is the wrong ladder. The missing capability is:

- **operator-authored, versioned probe templates**
- **typed, validated JSON arguments**
- **servant-created fixtures/artifacts**
- **fresh pinned checkout**
- **raw transcript + replay**

Why this matters:

- It would catch the exact class of defects that motivated this review:
  - bad parent directory handling
  - invalid UTF-8 artifact ingestion
- It stays inside the current trusted-command model because the executable harness is human-authored.
- It sharply reduces pressure to ship arbitrary authored-code execution before you have a real sandbox.

### Missing risk: two evidence standards

All three focus on improving automated execution, but none explicitly fix the fact that **manual terminal runs and automated runs currently do not share one evidence protocol**.

That creates two problems:
- bad comparability of “manual beat automated”
- a trust double standard, where a human-observed terminal session can mint stronger claims than automated evidence

Fix this by requiring the same artifact/replay contract for **any** `REPRODUCED` claim, human- or model-initiated.

---

## 4. Synthesis: what I would actually ship first

### 1. One execution-evidence protocol for both manual and automated critics
- **Capability →** A single servant-backed artifact bundle for any executed claim.
- **Guardrail →** A claim can be marked `REPRODUCED` only if the orchestrator captures:
  - pinned ref
  - exact command/template ID + args
  - fresh/pristine checkout status
  - raw stdout/stderr
  - exit code
  - artifact hashes
  - replay result on a second pristine checkout
- **Why first →** More execution without this just increases the bluff surface.

### 2. Wire trusted-command triggering into `pull_critique.py`
- **Capability →** Automated critic can trigger operator-authored command IDs: declared falsifiers, selected validation commands, small trusted test entrypoints.
- **Guardrail →**
  - no free-form shell
  - no model-authored argv
  - fresh checkout per run
  - stripped env / no secrets
  - hard time and output caps
  - only commands already accepted under current trust policy
- **Why second →** This closes the obvious capability starvation immediately.

### 3. Add raw diff + bounded multi-turn probing
- **Capability →** Critic gets changed paths/raw diff and can do a small read→run→read loop.
- **Guardrail →**
  - raw servant outputs only
  - bounded turns
  - bounded executions
  - no servant summarization
- **Why third →** The manual advantage was partly execution, partly persistence.

### 4. Add probe templates with structured inputs
- **Capability →** The agent can ask the servant to run trusted probe harnesses like:
  - “call function X with bytes artifact Y”
  - “create temp path fixture with property Z”
  - “invoke validator on malformed manifest”
- **Guardrail →**
  - templates are human-authored and reviewed
  - args are typed and validated
  - repo snapshot is immutable
  - scratch data lives separately
  - every run is replayable
- **Why fourth →** This is the safest path to finding new local edge-case bugs before a real sandbox exists.

### 5. Make reproduced probeable bugs pay rent: ceiling → floor
- **Capability →** Formal promotion path from executed ceiling finding to floor candidate.
- **Guardrail →**
  - mandatory for reproduced probeable defects, or explicit waiver
  - fail-before / pass-after proof
  - owner and maintenance acceptance
- **Why fifth →** Otherwise you buy the same discovery repeatedly.

### 6. Add a measured replacement gate
- **Capability →** Benchmark automated pull against seeded defects plus a holdout set of recent real misses.
- **Guardrail →**
  - track recall, precision, replay success, and false `REPRODUCED` rate
  - manual path is not demoted until thresholds are met
- **Why sixth →** Design arguments should lose to scoreboards.

### 7. Only then build real authored-probe execution
- **Capability →** Model-authored repro scripts and candidate falsifiers.
- **Guardrail →**
  - real OS sandbox
  - no network
  - no secrets
  - read-only repo snapshot
  - separate writable scratch
  - resource caps
  - raw artifact preservation
- **Why last →** Useful, but only after the safer middle lane is exhausted.

---

## 5. The one thing I would refuse to do

- **Refuse →** Execute model-authored code or shell strings inside the current `run_test` cage.

Reason: the current cage is explicitly a convenience isolation boundary for **trusted commands**, not a sandbox for arbitrary code. Shipping that anyway would convert the exact trust-preservation requirement into a lie.
