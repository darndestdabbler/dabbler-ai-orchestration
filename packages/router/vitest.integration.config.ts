// The integration tier: every test file that builds a repository, spawns a
// process or drives a session. `vitest.config.ts` is the default and runs
// everything else; this config runs ONLY what that one leaves out, so the
// two are a partition of the suite and CI runs both.
import { defineConfig } from "vitest/config";

import { INTEGRATION_FILES, VITEST_DIR, poolFor } from "./vitest.config.ts";

export default defineConfig({
  test: {
    ...poolFor(),
    include: INTEGRATION_FILES.map((name) => `${VITEST_DIR}/${name}`),
  },
});
