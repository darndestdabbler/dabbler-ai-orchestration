# Coordinated Release: extension 0.45.0 + router 0.33.0

> **Purpose:** Get the working extension + router into the operator's staff's
> hands before the operator leaves on vacation. Publish the queued extension
> (`0.45.0` — the `Set Up Copilot Seat` command, the module-lifecycle
> redesign, and the git-workflow automation commands the Copilot+ADO tutorial
> depends on) and the router (`0.33.0`), correct the stale "registry-live"
> changelog text, and ship the Copilot+ADO tutorial as the honest preview it
> already is. The tutorial's live ADO/Copilot validation walk stays **deferred**
> (it needs the operator + an ADO org) — this set does NOT claim to validate it.
> **Created:** 2026-07-14
> **Session Set:** `docs/session-sets/104-coordinated-release/`
> **Prerequisite:** `103-copilot-ado-hello-world-tutorial` Session 1 complete
> **Workflow:** Orchestrator → operator-authorized release → verification

---

## Session Set Configuration

```yaml
tier: full
requiresUAT: false        # No UI walk; the release is CLI/CI (tag-driven publish). Staff-facing validation of the tutorial is the deferred 103 S2 walk, not this set.
requiresE2E: false        # No new product surface; this ships already-verified accumulated work.
pathAwareCritique: none   # Release-hygiene + changelog-truth set; the shipped code was verified in its originating sets (097–102). Speed matters (operator leaving).
prerequisites:
  - slug: 103-copilot-ado-hello-world-tutorial
    condition: complete   # (Session 1; the set stays in-progress with S2 the deferred live walk)
```

> **Operator authorization on record (2026-07-14):** the operator, going on
> vacation with staff needing the new code, explicitly authorized publishing
> **both** artifacts — extension `vsix-v0.45.0` (Marketplace + Open VSX) and
> router `v0.33.0` (PyPI) — using an **RC-dry-run-then-real-tags** approach,
> to be completed autonomously on that authorization. Publishing to a registry
> and pushing release tags are otherwise human-only, operator-approval-required
> actions (session constitution); this is that approval, informed by the true
> published state below.

## True published state at set start (CI/registry ground truth, not the stale changelog text)

- **Extension (VS Code Marketplace):** live **0.42.0** (tag `vsix-v0.42.0`
  published 2026-07-13, CI success). Publishing **0.45.0** adds Set 097
  (`Dabbler: Set Up Copilot Seat` + the seat-status-revert fix), Sets 098–101
  (module-lifecycle simplification), and Set 102 (the git-workflow automation
  commands: Open PR / Finalize merged set / Cut release tag / hotfix / rollback).
- **Router (PyPI):** live **0.32.0** (tag `v0.32.0` published 2026-07-10, PyPI
  confirms). The Set-086 Copilot-seat **auth-preflight** (`copilot_preflight`)
  is **already live at 0.32.0**. Publishing **0.33.0** adds Set 096 (the
  consequence-graded severity rubric + the phased verification loop).
- The extension CHANGELOG's "registry-live extension remains `0.40.0`" notes and
  the router CHANGELOG's "0.30.0" notes are **stale** (written before
  0.42.0/0.32.0 were tagged+published) — corrected in this set.

---

## Sessions

### Session 1 of 1: Correct the changelog truth, publish both artifacts, close out

**Steps:**
1. Register; re-confirm preflight (already done at authoring: gh authed; HEAD
   `Test` run green; VSIX 0.45.0 packages; package.json 0.45.0 / pyproject
   0.33.0; both publish pipelines proven by the 0.42.0/0.32.0 successes).
2. **Changelog truth + finalization:** correct the stale "registry-live
   0.40.0/0.30.0" text to the true published state (ext 0.42.0 / router 0.32.0);
   finalize the `0.45.0` and `0.33.0` sections as the released versions
   (dated 2026-07-14, superseding the live 0.42.0/0.32.0). Update the
   repository-reference release-status section. No product-code changes.
3. Commit + push the release commit; confirm its `Test` CI run is green (the
   publish prerequisite — every publish job `needs:` a green Test on the tagged
   commit).
4. **RC dry-run:** push `v0.33.0-rc1` (router → TestPyPI + build) and
   `vsix-v0.45.0-rc1` (extension → inspectable VSIX, no publish); confirm both
   CI runs succeed and the versions match.
5. **Real release tags (operator-authorized):** push `v0.33.0` and
   `vsix-v0.45.0`; confirm `release.yml` + `publish-vscode.yml` succeed and the
   registries show 0.33.0 / 0.45.0 live.
6. Build + full suite (docs/changelog-only product delta — the suite proves no
   regression); verify (mandatory cross-provider, conventions block up front);
   `disposition.json`; commit + push; `close_session`; `change-log.md`; Step 9;
   notify the operator with the live version confirmation.

**Creates:** `change-log.md`, disposition, verification artifacts; the release
tags (`v0.33.0`, `vsix-v0.45.0`) and their published artifacts.
**Touches:** `tools/dabbler-ai-orchestration/CHANGELOG.md`,
`ai_router/CHANGELOG.md`, `docs/repository-reference.md`.
**Ends with:** extension 0.45.0 live on the Marketplace + Open VSX; router
0.33.0 live on PyPI; changelog text matches the true published state; suite
green; cross-provider VERIFIED (or Minor-only); pushed; `close_session`
succeeded; operator notified. The 103 Copilot+ADO tutorial remains an honest
preview with its live ADO/Copilot walk deferred.
**Progress keys:** changelog-truth, release-commit-green, rc-dry-run-clean,
ext-0.45.0-published, router-0.33.0-published, suite-green, set-closed
