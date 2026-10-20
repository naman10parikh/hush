#!/usr/bin/env node
// sandbox/run-in-sandbox.mjs: runs hush's acceptance test (sandbox/run-acceptance.sh) inside an E2B
// Firecracker microVM through the e2b SDK (Sandbox.create), using the template built from sandbox/Dockerfile.
//
//   node sandbox/run-in-sandbox.mjs                    # no key: names the isolation CI uses instead; key: prints usage
//   node sandbox/run-in-sandbox.mjs --build-template   # build the hush-acceptance template (e2b CLI)
//   node sandbox/run-in-sandbox.mjs --boot             # boot a billed microVM, run the acceptance test, kill it
//
// A boot is billed per second, so it happens only with --boot. Without E2B_API_KEY this exits 0: the CI gate
// (.github/workflows/acceptance.yml) runs the same script on a fresh ubuntu runner, which is the isolation it needs.
// It never reports a boot it did not do.

import { spawnSync } from "node:child_process";
import { CommandExitError, Sandbox } from "e2b";

const TEMPLATE = "hush-acceptance";
const ACCEPTANCE = "bash sandbox/run-acceptance.sh";
const args = process.argv.slice(2);

async function boot() {
  const started = Date.now();
  const sandbox = await Sandbox.create(TEMPLATE, { timeoutMs: 5 * 60 * 1000 });
  console.log(`sandbox: ${sandbox.sandboxId} up in ${Date.now() - started} ms; running the acceptance test`);
  try {
    const result = await sandbox.commands.run(ACCEPTANCE, {
      cwd: "/hush",
      timeoutMs: 4 * 60 * 1000,
      onStdout: (line) => process.stdout.write(line),
      onStderr: (line) => process.stderr.write(line),
    });
    return result.exitCode;
  } catch (err) {
    if (err instanceof CommandExitError) return err.exitCode;
    throw err;
  } finally {
    await sandbox.kill();
    console.log("sandbox: killed");
  }
}

async function main() {
  if (!process.env.E2B_API_KEY) {
    console.log("sandbox: E2B_API_KEY is not set, so no microVM. CI runs the same acceptance test on a fresh");
    console.log("ubuntu runner (.github/workflows/acceptance.yml). Set E2B_API_KEY and pass --boot to use E2B.");
    return 0;
  }
  if (args.includes("--build-template")) {
    const built = spawnSync("e2b", ["template", "build", "--dockerfile", "sandbox/Dockerfile", "--name", TEMPLATE],
      { stdio: "inherit" });
    if (built.status !== 0) return built.status ?? 1;
  }
  if (args.includes("--boot")) {
    const code = await boot();
    console.log(`sandbox: acceptance exited ${code}`);
    return code;
  }
  console.log("sandbox: E2B is available. --build-template builds the image; --boot runs the acceptance test in a microVM.");
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("sandbox:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
