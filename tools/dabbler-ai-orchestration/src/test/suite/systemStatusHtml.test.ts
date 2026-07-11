import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { createRequire } from "module";

const requireFromPackageRoot = createRequire(
  path.join(process.cwd(), "package.json"),
);
const statusHtml = requireFromPackageRoot(
  "./media/session-sets-tree/systemStatusHtml.js",
) as {
  renderSystemStatus(status: unknown, controls: unknown): string;
  PROVIDER_KEY_TEXT: string;
  PYTHON_TEXT: string;
  COPILOT_TEXT: string;
  WORKSPACE_TEXT: string;
};

const HEALTHY = {
  workspaceOpen: true,
  workspaceInitialized: true,
  providerKeyPresent: true,
  pythonPresent: true,
  copilotCliPresent: true,
  tier: "full",
  transportProfile: "api",
  manifestFaults: [],
};

suite("systemStatusHtml — Set 092 S2 persistent diagnostics", () => {
  test("healthy state renders no strip", () => {
    assert.strictEqual(
      statusHtml.renderSystemStatus(HEALTHY, { tier: "full", transportProfile: "api" }),
      "",
    );
  });

  test("renders workspace, Python, and direct-provider faults", () => {
    const html = statusHtml.renderSystemStatus(
      {
        ...HEALTHY,
        workspaceInitialized: false,
        pythonPresent: false,
        providerKeyPresent: false,
      },
      { tier: "full", transportProfile: "api" },
    );
    assert.ok(html.includes('data-testid="system-status"'));
    assert.ok(html.includes('data-status-code="workspace-initialization"'));
    assert.ok(html.includes('data-status-code="python"'));
    assert.ok(html.includes('data-status-code="provider-key"'));
    // The UAT walks quote these operator-facing strings verbatim — pin
    // the literal copy, not just the semantic codes (S2 R1 nit).
    assert.ok(html.includes(statusHtml.WORKSPACE_TEXT));
    assert.ok(html.includes(statusHtml.PYTHON_TEXT));
    assert.ok(html.includes(statusHtml.PROVIDER_KEY_TEXT));
  });

  test("provider access fault follows the live tier and profile controls", () => {
    const missingBoth = {
      ...HEALTHY,
      providerKeyPresent: false,
      copilotCliPresent: false,
    };
    const lightweight = statusHtml.renderSystemStatus(
      missingBoth,
      { tier: "lightweight", transportProfile: "api" },
    );
    assert.strictEqual(lightweight, "");

    const copilot = statusHtml.renderSystemStatus(
      missingBoth,
      { tier: "full", transportProfile: "copilot-cli" },
    );
    assert.ok(copilot.includes('data-status-code="copilot-cli"'));
    assert.ok(copilot.includes(statusHtml.COPILOT_TEXT));
    assert.ok(!copilot.includes('data-status-code="provider-key"'));
  });

  test("invalid manifest names retention state and escapes host text", () => {
    const html = statusHtml.renderSystemStatus(
      {
        ...HEALTHY,
        manifestFaults: [{
          rootLabel: "repo<script>",
          message: "docs/modules.yaml is invalid",
          retainedLastKnownGood: true,
        }],
      },
      { tier: "full", transportProfile: "api" },
    );
    assert.ok(html.includes('data-status-code="manifest-invalid"'));
    assert.ok(html.includes("last-known-good module tree"));
    assert.ok(html.includes("repo&lt;script&gt;"));
    assert.ok(!html.includes("repo<script>"));
  });

  test("no-folder state stays quiet", () => {
    const html = statusHtml.renderSystemStatus(
      { ...HEALTHY, workspaceOpen: false, pythonPresent: false },
      { tier: "full", transportProfile: "api" },
    );
    assert.strictEqual(html, "");
  });

  // Set 092 S2 verification R1 (Major): the client must compute the
  // strip only AFTER the durable tier/profile seed lands in gsState —
  // a pre-seed strip can show a provider-key fault the seeded tier
  // suppresses (or hide a Copilot fault it implies) on the first paint.
  // The pure renderer cannot see the wiring order, so this pins the
  // client source: inside render(), the seed restore precedes the first
  // renderSystemStatus call.
  test("the client renders the strip only after the durable seed is applied", () => {
    const client = fs.readFileSync(
      path.join(process.cwd(), "media", "session-sets-tree", "client.js"),
      "utf8",
    );
    const seedApply = client.indexOf("lastSeedProfile = gs.transportProfileSeed;");
    const firstStripRender = client.indexOf("systemStatusHtml.renderSystemStatus(");
    assert.ok(seedApply !== -1, "seed-application anchor not found in client.js");
    assert.ok(firstStripRender !== -1, "renderSystemStatus call not found in client.js");
    assert.ok(
      seedApply < firstStripRender,
      "renderSystemStatus is called before the durable seed is applied to gsState",
    );
  });
});