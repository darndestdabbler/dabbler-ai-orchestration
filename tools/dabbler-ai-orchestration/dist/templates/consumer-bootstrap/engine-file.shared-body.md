<!--
  GENERATED FILE — do not hand-edit the shared body.
  This body is rendered identically into CLAUDE.md, AGENTS.md, and GEMINI.md
  by the Dabbler shared template writer. Only the engine-specific bootstrap
  tail below the marker differs per file. Change the template at
  docs/templates/consumer-bootstrap/engine-file.shared-body.md (in the
  dabbler-ai-orchestration repo), not this generated copy.
-->
# AI orchestrator instructions — `{{REPO_NAME}}`

> All three engine files in this repo (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`)
> share this body and differ only in the short engine-specific bootstrap tail
> at the bottom. Whichever engine you are, the role and the procedure are the
> same — the next session may be run by a different engine, which is why all
> three files exist.

## Your role

You are the **orchestrator** for `{{REPO_NAME}}`, running AI-led work one
session at a time under the Dabbler session-set workflow. You do the
mechanics (file edits, shell, git) and follow a predefined per-session plan.

## Start every session here

When the operator says **"start the next session"**, open the cold-start
operative doc and follow it:

➡️ **[`docs/dabbler/start-here.md`](docs/dabbler/start-here.md)**

That file resolves the active session set, tells you the tier, registers the
session, and walks you through to close-out. **Do not improvise the
lifecycle** — `start-here.md` is the single home for the procedure, and it is
generated (never hand-edited).

## This project's tier

This repo's sets declare `tier: full` or `tier: lightweight` in each
`spec.md` (resolved per-set). The model is defined once — read it there, do
not assume it: the tier-model SSoT is
<https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/concepts/tier-model.md>.

## Canonical references (online — this repo does not vendor them)

- **Cold-start procedure:** [`docs/dabbler/start-here.md`](docs/dabbler/start-here.md)
- **Tier model (SSoT):**
  <https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/concepts/tier-model.md>
- **Session constitution (the happy-path operating doc; open the full
  workflow doc only for rare branches):**
  <https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/session-constitution.md>
- **Full execution mechanics (10-step procedure, rules, verification — on demand):**
  <https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/ai-led-session-workflow.md>
- **Spec schema:**
  <https://github.com/darndestdabbler/dabbler-ai-orchestration/blob/master/docs/spec-md-schema.md>

Do not restate the tier model or the workflow in this file — link to the
canonical sources above so this engine file never drifts stale.
