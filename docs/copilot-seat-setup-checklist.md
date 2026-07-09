# Copilot-Seat Setup Checklist

> **Purpose:** The step-by-step runbook for configuring a machine that
> runs Dabbler AI-led sessions through the **GitHub Copilot CLI** (a
> Copilot-locked seat, no direct provider API keys). Follow it once per
> machine, top to bottom, before running any session.
>
> **Why this exists:** A seat that runs sessions with an *unauthenticated*
> Copilot CLI does not fail cleanly — the verification step silently
> errors, and the AI orchestrator, handed a required step it cannot
> perform, fabricates a plausible-looking result (a made-up verdict, a
> hand-written `disposition.json`, a false `verification_method: "api"`).
> This checklist prevents that at setup time; the Set-086 auth-preflight
> enforces the same guarantee at session-start time. Do not skip it.
>
> **Audience:** the person setting up a staff laptop or a shared seat.
> **Platform note:** commands are shown for Windows PowerShell; the paths
> translate directly to macOS/Linux (`~/.copilot/...`).

---

## Prerequisites — confirm before you start

- [ ] A **GHE.com cloud-tenant account** (`SUBDOMAIN.ghe.com`) that holds
      a **Copilot license on that tenant** — not a github.com license.
      (Copilot licensing is per-host; a github.com license does not
      authenticate a `.ghe.com` seat.)
- [ ] Your tenant subdomain written down: `______.ghe.com`.
- [ ] VS Code installed, with the **Dabbler AI Orchestration** extension.
- [ ] Node.js available (for installing the CLI), and Python 3 with a
      working `venv` (for the router).

---

## Step 1 — Install the GitHub Copilot CLI

Install the **standalone** `copilot` CLI (the agentic CLI that went GA in
Feb 2026 — *not* the retired `gh copilot` suggest/explain extension):

```powershell
npm install -g @github/copilot
```

Confirm it resolves:

```powershell
copilot --version
```

- [ ] `copilot --version` prints a version, no error.

> Note: on recent `gh` (≥ 2.86.0), `gh copilot` simply forwards to this
> same `copilot` binary. We invoke the bare `copilot` directly, so this
> is the binary that must be installed and authenticated.

---

## Step 2 — Log in to your GHE.com tenant

This is the step that was missing in the field. Run the **interactive
login once per machine** — it completes the OAuth device flow and
**persists the credential + host** to `~/.copilot/`, so every later
headless `copilot -p …` call (including the ones the router spawns)
authenticates automatically:

```powershell
copilot login --host SUBDOMAIN.ghe.com
```

Complete the device-flow prompt in the browser using the tenant account
that holds your Copilot license.

- [ ] Login completes without error.

> Do **not** try to automate/scrape an OAuth token for a staff laptop —
> the one-time interactive login is the sanctioned, persistent path. The
> `COPILOT_GITHUB_TOKEN` environment-variable method exists for
> **ephemeral CI runners only** (see *CI / headless* at the bottom); its
> host-targeting for `.ghe.com` is not cleanly documented, so prefer the
> interactive login on any machine that persists state.

---

## Step 3 — Verify the CLI actually works (the probe)

Prove the seat can run a real, authenticated, non-interactive completion
before you trust it with a session:

```powershell
copilot -p "Write PI to 10 decimal places" --model claude-sonnet-4.6 --output-format json
```

- [ ] The command returns **JSON** (an `assistant.message` event with
      content), **not** an auth prompt or an error.
- [ ] A new session directory appeared under
      `%USERPROFILE%\.copilot\session-state\` — proof a real call landed
      (this is the CLI's own audit log; `events.jsonl` inside it records
      the prompt, model, and timestamps).

If this probe fails, **stop** and fix it here — everything downstream
depends on it. See *Troubleshooting*.

---

## Step 4 — Install and confirm the router

In the consumer repo's environment:

```powershell
.venv\Scripts\pip install dabbler-ai-router      # or: pip install -e . from a checkout
.venv\Scripts\python -m ai_router --help
```

- [ ] `python -m ai_router …` runs (a `No module named ai_router` error
      means a bare `python`, not a missing key — use the venv interpreter).

---

## Step 5 — Run the auth-preflight *(available after Set 086 ships)*

Once the Set-086 preflight lands, run it to confirm the whole chain in
one command before a session:

```powershell
.venv\Scripts\python -m ai_router.copilot_preflight
```

- [ ] Preflight reports **OK** (CLI present, credential present, a live
      auth probe succeeds). A failure prints the exact remediation and
      **blocks the session from starting** — that is the intended
      behavior, not a bug.

> Until Set 086 ships, Step 3's manual probe is the authoritative check.

---

## Step 6 — Dry-run a session and confirm *real* artifacts

Run one real session end-to-end, then confirm the router — not the
engine's imagination — produced the artifacts:

- [ ] `session-state.json` was written by `start_session`/`close_session`
      (canonical v4 shape), and `verificationVerdict` is a real verdict
      (`VERIFIED` / `ISSUES_FOUND`), **never** a free-form string.
- [ ] A **`session-events.jsonl`** ledger exists next to it (its absence
      is the tell that the router was bypassed).
- [ ] A `router-metrics` row exists for the verification call with
      `transport: "copilot-cli"`.
- [ ] `disposition.json` and `activity-log.json` match the router's
      schemas (not hand-authored look-alikes — e.g. `activity-log.json`
      has `entries[]`, not `actions[]`).

If any of these are missing or hand-shaped, the seat ran outside the
router — go back to Step 3/5.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| "asks for an auth token" / `No authentication information found` | Copilot CLI not logged in on this machine | Run Step 2: `copilot login --host SUBDOMAIN.ghe.com` |
| Login succeeds but `-p` still fails auth | Logged into the wrong host (github.com instead of the tenant), or no Copilot license on the tenant | Re-run login with the correct `.ghe.com` subdomain; confirm the license is on the tenant |
| Confusing token errors even after login | A stray `GH_TOKEN` / `GITHUB_TOKEN` in the environment is shadowing the persisted login | Unset it, or (CI only) use `COPILOT_GITHUB_TOKEN`, which takes priority |
| `--model` value rejected | Model name not available on the seat's plan | Run `copilot` interactively and check `/models` for the exact available ids |
| Verdict shows a weird string like `manual-override-development` | The seat ran sessions before this checklist — the engine confabulated | Re-run setup; the Set-086 fixes prevent a non-verdict from ever persisting again |

---

## CI / headless (future — not for staff laptops)

For an ephemeral runner with no persistent `~/.copilot`, authenticate via
an environment variable instead of interactive login:

- Set **`COPILOT_GITHUB_TOKEN`** (highest priority; avoids conflicts with
  `GH_TOKEN`/`GITHUB_TOKEN`) to a **fine-grained PAT** owned by a
  **personal account**, with the **Copilot Requests** permission (classic
  PATs are not supported).
- **Verify host-targeting empirically** for `.ghe.com` — the docs do not
  clearly document how the env-var token routes to a tenant host, so
  confirm with the Step-3 probe on the runner before relying on it. A
  persisted `copilot login --host` may still be required first.

---

*Canonical home for this checklist. Onboarding surfaces (the extension's
Getting Started flow, the consumer-bootstrap docs, the Set-079 Copilot-seat
onboarding copy) should link here rather than restate the steps.*
