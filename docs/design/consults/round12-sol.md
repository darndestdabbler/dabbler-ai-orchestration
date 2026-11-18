# Design consult, round 12: Sol on the wall without hooks -- the scope handed over once, the CLI's own permissions, and nothing else

model_name: gpt-5-6-sol
model_id: gpt-5.6-sol
provider: openai
tokens: 3989 in / 13257 out
elapsed: 255.221s  truncated: false (stop_reason: end_turn)

---

# Q1 — Sufficiency

## Soundness

The proposed combination is sufficient for **write isolation**, provided the vendor rules actually work. The scope is already delivered on the first `step` and available through `dabbler session scope` (`schemas/driver-instruction.schema.json`, `drive.ts`, `session.ts`, `cli/session.ts`). The framework also already receives reported paths and diffs the tree, so it can enforce the same scope deterministically at `session report` without a hook (brief item 6).

It does not provide hard read blackboxing. That is acceptable only because priority 4 ranks below avoiding impasses, human decisions, and complexity.

## Risk

| Priority | Failure I would bet on |
|---|---|
| 1. Never an impasse | **ASSUMPTION:** a genuinely wrong impact plan repeatedly asks `persister` to modify `model` implementation and reaches the three-refusals stop from `AGENTS.md`. An accidental edit is not an impasse: it is reverted and the next report can pass. |
| 2. No human decisions | **ASSUMPTION:** an unclear rejection causes the AI to ask the developer whether it may widen scope. The rejection must instead say exactly which module owns the path and that implementation work belongs in a separate module session. |
| 3. Simple | **ASSUMPTION:** checkout-wide permission files become stale after a crash or conflict with another chat. Claude’s `.claude/settings.local.json` is not process-scoped; the current Stop hook demonstrates the danger of repository-scoped state (`bootstrap/index.ts` ~320, `session.ts` ~2522). |
| 4. Blackboxing | **ASSUMPTION:** an engine reads `model` implementation and imitates an internal design even though it cannot establish a `ProjectReference`; the brief states that the supported seam is `PackageReference`, never `ProjectReference`. |

**ASSUMPTION:** in the first three months, customers would notice only one benefit from the round-11 machinery: a pre-hook could prevent an accidental sibling edit before it occurs. Transcript scanning, canaries, coverage attestation, and self-grants are operational machinery rather than visible product value. No usage evidence for them is provided in this brief.

## Recommendation

Ship **scope first + report-time refusal + close backstop**. Do not build two static-permission writers yet. Add a Copilot per-process deny layer later only if the probes in Q2 prove that it blocks directories reliably without persistent state.

For a one-module solution, emit no module wall and preserve current behavior, consistent with the existing rule that no `policy.json` is written for a one-module shape (`packages/router/src/policy.ts`, brief item 2).

---

# Q2 — The CLI’s own permissions

The actual `codeRoots` are not in the brief. Therefore `<MODEL_ROOT_i>` below means each absolute `model.codeRoots` path derived from `docs/modules.yaml`. `modules/model/contract/` remains allowed because dependency contracts are part of `moduleScope` (`packages/router/src/agency.ts` ~296).

## Soundness

### Claude Code 2.1.263

If implemented, write to the gitignored, machine-local:

```text
.claude/settings.local.json
```

Conceptual deny entries:

```json
{
  "permissions": {
    "deny": [
      "Edit(<ABS_REPO>/<MODEL_ROOT_i>/**)",
      "Write(<ABS_REPO>/<MODEL_ROOT_i>/**)",

      "Edit(<ABS_REPO>/docs/sessions/sessions.json)",
      "Write(<ABS_REPO>/docs/sessions/sessions.json)",
      "Edit(<ABS_REPO>/activity-log.json)",
      "Write(<ABS_REPO>/activity-log.json)",
      "Edit(<ABS_REPO>/docs/modules.yaml)",
      "Write(<ABS_REPO>/docs/modules.yaml)",
      "Edit(<ABS_REPO>/.dabbler/runs/**)",
      "Write(<ABS_REPO>/.dabbler/runs/**)",
      "Edit(<ABS_REPO>/.dabbler/solution/**)",
      "Write(<ABS_REPO>/.dabbler/solution/**)",

      "Bash(git push --force:*)",
      "Bash(git reset --hard:*)",
      "Bash(git checkout -- .:*)",
      "Bash(git clean -f:*)"
    ]
  }
}
```

Those protected paths and destructive categories come from `packages/router/src/policy.ts` (brief item 2). No `Read(...)` denial should be written.

**ASSUMPTION:** the displayed glob spelling is accepted exactly as shown; the brief establishes path-globbed `Edit` and `Write`, but does not give the complete grammar. Recursive root deletion must be translated from the actual regex strings in `policy.ts`; guessing Unix or PowerShell spellings here would be unsafe.

This file is gitignored, but it is **checkout-scoped, not process-scoped**. Writing and removing it makes it per-session only in time; concurrent chats in the checkout would share it.

**Probe `CLAUDE-SKIP-DENY`:** in a temporary repository, put an `Edit`/`Write` deny on one file in `.claude/settings.local.json`, launch the same headless command used by `engines.ts` ~160 with `--dangerously-skip-permissions`, direct Claude to overwrite that file, and inspect both the file and tool result. Do not ship the writer unless the deny wins.

### GitHub Copilot CLI 1.0.83

Prefer repeated per-process arguments, not a repository file:

```text
--deny-tool write(<ABS_REPO>/<MODEL_ROOT_i>)
--deny-tool write(<ABS_REPO>/docs/sessions/sessions.json)
--deny-tool write(<ABS_REPO>/activity-log.json)
--deny-tool write(<ABS_REPO>/docs/modules.yaml)
--deny-tool write(<ABS_REPO>/.dabbler/runs)
--deny-tool write(<ABS_REPO>/.dabbler/solution)

--deny-tool shell(git push --force:*)
--deny-tool shell(git reset --hard:*)
--deny-tool shell(git checkout -- .:*)
--deny-tool shell(git clean -f:*)
```

Absolute paths avoid Copilot’s trailing-component ambiguity where possible. Arguments are naturally per launched process and require no gitignored file. There is no `read(path)` permission kind in Copilot CLI 1.0.83.

**Probe `COPILOT-WRITE-DIRECTORY`:** deny an absolute directory, ask Copilot to create and edit both a direct child and a nested child, and compare that with an exact-file deny. This settles whether `write(<directory>)` protects a tree or merely matches a trailing filename component.

**Probe `COPILOT-REPOSITORY-CONFIG`:** place an equivalent deny in each repository-local configuration location documented or accepted by CLI 1.0.83, launch without `--deny-tool`, and attempt the write. The brief only grounds `~/.copilot/config` as per-user, so no repository-file behavior should be asserted.

**ASSUMPTION:** shell-command normalization may differ from the literal text. If these rules are pursued, add a small destructive-prefix probe using harmless wrapper commands before treating the shell denies as effective.

## Risk

Claude’s writer may silently do nothing under `--dangerously-skip-permissions`; Copilot’s writer may protect only an exact trailing component rather than a directory. Claude’s local settings also recreate the same class of checkout-wide interference already measured with the Stop hook.

## Recommendation

Do **not** build both writers in sessions 126–129. Report-time refusal is the simpler, deterministic module boundary.

If `COPILOT-WRITE-DIRECTORY` succeeds, adding Copilot’s `--deny-tool` arguments later is worthwhile because it is per-process and has no cleanup lifecycle. Do not add the Claude writer unless `CLAUDE-SKIP-DENY` succeeds and checkout-wide concurrency is explicitly accepted.

---

# Q3 — Reads

## Soundness

“Told, not enforced” is acceptable for the first release. The first instruction already identifies the allowed scope and dependency contract (`schemas/driver-instruction.schema.json`, `drive.ts`, `session.ts`), while the package seam prevents compile-time implementation coupling through the brief’s `PackageReference`, never `ProjectReference`, rule.

That is weaker blackboxing: an engine can still learn or copy implementation details. It is not weaker build isolation.

## Risk

**ASSUMPTION:** close-time parsing of Copilot `events.jsonl` or Claude transcripts will become a version-dependent telemetry feature, with false counts and pressure to add coverage or attestation. That recreates the machinery the operator rejected without preventing any read.

## Recommendation

Keep only the existing out-of-scope indication already emitted in `rounds.jsonl`, and only if it requires no new scan. Add no count, no transcript reader, and no “coverage” status.

Yes: drop enforced read blackboxing from the first release entirely.

---

# Q4 — Report-time refusal

## Soundness

For each report attempt, normalize and inspect both:

1. every path supplied through `dabbler session report --files`; and
2. the framework’s actual net tree diff for the step.

The second prevents omission; the first catches a dishonest or malformed declaration. The framework already receives every reported path and already diffs the tree (brief item 6).

Refuse when either source contains:

- a path outside `moduleScope` from `packages/router/src/agency.ts` ~296; or
- one of the protected paths from `packages/router/src/policy.ts`.

Return all offending paths in one rejection. Example:

> **Report refused — module scope mismatch.**  
> `modules/model/src/Store.cs` belongs to module `model` implementation and is outside the `persister` session scope. Revert that change and use `modules/model/contract/` for the published interface. If `model` implementation must change, it requires separate `model` work rather than a scope grant.

For an unowned path:

> `tools/local.sh` is outside the `persister` session scope. Revert it before reporting again.

For a protected path:

> `docs/modules.yaml` is framework-protected and cannot be changed by this work step.

## Risk

An accidental sibling edit is an ordinary rejection: the engine reverts it and retries. It counts as one refusal under the existing three-refusals rule in `AGENTS.md`; returning all paths at once avoids spending one refusal per file.

A genuinely wrong plan is different. It cannot be repaired by retrying the same forbidden edit. **ASSUMPTION:** unless the orchestrator has an automatic replanning path not stated in this brief, that case will stop and require the work to be rescheduled as `model` work. A self-grant would hide the plan defect rather than solve it.

## Recommendation

Make this the only active **framework-owned module-write enforcement point**, with the changed-path clause in `judgeExposure` (`packages/router/src/land.ts` 231–249) retained as the close backstop. Delete the sibling-bytes clause.

Do not exempt scope refusals from the three-refusals rule. The AI should revert after the first rejection; three identical attempts are an engine failure, not a reason to widen permissions.

---

# Q5 — Hooks at all

## Soundness

Option **(c), remove the Stop hook**, is the simplest reliable choice. The installed hook is repository-scoped and was measured blocking an unrelated Claude chat throughout session 125 (`bootstrap/index.ts` ~320; `stopGateDecision` in `session.ts` ~2522). Copilot has no equivalent installed.

Option (b) directly burdens the human. Option (a) depends on an unmeasured way to learn and bind the driver’s Claude `session_id`.

**Probe `CLAUDE-DRIVER-SESSION-ID`:** launch the driver with a diagnostic Stop hook, capture its hook input, and determine whether the launching process can learn the same `session_id` without a `sessionStart` hook. Only consider a process-keyed Stop hook if this requires no extra lifecycle mechanism.

## Risk

**ASSUMPTION:** without the hook, a model may occasionally end its turn while a `step` or `rejection` remains outstanding. That is preferable to deterministically obstructing every observer chat in the repository.

## Recommendation

Remove the Stop-hook installation and `dabbler session hook-stop`. Keep no framework-installed hooks. Put the pull-loop obligation in the driver instruction and rely on `next` returning `step`, `rejection`, `wait`, or `done` (brief item 6).

---

# Q6 — Delete, demote, keep; fix first

## Soundness

For the round-11 mechanisms and clone apparatus explicitly named in this brief:

| Disposition | Item |
|---|---|
| **Drop** | Planned pre-tool hook. |
| **Drop** | Turn-end transcript scan. |
| **Drop** | Canary and coverage/attestation machinery. |
| **Drop** | Self-grant and `session next --request-grant`. |
| **Drop** | `ModulePolicy` decision function and `.dabbler/runs/s<N>/policy.json` once report enforcement derives scope directly (`packages/router/src/policy.ts`). |
| **Drop** | Stop hook, bootstrap installation, and `hook-stop` (`bootstrap/index.ts`, `session.ts`). |
| **Demote** | Vendor static permission writers: later/optional, after Q2 probes. |
| **Keep** | `moduleScope` in `packages/router/src/agency.ts` ~296. |
| **Keep** | First-step `scope` and `dabbler session scope`. |
| **Keep** | Report-time path refusal and close changed-path backstop in `packages/router/src/land.ts`. |
| **Drop** | Sibling-bytes clause from `judgeExposure`. |
| **Drop** | Clone machinery in `checkout.ts`; first move the small `contractDir` helper needed by `moduleScope`. |
| **Drop** | Bytes half of `exposure.ts` and the module-session marker. |
| **Drop** | `module open`, `module preflight`, `module grant`, and `module revoke`. |
| **Drop** | `layDebugGrants` in `ecosystem.ts`. |
| **Drop** | Extension **Open Module** and **Widen for Debugging** commands. |
| **Change** | Extension **Start Session** opens the repository root, not the focused clone. |

## Risk

Deleting the clone before fixing visible session feedback would prioritize invisible wall work over defects the operator experienced today. The Work Explorer repaint failure resembles the session-110 projection-cache defect, while the Dabbler Terminal emitted no step line (brief item 9); the exact current implementation locations are **ASSUMPTION** because no paths are supplied.

## Recommendation

Fix both basic-functionality defects first, in one two-step session:

1. reproduce and fix Work Explorer invalidation when the driver issues a step;
2. emit the issued step in the Dabbler Terminal and add focused regression coverage for both behaviors.

---

# Q7 — Sessions 126–129

## Soundness

Use **three sessions**, but make the third deletion and validation rather than a walk-only ceremony.

### Session 126 — Restore visible driver feedback

1. Fix automatic Work Explorer repaint when `run.json` changes.
2. Print every issued work step in the Dabbler Terminal.
3. Run focused extension/driver regression tests.

The exact extension source paths are **ASSUMPTION**; the observed defects and prior session-110 cache issue are grounded in brief item 9.

### Session 127 — Reduce the wall to one report gate

1. Enforce the union of `--files` and actual tree-diff paths at `session report`, with owner/contract reasons and protected-path handling.
2. Retain the close changed-path clause; remove the sibling-bytes clause, policy decision/record, self-grant surface, and Stop hook.
3. Run a Copilot module session first; then a Claude smoke test using the same scope/report behavior. Do not claim vendor static denies were tested.

### Session 128 — Remove checkout indirection

1. Move `contractDir`, then delete `checkout.ts`, clone markers, bytes exposure, grant/revoke/request-grant, and debugging overlays.
2. Remove **Open Module** and **Widen for Debugging**; make **Start Session** open the repository root.
3. Walk one Copilot developer day end to end, then perform a smaller Claude regression.

### Session 129

Cancel it.

## Risk

Two sessions would force the visible defects, the new report gate, backend deletion, extension deletion, root-opening change, and end-to-end validation into six substantial concerns. **ASSUMPTION:** that compression is more likely to recreate the reliability problem the operator is prioritizing than to save meaningful human time.

## Recommendation

Use three sessions, not two. Do not spend a standalone session on vendor permissions or a validation walk.

---

# 8 — The developer’s day

## Open

The developer opens the regular repository root and starts the session; no sparse clone or focused module checkout is created. The Work Explorer repaints automatically, the Dabbler Terminal prints the issued step, and the first instruction names `persister`’s scope and `modules/model/contract/`.

## Work

Copilot pulls work through `dabbler session next` and reports through `dabbler session report` (brief item 6). If it merely reads `model` implementation, nothing blocks it; the instruction directs it back to the contract. If it edits a `model` implementation path, the report is refused with the path, owner, contract folder, and instruction to revert—without asking the developer for a grant.

## Test

The step’s configured `dabbler.yaml` test suites run as today. If the tree moves while checks run, the existing hash protection refuses the report (brief item 6).

## Land

Landing applies the changed-path scope clause in `judgeExposure` as a backstop (`packages/router/src/land.ts` 231–249). It no longer inspects whether sibling bytes happen to be present in the ordinary checkout.

## Review

The developer reviews one normal repository diff rather than a clone or overlay. `rounds.jsonl` may retain its existing out-of-scope read indication, but there is no transcript scan, read count, canary, coverage claim, or permission decision for the developer to interpret.

---

# 9 — The disagreement

The orchestrator’s restatement is heaviest in item 2: two vendor-specific writers, lifecycle cleanup, and unmeasured semantics are not necessary for the deterministic report gate. Item 5 is also too heavy if “fix the Stop hook” means introducing session-ID discovery solely to preserve a hook that already harmed an observer chat.

“Simple” and “blackboxing” genuinely conflict on reads and pre-write interception. I choose simple: contracts and package seams guide reads; report and close protect writes.

**ASSUMPTION:** another reviewer is most likely to reintroduce a permission abstraction, transcript telemetry, runtime canaries, session-ID hook binding, and a grant escape hatch. Those would rebuild rounds 10–11 instead of delivering the operator’s requested minimum.