# Verification Round 1

{
  "verdict": "ISSUES_FOUND",
  "issues": [
    {
      "severity": "Critical",
      "title": "State B repo-clone path violates the checklist-before-execute gate",
      "detail": "`docs/adoption-bootstrap.md`, Step 1, State B sub-path (3) says to run `git clone <url>` immediately after the human provides a repo URL, before Step 7 approval. That is a file-system write/scaffold action and directly contradicts the doc's repeated load-bearing rule in the preamble / 'Your job' / Step 7 ('do not write any files, scaffold any folders, or modify any configuration until the human has reviewed your checklist and approved'). A different-provider engine following the doc literally would either violate the gate or stall on whether cloning is an implicit exception.",
      "follow_up": "Move cloning behind Step 7 as an explicit checklist item, or require a separate explicit approval for the clone before it runs."
    },
    {
      "severity": "Major",
      "title": "Budget-tier and enum naming are internally inconsistent across the two docs and the schema",
      "detail": "Step 5 in `docs/adoption-bootstrap.md` defines four tiers: zero-budget, limited-budget, middle-tier, and ample-budget. But the embedded `ai_router/budget.yaml` schema only allows `mode: \"zero-budget\" | \"limited-budget\" | \"ample-budget\"`, omitting a middle-tier value entirely. The schema example then uses `threshold_usd: 25` with `mode: \"limited-budget\"`, which conflicts with Step 5 and the new workflow-doc table, both of which classify `$20–$99` as middle-tier. There is a second naming mismatch on outsource mode: the workflow doc uses `outsource-first` / `outsource-last`, while the schema and Step 7 example use `first` / `last`.",
      "follow_up": "Choose one canonical enum set and use it everywhere. Either add an explicit middle-tier mode to `budget.yaml`, or collapse middle-tier into limited-budget consistently across Step 5, the schema, the example YAML, and the workflow-doc table. Also standardize outsource-mode tokens (`first|last|none` vs `outsource-first|outsource-last|none`)."
    },
    {
      "severity": "Major",
      "title": "External-path and cloned-repo flows are not operationally complete across assistants",
      "detail": "`docs/adoption-bootstrap.md`, Step 1 State B sub-paths (2) and (3), say to get a local path or clone a repo and then 'proceed as if a workspace were open at that path.' Step 3 then assumes the assistant can canvas that path. Many assistants can only glob/read within the current workspace and cannot silently retarget tools to an arbitrary filesystem path or change the active folder from chat. The required-capabilities list also does not include 'open folder/change workspace' or an explicit instruction to use absolute paths. In my runtime simulation, this is a real stumble point: after the human gives a path or repo URL, I would have to improvise a fallback that the doc does not specify.",
      "follow_up": "Add a tool-agnostic fallback: if the assistant cannot retarget tools to an arbitrary path, tell the human to open that folder in VS Code and then continue. If the assistant can target arbitrary paths, require all file reads/globs/commands to use explicit absolute paths until the workspace is reopened."
    },
    {
      "severity": "Major",
      "title": "Budget threshold scope is ambiguous, so monitoring and future enforcement are under-specified",
      "detail": "Step 5 defines the threshold as money the operator is comfortable spending 'over the project's lifetime.' But the middle-tier guidance says 'I'll prompt you when monthly spend crosses 50% of your threshold.' The workflow-doc section documents a '50%-spend tier-upgrade prompt' without clarifying the window, and `ai_router/budget.yaml` has no field that records whether the threshold is lifetime, monthly, or some other cadence. A future enforcement/reporting implementation would not know whether to compare cumulative spend or monthly spend against `threshold_usd`.",
      "follow_up": "Define one explicit budget scope and persist it in `ai_router/budget.yaml` (for example `threshold_scope: \"project-lifetime\" | \"monthly\"`), or remove the monthly language and make all prompts compare against cumulative lifetime spend."
    },
    {
      "severity": "Major",
      "title": "Zero-budget manual verification is missing a concrete, stable template handoff",
      "detail": "In Step 5 zero-budget option (a), the human is told to use `ai_router/prompt-templates/verification.md` 'from the canonical Dabbler repo.' The workflow-doc section later references the same path as if it were local. For a freshly bootstrapped project, that file may not exist locally yet, and a non-technical user is not given a public URL or inline template text. I understand the intended workflow, but on the $0/manual path I would not have a concrete artifact to hand the user without guessing where that template lives.",
      "follow_up": "Provide a stable public raw URL for the verification template, or make the bootstrap create/copy that template into the project before any session relies on manual verification."
    },
    {
      "severity": "Minor",
      "title": "Fast-path and state-detection edge cases need explicit guard questions",
      "detail": "Step 2 treats `docs/planning/project-plan.md` as a fast-path signal without telling the assistant to verify that the plan is complete/current. Step 3 says `docs/session-sets/` means the project has been touched by Dabbler before, but it does not say whether the assistant should continue, repair, or re-bootstrap. Step 1/3 also do not spell out what to do with an empty folder, multiple `project-plan.md` candidates, or a path that turns out to be the user's home directory rather than a repo. A cautious assistant can recover by asking extra questions, but the doc does not direct that behavior.",
      "follow_up": "Add explicit guards: confirm which plan file is canonical when multiple candidates exist; ask whether an existing plan is complete enough to skip discovery; route an empty folder to the greenfield path; reject overly broad paths like a home directory and ask for a specific repo/project folder; if session-set artifacts already exist, ask whether this is a continuation of an earlier Dabbler setup."
    }
  ]
}

---

# Verification Round 2

```json
{
  "verdict": "ISSUES_FOUND",
  "summary": "Round 2 cleanly fixes the original critical clone-approval defect and most of the enum/schema drift, but 3 major issues remain and 1 minor regression is still present.",
  "issue_counts": {
    "critical": 0,
    "major": 3,
    "minor": 1
  },
  "checks": [
    {
      "item": 1,
      "topic": "Critical clone gate",
      "status": "PASS",
      "details": "The clone is now clearly carved out as a one-shot-approved preparatory action, explicitly separated from the Step 7 checklist, and gated by an approval prompt before execution."
    },
    {
      "item": 2,
      "topic": "Enum consistency across docs and schema",
      "status": "PARTIAL",
      "details": "The four tier values are now aligned across Step 5, the schema, and the workflow table, and the first/last/none field-token drift is fixed. `middle-tier` is defensible as an enum name, though stylistically asymmetric with the other `*-budget` values. Two residual text/example drifts remain and are listed below."
    },
    {
      "item": 3,
      "topic": "Arbitrary-path canvas fallback",
      "status": "FAIL",
      "details": "The retargeting check is better, but the absolute-path discipline is scoped only to Step 3. Step 2 fast-path checks and Step 8 writes are still underspecified for arbitrary-path mode, so a provider could canvas one path and later read/write another."
    },
    {
      "item": 4,
      "topic": "Threshold scope",
      "status": "PARTIAL",
      "details": "Adding `threshold_scope` is the right shape for future enforcement, but the docs still do not define parser behavior when that field is absent in older or manually-authored `budget.yaml` files. The default should be stated explicitly as a compatibility rule."
    },
    {
      "item": 5,
      "topic": "Manual-verification template URL",
      "status": "PASS_WITH_NOTE",
      "details": "No document-level problem is visible in the URL as written; its raw GitHub format is correct. Live reachability cannot be proven from static review alone. The local `docs/manual-verification.md` offer is understandable."
    },
    {
      "item": 6,
      "topic": "Edge-case guards",
      "status": "PARTIAL",
      "details": "The new Step 2/3 guards are materially better. Remaining gaps are mostly path-handling related: clone destination ambiguity in State B sub-path (3), and the lack of an end-to-end target-path rule for Step 2/7/8 when operating outside the active workspace."
    },
    {
      "item": 7,
      "topic": "Anything new / regressions",
      "status": "YES",
      "details": "Round 2 introduced a new clone-destination ambiguity in State B sub-path (3), and there are still small text regressions around tier counting/example wording."
    }
  ],
  "issues": [
    {
      "severity": "major",
      "title": "Arbitrary-path handling is only specified for Step 3, not for the rest of the bootstrap",
      "location": [
        "docs/adoption-bootstrap.md — Step 1, State B, sub-path (2)",
        "docs/adoption-bootstrap.md — Step 2",
        "docs/adoption-bootstrap.md — Step 8"
      ],
      "impact": "If the assistant is operating against a target path outside the active VS Code workspace, the doc only says to use absolute paths for Step 3 reads/globs/commands. Step 2 fast-path checks can still inspect the wrong workspace, and Step 8 can still write into the wrong location.",
      "fix": "Make arbitrary-path mode persistent from Step 1 through Step 8: require absolute paths for every read, glob, command, and write until the human opens the target folder as the active workspace. Also tell the assistant to stop before Step 7/8 if its write tools are workspace-scoped."
    },
    {
      "severity": "major",
      "title": "`threshold_scope` lacks an explicit missing-field compatibility rule",
      "location": [
        "docs/adoption-bootstrap.md — `ai_router/budget.yaml` schema / `threshold_scope` field reference",
        "docs/ai-led-session-workflow.md — Cost-budgeted verification modes"
      ],
      "impact": "Future enforcement logic will not know how to interpret older `budget.yaml` files that predate `threshold_scope`, or manually-authored files that omit it.",
      "fix": "Add an explicit rule: if `threshold_scope` is absent, treat it as `project-lifetime`. Ideally mention this in both the schema reference and the workflow section, and optionally recommend migrating missing files forward on the next bootstrap/update."
    },
    {
      "severity": "major",
      "title": "Clone destination is still ambiguous in no-workspace mode",
      "location": [
        "docs/adoption-bootstrap.md — Step 1, State B, sub-path (3)"
      ],
      "impact": "Sub-path (3) asks for a 'sensibly-named local folder' and suggests 'a sibling of the current folder' even though State B has no workspace open. A provider may resolve a relative `<local-folder>` against an opaque process working directory and clone into an unintended location.",
      "fix": "Require an absolute destination path (or absolute parent directory plus derived repo folder name), and echo the fully resolved absolute clone target in the approval prompt before running `git clone`."
    },
    {
      "severity": "minor",
      "title": "Residual tier-count/example drift remains after the enum fix",
      "location": [
        "docs/ai-led-session-workflow.md — 'Three tiers, with two sub-options under the zero tier'",
        "docs/adoption-bootstrap.md — Step 8 example: '$25 threshold, limited-budget mode'"
      ],
      "impact": "The prose still conflicts with the four-row table, and the Step 8 example still maps `$25` to the old tier label.",
      "fix": "Change 'Three tiers' to 'Four tiers' and update the Step 8 `$25` example to `middle-tier`."
    }
  ]
}
```

---

# Verification Round 3

{
  "verdict": "ISSUES_FOUND",
  "summary": "The round-2 major fixes for arbitrary-path discipline and absolute clone destination are substantially resolved: Step 1 now carries the absolute-path rule through Step 8, Step 3 reinforces it, and Step 8 blocks unsafe writes. The clone flow now requires and echoes a fully resolved absolute destination, which removes the earlier no-workspace ambiguity. `threshold_scope` compatibility is clear, but one schema-compatibility gap remains in the bootstrap doc for `verification_method`, and there is still one residual tier-count drift plus two minor clarity gotchas.",
  "issues": [
    {
      "severity": "major",
      "issue": "The bootstrap doc's schema reference still does not state the missing-field compatibility default for `verification_method`, so the compatibility rule is not actually complete in both deliverables.",
      "location": "docs/adoption-bootstrap.md -> Reference: `ai_router/budget.yaml` schema -> Field reference (`verification_method`)",
      "fix": "Add an explicit compatibility rule mirroring the workflow doc: if `verification_method` is absent from an older or hand-authored `budget.yaml`, readers must treat it as `api` rather than erroring."
    },
    {
      "severity": "minor",
      "issue": "A residual tier-count drift remains: the closing pointer still says the workflow doc explains a \"three-tier mapping\" even though the docs now define four tiers.",
      "location": "docs/adoption-bootstrap.md -> Step 9 -> More info -> bullet for `docs/ai-led-session-workflow.md`",
      "fix": "Change \"three-tier mapping\" to \"four-tier mapping\"."
    },
    {
      "severity": "minor",
      "issue": "Step 3's heading is now inaccurate. It says \"workspace path only\" even though the body explicitly supports arbitrary-path operation carried forward from Step 1.",
      "location": "docs/adoption-bootstrap.md -> Step 3 heading",
      "fix": "Rename the heading to reflect both supported modes, e.g. \"Confirm understanding (workspace or explicit target path)\"."
    },
    {
      "severity": "minor",
      "issue": "The clone flow fixes destination ambiguity, but it still leaves shell-safe execution implicit. Paths with spaces or shell metacharacters can still trip a naive `git clone <url> <absolute-destination>` interpolation.",
      "location": "docs/adoption-bootstrap.md -> Step 1 -> State B -> sub-path (3) clone execution instruction",
      "fix": "Add a short execution note requiring shell-safe quoting or argument-array invocation for both the URL and the absolute destination when running the clone command."
    }
  ]
}

---

# Verification Round 4

{
  "verdict": "VERIFIED",
  "summary": "Round-4 resolves the remaining round-3 findings cleanly. The bootstrap doc now states the missing-field default for `verification_method` consistently with the workflow doc; Step 9 now correctly refers to a four-tier mapping; the Step 3 heading now matches both supported operating modes; and the clone guidance now clearly warns against naive shell-string interpolation. No regressions or new issues were introduced by the reviewed changes.",
  "checks": [
    {
      "id": 1,
      "title": "`verification_method` compatibility default in bootstrap doc",
      "status": "PASS",
      "details": "The bootstrap schema field reference now explicitly says missing `verification_method` must be treated as `api`, which matches the workflow doc's compatibility rule and Rule 2 default behavior."
    },
    {
      "id": 2,
      "title": "Step 9 tier-count wording",
      "status": "PASS",
      "details": "The Step 9 'More info' bullet now says 'four-tier mapping,' which is consistent with the docs' four tiers plus zero-tier sub-options."
    },
    {
      "id": 3,
      "title": "Step 3 heading accuracy",
      "status": "PASS",
      "details": "The revised heading accurately covers both normal workspace mode and explicit absolute-target-path mode."
    },
    {
      "id": 4,
      "title": "Clone command shell-safe execution note",
      "status": "PASS",
      "details": "The new note is clear and sufficient: it explicitly warns against naive interpolation and directs the orchestrator to use separate arguments or proper quoting supported by the tool."
    },
    {
      "id": 5,
      "title": "New issues or regressions",
      "status": "PASS",
      "details": "No new inconsistencies, regressions, or follow-on issues were found in the round-4 edits reviewed here."
    }
  ],
  "issues": []
}
