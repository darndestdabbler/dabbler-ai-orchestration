// The transport preference, remembered durably.
//
// This is the one part of bootstrap that writes outside the project: an
// environment variable in the operator's own account (or, asked for and
// permitted, the machine's). That is deliberate and documented -- the
// preference is a property of who is running the router, not of the
// repository it is pointed at -- and `--no-transport-detect` turns the whole
// thing off for a caller that must not touch the host, which is what the
// parity control passes.

import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  TRANSPORT_COPILOT_CLI,
  TRANSPORT_ENV_VAR,
  VALID_TRANSPORTS,
} from "../config.ts";
import { getCliVersion } from "../transports/copilot.ts";
import { readText } from "../textfile.ts";

/** What a persistence attempt achieved. `null` means nothing was written. */
export const SCOPE_MACHINE = "machine";
export const SCOPE_USER = "user";

/**
 * The live Copilot CLI version string, or null when no seat resolves.
 * Detection is a fact about the machine, so nobody should be asked.
 */
export function detectCopilotSeat(binary = "copilot"): string | null {
  try {
    return getCliVersion({ binary });
  } catch {
    return null;
  }
}

/** True when this process can write machine-scope settings. */
export function isElevated(): boolean {
  if (process.platform === "win32") {
    // The LocalSystem hive is readable only by an elevated process, which is
    // the same question `IsUserAnAdmin` answers and needs no native call.
    const probe = spawnSync("reg", ["query", "HKU\\S-1-5-19"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
    });
    return probe.error === undefined && probe.status === 0;
  }
  return typeof process.getuid === "function" && process.getuid() === 0;
}

/**
 * Write an environment variable to the user hive (HKCU) or, when `machine` is
 * set, the machine hive (HKLM).
 *
 * `setx` is the write AND the broadcast: it sets the same REG_SZ value under
 * the same two keys the Python router opens with `winreg`, and it sends the
 * `WM_SETTINGCHANGE` that tells running shells the environment moved. Doing
 * it in one call is why there is no separate broadcast here; without one the
 * value would be live only for processes started after the next sign-out.
 */
function persistEnvVarWindows(
  name: string,
  value: string,
  machine: boolean,
): boolean {
  const args = machine ? [name, value, "/M"] : [name, value];
  const outcome = spawnSync("setx", args, {
    encoding: "utf8",
    windowsHide: true,
    timeout: 30_000,
  });
  return outcome.error === undefined && outcome.status === 0;
}

const POSIX_MARKER = "# dabbler-ai-router: transport preference";
const POSIX_SYSTEM_PROFILE = "/etc/profile.d/dabbler-ai-router.sh";

function posixUserProfile(): string {
  return join(homedir(), ".profile");
}

/**
 * Write the system-wide profile drop-in (requires root) or a marked block in
 * the user's own `~/.profile`.
 */
function persistEnvVarPosix(
  name: string,
  value: string,
  machine: boolean,
): boolean {
  const line = `${POSIX_MARKER}\nexport ${name}="${value}"\n`;
  if (machine) {
    try {
      mkdirSync("/etc/profile.d", { recursive: true });
      writeFileSync(POSIX_SYSTEM_PROFILE, line, "utf8");
      chmodSync(POSIX_SYSTEM_PROFILE, 0o644);
    } catch {
      return false;
    }
    return true;
  }
  const profile = posixUserProfile();
  try {
    const existing = existsSync(profile) ? readText(profile) : "";
    const kept = existing
      .split("\n")
      .slice(0, existing.endsWith("\n") ? -1 : undefined)
      .filter(
        (ln) => !ln.includes(POSIX_MARKER) && !ln.startsWith(`export ${name}=`),
      );
    const body =
      kept.join("\n").replace(/\n+$/, "") + (kept.length > 0 ? "\n\n" : "") + line;
    writeFileSync(profile, body, "utf8");
  } catch {
    return false;
  }
  return true;
}

/**
 * Which scope a persistence attempt reaches, given what was asked for, what
 * the process is allowed to do, and what the write actually returns.
 *
 * User scope is the default because the preference is a property of the
 * operator's account, not of the hardware: a workstation whose admin account
 * is a *different user* gains nothing from a machine-scope write, and the
 * account that actually runs the router would still never see it. `machine`
 * asks for every account and needs elevation; when that is unavailable the
 * write falls back to user scope rather than failing, because a preference
 * that landed for the operator beats one that landed nowhere. The return
 * value names the scope reached, so a caller can report the downgrade -- the
 * fallback is announced, never silent.
 *
 * The decision is separated from the effect because the fallback ladder is
 * the part with rules in it: three ways to end at user scope and one to end
 * at neither, none of which should need a registry to demonstrate.
 */
export function persistedScope(
  machine: boolean,
  elevated: boolean,
  write: (machine: boolean) => boolean,
): string | null {
  if (machine && elevated && write(true)) return SCOPE_MACHINE;
  if (write(false)) return SCOPE_USER;
  return null;
}

/**
 * Remember the operator's transport in a durable environment variable and
 * return the scope that actually landed, or `null` if none did.
 *
 * The value is also applied to this process so the current run sees it
 * whatever happened durably.
 */
export function persistTransportPreference(
  value: string,
  options: { machine?: boolean } = {},
): string | null {
  process.env[TRANSPORT_ENV_VAR] = value;
  const writer =
    process.platform === "win32" ? persistEnvVarWindows : persistEnvVarPosix;
  return persistedScope(options.machine === true, isElevated(), (machine) =>
    writer(TRANSPORT_ENV_VAR, value, machine),
  );
}

/**
 * The command an operator can run themselves. It must never require an
 * account they are not signed into -- a hint that says "re-run elevated" is
 * useless when the admin account is a different user.
 */
export function manualPersistHint(value: string): string {
  if (process.platform === "win32") {
    return (
      "[Environment]::SetEnvironmentVariable(" +
      `'${TRANSPORT_ENV_VAR}','${value}','User')`
    );
  }
  return `echo 'export ${TRANSPORT_ENV_VAR}="${value}"' >> ~/.profile`;
}

/**
 * `[value, reason]` for what to persist, or `[null, reason]` to leave the
 * preference alone. Precedence: an explicit `--transport` wins; otherwise an
 * already-persisted preference is respected; failing both, a detected seat
 * decides. Detection never overrides a choice the operator already made.
 */
export function resolveBootstrapTransport(
  explicit?: string | null,
): [string | null, string] {
  if (explicit) return [explicit, `--transport ${explicit}`];
  const current = (process.env[TRANSPORT_ENV_VAR] ?? "").trim().toLowerCase();
  if ((VALID_TRANSPORTS as readonly string[]).includes(current)) {
    return [null, `${TRANSPORT_ENV_VAR} is already set to '${current}'`];
  }
  const version = detectCopilotSeat();
  if (version) {
    return [TRANSPORT_COPILOT_CLI, `detected a Copilot seat (${version})`];
  }
  return [null, "no Copilot seat detected; leaving the default (api)"];
}
