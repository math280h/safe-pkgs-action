import * as core from "@actions/core";
import type { LockfileResponse, Severity } from "./types.js";

const SEVERITY_ORDER: Severity[] = ["Low", "Medium", "High", "Critical"];

function severityRank(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s);
}

/**
 * Returns true if the report's risk meets or exceeds the fail threshold.
 */
export function meetsThreshold(reportRisk: Severity, failOn: string): boolean {
  const normalized =
    failOn.charAt(0).toUpperCase() + failOn.slice(1).toLowerCase();
  const thresholdIdx = SEVERITY_ORDER.indexOf(normalized as Severity);
  if (thresholdIdx === -1) return false; // "off" or unknown → never fail
  return severityRank(reportRisk) >= thresholdIdx;
}

/**
 * Set action outputs, create annotations for denied packages, and write the job summary.
 */
export async function processReport(
  report: LockfileResponse,
  failSeverity: string,
): Promise<void> {
  // Set outputs
  core.setOutput("allow", String(report.allow));
  core.setOutput("risk", report.risk);
  core.setOutput("total", String(report.total));
  core.setOutput("denied", String(report.denied));
  core.setOutput("json", JSON.stringify(report));

  // Annotations for denied packages
  for (const pkg of report.packages) {
    if (pkg.allow) continue;
    const title = `${pkg.name}${pkg.requested ? `@${pkg.requested}` : ""} — ${pkg.risk} risk`;
    const message = pkg.reasons.join("\n");
    if (severityRank(pkg.risk) >= severityRank("High")) {
      core.error(message, { title });
    } else {
      core.warning(message, { title });
    }
  }

  // Job summary
  core.summary.addRaw(renderSummary(report));
  await core.summary.write();

  // Fail the workflow if threshold met
  if (meetsThreshold(report.risk, failSeverity)) {
    core.setFailed(
      `Audit failed: overall risk "${report.risk}" meets the fail-on-severity threshold "${failSeverity}"`,
    );
  }
}

/**
 * Render a markdown summary for the GitHub Actions job summary.
 */
export function renderSummary(report: LockfileResponse): string {
  const status = report.allow ? "\u2705" : "\u274C";
  const lines: string[] = [];

  lines.push(`## ${status} safe-pkgs Audit Results\n`);
  lines.push(
    `| Metric | Value |`,
    `|--------|-------|`,
    `| Overall | ${report.allow ? "Pass" : "Fail"} |`,
    `| Risk | ${report.risk} |`,
    `| Total packages | ${report.total} |`,
    `| Denied packages | ${report.denied} |`,
    "",
  );

  const denied = report.packages.filter((p) => !p.allow);
  if (denied.length > 0) {
    lines.push(`### Denied Packages\n`);
    lines.push(`| Package | Version | Risk | Reasons |`);
    lines.push(`|---------|---------|------|---------|`);
    for (const pkg of denied) {
      const version = pkg.requested ?? "—";
      const reasons = pkg.reasons.join("; ");
      lines.push(`| ${pkg.name} | ${version} | ${pkg.risk} | ${reasons} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
