import { describe, it, expect } from "vitest";
import {
  redact,
  containsSecret,
  stripUrlQuery,
  sanitize,
  shannonEntropy,
} from "./redact.js";

describe("redact", () => {
  it("masks an Anthropic key, leaving no raw value (O-09)", () => {
    const out = redact("ANTHROPIC_API_KEY=sk-ant-DUMMYDUMMYDUMMYDUMMY00");
    expect(out).not.toMatch(/sk-ant-[A-Za-z]/);
    expect(out).toContain("[REDACTED:anthropic-api-key]");
  });

  it("masks AWS, GitHub, and Stripe keys", () => {
    expect(redact("AKIAIOSFODNN7EXAMPLE")).toContain("[REDACTED:aws-access-key-id]");
    expect(redact("ghp_0123456789abcdef0123456789")).toContain("[REDACTED:github-pat]");
    // Obviously fake (DUMMY marker), still Stripe-shaped so the stripe-secret-key rule is exercised.
    expect(redact("sk_live_DUMMY0123456789DUMMY")).toContain("[REDACTED:stripe-secret-key]");
  });

  it("does not redact ordinary text", () => {
    expect(redact("password = \"password\"")).toBe("password = \"password\"");
  });
});

describe("containsSecret", () => {
  it("is true for a secret-shaped string", () => {
    expect(containsSecret("sk-ant-DUMMYDUMMYDUMMYDUMMY00")).toBe(true);
  });
  it("is false for a low-entropy literal (S-12 no-FP)", () => {
    expect(containsSecret('password = "password"')).toBe(false);
  });
});

describe("stripUrlQuery (P-17)", () => {
  it("drops the query string, keeping origin+pathname", () => {
    const out = stripUrlQuery("see https://example.com/cb?code=secret123&state=x now");
    expect(out).toContain("https://example.com/cb");
    expect(out).not.toContain("code=secret123");
  });
});

describe("sanitize", () => {
  it("strips URL queries AND redacts secrets in one pass", () => {
    const out = sanitize("token sk-ant-DUMMYDUMMYDUMMYDUMMY00 at https://x.io/p?t=abc");
    expect(out).not.toMatch(/sk-ant-[A-Za-z]/);
    expect(out).not.toContain("t=abc");
  });
});

describe("shannonEntropy", () => {
  it("is 0 for a single repeated char and higher for mixed", () => {
    expect(shannonEntropy("aaaa")).toBe(0);
    expect(shannonEntropy("ab")).toBeGreaterThan(0);
  });
});
