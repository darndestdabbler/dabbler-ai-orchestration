import * as cp from "child_process";
import * as path from "path";

export function listGitWorktrees(cwd: string): string[] {
  let out: string;
  try {
    out = cp.execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      timeout: 5000,
    });
  } catch {
    return [];
  }
  const paths: string[] = [];
  for (const line of out.split(/\r?\n/)) {
    if (line.startsWith("worktree ")) {
      const wt = line.slice("worktree ".length).trim();
      if (wt) paths.push(path.resolve(wt));
    }
  }
  return paths;
}

export function isGitRepo(dir: string): boolean {
  try {
    cp.execFileSync("git", ["rev-parse", "--git-dir"], {
      cwd: dir,
      encoding: "utf8",
      windowsHide: true,
      timeout: 3000,
    });
    return true;
  } catch {
    return false;
  }
}
