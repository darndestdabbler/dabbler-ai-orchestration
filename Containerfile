# The image the local test loop runs in. Only this repository: nothing in the
# shipped framework knows about it, and no default moves.
#
# The suite costs 360 seconds on the Windows host and 17.7 seconds here, and
# the mechanism is process creation rather than throughput -- a bare
# `node -e 0` spawn costs 158.8ms on the host and 18.9ms inside the WSL2
# machine. The walkthroughs boot a full CLI child per job, so that eight and a
# half times is most of the suite. `docs/design/suite-runners.md` carries the
# measurement and says which tests cannot run here.
#
# Built on demand by `scripts/suite.mjs`, which is the only thing that runs it.

FROM docker.io/library/node:22-slim

# Two additions, and neither is optional. Both were found by measurement: a
# test that failed here and would have been declared Windows-only on the
# strength of it, which would have written down "this proves Windows" about a
# test that proves no such thing.
#
# git, because the eight `walk-*` tests build real repositories and spawn git
# in them, and `node:22-slim` carries no git at all -- not an older one, none,
# so those tests cannot run rather than running differently. Everything else
# in the suite feeds git's answers through `journal.setGitSource`.
#
# procps, for `ps`. `jobs.js` reads the process table to find what a failed
# command left running, and its POSIX branch is `ps -A -o pid=,pgid=`. Without
# it `processTable()` returns null, `survivors()` finds nothing, and the
# runner reaps nothing while reporting nothing -- `walk-jobs.test.ts` then
# fails on an empty log. The reaping is real and works here; the image was
# what could not see it.
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates procps \
 && rm -rf /var/lib/apt/lists/*

# git refuses to commit without an identity and there is no operator in here
# to ask, so the image carries one. It is deliberately not a person: a commit
# made by the suite should read as the suite's.
RUN git config --system user.email "suite@dabbler.invalid" \
 && git config --system user.name "dabbler suite" \
 && git config --system init.defaultBranch master \
 # The repository arrives as a bind mount from Windows and its files are owned
 # by nobody this image knows, which git reads as dubious ownership and
 # refuses. The trust is scoped to a container that is destroyed when the run
 # ends and holds only this repository.
 && git config --system --add safe.directory '*'

# The tests write to the container's own /tmp, so nothing crosses back to the
# host through the bind mount.
ENV TMPDIR=/tmp
WORKDIR /repo
