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
  COPILOT_SEAT_UNCONFIRMED_TEXT: string;
};

const HEALTHY = {
  workspaceOpen: true,
  workspaceInitialized: true,
  providerKeyPresent: true,
  pythonPresent: true,
  copilotCliPresent: true,
  tier: "full",
  transportProfile: "api",
  copilotSeatChosenUnconfirmed: false,
  copilotSeatRerunHint: "",
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

  // Set 097 (spec D1): the persistent seat-status note. Gated on the
  // HOST-COMPUTED durable field, NOT on the live/possibly-reverted
  // `transportProfile` control — that independence is the whole point
  // (the note must survive the exact repaint the defect causes).
  suite("Copilot seat chosen-but-unconfirmed note (Set 097 D1)", () => {
    test("never chose: no note even if somehow flagged (defense in depth via HEALTHY)", () => {
      assert.strictEqual(
        statusHtml.renderSystemStatus(HEALTHY, { tier: "full", transportProfile: "api" }),
        "",
      );
    });

    test("chose but unconfirmed: renders the persistent note with the exact re-run instruction", () => {
      const html = statusHtml.renderSystemStatus(
        {
          ...HEALTHY,
          copilotSeatChosenUnconfirmed: true,
          copilotSeatRerunHint: 'run "Dabbler: Set Up Copilot Seat" from the Command Palette',
        },
        { tier: "full", transportProfile: "api" },
      );
      assert.ok(html.includes('data-status-code="copilot-seat-unconfirmed"'));
      assert.ok(html.includes(statusHtml.COPILOT_SEAT_UNCONFIRMED_TEXT));
      assert.ok(html.includes("Dabbler: Set Up Copilot Seat"));
    });

    test("the note survives even when the LIVE control state has reverted to api (the defect it fixes)", () => {
      // This is the crux: controls.transportProfile === "api" (the exact
      // silently-reverted form the S097 defect chain produces), yet the
      // durable host-computed flag still fires the note.
      const html = statusHtml.renderSystemStatus(
        { ...HEALTHY, copilotSeatChosenUnconfirmed: true, copilotSeatRerunHint: "cmd" },
        { tier: "full", transportProfile: "api" },
      );
      assert.ok(html.includes('data-status-code="copilot-seat-unconfirmed"'));
    });

    test("chose and confirmed: host reports false, no note (even with a stale marker on disk)", () => {
      const html = statusHtml.renderSystemStatus(
        { ...HEALTHY, copilotSeatChosenUnconfirmed: false, transportProfile: "copilot-cli" },
        { tier: "full", transportProfile: "copilot-cli" },
      );
      assert.ok(!html.includes('data-status-code="copilot-seat-unconfirmed"'));
    });

    test("Lightweight tier: never shown, whatever the durable flag says", () => {
      const html = statusHtml.renderSystemStatus(
        { ...HEALTHY, copilotSeatChosenUnconfirmed: true, copilotSeatRerunHint: "cmd" },
        { tier: "lightweight", transportProfile: "api" },
      );
      assert.strictEqual(html, "");
    });

    test("no-folder state stays quiet even with the durable flag set", () => {
      const html = statusHtml.renderSystemStatus(
        {
          ...HEALTHY,
          workspaceOpen: false,
          copilotSeatChosenUnconfirmed: true,
          copilotSeatRerunHint: "cmd",
        },
        { tier: "full", transportProfile: "api" },
      );
      assert.strictEqual(html, "");
    });
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