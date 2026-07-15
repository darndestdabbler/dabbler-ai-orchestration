# Authoring consult — Copilot CLI 32k argv limit + pause capability (2026-07-14)

> **What this is:** the durable, in-git record of the operator-initiated
> cross-provider design consult that authored Set 104's design and the
> Set 103 pause. Two engines were consulted in parallel via
> `ai_router.query(task_type="architecture")`: **openai:gpt-5-6 ("Sol",
> operator-requested)** and **google:gemini-3-1-pro**. Verdict:
> **ALIGNED on every question.** Combined cost $0.16. Three records in
> `ai_router/consensus-decisions.jsonl` (two raw captures + one
> synthesis, 2026-07-14); gitignored full payloads in
> `ai_router/consensus-decisions/`. The consult prompt carried the
> standard bias-cautions preamble and in-repo verified ground truth
> (transport argv construction, pinned CLI `--help` capture, schema
> status enum, cancel/restore writer semantics, Set 103 state).

## Synthesis (the design Set 104's spec locks)

**Problem 1 — transport.** File-handoff pull is correct; stdin
(undocumented), `--resume` chunking (stateful, premium-request risk),
and `--attachment` (unverified context-vs-instruction semantics) are
rejected. Inline stays primary; switch to handoff when the RENDERED
command line reaches **~24,000 UTF-16 code units** (measure
`subprocess.list2cmdline(argv)` encoded UTF-16 — quoting expansion and
astral chars are otherwise miscounted; same rule on every OS). Payload
goes to a per-request OS-temp UTF-8 (no BOM) file, **closed before
spawn** (Windows lock — both engines flagged independently); the `-p`
bootstrap carries the absolute path in **POSIX forward-slash form**
(Gemini: models mangle backslashes) plus read-completely /
execute-don't-summarize instructions. Integrity: a **random
per-request nonce in a footer that exists only in the file** (never in
argv — what makes the ack non-fakeable); the response must end with the
exact ack line, stripped before return; absence/mismatch ⇒ a new
`handoff-incomplete` error class, **fail-closed, never auto-retried**
(billed; side effects may exist). Honest framing: a gross under-read
detector, not proof of comprehension. Delete the file in `finally` on
every path; **no default retention** (Sol: retention would weaken the
transport's existing `-p` redaction posture; Gemini dissented with
keep-on-failure — Sol's position matches the shipped redaction
discipline and is adopted; retention only under the Set 086
diagnostics toggle). Sol's scope check, kept on the record: this fixes
**argv transport only**, not model context capacity/comprehension of
very large bundles — the longer-term direction remains
manifests/path-aware retrieval.

**Problem 2 — impasse/pause.** UNANIMOUS: no new machinery. Use the
existing blessed writers as the pause:
`session_lifecycle.cancel_session_set(dir, structured-reason)` →
run the fix set → `restore_session_set(dir, reason)` (verified
lossless: `preCancelStatus` round-trip; the D6 drift guard counts only
literal `"in-progress"`). Out-of-session hotfix REJECTED (substantive
code+release ≠ break-glass). **NO first-class `paused` schema enum**
— old routers/extensions validate the status enum and reject unknown
values (cross-version blast radius); document cancel-to-pause as the
supported recipe; revisit two-phase (readers first, writers later)
only if pauses become frequent. Pause legal **only at a session
boundary** (zero in-progress sessions). The reason string is the
contract: blocked-by, objective resume condition, owner, next session.
No cap on paused sets; review paused entries at set selection so none
are forgotten.

**Divergences (all resolved):** threshold measurement (Sol's rendered
UTF-16 measurement adopted over Gemini's raw char count); failure-file
retention (Sol's no-default-retention adopted); ack design (Sol's
file-only random nonce adopted over Gemini's static
`[EOF_INSTRUCTIONS_REACHED]` sentinel, which — being stated in the
bootstrap — a model could echo without reading).

---

## Raw response — openai:gpt-5-6 ("Sol"), model_id gpt-5.6

(9,468 output tokens, $0.1466, 586s, reasoning_effort high)

## Scope check

The immediate questions are correct, but file handoff solves only **argv transport**, not model context capacity or reliable comprehension of hundred-KB bundles. Ship the transport escape hatch now; separately convert verification workflows toward manifests and path-aware retrieval rather than ever-larger monolithic prompts.

## 1a. File handoff

**Recommendation:** Use file handoff as the production fallback.

- Keep one non-interactive Copilot invocation with a short `-p` bootstrap.
- Instruct Copilot to read the file sequentially, completely, before taking any task action.
- Preserve the original composed prompt in the file, apart from an explicit transport-control footer if integrity acknowledgement is implemented.
- Keep the file alive until the child exits and output processing completes.

Do not use:

- **`--resume` chunking:** changes a single request into stateful multi-turn execution, complicates ordering and failure recovery, and may consume additional premium requests.
- **Undocumented stdin:** unsuitable for a deterministic supported transport.
- **`--attachment` yet:** run a focused integration experiment with large UTF-8 `.txt` and `.md` files first. If it demonstrably injects complete text into initial context without truncation, it may eventually be preferable to agentic file reads.

The same invocation means file handoff does not intentionally add a premium request, although tool use may affect latency and token consumption. Verify billing behavior against the pinned CLI.

**Key risk:** Copilot may treat instructions read from a file less reliably than inline instructions. This is why handoff should initially be a fallback rather than replacing the known-good inline path.

## 1b. Threshold design

**Recommendation:** Use inline prompts below a conservative threshold and pull above it.

Do not threshold on Python character count. Build the proposed inline argv first, serialize it using Windows quoting rules, and measure UTF-16 code units:

```text
units = len(subprocess.list2cmdline(argv).encode("utf-16-le")) // 2 + 1
```

Use file handoff when the projected command line reaches approximately **24,000 UTF-16 code units**. Apply the same conservative rule on every OS for predictable behavior and automatic protection from Linux per-argument limits.

Reasons:

- Inline remains the highest-fidelity and lowest-latency path for ordinary calls.
- Always-pull introduces a file-read/tool dependency and under-reading risk into every request.
- A 24,000-unit cap leaves substantial room below Windows' 32,767-unit limit for executable paths, quoting expansion, and future flags.
- Measuring the rendered command handles quotes, backslashes, spaces, and astral Unicode correctly.

Keep the decision in one small helper and test both branches. Do not add a user-configurable threshold initially.

**Key risk:** Two transport paths increase testing slightly, but less than making every request depend on agentic file reading.

## 1c. Fidelity and integrity

**Recommendation:** Add an EOF acknowledgement for pulled requests, but describe it accurately as a gross under-read detector—not proof of comprehension.

Use a random per-request 128-bit nonce placed only in a transport-control footer at EOF. The bootstrap should require Copilot to:

1. Read the file from the beginning through EOF in sequential chunks.
2. Execute the task.
3. Append an exact acknowledgement line containing the nonce.

After parsing Copilot's JSON output:

- Require the acknowledgement as the exact final assistant-content line.
- Strip it before returning the response to the caller.
- Classify absence or mismatch as a specific `handoff-incomplete` failure.
- Never retry automatically; the agent may already have performed side effects.

Also:

- Hash the file locally before spawning and verify it remains unchanged after completion.
- Keep the hash in memory by default; diagnostics need only record handoff mode, byte count, and failure classification.
- Test strict-output tasks because the acknowledgement creates an internal output-envelope requirement.

An EOF nonce proves only that Copilot accessed the footer; it cannot prove every intervening byte was read or retained. Multiple sentinels, reported hashes, or checkpoint tokens remain gameable and add little assurance. True transport-level fidelity requires a supported prompt-file/stdin/verified-attachment mechanism.

**Key risk:** A missing acknowledgement can produce an uncertain failure after tools have already run. Fail closed, but do not imply transactional rollback.

## 1d. File placement and lifecycle

**Recommendation:** Use a secure, unique OS temporary directory per request.

- Use an absolute, short path.
- Write UTF-8 without BOM.
- Flush and close the file before spawning; this is required for reliable Windows access.
- Restrict permissions to the current user where supported.
- Do not pass `--add-dir`; the pinned CLI already grants temp-directory access.
- Keep the directory until process exit, output parsing, and acknowledgement validation finish.
- Delete it in `finally` on success, failure, timeout, and cancellation.

Do not retain prompt files by default. They may contain credentials, source, customer data, or system instructions. Forensics retention should be an explicit debug mode with restricted permissions, a TTL, and a clearly logged retained path.

Do not log the payload or full temporary path in normal diagnostics. Log a random handoff ID and byte length.

**Key risk:** Leaving files after failures would materially weaken the transport's existing prompt-redaction posture.

## 1e. Windows-specific concerns

**Recommendation:** Account for these details:

- The 32,767 limit is for the complete `CreateProcessW` command line in UTF-16 code units, including quoting and the terminating NUL.
- Continue using `shell=False`; never construct a shell command.
- Let `Popen` quote argv. Do not manually quote the path as an argv element.
- Delimit the path clearly inside the bootstrap, preferably using a JSON-escaped string representation.
- Avoid deeply nested temp paths and `\\?\` extended-path syntax; Copilot's file tool may not handle them consistently.
- Close temporary files before child launch because open `NamedTemporaryFile` handles commonly block reopening on Windows.
- `encoding="utf-8"` controls subprocess streams, not argv encoding or prompt-file encoding; set file encoding explicitly.
- Include tests with spaces, quotes, backslashes, non-BMP Unicode, and long executable/temp paths.
- Test cleanup after process timeout and forced termination.

## 2a. Immediate unblock

**Recommendation:** Choose **(i): cancel Set 103 with a structured pause reason, complete the transport-fix set, then restore Set 103**.

Sequence:

1. Confirm Set 103 has no session marked `in-progress`.
2. Call the blessed cancel writer with a reason such as:

   ```text
   paused: blocked_by=Copilot CLI argv limit;
   resume_when=<fix-set> is complete, released to PyPI, and smoke-tested;
   owner=<operator>;
   next_session=2
   ```

3. Verify D6 reports zero active sets.
4. Start and complete the dedicated transport-fix set, including release and a real Windows large-prompt smoke test.
5. Mark the fix set complete.
6. Restore Set 103 using the blessed writer.
7. Verify its file-inferred state is `in-progress` with Session 2 still `not-started`, then rerun D6.

Do not use an out-of-session hotfix here. The precedent covered a coordinated release; this is a substantive code, test, and release change whose failure mode affects the orchestration transport itself.

**Key risk:** Explorer will temporarily describe Set 103 as cancelled. The structured reason and short pause duration make that acceptable.

## 2b. Durable pause capability

**Recommendation:** Do not add a `paused` enum yet. Document `cancel("paused: ...")` plus `restore(...)` as the supported suspension recipe.

A new enum currently has disproportionate migration risk:

- Older routers and extensions reject unknown values.
- Writers could not safely emit `paused` until consumer repositories upgraded.
- Schema, validators, drift guards, CLI, Explorer, and compatibility behavior would all need coordinated changes.

The semantic mismatch and provenance entries are real but preferable to a compatibility-breaking status for an apparently rare operation. The provenance accumulation is also useful audit history.

Reconsider a first-class status if pauses become frequent, long-lived, or operationally difficult to discover. Introduce it in two phases:

1. Release readers, validators, guards, and UI that understand `paused` and treat it as non-active.
2. Only after the compatibility floor has moved, release writers that emit it.

**Key risk:** Automation that interprets every cancellation as permanent could mishandle a paused set. Confirm no destructive cancellation behavior exists; the described writers appear state/provenance-only.

## 2c. Pause guard rails

**Recommendation:** Permit routine pause only at a session boundary.

A pause recipe must reject or require explicit emergency override when any session is `in-progress`. Mid-session suspension has ambiguous partial outputs and recovery semantics; use actual cancellation and recovery procedures for emergencies.

Every pause reason should record:

- Blocking dependency or issue.
- Objective resume condition.
- Responsible owner.
- Intended next session.
- Related fix set/release where applicable.
- Timestamp, supplied by provenance machinery.

Allow multiple paused sets. They are non-active and therefore should not count against D6. An arbitrary numeric cap does not improve correctness. If first-class pause is later added, Explorer and CI should inventory paused sets and warn on missing owners or stale resume conditions rather than fail merely because several exist.

**Key risk:** Cancelled-as-paused sets can be forgotten. Require a tracking issue or dependency link and review paused entries during normal set selection.

## Minimal-diff design to ship first

1. Preserve the existing inline transport.
2. Add one helper that switches to handoff when rendered argv reaches 24,000 UTF-16 units.
3. Create a secure temporary UTF-8 prompt file and short bootstrap.
4. Add a random EOF acknowledgement, validation, stripping, and `handoff-incomplete` classification.
5. Clean up in `finally`; retain files only under explicit debug configuration.
6. Add fake-spawner tests for:
   - Inline behavior below threshold.
   - Handoff above threshold.
   - File existence and exact payload while spawning.
   - Quotes, backslashes, spaces, and non-BMP Unicode.
   - Valid and missing acknowledgements.
   - Cleanup after success, spawn failure, timeout, and parsing failure.
   - Absence of prompt content from argv and diagnostics.
7. Run one real pinned-Copilot integration test with a payload well above 32 KiB containing distinct beginning, middle, and EOF facts.
8. Pause Set 103 using cancel/restore; make no schema or Explorer changes in this fix.

---

## Raw response — google:gemini-3-1-pro, model_id gemini-3.1-pro-preview

(1,453 output tokens, $0.0170, 30s, thinking_level HIGH)

### Scope Challenge & Bias Check
The questions posed are exactly the right ones. The operator's simplicity-first bias is correct here: do not modify the v4 schema to add a `paused` state when existing primitives (`cancel` + `restore`) fulfill the requirement. On the transport side, attempting to bypass OS limits via undocumented CLI behavior (`stdin`) is brittle; explicitly orchestrating a file-read via the agent's tool access is the most robust path forward.

---

### Problem 1: Transport Limits (32k argv cap)

**1a. File-handoff vs alternatives:**
File-handoff via `-p` bootstrap is the correct, most deterministic fix.
*   `--attachment` semantics treat files as RAG/context data, not authoritative system instructions, risking instruction-ignore.
*   `stdin` is undocumented and prone to silent breakage across CLI updates.
*   **Recommendation:** Pass a bootstrap `-p` prompt: `"Your exact task instructions are in the file at <PATH>. Use your file-read tool to read it completely. Execute the instructions. Do not summarize them."`

**1b. Threshold vs Always-pull:**
**Threshold.** Set `N = 24,000` characters (leaves ample headroom for 32,767 Windows limit and other argv flags).
*   *Why:* Copilot CLI is an agent. A file-read requires a tool-call round trip (Thought → Tool Call → Read → Respond). Always-pull adds high latency and token cost to *every* small request. Keep inline as primary for speed; fallback to pull for size.

**1c. Fidelity/Integrity Safeguards:**
**Necessary.** LLMs operating CLI tools frequently truncate long file reads or skim.
*   *Recommendation:* Append a sentinel to the temp file: `[EOF_INSTRUCTIONS_REACHED]`. Add to the `-p` bootstrap: `"You must read until you see [EOF_INSTRUCTIONS_REACHED]."`

**1d. File placement & lifecycle:**
**OS temp dir.** Use the system temp directory since the CLI auto-allows it.
*   *Lifecycle:* Write the file → **Close it** (critical on Windows, as `CreateProcessW` cannot read a file still locked by Python's `NamedTemporaryFile`) → Execute CLI → Delete file on success. On CLI failure, leave the file and log its path for forensics.
*   *Encoding:* Strictly `utf-8`.

**1e. Windows-specifics:**
*   **Path separators:** The CLI model may mangle backslashes `\` in Windows paths when parsing the `-p` string. Convert the absolute path to POSIX style (forward slashes) before inserting into the bootstrap prompt: `Path(temp_file).as_posix()`.

#### Minimal-Diff Design (Problem 1)
```python
import os
import tempfile
from pathlib import Path
import subprocess

# Inside cli_transport dispatch:
PROMPT_THRESHOLD = 24000
prompt_text = build_full_prompt()

if len(prompt_text) > PROMPT_THRESHOLD:
    # Windows requires delete=False to close and let another process read
    fd, temp_path = tempfile.mkstemp(suffix=".txt", text=True)
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(prompt_text)
        f.write("\n\n[EOF_INSTRUCTIONS_REACHED]")

    safe_path = Path(temp_path).as_posix()
    bootstrap = (
        f"Your authoritative task instructions are in the file at {safe_path}. "
        "Use your file-read tool to read it completely. You must read until you "
        "see [EOF_INSTRUCTIONS_REACHED]. Execute the instructions exactly. "
        "Do not summarize."
    )
    argv = [copilot, "-p", bootstrap, ...]
else:
    temp_path = None
    argv = [copilot, "-p", prompt_text, ...]

try:
    # Run subprocess
    ...
finally:
    if success and temp_path and os.path.exists(temp_path):
        os.remove(temp_path)
```

---

### Problem 2: The Impasse & Pausing

**2a. Immediate Unblock:**
**(i) Cancel with reason, run fix, restore.**
*   *Why:* Respects the D6 `one-active-set` rule perfectly. Leaves a permanent, accurate provenance trail in Set 103's history. Requires zero new code. Out-of-session hotfixes (ii) should be reserved for literal break-glass emergencies (e.g., PyPI credential rotation), not feature additions.

**2b. Durable Capability:**
**Documented recipe (Cancel + Restore). Do not add a `paused` enum.**
*   *Why:* Adding a `paused` state to a v4 schema creates a massive backward-compatibility blast radius. Older VS Code extensions and router versions will crash or reject the state file.
*   *Semantic honesty:* A set that is not being worked on *is* canceled for the present moment. The provenance log (`cancel(reason: "paused: blocking on Set 104")`) provides full transparency.

**2c. Guard Rails:**
*   **Boundary only:** Pausing (canceling with intent to restore) must only be allowed when zero sessions are `in-progress`. A mid-session pause leaves dangling LLM context and broken state machine expectations.
*   **Tracking:** The `reason` string must act as the contract. Standardize the convention: `Paused: Blocked by <Set ID> - <Reason>`.
*   **Limit:** No hard technical limit on canceled/paused sets is needed, as they do not violate D6.

#### Minimal-Diff Design (Problem 2)
1. **Operator Action:** Run `session_lifecycle.cancel_session_set("sets/103", "Paused: Blocked by Set 104 (CLI 32k transport limit fix)")`.
2. **Operator Action:** Create Set 104, implement the Problem 1 Minimal-Diff Design, release `ai_router` to PyPI, mark 104 complete.
3. **Operator Action:** Run `session_lifecycle.restore_session_set("sets/103", "Dependency Set 104 complete")`.
4. **Docs Action:** Add a paragraph to the orchestration playbook defining the "Cancel-to-Pause" convention.
