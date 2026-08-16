# Set 113 Session 5 — the container host would not start (resolved)

> **Status: RESOLVED 2026-08-16 by `wsl --update`.** The hypothesis below
> was recorded *before* the fix was attempted and is now confirmed: WSL went
> from **2.1.5.0 / kernel 5.15.146.1** to **2.7.11.0 / kernel 6.18.33.2**,
> and the machine started on the first attempt afterwards. Verified beyond
> the success message — `podman run` pulled an image and executed a
> container, reporting 20 CPUs and 32 GB in the VM. **The document is kept
> whole**, including the wrong hypothesis, because a diagnosis that was
> written down before the outcome was known is worth more than one
> reconstructed after it.
>
> **No distro change is needed, and the operator offered one.** Podman's
> machine is its *own* Fedora 44 image (`quay.io/podman/machine-os:6.0`) in
> a WSL distro named `podman-machine-default`. The operator's Ubuntu distro
> is a separate distro that Podman never touches, so switching it to Fedora
> would have cost real effort and changed nothing. What was two years stale
> was the WSL **platform** — shared by every distro — not the distro.

## What was asked for

The operator installed Podman Desktop and Podman and initialised a machine,
so that Session 5 could put VS Code and OBS inside a container and measure
what that isolation costs. Podman is present and current: **6.0.2**, at
`C:\Users\denmi\AppData\Local\Programs\Podman\podman.exe`.

## What happens

`podman machine start` ends in:

```
Error: machine did not transition into running state: ssh error: machine not in running state
```

and every subsequent `podman` command fails to reach the socket:

```
unable to connect to Podman socket: failed to connect: dial tcp 127.0.0.1:53047:
connectex: No connection could be made because the target machine actively refused it.
```

**Reproduced on a freshly created machine**, so it is not a corrupted VM.

## Where the failure actually is

Podman's WSL machine does **not** use WSL's own systemd support. It ships
`/root/bootstrap`, which launches systemd itself inside a private PID
namespace:

```bash
#!/bin/bash
ps -ef | grep -v grep | grep -q systemd && exit 0
nohup unshare --kill-child --fork --pid --mount --mount-proc --propagation shared /lib/systemd/systemd >/dev/null 2>&1 &
sleep 0.1
```

Run by hand, that systemd **starts and then exits within about
25 seconds**:

| probe | result |
| :--- | :--- |
| immediately after `unshare` (~8 s) | systemd present, PID 528 |
| 25 s later | no matching process |
| `/tmp/sd.log` (stdout+stderr redirected) | empty |
| listening sockets in the distro | none, so `sshd` never came up |

`sshd` is what Podman's connection reaches over
`ssh://user@127.0.0.1:53047`, so no systemd means no sshd means no machine.
The Docker-API pipe warning printed alongside the failure
(`CreateFile \\.\pipe\docker_engine: All pipe instances are busy`, from the
Docker Desktop install on the same machine) is a **red herring** — Podman
itself says clients can still connect, and the failure is present with that
proxy irrelevant.

## The most likely cause, stated as a hypothesis and not as a finding

The version gap is large and points one way:

| component | version | dated |
| :--- | :--- | :--- |
| Podman | 6.0.2 | current |
| Podman machine image | Fedora Linux **44** (container image) | current |
| WSL | **2.1.5.0** | early 2024 |
| WSL kernel | 5.15.146.1-2 | Jan 2024 |

A current Fedora systemd is being asked to come up on a two-year-old WSL
kernel. **`wsl --update` is the obvious first thing to try**, and it is a
machine-level change for the operator to make rather than a session to
take unasked.

## What was changed on the operator's machine, and undone

Recorded because it did not work and should not be repeated.

1. **Added `[boot] systemd=true` to the distro's `/etc/wsl.conf`.** This was
   a wrong hypothesis — Podman does not use WSL's systemd support, as its
   own bootstrap script shows. Worse, it made the distro **unbootable**
   (`Wsl/Service/E_UNEXPECTED`), which is a more expensive failure than the
   one it was trying to fix.
2. **Recovered by removing and re-initialising the machine** — `podman
   machine rm -f` then `podman machine init --now` — which is Podman's own
   supported path and cost nothing, because the machine had never run a
   container. The clean machine reproduces the original error exactly,
   which is what establishes that the edit was both unnecessary and
   unrelated.
3. **A pre-removal export was taken** to `C:\temp\podman-113-backup.tar`
   (803 MB) before anything destructive, and deleted afterwards once the
   re-initialised machine was confirmed to be in the same state.

The lesson is the ordinary one and it is worth writing down: the first
hypothesis was formed from a symptom (`systemctl` could not reach a bus)
without reading the one file that describes the intended mechanism.
`/root/bootstrap` was four lines long and answered the question.

## What this does not say

It says nothing about whether containerised capture is a good idea, what it
costs in fidelity, or whether the cheap mitigation dominates. Those are
Session 5's actual questions and they remain open. **The plugin-surface
measurement is unaffected and does not need a container** — it is the step
the spec deliberately ordered first, precisely so that an expensive step
being blocked does not block the session.
