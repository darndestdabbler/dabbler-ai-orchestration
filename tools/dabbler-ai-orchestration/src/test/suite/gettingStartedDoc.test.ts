// Set 077 Session 3 (critique M6) — the tier-aware auto-opened Getting
// Started doc: the pure callout builder + H1 insertion, so a workspace
// with a recorded tier choice never greets the operator with a
// tier-ambiguous doc. The module imports vscode, so this suite runs
// under the repo's vscode stub like the other command suites. Cases
// generated via routed test-generation (gemini-pro) and adapted.

import * as assert from "assert";
import {
  renderTierAwareGettingStarted,
  tierCalloutMarkdown,
} from "../../commands/gettingStartedDoc";

suite("gettingStartedDoc — tierCalloutMarkdown (Set 077 S3, M6)", () => {
  test("lightweight callout names the tier, the marker, and Switch Tier", () => {
    const md = tierCalloutMarkdown("lightweight");
    assert.ok(md.includes("Lightweight tier"));
    assert.ok(md.includes(".dabbler/tier"));
    assert.ok(md.includes("Switch Tier"));
    // The half of the doc that does NOT apply is named explicitly.
    assert.ok(md.includes("Full-tier"));
  });

  test("full callout names the Full tier", () => {
    const md = tierCalloutMarkdown("full");
    assert.ok(md.includes("Full tier"));
    assert.ok(md.includes("Lightweight-tier"));
  });
});

suite("gettingStartedDoc — renderTierAwareGettingStarted (Set 077 S3, M6)", () => {
  const docWithH1 = "# Getting Started\n\nThis is the doc body.";
  const docWithoutH1 = "Some content\n\nWithout a top-level heading.";

  test("inserts the callout directly under the H1 with a blank line", () => {
    const rendered = renderTierAwareGettingStarted(docWithH1, "lightweight");
    const expected =
      "# Getting Started\n\n" +
      tierCalloutMarkdown("lightweight").trimEnd() +
      "\n\nThis is the doc body.";
    assert.strictEqual(rendered, expected);
  });

  test("prepends the callout when the doc has no H1", () => {
    const rendered = renderTierAwareGettingStarted(docWithoutH1, "full");
    assert.ok(rendered.startsWith(tierCalloutMarkdown("full")));
    assert.ok(rendered.endsWith(docWithoutH1));
  });

  test("the original body is preserved verbatim after insertion", () => {
    const rendered = renderTierAwareGettingStarted(docWithH1, "lightweight");
    assert.ok(rendered.endsWith("\n\nThis is the doc body."));
    assert.ok(rendered.startsWith("# Getting Started\n"));
  });

  test("the real template gets the callout under its title", () => {
    // The real doc's H1 is `# Getting Started`; the callout must land
    // between it and the blockquote that follows, leaving the rest
    // byte-identical.
    const realish =
      "# Getting Started\n\n> Step-by-step instructions...\n\n## 1. Scaffold Project Structure\n";
    const rendered = renderTierAwareGettingStarted(realish, "lightweight");
    const calloutIdx = rendered.indexOf("Your project is set up for");
    const quoteIdx = rendered.indexOf("> Step-by-step instructions");
    assert.ok(calloutIdx !== -1 && calloutIdx < quoteIdx);
    assert.ok(rendered.includes("## 1. Scaffold Project Structure"));
  });
});

suite("gettingStartedDoc — fence-aware H1 detection (S3 review, Minor 8)", () => {
  test("a # comment inside a code fence before the H1 is not the heading", () => {
    const doc = [
      "```bash",
      "# not a heading",
      "```",
      "# Real Title",
      "",
      "Body.",
    ].join("\n");
    const rendered = renderTierAwareGettingStarted(doc, "full");
    const lines = rendered.split("\n");
    assert.strictEqual(lines[3], "# Real Title");
    assert.strictEqual(lines[4], "");
    assert.ok(lines[5].includes("Your project is set up for"));
    assert.ok(rendered.includes("# not a heading"));
  });
});
