import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scaffold, sopsAgeKeyFile } from "./scaffold.js";

// A stand-in for age-keygen: the same three-line output, with a fake key.
const FAKE_PUB = "age1hushtestpublickeyqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq";
const FAKE_SECRET = "AGE-SECRET-KEY-1HUSH-TEST-FAKE-NOT-A-REAL-KEY";

function restore(name: string, value: string | undefined): void {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("init --sops keeps the private key it generates (SEC-1)", () => {
  let dir: string;
  let repo: string;
  let keyFile: string;
  let oldPath: string | undefined;
  let oldKeyFile: string | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "hush-sops-"));
    const bin = join(dir, "bin");
    mkdirSync(bin);
    writeFileSync(
      join(bin, "age-keygen"),
      `#!/bin/sh\necho "# created: 2026-01-01T00:00:00Z"\necho "# public key: ${FAKE_PUB}"\necho "${FAKE_SECRET}"\n`,
    );
    chmodSync(join(bin, "age-keygen"), 0o755);
    repo = join(dir, "repo");
    mkdirSync(repo);
    keyFile = join(dir, "config", "sops", "age", "keys.txt");
    oldPath = process.env.PATH;
    oldKeyFile = process.env.SOPS_AGE_KEY_FILE;
    process.env.PATH = `${bin}:${oldPath ?? ""}`;
    process.env.SOPS_AGE_KEY_FILE = keyFile;
  });

  afterEach(() => {
    restore("PATH", oldPath);
    restore("SOPS_AGE_KEY_FILE", oldKeyFile);
    rmSync(dir, { recursive: true, force: true });
  });

  it("saves the private key to the sops keys file (mode 600) and says where", () => {
    const [step] = scaffold(repo, { sops: true });
    expect(step?.status).toBe("written");
    expect(readFileSync(join(repo, ".sops.yaml"), "utf8")).toContain(FAKE_PUB);
    expect(readFileSync(keyFile, "utf8")).toContain(FAKE_SECRET);
    expect(statSync(keyFile).mode & 0o777).toBe(0o600);
    expect(step?.note).toContain(keyFile);
    expect(step?.note).not.toContain("AGE-SECRET-KEY");
  });

  it("appends to an existing keys file and keeps the key already there", () => {
    mkdirSync(join(dir, "config", "sops", "age"), { recursive: true });
    writeFileSync(keyFile, "# an older key\nAGE-SECRET-KEY-1OLDER-FAKE-KEY", { mode: 0o644 });
    scaffold(repo, { sops: true });
    const body = readFileSync(keyFile, "utf8");
    expect(body).toContain("AGE-SECRET-KEY-1OLDER-FAKE-KEY\n");
    expect(body).toContain(FAKE_SECRET);
    expect(statSync(keyFile).mode & 0o777).toBe(0o600);
  });

  it("never appends to an encrypted keys file, and then keeps the placeholder", () => {
    mkdirSync(join(dir, "config", "sops", "age"), { recursive: true });
    const armored = "-----BEGIN AGE ENCRYPTED FILE-----\nfake\n-----END AGE ENCRYPTED FILE-----\n";
    writeFileSync(keyFile, armored);
    const [step] = scaffold(repo, { sops: true });
    expect(readFileSync(keyFile, "utf8")).toBe(armored);
    expect(readFileSync(join(repo, ".sops.yaml"), "utf8")).not.toContain(FAKE_PUB);
    expect(step?.note).toContain("not saved");
  });

  it("generates no key when .sops.yaml already exists", () => {
    writeFileSync(join(repo, ".sops.yaml"), "creation_rules: []\n");
    const [step] = scaffold(repo, { sops: true });
    expect(step?.status).toBe("skipped-exists");
    expect(() => statSync(keyFile)).toThrow();
  });
});

describe("sopsAgeKeyFile follows where sops looks", () => {
  it("prefers SOPS_AGE_KEY_FILE", () => {
    expect(sopsAgeKeyFile({ SOPS_AGE_KEY_FILE: "/k/keys.txt" }, "linux", "/h")).toBe("/k/keys.txt");
  });
  it("uses ~/.config on Linux and ~/Library/Application Support on macOS", () => {
    expect(sopsAgeKeyFile({}, "linux", "/h")).toBe("/h/.config/sops/age/keys.txt");
    expect(sopsAgeKeyFile({}, "darwin", "/h")).toBe(
      "/h/Library/Application Support/sops/age/keys.txt",
    );
  });
  it("honours XDG_CONFIG_HOME on both", () => {
    expect(sopsAgeKeyFile({ XDG_CONFIG_HOME: "/x" }, "linux", "/h")).toBe("/x/sops/age/keys.txt");
    expect(sopsAgeKeyFile({ XDG_CONFIG_HOME: "/x" }, "darwin", "/h")).toBe("/x/sops/age/keys.txt");
  });
});
