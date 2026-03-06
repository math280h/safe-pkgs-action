import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as tc from "@actions/tool-cache";
import {
  detectRegistry,
  discoverLockfiles,
  type LockfileTarget,
} from "./detect.js";
import { mergeReports, processReport } from "./report.js";
import type { LockfileResponse } from "./types.js";

function getPlatformAsset(): string {
  const platform = os.platform();
  switch (platform) {
    case "linux":
      return "safe-pkgs-linux";
    case "darwin":
      return "safe-pkgs-macos";
    case "win32":
      return "safe-pkgs-windows.exe";
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
}

async function downloadBinary(version: string): Promise<string> {
  const asset = getPlatformAsset();
  const isWindows = os.platform() === "win32";
  const binaryName = isWindows ? "safe-pkgs.exe" : "safe-pkgs";

  const cacheVersion = version === "latest" ? "0.0.0" : version;

  // Check tool cache first
  const cached = tc.find("safe-pkgs", cacheVersion);
  if (cached) {
    return path.join(cached, binaryName);
  }

  let url: string;
  if (version === "latest") {
    url = `https://github.com/math280h/safe-pkgs/releases/latest/download/${asset}`;
  } else {
    const tag = version.startsWith("v") ? version : `v${version}`;
    url = `https://github.com/math280h/safe-pkgs/releases/download/${tag}/${asset}`;
  }

  core.info(`Downloading safe-pkgs from ${url}`);
  const downloadPath = await tc.downloadTool(url);

  // Rename to consistent binary name
  const destDir = path.dirname(downloadPath);
  const destPath = path.join(destDir, binaryName);
  fs.renameSync(downloadPath, destPath);

  if (!isWindows) {
    fs.chmodSync(destPath, 0o755);
  }

  const cachedDir = await tc.cacheFile(
    destPath,
    binaryName,
    "safe-pkgs",
    cacheVersion,
  );

  return path.join(cachedDir, binaryName);
}

async function runAudit(
  binaryPath: string,
  target: string,
  registry: string,
): Promise<LockfileResponse> {
  let stdout = "";
  const exitCode = await exec.exec(
    binaryPath,
    ["audit", target, "--registry", registry],
    {
      listeners: {
        stdout: (data: Buffer) => {
          stdout += data.toString();
        },
      },
      ignoreReturnCode: true,
    },
  );

  if (exitCode !== 0 && !stdout.trim()) {
    throw new Error(
      `safe-pkgs exited with code ${exitCode} and no output for ${target}`,
    );
  }

  try {
    return JSON.parse(stdout) as LockfileResponse;
  } catch {
    core.error(`Raw output for ${target}:\n${stdout}`);
    throw new Error(`Failed to parse safe-pkgs JSON output for ${target}`);
  }
}

function resolveTargets(
  inputPath: string,
  registryInput: string,
): LockfileTarget[] {
  const stat = fs.statSync(inputPath, { throwIfNoEntry: false });
  if (!stat) {
    throw new Error(`Path "${inputPath}" does not exist`);
  }

  // Explicit registry — use path as-is
  if (registryInput) {
    return [{ path: inputPath, registry: registryInput }];
  }

  // File path — detect from filename
  if (stat.isFile()) {
    const registry = detectRegistry(inputPath);
    if (!registry) {
      throw new Error(
        `Could not detect registry for file "${inputPath}". ` +
          `Please set the "registry" input explicitly.`,
      );
    }
    return [{ path: inputPath, registry }];
  }

  // Directory — recursively discover lockfiles
  const targets = discoverLockfiles(inputPath);
  if (targets.length === 0) {
    throw new Error(
      `No lockfiles found under "${inputPath}". ` +
        `Please set the "path" and/or "registry" inputs explicitly.`,
    );
  }

  return targets;
}

async function run(): Promise<void> {
  const inputPath = core.getInput("path") || ".";
  const registryInput = core.getInput("registry");
  const version = core.getInput("version") || "latest";
  const failSeverity = core.getInput("fail-on-severity") || "high";

  const targets = resolveTargets(inputPath, registryInput);

  if (targets.length === 1) {
    core.info(`Auditing ${targets[0].path} (${targets[0].registry})`);
  } else {
    core.info(`Found ${targets.length} lockfiles to audit:`);
    for (const t of targets) {
      core.info(`  - ${t.path} (${t.registry})`);
    }
  }

  // Download binary
  const binaryPath = await downloadBinary(version);
  core.info(`Using safe-pkgs at ${binaryPath}`);

  // Audit each target
  const results: { source: string; report: LockfileResponse }[] = [];
  for (const target of targets) {
    core.info(`Auditing ${target.path}...`);
    const report = await runAudit(binaryPath, target.path, target.registry);
    results.push({ source: target.path, report });
  }

  // Merge and process results
  const merged =
    results.length === 1 ? results[0].report : mergeReports(results);
  await processReport(merged, failSeverity);
}

run().catch((err: Error) => {
  core.setFailed(err.message);
});
