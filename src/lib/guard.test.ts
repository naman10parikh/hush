import { describe, it, expect } from "vitest";
import { safeSecretName, resolveWithinBase } from "./guard.js";

describe("safeSecretName (P-18 path-traversal guard)", () => {
  it("accepts alphanumeric/_/- names", () => {
    expect(safeSecretName("my_key-1")).toBe("my_key-1");
  });

  it("rejects path traversal", () => {
    expect(() => safeSecretName("../../etc/passwd")).toThrow(/path-traversal/);
  });

  it("rejects slashes and dots", () => {
    expect(() => safeSecretName("a/b")).toThrow();
    expect(() => safeSecretName("a.b")).toThrow();
  });
});

describe("resolveWithinBase", () => {
  it("keeps a valid name inside the base dir", () => {
    const p = resolveWithinBase("/tmp/store", "key1");
    expect(p.startsWith("/tmp/store")).toBe(true);
  });

  it("rejects an escaping name", () => {
    expect(() => resolveWithinBase("/tmp/store", "../escape")).toThrow();
  });
});
