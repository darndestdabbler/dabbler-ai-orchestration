import { afterEach, describe, expect, it } from "vitest";

import { registerBackend, resolveSecret } from "../src/secretResolver.ts";

const NAME = "DABBLER_TEST_SECRET";

afterEach(() => {
  delete process.env[NAME];
});

describe("resolving a secret", () => {
  it("reads the env backend", () => {
    process.env[NAME] = "value";
    expect(resolveSecret(NAME)).toBe("value");
  });

  it("normalizes an empty value to nothing, so truthiness is enough", () => {
    process.env[NAME] = "";
    expect(resolveSecret(NAME)).toBeNull();
    delete process.env[NAME];
    expect(resolveSecret(NAME)).toBeNull();
  });

  it("refuses a backend nobody registered", () => {
    expect(() => resolveSecret(NAME, "keyring")).toThrow(/Unknown secret backend/);
  });

  it("reaches a registered backend without touching its callers", () => {
    registerBackend("test-backend", (name) => `from-${name}`);
    expect(resolveSecret(NAME, "test-backend")).toBe(`from-${NAME}`);
  });
});
