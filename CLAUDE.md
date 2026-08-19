<!-- dabbler:managed:start -->
@AGENTS.md

---

## Engine tail (Claude Code)

You are **Claude Code**. The managed body above arrived through the
`@AGENTS.md` import, which Claude Code expands at load time — `AGENTS.md`
is the one copy, so nothing here can drift from what the other engines
read.

<!-- dabbler:managed:end -->

---

## Working branch

Work happens on `experiment/verification-pipeline-v3`, not `master`. The
branch explores a cheaper approach to verification after an earlier rewrite
ran into trouble. Branch from it, commit to it, and push it; leave `master`
alone. If the approach proves out it merges back to `master` — until then,
treat this branch as the trunk for day-to-day work.
