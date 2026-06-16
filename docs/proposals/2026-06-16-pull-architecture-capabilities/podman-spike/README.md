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

## Results — GO (run by the orchestrator, 2026-06-16)

| Environment | podman version | machine start (s) | per-probe wall (s) | criteria passed | verdict |
|---|---|---|---|---|---|
| Win11+WSL2 (Ubuntu, rootless) | 4.9.3 | n/a (apt-in-existing-Ubuntu; no `podman machine`) | ~1.5 | **6/6** | **GO** |
| Linux CI | n/a (native) | — | — | not run this pass | pending |

- **Install path:** `apt install podman uidmap fuse-overlayfs slirp4netns` inside the
  already-running Ubuntu WSL2 distro — **no `podman machine`, no Fedora switch.**
  Rootless, `overlay` storage driver, `newuidmap` present. The three classic
  WSL-rootless gotchas were **already handled** on this box (subuid/subgid present,
  `XDG_RUNTIME_DIR` set, systemd PID 1).
- **Virtualization available on the fleet?** yes (host `HypervisorPresent=True`;
  WSL2 + systemd live). *Caveat: confirmed on one dev box — verify across the fleet
  before broad rollout (the one remaining environmental unknown).*
- **All containment properties HELD:** `--network=none` blocks egress; the
  `/mnt/c` repo bind-mount is **read-only** (write failed, nothing leaked to the
  real tree); `/scratch` tmpfs writable; wall-clock timeout kills a hung probe;
  crash-safe teardown removes the timed-out container (`--rm` + name-keyed
  `podman rm -f`).
- **Finding 1 (record, not a blocker): rootless cgroups-v1 ignores resource caps.**
  Podman warned *"Resource limits are not supported and ignored on cgroups V1
  rootless systems"* — so `--memory` / `--pids-limit` / `--cpus` were **not
  enforced** here. The effective bound on a runaway probe is the **wall-clock
  timeout** (which works) + `--network=none` + read-only FS; the resource caps are
  DoS-hardening, not a security boundary. *Production fix (S4): enable cgroup v2 +
  delegation to restore mem/pid/cpu caps; until then, lean on the wall-clock + a
  conservative timeout.*
- **Finding 2 (cost note): timeout teardown is slow in rootless WSL.** A trivial
  probe is ~1.5 s, but force-removing a *timed-out* live container added ~10 s
  (total ~13.5 s for the timeout case). Per-probe steady-state cost is the ~1.5 s;
  budget extra for the (rare) timeout path. *S4: consider a shorter default
  timeout + async teardown.*
- **Finding 3 (S4 refinement): separate probe output from podman runtime warnings.**
  Raw capture (correct) mixed podman's own warning into the probe's stderr. For
  clean evidence, have the probe write results to `/scratch` or capture stdout/stderr
  via a structured channel so a finding's transcript is the probe's output, not the
  runtime's diagnostics.
- **Overall verdict (gates rung (b)): GO.** The model-authored-execution lane is
  feasible on the Win11+WSL2 fleet with rootless Podman; the strategy holds. Open
  items folded into Set 069 S4 (cgroup-v2 caps, timeout/teardown tuning, output
  separation) and a fleet-wide virtualization check.
- Raw artifact: `spike-result.json` (committed alongside this).

## After a green spike

- The harness graduates to `ai_router/` (sibling of `run_test_sandbox.py`), pinned
  image by **digest**, exposed to the critic via a **tiny typed tool surface**
  (proposal sec 3.2–3.3): the model supplies a probe / template args, never flags.
- Wire it as the **autonomous, severity-gated** rung (b) lane; keep (a) markdown
  proposals and (c) human-approve-to-escape per the ladder.
- The disciplines the container does **not** fix stay in force (proposal sec 3.5):
  drive a **real public entrypoint** (meta-oracle), raw **replayed** transcript,
  digest-pinned no-secrets image.
