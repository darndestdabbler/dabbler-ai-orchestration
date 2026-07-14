// Set 102 Session 1 — unit tests for the git-host detection module
// (src/utils/gitHost.ts): the remote-URL parsing table across all the
// Azure DevOps / GitHub URL forms the spec names, the settings-override
// resolution (the GHE-custom-domain case), and the web-URL builders
// that form the no-CLI degradation floor.

import * as assert from "assert";
import {
  adoOrganizationUrl,
  adoPrWebUrl,
  classifyRemoteUrl,
  createPrWebUrl,
  GitHostInfo,
  resolveGitHostFromUrl,
} from "../../utils/gitHost";

suite("gitHost — classifyRemoteUrl: Azure DevOps forms", () => {
  const cases: Array<[string, Partial<GitHostInfo>]> = [
    [
      "https://dev.azure.com/acme/Platform/_git/orders",
      { kind: "azure-devops", host: "dev.azure.com", owner: "acme", project: "Platform", repo: "orders" },
    ],
    [
      "https://acme@dev.azure.com/acme/Platform/_git/orders",
      { kind: "azure-devops", owner: "acme", project: "Platform", repo: "orders" },
    ],
    [
      "https://acme.visualstudio.com/Platform/_git/orders",
      { kind: "azure-devops", host: "acme.visualstudio.com", owner: "acme", project: "Platform", repo: "orders" },
    ],
    [
      "https://acme.visualstudio.com/DefaultCollection/Platform/_git/orders",
      { kind: "azure-devops", owner: "acme", project: "Platform", repo: "orders" },
    ],
    [
      "git@ssh.dev.azure.com:v3/acme/Platform/orders",
      { kind: "azure-devops", host: "ssh.dev.azure.com", owner: "acme", project: "Platform", repo: "orders" },
    ],
    [
      "ssh://git@ssh.dev.azure.com/v3/acme/Platform/orders",
      { kind: "azure-devops", owner: "acme", project: "Platform", repo: "orders" },
    ],
  ];
  for (const [url, expected] of cases) {
    test(url, () => {
      const got = classifyRemoteUrl(url);
      for (const [k, v] of Object.entries(expected)) {
        assert.strictEqual(
          (got as unknown as Record<string, unknown>)[k],
          v,
          `${k} of ${url}`,
        );
      }
    });
  }

  test("project names with spaces (URL-encoded) survive parsing", () => {
    const got = classifyRemoteUrl(
      "https://dev.azure.com/acme/My%20Project/_git/orders",
    );
    assert.strictEqual(got.kind, "azure-devops");
    assert.strictEqual(got.project, "My%20Project");
  });

  test("dev.azure.com URL without _git segment is unknown", () => {
    assert.strictEqual(
      classifyRemoteUrl("https://dev.azure.com/acme/onlyorg").kind,
      "unknown",
    );
  });
});

suite("gitHost — classifyRemoteUrl: GitHub forms", () => {
  const cases: Array<[string, Partial<GitHostInfo>]> = [
    [
      "https://github.com/acme/orders.git",
      { kind: "github", host: "github.com", owner: "acme", repo: "orders" },
    ],
    ["https://github.com/acme/orders", { kind: "github", owner: "acme", repo: "orders" }],
    ["git@github.com:acme/orders.git", { kind: "github", owner: "acme", repo: "orders" }],
    ["ssh://git@github.com/acme/orders.git", { kind: "github", owner: "acme", repo: "orders" }],
  ];
  for (const [url, expected] of cases) {
    test(url, () => {
      const got = classifyRemoteUrl(url);
      for (const [k, v] of Object.entries(expected)) {
        assert.strictEqual(
          (got as unknown as Record<string, unknown>)[k],
          v,
          `${k} of ${url}`,
        );
      }
    });
  }
});

suite("gitHost — classifyRemoteUrl: unknown / non-remote forms", () => {
  const cases = [
    "https://ghe.example.corp/acme/orders.git", // GHE custom domain: only the override can vouch
    "",
    "   ",
    "C:\\repos\\local-only",
    "./relative/path",
    "/abs/posix/path",
  ];
  for (const url of cases) {
    test(JSON.stringify(url), () => {
      assert.strictEqual(classifyRemoteUrl(url).kind, "unknown");
    });
  }
});

suite("gitHost — resolveGitHostFromUrl (settings override)", () => {
  test("auto: passthrough of the auto-classification", () => {
    const got = resolveGitHostFromUrl("https://github.com/a/b.git", "auto");
    assert.strictEqual(got.kind, "github");
  });

  test("forced github on a GHE custom domain: last two segments become owner/repo", () => {
    const got = resolveGitHostFromUrl(
      "https://ghe.example.corp/acme/orders.git",
      "github",
    );
    assert.strictEqual(got.kind, "github");
    assert.strictEqual(got.host, "ghe.example.corp");
    assert.strictEqual(got.owner, "acme");
    assert.strictEqual(got.repo, "orders");
  });

  test("forced github on a deep GHE path keeps the last two segments", () => {
    const got = resolveGitHostFromUrl(
      "ssh://git@ghe.example.corp/teams/acme/orders.git",
      "github",
    );
    assert.strictEqual(got.kind, "github");
    assert.strictEqual(got.owner, "acme");
    assert.strictEqual(got.repo, "orders");
  });

  test("forced azure-devops on a GitHub URL cannot invent a project: unknown", () => {
    const got = resolveGitHostFromUrl("https://github.com/a/b.git", "azure-devops");
    assert.strictEqual(got.kind, "unknown");
  });

  test("forced azure-devops on a real ADO URL keeps the ADO parse", () => {
    const got = resolveGitHostFromUrl(
      "https://dev.azure.com/acme/Platform/_git/orders",
      "azure-devops",
    );
    assert.strictEqual(got.kind, "azure-devops");
    assert.strictEqual(got.project, "Platform");
  });

  test("forced github on an unparseable string stays unknown", () => {
    const got = resolveGitHostFromUrl("not-a-remote", "github");
    assert.strictEqual(got.kind, "unknown");
  });
});

suite("gitHost — web URL builders (the no-CLI floor)", () => {
  const github: GitHostInfo = {
    kind: "github",
    host: "github.com",
    owner: "acme",
    repo: "orders",
  };
  const ado: GitHostInfo = {
    kind: "azure-devops",
    host: "dev.azure.com",
    owner: "acme",
    project: "Platform",
    repo: "orders",
  };

  test("GitHub compare URL", () => {
    assert.strictEqual(
      createPrWebUrl(github, "session-set/102-x", "main"),
      "https://github.com/acme/orders/compare/main...session-set%2F102-x?expand=1",
    );
  });

  test("ADO pullrequestcreate URL", () => {
    assert.strictEqual(
      createPrWebUrl(ado, "session-set/102-x", "main"),
      "https://dev.azure.com/acme/Platform/_git/orders/pullrequestcreate?sourceRef=session-set%2F102-x&targetRef=main",
    );
  });

  test("ADO ssh-remote host maps to the https org URL", () => {
    const sshAdo: GitHostInfo = { ...ado, host: "ssh.dev.azure.com" };
    assert.ok(
      createPrWebUrl(sshAdo, "b", "main")!.startsWith("https://dev.azure.com/acme/"),
    );
  });

  test("visualstudio.com host keeps its own base", () => {
    const vs: GitHostInfo = { ...ado, host: "acme.visualstudio.com" };
    assert.ok(
      createPrWebUrl(vs, "b", "main")!.startsWith("https://acme.visualstudio.com/Platform/"),
    );
  });

  test("unknown kind yields null", () => {
    assert.strictEqual(
      createPrWebUrl({ kind: "unknown", host: "", owner: "", repo: "" }, "b", "m"),
      null,
    );
  });

  test("adoOrganizationUrl + adoPrWebUrl", () => {
    assert.strictEqual(adoOrganizationUrl(ado), "https://dev.azure.com/acme");
    assert.strictEqual(adoOrganizationUrl(github), null);
    assert.strictEqual(
      adoPrWebUrl(ado, 42),
      "https://dev.azure.com/acme/Platform/_git/orders/pullrequest/42",
    );
  });
});
