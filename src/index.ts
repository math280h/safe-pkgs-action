import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as tc from "@actions/tool-cache";
import { detectRegistry } from "./detect.js";
import { processReport } from "./report.js";
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

async function run(): Promise<void> {
  const inputPath = core.getInput("path") || ".";
  const registryInput = core.getInput("registry");
  const version = core.getInput("version") || "latest";
  const failSeverity = core.getInput("fail-on-severity") || "high";

  // Resolve registry
  let registry = registryInput;
  if (!registry) {
    registry = detectRegistry(inputPath) ?? "";
    if (!registry) {
      throw new Error(
        `Could not auto-detect registry for path "${inputPath}". ` +
          `Please set the "registry" input explicitly.`,
      );
    }
    core.info(`Auto-detected registry: ${registry}`);
  }

  // Download binary
  const binaryPath = await downloadBinary(version);
  core.info(`Using safe-pkgs at ${binaryPath}`);

  // Run audit
  let stdout = "";
  const exitCode = await exec.exec(
    binaryPath,
    ["audit", inputPath, "--registry", registry],
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
    throw new Error(`safe-pkgs exited with code ${exitCode} and no output`);
  }

  // Parse output
  let report: LockfileResponse;
  try {
    report = JSON.parse(stdout) as LockfileResponse;
  } catch {
    core.error(`Raw output:\n${stdout}`);
    throw new Error("Failed to parse safe-pkgs JSON output");
  }

  // Process results
  await processReport(report, failSeverity);
}

run().catch((err: Error) => {
  core.setFailed(err.message);
});
