# Podman feasibility spike (pre-Set-069)

> **Purpose:** prove the model-authored-execution cage mechanics on a **real
> Podman** before the capability strategy in
> [`../proposal.md`](../proposal.md) is marketed (proposal sec 3.6). This is a
> **GO / NO-GO gate**: a green run unlocks rung (b); a red run (e.g. no
> virtualization on the fleet) changes the plan *before* design effort is sunk.
> **Not production** — graduates into `ai_router/` as `run_test_sandbox`'s sibling
> only on a green spike.

## What it proves (acceptance criteria)

1. A known-failing probe returns the **raw** exit + stdout/stderr **from inside
   the container** (deterministic-servant fidelity).
2. **`--network=none` holds** — a network probe fails.
3. The **repo mount is read-only** — a write into `/repo` fails *and* nothing
   leaks into the real tree.
4. The **`/scratch` tmpfs is writable** (the only writable place).
5. A hung probe is **killed by the wall-clock cap**.
6. **Crash-safe teardown** — no container survives, even after a timeout.

Plus it **measures per-probe wall-clock** (the container runtime cost — distinct
from token cost, which is a property of the future *model-facing* tool surface,
kept tiny by design: the model emits a probe, never `podman` flags).

## Windows 11 + WSL2 (the dev-fleet path)

```powershell
# 0. Prereqs: WSL2 + virtualization enabled. Confirm virtualization is ON:
#    Task Manager -> Performance -> CPU -> "Virtualization: Enabled".
#    If it says Disabled, that is the NO-GO risk -- enable in BIOS/policy first.

# 1. Install Podman (winget) -- no Docker Desktop license needed.
winget install -e --id RedHat.Podman

# 2. Start the WSL2-backed Podman VM (one-time; it persists). TIME THIS.
podman machine init
podman machine start
podman version          # expect a Client (and Server) version

# 3. Build the spike image (from this dir).
podman build -t pull-spike:local -f Containerfile .

# 4. Run the smoke test. Mount ANY local repo read-only (this one is fine).
python smoke_test.py --image pull-spike:local --repo-root C:\Users\denmi\source\repos\dabbler-ai-orchestration
```

Record `podman machine start` wall-time (the one-time amortized cost) and the
per-probe wall-clock the test prints.

## Linux CI parity

Same `smoke_test.py` on an `ubuntu-latest` runner (Podman is preinstalled):

```yaml
# scratch job to add to .github/workflows/ during the spike, then remove.
  podman-spike:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - run: podman version
      - working-directory: docs/proposals/2026-06-16-pull-architecture-capabilities/podman-spike
        run: |
          podman build -t pull-spike:local -f Containerfile .
          python smoke_test.py --image pull-spike:local --repo-root "$GITHUB_WORKSPACE"
```

## Results — fill this in (the GO/NO-GO record)

| Environment | podman version | machine start (s) | per-probe wall (s) | criteria passed | verdict |
|---|---|---|---|---|---|
| Win11+WSL2 (dev) | | | | /6 | GO / NO-GO |
| Linux CI | n/a (native) | | | /6 | GO / NO-GO |

- **Virtualization available on the fleet?** yes / no / partial — notes:
- **Blockers / surprises:**
- **Cost note** (machine-start amortized over N probes; per-probe overhead):
- **Overall verdict (gates rung (b)):** GO / NO-GO —
- `spike-result.json` from each run is the raw artifact; commit it alongside this.

## After a green spike

- The harness graduates to `ai_router/` (sibling of `run_test_sandbox.py`), pinned
  image by **digest**, exposed to the critic via a **tiny typed tool surface**
  (proposal sec 3.2–3.3): the model supplies a probe / template args, never flags.
- Wire it as the **autonomous, severity-gated** rung (b) lane; keep (a) markdown
  proposals and (c) human-approve-to-escape per the ladder.
- The disciplines the container does **not** fix stay in force (proposal sec 3.5):
  drive a **real public entrypoint** (meta-oracle), raw **replayed** transcript,
  digest-pinned no-secrets image.
