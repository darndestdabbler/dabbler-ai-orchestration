// The publish script's types, for the one caller that is TypeScript.
//
// `publish-marketplace.mjs` is plain ESM because the workflow runs it with
// nothing built and nothing installed; its spec is TypeScript, like every
// other spec in this suite, so the surface it drives is declared here rather
// than the spec being excused from typechecking.

/** What a failed publish was, and therefore whether it is tried again. */
export type PublishFailure = "transient" | "refusal" | "unknown";

/** One attempt's outcome: whether it published, and what it said. */
export interface PublishAttempt {
  readonly ok: boolean;
  readonly output: string;
}

/** What the gallery's extensionquery answers, as much of it as is read. */
export interface GalleryAnswer {
  readonly results?: ReadonlyArray<{
    readonly extensions?: ReadonlyArray<{
      readonly versions?: ReadonlyArray<{ readonly version?: string }>;
    }>;
  }>;
}

export interface PublishRequest {
  readonly version: string;
  readonly vsixFile: string;
  readonly extensionId: string;
  readonly pat: string;
}

/** The seams the suite drives the decision through, with no network. */
export interface PublishDeps {
  readonly readGallery?: (extensionId: string) => Promise<GalleryAnswer>;
  readonly publishOnce?: (vsixFile: string, pat: string) => PublishAttempt;
  readonly wait?: (ms: number) => Promise<unknown>;
  readonly log?: (line: string) => void;
}

export const ATTEMPTS: number;
export function backoffMs(attempt: number): number;
export function classifyPublishFailure(output: unknown): PublishFailure;
export function galleryHasVersion(answer: GalleryAnswer, version: string): boolean;
export function readGallery(extensionId: string, fetchImpl?: typeof fetch): Promise<GalleryAnswer>;
export function publish(request: PublishRequest, deps?: PublishDeps): Promise<number>;
