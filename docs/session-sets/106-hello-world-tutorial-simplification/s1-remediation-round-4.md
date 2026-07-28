# S1 remediation sidecar — after remediation-review cycle 2 (round 4)

Round 4 returned **14 fix-accepted / 1 accepted-with-modification / 1 rejected**
and **one** new blocking finding.

## The round-3 dispute is settled — no longer outstanding

The disputed Major from round 3 (R3-3: *"provide a valid Azure Pipelines
definition…"*) **did not recur**. The verifier accepted the
accepted-with-modification resolution: the Part 2 scope statement declaring the
ADO notes a named-equivalents configuration checklist rather than a second
walkthrough. No operator adjudication is needed on that point any more, and no
`azure-pipelines.yml` was added — the cut list held.

## R4-1 — Node.js version floor (Major): concern valid, stated evidence false

**The finding:** *"The documented Node.js minimum is unsupported by GitHub
Copilot CLI… The published `@github/copilot` package requires Node.js 22 or
newer… Evidence: the installed dependency's engine contract requires Node.js
22+."*

**Checked, not assumed.** The evidence as stated is **wrong**:

```
$ npm view @github/copilot --json  ->  version: 1.0.75   engines: null
```

The published package declares **no `engines` field at all**, so there is no
"engine contract", and npm cannot emit the unsupported-engine warning the failure
scenario is built on. Reported for the record — a verifier's evidence is
checkable, and this one did not survive the check.

**The underlying concern is still real, and was fixed by removal rather than by
arguing about the number.** The decisive fact came from the walk machine itself:

```
$ winget list --name Copilot
Copilot CLI    GitHub.Copilot    v1.0.51    v1.0.75    winget
```

The operator's working `copilot` is a **152 MB standalone binary installed via
winget (`GitHub.Copilot`)** — not the npm package, and installed with **no
Node.js involved**. The Node prerequisite I added in the previous round was
therefore both unverifiable *and* unnecessary for the primary path.

**Fix applied** (prefer removal over addition — `project-guidance.md`):

- The blanket **"Node.js 18 or newer" prerequisite is deleted**. Part 1 now has
  five prerequisites again, not six.
- The primary install is `winget install GitHub.Copilot` — empirically the one
  running on the machine that will perform the S4 walk.
- npm survives as the macOS/Linux alternative, carrying the conservative
  **Node.js 22 or newer** floor. A reader on that path is steered correctly
  whichever number is right; a reader on the primary path no longer cares.

**A second verified fact came out of the same check.** winget records the
installed version as **v1.0.51** while the binary reports **1.0.75** — the
Copilot CLI **updates itself**. That is the mechanism behind the catalog
pin drift found at the start of this session (lock pins 1.0.69, seat runs
1.0.75). The Part 1 version-pin callout now says so: *"CLI versions move — the
Copilot CLI updates itself… Expect `copilot --version` to drift past the pin."*
Drift is now taught as expected behavior with a named remedy, not as an error.

## Loop status — the bound is reached

This was **remediation-review cycle 2 of 2**. The loop **suspends** here by rule;
no further cycle was opened on the orchestrator's own authority. R4-1 is
**fixed**, not unfixed and not disputed in substance — but the fix has not itself
been through a verification round, and only the operator can authorize one more
cycle.

Line count: 314 → **314** (the Node prerequisite's removal paid for the
install-variant sentence).
