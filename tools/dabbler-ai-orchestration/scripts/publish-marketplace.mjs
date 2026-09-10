// The Marketplace publish, with the one decision the inline shell block
// could not make: whether what just failed was a refusal or the weather.
//
//   node scripts/publish-marketplace.mjs <version> <path to the .vsix>
//
// **The incident.** On 2026-09-10 `vsix-v2.1.2` uploaded, and three minutes
// later the gallery answered `Request timeout: /_apis/gallery`. The step
// exited 1, the workflow went red, the tag stood and the Marketplace went on
// serving 2.1.1 -- a release lost to the far end being slow, with nothing
// wrong with the artifact and nobody told. That was the second of two
// consecutive versions that never reached an operator.
//
// Three things follow from it, and they are the whole of this script.
//
//   1. ASK BEFORE PUBLISHING. The gallery answers, for free and with no
//      credential, which versions it holds. A version already there is a
//      job being re-run after an upload that actually landed: say so and
//      exit 0. Publishing over it would fail anyway, and failing on it
//      would make a successful release look broken.
//   2. RETRY THE WEATHER, NEVER THE REFUSAL. A timeout, a reset socket or a
//      5xx is the gallery being unavailable, and it is worth trying again.
//      A rejected credential, a version that already exists, a package the
//      gallery will not take: trying those again turns one clear failure
//      into six identical ones and delays the person who has to fix it.
//   3. ASK AGAIN AFTER A TRANSIENT FAILURE. The timeout that killed 2.1.2
//      arrived three minutes into an upload, which is long enough for the
//      upload to have succeeded. Re-reading the gallery before a retry is
//      how a publish that landed is recognised rather than repeated.
//
// The version-pinned artifact path stays exactly as the workflow had it: a
// `head -n1` once mis-published v0.12.1 from the v0.13.0 run, and the
// caller names the exact file for that reason.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** How many times a transient fault is worth waiting out. */
export const ATTEMPTS = 4;

/** How long to wait before attempt N (1-based), in milliseconds. */
export function backoffMs(attempt) {
  return Math.min(60_000, 15_000 * attempt);
}

/**
 * What a failed publish was: `transient` is worth another attempt, `refusal`
 * is not, and `unknown` is neither claimed nor retried.
 *
 * The strings are the gallery's and vsce's own. `Request timeout:
 * /_apis/gallery` is the one that cost 2.1.2; the rest are the faults that
 * wear the same clothes -- a socket the far end dropped, a gateway that was
 * not there. Everything else is a refusal only when it says so, because a
 * classifier that guesses `transient` for an unrecognised message would
 * retry a bad credential four times.
 */
export function classifyPublishFailure(output) {
  const text = String(output ?? "");
  const transient = [
    /request timeout/i,
    /\betimedout\b/i,
    /\beconnreset\b/i,
    /\beconnrefused\b/i,
    /\benotfound\b/i,
    /\beai_again\b/i,
    /socket hang up/i,
    /\b(?:502|503|504)\b/,
    /bad gateway/i,
    /service unavailable/i,
    /gateway time-?out/i,
  ];
  const refusal = [
    /already exists/i,
    /\b401\b|unauthorized/i,
    /\b403\b|forbidden/i,
    /personal access token/i,
    /access token .*(expired|invalid)/i,
    /invalid publisher/i,
    /\binvalid extension\b/i,
    /\bmanifest\b.*\binvalid\b/i,
  ];
  // A refusal wins a message that reads as both: "403 ... gateway" is a
  // refusal delivered through a proxy, and retrying it is the failure mode
  // this exists to prevent.
  if (refusal.some((r) => r.test(text))) return "refusal";
  if (transient.some((r) => r.test(text))) return "transient";
  return "unknown";
}

/** Whether a gallery answer already carries this version. */
export function galleryHasVersion(answer, version) {
  const versions = answer?.results?.[0]?.extensions?.[0]?.versions ?? [];
  return versions.some((v) => v?.version === version);
}

/** The public extensionquery: what the gallery holds, free and unauthenticated. */
export async function readGallery(extensionId, fetchImpl = fetch) {
  const response = await fetchImpl(
    "https://marketplace.visualstudio.com/_apis/public/gallery/extensionquery",
    {
      method: "POST",
      headers: {
        Accept: "application/json;api-version=7.2-preview.1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filters: [{ criteria: [{ filterType: 7, value: extensionId }] }],
        flags: 0x1,
      }),
    },
  );
  if (!response.ok) throw new Error(`the gallery answered ${response.status}`);
  return await response.json();
}

/**
 * One publish attempt. Separated so the test drives the decision without
 * spawning anything and without a credential.
 */
function publishOnce(vsixFile, pat) {
  const result = spawnSync(
    "npx",
    ["--yes", "@vscode/vsce", "publish", "--packagePath", vsixFile, "-p", pat],
    { encoding: "utf8", shell: process.platform === "win32" },
  );
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  return { ok: result.status === 0 && !result.error, output: `${output}${result.error?.message ?? ""}` };
}

/**
 * The publish, as the workflow runs it.
 *
 * `deps` exists so the suite can drive every branch of the decision with no
 * network, no credential and no child process.
 */
export async function publish({ version, vsixFile, extensionId, pat }, deps = {}) {
  const gallery = deps.readGallery ?? readGallery;
  const attempt = deps.publishOnce ?? publishOnce;
  const wait = deps.wait ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const log = deps.log ?? ((line) => process.stdout.write(`${line}\n`));

  const held = async (when) => {
    try {
      return galleryHasVersion(await gallery(extensionId), version);
    } catch (error) {
      // The gallery being unreadable is not a reason to refuse to publish;
      // it is the same weather, and the publish itself will say so.
      log(`could not read the gallery ${when}: ${error.message}`);
      return false;
    }
  };

  if (await held("before publishing")) {
    log(`${extensionId} ${version} is already in the Marketplace; nothing to publish.`);
    return 0;
  }

  for (let n = 1; n <= ATTEMPTS; n++) {
    log(`publishing ${vsixFile} to the Marketplace (attempt ${n} of ${ATTEMPTS})...`);
    const { ok, output } = attempt(vsixFile, pat);
    if (ok) {
      log(`published ${extensionId} ${version}.`);
      return 0;
    }
    const kind = classifyPublishFailure(output);
    if (kind !== "transient") {
      log(`::error::the Marketplace refused this publish (${kind}); it will not be retried.`);
      return 1;
    }
    // The upload may have landed before the far end stopped answering --
    // which is exactly what 2.1.2 could not tell anybody.
    if (await held("after a transient failure")) {
      log(`the upload landed despite the failure: ${extensionId} ${version} is in the Marketplace.`);
      return 0;
    }
    if (n === ATTEMPTS) break;
    const pause = backoffMs(n);
    log(`the gallery was unavailable; waiting ${Math.round(pause / 1000)}s before attempt ${n + 1}.`);
    await wait(pause);
  }
  log(`::error::the Marketplace was unavailable through ${ATTEMPTS} attempts; nothing was published.`);
  return 1;
}

const invokedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  const [, , version, vsixFile] = process.argv;
  const extensionId = process.env.EXTENSION_ID ?? "DarndestDabbler.dabbler-ai-orchestration";
  const pat = process.env.VSCE_PAT ?? "";
  if (!version || !vsixFile) {
    process.stderr.write("usage: node scripts/publish-marketplace.mjs <version> <vsix path>\n");
    process.exit(2);
  }
  if (!existsSync(vsixFile)) {
    process.stderr.write(`::error::expected VSIX '${vsixFile}' not found in the downloaded artifact.\n`);
    process.exit(1);
  }
  if (pat === "") {
    process.stderr.write("::error::VSCE_PAT is not set; the publish cannot authenticate.\n");
    process.exit(1);
  }
  process.exit(await publish({ version, vsixFile, extensionId, pat }));
}
