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
 * Merge multiple audit reports into a single aggregate report.
 */
/**
 * Merge multiple audit reports into a single aggregate report.
 * Each report's packages are tagged with the source lockfile path.
 */
export function mergeReports(
  reports: { source: string; report: LockfileResponse }[],
): LockfileResponse {
  let allow = true;
  let risk: Severity = "Low";
  let total = 0;
  let denied = 0;
  const packages: LockfileResponse["packages"] = [];

  for (const { source, report } of reports) {
    if (!report.allow) allow = false;
    if (severityRank(report.risk) > severityRank(risk)) risk = report.risk;
    total += report.total;
    denied += report.denied;
    for (const pkg of report.packages) {
      packages.push({ ...pkg, source });
    }
  }

  return {
    allow,
    risk,
    total,
    denied,
    packages,
    fingerprints: reports[0].report.fingerprints,
  };
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
    const sourceTag = pkg.source ? ` (${pkg.source})` : "";
    const title = `${pkg.name}${pkg.requested ? `@${pkg.requested}` : ""} — ${pkg.risk} risk${sourceTag}`;
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
  const hasSources = denied.some((p) => p.source);
  if (denied.length > 0) {
    lines.push(`### Denied Packages\n`);
    if (hasSources) {
      lines.push(`| Package | Version | Risk | Source | Reasons |`);
      lines.push(`|---------|---------|------|--------|---------|`);
    } else {
      lines.push(`| Package | Version | Risk | Reasons |`);
      lines.push(`|---------|---------|------|---------|`);
    }
    for (const pkg of denied) {
      const version = pkg.requested ?? "—";
      const reasons = pkg.reasons.join("; ");
      if (hasSources) {
        const source = pkg.source ?? "—";
        lines.push(
          `| ${pkg.name} | ${version} | ${pkg.risk} | ${source} | ${reasons} |`,
        );
      } else {
        lines.push(`| ${pkg.name} | ${version} | ${pkg.risk} | ${reasons} |`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}
