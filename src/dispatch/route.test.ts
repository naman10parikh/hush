import { describe, it, expect } from "vitest";
import { route } from "./route.js";

describe("route — task→JTBD/handler (PLAN §3 component 8)", () => {
  it("routes 'a key leaked in a commit' to JOB 3 / remediation-planner (the spec case)", () => {
    const r = route("a key leaked in a commit");
    expect(r.jtbd).toBe(3);
    expect(r.handler).toBe("remediation-planner");
    expect(r.kind).toBe("sub-agent");
  });

  it("remediation (JOB 3) beats detection (JOB 2) for a committed/leaked secret", () => {
    // 'leaked' must win over 'scan' precedence — this is a remediation situation.
    expect(route("we committed an API key to git, found it in history").jtbd).toBe(3);
    expect(route("git rm --cached the .env, is that the fix?").handler).toBe("remediation-planner");
  });

  it("routes scanning/CI setup to JOB 2 / scan", () => {
    expect(route("set up gitleaks pre-commit secret scanning")).toMatchObject({ jtbd: 2, handler: "scan" });
    expect(route("getting false positives on password = password in CI").jtbd).toBe(2);
  });

  it("routes .env.example generation to JOB 1 / env-example", () => {
    expect(route("generate a fresh .env.example for this repo")).toMatchObject({ jtbd: 1, handler: "env-example" });
    expect(route("fix the gitignore so .env is excluded").jtbd).toBe(1);
  });

  it("routes dynamic / short-lived DB creds to JOB 5", () => {
    expect(route("issue a short-lived database credential with rotate-root").jtbd).toBe(5);
    expect(route("dynamic secret via database/creds/<role>").jtbd).toBe(5);
  });

  it("routes no-downtime rotation to JOB 4 / rotate-plan", () => {
    expect(route("rotate a production DB credential with no downtime")).toMatchObject({ jtbd: 4, handler: "rotate-plan" });
  });

  it("routes SOPS/at-rest to JOB 6 (tool-selector)", () => {
    expect(route("encrypt secrets in git with SOPS for our Argo GitOps").jtbd).toBe(6);
  });

  it("routes secret-zero / machine identity to JOB 7", () => {
    expect(route("give CI its first secret via AppRole response-wrapping").jtbd).toBe(7);
    expect(route("use SPIFFE workload identity for the agent").jtbd).toBe(7);
  });

  it("routes broker / handles-not-values to JOB 8 / broker", () => {
    expect(route("broker a short-TTL handle for the agent")).toMatchObject({ jtbd: 8, handler: "broker" });
  });

  it("routes process injection to JOB 9 / inject", () => {
    expect(route("inject the secret into the child process via file-mount").jtbd).toBe(9);
  });

  it("routes K8s to JOB 10 (tool-selector)", () => {
    expect(route("sync secrets into kubernetes with ESO").jtbd).toBe(10);
  });

  it("routes agent-channel leak hygiene to JOB 11 / doctor", () => {
    expect(route("redact secrets from the .mcp.json and tool-call logs").jtbd).toBe(11);
  });

  it("falls back to JOB 12 / tool-selector for an under-specified secrets question", () => {
    const r = route("what should I use for secrets?");
    expect(r.jtbd).toBe(12);
    expect(r.handler).toBe("tool-selector");
    expect(r.kind).toBe("sub-agent");
  });
});
