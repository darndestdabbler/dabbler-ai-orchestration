// Set 102 Session 1: git-host detection — the ONE host-specific seam of
// the git-workflow automation commands (operator directive 2026-07-14:
// the team runs Azure DevOps today and may move to enterprise GitHub
// later, so every command must work on both).
//
// Everything else the Set 102 commands run is pure git and identical on
// any host; this module answers only two questions:
//   1. Which host is `origin`? (github / azure-devops / unknown)
//   2. What are the host coordinates a PR needs? (owner+repo, or
//      org+project+repo)
//
// Detection is automatic from the remote URL, with an explicit
// `dabblerSessionSets.gitHost` settings override for the case auto-detect
// cannot know — chiefly a GitHub Enterprise host on a custom domain,
// whose URL looks like nothing in particular. Pure logic throughout
// (URL string in, classification out) so the Layer-2 suite pins every
// URL form without touching git or the network.

import * as vscode from "vscode";

export type GitHostKind = "github" | "azure-devops" | "unknown";

/** The operator's `dabblerSessionSets.gitHost` pick. */
export type GitHostSetting = "auto" | "github" | "azure-devops";

export interface GitHostInfo {
  kind: GitHostKind;
  /**
   * Hostname to talk to (`github.com`, a GHE domain, `dev.azure.com`,
   * `{org}.visualstudio.com`). Empty only when kind is "unknown" and the
   * URL was unparseable.
   */
  host: string;
  /** GitHub: repo owner. Azure DevOps: organization. */
  owner: string;
  /** Azure DevOps only: the project between org and repo. */
  project?: string;
  /** Repository name, `.git` suffix stripped. */
  repo: string;
}

const GIT_SUFFIX = /\.git$/i;

function stripGitSuffix(s: string): string {
  return s.replace(GIT_SUFFIX, "");
}

/**
 * Decode one percent-encoded path segment to its LOGICAL value (S1
 * verification round 1, Major): ADO remotes carry project/repo names
 * with spaces as `My%20Project`, and the logical name is what
 * `az --project` needs — while the web-URL builders re-encode exactly
 * once. A malformed escape (`%ZZ`) is kept literally rather than
 * thrown: the raw string is then itself the best available name.
 */
function decodeSegment(s: string): string {
  if (!s.includes("%")) return s;
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Parse a URL-ish remote into (host, path segments). Handles the three
 * shapes git remotes actually take:
 *   - https://[user@]host/path
 *   - ssh://[user@]host[:port]/path
 *   - scp-like  user@host:path
 * Returns null when nothing host-shaped is present.
 */
function splitRemote(url: string): { host: string; segments: string[] } | null {
  const trimmed = url.trim();
  if (trimmed === "") return null;

  let host = "";
  let pathPart = "";

  const schemeMatch = /^(?:https?|ssh|git):\/\/(?:([^/@]+)@)?([^/:]+)(?::\d+)?\/(.*)$/i.exec(
    trimmed,
  );
  if (schemeMatch) {
    host = schemeMatch[2];
    pathPart = schemeMatch[3];
  } else {
    // scp-like: git@host:path (no scheme). A dotted host or an explicit
    // user@ marks it as a remote; anything else (a Windows drive path
    // like C:\x, a relative local path) is not a remote we can classify.
    const scpMatch = /^(?:([^/@]+)@)?([^/:@]+):(.*)$/.exec(trimmed);
    if (!scpMatch) return null;
    const [, user, scpHost, scpPath] = scpMatch;
    if (!user && !scpHost.includes(".")) return null;
    host = scpHost;
    pathPart = scpPath.replace(/^\/+/, "");
  }

  const segments = pathPart
    .split("/")
    .map((s) => decodeSegment(s.trim()))
    .filter((s) => s !== "");
  return { host: host.toLowerCase(), segments };
}

/** Case-insensitive locator for the structural `_git` segment. */
function gitSegmentIndex(segments: string[]): number {
  return segments.findIndex((s) => s.toLowerCase() === "_git");
}

/**
 * Classify an `origin` remote URL. Recognizes, case-insensitively:
 *
 * Azure DevOps (kind "azure-devops"):
 *   - https://dev.azure.com/{org}/{project}/_git/{repo}
 *   - https://{user}@dev.azure.com/{org}/{project}/_git/{repo}
 *   - https://{org}.visualstudio.com/{project}/_git/{repo}
 *   - https://{org}.visualstudio.com/DefaultCollection/{project}/_git/{repo}
 *   - git@ssh.dev.azure.com:v3/{org}/{project}/{repo}
 *   - ssh://git@ssh.dev.azure.com/v3/{org}/{project}/{repo}
 *
 * GitHub (kind "github"):
 *   - https://github.com/{owner}/{repo}[.git]
 *   - git@github.com:{owner}/{repo}[.git]
 *   - ssh://git@github.com/{owner}/{repo}[.git]
 *
 * Anything else is "unknown" — including a GHE custom domain, which only
 * the settings override can vouch for (see {@link resolveGitHost}).
 */
export function classifyRemoteUrl(url: string): GitHostInfo {
  const unknown: GitHostInfo = { kind: "unknown", host: "", owner: "", repo: "" };
  const split = splitRemote(url);
  if (!split) return unknown;
  const { host, segments } = split;

  // ---- Azure DevOps ----
  if (host === "dev.azure.com") {
    // {org}/{project}/_git/{repo}
    const gitIdx = gitSegmentIndex(segments);
    if (gitIdx >= 2 && segments.length > gitIdx + 1) {
      return {
        kind: "azure-devops",
        host,
        owner: segments[0],
        project: segments[gitIdx - 1],
        repo: stripGitSuffix(segments[gitIdx + 1]),
      };
    }
    return { ...unknown, host };
  }
  if (host === "ssh.dev.azure.com") {
    // v3/{org}/{project}/{repo}
    if (segments.length >= 4 && segments[0].toLowerCase() === "v3") {
      return {
        kind: "azure-devops",
        host,
        owner: segments[1],
        project: segments[2],
        repo: stripGitSuffix(segments[3]),
      };
    }
    return { ...unknown, host };
  }
  const vsMatch = /^([^.]+)\.visualstudio\.com$/.exec(host);
  if (vsMatch) {
    // {project}/_git/{repo}, optionally prefixed with DefaultCollection
    const gitIdx = gitSegmentIndex(segments);
    if (gitIdx >= 1 && segments.length > gitIdx + 1) {
      return {
        kind: "azure-devops",
        host,
        owner: vsMatch[1],
        project: segments[gitIdx - 1],
        repo: stripGitSuffix(segments[gitIdx + 1]),
      };
    }
    return { ...unknown, host };
  }

  // ---- GitHub ----
  if (host === "github.com") {
    if (segments.length >= 2) {
      return {
        kind: "github",
        host,
        owner: segments[0],
        repo: stripGitSuffix(segments[1]),
      };
    }
    return { ...unknown, host };
  }

  return { ...unknown, host };
}

/**
 * Apply the operator's `dabblerSessionSets.gitHost` override to an
 * auto-classification. `auto` returns the classification unchanged. A
 * forced kind re-reads the URL through that host's lens:
 *   - forced "github" on an unknown host (the GHE-custom-domain case)
 *     takes the last two path segments as owner/repo;
 *   - forced "azure-devops" re-runs the ADO parse and only sticks when
 *     the URL actually carries org/project/repo coordinates (there is no
 *     generic fallback that could invent a project).
 * A force that cannot extract coordinates stays "unknown" — the callers'
 * friendly guidance fires rather than a malformed command.
 */
export function resolveGitHostFromUrl(
  url: string,
  setting: GitHostSetting,
): GitHostInfo {
  const auto = classifyRemoteUrl(url);
  if (setting === "auto") return auto;

  if (setting === auto.kind) return auto;

  if (setting === "github") {
    const split = splitRemote(url);
    if (split && split.segments.length >= 2) {
      const segs = split.segments;
      return {
        kind: "github",
        host: split.host,
        owner: segs[segs.length - 2],
        repo: stripGitSuffix(segs[segs.length - 1]),
      };
    }
    return { kind: "unknown", host: auto.host, owner: "", repo: "" };
  }

  // setting === "azure-devops": trust only a real ADO parse.
  return auto.kind === "azure-devops"
    ? auto
    : { kind: "unknown", host: auto.host, owner: "", repo: "" };
}

/** Read the operator's `dabblerSessionSets.gitHost` (default "auto"). */
export function gitHostSetting(): GitHostSetting {
  const v = vscode.workspace
    .getConfiguration("dabblerSessionSets")
    .get<string>("gitHost");
  return v === "github" || v === "azure-devops" ? v : "auto";
}

/**
 * The no-CLI degradation floor: the host's create-a-PR web page for a
 * just-pushed branch. Works with zero host tooling installed — push is
 * pure git, and this URL is where the CLI-less operator finishes the job.
 */
export function createPrWebUrl(
  info: GitHostInfo,
  branch: string,
  targetBranch: string,
): string | null {
  const enc = encodeURIComponent;
  if (info.kind === "github") {
    return `https://${info.host}/${info.owner}/${info.repo}/compare/${enc(
      targetBranch,
    )}...${enc(branch)}?expand=1`;
  }
  if (info.kind === "azure-devops") {
    const base =
      info.host === "dev.azure.com" || info.host === "ssh.dev.azure.com"
        ? `https://dev.azure.com/${info.owner}/${enc(info.project ?? "")}`
        : `https://${info.host}/${enc(info.project ?? "")}`;
    // Full refs (S1 round-1 nit): ADO's create-PR page preselects
    // branches reliably from refs/heads/... values.
    return `${base}/_git/${enc(info.repo)}/pullrequestcreate?sourceRef=${enc(
      `refs/heads/${branch}`,
    )}&targetRef=${enc(`refs/heads/${targetBranch}`)}`;
  }
  return null;
}

/**
 * Azure DevOps organization URL for `az repos pr create --organization`.
 * SSH remotes still map to the https org URL (`az` never talks ssh).
 */
export function adoOrganizationUrl(info: GitHostInfo): string | null {
  if (info.kind !== "azure-devops") return null;
  if (info.host === "dev.azure.com" || info.host === "ssh.dev.azure.com") {
    return `https://dev.azure.com/${info.owner}`;
  }
  return `https://${info.host}`;
}

/** A created Azure DevOps PR's web URL from its numeric id. */
export function adoPrWebUrl(info: GitHostInfo, prId: number): string | null {
  const org = adoOrganizationUrl(info);
  if (!org || !info.project) return null;
  const enc = encodeURIComponent;
  return `${org}/${enc(info.project)}/_git/${enc(info.repo)}/pullrequest/${prId}`;
}
