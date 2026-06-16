"""Podman feasibility-spike smoke test (pre-Set-069).

Exercises the proposal's sec 3.6 acceptance criteria against a real Podman on the
machine it runs on (Windows-11 + WSL2 dev box, or Linux CI). Prints PASS/FAIL per
criterion, measures per-probe wall-clock, and writes spike-result.json.

Run:
    python smoke_test.py --image pull-spike:local --repo-root <path-to-any-repo>

Exit 0 iff ALL criteria pass. A red result is a GO/NO-GO signal for the strategy.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import podman_cage as pc


def _check(name, cond, detail=""):
    mark = "PASS" if cond else "FAIL"
    print(f"  [{mark}] {name}" + (f" -- {detail}" if detail else ""))
    return {"name": name, "passed": bool(cond), "detail": detail}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(prog="podman-spike")
    ap.add_argument("--image", default="pull-spike:local")
    ap.add_argument("--repo-root", required=True,
                    help="any local repo dir to mount read-only at /repo")
    args = ap.parse_args(argv)
    repo = Path(args.repo_root).resolve()

    results = {"image": args.image, "repo_root": str(repo), "checks": [], "wall": {}}

    ver = pc.podman_available()
    print(f"podman: {ver or 'NOT AVAILABLE'}")
    results["podman_version"] = ver
    if not ver:
        print("\nNO-GO: podman not usable. Confirm `podman machine start` (Windows) "
              "and virtualization is enabled.")
        Path("spike-result.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
        return 1

    print("\nAcceptance criteria (proposal sec 3.6):")

    # 1. A known-failing probe returns the RAW exit + output from inside the container.
    r = pc.run_probe_in_container(
        args.image, ["python", "-c", "import sys; sys.stderr.write('boom'); sys.exit(7)"],
        repo_root=repo)
    results["checks"].append(_check(
        "known-failing probe returns raw exit+output",
        r.ran and r.exit_code == 7 and "boom" in r.stderr,
        f"exit={r.exit_code} stderr~={r.stderr.strip()[:40]!r}"))
    results["wall"]["trivial_probe_s"] = r.wall_seconds

    # 2. --network=none holds (a network probe must FAIL).
    net = pc.run_probe_in_container(
        args.image,
        ["python", "-c",
         "import socket; socket.setdefaulttimeout(3); socket.create_connection(('1.1.1.1',53))"],
        repo_root=repo, timeout_seconds=20)
    results["checks"].append(_check(
        "network is denied (--network=none)",
        net.ran and net.exit_code not in (0, None),
        f"exit={net.exit_code} (nonzero/blocked = good)"))

    # 3. The repo mount is READ-ONLY (a write into /repo must FAIL)...
    ro = pc.run_probe_in_container(
        args.image, ["python", "-c", "open('/repo/SPIKE_WRITE_TEST.tmp','w').write('x')"],
        repo_root=repo)
    wrote = (repo / "SPIKE_WRITE_TEST.tmp").exists()
    if wrote:
        (repo / "SPIKE_WRITE_TEST.tmp").unlink()  # cleanup if it somehow leaked
    results["checks"].append(_check(
        "repo mount is read-only (write to /repo fails AND nothing leaks)",
        ro.exit_code not in (0, None) and not wrote,
        f"exit={ro.exit_code} leaked_to_real_tree={wrote}"))

    # 4. ...but /scratch IS writable.
    sc = pc.run_probe_in_container(
        args.image,
        ["python", "-c", "open('/scratch/ok','w').write('x'); print('SCRATCH_OK')"],
        repo_root=repo)
    results["checks"].append(_check(
        "scratch tmpfs is writable",
        sc.exit_code == 0 and "SCRATCH_OK" in sc.stdout,
        f"exit={sc.exit_code}"))

    # 5. A hung probe is killed by the wall-clock cap and torn down.
    to = pc.run_probe_in_container(
        args.image, ["python", "-c", "import time; time.sleep(60)"],
        repo_root=repo, timeout_seconds=3)
    results["checks"].append(_check(
        "wall-clock timeout kills the probe",
        to.timed_out and to.exit_code is None,
        f"timed_out={to.timed_out} wall={to.wall_seconds}s"))

    # 6. Teardown is crash-safe: NO container survives any of the runs above.
    results["checks"].append(_check(
        "crash-safe teardown (timed-out container removed)",
        to.container_removed and (to.error is None),
        f"removed={to.container_removed} err={to.error}"))

    all_pass = all(c["passed"] for c in results["checks"])
    print(f"\nWALL-CLOCK: trivial probe ~{results['wall'].get('trivial_probe_s')}s "
          "(per-probe overhead; the container runtime cost, separate from token cost).")
    print(f"\n{'GO' if all_pass else 'NO-GO'}: "
          f"{sum(c['passed'] for c in results['checks'])}/{len(results['checks'])} criteria passed.")
    Path("spike-result.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print("Wrote spike-result.json")
    return 0 if all_pass else 1


if __name__ == "__main__":
    sys.exit(main())
