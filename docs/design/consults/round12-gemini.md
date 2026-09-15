# Design consult, round 12: Gemini on the wall without hooks -- the scope handed over once, the CLI's own permissions, and nothing else

model_name: gemini-3-1-pro
model_id: gemini-3.1-pro-preview
provider: google
tokens: 4199 in / 1519 out
elapsed: 47.572s  truncated: false (stop_reason: end_turn)

---

**Q1 — Sufficiency**
*   **Soundness:** The proposal leverages `dabbler session scope` (already in `cli/session.ts`) and the existing refusal loop where three refusals stop the session (`AGENTS.md`).
*   **Risk:**
    *   *Impasse (Priority 1):* The AI hits the report refusal, fails to revert its edit properly, submits again, burns its three refusals, and halts. ASSUMPTION: The AI is capable of executing `git checkout -- <file>` upon a report refusal to recover without human help.
    *   *Mechanism does nothing:* The CLI's own static rules (step 2) are bypassed by headless flags or mismatched semantics.
*   **Recommendation:** It is sufficient for writes, but step 2 (CLI static rules) should be dropped. The pre-hook and canaries dropped from rounds 10–11 bought read blackboxing, which customers will not miss in the first three months because the `PackageReference` seam already enforces compile-time decoupling.

**Q2 — The CLI's own permissions, exactly**
*   **Soundness:** Claude Code uses `.claude/settings.local.json` with `Write(...)`; Copilot uses `--deny-tool write(path?)`.
*   **Risk:** Copilot's directory semantics and file-based config are undocumented, and Claude's skip flag may override rules entirely. This creates a brittle writer for each engine.
    *   *Probe:* Do Copilot `--deny-tool` rules work in a repository config file rather than argv?
    *   *Probe:* Does Copilot `write(modules/model/src)` match a directory recursively or only a trailing filename component?
    *   *Probe:* Does Claude's `--dangerously-skip-permissions` ignore deny rules in `.claude/settings.local.json`?
*   **Recommendation:** Step 2 is not worth its two writers. The report-time refusal alone is the simpler equal, relies entirely on the framework's own execution loop, and behaves identically across both engines.

**Q3 — Reads**
*   **Soundness:** `rounds.jsonl` already flags out-of-scope paths. The brief states `PackageReference` prevents compile-time coupling.
*   **Risk:** Context window bloats if the AI reads sibling implementations, but enforcement requires unreliable pre-hooks.
*   **Recommendation:** "Told, not enforced" is acceptable at Priority 4. Drop read blackboxing from the first release entirely. Rely solely on the verifier's out-of-scope flag in `rounds.jsonl` as today; do not build transcript parsing or log reads.

**Q4 — The report-time refusal**
*   **Soundness:** The framework already hashes the tree before and after checks (`dabbler.yaml testing.suites`); it already assesses out-of-scope paths at the close (`judgeExposure` in `packages/router/src/land.ts`).
*   **Risk:** Relying on `--files` is a mechanism that does nothing, as the AI can omit paths.
*   **Recommendation:** Paths counted must be the **tree diff**, ignoring `--files`.
    *   *Reason text:* "Report refused. Path `<path>` belongs to sibling module `<slug>`. Revert your edit and read its contract at `<contractDir>` instead."
    *   *Interaction:* It consumes one of the three refusals (`AGENTS.md`). If the plan genuinely required the edit, it is an architectural error and an impasse is the correct, safe outcome. This is the only enforcement point the framework needs.

**Q5 — Hooks at all**
*   **Soundness:** The Stop hook is installed today (`bootstrap/index.ts` ~320) and keys on the repository, which blocked the observer chat.
*   **Risk:** Attempting to fix it introduces process-ID tracking which is flaky.
    *   *Probe:* Can the framework learn the driver's `session_id` at launch without a `sessionStart` hook?
*   **Recommendation:** Option (C) — remove it entirely and rely on the instruction's own words. The operator explicitly noted hooks "might not be reliable anyway."

**Q6 — What to delete, and what to fix first**
*   **Soundness:** The clone apparatus is in `checkout.ts` and `exposure.ts`; UI defects are in the Work Explorer and Terminal.
*   **Deletions and demotions:**
    *   `checkout.ts` clone creation and session marker: Drop.
    *   Sibling bytes clause in `judgeExposure`: Drop.
    *   `policy.json` writing (except basic scope derivation): Drop.
    *   Pre-hook, transcript scan, canary, self-grant verb: Drop.
    *   Extension's "Open Module" command: Keep, but change to focus the repo root.
    *   Extension's "Widen for Debugging" command: Drop.
*   **Recommendation for defects:** The basic-functionality defects (Work Explorer cache and Terminal step output) must be fixed *before* any wall work. A tool that does not visibly report its state fails Priority 2 (human burden).

**Q7 — The sessions**
*   **Soundness:** Delivery requires fixing defects, deleting the clone, and implementing the report refusal.
*   **Recommendation:** It should be **two** sessions.
    *   **Session 126:** Fix the Work Explorer cache and Terminal output defects; remove the clone apparatus, `judgeExposure` bytes clause, and Stop hook; change Start Session to root.
    *   **Session 127:** Enforce the wall: print scope on first instruction, implement the tree-diff report refusal, verify the changed-path clause at the close gate, and run the Copilot walk.

***

**8. The developer's day**
The developer clicks Start Session on a module, and the extension opens the regular repository root. Copilot begins working, and the developer sees steps updating immediately in the Terminal and Work Explorer. If Copilot reaches for a sibling's file, it submits the `report`, is instantly rejected by the framework's tree diff with a strict reason to read the contract, and reverting its own mistake before proceeding. When the session lands, the close gate verifies the diff, and the developer reviews a clean PR with zero sibling bleed, having made no manual permission decisions.

**9. The disagreement**
The orchestrator's restatement is heavier than requested specifically in Step 2 (the CLI static rules). Generating vendor-specific, partially documented config files or passing brittle CLI flags conflicts entirely with the operator's demand for simplicity. "Simple" and "blackboxing" genuinely conflict on the topic of read enforcement, and I side with "simple": we drop read blackboxing entirely because the compiler seam provides the ultimate safety net. I expect the other reviewer to over-engineer by trying to salvage Step 2's static rules or by proposing process-ID tracking to save the Stop hook.