import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import nextEnv from "@next/env";
import { resolveDatabaseTarget } from "./db-target.mjs";

// A repeatable development rehearsal, not a staging acceptance certificate.
// Reuse the production permission services through the existing isolated suites.
nextEnv.loadEnvConfig(process.cwd(), true);
const suites = [
  ["unit", ["--test"]],
  ["T08 authentication", ["scripts/verify-auth.mjs"]],
  ["T09 tenant boundaries", ["scripts/verify-permissions.mjs"]],
  ["T10 administration", ["scripts/verify-administration.mjs"]],
];
function run(command, args, inherit = false) {
  return new Promise((done) => {
    const child = spawn(command, args, { shell: false, windowsHide: true, stdio: inherit ? "inherit" : ["ignore", "pipe", "ignore"] });
    let output = "";
    child.stdout?.on("data", (chunk) => { output += chunk; });
    child.on("error", () => done({ code: null, output: "" }));
    child.on("close", (code) => done({ code, output: output.trim() }));
  });
}
async function main() {
  const target = resolveDatabaseTarget(process.env);
  if (target.environment !== "development") throw new Error("This runner is development-only; follow docs/T11_QA.md for staging acceptance.");
  const revision = await run("git", ["rev-parse", "HEAD"]);
  const tree = await run("git", ["status", "--porcelain", "--untracked-files=normal"]);
  const report = {
    task: "T11", acceptance: "A04", mode: "development-rehearsal",
    environment: target.environment, database: target.dbName,
    revision: revision.code === 0 ? revision.output : "unknown",
    workingTreeDirty: tree.code === 0 ? !!tree.output : null,
    startedAt: new Date().toISOString(), finishedAt: null,
    stagingAcceptance: "NOT_RUN", result: "RUNNING", suites: [],
  };
  const output = resolve(".local", "t11-development-evidence.json");
  await mkdir(resolve(".local"), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  for (const [name, args] of suites) {
    const start = Date.now();
    console.log(`Running ${name}...`);
    const result = await run(process.execPath, args, true);
    report.suites.push({ name, result: result.code === 0 ? "PASS" : "FAIL", exitCode: result.code, durationMs: Date.now() - start });
    await writeFile(output, JSON.stringify(report, null, 2) + "\n");
    // Stop on failure: investigate cleanup before adding another suite's fixtures.
    if (result.code !== 0) break;
  }
  report.finishedAt = new Date().toISOString();
  report.result = report.suites.length === suites.length && report.suites.every((s) => s.result === "PASS") ? "PASS" : "FAIL";
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(`Development access rehearsal: ${report.result}. Evidence: ${output}. Staging A04: NOT_RUN.`);
  if (report.result !== "PASS") process.exitCode = 1;
}
main().catch((error) => {
  // Never print a connection string or captured authentication response.
  console.error(`Access rehearsal could not run (${error.name}). Check development configuration and docs/T11_QA.md.`);
  process.exitCode = 1;
});
