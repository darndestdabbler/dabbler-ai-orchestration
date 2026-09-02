// Every worker yields to the operator.
//
// A vitest setup file runs in each worker before its first test file, so
// this is the one place that reaches every worker the pool forks. The
// priority class is inherited by everything the worker spawns -- the real
// `git` and `node` children ten of the suite's files fork -- so the whole
// run sits below whatever the operator is typing into. On Windows this is
// the BELOW_NORMAL priority class; on POSIX a nice of 10. Neither needs a
// privilege: lowering one's own priority is always allowed.
//
// A `git` process is the wrong place for this. It would have to be set at
// every spawn site, and the suite's spawn sites are the product's, which
// must not carry a test-time nicety.

import { constants, setPriority } from "node:os";

setPriority(process.pid, constants.priority.PRIORITY_BELOW_NORMAL);
