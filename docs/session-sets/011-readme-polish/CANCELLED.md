# Cancelled — deferred in favor of Set 015 (consumer-repo alignment)

**Cancelled:** 2026-05-05
**Operator:** darndestdabbler
**Reason:** Higher-priority drift surfaced during v0.13.x extension
testing. Set 015 (`015-consumer-repo-alignment`) addresses real bugs
operators are hitting in the three consumer repos
(`dabbler-platform`, `dabbler-access-harvester`,
`dabbler-homehealthcare-accessdb`) — `ai-router/` (hyphen) →
`ai_router/` (underscore) directory drift, legacy
`darndestdabbler.dabbler-session-sets` extension lingering alongside
the current `darndestdabbler.dabbler-ai-orchestration`, and stale
references in each consumer's `CLAUDE.md` / `AGENTS.md` /
`GEMINI.md`. README polish (screenshots, sample-report excerpts,
posture-shift framing) is a real-but-lower-priority quality of life
improvement that can land later when the working surface is settled.

**Restoration:** Drop a `RESTORED.md` in this folder (any content)
to bring the set back to its prior bucket; spec.md is intact and
the prerequisite ("Set 012 must be closed") is satisfied. Or use
the extension's *Restore Session Set* right-click menu.

**Why this set's polish work isn't being absorbed into Set 015:**
Set 015 is *infrastructure alignment* across three external repos;
Set 011's deliverables (more screenshots, framing prose for the
canonical README) operate on this repo's user-facing surface and
have a different verification shape (prose review). Bundling them
would muddy both. Set 011 stays restorable as its own focused
polish pass once the consumer-side drift is behind us.
