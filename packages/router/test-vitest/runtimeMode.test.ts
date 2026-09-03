import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ENV_VAR_NAME,
  isNoRouterMode,
  resetForTests,
  resolveNoRouterMode,
} from "../src/runtimeMode.ts";

const saved = process.env[ENV_VAR_NAME];

beforeEach(() => {
  resetForTests();
  delete process.env[ENV_VAR_NAME];
});

afterEach(() => {
  resetForTests();
  if (saved === undefined) delete process.env[ENV_VAR_NAME];
  else process.env[ENV_VAR_NAME] = saved;
});

describe("resolving --no-router", () => {
  it("takes the flag, then the env var, then leaves the router enabled", () => {
    expect(resolveNoRouterMode(true)).toBe(true);
    resetForTests();
    process.env[ENV_VAR_NAME] = "on";
    expect(resolveNoRouterMode(false)).toBe(true);
    resetForTests();
    delete process.env[ENV_VAR_NAME];
    expect(resolveNoRouterMode(false)).toBe(false);
  });

  it("is idempotent, because an entry point may resolve twice", () => {
    // A silent cache overwrite is a footgun for a process with two entries.
    expect(resolveNoRouterMode(true)).toBe(true);
    expect(resolveNoRouterMode(false)).toBe(true);
  });

  it("falls back to the env var alone before anything has resolved", () => {
    process.env[ENV_VAR_NAME] = "yes";
    expect(isNoRouterMode()).toBe(true);
    // …and does not cache that answer, so a later resolve still decides.
    delete process.env[ENV_VAR_NAME];
    expect(isNoRouterMode()).toBe(false);
  });
});
